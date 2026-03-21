import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import type { MarketRepository } from '../db/repository.js';
import type { ModelVersionRecord, NovaTaskType } from '../types.js';
import { createTraceId, recordAuditEvent } from '../observability/spine.js';
import { buildMlxLmTrainingDataset } from './training.js';
import { buildNovaMlxLoraPlan, getDefaultNovaMlxBaseModel, renderNovaShellCommand } from './mlx.js';
import { MARVIX_MODEL_ALIASES, getNovaModelPlan } from '../ai/llmOps.js';

export type NovaTrainerKind = 'mlx-lora' | 'unsloth-lora' | 'axolotl-qlora';
export const MIN_AUTOMATIC_TRAINING_ROWS = 8;

type FlywheelArgs = {
  repo: MarketRepository;
  userId?: string | null;
  trainer?: NovaTrainerKind;
  onlyIncluded?: boolean;
  limit?: number;
  taskTypes?: ReadonlyArray<NovaTaskType>;
  triggerType?: 'scheduled' | 'manual' | 'shadow' | 'replay';
  executeWhenReady?: boolean;
};

function safeNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}

function cleanModelNameForPath(value: string) {
  return String(value || 'model')
    .replace(/[/:]+/g, '-')
    .replace(/[^a-zA-Z0-9._-]+/g, '-');
}

function resolveBaseModel() {
  const plan = getNovaModelPlan();
  const configured = String(plan.models[MARVIX_MODEL_ALIASES.core] || '').trim();
  if (!configured) return getDefaultNovaMlxBaseModel();
  if (configured.includes('/')) return configured;
  return getDefaultNovaMlxBaseModel();
}

function detectMlxLmAvailability() {
  const probe = spawnSync('python3', ['-c', 'import mlx_lm'], {
    encoding: 'utf8'
  });
  return {
    ok: probe.status === 0,
    error: probe.status === 0 ? null : (probe.stderr || probe.stdout || 'mlx_lm import failed').trim()
  };
}

function buildOpenSourceTrainerPlan(args: {
  trainer: NovaTrainerKind;
  datasetPath: string;
  outputDir: string;
  baseModel: string;
}) {
  if (args.trainer === 'mlx-lora') {
    const mlx = buildNovaMlxLoraPlan({
      baseModel: args.baseModel,
      datasetPath: args.datasetPath,
      adapterPath: args.outputDir
    });
    return {
      trainer: args.trainer,
      base_model: mlx.baseModel,
      output_dir: mlx.adapterPath,
      command: mlx.command,
      command_text: renderNovaShellCommand(mlx.command)
    };
  }

  if (args.trainer === 'unsloth-lora') {
    const command = [
      'python3',
      'scripts/train_nova_unsloth.py',
      '--model',
      args.baseModel,
      '--dataset',
      args.datasetPath,
      '--output',
      args.outputDir,
      '--max-steps',
      '400',
      '--batch-size',
      '2'
    ];
    return {
      trainer: args.trainer,
      base_model: args.baseModel,
      output_dir: args.outputDir,
      command,
      command_text: renderNovaShellCommand(command)
    };
  }

  const command = [
    'python3',
    'scripts/train_nova_axolotl.py',
    '--base-model',
    args.baseModel,
    '--dataset',
    args.datasetPath,
    '--output',
    args.outputDir
  ];
  return {
    trainer: args.trainer,
    base_model: args.baseModel,
    output_dir: args.outputDir,
    command,
    command_text: renderNovaShellCommand(command)
  };
}

function buildChallengerModelRecord(args: {
  trainer: NovaTrainerKind;
  datasetPath: string;
  manifestPath: string;
  outputDir: string;
  datasetCount: number;
  qualitySummary: Record<string, unknown>;
}): ModelVersionRecord {
  const now = Date.now();
  const semanticVersion = `flywheel-${new Date(now).toISOString().slice(0, 10)}-${String(args.datasetCount).padStart(3, '0')}`;
  return {
    id: `model-marvix-challenger-${randomUUID().slice(0, 10)}`,
    model_key: MARVIX_MODEL_ALIASES.challenger,
    provider: 'fine-tune-plan',
    endpoint: null,
    task_scope: 'assistant_grounded_answer,action_card_generation,risk_regime_explanation,strategy_candidate_generation',
    semantic_version: semanticVersion,
    status: 'challenger',
    config_json: JSON.stringify({
      trainer: args.trainer,
      dataset_path: args.datasetPath,
      manifest_path: args.manifestPath,
      output_dir: args.outputDir,
      dataset_count: args.datasetCount,
      quality_summary: args.qualitySummary
    }),
    created_at_ms: now,
    updated_at_ms: now
  };
}

export function summarizeNovaTrainingDataset(records: Array<Record<string, unknown>>) {
  const taskCounts = new Map<string, number>();
  let includedLabels = 0;
  for (const row of records) {
    const metadata = (row.metadata || {}) as Record<string, unknown>;
    const task = String(metadata.task_type || 'unknown');
    taskCounts.set(task, (taskCounts.get(task) || 0) + 1);
    const labels = Array.isArray(metadata.labels) ? metadata.labels : [];
    includedLabels += labels.filter((label) => Boolean((label as Record<string, unknown>).include_in_training)).length;
  }

  return {
    total_records: records.length,
    by_task_type: Object.fromEntries([...taskCounts.entries()].sort((a, b) => b[1] - a[1])),
    included_labels: includedLabels
  };
}

export async function runNovaTrainingFlywheel(args: FlywheelArgs) {
  const now = Date.now();
  const workflowId = `workflow-nova-flywheel-${randomUUID().slice(0, 12)}`;
  const traceId = createTraceId('nova-flywheel');
  const trainer = args.trainer || 'unsloth-lora';
  const triggerType = args.triggerType || 'manual';
  const dateKey = new Date(now).toISOString().slice(0, 10);
  const artifactsDir = path.join(process.cwd(), 'artifacts', 'training', `nova-flywheel-${dateKey}`);
  ensureDir(artifactsDir);

  args.repo.upsertWorkflowRun({
    id: workflowId,
    workflow_key: 'nova_training_flywheel',
    workflow_version: 'nova-training-flywheel.v1',
    trigger_type: triggerType,
    status: 'RUNNING',
    trace_id: traceId,
    input_json: JSON.stringify({
      trainer,
      only_included: args.onlyIncluded !== false,
      limit: args.limit || 500,
      task_types: args.taskTypes || null,
      execute_when_ready: args.executeWhenReady === true
    }),
    output_json: null,
    attempt_count: 1,
    started_at_ms: now,
    updated_at_ms: now,
    completed_at_ms: null
  });

  const dataset = buildMlxLmTrainingDataset(args.repo, {
    onlyIncluded: args.onlyIncluded !== false,
    limit: args.limit || 500,
    taskTypes: args.taskTypes
  });

  const datasetPath = path.join(artifactsDir, `nova-training-${dateKey}.jsonl`);
  const outputDir = path.join(artifactsDir, cleanModelNameForPath(trainer));
  ensureDir(outputDir);
  const datasetContent = dataset.records.map((row) => JSON.stringify(row)).join('\n');
  fs.writeFileSync(datasetPath, `${datasetContent}${datasetContent ? '\n' : ''}`);

  const qualitySummary = summarizeNovaTrainingDataset(dataset.records as Array<Record<string, unknown>>);
  const plan = buildOpenSourceTrainerPlan({
    trainer,
    datasetPath,
    outputDir,
    baseModel: resolveBaseModel()
  });
  const manifestPath = path.join(artifactsDir, `nova-training-manifest-${trainer}.json`);
  const manifest = {
    generated_at: new Date(now).toISOString(),
    trainer,
    dataset_path: datasetPath,
    dataset_count: dataset.count,
    task_types: dataset.task_types,
    quality_summary: qualitySummary,
    plan
  };
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  let challengerModelId: string | null = null;
  if (dataset.count >= 8) {
    const challenger = buildChallengerModelRecord({
      trainer,
      datasetPath,
      manifestPath,
      outputDir,
      datasetCount: dataset.count,
      qualitySummary
    });
    args.repo.upsertModelVersion(challenger);
    challengerModelId = challenger.id;
  }

  const execution = {
    attempted: false,
    executed: false,
    success: false,
    reason: 'execution_not_requested',
    exit_code: null as number | null
  };

  if (args.executeWhenReady && dataset.count > 0) {
    execution.attempted = true;
    if (dataset.count < MIN_AUTOMATIC_TRAINING_ROWS) {
      execution.reason = `insufficient_training_rows:${dataset.count}`;
    } else if (trainer !== 'mlx-lora') {
      execution.reason = 'automatic_execution_supported_only_for_mlx_lora';
    } else {
      const mlx = detectMlxLmAvailability();
      if (!mlx.ok) {
        execution.reason = `mlx_lm_unavailable:${mlx.error || 'unknown'}`;
      } else {
        const child = spawnSync(plan.command[0], plan.command.slice(1), {
          stdio: 'inherit'
        });
        execution.executed = true;
        execution.exit_code = child.status ?? null;
        execution.success = child.status === 0;
        execution.reason = child.status === 0 ? 'completed' : 'command_failed';
      }
    }
  }

  const result = {
    workflow_id: workflowId,
    trace_id: traceId,
    trainer,
    dataset_format: dataset.format,
    dataset_count: dataset.count,
    dataset_path: datasetPath,
    task_types: dataset.task_types,
    quality_summary: qualitySummary,
    training_plan: plan,
    manifest_path: manifestPath,
    challenger_model_id: challengerModelId,
    ready_for_training: dataset.count > 0,
    execution
  };

  args.repo.upsertWorkflowRun({
    id: workflowId,
    workflow_key: 'nova_training_flywheel',
    workflow_version: 'nova-training-flywheel.v1',
    trigger_type: triggerType,
    status: 'SUCCEEDED',
    trace_id: traceId,
    input_json: JSON.stringify({
      trainer,
      only_included: args.onlyIncluded !== false,
      limit: args.limit || 500,
      task_types: args.taskTypes || null,
      execute_when_ready: args.executeWhenReady === true
    }),
    output_json: JSON.stringify(result),
    attempt_count: 1,
    started_at_ms: now,
    updated_at_ms: Date.now(),
    completed_at_ms: Date.now()
  });

  recordAuditEvent(args.repo, {
    traceId,
    scope: 'nova_training_flywheel',
    eventType: 'NOVA_TRAINING_FLYWHEEL_COMPLETED',
    userId: args.userId || null,
    entityType: 'workflow_run',
    entityId: workflowId,
    payload: result
  });

  return result;
}
