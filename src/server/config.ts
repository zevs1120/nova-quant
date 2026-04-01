import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import type { AppConfig } from './types.js';

dotenv.config();

const DEFAULT_CONFIG_PATH = process.env.INGEST_CONFIG_PATH || 'config/ingestion.config.json';

function resolvePostgresBusinessUrl() {
  const url = String(
    process.env.NOVA_DATA_DATABASE_URL ||
      process.env.SUPABASE_DB_URL ||
      process.env.DATABASE_URL ||
      process.env.NOVA_AUTH_DATABASE_URL ||
      '',
  ).trim();
  if (url) return url;
  const isVitestRuntime =
    Boolean(process.env.VITEST || process.env.VITEST_WORKER_ID) ||
    process.env.NODE_ENV === 'test' ||
    process.argv.some((arg) => arg.toLowerCase().includes('vitest'));
  return isVitestRuntime ? 'postgres://supabase-test-host/db' : '';
}

function buildFallbackConfig(): AppConfig {
  const url = resolvePostgresBusinessUrl();
  if (!url) {
    throw new Error(
      'NOVA_DATA_DATABASE_URL (or another Postgres business URL source) is required because local database runtimes have been removed.',
    );
  }
  return {
    database: {
      driver: 'postgres',
      url,
      schema:
        String(process.env.NOVA_DATA_PG_SCHEMA || 'novaquant_data').trim() || 'novaquant_data',
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
    qlibBridge: {
      enabled:
        String(process.env.QLIB_BRIDGE_ENABLED || 'false')
          .trim()
          .toLowerCase() === 'true',
      baseUrl: (process.env.QLIB_BRIDGE_URL || 'http://127.0.0.1:8788').replace(/\/$/, ''),
      timeoutMs: Number(process.env.QLIB_BRIDGE_TIMEOUT_MS) || 20000,
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
  const url = resolvePostgresBusinessUrl();
  if (!url) {
    throw new Error(
      'NOVA_DATA_DATABASE_URL (or another Postgres business URL source) is required because local database runtimes have been removed.',
    );
  }
  config.database = {
    driver: 'postgres',
    url,
    schema: String(process.env.NOVA_DATA_PG_SCHEMA || 'novaquant_data').trim() || 'novaquant_data',
  };

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

  if (!config.qlibBridge) {
    config.qlibBridge = {
      enabled:
        String(process.env.QLIB_BRIDGE_ENABLED || 'false')
          .trim()
          .toLowerCase() === 'true',
      baseUrl: (process.env.QLIB_BRIDGE_URL || 'http://127.0.0.1:8788').replace(/\/$/, ''),
      timeoutMs: Number(process.env.QLIB_BRIDGE_TIMEOUT_MS) || 20000,
    };
  }

  cached = config;
  return config;
}

export function resetConfigCache(): void {
  cached = null;
}

export function resolveDbPath(): string {
  throw new Error(
    'BUSINESS_RUNTIME_POSTGRES_ONLY: resolveDbPath() is unavailable because local database runtimes have been removed.',
  );
}
