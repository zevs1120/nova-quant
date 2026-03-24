import { PARAM_VERSION, RANGE_WINDOWS_DAYS } from './params.js';
import { compoundReturns, groupBy, maxDrawdownFromCurve, mean, round, stdDev } from './math.js';

function getAnchorTime(trades, fallbackIso) {
  const latest = trades
    .map((trade) => new Date(trade.time_out).getTime())
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => b - a)[0];
  if (latest) return latest;
  const fallback = new Date(fallbackIso).getTime();
  return Number.isFinite(fallback) ? fallback : Date.now();
}

function inRange(trade, range, anchorTime) {
  const days = RANGE_WINDOWS_DAYS[range];
  if (!days) return true;
  const tradeTime = new Date(trade.time_out).getTime();
  if (!Number.isFinite(tradeTime)) return false;
  return tradeTime >= anchorTime - days * 24 * 3600 * 1000;
}

function tradeMetrics(trades) {
  if (!trades.length) {
    return {
      sample_size: 0,
      win_rate: 0,
      avg_rr: 0,
      max_dd: 0,
      total_return: 0,
      profit_factor: 0,
      sharpe: 0,
    };
  }

  const returns = trades.map((trade) => Number(trade.pnl_pct || 0) / 100);
  const wins = returns.filter((value) => value > 0);
  const losses = returns.filter((value) => value < 0);
  const avgWin = wins.length ? mean(wins) : 0;
  const avgLoss = losses.length ? Math.abs(mean(losses)) : 0;
  const avgRr = avgLoss ? avgWin / avgLoss : avgWin > 0 ? 2 : 0;
  const profitFactor = Math.abs(
    losses.length ? (mean(wins) * wins.length) / (mean(losses) * losses.length) : 0,
  );
  const equityCurve = [1];
  for (const value of returns) {
    equityCurve.push(equityCurve[equityCurve.length - 1] * (1 + value));
  }

  const sharpeBase = stdDev(returns);
  const sharpe = sharpeBase ? (mean(returns) / sharpeBase) * Math.sqrt(12) : 0;

  return {
    sample_size: returns.length,
    win_rate: round(wins.length / returns.length, 4),
    avg_rr: round(avgRr, 4),
    max_dd: round(maxDrawdownFromCurve(equityCurve), 4),
    total_return: round(compoundReturns(returns), 4),
    profit_factor: round(profitFactor, 4),
    sharpe: round(sharpe, 4),
  };
}

function calcReturnFromEquityCurve(curve = []) {
  if (!curve.length || !curve[0]) return 0;
  const first = curve[0];
  const last = curve[curve.length - 1];
  return first ? last / first - 1 : 0;
}

function buildAttribution(trades, key) {
  const grouped = groupBy(trades, (trade) => trade[key] || 'UNCLASSIFIED');
  return Object.entries(grouped)
    .map(([id, rows]) => ({
      id,
      ...tradeMetrics(rows),
    }))
    .sort((a, b) => b.sample_size - a.sample_size);
}

function buildDeviation(record, trades, signalMap) {
  const btReturn = calcReturnFromEquityCurve(record?.equity_curve?.backtest || []);
  const liveReturn = calcReturnFromEquityCurve(record?.equity_curve?.live || []);
  const gap = btReturn - liveReturn;
  const usedSignals = trades.map((trade) => signalMap[trade.signal_id]).filter(Boolean);
  const avgExpectedCostBps = mean(
    usedSignals.map((signal) => Number(signal?.cost_estimate?.total_bps || 0)),
  );
  const assumedSlippageBps = Number(record?.assumptions?.slippage_bps || 0);
  const tradeCount = trades.length;
  const costImpact = (avgExpectedCostBps / 10000) * tradeCount;
  const slippageImpact = (assumedSlippageBps / 10000) * tradeCount * 0.7;
  const fillImpact = gap - costImpact - slippageImpact;

  return {
    backtest_return: round(btReturn, 4),
    live_return: round(liveReturn, 4),
    total_gap: round(gap, 4),
    decomposition: {
      cost: round(costImpact, 4),
      slippage: round(slippageImpact, 4),
      fill_quality: round(fillImpact, 4),
    },
    avg_expected_cost_bps: round(avgExpectedCostBps, 3),
    sample_size: tradeCount,
  };
}

function enrichTrades(trades, signalMap) {
  return trades.map((trade) => {
    const signal = signalMap[trade.signal_id] || {};
    return {
      ...trade,
      strategy_id: signal.strategy_id || trade.strategy_id || 'UNCLASSIFIED',
      regime_id: signal.regime_id || trade.regime_id || 'RGM_NEUTRAL',
    };
  });
}

export function runPerformanceEngine({ performance, trades, signals }) {
  const signalMap = Object.fromEntries(signals.map((signal) => [signal.signal_id, signal]));
  const enrichedTrades = enrichTrades(trades, signalMap);
  const anchorTime = getAnchorTime(enrichedTrades, performance.last_updated);

  const records = (performance.records || []).map((record) => {
    const scopedTrades = enrichedTrades.filter(
      (trade) => trade.market === record.market && inRange(trade, record.range, anchorTime),
    );
    const overall = tradeMetrics(scopedTrades);
    const byStrategy = buildAttribution(scopedTrades, 'strategy_id');
    const byRegime = buildAttribution(scopedTrades, 'regime_id');
    const deviation = buildDeviation(record, scopedTrades, signalMap);

    return {
      ...record,
      attribution: {
        parameter_version: PARAM_VERSION,
        overall,
        by_strategy: byStrategy,
        by_regime: byRegime,
        backtest_live_deviation: deviation,
      },
    };
  });

  return {
    ...performance,
    records,
    trade_enrichment_version: PARAM_VERSION,
  };
}
