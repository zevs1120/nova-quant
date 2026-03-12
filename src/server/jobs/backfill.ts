import { getConfig } from '../config.js';
import { getDb } from '../db/database.js';
import { MarketRepository } from '../db/repository.js';
import { ensureSchema } from '../db/schema.js';
import { backfillBinancePublic } from '../ingestion/binancePublic.js';
import { backfillStooqBulk } from '../ingestion/stooq.js';
import type { Market, Timeframe } from '../types.js';
import { logInfo } from '../utils/log.js';
import { parseArgs } from './args.js';

function parseTimeframes(input: string | undefined, fallback: Timeframe[]): Timeframe[] {
  if (!input) return fallback;
  return input.split(',').map((x) => x.trim() as Timeframe);
}

export async function runBackfillCli(argv: string[]): Promise<void> {
  const args = parseArgs(argv);
  const cfg = getConfig();
  const market = (args.market || 'ALL').toUpperCase() as Market | 'ALL';
  const tfArg = args.tf;

  const db = getDb();
  ensureSchema(db);
  const repo = new MarketRepository(db);

  if (market === 'US' || market === 'ALL') {
    const usTfs = parseTimeframes(tfArg, ['1d', '1h', '5m']);
    for (const tf of usTfs) {
      await backfillStooqBulk({
        timeframe: tf,
        repo,
        symbols: cfg.markets.US.symbols
      });
    }
  }

  if (market === 'CRYPTO' || market === 'ALL') {
    const cryptoTfs = parseTimeframes(tfArg, cfg.timeframes);
    await backfillBinancePublic({
      symbols: cfg.markets.CRYPTO.symbols,
      timeframes: cryptoTfs,
      repo
    });
  }

  logInfo('Backfill finished', { market, tf: tfArg ?? 'default' });
}
