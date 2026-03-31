import { Router } from 'express';
import { parseMarket, parseAssetClass, asyncRoute, getRequestScope } from '../helpers.js';
import { getDecisionSnapshot, listDecisionAudit } from '../queries.js';
import { applyMembershipAccessToDecision, getMembershipState } from '../../membership/service.js';

const router = Router();

router.post(
  '/api/decision/today',
  asyncRoute(async (req, res) => {
    const body = req.body as {
      userId?: string;
      market?: string;
      assetClass?: string;
      locale?: string;
      holdings?: Array<Record<string, unknown>>;
    };
    const market = parseMarket(body.market);
    const assetClass = parseAssetClass(body.assetClass);
    const userId = getRequestScope(req).userId;
    const decision = await getDecisionSnapshot({
      userId,
      market,
      assetClass,
      holdings: Array.isArray(body.holdings) ? (body.holdings as never) : [],
      locale: body.locale,
    });
    const membership = getMembershipState({ userId });
    res.json(
      applyMembershipAccessToDecision({
        decision: decision as Record<string, unknown>,
        currentPlan: membership.currentPlan,
      }),
    );
  }),
);

router.get('/api/decision/audit', (req, res) => {
  const market = parseMarket(req.query.market as string | undefined);
  const assetClass = parseAssetClass(req.query.assetClass as string | undefined);
  const userId = (req.query.userId as string | undefined) || 'guest-default';
  const limit = req.query.limit ? Number(req.query.limit) : 20;
  res.json(
    listDecisionAudit({
      userId,
      market,
      assetClass,
      limit,
    }),
  );
});

export default router;
