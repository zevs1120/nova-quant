import { Router } from 'express';
import {
  parseMarketAndAssetFromQuery,
  asyncRoute,
  getRequestScope,
  queryUserIdOrGuest,
} from '../helpers.js';
import {
  getRuntimeStateResponse,
  getControlPlaneStatus,
  getFlywheelStatus,
  getAlphaOpsStatus,
  getResearchOpsStatus,
  getBackendBackbone,
} from '../queries.js';
import {
  applyMembershipAccessToRuntimeState,
  getMembershipState,
} from '../../membership/service.js';
import { recordFrontendRouteLatency } from '../../observability/spine.js';

const router = Router();

async function measureFrontendRead<T>(scope: string, read: () => Promise<T>): Promise<T> {
  const startedAt = Date.now();
  try {
    return await read();
  } finally {
    recordFrontendRouteLatency(scope, Date.now() - startedAt);
  }
}

router.get(
  '/api/runtime-state',
  asyncRoute(async (req, res) => {
    const { market, assetClass } = parseMarketAndAssetFromQuery(req);
    const userId = getRequestScope(req).userId;
    const runtime = await measureFrontendRead('runtime_state', () =>
      getRuntimeStateResponse({
        userId,
        market,
        assetClass,
      }),
    );
    const currentPlan =
      typeof (runtime as Record<string, any>)?.data?.membership?.currentPlan === 'string'
        ? String((runtime as Record<string, any>).data.membership.currentPlan)
        : getMembershipState({ userId }).currentPlan;
    res.json(
      applyMembershipAccessToRuntimeState({
        runtime: runtime as Record<string, unknown>,
        currentPlan,
      }),
    );
  }),
);

router.get(
  '/api/control-plane/status',
  asyncRoute(async (req, res) => {
    const userId = queryUserIdOrGuest(req);
    res.json(
      await getControlPlaneStatus({
        userId,
      }),
    );
  }),
);

router.get(
  '/api/control-plane/flywheel',
  asyncRoute(async (req, res) => {
    const userId = queryUserIdOrGuest(req);
    res.json(
      await getFlywheelStatus({
        userId,
      }),
    );
  }),
);

router.get(
  '/api/control-plane/research-ops',
  asyncRoute(async (req, res) => {
    const timeZone =
      (req.query.tz as string | undefined) ||
      (req.query.timezone as string | undefined) ||
      undefined;
    const localDate = (req.query.localDate as string | undefined) || undefined;
    res.json(
      await getResearchOpsStatus({
        timeZone,
        localDate,
      }),
    );
  }),
);

router.get(
  '/api/control-plane/alphas',
  asyncRoute(async (req, res) => {
    const timeZone =
      (req.query.tz as string | undefined) ||
      (req.query.timezone as string | undefined) ||
      undefined;
    const localDate = (req.query.localDate as string | undefined) || undefined;
    res.json(
      await getAlphaOpsStatus({
        timeZone,
        localDate,
      }),
    );
  }),
);

router.get('/api/backbone/summary', (req, res) => {
  const { market, assetClass } = parseMarketAndAssetFromQuery(req);
  const userId = queryUserIdOrGuest(req);
  res.json(
    getBackendBackbone({
      userId,
      market,
      assetClass,
    }),
  );
});

export default router;
