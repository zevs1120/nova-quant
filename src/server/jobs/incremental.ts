import { getConfig } from '../config.js';
import { getDb } from '../db/database.js';
import { MarketRepository } from '../db/repository.js';
import { ensureSchema } from '../db/schema.js';
import { updateBinanceIncremental } from '../ingestion/binanceIncremental.js';
import type { Timeframe } from '../types.js';
import { logInfo } from '../utils/log.js';
import { sleep } from '../utils/time.js';
import { parseArgs } from './args.js';

export async function runIncrementalCli(argv: string[]): Promise<void> {
  const args = parseArgs(argv);
  const cfg = getConfig();
  const once = args.once === 'true' || args.once === '1' || args.once === 'yes';
  const tfInput = args.tf;
  const tfs = (tfInput ? tfInput.split(',') : cfg.timeframes).map((x) => x.trim() as Timeframe);

  const db = getDb();
  ensureSchema(db);
  const repo = new MarketRepository(db);

  do {
    await updateBinanceIncremental({
      symbols: cfg.markets.CRYPTO.symbols,
      timeframes: tfs,
      repo,
      limit: cfg.binanceRest.limit
    });

    if (!once) {
      logInfo('Incremental cycle done, sleeping for 120s');
      await sleep(120_000);
    }
  } while (!once);
}
