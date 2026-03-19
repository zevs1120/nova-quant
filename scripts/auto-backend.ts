import { spawn, type ChildProcess } from 'node:child_process';
import net from 'node:net';
import { getDb } from '../src/server/db/database.js';
import { MarketRepository } from '../src/server/db/repository.js';
import { ensureSchema } from '../src/server/db/schema.js';
import { runBackfillCli } from '../src/server/jobs/backfill.js';
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
  skipInit: boolean;
  skipApi: boolean;
  skipWorker: boolean;
  once: boolean;
};

const DEFAULTS: AutoBackendOptions = {
  userId: 'guest-default',
  apiPort: Number(process.env.PORT || 8787),
  deriveIntervalSec: 300,
  validateEvery: 6,
  usRefreshHours: 6,
  retrainHours: 24,
  skipInit: false,
  skipApi: false,
  skipWorker: false,
  once: false
};

function parseArgs(argv: string[]): AutoBackendOptions {
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
    if (key === 'skip-init') out.skipInit = true;
    if (key === 'skip-api') out.skipApi = true;
    if (key === 'skip-worker') out.skipWorker = true;
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

async function runInitialization(userId: string) {
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

  log('validation starting', { timeframes: '1d,1h' });
  try {
    await runValidationCli(['--tf', '1d,1h', '--lookbackBars', '800']);
  } catch (error) {
    warn('validation failed; continuing to runtime derivation', {
      error: error instanceof Error ? error.message : String(error)
    });
  }

  log('runtime derivation starting', { userId });
  let snapshot = ensureQuantData(repo, userId, true);
  log('runtime derivation finished', {
    source_status: snapshot.sourceStatus,
    signals: snapshot.signals.length,
    market_state_rows: snapshot.marketState.length
  });

  log('evolution cycle starting', { userId });
  const evolution = await runEvolutionCycle({
    repo,
    userId,
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
    snapshot = ensureQuantData(repo, userId, true);
    log('runtime derivation refreshed after evolution', {
      source_status: snapshot.sourceStatus,
      signals: snapshot.signals.length,
      market_state_rows: snapshot.marketState.length
    });
  }
}

async function runMaintenanceCycle(args: {
  userId: string;
  cycle: number;
  refreshUs: boolean;
  runEvolution: boolean;
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
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const children: ChildProcess[] = [];
  let shuttingDown = false;

  const cleanup = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    log('shutting down children');
    for (const child of children) {
      if (!child.killed) child.kill('SIGTERM');
    }
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
  process.on('exit', cleanup);

  log('booting automation', options);

  if (!options.skipInit) {
    await runInitialization(options.userId);
  } else {
    log('initialization skipped by flag');
  }

  if (!options.skipApi) {
    const apiRunning = await isPortListening(options.apiPort);
    if (apiRunning) {
      log('api already running, skipping launch', { port: options.apiPort });
    } else {
      children.push(
        spawnManaged(
          'api',
          process.execPath,
          ['--import', 'tsx', 'src/server/apiServer.ts'],
          { PORT: String(options.apiPort) }
        )
      );
      await sleep(1500);
    }
  } else {
    log('api launch skipped by flag');
  }

  if (!options.skipWorker) {
    const workerRunning = await isWorkerLikelyRunning();
    if (workerRunning) {
      log('binance worker already running, skipping launch');
    } else {
      children.push(
        spawnManaged(
          'binance-worker',
          process.execPath,
          ['--import', 'tsx', 'scripts/update-binance.ts', '--tf', '1h']
        )
      );
      await sleep(1200);
    }
  } else {
    log('binance worker skipped by flag');
  }

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

  let cycle = 0;
  while (!shuttingDown) {
    await sleep(options.deriveIntervalSec * 1000);
    if (shuttingDown) break;
    cycle += 1;

    try {
      const refreshUs = cycle % usRefreshEveryCycles === 0;
      const runEvolution = cycle % retrainEveryCycles === 0;
      if (cycle % options.validateEvery === 0 || refreshUs || runEvolution) {
        await runMaintenanceCycle({
          userId: options.userId,
          cycle,
          refreshUs,
          runEvolution
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
}

main().catch((error) => {
  console.error('[auto-backend] fatal', error);
  process.exitCode = 1;
});
