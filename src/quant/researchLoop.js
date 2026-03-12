import { buildNovaQuantSystem, getAlphaDefinitions, getDefaultStrategyConfig } from './system.js';
import {
  deterministicNoise,
  hashCode,
  maxDrawdownFromCurve,
  mean,
  round,
  stdDev
} from './math.js';
import { buildUnifiedRegistrySystem } from '../research/governance/registrySystem.js';
import { buildPaperOps } from '../research/governance/paperOps.js';
import { buildPromotionLoop } from '../research/governance/promotionLoop.js';
import { ENTITY_STAGE, normalizeStage, registryId } from '../research/governance/taxonomy.js';

const DEFAULT_LOOKBACK_DAYS = 80;

const DEFAULT_CHALLENGERS = [
  {
    id: 'challenger-trend-heavy',
    label: 'Trend Heavy Challenger',
    version: 'chg-1.0.0',
    family_weights: {
      Trend: 1.4,
      'Mean Reversion': 0.7,
      'Volume/Price': 1.05,
      'Market State': 0.9,
      'Risk Filter': 1.2
    },
    score_bias: 1.4,
    directional_threshold: 0.021,
    risk_penalty_multiplier: 1.02,
    allow_c_in_high_vol: false,
    max_holdings_multiplier: 0.95,
    gross_exposure_multiplier: 0.94,
    safety_sensitivity: 1.06
  },
  {
    id: 'challenger-mr-adaptive',
    label: 'Mean-Reversion Adaptive',
    version: 'chg-1.1.0',
    family_weights: {
      Trend: 0.88,
      'Mean Reversion': 1.28,
      'Volume/Price': 0.94,
      'Market State': 0.96,
      'Risk Filter': 1.16
    },
    score_bias: 0.4,
    directional_threshold: 0.03,
    risk_penalty_multiplier: 0.96,
    allow_c_in_high_vol: true,
    high_vol_weight_multiplier: 0.7,
    max_holdings_multiplier: 1.05,
    gross_exposure_multiplier: 1.02,
    safety_sensitivity: 1
  },
  {
    id: 'challenger-risk-lean',
    label: 'Risk-Lean Challenger',
    version: 'chg-1.2.0',
    family_weights: {
      Trend: 1.02,
      'Mean Reversion': 0.92,
      'Volume/Price': 0.96,
      'Market State': 0.85,
      'Risk Filter': 1.42
    },
    score_bias: -0.3,
    directional_threshold: 0.028,
    risk_penalty_multiplier: 1.2,
    allow_c_in_high_vol: false,
    high_vol_weight_multiplier: 0.52,
    max_holdings_multiplier: 0.8,
    max_single_weight_multiplier: 0.88,
    sector_cap_multiplier: 0.9,
    gross_exposure_multiplier: 0.82,
    safety_sensitivity: 1.12
  }
];

function dateOnly(iso) {
  return String(iso).slice(0, 10);
}

function businessDates(endDateIso, lookbackDays = DEFAULT_LOOKBACK_DAYS) {
  const dates = [];
  const cursor = new Date(endDateIso);
  cursor.setUTCHours(0, 0, 0, 0);
  while (dates.length < lookbackDays) {
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6) {
      dates.push(cursor.toISOString().slice(0, 10));
    }
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return dates.reverse();
}

function toAsOf(dateStr) {
  return `${dateStr}T20:00:00.000Z`;
}

function buildMarketSnapshot(date, state) {
  return {
    type: 'MarketSnapshot',
    date,
    regime: state.insights.regime.tag,
    breadth: state.insights.breadth.ratio,
    volatility_label: state.insights.volatility.label,
    style_preference: state.insights.style.preference,
    risk_on_off: state.insights.risk_on_off.state,
    safety_score: state.safety.safety_score,
    suggested_exposure: {
      gross: state.today.suggested_gross_exposure_pct,
      net: state.today.suggested_net_exposure_pct
    }
  };
}

function buildFeatureSnapshot(date, state) {
  const features = Object.values(state.layers.feature_layer.by_ticker || {});
  const trendStrength = mean(features.map((item) => item.trend.ret20));
  const reversionStress = mean(features.map((item) => Math.abs(item.meanReversion.zScore10)));
  const volumePressure = mean(features.map((item) => item.volume.volumeAdv));
  const hv = mean(features.map((item) => item.volatility.hv20));

  return {
    type: 'FeatureSnapshot',
    date,
    universe_size: features.length,
    trend_strength_mean: round(trendStrength, 5),
    reversion_stress_mean: round(reversionStress, 5),
    volume_adv_mean: round(volumePressure, 5),
    volatility_mean: round(hv, 5)
  };
}

function buildModelOutput(date, state) {
  const ranking = state.layers.model_layer.ranking;
  return {
    type: 'ModelOutput',
    date,
    regime_tag: state.layers.model_layer.regime_model.tag,
    top_ranked: ranking.slice(0, 6).map((item) => ({
      ticker: item.ticker,
      rank_order: item.rank_order,
      opportunity_score: item.opportunity_score,
      confidence: item.confidence,
      risk_score: item.risk_score,
      suggested_action: item.suggested_action
    })),
    score_distribution: {
      p90: ranking[Math.max(0, Math.floor(ranking.length * 0.1) - 1)]?.opportunity_score ?? 0,
      p50: ranking[Math.max(0, Math.floor(ranking.length * 0.5) - 1)]?.opportunity_score ?? 0,
      p10: ranking[Math.max(0, Math.floor(ranking.length * 0.9) - 1)]?.opportunity_score ?? 0
    }
  };
}

function buildPortfolioSnapshot(date, state) {
  const portfolio = state.layers.portfolio_layer;
  return {
    type: 'PortfolioSnapshot',
    date,
    gross_exposure_pct: portfolio.gross_exposure_pct,
    net_exposure_pct: portfolio.net_exposure_pct,
    selected: portfolio.candidates.map((item) => ({
      ticker: item.ticker,
      direction: item.direction,
      grade: item.grade,
      target_weight_pct: item.target_weight_pct,
      confidence: item.confidence,
      score: item.score,
      risk_score: item.risk_score,
      sector: item.sector,
      entry_logic: item.entry_logic,
      entry_plan: item.entry_plan,
      entry_zone: item.entry_plan?.entry_zone || { low: 0, high: 0 },
      holding_horizon_days: item.grade === 'A' ? 5 : item.grade === 'B' ? 3 : 2
    })),
    filtered: portfolio.filtered_out.map((item) => ({
      ticker: item.ticker,
      grade: item.grade,
      score: item.score,
      confidence: item.confidence,
      reason: item.reason
    })),
    concentration: portfolio.sector_exposure_pct
  };
}

function buildRiskSnapshot(date, state) {
  return {
    type: 'RiskSnapshot',
    date,
    safety_score: state.safety.safety_score,
    mode: state.safety.mode,
    primary_risks: state.safety.primary_risks,
    suggested_gross_exposure_pct: state.safety.suggested_gross_exposure_pct,
    suggested_net_exposure_pct: state.safety.suggested_net_exposure_pct,
    risk_cards: state.safety.cards
  };
}

function aggregateAlphaDailyStats(date, state, alphaRegistryIndex) {
  const byTicker = state.layers.alpha_layer.by_ticker;
  const tickers = Object.keys(byTicker);
  const features = state.layers.feature_layer.by_ticker;
  const regime = state.insights.regime.tag;

  return Object.keys(alphaRegistryIndex).map((alphaId) => {
    const alphaDef = alphaRegistryIndex[alphaId];
    const scores = [];
    const hitSignals = [];
    const pnlProxySeries = [];

    for (const ticker of tickers) {
      const alpha = (byTicker[ticker] || []).find((item) => item.id === alphaId);
      if (!alpha) continue;
      scores.push(alpha.score);

      const ret1 = features[ticker]?.trend?.ret1 ?? 0;
      if (Math.abs(alpha.score) >= 0.28) {
        hitSignals.push(Math.sign(alpha.score) === Math.sign(ret1) ? 1 : 0);
      }

      const pnlProxy = alpha.score * ret1 * 100;
      pnlProxySeries.push(pnlProxy);
    }

    const triggerCount = scores.filter((value) => Math.abs(value) >= 0.28).length;
    const avgAbs = mean(scores.map((value) => Math.abs(value)));
    const hitRateProxy = hitSignals.length ? mean(hitSignals) : 0;
    const pnlContribution = mean(pnlProxySeries);
    const clusterTag = triggerCount / Math.max(scores.length, 1) > 0.62 ? 'high-correlation-cluster' : 'normal';

    return {
      type: 'AlphaDailyStats',
      alpha_id: alphaId,
      date,
      score_summary: {
        mean: round(mean(scores), 5),
        abs_mean: round(avgAbs, 5),
        stdev: round(stdDev(scores), 5)
      },
      number_of_triggers: triggerCount,
      average_confidence_contribution: round(avgAbs * 100, 3),
      regime_match: alphaDef.regime_fit.includes('ALL') || alphaDef.regime_fit.includes(regime),
      pnl_contribution_proxy: round(pnlContribution, 4),
      hit_rate_proxy: round(hitRateProxy, 4),
      decay_flag: false,
      correlation_cluster_tag: clusterTag,
      status: alphaDef.status,
      version: alphaDef.version
    };
  });
}

function markAlphaDecay(alphaHistoryById) {
  const updated = {};

  for (const [alphaId, rows] of Object.entries(alphaHistoryById)) {
    const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
    const last10 = sorted.slice(-10);
    const prev10 = sorted.slice(-20, -10);

    const recentHit = mean(last10.map((row) => row.hit_rate_proxy));
    const prevHit = mean(prev10.map((row) => row.hit_rate_proxy));
    const recentPnl = mean(last10.map((row) => row.pnl_contribution_proxy));
    const prevPnl = mean(prev10.map((row) => row.pnl_contribution_proxy));

    updated[alphaId] = sorted.map((row, index) => {
      const decay =
        index >= sorted.length - 10 &&
        (recentHit < prevHit - 0.05 || recentPnl < prevPnl - 0.08 || recentHit < 0.45);
      return {
        ...row,
        decay_flag: Boolean(decay)
      };
    });
  }

  return updated;
}

function jaccard(setA, setB) {
  const a = new Set(setA);
  const b = new Set(setB);
  const inter = [...a].filter((item) => b.has(item)).length;
  const union = new Set([...a, ...b]).size || 1;
  return inter / union;
}

function runBacktestEngine(strategyId, snapshots) {
  const daily = [];
  let prevWeights = {};

  for (const snapshot of snapshots) {
    const selected = snapshot.portfolio.selected;
    const todayWeights = Object.fromEntries(selected.map((item) => [item.ticker, item.target_weight_pct]));

    const gross = selected.reduce((sum, item) => sum + item.target_weight_pct, 0);
    const net = selected.reduce(
      (sum, item) => sum + (item.direction === 'LONG' ? item.target_weight_pct : -item.target_weight_pct),
      0
    );

    const edge = selected.reduce((acc, item) => {
      const signal = (item.score - 50) / 10000;
      const riskPenalty = item.risk_score / 140000;
      const signed = item.direction === 'LONG' ? signal : -signal;
      return acc + (item.target_weight_pct / 100) * (signed - riskPenalty);
    }, 0);

    const turnover = Object.keys({ ...prevWeights, ...todayWeights }).reduce((sum, ticker) => {
      const prev = prevWeights[ticker] || 0;
      const now = todayWeights[ticker] || 0;
      return sum + Math.abs(now - prev);
    }, 0);

    const regimePenalty = snapshot.market.regime === 'High Volatility Risk' ? 0.0005 : snapshot.market.regime === 'Trend Down' ? 0.00025 : 0;
    const preCostReturn = edge - regimePenalty;
    const transactionCost = turnover * 0.00012 + selected.length * 0.00003;
    const postCostReturn = preCostReturn - transactionCost;

    daily.push({
      date: snapshot.date,
      regime: snapshot.market.regime,
      pre_cost_return: round(preCostReturn, 6),
      post_cost_return: round(postCostReturn, 6),
      turnover: round(turnover, 4),
      gross_exposure_pct: round(gross, 2),
      net_exposure_pct: round(net, 2)
    });

    prevWeights = todayWeights;
  }

  let equityPre = 100;
  let equityPost = 100;
  const curvePre = [];
  const curvePost = [];

  for (const row of daily) {
    equityPre *= 1 + row.pre_cost_return;
    equityPost *= 1 + row.post_cost_return;
    curvePre.push(round(equityPre, 5));
    curvePost.push(round(equityPost, 5));
  }

  const postReturns = daily.map((row) => row.post_cost_return);
  const preReturns = daily.map((row) => row.pre_cost_return);
  const sigma = stdDev(postReturns) || 1e-9;
  const downside = stdDev(postReturns.map((value) => (value < 0 ? value : 0))) || 1e-9;
  const regimeGroups = {};

  for (const row of daily) {
    if (!regimeGroups[row.regime]) regimeGroups[row.regime] = [];
    regimeGroups[row.regime].push(row.post_cost_return);
  }

  const monthlyMap = {};
  for (const row of daily) {
    const month = row.date.slice(0, 7);
    if (!monthlyMap[month]) monthlyMap[month] = [];
    monthlyMap[month].push(row.post_cost_return);
  }

  let eq = 100;
  const monthly = Object.entries(monthlyMap).map(([month, values]) => {
    const ret = values.reduce((acc, value) => acc * (1 + value), 1) - 1;
    eq *= 1 + ret;
    return {
      month,
      ret: round(ret, 5),
      equity: round(eq, 5)
    };
  });

  const regimeBreakdown = Object.entries(regimeGroups).map(([regime, values]) => ({
    regime,
    sample_days: values.length,
    avg_return: round(mean(values), 6),
    win_rate: round(values.filter((value) => value > 0).length / Math.max(values.length, 1), 4)
  }));

  return {
    type: 'BacktestResult',
    strategy_id: strategyId,
    source_type: 'simulated_backtest_engine',
    daily,
    monthly,
    cumulative_return_pre_cost: round(curvePre.at(-1) / curvePre[0] - 1, 5),
    cumulative_return_post_cost: round(curvePost.at(-1) / curvePost[0] - 1, 5),
    win_rate: round(postReturns.filter((value) => value > 0).length / Math.max(postReturns.length, 1), 4),
    avg_holding_period: round(mean(snapshots.map((item) => item.selected_avg_holding_days)), 3),
    max_drawdown: round(maxDrawdownFromCurve(curvePost), 5),
    sharpe: round((mean(postReturns) / sigma) * Math.sqrt(252), 4),
    sortino: round((mean(postReturns) / downside) * Math.sqrt(252), 4),
    turnover: round(mean(daily.map((item) => item.turnover)), 4),
    exposure_summary: {
      avg_gross: round(mean(daily.map((item) => item.gross_exposure_pct)), 3),
      avg_net: round(mean(daily.map((item) => item.net_exposure_pct)), 3),
      max_gross: round(Math.max(...daily.map((item) => item.gross_exposure_pct), 0), 3)
    },
    regime_breakdown: regimeBreakdown,
    cost_assumptions: {
      transaction_cost_model: 'turnover * 12 bps + per-position 3 bps',
      cost_before: round(mean(preReturns), 6),
      cost_after: round(mean(postReturns), 6)
    }
  };
}

function runSingleAlphaBacktests(alphaHistoryById) {
  return Object.entries(alphaHistoryById).map(([alphaId, rows]) => {
    const ordered = [...rows].sort((a, b) => a.date.localeCompare(b.date));
    const dailyReturns = ordered.map((row) => row.pnl_contribution_proxy / 1000);

    let equity = 100;
    const curve = dailyReturns.map((ret) => {
      equity *= 1 + ret;
      return round(equity, 5);
    });

    const sigma = stdDev(dailyReturns) || 1e-9;
    const downside = stdDev(dailyReturns.map((value) => (value < 0 ? value : 0))) || 1e-9;

    return {
      type: 'BacktestResult',
      strategy_id: `single-${alphaId}`,
      alpha_id: alphaId,
      source_type: 'single_alpha_backtest_proxy',
      cumulative_return_post_cost: round(curve.at(-1) / curve[0] - 1, 5),
      win_rate: round(dailyReturns.filter((value) => value > 0).length / Math.max(dailyReturns.length, 1), 4),
      max_drawdown: round(maxDrawdownFromCurve(curve), 5),
      sharpe: round((mean(dailyReturns) / sigma) * Math.sqrt(252), 4),
      sortino: round((mean(dailyReturns) / downside) * Math.sqrt(252), 4),
      turnover: round(mean(ordered.map((row) => row.number_of_triggers / 20)), 4)
    };
  });
}

function estimatePaperMove(ticker, date, score, riskScore, side) {
  const seed = hashCode(`${ticker}-${date}`);
  const drift = ((score - 50) / 10000) * (side === 'LONG' ? 1 : -1);
  const riskHeadwind = (riskScore - 50) / 90000;
  const noise = deterministicNoise(seed, 1) * 0.0042;
  return drift - riskHeadwind + noise;
}

function runPaperLedger(strategyId, snapshots, startingEquity = 100000) {
  const orders = [];
  const transactions = [];
  const positions = new Map();
  const equityCurve = [];

  let realizedPnl = 0;

  for (const snapshot of snapshots) {
    const date = snapshot.date;

    for (const [ticker, pos] of Array.from(positions.entries())) {
      const dailyMove = estimatePaperMove(ticker, date, pos.score_at_entry, pos.risk_score, pos.side);
      pos.mark_price = round(pos.mark_price * (1 + dailyMove), 4);
      pos.holding_days += 1;
      pos.unrealized_pnl = round(
        (pos.side === 'LONG'
          ? (pos.mark_price - pos.avg_price) * pos.qty
          : (pos.avg_price - pos.mark_price) * pos.qty),
        4
      );

      const shouldClose =
        pos.holding_days >= pos.max_holding_days ||
        snapshot.risk.mode === 'do not trade' ||
        Math.abs(dailyMove) > 0.022;

      if (shouldClose) {
        const fee = Math.abs(pos.avg_price * pos.qty) * 0.00035;
        const realized = round(pos.unrealized_pnl - fee, 4);
        realizedPnl += realized;

        transactions.push({
          type: 'close',
          date,
          ticker,
          side: pos.side,
          qty: pos.qty,
          exit_price: pos.mark_price,
          realized_pnl: realized,
          reason: snapshot.risk.mode === 'do not trade' ? 'risk-cut' : 'holding-window'
        });

        positions.delete(ticker);
      }
    }

    const tradable = snapshot.portfolio.selected.slice(0, 3);
    for (const candidate of tradable) {
      if (positions.has(candidate.ticker)) continue;

      const entryPrice = round((candidate.entry_zone.low + candidate.entry_zone.high) / 2, 4);
      const qty = Math.max(1, Math.round((startingEquity * (candidate.target_weight_pct / 100)) / Math.max(entryPrice, 0.01)));
      const status = snapshot.risk.mode === 'do not trade' ? 'REJECTED' : 'FILLED';

      orders.push({
        type: 'PaperOrder',
        order_id: `PO-${strategyId}-${date}-${candidate.ticker}`,
        strategy_id: strategyId,
        date,
        ticker: candidate.ticker,
        side: candidate.direction,
        target_weight_pct: candidate.target_weight_pct,
        status,
        fill_price: status === 'FILLED' ? entryPrice : null,
        assumed_slippage_bps: status === 'FILLED' ? 7 : 0,
        source_snapshot_date: date
      });

      if (status !== 'FILLED') continue;

      positions.set(candidate.ticker, {
        type: 'PaperPosition',
        strategy_id: strategyId,
        ticker: candidate.ticker,
        side: candidate.direction,
        qty,
        avg_price: entryPrice,
        mark_price: entryPrice,
        score_at_entry: candidate.score,
        risk_score: candidate.risk_score,
        opened_at: date,
        holding_days: 0,
        max_holding_days: Math.max(1, Math.round(candidate.holding_horizon_days || 3)),
        unrealized_pnl: 0
      });

      transactions.push({
        type: 'open',
        date,
        ticker: candidate.ticker,
        side: candidate.direction,
        qty,
        entry_price: entryPrice
      });
    }

    const unrealized = Array.from(positions.values()).reduce((sum, pos) => sum + pos.unrealized_pnl, 0);
    const equity = startingEquity + realizedPnl + unrealized;

    equityCurve.push({
      date,
      equity: round(equity, 4),
      realized_pnl: round(realizedPnl, 4),
      unrealized_pnl: round(unrealized, 4),
      open_positions: positions.size
    });
  }

  const closed = transactions.filter((item) => item.type === 'close');
  const wins = closed.filter((item) => item.realized_pnl > 0).length;

  return {
    strategy_id: strategyId,
    source_type: 'simulated_paper_trading',
    orders,
    transactions,
    current_positions: Array.from(positions.values()),
    equity_curve: equityCurve,
    summary: {
      total_orders: orders.length,
      filled_orders: orders.filter((item) => item.status === 'FILLED').length,
      open_positions: positions.size,
      realized_pnl: round(realizedPnl, 4),
      unrealized_pnl: round(Array.from(positions.values()).reduce((sum, pos) => sum + pos.unrealized_pnl, 0), 4),
      win_rate: round(wins / Math.max(closed.length, 1), 4),
      total_return: round((equityCurve.at(-1)?.equity || startingEquity) / startingEquity - 1, 5)
    },
    recent_orders: orders.slice(-12).reverse()
  };
}

function strategyDailySnapshot(date, state) {
  const activeAlpha = state.layers.alpha_layer.library.slice(0, 8).map((item) => item.id);
  const selected = state.layers.portfolio_layer.candidates;

  return {
    date,
    market: buildMarketSnapshot(date, state),
    feature: buildFeatureSnapshot(date, state),
    model: buildModelOutput(date, state),
    portfolio: buildPortfolioSnapshot(date, state),
    risk: buildRiskSnapshot(date, state),
    market_regime: state.insights.regime.tag,
    safety_score: state.safety.safety_score,
    suggested_exposure: {
      gross: state.safety.suggested_gross_exposure_pct,
      net: state.safety.suggested_net_exposure_pct
    },
    selected_opportunities: selected,
    filtered_opportunities: state.layers.portfolio_layer.filtered_out,
    active_alpha_summary: activeAlpha,
    selected_avg_holding_days: mean(
      selected.map((item) => (item.entry_plan ? 3 : 3))
    ),
    risk_drivers: state.safety.primary_risks
  };
}

function runStrategyHistory({ dates, riskProfileKey, strategyConfig, alphaRegistryIndex }) {
  const snapshots = [];
  const states = [];
  const alphaDailyRows = [];

  for (const date of dates) {
    const state = buildNovaQuantSystem({
      asOf: toAsOf(date),
      riskProfileKey,
      executionTrades: [],
      strategyConfig
    });

    snapshots.push(strategyDailySnapshot(date, state));
    states.push(state);
    alphaDailyRows.push(aggregateAlphaDailyStats(date, state, alphaRegistryIndex));
  }

  const alphaHistory = {};
  for (const dayRows of alphaDailyRows) {
    for (const row of dayRows) {
      if (!alphaHistory[row.alpha_id]) alphaHistory[row.alpha_id] = [];
      alphaHistory[row.alpha_id].push(row);
    }
  }

  const alphaHistoryWithDecay = markAlphaDecay(alphaHistory);
  const backtest = runBacktestEngine(strategyConfig.id, snapshots);
  const singleAlphaBacktests = runSingleAlphaBacktests(alphaHistoryWithDecay);
  const paper = runPaperLedger(strategyConfig.id, snapshots);
  const alphaDailyStats = Object.values(alphaHistoryWithDecay).flat()
    .sort((a, b) => a.date.localeCompare(b.date));
  const marketHistory = snapshots.map((item) => item.market);
  const featureHistory = snapshots.map((item) => item.feature);
  const modelHistory = snapshots.map((item) => item.model);
  const portfolioHistory = snapshots.map((item) => item.portfolio);
  const riskHistory = snapshots.map((item) => item.risk);

  return {
    strategy: strategyConfig,
    snapshots,
    alpha_history: alphaHistoryWithDecay,
    alpha_daily_stats: alphaDailyStats,
    market_history: marketHistory,
    feature_history: featureHistory,
    model_history: modelHistory,
    portfolio_history: portfolioHistory,
    risk_history: riskHistory,
    backtest,
    single_alpha_backtests: singleAlphaBacktests,
    paper,
    current_snapshot: snapshots[snapshots.length - 1],
    current_state: states[states.length - 1]
  };
}

function regimeStabilityScore(snapshots) {
  if (snapshots.length <= 1) return 1;
  let transitions = 0;
  for (let i = 1; i < snapshots.length; i += 1) {
    if (snapshots[i].market_regime !== snapshots[i - 1].market_regime) transitions += 1;
  }
  return round(1 - transitions / (snapshots.length - 1), 4);
}

function riskAdjustedScore(result) {
  const denom = Math.max(0.01, result.max_drawdown + 0.01);
  return round(result.cumulative_return_post_cost / denom + result.sharpe * 0.2 + result.sortino * 0.15, 4);
}

function backtestStability(result) {
  const daily = result?.daily || [];
  if (!daily.length) return 0;
  const returns = daily.map((row) => Number(row.post_cost_return || 0));
  const volatility = stdDev(returns);
  const tailRiskRatio = returns.filter((value) => value < -0.005).length / Math.max(returns.length, 1);
  const score = Math.max(0, 1 - Math.min(1, volatility * 25 + tailRiskRatio * 0.7));
  return round(score, 4);
}

function paperFeasibility(history) {
  const summary = history?.paper?.summary || {};
  const orders = Number(summary.total_orders || 0);
  const filled = Number(summary.filled_orders || 0);
  const fillRatio = filled / Math.max(orders, 1);
  const winRate = Number(summary.win_rate || 0);
  const totalReturn = Number(summary.total_return || 0);
  const noStressPenalty = totalReturn >= -0.02 ? 1 : 0.4;
  const score = 0.45 * fillRatio + 0.35 * winRate + 0.2 * noStressPenalty;
  return round(Math.max(0, Math.min(1, score)), 4);
}

function compareChampionChallenger(championHistory, challengerHistory, asOf) {
  const champion = championHistory.backtest;
  const challenger = challengerHistory.backtest;
  const championPaperFeasibility = paperFeasibility(championHistory);
  const challengerPaperFeasibility = paperFeasibility(challengerHistory);
  const championStability = backtestStability(champion);
  const challengerStability = backtestStability(challenger);

  const overlapSeries = challengerHistory.snapshots.map((snapshot, index) => {
    const champSet = championHistory.snapshots[index]?.portfolio?.selected?.map((item) => item.ticker) || [];
    const chgSet = snapshot.portfolio.selected.map((item) => item.ticker);
    return jaccard(champSet, chgSet);
  });
  const overlap = round(mean(overlapSeries), 4);
  const uniqueness = round(1 - overlap, 4);

  const comparison = {
    type: 'ChallengerComparison',
    comparison_id: registryId('comparison', championHistory.strategy.id, challengerHistory.strategy.id, asOf.slice(0, 10)),
    champion_id: championHistory.strategy.id,
    challenger_id: challengerHistory.strategy.id,
    metrics: {
      return: {
        champion: champion.cumulative_return_post_cost,
        challenger: challenger.cumulative_return_post_cost,
        delta: round(challenger.cumulative_return_post_cost - champion.cumulative_return_post_cost, 5)
      },
      drawdown: {
        champion: champion.max_drawdown,
        challenger: challenger.max_drawdown,
        delta: round(challenger.max_drawdown - champion.max_drawdown, 5)
      },
      win_rate: {
        champion: champion.win_rate,
        challenger: challenger.win_rate,
        delta: round(challenger.win_rate - champion.win_rate, 5)
      },
      turnover: {
        champion: champion.turnover,
        challenger: challenger.turnover,
        delta: round(challenger.turnover - champion.turnover, 5)
      },
      hit_rate: {
        champion: champion.win_rate,
        challenger: challenger.win_rate,
        delta: round(challenger.win_rate - champion.win_rate, 5)
      },
      stability: {
        champion: championStability,
        challenger: challengerStability,
        delta: round(challengerStability - championStability, 5)
      },
      regime_stability: {
        champion: regimeStabilityScore(championHistory.snapshots),
        challenger: regimeStabilityScore(challengerHistory.snapshots)
      },
      regime_robustness: {
        champion: regimeStabilityScore(championHistory.snapshots),
        challenger: regimeStabilityScore(challengerHistory.snapshots),
        delta: round(
          regimeStabilityScore(challengerHistory.snapshots) - regimeStabilityScore(championHistory.snapshots),
          5
        )
      },
      paper_feasibility: {
        champion: championPaperFeasibility,
        challenger: challengerPaperFeasibility,
        delta: round(challengerPaperFeasibility - championPaperFeasibility, 5)
      },
      risk_adjusted_score: {
        champion: riskAdjustedScore(champion),
        challenger: riskAdjustedScore(challenger)
      },
      overlap_with_champion: overlap,
      uniqueness_vs_champion: uniqueness
    },
    promotable: false
  };

  const checklist = [
    {
      rule: 'Return improvement (20D/60D proxy)',
      pass: comparison.metrics.return.delta >= 0.003,
      value: comparison.metrics.return.delta,
      threshold: 0.003
    },
    {
      rule: 'Drawdown not materially worse',
      pass: comparison.metrics.drawdown.delta <= 0.01,
      value: comparison.metrics.drawdown.delta,
      threshold: 0.01
    },
    {
      rule: 'Turnover control',
      pass: comparison.metrics.turnover.challenger <= comparison.metrics.turnover.champion * 1.25,
      value: comparison.metrics.turnover.challenger,
      threshold: round(comparison.metrics.turnover.champion * 1.25, 5)
    },
    {
      rule: 'Regime stability floor',
      pass: comparison.metrics.regime_stability.challenger >= 0.45,
      value: comparison.metrics.regime_stability.challenger,
      threshold: 0.45
    },
    {
      rule: 'Backtest stability floor',
      pass: comparison.metrics.stability.challenger >= 0.55,
      value: comparison.metrics.stability.challenger,
      threshold: 0.55
    },
    {
      rule: 'Paper feasibility floor',
      pass: comparison.metrics.paper_feasibility.challenger >= 0.5,
      value: comparison.metrics.paper_feasibility.challenger,
      threshold: 0.5
    },
    {
      rule: 'Risk-adjusted score improvement',
      pass: comparison.metrics.risk_adjusted_score.challenger >= comparison.metrics.risk_adjusted_score.champion,
      value: comparison.metrics.risk_adjusted_score.challenger,
      threshold: comparison.metrics.risk_adjusted_score.champion
    }
  ];

  const promotable = checklist.every((item) => item.pass);
  comparison.promotable = promotable;

  const decision = {
    type: 'PromotionDecision',
    decision_id: registryId('promotion_decision', challengerHistory.strategy.id, asOf.slice(0, 10)),
    challenger_id: challengerHistory.strategy.id,
    created_at: asOf,
    promotable,
    status: ENTITY_STAGE.TESTING,
    recommended_next_stage: promotable ? ENTITY_STAGE.PAPER : ENTITY_STAGE.TESTING,
    checklist,
    notes: promotable
      ? 'Challenger passes current gate and can move to paper stage.'
      : 'Challenger remains in testing. Continue paper monitoring.'
  };

  return {
    comparison,
    decision
  };
}

function computeAlphaHealth(alphaRegistry, alphaHistoryById) {
  return alphaRegistry.map((alpha) => {
    const history = alphaHistoryById[alpha.id] || [];
    const last10 = history.slice(-10);
    const prev10 = history.slice(-20, -10);

    const recentPnl = mean(last10.map((row) => row.pnl_contribution_proxy));
    const prevPnl = mean(prev10.map((row) => row.pnl_contribution_proxy));
    const recentHit = mean(last10.map((row) => row.hit_rate_proxy));
    const prevHit = mean(prev10.map((row) => row.hit_rate_proxy));

    let health = 'stable';
    if (recentPnl > prevPnl + 0.05 && recentHit > prevHit) health = 'improving';
    if (recentPnl < prevPnl - 0.05 || recentHit < prevHit - 0.05 || recentHit < 0.45) health = 'decaying';

    return {
      alpha_id: alpha.id,
      name: alpha.name,
      family: alpha.family,
      status: alpha.status,
      health,
      recent_hit_rate: round(recentHit, 4),
      recent_pnl_proxy: round(recentPnl, 4),
      trigger_intensity: round(mean(last10.map((row) => row.number_of_triggers)), 3),
      decay_flag: Boolean(last10.some((row) => row.decay_flag))
    };
  });
}

function computeDiagnostics(championHistory, comparisons) {
  const snapshots = championHistory.snapshots;
  const alphaHealth = computeAlphaHealth(championHistory.alpha_registry, championHistory.alpha_history);

  const stability = regimeStabilityScore(snapshots);
  const tradeLightDays = snapshots.filter((item) => item.risk.mode === 'trade light').length;
  const pausedDays = snapshots.filter((item) => item.risk.mode === 'do not trade').length;
  const exposureCappedDays = snapshots.filter((item) => item.risk.suggested_gross_exposure_pct <= 30).length;

  const concentration = snapshots.map((item) => {
    const values = Object.values(item.portfolio.concentration || {});
    return values.length ? Math.max(...values) : 0;
  });

  const failureReasonMap = {};
  for (const snap of snapshots) {
    for (const item of snap.portfolio.filtered) {
      failureReasonMap[item.reason] = (failureReasonMap[item.reason] || 0) + 1;
    }
  }

  const paperReturn = championHistory.paper.summary.total_return;
  const backtestReturn = championHistory.backtest.cumulative_return_post_cost;

  return {
    alpha_health: alphaHealth,
    regime_stability: {
      score: stability,
      regime_transitions: snapshots.length ? Math.round((1 - stability) * (snapshots.length - 1)) : 0,
      window_days: snapshots.length
    },
    risk_pressure_summary: {
      avg_safety_score: round(mean(snapshots.map((item) => item.risk.safety_score)), 3),
      trade_light_days: tradeLightDays,
      paused_days: pausedDays,
      exposure_capped_days: exposureCappedDays,
      why_exposure_capped_today: snapshots.at(-1)?.risk?.primary_risks?.[0] || '--'
    },
    portfolio_concentration: {
      avg_top_sector_exposure_pct: round(mean(concentration), 3),
      max_top_sector_exposure_pct: round(Math.max(...concentration, 0), 3)
    },
    paper_vs_backtest_gap: {
      paper_total_return: paperReturn,
      backtest_total_return: backtestReturn,
      gap: round(paperReturn - backtestReturn, 5)
    },
    top_failure_reasons: Object.entries(failureReasonMap)
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6),
    challenger_watchlist: comparisons.map((row) => ({
      challenger_id: row.comparison.challenger_id,
      promotable: row.comparison.promotable,
      delta_return: row.comparison.metrics.return.delta,
      delta_drawdown: row.comparison.metrics.drawdown.delta
    }))
  };
}

function buildAlphaRegistry() {
  const defs = getAlphaDefinitions();
  return defs.map((item, index) => {
    const status =
      index % 9 === 0
        ? 'paper'
        : index % 13 === 0
          ? 'disabled'
          : index % 17 === 0
            ? 'retired'
            : 'active';

    return {
      type: 'AlphaDefinition',
      id: item.id,
      name: item.name,
      family: item.family,
      description: item.description,
      inputs: item.inputs,
      regime_fit: item.regime_fit,
      expected_holding_period: item.expected_holding_period,
      risk_tags: item.risk_tags,
      status,
      version: 'alpha-v1.0.0'
    };
  });
}

function alphaRegistryIndex(registry) {
  return Object.fromEntries(registry.map((item) => [item.id, item]));
}

function buildExperiments(championHistory, challengerHistories, comparisonRows, asOf) {
  const rows = [];

  rows.push({
    type: 'Experiment',
    experiment_id: registryId('experiment', championHistory.strategy.id, asOf.slice(0, 10)),
    version_id: championHistory.strategy.version,
    created_at: asOf,
    status: ENTITY_STAGE.CHAMPION,
    notes: 'Current production-like champion baseline.',
    comparison_summary: 'N/A (reference baseline)',
    strategy_id: championHistory.strategy.id
  });

  for (const ch of challengerHistories) {
    const cmp = comparisonRows.find((item) => item.comparison.challenger_id === ch.strategy.id);
    rows.push({
      type: 'Experiment',
      experiment_id: registryId('experiment', ch.strategy.id, asOf.slice(0, 10)),
      version_id: ch.strategy.version,
      created_at: asOf,
      status: normalizeStage(cmp?.decision?.status || ENTITY_STAGE.TESTING, ENTITY_STAGE.TESTING),
      notes: cmp?.decision?.notes || 'Under evaluation in paper environment.',
      comparison_summary: `Δret=${cmp?.comparison?.metrics?.return?.delta ?? 0}, Δdd=${cmp?.comparison?.metrics?.drawdown?.delta ?? 0}`,
      strategy_id: ch.strategy.id
    });
  }

  return rows;
}

export function buildResearchLoop({
  endDate = new Date().toISOString(),
  lookbackDays = DEFAULT_LOOKBACK_DAYS,
  riskProfileKey = 'balanced',
  challengerConfigs = DEFAULT_CHALLENGERS
} = {}) {
  const runAsOf = new Date(endDate).toISOString();
  const dates = businessDates(endDate, lookbackDays);
  const alphaRegistry = buildAlphaRegistry();
  const alphaIndex = alphaRegistryIndex(alphaRegistry);

  const championConfig = {
    ...getDefaultStrategyConfig(),
    id: 'champion',
    label: 'Champion',
    version: 'model-v1.0.0'
  };

  const championHistory = runStrategyHistory({
    dates,
    riskProfileKey,
    strategyConfig: championConfig,
    alphaRegistryIndex: alphaIndex
  });

  championHistory.alpha_registry = alphaRegistry;

  const challengerHistories = challengerConfigs.map((item) =>
    runStrategyHistory({
      dates,
      riskProfileKey,
      strategyConfig: {
        ...getDefaultStrategyConfig(),
        ...item
      },
      alphaRegistryIndex: alphaIndex
    })
  );

  const comparisonRows = challengerHistories.map((history) => compareChampionChallenger(championHistory, history, runAsOf));
  const diagnostics = computeDiagnostics(championHistory, comparisonRows);
  const experiments = buildExperiments(championHistory, challengerHistories, comparisonRows, runAsOf);
  const decisions = comparisonRows.map((item) => item.decision);
  const promotionLoop = buildPromotionLoop({
    comparisons: comparisonRows.map((item) => item.comparison),
    decisions,
    asOf: runAsOf,
    dataQualityStatus: 'healthy'
  });
  const legacyDecisionByChallenger = new Map(decisions.map((item) => [item.challenger_id, item]));
  const normalizedPromotionDecisions = promotionLoop.decisions.map((item) => ({
    ...(legacyDecisionByChallenger.get(item.compared_entities.challenger_id) || {}),
    ...item,
    challenger_id: item.compared_entities.challenger_id,
    status: item.decision.to_stage,
    notes: item.rationale
  }));

  const versionRegistry = [
    {
      strategy_id: championConfig.id,
      version: championConfig.version,
      status: ENTITY_STAGE.CHAMPION,
      created_at: championHistory.current_snapshot?.date || dates[dates.length - 1]
    },
    ...challengerHistories.map((item) => {
      const decision = normalizedPromotionDecisions.find((row) => row.challenger_id === item.strategy.id);
      return {
        strategy_id: item.strategy.id,
        version: item.strategy.version,
        status: normalizeStage(decision?.status || ENTITY_STAGE.TESTING, ENTITY_STAGE.TESTING),
        created_at: championHistory.current_snapshot?.date || dates[dates.length - 1]
      };
    })
  ];

  const snapshots = championHistory.snapshots.map((row) => ({
    date: row.date,
    market_regime: row.market_regime,
    safety_score: row.safety_score,
    suggested_exposure: row.suggested_exposure,
    selected_opportunities: row.selected_opportunities.map((item) => item.ticker),
    filtered_opportunities: row.filtered_opportunities.map((item) => item.ticker),
    active_alpha_summary: row.active_alpha_summary,
    risk_drivers: row.risk_drivers
  }));

  const paperOps = buildPaperOps({
    strategyId: championConfig.id,
    snapshots: championHistory.snapshots,
    paper: championHistory.paper,
    backtest: championHistory.backtest,
    asOf: runAsOf
  });

  const registrySystem = buildUnifiedRegistrySystem({
    alphaDefinitions: alphaRegistry,
    alphaHealth: diagnostics.alpha_health,
    champion: {
      config: championConfig,
      snapshots: championHistory.snapshots,
      backtest: championHistory.backtest,
      paper: championHistory.paper
    },
    challengers: challengerHistories.map((item) => ({
      config: item.strategy,
      snapshots: item.snapshots,
      backtest: item.backtest,
      paper: item.paper
    })),
    decisions: normalizedPromotionDecisions,
    asOf: runAsOf
  });

  return {
    generated_at: runAsOf,
    store_type: 'local_research_store_json',
    dates,
    daily_snapshots: snapshots,
    champion: {
      config: championConfig,
      snapshots: championHistory.snapshots,
      current_snapshot: championHistory.current_snapshot,
      current_state: championHistory.current_state,
      alpha_history: championHistory.alpha_history,
      alpha_daily_stats: championHistory.alpha_daily_stats,
      market_history: championHistory.market_history,
      feature_history: championHistory.feature_history,
      model_history: championHistory.model_history,
      portfolio_history: championHistory.portfolio_history,
      risk_history: championHistory.risk_history,
      backtest: championHistory.backtest,
      single_alpha_backtests: championHistory.single_alpha_backtests,
      paper: championHistory.paper
    },
    alpha_registry: alphaRegistry,
    challengers: challengerHistories.map((item) => ({
      config: item.strategy,
      snapshots: item.snapshots,
      backtest: item.backtest,
      paper: item.paper
    })),
    comparisons: comparisonRows.map((item) => item.comparison),
    promotion_decisions: normalizedPromotionDecisions,
    diagnostics,
    experiments,
    paper_ops: paperOps,
    registry_system: registrySystem,
    governance: {
      model: 'champion-challenger-v1',
      statuses: ['draft', 'testing', 'paper', 'candidate', 'champion', 'challenger', 'retired'],
      version_registry: versionRegistry,
      promotion_rules: promotionLoop.rules
    },
    object_models: [
      'MarketSnapshot',
      'FeatureSnapshot',
      'AlphaDefinition',
      'AlphaDailyStats',
      'ModelOutput',
      'PortfolioSnapshot',
      'RiskSnapshot',
      'BacktestResult',
      'PaperOrder',
      'PaperPosition',
      'PaperLedger',
      'PaperDailyRun',
      'Experiment',
      'ChallengerComparison',
      'PromotionDecision',
      'AlphaRegistry',
      'ModelRegistry',
      'StrategyRegistry',
      'AlphaHealth',
      'ModelHealth',
      'StrategyHealth',
      'DataHealth',
      'WeeklySystemReview',
      'GovernanceContractChecks'
    ]
  };
}
