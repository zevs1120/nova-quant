import { MarketRepository } from '../db/repository.js';
import { RUNTIME_STATUS } from '../runtimeStatus.js';
import type { Asset, AssetClass, Market, Timeframe } from '../types.js';
import { getFactorDefinition, type FactorCard, type FactorFamilyId } from './knowledge.js';

type SupportedMeasuredFactorId =
  | 'momentum'
  | 'low_vol'
  | 'reversal'
  | 'seasonality'
  | 'carry'
  | 'liquidity';

type FactorMeasurementArgs = {
  factorId?: string;
  market?: Market;
  assetClass?: AssetClass;
  timeframe?: Timeframe;
  lookbackBars?: number;
  minAssetsPerDate?: number;
  quantileBuckets?: number;
};

type AssetFeaturePoint = {
  ts: number;
  symbol: string;
  feature: number;
  forwardReturn: number;
  trendProxy: number;
  volProxy: number;
};

type DailyCrossSectionSummary = {
  ts: number;
  ic: number | null;
  rank_ic: number | null;
  quantile_spread: number | null;
  hit: boolean | null;
  turnover_proxy: number | null;
  regime: string;
  observation_count: number;
};

function toNumber(value: string | number | null | undefined): number | null {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function mean(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function stdDev(values: number[]): number | null {
  if (values.length < 2) return null;
  const avg = mean(values);
  if (avg === null) return null;
  const variance = values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / (values.length - 1);
  return Math.sqrt(Math.max(variance, 0));
}

function pearson(xs: number[], ys: number[]): number | null {
  if (xs.length !== ys.length || xs.length < 3) return null;
  const avgX = mean(xs);
  const avgY = mean(ys);
  if (avgX === null || avgY === null) return null;
  let cov = 0;
  let varX = 0;
  let varY = 0;
  for (let i = 0; i < xs.length; i += 1) {
    const dx = xs[i] - avgX;
    const dy = ys[i] - avgY;
    cov += dx * dy;
    varX += dx * dx;
    varY += dy * dy;
  }
  if (varX <= 0 || varY <= 0) return null;
  return cov / Math.sqrt(varX * varY);
}

function rank(values: number[]): number[] {
  const sorted = values.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value);
  const ranks = new Array(values.length).fill(0);
  let i = 0;
  while (i < sorted.length) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1].value === sorted[i].value) j += 1;
    const avgRank = (i + j + 2) / 2;
    for (let k = i; k <= j; k += 1) ranks[sorted[k].index] = avgRank;
    i = j + 1;
  }
  return ranks;
}

function spearman(xs: number[], ys: number[]): number | null {
  if (xs.length !== ys.length || xs.length < 3) return null;
  return pearson(rank(xs), rank(ys));
}

function pctChange(current: number, past: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(past) || past === 0) return null;
  return current / past - 1;
}

function realizedVol(closes: number[], endIndex: number, window: number): number | null {
  if (endIndex - window + 1 < 1) return null;
  const returns: number[] = [];
  for (let i = endIndex - window + 1; i <= endIndex; i += 1) {
    const ret = pctChange(closes[i], closes[i - 1]);
    if (ret === null) return null;
    returns.push(ret);
  }
  return stdDev(returns);
}

function avgDollarVolume(
  closes: number[],
  volumes: number[],
  endIndex: number,
  window: number,
): number | null {
  if (endIndex - window + 1 < 0) return null;
  const values: number[] = [];
  for (let i = endIndex - window + 1; i <= endIndex; i += 1) {
    const close = closes[i];
    const volume = volumes[i];
    if (!Number.isFinite(close) || !Number.isFinite(volume)) return null;
    values.push(close * volume);
  }
  return mean(values);
}

function rollingMean(
  values: Array<number | null>,
  endIndex: number,
  window: number,
): number | null {
  const start = Math.max(0, endIndex - window + 1);
  const bucket = values
    .slice(start, endIndex + 1)
    .filter((value): value is number => value !== null && Number.isFinite(value));
  return bucket.length ? mean(bucket) : null;
}

function alignLatestSeries<T>(
  points: Array<{ ts_open: number }>,
  rows: T[],
  valueAt: (row: T) => number | null,
  tsAt: (row: T) => number,
): Array<number | null> {
  const ordered = [...rows].sort((a, b) => tsAt(a) - tsAt(b));
  let cursor = 0;
  let latest: number | null = null;
  return points.map((point) => {
    while (cursor < ordered.length && tsAt(ordered[cursor]) <= point.ts_open) {
      const value = valueAt(ordered[cursor]);
      latest = value !== null && Number.isFinite(value) ? value : latest;
      cursor += 1;
    }
    return latest;
  });
}

function clamp(num: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, num));
}

function classifyDerivedRegime(trend: number, vol: number): string {
  const highVol = vol >= 0.025;
  if (trend >= 0.04) return highVol ? 'uptrend_high_vol' : 'uptrend_normal';
  if (trend <= -0.04) return highVol ? 'downtrend_high_vol' : 'downtrend_normal';
  if (highVol) return 'range_high_vol';
  return 'range_normal';
}

function quantileBuckets<T>(rows: T[], bucketCount: number): { low: T[]; high: T[] } {
  const size = Math.max(1, Math.floor(rows.length / bucketCount));
  return {
    low: rows.slice(0, size),
    high: rows.slice(Math.max(rows.length - size, 0)),
  };
}

function measuredFactorSupport(factorId: FactorFamilyId): {
  measurable: boolean;
  reason?: string;
  implementation_note: string;
  default_horizon_bars: number;
} {
  switch (factorId) {
    case 'momentum':
      return {
        measurable: true,
        implementation_note:
          'Measured from cross-sectional 20d/60d relative strength using OHLCV history.',
        default_horizon_bars: 20,
      };
    case 'low_vol':
      return {
        measurable: true,
        implementation_note:
          'Measured from cross-sectional inverse realized volatility using daily OHLCV.',
        default_horizon_bars: 20,
      };
    case 'reversal':
      return {
        measurable: true,
        implementation_note:
          'Measured from short-horizon overreaction using recent 5-day return reversion.',
        default_horizon_bars: 5,
      };
    case 'seasonality':
      return {
        measurable: true,
        implementation_note:
          'Measured from day-of-month style recurrence proxy using return seasonality over daily bars.',
        default_horizon_bars: 5,
      };
    case 'carry':
      return {
        measurable: true,
        implementation_note:
          'Measured from aligned funding-rate and basis history using the repository funding/basis store for crypto assets.',
        default_horizon_bars: 20,
      };
    case 'value':
    case 'quality':
    case 'size':
    case 'sentiment':
    case 'revision':
      return {
        measurable: false,
        reason:
          'This factor depends on fundamental, estimate, or alternative-data history that is not yet persisted in the runtime research store.',
        implementation_note:
          'The taxonomy and workflow are available, but measured cross-sectional history needs broader data coverage.',
        default_horizon_bars: 20,
      };
    case 'breadth':
      return {
        measurable: false,
        reason:
          'Breadth is currently better represented as a market/regime overlay than as an asset-level cross-sectional rank in this store.',
        implementation_note:
          'Use regime diagnostics plus market-state breadth overlays until breadth history is persisted as a first-class artifact.',
        default_horizon_bars: 20,
      };
    case 'liquidity':
      return {
        measurable: true,
        implementation_note:
          'Measured from rolling dollar volume and illiquidity penalty proxies derived from OHLCV history.',
        default_horizon_bars: 5,
      };
    default:
      return {
        measurable: false,
        reason: 'This factor is not yet mapped to a measured research implementation.',
        implementation_note: 'Use knowledge-layer guidance until measured history exists.',
        default_horizon_bars: 20,
      };
  }
}

function computeFeatureSeries(args: {
  factorId: SupportedMeasuredFactorId;
  asset: Asset;
  repo: MarketRepository;
  rows: ReturnType<MarketRepository['getOhlcv']>;
  closes: number[];
  volumes: number[];
}): Array<number | null> {
  const { factorId, asset, repo, rows, closes, volumes } = args;

  if (factorId === 'carry') {
    const startTs = rows[0]?.ts_open;
    const endTs = rows.length ? rows[rows.length - 1].ts_open : undefined;
    const fundingRows = repo.listFundingRates({
      assetId: asset.asset_id,
      start: startTs,
      end: endTs,
    });
    const basisRows = repo.listBasisSnapshots({
      assetId: asset.asset_id,
      start: startTs,
      end: endTs,
    });
    const alignedFunding = alignLatestSeries(
      rows,
      fundingRows,
      (row) => toNumber(row.funding_rate),
      (row) => row.ts_open,
    );
    const alignedBasis = alignLatestSeries(
      rows,
      basisRows,
      (row) => toNumber(row.basis_bps),
      (row) => row.ts_open,
    );

    return rows.map((_, index) => {
      const fundingMean = rollingMean(alignedFunding, index, 6);
      const basisMean = rollingMean(alignedBasis, index, 6);
      if (fundingMean === null && basisMean === null) return null;
      return (fundingMean ?? 0) * 10_000 * 0.6 + (basisMean ?? 0) * 0.4;
    });
  }

  return closes.map((_, index) => {
    switch (factorId) {
      case 'momentum': {
        const ret20 = index >= 20 ? pctChange(closes[index], closes[index - 20]) : null;
        const ret60 = index >= 60 ? pctChange(closes[index], closes[index - 60]) : null;
        if (ret20 === null && ret60 === null) return null;
        if (ret20 !== null && ret60 !== null) return ret20 * 0.6 + ret60 * 0.4;
        return ret20 ?? ret60;
      }
      case 'low_vol': {
        const vol = realizedVol(closes, index, 20);
        return vol === null ? null : -vol;
      }
      case 'reversal': {
        const ret5 = index >= 5 ? pctChange(closes[index], closes[index - 5]) : null;
        return ret5 === null ? null : -ret5;
      }
      case 'seasonality': {
        if (index < 21) return null;
        const prev1 = pctChange(closes[index - 20], closes[index - 21]);
        return prev1;
      }
      case 'liquidity': {
        const adv = avgDollarVolume(closes, volumes, index, 20);
        const ret1 = index >= 1 ? pctChange(closes[index], closes[index - 1]) : null;
        if (adv === null || ret1 === null) return null;
        const illiquidity = Math.abs(ret1) / Math.max(adv, 1);
        return Math.log10(Math.max(adv, 1)) - Math.log10(1 + illiquidity * 1_000_000_000);
      }
      default:
        return null;
    }
  });
}

function buildAssetObservations(
  repo: MarketRepository,
  asset: Asset,
  rows: ReturnType<MarketRepository['getOhlcv']>,
  factorId: SupportedMeasuredFactorId,
  forwardHorizon: number,
): AssetFeaturePoint[] {
  const closes = rows.map((row) => toNumber(row.close) ?? Number.NaN);
  const volumes = rows.map((row) => toNumber(row.volume) ?? Number.NaN);
  const features = computeFeatureSeries({
    factorId,
    asset,
    repo,
    rows,
    closes,
    volumes,
  });
  const observations: AssetFeaturePoint[] = [];

  for (let index = 0; index < rows.length - forwardHorizon; index += 1) {
    const feature = features[index];
    if (feature === null || !Number.isFinite(feature)) continue;
    const forwardReturn = pctChange(closes[index + forwardHorizon], closes[index]);
    const trendProxy = index >= 20 ? pctChange(closes[index], closes[index - 20]) : null;
    const volProxy = realizedVol(closes, index, 20);
    const adv = avgDollarVolume(closes, volumes, index, 20);
    if (forwardReturn === null || trendProxy === null || volProxy === null) continue;
    const adjustedFeature =
      factorId === 'seasonality' && adv !== null
        ? feature * clamp(Math.log10(Math.max(adv, 1)) / 8, 0.3, 1.3)
        : feature;
    observations.push({
      ts: rows[index].ts_open,
      symbol: asset.symbol,
      feature: adjustedFeature,
      forwardReturn,
      trendProxy,
      volProxy,
    });
  }

  return observations;
}

function summarizeDailyCrossSection(
  points: AssetFeaturePoint[],
  previousLeaders: string[] | null,
  bucketCount: number,
): DailyCrossSectionSummary {
  const xs = points.map((row) => row.feature);
  const ys = points.map((row) => row.forwardReturn);
  const sorted = [...points].sort((a, b) => a.feature - b.feature);
  const buckets = quantileBuckets(sorted, bucketCount);
  const lowAvg = mean(buckets.low.map((row) => row.forwardReturn));
  const highAvg = mean(buckets.high.map((row) => row.forwardReturn));
  const turnover = previousLeaders
    ? 1 -
      buckets.high.filter((row) => previousLeaders.includes(row.symbol)).length /
        Math.max(previousLeaders.length, 1)
    : null;
  const avgTrend = mean(points.map((row) => row.trendProxy)) ?? 0;
  const avgVol = mean(points.map((row) => row.volProxy)) ?? 0;

  return {
    ts: points[0]?.ts ?? 0,
    ic: pearson(xs, ys),
    rank_ic: spearman(xs, ys),
    quantile_spread: lowAvg === null || highAvg === null ? null : highAvg - lowAvg,
    hit: lowAvg === null || highAvg === null ? null : highAvg > lowAvg,
    turnover_proxy: turnover,
    regime: classifyDerivedRegime(avgTrend, avgVol),
    observation_count: points.length,
  };
}

function aggregateRegimeMetrics(rows: DailyCrossSectionSummary[]) {
  const hitValues = (items: DailyCrossSectionSummary[]) =>
    items
      .map((row) => (row.hit === null ? null : row.hit ? 1 : 0))
      .filter((row): row is 0 | 1 => row !== null);

  const map = new Map<string, DailyCrossSectionSummary[]>();
  for (const row of rows) {
    const existing = map.get(row.regime) || [];
    existing.push(row);
    map.set(row.regime, existing);
  }
  return Array.from(map.entries())
    .map(([regime, items]) => ({
      regime,
      sample_dates: items.length,
      ic: mean(items.map((row) => row.ic).filter((row): row is number => row !== null)),
      rank_ic: mean(items.map((row) => row.rank_ic).filter((row): row is number => row !== null)),
      quantile_spread: mean(
        items.map((row) => row.quantile_spread).filter((row): row is number => row !== null),
      ),
      hit_rate: mean(hitValues(items)),
      turnover_proxy: mean(
        items.map((row) => row.turnover_proxy).filter((row): row is number => row !== null),
      ),
    }))
    .sort((a, b) => b.sample_dates - a.sample_dates);
}

function collectMeasurableAssetSet(repo: MarketRepository, market: Market | undefined): Asset[] {
  const targetMarket = market || 'US';
  return repo.listAssets(targetMarket).filter((asset) => asset.status === 'ACTIVE');
}

export function buildFactorMeasurementReport(repo: MarketRepository, args: FactorMeasurementArgs) {
  const factor = args.factorId ? getFactorDefinition(args.factorId) : null;
  if (!factor) {
    return {
      source_status: RUNTIME_STATUS.INSUFFICIENT_DATA,
      data_status: RUNTIME_STATUS.INSUFFICIENT_DATA,
      report: null,
    };
  }

  const support = measuredFactorSupport(factor.factor_id);
  const targetMarket = args.market || (args.assetClass === 'CRYPTO' ? 'CRYPTO' : 'US');
  const timeframe = args.timeframe || '1d';
  const lookbackBars = Math.max(args.lookbackBars || 260, 120);
  const minAssetsPerDate = Math.max(args.minAssetsPerDate || 4, 3);
  const quantileBucketsCount = Math.max(args.quantileBuckets || 3, 3);

  if (!support.measurable) {
    return {
      source_status: RUNTIME_STATUS.DB_BACKED,
      data_status: RUNTIME_STATUS.INSUFFICIENT_DATA,
      report: {
        factor,
        availability: 'knowledge_only',
        knowledge_status: RUNTIME_STATUS.DB_BACKED,
        measurement_status: RUNTIME_STATUS.INSUFFICIENT_DATA,
        measurement_scope: {
          market: targetMarket,
          asset_class: args.assetClass || null,
          timeframe,
          lookback_bars: lookbackBars,
        },
        measured_metrics: null,
        regime_conditioned_metrics: [],
        notes: [support.reason, support.implementation_note].filter(Boolean),
        next_research_action:
          'Add the missing data source or persist the required factor history before treating this as measured evidence.',
      },
    };
  }

  const measurableFactorId = factor.factor_id as SupportedMeasuredFactorId;
  const forwardHorizon = support.default_horizon_bars;
  const assets = collectMeasurableAssetSet(repo, targetMarket);
  const dateMap = new Map<number, AssetFeaturePoint[]>();
  let assetCount = 0;
  let coverageStart: number | null = null;
  let coverageEnd: number | null = null;

  for (const asset of assets) {
    const rows = repo.getOhlcv({
      assetId: asset.asset_id,
      timeframe,
      limit: lookbackBars,
    });
    if (rows.length < Math.max(90, forwardHorizon + 30)) continue;
    const observations = buildAssetObservations(
      repo,
      asset,
      rows,
      measurableFactorId,
      forwardHorizon,
    );
    if (observations.length < 20) continue;
    assetCount += 1;
    coverageStart =
      coverageStart === null ? observations[0].ts : Math.min(coverageStart, observations[0].ts);
    coverageEnd =
      coverageEnd === null
        ? observations[observations.length - 1].ts
        : Math.max(coverageEnd, observations[observations.length - 1].ts);
    for (const point of observations) {
      const existing = dateMap.get(point.ts) || [];
      existing.push(point);
      dateMap.set(point.ts, existing);
    }
  }

  const dailyDates = [...dateMap.keys()].sort((a, b) => a - b);
  const dailySummaries: DailyCrossSectionSummary[] = [];
  let previousLeaders: string[] | null = null;
  for (const ts of dailyDates) {
    const points = (dateMap.get(ts) || []).filter(
      (row) => Number.isFinite(row.feature) && Number.isFinite(row.forwardReturn),
    );
    if (points.length < minAssetsPerDate) continue;
    const summary = summarizeDailyCrossSection(points, previousLeaders, quantileBucketsCount);
    previousLeaders = [...points]
      .sort((a, b) => b.feature - a.feature)
      .slice(0, Math.max(1, Math.floor(points.length / quantileBucketsCount)))
      .map((row) => row.symbol);
    dailySummaries.push(summary);
  }

  if (!dailySummaries.length) {
    return {
      source_status: RUNTIME_STATUS.DB_BACKED,
      data_status: RUNTIME_STATUS.INSUFFICIENT_DATA,
      report: {
        factor,
        availability: 'insufficient_data',
        knowledge_status: RUNTIME_STATUS.DB_BACKED,
        measurement_status: RUNTIME_STATUS.INSUFFICIENT_DATA,
        measurement_scope: {
          market: targetMarket,
          asset_class: args.assetClass || null,
          timeframe,
          lookback_bars: lookbackBars,
        },
        measured_metrics: null,
        regime_conditioned_metrics: [],
        notes: [
          'The current cross-sectional store did not have enough aligned asset history to compute measured factor diagnostics.',
          support.implementation_note,
        ],
        next_research_action:
          'Increase daily-bar coverage or widen the measurable universe before relying on this factor report.',
      },
    };
  }

  const metrics = {
    ic: mean(dailySummaries.map((row) => row.ic).filter((row): row is number => row !== null)),
    rank_ic: mean(
      dailySummaries.map((row) => row.rank_ic).filter((row): row is number => row !== null),
    ),
    quantile_spread: mean(
      dailySummaries.map((row) => row.quantile_spread).filter((row): row is number => row !== null),
    ),
    hit_rate: mean(
      dailySummaries
        .map((row) => (row.hit === null ? null : row.hit ? 1 : 0))
        .filter((row): row is 0 | 1 => row !== null),
    ),
    turnover_proxy: mean(
      dailySummaries.map((row) => row.turnover_proxy).filter((row): row is number => row !== null),
    ),
    sample_dates: dailySummaries.length,
    sample_observations: dailySummaries.reduce((sum, row) => sum + row.observation_count, 0),
    stability_ratio:
      dailySummaries.length > 0
        ? dailySummaries.filter((row) => (row.ic ?? 0) > 0).length / dailySummaries.length
        : null,
  };

  const regimeMetrics = aggregateRegimeMetrics(dailySummaries);
  const verdict =
    (metrics.ic ?? 0) > 0.03 && (metrics.quantile_spread ?? 0) > 0
      ? 'Measured evidence is supportive enough to justify deeper backtest / replay work.'
      : 'Measured evidence is weak or mixed; treat the factor as a hypothesis, not a proven edge.';

  return {
    source_status: RUNTIME_STATUS.DB_BACKED,
    data_status: RUNTIME_STATUS.MODEL_DERIVED,
    report: {
      factor,
      availability: 'measured',
      knowledge_status: RUNTIME_STATUS.DB_BACKED,
      measurement_status: RUNTIME_STATUS.MODEL_DERIVED,
      measurement_scope: {
        market: targetMarket,
        asset_class: args.assetClass || null,
        timeframe,
        lookback_bars: lookbackBars,
        forward_horizon_bars: forwardHorizon,
        assets_used: assetCount,
        coverage_start_ms: coverageStart,
        coverage_end_ms: coverageEnd,
        min_assets_per_date: minAssetsPerDate,
      },
      measured_metrics: metrics,
      regime_conditioned_metrics: regimeMetrics,
      notes: [
        support.implementation_note,
        'These are factor-level measured diagnostics from current OHLCV coverage, not a claim of live deployable edge by themselves.',
      ],
      verdict,
      next_research_action:
        (metrics.ic ?? 0) > 0.03 && (metrics.quantile_spread ?? 0) > 0
          ? 'Use this factor in a replay-aware strategy test with transaction costs and portfolio constraints.'
          : 'Improve the proxy, widen the universe, or reject the idea before spending more backtest budget.',
    },
  };
}
