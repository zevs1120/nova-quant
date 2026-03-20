import { getDb } from '../src/server/db/database.js';
import { ensureSchema } from '../src/server/db/schema.js';
import { MarketRepository } from '../src/server/db/repository.js';
import { runNovaTrainingFlywheel, type NovaTrainerKind } from '../src/server/nova/flywheel.js';
import type { NovaTaskType } from '../src/server/types.js';

function parseArgs() {
  const args = process.argv.slice(2);
  const trainerIndex = args.indexOf('--trainer');
  const userIndex = args.indexOf('--user');
  const limitIndex = args.indexOf('--limit');
  const allowUnlabeled = args.includes('--allow-unlabeled');
  const taskTypes = args
    .flatMap((token, index) => (token === '--include-task' ? [args[index + 1]] : []))
    .filter(Boolean) as NovaTaskType[];

  const trainer = String(trainerIndex >= 0 ? args[trainerIndex + 1] : 'unsloth-lora').trim() as NovaTrainerKind;
  return {
    trainer,
    userId: userIndex >= 0 ? String(args[userIndex + 1] || '').trim() : null,
    limit: limitIndex >= 0 ? Number(args[limitIndex + 1]) : 500,
    onlyIncluded: !allowUnlabeled,
    taskTypes
  };
}

async function main() {
  const parsed = parseArgs();
  if (!['mlx-lora', 'unsloth-lora', 'axolotl-qlora'].includes(parsed.trainer)) {
    throw new Error('trainer must be one of: mlx-lora, unsloth-lora, axolotl-qlora');
  }

  const db = getDb();
  ensureSchema(db);
  const repo = new MarketRepository(db);
  const result = await runNovaTrainingFlywheel({
    repo,
    userId: parsed.userId,
    trainer: parsed.trainer,
    onlyIncluded: parsed.onlyIncluded,
    limit: Number.isFinite(parsed.limit) ? parsed.limit : 500,
    taskTypes: parsed.taskTypes.length ? parsed.taskTypes : undefined
  });

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`);
  process.exitCode = 1;
});
