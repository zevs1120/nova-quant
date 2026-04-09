function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function round(value, digits = 6) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function mean(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function std(values) {
  if (values.length < 2) return 0;
  const avg = mean(values);
  return Math.sqrt(mean(values.map((value) => (value - avg) ** 2)));
}

function maxDrawdown(returns) {
  let equity = 1;
  let peak = 1;
  let worst = 0;
  for (const ret of returns) {
    equity *= 1 + ret;
    peak = Math.max(peak, equity);
    worst = Math.min(worst, peak > 0 ? equity / peak - 1 : 0);
  }
  return Math.abs(worst);
}

function parseHorizonBars(horizon) {
  const matches = String(horizon || '')
    .match(/\d+/g)
    ?.map((item) => Number.parseInt(item, 10))
    .filter((item) => Number.isFinite(item) && item > 0);
  if (!matches?.length) return 5;
  return Math.max(2, Math.min(20, Math.round(mean(matches))));
}

function windowSlice(rows, endExclusive, size, getter) {
  const start = Math.max(0, endExclusive - size);
  return rows
    .slice(start, endExclusive)
    .map(getter)
    .filter((value) => Number.isFinite(value));
}

function classifyCandidate(candidate = {}) {
  const text = [
    candidate.strategy_family,
    candidate.template_id,
    candidate.template_name,
    candidate.hypothesis_description,
    ...(candidate.supporting_features || []),
  ]
    .join(' ')
    .toLowerCase();
  const shortBias = text.includes('overbought') || text.includes('fade') || text.includes('short');

  if (text.includes('mean') || text.includes('reversion') || text.includes('oversold')) {
    return { family: 'mean_reversion', direction: shortBias ? -1 : 1 };
  }
  if (text.includes('relative') || text.includes('lead') || text.includes('lag')) {
    return { family: 'relative_strength', direction: 1 };
  }
  if (text.includes('liquidity') || text.includes('volume')) {
    return { family: 'liquidity_volume', direction: shortBias ? -1 : 1 };
  }
  if (text.includes('volatility') || text.includes('regime') || text.includes('transition')) {
    return { family: 'volatility_regime', direction: shortBias ? -1 : 1 };
  }
  return { family: 'momentum', direction: shortBias ? -1 : 1 };
}

function replayTrigger({ bars, index, candidate }) {
  const { family, direction } = classifyCandidate(candidate);
  const close = bars[index].close;
  const prevClose = bars[index - 1]?.close;
  if (!prevClose) return null;

  const closes20 = windowSlice(bars, index, 20, (row) => row.close);
  const closes10 = windowSlice(bars, index, 10, (row) => row.close);
  const volumes20 = windowSlice(bars, index, 20, (row) => row.volume);
  const returns20 = closes20
    .slice(1)
    .map((value, idx) => value / closes20[idx] - 1)
    .filter((value) => Number.isFinite(value));
  if (closes20.length < 18 || returns20.length < 12) return null;

  const sma20 = mean(closes20);
  const sma10 = mean(closes10);
  const prevMax20 = Math.max(...closes20);
  const prevMin20 = Math.min(...closes20);
  const avgVolume20 = mean(volumes20);
  const dayReturn = close / prevClose - 1;
  const ret5 = close / (bars[index - 5]?.close || close) - 1;
  const vol20 = Math.max(0.006, std(returns20));
  const volumeRatio = avgVolume20 > 0 ? bars[index].volume / avgVolume20 : 1;

  if (family === 'mean_reversion') {
    if (direction < 0 && close > prevMax20 * 0.998 && dayReturn > vol20 * 0.95) return -1;
    if (close < prevMin20 * 1.002 || dayReturn < -vol20 * 1.05) return 1;
    return null;
  }
  if (family === 'volatility_regime') {
    const priorVol = std(returns20.slice(0, 12));
    if (vol20 >= Math.max(0.007, priorVol * 1.05) && Math.abs(dayReturn) >= vol20 * 0.55) {
      return dayReturn >= 0 ? 1 : -1;
    }
    return null;
  }
  if (family === 'relative_strength') {
    return close > sma20 && sma10 >= sma20 * 0.995 && ret5 > vol20 * 0.9 ? 1 : null;
  }
  if (family === 'liquidity_volume') {
    if (volumeRatio >= 1.08 && Math.abs(dayReturn) >= vol20 * 0.55 && close > sma20 * 0.985) {
      return direction * (dayReturn >= 0 ? 1 : -1);
    }
    return null;
  }
  if (close > prevMax20 * 0.998 && volumeRatio >= 0.85 && close > sma20 && ret5 > 0) return 1;
  if (direction < 0 && close < prevMin20 * 1.002 && close < sma20 && ret5 < 0) return -1;
  return null;
}

function replayTrade({ bars, entryIndex, direction, horizonBars, costPct }) {
  const entry = bars[entryIndex].close;
  if (!Number.isFinite(entry) || entry <= 0) return null;

  const closeReturns = windowSlice(bars, entryIndex, 20, (row, idx) => {
    const prev = bars[Math.max(0, entryIndex - 21 + idx)]?.close;
    return prev ? row.close / prev - 1 : 0;
  });
  const stopPct = Math.max(0.018, Math.min(0.09, std(closeReturns) * 2.2));
  const takePct = stopPct * 1.8;
  let exitIndex = Math.min(bars.length - 1, entryIndex + horizonBars);
  let exit = bars[exitIndex].close;

  for (let idx = entryIndex + 1; idx <= exitIndex; idx += 1) {
    const bar = bars[idx];
    const stop = direction > 0 ? entry * (1 - stopPct) : entry * (1 + stopPct);
    const take = direction > 0 ? entry * (1 + takePct) : entry * (1 - takePct);
    const stopHit = direction > 0 ? bar.low <= stop : bar.high >= stop;
    const takeHit = direction > 0 ? bar.high >= take : bar.low <= take;
    if (stopHit) {
      exit = stop;
      exitIndex = idx;
      break;
    }
    if (takeHit) {
      exit = take;
      exitIndex = idx;
      break;
    }
  }

  const gross = direction > 0 ? exit / entry - 1 : entry / exit - 1;
  return {
    entry_index: entryIndex,
    exit_index: exitIndex,
    entry_ts: bars[entryIndex].ts_open,
    exit_ts: bars[exitIndex].ts_open,
    gross_return: round(gross, 8),
    net_return: round(gross - costPct, 8),
    holding_bars: exitIndex - entryIndex,
    direction: direction > 0 ? 'LONG' : 'SHORT',
  };
}

function splitWindows(trades, count = 3) {
  if (!trades.length) return [];
  const sorted = [...trades].sort((a, b) => a.entry_ts - b.entry_ts);
  const chunk = Math.max(1, Math.ceil(sorted.length / count));
  return Array.from({ length: Math.min(count, Math.ceil(sorted.length / chunk)) }).map((_, idx) => {
    const rows = sorted.slice(idx * chunk, (idx + 1) * chunk);
    return {
      window_id: `bar_replay_${idx + 1}`,
      test_return: round(
        rows.reduce((sum, trade) => sum + trade.net_return, 0),
        6,
      ),
      drawdown: round(maxDrawdown(rows.map((trade) => trade.net_return)), 6),
      closed_trades: rows.length,
    };
  });
}

export function runCandidateBarReplay({ candidate, barSets = [], config = {} } = {}) {
  const horizonBars = parseHorizonBars(
    candidate?.expected_holding_horizon || candidate?.holding_period,
  );
  const costPct = safeNumber(config.cost_bps_round_trip, 18) / 10000;
  const allTrades = [];
  const symbolSummaries = [];

  for (const set of barSets) {
    const bars = (set.bars || [])
      .map((row) => ({
        ts_open: safeNumber(row.ts_open),
        open: safeNumber(row.open, Number.NaN),
        high: safeNumber(row.high, Number.NaN),
        low: safeNumber(row.low, Number.NaN),
        close: safeNumber(row.close, Number.NaN),
        volume: safeNumber(row.volume, 0),
      }))
      .filter((row) => Number.isFinite(row.ts_open) && Number.isFinite(row.close) && row.close > 0);
    if (bars.length < 60) continue;

    const symbolTrades = [];
    for (let index = 30; index < bars.length - horizonBars; index += 1) {
      const direction = replayTrigger({ bars, index, candidate });
      if (!direction) continue;
      const trade = replayTrade({ bars, entryIndex: index, direction, horizonBars, costPct });
      if (!trade) continue;
      const enriched = { ...trade, market: set.market, symbol: set.symbol };
      symbolTrades.push(enriched);
      allTrades.push(enriched);
      index = trade.exit_index;
    }

    if (symbolTrades.length) {
      const net = symbolTrades.map((trade) => trade.net_return);
      symbolSummaries.push({
        market: set.market,
        symbol: set.symbol,
        closed_trades: symbolTrades.length,
        net_return: round(
          net.reduce((sum, ret) => sum + ret, 0),
          6,
        ),
        avg_trade_return_post_cost: round(mean(net), 6),
        win_rate: round(net.filter((ret) => ret > 0).length / symbolTrades.length, 4),
      });
    }
  }

  const netReturns = allTrades.map((trade) => trade.net_return);
  const grossReturns = allTrades.map((trade) => trade.gross_return);
  const avg = mean(netReturns);
  const sigma = std(netReturns);
  const sharpe =
    sigma > 0 ? (avg / sigma) * Math.sqrt(Math.min(252, Math.max(1, allTrades.length))) : 0;

  return {
    candidate_id: candidate?.candidate_id || candidate?.id || null,
    source: 'ohlcv_candidate_replay',
    closed_trades: allTrades.length,
    symbols_tested: barSets.length,
    symbols_with_trades: symbolSummaries.length,
    gross_return: round(
      grossReturns.reduce((sum, ret) => sum + ret, 0),
      6,
    ),
    net_return: round(
      netReturns.reduce((sum, ret) => sum + ret, 0),
      6,
    ),
    avg_trade_return_post_cost: round(avg, 6),
    win_rate: allTrades.length
      ? round(netReturns.filter((ret) => ret > 0).length / allTrades.length, 4)
      : 0,
    max_drawdown: round(maxDrawdown(netReturns), 6),
    sharpe_proxy: round(sharpe, 4),
    average_holding_time: round(mean(allTrades.map((trade) => trade.holding_bars)), 4),
    turnover: barSets.length ? round(allTrades.length / barSets.length / 60, 4) : 0,
    cost_bps_round_trip: round(costPct * 10000, 4),
    symbol_summaries: symbolSummaries.sort((a, b) => b.net_return - a.net_return).slice(0, 12),
    windows: splitWindows(allTrades),
    sample_trades: allTrades.slice(0, 16),
  };
}
