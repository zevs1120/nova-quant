import { pathToFileURL } from 'node:url';
import {
  flushRuntimeRepoMirror,
  getRuntimeRepo,
  resetRuntimeRepoSingleton,
} from '../src/server/db/runtimeRepository.js';
import { runQlibResearchFactoryJob } from '../src/server/jobs/qlibResearchFactory.js';
import { checkQlibHealth } from '../src/server/nova/qlibClient.js';
import type { Market } from '../src/server/types.js';

type CliOptions = {
  userId: string | null;
  market: Market;
  symbols: string[];
  modelName: string | null | undefined;
  benchmark: string | null | undefined;
  lookbackDays: number | undefined;
  maxSymbols: number | undefined;
  runNativeBacktest: boolean | undefined;
  requireHealthyBridge: boolean | undefined;
  force: boolean;
};

function parseCsv(value: string | undefined): string[] {
  return String(value || '')
    .split(',')
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean);
}

function parseMarket(value: string | undefined): Market {
  return String(value || 'US').toUpperCase() === 'CRYPTO' ? 'CRYPTO' : 'US';
}

function parseNumber(value: string | undefined): number | undefined {
  const out = Number(value);
  return Number.isFinite(out) && out > 0 ? out : undefined;
}

function printHelp() {
  console.log(`Usage:
  npm exec tsx -- scripts/run-qlib-research-factory.ts [options]

Options:
  --user <id>                 user id stored on workflow/artifacts
  --market <US|CRYPTO>        market universe, default US
  --symbols <AAPL,NVDA,SPY>   explicit universe
  --max-symbols <n>           cap repository-selected universe
  --lookback-days <n>         factor/backtest lookback, min enforced by job
  --model <name>              optional Qlib model prediction endpoint name
  --no-model                  do not call Qlib model prediction
  --benchmark <symbol>        native backtest benchmark
  --no-native                 skip Qlib-native backtest
  --require-healthy-bridge    skip cleanly when Qlib bridge health check fails
  --force                     run even when bridge is disabled/unhealthy
  --help                      show this message`);
}

export function parseQlibResearchFactoryCliArgs(argv: string[]): CliOptions {
  const out: CliOptions = {
    userId: String(process.env.NOVA_DEFAULT_USER_ID || '').trim() || null,
    market: parseMarket(process.env.NOVA_QLIB_FACTORY_MARKET),
    symbols: parseCsv(process.env.NOVA_QLIB_SYMBOLS),
    modelName: undefined,
    benchmark: undefined,
    lookbackDays: undefined,
    maxSymbols: undefined,
    runNativeBacktest: undefined,
    requireHealthyBridge: undefined,
    force: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const [rawKey, inlineValue] = token.slice(2).split('=');
    const key = rawKey.trim();
    const next = inlineValue ?? argv[i + 1];
    const consumeNext = inlineValue === undefined && next && !next.startsWith('--');

    if (key === 'help') {
      printHelp();
      process.exit(0);
    }
    if (key === 'user' && next) out.userId = String(next).trim() || out.userId;
    if (key === 'market' && next) out.market = parseMarket(String(next));
    if (key === 'symbols' && next) out.symbols = parseCsv(String(next));
    if (key === 'max-symbols' && next) out.maxSymbols = parseNumber(String(next));
    if (key === 'lookback-days' && next) out.lookbackDays = parseNumber(String(next));
    if (key === 'model' && next) out.modelName = String(next).trim() || null;
    if (key === 'no-model') out.modelName = null;
    if (key === 'benchmark' && next) out.benchmark = String(next).trim().toUpperCase() || null;
    if (key === 'no-native') out.runNativeBacktest = false;
    if (key === 'native') out.runNativeBacktest = true;
    if (key === 'require-healthy-bridge') out.requireHealthyBridge = true;
    if (key === 'force') out.force = true;

    if (consumeNext) i += 1;
  }

  return out;
}

export async function runQlibResearchFactoryCli(argv = process.argv.slice(2)) {
  const options = parseQlibResearchFactoryCliArgs(argv);
  if (options.requireHealthyBridge && !options.force) {
    const healthy = await checkQlibHealth();
    if (!healthy) {
      const skipped = {
        skipped: true,
        reason: 'qlib_bridge_unhealthy',
        workflow_id: null,
        generation_summary: { candidates_registered: 0, candidate_ids: [] },
        evaluation_summary: { evaluated: 0, pass: 0, watch: 0, reject: 0 },
      };
      console.log(JSON.stringify(skipped, null, 2));
      return skipped;
    }
  }

  const repo = getRuntimeRepo();
  try {
    const output = await runQlibResearchFactoryJob({
      repo,
      userId: options.userId,
      triggerType: 'manual',
      market: options.market,
      symbols: options.symbols.length ? options.symbols : undefined,
      modelName: options.modelName,
      benchmark: options.benchmark,
      lookbackDays: options.lookbackDays,
      maxSymbols: options.maxSymbols,
      runNativeBacktest: options.runNativeBacktest,
      requireHealthyBridge: options.requireHealthyBridge,
      force: options.force,
    });
    console.log(JSON.stringify(output, null, 2));
    return output;
  } finally {
    await flushRuntimeRepoMirror();
    resetRuntimeRepoSingleton();
  }
}

const isEntrypoint = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntrypoint) {
  runQlibResearchFactoryCli().catch((error) => {
    console.error(
      JSON.stringify(
        {
          skipped: true,
          reason: 'qlib_research_factory_cli_failed',
          error: error instanceof Error ? error.message : String(error),
        },
        null,
        2,
      ),
    );
    process.exitCode = 1;
  });
}
