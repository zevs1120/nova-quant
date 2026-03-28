import { getConfig } from '../config.js';
import { getRuntimeRepo } from '../db/runtimeRepository.js';
import { validateAndRepair } from '../ingestion/validation.js';
import type { Timeframe } from '../types.js';
import { logInfo } from '../utils/log.js';
import { parseArgs } from './args.js';

export async function runValidationCli(argv: string[]): Promise<void> {
  const args = parseArgs(argv);
  const cfg = getConfig();
  const lookbackBars = Number(args.lookbackBars || args.lookback || 2000);
  const tfs = (args.tf ? args.tf.split(',') : cfg.timeframes).map((x) => x.trim() as Timeframe);

  const repo = getRuntimeRepo();

  await validateAndRepair({
    repo,
    timeframes: tfs,
    lookbackBars,
  });

  logInfo('Validation completed', { lookbackBars, timeframes: tfs.join(',') });
}
