# SoloKanban v8.3 — UI and Functionality Report (v8.3-2)
*Fact-checked verification of the DeepSeek-Report4 submission against the actual codebase*

---

## Executive Summary

This report reviews each claim in the submitted bug/UX analysis against the live codebase. Each point is classified as **✅ Correct**, **⚠️ Partially Correct**, **❌ Incorrect**, or **💡 Valid Enhancement Request**.

| # | Claim | Verdict |
|---|---|---|
| 1 | Lists & WIP save button has no handler | ✅ **Correct — Real Bug** |
| 2 | `cleanupTempFiles()` receives a string path from sdk-update.js | ⚠️ **Partially Correct — Real Issue, Misdiagnosed Severity** |
| 3 | `index.html` script tag loads from wrong path | ❌ **Incorrect** |
| 4 | First-run banner dismissal persistence not tested | ❌ **Incorrect — Non-issue** |
| 5 | Lists tab missing Add/Delete functionality | ✅ **Correct — Valid Gap** |
| 6 | Save button placement in Lists tab | 💡 **Valid UX Enhancement** |
| 7 | Progress bar inconsistency with nested items | ⚠️ **Partially Correct — By Design** |
| 8 | Quick actions bar doesn't scroll to field | ✅ **Correct — Valid Gap** |
| 9 | Collapsed column has no hover/tooltip | ⚠️ **Partially Correct — Tooltip Exists, Hover Missing** |
| 10 | List view lacks drag-and-drop | ✅ **Correct — Valid Gap** |
| 11 | Preferences tab missing Reset to Defaults | 💡 **Valid Enhancement** |
| 12 | Project deletion no trash location feedback | 💡 **Valid Enhancement** |
| 13 | Non-Chromium banner needs browser links | 💡 **Valid Enhancement** |
| 14 | Stale + overdue: stale badge hidden | ⚠️ **By PRD Design — Minor Enhancement** |
| 15 | No trash management UI | ✅ **Correct — Valid Gap** |
| 16 | `parseBodySections` case-insensitive match simplification | ❌ **Non-issue** |
| 17 | `renderMarkdown` no ordered list support | ✅ **Correct — Minor, But By Design** |
| 18 | Checklist `data-task-index` global but safe | ✅ **Correct Assessment** |
| 19 | SDK update no retry logic | 💡 **Valid Enhancement** |
| 20 | SHA-256 pure-JS fallback is slow | ⚠️ **Partially Correct** |

---

## Detailed Analysis

### 1. ✅ Settings — Lists & WIP Tab Save Button Has No Handler — **REAL BUG**

**Claim:** The "Lists & WIP Limits" tab renders a `#btn-save-lists-config` button but no event handler is bound to it.

**Verification:** Confirmed in [`js/settings.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/settings.js). The `bindEvents()` method handles `'labels'`, `'fields'`, `'types'`, `'projects'`, and `'preferences'` tabs — but has no `else if (this.activeTab === 'lists')` block. The button renders but silently does nothing.

**Impact:** Critical — users cannot persist any WIP limit or list title changes.

**Fix:**
```js
} else if (this.activeTab === 'lists') {
  const saveBtn = modalEl.querySelector('#btn-save-lists-config');
  if (saveBtn) {
    saveBtn.addEventListener('click', async () => {
      const rows = modalEl.querySelectorAll('.settings-list-row');
      let lists;
      let configPath;
      if (this.appState.currentView === 'project' && this.appState.currentProjectId) {
        const proj = this.appState.db.projects.get(this.appState.currentProjectId);
        lists = proj?.lists;
        configPath = `${this.appState.currentProjectId}/project.json`;
      } else {
        lists = this.appState.db.workspaceConfig?.lists;
        configPath = '.solokanban/workspace.json';
      }
      if (!lists) return;
      rows.forEach(row => {
        const listId = row.dataset.listId;
        const list = lists.find(l => l.id === listId);
        if (list) {
          list.title = row.querySelector('.list-name-input').value.trim() || list.title;
          const wipVal = Number(row.querySelector('.list-wip-input').value);
          list.wipLimit = wipVal > 0 ? wipVal : undefined;
        }
      });
      if (this.appState.currentView === 'project') {
        const proj = this.appState.db.projects.get(this.appState.currentProjectId);
        await this.appState.fsAdapter?.writeFile(configPath, JSON.stringify(proj, null, 2));
      } else {
        await this.appState.fsAdapter?.writeFile(configPath, JSON.stringify(this.appState.db.workspaceConfig, null, 2));
      }
      this.close();
      if (this.onChangeCallback) this.onChangeCallback();
    });
  }
}
```

---

### 2. ⚠️ SDK Update — `cleanupTempFiles()` String vs Handle — **REAL ISSUE, PARTIALLY MISDIAGNOSED**

**Claim:** `sdk-update.js` calls `cleanupTempFiles('.solokanban/sdk')` passing a **string path**, but `FileSystemAdapter.cleanupTempFiles()` expects a `FileSystemDirectoryHandle` and will crash calling `.entries()` on a string.

**Verification:**

- [`js/filesystem.js:90`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/filesystem.js) — `FileSystemAdapter.cleanupTempFiles(dirHandle = this.rootHandle)` — iterates `dirHandle.entries()`.
- [`js/filesystem.js:323`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/filesystem.js) — `MockFileSystemAdapter.cleanupTempFiles(dirPath = '')` — correctly accepts a string path.
- [`js/sdk-update.js:41-42`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/sdk-update.js) — Calls with string paths.

**Assessment:** The claim is **correct** that there is a type mismatch in the real browser adapter. However, it is **not a crash in tests** because the `MockFileSystemAdapter` handles strings. The real bug only surfaces in the browser with `FileSystemAdapter`. The `cleanupTempFiles()` call in `writeFile()` (line 81) correctly passes a handle (`currentDir`), but the SDK updater calls bypass this.

**Fix:** Refactor `FileSystemAdapter.cleanupTempFiles()` to resolve a string path to a handle if passed a string:
```js
async cleanupTempFiles(dirHandleOrPath = this.rootHandle) {
  let dirHandle = dirHandleOrPath;
  if (typeof dirHandleOrPath === 'string') {
    dirHandle = await this._getDirectoryHandle(dirHandleOrPath, false);
    if (!dirHandle) return;
  }
  // ... existing iteration
}
```

---

### 3. ❌ `index.html` Script Tag Wrong Path — **INCORRECT**

**Claim:** The script tag loads `js/main.js` but `main.js` lives at the project root, not inside `js/`.

**Verification:** Confirmed in [`index.html:63`](file:///Users/philipbowrey/Desktop/SoloDevelopment/index.html):
```html
<script type="module" src="js/main.js"></script>
```
And [`js/main.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/main.js) **does exist** inside the `js/` directory. The path is **correct**. The app loads and all 67 Playwright E2E tests pass against this script path. **This claim is false.**

---

### 4. ❌ First-Run Banner Dismissal Not Tested — **NON-ISSUE**

**Claim:** The first-run banner dismissal may not work correctly.

**Verification:** The banner dismissal is covered by Playwright E2E tests `US-SETUP-3b` and `US-SETUP-5` which specifically test that the banner does not reappear after dismissal and that dismissal is scoped per workspace. All tests pass. **This is not a bug.**

---

### 5. ✅ Settings Lists Tab — No Add/Delete — **VALID GAP**

**Claim:** The Lists & WIP tab only edits existing lists, with no `+ Add List` or `× Delete List` functionality.

**Verification:** Confirmed correct. The rendered HTML only includes existing list rows with name and WIP inputs — no add/delete affordances.

**Fix:** Add row-level delete buttons and a `+ Add List` button following the same pattern as Labels:
```js
<button class="btn-danger btn-delete-list" data-list-id="${l.id}">×</button>
```
And a footer button:
```html
<button id="btn-add-new-list" class="btn-secondary">+ Add List</button>
```

---

### 6. 💡 Save Button Placement in Lists Tab — **VALID UX ENHANCEMENT**

**Assessment:** Valid suggestion. Having a single bottom save button can cause users to miss it after editing multiple rows. Two approaches:
- **Preferred (simple):** Keep the Save button but add a sticky footer so it stays visible on scroll.
- **Better:** Auto-save on `change` event per row with a debounce, eliminating the explicit save button entirely (consistent with how Labels/Fields work).

---

### 7. ⚠️ Progress Bar and Nested Checklist Items — **BY DESIGN, LABEL COULD BE CLEARER**

**Claim:** Adding a sub-item doesn't update the progress bar because `calculateProgress()` counts top-level items only.

**Verification:** Correct — this is explicitly specified in PRD §16.4: *"Progress counts top-level items only."* This is intentional, not a bug.

**Assessment:** The suggestion to label the bar "Top-level progress" or add a sub-task counter is a **valid UX enhancement** to reduce user confusion, but the calculation itself is correct.

---

### 8. ✅ Quick Actions Bar — No `scrollIntoView()` — **VALID GAP**

**Claim:** Clicking a quick action button (e.g. `📅 Due Date`) focuses the field but does not scroll the modal to it.

**Verification:** Confirmed. Searching the codebase finds **no uses of `scrollIntoView()`** anywhere. The quick action handlers call `element.focus()` only.

**Fix:** Add `{ behavior: 'smooth', block: 'nearest' }` scroll after focus:
```js
modalEl.querySelector('#qa-dates-btn')?.addEventListener('click', () => {
  const el = modalEl.querySelector('#modal-duedate-input');
  if (el) { el.focus(); el.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
});
```

---

### 9. ⚠️ Collapsed Column Hover State Missing — **PARTIALLY CORRECT**

**Claim:** Collapsed columns have no hover effect or tooltip to indicate they are clickable.

**Verification:** [`js/board.js:172`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/board.js) does render `title="Click to expand list"` on the header — so a **tooltip does exist** on hover (browser native tooltip). However, there is no CSS `:hover` highlight or cursor pointer style making it visually obvious. The claim about missing tooltip is **incorrect**; the missing hover style is **correct**.

**Fix:** Add to `index.css`:
```css
.kanban-column.collapsed { cursor: pointer; }
.kanban-column.collapsed:hover { background: rgba(255,255,255,0.06); }
```

---

### 10. ✅ List View — No Drag-and-Drop — **CORRECT**

**Claim:** List view doesn't support drag-and-drop to move cards between lists.

**Verification:** Confirmed. [`js/board.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/board.js) `renderListView()` renders static rows with no drag handles or listeners. The drag-and-drop logic in [`js/dragdrop.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/dragdrop.js) only targets `.kanban-card-wrapper` elements in board view.

**Fix:** Either add a per-row list dropdown (`<select>` of list IDs) as a move affordance, or extend `dragdrop.js` to handle `.list-view-row` elements.

---

### 11. 💡 Preferences — No Reset to Defaults — **VALID ENHANCEMENT**

**Assessment:** Valid. Add a `Reset to Defaults` button that calls `preferencesManager.set()` for each key back to its default value. Low risk, useful for debugging.

---

### 12. 💡 Project Deletion — No Trash Location Feedback — **VALID ENHANCEMENT**

**Assessment:** Valid. The confirm dialog says `"Move project ${projId} to trash?"` but doesn't show the destination path after completion. Add a brief notification like: *"Project moved to `.solokanban/trash/${projId}_${timestamp}`"* using an existing toast mechanism or `alert()`.

---

### 13. 💡 Non-Chromium Banner — Needs Browser Links — **VALID ENHANCEMENT**

**Assessment:** Valid low-effort improvement. Add:
```html
<a href="https://www.google.com/chrome/" target="_blank" rel="noopener">Download Chrome</a>
```
to the non-Chromium banner text.

---

### 14. ⚠️ Stale + Overdue Badge Visibility — **BY PRD DESIGN**

**Claim:** A card that is both stale and overdue only shows the overdue badge, hiding the stale status.

**Verification:** PRD §16.3 explicitly states: *"Overdue red indicator takes visual precedence over stale yellow."* This is tested in `US-VIS-3` and unit test *"overdue red indicator takes visual precedence over stale yellow"*, both passing. The behaviour is correct.

**Assessment:** The suggestion to show both indicators is a **product decision**, not a bug fix. Could be implemented as a stale clock sub-icon within the overdue badge.

---

### 15. ✅ No Trash Management UI — **CORRECT**

**Claim:** Users can soft-delete projects but cannot browse, restore, or permanently delete trashed projects from the UI.

**Verification:** Confirmed. The Projects tab in Settings only lists active projects with a `Soft-Delete` button. There is no "Trash" view, restoration, or permanent delete functionality in the UI.

**Fix:** Add a sub-tab or collapsible "Trashed Projects" section in the Projects tab that reads `.solokanban/trash/` directories and renders restore/delete buttons.

---

### 16. ❌ `parseBodySections` Case-Insensitive Matching — **NON-ISSUE**

**Claim:** The case-insensitive lowercase match for `'activity log'` could be simplified to an exact match.

**Assessment:** This is a stylistic code quality opinion, not a bug. Using `.toLowerCase()` comparison is more defensive and correct — it handles user edits that produce `## ACTIVITY LOG` or `## Activity log` without silently appending a second log section. The current approach is preferable.

---

### 17. ✅ `renderMarkdown` — Ordered Lists Rendered as Unordered — **CORRECT, BUT BY DESIGN**

**Claim:** The parser matches `\d+\.` for ordered lists but renders all lists as `<ul>`, not `<ol>`.

**Verification:** Confirmed in [`js/markdown.js:39`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/markdown.js). The regex `/([-*]|\d+\.)\s+/` matches ordered list syntax, but the container is always `<ul>` and items always `<li>` — so `1. item`, `2. item` renders with bullets, not numbers.

**Assessment:** The PRD does not require ordered list support, so this is intentional. It's a minor fidelity gap for users who use numbered lists in card bodies.

**Fix (low priority):** Track whether current list is ordered, and switch between `<ul>` and `<ol>` accordingly.

---

### 18. ✅ `data-task-index` Global Mapping — **CORRECTLY ASSESSED**

**Claim:** The global task index is safe because items are always appended top-level, and indices are recalculated on render.

**Verification:** Confirmed. The in-place DOM update added in our recent implementation appends new checkboxes with `currentTotalTasks` as their index, which corresponds to their position in the body. The risk remains theoretical — if markdown is edited externally between renders — but is low in practice.

---

### 19. 💡 SDK Update — No Retry Logic — **VALID ENHANCEMENT**

**Assessment:** Valid. A simple exponential backoff (max 3 retries) on fetch failure would improve resilience on flaky connections. Low complexity to implement using a helper:
```js
async function fetchWithRetry(url, retries = 3, delay = 1000) { ... }
```

---

### 20. ⚠️ SHA-256 Pure-JS Fallback Speed — **PARTIALLY CORRECT**

**Claim:** The pure-JS SHA-256 fallback is slow and may exceed 200ms.

**Verification:** The unit test `"computeContentHash() on 50KB body completes in under 200ms"` passes, using `crypto.subtle` (the async path). The pure-JS fallback in `hash.js` is only used if `crypto.subtle` is unavailable (e.g., in tests or certain sandboxed environments). In practice, all modern Chromium browsers provide `crypto.subtle`, so this fallback is rarely hit.

**Assessment:** Not a practical concern for the target environment (Chromium browsers), but valid for ensuring graceful degradation.

---

## Priority Fix Summary

| Priority | Item | Location | Effort |
|---|---|---|---|
| 🔴 **Critical** | #1 — Bind Lists & WIP save handler | `js/settings.js` | Low |
| 🔴 **Critical** | #2 — Fix `cleanupTempFiles()` to accept string path | `js/filesystem.js` | Low |
| 🟡 **High** | #5 — Add/Delete list in Lists tab | `js/settings.js` | Medium |
| 🟡 **High** | #8 — `scrollIntoView()` in quick actions | `js/card-modal.js` | Low |
| 🟡 **High** | #15 — Trash management UI | `js/settings.js` | Medium |
| 🟢 **Medium** | #10 — List view move affordance | `js/board.js` | Medium |
| 🟢 **Medium** | #9 — Collapsed column hover CSS | `index.css` | Low |
| 🟢 **Medium** | #17 — Ordered list rendering | `js/markdown.js` | Low |
| ⚪ **Low** | #6, #11, #12, #13, #14, #19 | Various | Low |
