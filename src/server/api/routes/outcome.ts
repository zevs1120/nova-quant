import { Router } from 'express';
import { asyncRoute, parseMarket, parseAssetClass } from '../helpers.js';
import { getDb } from '../../db/database.js';
import { MarketRepository } from '../../db/repository.js';
import { ensureSchema } from '../../db/schema.js';
import {
  getOutcomeSummaryStats,
  resolveOutcomesForDate,
  resolveRecentOutcomes,
} from '../../outcome/resolver.js';

const router = Router();

router.get(
  '/api/outcomes/recent',
  asyncRoute(async (req, res) => {
    const userId = (req.query.userId as string | undefined) || 'guest-default';
    const limit = req.query.limit ? Math.min(Number(req.query.limit), 200) : 100;

    const db = getDb();
    ensureSchema(db);
    const repo = new MarketRepository(db);

    const { outcomes, stats } = getOutcomeSummaryStats(repo, userId, limit);

    res.json({ outcomes, stats });
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

    const db = getDb();
    ensureSchema(db);
    const repo = new MarketRepository(db);

    if (body.date) {
      const entries = resolveOutcomesForDate(repo, body.date, userId);
      res.json({ date: body.date, resolved: entries.length, entries });
      return;
    }

    const lookbackDays = Math.min(Math.max(1, Number(body.lookbackDays) || 14), 30);
    const result = resolveRecentOutcomes(repo, userId, lookbackDays);
    res.json(result);
  }),
);

export default router;
