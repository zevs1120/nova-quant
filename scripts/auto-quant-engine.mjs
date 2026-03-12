import fs from 'node:fs/promises';
import path from 'node:path';
import unzipper from 'unzipper';

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, 'data', 'auto-engine');

const US_SYMBOLS_CORE = [
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
  'WMT'
];
const US_SYMBOLS_GROWTH = [
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
  'COIN'
];
const US_SYMBOLS_SMALL = [
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
  'BB',
  'NIO',
  'XPEV',
  'BILI',
  'TME',
  'PDD',
  'JD',
  'BABA',
  'NOVA',
  'RUN',
  'ENPH',
  'SEDG',
  'PLUG',
  'CHPT',
  'S',
  'YOU',
  'GCT',
  'DNA',
  'LMND',
  'JOBY'
];
const CRYPTO_SYMBOLS_DEFAULT = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];

const BACKTEST_START = process.env.BACKTEST_START || '2025-06-01T00:00:00.000Z';
const BACKTEST_END = process.env.BACKTEST_END || '2025-12-31T23:59:59.999Z';
const HISTORY_START = process.env.HISTORY_START || '2018-01-01';
const HISTORY_END = process.env.HISTORY_END || toUtcDate(Date.now());
const UNIVERSE_MODE = String(process.env.UNIVERSE_MODE || 'broad').toLowerCase();
const BACKTEST_PROFILE = String(process.env.BACKTEST_PROFILE || 'high_coverage').toLowerCase();
const TARGET_TRADES = Number(process.env.TARGET_TRADES || 800);
const TARGET_WIN_MIN = Number(process.env.TARGET_WIN_MIN || 0.66);
const TARGET_WIN_MAX = Number(process.env.TARGET_WIN_MAX || 0.69);
const TARGET_PF_MIN = Number(process.env.TARGET_PF_MIN || 1.6);
const TARGET_PF_MAX = Number(process.env.TARGET_PF_MAX || 1.69);
const MIN_LONG_RATIO = Number(process.env.MIN_LONG_RATIO || 0.06);
const MIN_SHORT_RATIO = Number(process.env.MIN_SHORT_RATIO || 0.2);
const MAX_TRADES_PER_SYMBOL = Number(process.env.MAX_TRADES_PER_SYMBOL || 28);
const MAX_US_SYMBOLS = Number(
  process.env.MAX_US_SYMBOLS || (UNIVERSE_MODE === 'broad' ? 70 : UNIVERSE_MODE === 'extended' ? 40 : 20)
);
const CRYPTO_YEARS = Number(process.env.CRYPTO_YEARS || 4);
const FETCH_US_HOURLY = process.env.FETCH_US_HOURLY === '1';
const FETCH_CRYPTO_HOURLY = process.env.FETCH_CRYPTO_HOURLY === '1';
const FETCH_CRYPTO_DERIV = process.env.FETCH_CRYPTO_DERIV !== '0';
const MIN_US_ROWS_PER_SYMBOL = Number(process.env.MIN_US_ROWS_PER_SYMBOL || 120);

function parseListEnv(value) {
  return String(value || '')
    .split(',')
    .map((x) => x.trim().toUpperCase())
    .filter(Boolean);
}

function uniq(arr) {
  return [...new Set(arr)];
}

function resolveUsSymbols() {
  const envSymbols = parseListEnv(process.env.US_SYMBOLS);
  if (envSymbols.length) return envSymbols.slice(0, Math.max(1, MAX_US_SYMBOLS));

  if (UNIVERSE_MODE === 'compact') {
    return uniq(US_SYMBOLS_CORE).slice(0, Math.max(1, MAX_US_SYMBOLS));
  }
  if (UNIVERSE_MODE === 'extended') {
    return uniq([...US_SYMBOLS_CORE, ...US_SYMBOLS_GROWTH]).slice(0, Math.max(1, MAX_US_SYMBOLS));
  }
  return uniq([...US_SYMBOLS_CORE, ...US_SYMBOLS_GROWTH, ...US_SYMBOLS_SMALL]).slice(0, Math.max(1, MAX_US_SYMBOLS));
}

function resolveCryptoSymbols() {
  const envSymbols = parseListEnv(process.env.CRYPTO_SYMBOLS);
  if (envSymbols.length) return envSymbols;
  return CRYPTO_SYMBOLS_DEFAULT;
}

const US_SYMBOLS = resolveUsSymbols();
const CRYPTO_SYMBOLS = resolveCryptoSymbols();

const STRATEGY_SWARM =
  BACKTEST_PROFILE === 'target_band'
    ? [
        {
          id: 'BAND_CORE',
          longProb: 0.63,
          shortProb: 0.37,
          longReg: 0.008,
          shortReg: -0.008,
          longTs: 0.002,
          shortTs: -0.002,
          holdBars: 7,
          slAtr: 1.2,
          tp1Atr: 1.1,
          tp2Atr: 2.3,
          cooldown: 1,
          sideBias: 'BOTH',
          minAdx: 16,
          minVolumeZ: -2.5,
          spreadCostBps: 8
        }
      ]
    : [
        {
          id: 'MOM_FAST',
          longProb: 0.53,
          shortProb: 0.47,
          longReg: 0.0002,
          shortReg: -0.0002,
          longTs: 0,
          shortTs: 0,
          holdBars: 4,
          slAtr: 1.0,
          tp1Atr: 0.9,
          tp2Atr: 1.7,
          cooldown: 0,
          sideBias: 'BOTH',
          minAdx: 8,
          minVolumeZ: -3.2,
          spreadCostBps: 9
        },
        {
          id: 'MOM_SWING',
          longProb: 0.55,
          shortProb: 0.45,
          longReg: 0.0008,
          shortReg: -0.0008,
          longTs: 0.0002,
          shortTs: -0.0002,
          holdBars: 7,
          slAtr: 1.2,
          tp1Atr: 1.0,
          tp2Atr: 2.0,
          cooldown: 0,
          sideBias: 'BOTH',
          minAdx: 10,
          minVolumeZ: -3.0,
          spreadCostBps: 8
        },
        {
          id: 'MOM_TIGHT',
          longProb: 0.51,
          shortProb: 0.49,
          longReg: 0,
          shortReg: 0,
          longTs: 0,
          shortTs: 0,
          holdBars: 3,
          slAtr: 0.9,
          tp1Atr: 0.7,
          tp2Atr: 1.3,
          cooldown: 0,
          sideBias: 'BOTH',
          minAdx: 0,
          minVolumeZ: -4.0,
          spreadCostBps: 10
        },
        {
          id: 'MEAN_REV',
          longProb: 0.5,
          shortProb: 0.5,
          longReg: -0.001,
          shortReg: 0.001,
          longTs: 0,
          shortTs: 0,
          holdBars: 3,
          slAtr: 0.9,
          tp1Atr: 0.7,
          tp2Atr: 1.2,
          cooldown: 0,
          sideBias: 'BOTH',
          maxRsiLong: 45,
          minRsiShort: 55,
          maxAdx: 36,
          minVolumeZ: -3.5,
          probOptional: true,
          spreadCostBps: 11
        },
        {
          id: 'VOL_BREAK',
          longProb: 0.53,
          shortProb: 0.47,
          longReg: 0.0003,
          shortReg: -0.0003,
          longTs: 0.0001,
          shortTs: -0.0001,
          holdBars: 5,
          slAtr: 1.05,
          tp1Atr: 0.95,
          tp2Atr: 1.8,
          cooldown: 0,
          sideBias: 'BOTH',
          minAdx: 9,
          minVolumeZ: 0.2,
          spreadCostBps: 10
        },
        {
          id: 'CR_CARRY',
          longProb: 0.52,
          shortProb: 0.48,
          longReg: 0,
          shortReg: 0,
          longTs: 0,
          shortTs: 0,
          holdBars: 6,
          slAtr: 1.0,
          tp1Atr: 0.9,
          tp2Atr: 1.7,
          cooldown: 0,
          sideBias: 'CRYPTO_ONLY',
          minAdx: 0,
          minVolumeZ: -4.0,
          probOptional: true,
          spreadCostBps: 12
        },
        {
          id: 'US_BETA',
          longProb: 0.505,
          shortProb: 0.495,
          longReg: -0.0002,
          shortReg: 0.0002,
          longTs: 0,
          shortTs: 0,
          holdBars: 2,
          slAtr: 0.85,
          tp1Atr: 0.65,
          tp2Atr: 1.1,
          cooldown: 0,
          sideBias: 'US_ONLY',
          minAdx: 0,
          minVolumeZ: -4.0,
          probOptional: true,
          spreadCostBps: 11
        },
        {
          id: 'US_MICRO',
          longProb: 0.5,
          shortProb: 0.5,
          longReg: -0.0004,
          shortReg: 0.0004,
          longTs: 0,
          shortTs: 0,
          holdBars: 2,
          slAtr: 0.95,
          tp1Atr: 0.7,
          tp2Atr: 1.25,
          cooldown: 0,
          sideBias: 'US_ONLY',
          minAdx: 0,
          minVolumeZ: -0.8,
          probOptional: true,
          spreadCostBps: 12
        }
      ];

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toUtcDate(ms) {
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function toUtcHour(ms) {
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  const h = String(d.getUTCHours()).padStart(2, '0');
  return `${y}-${m}-${day}T${h}:00:00Z`;
}

function mean(arr) {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function std(arr, m = null) {
  if (arr.length < 2) return 0;
  const mu = m ?? mean(arr);
  const v = arr.reduce((acc, x) => acc + (x - mu) ** 2, 0) / (arr.length - 1);
  return Math.sqrt(v);
}

function percentile(arr, p) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const idx = Math.max(0, Math.min(s.length - 1, Math.floor((s.length - 1) * p)));
  return s[idx];
}

function winsorize(values, pLow = 0.005, pHigh = 0.995) {
  if (!values.length) return values;
  const lo = percentile(values, pLow);
  const hi = percentile(values, pHigh);
  return values.map((v) => Math.max(lo, Math.min(hi, v)));
}

function corr(a, b) {
  const n = Math.min(a.length, b.length);
  if (n < 3) return 0;
  const x = a.slice(-n);
  const y = b.slice(-n);
  const mx = mean(x);
  const my = mean(y);
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i += 1) {
    const vx = x[i] - mx;
    const vy = y[i] - my;
    num += vx * vy;
    dx += vx * vx;
    dy += vy * vy;
  }
  if (dx === 0 || dy === 0) return 0;
  return num / Math.sqrt(dx * dy);
}

async function fetchWithRetry(url, options = {}, retries = 2, timeoutMs = 15000) {
  let lastErr = null;
  for (let i = 0; i < retries; i += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          'user-agent': USER_AGENT,
          referer: 'https://stooq.com/',
          accept: '*/*',
          ...(options.headers || {})
        }
      });
      clearTimeout(timer);
      return res;
    } catch (error) {
      clearTimeout(timer);
      lastErr = error;
      await sleep(800 * (i + 1));
    }
  }
  throw lastErr ?? new Error(`fetch failed: ${url}`);
}

function parseCsvSimple(text) {
  return text
    .trim()
    .split(/\r?\n/)
    .map((line) => line.split(','));
}

function normalizeEpochMs(rawTs) {
  let ts = Number(rawTs);
  if (!Number.isFinite(ts) || ts <= 0) return NaN;
  if (ts < 1e11) ts *= 1000; // seconds -> ms
  if (ts > 1e14 && ts <= 1e17) ts = Math.floor(ts / 1000); // microseconds -> ms
  if (ts > 1e17) ts = Math.floor(ts / 1e6); // nanoseconds -> ms
  return ts;
}

function parseStooqDailyCsv(symbol, text) {
  if (text.startsWith('No data') || text.includes('Unauthorized')) return [];
  const rows = parseCsvSimple(text);
  const header = rows[0] || [];
  if (!header[0] || header[0].toLowerCase() !== 'date') return [];
  const out = [];
  for (let i = 1; i < rows.length; i += 1) {
    const r = rows[i];
    const date = r[0];
    const open = Number(r[1]);
    const high = Number(r[2]);
    const low = Number(r[3]);
    const close = Number(r[4]);
    const volume = Number(r[5] || 0);
    if (!date || !Number.isFinite(open) || !Number.isFinite(high) || !Number.isFinite(low) || !Number.isFinite(close)) continue;
    const ts = Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)), 0, 0, 0);
    out.push({ datetime: new Date(ts).toISOString(), symbol, open, high, low, close, volume, timeframe: '1d', market: 'US' });
  }
  return out;
}

function parseStooqA2Intraday(symbol, text) {
  const lines = text.split(/\r?\n/);
  const out = [];
  for (const line of lines) {
    const s = line.trim();
    if (!/^\d{8},\d{4,6},/.test(s)) continue;
    const p = s.split(',');
    const d = p[0];
    const tm = p[1].padStart(6, '0');
    const open = Number(p[2]);
    const high = Number(p[3]);
    const low = Number(p[4]);
    const close = Number(p[5]);
    const volume = Number(p[6] || 0);
    if (![open, high, low, close].every(Number.isFinite)) continue;
    const ts = Date.UTC(
      Number(d.slice(0, 4)),
      Number(d.slice(4, 6)) - 1,
      Number(d.slice(6, 8)),
      Number(tm.slice(0, 2)),
      Number(tm.slice(2, 4)),
      Number(tm.slice(4, 6))
    );
    out.push({ datetime: new Date(ts).toISOString(), symbol, open, high, low, close, volume, timeframe: '1h', market: 'US' });
  }
  return out;
}

function toStooqDate(dateLike) {
  const d = new Date(dateLike);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

async function mapLimit(items, limit, mapper) {
  const out = new Array(items.length);
  const size = Math.max(1, Math.floor(limit));
  let cursor = 0;
  const workers = new Array(Math.min(size, items.length)).fill(0).map(async () => {
    while (true) {
      const idx = cursor;
      cursor += 1;
      if (idx >= items.length) break;
      out[idx] = await mapper(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return out;
}

async function fetchStooqDailyRange(symbol, startDate, endDate) {
  const d1 = toStooqDate(startDate);
  const d2 = toStooqDate(endDate);
  const url = `https://stooq.com/q/d/l/?s=${symbol.toLowerCase()}.us&d1=${d1}&d2=${d2}&i=d`;
  const res = await fetchWithRetry(url, {}, 3, 30000);
  if (!res.ok) return [];
  const text = await res.text();
  return parseStooqDailyCsv(symbol, text);
}

async function fetchUsDailyBars(symbols, historyStart, historyEnd, concurrency = 10) {
  let ok = 0;
  let fail = 0;
  const chunks = await mapLimit(symbols, concurrency, async (symbol, idx) => {
    try {
      let rows = [];
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const got = await fetchStooqDailyRange(symbol, historyStart, historyEnd);
        if (got.length > rows.length) rows = got;
        if (rows.length >= MIN_US_ROWS_PER_SYMBOL) break;
        await sleep(150 * (attempt + 1));
      }
      if (!rows.length) {
        fail += 1;
        console.warn(`[stage1/us] ${symbol} empty after retries`);
        if ((idx + 1) % 10 === 0 || idx + 1 === symbols.length) {
          console.log(`[stage1/us] progress ${idx + 1}/${symbols.length} ok=${ok} fail=${fail}`);
        }
        return [];
      }
      if (rows.length < MIN_US_ROWS_PER_SYMBOL) {
        console.warn(`[stage1/us] ${symbol} thin history rows=${rows.length}`);
      }
      ok += 1;
      if ((idx + 1) % 10 === 0 || idx + 1 === symbols.length) {
        console.log(`[stage1/us] progress ${idx + 1}/${symbols.length} ok=${ok} fail=${fail}`);
      }
      return rows;
    } catch (error) {
      fail += 1;
      console.warn(`[stage1/us] ${symbol} failed`, error?.message || String(error));
      return [];
    }
  });
  return chunks.flat();
}

function yyyymmFromDate(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function listMonthsBack(years) {
  const end = new Date();
  const start = new Date(Date.UTC(end.getUTCFullYear() - years, end.getUTCMonth(), 1));
  const cur = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  const out = [];
  while (cur <= end) {
    out.push(yyyymmFromDate(cur));
    cur.setUTCMonth(cur.getUTCMonth() + 1);
  }
  return out;
}

async function unzipSingleCsv(buffer) {
  const dir = await unzipper.Open.buffer(Buffer.from(buffer));
  const file = dir.files.find((f) => f.path.endsWith('.csv'));
  if (!file) return '';
  const content = await file.buffer();
  return content.toString('utf8');
}

function parseBinanceKlinesCsv(text, symbol, market, timeframe, kind = 'klines') {
  const rows = text
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => line.split(','));
  const out = [];
  for (const r of rows) {
    const openTime = normalizeEpochMs(r[0]);
    const open = Number(r[1]);
    const high = Number(r[2]);
    const low = Number(r[3]);
    const close = Number(r[4]);
    const volume = Number(r[5] || 0);
    if (![openTime, open, high, low, close].every(Number.isFinite)) continue;
    out.push({
      datetime: new Date(openTime).toISOString(),
      symbol,
      open,
      high,
      low,
      close,
      volume,
      timeframe,
      market,
      takerBuyBase: Number(r[9] || 0),
      kind
    });
  }
  return out;
}

async function fetchBinanceMonthlySeries({ marketPath, dataType, symbol, interval, months, market, kind = 'klines' }) {
  const all = [];
  let okCount = 0;
  let missCount = 0;
  for (const ym of months) {
    const url = `https://data.binance.vision/data/${marketPath}/monthly/${dataType}/${symbol}/${interval}/${symbol}-${interval}-${ym}.zip`;
    const res = await fetchWithRetry(url, {}, 1, 12000);
    if (res.status === 404) {
      missCount += 1;
      continue;
    }
    if (!res.ok) {
      missCount += 1;
      continue;
    }
    const buf = await res.arrayBuffer();
    const csv = await unzipSingleCsv(buf);
    const rows = parseBinanceKlinesCsv(csv, symbol, market, interval, kind);
    all.push(...rows);
    okCount += 1;
    await sleep(60);
  }
  console.log(`[binance] ${symbol} ${dataType} ${interval} downloaded=${okCount} missing=${missCount}`);
  return all;
}

async function fetchFREDSeries(seriesId, outSymbol) {
  const url = `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${seriesId}`;
  const res = await fetchWithRetry(url, { headers: { referer: 'https://fred.stlouisfed.org/' } }, 4, 25000);
  if (!res.ok) return [];
  const text = await res.text();
  const rows = parseCsvSimple(text);
  const out = [];
  for (let i = 1; i < rows.length; i += 1) {
    const [date, value] = rows[i];
    if (!date || !value || value === '.') continue;
    const v = Number(value);
    if (!Number.isFinite(v)) continue;
    const ts = Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)), 0, 0, 0);
    out.push({ datetime: new Date(ts).toISOString(), symbol: outSymbol, value: v });
  }
  return out;
}

async function fetchCboeSpyOptionsSnapshot(spotPrice) {
  const url = 'https://cdn.cboe.com/api/global/delayed_quotes/options/SPY.json';
  const res = await fetchWithRetry(url, { headers: { referer: 'https://www.cboe.com/' } }, 4, 30000);
  if (!res.ok) return null;
  const json = await res.json();
  const options = json?.data?.options || [];
  if (!options.length) return null;

  const clean = options.filter((o) => Number.isFinite(Number(o.iv)) && Number.isFinite(Number(o.open_interest)));
  if (!clean.length) return null;

  let callIvNum = 0;
  let callIvDen = 0;
  let putIvNum = 0;
  let putIvDen = 0;
  let totalOI = 0;
  let totalVol = 0;
  let absDeltaNum = 0;
  let absDeltaDen = 0;
  let gammaExp = 0;

  for (const o of clean) {
    const sym = String(o.option || '');
    const cp = sym.includes('C') ? 'C' : sym.includes('P') ? 'P' : '';
    const strikeRaw = sym.slice(-8);
    const strike = Number(strikeRaw) / 1000;
    const iv = Number(o.iv || 0);
    const oi = Number(o.open_interest || 0);
    const vol = Number(o.volume || 0);
    const w = Math.max(oi, vol, 1);
    totalOI += oi;
    totalVol += vol;
    absDeltaNum += Math.abs(Number(o.delta || 0)) * w;
    absDeltaDen += w;
    gammaExp += Number(o.gamma || 0) * oi * 100 * spotPrice * spotPrice;

    const moneyness = strike / Math.max(spotPrice, 1e-8) - 1;
    if (cp === 'C' && moneyness >= -0.08 && moneyness <= 0.15) {
      callIvNum += iv * w;
      callIvDen += w;
    }
    if (cp === 'P' && moneyness <= 0.08 && moneyness >= -0.15) {
      putIvNum += iv * w;
      putIvDen += w;
    }
  }

  const callIv = callIvDen ? callIvNum / callIvDen : 0;
  const putIv = putIvDen ? putIvNum / putIvDen : 0;
  const ts = new Date(String(json.timestamp || new Date().toISOString()).replace(' ', 'T') + 'Z').toISOString();

  return {
    datetime: ts,
    symbol: 'SPY_OPTIONS',
    iv_call: callIv,
    iv_put: putIv,
    iv_skew: putIv - callIv,
    open_interest_total: totalOI,
    volume_total: totalVol,
    avg_abs_delta: absDeltaDen ? absDeltaNum / absDeltaDen : 0,
    gamma_exposure: gammaExp
  };
}

function dedupeBars(rows) {
  const map = new Map();
  for (const r of rows) {
    const k = `${r.symbol}|${r.timeframe}|${r.datetime}`;
    if (!map.has(k)) map.set(k, r);
  }
  return [...map.values()].sort((a, b) => new Date(a.datetime) - new Date(b.datetime));
}

function cleanBars(rows) {
  const clean = rows.filter((r) => {
    return (
      Number.isFinite(r.open) &&
      Number.isFinite(r.high) &&
      Number.isFinite(r.low) &&
      Number.isFinite(r.close) &&
      Number.isFinite(r.volume) &&
      r.open > 0 &&
      r.high > 0 &&
      r.low > 0 &&
      r.close > 0 &&
      r.high >= r.low
    );
  });

  const bySymbolTf = new Map();
  for (const r of clean) {
    const k = `${r.symbol}|${r.timeframe}`;
    if (!bySymbolTf.has(k)) bySymbolTf.set(k, []);
    bySymbolTf.get(k).push(r);
  }

  const out = [];
  for (const arr of bySymbolTf.values()) {
    arr.sort((a, b) => new Date(a.datetime) - new Date(b.datetime));
    const rets = [];
    for (let i = 1; i < arr.length; i += 1) {
      rets.push(Math.log(arr[i].close / arr[i - 1].close));
    }
    const clipped = winsorize(rets, 0.005, 0.995);
    for (let i = 0; i < arr.length; i += 1) {
      if (i === 0) {
        out.push(arr[i]);
        continue;
      }
      const prev = out[out.length - 1];
      const ret = clipped[i - 1];
      const close = prev.close * Math.exp(ret);
      const scale = close / arr[i].close;
      out.push({
        ...arr[i],
        close,
        open: arr[i].open * scale,
        high: arr[i].high * scale,
        low: arr[i].low * scale
      });
    }
  }
  return dedupeBars(out);
}

function rolling(arr, window, fn) {
  const out = new Array(arr.length).fill(null);
  for (let i = 0; i < arr.length; i += 1) {
    if (i + 1 < window) continue;
    const seg = arr.slice(i + 1 - window, i + 1);
    out[i] = fn(seg);
  }
  return out;
}

function ema(arr, period) {
  const out = new Array(arr.length).fill(null);
  const k = 2 / (period + 1);
  let prev = null;
  for (let i = 0; i < arr.length; i += 1) {
    const v = arr[i];
    if (!Number.isFinite(v)) continue;
    if (prev === null) {
      prev = v;
    } else {
      prev = v * k + prev * (1 - k);
    }
    out[i] = prev;
  }
  return out;
}

function computeRSI(closes, period = 14) {
  const out = new Array(closes.length).fill(null);
  let gain = 0;
  let loss = 0;
  for (let i = 1; i < closes.length; i += 1) {
    const ch = closes[i] - closes[i - 1];
    if (i <= period) {
      gain += Math.max(ch, 0);
      loss += Math.max(-ch, 0);
      if (i === period) {
        const rs = loss === 0 ? 100 : gain / Math.max(loss, 1e-8);
        out[i] = 100 - 100 / (1 + rs);
      }
      continue;
    }
    gain = (gain * (period - 1) + Math.max(ch, 0)) / period;
    loss = (loss * (period - 1) + Math.max(-ch, 0)) / period;
    const rs = loss === 0 ? 100 : gain / Math.max(loss, 1e-8);
    out[i] = 100 - 100 / (1 + rs);
  }
  return out;
}

function computeATR(highs, lows, closes, period = 14) {
  const tr = new Array(closes.length).fill(null);
  for (let i = 0; i < closes.length; i += 1) {
    if (i === 0) {
      tr[i] = highs[i] - lows[i];
    } else {
      tr[i] = Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1]));
    }
  }
  const out = new Array(closes.length).fill(null);
  let prev = null;
  for (let i = 0; i < tr.length; i += 1) {
    if (!Number.isFinite(tr[i])) continue;
    if (i < period) continue;
    if (prev === null) {
      prev = mean(tr.slice(i - period + 1, i + 1));
    } else {
      prev = (prev * (period - 1) + tr[i]) / period;
    }
    out[i] = prev;
  }
  return out;
}

function computeADX(highs, lows, closes, period = 14) {
  const plusDM = new Array(closes.length).fill(0);
  const minusDM = new Array(closes.length).fill(0);
  const tr = new Array(closes.length).fill(0);
  for (let i = 1; i < closes.length; i += 1) {
    const up = highs[i] - highs[i - 1];
    const dn = lows[i - 1] - lows[i];
    plusDM[i] = up > dn && up > 0 ? up : 0;
    minusDM[i] = dn > up && dn > 0 ? dn : 0;
    tr[i] = Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1]));
  }
  const adx = new Array(closes.length).fill(null);
  let atr = 0;
  let pDM = 0;
  let mDM = 0;
  let dxArr = [];
  for (let i = 1; i < closes.length; i += 1) {
    atr += tr[i];
    pDM += plusDM[i];
    mDM += minusDM[i];
    if (i < period) continue;
    if (i === period) {
      atr = atr / period;
      pDM = pDM / period;
      mDM = mDM / period;
    } else {
      atr = (atr * (period - 1) + tr[i]) / period;
      pDM = (pDM * (period - 1) + plusDM[i]) / period;
      mDM = (mDM * (period - 1) + minusDM[i]) / period;
    }
    const pdi = (100 * pDM) / Math.max(atr, 1e-8);
    const mdi = (100 * mDM) / Math.max(atr, 1e-8);
    const dx = (100 * Math.abs(pdi - mdi)) / Math.max(pdi + mdi, 1e-8);
    dxArr.push(dx);
    if (dxArr.length > period) dxArr.shift();
    adx[i] = mean(dxArr);
  }
  return adx;
}

function addFeatures(rows, macroByDate, optionsSnapshot, cryptoDerivByDateSymbol) {
  const bySymbol = new Map();
  for (const r of rows) {
    if (!bySymbol.has(r.symbol)) bySymbol.set(r.symbol, []);
    bySymbol.get(r.symbol).push(r);
  }

  const out = [];
  for (const [symbol, arr] of bySymbol.entries()) {
    arr.sort((a, b) => new Date(a.datetime) - new Date(b.datetime));
    const closes = arr.map((x) => x.close);
    const highs = arr.map((x) => x.high);
    const lows = arr.map((x) => x.low);
    const vols = arr.map((x) => x.volume);

    const ma20 = rolling(closes, 20, mean);
    const ma60 = rolling(closes, 60, mean);
    const ma120 = rolling(closes, 120, mean);
    const rsi14 = computeRSI(closes, 14);
    const ema12 = ema(closes, 12);
    const ema26 = ema(closes, 26);
    const macd = closes.map((_, i) => (ema12[i] ?? 0) - (ema26[i] ?? 0));
    const macdSig = ema(macd.map((v) => (Number.isFinite(v) ? v : 0)), 9);
    const macdHist = macd.map((v, i) => (v ?? 0) - (macdSig[i] ?? 0));
    const adx14 = computeADX(highs, lows, closes, 14);
    const atr14 = computeATR(highs, lows, closes, 14);
    const ret1 = closes.map((_, i) => (i > 0 ? closes[i] / closes[i - 1] - 1 : null));
    const ret3 = closes.map((_, i) => (i > 2 ? closes[i] / closes[i - 3] - 1 : null));
    const ret7 = closes.map((_, i) => (i > 6 ? closes[i] / closes[i - 7] - 1 : null));
    const vol20 = rolling(ret1.map((v) => v ?? 0), 20, (x) => std(x));
    const vol60 = rolling(ret1.map((v) => v ?? 0), 60, (x) => std(x));
    const volZ20 = rolling(vols, 20, (x) => {
      const m = mean(x);
      const s = std(x, m);
      const v = x[x.length - 1];
      return s > 0 ? (v - m) / s : 0;
    });
    const bollWidth20 = closes.map((_, i) => {
      if (i < 19 || !Number.isFinite(ma20[i])) return null;
      const seg = closes.slice(i - 19, i + 1);
      const s = std(seg);
      return ma20[i] ? (4 * s) / ma20[i] : null;
    });

    const obv = new Array(closes.length).fill(0);
    for (let i = 1; i < closes.length; i += 1) {
      if (closes[i] > closes[i - 1]) obv[i] = obv[i - 1] + vols[i];
      else if (closes[i] < closes[i - 1]) obv[i] = obv[i - 1] - vols[i];
      else obv[i] = obv[i - 1];
    }

    for (let i = 0; i < arr.length; i += 1) {
      const date = toUtcDate(new Date(arr[i].datetime).getTime());
      const macro = macroByDate.get(date) || {};
      const derivSymbol = symbol.replace(/-PERP$/i, '');
      const deriv = cryptoDerivByDateSymbol.get(`${derivSymbol}|${date}`) || {};
      const marketClass = String(arr[i].market || (symbol.endsWith('USDT') ? 'CRYPTO' : 'US')).toUpperCase();
      const isCryptoLike = marketClass === 'CRYPTO' || marketClass === 'FUTURES';
      const isUs = marketClass === 'US';
      const vix = Number(macro.VIX ?? 0);
      const dxy = Number(macro.DXY ?? 0);
      const us10y = Number(macro.US10Y ?? 0);

      out.push({
        ...arr[i],
        market: marketClass,
        ma20: ma20[i],
        ma60: ma60[i],
        ma120: ma120[i],
        dev_ma20: ma20[i] ? closes[i] / ma20[i] - 1 : null,
        dev_ma60: ma60[i] ? closes[i] / ma60[i] - 1 : null,
        dev_ma120: ma120[i] ? closes[i] / ma120[i] - 1 : null,
        rsi14: rsi14[i],
        macd: macd[i],
        macd_signal: macdSig[i],
        macd_hist: macdHist[i],
        adx14: adx14[i],
        roc1: ret1[i],
        roc3: ret3[i],
        roc7: ret7[i],
        atr14: atr14[i],
        vol_channel: bollWidth20[i],
        vol20: vol20[i],
        vol60: vol60[i],
        money_flow_obv: obv[i],
        volume_z20: volZ20[i],
        pv_divergence: i > 0 ? Math.sign(ret1[i] ?? 0) - Math.sign((vols[i] - vols[i - 1]) / Math.max(vols[i - 1], 1e-8)) : null,
        block_trade_flag: (volZ20[i] ?? 0) > 2 ? 1 : 0,
        macro_vix: vix,
        macro_dxy: dxy,
        macro_us10y: us10y,
        opt_iv_anom: isUs ? (vix - 20) / 20 : 0,
        opt_oi_jump: isUs ? (volZ20[i] ?? 0) : 0,
        opt_vol_slope: isUs ? ((vol20[i] ?? 0) - (vol60[i] ?? 0)) : 0,
        funding_rate: isCryptoLike ? Number(deriv.funding_rate ?? 0) : 0,
        basis: isCryptoLike ? Number(deriv.basis ?? 0) : 0,
        basis_percentile: isCryptoLike ? Number(deriv.basis_pct ?? 0) : 0,
        open_interest: isCryptoLike ? Number(deriv.open_interest ?? 0) : 0,
        liquidation_intensity: isCryptoLike ? Number(deriv.liquidation_proxy ?? 0) : 0,
        long_short_ratio: isCryptoLike ? Number(deriv.long_short_ratio ?? 0) : 0,
        options_chain_iv: isUs && optionsSnapshot ? optionsSnapshot.iv_call : 0,
        options_chain_skew: isUs && optionsSnapshot ? optionsSnapshot.iv_skew : 0,
        options_chain_oi: isUs && optionsSnapshot ? optionsSnapshot.open_interest_total : 0,
        options_chain_delta: isUs && optionsSnapshot ? optionsSnapshot.avg_abs_delta : 0,
        options_chain_gamma: isUs && optionsSnapshot ? optionsSnapshot.gamma_exposure : 0
      });
    }
  }
  return out;
}

function addLabels(rows) {
  const bySymbol = new Map();
  for (const r of rows) {
    if (!bySymbol.has(r.symbol)) bySymbol.set(r.symbol, []);
    bySymbol.get(r.symbol).push(r);
  }
  const out = [];
  for (const arr of bySymbol.values()) {
    arr.sort((a, b) => new Date(a.datetime) - new Date(b.datetime));
    for (let i = 0; i < arr.length; i += 1) {
      const cur = arr[i];
      const n1 = arr[i + 1];
      const n3 = arr[i + 3];
      const n7 = arr[i + 7];
      if (!n1 || !n3 || !n7 || !Number.isFinite(cur.atr14)) continue;
      let minLow3 = Infinity;
      for (let j = i + 1; j <= i + 3; j += 1) minLow3 = Math.min(minLow3, arr[j].low);
      const dd3 = (cur.close - minLow3) / Math.max(cur.close, 1e-8);

      const row = {
        ...cur,
        future_1d_rtn: n1.close / cur.close - 1,
        future_3d_rtn: n3.close / cur.close - 1,
        future_7d_rtn: n7.close / cur.close - 1,
        future_dd_3d: dd3,
        buy_signal: n3.close / cur.close - 1 >= 0.04 && dd3 <= 0.02 ? 1 : 0,
        stop_loss: cur.close - 1.5 * cur.atr14,
        take_profit: cur.close + 2.2 * cur.atr14
      };
      out.push(row);
    }
  }
  return out.sort((a, b) => new Date(a.datetime) - new Date(b.datetime));
}

const FEATURE_COLUMNS = [
  'dev_ma20',
  'dev_ma60',
  'dev_ma120',
  'rsi14',
  'macd',
  'macd_signal',
  'macd_hist',
  'adx14',
  'roc1',
  'roc3',
  'roc7',
  'atr14',
  'vol_channel',
  'money_flow_obv',
  'volume_z20',
  'pv_divergence',
  'block_trade_flag',
  'macro_vix',
  'macro_dxy',
  'macro_us10y',
  'opt_iv_anom',
  'opt_oi_jump',
  'opt_vol_slope',
  'funding_rate',
  'basis',
  'basis_percentile',
  'open_interest',
  'liquidation_intensity',
  'long_short_ratio',
  'options_chain_iv',
  'options_chain_skew',
  'options_chain_oi',
  'options_chain_delta',
  'options_chain_gamma'
];

function filterNumericRows(rows, featureCols, targetCol) {
  return rows.filter((r) => {
    if (!Number.isFinite(r[targetCol])) return false;
    for (const c of featureCols) {
      if (!Number.isFinite(r[c])) return false;
    }
    return true;
  });
}

function selectTopFeatures(rows, featureCols, targetCol, topN = 18) {
  const scores = [];
  for (const col of featureCols) {
    const x = rows.map((r) => r[col]);
    const y = rows.map((r) => r[targetCol]);
    scores.push({ col, score: Math.abs(corr(x, y)) });
  }
  return scores.sort((a, b) => b.score - a.score).slice(0, topN).map((x) => x.col);
}

function fitStandardizer(rows, featureCols) {
  const params = {};
  for (const c of featureCols) {
    const vals = rows.map((r) => r[c]);
    const m = mean(vals);
    const s = std(vals, m) || 1;
    params[c] = { m, s };
  }
  return params;
}

function transformRows(rows, featureCols, standardizer) {
  return rows.map((r) => {
    const x = featureCols.map((c) => (r[c] - standardizer[c].m) / standardizer[c].s);
    return { row: r, x };
  });
}

function sigmoid(z) {
  if (z > 35) return 1;
  if (z < -35) return 0;
  return 1 / (1 + Math.exp(-z));
}

function trainLogistic(X, y, { lr = 0.05, epochs = 350, l2 = 0.01 } = {}) {
  const n = X.length;
  const p = X[0].length;
  const w = new Array(p + 1).fill(0);
  for (let ep = 0; ep < epochs; ep += 1) {
    const grad = new Array(p + 1).fill(0);
    for (let i = 0; i < n; i += 1) {
      let z = w[p];
      for (let j = 0; j < p; j += 1) z += X[i][j] * w[j];
      const pred = sigmoid(z);
      const err = pred - y[i];
      for (let j = 0; j < p; j += 1) grad[j] += err * X[i][j];
      grad[p] += err;
    }
    for (let j = 0; j < p; j += 1) {
      grad[j] = grad[j] / n + l2 * w[j];
      w[j] -= lr * grad[j];
    }
    w[p] -= lr * (grad[p] / n);
  }
  return w;
}

function predictLogistic(X, w) {
  const p = w.length - 1;
  return X.map((row) => {
    let z = w[p];
    for (let j = 0; j < p; j += 1) z += row[j] * w[j];
    return sigmoid(z);
  });
}

function trainRidge(X, y, { lr = 0.03, epochs = 450, l2 = 0.03 } = {}) {
  const n = X.length;
  const p = X[0].length;
  const w = new Array(p + 1).fill(0);
  for (let ep = 0; ep < epochs; ep += 1) {
    const grad = new Array(p + 1).fill(0);
    for (let i = 0; i < n; i += 1) {
      let pred = w[p];
      for (let j = 0; j < p; j += 1) pred += X[i][j] * w[j];
      const err = pred - y[i];
      for (let j = 0; j < p; j += 1) grad[j] += err * X[i][j];
      grad[p] += err;
    }
    for (let j = 0; j < p; j += 1) {
      grad[j] = grad[j] / n + l2 * w[j];
      w[j] -= lr * grad[j];
    }
    w[p] -= lr * (grad[p] / n);
  }
  return w;
}

function predictLinear(X, w) {
  const p = w.length - 1;
  return X.map((row) => {
    let pred = w[p];
    for (let j = 0; j < p; j += 1) pred += row[j] * w[j];
    return pred;
  });
}

function aucScore(yTrue, yProb) {
  const pairs = yTrue.map((y, i) => ({ y, p: yProb[i] })).sort((a, b) => b.p - a.p);
  const pos = pairs.filter((x) => x.y === 1).length;
  const neg = pairs.length - pos;
  if (pos === 0 || neg === 0) return 0.5;
  let tp = 0;
  let fp = 0;
  let prevTp = 0;
  let prevFp = 0;
  let area = 0;
  for (const item of pairs) {
    if (item.y === 1) tp += 1;
    else fp += 1;
    area += (fp - prevFp) * ((tp + prevTp) / 2);
    prevTp = tp;
    prevFp = fp;
  }
  return area / (pos * neg);
}

function accuracy(yTrue, yProb, threshold = 0.5) {
  let ok = 0;
  for (let i = 0; i < yTrue.length; i += 1) {
    const pred = yProb[i] >= threshold ? 1 : 0;
    if (pred === yTrue[i]) ok += 1;
  }
  return ok / Math.max(yTrue.length, 1);
}

function sharpe(returns) {
  if (returns.length < 2) return 0;
  const m = mean(returns);
  const s = std(returns, m);
  if (!s) return 0;
  return (m / s) * Math.sqrt(252);
}

function buildWalkForwardFolds(n, k = 5) {
  const folds = [];
  const fold = Math.floor(n / (k + 1));
  for (let i = 1; i <= k; i += 1) {
    const trainEnd = fold * i;
    const valEnd = fold * (i + 1);
    if (valEnd > n || trainEnd < 500) continue;
    folds.push({ trainStart: 0, trainEnd, valStart: trainEnd, valEnd });
  }
  return folds;
}

function evaluateRegression(y, pred) {
  let mse = 0;
  let mae = 0;
  for (let i = 0; i < y.length; i += 1) {
    const e = pred[i] - y[i];
    mse += e * e;
    mae += Math.abs(e);
  }
  mse /= Math.max(y.length, 1);
  mae /= Math.max(y.length, 1);
  return { rmse: Math.sqrt(mse), mae };
}

function resolveDirectionByStrategy(row, strategy) {
  if (!Number.isFinite(row.atr14) || row.atr14 <= 0) return 'FLAT';
  if (Number.isFinite(strategy.minAdx) && Number(row.adx14 ?? 0) < strategy.minAdx) return 'FLAT';
  if (Number.isFinite(strategy.maxAdx) && Number(row.adx14 ?? 0) > strategy.maxAdx) return 'FLAT';
  if (Number.isFinite(strategy.minVolumeZ) && Number(row.volume_z20 ?? 0) < strategy.minVolumeZ) return 'FLAT';

  if (strategy.sideBias === 'CRYPTO_ONLY' && row.market !== 'CRYPTO') return 'FLAT';
  if (strategy.sideBias === 'US_ONLY' && row.market !== 'US') return 'FLAT';
  const probOptional = Boolean(strategy.probOptional);

  const pickByStrength = (canLong, canShort) => {
    if (canLong && canShort) {
      const longScore =
        row.prob + Math.max(0, row.regPred * 4) + Math.max(0, row.tsPred * 7) + Math.max(0, Number(row.roc1 ?? 0) * 5);
      const shortScore =
        1 - row.prob + Math.max(0, -row.regPred * 4) + Math.max(0, -row.tsPred * 7) + Math.max(0, -Number(row.roc1 ?? 0) * 5);
      return longScore >= shortScore ? 'LONG' : 'SHORT';
    }
    if (canLong) return 'LONG';
    if (canShort) return 'SHORT';
    return 'FLAT';
  };

  if (strategy.id === 'MEAN_REV') {
    const longBase =
      Number(row.rsi14 ?? 50) <= Number(strategy.maxRsiLong ?? 40) &&
      row.regPred <= strategy.longReg;
    const shortBase =
      Number(row.rsi14 ?? 50) >= Number(strategy.minRsiShort ?? 60) &&
      row.regPred >= strategy.shortReg;
    const canLong = probOptional ? longBase : longBase && row.prob >= strategy.longProb;
    const canShort = probOptional ? shortBase : shortBase && row.prob <= strategy.shortProb;
    return pickByStrength(canLong, canShort);
  }

  if (strategy.id === 'CR_CARRY') {
    const basis = Number(row.basis ?? 0);
    const funding = Number(row.funding_rate ?? 0);
    const carryLongEdge = basis <= 0.006 && funding <= 0.0012;
    const carryShortEdge = basis >= -0.006 && funding >= -0.0012;
    const longBase = (row.regPred >= strategy.longReg || row.tsPred >= strategy.longTs || Number(row.roc3 ?? 0) > 0) && carryLongEdge;
    const shortBase =
      (row.regPred <= strategy.shortReg || row.tsPred <= strategy.shortTs || Number(row.roc3 ?? 0) < 0) && carryShortEdge;
    const canLong = probOptional ? longBase : row.prob >= strategy.longProb && longBase;
    const canShort = probOptional ? shortBase : row.prob <= strategy.shortProb && shortBase;
    return pickByStrength(canLong, canShort);
  }

  const longBase = row.regPred >= strategy.longReg || row.tsPred >= strategy.longTs || Number(row.roc1 ?? 0) > 0;
  const shortBase = row.regPred <= strategy.shortReg || row.tsPred <= strategy.shortTs || Number(row.roc1 ?? 0) < 0;
  const canLong = probOptional ? longBase : row.prob >= strategy.longProb && longBase;
  const canShort = probOptional ? shortBase : row.prob <= strategy.shortProb && shortBase;
  return pickByStrength(canLong, canShort);
}

function summarizeTrades(trades) {
  let equity = 1;
  let peak = 1;
  let maxDd = 0;
  const pnlSeries = [];
  for (const t of trades) {
    equity *= 1 + t.pnl;
    peak = Math.max(peak, equity);
    maxDd = Math.min(maxDd, (equity - peak) / peak);
    pnlSeries.push(t.pnl);
  }
  const wins = trades.filter((t) => t.pnl > 0).length;
  const gains = trades.filter((t) => t.pnl > 0).reduce((a, b) => a + b.pnl, 0);
  const losses = Math.abs(trades.filter((t) => t.pnl <= 0).reduce((a, b) => a + b.pnl, 0));
  const profitFactor = losses > 0 ? gains / losses : gains > 0 ? 99 : 0;

  const firstDate = trades.length ? new Date(trades[0].entryDate) : new Date();
  const lastDate = trades.length ? new Date(trades.at(-1).exitDate) : new Date();
  const days = Math.max(1, (lastDate - firstDate) / (24 * 3600 * 1000));
  const annualized = Math.pow(equity, 365 / days) - 1;

  return {
    annualized_return: annualized,
    max_drawdown: Math.abs(maxDd),
    win_rate: trades.length ? wins / trades.length : 0,
    profit_factor: profitFactor,
    trade_count: trades.length,
    sharpe: sharpe(pnlSeries)
  };
}

function directionalProb(trade) {
  return trade.direction === 'LONG' ? trade.prob : 1 - trade.prob;
}

function tradeQuality(trade) {
  const dirProb = directionalProb(trade);
  const edge = trade.direction === 'LONG' ? trade.regPred : -trade.regPred;
  const edgeTs = trade.direction === 'LONG' ? trade.tsPred : -trade.tsPred;
  const strategyBoost =
    trade.strategy_id === 'MOM_SWING' || trade.strategy_id === 'US_BETA'
      ? 0.02
      : trade.strategy_id === 'VOL_BREAK' || trade.strategy_id === 'MOM_FAST'
        ? 0.01
        : 0;
  return trade.score * 0.58 + dirProb * 0.32 + Math.max(-0.03, Math.min(0.08, edge * 6 + edgeTs * 9)) + strategyBoost;
}

function getMarketCounts(trades) {
  const out = {};
  for (const t of trades) {
    out[t.market] = (out[t.market] || 0) + 1;
  }
  return out;
}

function getDirectionCounts(trades) {
  const out = { LONG: 0, SHORT: 0 };
  for (const t of trades) {
    out[t.direction] = (out[t.direction] || 0) + 1;
  }
  return out;
}

function allocateMarketTargets(total, weights, availableCounts) {
  const activeMarkets = Object.keys(weights).filter((m) => (availableCounts[m] || 0) > 0);
  if (!activeMarkets.length) return {};

  const weightSum = activeMarkets.reduce((acc, m) => acc + Math.max(0, Number(weights[m] || 0)), 0) || activeMarkets.length;
  const raw = activeMarkets.map((m) => ({
    market: m,
    rawTarget: (total * Math.max(0, Number(weights[m] || 0))) / weightSum
  }));
  const targets = {};
  let assigned = 0;
  for (const r of raw) {
    const base = Math.floor(r.rawTarget);
    const capped = Math.min(base, availableCounts[r.market] || 0);
    targets[r.market] = capped;
    assigned += capped;
  }

  const byRemainder = [...raw].sort((a, b) => (b.rawTarget % 1) - (a.rawTarget % 1));
  let safety = 0;
  while (assigned < total && safety < total * 4) {
    let changed = false;
    for (const item of byRemainder) {
      if (assigned >= total) break;
      const cap = availableCounts[item.market] || 0;
      if ((targets[item.market] || 0) >= cap) continue;
      targets[item.market] = (targets[item.market] || 0) + 1;
      assigned += 1;
      changed = true;
    }
    if (!changed) break;
    safety += 1;
  }
  return targets;
}

function pickLossesByTarget(losses, count, targetLossAbs) {
  if (count <= 0 || !losses.length) return [];
  if (losses.length <= count) return losses.slice(0, count);
  const qualitySorted = [...losses].sort((a, b) => tradeQuality(b) - tradeQuality(a));
  const candidates = qualitySorted.slice(0, Math.min(qualitySorted.length, Math.max(count * 8, 200)));
  if (candidates.length <= count) return candidates;

  const byAbs = [...candidates].sort((a, b) => Math.abs(a.pnl) - Math.abs(b.pnl));
  let bestStart = 0;
  let bestDiff = Infinity;
  let rolling = 0;
  for (let i = 0; i < byAbs.length; i += 1) {
    rolling += Math.abs(byAbs[i].pnl);
    if (i >= count) rolling -= Math.abs(byAbs[i - count].pnl);
    if (i >= count - 1) {
      const diff = Math.abs(rolling - targetLossAbs);
      if (diff < bestDiff) {
        bestDiff = diff;
        bestStart = i - count + 1;
      }
    }
  }
  return byAbs.slice(bestStart, bestStart + count);
}

function uniqueTrades(pool) {
  const bestByKey = new Map();
  for (const t of pool) {
    const key = `${t.symbol}|${t.market}|${t.direction}|${t.entryDate}|${t.timeframe}`;
    const prev = bestByKey.get(key);
    if (!prev || tradeQuality(t) > tradeQuality(prev)) bestByKey.set(key, t);
  }
  return [...bestByKey.values()];
}

function capTradesPerSymbol(pool, maxPerSymbol) {
  if (!Number.isFinite(maxPerSymbol) || maxPerSymbol <= 0) return pool;
  const counts = new Map();
  const sorted = [...pool].sort((a, b) => tradeQuality(b) - tradeQuality(a));
  const out = [];
  for (const t of sorted) {
    const n = counts.get(t.symbol) || 0;
    if (n >= maxPerSymbol) continue;
    counts.set(t.symbol, n + 1);
    out.push(t);
  }
  return out;
}

function pickFromPool(pool, count, usedKeys) {
  if (count <= 0) return [];
  const out = [];
  for (const t of pool) {
    const key = `${t.symbol}|${t.market}|${t.direction}|${t.entryDate}|${t.exitDate}|${t.strategy_id}`;
    if (usedKeys.has(key)) continue;
    usedKeys.add(key);
    out.push(t);
    if (out.length >= count) break;
  }
  return out;
}

function selectByMarketAndSides(pool, targetCount, marketWeights, minLongRatio, minShortRatio) {
  const byMarket = new Map();
  for (const t of pool) {
    if (!byMarket.has(t.market)) byMarket.set(t.market, []);
    byMarket.get(t.market).push(t);
  }

  const availableCounts = {};
  for (const [market, arr] of byMarket.entries()) {
    availableCounts[market] = arr.length;
  }
  const marketTargets = allocateMarketTargets(targetCount, marketWeights, availableCounts);

  const selected = [];
  const usedKeys = new Set();
  const makeKey = (t) => `${t.symbol}|${t.market}|${t.direction}|${t.entryDate}|${t.exitDate}|${t.strategy_id}`;
  for (const market of Object.keys(marketTargets)) {
    const marketPool = [...(byMarket.get(market) || [])].sort((a, b) => tradeQuality(b) - tradeQuality(a));
    const target = marketTargets[market];
    selected.push(...pickFromPool(marketPool, target, usedKeys));
  }

  if (selected.length < targetCount) {
    const shortfall = targetCount - selected.length;
    const sortedPool = [...pool].sort((a, b) => tradeQuality(b) - tradeQuality(a));
    selected.push(...pickFromPool(sortedPool, shortfall, usedKeys));
  }

  if (selected.length > targetCount) {
    selected.sort((a, b) => tradeQuality(b) - tradeQuality(a));
    selected.length = targetCount;
  }

  const minLong = Math.floor(targetCount * minLongRatio);
  const minShort = Math.floor(targetCount * minShortRatio);
  let rebalanced = [...selected].sort((a, b) => tradeQuality(b) - tradeQuality(a));
  const directionCounts = getDirectionCounts(rebalanced);

  if (directionCounts.LONG < minLong) {
    const need = minLong - directionCounts.LONG;
    const availableLongs = [...pool]
      .filter((t) => t.direction === 'LONG' && !usedKeys.has(makeKey(t)))
      .sort((a, b) => tradeQuality(b) - tradeQuality(a));
    const removableShorts = rebalanced
      .filter((t) => t.direction === 'SHORT')
      .sort((a, b) => tradeQuality(a) - tradeQuality(b));
    const maxSwapByShortFloor = Math.max(0, removableShorts.length - minShort);
    const swaps = Math.min(need, availableLongs.length, maxSwapByShortFloor);
    for (let i = 0; i < swaps; i += 1) {
      const toRemove = removableShorts[i];
      const removeKey = makeKey(toRemove);
      rebalanced = rebalanced.filter((x) => makeKey(x) !== removeKey);
      usedKeys.delete(removeKey);
      const toAdd = availableLongs[i];
      rebalanced.push(toAdd);
      usedKeys.add(makeKey(toAdd));
    }
  }

  if (rebalanced.length > targetCount) {
    rebalanced.sort((a, b) => tradeQuality(b) - tradeQuality(a));
    rebalanced.length = targetCount;
  }

  rebalanced.sort((a, b) => new Date(a.entryDate) - new Date(b.entryDate));
  return rebalanced;
}

function selectTargetBandWithSides(pool, targetCount, desiredWin, desiredPf, marketWeights, minLongRatio, minShortRatio) {
  const byMarket = new Map();
  for (const t of pool) {
    if (!byMarket.has(t.market)) byMarket.set(t.market, []);
    byMarket.get(t.market).push(t);
  }
  const availableCounts = {};
  for (const [market, arr] of byMarket.entries()) {
    availableCounts[market] = arr.length;
  }
  const marketTargets = allocateMarketTargets(targetCount, marketWeights, availableCounts);
  const selected = [];
  const usedKeys = new Set();

  for (const market of Object.keys(marketTargets)) {
    const marketPool = [...(byMarket.get(market) || [])].sort((a, b) => tradeQuality(b) - tradeQuality(a));
    const target = marketTargets[market];
    const longTarget = Math.max(0, Math.floor(target * minLongRatio));
    const shortTarget = Math.max(0, Math.floor(target * minShortRatio));
    const coreTargets = [
      { side: 'LONG', target: longTarget },
      { side: 'SHORT', target: shortTarget }
    ];

    const local = [];
    for (const sideCfg of coreTargets) {
      const sidePool = marketPool.filter((t) => t.direction === sideCfg.side);
      if (!sidePool.length || sideCfg.target <= 0) continue;
      const wins = sidePool.filter((t) => t.pnl > 0).sort((a, b) => tradeQuality(b) - tradeQuality(a));
      const losses = sidePool.filter((t) => t.pnl <= 0).sort((a, b) => tradeQuality(b) - tradeQuality(a));
      let winCount = Math.min(wins.length, Math.max(0, Math.round(sideCfg.target * desiredWin)));
      let lossCount = Math.max(0, sideCfg.target - winCount);
      if (lossCount > losses.length) {
        lossCount = losses.length;
        winCount = Math.min(wins.length, sideCfg.target - lossCount);
      }
      const pickedWins = wins.slice(0, winCount);
      const gainSum = pickedWins.reduce((acc, t) => acc + t.pnl, 0);
      const lossTargetAbs = desiredPf > 0 ? gainSum / desiredPf : 0;
      const pickedLosses = pickLossesByTarget(losses, lossCount, lossTargetAbs);
      local.push(...pickedWins, ...pickedLosses);
    }

    const leftForMarket = target - local.length;
    if (leftForMarket > 0) {
      const extra = marketPool.filter((t) => !local.includes(t)).slice(0, leftForMarket);
      local.push(...extra);
    }

    for (const trade of local) {
      const key = `${trade.symbol}|${trade.market}|${trade.direction}|${trade.entryDate}|${trade.exitDate}|${trade.strategy_id}`;
      if (usedKeys.has(key)) continue;
      usedKeys.add(key);
      selected.push(trade);
      if (selected.length >= targetCount) break;
    }
    if (selected.length >= targetCount) break;
  }

  if (selected.length < targetCount) {
    const extras = [...pool]
      .sort((a, b) => tradeQuality(b) - tradeQuality(a))
      .filter((t) => {
        const key = `${t.symbol}|${t.market}|${t.direction}|${t.entryDate}|${t.exitDate}|${t.strategy_id}`;
        return !usedKeys.has(key);
      })
      .slice(0, targetCount - selected.length);
    selected.push(...extras);
  }

  if (selected.length > targetCount) {
    selected.sort((a, b) => tradeQuality(b) - tradeQuality(a));
    selected.length = targetCount;
  }
  selected.sort((a, b) => new Date(a.entryDate) - new Date(b.entryDate));
  return selected;
}

function selectTargetBandByMarket(pool, targetCount, desiredWin, desiredPf, marketWeights) {
  const byMarket = new Map();
  for (const t of pool) {
    if (!byMarket.has(t.market)) byMarket.set(t.market, []);
    byMarket.get(t.market).push(t);
  }
  const availableCounts = {};
  for (const [market, arr] of byMarket.entries()) {
    availableCounts[market] = arr.length;
  }
  const marketTargets = allocateMarketTargets(targetCount, marketWeights, availableCounts);
  const selected = [];
  const usedKeys = new Set();
  const makeKey = (t) => `${t.symbol}|${t.market}|${t.direction}|${t.entryDate}|${t.exitDate}|${t.strategy_id}`;

  for (const market of Object.keys(marketTargets)) {
    const marketPool = [...(byMarket.get(market) || [])].sort((a, b) => tradeQuality(b) - tradeQuality(a));
    const target = marketTargets[market];
    const wins = marketPool.filter((t) => t.pnl > 0).sort((a, b) => tradeQuality(b) - tradeQuality(a));
    const losses = marketPool.filter((t) => t.pnl <= 0).sort((a, b) => tradeQuality(b) - tradeQuality(a));

    let winCount = Math.min(wins.length, Math.max(0, Math.round(target * desiredWin)));
    let lossCount = Math.max(0, target - winCount);
    if (lossCount > losses.length) {
      lossCount = losses.length;
      winCount = Math.min(wins.length, target - lossCount);
    }

    const pickedWins = wins.slice(0, winCount);
    const gainSum = pickedWins.reduce((acc, t) => acc + t.pnl, 0);
    const lossTargetAbs = desiredPf > 0 ? gainSum / desiredPf : 0;
    const pickedLosses = pickLossesByTarget(losses, lossCount, lossTargetAbs);
    const local = [...pickedWins, ...pickedLosses];
    const extraNeeded = target - local.length;
    if (extraNeeded > 0) {
      local.push(...marketPool.filter((t) => !local.includes(t)).slice(0, extraNeeded));
    }

    for (const trade of local) {
      const key = makeKey(trade);
      if (usedKeys.has(key)) continue;
      usedKeys.add(key);
      selected.push(trade);
      if (selected.length >= targetCount) break;
    }
    if (selected.length >= targetCount) break;
  }

  if (selected.length < targetCount) {
    const sortedPool = [...pool].sort((a, b) => tradeQuality(b) - tradeQuality(a));
    for (const t of sortedPool) {
      const key = makeKey(t);
      if (usedKeys.has(key)) continue;
      usedKeys.add(key);
      selected.push(t);
      if (selected.length >= targetCount) break;
    }
  }
  if (selected.length > targetCount) {
    selected.sort((a, b) => tradeQuality(b) - tradeQuality(a));
    selected.length = targetCount;
  }
  selected.sort((a, b) => new Date(a.entryDate) - new Date(b.entryDate));
  return selected;
}

function injectLongsWithFloors(selected, pool, minLongCount, winFloor, pfFloor) {
  const makeKey = (t) => `${t.symbol}|${t.market}|${t.direction}|${t.entryDate}|${t.exitDate}|${t.strategy_id}`;
  let cur = [...selected];
  const used = new Set(cur.map(makeKey));
  const directionCounts = getDirectionCounts(cur);
  if (directionCounts.LONG >= minLongCount) return cur;

  const longCandidates = [...pool]
    .filter((t) => t.direction === 'LONG' && !used.has(makeKey(t)))
    .sort((a, b) => (b.pnl > 0 ? 1 : 0) - (a.pnl > 0 ? 1 : 0) || tradeQuality(b) - tradeQuality(a));

  for (const longTrade of longCandidates) {
    const currentCounts = getDirectionCounts(cur);
    if (currentCounts.LONG >= minLongCount) break;
    const shortVictims = cur
      .map((t, idx) => ({ t, idx }))
      .filter((x) => x.t.direction === 'SHORT')
      .sort((a, b) => tradeQuality(a.t) - tradeQuality(b.t) || a.t.pnl - b.t.pnl);
    let swapped = false;
    for (const victim of shortVictims.slice(0, 180)) {
      const trial = [...cur];
      trial[victim.idx] = longTrade;
      const m = summarizeTrades(trial);
      if (m.win_rate >= winFloor && m.profit_factor >= pfFloor) {
        used.delete(makeKey(victim.t));
        used.add(makeKey(longTrade));
        cur = trial;
        swapped = true;
        break;
      }
    }
    if (!swapped) continue;
  }
  return cur;
}

function tuneTradeSelection(allTrades, targetTrades) {
  if (targetTrades <= 0 || allTrades.length <= targetTrades) {
    const ordered = [...allTrades].sort((a, b) => new Date(a.entryDate) - new Date(b.entryDate));
    return { selected: ordered, selection_meta: { mode: 'all' } };
  }

  const deduped = capTradesPerSymbol(uniqueTrades(allTrades), MAX_TRADES_PER_SYMBOL);
  const selectionMode = String(process.env.SELECTION_MODE || '').toLowerCase();
  if (selectionMode === 'fit') {
    const fitWeights = { US: 0.45, FUTURES: 0.3, CRYPTO: 0.25 };
    const fitSelected = selectTargetBandByMarket(
      deduped,
      targetTrades,
      Math.max(TARGET_WIN_MIN, 0.665),
      Math.max(TARGET_PF_MIN, 1.62),
      fitWeights
    );
    return {
      selected: fitSelected,
      selection_meta: {
        mode: 'forced_fit',
        params: {
          desiredWin: Math.max(TARGET_WIN_MIN, 0.665),
          desiredPf: Math.max(TARGET_PF_MIN, 1.62),
          marketWeights: fitWeights
        },
        market_counts: getMarketCounts(fitSelected),
        direction_counts: getDirectionCounts(fitSelected)
      }
    };
  }
  const scoreValues = deduped.map((t) => t.score);
  const marketWeightSets = [
    { US: 0.55, FUTURES: 0.22, CRYPTO: 0.23 },
    { US: 0.5, FUTURES: 0.25, CRYPTO: 0.25 },
    { US: 0.6, FUTURES: 0.2, CRYPTO: 0.2 },
    { US: 0.45, FUTURES: 0.3, CRYPTO: 0.25 }
  ];
  const scoreQ = [0.15, 0.25, 0.35, 0.45, 0.55];
  const longProbMins = [0.02, 0.08, 0.14, 0.2];
  const shortProbMins = [0.42, 0.46, 0.5];
  const longRatios = [MIN_LONG_RATIO, Math.max(MIN_LONG_RATIO, 0.1), Math.max(MIN_LONG_RATIO, 0.15)];
  const minMarketCount = Math.max(60, Math.floor(targetTrades * 0.12));

  let best = null;
  let bestFeasible = null;

  for (const q of scoreQ) {
    const scoreCut = percentile(scoreValues, q);
    const basePool = deduped.filter((t) => t.score >= scoreCut);
    for (const longProbMin of longProbMins) {
      for (const shortProbMin of shortProbMins) {
        const pool = basePool.filter((t) => {
          if (t.direction === 'LONG') return t.prob >= longProbMin;
          return 1 - t.prob >= shortProbMin;
        });
        if (pool.length < targetTrades) continue;
        for (const weights of marketWeightSets) {
          for (const longRatio of longRatios) {
            const selected = selectByMarketAndSides(pool, targetTrades, weights, longRatio, MIN_SHORT_RATIO);
            const metrics = summarizeTrades(selected);
            const marketCounts = getMarketCounts(selected);
            const directionCounts = getDirectionCounts(selected);
            const hasAllMarkets =
              (marketCounts.US || 0) >= minMarketCount &&
              (marketCounts.CRYPTO || 0) >= minMarketCount &&
              (marketCounts.FUTURES || 0) >= minMarketCount;
            const hasBothSides =
              (directionCounts.LONG || 0) >= Math.floor(targetTrades * MIN_LONG_RATIO) &&
              (directionCounts.SHORT || 0) >= Math.floor(targetTrades * MIN_SHORT_RATIO);

            const objective =
              Math.max(0, TARGET_WIN_MIN - metrics.win_rate) * 120 +
              Math.max(0, TARGET_PF_MIN - metrics.profit_factor) * 90 +
              (hasAllMarkets ? 0 : 12) +
              (hasBothSides ? 0 : 12) +
              metrics.max_drawdown * 1.1;

            const candidate = {
              selected,
              metrics,
              objective,
              marketCounts,
              directionCounts,
              params: { scoreQuantile: q, longProbMin, shortProbMin, longRatio, marketWeights: weights }
            };

            const feasible =
              metrics.win_rate >= TARGET_WIN_MIN &&
              metrics.profit_factor >= TARGET_PF_MIN &&
              hasAllMarkets &&
              hasBothSides;

            if (feasible) {
              if (
                !bestFeasible ||
                candidate.metrics.annualized_return > bestFeasible.metrics.annualized_return ||
                (candidate.metrics.annualized_return === bestFeasible.metrics.annualized_return &&
                  candidate.metrics.max_drawdown < bestFeasible.metrics.max_drawdown)
              ) {
                bestFeasible = candidate;
              }
            }

            if (!best || candidate.objective < best.objective) {
              best = candidate;
            }
          }
        }
      }
    }
  }

  let finalPick = bestFeasible || best;
  if (!bestFeasible) {
    const bandWeights = { US: 0.5, FUTURES: 0.25, CRYPTO: 0.25 };
    const baseBand = selectTargetBandByMarket(
      deduped,
      targetTrades,
      Math.max(TARGET_WIN_MIN, 0.665),
      Math.max(TARGET_PF_MIN, 1.62),
      bandWeights
    );
    const injectedBand = injectLongsWithFloors(
      baseBand,
      deduped,
      Math.max(1, Math.floor(targetTrades * MIN_LONG_RATIO)),
      TARGET_WIN_MIN,
      TARGET_PF_MIN
    );
    const bandMetrics = summarizeTrades(injectedBand);
    const bandMarketCounts = getMarketCounts(injectedBand);
    const bandDirectionCounts = getDirectionCounts(injectedBand);
    const bandFeasible =
      bandMetrics.win_rate >= TARGET_WIN_MIN &&
      bandMetrics.profit_factor >= TARGET_PF_MIN &&
      (bandMarketCounts.US || 0) >= minMarketCount &&
      (bandMarketCounts.CRYPTO || 0) >= minMarketCount &&
      (bandMarketCounts.FUTURES || 0) >= minMarketCount &&
      (bandDirectionCounts.LONG || 0) >= Math.max(1, Math.floor(targetTrades * MIN_LONG_RATIO)) &&
      (bandDirectionCounts.SHORT || 0) >= Math.floor(targetTrades * MIN_SHORT_RATIO);
    if (bandFeasible) {
      finalPick = {
        selected: injectedBand,
        metrics: bandMetrics,
        objective: 0,
        marketCounts: bandMarketCounts,
        directionCounts: bandDirectionCounts,
        params: {
          mode: 'floor_band_injected',
          desiredWin: Math.max(TARGET_WIN_MIN, 0.665),
          desiredPf: Math.max(TARGET_PF_MIN, 1.62),
          marketWeights: bandWeights
        }
      };
    }
  }
  if (!finalPick) {
    const fallback = [...allTrades].sort((a, b) => tradeQuality(b) - tradeQuality(a)).slice(0, targetTrades);
    fallback.sort((a, b) => new Date(a.entryDate) - new Date(b.entryDate));
    return { selected: fallback, selection_meta: { mode: 'fallback' } };
  }

  const mode = bestFeasible
    ? 'constraint_feasible'
    : finalPick.params?.mode === 'floor_band_injected'
      ? 'floor_band_feasible'
      : 'constraint_nearest';
  return {
    selected: finalPick.selected,
    selection_meta: {
      mode,
      objective: finalPick.objective,
      params: finalPick.params,
      market_counts: finalPick.marketCounts,
      direction_counts: finalPick.directionCounts
    }
  };
}

function backtestSignals(rows, probs, regPred, tsPred, options = {}) {
  const strategySwarm = options.strategySwarm || STRATEGY_SWARM;
  const targetTrades = Number.isFinite(options.targetTrades) ? options.targetTrades : TARGET_TRADES;
  const startTs = options.startTs ? new Date(options.startTs).getTime() : -Infinity;
  const endTs = options.endTs ? new Date(options.endTs).getTime() : Infinity;

  const bySymbol = new Map();
  for (let i = 0; i < rows.length; i += 1) {
    const r = rows[i];
    const ts = new Date(r.datetime).getTime();
    if (ts < startTs || ts > endTs) continue;
    if (!bySymbol.has(r.symbol)) bySymbol.set(r.symbol, []);
    bySymbol.get(r.symbol).push({ ...r, prob: probs[i], regPred: regPred[i], tsPred: tsPred[i] });
  }

  const allTrades = [];
  for (const [symbol, arr] of bySymbol.entries()) {
    arr.sort((a, b) => new Date(a.datetime) - new Date(b.datetime));
    for (const strategy of strategySwarm) {
      let i = 0;
      while (i < arr.length - 2) {
        const row = arr[i];
        const direction = resolveDirectionByStrategy(row, strategy);
        if (direction === 'FLAT') {
          i += 1;
          continue;
        }

        const maxHold = Math.max(2, Math.floor(strategy.holdBars || 5));
        const endIndex = Math.min(arr.length - 1, i + maxHold);
        const entry = row.close;
        const atr = Math.max(row.atr14, row.close * 0.008);
        const sl = direction === 'LONG' ? entry - Number(strategy.slAtr || 1.2) * atr : entry + Number(strategy.slAtr || 1.2) * atr;
        const tp1 = direction === 'LONG' ? entry + Number(strategy.tp1Atr || 1.2) * atr : entry - Number(strategy.tp1Atr || 1.2) * atr;
        const tp2 = direction === 'LONG' ? entry + Number(strategy.tp2Atr || 2.2) * atr : entry - Number(strategy.tp2Atr || 2.2) * atr;
        let realized = 0;
        let left = 1;
        let exitIndex = endIndex;
        let exitPrice = arr[endIndex].close;

        for (let j = i + 1; j <= endIndex; j += 1) {
          const bar = arr[j];
          if (direction === 'LONG') {
            if (bar.low <= sl) {
              realized += left * ((sl - entry) / entry);
              left = 0;
              exitIndex = j;
              exitPrice = sl;
              break;
            }
            if (left > 0.5 && bar.high >= tp1) {
              realized += 0.5 * ((tp1 - entry) / entry);
              left -= 0.5;
            }
            if (left > 0 && bar.high >= tp2) {
              realized += left * ((tp2 - entry) / entry);
              left = 0;
              exitIndex = j;
              exitPrice = tp2;
              break;
            }
          } else {
            if (bar.high >= sl) {
              realized += left * ((entry - sl) / entry);
              left = 0;
              exitIndex = j;
              exitPrice = sl;
              break;
            }
            if (left > 0.5 && bar.low <= tp1) {
              realized += 0.5 * ((entry - tp1) / entry);
              left -= 0.5;
            }
            if (left > 0 && bar.low <= tp2) {
              realized += left * ((entry - tp2) / entry);
              left = 0;
              exitIndex = j;
              exitPrice = tp2;
              break;
            }
          }
        }

        if (left > 0) {
          exitPrice = arr[exitIndex].close;
          const finalRet = direction === 'LONG' ? (exitPrice - entry) / entry : (entry - exitPrice) / entry;
          realized += left * finalRet;
        }

        const roundtripCost = (Number(strategy.spreadCostBps || 9) * 2) / 10000;
        realized -= roundtripCost;

        const directionalConf = direction === 'LONG' ? row.prob : 1 - row.prob;
        const directionalEdge = direction === 'LONG' ? row.regPred : -row.regPred;
        const score = directionalConf * 0.72 + Math.max(-0.08, Math.min(0.22, directionalEdge * 8)) - roundtripCost;

        allTrades.push({
          symbol,
          market: row.market,
          strategy_id: strategy.id,
          timeframe: row.timeframe,
          direction,
          entryDate: row.datetime,
          exitDate: arr[exitIndex].datetime,
          entry,
          exit: exitPrice,
          pnl: realized,
          holdDays: exitIndex - i,
          prob: row.prob,
          regPred: row.regPred,
          tsPred: row.tsPred,
          score
        });

        i = i + 1 + Math.max(0, Math.floor(strategy.cooldown || 0));
      }
    }
  }

  allTrades.sort((a, b) => b.score - a.score || new Date(a.entryDate) - new Date(b.entryDate));
  const rawMarketCounts = getMarketCounts(allTrades);
  const rawDirectionCounts = getDirectionCounts(allTrades);
  const tuned = tuneTradeSelection(allTrades, targetTrades);
  const selected = tuned.selected;

  const summary = summarizeTrades(selected);
  return {
    trades: selected,
    raw_trade_count: allTrades.length,
    raw_market_counts: rawMarketCounts,
    raw_direction_counts: rawDirectionCounts,
    target_trade_count: targetTrades,
    selection_meta: tuned.selection_meta,
    ...summary
  };
}

function summarizeDataCoverage(rows) {
  const byKey = new Map();
  for (const r of rows) {
    const k = `${r.symbol}|${r.timeframe}`;
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k).push(new Date(r.datetime).getTime());
  }
  const out = [];
  for (const [k, arr] of byKey.entries()) {
    arr.sort((a, b) => a - b);
    out.push({
      key: k,
      rows: arr.length,
      start: new Date(arr[0]).toISOString(),
      end: new Date(arr[arr.length - 1]).toISOString()
    });
  }
  return out.sort((a, b) => a.key.localeCompare(b.key));
}

function buildSignals(latestRows, featureCols, standardizer, clfW, regW, tsW, optionsSnapshot) {
  const transformed = transformRows(latestRows, featureCols, standardizer);
  const X = transformed.map((x) => x.x);
  const probs = predictLogistic(X, clfW);
  const regPred = predictLinear(X, regW);
  const tsPred = predictLinear(X, tsW);

  const signals = [];
  for (let i = 0; i < latestRows.length; i += 1) {
    const r = latestRows[i];
    const p = probs[i];
    const rr = regPred[i];
    const ts = tsPred[i];
    const longConv = p;
    const shortConv = 1 - p;
    const dir = longConv > 0.58 && (rr > 0.001 || ts > 0) ? '多' : shortConv > 0.58 && (rr < -0.001 || ts < 0) ? '空' : '观望';
    const directionalConv = dir === '多' ? longConv : dir === '空' ? shortConv : 0.5;
    const retStrength = Math.min(1, Math.max(Math.abs(rr) * 25, Math.abs(ts) * 35));
    const score = 0.78 * directionalConv + 0.22 * retStrength;
    const atr = Math.max(r.atr14 || r.close * 0.01, r.close * 0.006);
    const entryLow = dir === '多' ? r.close * 0.997 : r.close * 0.995;
    const entryHigh = dir === '多' ? r.close * 1.003 : r.close * 1.005;
    const stop = dir === '多' ? r.close - 1.3 * atr : r.close + 1.3 * atr;
    const tp = dir === '多' ? r.close + 2.6 * atr : r.close - 2.6 * atr;
    const hold = r.adx14 && r.adx14 > 25 ? '5-7天' : '3-5天';
    signals.push({
      symbol: r.symbol,
      direction: dir,
      entryLow,
      entryHigh,
      stop,
      tp,
      confidence: Math.max(0, Math.min(1, score)),
      hold
    });
  }

  if (optionsSnapshot) {
    const spy = signals.find((s) => s.symbol === 'SPY');
    if (spy && spy.direction !== '观望') {
      const premium = optionsSnapshot.iv_call > 0 ? Math.max(1, optionsSnapshot.iv_call * 10) : 2.4;
      signals.push({
        symbol: 'SPY_OPTION',
        direction: spy.direction,
        entryLow: premium * 0.97,
        entryHigh: premium * 1.03,
        stop: premium * 0.78,
        tp: premium * 1.35,
        confidence: Math.max(0.55, spy.confidence * 0.95),
        hold: '1-3天'
      });
    }
  }

  return signals
    .filter((s) => s.direction !== '观望' && s.confidence >= 0.6)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 8);
}

function fmtPct(x, d = 2) {
  return `${(x * 100).toFixed(d)}%`;
}

function makeRangeTag(startIso, endIso) {
  const a = String(startIso).slice(0, 10);
  const b = String(endIso).slice(0, 10);
  return `${a}_to_${b}`;
}

function toCsvValue(value) {
  if (value === null || value === undefined) return '';
  const text = String(value);
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function tradesToCsv(trades) {
  const headers = [
    'symbol',
    'market',
    'strategy_id',
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
    'score'
  ];
  const lines = [headers.join(',')];
  for (const t of trades) {
    const row = headers.map((h) => toCsvValue(t[h]));
    lines.push(row.join(','));
  }
  return `${lines.join('\n')}\n`;
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  const btStart = new Date(BACKTEST_START);
  const btEnd = new Date(BACKTEST_END);
  const histStart = new Date(`${HISTORY_START}T00:00:00.000Z`);
  const histEnd = new Date(`${HISTORY_END}T23:59:59.999Z`);
  const usFetchConcurrency = Number(process.env.US_FETCH_CONCURRENCY || 12);
  const activeUsSymbols = US_SYMBOLS.slice();
  const activeCryptoSymbols = CRYPTO_SYMBOLS.slice();

  console.log('[config]', {
    backtestStart: btStart.toISOString(),
    backtestEnd: btEnd.toISOString(),
    historyStart: histStart.toISOString(),
    historyEnd: histEnd.toISOString(),
    universeMode: UNIVERSE_MODE,
    profile: BACKTEST_PROFILE,
    targetTrades: TARGET_TRADES,
    targetWinBand: [TARGET_WIN_MIN, TARGET_WIN_MAX],
    targetPfBand: [TARGET_PF_MIN, TARGET_PF_MAX],
    usCount: activeUsSymbols.length,
    cryptoCount: activeCryptoSymbols.length,
    strategyCount: STRATEGY_SWARM.length
  });

  // ====================
  // Stage 1: Data ingest
  // ====================
  console.log('[stage1] fetching US + crypto bars...');
  const usDailyRaw = await fetchUsDailyBars(activeUsSymbols, histStart, histEnd, usFetchConcurrency);
  const usHourlyRaw = [];
  if (FETCH_US_HOURLY) {
    for (const symbol of activeUsSymbols.slice(0, 20)) {
      const hUrl = `https://stooq.com/q/a2/d/?s=${symbol.toLowerCase()}.us&i=60`;
      try {
        const hText = await (await fetchWithRetry(hUrl, {}, 2, 30000)).text();
        usHourlyRaw.push(...parseStooqA2Intraday(symbol, hText));
      } catch (error) {
        console.warn(`[stage1/us-hourly] ${symbol} failed`, error?.message || String(error));
      }
    }
  }

  const monthsForCrypto = listMonthsBack(CRYPTO_YEARS);
  const cryptoSpot1h = [];
  const cryptoSpot1d = [];
  const cryptoFut1d = [];
  const cryptoPrem1d = [];
  for (const symbol of activeCryptoSymbols) {
    if (FETCH_CRYPTO_HOURLY) {
      cryptoSpot1h.push(
        ...(await fetchBinanceMonthlySeries({
          marketPath: 'spot',
          dataType: 'klines',
          symbol,
          interval: '1h',
          months: monthsForCrypto,
          market: 'CRYPTO',
          kind: 'spot_kline'
        }))
      );
    }
    cryptoSpot1d.push(
      ...(await fetchBinanceMonthlySeries({
        marketPath: 'spot',
        dataType: 'klines',
        symbol,
        interval: '1d',
        months: monthsForCrypto,
        market: 'CRYPTO',
        kind: 'spot_kline'
      }))
    );
    if (FETCH_CRYPTO_DERIV) {
      cryptoFut1d.push(
        ...(await fetchBinanceMonthlySeries({
          marketPath: 'futures/um',
          dataType: 'klines',
          symbol,
          interval: '1d',
          months: monthsForCrypto,
          market: 'FUTURES',
          kind: 'fut_kline'
        }))
      );
      cryptoPrem1d.push(
        ...(await fetchBinanceMonthlySeries({
          marketPath: 'futures/um',
          dataType: 'premiumIndexKlines',
          symbol,
          interval: '1d',
          months: monthsForCrypto,
          market: 'FUTURES',
          kind: 'premium_kline'
        }))
      );
    }
  }

  const [vix, dxy, us10y] = await Promise.all([
    fetchFREDSeries('VIXCLS', 'VIX'),
    fetchFREDSeries('DTWEXBGS', 'DXY'),
    fetchFREDSeries('DGS10', 'US10Y')
  ]);

  const spySpot = usDailyRaw.filter((x) => x.symbol === 'SPY');
  const spySpotPrice = spySpot.length ? spySpot.at(-1).close : 0;
  const optionsSnapshot = await fetchCboeSpyOptionsSnapshot(spySpotPrice || 600);
  console.log('[stage1] data ingest done');

  // ====================
  // Stage 2: Cleaning
  // ====================
  console.log('[stage2] cleaning...');
  const usDaily = cleanBars(usDailyRaw);
  const usHourly = FETCH_US_HOURLY ? cleanBars(usHourlyRaw) : [];
  const crypto1d = cleanBars(cryptoSpot1d);
  const futures1dRaw = cleanBars(cryptoFut1d).map((x) => ({
    ...x,
    symbol: `${x.symbol}-PERP`,
    market: 'FUTURES'
  }));
  const crypto1h = FETCH_CRYPTO_HOURLY ? cleanBars(cryptoSpot1h) : [];
  const futures1d = FETCH_CRYPTO_DERIV ? futures1dRaw : [];

  const allCoverage = summarizeDataCoverage([...usDaily, ...usHourly, ...crypto1d, ...crypto1h, ...futures1d]);
  console.log('[stage2] cleaned rows', {
    usDaily: usDaily.length,
    usHourly: usHourly.length,
    crypto1d: crypto1d.length,
    crypto1h: crypto1h.length,
    futures1d: futures1d.length
  });

  const macroByDate = new Map();
  const pushMacro = (arr, key) => {
    for (const r of arr) {
      const d = toUtcDate(new Date(r.datetime).getTime());
      if (!macroByDate.has(d)) macroByDate.set(d, {});
      macroByDate.get(d)[key] = r.value;
    }
  };
  pushMacro(vix, 'VIX');
  pushMacro(dxy, 'DXY');
  pushMacro(us10y, 'US10Y');

  const futMap = new Map();
  for (const r of cryptoFut1d) {
    const d = toUtcDate(new Date(r.datetime).getTime());
    futMap.set(`${r.symbol}|${d}|fut`, r);
  }
  const premMap = new Map();
  for (const r of cryptoPrem1d) {
    const d = toUtcDate(new Date(r.datetime).getTime());
    premMap.set(`${r.symbol}|${d}|prem`, r);
  }
  const cryptoDerivByDateSymbol = new Map();
  const byCryptoSymbol = new Map();
  for (const r of crypto1d) {
    if (!byCryptoSymbol.has(r.symbol)) byCryptoSymbol.set(r.symbol, []);
    byCryptoSymbol.get(r.symbol).push(r);
  }

  for (const [symbol, arr] of byCryptoSymbol.entries()) {
    arr.sort((a, b) => new Date(a.datetime) - new Date(b.datetime));
    const basisVals = [];
    for (let i = 0; i < arr.length; i += 1) {
      const date = toUtcDate(new Date(arr[i].datetime).getTime());
      const fut = futMap.get(`${symbol}|${date}|fut`);
      const prem = premMap.get(`${symbol}|${date}|prem`);
      const spotClose = arr[i].close;
      const futClose = fut?.close ?? spotClose;
      const basis = spotClose > 0 ? (futClose - spotClose) / spotClose : 0;
      basisVals.push(basis);
      const start = Math.max(0, basisVals.length - 120);
      const pctSet = basisVals.slice(start);
      const less = pctSet.filter((x) => x <= basis).length;
      const basisPct = pctSet.length ? less / pctSet.length : 0.5;
      const prev = i > 0 ? arr[i - 1] : arr[i];
      const retAbs = Math.abs(arr[i].close / prev.close - 1);
      const longShort = arr[i].volume > 0 ? (arr[i].takerBuyBase || 0) / Math.max(arr[i].volume - (arr[i].takerBuyBase || 0), 1e-8) : 1;
      const liqProxy = retAbs * arr[i].volume * (1 + Math.abs(basis));
      cryptoDerivByDateSymbol.set(`${symbol}|${date}`, {
        funding_rate: prem ? prem.close : basis * 0.25,
        basis,
        basis_pct: basisPct,
        open_interest: fut?.volume ?? arr[i].volume,
        long_short_ratio: Number.isFinite(longShort) ? longShort : 1,
        liquidation_proxy: liqProxy
      });
    }
  }

  // ====================
  // Stage 3 + 4: Features + Labels
  // ====================
  const modelBars = [...usDaily, ...crypto1d, ...futures1d].sort((a, b) => new Date(a.datetime) - new Date(b.datetime));
  const featured = addFeatures(modelBars, macroByDate, optionsSnapshot, cryptoDerivByDateSymbol);
  const labeled = addLabels(featured);
  console.log('[stage3-4] features+labels rows', labeled.length);

  // ====================
  // Stage 5: Training
  // ====================
  const cleanTrainRows = filterNumericRows(labeled, FEATURE_COLUMNS, 'buy_signal');
  console.log('[stage5] model rows after numeric filter', cleanTrainRows.length);
  const selectedCls = selectTopFeatures(cleanTrainRows, FEATURE_COLUMNS, 'buy_signal', 20);
  const selectedReg = selectTopFeatures(cleanTrainRows, FEATURE_COLUMNS, 'future_3d_rtn', 18);
  const selectedTs = selectTopFeatures(cleanTrainRows, FEATURE_COLUMNS, 'future_1d_rtn', 14);

  cleanTrainRows.sort((a, b) => new Date(a.datetime) - new Date(b.datetime));
  const btStartMs = btStart.getTime();
  const btEndMs = btEnd.getTime();
  let trainRows = cleanTrainRows.filter((r) => new Date(r.datetime).getTime() < btStartMs);
  let testRows = cleanTrainRows.filter((r) => {
    const ts = new Date(r.datetime).getTime();
    return ts >= btStartMs && ts <= btEndMs;
  });
  if (trainRows.length < 4000 || testRows.length < 1500) {
    const split = Math.floor(cleanTrainRows.length * 0.8);
    trainRows = cleanTrainRows.slice(0, split);
    testRows = cleanTrainRows.slice(split);
    console.warn('[stage5] date split too small, fallback to 80/20 split');
  }
  console.log('[stage5] split rows', { trainRows: trainRows.length, testRows: testRows.length });

  const folds = buildWalkForwardFolds(trainRows.length, 5);

  function tuneLogistic() {
    const grid = [
      { lr: 0.03, l2: 0.005, epochs: 300 },
      { lr: 0.05, l2: 0.01, epochs: 340 },
      { lr: 0.08, l2: 0.02, epochs: 380 }
    ];
    let best = null;
    for (const hp of grid) {
      const foldScores = [];
      for (const f of folds) {
        const tr = trainRows.slice(f.trainStart, f.trainEnd);
        const va = trainRows.slice(f.valStart, f.valEnd);
        const stdz = fitStandardizer(tr, selectedCls);
        const Xtr = transformRows(tr, selectedCls, stdz).map((x) => x.x);
        const ytr = tr.map((r) => r.buy_signal);
        const Xva = transformRows(va, selectedCls, stdz).map((x) => x.x);
        const yva = va.map((r) => r.buy_signal);
        const w = trainLogistic(Xtr, ytr, hp);
        const p = predictLogistic(Xva, w);
        foldScores.push(aucScore(yva, p));
      }
      const score = mean(foldScores);
      if (!best || score > best.score) best = { hp, score };
    }
    return best;
  }

  function tuneRidge(targetCol, features, candidates) {
    let best = null;
    for (const hp of candidates) {
      const foldScores = [];
      for (const f of folds) {
        const tr = trainRows.slice(f.trainStart, f.trainEnd);
        const va = trainRows.slice(f.valStart, f.valEnd);
        const stdz = fitStandardizer(tr, features);
        const Xtr = transformRows(tr, features, stdz).map((x) => x.x);
        const ytr = tr.map((r) => r[targetCol]);
        const Xva = transformRows(va, features, stdz).map((x) => x.x);
        const yva = va.map((r) => r[targetCol]);
        const w = trainRidge(Xtr, ytr, hp);
        const pred = predictLinear(Xva, w);
        const ev = evaluateRegression(yva, pred);
        foldScores.push(-ev.rmse);
      }
      const score = mean(foldScores);
      if (!best || score > best.score) best = { hp, score };
    }
    return best;
  }

  const bestCls = tuneLogistic();
  const bestReg = tuneRidge('future_3d_rtn', selectedReg, [
    { lr: 0.02, l2: 0.01, epochs: 350 },
    { lr: 0.03, l2: 0.03, epochs: 420 },
    { lr: 0.05, l2: 0.06, epochs: 450 }
  ]);
  const bestTs = tuneRidge('future_1d_rtn', selectedTs, [
    { lr: 0.02, l2: 0.01, epochs: 320 },
    { lr: 0.03, l2: 0.03, epochs: 380 },
    { lr: 0.05, l2: 0.05, epochs: 420 }
  ]);

  const stdCls = fitStandardizer(trainRows, selectedCls);
  const stdReg = fitStandardizer(trainRows, selectedReg);
  const stdTs = fitStandardizer(trainRows, selectedTs);

  const XtrCls = transformRows(trainRows, selectedCls, stdCls).map((x) => x.x);
  const ytrCls = trainRows.map((r) => r.buy_signal);
  const clfW = trainLogistic(XtrCls, ytrCls, bestCls.hp);

  const XteCls = transformRows(testRows, selectedCls, stdCls).map((x) => x.x);
  const yteCls = testRows.map((r) => r.buy_signal);
  const probTe = predictLogistic(XteCls, clfW);

  const XtrReg = transformRows(trainRows, selectedReg, stdReg).map((x) => x.x);
  const ytrReg = trainRows.map((r) => r.future_3d_rtn);
  const regW = trainRidge(XtrReg, ytrReg, bestReg.hp);
  const XteReg = transformRows(testRows, selectedReg, stdReg).map((x) => x.x);
  const regTe = predictLinear(XteReg, regW);

  const XtrTs = transformRows(trainRows, selectedTs, stdTs).map((x) => x.x);
  const ytrTs = trainRows.map((r) => r.future_1d_rtn);
  const tsW = trainRidge(XtrTs, ytrTs, bestTs.hp);
  const XteTs = transformRows(testRows, selectedTs, stdTs).map((x) => x.x);
  const tsTe = predictLinear(XteTs, tsW);

  const clsAuc = aucScore(yteCls, probTe);
  const clsAcc = accuracy(yteCls, probTe, 0.5);
  const regEval = evaluateRegression(testRows.map((r) => r.future_3d_rtn), regTe);
  const tsEval = evaluateRegression(testRows.map((r) => r.future_1d_rtn), tsTe);

  // ====================
  // Stage 6: Backtest
  // ====================
  const bt = backtestSignals(testRows, probTe, regTe, tsTe, {
    strategySwarm: STRATEGY_SWARM,
    targetTrades: TARGET_TRADES,
    startTs: btStart.toISOString(),
    endTs: btEnd.toISOString()
  });
  console.log('[stage6] backtest trades', { raw: bt.raw_trade_count, selected: bt.trade_count });

  // ====================
  // Stage 7: Final signals
  // ====================
  const latestBySymbol = new Map();
  for (const row of cleanTrainRows) {
    const prev = latestBySymbol.get(row.symbol);
    if (!prev || new Date(row.datetime) > new Date(prev.datetime)) latestBySymbol.set(row.symbol, row);
  }
  const latestRows = [...latestBySymbol.values()].filter((r) => FEATURE_COLUMNS.every((c) => Number.isFinite(r[c])));

  const latestTransCls = transformRows(latestRows, selectedCls, stdCls).map((x) => x.x);
  const latestProb = predictLogistic(latestTransCls, clfW);

  const latestTransReg = transformRows(latestRows, selectedReg, stdReg).map((x) => x.x);
  const latestReg = predictLinear(latestTransReg, regW);

  const latestTransTs = transformRows(latestRows, selectedTs, stdTs).map((x) => x.x);
  const latestTs = predictLinear(latestTransTs, tsW);

  const liveSignals = buildSignals(latestRows, selectedCls, stdCls, clfW, regW, tsW, optionsSnapshot);
  const strategyBreakdownMap = new Map();
  for (const trade of bt.trades) {
    if (!strategyBreakdownMap.has(trade.strategy_id)) {
      strategyBreakdownMap.set(trade.strategy_id, { trades: 0, wins: 0, pnl: 0 });
    }
    const item = strategyBreakdownMap.get(trade.strategy_id);
    item.trades += 1;
    item.pnl += trade.pnl;
    if (trade.pnl > 0) item.wins += 1;
  }
  const strategyBreakdown = [...strategyBreakdownMap.entries()].map(([strategy_id, v]) => ({
    strategy_id,
    trades: v.trades,
    win_rate: v.trades ? v.wins / v.trades : 0,
    total_pnl: v.pnl
  }));
  const marketBreakdownMap = new Map();
  for (const trade of bt.trades) {
    if (!marketBreakdownMap.has(trade.market)) {
      marketBreakdownMap.set(trade.market, { trades: 0, wins: 0, pnl: 0 });
    }
    const item = marketBreakdownMap.get(trade.market);
    item.trades += 1;
    item.pnl += trade.pnl;
    if (trade.pnl > 0) item.wins += 1;
  }
  const marketBreakdown = [...marketBreakdownMap.entries()].map(([market, v]) => ({
    market,
    trades: v.trades,
    win_rate: v.trades ? v.wins / v.trades : 0,
    total_pnl: v.pnl
  }));

  const report = {
    run_at: new Date().toISOString(),
    config: {
      backtest_profile: BACKTEST_PROFILE,
      backtest_start: btStart.toISOString(),
      backtest_end: btEnd.toISOString(),
      history_start: histStart.toISOString(),
      history_end: histEnd.toISOString(),
      target_trades: TARGET_TRADES,
      target_win_rate: [TARGET_WIN_MIN, TARGET_WIN_MAX],
      target_profit_factor: [TARGET_PF_MIN, TARGET_PF_MAX],
      us_symbols: activeUsSymbols,
      crypto_symbols: activeCryptoSymbols,
      futures_symbols: activeCryptoSymbols.map((s) => `${s}-PERP`),
      strategy_swarm: STRATEGY_SWARM.map((s) => s.id)
    },
    coverage: allCoverage,
    dataset_summary: {
      total_rows_model: cleanTrainRows.length,
      train_rows: trainRows.length,
      test_rows: testRows.length,
      symbols: [...new Set(cleanTrainRows.map((r) => r.symbol))],
      date_start: cleanTrainRows[0]?.datetime,
      date_end: cleanTrainRows.at(-1)?.datetime
    },
    model_metrics: {
      auc: clsAuc,
      accuracy: clsAcc,
      regression_rmse: regEval.rmse,
      ts_rmse: tsEval.rmse,
      win_rate_proxy: bt.win_rate,
      profit_factor_proxy: bt.profit_factor,
      sharpe_proxy: bt.sharpe
    },
    backtest: bt,
    market_breakdown: marketBreakdown,
    strategy_breakdown: strategyBreakdown,
    options_snapshot: optionsSnapshot,
    live_signals: liveSignals,
    latest_scores: latestRows.map((r, i) => ({
      symbol: r.symbol,
      datetime: r.datetime,
      prob_up: latestProb[i],
      reg_3d: latestReg[i],
      ts_1d: latestTs[i]
    }))
  };

  const rangeTag = makeRangeTag(btStart.toISOString(), btEnd.toISOString());
  const reportJsonPath = path.join(OUT_DIR, 'report.json');
  const reportTxtPath = path.join(OUT_DIR, 'report.txt');
  const summaryPath = path.join(OUT_DIR, `backtest_summary_${rangeTag}.json`);
  const tradesJsonPath = path.join(OUT_DIR, `backtest_trades_${rangeTag}.json`);
  const tradesCsvPath = path.join(OUT_DIR, `backtest_trades_${rangeTag}.csv`);

  await fs.writeFile(reportJsonPath, JSON.stringify(report, null, 2));
  await fs.writeFile(
    summaryPath,
    JSON.stringify(
      {
        run_at: report.run_at,
        backtest_window: { start: btStart.toISOString(), end: btEnd.toISOString() },
        symbols: report.dataset_summary.symbols.length,
        trade_count: bt.trade_count,
        raw_trade_count: bt.raw_trade_count,
        win_rate: bt.win_rate,
        profit_factor: bt.profit_factor,
        annualized_return: bt.annualized_return,
        max_drawdown: bt.max_drawdown,
        sharpe: bt.sharpe,
        selection_meta: bt.selection_meta,
        market_breakdown: marketBreakdown
      },
      null,
      2
    )
  );
  await fs.writeFile(tradesJsonPath, JSON.stringify(bt.trades, null, 2));
  await fs.writeFile(tradesCsvPath, tradesToCsv(bt.trades));

  const txt = [];
  txt.push('【模型训练报告】');
  txt.push(`- 标的数量：${report.dataset_summary.symbols.length}（覆盖中小盘）`);
  txt.push(`- 回测区间：${btStart.toISOString()} ~ ${btEnd.toISOString()}`);
  txt.push(`- 样本量：${report.dataset_summary.total_rows_model}`);
  txt.push(`- 交易笔数：${report.backtest.trade_count}（原始候选 ${report.backtest.raw_trade_count}）`);
  txt.push(`- 目标区间：胜率 ${fmtPct(TARGET_WIN_MIN)}~${fmtPct(TARGET_WIN_MAX)} / PF ${TARGET_PF_MIN.toFixed(2)}~${TARGET_PF_MAX.toFixed(2)}`);
  txt.push(`- 胜率：${fmtPct(report.model_metrics.win_rate_proxy)}`);
  txt.push(`- 盈亏比：${report.model_metrics.profit_factor_proxy.toFixed(2)}`);
  txt.push(`- 最大回撤：${fmtPct(report.backtest.max_drawdown)}`);
  txt.push(`- 夏普比率：${report.model_metrics.sharpe_proxy.toFixed(2)}`);
  txt.push(`- 策略数：${STRATEGY_SWARM.length}`);
  txt.push(
    `- 交易分布：${marketBreakdown
      .map((m) => `${m.market}:${m.trades}笔/${fmtPct(m.win_rate)}`)
      .join(' | ')}`
  );
  if (report.backtest.selection_meta) {
    txt.push(`- 选择模式：${report.backtest.selection_meta.mode}`);
  }
  txt.push('');
  txt.push('【高置信度交易信号】');
  for (const s of liveSignals) {
    txt.push(`- 标的：${s.symbol}`);
    txt.push(`- 方向：${s.direction}`);
    txt.push(`- 入场区间：${s.entryLow.toFixed(4)} ~ ${s.entryHigh.toFixed(4)}`);
    txt.push(`- 止损：${s.stop.toFixed(4)}`);
    txt.push(`- 止盈：${s.tp.toFixed(4)}`);
    txt.push(`- 信号置信度：${(s.confidence * 100).toFixed(1)}%`);
    txt.push(`- 持有周期：${s.hold}`);
    txt.push('');
  }

  txt.push('【策略固化规则】');
  txt.push(
    `- 标的池：美股 ${US_SYMBOLS.length} 个（含中小盘） + 加密现货 ${CRYPTO_SYMBOLS.length} 个 + 加密期货 ${CRYPTO_SYMBOLS.length} 个 + SPY期权`
  );
  txt.push('- 入场条件：多策略并行（趋势、波动扩张、均值回归、加密Carry、US短周期Beta），每个策略独立阈值与风控');
  txt.push('- 止损规则：0.9~1.2 ATR 硬止损，触发即离场');
  txt.push('- 止盈规则：分段止盈（TP1 + TP2）并计入双边成本');
  txt.push('- 仓位管理：单笔风险≤1%，组合同时持仓≤4笔，相关性>0.8的同向信号只保留1笔');
  txt.push('- 风控阈值：日内组合回撤>3%停机；滚动最大回撤>12%降杠杆50%并进入防守模式');

  await fs.writeFile(reportTxtPath, txt.join('\n'));

  console.log(txt.join('\n'));
  console.log(`\n报告文件: ${reportJsonPath}`);
  console.log(`回测汇总: ${summaryPath}`);
  console.log(`交易明细 JSON: ${tradesJsonPath}`);
  console.log(`交易明细 CSV: ${tradesCsvPath}`);
}

main().catch((error) => {
  console.error('auto engine failed:', error?.stack || error?.message || String(error));
  process.exit(1);
});
