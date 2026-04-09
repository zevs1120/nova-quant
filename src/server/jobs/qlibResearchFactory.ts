import { getConfig } from '../config.js';
import type { MarketRepository } from '../db/repository.js';
import { checkQlibHealth } from '../nova/qlibClient.js';
import { runQlibResearchFactory } from '../research/qlibFactory.js';
import type { Market } from '../types.js';

type QlibResearchFactoryJobArgs = {
  repo: MarketRepository;
  userId?: string | null;
  triggerType?: 'scheduled' | 'manual';
  market?: Market;
  symbols?: string[];
  modelName?: string | null;
  benchmark?: string | null;
  lookbackDays?: number;
  maxSymbols?: number;
  runNativeBacktest?: boolean;
  requireHealthyBridge?: boolean;
  force?: boolean;
};

function parseBooleanEnv(value: string | undefined, fallback: boolean) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase();
  if (!normalized) return fallback;
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function parseCsvEnv(value: string | undefined) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean);
}

function dateDaysAgo(end: Date, days: number) {
  const date = new Date(end.getTime());
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

function latestRepoDate(repo: MarketRepository, market: Market, symbols: string[]) {
  const dates = symbols
    .map((symbol) => {
      const asset = repo.getAssetBySymbol(market, symbol);
      if (!asset) return null;
      return repo.getLatestTsOpen(asset.asset_id, '1d');
    })
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  const latest = dates.length ? Math.max(...dates) : null;
  return latest ? new Date(latest).toISOString().slice(0, 10) : null;
}

function rankedSymbolsWithDailyBars(repo: MarketRepository, market: Market, maxSymbols: number) {
  return repo
    .listAssets(market)
    .filter((asset) => asset.status === 'ACTIVE')
    .map((asset) => ({
      symbol: asset.symbol.toUpperCase(),
      latestTsOpen: repo.getLatestTsOpen(asset.asset_id, '1d') || 0,
      stats: repo.getOhlcvStats(asset.asset_id, '1d'),
    }))
    .filter((row) => row.latestTsOpen > 0 && row.stats.bar_count >= 80)
    .sort((a, b) => b.latestTsOpen - a.latestTsOpen || a.symbol.localeCompare(b.symbol))
    .slice(0, maxSymbols)
    .map((row) => row.symbol);
}

function resolveSymbols(args: QlibResearchFactoryJobArgs) {
  const cfg = getConfig();
  const market = args.market || 'US';
  const maxSymbols = Math.max(
    2,
    args.maxSymbols || Number(process.env.NOVA_QLIB_FACTORY_MAX_SYMBOLS || 32),
  );
  const explicit = args.symbols?.length ? args.symbols : parseCsvEnv(process.env.NOVA_QLIB_SYMBOLS);
  if (explicit.length) {
    return {
      market,
      symbols: [...new Set(explicit)].slice(0, maxSymbols),
      universeSource: 'explicit',
    };
  }

  const repoSymbols = rankedSymbolsWithDailyBars(args.repo, market, maxSymbols);
  if (repoSymbols.length >= 2) {
    return {
      market,
      symbols: repoSymbols,
      universeSource: 'repository_daily_bars',
    };
  }

  const fallback = market === 'CRYPTO' ? cfg.markets.CRYPTO.symbols : cfg.markets.US.symbols;
  return {
    market,
    symbols: fallback.slice(0, maxSymbols).map((symbol) => symbol.toUpperCase()),
    universeSource: 'config_fallback',
  };
}

export async function runQlibResearchFactoryJob(args: QlibResearchFactoryJobArgs) {
  const cfg = getConfig();
  const bridgeEnabled = cfg.qlibBridge?.enabled === true;
  if (!bridgeEnabled && !args.force) {
    return {
      skipped: true,
      reason: 'qlib_bridge_disabled',
      workflow_id: null,
      generation_summary: { candidates_registered: 0, candidate_ids: [] },
      evaluation_summary: { evaluated: 0, pass: 0, watch: 0, reject: 0 },
    };
  }

  const requireHealthyBridge =
    args.requireHealthyBridge ??
    parseBooleanEnv(process.env.NOVA_QLIB_FACTORY_REQUIRE_HEALTHY_BRIDGE, false);
  if (requireHealthyBridge) {
    const healthy = await checkQlibHealth();
    if (!healthy && !args.force) {
      return {
        skipped: true,
        reason: 'qlib_bridge_unhealthy',
        workflow_id: null,
        generation_summary: { candidates_registered: 0, candidate_ids: [] },
        evaluation_summary: { evaluated: 0, pass: 0, watch: 0, reject: 0 },
      };
    }
  }

  const { market, symbols, universeSource } = resolveSymbols(args);
  const endDate =
    latestRepoDate(args.repo, market, symbols) ||
    new Date(Date.now() - 24 * 3600 * 1000).toISOString().slice(0, 10);
  const lookbackDays = Math.max(
    30,
    args.lookbackDays || Number(process.env.NOVA_QLIB_FACTORY_LOOKBACK_DAYS || 252),
  );
  const startDate = dateDaysAgo(new Date(`${endDate}T00:00:00.000Z`), lookbackDays);
  const runNativeBacktest =
    args.runNativeBacktest ??
    parseBooleanEnv(process.env.NOVA_QLIB_FACTORY_RUN_NATIVE_BACKTEST, true);
  const modelName =
    args.modelName !== undefined
      ? args.modelName
      : String(process.env.NOVA_QLIB_MODEL_NAME || '').trim() || null;

  const output = await runQlibResearchFactory(args.repo, {
    symbols,
    startDate,
    endDate,
    predictDate: endDate,
    factorSet: 'Alpha158',
    modelName,
    market,
    assetClass: market === 'CRYPTO' ? 'CRYPTO' : 'US_STOCK',
    benchmark: args.benchmark ?? (market === 'US' ? 'SPY' : null),
    topk: Number(process.env.NOVA_QLIB_FACTORY_TOPK || 10),
    nDrop: Number(process.env.NOVA_QLIB_FACTORY_N_DROP || 2),
    runNativeBacktest,
    evaluateCandidates: true,
    reviewPromotion: true,
    triggerType: args.triggerType || 'scheduled',
    userId: args.userId || null,
  });

  return {
    ...output,
    job_context: {
      market,
      universe_source: universeSource,
      symbols,
      start_date: startDate,
      end_date: endDate,
      model_name: modelName,
      run_native_backtest: runNativeBacktest,
    },
  };
}
