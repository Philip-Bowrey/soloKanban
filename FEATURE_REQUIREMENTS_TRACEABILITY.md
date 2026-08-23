# SoloKanban v8.3 — Feature & Requirement Traceability Matrix

This document provides a comprehensive mapping of every feature, architectural requirement, functional specification, user story, and data integrity rule defined in **SoloKanban PRD v8.3** to the source files, functions, and automated tests that implement and verify them.

---

## 📑 Table of Contents

1. [Architecture & Local-First Operating Model](#1-architecture--local-first-operating-model)
2. [Data Model & Directory Hierarchy](#2-data-model--directory-hierarchy)
3. [Dual-Level Kanban Boards & Navigation](#3-dual-level-kanban-boards--navigation)
4. [Concurrency Model, Content Hashing & Data Integrity](#4-concurrency-model-content-hashing--data-integrity)
5. [Per-Actor Presence Signaling & Heartbeats](#5-per-actor-presence-signaling--heartbeats)
6. [Feature Types, Custom Fields & Labels](#6-feature-types-custom-fields--labels)
7. [Board & List Display Enhancements](#7-board--list-display-enhancements)
8. [Card Face Visual Elements & Precedence Rules](#8-card-face-visual-elements--precedence-rules)
9. [Card Modal & Markdown Editing UX](#9-card-modal--markdown-editing-ux)
10. [Rich Checklists & Progress Calculation](#10-rich-checklists--progress-calculation)
11. [Settings & Workspace Management](#11-settings--workspace-management)
12. [Global Search & Disposable Cache](#12-global-search--disposable-cache)
13. [Zero-Dependency SDK & Auto-Update Pipeline](#13-zero-dependency-sdk--auto-update-pipeline)
14. [Browser Compatibility & First-Run Banners](#14-browser-compatibility--first-run-banners)
15. [E2E User Story Traceability Matrix (Areas A–M)](#15-e2e-user-story-traceability-matrix-areas-am)

---

## 1. Architecture & Local-First Operating Model

| Requirement | PRD Reference | Implementation File(s) | Key Symbols / Methods | Test Coverage |
|---|---|---|---|---|
| **Zero-Backend Static App**<br>Runs purely in-browser on GitHub Pages with zero server dependencies or build steps. | PRD §1, §2.1 | [`index.html`](file:///Users/philipbowrey/Desktop/SoloDevelopment/index.html)<br>[`js/main.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/main.js) | `SoloKanbanApp`<br>`window.addEventListener('DOMContentLoaded')` | `tests/e2e/a-workspace-setup.spec.js` |
| **File System Access API (FSAA) Integration**<br>Direct access to local user folders via `showDirectoryPicker()`. | PRD §1, §5 | [`js/filesystem.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/filesystem.js) | `FileSystemAdapter`<br>`readFile()`, `writeFile()`, `ensureDirectory()` | `tests/tier2_adapter.test.js`<br>`tests/e2e/fixtures/kanban-fixture.js` |
| **Atomic Full-File Replace**<br>Single-writer atomic writes using temp-file swap to avoid truncation or partial reads. | PRD §4.1, §6.1 | [`js/filesystem.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/filesystem.js) | `FileSystemAdapter.writeFile()` (writes to `.tmp_...` before replacement) | `tests/tier2_adapter.test.js` |
| **Quarantine Routing**<br>Corrupted/unparseable card files are safely isolated to `.solokanban/quarantine/` without crashing the board. | PRD §5, §12.1 | [`js/filesystem.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/filesystem.js)<br>[`js/workspace.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/workspace.js) | `FileSystemAdapter.quarantineCard()`<br>`WorkspaceManager.scanWorkspace()` | `tests/tier2_adapter.test.js` (Quarantine Routing) |

---

## 2. Data Model & Directory Hierarchy

| Requirement | PRD Reference | Implementation File(s) | Key Symbols / Methods | Test Coverage |
|---|---|---|---|---|
| **Plaintext Markdown + YAML Frontmatter**<br>Cards stored as `.md` files with structured YAML headers. | PRD §1, §12.1 | [`js/yaml.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/yaml.js) | `parseCardFile()`<br>`serializeCardFile()` | `tests/tier1_unit.test.js` (YAML Parser & Serializer) |
| **Workspace Initialisation**<br>Auto-creates `.solokanban/` directory structure, SDK, skills, locks, presence, trash, and config files. | PRD §5, §12.1 | [`js/workspace.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/workspace.js)<br>[`js/defaults.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/defaults.js) | `WorkspaceManager.initializeWorkspace()`<br>`DEFAULT_WORKSPACE_CONFIG` | `tests/tier2_adapter.test.js`<br>`tests/e2e/a-workspace-setup.spec.js` (US-SETUP-1) |
| **`project.json` Schema & Layout Migration**<br>Project lists and `featureOrder` stored in `project.json`; auto-migrates deprecated `layout.json` to `project.json.layout`. | PRD §9.6, §12.2 | [`js/workspace.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/workspace.js) | `WorkspaceManager.migrateLegacyLayout()`<br>`DEFAULT_PROJECT_CONFIG` | `tests/tier2_adapter.test.js` (Legacy layout.json Migration) |
| **`preferences.json` Schema**<br>Stores UI preferences (background, swimlanes, collapsed columns, dark mode, stale threshold, agent badges). | PRD §12.3, §17.2 | [`js/preferences.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/preferences.js)<br>[`js/defaults.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/defaults.js) | `PreferencesManager.load()`<br>`PreferencesManager.set()`<br>`DEFAULT_PREFERENCES` | `tests/e2e/k-settings.spec.js` |

---

## 3. Dual-Level Kanban Boards & Navigation

| Requirement | PRD Reference | Implementation File(s) | Key Symbols / Methods | Test Coverage |
|---|---|---|---|---|
| **Workspace Board**<br>Displays high-level project cards located in `/projects/*.md`. | PRD §8.1 | [`js/board.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/board.js)<br>[`js/workspace.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/workspace.js) | `BoardRenderer.renderBoard()` (when `currentView === 'workspace'`) | `tests/e2e/b-project-management.spec.js` (US-PROJ-1) |
| **Project Board**<br>Dedicated board displaying feature cards belonging to a specific sub-project (`<PROJECT_ID>/features/*.md`). | PRD §8.2 | [`js/board.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/board.js)<br>[`js/workspace.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/workspace.js) | `BoardRenderer.renderBoard()` (when `currentView === 'project'`) | `tests/e2e/c-feature-cards.spec.js` |
| **Modal-First Project Navigation**<br>Clicking a project card opens its edit modal; "Open Project Board" button navigates to the dedicated board. | PRD §8.1 | [`js/main.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/main.js)<br>[`js/card-modal.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/card-modal.js) | `CardModal.buildModalHtml()` (`#modal-open-project-board-btn`)<br>`bindEvents()` | `tests/e2e/b-project-management.spec.js` (US-PROJ-2, US-PROJ-3) |
| **Breadcrumb Navigation**<br>Renders `Workspace / ProjectName` with back navigation button returning to the workspace board. | PRD §8.2 | [`js/main.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/main.js) | `SoloKanbanApp.renderHeader()`<br>`#nav-back-workspace-btn` listener | `tests/e2e/b-project-management.spec.js` (US-PROJ-4) |

---

## 4. Concurrency Model, Content Hashing & Data Integrity

| Requirement | PRD Reference | Implementation File(s) | Key Symbols / Methods | Test Coverage |
|---|---|---|---|---|
| **Canonical Content Hashing**<br>Deterministic SHA-256 hash over normalized markdown body and sorted YAML frontmatter, excluding volatile fields (`revision`, `updatedAt`, `contentHash`, `deliveredAt`). | PRD §6.3 | [`js/hash.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/hash.js) | `computeContentHash()`<br>`canonicalizeYaml()`<br>`normalizeBody()` | `tests/tier1_unit.test.js` (Canonical Content Hash)<br>`tests/tier6_regression.test.js` |
| **Hash Performance Benchmark**<br>Completes in ≤200ms for a 50KB markdown body, well within the 800ms auto-save window. | PRD §3, §6.3, §18 | [`js/hash.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/hash.js) | `computeContentHash()` | `tests/tier1_unit.test.js` (Performance Benchmark: 50KB body in <200ms) |
| **Disjoint Auto-Merge Fast Path**<br>Automatically merges concurrent non-overlapping body section & frontmatter edits without user intervention or modal. | PRD §6.5.1 | [`js/card-modal.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/card-modal.js) | `CardModal.attemptAutoMerge(local, incoming, baseCard)` | `tests/tier3_concurrency.test.js`<br>`tests/tier9_gap_regression.test.js` (Gap #1)<br>`tests/e2e/j-conflict-resolution.spec.js` (US-CONF-1) |
| **Visual Conflict Resolution UI**<br>Displays side-by-side Merge Modal on overlapping edits with "Keep Local" and "Accept Incoming" choices. | PRD §6.5.2–4 | [`js/card-modal.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/card-modal.js) | `CardModal.showMergeModal()` (`#btn-keep-local`, `#btn-accept-incoming`) | `tests/e2e/j-conflict-resolution.spec.js` (US-CONF-2, US-CONF-3+4) |
| **Move Reconciliation & Rollback**<br>`featureOrder` in `project.json` is authoritative for ordering; `listId` on card is updated; compensating rollback on partial failure. | PRD §6.4 | [`js/workspace.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/workspace.js)<br>[`js/dragdrop.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/dragdrop.js) | `WorkspaceManager.scanAndReconcileProject()`<br>`DragDropHandler.moveCardToList()` | `tests/tier3_concurrency.test.js` (Move Operations & Compensating Rollback) |
| **Activity Log Preservation**<br>Terminal `## Activity Log` section is preserved, ordered chronologically, and always kept last after saves and merges. | PRD §6.5.3, §11 | [`js/markdown.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/markdown.js) | `appendActivityLog()`<br>`parseBodySections()` | `tests/e2e/j-conflict-resolution.spec.js` (US-CONF-6) |

---

## 5. Per-Actor Presence Signaling & Heartbeats

| Requirement | PRD Reference | Implementation File(s) | Key Symbols / Methods | Test Coverage |
|---|---|---|---|---|
| **Adaptive Presence Heartbeat**<br>15s interval (30s TTL) during active editing; switches to 60s interval (120s TTL) when idle >30s. | PRD §6.2 | [`js/state.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/state.js) | `AppState.startPresenceHeartbeat()`<br>`AppState.onUserActivity()` | `tests/tier3_concurrency.test.js`<br>`tests/tier6_regression.test.js` (Idle TTL = 120s) |
| **Per-Actor Presence Files**<br>Stored in `/.solokanban/presence/<CARD_ID>/<ACTOR_ID>.json` with metadata (`actor`, `actorType`, `intent`, `heartbeatAt`). | PRD §6.2 | [`js/state.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/state.js) | `AppState.writePresence()`<br>`AppState.clearPresence()`<br>`AppState.scanAllPresence()` | `tests/tier3_concurrency.test.js` |
| **Card Modal Presence Warning**<br>Shows warning banner in the card modal header if another actor is actively editing the card. | PRD §6.2, §16.1 | [`js/card-modal.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/card-modal.js) | `CardModal.buildModalHtml()` (`.presence-warning`) | `tests/tier9_gap_regression.test.js` (Gap #4)<br>`tests/e2e/i-agent-presence.spec.js` (US-PRES-3)<br>`tests/e2e/m-multi-actor.spec.js` (US-MULTI-1) |
| **Live Agent Pulsing Badge & Tooltip**<br>Card face displays a pulsing indicator; hovering displays actor identity and intent tooltip. | PRD §10.12 | [`js/card-render.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/card-render.js) | `renderCardFace()` (`.card-agent-badge`, `.pulsing-dot`) | `tests/tier6_regression.test.js`<br>`tests/e2e/i-agent-presence.spec.js` (US-PRES-1, US-PRES-2) |

---

## 6. Feature Types, Custom Fields & Labels

| Requirement | PRD Reference | Implementation File(s) | Key Symbols / Methods | Test Coverage |
|---|---|---|---|---|
| **7 Default Feature Types**<br>Shipped with `project`, `feature`, `bugfix`, `architecture`, `documentation`, `process`, and `prompt-engineering`. | PRD §7.1 | [`js/defaults.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/defaults.js) | `DEFAULT_FEATURE_TYPES` | `tests/tier1_unit.test.js` |
| **Feature Types CRUD UI**<br>Manage templates, colors, and section layouts via Settings → Feature Types. | PRD §7.1, §17 | [`js/settings.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/settings.js) | `SettingsModal.renderTabContent()` (`activeTab === 'types'`) | `tests/tier9_gap_regression.test.js` (Gap #5)<br>`tests/e2e/k-settings.spec.js` |
| **Custom Fields with `cardVisible`**<br>Custom frontmatter fields (text, select, multiselect) with option colors and card-face chip rendering. | PRD §7.3 | [`js/card-render.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/card-render.js)<br>[`js/settings.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/settings.js) | `renderCardFace()` (`.card-custom-chip`)<br>`SettingsModal` (`activeTab === 'fields'`) | `tests/tier9_gap_regression.test.js` (Gap #5)<br>`tests/e2e/f-labels-fields.spec.js` (US-FIELD-1, US-FIELD-2) |
| **Workspace-Level Labels**<br>Consistent label colors and names managed globally in `.solokanban/labels.json`. | PRD §7.2 | [`js/defaults.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/defaults.js)<br>[`js/settings.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/settings.js) | `DEFAULT_LABELS`<br>`SettingsModal` (`activeTab === 'labels'`) | `tests/tier4_integration.test.js`<br>`tests/e2e/f-labels-fields.spec.js` (US-LBL-1, US-LBL-2) |
| **Label Deletion Fallback (v8.3)**<br>Deleted label IDs are omitted from card face; modal displays non-interactive "Unknown label (deleted)" placeholder with × remove button; card hash unaffected. | PRD §3, §7.2.1 | [`js/card-render.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/card-render.js)<br>[`js/card-modal.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/card-modal.js) | `renderCardFace()` (filters out deleted labels)<br>`CardModal.buildModalHtml()` (`.unknown-deleted`) | `tests/tier1_unit.test.js` (Label Deletion Fallback)<br>`tests/tier6_regression.test.js`<br>`tests/e2e/f-labels-fields.spec.js` (US-LBL-3, US-LBL-4) |

---

## 7. Board & List Display Enhancements

| Requirement | PRD Reference | Implementation File(s) | Key Symbols / Methods | Test Coverage |
|---|---|---|---|---|
| **Horizontal Swimlanes**<br>Groups board cards into swimlanes by Assignee, Priority, or Feature Type. Persists in preferences. | PRD §9.1 | [`js/board.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/board.js) | `BoardRenderer.renderSwimlaneView()` | `tests/tier9_gap_regression.test.js` (Gap #3)<br>`tests/e2e/g-board-display.spec.js` (US-BOARD-1, US-BOARD-1b) |
| **Collapsible List Columns**<br>Columns collapse into narrow strips with card count badges; state persisted in `preferences.json`. | PRD §9.2 | [`js/board.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/board.js)<br>[`js/main.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/main.js) | `BoardRenderer.renderListColumn()`<br>`SoloKanbanApp.bindColumnCollapseListeners()` | `tests/e2e/g-board-display.spec.js` (US-BOARD-2) |
| **WIP Limit Visual Thresholds**<br>List headers display `count/limit` with amber (80%) and red (≥100%) alert styling. | PRD §9.3 | [`js/board.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/board.js) | `BoardRenderer.renderListColumn()` (`.wip-limit-badge`, `.wip-near`, `.wip-exceeded`) | `tests/e2e/g-board-display.spec.js` (US-BOARD-3) |
| **Column Totals & Stats**<br>Headers show total card count and aggregated story points. | PRD §9.4 | [`js/board.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/board.js) | `BoardRenderer.renderListColumn()` (`.column-stats`) | `tests/e2e/g-board-display.spec.js` (US-BOARD-4) |
| **Board Background Customisation**<br>Configurable background color applied to board canvas; persisted in preferences. | PRD §9.5 | [`js/board.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/board.js)<br>[`js/settings.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/settings.js) | `BoardRenderer.renderBoard()` (`container.style.backgroundColor`) | `tests/e2e/g-board-display.spec.js` (US-BOARD-5) |
| **Non-Draggable List Dividers**<br>Visual separator bars rendered within lists from `project.json.layout.dividers`. | PRD §9.6 | [`js/board.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/board.js) | `BoardRenderer.renderListColumn()` (`.list-divider`) | `tests/e2e/g-board-display.spec.js` (US-BOARD-6) |

---

## 8. Card Face Visual Elements & Precedence Rules

| Requirement | PRD Reference | Implementation File(s) | Key Symbols / Methods | Test Coverage |
|---|---|---|---|---|
| **Card Covers**<br>Banner image URL or color block at the top of the card face. | PRD §10.1 | [`js/card-render.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/card-render.js) | `renderCardFace()` (`.card-cover-image`, `.card-cover-banner`) | `tests/tier1_unit.test.js` |
| **Card Aging & Staleness Indicator**<br>Subtle stale indicator if card updated past threshold days (configured in preferences). | PRD §10.3 | [`js/card-render.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/card-render.js) | `getDueDateStatus()`<br>`renderCardFace()` (`.card-date-badge.stale`) | `tests/e2e/h-card-visual-indicators.spec.js` (US-VIS-1) |
| **Due Date Countdowns**<br>Relative countdown text (e.g. "in 3 days", "Due today", "Overdue by 2 days"). | PRD §10.4 | [`js/card-render.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/card-render.js) | `getDueDateStatus()` (`.card-date-badge.due-soon`, `.card-date-badge.overdue`) | `tests/e2e/h-card-visual-indicators.spec.js` (US-VIS-2) |
| **Overdue > Stale Visual Precedence**<br>When a card is both stale and overdue, the overdue red badge takes precedence and suppresses the stale badge. | PRD §10.4 | [`js/card-render.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/card-render.js) | `renderCardFace()` (priority conditional branching) | `tests/tier1_unit.test.js` (Date Logic & Visual Precedence)<br>`tests/e2e/h-card-visual-indicators.spec.js` (US-VIS-3) |
| **Priority Flags & Icons**<br>Severity flags with icons (🔥 Critical, ⚡ High, ▲ Medium, ▼ Low). | PRD §10.5 | [`js/card-render.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/card-render.js) | `renderCardFace()` (`.card-priority-badge`) | `tests/e2e/h-card-visual-indicators.spec.js` (US-VIS-4) |
| **Checklist Progress Ring**<br>Compact circular SVG progress ring reflecting top-level item completion percentage. | PRD §10.6 | [`js/card-render.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/card-render.js)<br>[`index.css`](file:///Users/philipbowrey/Desktop/SoloDevelopment/index.css) | `renderCardFace()` (`.card-progress-ring`, `.ring-fill`) | `tests/e2e/h-card-visual-indicators.spec.js` (US-VIS-5) |
| **Sub-Task Count Badge**<br>Shows total subtask progress count (e.g. `☑ 3/7`). | PRD §10.7 | [`js/card-render.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/card-render.js) | `renderCardFace()` (`.card-subtask-badge`) | `tests/e2e/h-card-visual-indicators.spec.js` (US-VIS-6) |
| **Empty Field Omission**<br>Unset fields are cleanly omitted without placeholder text (no "N/A" clutter). | PRD §18 | [`js/card-render.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/card-render.js) | `renderCardFace()` (conditional tag rendering) | `tests/e2e/h-card-visual-indicators.spec.js` (US-VIS-7) |
| **Assignee Avatar / Initials**<br>Compact badge displaying 2-letter uppercase initials of assignee. | PRD §10.10 | [`js/card-render.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/card-render.js) | `renderCardFace()` (`.card-avatar`) | `tests/e2e/h-card-visual-indicators.spec.js` |
| **Story Points Badge**<br>Numeric estimate badge (e.g. `5 pts`). | PRD §10.11 | [`js/card-render.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/card-render.js) | `renderCardFace()` (`.card-story-badge`) | `tests/e2e/h-card-visual-indicators.spec.js` |

---

## 9. Card Modal & Markdown Editing UX

| Requirement | PRD Reference | Implementation File(s) | Key Symbols / Methods | Test Coverage |
|---|---|---|---|---|
| **Modal Dismissal Controls**<br>Closes via `Escape` key, clicking overlay backdrop, or clicking the `×` button. | PRD §16.1 | [`js/card-modal.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/card-modal.js) | `CardModal.bindEvents()` (`escHandler`, `modalEl.click`, `modal-close-btn`) | `tests/e2e/c-feature-cards.spec.js` (US-CARD-5a, US-CARD-5b) |
| **800ms Auto-Save Debounce**<br>Auto-saves changes after 800ms pause with visual status indicator ("Saving..." → "Saved"). | PRD §16.1 | [`js/card-modal.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/card-modal.js) | `CardModal.scheduleAutoSave()`<br>`CardModal.saveCard()` | `tests/e2e/c-feature-cards.spec.js` (US-CARD-4) |
| **Editable Title & Immutable ID**<br>Card title input is editable; ID badge is displayed as read-only. | PRD §16.1 | [`js/card-modal.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/card-modal.js) | `CardModal.buildModalHtml()` (`#modal-title-input`, `.modal-id-badge`) | `tests/e2e/c-feature-cards.spec.js` (US-CARD-6) |
| **Markdown Rendered vs Raw Toggle**<br>Renders formatted markdown by default; button toggles editable raw textarea; saves and re-renders on switch. | PRD §16.2 | [`js/card-modal.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/card-modal.js)<br>[`js/markdown.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/markdown.js) | `CardModal.bindEvents()` (`#toggle-markdown-mode-btn`)<br>`renderMarkdown()` | `tests/e2e/d-markdown-editing.spec.js` (US-MD-1, US-MD-2, US-MD-3) |
| **Section Heading Tooltip Descriptions**<br>Rendered section headings display accessible tooltip `title` attributes based on feature type descriptions. | PRD §16.2 | [`js/markdown.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/markdown.js)<br>[`js/card-modal.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/card-modal.js) | `renderMarkdown(body, sectionDescriptions)` | `tests/tier9_gap_regression.test.js` (Gap #10)<br>`tests/e2e/d-markdown-editing.spec.js` (US-MD-4) |
| **HTML Security Escaping**<br>Escapes dangerous tags and characters (`&`, `<`, `>`, `"`, `'`) to prevent XSS. | PRD §15 | [`js/markdown.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/markdown.js) | `escapeHtml()`<br>`renderInline()` | `tests/tier1_unit.test.js` (Markdown Security Escaping) |

---

## 10. Rich Checklists & Progress Calculation

| Requirement | PRD Reference | Implementation File(s) | Key Symbols / Methods | Test Coverage |
|---|---|---|---|---|
| **Checklist Parsing & Hierarchy**<br>Parses markdown checklist items (`- [ ]`, `- [x]`) and extracts top-level vs nested child tasks. | PRD §16.4 | [`js/checklist.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/checklist.js) | `parseChecklist()` | `tests/tier1_unit.test.js` (Checklist Parser) |
| **Top-Level Progress Only**<br>Progress bar and completion percentages count only parent/top-level items (subtasks do not distort overall progress). | PRD §16.4 | [`js/checklist.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/checklist.js) | `calculateProgress()` | `tests/tier1_unit.test.js`<br>`tests/e2e/e-checklists.spec.js` (US-CHK-4) |
| **Subtask Progress Statistics**<br>Computes aggregate sub-item completion statistics (`completed/total`). | PRD §10.7, §16.4 | [`js/checklist.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/checklist.js) | `calculateSubtaskStats()` | `tests/tier1_unit.test.js` |

---

## 11. Settings & Workspace Management

| Requirement | PRD Reference | Implementation File(s) | Key Symbols / Methods | Test Coverage |
|---|---|---|---|---|
| **5-Tab Settings Modal**<br>Unified settings dialog with Labels, Custom Fields, Feature Types, Projects, and Preferences tabs. | PRD §17 | [`js/settings.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/settings.js) | `SettingsModal.renderModal()`<br>`SettingsModal.renderTabContent()` | `tests/e2e/k-settings.spec.js` (US-SET-1, US-SET-1b) |
| **Complete Soft-Delete to Trash**<br>Moves sub-project folder to `.solokanban/trash/<PROJECT>_<TIMESTAMP>/`, removes project card from `/projects/`, updates `workspace.json.featureOrder`, and evicts from memory. | PRD §17.1 | [`js/filesystem.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/filesystem.js)<br>[`js/workspace.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/workspace.js)<br>[`js/settings.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/settings.js) | `FileSystemAdapter.softDeleteProject()`<br>`WorkspaceManager.softDeleteProjectFull()` | `tests/tier2_adapter.test.js` (Soft-Delete Collision Handling)<br>`tests/tier9_gap_regression.test.js` (Gap #2)<br>`tests/e2e/b-project-management.spec.js` (US-PROJ-5) |
| **Explicit Confirmation Before Delete**<br>Soft-deleting a project prompts the user with a confirmation dialog before executing. | PRD §17.1 | [`js/settings.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/settings.js) | `SettingsModal.bindEvents()` (`confirm(...)`) | `tests/e2e/b-project-management.spec.js` (US-PROJ-6) |
| **Dark Mode Preference & Body Theming**<br>Dark mode toggle stored in `preferences.json`; dynamically applies `.dark-mode` CSS class on `document.body`. | PRD §17.2 | [`js/preferences.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/preferences.js)<br>[`js/main.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/main.js)<br>[`js/settings.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/settings.js) | `PreferencesManager.applyDarkMode()` | `tests/e2e/k-settings.spec.js` (US-SET-2) |
| **Agent Badges Toggle**<br>Preference toggle allows disabling live agent pulsing badges on card faces without removing presence data. | PRD §17.2 | [`js/settings.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/settings.js)<br>[`js/card-render.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/card-render.js) | `SettingsModal` (`#pref-agent-badges`)<br>`renderCardFace()` | `tests/tier9_gap_regression.test.js` (Gap #6)<br>`tests/e2e/k-settings.spec.js` (US-SET-4) |

---

## 12. Global Search & Disposable Cache

| Requirement | PRD Reference | Implementation File(s) | Key Symbols / Methods | Test Coverage |
|---|---|---|---|---|
| **Global Search Filtering**<br>Filters cards live across title, body, and card ID. | PRD §18 | [`js/main.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/main.js)<br>[`js/board.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/board.js) | `SoloKanbanApp.bindHeaderEvents()` (`#global-search-input`)<br>`BoardRenderer.applyFilters()` | `tests/e2e/l-search.spec.js` (US-SEARCH-1, US-SEARCH-1b, US-SEARCH-1c) |
| **Trash Excluded from Search Index (v8.3)**<br>Disposable cache (`search-index.json`) strictly excludes cards in `.solokanban/trash/`. | PRD §3, §12.1, §17.1 | [`js/db.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/db.js) | `SoloDb.rebuildSearchIndex()` (filters `!card._isTrash`) | `tests/tier4_integration.test.js` (Trash Excluded from Search Index)<br>`tests/e2e/l-search.spec.js` (US-SEARCH-2) |

---

## 13. Zero-Dependency SDK & Auto-Update Pipeline

| Requirement | PRD Reference | Implementation File(s) | Key Symbols / Methods | Test Coverage |
|---|---|---|---|---|
| **Standard-Library Python SDK**<br>Standalone Python SDK for agents operating directly on local files. | PRD §13 | [`.solokanban/sdk/solokanban.py`](file:///Users/philipbowrey/Desktop/SoloDevelopment/.solokanban/sdk/solokanban.py) | `SoloKanban`<br>`edit_session()`, `create_card()`, `move_card()` | `tests/test_sdk.py` (`npm run test:python`) |
| **Zero-Dependency JavaScript SDK**<br>Node.js / browser ES module SDK for agent automation. | PRD §13 | [`.solokanban/sdk/solokanban.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/.solokanban/sdk/solokanban.js) | `SoloKanbanJs` | `tests/tier7_sdk.test.js` |
| **Agent Markdown Skills**<br>Agent documentation skills distributed with the workspace. | PRD §12.4 | [`.solokanban/skills/solokanban-overview.md`](file:///Users/philipbowrey/Desktop/SoloDevelopment/.solokanban/skills/solokanban-overview.md)<br>[`.solokanban/skills/solokanban-sdk.md`](file:///Users/philipbowrey/Desktop/SoloDevelopment/.solokanban/skills/solokanban-sdk.md) | Agent guidance documentation | `tests/tier7_sdk.test.js` (Skills-vs-code drift check) |
| **SHA-256 Checksum Verified Auto-Update**<br>Updates SDK/skills from GitHub repository manifest (`version.json`) with SHA-256 validation. | PRD §14.1 | [`js/sdk-update.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/sdk-update.js) | `SdkUpdater.checkForUpdates()`<br>`SdkUpdater.updateFile()` | `tests/tier2_adapter.test.js` |
| **Temp File Cleanup on Failed Update (v8.3)**<br>Deletes all temporary files on checksum mismatch or failed download; never leaves partial files in destination. | PRD §3, §14.1 | [`js/sdk-update.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/sdk-update.js) | `SdkUpdater.updateFile()` (cleanup in `catch` block) | `tests/tier2_adapter.test.js` (Temp File Cleanup on Failed Update) |

---

## 14. Browser Compatibility & First-Run Banners

| Requirement | PRD Reference | Implementation File(s) | Key Symbols / Methods | Test Coverage |
|---|---|---|---|---|
| **Chromium Browser Detection**<br>Detects Chromium-based browsers via `userAgentData.brands` and user agent strings. | PRD §18 | [`js/main.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/main.js) | `isChromiumBrowser()` | `tests/tier6_regression.test.js` (First-run banner helper) |
| **Differentiated First-Run Banner Copy (v8.3)**<br>Chromium: *"SoloKanban works best in Chromium..."*<br>Non-Chromium: *"SoloKanban requires a Chromium-based browser... Your files remain editable manually via any text editor (e.g., VS Code, Obsidian)."* | PRD §3, §18 | [`js/main.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/main.js) | `SoloKanbanApp.checkFirstRunBanner()` | `tests/e2e/a-workspace-setup.spec.js` (US-SETUP-3, US-SETUP-4) |
| **Per-Workspace Banner Dismissal**<br>Banner dismissal saved to `.solokanban/preferences.json` (`ui.firstRunBannerDismissed`), scoping dismissal to that workspace folder. | PRD §4.1, §18 | [`js/preferences.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/preferences.js)<br>[`js/main.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/main.js) | `PreferencesManager.dismissFirstRunBanner()` | `tests/e2e/a-workspace-setup.spec.js` (US-SETUP-3b, US-SETUP-5) |

---

## 15. E2E User Story Traceability Matrix (Areas A–M)

| User Story ID | Description | Spec File | Primary Implementation Files |
|---|---|---|---|
| **US-SETUP-1** | Blank workspace opens with zero projects and creates structure | [`tests/e2e/a-workspace-setup.spec.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/tests/e2e/a-workspace-setup.spec.js) | [`js/workspace.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/workspace.js) |
| **US-SETUP-2** | Reopening seeded workspace restores existing project card | [`tests/e2e/a-workspace-setup.spec.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/tests/e2e/a-workspace-setup.spec.js) | [`js/workspace.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/workspace.js), [`js/board.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/board.js) |
| **US-SETUP-3** | First-run banner appears in Chromium and is dismissible | [`tests/e2e/a-workspace-setup.spec.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/tests/e2e/a-workspace-setup.spec.js) | [`js/main.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/main.js) |
| **US-SETUP-3b** | Banner does not reappear after dismissal on reload | [`tests/e2e/a-workspace-setup.spec.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/tests/e2e/a-workspace-setup.spec.js) | [`js/preferences.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/preferences.js) |
| **US-SETUP-4** | Non-Chromium user sees warning banner with manual editing note | [`tests/e2e/a-workspace-setup.spec.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/tests/e2e/a-workspace-setup.spec.js) | [`js/main.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/main.js) |
| **US-SETUP-5** | Banner dismissal is scoped to the workspace folder | [`tests/e2e/a-workspace-setup.spec.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/tests/e2e/a-workspace-setup.spec.js) | [`js/preferences.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/preferences.js) |
| **US-PROJ-1** | Creating a project adds card to workspace board and creates files | [`tests/e2e/b-project-management.spec.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/tests/e2e/b-project-management.spec.js) | [`js/workspace.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/workspace.js) |
| **US-PROJ-2** | Clicking project card opens edit modal (not board directly) | [`tests/e2e/b-project-management.spec.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/tests/e2e/b-project-management.spec.js) | [`js/main.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/main.js) |
| **US-PROJ-3** | "Open Project Board" button navigates to project board | [`tests/e2e/b-project-management.spec.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/tests/e2e/b-project-management.spec.js) | [`js/card-modal.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/card-modal.js) |
| **US-PROJ-4** | Breadcrumb shows `Workspace / ProjectName` and allows back navigation | [`tests/e2e/b-project-management.spec.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/tests/e2e/b-project-management.spec.js) | [`js/main.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/main.js) |
| **US-PROJ-5** | Deleting project removes card immediately and moves files to trash | [`tests/e2e/b-project-management.spec.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/tests/e2e/b-project-management.spec.js) | [`js/workspace.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/workspace.js), [`js/settings.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/settings.js) |
| **US-PROJ-6** | Project deletion requires confirmation dialog before executing | [`tests/e2e/b-project-management.spec.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/tests/e2e/b-project-management.spec.js) | [`js/settings.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/settings.js) |
| **US-CARD-1** | Creating feature card via column header button adds it to list | [`tests/e2e/c-feature-cards.spec.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/tests/e2e/c-feature-cards.spec.js) | [`js/main.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/main.js), [`js/workspace.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/workspace.js) |
| **US-CARD-2** | Card body populated with template sections from feature type | [`tests/e2e/c-feature-cards.spec.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/tests/e2e/c-feature-cards.spec.js) | [`js/workspace.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/workspace.js) |
| **US-CARD-3** | Clicking feature card opens edit modal with populated fields | [`tests/e2e/c-feature-cards.spec.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/tests/e2e/c-feature-cards.spec.js) | [`js/card-modal.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/card-modal.js) |
| **US-CARD-4** | Typing in card field triggers auto-save within 800ms debounce | [`tests/e2e/c-feature-cards.spec.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/tests/e2e/c-feature-cards.spec.js) | [`js/card-modal.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/card-modal.js) |
| **US-CARD-5a** | Pressing Escape closes card modal | [`tests/e2e/c-feature-cards.spec.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/tests/e2e/c-feature-cards.spec.js) | [`js/card-modal.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/card-modal.js) |
| **US-CARD-5b** | Clicking modal overlay backdrop closes card modal | [`tests/e2e/c-feature-cards.spec.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/tests/e2e/c-feature-cards.spec.js) | [`js/card-modal.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/card-modal.js) |
| **US-CARD-6** | Title field accepts edits; card ID badge is read-only | [`tests/e2e/c-feature-cards.spec.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/tests/e2e/c-feature-cards.spec.js) | [`js/card-modal.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/card-modal.js) |
| **US-CARD-7** | Dragging card to another column updates list assignment | [`tests/e2e/c-feature-cards.spec.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/tests/e2e/c-feature-cards.spec.js) | [`js/dragdrop.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/dragdrop.js) |
| **US-CARD-8** | Small drag movement does not trigger card click-to-open | [`tests/e2e/c-feature-cards.spec.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/tests/e2e/c-feature-cards.spec.js) | [`js/main.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/main.js) |
| **US-CARD-9** | Moving card to Done list sets delivered timestamp | [`tests/e2e/c-feature-cards.spec.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/tests/e2e/c-feature-cards.spec.js) | [`js/dragdrop.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/dragdrop.js) |
| **US-CARD-10** | Archiving card removes it from active board view | [`tests/e2e/c-feature-cards.spec.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/tests/e2e/c-feature-cards.spec.js) | [`js/card-modal.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/card-modal.js) |
| **US-MD-1** | Card body renders formatted Markdown on initial open | [`tests/e2e/d-markdown-editing.spec.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/tests/e2e/d-markdown-editing.spec.js) | [`js/markdown.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/markdown.js), [`js/card-modal.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/card-modal.js) |
| **US-MD-2** | Clicking "Edit Raw Markdown" switches to editable textarea | [`tests/e2e/d-markdown-editing.spec.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/tests/e2e/d-markdown-editing.spec.js) | [`js/card-modal.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/card-modal.js) |
| **US-MD-3** | Switching from raw edit back to rendered view persists change | [`tests/e2e/d-markdown-editing.spec.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/tests/e2e/d-markdown-editing.spec.js) | [`js/card-modal.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/card-modal.js) |
| **US-MD-4** | Section headings have accessible tooltip descriptions | [`tests/e2e/d-markdown-editing.spec.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/tests/e2e/d-markdown-editing.spec.js) | [`js/markdown.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/markdown.js) |
| **US-CHK-1** | Empty checklist section shows "Add an item" button | [`tests/e2e/e-checklists.spec.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/tests/e2e/e-checklists.spec.js) | [`js/checklist.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/checklist.js) |
| **US-CHK-2** | Checking checklist item updates progress ring | [`tests/e2e/e-checklists.spec.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/tests/e2e/e-checklists.spec.js) | [`js/checklist.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/checklist.js) |
| **US-CHK-3** | Sub-items nest visually under parent task | [`tests/e2e/e-checklists.spec.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/tests/e2e/e-checklists.spec.js) | [`js/checklist.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/checklist.js) |
| **US-CHK-4** | Progress bar counts only top-level items | [`tests/e2e/e-checklists.spec.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/tests/e2e/e-checklists.spec.js) | [`js/checklist.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/checklist.js) |
| **US-CHK-5** | Enter key saves checklist item and focuses new input | [`tests/e2e/e-checklists.spec.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/tests/e2e/e-checklists.spec.js) | [`js/checklist.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/checklist.js) |
| **US-LBL-1** | Adding new label makes it available workspace-wide | [`tests/e2e/f-labels-fields.spec.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/tests/e2e/f-labels-fields.spec.js) | [`js/settings.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/settings.js) |
| **US-LBL-2** | Editing label color updates all cards without changing files | [`tests/e2e/f-labels-fields.spec.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/tests/e2e/f-labels-fields.spec.js) | [`js/card-render.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/card-render.js) |
| **US-LBL-3** | Deleted label shows "Unknown label (deleted)" placeholder | [`tests/e2e/f-labels-fields.spec.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/tests/e2e/f-labels-fields.spec.js) | [`js/card-render.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/card-render.js), [`js/card-modal.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/card-modal.js) |
| **US-LBL-4** | Clicking × on unknown label removes dangling reference | [`tests/e2e/f-labels-fields.spec.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/tests/e2e/f-labels-fields.spec.js) | [`js/card-modal.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/card-modal.js) |
| **US-FIELD-1** | Custom field defined in settings appears in card edit modal | [`tests/e2e/f-labels-fields.spec.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/tests/e2e/f-labels-fields.spec.js) | [`js/settings.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/settings.js), [`js/card-modal.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/card-modal.js) |
| **US-FIELD-2** | `cardVisible` custom field displays chip on card face | [`tests/e2e/f-labels-fields.spec.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/tests/e2e/f-labels-fields.spec.js) | [`js/card-render.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/card-render.js) |
| **US-BOARD-1** | Swimlane grouping by priority, assignee, or type | [`tests/e2e/g-board-display.spec.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/tests/e2e/g-board-display.spec.js) | [`js/board.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/board.js) |
| **US-BOARD-1b** | Swimlane selection persists after reload | [`tests/e2e/g-board-display.spec.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/tests/e2e/g-board-display.spec.js) | [`js/preferences.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/preferences.js) |
| **US-BOARD-2** | Collapsing column shrinks it to compact strip and persists | [`tests/e2e/g-board-display.spec.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/tests/e2e/g-board-display.spec.js) | [`js/board.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/board.js), [`js/main.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/main.js) |
| **US-BOARD-3** | WIP limit shows `current/limit` with amber/red styling | [`tests/e2e/g-board-display.spec.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/tests/e2e/g-board-display.spec.js) | [`js/board.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/board.js) |
| **US-BOARD-4** | Column header shows card count and story points stat | [`tests/e2e/g-board-display.spec.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/tests/e2e/g-board-display.spec.js) | [`js/board.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/board.js) |
| **US-BOARD-5** | Board background color customisation applies immediately | [`tests/e2e/g-board-display.spec.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/tests/e2e/g-board-display.spec.js) | [`js/board.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/board.js) |
| **US-BOARD-6** | List dividers render as non-draggable separators | [`tests/e2e/g-board-display.spec.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/tests/e2e/g-board-display.spec.js) | [`js/board.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/board.js) |
| **US-VIS-1** | Stale card shows aging indicator past threshold days | [`tests/e2e/h-card-visual-indicators.spec.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/tests/e2e/h-card-visual-indicators.spec.js) | [`js/card-render.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/card-render.js) |
| **US-VIS-2** | Card with future due date shows relative countdown | [`tests/e2e/h-card-visual-indicators.spec.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/tests/e2e/h-card-visual-indicators.spec.js) | [`js/card-render.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/card-render.js) |
| **US-VIS-3** | Overdue badge visually suppresses stale badge on same card | [`tests/e2e/h-card-visual-indicators.spec.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/tests/e2e/h-card-visual-indicators.spec.js) | [`js/card-render.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/card-render.js) |
| **US-VIS-4** | Card with priority set displays priority flag icon | [`tests/e2e/h-card-visual-indicators.spec.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/tests/e2e/h-card-visual-indicators.spec.js) | [`js/card-render.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/card-render.js) |
| **US-VIS-5** | Checklist progress ring rendered on card face | [`tests/e2e/h-card-visual-indicators.spec.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/tests/e2e/h-card-visual-indicators.spec.js) | [`js/card-render.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/card-render.js), [`index.css`](file:///Users/philipbowrey/Desktop/SoloDevelopment/index.css) |
| **US-VIS-6** | Card face shows badge with checklist item count | [`tests/e2e/h-card-visual-indicators.spec.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/tests/e2e/h-card-visual-indicators.spec.js) | [`js/card-render.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/card-render.js) |
| **US-VIS-7** | Card with no optional fields shows no empty placeholders | [`tests/e2e/h-card-visual-indicators.spec.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/tests/e2e/h-card-visual-indicators.spec.js) | [`js/card-render.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/card-render.js) |
| **US-PRES-1** | Active agent presence displays pulsing indicator on card face | [`tests/e2e/i-agent-presence.spec.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/tests/e2e/i-agent-presence.spec.js) | [`js/card-render.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/card-render.js) |
| **US-PRES-2** | Hovering presence badge shows actor and intent tooltip | [`tests/e2e/i-agent-presence.spec.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/tests/e2e/i-agent-presence.spec.js) | [`js/card-render.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/card-render.js) |
| **US-PRES-3** | Opening card with active presence shows warning in modal | [`tests/e2e/i-agent-presence.spec.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/tests/e2e/i-agent-presence.spec.js) | [`js/card-modal.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/card-modal.js) |
| **US-PRES-4** | Expired presence file past TTL auto-disappears | [`tests/e2e/i-agent-presence.spec.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/tests/e2e/i-agent-presence.spec.js) | [`js/state.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/state.js) |
| **US-CONF-1** | Disjoint concurrent edits auto-merge without modal | [`tests/e2e/j-conflict-resolution.spec.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/tests/e2e/j-conflict-resolution.spec.js) | [`js/card-modal.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/card-modal.js) |
| **US-CONF-2** | Concurrent edit of same section opens Merge Modal | [`tests/e2e/j-conflict-resolution.spec.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/tests/e2e/j-conflict-resolution.spec.js) | [`js/card-modal.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/card-modal.js) |
| **US-CONF-3+4** | Merge modal provides "Keep Local" and "Accept Incoming" buttons | [`tests/e2e/j-conflict-resolution.spec.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/tests/e2e/j-conflict-resolution.spec.js) | [`js/card-modal.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/card-modal.js) |
| **US-CONF-6** | Activity Log section preserved and terminal after save | [`tests/e2e/j-conflict-resolution.spec.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/tests/e2e/j-conflict-resolution.spec.js) | [`js/markdown.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/markdown.js), [`js/card-modal.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/card-modal.js) |
| **US-SET-1** | Settings panel opens with all five tabs visible | [`tests/e2e/k-settings.spec.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/tests/e2e/k-settings.spec.js) | [`js/settings.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/settings.js) |
| **US-SET-1b** | Switching between settings tabs does not cause errors | [`tests/e2e/k-settings.spec.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/tests/e2e/k-settings.spec.js) | [`js/settings.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/settings.js) |
| **US-SET-2** | Toggling dark mode saves preference and updates body theme | [`tests/e2e/k-settings.spec.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/tests/e2e/k-settings.spec.js) | [`js/preferences.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/preferences.js), [`js/settings.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/settings.js) |
| **US-SET-3** | Changing staleness threshold saves in preferences | [`tests/e2e/k-settings.spec.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/tests/e2e/k-settings.spec.js) | [`js/settings.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/settings.js) |
| **US-SET-4** | Disabling agent presence badges hides badges on card face | [`tests/e2e/k-settings.spec.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/tests/e2e/k-settings.spec.js) | [`js/settings.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/settings.js), [`js/card-render.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/card-render.js) |
| **US-SEARCH-1** | Search bar filters cards by title, body, and card ID | [`tests/e2e/l-search.spec.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/tests/e2e/l-search.spec.js) | [`js/main.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/main.js), [`js/board.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/board.js) |
| **US-SEARCH-1b** | Clearing search input restores all cards | [`tests/e2e/l-search.spec.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/tests/e2e/l-search.spec.js) | [`js/main.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/main.js), [`js/board.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/board.js) |
| **US-SEARCH-1c** | Search with no matches displays empty board | [`tests/e2e/l-search.spec.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/tests/e2e/l-search.spec.js) | [`js/board.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/board.js) |
| **US-SEARCH-2** | Trashed projects excluded from search results | [`tests/e2e/l-search.spec.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/tests/e2e/l-search.spec.js) | [`js/db.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/db.js) |
| **US-MULTI-1** | Agent presence warning appears immediately on modal open | [`tests/e2e/m-multi-actor.spec.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/tests/e2e/m-multi-actor.spec.js) | [`js/card-modal.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/card-modal.js) |
| **US-MULTI-2** | User edits preserved in outcome of any conflict scenario | [`tests/e2e/m-multi-actor.spec.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/tests/e2e/m-multi-actor.spec.js) | [`js/card-modal.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/card-modal.js) |
| **US-MULTI-3** | Non-overlapping edits with active agent complete normally | [`tests/e2e/m-multi-actor.spec.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/tests/e2e/m-multi-actor.spec.js) | [`js/card-modal.js`](file:///Users/philipbowrey/Desktop/SoloDevelopment/js/card-modal.js) |
