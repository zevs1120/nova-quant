import { afterEach, describe, expect, it, vi } from 'vitest';

const originalWindow = globalThis.window;

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  if (originalWindow === undefined) {
    Reflect.deleteProperty(globalThis, 'window');
  } else {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: originalWindow,
    });
  }
});

describe('public url helpers', () => {
  it('builds app links from the configured public app url', async () => {
    vi.stubEnv('VITE_PUBLIC_APP_URL', 'https://app.novaquant.cloud');
    const { buildAppUrl } = await import('../src/shared/routes/publicUrls.js');

    expect(buildAppUrl('/invite?code=ABC')).toBe('https://app.novaquant.cloud/invite?code=ABC');
  });

  it('keeps billing return urls local during localhost development', async () => {
    vi.stubEnv('VITE_PUBLIC_APP_URL', 'https://app.novaquant.cloud');
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        location: {
          hostname: 'localhost',
          origin: 'http://localhost:5173',
          pathname: '/settings',
        },
      },
    });

    const { resolveBillingReturnUrl } = await import('../src/shared/routes/publicUrls.js');
    expect(resolveBillingReturnUrl()).toBe('http://localhost:5173/settings');
  });
});
