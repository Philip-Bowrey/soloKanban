# SoloKanban — End-to-End (E2E) Test Suite

This directory contains the Playwright-based E2E test suite for SoloKanban. Tests are organized by user story area, mapping directly to the `US-<AREA>-<N>` IDs defined in the **SoloKanban PRD v8.3 - Additional Tests.md** document.

---

## Directory Structure

```
tests/e2e/
├── fixtures/
│   └── kanban-fixture.js          # Shared Playwright fixture with mock FS shim
├── a-workspace-setup.spec.js      # US-SETUP-1 to US-SETUP-5
├── b-project-management.spec.js   # US-PROJ-1 to US-PROJ-6
├── c-feature-cards.spec.js        # US-CARD-1 to US-CARD-10
├── d-markdown-editing.spec.js     # US-MD-1 to US-MD-4
├── f-labels-fields.spec.js        # US-LBL-1 to US-LBL-4, US-FIELD-1, US-FIELD-2
├── g-board-display.spec.js        # US-BOARD-1 to US-BOARD-6
├── h-card-visual-indicators.spec.js # US-VIS-1 to US-VIS-7
├── i-agent-presence.spec.js       # US-PRES-1 to US-PRES-4
├── j-conflict-resolution.spec.js  # US-CONF-1 to US-CONF-6
├── k-settings.spec.js             # US-SET-1 to US-SET-4
├── l-search.spec.js               # US-SEARCH-1, US-SEARCH-2
└── m-multi-actor.spec.js          # US-MULTI-1 to US-MULTI-3
```

> Note: Area E (Checklists) is omitted here as checklist interactions are handled via the markdown/body editor flow tested in Area D and C. Dedicated checklist E2E tests (US-CHK-1 to US-CHK-5) should be added once the checklist UI is finalized.

---

## Running the Tests

### 1. Install Playwright (first time only)

```bash
npm run test:e2e:install
```

This installs the Chromium browser binary that Playwright uses. SoloKanban requires Chromium for the **File System Access API**.

### 2. Run all E2E tests

```bash
npm run test:e2e
```

### 3. Run a specific test file

```bash
npx playwright test tests/e2e/b-project-management.spec.js
```

### 4. Run tests matching a user story ID

```bash
npx playwright test --grep "US-PROJ-3"
```

### 5. Open the Playwright UI (recommended for debugging)

```bash
npm run test:e2e:ui
```

### 6. Debug a failing test step-by-step

```bash
npm run test:e2e:debug
```

### 7. Run all tiers (unit + fuzz + e2e)

```bash
npm run test:all
```

---

## How the Mock Works

The File System Access API (`showDirectoryPicker()`) is a browser-native API that cannot be automated by Playwright directly — it shows a native OS dialog.

The fixture in `fixtures/kanban-fixture.js` solves this by injecting a **complete in-memory shim** via `page.addInitScript()` before any app code runs. The shim:

1. Replaces `window.showDirectoryPicker` with a function that returns a `MockDirectoryHandle` backed by a `Map`.
2. Exposes `window.__seedFile(path, content)` for pre-populating file state before the workspace is opened.
3. Allows tests to call `kanban.readMockFile(path)` to assert that files were written correctly.

This means **no real files are ever written to disk** during tests. Tests are fast, isolated, and deterministic.

---

## User Story ↔ Test Traceability

| User Story | Test File | Test Name |
|---|---|---|
| US-SETUP-1 | a-workspace-setup.spec.js | `blank workspace opens with zero projects...` |
| US-SETUP-2 | a-workspace-setup.spec.js | `reopening a seeded workspace restores existing...` |
| US-SETUP-3 | a-workspace-setup.spec.js | `first-run banner appears in Chromium...` |
| US-SETUP-4 | a-workspace-setup.spec.js | `non-Chromium user sees stronger warning...` |
| US-SETUP-5 | a-workspace-setup.spec.js | `banner dismissal is scoped to the workspace...` |
| US-PROJ-1 | b-project-management.spec.js | `creating a project adds a card...` |
| US-PROJ-2 | b-project-management.spec.js | `clicking a project card opens the edit modal...` |
| US-PROJ-3 | b-project-management.spec.js | `Open Project Board button inside the card modal...` |
| US-PROJ-4 | b-project-management.spec.js | `breadcrumb shows Workspace / ProjectName...` |
| US-PROJ-5 | b-project-management.spec.js | `deleting a project removes the card...` |
| US-PROJ-6 | b-project-management.spec.js | `project deletion requires confirm dialog...` |
| US-CARD-1 | c-feature-cards.spec.js | `creating a feature card via column header button...` |
| US-CARD-2 | c-feature-cards.spec.js | `feature card body is populated with template sections...` |
| US-CARD-3 | c-feature-cards.spec.js | `clicking a feature card opens its edit modal...` |
| US-CARD-4 | c-feature-cards.spec.js | `typing in a card field triggers auto-save within 1s` |
| US-CARD-5 | c-feature-cards.spec.js | `pressing Escape closes the card modal` |
| US-CARD-6 | c-feature-cards.spec.js | `title field accepts edits; card ID badge is not editable` |
| US-CARD-7 | c-feature-cards.spec.js | `dragging a card to another column updates its list...` |
| US-CARD-8 | c-feature-cards.spec.js | `a small drag movement does not trigger the card...` |
| US-CARD-9 | c-feature-cards.spec.js | `moving a card into the Done column sets a delivered...` |
| US-CARD-10 | c-feature-cards.spec.js | `archiving a card removes it from the active board` |
| US-MD-1 | d-markdown-editing.spec.js | `card body renders Markdown on initial open` |
| US-MD-2 | d-markdown-editing.spec.js | `clicking "Edit Raw Markdown" switches to textarea` |
| US-MD-3 | d-markdown-editing.spec.js | `switching from raw edit back to rendered view persists` |
| US-MD-4 | d-markdown-editing.spec.js | `section headings have accessible tooltip descriptions` |
| US-LBL-1 | f-labels-fields.spec.js | `adding a new label makes it available workspace-wide` |
| US-LBL-2 | f-labels-fields.spec.js | `editing a label colour in Settings updates the label` |
| US-LBL-3 | f-labels-fields.spec.js | `deleted label shows placeholder text...` |
| US-LBL-4 | f-labels-fields.spec.js | `clicking × on unknown-deleted label removes...` |
| US-FIELD-1 | f-labels-fields.spec.js | `custom field defined in settings appears in modal` |
| US-FIELD-2 | f-labels-fields.spec.js | `a field marked cardVisible shows its value on face` |
| US-BOARD-1 | g-board-display.spec.js | `selecting "By Priority" swimlane groups cards...` |
| US-BOARD-2 | g-board-display.spec.js | `collapsing a list column shrinks it to a compact strip` |
| US-BOARD-3 | g-board-display.spec.js | `list with WIP limit shows the count/limit badge` |
| US-BOARD-4 | g-board-display.spec.js | `list header shows card count stat` |
| US-BOARD-5 | g-board-display.spec.js | `setting board background in preferences applies...` |
| US-BOARD-6 | g-board-display.spec.js | `seeded list dividers render as non-draggable separators` |
| US-VIS-1 | h-card-visual-indicators.spec.js | `card not updated past staleness threshold shows aging...` |
| US-VIS-2 | h-card-visual-indicators.spec.js | `card with future due date shows relative countdown` |
| US-VIS-3 | h-card-visual-indicators.spec.js | `card that is both stale and overdue shows only overdue` |
| US-VIS-4 | h-card-visual-indicators.spec.js | `card with priority set shows the priority badge` |
| US-VIS-5 | h-card-visual-indicators.spec.js | `card with a checklist shows a progress indicator` |
| US-VIS-6 | h-card-visual-indicators.spec.js | `card face shows badge with checklist item count` |
| US-VIS-7 | h-card-visual-indicators.spec.js | `card with no optional fields shows no empty placeholders` |
| US-PRES-1 | i-agent-presence.spec.js | `card with active agent presence shows pulsing indicator` |
| US-PRES-2 | i-agent-presence.spec.js | `hovering agent badge shows identity and intent tooltip` |
| US-PRES-3 | i-agent-presence.spec.js | `opening card with active agent shows warning in modal` |
| US-PRES-4 | i-agent-presence.spec.js | `expired presence file does not show badge on card` |
| US-CONF-1 | j-conflict-resolution.spec.js | `disjoint concurrent edits auto-merge...` |
| US-CONF-2 | j-conflict-resolution.spec.js | `concurrent edit of same section shows merge modal` |
| US-CONF-3/4 | j-conflict-resolution.spec.js | `merge modal has Keep Local and Accept Incoming...` |
| US-CONF-6 | j-conflict-resolution.spec.js | `Activity Log section is preserved after a save` |
| US-SET-1 | k-settings.spec.js | `settings panel opens with all five tabs visible` |
| US-SET-2 | k-settings.spec.js | `toggling dark mode in Preferences saves the preference` |
| US-SET-3 | k-settings.spec.js | `changing staleness threshold saves the new value` |
| US-SET-4 | k-settings.spec.js | `disabling agent presence badges hides badges` |
| US-SEARCH-1 | l-search.spec.js | `typing in search bar filters cards by title match` |
| US-SEARCH-2 | l-search.spec.js | `searching does not return cards from trashed projects` |
| US-MULTI-1 | m-multi-actor.spec.js | `agent presence warning appears immediately on modal open` |
| US-MULTI-2 | m-multi-actor.spec.js | `user edit content is preserved in conflict outcome` |
| US-MULTI-3 | m-multi-actor.spec.js | `disjoint agent edits allow normal save completion` |

---

## Adding New Tests

When a new feature is implemented:

1. Add the user story to **SoloKanban PRD v8.3 - Additional Tests.md** with a stable `US-<AREA>-<N>` ID.
2. Add the corresponding test to the appropriate spec file (or create a new one for a new area).
3. Use the `kanban` fixture from `fixtures/kanban-fixture.js` for all tests.
4. Tests that cover not-yet-implemented UI should use `test.info().annotations.push({ type: 'note', ... })` rather than failing hard — this keeps the suite green while flagging pending work.

---

## Notes on Pending Tests

Several tests use annotation-based "pending" markers for features not yet implemented in the UI (e.g. `US-VIS-1` staleness indicator, `US-PRES-1` presence badge on card face, `US-CARD-10` archive button). These tests will **pass** but log a note. Once the feature is implemented, remove the annotation and replace it with a proper assertion.
