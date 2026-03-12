import {
  annualizedVolatility,
  computeRsi,
  mean,
  pctChange,
  rankMap,
  stdDev
} from '../../quant/math.js';
import { groupBy, sortByDate } from '../../normalizers/utils.js';

function rollingAverage(values, endIndex, window) {
  const start = Math.max(0, endIndex - window + 1);
  const slice = values.slice(start, endIndex + 1);
  return mean(slice);
}

function rollingStd(values, endIndex, window) {
  const start = Math.max(0, endIndex - window + 1);
  const slice = values.slice(start, endIndex + 1);
  return stdDev(slice);
}

function rollingHigh(values, endIndex, window) {
  const start = Math.max(0, endIndex - window + 1);
  const slice = values.slice(start, endIndex + 1);
  return Math.max(...slice);
}

function rollingLow(values, endIndex, window) {
  const start = Math.max(0, endIndex - window + 1);
  const slice = values.slice(start, endIndex + 1);
  return Math.min(...slice);
}

function safeRet(closes, i, lag) {
  if (i - lag < 0) return 0;
  return pctChange(closes[i - lag], closes[i]);
}

function trailingReturns(closes, endIndex, window = 20) {
  const start = Math.max(1, endIndex - window + 1);
  const rets = [];
  for (let i = start; i <= endIndex; i += 1) {
    rets.push(pctChange(closes[i - 1], closes[i]));
  }
  return rets;
}

function benchmarkDateMap(benchmarks = []) {
  const map = {};
  for (const bench of benchmarks) {
    map[bench.symbol] = Object.fromEntries((bench.bars || []).map((bar) => [bar.date, bar]));
  }
  return map;
}

export function buildEquityFeatures(normalizedEquities) {
  const bars = normalizedEquities?.bars || [];
  const assets = normalizedEquities?.assets || [];
  const sectorBySymbol = Object.fromEntries(assets.map((item) => [item.symbol, item.sector || 'Unknown']));
  const grouped = groupBy(bars, (row) => row.symbol);
  const benchmarks = benchmarkDateMap(normalizedEquities?.benchmarks || []);
  const bySymbolDate = new Map();
  const featureRows = [];

  for (const [symbol, rows] of grouped.entries()) {
    const ordered = sortByDate(rows, 'date');
    const closes = ordered.map((row) => row.adjusted_close || row.close);
    const highs = ordered.map((row) => row.high);
    const lows = ordered.map((row) => row.low);
    const volumes = ordered.map((row) => row.volume);
    const dollarVol = ordered.map((row) => row.volume * row.close);

    for (let i = 0; i < ordered.length; i += 1) {
      const row = ordered[i];
      const ret5 = safeRet(closes, i, 5);
      const ret10 = safeRet(closes, i, 10);
      const ret20 = safeRet(closes, i, 20);
      const ret60 = safeRet(closes, i, 60);
      const sma20 = rollingAverage(closes, i, 20);
      const sma60 = rollingAverage(closes, i, 60);
      const close = closes[i];
      const closeStd20 = rollingStd(closes, i, 20) || 1e-9;
      const atr14 = rollingAverage(highs.map((h, idx) => h - lows[idx]), i, 14);
      const hv20 = annualizedVolatility(trailingReturns(closes, i, 20), 252);
      const adv20 = rollingAverage(volumes, i, 20) || 1;
      const dollarAdv20 = rollingAverage(dollarVol, i, 20);
      const breakoutHigh20 = rollingHigh(highs, i, 20);
      const breakoutLow20 = rollingLow(lows, i, 20);

      const spyClose = benchmarks.SPY?.[row.date]?.close;
      const spyRet20 = benchmarks.SPY?.[ordered[Math.max(0, i - 20)]?.date]
        ? pctChange(benchmarks.SPY[ordered[Math.max(0, i - 20)]?.date].close, spyClose)
        : 0;

      const qqqClose = benchmarks.QQQ?.[row.date]?.close;
      const qqqRet20 = benchmarks.QQQ?.[ordered[Math.max(0, i - 20)]?.date]
        ? pctChange(benchmarks.QQQ[ordered[Math.max(0, i - 20)]?.date].close, qqqClose)
        : spyRet20;

      const benchmarkRel20 = ret20 - spyRet20;
      const styleRel20 = ret20 - qqqRet20;

      const value = {
        asset_class: 'equity',
        symbol,
        date: row.date,
        source: row.source,
        fetched_at: row.fetched_at,
        data_status: 'derived',
        trend_ret_5d: Number(ret5.toFixed(6)),
        trend_ret_10d: Number(ret10.toFixed(6)),
        trend_ret_20d: Number(ret20.toFixed(6)),
        trend_ret_60d: Number(ret60.toFixed(6)),
        trend_ma_dev_20: Number((close / (sma20 || close) - 1).toFixed(6)),
        trend_ma_dev_60: Number((close / (sma60 || close) - 1).toFixed(6)),
        trend_breakout_20: Number((close / (breakoutHigh20 || close) - 1).toFixed(6)),
        trend_breakdown_20: Number((close / (breakoutLow20 || close) - 1).toFixed(6)),
        mr_zscore_20: Number(((close - sma20) / closeStd20).toFixed(6)),
        mr_rsi_14: Number(computeRsi(closes.slice(Math.max(0, i - 20), i + 1), 14).toFixed(3)),
        mr_vwap_dev: Number((close / (row.vwap || close) - 1).toFixed(6)),
        vol_hv20: Number(hv20.toFixed(6)),
        vol_atr14_pct: Number((atr14 / Math.max(close, 1e-9)).toFixed(6)),
        liq_volume_adv20: Number((row.volume / adv20).toFixed(6)),
        liq_dollar_adv20: Number(dollarAdv20.toFixed(2)),
        rel_strength_raw_20: Number(ret20.toFixed(6)),
        benchmark_rel_20: Number(benchmarkRel20.toFixed(6)),
        style_rel_20: Number(styleRel20.toFixed(6)),
        sector: sectorBySymbol[symbol] || 'Unknown'
      };

      bySymbolDate.set(`${symbol}:${row.date}`, value);
      featureRows.push(value);
    }
  }

  // Cross-sectional and sector ranks by date
  const dateGroups = groupBy(featureRows, (row) => row.date);
  for (const rows of dateGroups.values()) {
    const retMap = Object.fromEntries(rows.map((row) => [row.symbol, row.rel_strength_raw_20]));
    const overallRank = rankMap(retMap);

    const sectorGroups = groupBy(rows, (row) => row.sector);
    const sectorRankByKey = {};
    for (const [sector, sectorRows] of sectorGroups.entries()) {
      const map = Object.fromEntries(sectorRows.map((row) => [row.symbol, row.rel_strength_raw_20]));
      const ranked = rankMap(map);
      for (const [symbol, rank] of Object.entries(ranked)) {
        sectorRankByKey[`${sector}:${symbol}`] = rank;
      }
    }

    for (const row of rows) {
      const key = `${row.symbol}:${row.date}`;
      const target = bySymbolDate.get(key);
      if (!target) continue;
      target.rel_strength_rank = Number((overallRank[row.symbol] || 0).toFixed(6));
      target.rel_strength_sector_rank = Number((sectorRankByKey[`${row.sector}:${row.symbol}`] || 0).toFixed(6));
    }
  }

  return {
    asset_class: 'equity',
    feature_set_name: 'equity_core_v1',
    feature_manifest: [
      'trend_ret_5d',
      'trend_ret_10d',
      'trend_ret_20d',
      'trend_ret_60d',
      'trend_ma_dev_20',
      'trend_ma_dev_60',
      'trend_breakout_20',
      'mr_zscore_20',
      'mr_rsi_14',
      'mr_vwap_dev',
      'vol_hv20',
      'vol_atr14_pct',
      'liq_volume_adv20',
      'liq_dollar_adv20',
      'rel_strength_rank',
      'rel_strength_sector_rank',
      'benchmark_rel_20',
      'style_rel_20'
    ],
    rows: featureRows
  };
}
