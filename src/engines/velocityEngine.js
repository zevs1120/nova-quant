import { HOW_USED_RULES, PARAM_VERSION, VELOCITY_SETTINGS } from './params.js';
import {
  clamp,
  deterministicHash,
  mean,
  percentileRank,
  quantile,
  returnsFromPrices,
  rollingMean,
  rollingStd,
  round,
  stdDev
} from './math.js';

const DEFAULT_POINTS = 120;

function timeframeToHours(timeframe) {
  if (timeframe === '1H') return 1;
  if (timeframe === '2H') return 2;
  if (timeframe === '4H') return 4;
  return 24;
}

function inferTimeframe(signal) {
  if (signal.timeframe) return signal.timeframe;
  return signal.market === 'CRYPTO' ? '4H' : '1D';
}

function seriesKey(market, symbol, timeframe) {
  return `${market}|${symbol}|${timeframe}`;
}

function calcEventStats(events, horizons, tailQuantiles) {
  const grouped = {
    CROSS_ABOVE_90: {},
    CROSS_BELOW_10: {}
  };

  for (const type of Object.keys(grouped)) {
    const scopedEvents = events.filter((event) => event.event_type === type);
    for (const horizon of horizons) {
      const returns = scopedEvents
        .map((event) => event.forward?.[horizon]?.return)
        .filter((value) => Number.isFinite(value));
      const drawdowns = scopedEvents
        .map((event) => event.forward?.[horizon]?.max_drawdown)
        .filter((value) => Number.isFinite(value));
      const pUp = returns.length ? returns.filter((value) => value > 0).length / returns.length : 0;

      grouped[type][horizon] = {
        sample_size: returns.length,
        p_up: round(pUp, 4),
        e_return: round(mean(returns), 4),
        e_max_drawdown: round(mean(drawdowns), 4),
        tail_quantiles: {
          returns: Object.fromEntries(
            tailQuantiles.map((q) => [`q${Math.round(q * 100)}`, round(quantile(returns, q), 4)])
          ),
          max_drawdown: Object.fromEntries(
            tailQuantiles.map((q) => [`q${Math.round(q * 100)}`, round(quantile(drawdowns, q), 4)])
          )
        }
      };
    }
  }

  return grouped;
}

function calcPathDrawdown(path) {
  if (!path.length) return 0;
  let peak = path[0];
  let worst = 0;
  for (const value of path) {
    peak = Math.max(peak, value);
    const dd = peak === 0 ? 0 : (value - peak) / peak;
    worst = Math.min(worst, dd);
  }
  return Math.abs(worst);
}

function generateSyntheticSeries({ market, symbol, timeframe, anchorPrice, anchorTime, points = DEFAULT_POINTS }) {
  const hours = timeframeToHours(timeframe);
  const stepMs = hours * 3600 * 1000;
  const seed = deterministicHash(`${market}:${symbol}:${timeframe}`);
  const dates = [];
  const close = [];

  let px = anchorPrice * (0.94 + (seed % 13) / 100);
  const drift = ((seed % 180) - 90) / 100000;

  for (let i = 0; i < points; i += 1) {
    const t1 = Math.sin((i + (seed % 11)) / 5.2) * 0.0054;
    const t2 = Math.cos((i + (seed % 17)) / 8.1) * 0.0036;
    const pulse = i % 27 === 0 ? ((seed % 2 === 0 ? 1 : -1) * 0.009) : 0;
    const ret = drift + t1 + t2 + pulse;
    px = Math.max(0.00001, px * (1 + ret));
    close.push(round(px, 4));
    dates.push(new Date(anchorTime - (points - 1 - i) * stepMs).toISOString());
  }

  return { market, symbol, timeframe, dates, close };
}

function pickAnchorPrice(market, symbol, signals, trades) {
  const signalEntries = signals
    .filter((item) => item.market === market && item.symbol === symbol)
    .map((item) => (Number(item.entry_min) + Number(item.entry_max)) / 2)
    .filter((value) => Number.isFinite(value));

  if (signalEntries.length) return mean(signalEntries);

  const tradeEntries = trades
    .filter((item) => item.market === market && item.symbol === symbol)
    .map((item) => Number(item.entry))
    .filter((value) => Number.isFinite(value));

  if (tradeEntries.length) return mean(tradeEntries);
  if (market === 'CRYPTO') return symbol.startsWith('BTC') ? 68000 : 2400;
  return symbol.startsWith('SPY') ? 550 : 220;
}

function calcVelocityArrays(close) {
  const returns = returnsFromPrices(close);
  const vRaw = close.map((price, index) => {
    const lookbackIndex = Math.max(0, index - 6);
    const momentum = close[lookbackIndex] ? price / close[lookbackIndex] - 1 : 0;
    const vol = rollingStd(returns, VELOCITY_SETTINGS.lookback, Math.max(0, index - 1));
    return momentum / (vol + 1e-5);
  });

  const vNorm = vRaw.map((value, index) => {
    const mu = rollingMean(vRaw, VELOCITY_SETTINGS.lookback, index);
    const sigma = rollingStd(vRaw, VELOCITY_SETTINGS.lookback, index) || stdDev(vRaw.slice(0, index + 1)) || 1;
    return (value - mu) / sigma;
  });

  const acceleration = vNorm.map((value, index) => (index === 0 ? 0 : value - vNorm[index - 1]));

  const percentile = vNorm.map((value, index) => percentileRank(vNorm.slice(0, index + 1), value));

  const volSeries = close.map((_, index) =>
    rollingStd(returns, VELOCITY_SETTINGS.lookback, Math.max(0, index - 1))
  );
  const volPercentile = volSeries.map((value, index) => percentileRank(volSeries.slice(0, index + 1), value));

  const trendStrength = close.map((price, index) => {
    const baseIndex = Math.max(0, index - VELOCITY_SETTINGS.lookback);
    const base = close[baseIndex] || price;
    const slope = base ? price / base - 1 : 0;
    return clamp(0.5 + slope / 0.12, 0, 1);
  });

  return { vNorm, acceleration, percentile, volPercentile, trendStrength };
}

function buildSeriesState(series) {
  const { dates, close } = series;
  const arrays = calcVelocityArrays(close);
  const horizons = VELOCITY_SETTINGS.horizons;
  const maxHorizon = Math.max(...horizons);
  const events = [];

  for (let index = 1; index < close.length - maxHorizon; index += 1) {
    const prev = arrays.percentile[index - 1];
    const curr = arrays.percentile[index];
    const crossedHigh = prev < VELOCITY_SETTINGS.event_threshold_high && curr >= VELOCITY_SETTINGS.event_threshold_high;
    const crossedLow = prev > VELOCITY_SETTINGS.event_threshold_low && curr <= VELOCITY_SETTINGS.event_threshold_low;
    if (!crossedHigh && !crossedLow) continue;

    const event = {
      event_id: `${series.market}-${series.symbol}-${series.timeframe}-${index}`,
      market: series.market,
      symbol: series.symbol,
      timeframe: series.timeframe,
      time: dates[index],
      event_type: crossedHigh ? 'CROSS_ABOVE_90' : 'CROSS_BELOW_10',
      percentile: round(curr, 4),
      v_norm: round(arrays.vNorm[index], 4),
      acceleration: round(arrays.acceleration[index], 4),
      forward: {}
    };

    for (const horizon of horizons) {
      const futureClose = close[index + horizon];
      const path = close.slice(index, index + horizon + 1);
      event.forward[horizon] = {
        return: round(futureClose / close[index] - 1, 5),
        max_drawdown: round(calcPathDrawdown(path), 5)
      };
    }

    events.push(event);
  }

  const conditionalStats = calcEventStats(events, horizons, VELOCITY_SETTINGS.tail_quantiles);
  const lastIndex = close.length - 1;

  return {
    ...series,
    velocity: {
      dates,
      v_norm: arrays.vNorm.map((value) => round(value, 4)),
      acceleration: arrays.acceleration.map((value) => round(value, 4)),
      percentile: arrays.percentile.map((value) => round(value, 4)),
      trend_strength: arrays.trendStrength.map((value) => round(value, 4)),
      vol_percentile: arrays.volPercentile.map((value) => round(value, 4))
    },
    latest: {
      v_norm: round(arrays.vNorm[lastIndex], 4),
      acceleration: round(arrays.acceleration[lastIndex], 4),
      percentile: round(arrays.percentile[lastIndex], 4),
      trend_strength: round(arrays.trendStrength[lastIndex], 4),
      vol_percentile: round(arrays.volPercentile[lastIndex], 4)
    },
    event_study: {
      events,
      conditional_stats: conditionalStats
    }
  };
}

function buildSeedSeries(signals, trades, anchorTime) {
  const keys = new Map();

  for (const signal of signals) {
    const timeframe = inferTimeframe(signal);
    keys.set(seriesKey(signal.market, signal.symbol, timeframe), {
      market: signal.market,
      symbol: signal.symbol,
      timeframe
    });
  }

  keys.set(seriesKey('CRYPTO', 'BTC-USDT', '4H'), {
    market: 'CRYPTO',
    symbol: 'BTC-USDT',
    timeframe: '4H'
  });
  keys.set(seriesKey('US', 'QQQ', '1D'), {
    market: 'US',
    symbol: 'QQQ',
    timeframe: '1D'
  });

  return Array.from(keys.values()).map((item) =>
    generateSyntheticSeries({
      ...item,
      anchorPrice: pickAnchorPrice(item.market, item.symbol, signals, trades),
      anchorTime
    })
  );
}

function resolvePrimarySeries(seriesStates) {
  const btc = seriesStates.find(
    (item) => item.market === 'CRYPTO' && item.symbol === 'BTC-USDT' && item.timeframe === '4H'
  );
  if (btc) return btc;

  const crypto = seriesStates.find((item) => item.market === 'CRYPTO');
  if (crypto) return crypto;
  return seriesStates[0] || null;
}

export function getSeriesKey(market, symbol, timeframe) {
  return seriesKey(market, symbol, timeframe);
}

export function runVelocityEngine({ signals, trades, velocitySeed, featureSeries, anchorTime }) {
  const generatedAt = new Date(anchorTime).toISOString();
  const seeds =
    featureSeries && Array.isArray(featureSeries) && featureSeries.length
      ? featureSeries
      : buildSeedSeries(signals, trades, anchorTime);

  const seriesStates = seeds.map((series) => buildSeriesState(series));
  const primary = resolvePrimarySeries(seriesStates);
  const eventStudyDb = Object.fromEntries(
    seriesStates.map((series) => [
      seriesKey(series.market, series.symbol, series.timeframe),
      {
        market: series.market,
        symbol: series.symbol,
        timeframe: series.timeframe,
        conditional_stats: series.event_study.conditional_stats,
        events: series.event_study.events
      }
    ])
  );

  const primaryStats =
    primary?.event_study?.conditional_stats?.CROSS_ABOVE_90?.[7] ||
    primary?.event_study?.conditional_stats?.CROSS_ABOVE_90?.[3] ||
    {
      sample_size: 0,
      p_up: 0,
      e_return: 0,
      e_max_drawdown: 0,
      tail_quantiles: { returns: {}, max_drawdown: {} }
    };

  return {
    version: PARAM_VERSION,
    generated_at: generatedAt,
    seed_source: velocitySeed?.seed_source || 'synthetic-deterministic-series',
    series: seriesStates,
    series_index: Object.fromEntries(
      seriesStates.map((series) => [seriesKey(series.market, series.symbol, series.timeframe), series])
    ),
    event_study_db: eventStudyDb,
    primary_key: primary ? seriesKey(primary.market, primary.symbol, primary.timeframe) : null,
    global: {
      current: primary?.latest?.v_norm ?? velocitySeed?.current ?? 0,
      percentile: primary?.latest?.percentile ?? velocitySeed?.percentile ?? 0.5,
      acceleration: primary?.latest?.acceleration ?? 0,
      stats_7d: {
        n_events: primaryStats.sample_size,
        next_7d_up_prob: primaryStats.p_up,
        avg_move: primaryStats.e_return,
        avg_dd: primaryStats.e_max_drawdown,
        tail_quantiles: primaryStats.tail_quantiles
      },
      rule_summary_en: velocitySeed?.rule_summary_en ?? HOW_USED_RULES.rule_summary_en,
      rule_summary_zh: velocitySeed?.rule_summary_zh ?? HOW_USED_RULES.rule_summary_zh,
      how_used_en: velocitySeed?.how_used_en ?? HOW_USED_RULES.how_used_en,
      how_used_zh: velocitySeed?.how_used_zh ?? HOW_USED_RULES.how_used_zh
    }
  };
}
