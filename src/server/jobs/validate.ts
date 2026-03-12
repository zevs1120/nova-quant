import { getConfig } from '../config.js';
import { getDb } from '../db/database.js';
import { MarketRepository } from '../db/repository.js';
import { ensureSchema } from '../db/schema.js';
import { validateAndRepair } from '../ingestion/validation.js';
import type { Timeframe } from '../types.js';
import { logInfo } from '../utils/log.js';
import { parseArgs } from './args.js';

export async function runValidationCli(argv: string[]): Promise<void> {
  const args = parseArgs(argv);
  const cfg = getConfig();
  const lookbackBars = Number(args.lookbackBars || args.lookback || 2000);
  const tfs = (args.tf ? args.tf.split(',') : cfg.timeframes).map((x) => x.trim() as Timeframe);

  const db = getDb();
  ensureSchema(db);
  const repo = new MarketRepository(db);

  await validateAndRepair({
    repo,
    timeframes: tfs,
    lookbackBars
  });

  logInfo('Validation completed', { lookbackBars, timeframes: tfs.join(',') });
}
