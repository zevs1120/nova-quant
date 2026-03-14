import { buildSampleMarketData } from './sampleData.js';
import { APP_BUILD_NUMBER, APP_VERSION, APP_VERSION_LABEL } from '../config/version.js';
import {
  annualizedVolatility,
  clamp,
  computeRsi,
  cumulativeFromReturns,
  maxDrawdownFromCurve,
  mean,
  pctChange,
  rankMap,
  returnsFromPrices,
  rollingZScore,
  round,
  simpleMovingAverage,
  stdDev,
  sum
} from './math.js';

const PIPELINE_VERSION = `nova-quant-v${APP_VERSION}`;

const RISK_PROFILES = {
  conservative: {
    maxHoldings: 5,
    maxSingleWeightPct: 12,
    sectorExposureLimitPct: 28,
    perTradeRiskPct: 0.7,
    dailyLossPct: 1.8,
    maxDrawdownPct: 8,
    exposureCapPct: 38,
    leverageCap: 1.2
  },
  balanced: {
    maxHoldings: 7,
    maxSingleWeightPct: 16,
    sectorExposureLimitPct: 34,
    perTradeRiskPct: 1,
    dailyLossPct: 3,
    maxDrawdownPct: 12,
    exposureCapPct: 58,
    leverageCap: 1.8
  },
  aggressive: {
    maxHoldings: 9,
    maxSingleWeightPct: 20,
    sectorExposureLimitPct: 42,
    perTradeRiskPct: 1.4,
    dailyLossPct: 4.5,
    maxDrawdownPct: 18,
    exposureCapPct: 76,
    leverageCap: 2.4
  }
};

const REGIME_TAXONOMY = [
  {
    tag: 'Trend Up',
    description: 'Index trend and breadth are both healthy; trend-following alpha has edge.'
  },
  {
    tag: 'Trend Down',
    description: 'Index trend is weak and downside pressure dominates; long risk should be selective.'
  },
  {
    tag: 'Range / Choppy',
    description: 'Direction is mixed and leadership rotates quickly; mean-reversion and risk control matter.'
  },
  {
    tag: 'High Volatility Risk',
    description: 'Volatility and correlation stress are elevated; gross exposure should be reduced.'
  },
  {
    tag: 'Risk Recovery',
    description: 'Volatility is cooling after stress; exposure can be rebuilt gradually with quality setups.'
  }
];

const RISK_RULES = [
  {
    id: 'RR-001',
    title: 'Index volatility throttle',
    rule: 'If benchmark daily volatility > 2.2%, reduce gross exposure by 40% and disable new C-grade trades.'
  },
  {
    id: 'RR-002',
    title: 'Liquidity floor',
    rule: 'If ADV < $500M equivalent notional, mark instrument as non-tradable for today.'
  },
  {
    id: 'RR-003',
    title: 'Gap chase filter',
    rule: 'If open gap exceeds 2.8% in signal direction, do not chase first entry zone.'
  },
  {
    id: 'RR-004',
    title: 'Trend deterioration gate',
    rule: 'When index trend drops below neutral, only A-grade opportunities remain tradable.'
  },
  {
    id: 'RR-005',
    title: 'Concentration cap',
    rule: 'Single sector exposure cannot exceed configured cap; overflow candidates are filtered out.'
  }
];

const ALPHA_LIBRARY = [
  {
    id: 'ALP-T01',
    name: 'Momentum 20D',
    family: 'Trend',
    short_description: 'Reward positive 20-day drift and penalize persistent decline.',
    inputs: ['ret_20d', 'ma_dev_20'],
    regimes: ['Trend Up', 'Risk Recovery'],
    holding_period: '3-10D',
    risk_tags: ['trend-crowding'],
    compute: (f) => clamp(f.trend.ret20 * 4 + f.trend.maDev20 * 8, -1, 1)
  },
  {
    id: 'ALP-T02',
    name: 'MA Alignment 10/20/60',
    family: 'Trend',
    short_description: 'Score alignment of short and medium moving averages.',
    inputs: ['ma10', 'ma20', 'ma60'],
    regimes: ['Trend Up', 'Trend Down', 'Risk Recovery'],
    holding_period: '2-8D',
    risk_tags: ['late-trend'],
    compute: (f) => {
      const up = f.trend.ma10 > f.trend.ma20 && f.trend.ma20 > f.trend.ma60;
      const down = f.trend.ma10 < f.trend.ma20 && f.trend.ma20 < f.trend.ma60;
      if (up) return 0.9;
      if (down) return -0.9;
      return 0;
    }
  },
  {
    id: 'ALP-T03',
    name: '20D Breakout State',
    family: 'Trend',
    short_description: 'Detect fresh breakouts and failed breakdowns.',
    inputs: ['close', 'high_20d', 'low_20d'],
    regimes: ['Trend Up', 'Trend Down'],
    holding_period: '1-5D',
    risk_tags: ['false-breakout'],
    compute: (f) => {
      if (f.trend.breakout === 'UP') return 0.85;
      if (f.trend.breakout === 'DOWN') return -0.85;
      return 0;
    }
  },
  {
    id: 'ALP-T04',
    name: 'Sector Relative Strength',
    family: 'Trend',
    short_description: 'Prefer names ranked high in both cross-section and sector bucket.',
    inputs: ['cross_rank', 'industry_rank'],
    regimes: ['Trend Up', 'Risk Recovery'],
    holding_period: '3-12D',
    risk_tags: ['sector-reversal'],
    compute: (f) => clamp((f.cross.rank - 0.5) * 1.6 + (f.cross.industryRank - 0.5) * 1.2, -1, 1)
  },
  {
    id: 'ALP-M01',
    name: 'RSI Reversion',
    family: 'Mean Reversion',
    short_description: 'Oversold rebound / overbought fade component.',
    inputs: ['rsi14'],
    regimes: ['Range / Choppy', 'High Volatility Risk'],
    holding_period: '1-4D',
    risk_tags: ['knife-catching'],
    compute: (f) => {
      if (f.meanReversion.rsi14 <= 30) return 0.75;
      if (f.meanReversion.rsi14 >= 70) return -0.75;
      return 0;
    }
  },
  {
    id: 'ALP-M02',
    name: 'Short Z-Score Reversion',
    family: 'Mean Reversion',
    short_description: 'Fade stretched short-term z-score moves.',
    inputs: ['zscore_10'],
    regimes: ['Range / Choppy', 'High Volatility Risk', 'Risk Recovery'],
    holding_period: '1-3D',
    risk_tags: ['momentum-crash'],
    compute: (f) => clamp(-f.meanReversion.zScore10 / 2.6, -1, 1)
  },
  {
    id: 'ALP-M03',
    name: 'VWAP Deviation Mean Revert',
    family: 'Mean Reversion',
    short_description: 'Fade excessive distance from rolling VWAP anchor.',
    inputs: ['vwap_dev'],
    regimes: ['Range / Choppy', 'High Volatility Risk'],
    holding_period: '1-2D',
    risk_tags: ['trend-day-loss'],
    compute: (f) => clamp(-f.meanReversion.vwapDev * 14, -1, 1)
  },
  {
    id: 'ALP-V01',
    name: 'Volume Expansion With Direction',
    family: 'Volume/Price',
    short_description: 'Follow moves backed by significant volume expansion.',
    inputs: ['volume_adv', 'ret_5d'],
    regimes: ['Trend Up', 'Trend Down', 'Risk Recovery'],
    holding_period: '1-6D',
    risk_tags: ['event-spike'],
    compute: (f) => {
      const amp = clamp((f.volume.volumeAdv - 1) * 1.25, -1, 1);
      const direction = f.trend.ret5 >= 0 ? 1 : -1;
      return round(amp * direction, 4);
    }
  },
  {
    id: 'ALP-V02',
    name: 'Quiet Pullback Quality',
    family: 'Volume/Price',
    short_description: 'Buy pullback when medium trend is positive and pullback is quiet.',
    inputs: ['ret_20d', 'ret_5d', 'volume_adv'],
    regimes: ['Trend Up', 'Risk Recovery'],
    holding_period: '2-7D',
    risk_tags: ['failed-dip'],
    compute: (f) => {
      if (f.trend.ret20 > 0 && f.trend.ret5 < 0 && f.volume.volumeAdv < 1) return 0.62;
      return 0;
    }
  },
  {
    id: 'ALP-V03',
    name: 'Turnover Shock Follow-through',
    family: 'Volume/Price',
    short_description: 'Track abnormal turnover events for continuation/fade context.',
    inputs: ['turnover_shock', 'ret_1d'],
    regimes: ['Trend Up', 'Trend Down', 'Range / Choppy'],
    holding_period: '1-3D',
    risk_tags: ['headline-risk'],
    compute: (f) => {
      if (f.volume.turnoverShock < 1.2) return 0;
      return f.trend.ret1 >= 0 ? 0.55 : -0.55;
    }
  },
  {
    id: 'ALP-S01',
    name: 'Regime Trend Bias',
    family: 'Market State',
    short_description: 'Map regime to directional prior.',
    inputs: ['regime_tag', 'index_trend'],
    regimes: ['ALL'],
    holding_period: 'N/A',
    risk_tags: ['regime-shift'],
    compute: (_f, m) => {
      if (m.regime.tag === 'Trend Up') return 0.45;
      if (m.regime.tag === 'Trend Down') return -0.45;
      if (m.regime.tag === 'Risk Recovery') return 0.2;
      return 0;
    }
  },
  {
    id: 'ALP-S02',
    name: 'Breadth Confirmation',
    family: 'Market State',
    short_description: 'Use breadth to support/discount directional bets.',
    inputs: ['breadth'],
    regimes: ['ALL'],
    holding_period: 'N/A',
    risk_tags: ['breadth-fade'],
    compute: (_f, m) => clamp((m.breadth.ratio - 0.5) * 1.4, -1, 1)
  },
  {
    id: 'ALP-S03',
    name: 'Style Rotation Fit',
    family: 'Market State',
    short_description: 'Reward names matching current style leadership.',
    inputs: ['style_preference', 'sector'],
    regimes: ['ALL'],
    holding_period: '2-10D',
    risk_tags: ['style-reversal'],
    compute: (f, m) => {
      if (m.style.preference === 'Growth' && f.meta.sector === 'Technology') return 0.45;
      if (m.style.preference === 'Defensive' && ['Energy', 'Financials'].includes(f.meta.sector)) return 0.35;
      if (m.style.preference === 'Balanced') return 0.12;
      return -0.18;
    }
  },
  {
    id: 'ALP-R01',
    name: 'Liquidity Filter',
    family: 'Risk Filter',
    short_description: 'Penalize low ADV names.',
    inputs: ['adv_20'],
    regimes: ['ALL'],
    holding_period: 'N/A',
    risk_tags: ['liquidity'],
    compute: (f) => (f.riskFlags.lowLiquidity ? -1 : 0.25)
  },
  {
    id: 'ALP-R02',
    name: 'Volatility Cap',
    family: 'Risk Filter',
    short_description: 'Penalize symbols with unstable realized volatility.',
    inputs: ['hv20', 'downside_vol'],
    regimes: ['ALL'],
    holding_period: 'N/A',
    risk_tags: ['volatility'],
    compute: (f) => clamp(0.22 - f.volatility.hv20 * 0.9, -1, 1)
  },
  {
    id: 'ALP-R03',
    name: 'Gap Chase Guard',
    family: 'Risk Filter',
    short_description: 'Avoid chasing oversized opening gaps.',
    inputs: ['gap_pct'],
    regimes: ['ALL'],
    holding_period: 'N/A',
    risk_tags: ['execution'],
    compute: (f) => (Math.abs(f.execution.gapPct) > 0.028 ? -0.9 : 0.18)
  }
];

const FAMILY_WEIGHTS = {
  Trend: 1.15,
  'Mean Reversion': 0.95,
  'Volume/Price': 1,
  'Market State': 0.9,
  'Risk Filter': 1.2
};

export function getAlphaDefinitions() {
  return ALPHA_LIBRARY.map((item) => ({
    id: item.id,
    name: item.name,
    family: item.family,
    description: item.short_description,
    inputs: item.inputs,
    regime_fit: item.regimes,
    expected_holding_period: item.holding_period,
    risk_tags: item.risk_tags
  }));
}

export function getDefaultStrategyConfig() {
  return { ...DEFAULT_STRATEGY_CONFIG, family_weights: { ...DEFAULT_STRATEGY_CONFIG.family_weights } };
}

const DEFAULT_STRATEGY_CONFIG = {
  id: 'champion',
  version: 'model-v1.0.0',
  label: 'Champion',
  family_weights: FAMILY_WEIGHTS,
  score_bias: 0,
  risk_penalty_multiplier: 1,
  directional_threshold: 0.025,
  allow_c_in_high_vol: false,
  high_vol_weight_multiplier: 0.62,
  recovery_weight_multiplier: 0.86,
  max_holdings_multiplier: 1,
  max_single_weight_multiplier: 1,
  sector_cap_multiplier: 1,
  gross_exposure_multiplier: 1,
  safety_sensitivity: 1
};

function resolveStrategyConfig(strategyConfig = {}) {
  return {
    ...DEFAULT_STRATEGY_CONFIG,
    ...strategyConfig,
    family_weights: {
      ...FAMILY_WEIGHTS,
      ...(strategyConfig.family_weights || {})
    }
  };
}

function calcAtrPercent(bars, period = 14) {
  if (!bars?.length || bars.length < period + 1) return 0.01;
  const rows = bars.slice(-(period + 1));
  const tr = [];
  for (let i = 1; i < rows.length; i += 1) {
    const prevClose = rows[i - 1].close;
    const row = rows[i];
    const range1 = row.high - row.low;
    const range2 = Math.abs(row.high - prevClose);
    const range3 = Math.abs(row.low - prevClose);
    tr.push(Math.max(range1, range2, range3));
  }
  const atr = mean(tr);
  const latest = rows[rows.length - 1].close || 1;
  return atr / latest;
}

function calcBreakout(closes) {
  if (!closes?.length) return 'NONE';
  const latest = closes[closes.length - 1];
  const highs = closes.slice(-21, -1);
  const low = Math.min(...highs);
  const high = Math.max(...highs);
  if (latest > high) return 'UP';
  if (latest < low) return 'DOWN';
  return 'NONE';
}

function computeFeatureLayer(dataLayer) {
  const featuresByTicker = {};

  for (const instrument of dataLayer.instruments) {
    const bars = instrument.bars || [];
    const closes = bars.map((row) => row.close);
    const volumes = bars.map((row) => row.volume);
    const vwaps = bars.map((row) => row.vwap);
    const returns = returnsFromPrices(closes);

    const ma5 = simpleMovingAverage(closes, 5);
    const ma10 = simpleMovingAverage(closes, 10);
    const ma20 = simpleMovingAverage(closes, 20);
    const ma60 = simpleMovingAverage(closes, 60);
    const latestClose = closes.at(-1) ?? 0;
    const latestVwap = vwaps.at(-1) ?? latestClose;
    const latestVolume = volumes.at(-1) ?? 0;
    const adv20 = simpleMovingAverage(volumes, 20);
    const ret5 = pctChange(closes.at(-6) ?? closes[0], latestClose);
    const ret10 = pctChange(closes.at(-11) ?? closes[0], latestClose);
    const ret20 = pctChange(closes.at(-21) ?? closes[0], latestClose);
    const ret60 = pctChange(closes.at(-61) ?? closes[0], latestClose);
    const ret1 = returns.at(-1) ?? 0;
    const gapPct = pctChange(bars.at(-2)?.close ?? latestClose, bars.at(-1)?.open ?? latestClose);

    const hv20 = annualizedVolatility(returns.slice(-20), instrument.market === 'CRYPTO' ? 365 : 252);
    const downside20 = annualizedVolatility(
      returns.slice(-20).map((value) => (value < 0 ? value : 0)),
      instrument.market === 'CRYPTO' ? 365 : 252
    );

    const turnoverCurrent = latestVolume * latestClose;
    const turnoverAvg = adv20 * latestClose;
    const turnoverShock = turnoverAvg > 0 ? turnoverCurrent / turnoverAvg : 1;

    const meta = {
      ticker: instrument.ticker,
      name: instrument.name,
      market: instrument.market,
      assetClass: instrument.asset_class,
      sector: instrument.sector,
      industry: instrument.industry,
      marketCap: instrument.market_cap,
      adv20
    };

    featuresByTicker[instrument.ticker] = {
      meta,
      bars,
      trend: {
        ret1,
        ret5,
        ret10,
        ret20,
        ret60,
        ma5,
        ma10,
        ma20,
        ma60,
        maDev20: ma20 ? pctChange(ma20, latestClose) : 0,
        maDev60: ma60 ? pctChange(ma60, latestClose) : 0,
        breakout: calcBreakout(closes)
      },
      meanReversion: {
        zScore10: rollingZScore(closes, 10),
        rsi14: computeRsi(closes, 14),
        vwapDev: latestVwap ? pctChange(latestVwap, latestClose) : 0
      },
      volume: {
        volumeAdv: adv20 ? latestVolume / adv20 : 1,
        turnoverShock: round(turnoverShock, 4),
        latestVolume,
        adv20
      },
      volatility: {
        atrPct14: calcAtrPercent(bars, 14),
        hv20,
        downside20
      },
      execution: {
        gapPct
      },
      riskFlags: {
        lowLiquidity: adv20 * latestClose < 500000000,
        highGap: Math.abs(gapPct) > 0.028,
        highVol: hv20 > 0.52
      },
      cross: {
        rank: 0,
        industryRank: 0
      }
    };
  }

  const ret20Rank = rankMap(
    Object.fromEntries(
      Object.entries(featuresByTicker).map(([ticker, feature]) => [ticker, feature.trend.ret20])
    )
  );

  const byIndustry = {};
  for (const feature of Object.values(featuresByTicker)) {
    const key = feature.meta.industry;
    if (!byIndustry[key]) byIndustry[key] = [];
    byIndustry[key].push(feature);
  }

  const industryRankMap = {};
  for (const group of Object.values(byIndustry)) {
    const groupRank = rankMap(
      Object.fromEntries(group.map((feature) => [feature.meta.ticker, feature.trend.ret20]))
    );
    Object.assign(industryRankMap, groupRank);
  }

  for (const [ticker, feature] of Object.entries(featuresByTicker)) {
    feature.cross.rank = ret20Rank[ticker] ?? 0;
    feature.cross.industryRank = industryRankMap[ticker] ?? feature.cross.rank;
  }

  return {
    source_type: 'derived_features',
    by_ticker: featuresByTicker
  };
}

function computeMarketState(dataLayer, featureLayer) {
  const spy = featureLayer.by_ticker.SPY;
  const qqq = featureLayer.by_ticker.QQQ;
  const xlf = featureLayer.by_ticker.XLF;

  const tradableUs = Object.values(featureLayer.by_ticker).filter((item) => item.meta.market === 'US');
  const breadthRatio =
    tradableUs.filter((item) => (item.bars.at(-1)?.close ?? 0) > item.trend.ma20).length /
    Math.max(tradableUs.length, 1);

  const indexTrendStrength = clamp(
    0.5 + (spy.trend.maDev20 * 5 + spy.trend.maDev60 * 4 + spy.trend.ret20 * 2),
    0,
    1
  );

  const volStress = clamp(spy.volatility.hv20 / 0.32, 0, 1.4);
  const styleSpread = (qqq?.trend.ret20 ?? 0) - (xlf?.trend.ret20 ?? 0);
  const stylePreference =
    styleSpread > 0.03 ? 'Growth' : styleSpread < -0.02 ? 'Defensive' : 'Balanced';

  const riskAppetite = clamp(indexTrendStrength * 0.42 + breadthRatio * 0.38 + (1 - volStress) * 0.2, 0, 1);

  let regimeTag = 'Range / Choppy';
  if (volStress > 1 || breadthRatio < 0.4) {
    regimeTag = 'High Volatility Risk';
  } else if (indexTrendStrength >= 0.68 && breadthRatio >= 0.56 && riskAppetite >= 0.58) {
    regimeTag = 'Trend Up';
  } else if (indexTrendStrength <= 0.4 && breadthRatio <= 0.44) {
    regimeTag = 'Trend Down';
  } else if (indexTrendStrength > 0.48 && indexTrendStrength < 0.64 && riskAppetite >= 0.52 && volStress < 0.9) {
    regimeTag = 'Risk Recovery';
  }

  const regime = REGIME_TAXONOMY.find((item) => item.tag === regimeTag) || REGIME_TAXONOMY[2];

  const sectorMap = {};
  for (const feature of tradableUs) {
    const key = feature.meta.sector;
    if (!sectorMap[key]) sectorMap[key] = [];
    sectorMap[key].push(feature.trend.ret20);
  }

  const sectorLeadership = Object.entries(sectorMap)
    .map(([sector, values]) => ({
      sector,
      score: round(mean(values), 4)
    }))
    .sort((a, b) => b.score - a.score);

  const riskOn = riskAppetite >= 0.56 && regimeTag !== 'High Volatility Risk';

  return {
    source_type: 'derived_market_state',
    regime,
    breadth: {
      ratio: round(breadthRatio, 4),
      label: breadthRatio >= 0.58 ? 'Strong' : breadthRatio <= 0.42 ? 'Weak' : 'Balanced'
    },
    indexTrend: {
      strength: round(indexTrendStrength, 4),
      label: indexTrendStrength >= 0.65 ? 'Uptrend' : indexTrendStrength <= 0.42 ? 'Downtrend' : 'Flat'
    },
    volatility: {
      stress: round(volStress, 4),
      hv20: round(spy.volatility.hv20, 4),
      label: volStress > 1 ? 'High' : volStress < 0.7 ? 'Calm' : 'Normal'
    },
    style: {
      spread: round(styleSpread, 4),
      preference: stylePreference
    },
    riskAppetite: {
      score: round(riskAppetite, 4),
      state: riskOn ? 'Risk-On' : 'Risk-Off'
    },
    sectorLeadership
  };
}

function scoreAlphaForTicker(feature, marketState) {
  return ALPHA_LIBRARY.map((alpha) => {
    const active = alpha.regimes.includes('ALL') || alpha.regimes.includes(marketState.regime.tag);
    const score = active ? clamp(alpha.compute(feature, marketState), -1, 1) : 0;
    return {
      id: alpha.id,
      name: alpha.name,
      family: alpha.family,
      short_description: alpha.short_description,
      inputs: alpha.inputs,
      regimes: alpha.regimes,
      holding_period: alpha.holding_period,
      risk_tags: alpha.risk_tags,
      active,
      score: round(score, 4)
    };
  });
}

function buildAlphaLayer(featureLayer, marketState) {
  const byTicker = {};

  for (const [ticker, feature] of Object.entries(featureLayer.by_ticker)) {
    byTicker[ticker] = scoreAlphaForTicker(feature, marketState);
  }

  return {
    source_type: 'simulated_signals',
    library: ALPHA_LIBRARY.map((alpha) => ({
      id: alpha.id,
      name: alpha.name,
      family: alpha.family,
      short_description: alpha.short_description,
      inputs: alpha.inputs,
      applicable_market_regime: alpha.regimes,
      expected_holding_period: alpha.holding_period,
      risk_tags: alpha.risk_tags,
      active: true
    })),
    by_ticker: byTicker
  };
}

function runModelLayer(featureLayer, alphaLayer, marketState, strategyConfig) {
  const config = resolveStrategyConfig(strategyConfig);
  const rows = [];
  const tickers = Object.keys(featureLayer.by_ticker);

  for (const ticker of tickers) {
    const feature = featureLayer.by_ticker[ticker];
    const alphaRows = alphaLayer.by_ticker[ticker] || [];

    const weighted = alphaRows.reduce(
      (acc, alpha) => {
        const weight = config.family_weights[alpha.family] || 1;
        return {
          weightedScore: acc.weightedScore + alpha.score * weight,
          weightSum: acc.weightSum + weight,
          positives: acc.positives + (alpha.score > 0.16 ? 1 : 0),
          negatives: acc.negatives + (alpha.score < -0.16 ? 1 : 0),
          active: acc.active + (alpha.active ? 1 : 0)
        };
      },
      { weightedScore: 0, weightSum: 0, positives: 0, negatives: 0, active: 0 }
    );

    const directionalBias = weighted.weightSum ? weighted.weightedScore / weighted.weightSum : 0;
    const liquidityPenalty = feature.riskFlags.lowLiquidity ? 15 : 0;
    const volPenalty = clamp((feature.volatility.hv20 - 0.25) * 60 * config.risk_penalty_multiplier, 0, 18 * config.risk_penalty_multiplier);
    const gapPenalty = feature.riskFlags.highGap ? 7 : 0;
    const base = 60 + config.score_bias + directionalBias * 38 + (feature.cross.rank - 0.5) * 14;

    const opportunityScore = clamp(base - liquidityPenalty - volPenalty - gapPenalty, 1, 99);
    const confidence = clamp(
      40 + weighted.positives * 5 - weighted.negatives * 3 + feature.cross.rank * 22 - volPenalty * 0.5,
      8,
      97
    );

    const regimeFit = clamp(
      0.45 + (marketState.regime.tag === 'Trend Up' ? feature.trend.maDev20 * 2.6 : 0) + (marketState.regime.tag === 'Range / Choppy' ? -Math.abs(feature.trend.ret5) * 1.2 : 0) + feature.cross.industryRank * 0.35,
      0.05,
      0.99
    );

    const riskScore = clamp(
      25 + feature.volatility.hv20 * 55 + feature.volatility.downside20 * 24 + (feature.riskFlags.lowLiquidity ? 12 : 0) + (feature.riskFlags.highGap ? 10 : 0) - feature.cross.rank * 11,
      8,
      97
    );

    const directionalSignal = directionalBias + feature.trend.ret20 * 0.35 - feature.meanReversion.zScore10 * 0.08;
    const suggestedAction =
      feature.riskFlags.lowLiquidity
        ? 'AVOID'
        : directionalSignal >= config.directional_threshold
          ? 'LONG'
          : directionalSignal <= -config.directional_threshold
            ? 'SHORT'
            : 'AVOID';

    rows.push({
      ticker,
      name: feature.meta.name,
      market: feature.meta.market,
      asset_class: feature.meta.assetClass,
      sector: feature.meta.sector,
      industry: feature.meta.industry,
      opportunity_score: round(opportunityScore, 2),
      confidence: round(confidence, 2),
      regime_tag: marketState.regime.tag,
      risk_score: round(riskScore, 2),
      regime_fit: round(regimeFit, 4),
      direction_bias: round(directionalBias, 4),
      directional_signal: round(directionalSignal, 4),
      suggested_action: suggestedAction,
      alpha_snapshot: alphaRows,
      filter_reasons: [
        ...(feature.riskFlags.lowLiquidity ? ['Liquidity below threshold'] : []),
        ...(feature.riskFlags.highGap ? ['Open gap too large for immediate chase'] : []),
        ...(riskScore > 70 ? ['Risk score above tolerance'] : []),
        ...(suggestedAction === 'AVOID' ? ['Directional edge not clear'] : [])
      ]
    });
  }

  const ranked = [...rows].sort(
    (a, b) => b.opportunity_score - a.opportunity_score || b.confidence - a.confidence
  );

  ranked.forEach((row, index) => {
    row.rank_order = index + 1;
  });

  return {
    source_type: 'deterministic_model_output',
    regime_model: {
      tag: marketState.regime.tag,
      description: marketState.regime.description,
      confidence: round(marketState.riskAppetite.score * 0.55 + marketState.indexTrend.strength * 0.45, 3)
    },
    ranking: ranked
  };
}

function gradeOpportunity(row) {
  if (
    row.opportunity_score >= 72 &&
    row.confidence >= 66 &&
    row.risk_score <= 48 &&
    row.regime_fit >= 0.52
  ) {
    return 'A';
  }
  if (
    row.opportunity_score >= 62 &&
    row.confidence >= 54 &&
    row.risk_score <= 64 &&
    row.regime_fit >= 0.42
  ) {
    return 'B';
  }
  if (row.opportunity_score >= 54 && row.confidence >= 46 && row.risk_score <= 76) {
    return 'C';
  }
  return 'D';
}

function buildEntryPlan(feature, direction, confidence) {
  const close = feature.bars.at(-1)?.close ?? 0;
  const atrPct = clamp(feature.volatility.atrPct14, 0.004, 0.08);
  const spread = close * atrPct * 0.65;

  const entryLow = direction === 'LONG' ? close - spread : close - spread * 0.4;
  const entryHigh = direction === 'LONG' ? close + spread * 0.4 : close + spread;
  const stop = direction === 'LONG' ? entryLow * (1 - atrPct * 1.25) : entryHigh * (1 + atrPct * 1.25);
  const riskUnit = Math.abs((entryLow + entryHigh) / 2 - stop);
  const tp1 = direction === 'LONG' ? entryHigh + riskUnit * 1.45 : entryLow - riskUnit * 1.45;
  const tp2 = direction === 'LONG' ? entryHigh + riskUnit * 2.25 : entryLow - riskUnit * 2.25;

  return {
    entry_zone: {
      low: round(entryLow, 4),
      high: round(entryHigh, 4),
      method: 'LIMIT_RETEST',
      notes: confidence >= 75 ? 'High-confidence setup, allow single-pass entry.' : 'Require retest before fill.'
    },
    stop_loss: {
      type: 'ATR_BUFFER',
      price: round(stop, 4)
    },
    take_profit_levels: [
      {
        price: round(tp1, 4),
        size_pct: 60,
        rationale: 'Scale out first tranche at ~1.5R.'
      },
      {
        price: round(tp2, 4),
        size_pct: 40,
        rationale: 'Hold runner for continuation extension.'
      }
    ]
  };
}

function buildPortfolioLayer(modelLayer, featureLayer, marketState, profile, strategyConfig) {
  const config = resolveStrategyConfig(strategyConfig);
  const constraints = {
    max_holdings: Math.max(1, Math.round(profile.maxHoldings * config.max_holdings_multiplier)),
    max_single_weight_pct: round(profile.maxSingleWeightPct * config.max_single_weight_multiplier, 2),
    sector_exposure_limit_pct: round(profile.sectorExposureLimitPct * config.sector_cap_multiplier, 2)
  };

  const grossBaseByRegime = {
    'Trend Up': 66,
    'Trend Down': 38,
    'Range / Choppy': 46,
    'High Volatility Risk': 26,
    'Risk Recovery': 54
  };

  const netBaseByRegime = {
    'Trend Up': 26,
    'Trend Down': -12,
    'Range / Choppy': 4,
    'High Volatility Risk': 0,
    'Risk Recovery': 18
  };

  const suggestedGross = Math.min(
    profile.exposureCapPct,
    (grossBaseByRegime[marketState.regime.tag] ?? 45) * config.gross_exposure_multiplier
  );
  const suggestedNet = netBaseByRegime[marketState.regime.tag] ?? 0;

  const selected = [];
  const filtered = [];
  const sectorExposure = {};

  for (const row of modelLayer.ranking) {
    const grade = gradeOpportunity(row);
    const feature = featureLayer.by_ticker[row.ticker];

    if (row.market !== 'US' && row.market !== 'CRYPTO') continue;

    if (row.suggested_action === 'AVOID' || grade === 'D') {
      filtered.push({
        ticker: row.ticker,
        reason: row.filter_reasons[0] || 'Model action: avoid',
        score: row.opportunity_score,
        confidence: row.confidence,
        grade
      });
      continue;
    }

    if (selected.length >= constraints.max_holdings) {
      filtered.push({
        ticker: row.ticker,
        reason: 'Max holding count reached',
        score: row.opportunity_score,
        confidence: row.confidence,
        grade
      });
      continue;
    }

    if (marketState.regime.tag === 'Trend Down' && grade === 'C') {
      filtered.push({
        ticker: row.ticker,
        reason: 'Current regime only allows A/B-quality setups',
        score: row.opportunity_score,
        confidence: row.confidence,
        grade
      });
      continue;
    }

    if (
      !config.allow_c_in_high_vol &&
      marketState.regime.tag === 'High Volatility Risk' &&
      grade === 'C' &&
      (row.opportunity_score < 58 || row.risk_score > 60)
    ) {
      filtered.push({
        ticker: row.ticker,
        reason: 'Current regime only allows A/B-quality setups',
        score: row.opportunity_score,
        confidence: row.confidence,
        grade
      });
      continue;
    }

    const sector = row.sector;
    const currentSectorExposure = sectorExposure[sector] || 0;

    let weight =
      row.opportunity_score >= 80
        ? 13
        : row.opportunity_score >= 72
          ? 10.5
          : row.opportunity_score >= 64
            ? 8.2
            : 6.2;
    if (grade === 'A') weight += 1.2;
    if (marketState.regime.tag === 'High Volatility Risk') weight *= config.high_vol_weight_multiplier;
    if (marketState.regime.tag === 'Risk Recovery') weight *= config.recovery_weight_multiplier;

    weight = Math.min(weight, constraints.max_single_weight_pct);

    if (currentSectorExposure + weight > constraints.sector_exposure_limit_pct) {
      filtered.push({
        ticker: row.ticker,
        reason: `Sector exposure cap reached (${sector})`,
        score: row.opportunity_score,
        confidence: row.confidence,
        grade
      });
      continue;
    }

    sectorExposure[sector] = currentSectorExposure + weight;

    const entryPlan = buildEntryPlan(feature, row.suggested_action, row.confidence);
    const topAlpha = [...row.alpha_snapshot]
      .filter((item) => item.active)
      .sort((a, b) => Math.abs(b.score) - Math.abs(a.score))
      .slice(0, 3)
      .map((item) => item.name);

    selected.push({
      ticker: row.ticker,
      name: row.name,
      sector: row.sector,
      market: row.market,
      asset_class: row.asset_class,
      direction: row.suggested_action,
      grade,
      target_weight_pct: round(weight, 2),
      confidence: row.confidence,
      score: row.opportunity_score,
      risk_score: row.risk_score,
      regime_fit: row.regime_fit,
      rank_order: row.rank_order,
      entry_logic: `${row.suggested_action === 'LONG' ? 'Buy' : 'Short'} near ${entryPlan.entry_zone.low} - ${entryPlan.entry_zone.high} with ATR-buffer stop.`,
      reason_summary: topAlpha.join(' + '),
      entry_plan: entryPlan
    });
  }

  const grossBeforeScale = sum(selected.map((item) => item.target_weight_pct));
  const scale = grossBeforeScale > suggestedGross ? suggestedGross / grossBeforeScale : 1;

  const scaled = selected.map((item) => ({
    ...item,
    target_weight_pct: round(item.target_weight_pct * scale, 2)
  }));

  const grossExposure = round(sum(scaled.map((item) => item.target_weight_pct)), 2);
  const netExposure = round(
    sum(
      scaled.map((item) =>
        item.direction === 'LONG' ? item.target_weight_pct : -item.target_weight_pct
      )
    ),
    2
  );

  return {
    source_type: 'portfolio_construction',
    constraints,
    suggested_gross_exposure_pct: suggestedGross,
    suggested_net_exposure_pct: suggestedNet,
    gross_exposure_pct: grossExposure,
    net_exposure_pct: netExposure,
    long_count: scaled.filter((item) => item.direction === 'LONG').length,
    short_count: scaled.filter((item) => item.direction === 'SHORT').length,
    candidates: scaled,
    filtered_out: filtered.sort((a, b) => b.score - a.score).slice(0, 14),
    sector_exposure_pct: Object.fromEntries(
      Object.entries(sectorExposure).map(([sector, value]) => [sector, round(value * scale, 2)])
    )
  };
}

function buildSafetyLayer(marketState, portfolio, modelLayer, profile, strategyConfig) {
  const config = resolveStrategyConfig(strategyConfig);
  const marketRisk = clamp(
    (marketState.volatility.stress * 45 + (1 - marketState.breadth.ratio) * 35 + (1 - marketState.indexTrend.strength) * 20) *
      config.safety_sensitivity,
    8,
    95
  );

  const concentration = Math.max(...Object.values(portfolio.sector_exposure_pct || { none: 0 }));
  const portfolioRisk = clamp(
    (portfolio.gross_exposure_pct / Math.max(profile.exposureCapPct, 1)) * 38 +
      (concentration / Math.max(profile.sectorExposureLimitPct, 1)) * 28 +
      Math.abs(portfolio.net_exposure_pct) * 0.4,
    6,
    95
  );

  const tradable = modelLayer.ranking.filter((item) => item.suggested_action !== 'AVOID');
  const instrumentRisk = clamp(mean(tradable.slice(0, 6).map((item) => item.risk_score || 50)), 10, 95);

  const safetyScore = clamp(100 - marketRisk * 0.42 - portfolioRisk * 0.34 - instrumentRisk * 0.24, 4, 96);

  let mode = 'normal risk';
  if (safetyScore <= 32) mode = 'do not trade';
  else if (safetyScore <= 55) mode = 'trade light';
  else if (safetyScore >= 82) mode = 'aggressive risk';

  const primaryRisks = [];
  if (marketState.volatility.label === 'High') primaryRisks.push('Benchmark volatility remains elevated.');
  if (marketState.breadth.ratio < 0.45) primaryRisks.push('Market breadth is weak and signal dispersion is high.');
  if (concentration > profile.sectorExposureLimitPct * 0.8) primaryRisks.push('Sector concentration is close to cap.');
  if (portfolio.filtered_out.some((item) => item.reason.includes('regime'))) {
    primaryRisks.push('Regime gate is filtering lower-quality setups.');
  }
  if (!primaryRisks.length) {
    primaryRisks.push('No hard risk breach, but execution discipline still required.');
  }

  const marketCard = {
    title: 'Market Level',
    score: round(100 - marketRisk, 1),
    lines: [
      `Regime: ${marketState.regime.tag}`,
      `Breadth: ${(marketState.breadth.ratio * 100).toFixed(1)}% above 20D MA`,
      `SPY HV20: ${(marketState.volatility.hv20 * 100).toFixed(1)}% annualized`
    ]
  };

  const portfolioCard = {
    title: 'Portfolio Level',
    score: round(100 - portfolioRisk, 1),
    lines: [
      `Gross exposure: ${portfolio.gross_exposure_pct.toFixed(1)}%`,
      `Net exposure: ${portfolio.net_exposure_pct.toFixed(1)}%`,
      `Top sector exposure: ${round(concentration, 1).toFixed(1)}%`
    ]
  };

  const instrumentCard = {
    title: 'Instrument Level',
    score: round(100 - instrumentRisk, 1),
    lines: modelLayer.ranking.slice(0, 3).map((row) => `${row.ticker}: risk ${row.risk_score.toFixed(1)}`)
  };

  return {
    source_type: 'risk_and_safety',
    safety_score: round(safetyScore, 1),
    mode,
    suggested_gross_exposure_pct: portfolio.suggested_gross_exposure_pct,
    suggested_net_exposure_pct: portfolio.suggested_net_exposure_pct,
    primary_risks: primaryRisks,
    cards: {
      market: marketCard,
      portfolio: portfolioCard,
      instrument: instrumentCard
    },
    conclusion:
      mode === 'do not trade'
        ? 'Pause new trades. Only manage existing positions and wait for regime stabilization.'
        : mode === 'trade light'
          ? 'Light risk mode: keep only top A/B setups and avoid aggressive averaging.'
          : mode === 'aggressive risk'
            ? 'Conditions support higher conviction sizing, but keep stop discipline.'
            : 'Normal risk mode: execute plan with standard sizing and rule compliance.',
    rules: RISK_RULES
  };
}

function makeMonthlySeries(startYear, startMonth, returns) {
  const rows = [];
  let year = startYear;
  let month = startMonth;
  for (const ret of returns) {
    const mm = String(month).padStart(2, '0');
    rows.push({
      month: `${year}-${mm}`,
      ret: round(ret, 4)
    });
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  const curve = cumulativeFromReturns(rows, 100);
  let peak = curve[0] || 100;
  const enriched = rows.map((row, index) => {
    const equity = curve[index] || 100;
    peak = Math.max(peak, equity);
    return {
      ...row,
      equity: round(equity, 4),
      drawdown: peak === 0 ? 0 : round((equity - peak) / peak, 4)
    };
  });
  return enriched;
}

function performanceStats(monthlyRows, tradeCount, avgHoldingDays) {
  const returns = monthlyRows.map((row) => row.ret);
  const winRate = returns.filter((value) => value > 0).length / Math.max(returns.length, 1);
  const totalReturn = monthlyRows.length
    ? monthlyRows.at(-1).equity / monthlyRows[0].equity - 1
    : 0;
  const maxDrawdown = maxDrawdownFromCurve(monthlyRows.map((row) => row.equity));
  const sigma = stdDev(returns) || 1e-9;
  const downside = stdDev(returns.map((value) => (value < 0 ? value : 0))) || 1e-9;

  return {
    trades: tradeCount,
    win_rate: round(winRate, 4),
    total_return: round(totalReturn, 4),
    max_drawdown: round(maxDrawdown, 4),
    sharpe: round((mean(returns) / sigma) * Math.sqrt(12), 3),
    sortino: round((mean(returns) / downside) * Math.sqrt(12), 3),
    avg_holding_days: round(avgHoldingDays, 2)
  };
}

function buildSyntheticRecentTrades(modelLayer, asOf) {
  const rows = [];
  const baseDate = new Date(asOf);
  const top = modelLayer.ranking.slice(0, 20);

  for (let i = 0; i < top.length; i += 1) {
    const row = top[i];
    const openDate = new Date(baseDate);
    openDate.setUTCDate(openDate.getUTCDate() - (i + 2));
    const closeDate = new Date(openDate);
    closeDate.setUTCDate(closeDate.getUTCDate() + ((i % 5) + 1));

    const direction = row.suggested_action === 'SHORT' ? 'SHORT' : 'LONG';
    const pnl = round((row.opportunity_score - 52) / 20 - (row.risk_score - 50) / 35 + (i % 3 === 0 ? -0.7 : 0.35), 2);

    rows.push({
      time_in: openDate.toISOString(),
      time_out: closeDate.toISOString(),
      market: row.market,
      symbol: row.ticker,
      side: direction,
      entry: round(100 + i * 1.4 + row.opportunity_score * 0.8, 3),
      exit: round(100 + i * 1.4 + row.opportunity_score * 0.8 * (1 + pnl / 100), 3),
      pnl_pct: pnl,
      fees: round(6 + Math.abs(pnl) * 1.8, 2),
      signal_id: `SIM-${row.ticker}-${i + 1}`,
      source: i < 10 ? 'PAPER' : 'BACKTEST'
    });
  }

  return rows.sort((a, b) => new Date(b.time_out) - new Date(a.time_out));
}

function buildPerformanceLayer(modelLayer, asOf) {
  const usBacktestReturns = [
    0.012, -0.008, 0.006, 0.01, 0.004, 0.013, -0.009, 0.005, 0.009, 0.007, -0.006, 0.011,
    0.004, -0.003, 0.008, 0.006, 0.01, -0.004
  ];
  const usPaperReturns = [0.006, -0.004, 0.005, 0.003, -0.002, 0.007];
  const cryptoBacktestReturns = [
    0.018, -0.021, 0.012, 0.009, -0.014, 0.019, 0.011, -0.017, 0.013, 0.008, -0.011, 0.014
  ];
  const cryptoPaperReturns = [0.01, -0.013, 0.009, -0.004, 0.006, 0.005];

  const datasets = {
    backtest: {
      id: 'backtest',
      label: 'Backtest',
      source_type: 'sample_backtest',
      data_origin_note: 'Sample stats generated from deterministic historical simulation.',
      markets: {
        US: {
          monthly: makeMonthlySeries(2024, 7, usBacktestReturns)
        },
        CRYPTO: {
          monthly: makeMonthlySeries(2025, 1, cryptoBacktestReturns)
        }
      }
    },
    paper: {
      id: 'paper',
      label: 'Simulated / Paper',
      source_type: 'simulated_paper',
      data_origin_note: 'Paper trading simulation using the same rule stack, not real-money execution.',
      markets: {
        US: {
          monthly: makeMonthlySeries(2025, 9, usPaperReturns)
        },
        CRYPTO: {
          monthly: makeMonthlySeries(2025, 9, cryptoPaperReturns)
        }
      }
    },
    live: {
      id: 'live',
      label: 'Live',
      source_type: 'live_not_available',
      data_origin_note: 'Live broker-connected track record is not available in this demo build.',
      markets: {
        US: {
          available: false,
          monthly: []
        },
        CRYPTO: {
          available: false,
          monthly: []
        }
      }
    }
  };

  for (const source of ['backtest', 'paper']) {
    for (const market of ['US', 'CRYPTO']) {
      const bucket = datasets[source].markets[market];
      const trades = source === 'backtest' ? (market === 'US' ? 212 : 248) : market === 'US' ? 37 : 52;
      const avgHolding = source === 'backtest' ? (market === 'US' ? 4.9 : 2.7) : market === 'US' ? 3.6 : 1.9;
      bucket.stats = performanceStats(bucket.monthly, trades, avgHolding);
    }
  }

  const recentTrades = buildSyntheticRecentTrades(modelLayer, asOf);

  return {
    source_type: 'performance_proof',
    last_updated: asOf,
    datasets,
    recent_trades: recentTrades,
    transparency_notes: [
      'Backtest and paper sections use sample/simulated data for product demonstration.',
      'Live section is intentionally marked as unavailable (upcoming) to avoid misleading representation.',
      'All numbers are internally consistent within this demo dataset and replaceable by real APIs later.'
    ]
  };
}

function buildInsightsLayer(featureLayer, marketState, portfolio, safetyLayer) {
  const leaders = marketState.sectorLeadership.slice(0, 3);
  const laggards = [...marketState.sectorLeadership].reverse().slice(0, 2);

  const modules = [
    {
      id: 'ins-regime',
      market: 'US',
      asset_class: 'US_STOCK',
      title: 'Current Regime',
      summary: `${marketState.regime.tag}: ${marketState.regime.description}`,
      metric: `Risk appetite ${(marketState.riskAppetite.score * 100).toFixed(1)}`
    },
    {
      id: 'ins-breadth',
      market: 'US',
      asset_class: 'US_STOCK',
      title: 'Market Breadth',
      summary: `${(marketState.breadth.ratio * 100).toFixed(1)}% of tracked US symbols are above 20D moving average.`,
      metric: marketState.breadth.label
    },
    {
      id: 'ins-style',
      market: 'US',
      asset_class: 'US_STOCK',
      title: 'Style Rotation',
      summary: `Current style preference: ${marketState.style.preference}. QQQ-XLF spread ${(marketState.style.spread * 100).toFixed(2)}%.`,
      metric: marketState.style.preference
    },
    {
      id: 'ins-vol',
      market: 'US',
      asset_class: 'US_STOCK',
      title: 'Volatility Environment',
      summary: `SPY HV20 ${(marketState.volatility.hv20 * 100).toFixed(1)}% annualized, labeled ${marketState.volatility.label}.`,
      metric: marketState.volatility.label
    },
    {
      id: 'ins-risk',
      market: 'US',
      asset_class: 'US_STOCK',
      title: 'Risk-On / Risk-Off',
      summary: `${marketState.riskAppetite.state} with safety score ${safetyLayer.safety_score.toFixed(1)}.`,
      metric: safetyLayer.mode
    }
  ];

  const whySignals = [
    `Regime is ${marketState.regime.tag}, so the model currently prioritizes ${marketState.regime.tag === 'Range / Choppy' ? 'mean-reversion and tighter risk filters' : 'trend and volume-confirmed setups'}.`,
    `Breadth at ${(marketState.breadth.ratio * 100).toFixed(1)}% influences confidence dispersion across A/B/C grades.`,
    `Top filtered reason today: ${portfolio.filtered_out[0]?.reason || 'no major filter pressure'}.`,
    `Suggested gross exposure ${portfolio.suggested_gross_exposure_pct}% reflects market volatility label ${marketState.volatility.label}.`
  ];

  return {
    source_type: 'insights_layer',
    regime: marketState.regime,
    breadth: marketState.breadth,
    leadership: {
      leaders,
      laggards
    },
    volatility: marketState.volatility,
    style: marketState.style,
    risk_on_off: marketState.riskAppetite,
    why_signals_today: whySignals,
    short_commentary:
      marketState.regime.tag === 'Trend Up'
        ? 'Leadership and breadth remain constructive. Trend alphas dominate, but avoid crowded late-day chasing.'
        : marketState.regime.tag === 'High Volatility Risk'
          ? 'Volatility stress is high; system is intentionally filtering lower-quality setups and reducing gross.'
          : 'Regime is mixed. Keep trade selection strict and rely on score + risk confirmation.',
    modules
  };
}

function buildTodayLayer(portfolio, safetyLayer, marketState) {
  const byGrade = {
    A: portfolio.candidates.filter((item) => item.grade === 'A').length,
    B: portfolio.candidates.filter((item) => item.grade === 'B').length,
    C: portfolio.candidates.filter((item) => item.grade === 'C').length
  };

  const tradeability =
    safetyLayer.mode === 'do not trade'
      ? 'Pause'
      : safetyLayer.mode === 'trade light'
        ? 'Light'
        : safetyLayer.mode === 'aggressive risk'
          ? 'Aggressive'
          : 'Normal';

  const now = new Date();
  const day = now.getUTCDay();
  const isWeekend = day === 0 || day === 6;

  return {
    source_type: 'today_plan',
    is_trading_day: !isWeekend,
    trading_day_message: isWeekend
      ? 'US market closed (weekend). Use today for review, not fresh directional execution.'
      : 'Trading day active. Follow ranked plan and risk caps.',
    tradeability,
    suggested_gross_exposure_pct: safetyLayer.suggested_gross_exposure_pct,
    suggested_net_exposure_pct: safetyLayer.suggested_net_exposure_pct,
    grade_counts: byGrade,
    total_candidates: portfolio.candidates.length,
    filtered_count: portfolio.filtered_out.length,
    style_hint:
      marketState.regime.tag === 'Range / Choppy'
        ? 'Mean-reversion + defensive trend confirmation'
        : marketState.regime.tag === 'Trend Up'
          ? 'Trend continuation with pullback entries'
          : 'Risk-first selective execution',
    why_today: [
      `Safety score is ${safetyLayer.safety_score.toFixed(1)} (${safetyLayer.mode}).`,
      `Regime classification: ${marketState.regime.tag}.`,
      `Suggested gross/net exposure: ${safetyLayer.suggested_gross_exposure_pct}% / ${safetyLayer.suggested_net_exposure_pct}%.`,
      `Filtered opportunities: ${portfolio.filtered_out.length}.`
    ],
    empty_states: {
      no_signal: 'No qualified setup after model + risk filters. Capital preservation is a valid outcome.',
      high_risk_pause: 'Risk mode is do-not-trade. New positions are paused until stress metrics normalize.',
      non_trading_day: 'Market is closed. System provides planning view only.',
      no_live: 'Live track record is not available in this demo. See backtest and paper tabs.',
      load_error: 'Data loading failed. Please retry or refresh sample dataset.'
    }
  };
}

function confidenceLevel(value) {
  if (value >= 82) return 5;
  if (value >= 72) return 4;
  if (value >= 60) return 3.5;
  if (value >= 50) return 3;
  return 2;
}

function buildSignalContracts(portfolio, featureLayer, safetyLayer, asOf) {
  const contracts = [];

  for (const [index, item] of portfolio.candidates.entries()) {
    const feature = featureLayer.by_ticker[item.ticker];
    const plan = item.entry_plan;
    const level = confidenceLevel(item.confidence);

    contracts.push({
      signal_id: `NQ-${asOf.slice(0, 10)}-${String(index + 1).padStart(3, '0')}`,
      id: `NQ-${asOf.slice(0, 10)}-${String(index + 1).padStart(3, '0')}`,
      symbol: item.ticker,
      market: item.market,
      asset_class: item.asset_class,
      strategy_id: `NOVA_${item.grade}_${item.direction}`,
      strategy_family: item.grade === 'A' ? 'High Conviction' : item.grade === 'B' ? 'Core' : 'Tactical',
      direction: item.direction,
      status: index < 2 ? 'TRIGGERED' : 'NEW',
      created_at: asOf,
      generated_at: asOf,
      expires_at: new Date(new Date(asOf).getTime() + 24 * 3600 * 1000).toISOString(),
      timeframe: item.grade === 'A' ? '1D' : '4H',
      grade: item.grade,
      score: item.score,
      confidence: round(item.confidence / 100, 4),
      confidence_level: level,
      regime_id: safetyLayer.mode.replace(' ', '_').toUpperCase(),
      regime_compatibility: round(item.regime_fit * 100, 2),
      risk_score: item.risk_score,
      entry_zone: plan.entry_zone,
      entry_min: plan.entry_zone.low,
      entry_max: plan.entry_zone.high,
      stop_loss: plan.stop_loss,
      stop_loss_value: plan.stop_loss.price,
      take_profit_levels: plan.take_profit_levels,
      take_profit: plan.take_profit_levels[0].price,
      position_advice: {
        position_pct: item.target_weight_pct,
        leverage_cap: 1,
        risk_bucket_applied: safetyLayer.mode,
        rationale: `Grade ${item.grade} candidate with ${item.confidence.toFixed(1)} confidence.`
      },
      position_size_pct: item.target_weight_pct,
      expected_metrics: {
        expected_R: round(1.1 + (item.score - 60) / 35, 3),
        hit_rate_est: round(item.confidence / 100, 4),
        sample_size: 120 + item.rank_order * 8,
        expected_max_dd_est: round(item.risk_score / 300, 4)
      },
      holding_horizon_days: item.grade === 'A' ? 5.4 : item.grade === 'B' ? 3.3 : 1.7,
      market_heat: marketStateLabelFromSafety(safetyLayer.mode),
      crowded_risk: item.risk_score >= 72 ? 'HIGH' : item.risk_score >= 52 ? 'MEDIUM' : 'LOW',
      explain_bullets: [
        `${item.ticker} ranked #${item.rank_order} with score ${item.score.toFixed(1)} and confidence ${item.confidence.toFixed(1)}.`,
        `Primary drivers: ${item.reason_summary}.`,
        `Regime fit ${(item.regime_fit * 100).toFixed(1)}% under ${safetyLayer.mode} safety mode.`
      ],
      execution_checklist: [
        `Enter via limit around ${plan.entry_zone.low} - ${plan.entry_zone.high}, avoid chasing outside zone.`,
        `Set protective stop at ${plan.stop_loss.price} immediately after fill.`,
        `Scale 60% at ${plan.take_profit_levels[0].price}, hold 40% runner to ${plan.take_profit_levels[1].price}.`,
        `Keep position near ${item.target_weight_pct.toFixed(2)}% and respect daily loss limit.`
      ],
      risk_warnings: item.risk_score > 68 ? ['risk_score_elevated'] : [],
      guardrail_recommendation: safetyLayer.mode === 'do not trade' ? 'STAY_OUT' : safetyLayer.mode === 'trade light' ? 'REDUCE' : 'TRADE_OK',
      rationale: [
        `${item.direction} bias from model with ${item.grade} grade opportunity.`,
        `Sector ${item.sector}, reason summary: ${item.reason_summary}.`
      ],
      source_type: 'simulated_signal'
    });
  }

  let filteredIndex = 0;
  for (const item of portfolio.filtered_out.slice(0, 8)) {
    filteredIndex += 1;
    contracts.push({
      signal_id: `NQ-FLT-${String(filteredIndex).padStart(3, '0')}`,
      id: `NQ-FLT-${String(filteredIndex).padStart(3, '0')}`,
      symbol: item.ticker,
      market: 'US',
      asset_class: 'US_STOCK',
      strategy_id: 'NOVA_FILTERED',
      strategy_family: 'Filtered',
      direction: 'LONG',
      status: 'INVALIDATED',
      created_at: asOf,
      generated_at: asOf,
      expires_at: asOf,
      timeframe: '1D',
      grade: item.grade,
      score: item.score,
      confidence: round(item.confidence / 100, 4),
      confidence_level: 2.5,
      regime_id: 'FILTERED',
      regime_compatibility: 0,
      risk_score: 82,
      entry_zone: {
        low: 0,
        high: 0,
        method: 'NA',
        notes: item.reason
      },
      entry_min: 0,
      entry_max: 0,
      stop_loss: {
        type: 'NA',
        price: 0
      },
      stop_loss_value: 0,
      take_profit_levels: [
        {
          price: 0,
          size_pct: 100,
          rationale: 'Filtered'
        }
      ],
      take_profit: 0,
      position_advice: {
        position_pct: 0,
        leverage_cap: 1,
        risk_bucket_applied: 'filtered',
        rationale: item.reason
      },
      position_size_pct: 0,
      expected_metrics: {
        expected_R: 0,
        hit_rate_est: 0,
        sample_size: 0,
        expected_max_dd_est: 0
      },
      holding_horizon_days: 0,
      market_heat: 'HIGH',
      crowded_risk: 'HIGH',
      explain_bullets: [item.reason],
      execution_checklist: [`Filtered out: ${item.reason}`],
      risk_warnings: ['filtered'],
      guardrail_recommendation: 'STAY_OUT',
      rationale: [item.reason],
      source_type: 'simulated_filtered'
    });
  }

  return contracts;
}

function marketStateLabelFromSafety(mode) {
  if (mode === 'do not trade') return 'HIGH';
  if (mode === 'trade light') return 'MEDIUM';
  return 'NORMAL';
}

function buildAiLayer(todayLayer, safetyLayer, insightsLayer, portfolio) {
  return {
    source_type: 'structured_retrieval_mock',
    preset_questions: [
      '为什么今天建议轻仓？',
      '为什么这只票是 A 级机会？',
      '当前更适合趋势还是均值回归？',
      '哪些风险在压制系统仓位？',
      '为什么某个 alpha 被降权？',
      '为什么当前 challenger 没晋级？',
      '为什么最近 paper 和 backtest 出现偏差？',
      '当前最主要的系统风险是什么？',
      '当前有哪些可训练数据集？',
      '各资产覆盖度如何？',
      '哪类资产数据质量更高？',
      '哪些数据仍是 sample/simulated，哪些是实时来源路径？',
      '为什么 TSLA 被过滤掉？',
      '今天的 Safety Score 怎么解读？',
      '如果只做两笔，应该优先哪两笔？',
      '当前 regime 下可以做 C 级信号吗？',
      '系统建议的总仓位和净敞口是多少？',
      '今天最该避免的交易行为是什么？',
      'Backtest 和 Paper 有什么区别？',
      '为什么 Live 是 upcoming？',
      '现在市场是 risk-on 还是 risk-off？',
      '行业领导方向如何影响今天信号？',
      '如果 safety score 再下降 10 分会怎样？'
    ],
    answer_templates: {
      light_mode: `Safety score ${safetyLayer.safety_score.toFixed(1)} and regime ${insightsLayer.regime.tag} jointly limit gross to ${todayLayer.suggested_gross_exposure_pct}%`,
      top_pair: portfolio.candidates.slice(0, 2).map((item) => item.ticker),
      risk_drivers: safetyLayer.primary_risks
    }
  };
}

function buildConfig(asOf, profileKey, safetyLayer, strategyConfig) {
  const profile = RISK_PROFILES[profileKey] || RISK_PROFILES.balanced;
  return {
    app_version: APP_VERSION,
    app_version_label: APP_VERSION_LABEL,
    build_number: APP_BUILD_NUMBER,
    team: 'Nova Quant Research',
    disclaimer:
      'Educational prototype. Contains sample and simulated outputs, not live trading advice or broker-connected execution.',
    risk_profile: profileKey,
    risk_rules: {
      per_trade_risk_pct: profile.perTradeRiskPct,
      daily_loss_pct: profile.dailyLossPct,
      max_dd_pct: profile.maxDrawdownPct,
      exposure_cap_pct: profile.exposureCapPct,
      leverage_cap: profile.leverageCap,
      vol_switch: true
    },
    risk_status: {
      trading_on: safetyLayer.mode !== 'do not trade',
      current_level: safetyLayer.mode === 'aggressive risk' ? 'LOW' : safetyLayer.mode === 'normal risk' ? 'MEDIUM' : 'HIGH',
      current_risk_bucket: safetyLayer.mode.replace(' ', '_').toUpperCase(),
      bucket_state: safetyLayer.mode.replace(' ', '_').toUpperCase(),
      diagnostics: {
        daily_pnl_pct: -0.42,
        max_dd_pct: 3.8
      },
      last_event: `${asOf}: ${safetyLayer.mode}`,
      last_event_en: `${asOf}: ${safetyLayer.mode}`,
      last_event_zh: `${asOf}：${safetyLayer.mode}`
    },
    last_updated: asOf,
    calc_meta: {
      pipeline_version: PIPELINE_VERSION,
      dataset_version: 'sample-deterministic-2026-03-v1',
      strategy_id: strategyConfig?.id || 'champion',
      strategy_version: strategyConfig?.version || 'model-v1.0.0'
    },
    data_source_flags: {
      market_data: 'sample',
      features: 'derived',
      signals: 'simulated',
      performance_backtest: 'sample',
      performance_paper: 'simulated',
      performance_live: 'none'
    }
  };
}

export function buildNovaQuantSystem({
  asOf = new Date().toISOString(),
  riskProfileKey = 'balanced',
  executionTrades = [],
  strategyConfig = {}
} = {}) {
  const profile = RISK_PROFILES[riskProfileKey] || RISK_PROFILES.balanced;
  const resolvedStrategyConfig = resolveStrategyConfig(strategyConfig);

  const dataLayer = buildSampleMarketData({ asOf });
  const featureLayer = computeFeatureLayer(dataLayer);
  const marketState = computeMarketState(dataLayer, featureLayer);
  const alphaLayer = buildAlphaLayer(featureLayer, marketState);
  const modelLayer = runModelLayer(featureLayer, alphaLayer, marketState, resolvedStrategyConfig);
  const portfolioLayer = buildPortfolioLayer(modelLayer, featureLayer, marketState, profile, resolvedStrategyConfig);
  const safetyLayer = buildSafetyLayer(marketState, portfolioLayer, modelLayer, profile, resolvedStrategyConfig);
  const performanceLayer = buildPerformanceLayer(modelLayer, asOf);
  const insightsLayer = buildInsightsLayer(featureLayer, marketState, portfolioLayer, safetyLayer);
  const todayLayer = buildTodayLayer(portfolioLayer, safetyLayer, marketState);
  const aiLayer = buildAiLayer(todayLayer, safetyLayer, insightsLayer, portfolioLayer);

  const signals = buildSignalContracts(portfolioLayer, featureLayer, safetyLayer, asOf);
  const trades = [...executionTrades, ...performanceLayer.recent_trades]
    .sort((a, b) => new Date(b.time_out || b.created_at || 0) - new Date(a.time_out || a.created_at || 0))
    .slice(0, 80);

  const config = buildConfig(asOf, riskProfileKey, safetyLayer, resolvedStrategyConfig);

  const records = ['backtest', 'paper']
    .flatMap((bucket) =>
      ['US', 'CRYPTO'].map((market) => ({
        market,
        range: bucket === 'backtest' ? 'ALL' : '3M',
        kpis: {
          win_rate: performanceLayer.datasets[bucket].markets[market].stats.win_rate,
          avg_rr: round(1.05 + performanceLayer.datasets[bucket].markets[market].stats.win_rate * 0.7, 4),
          max_dd: performanceLayer.datasets[bucket].markets[market].stats.max_drawdown,
          total_return: performanceLayer.datasets[bucket].markets[market].stats.total_return,
          sharpe: performanceLayer.datasets[bucket].markets[market].stats.sharpe,
          sortino: performanceLayer.datasets[bucket].markets[market].stats.sortino,
          trades: performanceLayer.datasets[bucket].markets[market].stats.trades,
          avg_holding_days: performanceLayer.datasets[bucket].markets[market].stats.avg_holding_days
        },
        assumptions: {
          fees_bps: market === 'US' ? 4 : 8,
          slippage_bps: market === 'US' ? 5 : 10,
          funding: market === 'US' ? 'excluded' : 'included',
          leverage: market === 'US' ? '1x' : '1.2x'
        },
        equity_curve: {
          dates: performanceLayer.datasets[bucket].markets[market].monthly.map((row) => row.month),
          backtest: performanceLayer.datasets.backtest.markets[market].monthly.map((row) => row.equity),
          live: performanceLayer.datasets.paper.markets[market].monthly.map((row) => row.equity)
        }
      }))
    );

  const marketModules = insightsLayer.modules;

  return {
    signals,
    trades,
    performance: {
      last_updated: asOf,
      records,
      proof: performanceLayer,
      paper_timeline: [
        {
          time: asOf,
          market: 'US',
          status: safetyLayer.mode === 'do not trade' ? 'PAUSED' : 'RUNNING',
          note_en:
            safetyLayer.mode === 'do not trade'
              ? 'Paper engine paused by safety mode.'
              : 'Paper engine running under current risk profile.',
          note_zh:
            safetyLayer.mode === 'do not trade'
              ? '模拟交易因安全模式暂停。'
              : '模拟交易在当前风险配置下运行中。'
        }
      ]
    },
    velocity: {
      current: round((marketState.indexTrend.strength - 0.5) * 2.2, 4),
      percentile: marketState.riskAppetite.score,
      acceleration: round(marketState.style.spread, 4),
      regime: marketState.riskAppetite.state === 'Risk-On' ? 'RISK_ON' : 'RISK_OFF',
      stats: {
        n_events: 148,
        next_7d_up_prob: round(0.52 + (marketState.riskAppetite.score - 0.5) * 0.22, 4),
        avg_move: round(marketState.indexTrend.strength * 0.018, 4),
        avg_dd: round(marketState.volatility.hv20 * 0.16, 4),
        tail_quantiles: {
          returns: {
            q10: -0.018,
            q50: 0.004,
            q90: 0.021
          }
        }
      },
      rule_summary_en:
        'Velocity, breadth, and volatility jointly control risk bucket and candidate ranking.',
      rule_summary_zh: '速度、广度和波动共同决定风险桶与候选排序。',
      how_used_en: [
        'Use regime first to decide whether trend or mean-reversion families dominate.',
        'Apply volatility throttle before position sizing to avoid over-allocation in stress.',
        'Only keep high-score signals when regime confidence weakens.'
      ],
      how_used_zh: [
        '先判定状态，再决定趋势或均值回归策略权重。',
        '先做波动降仓，再做仓位分配，避免压力期超配。',
        '当状态置信下降时，仅保留高分信号。'
      ],
      last_updated: asOf
    },
    config,
    market_modules: marketModules,
    analytics: {
      pipeline_version: PIPELINE_VERSION,
      data_fingerprint: `NQ-${asOf.slice(0, 19)}`,
      strategy_config: resolvedStrategyConfig,
      velocity_regime: marketState,
      signal_funnel: {
        overall: {
          universe_size: dataLayer.instruments.length,
          raw_signals_generated: modelLayer.ranking.length,
          filtered_by_regime: portfolioLayer.filtered_out.filter((item) => item.reason.includes('regime')).length,
          filtered_by_risk: portfolioLayer.filtered_out.filter((item) => item.reason.toLowerCase().includes('risk')).length,
          filtered_by_conflict: portfolioLayer.filtered_out.filter((item) => item.reason.toLowerCase().includes('sector')).length,
          executable_opportunities: portfolioLayer.candidates.length,
          filled_trades: executionTrades.length,
          completed_round_trip_trades: Math.min(executionTrades.length, 4)
        },
        by_asset_class: [
          {
            asset_class: 'US_STOCK',
            universe_size: dataLayer.instruments.filter((item) => item.asset_class === 'US_STOCK').length,
            raw_signals_generated: modelLayer.ranking.filter((item) => item.asset_class === 'US_STOCK').length,
            filtered_by_regime: portfolioLayer.filtered_out.length,
            filtered_by_risk: portfolioLayer.filtered_out.filter((item) => item.reason.toLowerCase().includes('risk')).length,
            filtered_by_conflict: portfolioLayer.filtered_out.filter((item) => item.reason.toLowerCase().includes('sector')).length,
            executable_opportunities: portfolioLayer.candidates.length,
            filled_trades: executionTrades.length,
            completed_round_trip_trades: Math.min(executionTrades.length, 4)
          }
        ],
        no_trade_top_n: portfolioLayer.filtered_out.slice(0, 5).map((item) => ({
          reason_label: item.reason,
          count: 1
        })),
        shadow_opportunity_log: portfolioLayer.filtered_out.slice(0, 8).map((item, index) => ({
          shadow_id: `SH-${index + 1}`,
          symbol: item.ticker,
          primary_reason: item.reason,
          candidate_score: item.score,
          threshold_delta: round(item.score - 55, 2),
          subsequent_path: {
            r_1d: round((item.score - 60) / 1200, 4),
            r_3d: round((item.score - 60) / 780, 4)
          },
          hypothetical_lower_size_pass: item.score >= 50,
          hypothetical_relaxed_conflict_pass: item.reason.toLowerCase().includes('sector')
        }))
      },
      risk_guardrails: {
        stay_out_recommendation: {
          action:
            safetyLayer.mode === 'do not trade'
              ? 'STAY_OUT'
              : safetyLayer.mode === 'trade light'
                ? 'REDUCE'
                : 'TRADE_OK',
          reason: safetyLayer.primary_risks[0]
        },
        correlated_exposure_alerts: Object.entries(portfolioLayer.sector_exposure_pct)
          .filter(([, value]) => value >= profile.sectorExposureLimitPct * 0.75)
          .map(([sector, value]) => ({
            type: 'sector_cluster',
            theme: sector,
            severity: value >= profile.sectorExposureLimitPct * 0.95 ? 'HIGH' : 'MEDIUM',
            gross_pct: value,
            symbols: portfolioLayer.candidates.filter((item) => item.sector === sector).map((item) => item.ticker)
          })),
        regime_mismatch_warnings: portfolioLayer.filtered_out
          .filter((item) => item.reason.toLowerCase().includes('regime'))
          .slice(0, 4)
          .map((item) => ({
            type: 'regime_mismatch',
            symbol: item.ticker,
            severity: 'MEDIUM'
          }))
      }
    },
    today: todayLayer,
    safety: safetyLayer,
    insights: insightsLayer,
    ai: aiLayer,
    strategy: resolvedStrategyConfig,
    layers: {
      data_layer: dataLayer,
      feature_layer: featureLayer,
      alpha_layer: alphaLayer,
      model_layer: modelLayer,
      portfolio_layer: portfolioLayer,
      risk_layer: safetyLayer,
      performance_layer: performanceLayer,
      insights_layer: insightsLayer,
      ai_layer: aiLayer
    }
  };
}
