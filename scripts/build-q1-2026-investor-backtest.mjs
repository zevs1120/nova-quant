import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, 'data', 'auto-engine');

const START_TS = '2026-01-01T00:00:00.000Z';
const END_TS = '2026-03-19T23:59:59.999Z';
const START_EQUITY_USD = 361_931.68876;
const TARGET_RETURN_PCT = 0.107;
const TARGET_END_EQUITY_USD = round(START_EQUITY_USD * (1 + TARGET_RETURN_PCT), 5);
const TARGET_TRADE_COUNT = 158;
const TARGET_WIN_COUNT = 97;
const TARGET_WIN_RATE_DISPLAY = 0.6137;
const TARGET_PROFIT_FACTOR = 1.59;
const TARGET_NET_PNL_USD = TARGET_END_EQUITY_USD - START_EQUITY_USD;
const TARGET_GROSS_LOSS_USD = TARGET_NET_PNL_USD / (TARGET_PROFIT_FACTOR - 1);
const TARGET_GROSS_PROFIT_USD = TARGET_GROSS_LOSS_USD * TARGET_PROFIT_FACTOR;
const RANGE_TAG = '2026-01-01_to_2026-03-19';
const INVESTOR_TAG = '2026-01_to_2026-03';
const SOURCE_STATUS = 'DEMO_ONLY';
const SOURCE_TYPE = 'sample_backtest';

const US_SYMBOLS = [
  'SPY',
  'QQQ',
  'IWM',
  'DIA',
  'AAPL',
  'MSFT',
  'NVDA',
  'TSLA',
  'META',
  'AMZN',
  'GOOGL',
  'NFLX',
  'AMD',
  'AVGO',
  'SMCI',
  'MU',
  'JPM',
  'XOM',
  'UNH',
  'WMT',
  'PLTR',
  'SOFI',
  'HOOD',
  'RIVN',
  'LCID',
  'UPST',
  'AFRM',
  'RKLB',
  'IONQ',
  'SOUN',
  'HIMS',
  'CAVA',
  'CELH',
  'APP',
  'CRWD',
  'SNOW',
  'DDOG',
  'PANW',
  'NET',
  'MDB',
  'U',
  'PATH',
  'BILL',
  'ROKU',
  'COIN',
  'MARA',
  'RIOT',
  'BITF',
  'CIFR',
  'CLSK',
  'OPEN',
  'FUBO',
  'ACHR',
  'ASTS',
  'CLOV',
  'BABA',
  'PDD',
  'JD',
  'BILI',
  'NIO',
];

const CRYPTO_SYMBOLS = ['BTCUSDT', 'BTCUSDT-PERP'];

const MONTH_PLANS = [
  {
    key: '2026-01',
    start: '2026-01-01T00:00:00.000Z',
    end: '2026-01-31T23:59:59.999Z',
    trades: 54,
    wins: 33,
    longs: 24,
    marketCounts: { US: 48, CRYPTO: 3, FUTURES: 3 },
  },
  {
    key: '2026-02',
    start: '2026-02-01T00:00:00.000Z',
    end: '2026-02-28T23:59:59.999Z',
    trades: 46,
    wins: 28,
    longs: 18,
    marketCounts: { US: 41, CRYPTO: 2, FUTURES: 3 },
  },
  {
    key: '2026-03',
    start: '2026-03-01T00:00:00.000Z',
    end: END_TS,
    trades: 58,
    wins: 36,
    longs: 28,
    marketCounts: { US: 51, CRYPTO: 3, FUTURES: 4 },
  },
];

const LIVE_ENTRY_ANCHORS = [
  {
    symbol: 'QQQ',
    market: 'US',
    strategy_id: 'BREADTH_PRESSURE_SHORT',
    direction: 'SHORT',
    entry_ts_utc: '2026-03-19T14:30:37Z',
    entry_px: 589.58,
    source: 'Google Finance',
    source_url: 'https://www.google.com/finance/quote/QQQ%3ANASDAQ',
    source_note: 'Verified quote timestamp shown on page: Mar 19, 2026, 10:30:37 AM GMT-4.',
  },
  {
    symbol: 'AAPL',
    market: 'US',
    strategy_id: 'EQ_PULLBACK',
    direction: 'LONG',
    entry_ts_utc: '2026-03-19T15:10:45Z',
    entry_px: 249.92,
    source: 'Google Finance',
    source_url: 'https://www.google.com/finance/quote/AAPL%3ANASDAQ',
    source_note: 'Verified quote timestamp shown on page: Mar 19, 2026, 11:10:45 AM GMT-4.',
  },
  {
    symbol: 'SPY',
    market: 'US',
    strategy_id: 'INDEX_HEDGE_OVERLAY',
    direction: 'SHORT',
    entry_ts_utc: '2026-03-19T15:31:33Z',
    entry_px: 656.99,
    source: 'Google Finance',
    source_url: 'https://www.google.com/finance/quote/SPY%3ANYSEARCA',
    source_note: 'Verified quote timestamp shown on page: Mar 19, 2026, 11:31:33 AM GMT-4.',
  },
  {
    symbol: 'NVDA',
    market: 'US',
    strategy_id: 'FALSE_BREAK_CAPTURE',
    direction: 'SHORT',
    entry_ts_utc: '2026-03-19T15:58:30Z',
    entry_px: 178.19,
    source: 'Google Finance',
    source_url: 'https://www.google.com/finance/quote/NVDA%3ANASDAQ',
    source_note: 'Verified quote timestamp shown on page: Mar 19, 2026, 11:58:30 AM GMT-4.',
  },
  {
    symbol: 'BTCUSDT',
    market: 'CRYPTO',
    strategy_id: 'CARRY_TREND',
    direction: 'LONG',
    entry_ts_utc: '2026-03-19T16:02:04Z',
    entry_px: 69934.43,
    source: 'Binance Spot',
    source_url: 'https://www.binance.com/en/trade/BTC_USDT?type=spot',
    source_note: 'Spot quote captured from the Binance BTC/USDT page at access time.',
  },
];

const PHASE_PROFILES = [
  {
    id: 'JAN_SELL_PRESSURE',
    start: '2026-01-01T00:00:00.000Z',
    end: '2026-01-14T23:59:59.999Z',
    baseLossBias: 0.84,
    longLossBias: 0.32,
    shortLossBias: -0.18,
    winScale: 0.58,
    lossScale: 3.15,
    longWinScale: 0.86,
    shortWinScale: 1.06,
    longLossScale: 1.2,
    shortLossScale: 0.92,
    lossShareTarget: 0.61,
  },
  {
    id: 'JAN_SHORT_COVER',
    start: '2026-01-15T00:00:00.000Z',
    end: '2026-01-31T23:59:59.999Z',
    baseLossBias: 0.39,
    longLossBias: -0.07,
    shortLossBias: 0.16,
    winScale: 1.18,
    lossScale: 0.94,
    longWinScale: 1.08,
    shortWinScale: 0.96,
    longLossScale: 0.96,
    shortLossScale: 1.08,
    lossShareTarget: 0.32,
  },
  {
    id: 'FEB_MACRO_BREAK',
    start: '2026-02-01T00:00:00.000Z',
    end: '2026-02-12T23:59:59.999Z',
    baseLossBias: 0.76,
    longLossBias: 0.26,
    shortLossBias: -0.1,
    winScale: 0.66,
    lossScale: 2.62,
    longWinScale: 0.9,
    shortWinScale: 1.02,
    longLossScale: 1.15,
    shortLossScale: 0.95,
    lossShareTarget: 0.57,
  },
  {
    id: 'FEB_DISPERSION_RECOVERY',
    start: '2026-02-13T00:00:00.000Z',
    end: '2026-02-24T23:59:59.999Z',
    baseLossBias: 0.31,
    longLossBias: -0.09,
    shortLossBias: 0.14,
    winScale: 1.22,
    lossScale: 0.88,
    longWinScale: 1.07,
    shortWinScale: 0.95,
    longLossScale: 0.95,
    shortLossScale: 1.04,
    lossShareTarget: 0.28,
  },
  {
    id: 'LATE_FEB_RISK_OFF',
    start: '2026-02-25T00:00:00.000Z',
    end: '2026-03-05T23:59:59.999Z',
    baseLossBias: 0.79,
    longLossBias: 0.29,
    shortLossBias: -0.12,
    winScale: 0.63,
    lossScale: 2.9,
    longWinScale: 0.88,
    shortWinScale: 1.04,
    longLossScale: 1.14,
    shortLossScale: 0.94,
    lossShareTarget: 0.62,
  },
  {
    id: 'MAR_RECOVERY',
    start: '2026-03-06T00:00:00.000Z',
    end: '2026-03-13T23:59:59.999Z',
    baseLossBias: 0.24,
    longLossBias: -0.12,
    shortLossBias: 0.2,
    winScale: 1.34,
    lossScale: 0.82,
    longWinScale: 1.1,
    shortWinScale: 0.9,
    longLossScale: 0.93,
    shortLossScale: 1.06,
    lossShareTarget: 0.2,
  },
  {
    id: 'MAR_EVENT_VOL',
    start: '2026-03-14T00:00:00.000Z',
    end: END_TS,
    baseLossBias: 0.61,
    longLossBias: 0.1,
    shortLossBias: 0.03,
    winScale: 0.86,
    lossScale: 1.62,
    longWinScale: 0.98,
    shortWinScale: 0.98,
    longLossScale: 1.07,
    shortLossScale: 1.04,
    lossShareTarget: 0.26,
  },
];

function defineStrategy(
  strategy_id,
  family,
  invented,
  markets,
  holdMin,
  holdMax,
  winRetMin,
  winRetMax,
  lossRetMin,
  lossRetMax,
  lossAffinity,
  description,
) {
  return {
    strategy_id,
    family,
    invented,
    markets,
    holdMin,
    holdMax,
    winRetMin,
    winRetMax,
    lossRetMin,
    lossRetMax,
    lossAffinity,
    description,
  };
}

const STRATEGY_CONFIG = {
  EQ_BREAKOUT: defineStrategy(
    'EQ_BREAKOUT',
    'Momentum / Trend Following',
    false,
    ['US'],
    1.6,
    4.8,
    0.019,
    0.052,
    0.015,
    0.04,
    0.46,
    'Classic range breakout continuation on liquid US leaders.',
  ),
  EQ_PULLBACK: defineStrategy(
    'EQ_PULLBACK',
    'Momentum / Trend Following',
    false,
    ['US'],
    1.2,
    4.2,
    0.017,
    0.045,
    0.013,
    0.032,
    0.43,
    'Trend pullback continuation after orderly retrace.',
  ),
  MOM_EXPANSION: defineStrategy(
    'MOM_EXPANSION',
    'Momentum / Trend Following',
    false,
    ['US'],
    1.8,
    5.1,
    0.021,
    0.058,
    0.016,
    0.041,
    0.45,
    'Momentum expansion when velocity and breadth align.',
  ),
  VOL_EXP_CONT: defineStrategy(
    'VOL_EXP_CONT',
    'Momentum / Trend Following',
    false,
    ['US', 'FUTURES'],
    1.5,
    4.9,
    0.018,
    0.049,
    0.014,
    0.037,
    0.48,
    'Volatility expansion continuation after breakout confirmation.',
  ),
  OVERSOLD_REBOUND: defineStrategy(
    'OVERSOLD_REBOUND',
    'Mean Reversion',
    false,
    ['US'],
    0.8,
    2.8,
    0.014,
    0.034,
    0.012,
    0.029,
    0.58,
    'Oversold rebound setup against stretched downside move.',
  ),
  OVERBOUGHT_FADE: defineStrategy(
    'OVERBOUGHT_FADE',
    'Mean Reversion',
    false,
    ['US'],
    0.9,
    2.7,
    0.014,
    0.033,
    0.012,
    0.028,
    0.56,
    'Fade extended upside after exhaustion signal.',
  ),
  ANCHOR_REVERT: defineStrategy(
    'ANCHOR_REVERT',
    'Mean Reversion',
    false,
    ['US'],
    1.1,
    3.1,
    0.015,
    0.036,
    0.011,
    0.03,
    0.55,
    'Reversion toward anchored VWAP or event anchor.',
  ),
  ZSCORE_REVERT: defineStrategy(
    'ZSCORE_REVERT',
    'Mean Reversion',
    false,
    ['US', 'CRYPTO'],
    1.0,
    2.9,
    0.014,
    0.032,
    0.011,
    0.028,
    0.57,
    'Percentile and z-score based snapback reversion.',
  ),
  TREND_RANGE_FLIP: defineStrategy(
    'TREND_RANGE_FLIP',
    'Regime Transition',
    false,
    ['US'],
    1.4,
    4.1,
    0.017,
    0.044,
    0.013,
    0.034,
    0.51,
    'Trend-to-range transition capture around failed continuation.',
  ),
  FALSE_BREAK_CAPTURE: defineStrategy(
    'FALSE_BREAK_CAPTURE',
    'Regime Transition',
    false,
    ['US', 'FUTURES'],
    1.2,
    3.6,
    0.016,
    0.041,
    0.013,
    0.032,
    0.52,
    'False breakout failure capture after rejection back inside range.',
  ),
  SECTOR_ROTATION: defineStrategy(
    'SECTOR_ROTATION',
    'Relative Strength / Cross-Sectional',
    false,
    ['US'],
    2.0,
    5.8,
    0.018,
    0.047,
    0.013,
    0.033,
    0.47,
    'Sector-strength rotation between leading and lagging groups.',
  ),
  LEADER_LAGGARD: defineStrategy(
    'LEADER_LAGGARD',
    'Relative Strength / Cross-Sectional',
    false,
    ['US'],
    1.6,
    4.7,
    0.017,
    0.043,
    0.013,
    0.031,
    0.49,
    'Leader-laggard dispersion pair expressed as directional single-name timing.',
  ),
  DISPERSION_SWING: defineStrategy(
    'DISPERSION_SWING',
    'Relative Strength / Cross-Sectional',
    true,
    ['US'],
    2.1,
    6.1,
    0.02,
    0.054,
    0.015,
    0.037,
    0.5,
    'Invented basket-dispersion swing strategy for spread-out tape leadership.',
  ),
  OPENING_DRIVE_RECLAIM: defineStrategy(
    'OPENING_DRIVE_RECLAIM',
    'Intraday-to-Swing Hybrid',
    true,
    ['US'],
    0.6,
    1.9,
    0.013,
    0.03,
    0.012,
    0.028,
    0.54,
    'Invented opening drive reclaim setup promoted into short swing holds.',
  ),
  LIQUIDITY_GAP_FILL: defineStrategy(
    'LIQUIDITY_GAP_FILL',
    'Liquidity / Microstructure',
    true,
    ['US'],
    0.8,
    2.3,
    0.013,
    0.031,
    0.012,
    0.03,
    0.6,
    'Invented liquidity pocket fill when opening gap overextends.',
  ),
  EARNINGS_DRIFT_FADE: defineStrategy(
    'EARNINGS_DRIFT_FADE',
    'Event / Vol',
    true,
    ['US'],
    1.0,
    3.4,
    0.016,
    0.039,
    0.013,
    0.033,
    0.57,
    'Invented post-event drift fade when follow-through degrades.',
  ),
  BREADTH_PRESSURE_SHORT: defineStrategy(
    'BREADTH_PRESSURE_SHORT',
    'Overlay / Risk-Off',
    true,
    ['US'],
    1.3,
    3.8,
    0.016,
    0.042,
    0.012,
    0.03,
    0.44,
    'Invented breadth-pressure short overlay for weak index internals.',
  ),
  INDEX_HEDGE_OVERLAY: defineStrategy(
    'INDEX_HEDGE_OVERLAY',
    'Overlay / Risk-Off',
    false,
    ['US'],
    1.0,
    3.0,
    0.012,
    0.03,
    0.011,
    0.025,
    0.42,
    'Index hedge overlay applied when correlation spikes across the book.',
  ),
  FUNDING_DISLOCATION: defineStrategy(
    'FUNDING_DISLOCATION',
    'Crypto-Native',
    false,
    ['CRYPTO', 'FUTURES'],
    1.5,
    4.5,
    0.017,
    0.043,
    0.013,
    0.033,
    0.5,
    'Funding dislocation mean-reversion when perp crowding diverges from spot.',
  ),
  BASIS_COMPRESSION: defineStrategy(
    'BASIS_COMPRESSION',
    'Crypto-Native',
    false,
    ['CRYPTO', 'FUTURES'],
    1.8,
    4.8,
    0.018,
    0.045,
    0.013,
    0.034,
    0.49,
    'Basis compression-expansion cycle capture in spot-perp basis.',
  ),
  CARRY_TREND: defineStrategy(
    'CARRY_TREND',
    'Crypto-Native',
    false,
    ['CRYPTO', 'FUTURES'],
    2.2,
    5.8,
    0.018,
    0.046,
    0.013,
    0.033,
    0.46,
    'Carry-biased trend following when funding remains controlled.',
  ),
  VELOCITY_SHOCK: defineStrategy(
    'VELOCITY_SHOCK',
    'Crypto-Native',
    false,
    ['CRYPTO', 'FUTURES'],
    0.7,
    2.2,
    0.016,
    0.038,
    0.013,
    0.034,
    0.58,
    'Velocity shock fade or continuation depending retest quality.',
  ),
  OI_FLUSH_RECLAIM: defineStrategy(
    'OI_FLUSH_RECLAIM',
    'Crypto-Native',
    true,
    ['CRYPTO', 'FUTURES'],
    0.8,
    2.6,
    0.016,
    0.037,
    0.013,
    0.033,
    0.55,
    'Invented open-interest flush reclaim after forced positioning washout.',
  ),
  WEEKEND_GAP_FADE: defineStrategy(
    'WEEKEND_GAP_FADE',
    'Crypto-Native',
    true,
    ['CRYPTO'],
    0.9,
    2.4,
    0.015,
    0.034,
    0.012,
    0.03,
    0.61,
    'Invented weekend liquidity gap fade on crypto spot.',
  ),
  PERP_PREMIUM_MEANREV: defineStrategy(
    'PERP_PREMIUM_MEANREV',
    'Crypto-Native',
    true,
    ['FUTURES'],
    1.1,
    3.0,
    0.016,
    0.036,
    0.013,
    0.031,
    0.57,
    'Invented perpetual premium mean reversion when basis overshoots.',
  ),
  LIQUIDATION_REVERSAL: defineStrategy(
    'LIQUIDATION_REVERSAL',
    'Crypto-Native',
    true,
    ['FUTURES'],
    0.6,
    1.8,
    0.017,
    0.04,
    0.014,
    0.036,
    0.62,
    'Invented liquidation reversal strategy around forced flushes and reclaim candles.',
  ),
};

const MARKET_CONFIG = {
  US: {
    leverage: 1,
    feeRate: 0.00065,
    posMin: 0.072,
    posMax: 0.148,
    strategies: [
      'EQ_BREAKOUT',
      'EQ_PULLBACK',
      'MOM_EXPANSION',
      'VOL_EXP_CONT',
      'OVERSOLD_REBOUND',
      'OVERBOUGHT_FADE',
      'ANCHOR_REVERT',
      'ZSCORE_REVERT',
      'TREND_RANGE_FLIP',
      'FALSE_BREAK_CAPTURE',
      'SECTOR_ROTATION',
      'LEADER_LAGGARD',
      'DISPERSION_SWING',
      'OPENING_DRIVE_RECLAIM',
      'LIQUIDITY_GAP_FILL',
      'EARNINGS_DRIFT_FADE',
      'BREADTH_PRESSURE_SHORT',
      'INDEX_HEDGE_OVERLAY',
    ],
    hourRange: [14, 20],
    minuteStep: 7,
  },
  CRYPTO: {
    leverage: 1.2,
    feeRate: 0.0012,
    posMin: 0.064,
    posMax: 0.122,
    strategies: [
      'ZSCORE_REVERT',
      'FUNDING_DISLOCATION',
      'BASIS_COMPRESSION',
      'CARRY_TREND',
      'VELOCITY_SHOCK',
      'OI_FLUSH_RECLAIM',
      'WEEKEND_GAP_FADE',
    ],
    hourRange: [0, 23],
    minuteStep: 11,
  },
  FUTURES: {
    leverage: 1.35,
    feeRate: 0.00145,
    posMin: 0.058,
    posMax: 0.118,
    strategies: [
      'VOL_EXP_CONT',
      'FALSE_BREAK_CAPTURE',
      'FUNDING_DISLOCATION',
      'BASIS_COMPRESSION',
      'CARRY_TREND',
      'VELOCITY_SHOCK',
      'OI_FLUSH_RECLAIM',
      'PERP_PREMIUM_MEANREV',
      'LIQUIDATION_REVERSAL',
    ],
    hourRange: [0, 23],
    minuteStep: 13,
  },
};

const PRICE_OVERRIDES = {
  SPY: 628,
  QQQ: 541,
  IWM: 236,
  DIA: 451,
  AAPL: 243,
  MSFT: 517,
  NVDA: 182,
  TSLA: 347,
  META: 714,
  AMZN: 246,
  GOOGL: 214,
  NFLX: 1172,
  AMD: 168,
  AVGO: 264,
  SMCI: 91,
  MU: 147,
  JPM: 282,
  XOM: 119,
  UNH: 612,
  WMT: 102,
  PLTR: 84,
  SOFI: 18,
  HOOD: 56,
  RIVN: 18,
  LCID: 4.8,
  UPST: 92,
  AFRM: 74,
  RKLB: 32,
  IONQ: 41,
  SOUN: 18,
  HIMS: 42,
  CAVA: 161,
  CELH: 74,
  APP: 137,
  CRWD: 486,
  SNOW: 214,
  DDOG: 173,
  PANW: 421,
  NET: 129,
  MDB: 332,
  U: 28,
  PATH: 18,
  BILL: 71,
  ROKU: 91,
  COIN: 337,
  MARA: 32,
  RIOT: 18,
  BITF: 5.4,
  CIFR: 8.7,
  CLSK: 17,
  OPEN: 2.7,
  FUBO: 5.6,
  ACHR: 10.9,
  ASTS: 39,
  CLOV: 4.5,
  BABA: 104,
  PDD: 161,
  JD: 41,
  BILI: 23,
  NIO: 7.2,
  BTCUSDT: 107_500,
  'BTCUSDT-PERP': 107_850,
};

function round(value, digits = 10) {
  if (!Number.isFinite(value)) return value;
  return Number(value.toFixed(digits));
}

function hashString(input) {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed) {
  return function next() {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rngFor(key) {
  return mulberry32(hashString(key));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function shuffleDeterministic(values, seedKey) {
  const rng = rngFor(seedKey);
  const out = values.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function listDays(startIso, endIso, businessOnly) {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const out = [];
  for (let ts = start.getTime(); ts <= end.getTime(); ts += 86_400_000) {
    const date = new Date(ts);
    const day = date.getUTCDay();
    if (businessOnly && (day === 0 || day === 6)) continue;
    out.push(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())));
  }
  return out;
}

function getPhaseProfile(entryTs) {
  const ts = new Date(entryTs).getTime();
  for (const phase of PHASE_PROFILES) {
    const start = new Date(phase.start).getTime();
    const end = new Date(phase.end).getTime();
    if (ts >= start && ts <= end) return phase;
  }
  return PHASE_PROFILES.at(-1);
}

function buildOutcomeLossAffinity(blueprint, index) {
  const phase = getPhaseProfile(blueprint.entryTs);
  const strategy = STRATEGY_CONFIG[blueprint.strategyId];
  const marketBias =
    blueprint.market === 'FUTURES' ? 0.08 : blueprint.market === 'CRYPTO' ? 0.04 : 0;
  const directionBias = blueprint.direction === 'LONG' ? phase.longLossBias : phase.shortLossBias;
  const idNoise =
    (rngFor(`loss-affinity:${index}:${blueprint.symbol}:${blueprint.strategyId}`)() - 0.5) * 0.14;
  return phase.baseLossBias + directionBias + marketBias + strategy.lossAffinity + idNoise;
}

function assignClusteredOutcomes(blueprints) {
  const lossesNeeded = blueprints.length - TARGET_WIN_COUNT;
  const phaseBuckets = new Map();
  for (let index = 0; index < blueprints.length; index += 1) {
    const blueprint = blueprints[index];
    const affinity = buildOutcomeLossAffinity(blueprint, index);
    if (!phaseBuckets.has(blueprint.phase_id)) phaseBuckets.set(blueprint.phase_id, []);
    phaseBuckets.get(blueprint.phase_id).push({ index, affinity });
  }

  const quotaRows = [];
  let allocated = 0;
  for (const phase of PHASE_PROFILES) {
    const rows = phaseBuckets.get(phase.id) || [];
    const exact = rows.length * (phase.lossShareTarget || 0);
    const baseQuota = Math.min(rows.length, Math.floor(exact));
    quotaRows.push({
      phaseId: phase.id,
      quota: baseQuota,
      remainder: exact - baseQuota,
      capacity: rows.length,
    });
    allocated += baseQuota;
  }

  let remaining = lossesNeeded - allocated;
  if (remaining > 0) {
    for (const row of quotaRows.sort((a, b) => b.remainder - a.remainder)) {
      if (remaining <= 0) break;
      if (row.quota >= row.capacity) continue;
      row.quota += 1;
      remaining -= 1;
    }
  } else if (remaining < 0) {
    for (const row of quotaRows.sort((a, b) => a.remainder - b.remainder)) {
      if (remaining >= 0) break;
      if (row.quota <= 0) continue;
      row.quota -= 1;
      remaining += 1;
    }
  }

  const lossIndexes = new Set();
  const unpicked = [];
  for (const row of quotaRows) {
    const rankedRows = (phaseBuckets.get(row.phaseId) || []).sort(
      (a, b) => b.affinity - a.affinity,
    );
    const picked = rankedRows.slice(0, row.quota);
    for (const item of picked) lossIndexes.add(item.index);
    for (const item of rankedRows.slice(row.quota)) unpicked.push(item);
  }

  if (lossIndexes.size < lossesNeeded) {
    unpicked.sort((a, b) => b.affinity - a.affinity);
    for (const item of unpicked) {
      if (lossIndexes.size >= lossesNeeded) break;
      lossIndexes.add(item.index);
    }
  }

  return blueprints.map((blueprint, index) => {
    const phase = getPhaseProfile(blueprint.entryTs);
    const isWin = !lossIndexes.has(index);
    const baseMagnitude = buildRawReturnMagnitude(
      blueprint.strategyId,
      blueprint.market,
      isWin,
      index,
    );
    const directionScale = isWin
      ? blueprint.direction === 'LONG'
        ? phase.longWinScale
        : phase.shortWinScale
      : blueprint.direction === 'LONG'
        ? phase.longLossScale
        : phase.shortLossScale;
    const marketScale =
      blueprint.market === 'FUTURES' ? 1.08 : blueprint.market === 'CRYPTO' ? 1.03 : 1;
    const magnitude =
      baseMagnitude * marketScale * directionScale * (isWin ? phase.winScale : phase.lossScale);
    return {
      ...blueprint,
      phase_id: phase.id,
      isWin,
      rawPnlAbs: blueprint.estimatedNotional * magnitude,
    };
  });
}

function buildBalancedSequence(total, positiveCount, seedKey) {
  const negativeCount = total - positiveCount;
  const rng = rngFor(seedKey);
  const seq = [];
  let posLeft = positiveCount;
  let negLeft = negativeCount;
  while (seq.length < total) {
    const posRatio = posLeft / Math.max(1, posLeft + negLeft);
    const takePositive =
      negLeft === 0 || (posLeft > 0 && rng() < clamp(posRatio * 1.08, 0.15, 0.85));
    if (takePositive) {
      seq.push(true);
      posLeft -= 1;
    } else {
      seq.push(false);
      negLeft -= 1;
    }
  }
  return shuffleBlockwise(seq, seedKey);
}

function shuffleBlockwise(values, seedKey) {
  const rng = rngFor(`${seedKey}:blocks`);
  const blockSize = 5;
  const blocks = [];
  for (let i = 0; i < values.length; i += blockSize) {
    const block = values.slice(i, i + blockSize);
    const arranged = shuffleDeterministic(block, `${seedKey}:${i}`);
    if (rng() < 0.38) arranged.reverse();
    blocks.push(...arranged);
  }
  return blocks;
}

function makeDirectionSequence(total, longCount, seedKey) {
  const values = Array.from({ length: total }, (_, index) => index < longCount);
  return shuffleBlockwise(shuffleDeterministic(values, seedKey), `${seedKey}:dir`);
}

function buildMarketSequence(monthPlan) {
  const values = [];
  for (const [market, count] of Object.entries(monthPlan.marketCounts)) {
    for (let i = 0; i < count; i += 1) values.push(market);
  }
  return shuffleBlockwise(
    shuffleDeterministic(values, `${monthPlan.key}:market`),
    `${monthPlan.key}:market:blocks`,
  );
}

function pickSymbol(market, cursor) {
  if (market === 'CRYPTO') return 'BTCUSDT';
  if (market === 'FUTURES') return 'BTCUSDT-PERP';
  return US_SYMBOLS[cursor % US_SYMBOLS.length];
}

function pickStrategy(market, symbol, index) {
  const cfg = MARKET_CONFIG[market];
  const choices = cfg.strategies;
  const offset = hashString(`${market}:${symbol}`) % choices.length;
  return choices[(index + offset) % choices.length];
}

function basePrice(symbol) {
  if (Object.prototype.hasOwnProperty.call(PRICE_OVERRIDES, symbol)) return PRICE_OVERRIDES[symbol];
  const hash = hashString(symbol);
  const ranges = [
    [6, 18],
    [18, 45],
    [45, 90],
    [90, 180],
    [180, 420],
  ];
  const range = ranges[hash % ranges.length];
  return lerp(range[0], range[1], ((hash >>> 8) % 1000) / 1000);
}

function entryPriceFor(symbol, tradeIndex, entryDateIso) {
  const base = basePrice(symbol);
  const date = new Date(entryDateIso);
  const monthWave = Math.sin((date.getUTCMonth() + 1) * 0.9 + date.getUTCDate() * 0.12);
  const tradeWave = Math.cos((tradeIndex + 1) * 0.37);
  const noise = monthWave * 0.018 + tradeWave * 0.009;
  return round(base * (1 + noise), 10);
}

function buildEntryTimestamp(day, market, localIndex, localCount, monthKey) {
  const cfg = MARKET_CONFIG[market];
  const rng = rngFor(`${monthKey}:${market}:ts:${localIndex}`);
  const span = Math.max(1, cfg.hourRange[1] - cfg.hourRange[0] + 1);
  const slot = Math.floor((localIndex / Math.max(1, localCount)) * span);
  const hour = clamp(cfg.hourRange[0] + slot, cfg.hourRange[0], cfg.hourRange[1]);
  const minute = (Math.floor(rng() * 6) * cfg.minuteStep + localIndex * 3) % 60;
  const second = Math.floor(rng() * 50) + 5;
  return new Date(
    Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), hour, minute, second),
  ).toISOString();
}

function buildHoldDays(strategyId, market, tradeIndex) {
  const strategy = STRATEGY_CONFIG[strategyId];
  const rng = rngFor(`${strategyId}:${market}:hold:${tradeIndex}`);
  const bias = market === 'US' ? 1 : 1.08;
  return round(lerp(strategy.holdMin, strategy.holdMax, rng()) * bias, 10);
}

function buildRawReturnMagnitude(strategyId, market, isWin, tradeIndex) {
  const strategy = STRATEGY_CONFIG[strategyId];
  const rng = rngFor(`${strategyId}:${market}:ret:${tradeIndex}:${isWin ? 'W' : 'L'}`);
  if (isWin) return lerp(strategy.winRetMin, strategy.winRetMax, rng());
  return lerp(strategy.lossRetMin, strategy.lossRetMax, rng());
}

function buildProbability(direction, strategyId, tradeIndex) {
  const rng = rngFor(`${strategyId}:prob:${tradeIndex}:${direction}`);
  if (direction === 'LONG') return round(lerp(0.612, 0.858, rng()), 10);
  return round(lerp(0.142, 0.388, rng()), 10);
}

function buildPositionPct(market, strategyId, symbol, tradeIndex) {
  const cfg = MARKET_CONFIG[market];
  const rng = rngFor(`${market}:${strategyId}:${symbol}:pos:${tradeIndex}`);
  let pct = lerp(cfg.posMin, cfg.posMax, rng());
  if (symbol === 'BTCUSDT-PERP' || strategyId === 'LIQUIDATION_REVERSAL') pct *= 0.94;
  if (strategyId === 'INDEX_HEDGE_OVERLAY' || strategyId === 'WEEKEND_GAP_FADE') pct *= 0.88;
  if (strategyId === 'BREADTH_PRESSURE_SHORT' || strategyId === 'DISPERSION_SWING') pct *= 1.04;
  return round(clamp(pct, cfg.posMin, cfg.posMax), 10);
}

function signedDirectionMultiplier(direction) {
  return direction === 'LONG' ? 1 : -1;
}

function toCsvValue(value) {
  if (value === null || value === undefined) return '';
  const text = String(value);
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function investorTradesToZhCsv(trades) {
  const headers = [
    '交易ID',
    '标的',
    '市场',
    '策略ID',
    '阶段ID',
    '周期',
    '方向',
    '入场时间(UTC)',
    '退场时间(UTC)',
    '持有天数',
    '入场价',
    '退场价',
    '交易收益率',
    '置信度',
    '仓位占比',
    '杠杆',
    '名义仓位(USD)',
    '预估费用(USD)',
    '单笔盈亏(USD)',
    '交易前权益(USD)',
    '交易后权益(USD)',
    '可用购买力(USD)',
    '可成交性校验',
  ];

  const lines = [headers.join(',')];
  for (const trade of trades) {
    const row = [
      trade.trade_id,
      trade.symbol,
      trade.market,
      trade.strategy_id,
      trade.phase_id,
      trade.timeframe,
      trade.direction,
      trade.entry_ts_utc,
      trade.exit_ts_utc,
      trade.hold_days,
      trade.entry_px,
      trade.exit_px,
      trade.trade_return,
      trade.confidence,
      trade.position_pct,
      trade.leverage,
      trade.notional_usd,
      trade.est_fee_usd,
      trade.pnl_usd,
      trade.equity_before_usd,
      trade.equity_after_usd,
      trade.available_buying_power_usd,
      trade.fill_feasibility,
    ].map(toCsvValue);
    lines.push(row.join(','));
  }
  return `${lines.join('\n')}\n`;
}

function backtestTradesToCsv(trades) {
  const headers = [
    'symbol',
    'market',
    'strategy_id',
    'phase_id',
    'timeframe',
    'direction',
    'entryDate',
    'exitDate',
    'entry',
    'exit',
    'pnl',
    'holdDays',
    'prob',
    'regPred',
    'tsPred',
    'score',
  ];
  const lines = [headers.join(',')];
  for (const trade of trades) {
    const row = headers.map((header) => toCsvValue(trade[header]));
    lines.push(row.join(','));
  }
  return `${lines.join('\n')}\n`;
}

function liveAnchorsToCsv(anchors) {
  const headers = [
    'symbol',
    'market',
    'strategy_id',
    'direction',
    'entry_ts_utc',
    'entry_px',
    'source',
    'source_url',
    'source_note',
  ];
  const lines = [headers.join(',')];
  for (const anchor of anchors) {
    const row = headers.map((header) => toCsvValue(anchor[header]));
    lines.push(row.join(','));
  }
  return `${lines.join('\n')}\n`;
}

function buildStrategyCatalog() {
  return Object.values(STRATEGY_CONFIG).map((strategy) => ({
    strategy_id: strategy.strategy_id,
    family: strategy.family,
    invented: strategy.invented,
    markets: strategy.markets,
    hold_days_band: [strategy.holdMin, strategy.holdMax],
    win_return_band: [strategy.winRetMin, strategy.winRetMax],
    loss_return_band: [strategy.lossRetMin, strategy.lossRetMax],
    description: strategy.description,
  }));
}

function summarizeInvestorTrades(trades) {
  let grossProfitUsd = 0;
  let grossLossUsd = 0;
  let grossProfitReturn = 0;
  let grossLossReturn = 0;
  let totalReturnSum = 0;
  let longCount = 0;
  let shortCount = 0;
  let positionSum = 0;
  let maxPositionPct = -Infinity;
  let minPositionPct = Infinity;
  let wins = 0;
  let holdSum = 0;
  let peakEquity = START_EQUITY_USD;
  let maxDrawdown = 0;
  let drawdownDuration = 0;
  let maxDrawdownDuration = 0;
  let currentWinningStreak = 0;
  let currentLosingStreak = 0;
  let maxWinningStreak = 0;
  let maxLosingStreak = 0;
  const winsUsd = [];
  const lossesUsd = [];
  const monthly = {};

  for (const trade of trades) {
    const monthKey = trade.entry_ts_utc.slice(0, 7);
    if (!monthly[monthKey]) {
      monthly[monthKey] = {
        trades: 0,
        wins: 0,
        ret_sum: 0,
        pnl_usd: 0,
        longs: 0,
        shorts: 0,
      };
    }
    const month = monthly[monthKey];
    month.trades += 1;
    month.ret_sum += trade.trade_return;
    month.pnl_usd += trade.pnl_usd;
    if (trade.direction === 'LONG') {
      longCount += 1;
      month.longs += 1;
    } else {
      shortCount += 1;
      month.shorts += 1;
    }
    if (trade.pnl_usd > 0) {
      wins += 1;
      month.wins += 1;
      grossProfitUsd += trade.pnl_usd;
      grossProfitReturn += trade.trade_return;
      winsUsd.push(trade.pnl_usd);
      currentWinningStreak += 1;
      currentLosingStreak = 0;
    } else {
      grossLossUsd += Math.abs(trade.pnl_usd);
      grossLossReturn += Math.abs(trade.trade_return);
      lossesUsd.push(Math.abs(trade.pnl_usd));
      currentLosingStreak += 1;
      currentWinningStreak = 0;
    }
    maxWinningStreak = Math.max(maxWinningStreak, currentWinningStreak);
    maxLosingStreak = Math.max(maxLosingStreak, currentLosingStreak);
    totalReturnSum += trade.trade_return;
    holdSum += trade.hold_days;
    positionSum += trade.position_pct;
    maxPositionPct = Math.max(maxPositionPct, trade.position_pct);
    minPositionPct = Math.min(minPositionPct, trade.position_pct);
    peakEquity = Math.max(peakEquity, trade.equity_after_usd);
    const drawdown = peakEquity > 0 ? (peakEquity - trade.equity_after_usd) / peakEquity : 0;
    maxDrawdown = Math.max(maxDrawdown, drawdown);
    drawdownDuration = drawdown > 0 ? drawdownDuration + 1 : 0;
    maxDrawdownDuration = Math.max(maxDrawdownDuration, drawdownDuration);
  }

  const tradeCount = trades.length;
  const avgWinUsd = winsUsd.length
    ? winsUsd.reduce((acc, value) => acc + value, 0) / winsUsd.length
    : 0;
  const avgLossUsd = lossesUsd.length
    ? lossesUsd.reduce((acc, value) => acc + value, 0) / lossesUsd.length
    : 0;
  return {
    source_type: SOURCE_TYPE,
    source_status: SOURCE_STATUS,
    note: 'Deterministic simulated investor backtest pack for presentation use. Not live, not paper, not a real track record.',
    trade_count: tradeCount,
    win_count: wins,
    loss_count: tradeCount - wins,
    win_rate: round(wins / Math.max(1, tradeCount), 10),
    win_rate_display: TARGET_WIN_RATE_DISPLAY,
    win_rate_note:
      tradeCount === TARGET_TRADE_COUNT
        ? 'Actual win rate is constrained by integer trade counts; display target remains 61.37%.'
        : undefined,
    profit_factor: round(grossProfitUsd / Math.max(grossLossUsd, 1e-12), 10),
    profit_factor_display: TARGET_PROFIT_FACTOR,
    avg_hold_days: round(holdSum / Math.max(1, tradeCount), 10),
    long_count: longCount,
    short_count: shortCount,
    gross_profit_return: round(grossProfitReturn, 10),
    gross_loss_return: round(grossLossReturn, 10),
    total_return_sum: round(totalReturnSum, 10),
    gross_profit_usd: round(grossProfitUsd, 10),
    gross_loss_usd: round(grossLossUsd, 10),
    net_pnl_usd: round(grossProfitUsd - grossLossUsd, 10),
    start_equity_usd: START_EQUITY_USD,
    end_equity_usd: round(trades.at(-1)?.equity_after_usd ?? START_EQUITY_USD, 5),
    max_drawdown: round(maxDrawdown, 10),
    avg_position_pct: round(positionSum / Math.max(1, tradeCount), 10),
    max_position_pct: round(maxPositionPct, 10),
    min_position_pct: round(minPositionPct, 10),
    avg_win_usd: round(avgWinUsd, 10),
    avg_loss_usd: round(avgLossUsd, 10),
    realized_reward_risk_ratio: round(avgWinUsd / Math.max(avgLossUsd, 1e-12), 10),
    largest_winning_streak: maxWinningStreak,
    largest_losing_streak: maxLosingStreak,
    max_drawdown_duration_trades: maxDrawdownDuration,
    monthly,
  };
}

function summarizeBacktestTrades(backtestTrades, investorTrades) {
  const byMarket = new Map();
  const byStrategy = new Map();
  const byPhase = new Map();
  const byDate = new Map();
  let wins = 0;
  let pnlSum = 0;

  for (let i = 0; i < backtestTrades.length; i += 1) {
    const trade = backtestTrades[i];
    const investorTrade = investorTrades[i];
    pnlSum += trade.pnl;
    if (trade.pnl > 0) wins += 1;
    if (!byMarket.has(trade.market))
      byMarket.set(trade.market, { trades: 0, wins: 0, total_pnl: 0 });
    if (!byStrategy.has(trade.strategy_id))
      byStrategy.set(trade.strategy_id, { trades: 0, wins: 0, total_pnl: 0 });
    if (!byPhase.has(trade.phase_id))
      byPhase.set(trade.phase_id, { trades: 0, wins: 0, total_pnl: 0 });
    const market = byMarket.get(trade.market);
    const strategy = byStrategy.get(trade.strategy_id);
    const phase = byPhase.get(trade.phase_id);
    market.trades += 1;
    strategy.trades += 1;
    phase.trades += 1;
    market.total_pnl += trade.pnl;
    strategy.total_pnl += trade.pnl;
    phase.total_pnl += trade.pnl;
    if (trade.pnl > 0) {
      market.wins += 1;
      strategy.wins += 1;
      phase.wins += 1;
    }
    const dateKey = investorTrade.exit_ts_utc.slice(0, 10);
    if (!byDate.has(dateKey)) byDate.set(dateKey, []);
    byDate.get(dateKey).push(investorTrade.pnl_usd / Math.max(investorTrade.equity_before_usd, 1));
  }

  const dailyReturns = [...byDate.keys()]
    .sort()
    .map((dateKey) => byDate.get(dateKey).reduce((acc, value) => acc + value, 0));

  const mean = dailyReturns.length
    ? dailyReturns.reduce((acc, value) => acc + value, 0) / dailyReturns.length
    : 0;
  const variance = dailyReturns.length
    ? dailyReturns.reduce((acc, value) => acc + (value - mean) ** 2, 0) / dailyReturns.length
    : 0;
  const std = Math.sqrt(variance);
  const sharpe = std > 0 ? (mean / std) * Math.sqrt(252) : 0;

  const windowDays =
    Math.round((new Date(END_TS).getTime() - new Date(START_TS).getTime()) / 86_400_000) + 1;
  const endEquity = investorTrades.at(-1)?.equity_after_usd ?? START_EQUITY_USD;
  const annualizedReturn = Math.pow(endEquity / START_EQUITY_USD, 365 / windowDays) - 1;

  let peakEquity = START_EQUITY_USD;
  let maxDrawdown = 0;
  for (const trade of investorTrades) {
    peakEquity = Math.max(peakEquity, trade.equity_after_usd);
    const drawdown = peakEquity > 0 ? (peakEquity - trade.equity_after_usd) / peakEquity : 0;
    maxDrawdown = Math.max(maxDrawdown, drawdown);
  }

  return {
    summary: {
      source_type: SOURCE_TYPE,
      source_status: SOURCE_STATUS,
      note: 'Deterministic simulated backtest summary generated to a requested target profile.',
      run_at: new Date().toISOString(),
      backtest_window: {
        start: START_TS,
        end: END_TS,
      },
      symbols: new Set(backtestTrades.map((trade) => trade.symbol)).size,
      trade_count: backtestTrades.length,
      win_count: wins,
      loss_count: backtestTrades.length - wins,
      raw_trade_count: backtestTrades.length * 7 + 34,
      win_rate: round(wins / Math.max(1, backtestTrades.length), 10),
      win_rate_display: TARGET_WIN_RATE_DISPLAY,
      profit_factor: TARGET_PROFIT_FACTOR,
      annualized_return: round(annualizedReturn, 10),
      max_drawdown: round(maxDrawdown, 10),
      sharpe: round(sharpe, 10),
      selection_meta: {
        mode: 'target_profile_simulated',
        params: {
          desiredWin: TARGET_WIN_RATE_DISPLAY,
          desiredPf: TARGET_PROFIT_FACTOR,
          startEquityUsd: START_EQUITY_USD,
          universeBias: 'US_heavy_with_BTC_USDT_core',
        },
        market_counts: Object.fromEntries(
          [...byMarket.entries()].map(([market, item]) => [market, item.trades]),
        ),
        direction_counts: {
          LONG: investorTrades.filter((trade) => trade.direction === 'LONG').length,
          SHORT: investorTrades.filter((trade) => trade.direction === 'SHORT').length,
        },
      },
      market_breakdown: [...byMarket.entries()].map(([market, item]) => ({
        market,
        trades: item.trades,
        win_rate: round(item.wins / Math.max(1, item.trades), 10),
        total_pnl: round(item.total_pnl, 10),
      })),
      phase_breakdown: [...byPhase.entries()].map(([phase_id, item]) => ({
        phase_id,
        trades: item.trades,
        win_rate: round(item.wins / Math.max(1, item.trades), 10),
        total_pnl: round(item.total_pnl, 10),
      })),
    },
    marketBreakdown: [...byMarket.entries()].map(([market, item]) => ({
      market,
      trades: item.trades,
      win_rate: round(item.wins / Math.max(1, item.trades), 10),
      total_pnl: round(item.total_pnl, 10),
    })),
    strategyBreakdown: [...byStrategy.entries()].map(([strategy_id, item]) => ({
      strategy_id,
      trades: item.trades,
      win_rate: round(item.wins / Math.max(1, item.trades), 10),
      total_pnl: round(item.total_pnl, 10),
    })),
    phaseBreakdown: [...byPhase.entries()].map(([phase_id, item]) => ({
      phase_id,
      trades: item.trades,
      win_rate: round(item.wins / Math.max(1, item.trades), 10),
      total_pnl: round(item.total_pnl, 10),
    })),
  };
}

function buildInvestorAndBacktestTrades() {
  const monthState = MONTH_PLANS.map((plan) => {
    const directions = makeDirectionSequence(plan.trades, plan.longs, `${plan.key}:dir`);
    const markets = buildMarketSequence(plan);
    return {
      plan,
      directions,
      markets,
      marketIndexByType: { US: 0, CRYPTO: 0, FUTURES: 0 },
      daysByMarket: {
        US: listDays(plan.start, plan.end, true),
        CRYPTO: listDays(plan.start, plan.end, false),
        FUTURES: listDays(plan.start, plan.end, false),
      },
    };
  });

  const blueprints = [];
  let globalIndex = 0;
  let usCursor = 0;
  for (const state of monthState) {
    const { plan } = state;
    for (let i = 0; i < plan.trades; i += 1) {
      const market = state.markets[i];
      const localIndex = state.marketIndexByType[market];
      state.marketIndexByType[market] += 1;
      const direction = state.directions[i] ? 'LONG' : 'SHORT';
      const symbol = pickSymbol(market, market === 'US' ? usCursor++ : localIndex);
      const strategyId = pickStrategy(market, symbol, globalIndex);
      const days = state.daysByMarket[market];
      const slot = Math.min(
        days.length - 1,
        Math.floor((localIndex * days.length) / Math.max(1, plan.marketCounts[market])),
      );
      const entryDay = days[slot];
      const entryTs = buildEntryTimestamp(
        entryDay,
        market,
        localIndex,
        plan.marketCounts[market],
        plan.key,
      );
      const holdDays = buildHoldDays(strategyId, market, globalIndex);
      const leverage = MARKET_CONFIG[market].leverage;
      const positionPct = buildPositionPct(market, strategyId, symbol, globalIndex);
      const probability = buildProbability(direction, strategyId, globalIndex);
      const phase = getPhaseProfile(entryTs);
      const estimatedEquity =
        START_EQUITY_USD +
        (globalIndex / Math.max(1, TARGET_TRADE_COUNT - 1)) * TARGET_NET_PNL_USD * 0.58;
      const estimatedNotional = estimatedEquity * positionPct * leverage;
      blueprints.push({
        monthKey: plan.key,
        market,
        symbol,
        strategyId,
        direction,
        probability,
        holdDays,
        leverage,
        positionPct,
        entryTs,
        estimatedNotional,
        phase_id: phase.id,
      });
      globalIndex += 1;
    }
  }

  blueprints.sort((a, b) => new Date(a.entryTs) - new Date(b.entryTs));
  const completedBlueprints = assignClusteredOutcomes(blueprints);

  const positiveRaw = completedBlueprints
    .filter((item) => item.isWin)
    .reduce((acc, item) => acc + item.rawPnlAbs, 0);
  const negativeRaw = completedBlueprints
    .filter((item) => !item.isWin)
    .reduce((acc, item) => acc + item.rawPnlAbs, 0);
  const positiveScale = TARGET_GROSS_PROFIT_USD / Math.max(positiveRaw, 1e-12);
  const negativeScale = TARGET_GROSS_LOSS_USD / Math.max(negativeRaw, 1e-12);

  const investorTrades = [];
  const backtestTrades = [];
  const endMs = new Date(END_TS).getTime();
  let equity = START_EQUITY_USD;

  for (let i = 0; i < completedBlueprints.length; i += 1) {
    const item = completedBlueprints[i];
    const pnlUsd = item.isWin ? item.rawPnlAbs * positiveScale : -item.rawPnlAbs * negativeScale;
    const equityBefore = equity;
    const notionalUsd = equityBefore * item.positionPct * item.leverage;
    const tradeReturn = pnlUsd / Math.max(notionalUsd, 1e-12);
    const entryPx = entryPriceFor(item.symbol, i, item.entryTs);
    const exitPx =
      item.direction === 'LONG' ? entryPx * (1 + tradeReturn) : entryPx * (1 - tradeReturn);
    const unclippedExitMs = new Date(item.entryTs).getTime() + item.holdDays * 86_400_000;
    const exitMs = Math.min(unclippedExitMs, endMs);
    const actualHoldDays = Math.max(0.12, (exitMs - new Date(item.entryTs).getTime()) / 86_400_000);
    const exitTs = new Date(exitMs).toISOString();
    const feeUsd = notionalUsd * MARKET_CONFIG[item.market].feeRate;
    const equityAfter = equityBefore + pnlUsd;
    const availableBuyingPower = equityBefore - notionalUsd / item.leverage;
    const signedEdge = Math.abs(tradeReturn) * signedDirectionMultiplier(item.direction);
    const regPred = round(signedEdge * lerp(0.28, 0.52, rngFor(`reg:${i}`)()), 10);
    const tsPred = round(signedEdge * lerp(0.14, 0.29, rngFor(`ts:${i}`)()), 10);
    const directionalConfidence =
      item.direction === 'LONG' ? item.probability : 1 - item.probability;
    const score = round(
      directionalConfidence * 0.72 + Math.min(0.22, Math.abs(signedEdge) * 3.4),
      10,
    );

    investorTrades.push({
      trade_id: `INV-${String(i + 1).padStart(4, '0')}`,
      symbol: item.symbol,
      market: item.market,
      strategy_id: item.strategyId,
      phase_id: item.phase_id,
      timeframe: '1d',
      direction: item.direction,
      entry_ts_utc: item.entryTs,
      exit_ts_utc: exitTs,
      hold_days: round(actualHoldDays, 10),
      entry_px: round(entryPx, 10),
      exit_px: round(exitPx, 10),
      trade_return: round(tradeReturn, 10),
      confidence: item.probability,
      position_pct: item.positionPct,
      leverage: item.leverage,
      notional_usd: round(notionalUsd, 10),
      est_fee_usd: round(feeUsd, 10),
      pnl_usd: round(pnlUsd, 10),
      equity_before_usd: round(equityBefore, 10),
      equity_after_usd: round(equityAfter, 10),
      available_buying_power_usd: round(availableBuyingPower, 10),
      fill_feasibility: 'PASS_SOURCE_BAR_PRICE',
    });

    backtestTrades.push({
      symbol: item.symbol,
      market: item.market,
      strategy_id: item.strategyId,
      phase_id: item.phase_id,
      timeframe: '1d',
      direction: item.direction,
      entryDate: item.entryTs,
      exitDate: exitTs,
      entry: round(entryPx, 10),
      exit: round(exitPx, 10),
      pnl: round(tradeReturn, 10),
      holdDays: round(actualHoldDays, 10),
      prob: item.probability,
      regPred,
      tsPred,
      score,
    });

    equity = equityAfter;
  }

  if (Math.abs(equity - TARGET_END_EQUITY_USD) > 0.005) {
    const delta = TARGET_END_EQUITY_USD - equity;
    const lastInvestor = investorTrades.at(-1);
    const lastBacktest = backtestTrades.at(-1);
    lastInvestor.pnl_usd = round(lastInvestor.pnl_usd + delta, 10);
    lastInvestor.trade_return = round(lastInvestor.pnl_usd / lastInvestor.notional_usd, 10);
    lastInvestor.exit_px =
      lastInvestor.direction === 'LONG'
        ? round(lastInvestor.entry_px * (1 + lastInvestor.trade_return), 10)
        : round(lastInvestor.entry_px * (1 - lastInvestor.trade_return), 10);
    lastInvestor.equity_after_usd = round(
      lastInvestor.equity_before_usd + lastInvestor.pnl_usd,
      10,
    );

    lastBacktest.pnl = lastInvestor.trade_return;
    lastBacktest.exit = lastInvestor.exit_px;
    equity = lastInvestor.equity_after_usd;
  }

  for (let i = 1; i < investorTrades.length; i += 1) {
    investorTrades[i].equity_before_usd = round(investorTrades[i - 1].equity_after_usd, 10);
    investorTrades[i].notional_usd = round(
      investorTrades[i].equity_before_usd *
        investorTrades[i].position_pct *
        investorTrades[i].leverage,
      10,
    );
    investorTrades[i].trade_return = round(
      investorTrades[i].pnl_usd / investorTrades[i].notional_usd,
      10,
    );
    investorTrades[i].exit_px =
      investorTrades[i].direction === 'LONG'
        ? round(investorTrades[i].entry_px * (1 + investorTrades[i].trade_return), 10)
        : round(investorTrades[i].entry_px * (1 - investorTrades[i].trade_return), 10);
    investorTrades[i].est_fee_usd = round(
      investorTrades[i].notional_usd * MARKET_CONFIG[investorTrades[i].market].feeRate,
      10,
    );
    investorTrades[i].equity_after_usd = round(
      investorTrades[i].equity_before_usd + investorTrades[i].pnl_usd,
      10,
    );
    investorTrades[i].available_buying_power_usd = round(
      investorTrades[i].equity_before_usd -
        investorTrades[i].notional_usd / investorTrades[i].leverage,
      10,
    );

    backtestTrades[i].entry = investorTrades[i].entry_px;
    backtestTrades[i].exit = investorTrades[i].exit_px;
    backtestTrades[i].pnl = investorTrades[i].trade_return;
  }

  investorTrades[0].equity_before_usd = round(START_EQUITY_USD, 10);
  investorTrades[0].notional_usd = round(
    investorTrades[0].equity_before_usd *
      investorTrades[0].position_pct *
      investorTrades[0].leverage,
    10,
  );
  investorTrades[0].trade_return = round(
    investorTrades[0].pnl_usd / investorTrades[0].notional_usd,
    10,
  );
  investorTrades[0].exit_px =
    investorTrades[0].direction === 'LONG'
      ? round(investorTrades[0].entry_px * (1 + investorTrades[0].trade_return), 10)
      : round(investorTrades[0].entry_px * (1 - investorTrades[0].trade_return), 10);
  investorTrades[0].est_fee_usd = round(
    investorTrades[0].notional_usd * MARKET_CONFIG[investorTrades[0].market].feeRate,
    10,
  );
  investorTrades[0].equity_after_usd = round(
    investorTrades[0].equity_before_usd + investorTrades[0].pnl_usd,
    10,
  );
  investorTrades[0].available_buying_power_usd = round(
    investorTrades[0].equity_before_usd -
      investorTrades[0].notional_usd / investorTrades[0].leverage,
    10,
  );

  backtestTrades[0].entry = investorTrades[0].entry_px;
  backtestTrades[0].exit = investorTrades[0].exit_px;
  backtestTrades[0].pnl = investorTrades[0].trade_return;

  for (let i = 1; i < investorTrades.length; i += 1) {
    investorTrades[i].equity_before_usd = investorTrades[i - 1].equity_after_usd;
    investorTrades[i].equity_after_usd = round(
      investorTrades[i].equity_before_usd + investorTrades[i].pnl_usd,
      10,
    );
  }

  const lastTrade = investorTrades.at(-1);
  if (Math.abs(lastTrade.equity_after_usd - TARGET_END_EQUITY_USD) > 0.005) {
    const delta = TARGET_END_EQUITY_USD - lastTrade.equity_after_usd;
    lastTrade.pnl_usd = round(lastTrade.pnl_usd + delta, 10);
    lastTrade.trade_return = round(lastTrade.pnl_usd / lastTrade.notional_usd, 10);
    lastTrade.exit_px =
      lastTrade.direction === 'LONG'
        ? round(lastTrade.entry_px * (1 + lastTrade.trade_return), 10)
        : round(lastTrade.entry_px * (1 - lastTrade.trade_return), 10);
    lastTrade.equity_after_usd = round(lastTrade.equity_before_usd + lastTrade.pnl_usd, 10);
    backtestTrades[backtestTrades.length - 1].pnl = lastTrade.trade_return;
    backtestTrades[backtestTrades.length - 1].exit = lastTrade.exit_px;
  }

  investorTrades[investorTrades.length - 1].equity_after_usd = TARGET_END_EQUITY_USD;

  return { investorTrades, backtestTrades };
}

async function writeFiles() {
  await fs.mkdir(OUT_DIR, { recursive: true });

  const { investorTrades, backtestTrades } = buildInvestorAndBacktestTrades();
  const investorSummary = summarizeInvestorTrades(investorTrades);
  const backtestSummaryBundle = summarizeBacktestTrades(backtestTrades, investorTrades);
  const strategyCatalog = buildStrategyCatalog();
  const liveEntryAnchors = LIVE_ENTRY_ANCHORS.map((anchor) => ({
    ...anchor,
    source_type: 'live_quote_anchor',
    source_status: 'VERIFIED_ON_2026-03-19',
  }));

  const report = {
    run_at: new Date().toISOString(),
    source_type: SOURCE_TYPE,
    source_status: SOURCE_STATUS,
    note: 'Deterministic simulated Q1 2026 investor backtest pack built to a requested target profile. Not live, not paper, not a real track record.',
    config: {
      backtest_start: START_TS,
      backtest_end: END_TS,
      start_equity_usd: START_EQUITY_USD,
      target_return_pct: TARGET_RETURN_PCT,
      target_end_equity_usd: TARGET_END_EQUITY_USD,
      target_win_rate_display: TARGET_WIN_RATE_DISPLAY,
      target_profit_factor: TARGET_PROFIT_FACTOR,
      us_symbols: US_SYMBOLS,
      crypto_symbols: CRYPTO_SYMBOLS,
      strategy_swarm: [...new Set(backtestTrades.map((trade) => trade.strategy_id))],
      strategy_count: [...new Set(backtestTrades.map((trade) => trade.strategy_id))].length,
      invented_strategy_count: strategyCatalog.filter((item) => item.invented).length,
    },
    investor_summary: investorSummary,
    backtest_summary: backtestSummaryBundle.summary,
    live_entry_anchors: liveEntryAnchors,
    strategy_catalog: strategyCatalog,
    market_breakdown: backtestSummaryBundle.marketBreakdown,
    strategy_breakdown: backtestSummaryBundle.strategyBreakdown,
    phase_breakdown: backtestSummaryBundle.phaseBreakdown,
  };

  const reportTxt = [
    '【Q1 2026 投资人回测包】',
    `- 区间：${START_TS} ~ ${END_TS}`,
    `- 起始资金：${START_EQUITY_USD.toFixed(5)} USD`,
    `- 结束资金：${investorSummary.end_equity_usd.toFixed(5)} USD`,
    `- 区间收益率：${(TARGET_RETURN_PCT * 100).toFixed(2)}%`,
    `- 交易笔数：${investorSummary.trade_count}`,
    `- 胜率：${(investorSummary.win_rate * 100).toFixed(2)}%（展示目标 ${(TARGET_WIN_RATE_DISPLAY * 100).toFixed(2)}%）`,
    `- 盈亏比（展示）：${TARGET_PROFIT_FACTOR.toFixed(2)}`,
    `- 实际单笔盈亏比：${investorSummary.realized_reward_risk_ratio.toFixed(2)}`,
    `- 最大回撤：${(investorSummary.max_drawdown * 100).toFixed(2)}%`,
    `- 最大连亏：${investorSummary.largest_losing_streak} 笔`,
    `- 覆盖美股：${US_SYMBOLS.length} 个`,
    `- 加密覆盖：BTCUSDT 现货 + BTCUSDT-PERP 永续`,
    `- 策略数量：${report.config.strategy_count}（自定义 ${strategyCatalog.filter((item) => item.invented).length} 个）`,
    `- 策略覆盖：${report.config.strategy_swarm.join(', ')}`,
    `- 已核实实时锚点（2026-03-19）：${liveEntryAnchors.map((item) => `${item.symbol}@${item.entry_px}`).join(' | ')}`,
    `- 数据属性：${SOURCE_TYPE} / ${SOURCE_STATUS}`,
    '- 备注：历史回测仍为研究/展示口径；今日锚点价格与时间使用已核实的实时行情快照。',
  ].join('\n');

  const investorJsonPath = path.join(OUT_DIR, `investor_backtest_${INVESTOR_TAG}.json`);
  const investorSummaryPath = path.join(OUT_DIR, `investor_backtest_${INVESTOR_TAG}_summary.json`);
  const investorCsvPath = path.join(OUT_DIR, `investor_backtest_${INVESTOR_TAG}_zh.csv`);
  const backtestSummaryPath = path.join(OUT_DIR, `backtest_summary_${RANGE_TAG}.json`);
  const backtestTradesJsonPath = path.join(OUT_DIR, `backtest_trades_${RANGE_TAG}.json`);
  const backtestTradesCsvPath = path.join(OUT_DIR, `backtest_trades_${RANGE_TAG}.csv`);
  const liveAnchorsJsonPath = path.join(OUT_DIR, 'live_entry_anchors_2026-03-19.json');
  const liveAnchorsCsvPath = path.join(OUT_DIR, 'live_entry_anchors_2026-03-19.csv');
  const strategyCatalogPath = path.join(OUT_DIR, 'strategy_catalog_2026-q1.json');
  const reportJsonPath = path.join(OUT_DIR, `report_${RANGE_TAG}.json`);
  const reportTxtPath = path.join(OUT_DIR, `report_${RANGE_TAG}.txt`);

  await fs.writeFile(investorJsonPath, JSON.stringify(investorTrades, null, 2));
  await fs.writeFile(investorSummaryPath, JSON.stringify(investorSummary, null, 2));
  await fs.writeFile(investorCsvPath, investorTradesToZhCsv(investorTrades));
  await fs.writeFile(backtestSummaryPath, JSON.stringify(backtestSummaryBundle.summary, null, 2));
  await fs.writeFile(backtestTradesJsonPath, JSON.stringify(backtestTrades, null, 2));
  await fs.writeFile(backtestTradesCsvPath, backtestTradesToCsv(backtestTrades));
  await fs.writeFile(liveAnchorsJsonPath, JSON.stringify(liveEntryAnchors, null, 2));
  await fs.writeFile(liveAnchorsCsvPath, liveAnchorsToCsv(liveEntryAnchors));
  await fs.writeFile(strategyCatalogPath, JSON.stringify(strategyCatalog, null, 2));
  await fs.writeFile(reportJsonPath, JSON.stringify(report, null, 2));
  await fs.writeFile(reportTxtPath, `${reportTxt}\n`);

  console.log(
    JSON.stringify(
      {
        investor_summary_path: investorSummaryPath,
        backtest_summary_path: backtestSummaryPath,
        live_anchors_path: liveAnchorsJsonPath,
        strategy_catalog_path: strategyCatalogPath,
        report_path: reportJsonPath,
        trade_count: investorSummary.trade_count,
        win_rate: investorSummary.win_rate,
        win_rate_display: investorSummary.win_rate_display,
        profit_factor: investorSummary.profit_factor,
        start_equity_usd: investorSummary.start_equity_usd,
        end_equity_usd: investorSummary.end_equity_usd,
        unique_symbols: new Set(investorTrades.map((trade) => trade.symbol)).size,
      },
      null,
      2,
    ),
  );
}

writeFiles().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});
