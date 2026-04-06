import fs from 'node:fs/promises';
import path from 'node:path';
import { expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { getProEnvConfig } from './env.js';

export function slugDate(daysAgo = 0) {
  const target = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
  return target.toISOString().slice(0, 10);
}

export async function ensureAuthDir() {
  const config = getProEnvConfig();
  await fs.mkdir(path.dirname(config.appStorageStatePath), { recursive: true });
  return config;
}

async function waitForAppShell(page, timeout = 60_000) {
  const tabbarButtons = page.locator('.native-tabbar .native-tabbar-button');
  await expect(tabbarButtons.first()).toBeVisible({ timeout });
  return tabbarButtons;
}

async function waitForAppSurface(page, timeout = 60_000) {
  const tabbarButtons = page.locator('.native-tabbar .native-tabbar-button');
  const firstRunFlow = page.locator('.first-run-flow');
  const loginEntry = page.getByRole('button', { name: /log in|登录/i }).first();

  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await firstRunFlow.isVisible().catch(() => false)) return 'first-run';
    if (await loginEntry.isVisible().catch(() => false)) return 'intro';
    if (
      await tabbarButtons
        .first()
        .isVisible()
        .catch(() => false)
    )
      return 'shell';
    await page.waitForTimeout(500);
  }

  return 'unknown';
}

async function waitForPostLoginSurface(page, timeout = 60_000) {
  const tabbarButtons = page.locator('.native-tabbar .native-tabbar-button');
  const firstRunFlow = page.locator('.first-run-flow');

  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await firstRunFlow.isVisible().catch(() => false)) return 'first-run';
    if (
      await tabbarButtons
        .first()
        .isVisible()
        .catch(() => false)
    )
      return 'shell';
    await page.waitForTimeout(500);
  }

  return 'unknown';
}

export async function completeFirstRunSetupIfNeeded(page) {
  const firstRunFlow = page.locator('.first-run-flow');
  if (!(await firstRunFlow.isVisible().catch(() => false))) return false;

  const chooseEntry = page
    .getByRole('button', {
      name: /我准备开始交易|i am ready to trade|我已经有持仓|i already have positions|我先看看|i am just exploring/i,
    })
    .first();
  await expect(chooseEntry).toBeVisible({ timeout: 30_000 });
  await chooseEntry.click();

  const continueButton = page.getByRole('button', { name: /^继续$|^next$/i }).last();
  await expect(continueButton).toBeEnabled({ timeout: 30_000 });
  await continueButton.click();

  const finishButton = page.getByRole('button', { name: /^进入系统$|^enter nova$/i }).last();
  await expect(finishButton).toBeEnabled({ timeout: 30_000 });
  await finishButton.click();

  await waitForAppShell(page, 60_000);
  return true;
}

export async function loginApp(page, config = getProEnvConfig()) {
  await page.goto(config.appUrl, { waitUntil: 'domcontentloaded' });

  let surface = await waitForAppSurface(page, 30_000);
  if (surface === 'shell') {
    await waitForAppShell(page, 30_000);
    return;
  }

  if (surface === 'first-run') {
    await completeFirstRunSetupIfNeeded(page);
    return;
  }

  const loginEntry = page.getByRole('button', { name: /log in|登录/i }).first();
  await expect(loginEntry).toBeVisible({ timeout: 30_000 });
  await loginEntry.click();

  await page.getByPlaceholder(/enter email|输入邮箱/i).fill(config.testUserEmail);
  await page.getByPlaceholder(/enter your password|输入密码/i).fill(config.testUserPassword);

  await page
    .getByRole('button', { name: /log in|登录/i })
    .last()
    .click();

  surface = await waitForPostLoginSurface(page, 60_000);
  if (surface === 'first-run') {
    await completeFirstRunSetupIfNeeded(page);
    return;
  }

  if (surface === 'unknown') {
    throw new Error(
      'App login did not advance past the intro/login state with the provided test credentials.',
    );
  }

  await waitForAppShell(page, 60_000);
}

export async function loginAdmin(page, config = getProEnvConfig()) {
  await page.goto(config.adminUrl, { waitUntil: 'domcontentloaded' });

  const adminShell = page.locator('.admin-shell');
  if (await adminShell.isVisible().catch(() => false)) {
    await expect(adminShell).toBeVisible();
    return;
  }

  await page.getByLabel(/邮箱|email/i).fill(config.adminEmail);
  await page.getByLabel(/密码|password/i).fill(config.adminPassword);

  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().includes('/api/admin/login') && response.request().method() === 'POST',
      { timeout: 60_000 },
    ),
    page.getByRole('button', { name: /管理员登录|admin/i }).click(),
  ]);

  await expect(adminShell).toBeVisible({ timeout: 60_000 });
}

export async function jsonFromResponse(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Expected JSON response from ${response.url()}, got: ${text.slice(0, 200)}`);
  }
}

export function unwrapRuntimeState(payload) {
  if (!payload || typeof payload !== 'object') {
    return {
      envelope: payload,
      data: null,
      transparency: null,
    };
  }

  const envelope = payload;
  const data = payload.data && typeof payload.data === 'object' ? payload.data : payload;
  const transparency =
    payload.data_transparency || payload.transparency || data?.transparency || null;

  return {
    envelope,
    data,
    transparency,
  };
}

export async function fetchJsonInPage(page, url, init = {}) {
  return await page.evaluate(
    async ({ url: nextUrl, init: nextInit }) => {
      const response = await fetch(nextUrl, {
        credentials: 'include',
        ...nextInit,
        headers: {
          'Content-Type': 'application/json',
          ...(nextInit.headers || {}),
        },
      });
      let json = null;
      try {
        json = await response.json();
      } catch {
        json = null;
      }
      return {
        ok: response.ok,
        status: response.status,
        json,
      };
    },
    { url, init },
  );
}

export function maybeCreateServiceClient(config = getProEnvConfig()) {
  if (!config.supabaseServiceRoleKey) return null;
  return createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    db: {
      schema: config.supabaseSchema || 'public',
    },
  });
}

export async function readRecentWorkflowRun(client, workflowId) {
  if (!client || !workflowId) return null;
  const { data, error } = await client
    .from('workflow_runs')
    .select('id, workflow_key, status, updated_at_ms, trace_id')
    .eq('id', workflowId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function readTableCounts(client) {
  if (!client) return null;

  const [workflowRes, backtestRes, metricRes] = await Promise.all([
    client.from('workflow_runs').select('id', { count: 'exact', head: true }),
    client.from('backtest_runs').select('id', { count: 'exact', head: true }),
    client.from('backtest_metrics').select('id', { count: 'exact', head: true }),
  ]);

  for (const result of [workflowRes, backtestRes, metricRes]) {
    if (result.error) throw result.error;
  }

  return {
    workflowRuns: workflowRes.count ?? 0,
    backtestRuns: backtestRes.count ?? 0,
    backtestMetrics: metricRes.count ?? 0,
  };
}
