import { Router } from 'express';
import { parseMarket, asyncRoute } from '../helpers.js';
import type { NovaTaskType } from '../../types.js';
import {
  getNovaRuntimeState,
  getNovaHealthState,
  listNovaRuns,
  createNovaReviewLabel,
  exportNovaTrainingDataset,
  runNovaTrainingFlywheelNow,
  runNovaStrategyGeneration,
  runNovaProductionStrategy,
  runNovaRobustnessTrainingNow,
} from '../queries.js';

const router = Router();

router.get('/api/nova/runtime', (_req, res) => {
  res.json(getNovaRuntimeState());
});

router.get('/api/nova/health', async (_req, res) => {
  res.json(await getNovaHealthState());
});

router.get('/api/nova/runs', (req, res) => {
  const userId = (req.query.userId as string | undefined) || undefined;
  const threadId = (req.query.threadId as string | undefined) || undefined;
  const taskType = (req.query.taskType as string | undefined) || undefined;
  const status = (req.query.status as string | undefined) || undefined;
  const limit = req.query.limit ? Number(req.query.limit) : 60;
  res.json(
    listNovaRuns({
      userId,
      threadId,
      taskType,
      status,
      limit,
    }),
  );
});

router.post('/api/nova/review-label', (req, res) => {
  const body = (req.body || {}) as {
    runId?: string;
    reviewerId?: string;
    label?: string;
    score?: number;
    notes?: string;
    includeInTraining?: boolean;
  };
  const runId = String(body.runId || '').trim();
  const label = String(body.label || '').trim();
  if (!runId || !label) {
    res.status(400).json({ error: 'runId and label are required' });
    return;
  }
  res.json(
    createNovaReviewLabel({
      runId,
      reviewerId: body.reviewerId,
      label,
      score: body.score,
      notes: body.notes,
      includeInTraining: Boolean(body.includeInTraining),
    }),
  );
});

router.get('/api/nova/training/export', (req, res) => {
  const onlyIncluded = String(req.query.onlyIncluded || '').toLowerCase() === 'true';
  const limit = req.query.limit ? Number(req.query.limit) : 500;
  res.json(
    exportNovaTrainingDataset({
      onlyIncluded,
      limit,
    }),
  );
});

router.post(
  '/api/nova/training/flywheel',
  asyncRoute(async (req, res) => {
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
    res.json(
      await runNovaTrainingFlywheelNow({
        userId: String(body.userId || '').trim() || undefined,
        trainer: trainer as 'mlx-lora' | 'unsloth-lora' | 'axolotl-qlora',
        onlyIncluded: body.onlyIncluded !== false,
        limit: Number.isFinite(Number(body.limit)) ? Number(body.limit) : undefined,
        taskTypes: taskTypes as NovaTaskType[] | undefined,
      }),
    );
  }),
);

router.post(
  '/api/nova/training/robustness',
  asyncRoute(async (req, res) => {
    const body = (req.body || {}) as {
      userId?: string;
      locale?: string;
      market?: string;
      start?: string;
      end?: string;
      taskLimit?: number;
      seed?: number;
      riskProfiles?: string[];
    };
    const rawMarket = String(body.market || 'ALL')
      .trim()
      .toUpperCase();
    if (!['US', 'CRYPTO', 'ALL'].includes(rawMarket)) {
      res.status(400).json({ error: 'market must be US, CRYPTO, or ALL' });
      return;
    }
    const riskProfiles = Array.isArray(body.riskProfiles)
      ? body.riskProfiles
          .map((value) => String(value).trim().toLowerCase())
          .filter((value) => ['conservative', 'balanced', 'aggressive'].includes(value))
      : undefined;
    res.json(
      await runNovaRobustnessTrainingNow({
        userId: String(body.userId || '').trim() || undefined,
        locale: String(body.locale || '').trim() || undefined,
        market: rawMarket as 'US' | 'CRYPTO' | 'ALL',
        start: body.start ? String(body.start) : undefined,
        end: body.end ? String(body.end) : undefined,
        taskLimit: Number.isFinite(Number(body.taskLimit)) ? Number(body.taskLimit) : undefined,
        seed: Number.isFinite(Number(body.seed)) ? Number(body.seed) : undefined,
        riskProfiles: riskProfiles as ('conservative' | 'balanced' | 'aggressive')[] | undefined,
      }),
    );
  }),
);

router.post(
  '/api/nova/strategy/generate',
  asyncRoute(async (req, res) => {
    const body = (req.body || {}) as {
      userId?: string;
      prompt?: string;
      locale?: string;
      market?: string;
      riskProfile?: string;
      maxCandidates?: number;
    };
    const prompt = String(body.prompt || '').trim();
    const market = parseMarket(body.market);
    if (!prompt) {
      res.status(400).json({ error: 'prompt is required' });
      return;
    }
    if (body.market && !market) {
      res.status(400).json({ error: 'Invalid market, use US or CRYPTO' });
      return;
    }
    res.json(
      await runNovaStrategyGeneration({
        userId: String(body.userId || '').trim() || undefined,
        prompt,
        locale: String(body.locale || '').trim() || undefined,
        market,
        riskProfile: String(body.riskProfile || '').trim() || undefined,
        maxCandidates: Number.isFinite(Number(body.maxCandidates))
          ? Number(body.maxCandidates)
          : undefined,
      }),
    );
  }),
);

router.post(
  '/api/nova/strategy/production-pack',
  asyncRoute(async (req, res) => {
    const body = (req.body || {}) as {
      userId?: string;
      locale?: string;
      market?: string;
      symbols?: string[];
      start?: string;
      end?: string;
      riskProfile?: 'conservative' | 'balanced' | 'aggressive';
    };
    const rawMarket = String(body.market || 'ALL')
      .trim()
      .toUpperCase();
    if (!['US', 'CRYPTO', 'ALL'].includes(rawMarket)) {
      res.status(400).json({ error: 'market must be US, CRYPTO, or ALL' });
      return;
    }
    const symbols = Array.isArray(body.symbols)
      ? body.symbols.map((value) => String(value).trim().toUpperCase()).filter(Boolean)
      : undefined;
    res.json(
      await runNovaProductionStrategy({
        userId: String(body.userId || '').trim() || undefined,
        locale: String(body.locale || '').trim() || undefined,
        market: rawMarket as 'US' | 'CRYPTO' | 'ALL',
        symbols,
        start: body.start ? String(body.start) : undefined,
        end: body.end ? String(body.end) : undefined,
        riskProfile: body.riskProfile,
      }),
    );
  }),
);

export default router;
