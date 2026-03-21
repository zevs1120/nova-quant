import { describe, expect, it } from 'vitest';
import {
  DEFAULT_NOVA_MLX_TASK_TYPES,
  buildNovaMlxLoraPlan,
  normalizeNovaMlxTaskTypes,
  renderNovaShellCommand
} from '../src/server/nova/mlx.js';

describe('nova mlx training plan', () => {
  it('defaults to the first-wave training task types', () => {
    expect(DEFAULT_NOVA_MLX_TASK_TYPES).toEqual([
      'risk_regime_explanation',
      'action_card_generation',
      'assistant_grounded_answer'
    ]);
    expect(normalizeNovaMlxTaskTypes(['daily_wrap_up_generation'])).toEqual(DEFAULT_NOVA_MLX_TASK_TYPES);
  });

  it('builds a runnable LoRA command for MLX-LM', () => {
    const plan = buildNovaMlxLoraPlan({
      datasetPath: '/tmp/nova.jsonl',
      adapterPath: '/tmp/nova-lora',
      taskTypes: ['assistant_grounded_answer']
    });

    expect(plan.tasks).toEqual(['assistant_grounded_answer']);
    expect(plan.command[0]).toBe('python3');
    expect(plan.command).toContain('--adapter-path');
    expect(plan.command).toContain('--num-layers');
    expect(renderNovaShellCommand(plan.command)).toContain('mlx_lm lora');
  });
});
