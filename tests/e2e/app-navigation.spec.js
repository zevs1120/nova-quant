import { test, expect } from '@playwright/test';

test.describe('App Main Tabs Navigation E2E', () => {
  const APP_URL = 'http://localhost:5173';

  test.beforeEach(async ({ page }) => {
    // 1. Mock the auth/session API to return a fully logged-in user
    await page.route('**/api/auth/session', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          authenticated: true,
          roles: ['USER'],
          user: {
            userId: 'e2e-test-user',
            email: 'e2e@novaquant.com',
            name: 'E2E Tester',
            tradeMode: 'starter',
            broker: 'Robinhood',
          },
          state: null,
        }),
      });
    });

    // 2. Mock some potentially long-running or missing backend APIs to prevent blocking UI
    await page.route('**/api/assets**', (route) => route.fulfill({ json: { assets: [] } }));
    await page.route('**/api/signals**', (route) => route.fulfill({ json: { signals: [] } }));

    // 3. Inject LocalStorage to bypass Onboarding & Initial setup guards
    await page.addInitScript(() => {
      window.localStorage.setItem('nova-quant-onboarding-done', JSON.stringify(true));
      window.localStorage.setItem(
        'nova-quant-auth-session',
        JSON.stringify({
          userId: 'e2e-test-user',
          email: 'e2e@novaquant.com',
        }),
      );
    });

    // Navigate to local App
    await page.goto(`${APP_URL}/`);
  });

  test('Should navigate the 4 main tabs without crashing', async ({ page }) => {
    // Wait for the app shell to mount
    await expect(page.locator('#root')).toBeVisible();

    // The app shell mounts. Let's click through the main Navigation tabs by their class.
    const tabButtons = page.locator('.native-tabbar-button');
    // Wait for them to count 4
    await expect(tabButtons).toHaveCount(4);

    for (let i = 0; i < 4; i++) {
      await tabButtons.nth(i).click({ force: true });
      // Allow react rendering and network fetching to settle
      await page.waitForTimeout(1000);
    }

    // As a final assertion, we verify we reached the end successfully
    // Usually the last tab renders a list layout or specific header.
    // We just check if it hasn't crashed (root is still visible)
    await expect(page.locator('#root')).toBeVisible();
  });
});
