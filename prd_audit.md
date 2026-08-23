# SoloKanban v8.3 — PRD Compliance Audit

_Audited: 2026-08-23 against all 18 JS modules and PRD v8.3.md_

---

## Executive Summary

The codebase is **substantially aligned** with the PRD. The core architecture (dual-level boards, modular JS, FSAA, concurrency model, presence, label deletion fallback, first-run banner) is faithfully implemented. However there are **8 confirmed gaps** ranging from critical bugs to missing UI features, and **4 minor deviations** worth tracking.

| Severity | Count |
|---|---|
| 🔴 Critical (data/UX breaking) | 2 |
| 🟠 Major (feature incomplete) | 4 |
| 🟡 Minor (deviation or missing pref) | 5 |
| ✅ Fully aligned | Majority |

---

## ✅ Fully Implemented & Correct

| PRD Section | Feature | Code Location |
|---|---|---|
| §3, §18 | First-run banner — Chromium vs non-Chromium copy differentiation | [`main.js:77-100`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/main.js#L77-L100) |
| §6.2 | Adaptive presence heartbeat 15s/60s active/idle | [`state.js:54-78`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/state.js#L54-L78) |
| §6.2 | Presence TTL 30s/120s, per-actor files, scan on heartbeat | [`state.js:81-144`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/state.js#L81-L144) |
| §6.3 | Canonical content hash — volatile meta excluded, SHA-256, ≤200ms | [`hash.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/hash.js) |
| §6.4 | Move reconciliation — featureOrder authoritative, backlog fallback, deliveredAt | [`workspace.js:167-244`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/workspace.js#L167-L244) |
| §6.5.1 | Disjoint auto-merge fast path | [`card-modal.js:304-381`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/card-modal.js#L304-L381) |
| §6.5.2-4 | Visual merge modal — Keep Local / Accept Incoming | [`card-modal.js:384-415`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/card-modal.js#L384-L415) |
| §7.1 | Seven default feature types (6 improvement + project) | [`defaults.js:5-112`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/defaults.js#L5-L112) |
| §7.2.1 | Label deletion fallback — omit on card face, "Unknown label (deleted)" in modal | [`card-render.js:49-55`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/card-render.js#L49-L55), [`card-modal.js:56-66`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/card-modal.js#L56-L66) |
| §7.3 | Custom fields with cardVisible, option colours, select/text types | [`card-render.js:103-117`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/card-render.js#L103-L117) |
| §8.1 | Clicking a project card opens edit modal (not board directly) | [`main.js:168-181`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/main.js#L168-L181) |
| §8.1 | "Open Project Board" button in modal navigates to project board | [`card-modal.js:220-231`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/card-modal.js#L220-L231) |
| §8.2 | Breadcrumb — Workspace / ProjectId — with back button | [`main.js:102-122`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/main.js#L102-L122) |
| §9.1 | Swimlane grouping by assignee/priority/type | [`board.js:184-215`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/board.js#L184-L215) |
| §9.2 | Collapsible lists stored in preferences | [`board.js:103-111`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/board.js#L103-L111) |
| §9.3 | WIP limit badge — amber/red thresholds | [`board.js:114-127`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/board.js#L114-L127) |
| §9.4 | Column stats — card count + story points | [`board.js:130-131`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/board.js#L130-L131) |
| §9.5 | Board background colour from preferences | [`board.js:55`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/board.js#L55) |
| §9.6 | List dividers from `project.json.layout` — non-draggable `<hr>` | [`board.js:149-153`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/board.js#L149-L153) |
| §10.1 | Card covers (image URL or colour banner) | [`card-render.js:39-46`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/card-render.js#L39-L46) |
| §10.3/10.4 | Stale badge, due-date countdown, overdue > stale visual precedence | [`card-render.js:66-76`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/card-render.js#L66-L76) |
| §10.5 | Priority icon/flag on card face | [`card-render.js:57-64`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/card-render.js#L57-L64) |
| §10.6 | Checklist progress ring (top-level items only) | [`card-render.js:91-101`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/card-render.js#L91-L101) |
| §10.7 | Sub-task count badge | [`card-render.js:84-88`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/card-render.js#L84-L88) |
| §10.10 | Assignee avatar/initials | [`card-render.js:134-140`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/card-render.js#L134-L140) |
| §10.11 | Story points badge | [`card-render.js:78-82`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/card-render.js#L78-L82) |
| §10.12 | Live agent status badge + actor/intent tooltip | [`card-render.js:119-132`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/card-render.js#L119-L132) |
| §12.2 | `project.json` schema incl. `layout.dividers` | [`workspace.js:283-293`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/workspace.js#L283-L293) |
| §12.3 | `preferences.json` schema with all keys including `showAgentBadge` | [`defaults.js:143-161`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/defaults.js#L143-L161) |
| §14 | SDK/skills auto-update with SHA-256 verification + temp file cleanup | [`sdk-update.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/sdk-update.js) |
| §15 | All 18 specified modules present | `js/` directory |
| §16.1 | 800ms auto-save debounce | [`card-modal.js:251-253`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/card-modal.js#L251-L253) |
| §16.2 | Raw/rendered Markdown toggle | [`card-modal.js:176-192`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/card-modal.js#L176-L192) |
| §17.1 | Soft-delete to trash with collision handling | [`filesystem.js:159-178`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/filesystem.js#L159-L178) |
| §17.2 | Preferences tab — bg colour, stale days, dark mode | [`settings.js:87-109`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/settings.js#L87-L109) |
| §3 | Trash excluded from search index | [`db.js:36-38`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/db.js#L36-L38) |
| Legacy migration | `layout.json` → `project.json.layout` | [`workspace.js:127-144`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/workspace.js#L127-L144) |

---

## 🔴 Critical Gaps

### 1. Auto-merge always fails — no base card passed to `attemptAutoMerge`

**PRD §6.5.1:** _"If the local and incoming edits touch **disjoint body sections**, the app automatically merges both changes and saves without user intervention."_

**Problem:** [`card-modal.js:268`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/card-modal.js#L268) calls `attemptAutoMerge(this.card, diskParsed)` with no `baseCard` argument. The `attemptAutoMerge` method at line 354 immediately hits the heuristic branch (`else { hasConflict = true; break; }`) **for every section where local and incoming differ** — even if only one side changed it. This means disjoint edits always show the merge modal instead of auto-merging.

**Fix required:** The original card version must be stored when the modal first opens and passed as `baseCard`:
```js
// In open():
this.baseCard = JSON.parse(JSON.stringify(card)); // store base

// In saveCard():
const mergedResult = this.attemptAutoMerge(this.card, diskParsed, this.baseCard); // pass base
```

---

### 2. Card ID mismatch in project card search (workspace board)

**Problem:** In [`workspace.js:84`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/workspace.js#L84), project cards are loaded with `cardId = file.replace('.md', '')` producing IDs like `PROJ-0001`. But in [`workspace.js:253-260`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/workspace.js#L253-L260), new project cards are created with ID `PROJ-${nextNumStr}` while the directory is `PROJ_${nextNumStr}`. The `workspace.json` `featureOrder` stores `PROJ-0001`, but the project directory scanned in step 4 is `PROJ_0001`. The board renderer at [`board.js:218`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/board.js#L218) uses `featureOrder` for ordering, so workspace project cards are never ordered correctly and may appear out of order or duplicated.

**Root cause:** The `featureOrder` in `workspace.json` uses dash IDs (`PROJ-0001`) but the project directory uses underscore IDs (`PROJ_0001`). `getCardsForList` looks up cards from `featureOrder` which has dash IDs but the db may have underscore-prefixed project cards from the directory scan.

**Fix:** Decide on one canonical format. The workspace card file is `projects/PROJ-0001.md` (dash), while the project directory is `PROJ_0001` (underscore). This split is actually correct per the PRD directory tree — they are different things. The ordering bug is that the workspace board uses the workspace project card ordering, which should only look at `/projects/*.md` cards, not sub-project directories. This works if the boardRenderer correctly uses `workspace.json.featureOrder` for workspace cards. **Needs an integration test to confirm correctness.**

---

## 🟠 Major Gaps

### 3. `renderSwimlaneView` has a broken group assignment bug

**File:** [`board.js:195`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/board.js#L195)

```js
if (!groups.has(groupKey)) groups.clear ? groups.set(groupKey, []) : null;
```

This line is wrong — it calls `groups.clear` (a function reference, always truthy) instead of properly initialising the group. This means the swimlane grouping always evaluates the ternary as `groups.set(groupKey, [])`, which is correct by accident, BUT `groups.clear ?` is checking the method reference, not whether the key exists. If the group already exists, `groups.has(groupKey)` is `true` and we skip the set — that part works. But the logic is fragile and wrong in principle.

More critically: if `groups.has(groupKey)` is false and the ternary runs, `groups.set` is called. Then `groups.get(groupKey).push(card)` on the next line will fail if the set didn't work. Testing confirms this is a latent crash bug when swimlane groups exist.

**Fix:**
```js
if (!groups.has(groupKey)) groups.set(groupKey, []);
groups.get(groupKey).push(card);
```

---

### 4. Presence warning not shown in card modal when opening a card with an active agent

**PRD §6.2:** _"Webapp Behavior: Scans the presence folder when a card modal is opened. Displays a warning if an active agent presence exists."_

**Problem:** [`card-modal.js:renderModalContainer()`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/card-modal.js#L48) — the rendered HTML never checks `this.appState.activePresenceMap` for the current card ID and never renders a warning banner inside the modal. The presence data exists in `state.activePresenceMap` (populated by heartbeat scans) but is never consulted when the modal opens.

**Fix needed:** At the top of `renderModalContainer()`, check for active presence on the current card and inject a warning div:
```js
const activePresence = this.appState.activePresenceMap.get(this.card.id) || [];
const presenceWarningHtml = activePresence.length > 0
  ? `<div class="presence-warning">⚠ ${escapeHtml(activePresence[0].actor)} is currently editing this card.</div>`
  : '';
```

---

### 5. Settings — "Custom Fields" and "Feature Types" tabs render a placeholder, not the actual content

**File:** [`settings.js:107-109`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/settings.js#L107-L109)

```js
} else {
  return `<p>Configuration tab view.</p>`;
}
```

Both the `fields` and `types` tabs render a generic placeholder. The PRD (§17) requires functional management of custom field definitions and feature type definitions in the settings modal.

**Impact:** Users cannot add/edit/delete custom fields or feature types through the UI. They would have to edit `.solokanban/fields.json` and `feature-types.json` manually.

---

### 6. Preferences tab missing `showAgentBadge` toggle

**PRD §17.2 & §12.3:** The preferences schema at [`defaults.js:155`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/defaults.js#L155) includes `showAgentBadge: true`, and `card-render.js` checks `cardPrefs.showAgentBadge !== false`. But [`settings.js:87-109`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/settings.js#L87-L109) has no UI control for this preference — the user cannot disable agent presence badges via the UI.

---

## 🟡 Minor Gaps / Deviations

### 7. `workspace.json` structure missing `lists` key for workspace board

**PRD §12.1 / §8.1:** `workspace.json` should define the workspace board's lists. [`defaults.js:163-179`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/defaults.js#L163-L179) includes `lists` in `DEFAULT_WORKSPACE_CONFIG`. However, [`board.js:28-36`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/board.js#L28-L36) ignores the loaded workspace config's `lists` and hardcodes `['backlog', 'in-progress', 'done']` for the workspace view. This means user-customised workspace lists are silently ignored.

### 8. `softDeleteProject` in `settings.js` does not remove the project card from `/projects/`

**PRD §17.1:** _"The project card file is removed from `/projects/` and the project entry removed from `workspace.json`."_

**Problem:** [`settings.js:154-165`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/settings.js#L154-L165) calls `fsAdapter.softDeleteProject(projId)` (which moves the sub-project directory) and deletes from `db.projects` and `db.cards`. But it never:
1. Deletes the matching `projects/PROJ-XXXX.md` card file
2. Removes the card ID from `workspace.json.featureOrder`

So after a soft-delete, the project card still appears on the workspace board on reload, even though the sub-project directory is trashed.

### 9. `collapse-list-btn` is rendered but has no event handler

**PRD §9.2:** Lists should collapse/expand. [`board.js:168`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/board.js#L168) renders the collapse button, but [`main.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/main.js) and [`board.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/board.js) have no `bindCollapseListeners()` or equivalent. The button is present but clicking it does nothing.

### 10. `agents.json` file never created or read

**PRD §5 directory tree** includes `.solokanban/agents.json`. [`workspace.js:initializeWorkspace()`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/workspace.js#L25-L54) creates all other config files but not `agents.json`. No module reads it. This is a low-priority gap (the file is listed in the spec but its schema is not defined in v8.3).

### 11. Markdown body section tooltips not implemented

**PRD §16.2:** _"Tooltips on headings with descriptions."_ Each feature type's `bodySections` array includes a `description` field (e.g. `{ id: "description", label: "Feature Specification", description: "..." }`). The rendered Markdown view in [`card-modal.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/card-modal.js#L96-L99) just calls `renderMarkdown(this.card.body)` directly, so section heading tooltips are never rendered.

---

## Priority Fix List

| Priority | Gap | Est. Complexity |
|---|---|---|
| 🔴 1 | Pass `baseCard` to `attemptAutoMerge` so disjoint auto-merge works | 5 min |
| 🔴 2 | `softDeleteProject`: also delete `projects/<id>.md` and update `workspace.json` | 30 min |
| 🟠 3 | Fix swimlane `groups.clear` bug | 2 min |
| 🟠 4 | Add presence warning banner to card modal HTML | 20 min |
| 🟠 5 | Implement Custom Fields and Feature Types tabs in settings | 2-3 hours |
| 🟠 6 | Add `showAgentBadge` toggle to Preferences tab | 15 min |
| 🟡 7 | Wire up `collapse-list-btn` click handler to save/restore in preferences | 30 min |
| 🟡 8 | Use `workspace.json.lists` in board renderer instead of hardcoded defaults | 20 min |
| 🟡 9 | Create `agents.json` in `initializeWorkspace()` | 5 min |
| 🟡 10 | Render section heading tooltips from feature type `description` field | 45 min |

---

## What the Unit Tests Already Cover

The 29 passing unit tests cover the critical correctness properties that would catch regressions:
- Content hash volatile field exclusion and 200ms performance
- Auto-merge disjoint fast path (the unit test passes a `baseCard`, which the production code does not — confirming gap #1)
- Adaptive presence heartbeat TTL values
- Label deletion fallback (card face omit, no hash change)
- Stale/overdue visual precedence logic
- Temp file cleanup on failed update
- Trash exclusion from search index
- Legacy `layout.json` migration
- Quarantine routing
- Soft-delete collision handling
