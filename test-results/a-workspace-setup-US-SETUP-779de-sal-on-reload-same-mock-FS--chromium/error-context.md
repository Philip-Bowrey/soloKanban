# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: a-workspace-setup.spec.js >> US-SETUP-3b: banner does not reappear after dismissal on reload (same mock FS)
- Location: tests/e2e/a-workspace-setup.spec.js:77:1

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: page.waitForFunction: Test timeout of 30000ms exceeded.
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
        - generic [ref=e8]: Workspace Board
    - generic [ref=e9]:
      - generic [ref=e10]:
        - generic [ref=e11]: 🔍
        - textbox "Filter cards (Title, Body, ID)..." [ref=e12]
      - combobox "Group board by swimlanes" [ref=e14] [cursor=pointer]:
        - 'option "Swimlanes: Off" [selected]'
        - option "By Assignee"
        - option "By Priority"
        - option "By Type"
      - generic [ref=e15]:
        - button "＋ New Card" [ref=e16] [cursor=pointer]
        - button "📁 Open Folder" [active] [ref=e17] [cursor=pointer]
        - button "⚙" [ref=e18] [cursor=pointer]
  - main [ref=e19]:
    - generic [ref=e20]:
      - generic [ref=e21]: 📁
      - heading "Welcome to SoloKanban" [level=2] [ref=e22]
      - paragraph [ref=e23]: Select a local workspace folder to start managing project & feature cards with local-first file system access.
      - button "Choose Local Workspace Folder..." [ref=e24] [cursor=pointer]
```

# Test source

```ts
  64  |           this.kind = 'directory';
  65  |           this.name = name;
  66  |           // store is a Map<string, MockFileHandle | MockDirectoryHandle>
  67  |           this._store = store || new Map();
  68  |         }
  69  | 
  70  |         async getFileHandle(name, { create = false } = {}) {
  71  |           if (this._store.has(name)) {
  72  |             const entry = this._store.get(name);
  73  |             if (entry.kind !== 'file') throw new DOMException('TypeMismatch', 'TypeMismatchError');
  74  |             return entry;
  75  |           }
  76  |           if (create) {
  77  |             const h = new MockFileHandle(name);
  78  |             this._store.set(name, h);
  79  |             return h;
  80  |           }
  81  |           const err = new DOMException('Not found', 'NotFoundError');
  82  |           err.code = 8;
  83  |           throw err;
  84  |         }
  85  | 
  86  |         async getDirectoryHandle(name, { create = false } = {}) {
  87  |           if (this._store.has(name)) {
  88  |             const entry = this._store.get(name);
  89  |             if (entry.kind !== 'directory') throw new DOMException('TypeMismatch', 'TypeMismatchError');
  90  |             return entry;
  91  |           }
  92  |           if (create) {
  93  |             const h = new MockDirectoryHandle(name);
  94  |             this._store.set(name, h);
  95  |             return h;
  96  |           }
  97  |           const err = new DOMException('Not found', 'NotFoundError');
  98  |           err.code = 8;
  99  |           throw err;
  100 |         }
  101 | 
  102 |         async removeEntry(name, { recursive = false } = {}) {
  103 |           this._store.delete(name);
  104 |         }
  105 | 
  106 |         async *entries() {
  107 |           for (const [name, handle] of this._store.entries()) {
  108 |             yield [name, handle];
  109 |           }
  110 |         }
  111 | 
  112 |         async *keys() {
  113 |           for (const name of this._store.keys()) yield name;
  114 |         }
  115 |       }
  116 | 
  117 |       // Root handle exposed to tests
  118 |       const rootStore = new Map();
  119 |       window.__mockRootHandle = new MockDirectoryHandle('root', rootStore);
  120 | 
  121 |       // Pre-seed helper used by fixture helpers
  122 |       window.__seedFile = function (path, content) {
  123 |         const parts = path.split('/').filter(Boolean);
  124 |         let current = rootStore;
  125 |         for (let i = 0; i < parts.length - 1; i++) {
  126 |           if (!current.has(parts[i])) {
  127 |             const dir = new MockDirectoryHandle(parts[i]);
  128 |             current.set(parts[i], dir);
  129 |           }
  130 |           current = current.get(parts[i])._store;
  131 |         }
  132 |         const fileName = parts[parts.length - 1];
  133 |         current.set(fileName, new MockFileHandle(fileName, content));
  134 |       };
  135 | 
  136 |       // Override the browser's showDirectoryPicker
  137 |       window.showDirectoryPicker = async () => window.__mockRootHandle;
  138 |     });
  139 | 
  140 |     await page.goto('/');
  141 | 
  142 |     // Helper methods exposed to tests
  143 |     const kanban = {
  144 |       page,
  145 | 
  146 |       /**
  147 |        * Seeds initial files and triggers workspace open.
  148 |        * @param {Object} opts
  149 |        * @param {Record<string,string>} [opts.files] - path -> content map to pre-seed
  150 |        */
  151 |       async openWorkspace(opts = {}) {
  152 |         const files = opts.files || {};
  153 |         // Seed files into the virtual FS before triggering the picker
  154 |         for (const [path, content] of Object.entries(files)) {
  155 |           await page.evaluate(({ path, content }) => {
  156 |             window.__seedFile(path, content);
  157 |           }, { path, content });
  158 |         }
  159 | 
  160 |         // Click the "Open Folder" button — this calls showDirectoryPicker (mocked)
  161 |         await page.click('#open-folder-btn');
  162 | 
  163 |         // Wait for the board to render (empty workspace shows kanban-board-grid, or prompt disappears)
> 164 |         await page.waitForFunction(() => !document.querySelector('.empty-workspace-prompt'), { timeout: 8000 });
      |                    ^ Error: page.waitForFunction: Test timeout of 30000ms exceeded.
  165 |       },
  166 | 
  167 |       /**
  168 |        * Reads a file from the mock FS for assertions.
  169 |        */
  170 |       async readMockFile(path) {
  171 |         return page.evaluate(async (path) => {
  172 |           const parts = path.split('/').filter(Boolean);
  173 |           let current = window.__mockRootHandle;
  174 |           try {
  175 |             for (let i = 0; i < parts.length - 1; i++) {
  176 |               current = await current.getDirectoryHandle(parts[i]);
  177 |             }
  178 |             const fh = await current.getFileHandle(parts[parts.length - 1]);
  179 |             const f = await fh.getFile();
  180 |             return await f.text();
  181 |           } catch (e) {
  182 |             return null;
  183 |           }
  184 |         }, path);
  185 |       },
  186 | 
  187 |       /**
  188 |        * Creates a project via the UI prompt (mocks window.prompt).
  189 |        */
  190 |       async createProject(title = 'Test Project', listId = 'backlog') {
  191 |         await page.evaluate((title) => { window.prompt = () => title; }, title);
  192 |         await page.click('#create-card-btn');
  193 |         // Wait for card to appear
  194 |         await page.waitForSelector('.kanban-card-wrapper', { timeout: 6000 });
  195 |       },
  196 | 
  197 |       /**
  198 |        * Opens the first visible card on the board.
  199 |        */
  200 |       async openFirstCard() {
  201 |         await page.click('.kanban-card-wrapper');
  202 |         await page.waitForSelector('#card-modal', { timeout: 5000 });
  203 |       },
  204 | 
  205 |       /**
  206 |        * Navigates to the project board via the "Open Project Board" button inside the modal.
  207 |        */
  208 |       async openProjectBoard() {
  209 |         await page.click('#modal-open-project-board-btn');
  210 |         await page.waitForSelector('#nav-back-workspace-btn', { timeout: 5000 });
  211 |       },
  212 | 
  213 |       /**
  214 |        * Navigates back to the workspace using the breadcrumb.
  215 |        */
  216 |       async goBackToWorkspace() {
  217 |         await page.click('#nav-back-workspace-btn');
  218 |         await page.waitForFunction(
  219 |           () => !document.getElementById('nav-back-workspace-btn'),
  220 |           { timeout: 5000 }
  221 |         );
  222 |       },
  223 | 
  224 |       /**
  225 |        * Closes the currently open modal.
  226 |        */
  227 |       async closeModal() {
  228 |         const closeBtn = page.locator('#modal-close-btn, #settings-close-btn');
  229 |         if (await closeBtn.count() > 0) await closeBtn.first().click();
  230 |         await page.waitForFunction(() => !document.getElementById('card-modal'), { timeout: 5000 });
  231 |       },
  232 | 
  233 |       /**
  234 |        * Opens the Settings modal.
  235 |        */
  236 |       async openSettings() {
  237 |         await page.click('#open-settings-btn');
  238 |         await page.waitForSelector('#settings-modal', { timeout: 5000 });
  239 |       },
  240 |     };
  241 | 
  242 |     await use(kanban);
  243 |   },
  244 | });
  245 | 
  246 | export { expect };
  247 | 
```