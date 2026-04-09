import { pathToFileURL } from 'node:url';
import { Pool } from 'pg';
import '../src/server/config.js';
import { qualifyPgTable, resolvePostgresBusinessUrl } from '../src/server/db/postgresSql.js';
import type { MarketRepository } from '../src/server/db/repository.js';
import type { Market, SignalRecord } from '../src/server/types.js';

type ReplayOptions = {
  market: Market;
  family: string | null;
  symbols: string[];
  sinceMs: number;
  untilMs: number;
  maxHoldBars: number;
  limit: number;
};

type ReplayTrade = {
  signal_id: string;
  symbol: string;
  strategy_family: string;
  strategy_id: string;
  direction: string;
  signal_created_at: string;
  entry_at: string;
  exit_at: string;
  entry: number;
  exit: number;
  return_pct: number;
  exit_reason: 'STOP' | 'TP1' | 'TIME_EXIT';
};

type ReplayBar = {
  ts_open: number;
  open: string | number;
  high: string | number;
  low: string | number;
  close: string | number;
  volume?: string | number;
  source?: string;
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

function parseDay(value: string | undefined, fallbackMs: number): number {
  if (!value) return fallbackMs;
  const ms = Date.parse(`${value.slice(0, 10)}T00:00:00.000Z`);
  return Number.isFinite(ms) ? ms : fallbackMs;
}

function parseNumber(value: string | undefined, fallback: number): number {
  const out = Number(value);
  return Number.isFinite(out) && out > 0 ? out : fallback;
}

function round(value: number, digits = 6): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function mean(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function stdev(values: number[]): number {
  if (values.length < 2) return 0;
  const avg = mean(values);
  const variance = mean(values.map((value) => (value - avg) ** 2));
  return Math.sqrt(variance);
}

function printHelp() {
  console.log(`Usage:
  npm exec tsx -- scripts/backtest-signal-replay.ts [options]

Options:
  --market <US|CRYPTO>          market, default US
  --family <text>               strategy_family substring, e.g. "Regime Transition"
  --symbols <AAPL,NVDA,SPY>     optional symbol filter
  --since <YYYY-MM-DD>          signal creation lower bound, default 30 days ago
  --until <YYYY-MM-DD>          signal creation upper bound, default now
  --max-hold-bars <n>           daily bars to hold, default 8
  --limit <n>                   signals fetched before filtering, default 2000
  --help                        show this message`);
}

function postgresSchema() {
  return String(process.env.NOVA_DATA_PG_SCHEMA || 'novaquant_data').trim() || 'novaquant_data';
}

function shouldUseSsl(connectionString: string) {
  if (
    String(process.env.NOVA_DATA_PG_SSL || '')
      .trim()
      .toLowerCase() === 'disable'
  ) {
    return false;
  }
  return !/(localhost|127\.0\.0\.1)/i.test(connectionString);
}

function createReadOnlyPool() {
  const connectionString = resolvePostgresBusinessUrl();
  if (!connectionString) {
    throw new Error('POSTGRES_BUSINESS_STORE_NOT_CONFIGURED');
  }
  return new Pool({
    connectionString,
    max: 2,
    connectionTimeoutMillis: Math.max(
      500,
      Number(process.env.NOVA_DATA_PG_CONNECT_TIMEOUT_MS || 15_000),
    ),
    idleTimeoutMillis: 1_000,
    statement_timeout: Math.max(2_000, Number(process.env.NOVA_DATA_PG_QUERY_TIMEOUT_MS || 30_000)),
    ssl: shouldUseSsl(connectionString) ? { rejectUnauthorized: false } : undefined,
  });
}

export function parseSignalReplayCliArgs(argv: string[]): ReplayOptions {
  const now = Date.now();
  const out: ReplayOptions = {
    market: 'US',
    family: null,
    symbols: [],
    sinceMs: now - 30 * 24 * 3600 * 1000,
    untilMs: now,
    maxHoldBars: 8,
    limit: 2000,
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
    if (key === 'market' && next) out.market = parseMarket(String(next));
    if (key === 'family' && next) out.family = String(next).trim() || null;
    if (key === 'symbols' && next) out.symbols = parseCsv(String(next));
    if (key === 'since' && next) out.sinceMs = parseDay(String(next), out.sinceMs);
    if (key === 'until' && next) out.untilMs = parseDay(String(next), out.untilMs);
    if (key === 'max-hold-bars' && next)
      out.maxHoldBars = parseNumber(String(next), out.maxHoldBars);
    if (key === 'limit' && next) out.limit = parseNumber(String(next), out.limit);

    if (consumeNext) i += 1;
  }

  return out;
}

function replaySignalBars(
  signal: SignalRecord,
  bars: ReplayBar[],
  maxHoldBars: number,
): ReplayTrade | null {
  const entryIndex = bars.findIndex((bar) => bar.ts_open > signal.created_at_ms);
  if (entryIndex < 0) return null;
  const entryBar = bars[entryIndex];
  const entry = Number(entryBar.open);
  const direction = String(signal.direction || '').toUpperCase();
  const side = direction === 'SHORT' ? -1 : 1;
  const stop = Number(signal.stop_price || signal.invalidation_level || 0);
  const tp1 = Number(signal.tp1_price || 0);

  let exitBar = entryBar;
  let exit = Number(entryBar.close);
  let exitReason: ReplayTrade['exit_reason'] = 'TIME_EXIT';
  const path = bars.slice(entryIndex, entryIndex + maxHoldBars);
  for (const bar of path) {
    const high = Number(bar.high);
    const low = Number(bar.low);
    if (side > 0) {
      const stopHit = stop > 0 && low <= stop;
      const tpHit = tp1 > 0 && high >= tp1;
      if (stopHit || tpHit) {
        exitBar = bar;
        exit = stopHit ? stop : tp1;
        exitReason = stopHit ? 'STOP' : 'TP1';
        break;
      }
    } else {
      const stopHit = stop > 0 && high >= stop;
      const tpHit = tp1 > 0 && low <= tp1;
      if (stopHit || tpHit) {
        exitBar = bar;
        exit = stopHit ? stop : tp1;
        exitReason = stopHit ? 'STOP' : 'TP1';
        break;
      }
    }
    exitBar = bar;
    exit = Number(bar.close);
  }

  if (!Number.isFinite(entry) || entry <= 0 || !Number.isFinite(exit) || exit <= 0) return null;
  return {
    signal_id: signal.signal_id,
    symbol: signal.symbol,
    strategy_family: signal.strategy_family,
    strategy_id: signal.strategy_id,
    direction,
    signal_created_at: new Date(signal.created_at_ms).toISOString(),
    entry_at: new Date(entryBar.ts_open).toISOString(),
    exit_at: new Date(exitBar.ts_open).toISOString(),
    entry: round(entry, 4),
    exit: round(exit, 4),
    return_pct: round(((exit - entry) / entry) * side, 6),
    exit_reason: exitReason,
  } satisfies ReplayTrade;
}

function replaySignal(repo: MarketRepository, signal: SignalRecord, maxHoldBars: number) {
  const asset = repo.getAssetBySymbol(signal.market, signal.symbol);
  if (!asset) return null;
  const bars = repo.getOhlcv({
    assetId: asset.asset_id,
    timeframe: '1d',
    start: signal.created_at_ms - 5 * 24 * 3600 * 1000,
    limit: Math.max(40, maxHoldBars + 10),
  });
  return replaySignalBars(signal, bars, maxHoldBars);
}

function summarizeTrades(trades: ReplayTrade[]) {
  const returns = trades.map((trade) => trade.return_pct);
  const wins = returns.filter((value) => value > 0);
  const losses = returns.filter((value) => value <= 0);
  const volatility = stdev(returns);
  return {
    trades: trades.length,
    win_rate: round(wins.length / Math.max(1, trades.length), 4),
    avg_return: round(mean(returns), 6),
    total_compounded: round(returns.reduce((nav, value) => nav * (1 + value), 1) - 1, 6),
    sharpe_proxy: round(volatility > 0 ? mean(returns) / volatility : 0, 4),
    best: round(Math.max(...returns, 0), 6),
    worst: round(Math.min(...returns, 0), 6),
    avg_win: round(mean(wins), 6),
    avg_loss: round(mean(losses), 6),
  };
}

function summarizeGroup(
  trades: ReplayTrade[],
  key: keyof Pick<ReplayTrade, 'strategy_family' | 'exit_reason'>,
) {
  const groups = new Map<string, ReplayTrade[]>();
  for (const trade of trades) {
    const value = String(trade[key] || 'unknown');
    groups.set(value, [...(groups.get(value) || []), trade]);
  }
  return Object.fromEntries(
    [...groups.entries()]
      .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
      .map(([name, rows]) => [name, summarizeTrades(rows)]),
  );
}

export function runSignalReplay(repo: MarketRepository, options: ReplayOptions) {
  const symbolSet = new Set(options.symbols);
  const familyNeedle = String(options.family || '').toLowerCase();
  const signals = repo
    .listSignals({ market: options.market, status: 'ALL', limit: options.limit })
    .filter((signal) => signal.created_at_ms >= options.sinceMs)
    .filter((signal) => signal.created_at_ms <= options.untilMs + 24 * 3600 * 1000 - 1)
    .filter((signal) => !symbolSet.size || symbolSet.has(signal.symbol.toUpperCase()))
    .filter(
      (signal) => !familyNeedle || signal.strategy_family.toLowerCase().includes(familyNeedle),
    )
    .sort((a, b) => a.created_at_ms - b.created_at_ms);
  const trades = signals
    .map((signal) => replaySignal(repo, signal, options.maxHoldBars))
    .filter((trade): trade is ReplayTrade => Boolean(trade));
  return {
    meta: {
      market: options.market,
      family: options.family,
      symbols: options.symbols,
      since: new Date(options.sinceMs).toISOString(),
      until: new Date(options.untilMs).toISOString(),
      max_hold_bars: options.maxHoldBars,
      signals_loaded: signals.length,
      trades_closed_or_marked: trades.length,
    },
    aggregate: summarizeTrades(trades),
    by_family: summarizeGroup(trades, 'strategy_family'),
    by_exit_reason: summarizeGroup(trades, 'exit_reason'),
    worst_trades: [...trades].sort((a, b) => a.return_pct - b.return_pct).slice(0, 10),
    best_trades: [...trades].sort((a, b) => b.return_pct - a.return_pct).slice(0, 10),
  };
}

async function fetchSignalsFromPostgres(
  pool: Pool,
  options: ReplayOptions,
): Promise<SignalRecord[]> {
  const schema = postgresSchema();
  const signalsTable = qualifyPgTable(schema, 'signals');
  const values: unknown[] = [
    options.market,
    options.sinceMs,
    options.untilMs + 24 * 3600 * 1000 - 1,
  ];
  const where = ['market = $1', 'created_at_ms >= $2', 'created_at_ms <= $3'];

  if (options.family) {
    values.push(`%${options.family}%`);
    where.push(`strategy_family ILIKE $${values.length}`);
  }
  if (options.symbols.length) {
    values.push(options.symbols);
    where.push(`symbol = ANY($${values.length}::text[])`);
  }
  values.push(options.limit);

  const { rows } = await pool.query<Record<string, unknown>>(
    `
      SELECT *
      FROM ${signalsTable}
      WHERE ${where.join(' AND ')}
      ORDER BY created_at_ms ASC
      LIMIT $${values.length}
    `,
    values,
  );
  return rows.map((row) => ({
    ...row,
    created_at_ms: Number(row.created_at_ms),
    stop_price: Number(row.stop_price || 0),
    invalidation_level: Number(row.invalidation_level || 0),
    tp1_price: row.tp1_price === null ? null : Number(row.tp1_price || 0),
  })) as unknown as SignalRecord[];
}

async function fetchBarsFromPostgres(
  pool: Pool,
  signal: SignalRecord,
  maxHoldBars: number,
): Promise<ReplayBar[]> {
  const schema = postgresSchema();
  const ohlcvTable = qualifyPgTable(schema, 'ohlcv');
  const assetsTable = qualifyPgTable(schema, 'assets');
  const { rows } = await pool.query<ReplayBar>(
    `
      SELECT o.ts_open, o.open, o.high, o.low, o.close, o.volume, o.source
      FROM ${ohlcvTable} o
      JOIN ${assetsTable} a ON a.asset_id = o.asset_id
      WHERE a.market = $1
        AND a.symbol = $2
        AND a.status = 'ACTIVE'
        AND o.timeframe = '1d'
        AND o.ts_open >= $3
      ORDER BY o.ts_open ASC
      LIMIT $4
    `,
    [
      signal.market,
      signal.symbol,
      signal.created_at_ms - 5 * 24 * 3600 * 1000,
      Math.max(40, maxHoldBars + 10),
    ],
  );
  return rows.map((row) => ({
    ...row,
    ts_open: Number(row.ts_open),
  }));
}

export async function runSignalReplayFromPostgres(options: ReplayOptions) {
  const pool = createReadOnlyPool();
  try {
    const signals = await fetchSignalsFromPostgres(pool, options);
    const trades = (
      await Promise.all(
        signals.map(async (signal) =>
          replaySignalBars(
            signal,
            await fetchBarsFromPostgres(pool, signal, options.maxHoldBars),
            options.maxHoldBars,
          ),
        ),
      )
    ).filter((trade): trade is ReplayTrade => Boolean(trade));
    return {
      meta: {
        market: options.market,
        family: options.family,
        symbols: options.symbols,
        since: new Date(options.sinceMs).toISOString(),
        until: new Date(options.untilMs).toISOString(),
        max_hold_bars: options.maxHoldBars,
        signals_loaded: signals.length,
        trades_closed_or_marked: trades.length,
        data_path: 'postgres_readonly',
      },
      aggregate: summarizeTrades(trades),
      by_family: summarizeGroup(trades, 'strategy_family'),
      by_exit_reason: summarizeGroup(trades, 'exit_reason'),
      worst_trades: [...trades].sort((a, b) => a.return_pct - b.return_pct).slice(0, 10),
      best_trades: [...trades].sort((a, b) => b.return_pct - a.return_pct).slice(0, 10),
    };
  } finally {
    await pool.end();
  }
}

export async function runSignalReplayCli(argv = process.argv.slice(2)) {
  const options = parseSignalReplayCliArgs(argv);
  const output = await runSignalReplayFromPostgres(options);
  console.log(JSON.stringify(output, null, 2));
  return output;
}

const isEntrypoint = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntrypoint) {
  runSignalReplayCli().catch((error) => {
    console.error(
      JSON.stringify(
        {
          error: error instanceof Error ? error.message : String(error),
        },
        null,
        2,
      ),
    );
    process.exitCode = 1;
  });
}
