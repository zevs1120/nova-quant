import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { getDb } from '../src/server/db/database.js';
import { ensureSchema } from '../src/server/db/schema.js';
import { MarketRepository } from '../src/server/db/repository.js';
import { buildMlxLmTrainingDataset } from '../src/server/nova/training.js';
import {
  DEFAULT_NOVA_MLX_TASK_TYPES,
  buildNovaMlxLoraPlan,
  normalizeNovaMlxTaskTypes,
  renderNovaShellCommand,
} from '../src/server/nova/mlx.js';

function parseArgs() {
  const args = process.argv.slice(2);
  const onlyIncluded = !args.includes('--allow-unlabeled');
  const execute = args.includes('--execute');
  const outIndex = args.indexOf('--out');
  const adapterIndex = args.indexOf('--adapter-path');
  const limitIndex = args.indexOf('--limit');
  const iterIndex = args.indexOf('--iters');
  const batchIndex = args.indexOf('--batch-size');
  const lrIndex = args.indexOf('--learning-rate');
  const modelIndex = args.indexOf('--base-model');
  const layerIndex = args.indexOf('--lora-layers');
  const includeTasks = args
    .flatMap((token, index) => (token === '--include-task' ? [args[index + 1]] : []))
    .filter(Boolean) as string[];

  return {
    onlyIncluded,
    execute,
    out:
      outIndex >= 0
        ? args[outIndex + 1]
        : path.join(
            process.cwd(),
            'artifacts',
            'training',
            `nova-mlx-${new Date().toISOString().slice(0, 10)}.jsonl`,
          ),
    adapterPath:
      adapterIndex >= 0
        ? args[adapterIndex + 1]
        : path.join(process.cwd(), 'artifacts', 'training', 'nova-lora-adapter'),
    limit: limitIndex >= 0 ? Number(args[limitIndex + 1]) : 500,
    iters: iterIndex >= 0 ? Number(args[iterIndex + 1]) : 300,
    batchSize: batchIndex >= 0 ? Number(args[batchIndex + 1]) : 2,
    learningRate: lrIndex >= 0 ? Number(args[lrIndex + 1]) : 1e-5,
    baseModel: modelIndex >= 0 ? args[modelIndex + 1] : undefined,
    loraLayers: layerIndex >= 0 ? Number(args[layerIndex + 1]) : 16,
    includeTasks,
  };
}

function detectMlxLmAvailability() {
  const probe = spawnSync('python3', ['-c', 'import mlx_lm'], {
    encoding: 'utf8',
  });
  return {
    ok: probe.status === 0,
    error:
      probe.status === 0 ? null : (probe.stderr || probe.stdout || 'mlx_lm import failed').trim(),
  };
}

async function main() {
  const args = parseArgs();
  const db = getDb();
  ensureSchema(db);
  const repo = new MarketRepository(db);
  const taskTypes = normalizeNovaMlxTaskTypes(
    args.includeTasks.length ? args.includeTasks : DEFAULT_NOVA_MLX_TASK_TYPES,
  );
  const dataset = buildMlxLmTrainingDataset(repo, {
    onlyIncluded: args.onlyIncluded,
    limit: Number.isFinite(args.limit) ? args.limit : 500,
    taskTypes,
  });

  fs.mkdirSync(path.dirname(args.out), { recursive: true });
  const content = dataset.records.map((row) => JSON.stringify(row)).join('\n');
  fs.writeFileSync(args.out, `${content}${content ? '\n' : ''}`);

  const plan = buildNovaMlxLoraPlan({
    baseModel: args.baseModel,
    datasetPath: args.out,
    adapterPath: args.adapterPath,
    iters: args.iters,
    batchSize: args.batchSize,
    learningRate: args.learningRate,
    loraLayers: args.loraLayers,
    taskTypes,
  });

  const command = renderNovaShellCommand(plan.command);
  process.stdout.write(
    `Prepared ${dataset.count} MLX-LM records for tasks: ${plan.tasks.join(', ')}\n`,
  );
  process.stdout.write(`Dataset: ${plan.datasetPath}\n`);
  process.stdout.write(`Adapter output: ${plan.adapterPath}\n`);
  process.stdout.write(`Command: ${command}\n`);

  if (dataset.count === 0) {
    process.stdout.write(
      'No training-ready samples were exported. Add review labels or pass --allow-unlabeled.\n',
    );
    return;
  }

  if (!args.execute) {
    process.stdout.write('Dry run only. Re-run with --execute once mlx-lm is installed locally.\n');
    return;
  }

  const mlx = detectMlxLmAvailability();
  if (!mlx.ok) {
    process.stdout.write(`mlx-lm is not available locally. ${mlx.error || ''}\n`);
    process.stdout.write(`Run this after installation: ${command}\n`);
    process.exitCode = 1;
    return;
  }

  const child = spawnSync(plan.command[0], plan.command.slice(1), {
    stdio: 'inherit',
  });
  if (child.status !== 0) {
    process.exitCode = child.status || 1;
  }
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? error.stack || error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
