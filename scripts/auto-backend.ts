import { spawn, type ChildProcess } from 'node:child_process';
import net from 'node:net';
import { pathToFileURL } from 'node:url';
import { getDb } from '../src/server/db/database.js';
import { MarketRepository } from '../src/server/db/repository.js';
import { ensureSchema } from '../src/server/db/schema.js';
import { runBackfillCli } from '../src/server/jobs/backfill.js';
import { runFreeDataFlywheel } from '../src/server/jobs/freeData.js';
import { runNovaTrainingFlywheel, type NovaTrainerKind } from '../src/server/nova/flywheel.js';
import { runValidationCli } from '../src/server/jobs/validate.js';
import { runEvolutionCycle } from '../src/server/quant/evolution.js';
import { ensureQuantData } from '../src/server/quant/service.js';

type AutoBackendOptions = {
  userId: string;
  apiPort: number;
  deriveIntervalSec: number;
  validateEvery: number;
  usRefreshHours: number;
  retrainHours: number;
  trainEveryHours: number;
  trainer: NovaTrainerKind;
  trainingLimit: number;
  executeTraining: boolean;
  supervisorCheckSec: number;
  skipInit: boolean;
  skipApi: boolean;
  skipWorker: boolean;
  skipTraining: boolean;
  once: boolean;
};

const DEFAULTS: AutoBackendOptions = {
  userId: 'guest-default',
  apiPort: Number(process.env.PORT || 8787),
  deriveIntervalSec: 300,
  validateEvery: 6,
  usRefreshHours: 6,
  retrainHours: 24,
  trainEveryHours: 24,
  trainer: 'mlx-lora',
  trainingLimit: 500,
  executeTraining: false,
  supervisorCheckSec: 20,
  skipInit: false,
  skipApi: false,
  skipWorker: false,
  skipTraining: false,
  once: false
};

export function parseAutoBackendArgs(argv: string[]): AutoBackendOptions {
  const out = { ...DEFAULTS };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const [rawKey, inlineValue] = token.slice(2).split('=');
    const key = rawKey.trim();
    const next = inlineValue ?? argv[i + 1];
    const consumeNext = inlineValue === undefined && next && !next.startsWith('--');

    if (key === 'user' && next) out.userId = String(next).trim() || out.userId;
    if (key === 'port' && next) out.apiPort = Math.max(1, Number(next) || out.apiPort);
    if (key === 'derive-interval-sec' && next) out.deriveIntervalSec = Math.max(30, Number(next) || out.deriveIntervalSec);
    if (key === 'validate-every' && next) out.validateEvery = Math.max(1, Number(next) || out.validateEvery);
    if (key === 'us-refresh-hours' && next) out.usRefreshHours = Math.max(1, Number(next) || out.usRefreshHours);
    if (key === 'retrain-hours' && next) out.retrainHours = Math.max(1, Number(next) || out.retrainHours);
    if (key === 'train-hours' && next) out.trainEveryHours = Math.max(1, Number(next) || out.trainEveryHours);
    if (key === 'trainer' && next) out.trainer = String(next).trim() as NovaTrainerKind;
    if (key === 'training-limit' && next) out.trainingLimit = Math.max(1, Number(next) || out.trainingLimit);
    if (key === 'supervisor-check-sec' && next) out.supervisorCheckSec = Math.max(5, Number(next) || out.supervisorCheckSec);
    if (key === 'execute-training') out.executeTraining = true;
    if (key === 'skip-init') out.skipInit = true;
    if (key === 'skip-api') out.skipApi = true;
    if (key === 'skip-worker') out.skipWorker = true;
    if (key === 'skip-training') out.skipTraining = true;
    if (key === 'once') out.once = true;

    if (consumeNext) i += 1;
  }
  return out;
}

function log(message: string, meta?: Record<string, unknown>) {
  if (meta) {
    console.log(`[auto-backend] ${message}`, {
      ...meta,
      ts: new Date().toISOString()
    });
    return;
  }
  console.log(`[auto-backend] ${message}`);
}

function warn(message: string, meta?: Record<string, unknown>) {
  if (meta) {
    console.warn(`[auto-backend] ${message}`, {
      ...meta,
      ts: new Date().toISOString()
    });
    return;
  }
  console.warn(`[auto-backend] ${message}`);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isPortListening(port: number, host = '127.0.0.1'): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ port, host });
    const finalize = (value: boolean) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(1200);
    socket.once('connect', () => finalize(true));
    socket.once('timeout', () => finalize(false));
    socket.once('error', () => finalize(false));
  });
}

function isWorkerLikelyRunning(): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn('pgrep', ['-f', 'scripts/update-binance.ts'], {
      stdio: 'ignore'
    });
    child.once('exit', (code) => resolve(code === 0));
    child.once('error', () => resolve(false));
  });
}

function spawnManaged(label: string, command: string, args: string[], env?: NodeJS.ProcessEnv): ChildProcess {
  log(`starting ${label}`, { command, args: args.join(' ') });
  const child = spawn(command, args, {
    stdio: 'inherit',
    env: {
      ...process.env,
      ...env
    }
  });
  child.once('exit', (code, signal) => {
    log(`${label} exited`, { code: code ?? null, signal: signal ?? null });
  });
  child.once('error', (error) => {
    log(`${label} failed to start`, { error: error.message });
  });
  return child;
}

type ManagedChildren = {
  api: ChildProcess | null;
  worker: ChildProcess | null;
};

async function ensureManagedProcesses(options: AutoBackendOptions, managed: ManagedChildren) {
  if (!options.skipApi) {
    const apiRunning = await isPortListening(options.apiPort);
    if (!apiRunning && !managed.api) {
      managed.api = spawnManaged(
        'api',
        process.execPath,
        ['--import', 'tsx', 'src/server/apiServer.ts'],
        { PORT: String(options.apiPort) }
      );
      managed.api.once('exit', () => {
        managed.api = null;
      });
      managed.api.once('error', () => {
        managed.api = null;
      });
      await sleep(1500);
    }
  }

  if (!options.skipWorker) {
    const workerRunning = await isWorkerLikelyRunning();
    if (!workerRunning && !managed.worker) {
      managed.worker = spawnManaged(
        'binance-worker',
        process.execPath,
        ['--import', 'tsx', 'scripts/update-binance.ts', '--tf', '1h']
      );
      managed.worker.once('exit', () => {
        managed.worker = null;
      });
      managed.worker.once('error', () => {
        managed.worker = null;
      });
      await sleep(1200);
    }
  }
}

async function runNovaTrainingCycle(args: {
  repo: MarketRepository;
  userId: string;
  trainer: NovaTrainerKind;
  trainingLimit: number;
  executeTraining: boolean;
  triggerType: 'scheduled' | 'manual';
}) {
  const result = await runNovaTrainingFlywheel({
    repo: args.repo,
    userId: args.userId,
    trainer: args.trainer,
    onlyIncluded: true,
    limit: args.trainingLimit,
    triggerType: args.triggerType,
    executeWhenReady: args.executeTraining
  });
  log('nova training flywheel finished', {
    trainer: result.training_plan.trainer,
    dataset_count: result.dataset_count,
    ready_for_training: result.ready_for_training,
    execution: result.execution
  });
  return result;
}

export async function runAutoBackendInitialization(options: AutoBackendOptions) {
  const db = getDb();
  ensureSchema(db);
  const repo = new MarketRepository(db);

  log('initial US backfill starting', { market: 'US', timeframe: '1d' });
  try {
    await runBackfillCli(['--market', 'US', '--tf', '1d']);
  } catch (error) {
    warn('initial US backfill failed; continuing with remaining markets', {
      error: error instanceof Error ? error.message : String(error)
    });
  }

  log('initial crypto backfill starting', { market: 'CRYPTO', timeframe: '1h' });
  try {
    await runBackfillCli(['--market', 'CRYPTO', '--tf', '1h']);
  } catch (error) {
    warn('initial crypto backfill failed', {
      error: error instanceof Error ? error.message : String(error)
    });
  }

  log('free data flywheel starting', { market: 'ALL' });
  try {
    const freeData = await runFreeDataFlywheel({
      repo,
      market: 'ALL',
      userId: options.userId,
      triggerType: 'manual'
    });
    log('free data flywheel finished', {
      news: freeData.news,
      crypto_structure: freeData.crypto_structure
    });
  } catch (error) {
    warn('free data flywheel failed; continuing to validation', {
      error: error instanceof Error ? error.message : String(error)
    });
  }

  log('validation starting', { timeframes: '1d,1h' });
  try {
    await runValidationCli(['--tf', '1d,1h', '--lookbackBars', '800']);
  } catch (error) {
    warn('validation failed; continuing to runtime derivation', {
      error: error instanceof Error ? error.message : String(error)
    });
  }

  log('runtime derivation starting', { userId: options.userId });
  let snapshot = ensureQuantData(repo, options.userId, true);
  log('runtime derivation finished', {
    source_status: snapshot.sourceStatus,
    signals: snapshot.signals.length,
    market_state_rows: snapshot.marketState.length
  });

  log('evolution cycle starting', { userId: options.userId });
  const evolution = await runEvolutionCycle({
    repo,
    userId: options.userId,
    runtimeSnapshot: {
      sourceStatus: snapshot.sourceStatus,
      freshnessSummary: snapshot.freshnessSummary,
      coverageSummary: snapshot.coverageSummary
    }
  });
  log('evolution cycle finished', {
    workflow_id: evolution.workflowId,
    markets: evolution.markets.map((row) => ({
      market: row.market,
      promoted: row.promoted,
      rolledBack: row.rolledBack,
      safeMode: row.safeMode
    }))
  });
  if (evolution.markets.some((row) => row.promoted || row.rolledBack || row.safeMode)) {
    snapshot = ensureQuantData(repo, options.userId, true);
    log('runtime derivation refreshed after evolution', {
      source_status: snapshot.sourceStatus,
      signals: snapshot.signals.length,
      market_state_rows: snapshot.marketState.length
    });
  }

  if (!options.skipTraining) {
    try {
      await runNovaTrainingCycle({
        repo,
        userId: options.userId,
        trainer: options.trainer,
        trainingLimit: options.trainingLimit,
        executeTraining: options.executeTraining,
        triggerType: 'manual'
      });
    } catch (error) {
      warn('nova training flywheel failed during initialization', {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
}

export async function runAutoBackendMaintenanceCycle(args: {
  userId: string;
  cycle: number;
  refreshUs: boolean;
  runEvolution: boolean;
  runTraining: boolean;
  trainer: NovaTrainerKind;
  trainingLimit: number;
  executeTraining: boolean;
  skipTraining: boolean;
}) {
  const db = getDb();
  ensureSchema(db);
  const repo = new MarketRepository(db);

  if (args.refreshUs) {
    log('scheduled US refresh starting', { cycle: args.cycle, market: 'US', timeframe: '1d' });
    try {
      await runBackfillCli(['--market', 'US', '--tf', '1d']);
    } catch (error) {
      warn('scheduled US refresh failed; continuing', {
        cycle: args.cycle,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  try {
    const freeData = await runFreeDataFlywheel({
      repo,
      market: 'ALL',
      userId: args.userId,
      triggerType: 'scheduled'
    });
    log('scheduled free data flywheel finished', {
      cycle: args.cycle,
      news: freeData.news,
      crypto_structure: freeData.crypto_structure
    });
  } catch (error) {
    warn('scheduled free data flywheel failed; continuing', {
      cycle: args.cycle,
      error: error instanceof Error ? error.message : String(error)
    });
  }

  log('scheduled validation starting', { cycle: args.cycle, timeframes: '1d,1h' });
  try {
    await runValidationCli(['--tf', '1d,1h', '--lookbackBars', '800']);
  } catch (error) {
    warn('scheduled validation failed; continuing to runtime refresh', {
      cycle: args.cycle,
      error: error instanceof Error ? error.message : String(error)
    });
  }

  let snapshot = ensureQuantData(repo, args.userId, true);
  log('scheduled runtime refresh finished', {
    cycle: args.cycle,
    source_status: snapshot.sourceStatus,
    signals: snapshot.signals.length,
    market_state_rows: snapshot.marketState.length
  });

  if (args.runEvolution) {
    const evolution = await runEvolutionCycle({
      repo,
      userId: args.userId,
      runtimeSnapshot: {
        sourceStatus: snapshot.sourceStatus,
        freshnessSummary: snapshot.freshnessSummary,
        coverageSummary: snapshot.coverageSummary
      }
    });
    log('scheduled evolution cycle finished', {
      cycle: args.cycle,
      workflow_id: evolution.workflowId,
      markets: evolution.markets.map((row) => ({
        market: row.market,
        promoted: row.promoted,
        rolledBack: row.rolledBack,
        safeMode: row.safeMode
      }))
    });
    if (evolution.markets.some((row) => row.promoted || row.rolledBack || row.safeMode)) {
      snapshot = ensureQuantData(repo, args.userId, true);
      log('runtime refreshed after scheduled evolution', {
        cycle: args.cycle,
        source_status: snapshot.sourceStatus,
        signals: snapshot.signals.length,
        market_state_rows: snapshot.marketState.length
      });
    }
  }

  if (args.runTraining && !args.skipTraining) {
    try {
      await runNovaTrainingCycle({
        repo,
        userId: args.userId,
        trainer: args.trainer,
        trainingLimit: args.trainingLimit,
        executeTraining: args.executeTraining,
        triggerType: 'scheduled'
      });
    } catch (error) {
      warn('scheduled nova training flywheel failed', {
        cycle: args.cycle,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
}

export async function runAutoBackend(argv = process.argv.slice(2)) {
  const options = parseAutoBackendArgs(argv);
  const managed: ManagedChildren = { api: null, worker: null };
  let shuttingDown = false;

  const cleanup = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    log('shutting down children');
    if (managed.api && !managed.api.killed) managed.api.kill('SIGTERM');
    if (managed.worker && !managed.worker.killed) managed.worker.kill('SIGTERM');
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
  process.on('exit', cleanup);

  log('booting automation', options);

  if (!options.skipInit) {
    await runAutoBackendInitialization(options);
  } else {
    log('initialization skipped by flag');
  }

  if (options.skipApi) {
    log('api launch skipped by flag');
  }
  if (options.skipWorker) {
    log('binance worker skipped by flag');
  }
  if (options.skipTraining) {
    log('nova training flywheel skipped by flag');
  }

  await ensureManagedProcesses(options, managed);

  if (options.once) {
    log('once mode complete');
    return;
  }

  const usRefreshEveryCycles = Math.max(
    1,
    Math.round((options.usRefreshHours * 3600) / options.deriveIntervalSec)
  );
  const retrainEveryCycles = Math.max(
    1,
    Math.round((options.retrainHours * 3600) / options.deriveIntervalSec)
  );
  const trainEveryCycles = Math.max(
    1,
    Math.round((options.trainEveryHours * 3600) / options.deriveIntervalSec)
  );

  const supervisor = (async () => {
    while (!shuttingDown) {
      try {
        await ensureManagedProcesses(options, managed);
      } catch (error) {
        warn('managed process supervisor failed', {
          error: error instanceof Error ? error.message : String(error)
        });
      }
      await sleep(options.supervisorCheckSec * 1000);
    }
  })();

  let cycle = 0;
  while (!shuttingDown) {
    await sleep(options.deriveIntervalSec * 1000);
    if (shuttingDown) break;
    cycle += 1;

    try {
      const refreshUs = cycle % usRefreshEveryCycles === 0;
      const runEvolution = cycle % retrainEveryCycles === 0;
      const runTraining = cycle % trainEveryCycles === 0;
      if (cycle % options.validateEvery === 0 || refreshUs || runEvolution || runTraining) {
        await runAutoBackendMaintenanceCycle({
          userId: options.userId,
          cycle,
          refreshUs,
          runEvolution,
          runTraining,
          trainer: options.trainer,
          trainingLimit: options.trainingLimit,
          executeTraining: options.executeTraining,
          skipTraining: options.skipTraining
        });
      } else {
        const db = getDb();
        ensureSchema(db);
        const repo = new MarketRepository(db);
        const snapshot = ensureQuantData(repo, options.userId, true);
        log('scheduled runtime refresh finished', {
          cycle,
          source_status: snapshot.sourceStatus,
          signals: snapshot.signals.length,
          market_state_rows: snapshot.marketState.length
        });
      }
    } catch (error) {
      log('maintenance cycle failed', {
        cycle,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  await supervisor;
}

const isEntrypoint = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntrypoint) {
  runAutoBackend().catch((error) => {
    console.error('[auto-backend] fatal', error);
    process.exitCode = 1;
  });
}
