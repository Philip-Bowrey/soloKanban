# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: a-workspace-setup.spec.js >> US-SETUP-2: reopening a seeded workspace restores existing project card
- Location: tests/e2e/a-workspace-setup.spec.js:33:1

# Error details

```
Error: expect(locator).toHaveCount(expected) failed

Locator:  locator('.kanban-card-wrapper')
Expected: 1
Received: 0
Timeout:  8000ms

Call log:
  - Expect "toHaveCount" with timeout 8000ms
  - waiting for locator('.kanban-card-wrapper')
    20 × locator resolved to 0 elements
       - unexpected value "0"

```

# Page snapshot

```yaml
- generic [ref=e1]:
  - banner [ref=e2]:
    - generic [ref=e3]:
      - generic [ref=e4]:
        - generic [ref=e5]: ⚡
        - heading "SoloKanban" [level=1] [ref=e6]
      - navigation [ref=e7]:
        - strong [ref=e9]: Workspace Board
    - generic [ref=e10]:
      - generic [ref=e11]:
        - generic [ref=e12]: 🔍
        - textbox "Filter cards (Title, Body, ID)..." [ref=e13]
      - combobox "Group board by swimlanes" [ref=e15] [cursor=pointer]:
        - 'option "Swimlanes: Off" [selected]'
        - option "By Assignee"
        - option "By Priority"
        - option "By Type"
      - generic [ref=e16]:
        - button "＋ New Card" [ref=e17] [cursor=pointer]
        - button "📁 Open Folder" [active] [ref=e18] [cursor=pointer]
        - button "⚙" [ref=e19] [cursor=pointer]
  - generic [ref=e21]:
    - generic [ref=e22]: SoloKanban works best in Chromium. You are using a supported browser.
    - button "×" [ref=e23] [cursor=pointer]
  - main [ref=e24]
```

# Test source

```ts
  1   | /**
  2   |  * E2E Tests — Area A: Workspace Setup & First Run
  3   |  * User Stories: US-SETUP-1 through US-SETUP-5
  4   |  *
  5   |  * Covers: blank workspace init, returning workspace, first-run banners
  6   |  * (Chromium vs non-Chromium), per-workspace banner dismissal.
  7   |  */
  8   | 
  9   | import { test, expect } from './fixtures/kanban-fixture.js';
  10  | 
  11  | // ─────────────────────────────────────────────────────────────────────────────
  12  | // US-SETUP-1: Opening a blank folder initializes the workspace
  13  | // ─────────────────────────────────────────────────────────────────────────────
  14  | test('US-SETUP-1: blank workspace opens with zero projects and no console errors', async ({ page, kanban }) => {
  15  |   const errors = [];
  16  |   page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  17  |   page.on('pageerror', err => errors.push(err.message));
  18  | 
  19  |   await kanban.openWorkspace();
  20  | 
  21  |   // Board renders with no cards
  22  |   await expect(page.locator('.kanban-board-grid, .kanban-swimlane-container')).toBeVisible();
  23  |   const cards = page.locator('.kanban-card-wrapper');
  24  |   await expect(cards).toHaveCount(0);
  25  | 
  26  |   // No console errors
  27  |   expect(errors.filter(e => !e.includes('favicon'))).toHaveLength(0);
  28  | });
  29  | 
  30  | // ─────────────────────────────────────────────────────────────────────────────
  31  | // US-SETUP-2: Returning workspace loads existing projects
  32  | // ─────────────────────────────────────────────────────────────────────────────
  33  | test('US-SETUP-2: reopening a seeded workspace restores existing project card', async ({ page, kanban }) => {
  34  |   const projectCardContent = [
  35  |     '---',
  36  |     'title: My Existing Project',
  37  |     'projectId: PROJ_0001',
  38  |     'listId: backlog',
  39  |     'status: active',
  40  |     '---',
  41  |     '## Project Summary',
  42  |     'Pre-existing content.',
  43  |   ].join('\n');
  44  | 
  45  |   await kanban.openWorkspace({
  46  |     files: {
  47  |       'workspace.json': JSON.stringify({
  48  |         id: 'ws',
  49  |         featureOrder: { backlog: ['PROJ-0001'] },
  50  |       }),
  51  |       'projects/PROJ-0001.md': projectCardContent,
  52  |     },
  53  |   });
  54  | 
  55  |   // Existing project card is visible
> 56  |   await expect(page.locator('.kanban-card-wrapper')).toHaveCount(1);
      |                                                      ^ Error: expect(locator).toHaveCount(expected) failed
  57  |   await expect(page.locator('.kanban-card-wrapper')).toContainText('My Existing Project');
  58  | });
  59  | 
  60  | // ─────────────────────────────────────────────────────────────────────────────
  61  | // US-SETUP-3: Chromium users see the affirming banner exactly once
  62  | // ─────────────────────────────────────────────────────────────────────────────
  63  | test('US-SETUP-3: first-run banner appears in Chromium and is dismissable', async ({ page, kanban }) => {
  64  |   await kanban.openWorkspace();
  65  | 
  66  |   const banner = page.locator('.first-run-banner');
  67  |   await expect(banner).toBeVisible();
  68  | 
  69  |   // Banner text should be the affirming copy (not the warning copy)
  70  |   await expect(banner).toContainText('works best in Chromium');
  71  | 
  72  |   // Dismiss the banner
  73  |   await page.click('#dismiss-banner-btn');
  74  |   await expect(banner).toBeHidden();
  75  | });
  76  | 
  77  | test('US-SETUP-3b: banner does not reappear after dismissal on reload (same mock FS)', async ({ page, kanban }) => {
  78  |   await kanban.openWorkspace();
  79  |   await page.click('#dismiss-banner-btn');
  80  | 
  81  |   // Re-open the workspace on the same page (simulate re-selecting folder)
  82  |   await page.click('#open-folder-btn');
  83  |   await page.waitForFunction(() => !document.querySelector('.empty-workspace-prompt'), { timeout: 6000 });
  84  | 
  85  |   // Banner should not reappear
  86  |   await expect(page.locator('.first-run-banner')).toBeHidden();
  87  | });
  88  | 
  89  | // ─────────────────────────────────────────────────────────────────────────────
  90  | // US-SETUP-4: Non-Chromium users see the warning banner
  91  | // Note: We simulate this by overriding navigator.userAgent in the page context.
  92  | // ─────────────────────────────────────────────────────────────────────────────
  93  | test('US-SETUP-4: non-Chromium user sees stronger warning banner with manual editing note', async ({ browser }) => {
  94  |   // Create a context with a Firefox-like UA
  95  |   const context = await browser.newContext({
  96  |     userAgent: 'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:120.0) Gecko/20100101 Firefox/120.0',
  97  |   });
  98  |   const page = await context.newPage();
  99  | 
  100 |   // Override the isChromiumBrowser() detection before any script runs
  101 |   await page.addInitScript(() => {
  102 |     // Stub userAgentData to remove Chromium brand
  103 |     Object.defineProperty(navigator, 'userAgentData', { value: null, configurable: true });
  104 | 
  105 |     // Mock FS shim (minimal, same as fixture)
  106 |     window.showDirectoryPicker = async () => {
  107 |       class MockDir {
  108 |         constructor() { this.kind = 'directory'; this.name = 'root'; this._store = new Map(); }
  109 |         async getFileHandle(n, { create = false } = {}) {
  110 |           if (!this._store.has(n)) {
  111 |             if (!create) { const e = new DOMException('NotFound', 'NotFoundError'); e.code = 8; throw e; }
  112 |             const fh = { kind: 'file', name: n, _content: '', async getFile() { return { text: async () => this._content, name: n }; }, async createWritable() { const s = this; let b = ''; return { async write(c) { b += c; }, async close() { s._content = b; } }; } };
  113 |             this._store.set(n, fh); return fh;
  114 |           }
  115 |           return this._store.get(n);
  116 |         }
  117 |         async getDirectoryHandle(n, { create = false } = {}) {
  118 |           if (!this._store.has(n)) {
  119 |             if (!create) { const e = new DOMException('NotFound', 'NotFoundError'); e.code = 8; throw e; }
  120 |             const d = new MockDir(); d.name = n; this._store.set(n, d); return d;
  121 |           }
  122 |           return this._store.get(n);
  123 |         }
  124 |         async removeEntry() {}
  125 |         async *entries() { for (const [k, v] of this._store.entries()) yield [k, v]; }
  126 |       }
  127 |       return new MockDir();
  128 |     };
  129 |   });
  130 | 
  131 |   await page.goto('/');
  132 |   await page.click('#open-folder-btn');
  133 |   await page.waitForFunction(() => !document.querySelector('.empty-workspace-prompt'), { timeout: 8000 });
  134 | 
  135 |   const banner = page.locator('.first-run-banner.banner-warning');
  136 |   await expect(banner).toBeVisible();
  137 |   await expect(banner).toContainText('Chromium-based browser');
  138 |   await expect(banner).toContainText('VS Code');
  139 | 
  140 |   await context.close();
  141 | });
  142 | 
  143 | // ─────────────────────────────────────────────────────────────────────────────
  144 | // US-SETUP-5: Banner dismissal is per-workspace, not global
  145 | // (Simulated by noting that preferences are written to the FS; a new FS = new workspace)
  146 | // ─────────────────────────────────────────────────────────────────────────────
  147 | test('US-SETUP-5: banner dismissal is scoped to the workspace folder', async ({ page, kanban }) => {
  148 |   // Open workspace A and dismiss banner
  149 |   await kanban.openWorkspace();
  150 |   const banner = page.locator('.first-run-banner');
  151 |   if (await banner.isVisible()) {
  152 |     await page.click('#dismiss-banner-btn');
  153 |     await expect(banner).toBeHidden();
  154 |   }
  155 | 
  156 |   // Simulate opening a second workspace by reloading and injecting a fresh mock FS
```