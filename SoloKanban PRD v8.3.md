# SoloKanban — Product Requirement Document  
**Version 8.3 — Spec Clarifications for Label Deletion, First-Run Banner, Hash Performance, and Trash Exclusions**

---

## 1. Introduction

SoloKanban is a local-first, agent-native Kanban system that runs entirely in the browser as a static web application on GitHub Pages. It operates on a user-chosen local folder using the File System Access API. There is no backend, no build step, and no cloud dependency.

The core idea: **everything is a Markdown file with YAML frontmatter**, stored in a plain folder structure. Both humans and AI agents can read, edit, and manage work by directly manipulating these files. The web application provides a full-featured board UI while remaining optional — the files themselves are always the source of truth.

SoloKanban is designed to track **improvements to projects and processes**, not the operational workflow itself. For example, it tracks “improve the contract review agent’s timestamp detection,” not the actual contract review task.

### Why this design?

- **Plaintext Markdown files** are future-proof, diffable, and directly editable by both humans and AI agents without a custom server.
- **File System Access API** removes the need for a backend, simplifies deployment to static hosting, and gives users full control over their data.
- **Local-first** ensures privacy, offline capability, and zero infrastructure cost.
- The system deliberately avoids becoming an operational project tracker; instead, it focuses on improvement backlogs, which is the stated use case.

---

## 2. Goals & Non-Goals

### 2.1 Goals

- **Local-first, no backend:** Static HTML/CSS/JS on GitHub Pages, zero build step, operating on a user-chosen local folder via the File System Access API.
- **Agent-native plaintext storage:** Everything a human or agent needs is a `.md` file with YAML frontmatter — readable and editable without the app.
- **Dual-level Kanban:** The workspace is a board of **project cards**. Each project card opens a dedicated project board containing its own feature cards.
- **Extensible Feature Types:** Workspace-level feature types define structured card templates. Six default types ship out of the box; a built-in `project` type handles workspace-level project cards.
- **Workspace-level label & custom field consistency:** Labels and custom field colours are defined once at workspace level and shared across all projects.
- **Settings UI:** A settings modal allows managing labels, custom fields, feature types, and projects (with soft-delete to trash; manual restore, auto-purge planned).
- **Rich checklists:** Checklists support parent/child tasks, progress bars (parent-level only), and inline adding of items.
- **Predictable correctness & conflict awareness:** Every card carries a revision counter and canonical content hash; stale writes trigger conflict handling.
- **Visibility without ceremony:** Activity Log records all changes inline.
- **Full-featured board UI:** Drag-and-drop, dynamic forms, Markdown/wiki editing, search, attachments, custom fields, WIP limits, due dates, progress indicators.
- **Zero-dependency SDK & skills:** Standard-library-only Python and JS SDKs plus **agent-facing skills** are shipped inside every workspace, automatically kept up to date from the GitHub repository with checksum verification.
- **Modern editing UX:** Auto-save, click-outside/Esc to close, editable titles, Markdown rendered/raw toggle, contextual tooltips.
- **Enhanced board & list display:** Swimlanes, collapsible lists, WIP limits, column stats, board backgrounds, list separators.
- **Enhanced card display:** Card covers, attachment thumbnails, aging indicators, due date countdowns, priority flags, checklist progress rings, sub-task badges, custom field chips, avatars, story points, and **live agent status badges with actor/intent tooltip**.
- **Modular codebase:** Client-side JavaScript is split into maintainable ES modules.
- **Hardened concurrency model:** Advisory lock files, browser Web Locks API, SDK file locks, final hash validation, adaptive presence heartbeats, and a visual conflict resolution UI with auto-merge fast path.
- **Checksum-verified auto-updates:** SHA-256 verification against a version manifest prevents corrupted downloads.
- **Agent guidance:** Built-in skills teach agents how to use SoloKanban correctly.
- **Explicit UI fallback behaviours:** Label deletion, first-run banner, hash performance, and trash exclusions are fully specified.

### 2.2 Non-Goals

- Cloud sync, multi-user network transport, or CRDT merge semantics.
- Human-in-the-loop approval gating.
- Audit trails, compliance logging, analytics/reporting.
- Multi-agent lock contention or arbitration.
- Hard multi-tenant authorization or access control.
- Operational project tracking (e.g., tracking contract review itself). SoloKanban tracks **improvements to** projects and processes, not the operational workflow.
- Domain-specific operational skills (e.g., contract review, data analysis) — these belong to the user’s own projects.
- **Portable Zip import/export mode** — explicitly rejected; see §20.1 for detailed reasoning.
- **WYSIWYG hybrid editor** — not included; the rendered/raw toggle is sufficient and safer. See §20.2.

---

## 3. Change Log v8.2 → v8.3

| Category | Description & Rationale |
| --- | --- |
| **Added** | **Label deletion fallback behaviour.** When a label is deleted from `labels.json`, any card that still references the deleted label ID will: (1) omit the label chip from the card face; (2) show an “Unknown label” placeholder in the card edit modal so the user can remove or replace it; (3) the placeholder is non-interactive and does not affect the card’s content hash. This removes ambiguity and prevents crashes when a label is deleted while still referenced. |
| **Added** | **First-run banner copy differentiation.** On first visit from a **Chromium-based browser**, show a dismissible banner: “SoloKanban works best in Chromium. You are using a supported browser.” On first visit from a **non-Chromium browser**, show a stronger dismissible banner: “SoloKanban requires a Chromium-based browser (Chrome, Edge, Opera) to access local files. Your files remain editable manually via any text editor (e.g., VS Code, Obsidian).” Both banners are stored in `preferences.json` so they appear only once. |
| **Added** | **Hash performance requirement.** `computeContentHash()` must complete in **under 200ms** for a card with a 50KB Markdown body. This is well within the 800ms auto-save debounce window (§16.1) and prevents UI jank during auto-save. |
| **Added** | **Temp file cleanup on failed update.** After a checksum-mismatched or failed SDK/skill download, the app must delete any temporary file created during the update process. No partial or temporary files may remain in the destination directory. |
| **Added** | **Trash excluded from search index.** The disposable search cache (`search-index.json`) must not include any cards from `.solokanban/trash/`. Trashed project folders are skipped during search index rebuild, matching their exclusion from scans, hash checks, and reconciliation. |
| **Unchanged** | All other v8.2 features remain. |

---

## 4. Operating Assumptions & Architectural Trade-offs

### 4.1 Assumptions

1. **One agent per project, at a time:** The SDK does not implement agent-vs-agent lock queuing. If two agent processes are pointed at the same project simultaneously, behaviour is unspecified but data-safe: the content hash check will still detect stale writes and raise `ConflictException`; no silent corruption occurs. Users may see more conflict dialogs.
2. **Human and agent overlap is the exception:** Concurrent editing is not prevented outright, but is expected to be rare. The system flags overlap via advisory presence and hash checks rather than enforcing blocking locks.
3. **No true cross-platform atomic CAS:** The browser's File System Access API cannot offer atomic create-if-not-exists primitives. The system relies on single-writer atomic full-file *replace* (via temp-file rename or stream replacement). This prevents file truncation and partial reads, but does not eliminate race windows between read and write steps.
4. **Single source of truth for ordering:** Card position lives strictly in array structures inside `project.json` / `workspace.json`. Fallback position hints on cards are rejected to prevent desynchronization.
5. **Presence is advisory:** Presence files inform users and agents that someone is active, but they do not block edits. The actual conflict detection is hash-based.
6. **Lock files are advisory intention signals:** They reduce the likelihood of simultaneous writes but cannot guarantee exclusivity across browser and Python processes.
7. **Convenience over tamper-proof audit:** Plaintext headers favor direct accessibility and manual editability over cryptographic tamper-evidence.
8. **Feature type definitions are workspace-level config:** Changes to feature type definitions affect rendering and editing, but do not retroactively modify existing card files.
9. **Labels and custom field colours are workspace-level config:** Cards store only label IDs or option values; colours are resolved at render time from workspace-level definitions. Deleting a label does not modify existing card files; it only removes the definition and causes the fallback behaviour in §7.2.1.
10. **SDK/skill update policy:** Workspace copies are updated only if missing or version-stale, and only after SHA-256 verification against the manifest. User modifications may be overwritten only if the file’s version is older than the repository version.
11. **UI preferences are workspace-level config:** Display settings are stored in `preferences.json` and do not affect card files or hashes.
12. **Agent skills are documentation, not runtime code:** Skills are Markdown files intended to be read by agents. They have no executable behaviour and cannot corrupt data by themselves.
13. **Browser compatibility is consciously limited:** The app requires Chromium-based browsers (Chrome, Edge, Opera). Non-Chromium users are shown a message recommending a supported browser, along with a note that the files remain manually editable. No fallback mode is implemented.
14. **Trashed projects are inert:** Content in `.solokanban/trash/` is not scanned, not hash-checked, not touched by reconciliation, and not indexed by search. It exists solely for manual restore or deletion.
15. **First-run banner is a UI preference:** The banner state (shown/dismissed) is stored in `preferences.json` under `ui.firstRunBannerDismissed`. It is not part of any card hash.
16. **Hash performance target:** The app assumes `computeContentHash()` is fast enough for auto-save; the 200ms target for 50KB keeps it safely within the 800ms debounce.

### 4.2 Reasoning for Assumptions

- **Why single-agent per project?** SoloKanban targets a single human plus occasional automated agents. Full multi-agent coordination would require CRDTs or a central server, which are out of scope.
- **Why data-safe undefined behaviour?** The content hash check already protects against corruption; clarifying this reduces fear and is accurate.
- **Why hash-based conflict detection?** It is deterministic, works across platforms, and can be computed without coordination. It catches all cases where two writers used different base versions, even if locks failed.
- **Why checksum verification for updates?** Network fetches can fail or deliver truncated files. Verifying a SHA-256 hash before replacing local files ensures that an interrupted update never corrupts the workspace.
- **Why trashed projects are inert?** Trash is a safety net, not an active workspace area. Excluding it from scans, reconciliation, and search prevents accidental resurrection or conflict processing of deleted data.
- **Why explicit fallback behaviours?** Ambiguity in edge cases leads to inconsistent implementations and bugs. Specifying label deletion and banner copy removes guesswork and ensures tests can be written against a stable spec.

---

## 5. Architecture Overview

```
BROWSER CLIENT (GitHub Pages, zero build)
  |
  | File System Access API
  v
LOCAL WORKSPACE DIRECTORY
  |
  |-- workspace.json                 (workspace board config)
  |-- .solokanban/
  |     |-- fields.json              (custom field definitions)
  |     |-- feature-types.json       (feature type templates)
  |     |-- labels.json              (label definitions)
  |     |-- preferences.json         (UI/display settings)
  |     |-- agents.json              (display settings)
  |     |-- search-index.json        (disposable cache; excludes trash)
  |     |-- sdk/
  |     |     |-- solokanban.py
  |     |     `-- solokanban.js
  |     |-- skills/
  |     |     |-- solokanban-overview.md
  |     |     `-- solokanban-sdk.md
  |     |-- locks/                   (advisory lock files)
  |     |-- presence/                (per-actor presence)
  |     |-- trash/                   (inert soft-deleted projects)
  |     `-- quarantine/              (unparseable cards)
  |
  |-- attachments/
  |-- projects/
  |     `-- PROJ-0001.md             (project card)
  |
  `-- CON_REV/                       (project directory)
        |-- project.json             (project board config + layout)
        |-- features/
        |     `-- CON_REV-0001.md
        `-- wiki/
```

**Note:** `layout.json` is no longer part of the directory tree. Divider layout is stored inside `project.json` under the `layout` key.

---

## 6. Concurrency Model & Data Integrity

### 6.1 Safety Guarantees

The system relies on **Optimistic Single-Agent Consistency with Conflict Visibility**:

- **Single-Agent Safety:** Guaranteed safe. Sequential operations within a single agent context cannot self-conflict. SDK auto-retries handle rapid `project.json` reorders.
- **Human/Agent Overlap:** Protected via optimistic checks (revision counter + `contentHash`). If a human and an agent modify a card in the same time window, the second writer detects a stale revision and triggers a conflict handler.
- **Multi-Agent Overlap:** Unsupported but **data-safe**. If two agents edit the same project concurrently, the content hash check will detect stale writes and raise `ConflictException`. Users may see more conflicts, but silent corruption is prevented.

#### Advisory Lock Layer

- Lock files under `/.solokanban/locks/` are **advisory only**. They record the intent to edit but do not provide hard mutual exclusion.
- The browser uses the **Web Locks API** internally for its own tabs.
- The Python SDK uses **`flock`** or **`LockFileEx`** for process-level locking.
- Cross-process coordination is best-effort via lock files; final integrity is guaranteed by the content hash check.

### 6.2 Per-Actor Presence Signaling

Presence files are stored in per-actor subdirectories:

```
/.solokanban/presence/<FEATURE_ID>/<ACTOR_ID>.json
```

Example:

```json
{
  "cardId": "CON_REV-0001",
  "actor": "agent:claude-code-v1",
  "actorType": "agent",
  "intent": "editing",
  "startedAt": "2026-08-23T10:00:00Z",
  "heartbeatAt": "2026-08-23T10:04:30Z"
}
```

#### Adaptive Heartbeat Policy

- **Human Webapp:**
  - While the user is actively typing or interacting: heartbeat every **15 seconds**, TTL **30 seconds**.
  - After **30 seconds of no input activity**, heartbeat interval becomes **60 seconds**, TTL becomes **120 seconds**.
  - Activity resets the interval back to 15s/30s.
- **Agent SDK:**
  - While an `edit_session` context manager is active, heartbeat every **15 seconds**, TTL **30 seconds**, regardless of UI activity.

- Cleanup occurs on `end_edit()` or modal close.
- **Webapp Behavior:** Scans the presence folder when a card modal is opened. Displays a warning if an active agent presence exists.
- **SDK Behavior:** `begin_edit()` writes its own per-actor file; `edit_session` context managers handle cleanup and automatic heartbeats.

#### Why adaptive heartbeats?

- A static 15s heartbeat causes constant disk writes even when idle, wasting I/O and battery.
- Activity-based throttling reduces writes during idle periods while preserving rapid stale detection during active editing.
- The idle 60s/120s pairing provides a 2x safety margin, matching the active state’s 15s/30s ratio, to avoid false stale presence from delayed writes.

### 6.3 Canonical Content Hashing

`meta.contentHash` is computed deterministically across all platforms:

1. Normalize all line endings in Markdown body to `\n`. Strip trailing whitespace.
2. Sort YAML frontmatter keys lexicographically. Exclude `meta.revision`, `meta.contentHash`, `meta.updatedAt`, and `meta.updatedBy`.
3. Compute SHA-256 over:  
   `H = SHA-256(canonicalYaml(frontmatter) + "\n---\n" + normalizedBody)`

The card body includes all section headers (including feature-type-defined sections and `## Activity Log`). Changing a feature type definition does not alter card content and therefore does not change the hash.

**Performance requirement:** For a card with a 50KB Markdown body, `computeContentHash()` must complete in under **200ms** on typical hardware. This keeps auto-save responsive within the 800ms debounce window.

### 6.4 Move Operation & Partial Failure Reconciliation

Card moves touch two files sequentially: `project.json` (order arrays) then the card file (`listId` & Activity Log).

- **Authoritative Rule:** Card frontmatter `listId` is authoritative for list assignment; `featureOrder` in `project.json` is authoritative for list positioning.
- If a move updates `project.json` but the subsequent card write fails, the SDK attempts an immediate compensating rollback: remove the card ID from the new list array and restore it to the original list array in `project.json`, then log a warning in the card’s Activity Log.
- **If rollback also fails**, the workspace scan on next reload reconciles as follows:
  1. `featureOrder` in `project.json` is treated as the source of truth for list membership.
  2. For each card ID, if it appears in multiple lists, the **first list in the list order** wins; the card is removed from all other lists.
  3. If a card ID is missing from all lists, it is appended to the **backlog** list.
  4. After determining the correct list, the card file’s `listId` is updated to match.
  5. `meta.deliveredAt` is set if the final list is marked `done: true`, otherwise removed.
  6. The card file is written with a new revision and hash.

**Rationale:** This eliminates ambiguity about which file wins after a catastrophic failure and ensures the board never remains in a corrupt state. Trashed project folders are excluded from this reconciliation pass.

### 6.5 Visual Conflict Resolution UI

When a `ConflictException` occurs during a card write, the app opens a Merge Modal.

#### 6.5.1 Auto-Merge Fast Path

Before showing the modal, the app compares the conflicting changes:

- If the local and incoming edits touch **disjoint body sections** (e.g., local changed `## Description`, incoming changed `## Validation`), the app automatically merges both changes and saves without user intervention.
- If any body section was edited by **both** writers, or frontmatter conflicts exist, the Merge Modal is shown.
- The auto-merge rule does **not** apply to frontmatter conflicts; whole-block choice is always required for frontmatter.
- **Presence does not suppress auto-merge.** Presence badges are advisory; auto-merge applies solely based on disjoint body sections, regardless of whether an agent has an active presence file. If an active agent later saves overlapping changes, a standard `ConflictException` occurs and the Merge Modal appears at that time.

#### 6.5.2 Frontmatter Conflict Handling

- Local and incoming YAML frontmatter are displayed as a raw text diff.
- The user must choose **Keep Local Frontmatter** or **Accept Incoming Frontmatter** as a whole block.
- This prevents partial YAML merges that could introduce syntax or indentation corruption.

#### 6.5.3 Body Section Conflict Handling

- Markdown body sections (excluding Activity Log) are diffed individually.
- For each conflicting section, the user chooses **Keep Local**, **Accept Incoming**, or manually edits.
- Global overrides: **Keep All Local** or **Accept All Incoming**.
- The `## Activity Log` section is merged chronologically and always placed at the end.

#### 6.5.4 Merge Execution

- After resolution, the app canonicalizes the merged YAML and Markdown body.
- `meta.revision` is incremented.
- `meta.contentHash` is recomputed.
- The merged card is written using the standard atomic-write procedure.

**Rationale:** The auto-merge fast path reduces conflict fatigue for disjoint edits, while the modal provides full control for overlapping changes. Presence is advisory and does not interfere with conflict resolution.

---

## 7. Feature Types, Labels, and Card Body Structure

### 7.1 Feature Type System

Feature types are defined in `/.solokanban/feature-types.json`. Each type defines:

- `id`, `name`, `description`, `color`
- `frontmatterFields` — array of field definitions with `key`, `label`, `type`, `options`, `required`, `default`, `cardVisible`
- `bodySections` — ordered array of sections with `id`, `label`, `type` (`markdown` or `checklist`), `required`, `placeholder`, `description`

The seven default types (six improvement types + `project`) are specified exactly as in v8.2.

#### Why feature types?

- They allow the board to adapt to different improvement workflows without hardcoding fields.
- They keep the card body structured, enabling both humans and agents to know what to expect in each section.
- The tooltip descriptions help new users understand each section.

### 7.2 Workspace-Level Labels

Labels are stored in `/.solokanban/labels.json` with `id`, `name`, and `color`. Cards reference labels by ID:

```yaml
labels: ["lbl-legal", "lbl-core"]
```

#### Why workspace-level labels?

- Consistency: a label has the same colour everywhere.
- Efficiency: changing a label’s colour updates all cards automatically.
- Simplicity: cards stay small and avoid duplicating colour metadata.

#### 7.2.1 Label Deletion Fallback

When a label is deleted from `labels.json`:

- Any card that still references the deleted label ID will **omit** that label chip from the card face during rendering.
- In the card edit modal, the label field will show an **“Unknown label (deleted)”** placeholder next to the field, allowing the user to remove the stale reference.
- The placeholder is visual only and does **not** change the card’s stored frontmatter or content hash.
- The card remains fully editable and will not throw an error.

**Rationale:** Labels are workspace-level definitions; cards only store IDs. Deleting a definition must not break existing cards. The fallback ensures graceful degradation and gives the user a clear indication to clean up stale references.

### 7.3 Custom Fields

Custom fields live in `/.solokanban/fields.json`. They support:

- `cardVisible` to show on the card face
- Option-level colours for select/multiselect fields
- Types: `text` (Free Text), `select` (Single Choice), `multiselect` (Multiple Choice)

#### Why custom fields?

- They allow users to capture project-specific information without modifying the core card schema.
- `cardVisible` ensures only the most important fields clutter the card face.

---

## 8. Dual-Level Board Navigation

### 8.1 Workspace Board

- Shows **project cards** stored in `/projects/`.
- Lists are defined in `workspace.json`.
- Clicking a project card opens its edit modal. Inside the modal, a button navigates to the project board.

### 8.2 Project Board

- Shows feature cards (all types except `project`).
- Breadcrumb: **Workspace / ProjectName** with back button.
- Feature cards open the edit modal when clicked.

#### Why dual-level?

- It separates high-level project tracking from fine-grained feature work.
- It matches the user’s stated use case: track improvements to multiple projects/agents.

---

## 9. Board & List Enhancements

These are visual and interaction improvements from v8.2. They do not alter the underlying data model except as noted.

### 9.1 Swimlanes

Group cards horizontally by assignee, label, feature type, or priority.

**Rationale:** Swimlanes help visualise workload distribution across people or categories. The grouping attribute is stored in `preferences.json` and is purely a view transformation.

### 9.2 Collapsible Lists

Lists can collapse to a narrow strip to save horizontal space. Collapsed state stored in `preferences.json`.

**Rationale:** Boards with many lists become unwieldy; collapse lets users hide less important columns.

### 9.3 List WIP Limits Display

If a list has a `wipLimit`, the header shows `current/limit` and turns amber/red when nearing/exceeding the limit.

**Rationale:** Makes WIP limits visible without opening settings. No data model change.

### 9.4 Column Totals & Quick Stats

Headers can display total cards, completed checklist items, sum of story points, or count of high-priority cards.

**Rationale:** Quick progress at a glance. Stats are client-side and customisable.

### 9.5 Board Backgrounds & Colours

Users can set a background colour or image. Stored in `preferences.json`.

**Rationale:** Personalisation and workspace distinction. Does not affect card hashes.

### 9.6 List Separators / Dividers

Non-draggable visual separators within a list.

**Rationale:** Logical grouping without creating new columns.

**Placement:** Dividers are stored **only** in `project.json` under the `layout` key. `layout.json` is deprecated and ignored. This keeps `featureOrder` a clean `string[]` and provides a single source of truth.

---

## 10. Card Display Enhancements

These are visual elements shown on the card face, from v8.2.

### 10.1 Card Covers

A cover image or coloured banner at the top of a card. Stored as a new optional frontmatter field `cover`.

**Rationale:** Visual distinctiveness. The field is part of card content and included in the hash.

### 10.2 Attachment Thumbnails

Small icons for attachments (PDF, image, link) on the card face.

**Rationale:** Indicates file presence at a glance. Uses existing attachment metadata.

### 10.3 Card Aging Indicators

Subtle yellow/orange tint or “stale” badge if card not updated for X days.

**Rationale:** Helps spot neglected items. Threshold configurable in `preferences.json`. No hash impact.

### 10.4 Due Date Countdown

Relative countdown like “in 3 days” or “overdue by 2 days”.

**Rationale:** Easier to parse than absolute dates.

**Visual hierarchy rule:** If a card is both stale and overdue, the **overdue indicator takes visual precedence** (e.g., overdue red badge hides the stale tint). This prevents competing attention signals.

### 10.5 Priority Icon or Flag

Priority/severity displayed as a coloured flag icon.

**Rationale:** Icons are faster to recognise than text. Uses existing field.

### 10.6 Checklist Progress Ring

Small circular progress ring for first checklist section (top-level items only).

**Rationale:** Compact and visually appealing (Todoist style). Purely presentational.

### 10.7 Sub-task Count Badge

Badge showing aggregate sub-item completion, e.g., `3/7`.

**Rationale:** Quickly conveys depth of work. Computed from checklist data.

### 10.8 Card Badges for Attachments, Comments, Checklists

Small icon badges with counts.

**Rationale:** Trello-style summary. Clicking opens relevant section.

### 10.9 Custom Field Chips with Colour

Custom field values rendered as coloured chips.

**Rationale:** Visual appeal and scanability. Uses existing option colours.

### 10.10 Avatar / Owner Indicator

Small avatar or initials for owner/assignee; presence avatars for active editors.

**Rationale:** Quick visual responsibility. Uses existing fields.

### 10.11 Story Points / Effort Badge

Numeric badge (e.g., `5` or `3 pts`) if a numeric field like `storyPoints` exists.

**Rationale:** Effort estimate at a glance. Uses custom fields.

### 10.12 Live Agent Status Badges

If an active presence file exists for a card, the card face displays a small pulsing indicator (e.g., green dot).

**Tooltip:** Hovering the badge shows `actor` and `intent` from the presence JSON (e.g., `agent:claude-code-v1 — editing`).

**Rationale:** Gives users actionable information about who is active and what they are doing, not just a generic warning.

**Implementation:** During board render, scan presence directory once; build set of active card IDs; render badge with tooltip.

---

## 11. Status-Change & Activity Logging

*(Unchanged from v8.2.)*

- `## Activity Log` is terminal.
- Auto-recreation and relocation rules apply.
- `meta.deliveredAt` set when moved to Done; removed when moved out.

---

## 12. Data Model & Directory Layout

### 12.1 Directory Tree

```
/My Workspace/
├── workspace.json
├── .solokanban/
│   ├── fields.json
│   ├── feature-types.json
│   ├── labels.json
│   ├── preferences.json
│   ├── agents.json
│   ├── search-index.json          (excludes trash)
│   ├── sdk/
│   │   ├── solokanban.py
│   │   └── solokanban.js
│   ├── skills/
│   │   ├── solokanban-overview.md
│   │   └── solokanban-sdk.md
│   ├── locks/
│   ├── presence/
│   ├── trash/                     (inert soft-deleted projects)
│   └── quarantine/                (unparseable cards)
├── attachments/
├── projects/
│   └── PROJ-0001.md
└── CON_REV/
    ├── project.json               (includes layout)
    ├── features/
    │   └── CON_REV-0001.md
    └── wiki/
```

### 12.2 `project.json` Schema

```json
{
  "id": "CON_REV",
  "lists": [
    { "id": "backlog", "name": "Backlog" },
    { "id": "in-progress", "name": "In Progress" },
    { "id": "done", "name": "Done", "done": true }
  ],
  "featureOrder": {
    "backlog": ["CON_REV-0001"],
    "in-progress": [],
    "done": []
  },
  "layout": {
    "dividers": [
      { "id": "div-1", "listId": "backlog", "afterCardId": "CON_REV-0001" }
    ]
  }
}
```

**Key point:** `featureOrder` remains a clean `string[]`. Dividers live under `layout`. `layout.json` is deprecated and ignored. If an old `layout.json` exists, its contents should be migrated into `project.json.layout` automatically on workspace open.

### 12.3 `preferences.json` Schema

```json
{
  "board": {
    "background": "#f5f6fa",
    "swimlaneBy": null,
    "collapsedLists": [],
    "columnStats": ["count"]
  },
  "card": {
    "staleAfterDays": 7,
    "showStoryPoints": true,
    "showAvatar": true,
    "showSubtaskBadge": true,
    "showAgentBadge": true
  },
  "ui": {
    "darkMode": false,
    "firstRunBannerDismissed": false
  }
}
```

### 12.4 Agent Skills

*(Unchanged from v8.2. Skills are agent-facing documentation, auto-updated with checksum verification.)*

---

## 13. Agent SDK Specification

*(Unchanged from v8.2 except SDK methods ignore `layout` and never touch `project.json.layout`.)*

The SDK treats `featureOrder` as `string[]` and **does not parse or modify `layout`**. Dividers are managed only by the webapp.

---

## 14. SDK & Skills Auto-Update

### 14.1 Checksum Verification Process

1. Fetch `version.json` from the repository.
2. For each SDK/skill file:
   - Compare local version (from file header) with manifest version.
   - If local is missing or older, download the new file into an in-memory buffer.
   - Compute SHA-256 hash of the downloaded content.
   - Compare with the `sha256` field in the manifest.
   - If hashes match, write to a temporary file, then replace the old file (best-effort atomic rename).
   - If hashes do not match, discard the download, **delete any temporary file**, and log a warning; existing file remains untouched.
3. User-created skill files are never overwritten.

### 14.2 Trust Model

SHA-256 verification proves that the downloaded file matches what was listed in `version.json` on GitHub Pages. It does **not** prove that the manifest or the files were not tampered with at the repository level. Users who require supply-chain security should:

- Use a pinned GitHub repository and verify commits.
- Optionally disable auto-update and manually review files.

This is a transport integrity check, not a provenance guarantee.

---

## 15. Modular Code Architecture

```
/js/
├── main.js
├── state.js
├── db.js
├── yaml.js
├── hash.js
├── filesystem.js
├── locks.js
├── workspace.js
├── defaults.js
├── board.js
├── card-render.js
├── dragdrop.js
├── card-modal.js
├── checklist.js
├── markdown.js
├── settings.js
├── sdk-update.js
└── preferences.js
```

---

## 16. User Interaction & Auto-Save UX

### 16.1 Card Modal Behavior

- Open by clicking a card.
- Close via Esc, clicking outside, or × button.
- Auto-save after 800ms debounce.
- Title always editable; project ID immutable.

### 16.2 Markdown Editing

- Rendered view by default.
- Click to edit raw Markdown.
- Blur returns to rendered view and saves.
- Tooltips on headings with descriptions.

### 16.3 Conflict Resolution UI

As described in §6.5. Auto-merge fast path applies when edits touch disjoint sections; otherwise Merge Modal. Presence badges do not suppress auto-merge.

### 16.4 Checklists

- Empty checklists show “Add an item” button.
- Progress bar counts only top-level items.
- Sub-items collapsed by default with expand/collapse and `0/2` sub-progress.
- Inline adding with Enter-to-save and auto-focus new input.

---

## 17. Settings Modal

Tabs: Labels, Custom Fields, Feature Types, Projects, Preferences.

### 17.1 Projects Tab with Soft-Delete

- Deleting a project moves its folder to `/.solokanban/trash/<projectId>_<timestamp>/` instead of immediate deletion.
- The project card file is removed from `/projects/` and the project entry removed from `workspace.json`.
- Trash is **inert**: trashed project folders are not scanned by the workspace scan, not hash-checked, not touched by the reconciliation pass in §6.4, and **not indexed by search-index.json**. They exist only for manual restore or deletion.
- The trash folder is not shown in the normal UI. Users can manually restore or delete from the filesystem.
- Automatic purge after 30 days is **planned but not yet implemented**.

**Rationale:** Project deletion is the highest-consequence action; soft-delete prevents accidental irreversible data loss. Keeping trash inert avoids any interaction with concurrency, reconciliation, or search.

### 17.2 Preferences Tab

Includes board background, swimlane default, column stats, stale threshold, dark mode toggle, and live agent badges toggle. The first-run banner dismissal state is stored here automatically.

---

## 18. Core Functional Specification

- **Workspace board & project board** rendered dynamically.
- **Label and custom field colours** resolved from workspace definitions.
- **Card face displays** title, ID, labels, type, due date, countdown, priority flag, story points, custom fields, avatars, progress ring, sub-task badge, attachment/comment/checklist badges, and live agent badges with tooltip. Empty fields omitted.
- **Board displays** swimlanes, collapsible lists, WIP limits, column stats, backgrounds, dividers (from `project.json.layout`).
- **Due date logic** unchanged; overdue takes precedence over stale.
- **Progress calculation** unchanged.
- **Workspace creation** initialises full structure including `preferences.json`, SDK files, skills, `trash/`, `locks/`, `presence/`, `quarantine/`.
- **Search cache** disposable and **excludes trash**.
- **Browser support** Chromium required; first-run banner differentiates Chromium vs non-Chromium; non-Chromium users see manual-editing note.
- **Type fallback** unchanged.
- **Conflict resolution** visual merge UI with auto-merge fast path.
- **Auto-update** checksum-verified; temp files cleaned up on failure.
- **Trust model** documented.
- **Reconciliation** deterministic on scan; trashed projects excluded.
- **Presence** adaptive heartbeats; badges tooltip shows actor/intent.
- **Label deletion** graceful fallback with unknown label placeholder.
- **Hash performance** ≤200ms for 50KB body.

---

## 19. Summary of Changes v8.2 → v8.3

- Label deletion fallback behaviour explicitly defined.
- First-run banner copy differentiated for Chromium and non-Chromium.
- Hash performance requirement (200ms for 50KB) added.
- Temp file cleanup on failed SDK/skill update added.
- Trash excluded from search index explicitly.
- All other v8.2 features remain.

---

## 20. Explicit Non-Inclusion of Portable Zip Mode and WYSIWYG Shortcut

### 20.1 Portable Zip Import/Export Mode

**Decision:** Not included.

**Reasoning against:**  
The File System Access API is the core enabler of the seamless local-first experience. A Zip fallback would require manual export/import steps, break the “live files” model, and double the testing surface. Non-Chromium users receive a clear message that the files remain editable manually (e.g., via VS Code, Obsidian, or any text editor) even if the webapp cannot access them directly. A proactive first-run banner informs all users of the Chromium requirement before they invest time.

### 20.2 WYSIWYG Hybrid Editor with `Ctrl/Cmd+E`

**Decision:** Not included.

**Reasoning against:**  
The rendered/raw toggle already provides formatted display and raw editing. A WYSIWYG editor would require a perfect Markdown round-trip serializer, risking hash corruption. The complexity and risk do not justify the benefit at this stage.

---

This PRD is self-contained and defines the complete SoloKanban v8.3 system. It supersedes all previous versions and requires no external references to understand or implement the specified behaviour.