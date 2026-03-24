import fs from 'node:fs';
import path from 'node:path';
import { getDb } from '../src/server/db/database.js';
import { ensureSchema } from '../src/server/db/schema.js';
import { MarketRepository } from '../src/server/db/repository.js';
import { buildMlxLmTrainingDataset } from '../src/server/nova/training.js';
import { DEFAULT_NOVA_MLX_TASK_TYPES, normalizeNovaMlxTaskTypes } from '../src/server/nova/mlx.js';

function parseArgs() {
  const args = process.argv.slice(2);
  const onlyIncluded = args.includes('--only-included');
  const limitIndex = args.indexOf('--limit');
  const outIndex = args.indexOf('--out');
  const includeTasks = args
    .flatMap((token, index) => (token === '--include-task' ? [args[index + 1]] : []))
    .filter(Boolean);
  const limit = limitIndex >= 0 ? Number(args[limitIndex + 1]) : 500;
  const out =
    outIndex >= 0
      ? args[outIndex + 1]
      : path.join(
          process.cwd(),
          'artifacts',
          'training',
          `nova-mlx-${new Date().toISOString().slice(0, 10)}.jsonl`,
        );
  return {
    onlyIncluded,
    limit: Number.isFinite(limit) ? limit : 500,
    out,
    taskTypes: normalizeNovaMlxTaskTypes(
      includeTasks.length ? includeTasks : DEFAULT_NOVA_MLX_TASK_TYPES,
    ),
  };
}

function main() {
  const args = parseArgs();
  const db = getDb();
  ensureSchema(db);
  const repo = new MarketRepository(db);
  const dataset = buildMlxLmTrainingDataset(repo, {
    onlyIncluded: args.onlyIncluded,
    limit: args.limit,
    taskTypes: args.taskTypes,
  });
  fs.mkdirSync(path.dirname(args.out), { recursive: true });
  const content = dataset.records.map((row) => JSON.stringify(row)).join('\n');
  fs.writeFileSync(args.out, `${content}${content ? '\n' : ''}`);
  process.stdout.write(
    `Exported ${dataset.count} MLX-LM records for ${dataset.task_types.join(', ')} to ${args.out}\n`,
  );
}

main();
