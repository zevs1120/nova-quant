import { chromium } from '@playwright/test';
import { ensureAuthDir, loginAdmin, loginApp } from './helpers.js';

export default async function globalSetup() {
  const config = await ensureAuthDir();
  const browser = await chromium.launch({ channel: 'chrome', headless: true });

  try {
    const appContext = await browser.newContext();
    const appPage = await appContext.newPage();
    await loginApp(appPage, config);
    await appContext.storageState({ path: config.appStorageStatePath });
    await appContext.close();

    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    await loginAdmin(adminPage, config);
    await adminContext.storageState({ path: config.adminStorageStatePath });
    await adminContext.close();
  } finally {
    await browser.close();
  }
}
