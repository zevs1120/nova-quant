import type { VercelRequest, VercelResponse } from '@vercel/node';
import { generateGovernedNovaStrategies } from '../../../src/server/nova/strategyLab.js';
import { createNoopNovaRepo } from '../../../src/server/nova/noopRepo.js';

function parseMarket(value?: string): 'US' | 'CRYPTO' | undefined {
  if (!value) return undefined;
  const upper = value.toUpperCase();
  if (upper === 'US' || upper === 'CRYPTO') return upper;
  return undefined;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
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
}
