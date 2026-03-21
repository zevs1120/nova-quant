import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getNovaHealthState } from '../../src/server/api/queries.js';
import { getNovaModelPlan, getNovaRoutingPolicies, getNovaRuntimeAvailabilityReason, getNovaRuntimeMode } from '../../src/server/ai/llmOps.js';
import { generateGovernedNovaStrategies } from '../../src/server/nova/strategyLab.js';
import { createNoopNovaRepo } from '../../src/server/nova/noopRepo.js';

function resolveRoute(req: VercelRequest): string {
  const dynamic = req.query.route;
  if (Array.isArray(dynamic) && dynamic.length) return dynamic.join('/');
  if (typeof dynamic === 'string' && dynamic) return dynamic;
  const url = String(req.url || '');
  const [, suffix = ''] = url.split('/api/nova/');
  return suffix.split('?')[0] || '';
}

function parseMarket(value?: string): 'US' | 'CRYPTO' | undefined {
  const upper = String(value || '').toUpperCase();
  if (upper === 'US' || upper === 'CRYPTO') return upper;
  return undefined;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const route = resolveRoute(req);

  if (route === 'health' && req.method === 'GET') {
    res.status(200).json(await getNovaHealthState());
    return;
  }

  if (route === 'runtime' && req.method === 'GET') {
    const plan = getNovaModelPlan();
    const mode = getNovaRuntimeMode();
    res.status(200).json({
      endpoint: plan.endpoint,
      plan,
      routing: getNovaRoutingPolicies(),
      provider: plan.provider,
      local_only: plan.local_only,
      mode,
      availability_reason: getNovaRuntimeAvailabilityReason(mode)
    });
    return;
  }

  if (route === 'strategy/generate' && req.method === 'POST') {
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
    res.status(200).json(
      await generateGovernedNovaStrategies({
        repo: createNoopNovaRepo() as any,
        userId: String(body.userId || '').trim() || undefined,
        prompt,
        locale: String(body.locale || '').trim() || undefined,
        market,
        riskProfile: String(body.riskProfile || '').trim() || undefined,
        maxCandidates: Number.isFinite(Number(body.maxCandidates)) ? Number(body.maxCandidates) : undefined
      })
    );
    return;
  }

  if (route === 'training/flywheel' && req.method === 'POST') {
    res.status(503).json({
      error: 'TRAINING_FLYWHEEL_REQUIRES_PERSISTENT_STORE',
      note: 'Use the flywheel on the stateful backend or add a remote training data store before enabling this on Vercel.'
    });
    return;
  }

  res.status(404).json({ error: 'Not found' });
}
