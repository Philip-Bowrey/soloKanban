/**
 * SoloKanban E2E Test — Shared Playwright Fixture
 *
 * Injects a fully in-memory MockFileSystem into the browser page so that
 * all tests bypass the real showDirectoryPicker() API entirely.
 *
 * Usage:
 *   import { test, expect } from './fixtures/kanban-fixture.js';
 *
 *   test('my test', async ({ page, kanban }) => {
 *     await kanban.openWorkspace({ projects: [] });
 *     // ...
 *   });
 */

import { test as base, expect } from '@playwright/test';

/**
 * Bootstraps the app with a virtual in-memory filesystem.
 * All card/project writes go through MockFileSystemAdapter — nothing touches disk.
 */
export const test = base.extend({
  /**
   * kanban fixture — injected into every test
   */
  kanban: async ({ page }, use) => {
    /**
     * Navigate to the app and inject the mock FS shim before any app JS runs.
     * The shim:
     *  1. Replaces window.showDirectoryPicker with a function that returns
     *     a MockDirectoryHandle backed by a plain JS Map.
     *  2. Exposes window.__mockFs for direct test manipulation.
     */
    await page.addInitScript(() => {
      // -----------------------------------------------------------------------
      // Minimal in-memory File System Access API shim
      // -----------------------------------------------------------------------
      class MockFileHandle {
        constructor(name, content = '') {
          this.kind = 'file';
          this.name = name;
          this._content = content;
        }
        async getFile() {
          const blob = new Blob([this._content], { type: 'text/plain' });
          // Patch .text() onto the Blob
          return Object.assign(blob, {
            text: async () => this._content,
            name: this.name,
          });
        }
        async createWritable() {
          let buf = '';
          const self = this;
          return {
            async write(chunk) { buf += chunk; },
            async close() { self._content = buf; },
          };
        }
      }

      class MockDirectoryHandle {
        constructor(name, store) {
          this.kind = 'directory';
          this.name = name;
          // store is a Map<string, MockFileHandle | MockDirectoryHandle>
          this._store = store || new Map();
        }

        async getFileHandle(name, { create = false } = {}) {
          if (this._store.has(name)) {
            const entry = this._store.get(name);
            if (entry.kind !== 'file') throw new DOMException('TypeMismatch', 'TypeMismatchError');
            return entry;
          }
          if (create) {
            const h = new MockFileHandle(name);
            this._store.set(name, h);
            return h;
          }
          const err = new DOMException('Not found', 'NotFoundError');
          err.code = 8;
          throw err;
        }

        async getDirectoryHandle(name, { create = false } = {}) {
          if (this._store.has(name)) {
            const entry = this._store.get(name);
            if (entry.kind !== 'directory') throw new DOMException('TypeMismatch', 'TypeMismatchError');
            return entry;
          }
          if (create) {
            const h = new MockDirectoryHandle(name);
            this._store.set(name, h);
            return h;
          }
          const err = new DOMException('Not found', 'NotFoundError');
          err.code = 8;
          throw err;
        }

        async removeEntry(name, { recursive = false } = {}) {
          this._store.delete(name);
        }

        async *entries() {
          for (const [name, handle] of this._store.entries()) {
            yield [name, handle];
          }
        }

        async *keys() {
          for (const name of this._store.keys()) yield name;
        }
      }

      // Root handle exposed to tests
      const rootStore = new Map();
      window.__mockRootHandle = new MockDirectoryHandle('root', rootStore);

      // Pre-seed helper used by fixture helpers
      window.__seedFile = function (path, content) {
        const parts = path.split('/').filter(Boolean);
        let current = rootStore;
        for (let i = 0; i < parts.length - 1; i++) {
          if (!current.has(parts[i])) {
            const dir = new MockDirectoryHandle(parts[i]);
            current.set(parts[i], dir);
          }
          current = current.get(parts[i])._store;
        }
        const fileName = parts[parts.length - 1];
        current.set(fileName, new MockFileHandle(fileName, content));
      };

      // Override the browser's showDirectoryPicker
      window.showDirectoryPicker = async () => window.__mockRootHandle;
    });

    await page.goto('/');

    // Helper methods exposed to tests
    const kanban = {
      page,

      /**
       * Seeds initial files and triggers workspace open.
       * @param {Object} opts
       * @param {Record<string,string>} [opts.files] - path -> content map to pre-seed
       */
      async openWorkspace(opts = {}) {
        const files = opts.files || {};
        // Seed files into the virtual FS before triggering the picker
        for (const [path, content] of Object.entries(files)) {
          await page.evaluate(({ path, content }) => {
            window.__seedFile(path, content);
          }, { path, content });
        }

        // Click the "Open Folder" button — this calls showDirectoryPicker (mocked)
        await page.click('#open-folder-btn');

        // Wait for the board to render (empty workspace shows kanban-board-grid, or prompt disappears)
        await page.waitForFunction(() => !document.querySelector('.empty-workspace-prompt'), { timeout: 8000 });
      },

      /**
       * Reads a file from the mock FS for assertions.
       */
      async readMockFile(path) {
        return page.evaluate(async (path) => {
          const parts = path.split('/').filter(Boolean);
          let current = window.__mockRootHandle;
          try {
            for (let i = 0; i < parts.length - 1; i++) {
              current = await current.getDirectoryHandle(parts[i]);
            }
            const fh = await current.getFileHandle(parts[parts.length - 1]);
            const f = await fh.getFile();
            return await f.text();
          } catch (e) {
            return null;
          }
        }, path);
      },

      /**
       * Creates a project via the UI prompt (mocks window.prompt).
       */
      async createProject(title = 'Test Project', listId = 'backlog') {
        await page.evaluate((title) => { window.prompt = () => title; }, title);
        await page.click('#create-card-btn');
        // Wait for card to appear
        await page.waitForSelector('.kanban-card-wrapper', { timeout: 6000 });
      },

      /**
       * Opens the first visible card on the board.
       */
      async openFirstCard() {
        await page.click('.kanban-card-wrapper');
        await page.waitForSelector('#card-modal', { timeout: 5000 });
      },

      /**
       * Navigates to the project board via the "Open Project Board" button inside the modal.
       */
      async openProjectBoard() {
        await page.click('#modal-open-project-board-btn');
        await page.waitForSelector('#nav-back-workspace-btn', { timeout: 5000 });
      },

      /**
       * Navigates back to the workspace using the breadcrumb.
       */
      async goBackToWorkspace() {
        await page.click('#nav-back-workspace-btn');
        await page.waitForFunction(
          () => !document.getElementById('nav-back-workspace-btn'),
          { timeout: 5000 }
        );
      },

      /**
       * Closes the currently open modal.
       */
      async closeModal() {
        const closeBtn = page.locator('#modal-close-btn, #settings-close-btn');
        if (await closeBtn.count() > 0) await closeBtn.first().click();
        await page.waitForFunction(() => !document.getElementById('card-modal'), { timeout: 5000 });
      },

      /**
       * Opens the Settings modal.
       */
      async openSettings() {
        await page.click('#open-settings-btn');
        await page.waitForSelector('#settings-modal', { timeout: 5000 });
      },
    };

    await use(kanban);
  },
});

export { expect };
