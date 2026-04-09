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

function rankPercentile(sortedValues, value, highIsGood = true) {
  if (!Number.isFinite(value) || !sortedValues.length) return null;
  const firstIndex = sortedValues.findIndex((item) => item >= value);
  const index = firstIndex >= 0 ? firstIndex : sortedValues.length - 1;
  const pct = sortedValues.length > 1 ? index / (sortedValues.length - 1) : 1;
  return round(highIsGood ? pct : 1 - pct, 4);
}

function localStats(bars, index) {
  const close = bars[index]?.close;
  const prevClose = bars[index - 1]?.close;
  if (!Number.isFinite(close) || !Number.isFinite(prevClose) || prevClose <= 0) return null;
  const closes20 = windowSlice(bars, index, 20, (row) => row.close);
  const closes252 = windowSlice(bars, index, 252, (row) => row.close);
  const returns20 = closes20
    .slice(1)
    .map((value, idx) => value / closes20[idx] - 1)
    .filter((value) => Number.isFinite(value));
  const maxAnchor = closes252.length ? Math.max(...closes252) : Math.max(...closes20, close);
  return {
    ret20: close / (bars[index - 20]?.close || close) - 1,
    ret60: close / (bars[index - 60]?.close || close) - 1,
    ret5: close / (bars[index - 5]?.close || close) - 1,
    vol20: std(returns20),
    distance_to_high_anchor: maxAnchor > 0 ? close / maxAnchor - 1 : 0,
  };
}

function buildPanelByTimestamp(replaySets) {
  const rowsByTs = new Map();
  for (const set of replaySets) {
    set.bars.forEach((_, index) => {
      if (index < 30) return;
      const stats = localStats(set.bars, index);
      if (!stats) return;
      const ts = set.bars[index].ts_open;
      const rows = rowsByTs.get(ts) || [];
      rows.push({ key: `${set.market}:${set.symbol}`, ...stats });
      rowsByTs.set(ts, rows);
    });
  }

  const panelByTs = new Map();
  for (const [ts, rows] of rowsByTs.entries()) {
    const ret20Values = rows.map((row) => row.ret20).sort((a, b) => a - b);
    const ret60Values = rows.map((row) => row.ret60).sort((a, b) => a - b);
    const vol20Values = rows.map((row) => row.vol20).sort((a, b) => a - b);
    const anchorValues = rows.map((row) => row.distance_to_high_anchor).sort((a, b) => a - b);
    const panel = new Map();
    for (const row of rows) {
      panel.set(row.key, {
        ret20_percentile: rankPercentile(ret20Values, row.ret20, true),
        ret60_percentile: rankPercentile(ret60Values, row.ret60, true),
        vol20_percentile: rankPercentile(vol20Values, row.vol20, true),
        low_vol_percentile: rankPercentile(vol20Values, row.vol20, false),
        anchor_percentile: rankPercentile(anchorValues, row.distance_to_high_anchor, true),
      });
    }
    panelByTs.set(ts, panel);
  }
  return panelByTs;
}

function candidateText(candidate = {}) {
  return [
    candidate.strategy_family,
    candidate.template_id,
    candidate.template_name,
    candidate.hypothesis_description,
    ...(candidate.supporting_features || []),
  ]
    .join(' ')
    .toLowerCase();
}

function candidateParam(candidate = {}, key, fallback) {
  return safeNumber(candidate.parameter_set?.[key], fallback);
}

function classifyCandidate(candidate = {}) {
  const text = candidateText(candidate);
  const shortBias = text.includes('overbought') || text.includes('fade') || text.includes('short');

  if (text.includes('residual') || text.includes('idiosyncratic')) {
    return { family: 'residual_momentum', direction: 1 };
  }
  if (text.includes('crash') || text.includes('market_drawdown') || text.includes('snapback')) {
    return { family: 'crash_aware_momentum', direction: 1 };
  }
  if (
    text.includes('volatility managed') ||
    text.includes('volatility-managed') ||
    text.includes('volman') ||
    text.includes('time_series_momentum')
  ) {
    return { family: 'volatility_managed_momentum', direction: 1 };
  }
  if (
    text.includes('52-week') ||
    text.includes('52 week') ||
    text.includes('fifty_two') ||
    text.includes('distance_to_52w_high')
  ) {
    return { family: 'high_anchor_momentum', direction: 1 };
  }
  if (text.includes('time series momentum') || text.includes('tsmom')) {
    return { family: 'time_series_momentum', direction: 1 };
  }
  if (
    text.includes('low-vol') ||
    text.includes('low_vol') ||
    text.includes('idiosyncratic_volatility')
  ) {
    return { family: 'low_vol_relative_strength', direction: 1 };
  }
  if (text.includes('gap_survival') || text.includes('post_gap') || text.includes('pead')) {
    return { family: 'gap_survival_event', direction: 1 };
  }
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

function replayTrigger({ bars, index, candidate, panel }) {
  const { family, direction } = classifyCandidate(candidate);
  const close = bars[index].close;
  const prevClose = bars[index - 1]?.close;
  if (!prevClose) return null;

  const closes20 = windowSlice(bars, index, 20, (row) => row.close);
  const closes10 = windowSlice(bars, index, 10, (row) => row.close);
  const closes60 = windowSlice(bars, index, 60, (row) => row.close);
  const closes252 = windowSlice(bars, index, 252, (row) => row.close);
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
  const prevMax60 = closes60.length ? Math.max(...closes60) : prevMax20;
  const prevMax252 = closes252.length ? Math.max(...closes252) : prevMax60;
  const avgVolume20 = mean(volumes20);
  const dayReturn = close / prevClose - 1;
  const ret5 = close / (bars[index - 5]?.close || close) - 1;
  const ret20 = close / (bars[index - 20]?.close || close) - 1;
  const ret60 = close / (bars[index - 60]?.close || close) - 1;
  const gapReturn = safeNumber(bars[index].open, close) / prevClose - 1;
  const localDrawdown60 = prevMax60 > 0 ? close / prevMax60 - 1 : 0;
  const distanceToAnchorHigh = prevMax252 > 0 ? close / prevMax252 - 1 : 0;
  const vol20 = Math.max(0.006, std(returns20));
  const priorVol20 = std(
    windowSlice(bars, index - 20, 20, (row) => row.close)
      .slice(1)
      .map((value, idx, rows) => value / rows[idx] - 1)
      .filter((value) => Number.isFinite(value)),
  );
  const volumeRatio = avgVolume20 > 0 ? bars[index].volume / avgVolume20 : 1;

  if (family === 'time_series_momentum') {
    const minRet20 = candidateParam(candidate, 'min_ret_20d', vol20 * 1.6);
    const trendOk = ret20 > minRet20 && ret60 > 0 && close > sma20 && sma10 > sma20 * 0.998;
    const rankOk = panel?.ret20_percentile == null || panel.ret20_percentile >= 0.5;
    if (trendOk && rankOk && volumeRatio >= 0.7) return 1;
    return null;
  }
  if (family === 'high_anchor_momentum') {
    const maxDistance = Math.abs(candidateParam(candidate, 'anchor_distance_max_pct', 8)) / 100;
    const minRs = candidateParam(candidate, 'relative_strength_cutoff', 0.6);
    const anchorOk = distanceToAnchorHigh >= -maxDistance;
    const rankOk =
      panel?.ret20_percentile == null || panel.ret20_percentile >= Math.max(0.45, minRs - 0.1);
    const notTooVertical = Math.abs(ret5) < Math.max(0.09, vol20 * 8);
    if (anchorOk && rankOk && notTooVertical && ret20 > vol20 * 1.3 && ret60 > 0) return 1;
    return null;
  }
  if (family === 'residual_momentum') {
    const residualProxy = ret20 - ret60 / 3 - Math.sign(ret5) * Math.min(Math.abs(ret5), vol20);
    const minScore = candidateParam(candidate, 'min_residual_return', vol20 * 1.2);
    if (close > sma20 && residualProxy > minScore && Math.abs(dayReturn) < vol20 * 2.4) return 1;
    return null;
  }
  if (family === 'crash_aware_momentum') {
    const drawdownTrigger = -Math.abs(candidateParam(candidate, 'market_drawdown_trigger', 0.12));
    const reboundCap = Math.abs(candidateParam(candidate, 'max_rebound_5d', 0.08));
    const crashProxyActive = localDrawdown60 <= drawdownTrigger && ret5 > reboundCap;
    if (crashProxyActive) return null;
    if (close > prevMax20 * 0.998 && close > sma20 && ret20 > vol20 * 2 && volumeRatio >= 0.8) {
      return 1;
    }
    return null;
  }
  if (family === 'low_vol_relative_strength') {
    const rsCutoff = candidateParam(candidate, 'relative_strength_cutoff', 0.6);
    const volRankCap = candidateParam(candidate, 'realized_vol_rank_cap', 0.65);
    const volCap = candidateParam(candidate, 'max_realized_volatility', 0.026);
    const relativeVolCap = Math.max(volCap, priorVol20 > 0 ? priorVol20 * 0.9 : volCap);
    const panelOk = panel
      ? panel.ret20_percentile >= rsCutoff && panel.vol20_percentile <= volRankCap
      : vol20 <= relativeVolCap;
    if (panelOk && close > sma20 && sma10 >= sma20 && ret20 > vol20 * 1.4) return 1;
    return null;
  }
  if (family === 'gap_survival_event') {
    const minGap = candidateParam(candidate, 'min_gap_pct', 0.012);
    const gapMidpoint = prevClose * (1 + gapReturn / 2);
    if (gapReturn >= minGap && close >= gapMidpoint && volumeRatio >= 0.9) return 1;
    return null;
  }
  if (family === 'volatility_managed_momentum') {
    const volOk = priorVol20 <= 0 || vol20 <= Math.max(0.035, priorVol20 * 1.7);
    if (volOk && close > sma20 && ret20 > vol20 * 1.8 && volumeRatio >= 0.75) return 1;
    return null;
  }
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
    const panelOk = panel?.ret20_percentile == null || panel.ret20_percentile >= 0.58;
    return panelOk && close > sma20 && sma10 >= sma20 * 0.995 && ret5 > vol20 * 0.9 ? 1 : null;
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
  const replayFamily = classifyCandidate(candidate).family;
  const replaySets = barSets
    .map((set) => ({
      market: set.market,
      symbol: set.symbol,
      bars: (set.bars || [])
        .map((row) => ({
          ts_open: safeNumber(row.ts_open),
          open: safeNumber(row.open, Number.NaN),
          high: safeNumber(row.high, Number.NaN),
          low: safeNumber(row.low, Number.NaN),
          close: safeNumber(row.close, Number.NaN),
          volume: safeNumber(row.volume, 0),
        }))
        .filter(
          (row) => Number.isFinite(row.ts_open) && Number.isFinite(row.close) && row.close > 0,
        ),
    }))
    .filter((set) => set.bars.length >= 60);
  const panelByTs = buildPanelByTimestamp(replaySets);
  const allTrades = [];
  const symbolSummaries = [];

  for (const set of replaySets) {
    const bars = set.bars;
    const symbolTrades = [];
    for (let index = 30; index < bars.length - horizonBars; index += 1) {
      const panel = panelByTs.get(bars[index].ts_open)?.get(`${set.market}:${set.symbol}`);
      const direction = replayTrigger({ bars, index, candidate, panel });
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
    replay_family: replayFamily,
    closed_trades: allTrades.length,
    symbols_tested: replaySets.length,
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
    turnover: replaySets.length ? round(allTrades.length / replaySets.length / 60, 4) : 0,
    cost_bps_round_trip: round(costPct * 10000, 4),
    symbol_summaries: symbolSummaries.sort((a, b) => b.net_return - a.net_return).slice(0, 12),
    windows: splitWindows(allTrades),
    sample_trades: allTrades.slice(0, 16),
  };
}
