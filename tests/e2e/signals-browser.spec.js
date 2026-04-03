import { test, expect } from '@playwright/test';

test.describe('Singal Browser Deep Link Simulation', () => {
  const APP_URL = 'http://localhost:5173';

  test.beforeEach(async ({ page }) => {
    // 1. Catch-all routing to prevent API connection refused states
    await page.route('**/api/**', async (route) => {
      const url = route.request().url();

      if (url.includes('auth/session')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            authenticated: true,
            roles: ['USER'],
            user: { userId: 'e2e-user', email: 'tester@nova.com' },
          }),
        });
      }

      if (
        url.includes('decision/today') ||
        url.includes('evidence/signals') ||
        url.includes('/signals')
      ) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            signals: [
              {
                id: 'testing-id-mockaa',
                symbol: 'MOCKAA',
                direction: 'LONG',
                status: 'verified',
                market: 'US',
                currentPrice: 1337.0,
                intent: { canOpenBroker: false, side: 'BUY' },
              },
            ],
          }),
        });
      }

      // Default mock for all other APIs (runtime-state, market-state, etc.)
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({}),
      });
    });

    // We skip the onboarding pipeline via Local Storage injection
    await page.goto(`${APP_URL}/`);
    await page.evaluate(() => window.localStorage.setItem('nova-quant-onboarding-done', 'true'));
    await page.reload();
  });

  test('App mounts layout correctly without api data', async ({ page }) => {
    // Await basic UI mount
    await expect(page.locator('#root')).toBeVisible();
  });
});
