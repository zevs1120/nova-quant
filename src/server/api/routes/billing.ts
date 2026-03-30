import { Router } from 'express';
import {
  cancelBillingSubscription,
  completeBillingCheckoutSession,
  createBillingCheckoutSession,
  getBillingCheckoutSession,
  getBillingState,
  type BillingErrorCode,
} from '../../billing/service.js';
import { requireAuthenticatedScope } from '../helpers.js';

const router = Router();

function billingErrorStatus(error: BillingErrorCode) {
  if (error === 'AUTH_REQUIRED') return 401;
  if (error === 'CHECKOUT_NOT_FOUND') return 404;
  if (error === 'CHECKOUT_ALREADY_COMPLETED') return 409;
  if (error === 'CHECKOUT_EXPIRED' || error === 'CHECKOUT_NOT_OPEN') return 410;
  return 400;
}

router.get('/api/billing/state', (req, res) => {
  const scope = requireAuthenticatedScope(req, res);
  if (!scope) return;
  res.json(getBillingState(scope.userId));
});

router.post('/api/billing/checkout', (req, res) => {
  const scope = requireAuthenticatedScope(req, res);
  if (!scope) return;

  const body = req.body as {
    planKey?: string;
    billingCycle?: string;
    source?: string;
    locale?: string;
  };
  const result = createBillingCheckoutSession({
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
});

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

router.post('/api/billing/checkout/:sessionId/complete', (req, res) => {
  const scope = requireAuthenticatedScope(req, res);
  if (!scope) return;

  const body = req.body as {
    billingEmail?: string;
    paymentMethodLast4?: string;
  };
  const result = completeBillingCheckoutSession({
    userId: scope.userId,
    sessionId: String(req.params.sessionId || ''),
    billingEmail: body.billingEmail,
    paymentMethodLast4: body.paymentMethodLast4,
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

export default router;
