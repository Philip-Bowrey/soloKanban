// @ts-check
/**
 * SoloKanban Playwright E2E Configuration
 *
 * Runs against a local HTTP server (npm run dev or http-server).
 * Tests use a virtual in-memory filesystem injected via page.addInitScript()
 * so no real directory picker is needed — see tests/e2e/fixtures/mock-fs.js.
 *
 * Run:   npx playwright test
 * Debug: npx playwright test --debug
 * UI:    npx playwright test --ui
 */

import { defineConfig, devices } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:8080';
const isRemote = BASE_URL.startsWith('https://') || (BASE_URL.startsWith('http://') && !BASE_URL.includes('127.0.0.1') && !BASE_URL.includes('localhost'));

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,           // SoloKanban is stateful per tab; keep sequential
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'tests/e2e/playwright-report', open: 'never' }],
  ],

  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    // All tests run in Chromium — the File System Access API requires it
    ...devices['Desktop Chrome'],
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  ...(isRemote ? {} : {
    webServer: {
      command: 'node serve.js',
      url: 'http://127.0.0.1:8080',
      reuseExistingServer: !process.env.CI,
      timeout: 10_000,
    },
  }),
});
