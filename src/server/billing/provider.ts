import { createHmac, timingSafeEqual } from 'node:crypto';

export type BillingProviderMode = 'internal_checkout' | 'stripe';
export type BillingPlan = 'free' | 'lite' | 'pro';
export type BillingCycle = 'weekly' | 'monthly' | 'annual';

type StripePriceMap = Record<Exclude<BillingPlan, 'free'>, Partial<Record<BillingCycle, string>>>;

export type BillingProviderConfig = {
  mode: BillingProviderMode;
  appUrl: string;
  portalReturnUrl: string;
  stripeApiBaseUrl: string;
  stripeSecretKey: string;
  stripeWebhookSecret: string;
  stripePriceIds: StripePriceMap;
};

export type StripeCheckoutSession = {
  id: string;
  url: string | null;
  customer: string | null;
  subscription: string | null;
  payment_status: string | null;
  status: string | null;
};

export type StripePortalSession = {
  id: string;
  url: string | null;
};

type StripeWebhookEnvelope = {
  id: string;
  type: string;
  created?: number;
  data?: {
    object?: Record<string, unknown>;
  };
};

const STRIPE_SIGNATURE_TOLERANCE_MS = 5 * 60 * 1000;

function trimTrailingSlash(value: string) {
  return String(value || '').replace(/\/+$/, '');
}

function normalizeAppUrl(value: string) {
  const normalized = trimTrailingSlash(String(value || '').trim());
  return normalized || 'https://app.novaquant.cloud';
}

function normalizeStripePriceId(value: string) {
  const normalized = String(value || '').trim();
  return normalized || '';
}

export function readBillingProviderConfig(): BillingProviderConfig {
  const appUrl = normalizeAppUrl(process.env.NOVA_APP_URL || process.env.STRIPE_APP_URL || '');
  const portalReturnUrl = normalizeAppUrl(
    process.env.STRIPE_PORTAL_RETURN_URL || process.env.STRIPE_CUSTOMER_PORTAL_RETURN_URL || appUrl,
  );
  const stripeSecretKey = String(process.env.STRIPE_SECRET_KEY || '').trim();
  const stripeWebhookSecret = String(process.env.STRIPE_WEBHOOK_SECRET || '').trim();
  const stripePriceIds: StripePriceMap = {
    lite: {
      weekly: normalizeStripePriceId(process.env.STRIPE_PRICE_LITE_WEEKLY || ''),
      monthly: normalizeStripePriceId(process.env.STRIPE_PRICE_LITE_MONTHLY || ''),
      annual: normalizeStripePriceId(process.env.STRIPE_PRICE_LITE_ANNUAL || ''),
    },
    pro: {
      weekly: normalizeStripePriceId(process.env.STRIPE_PRICE_PRO_WEEKLY || ''),
      monthly: normalizeStripePriceId(process.env.STRIPE_PRICE_PRO_MONTHLY || ''),
      annual: normalizeStripePriceId(process.env.STRIPE_PRICE_PRO_ANNUAL || ''),
    },
  };

  const hasRequiredStripePrices = Boolean(stripePriceIds.lite.weekly && stripePriceIds.pro.weekly);
  return {
    mode: stripeSecretKey && hasRequiredStripePrices ? 'stripe' : 'internal_checkout',
    appUrl,
    portalReturnUrl,
    stripeApiBaseUrl: trimTrailingSlash(
      String(process.env.STRIPE_API_BASE_URL || 'https://api.stripe.com/v1').trim(),
    ),
    stripeSecretKey,
    stripeWebhookSecret,
    stripePriceIds,
  };
}

export function resolveStripePriceId(
  config: BillingProviderConfig,
  planKey: Exclude<BillingPlan, 'free'>,
  billingCycle: BillingCycle,
) {
  const cyclePrice =
    config.stripePriceIds[planKey]?.[billingCycle] ||
    config.stripePriceIds[planKey]?.weekly ||
    config.stripePriceIds[planKey]?.monthly ||
    config.stripePriceIds[planKey]?.annual ||
    '';
  return String(cyclePrice || '').trim();
}

function encodeFormBody(
  payload: Record<string, string | number | boolean | null | undefined>,
): URLSearchParams {
  const form = new URLSearchParams();
  Object.entries(payload).forEach(([key, value]) => {
    if (value === null || value === undefined || value === '') return;
    form.set(key, String(value));
  });
  return form;
}

async function stripeRequest<T>(
  config: BillingProviderConfig,
  path: string,
  payload: Record<string, string | number | boolean | null | undefined>,
): Promise<T> {
  if (!config.stripeSecretKey) {
    throw new Error('STRIPE_NOT_CONFIGURED');
  }
  const response = await fetch(`${config.stripeApiBaseUrl}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.stripeSecretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: encodeFormBody(payload),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`STRIPE_API_ERROR:${response.status}:${text || 'request failed'}`);
  }
  return (await response.json()) as T;
}

export async function createStripeCheckoutSession(
  config: BillingProviderConfig,
  args: {
    localSessionId: string;
    userId: string;
    planKey: Exclude<BillingPlan, 'free'>;
    billingCycle: BillingCycle;
    priceId: string;
    customerId?: string | null;
    customerEmail: string;
    source?: string | null;
    locale?: string | null;
  },
): Promise<StripeCheckoutSession> {
  const successUrl = `${config.appUrl}/?billing=success&checkout_session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = `${config.appUrl}/?billing=cancel&checkout_session_id=${encodeURIComponent(
    args.localSessionId,
  )}`;
  const payload: Record<string, string | number | boolean | null | undefined> = {
    mode: 'subscription',
    success_url: successUrl,
    cancel_url: cancelUrl,
    'line_items[0][price]': args.priceId,
    'line_items[0][quantity]': 1,
    client_reference_id: args.localSessionId,
    customer: args.customerId || undefined,
    customer_email: args.customerId ? undefined : args.customerEmail,
    'metadata[local_checkout_session_id]': args.localSessionId,
    'metadata[user_id]': args.userId,
    'metadata[plan_key]': args.planKey,
    'metadata[billing_cycle]': args.billingCycle,
    'metadata[source]': args.source || '',
    'metadata[locale]': args.locale || '',
    'subscription_data[metadata][local_checkout_session_id]': args.localSessionId,
    'subscription_data[metadata][user_id]': args.userId,
    'subscription_data[metadata][plan_key]': args.planKey,
    'subscription_data[metadata][billing_cycle]': args.billingCycle,
    'subscription_data[metadata][source]': args.source || '',
    'subscription_data[metadata][locale]': args.locale || '',
  };
  return stripeRequest<StripeCheckoutSession>(config, '/checkout/sessions', payload);
}

export async function createStripePortalSession(
  config: BillingProviderConfig,
  args: {
    customerId: string;
    returnUrl?: string | null;
  },
): Promise<StripePortalSession> {
  return stripeRequest<StripePortalSession>(config, '/billing_portal/sessions', {
    customer: args.customerId,
    return_url: args.returnUrl || config.portalReturnUrl,
  });
}

function parseStripeSignatureHeader(signatureHeader: string) {
  const fragments = String(signatureHeader || '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  let timestamp = 0;
  const signatures: string[] = [];
  fragments.forEach((fragment) => {
    const [key, value] = fragment.split('=');
    if (!key || !value) return;
    if (key === 't') {
      timestamp = Number(value) || 0;
      return;
    }
    if (key === 'v1') signatures.push(value);
  });
  return {
    timestamp,
    signatures,
  };
}

function safeCompareHex(leftHex: string, rightHex: string) {
  const left = Buffer.from(String(leftHex || ''), 'hex');
  const right = Buffer.from(String(rightHex || ''), 'hex');
  if (!left.length || left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function verifyStripeWebhookEvent(
  payload: string,
  signatureHeader: string,
  secret: string,
  now = Date.now(),
): StripeWebhookEnvelope {
  const normalizedPayload = String(payload || '');
  const normalizedSecret = String(secret || '').trim();
  if (!normalizedPayload || !signatureHeader || !normalizedSecret) {
    throw new Error('STRIPE_WEBHOOK_SIGNATURE_INVALID');
  }
  const parsed = parseStripeSignatureHeader(signatureHeader);
  if (!parsed.timestamp || !parsed.signatures.length) {
    throw new Error('STRIPE_WEBHOOK_SIGNATURE_INVALID');
  }
  if (Math.abs(now - parsed.timestamp * 1000) > STRIPE_SIGNATURE_TOLERANCE_MS) {
    throw new Error('STRIPE_WEBHOOK_SIGNATURE_EXPIRED');
  }
  const signedPayload = `${parsed.timestamp}.${normalizedPayload}`;
  const expectedSignature = createHmac('sha256', normalizedSecret)
    .update(signedPayload, 'utf8')
    .digest('hex');
  const valid = parsed.signatures.some((candidate) => safeCompareHex(candidate, expectedSignature));
  if (!valid) {
    throw new Error('STRIPE_WEBHOOK_SIGNATURE_INVALID');
  }
  return JSON.parse(normalizedPayload) as StripeWebhookEnvelope;
}
