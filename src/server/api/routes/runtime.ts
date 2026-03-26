import { Router } from 'express';
import { parseMarket, parseAssetClass, asyncRoute } from '../helpers.js';
import {
  getRuntimeStateResponse,
  getControlPlaneStatus,
  getFlywheelStatus,
  getAlphaOpsStatus,
  getResearchOpsStatus,
  getBackendBackbone,
} from '../queries.js';

const router = Router();

router.get(
  '/api/runtime-state',
  asyncRoute(async (req, res) => {
    const market = parseMarket(req.query.market as string | undefined);
    const assetClass = parseAssetClass(req.query.assetClass as string | undefined);
    const userId = (req.query.userId as string | undefined) || 'guest-default';
    const runtime = await getRuntimeStateResponse({
      userId,
      market,
      assetClass,
    });
    res.json(runtime);
  }),
);

router.get(
  '/api/control-plane/status',
  asyncRoute(async (req, res) => {
    const userId = (req.query.userId as string | undefined) || 'guest-default';
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
    const userId = (req.query.userId as string | undefined) || 'guest-default';
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
  const market = parseMarket(req.query.market as string | undefined);
  const assetClass = parseAssetClass(req.query.assetClass as string | undefined);
  const userId = (req.query.userId as string | undefined) || 'guest-default';
  res.json(
    getBackendBackbone({
      userId,
      market,
      assetClass,
    }),
  );
});

export default router;
