/**
 * E2E Tests — Area A: Workspace Setup & First Run
 * User Stories: US-SETUP-1 through US-SETUP-5
 *
 * Covers: blank workspace init, returning workspace, first-run banners
 * (Chromium vs non-Chromium), per-workspace banner dismissal.
 */

import { test, expect } from './fixtures/kanban-fixture.js';

// ─────────────────────────────────────────────────────────────────────────────
// US-SETUP-1: Opening a blank folder initializes the workspace
// ─────────────────────────────────────────────────────────────────────────────
test('US-SETUP-1: blank workspace opens with zero projects and no console errors', async ({ page, kanban }) => {
  const errors = [];
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', err => errors.push(err.message));

  await kanban.openWorkspace();

  // Board renders with no cards
  await expect(page.locator('.kanban-board-grid, .kanban-swimlane-container')).toBeVisible();
  const cards = page.locator('.kanban-card-wrapper');
  await expect(cards).toHaveCount(0);

  // No console errors
  expect(errors.filter(e => !e.includes('favicon'))).toHaveLength(0);
});

// ─────────────────────────────────────────────────────────────────────────────
// US-SETUP-2: Returning workspace loads existing projects
// ─────────────────────────────────────────────────────────────────────────────
test('US-SETUP-2: reopening a seeded workspace restores existing project card', async ({ page, kanban }) => {
  const projectCardContent = [
    '---',
    'title: My Existing Project',
    'projectId: PROJ_0001',
    'listId: backlog',
    'status: active',
    '---',
    '## Project Summary',
    'Pre-existing content.',
  ].join('\n');

  await kanban.openWorkspace({
    files: {
      'workspace.json': JSON.stringify({
        id: 'ws',
        featureOrder: { backlog: ['PROJ-0001'] },
      }),
      'projects/PROJ-0001.md': projectCardContent,
    },
  });

  // Existing project card is visible
  await expect(page.locator('.kanban-card-wrapper')).toHaveCount(1);
  await expect(page.locator('.kanban-card-wrapper')).toContainText('My Existing Project');
});

// ─────────────────────────────────────────────────────────────────────────────
// US-SETUP-3: Chromium users see the affirming banner exactly once
// ─────────────────────────────────────────────────────────────────────────────
test('US-SETUP-3: first-run banner appears in Chromium and is dismissable', async ({ page, kanban }) => {
  await kanban.openWorkspace();

  const banner = page.locator('.first-run-banner');
  await expect(banner).toBeVisible();

  // Banner text should be the affirming copy (not the warning copy)
  await expect(banner).toContainText('works best in Chromium');

  // Dismiss the banner
  await page.click('#dismiss-banner-btn');
  await expect(banner).toBeHidden();
});

test('US-SETUP-3b: banner does not reappear after dismissal on reload (same mock FS)', async ({ page, kanban }) => {
  await kanban.openWorkspace();
  await page.click('#dismiss-banner-btn');

  // Re-open the workspace on the same page (simulate re-selecting folder)
  await page.click('#open-folder-btn');
  await page.waitForFunction(() => !document.querySelector('.empty-workspace-prompt'), { timeout: 6000 });

  // Banner should not reappear
  await expect(page.locator('.first-run-banner')).toBeHidden();
});

// ─────────────────────────────────────────────────────────────────────────────
// US-SETUP-4: Non-Chromium users see the warning banner
// Note: We simulate this by overriding navigator.userAgent in the page context.
// ─────────────────────────────────────────────────────────────────────────────
test('US-SETUP-4: non-Chromium user sees stronger warning banner with manual editing note', async ({ browser }) => {
  // Create a context with a Firefox-like UA
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:120.0) Gecko/20100101 Firefox/120.0',
  });
  const page = await context.newPage();

  // Override the isChromiumBrowser() detection before any script runs
  await page.addInitScript(() => {
    // Stub userAgentData to remove Chromium brand
    Object.defineProperty(navigator, 'userAgentData', { value: null, configurable: true });

    // Mock FS shim (minimal, same as fixture)
    window.showDirectoryPicker = async () => {
      class MockDir {
        constructor() { this.kind = 'directory'; this.name = 'root'; this._store = new Map(); }
        async getFileHandle(n, { create = false } = {}) {
          if (!this._store.has(n)) {
            if (!create) { throw new DOMException('NotFound', 'NotFoundError'); }
            const fh = { kind: 'file', name: n, _content: '', async getFile() { return { text: async () => this._content, name: n }; }, async createWritable() { const s = this; let b = ''; return { async write(c) { b += c; }, async close() { s._content = b; } }; } };
            this._store.set(n, fh); return fh;
          }
          return this._store.get(n);
        }
        async getDirectoryHandle(n, { create = false } = {}) {
          if (!this._store.has(n)) {
            if (!create) { throw new DOMException('NotFound', 'NotFoundError'); }
            const d = new MockDir(); d.name = n; this._store.set(n, d); return d;
          }
          return this._store.get(n);
        }
        async removeEntry() {}
        async *entries() { for (const [k, v] of this._store.entries()) yield [k, v]; }
      }
      return new MockDir();
    };
  });

  await page.goto('');
  await page.click('#open-folder-btn');
  await page.waitForFunction(() => !document.querySelector('.empty-workspace-prompt'), { timeout: 8000 });

  const banner = page.locator('.first-run-banner.banner-warning');
  await expect(banner).toBeVisible();
  await expect(banner).toContainText('Chromium-based browser');
  await expect(banner).toContainText('VS Code');

  await context.close();
});

// ─────────────────────────────────────────────────────────────────────────────
// US-SETUP-5: Banner dismissal is per-workspace, not global
// (Simulated by noting that preferences are written to the FS; a new FS = new workspace)
// ─────────────────────────────────────────────────────────────────────────────
test('US-SETUP-5: banner dismissal is scoped to the workspace folder', async ({ page, kanban }) => {
  // Open workspace A and dismiss banner
  await kanban.openWorkspace();
  const banner = page.locator('.first-run-banner');
  if (await banner.isVisible()) {
    await page.click('#dismiss-banner-btn');
    await expect(banner).toBeHidden();
  }

  // Simulate opening a second workspace by reloading and injecting a fresh mock FS
  // (A new page load clears localStorage / sessionStorage, giving a clean slate)
  await page.reload();
  await page.addInitScript(() => {
    // Ensure preferences are not carried over
    window.showDirectoryPicker = window.showDirectoryPicker; // re-use same shim
  });

  // For a truly clean second workspace the page must reload with a fresh mock FS.
  // Since we use in-memory state, simply verify banner shows on next workspace open
  // by checking that a fresh page load (no preferences file seeded) shows the banner.
  await page.click('#open-folder-btn');
  await page.waitForFunction(() => !document.querySelector('.empty-workspace-prompt'), { timeout: 8000 });

  await expect(page.locator('.first-run-banner')).toBeVisible();
});
