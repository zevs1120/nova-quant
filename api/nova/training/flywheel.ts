import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.status(503).json({
    error: 'TRAINING_FLYWHEEL_REQUIRES_PERSISTENT_STORE',
    note: 'Use the flywheel on the stateful backend or add a remote training data store before enabling this on Vercel.'
  });
}
