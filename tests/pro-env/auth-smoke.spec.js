import { test, expect } from '@playwright/test';
import { getProEnvConfig } from './env.js';
import { jsonFromResponse, unwrapRuntimeState } from './helpers.js';

const config = getProEnvConfig({ strict: false });

test.use({ storageState: config.appStorageStatePath });

test('app auth smoke reaches session and runtime state in real environment', async ({ page }) => {
  const runtimeConfig = getProEnvConfig();
  const authSessionPromise = page.waitForResponse(
    (response) =>
      response.url().includes('/api/auth/session') && response.request().method() === 'GET',
    { timeout: 60_000 },
  );
  const runtimePromise = page.waitForResponse(
    (response) =>
      response.url().includes('/api/runtime-state') && response.request().method() === 'GET',
    { timeout: 60_000 },
  );

  await page.goto(runtimeConfig.appUrl, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.native-tabbar')).toBeVisible({ timeout: 60_000 });

  const authSession = await jsonFromResponse(await authSessionPromise);
  expect(authSession?.authenticated).toBe(true);
  expect(String(authSession?.user?.email || '').toLowerCase()).toBe(
    runtimeConfig.testUserEmail.toLowerCase(),
  );

  const runtimeState = await jsonFromResponse(await runtimePromise);
  const runtime = unwrapRuntimeState(runtimeState);
  expect(Array.isArray(runtime.data?.signals)).toBe(true);
  expect(runtime.data).toHaveProperty('decision');
  expect(runtime.data).toHaveProperty('today');
  expect(runtime.envelope).toHaveProperty('data_transparency');
});

test('landing page is reachable in the same production estate', async ({ page }) => {
  const runtimeConfig = getProEnvConfig();
  await page.goto(runtimeConfig.landingUrl, { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveTitle(/Nova/i);
});
