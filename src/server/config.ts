import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import type { AppConfig } from './types.js';

dotenv.config();

const DEFAULT_CONFIG_PATH = process.env.INGEST_CONFIG_PATH || 'config/ingestion.config.json';

function buildFallbackConfig(): AppConfig {
  return {
    database: {
      driver: 'sqlite',
      path: './data/quant.db',
    },
    markets: {
      US: {
        venue: 'STOOQ',
        symbols: [
          'SPY',
          'QQQ',
          'IWM',
          'DIA',
          'XLK',
          'XLF',
          'XLE',
          'XLV',
          'XLI',
          'XLY',
          'XLP',
          'XLU',
          'XLB',
          'XLC',
          'SMH',
          'SOXX',
          'TLT',
          'GLD',
          'SLV',
          'AAPL',
          'MSFT',
          'NVDA',
          'AMZN',
          'GOOGL',
          'META',
          'TSLA',
          'AMD',
          'AVGO',
          'NFLX',
          'JPM',
          'GS',
          'BAC',
          'WFC',
          'MS',
          'COIN',
          'MSTR',
          'PLTR',
          'CRM',
          'ORCL',
          'MU',
          'UBER',
        ],
      },
      CRYPTO: {
        venue: 'BINANCE_UM',
        symbols: [
          'BTCUSDT',
          'ETHUSDT',
          'SOLUSDT',
          'BNBUSDT',
          'XRPUSDT',
          'ADAUSDT',
          'DOGEUSDT',
          'LINKUSDT',
          'AVAXUSDT',
          'SUIUSDT',
        ],
      },
    },
    serviceEnvelope: {
      targetActiveClients: 50,
      targetDailySymbols: 50,
      targetDailyActionCards: {
        conservative: 10,
        balanced: 12,
        aggressive: 15,
        min: 10,
        max: 15,
      },
    },
    timeframes: ['5m', '1h', '1d'],
    stooq: {
      baseUrl: 'https://stooq.com',
      bulkPackCodes: {
        '1d': 'd_us_txt',
        '1h': 'h_us_txt',
        '5m': '5_us_txt',
      },
      timeoutMs: 120000,
      batchSize: 2000,
    },
    yahoo: {
      baseUrl: 'https://query1.finance.yahoo.com',
      range: '10y',
      intervals: {
        '1d': '1d',
      },
      timeoutMs: 30000,
      concurrency: 2,
    },
    nasdaq: {
      baseUrl: 'https://api.nasdaq.com/api',
      limit: 120,
      timeoutMs: 30000,
    },
    binancePublic: {
      baseUrl: 'https://data.binance.vision',
      pathPrefix: 'data/futures/um',
      startDate: '2020-01-01',
      lookbackDailyDays: 12,
      concurrency: 3,
    },
    binanceRest: {
      baseUrl: 'https://fapi.binance.com',
      limit: 200,
      requestDelayMs: 250,
      retry: {
        attempts: 4,
        baseDelayMs: 600,
      },
    },
    binanceDerivatives: {
      historyLimit: 90,
      requestDelayMs: 180,
      timeoutMs: 12000,
    },
    alphaDiscovery: {
      enabled: true,
      schedule: 'every-4-hours',
      maxCandidatesPerCycle: 64,
      searchBudget: 36,
      minAcceptanceScore: 0.64,
      familyCoverageTargets: {
        trend_continuation_refinement: 18,
        mean_reversion_refinement: 8,
        volatility_expansion_compression: 8,
        liquidity_volume_regime_filter: 12,
        cross_asset_lead_lag: 6,
        funding_basis_perp_structure: 6,
        confidence_calibration_overlay: 6,
      },
      shadowAdmissionThresholds: {
        minAcceptanceScore: 0.56,
        maxDrawdown: 0.28,
      },
      shadowPromotionThresholds: {
        minSampleSize: 10,
        minSharpe: 0.45,
        minExpectancy: 0.0015,
        maxDrawdown: 0.18,
        maxCorrelation: 0.8,
        minApprovalRate: 0.45,
      },
      retirementThresholds: {
        minExpectancy: -0.002,
        maxDrawdown: 0.22,
        decayStreakLimit: 3,
      },
    },
    massive: {
      baseUrl: 'https://api.massive.com',
      apiKey: process.env.MASSIVE_API_KEY || '',
      timeoutMs: 30000,
      requestDelayMs: 12000,
      retry: {
        attempts: 3,
        baseDelayMs: 1000,
      },
      defaultLookbackDays: 365,
    },
  };
}

function readConfigFile(configPath: string): AppConfig {
  const absolute = path.isAbsolute(configPath) ? configPath : path.join(process.cwd(), configPath);
  try {
    const text = fs.readFileSync(absolute, 'utf-8');
    return JSON.parse(text) as AppConfig;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException | undefined)?.code || '';
    if (code === 'ENOENT' || process.env.VERCEL === '1') {
      return buildFallbackConfig();
    }
    throw error;
  }
}

let cached: AppConfig | null = null;

export function getConfig(): AppConfig {
  if (cached) return cached;

  const config = readConfigFile(DEFAULT_CONFIG_PATH);
  if (process.env.DB_PATH) {
    config.database.path = process.env.DB_PATH;
  } else if (process.env.VITEST_WORKER_ID) {
    config.database.path = path.join(
      process.cwd(),
      '.tmp',
      `nova-quant-test-${process.env.VITEST_WORKER_ID}.db`,
    );
  } else if (process.env.VERCEL === '1') {
    // Vercel serverless functions can only write to the ephemeral /tmp volume.
    config.database.path = '/tmp/nova-quant/quant.db';
  }

  if (process.env.CRYPTO_SYMBOLS) {
    config.markets.CRYPTO.symbols = process.env.CRYPTO_SYMBOLS.split(',')
      .map((x) => x.trim())
      .filter(Boolean);
  }

  if (process.env.US_SYMBOLS) {
    config.markets.US.symbols = process.env.US_SYMBOLS.split(',')
      .map((x) => x.trim())
      .filter(Boolean);
  }

  cached = config;
  return config;
}

export function resolveDbPath(): string {
  const config = getConfig();
  const dbPath = config.database.path;
  return path.isAbsolute(dbPath) ? dbPath : path.join(process.cwd(), dbPath);
}
