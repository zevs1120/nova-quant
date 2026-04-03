import { test, expect } from '@playwright/test';

test('Nova Quant Application smoke test', async ({ page }) => {
  // Go to the local base URL (provided by config)
  await page.goto('/');

  // Verify the page title matches index.html
  await expect(page).toHaveTitle(/Nova Quant/);

  // Verify the root node that React mounts into is present
  const rootElement = page.locator('#root');
  await expect(rootElement).toBeVisible();

  // Wait for network requests to settle to ensure React logic completes
  await page.waitForLoadState('networkidle');

  // We can confidently say the app rendered something without a hard client-side crash
});
