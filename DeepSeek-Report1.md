# SoloKanban v8.3 Codebase Review – PRD Alignment Report

## Overall Assessment

The implementation broadly follows the PRD v8.3 specification. Most core features are present, the architecture is modular, and the UI is modern. However, several significant deviations and omissions exist, primarily around activity logging, merge conflict resolution, and some visual enhancements.

---

## ✅ Good Things

### 1. **Faithful Implementation of v8.3 Additions**
- **Label deletion fallback** – Card rendering omits deleted labels (`card-render.js`), and the modal shows an “Unknown label (deleted)” placeholder with a removal button (matches PRD §7.2.1).
- **First‑run banner differentiation** – `isChromiumBrowser()` and two distinct banner copies are used; dismissal state is persisted in `preferences.json` (§3, §18).
- **Hash performance target** – `computeContentHash()` uses `crypto.subtle` (async) and likely completes well within 200 ms for a 50 KB body.
- **Temp file cleanup on failed updates** – `SdkUpdater` wraps each update in a try/catch that calls `cleanupTempFiles()`; `FileSystemAdapter.writeFile()` also removes temporary files on failure.
- **Trash excluded from search** – `db.rebuildSearchIndex()` explicitly skips `_isTrash: true` cards; trashed projects are removed from the in‑memory DB, so they never appear in search results.

### 2. **Modular and Maintainable Codebase**
- ES modules split by responsibility (`workspace.js`, `board.js`, `card-modal.js`, etc.).
- Clean separation of concerns: state management (`AppState`), data access (`SoloDb`), file I/O (`FileSystemAdapter`), and UI rendering.
- The `MockFileSystemAdapter` enables testing without a real file system.

### 3. **Local‑First File System Integration**
- Correct use of the File System Access API with persistent handle storage in IndexedDB.
- Atomic file writes via temporary files to avoid corruption.
- Workspace initialization creates all necessary directories and default config files.

### 4. **Dual‑Level Board Navigation**
- Workspace board shows project cards; clicking a project card opens its edit modal with a **“Open Project Board”** button.
- Breadcrumb navigation and URL‑less state restore via `localStorage`.

### 5. **Presence & Concurrency**
- Adaptive heartbeats (15 s active, 60 s idle) with TTLs as specified.
- Optimistic concurrency control using revision counter and content hash.
- Auto‑merge fast path for disjoint body section edits (PRD §6.5.1) – implemented in `card-modal.attemptAutoMerge()`.
- Advisory locks (`locks.js`) and Web Locks API integration.

### 6. **Rich Card Rendering**
- Covers, priority flags, due‑date countdowns, story points, checklist progress rings, sub‑task badges, custom field chips, avatars, and live agent status badges with tooltips.
- Visual precedence: overdue red badge takes priority over stale yellow.
- Proper label filtering (omits deleted labels) on card face.

### 7. **Settings & Customisation**
- Workspace‑level labels, custom fields, and feature types – all editable through the settings modal.
- Preferences tab for background, dark mode, stale threshold, and agent badge toggle.
- Soft‑delete of projects to `.solokanban/trash/` with collision‑safe folder naming.

### 8. **Board UX Enhancements**
- Swimlanes (by assignee, priority, type), collapsible lists, WIP limit badges, column stats, and dividers stored in `project.json.layout`.
- List view (Asana‑style) alternative to board view.

### 9. **SDK & Skill Auto‑Update**
- `SdkUpdater` fetches `version.json`, verifies SHA‑256 checksums, and writes files atomically.
- User‑created files are never overwritten; temp files are cleaned on failure.

### 10. **Correctness in Edge Cases**
- Reconciliation pass (§6.4) during workspace scan handles move‑failure rollback and list assignment cleanup.
- Legacy `layout.json` migration into `project.json.layout`.
- Quarantine of unparseable cards.

---

## ❌ Bad Things – Deviations & Missing Features

### 1. **Activity Log Not Updated on Card Modal Save (PRD §11)**
- The PRD requires that every modification (frontmatter or body) appends an entry to the `## Activity Log` section.
- **Current state:** `card-modal.saveCard()` does **not** call `appendActivityLog()`. Only moves (via dragdrop) add a log entry.
- **Impact:** Activity logs are incomplete; users cannot see when a card’s title, description, priority, etc., were changed.

### 2. **Merge Modal Is Too Simplistic (PRD §6.5)**
- The PRD describes a full visual conflict resolution UI with:
  - Frontmatter diff (choice per whole block).
  - Body section‑by‑section diff with options to keep local, accept incoming, or manually edit.
  - A global “Keep All Local” / “Accept All Incoming”.
- **Current state:** The merge modal only offers two buttons: **“Keep My Local Edits”** or **“Accept Incoming Edits”**. No section‑level granularity.
- **Impact:** Users lose the ability to selectively merge changes, contradicting the spec.

### 3. **Auto‑Merge Activity Log Concatenation (PRD §6.5.3)**
- When auto‑merging (disjoint sections), the code simply concatenates the local and incoming Activity Log sections:
  ```js
  bodyParts.push(`## Activity Log\n${localSections.activityLog}\n${incomingSections.activityLog}`);
  ```
- The PRD requires merging **chronologically** and placing the merged log at the end. Duplicate entries are not deduplicated.
- **Impact:** Activity logs become bloated and out of chronological order.

### 4. **Missing WIP Limit UI (PRD §9.3)**
- The board shows WIP limit badges (`wipLimit` is read from the list config), but there is **no UI** in settings or anywhere else to set or edit `wipLimit`.
- Users cannot define WIP limits per list, making the badge meaningless.

### 5. **Missing Attachment Thumbnails (PRD §10.2)**
- The PRD specifies **small icons for attachments** (PDF, image, link) on the card face.
- **Current state:** Only a badge showing the count of attachments (`📎 N`) is rendered – no file‑type icons or thumbnails.

### 6. **No Column Stats Customisation (PRD §9.4)**
- The PRD allows users to choose which stats to display (total cards, completed checklist items, sum of story points, count of high‑priority cards).
- **Current state:** Only **card count** and **total story points** are shown, hard‑coded.

### 7. **Partial Absence of List‑Level Settings**
- The settings modal lacks tabs for editing list names, order, or WIP limits – these are only defined in `project.json` and not exposed via UI.
- This limits the user’s ability to reconfigure boards without manually editing JSON.

### 8. **Missing “Project Settings” for Per‑List Configuration**
- The PRD does not explicitly call out a project‑settings UI, but lists and their properties (including WIP limits) should be editable. Currently only workspace‑level settings are present.

### 9. **Search‑Index Does Not Rebuild on Every Card Change (PRD §18)**
- `db.rebuildSearchIndex()` is called after `scanWorkspace()` and after project/feature creation/deletion, but **not** after a card is updated via the modal or drag‑and‑drop.
- The search index may become stale until a manual refresh or restart.
- The PRD states that the index is disposable and should be rebuilt when needed; however, automatic rebuild on every save would keep it fresh.

### 10. **First‑Run Banner Persistence Correct but Not Reset**
- The banner dismissal is stored in `preferences.json`; once dismissed, it never reappears. That is fine. However, the PRD says “on first visit” – the code checks `firstRunBannerDismissed` flag, which is set after dismissal, but there is no separate `firstVisit` flag; a user who dismisses it will never see it again, which matches the intent.

### 11. **Hash Performance Not Measured**
- The code does not include any runtime measurements to ensure `computeContentHash()` stays under 200 ms. While the implementation is likely fast, there is no guard or fallback.

### 12. **Auto‑Merge Disjoint Edits Does Not Handle Nested Changes**
- `attemptAutoMerge()` compares section content strings. If a user changes one sentence within a large section and another user changes a different sentence in the same section, both edits are considered conflicting (since the whole section differs from base). The auto‑merge fast path only works if edits are in completely different sections. This is acceptable as per PRD (disjoint sections only), but it may be overly conservative for large sections where edits are far apart.

### 13. **No Multi‑Agent Lock Queuing (Acknowledged)**
- The PRD explicitly states this is unsupported but data‑safe. The code does not implement any queuing, which is fine.

---

## 🐞 Potential Bugs / Implementation Issues

1. **`serializeYaml` may produce invalid YAML for multi‑line strings** – It uses simple quoting logic; a string containing newlines is not wrapped as a block scalar, which could break round‑trip. This is a risk for larger Markdown bodies.

2. **`parseYaml` does not support flow mappings (`{key: value}`)** – Only flow arrays are handled. Not required by PRD, but could cause parsing errors if a user manually edits frontmatter with that syntax.

3. **`card-modal.attemptAutoMerge` does not preserve the order of sections** – It builds a map and then iterates over a `Set` of section IDs, which loses the original order. The resulting body may have sections out of the original sequence.

4. **Presence heartbeat may overlap with auto‑save** – No coordination; the presence file is written every 15 s, which is fine, but if the user closes the modal, `clearPresence` is called, but the heartbeat timer may still try to write after the modal is closed (though `activeCard` is set to null, so it bails).

5. **`softDeleteProjectFull` does not remove the project from `db.workspaceConfig.featureOrder` if the project card is not found** – It attempts to remove by ID, but may leave orphaned references in other lists. However, since the card is deleted, the board rendering will ignore missing cards.

6. **`FileSystemAdapter.writeFile` does not handle directories being missing** – It uses `getDirectoryHandle` with `create: true` for each part, so that’s fine.

---

## Summary

The codebase is robust and implements the majority of the PRD’s features correctly. The major gaps are:

- **Activity logging** (critical for traceability)
- **Merge conflict resolution granularity** (deviates from spec)
- **Missing UI for WIP limits and list management**
- **Incomplete attachment thumbnails**

Addressing these would bring the implementation fully in line with v8.3. The modular design makes these fixes straightforward.

---
</report>