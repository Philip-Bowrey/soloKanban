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
    baseURL: 'http://localhost:8080',
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

  /**
   * Start a simple static file server before running tests.
   * Swap this for 'npm run dev' if you have a dev server.
   */
  webServer: {
    command: 'npx --yes http-server . -p 8080 --cors -c-1',
    port: 8080,
    reuseExistingServer: !process.env.CI,
    timeout: 15_000,
  },
});
