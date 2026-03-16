import path from 'node:path';
import type { NovaTaskType } from '../types.js';
import { getNovaModelPlan } from '../ai/llmOps.js';

export const DEFAULT_NOVA_MLX_TASK_TYPES: NovaTaskType[] = [
  'risk_regime_explanation',
  'action_card_generation',
  'assistant_grounded_answer'
];

const SUPPORTED_NOVA_MLX_TASK_TYPES = new Set<NovaTaskType>(DEFAULT_NOVA_MLX_TASK_TYPES);

const OLLAMA_TO_MLX_MODEL: Record<string, string> = {
  'qwen3:1.7b': 'Qwen/Qwen3-1.7B-Instruct',
  'qwen3:4b': 'Qwen/Qwen3-4B-Instruct',
  'qwen3:8b': 'Qwen/Qwen3-8B-Instruct',
  'qwen3:14b': 'Qwen/Qwen3-14B-Instruct'
};

export function normalizeNovaMlxTaskTypes(taskTypes?: ReadonlyArray<string>) {
  const normalized = [...new Set((taskTypes || DEFAULT_NOVA_MLX_TASK_TYPES).filter(Boolean))]
    .filter((task): task is NovaTaskType => SUPPORTED_NOVA_MLX_TASK_TYPES.has(task as NovaTaskType));

  return normalized.length ? normalized : [...DEFAULT_NOVA_MLX_TASK_TYPES];
}

export function getDefaultNovaMlxBaseModel() {
  const ollamaModel = getNovaModelPlan().models['Nova-Core'] || 'qwen3:4b';
  return OLLAMA_TO_MLX_MODEL[ollamaModel] || 'Qwen/Qwen3-4B-Instruct';
}

export type NovaMlxLoraPlan = {
  baseModel: string;
  datasetPath: string;
  adapterPath: string;
  iters: number;
  batchSize: number;
  learningRate: number;
  loraLayers: number;
  tasks: NovaTaskType[];
  command: string[];
};

export function buildNovaMlxLoraPlan(args?: Partial<{
  baseModel: string;
  datasetPath: string;
  adapterPath: string;
  iters: number;
  batchSize: number;
  learningRate: number;
  loraLayers: number;
  taskTypes: ReadonlyArray<string>;
}>) : NovaMlxLoraPlan {
  const tasks = normalizeNovaMlxTaskTypes(args?.taskTypes);
  const baseModel = args?.baseModel || getDefaultNovaMlxBaseModel();
  const datasetPath = args?.datasetPath || path.join(process.cwd(), 'artifacts', 'training', 'nova-mlx.jsonl');
  const adapterPath = args?.adapterPath || path.join(process.cwd(), 'artifacts', 'training', 'nova-lora-adapter');
  const iters = Number.isFinite(args?.iters) ? Number(args?.iters) : 300;
  const batchSize = Number.isFinite(args?.batchSize) ? Number(args?.batchSize) : 2;
  const learningRate = Number.isFinite(args?.learningRate) ? Number(args?.learningRate) : 1e-5;
  const loraLayers = Number.isFinite(args?.loraLayers) ? Number(args?.loraLayers) : 16;

  return {
    baseModel,
    datasetPath,
    adapterPath,
    iters,
    batchSize,
    learningRate,
    loraLayers,
    tasks,
    command: [
      'python3',
      '-m',
      'mlx_lm.lora',
      '--model',
      baseModel,
      '--train',
      '--data',
      datasetPath,
      '--adapter-path',
      adapterPath,
      '--iters',
      String(iters),
      '--batch-size',
      String(batchSize),
      '--learning-rate',
      String(learningRate),
      '--lora-layers',
      String(loraLayers)
    ]
  };
}

export function renderNovaShellCommand(argv: readonly string[]) {
  return argv
    .map((part) => (/^[A-Za-z0-9_./:@-]+$/.test(part) ? part : JSON.stringify(part)))
    .join(' ');
}
