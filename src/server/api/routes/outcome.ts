import { Router } from 'express';
import { asyncRoute } from '../helpers.js';
import { getRuntimeRepo } from '../../db/runtimeRepository.js';
import { getRecentOutcomeSummary, invalidateFrontendReadCacheForUser } from '../queries.js';
import { resolveOutcomesForDate, resolveRecentOutcomes } from '../../outcome/resolver.js';

const router = Router();

router.get(
  '/api/outcomes/recent',
  asyncRoute(async (req, res) => {
    const userId = (req.query.userId as string | undefined) || 'guest-default';
    const limit = req.query.limit ? Math.min(Number(req.query.limit), 200) : 100;
    res.json(await getRecentOutcomeSummary({ userId, limit }));
  }),
);

router.post(
  '/api/outcomes/resolve',
  asyncRoute(async (req, res) => {
    const body = req.body as {
      userId?: string;
      date?: string;
      lookbackDays?: number;
    };
    const userId = body.userId || 'guest-default';

    const repo = getRuntimeRepo();

    if (body.date) {
      const entries = resolveOutcomesForDate(repo, body.date, userId);
      invalidateFrontendReadCacheForUser(userId);
      res.json({ date: body.date, resolved: entries.length, entries });
      return;
    }

    const lookbackDays = Math.min(Math.max(1, Number(body.lookbackDays) || 14), 30);
    const result = resolveRecentOutcomes(repo, userId, lookbackDays);
    invalidateFrontendReadCacheForUser(userId);
    res.json(result);
  }),
);

export default router;
