import { test, expect } from '@playwright/test';

test.describe('Onboarding Funnel E2E', () => {
  const APP_URL = 'http://localhost:5173';

  test.beforeEach(async ({ page }) => {
    // We mock the user session but EXPLICITLY leave 'nova-quant-onboarding-done' unset
    await page.route('**/api/auth/session', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          authenticated: true,
          roles: ['USER'],
          user: {
            userId: 'new-user',
            email: 'newbie@novaquant.com',
          },
          state: null,
        }),
      });
    });

    // Mocking out APIs that Onboarding might mutate or read
    await page.route('**/api/manual/state', (route) => route.fulfill({ json: { state: 'NEW' } }));
    await page.route('**/api/risk-profile', (route) =>
      route.fulfill({ json: { level: 'moderate' } }),
    );

    // Let's clear any injected local storage to guarantee cold start
    await page.goto(`${APP_URL}/`);
    await page.evaluate(() => window.localStorage.clear());
  });

  test('New user is forced through the first run setup and ultimately lands on app shell', async ({
    page,
  }) => {
    // 1. Visit root page
    await page.goto(`${APP_URL}/`);

    // 2. The FirstRunSetupFlow / Onboarding should take over instead of the Main Shell Tab Bar
    // We check that the Native Tabbar isn't present
    await expect(page.locator('.native-tabbar')).toHaveCount(0);

    // We expect some wizard buttons like "Start" or "Next" or "Continue"
    const nextOrStartButton = page.locator('button', { hasText: /start|continue|next/i }).first();
    await expect(nextOrStartButton).toBeVisible();

    // 3. We click through the flow
    let isFlowComplete = false;
    for (let i = 0; i < 6; i++) {
      if ((await page.locator('.native-tabbar').count()) > 0) {
        isFlowComplete = true;
        break; // Flow finished!
      }

      const btn = page.locator('button', { hasText: /continue|next|skip/i }).first();
      // Click whatever progression button is visible
      if (await btn.isVisible()) {
        await btn.click({ force: true });
        await page.waitForTimeout(600); // Wait for transition
      }
    }

    // 4. Finally, verify the app shell properly mounted.
    // That means local-storage was cleanly set, router popped and NativeTabBar appears!
    await expect(page.locator('.native-tabbar')).toHaveCount(1, { timeout: 10000 });
  });
});
