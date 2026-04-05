import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('billing provider env contract', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_env');
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_test_env');
    vi.stubEnv('STRIPE_PRICE_LITE_WEEKLY', 'price_lite_weekly');
    vi.stubEnv('STRIPE_PRICE_PRO_WEEKLY', 'price_pro_weekly');
    vi.stubEnv('NOVA_PUBLIC_APP_URL', 'https://app.novaquant.cloud');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('prefers the platform app url when building Stripe return paths', async () => {
    const { readBillingProviderConfig } = await import('../src/server/billing/provider.js');
    const config = readBillingProviderConfig();

    expect(config.mode).toBe('stripe');
    expect(config.appUrl).toBe('https://app.novaquant.cloud');
    expect(config.portalReturnUrl).toBe('https://app.novaquant.cloud');
  });
});
