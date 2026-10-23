import { defineConfig, devices } from '@playwright/test';
import fs from 'fs';

const localChromium = fs.existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {};

const DB = process.env.E2E_DATABASE_URL || 'postgres://postgres@localhost:5433/cashbacksmart_e2e';
export default defineConfig({
  testDir: 'e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:3100',
    launchOptions: localChromium,
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], launchOptions: localChromium } },
  ],
  webServer: {
    command: 'npx next start -p 3100',
    url: 'http://localhost:3100',
    reuseExistingServer: false,
    timeout: 60000,
    env: { DATABASE_URL: DB, AUTH_SECRET: 'e2e-secret-0123456789-abcdefghijklmnopqrstuvwxyz', APP_URL: 'http://localhost:3100', CRON_SECRET: 'e2e-cron', NODE_ENV: 'production' },
  },
});
