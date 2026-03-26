import { Router } from 'express';
import { parseMarket, parseAssetClass, asyncRoute } from '../helpers.js';
import {
  getEngagementState,
  completeMorningCheck,
  confirmRiskBoundary,
  completeWrapUp,
  completeWeeklyReview,
  getWidgetSummary,
  getNotificationPreview,
  getNotificationPreferencesStatePrimary,
  setNotificationPreferencesState,
} from '../queries.js';

const router = Router();

router.post(
  '/api/engagement/state',
  asyncRoute(async (req, res) => {
    const body = (req.body || {}) as {
      userId?: string;
      market?: string;
      assetClass?: string;
      localDate?: string;
      localHour?: number;
      locale?: string;
      holdings?: Array<Record<string, unknown>>;
    };
    const market = parseMarket(body.market);
    const assetClass = parseAssetClass(body.assetClass);
    const userId = body.userId || 'guest-default';
    res.json(
      await getEngagementState({
        userId,
        market,
        assetClass,
        localDate: body.localDate,
        localHour: Number(body.localHour),
        holdings: Array.isArray(body.holdings) ? (body.holdings as never) : [],
        locale: body.locale,
      }),
    );
  }),
);

router.post(
  '/api/engagement/morning-check',
  asyncRoute(async (req, res) => {
    const body = (req.body || {}) as {
      userId?: string;
      market?: string;
      assetClass?: string;
      localDate?: string;
      localHour?: number;
      locale?: string;
      holdings?: Array<Record<string, unknown>>;
    };
    res.json(
      await completeMorningCheck({
        userId: body.userId,
        market: parseMarket(body.market),
        assetClass: parseAssetClass(body.assetClass),
        localDate: body.localDate,
        localHour: Number(body.localHour),
        holdings: Array.isArray(body.holdings) ? (body.holdings as never) : [],
        locale: body.locale,
      }),
    );
  }),
);

router.post(
  '/api/engagement/boundary',
  asyncRoute(async (req, res) => {
    const body = (req.body || {}) as {
      userId?: string;
      market?: string;
      assetClass?: string;
      localDate?: string;
      localHour?: number;
      locale?: string;
      holdings?: Array<Record<string, unknown>>;
    };
    res.json(
      await confirmRiskBoundary({
        userId: body.userId,
        market: parseMarket(body.market),
        assetClass: parseAssetClass(body.assetClass),
        localDate: body.localDate,
        localHour: Number(body.localHour),
        holdings: Array.isArray(body.holdings) ? (body.holdings as never) : [],
        locale: body.locale,
      }),
    );
  }),
);

router.post(
  '/api/engagement/wrap-up',
  asyncRoute(async (req, res) => {
    const body = (req.body || {}) as {
      userId?: string;
      market?: string;
      assetClass?: string;
      localDate?: string;
      localHour?: number;
      locale?: string;
      holdings?: Array<Record<string, unknown>>;
    };
    res.json(
      await completeWrapUp({
        userId: body.userId,
        market: parseMarket(body.market),
        assetClass: parseAssetClass(body.assetClass),
        localDate: body.localDate,
        localHour: Number(body.localHour),
        holdings: Array.isArray(body.holdings) ? (body.holdings as never) : [],
        locale: body.locale,
      }),
    );
  }),
);

router.post(
  '/api/engagement/weekly-review',
  asyncRoute(async (req, res) => {
    const body = (req.body || {}) as {
      userId?: string;
      market?: string;
      assetClass?: string;
      localDate?: string;
      localHour?: number;
      locale?: string;
      holdings?: Array<Record<string, unknown>>;
    };
    res.json(
      await completeWeeklyReview({
        userId: body.userId,
        market: parseMarket(body.market),
        assetClass: parseAssetClass(body.assetClass),
        localDate: body.localDate,
        localHour: Number(body.localHour),
        holdings: Array.isArray(body.holdings) ? (body.holdings as never) : [],
        locale: body.locale,
      }),
    );
  }),
);

router.get(
  '/api/widgets/summary',
  asyncRoute(async (req, res) => {
    const market = parseMarket(req.query.market as string | undefined);
    const assetClass = parseAssetClass(req.query.assetClass as string | undefined);
    const userId = (req.query.userId as string | undefined) || 'guest-default';
    const localDate = req.query.localDate as string | undefined;
    const localHour = req.query.localHour ? Number(req.query.localHour) : undefined;
    const locale = req.query.locale as string | undefined;
    res.json(
      await getWidgetSummary({
        userId,
        market,
        assetClass,
        localDate,
        localHour,
        locale,
      }),
    );
  }),
);

router.get(
  '/api/notifications/preview',
  asyncRoute(async (req, res) => {
    const market = parseMarket(req.query.market as string | undefined);
    const assetClass = parseAssetClass(req.query.assetClass as string | undefined);
    const userId = (req.query.userId as string | undefined) || 'guest-default';
    const localDate = req.query.localDate as string | undefined;
    const localHour = req.query.localHour ? Number(req.query.localHour) : undefined;
    const locale = req.query.locale as string | undefined;
    res.json(
      await getNotificationPreview({
        userId,
        market,
        assetClass,
        localDate,
        localHour,
        locale,
      }),
    );
  }),
);

router.get(
  '/api/notification-preferences',
  asyncRoute(async (req, res) => {
    const userId = (req.query.userId as string | undefined) || 'guest-default';
    res.json(await getNotificationPreferencesStatePrimary(userId));
  }),
);

router.post('/api/notification-preferences', (req, res) => {
  const body = (req.body || {}) as {
    userId?: string;
    morning_enabled?: number | boolean;
    state_shift_enabled?: number | boolean;
    protective_enabled?: number | boolean;
    wrap_up_enabled?: number | boolean;
    frequency?: 'LOW' | 'NORMAL';
    quiet_start_hour?: number | null;
    quiet_end_hour?: number | null;
  };
  res.json(
    setNotificationPreferencesState({
      userId: body.userId,
      updates: {
        morning_enabled:
          body.morning_enabled === undefined ? undefined : Number(Boolean(body.morning_enabled)),
        state_shift_enabled:
          body.state_shift_enabled === undefined
            ? undefined
            : Number(Boolean(body.state_shift_enabled)),
        protective_enabled:
          body.protective_enabled === undefined
            ? undefined
            : Number(Boolean(body.protective_enabled)),
        wrap_up_enabled:
          body.wrap_up_enabled === undefined ? undefined : Number(Boolean(body.wrap_up_enabled)),
        frequency: body.frequency,
        quiet_start_hour:
          body.quiet_start_hour === undefined
            ? undefined
            : body.quiet_start_hour === null
              ? null
              : Number(body.quiet_start_hour),
        quiet_end_hour:
          body.quiet_end_hour === undefined
            ? undefined
            : body.quiet_end_hour === null
              ? null
              : Number(body.quiet_end_hour),
      },
    }),
  );
});

export default router;
