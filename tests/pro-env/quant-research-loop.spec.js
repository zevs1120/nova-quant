import { test, expect } from '@playwright/test';
import { getProEnvConfig } from './env.js';
import {
  fetchJsonInPage,
  jsonFromResponse,
  maybeCreateServiceClient,
  readRecentWorkflowRun,
  slugDate,
} from './helpers.js';

const config = getProEnvConfig({ strict: false });

test.use({ storageState: config.appStorageStatePath });

test('strategy lab request completes through real API and Qlib bridge is reachable', async ({
  page,
  browser,
  request,
}) => {
  const runtimeConfig = getProEnvConfig();

  await page.goto(runtimeConfig.appUrl, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.native-tabbar')).toBeVisible({ timeout: 60_000 });

  const runtimeResponse = await page.waitForResponse(
    (response) =>
      response.url().includes('/api/runtime-state') && response.request().method() === 'GET',
    { timeout: 60_000 },
  );
  const runtimeState = await jsonFromResponse(runtimeResponse);
  expect(Array.isArray(runtimeState?.signals)).toBe(true);

  const strategyPayload = await fetchJsonInPage(page, '/api/nova/strategy/generate', {
    method: 'POST',
    body: JSON.stringify({
      prompt: 'Generate a conservative US equity swing strategy around liquid mega-cap momentum.',
      locale: 'en',
      market: 'US',
      riskProfile: 'conservative',
      maxCandidates: 4,
    }),
  });

  expect(strategyPayload.ok).toBe(true);
  expect(strategyPayload.status).toBe(200);
  expect(Array.isArray(strategyPayload.json?.selected_candidates)).toBe(true);
  expect(strategyPayload.json?.selected_candidates?.length).toBeGreaterThan(0);
  expect(String(strategyPayload.json?.workflow_id || '')).toBeTruthy();

  const qlibStatus = await request.get(`${runtimeConfig.qlibBridgeUrl}/api/status`, {
    timeout: 60_000,
  });
  expect(qlibStatus.ok()).toBe(true);
  const qlibStatusJson = await qlibStatus.json();
  expect(qlibStatusJson?.status).toBe('running');

  if (qlibStatusJson?.qlib_ready) {
    const factorProbe = await request.post(`${runtimeConfig.qlibBridgeUrl}/api/factors/compute`, {
      data: {
        symbols: ['AAPL'],
        factor_set: 'Alpha158',
        start_date: slugDate(5),
        end_date: slugDate(0),
      },
      timeout: 60_000,
    });
    expect(factorProbe.ok()).toBe(true);
    const factorProbeJson = await factorProbe.json();
    expect(factorProbeJson?.status).toBe('ok');
    expect(Number(factorProbeJson?.row_count || 0)).toBeGreaterThan(0);
  }

  const serviceClient = maybeCreateServiceClient(runtimeConfig);
  if (serviceClient) {
    const workflowRun = await readRecentWorkflowRun(
      serviceClient,
      strategyPayload.json?.workflow_id,
    );
    expect(workflowRun?.id).toBe(strategyPayload.json?.workflow_id);
    expect(String(workflowRun?.workflow_key || '')).toContain('nova_strategy_lab');
  }

  const adminContext = await browser.newContext({
    storageState: runtimeConfig.adminStorageStatePath,
  });
  const adminPage = await adminContext.newPage();
  try {
    await adminPage.goto(runtimeConfig.adminUrl, { waitUntil: 'domcontentloaded' });
    await expect(adminPage.locator('.admin-shell')).toBeVisible({ timeout: 60_000 });
    await adminPage
      .getByRole('button', { name: /策略工厂|strategy factory|alpha lab|research ops/i })
      .first()
      .click();
    await expect(adminPage.locator('.panel')).toBeVisible({ timeout: 60_000 });
    await expect(
      adminPage.locator('text=/Strategy lab|Nova training|Free data/i').first(),
    ).toBeVisible({
      timeout: 60_000,
    });
  } finally {
    await adminContext.close();
  }
});
