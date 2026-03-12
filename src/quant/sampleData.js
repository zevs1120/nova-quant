import {
  annualizedVolatility,
  deterministicNoise,
  hashCode,
  pctChange,
  returnsFromPrices,
  round,
  simpleMovingAverage
} from './math.js';

const US_UNIVERSE = [
  {
    ticker: 'SPY',
    name: 'SPDR S&P 500 ETF Trust',
    market: 'US',
    assetClass: 'US_STOCK',
    sector: 'Index ETF',
    industry: 'Broad Market ETF',
    marketCapBillions: 560,
    adv: 79000000,
    basePrice: 515,
    drift: 0.00042,
    vol: 0.0104
  },
  {
    ticker: 'QQQ',
    name: 'Invesco QQQ Trust',
    market: 'US',
    assetClass: 'US_STOCK',
    sector: 'Index ETF',
    industry: 'Nasdaq 100 ETF',
    marketCapBillions: 290,
    adv: 52000000,
    basePrice: 430,
    drift: 0.00046,
    vol: 0.0128
  },
  {
    ticker: 'IWM',
    name: 'iShares Russell 2000 ETF',
    market: 'US',
    assetClass: 'US_STOCK',
    sector: 'Index ETF',
    industry: 'Small Cap ETF',
    marketCapBillions: 72,
    adv: 31000000,
    basePrice: 205,
    drift: 0.00023,
    vol: 0.0145
  },
  {
    ticker: 'AAPL',
    name: 'Apple Inc.',
    market: 'US',
    assetClass: 'US_STOCK',
    sector: 'Technology',
    industry: 'Consumer Electronics',
    marketCapBillions: 3250,
    adv: 61000000,
    basePrice: 191,
    drift: 0.00055,
    vol: 0.0162
  },
  {
    ticker: 'MSFT',
    name: 'Microsoft Corporation',
    market: 'US',
    assetClass: 'US_STOCK',
    sector: 'Technology',
    industry: 'Software Infrastructure',
    marketCapBillions: 3110,
    adv: 30000000,
    basePrice: 416,
    drift: 0.00058,
    vol: 0.0148
  },
  {
    ticker: 'NVDA',
    name: 'NVIDIA Corporation',
    market: 'US',
    assetClass: 'US_STOCK',
    sector: 'Technology',
    industry: 'Semiconductors',
    marketCapBillions: 2870,
    adv: 46000000,
    basePrice: 887,
    drift: 0.00074,
    vol: 0.024
  },
  {
    ticker: 'AMZN',
    name: 'Amazon.com, Inc.',
    market: 'US',
    assetClass: 'US_STOCK',
    sector: 'Consumer Discretionary',
    industry: 'Internet Retail',
    marketCapBillions: 1940,
    adv: 43000000,
    basePrice: 176,
    drift: 0.00049,
    vol: 0.0178
  },
  {
    ticker: 'META',
    name: 'Meta Platforms, Inc.',
    market: 'US',
    assetClass: 'US_STOCK',
    sector: 'Communication Services',
    industry: 'Internet Content & Information',
    marketCapBillions: 1280,
    adv: 22000000,
    basePrice: 485,
    drift: 0.00057,
    vol: 0.0193
  },
  {
    ticker: 'GOOGL',
    name: 'Alphabet Inc. Class A',
    market: 'US',
    assetClass: 'US_STOCK',
    sector: 'Communication Services',
    industry: 'Internet Content & Information',
    marketCapBillions: 2120,
    adv: 29000000,
    basePrice: 172,
    drift: 0.00047,
    vol: 0.0168
  },
  {
    ticker: 'TSLA',
    name: 'Tesla, Inc.',
    market: 'US',
    assetClass: 'US_STOCK',
    sector: 'Consumer Discretionary',
    industry: 'Auto Manufacturers',
    marketCapBillions: 905,
    adv: 83000000,
    basePrice: 211,
    drift: 0.00051,
    vol: 0.0302
  },
  {
    ticker: 'JPM',
    name: 'JPMorgan Chase & Co.',
    market: 'US',
    assetClass: 'US_STOCK',
    sector: 'Financials',
    industry: 'Banks Diversified',
    marketCapBillions: 610,
    adv: 13000000,
    basePrice: 193,
    drift: 0.00031,
    vol: 0.0146
  },
  {
    ticker: 'XLF',
    name: 'Financial Select Sector SPDR Fund',
    market: 'US',
    assetClass: 'US_STOCK',
    sector: 'Financials',
    industry: 'Financial Sector ETF',
    marketCapBillions: 52,
    adv: 51000000,
    basePrice: 39,
    drift: 0.00024,
    vol: 0.0139
  },
  {
    ticker: 'XLE',
    name: 'Energy Select Sector SPDR Fund',
    market: 'US',
    assetClass: 'US_STOCK',
    sector: 'Energy',
    industry: 'Energy Sector ETF',
    marketCapBillions: 37,
    adv: 28000000,
    basePrice: 93,
    drift: 0.0002,
    vol: 0.0172
  },
  {
    ticker: 'XLK',
    name: 'Technology Select Sector SPDR Fund',
    market: 'US',
    assetClass: 'US_STOCK',
    sector: 'Technology',
    industry: 'Technology Sector ETF',
    marketCapBillions: 68,
    adv: 9600000,
    basePrice: 212,
    drift: 0.00045,
    vol: 0.0154
  }
];

const CRYPTO_UNIVERSE = [
  {
    ticker: 'BTC-USDT',
    name: 'Bitcoin / Tether',
    market: 'CRYPTO',
    assetClass: 'CRYPTO',
    sector: 'Layer1',
    industry: 'Store of Value',
    marketCapBillions: 1270,
    adv: 25000000000,
    basePrice: 68200,
    drift: 0.00062,
    vol: 0.024
  },
  {
    ticker: 'ETH-USDT',
    name: 'Ethereum / Tether',
    market: 'CRYPTO',
    assetClass: 'CRYPTO',
    sector: 'Layer1',
    industry: 'Smart Contract',
    marketCapBillions: 470,
    adv: 16000000000,
    basePrice: 3620,
    drift: 0.00054,
    vol: 0.028
  },
  {
    ticker: 'SOL-USDT',
    name: 'Solana / Tether',
    market: 'CRYPTO',
    assetClass: 'CRYPTO',
    sector: 'Layer1',
    industry: 'Smart Contract',
    marketCapBillions: 76,
    adv: 3600000000,
    basePrice: 164,
    drift: 0.0007,
    vol: 0.036
  }
];

function getCalendar({ count, endDate, includeWeekends }) {
  const dates = [];
  const cursor = new Date(endDate);
  cursor.setUTCHours(0, 0, 0, 0);
  while (dates.length < count) {
    const day = cursor.getUTCDay();
    if (includeWeekends || (day !== 0 && day !== 6)) {
      dates.push(cursor.toISOString().slice(0, 10));
    }
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return dates.reverse();
}

function generateBars(profile, dates) {
  const seed = hashCode(profile.ticker);
  const bars = [];
  let prevClose = profile.basePrice * (0.94 + ((seed % 17) - 8) / 100);

  for (let i = 0; i < dates.length; i += 1) {
    const n1 = deterministicNoise(seed, i + 1);
    const n2 = deterministicNoise(seed + 97, i + 3);
    const n3 = deterministicNoise(seed + 233, i + 7);
    const n4 = deterministicNoise(seed + 313, i + 11);
    const n5 = deterministicNoise(seed + 617, i + 5);
    const pulse = i % 31 === 0 ? (n2 > 0 ? 0.011 : -0.011) : 0;
    const drift = profile.drift + Math.sin((i + (seed % 9)) / 8.5) * 0.0013;
    const ret = drift + n1 * profile.vol * 0.62 + n2 * profile.vol * 0.35 + pulse;

    const open = prevClose * (1 + n3 * profile.vol * 0.18);
    const close = Math.max(0.01, open * (1 + ret));
    const high = Math.max(open, close) * (1 + Math.abs(n4) * 0.0086);
    const low = Math.min(open, close) * (1 - Math.abs(n5) * 0.0083);

    const range = Math.max(0.0001, high - low);
    const coreVolume = profile.adv * (1 + n1 * 0.24 + n2 * 0.16 + (Math.abs(ret) > profile.vol * 1.15 ? 0.27 : 0));
    const volume = Math.max(profile.adv * 0.28, coreVolume);
    const vwap = low + range * (0.38 + (n3 + 1) * 0.13);

    bars.push({
      date: dates[i],
      open: round(open, 4),
      high: round(high, 4),
      low: round(low, 4),
      close: round(close, 4),
      volume: Math.round(volume),
      vwap: round(vwap, 4),
      ret_1d: round(pctChange(prevClose, close), 6)
    });

    prevClose = close;
  }

  return bars;
}

function enrichInstrument(profile, bars) {
  const closes = bars.map((row) => row.close);
  const volumes = bars.map((row) => row.volume);
  const returns = returnsFromPrices(closes);
  const latest = bars[bars.length - 1];

  return {
    ticker: profile.ticker,
    name: profile.name,
    market: profile.market,
    asset_class: profile.assetClass,
    sector: profile.sector,
    industry: profile.industry,
    market_cap: Math.round(profile.marketCapBillions * 1e9),
    market_cap_billions: profile.marketCapBillions,
    adv_20: Math.round(simpleMovingAverage(volumes, 20)),
    volatility_20: round(annualizedVolatility(returns.slice(-20), profile.market === 'CRYPTO' ? 365 : 252), 4),
    latest_close: latest?.close ?? 0,
    latest_vwap: latest?.vwap ?? 0,
    returns: {
      d1: round(returns.at(-1) ?? 0, 5),
      d5: round(pctChange(closes.at(-6) ?? closes[0], closes.at(-1) ?? closes[0]), 5),
      d10: round(pctChange(closes.at(-11) ?? closes[0], closes.at(-1) ?? closes[0]), 5),
      d20: round(pctChange(closes.at(-21) ?? closes[0], closes.at(-1) ?? closes[0]), 5),
      d60: round(pctChange(closes.at(-61) ?? closes[0], closes.at(-1) ?? closes[0]), 5)
    },
    bars
  };
}

export function buildSampleMarketData({ asOf = new Date() } = {}) {
  const asOfDate = new Date(asOf);
  const endUs = new Date(asOfDate);
  endUs.setUTCDate(endUs.getUTCDate() - 1);

  const usDates = getCalendar({ count: 140, endDate: endUs, includeWeekends: false });
  const cryptoDates = getCalendar({ count: 180, endDate: endUs, includeWeekends: true });

  const instruments = [...US_UNIVERSE, ...CRYPTO_UNIVERSE].map((profile) => {
    const dates = profile.market === 'CRYPTO' ? cryptoDates : usDates;
    const bars = generateBars(profile, dates);
    return enrichInstrument(profile, bars);
  });

  const mapByTicker = Object.fromEntries(instruments.map((item) => [item.ticker, item]));
  const benchmarks = ['SPY', 'QQQ', 'IWM', 'BTC-USDT'].map((ticker) => {
    const data = mapByTicker[ticker];
    return {
      ticker,
      name: data?.name || ticker,
      market: data?.market || 'US',
      bars: data?.bars || []
    };
  });

  return {
    as_of: asOfDate.toISOString(),
    source_type: 'sample_market_data',
    source_note:
      'Local deterministic sample dataset generated in-app for Nova Quant v1 demo. Not real-time feed and not live trading data.',
    instruments,
    by_ticker: mapByTicker,
    benchmarks
  };
}
