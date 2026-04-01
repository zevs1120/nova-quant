import express, { Router } from 'express';
import {
  cancelBillingSubscription,
  createBillingCheckoutSession,
  createBillingPortalSession,
  getBillingCheckoutSession,
  getBillingState,
  processBillingWebhook,
  type BillingErrorCode,
} from '../../billing/service.js';
import { asyncRoute, requireAuthenticatedScope } from '../helpers.js';

const router = Router();

function billingErrorStatus(error: BillingErrorCode) {
  if (error === 'AUTH_REQUIRED') return 401;
  if (error === 'BILLING_WEBHOOK_INVALID') return 400;
  if (error === 'CHECKOUT_NOT_FOUND') return 404;
  if (error === 'CHECKOUT_ALREADY_COMPLETED') return 409;
  if (error === 'BILLING_PROVIDER_NOT_CONFIGURED' || error === 'BILLING_PORTAL_UNAVAILABLE') {
    return 503;
  }
  if (error === 'CHECKOUT_COMPLETION_DISABLED') return 410;
  if (error === 'CHECKOUT_EXPIRED' || error === 'CHECKOUT_NOT_OPEN') return 410;
  return 400;
}

router.get('/api/billing/state', (req, res) => {
  const scope = requireAuthenticatedScope(req, res);
  if (!scope) return;
  res.json(getBillingState(scope.userId));
});

router.post(
  '/api/billing/checkout',
  asyncRoute(async (req, res) => {
    const scope = requireAuthenticatedScope(req, res);
    if (!scope) return;

    const body = req.body as {
      planKey?: string;
      billingCycle?: string;
      source?: string;
      locale?: string;
    };
    const result = await createBillingCheckoutSession({
      userId: scope.userId,
      planKey: String(body.planKey || ''),
      billingCycle: body.billingCycle,
      source: body.source,
      locale: body.locale,
    });
    if (!result.ok) {
      res.status(billingErrorStatus(result.error)).json(result);
      return;
    }
    res.json(result);
  }),
);

router.get('/api/billing/checkout/:sessionId', (req, res) => {
  const scope = requireAuthenticatedScope(req, res);
  if (!scope) return;

  const result = getBillingCheckoutSession({
    userId: scope.userId,
    sessionId: String(req.params.sessionId || ''),
  });
  if (!result.ok) {
    res.status(billingErrorStatus(result.error)).json(result);
    return;
  }
  res.json(result);
});

router.post('/api/billing/subscription/cancel', (req, res) => {
  const scope = requireAuthenticatedScope(req, res);
  if (!scope) return;

  const result = cancelBillingSubscription({ userId: scope.userId });
  if (!result.ok) {
    res.status(billingErrorStatus(result.error)).json(result);
    return;
  }
  res.json(result);
});

router.post(
  '/api/billing/portal',
  asyncRoute(async (req, res) => {
    const scope = requireAuthenticatedScope(req, res);
    if (!scope) return;

    const body = req.body as {
      returnUrl?: string;
    };
    const result = await createBillingPortalSession({
      userId: scope.userId,
      returnUrl: body.returnUrl,
    });
    if (!result.ok) {
      res.status(billingErrorStatus(result.error)).json(result);
      return;
    }
    res.json(result);
  }),
);

// Use express.raw() so the webhook route always receives the true byte-for-byte
// request body required by Stripe HMAC signature verification — regardless of
// whether the platform (Vercel, EC2) has already pre-parsed the JSON body.
router.post(
  '/api/billing/webhook',
  express.raw({ type: 'application/json', limit: '2mb' }),
  (req, res) => {
    const signature = String(req.header('stripe-signature') || '');
    // req.body is a Buffer when express.raw() runs; fall back to the
    // shared rawBody property for environments that skip this middleware.
    const rawBody =
      req.body instanceof Buffer
        ? req.body.toString('utf8')
        : String((req.body as string | undefined) || '');
    const result = processBillingWebhook({
      signature,
      rawBody,
    });
    if (!result.ok) {
      res.status(billingErrorStatus(result.error)).json(result);
      return;
    }
    res.json(result);
  },
);

export default router;
