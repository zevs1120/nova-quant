import { test, expect } from '@playwright/test';
import { getProEnvConfig } from './env.js';
import { maybeCreateServiceClient, readTableCounts } from './helpers.js';

const config = getProEnvConfig({ strict: false });

test.describe('data integrity cross-checks', () => {
  test('admin system snapshot, app runtime state, and Supabase counts stay coherent', async ({
    browser,
    request,
  }) => {
    const runtimeConfig = getProEnvConfig();
    const adminContext = await browser.newContext({
      storageState: runtimeConfig.adminStorageStatePath,
    });
    const adminPage = await adminContext.newPage();
    const appContext = await browser.newContext({
      storageState: runtimeConfig.appStorageStatePath,
    });
    const appPage = await appContext.newPage();

    try {
      const adminSystemResponsePromise = adminPage.waitForResponse(
        (response) =>
          response.url().includes('/api/admin/system') && response.request().method() === 'GET',
        { timeout: 60_000 },
      );
      await adminPage.goto(`${runtimeConfig.adminUrl}`, { waitUntil: 'domcontentloaded' });
      await expect(adminPage.locator('.admin-shell')).toBeVisible({ timeout: 60_000 });
      await adminPage.getByRole('button', { name: /system health|系统健康/i }).click();
      const adminSystemResponse = await adminSystemResponsePromise;
      expect(adminSystemResponse.status()).toBe(200);
      const adminSystemJson = await adminSystemResponse.json();
      expect(adminSystemJson?.ok).toBe(true);
      expect(adminSystemJson?.data?.workflow_summary).toBeTruthy();
      expect(adminSystemJson?.data?.data_summary).toBeTruthy();

      const runtimeResponsePromise = appPage.waitForResponse(
        (response) =>
          response.url().includes('/api/runtime-state') && response.request().method() === 'GET',
        { timeout: 60_000 },
      );
      await appPage.goto(runtimeConfig.appUrl, { waitUntil: 'domcontentloaded' });
      await expect(appPage.locator('.native-tabbar')).toBeVisible({ timeout: 60_000 });
      const runtimeResponse = await runtimeResponsePromise;
      expect(runtimeResponse.status()).toBe(200);
      const runtimeJson = await runtimeResponse.json();
      expect(Array.isArray(runtimeJson?.signals)).toBe(true);

      const directApiRuntime = await request.get(`${runtimeConfig.apiUrl}/api/runtime-state`, {
        timeout: 60_000,
      });
      expect(directApiRuntime.ok()).toBe(true);
      const directApiRuntimeJson = await directApiRuntime.json();
      expect(Array.isArray(directApiRuntimeJson?.signals)).toBe(true);

      const serviceClient = maybeCreateServiceClient(runtimeConfig);
      if (serviceClient) {
        const counts = await readTableCounts(serviceClient);
        expect(Number(counts?.workflowRuns || 0)).toBeGreaterThan(0);
        expect(Number(counts?.backtestRuns || 0)).toBeGreaterThan(0);
        expect(Number(counts?.backtestMetrics || 0)).toBeGreaterThan(0);
      }
    } finally {
      await adminContext.close();
      await appContext.close();
    }
  });
});
