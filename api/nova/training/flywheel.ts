import type { VercelRequest, VercelResponse } from '@vercel/node';
import { runNovaTrainingFlywheelNow } from '../../../../src/server/api/queries.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const body = (req.body || {}) as {
    userId?: string;
    trainer?: string;
    onlyIncluded?: boolean;
    limit?: number;
    taskTypes?: string[];
  };
  const trainer = String(body.trainer || 'unsloth-lora').trim();
  if (!['mlx-lora', 'unsloth-lora', 'axolotl-qlora'].includes(trainer)) {
    res.status(400).json({ error: 'trainer must be mlx-lora, unsloth-lora, or axolotl-qlora' });
    return;
  }

  const taskTypes = Array.isArray(body.taskTypes)
    ? body.taskTypes.map((value) => String(value).trim()).filter(Boolean)
    : undefined;

  res.status(200).json(
    await runNovaTrainingFlywheelNow({
      userId: String(body.userId || '').trim() || undefined,
      trainer: trainer as 'mlx-lora' | 'unsloth-lora' | 'axolotl-qlora',
      onlyIncluded: body.onlyIncluded !== false,
      limit: Number.isFinite(Number(body.limit)) ? Number(body.limit) : undefined,
      taskTypes: taskTypes as
        | Array<
            | 'assistant_grounded_answer'
            | 'risk_regime_explanation'
            | 'action_card_generation'
            | 'daily_stance_generation'
            | 'daily_wrap_up_generation'
            | 'fast_classification'
            | 'retrieval_embedding'
            | 'strategy_candidate_generation'
          >
        | undefined
    })
  );
}
