import { defineConfig, devices } from '@playwright/test';

const isProEnvRun =
  process.env.PLAYWRIGHT_E2E_MODE === 'pro-env' ||
  process.argv.some((arg) => String(arg).includes('tests/pro-env'));
const appBaseUrl =
  process.env.PLAYWRIGHT_APP_URL || process.env.NOVA_APP_URL || 'https://app.novaquant.cloud';
const landingBaseUrl =
  process.env.PLAYWRIGHT_LANDING_URL || process.env.NOVA_LANDING_URL || 'https://novaquant.cloud';

export default defineConfig({
  testDir: isProEnvRun ? './tests/pro-env' : './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  timeout: isProEnvRun ? 90_000 : undefined,
  expect: {
    timeout: isProEnvRun ? 20_000 : 5_000,
  },
  globalSetup: isProEnvRun ? './tests/pro-env/global-setup.js' : undefined,
  use: {
    baseURL: isProEnvRun ? appBaseUrl : undefined,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        ...(isProEnvRun ? { channel: 'chrome' } : {}),
      },
    },
  ],
  webServer: isProEnvRun
    ? undefined
    : [
        {
          command: 'npm run dev:web -- --port 5173',
          url: 'http://localhost:5173',
          reuseExistingServer: !process.env.CI,
          timeout: 120 * 1000,
        },
        {
          command: 'npm run dev --prefix landing -- --port 5174',
          url:
            landingBaseUrl === 'https://novaquant.cloud' ? 'http://localhost:5174' : landingBaseUrl,
          reuseExistingServer: !process.env.CI,
          timeout: 120 * 1000,
        },
      ],
});
