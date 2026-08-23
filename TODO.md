# SoloKanban Project TODO & Backlog

This document tracks completed features, active tasks, and upcoming enhancements for **SoloKanban v8.3+**. Items use nested Markdown checkboxes for progress tracking.

---

## 🎯 High Priority & Active Backlog

- [ ] **1. Project Creation & Workspace Management**
  - [ ] **1.1 Custom Project ID on Creation**
    - [ ] Allow user to explicitly define the project ID (in ALL-CAPS, e.g. `AUTH`, `BILLING`, `CORE`) when creating a new project card
    - [ ] Auto-uppercase input, validate unique alphanumeric format, and use as directory prefix for project cards (`<PROJ_ID>/project.json`, `<PROJ_ID>/features/<PROJ_ID>-001.md`)
  - [ ] **1.2 Trash Management UI (Settings > Projects)**
    - [ ] List soft-deleted projects from `.solokanban/trash/`
    - [ ] "Restore Project" action to move trashed project directory back to workspace root
    - [ ] "Permanently Delete" action to purge trashed project directory with confirmation
  - [ ] **1.3 Project Soft-Delete Feedback**
    - [ ] Display confirmation notification showing destination trash folder path (`.solokanban/trash/<id>_<timestamp>`)

- [ ] **2. Modular Section-by-Section Card Modal Architecture (Click-to-Edit)**
  - [ ] **2.1 Isolated Section Headings Outside Markdown**
    - [ ] Render section headings (e.g., `Feature Specification`, `Architecture & Technical Details`, `Acceptance Criteria`) outside and above the markdown content box
  - [ ] **2.2 Click-to-Edit Markdown Boxes**
    - [ ] Display rendered markdown by default in each section box
    - [ ] Show context-aware default placeholder text when empty (e.g., *"Describe the desired capability"* for Feature Specification)
    - [ ] Clicking into any section box transitions it in-place to an editable textarea with autofocus
    - [ ] Blurring or pressing `Esc` / clicking outside switches the box back to formatted rendered markdown and triggers auto-save
    - [ ] Independent section editing without toggling the entire card modal into raw markdown mode

- [ ] **3. Card Face Layout & Visual Enhancements (Kanban Mode)**
  - [ ] **3.1 Strict 3-Row Card Face Hierarchy**
    - [ ] **Top Row (Row 1):** Card Title (prominent, readable)
    - [ ] **Second Row (Row 2):** Feature Type pill / badge
    - [ ] **Third Row (Row 3):** Labels chips + Feature ID code (e.g. `PROJ-001`)
    - [ ] **Fourth Row / Footer:** Quick-complete circle, priority, due countdown, checklist progress ring, points, attachment badges, live agent badge
  - [ ] **3.2 Attachment Type Thumbnails (PRD §10.2)**
    - [ ] Inspect file extensions in `frontmatter.attachments`
    - [ ] Render file-type specific badge chips (`📄 PDF`, `🖼️ IMG`, `🔗 LINK`, `📎 FILE`) on card face
  - [ ] **3.3 Search Query Match Highlighting**
    - [ ] Highlight matched query text in card titles and descriptions using `<mark class="search-highlight">`
  - [ ] **3.4 Combined Stale + Overdue Indicator**
    - [ ] Show subtle clock icon within the overdue badge when a card is both stale and overdue

- [ ] **4. Card Modal Experience Polish**
  - [ ] **4.1 Date Picker with "Today" Quick Button**
    - [ ] Date input with calendar picker and inline "Today" shortcut button that auto-fills current local date (`YYYY-MM-DD`)
  - [ ] **4.2 Remove Redundant Top Quick Actions Toolbar**
    - [ ] Remove `.modal-quick-actions-bar` from above the card body since the property grid sidebar already provides direct, non-redundant controls for labels, priority, date, assignee, and checklist
  - [ ] **4.3 Activity Log Visual Timeline**
    - [ ] Render `## Activity Log` section with formatted timestamp badges and actor avatars in modal view

- [ ] **5. Board Display & Customization (PRD §9.4)**
  - [ ] **5.1 Customizable Column Stats**
    - [ ] Read `preferences.board.columnStats` (`'count'`, `'points'`, `'checklist'`, `'priority'`)
    - [ ] Dynamically render configured metric chips in column headers
  - [ ] **5.2 List View Drag-and-Drop**
    - [ ] Add drag-handle or direct row dragging in Asana-style List View

- [ ] **6. SDK & Performance Resilience**
  - [ ] **6.1 SDK Update Network Resilience**
    - [ ] Add exponential backoff retry logic (up to 3 retries) on manifest and asset fetch failures in `sdk-update.js`

---

## 🧪 Testing & Verification Backlog

- [ ] **5. Automated Testing Extensions**
  - [ ] Add Playwright E2E test for Settings > Lists & WIP Limits persistence
  - [ ] Add Playwright E2E test for List View column move dropdown
  - [ ] Add unit test for `FileSystemAdapter.cleanupTempFiles` string path resolution
- [ ] **6. Live GitHub Pages Deployment**
  - [ ] Push latest changes to `main`
  - [ ] Run remote Playwright test suite against `https://philip-bowrey.github.io/soloKanban/`

---

## ✅ Recently Completed Tasks

- [x] **Core PRD & Architecture**
  - [x] IndexedDB persistent folder handle storage & restoration across browser refreshes
  - [x] PRD §16.4 interactive task checkboxes (`- [ ]` / `- [x]`) and inline item addition
  - [x] Complete PRD traceability audit (88/88 features mapped and verified in matrix)
  - [x] Disjoint auto-merge fast path with canonical section ordering and `baseCard` tracking
  - [x] Complete soft-delete moving project folder to `.solokanban/trash/` and cleaning `featureOrder`
  - [x] Swimlane group assignment bug fix
  - [x] Active agent presence badge and modal warnings

- [x] **Trello & Asana Inspired UI Enhancements**
  - [x] Quick-complete check circle on card faces and list view rows
  - [x] Trello-style card face summary badges (description `≡`, attachments `📎 N`)
  - [x] Card modal top Quick Actions toolbar (`🏷️ Labels`, `⚡ Priority`, `📅 Due Date`, `👤 Assignee`, `☑️ Checklist`)
  - [x] Smooth scroll into view on Quick Action button clicks
  - [x] Linear checklist progress bar (`0%` to `100%`) with dynamic animated fill
  - [x] Asana-style structured property grid in modal sidebar
  - [x] Column header emojis (`📥`, `💡`, `⚡`, `✅`, `🔍`, `🗣️`, `🛑`) and count pills
  - [x] Dual-mode view switcher (`📋 Board` vs `📝 List`)
  - [x] List View column move dropdown selector
  - [x] Global `⌘K` / `Ctrl+K` search focus shortcut

- [x] **Settings, Safety & Conflict Resolution**
  - [x] Granular visual merge conflict modal with side-by-side section diffs and YAML frontmatter diff
  - [x] Chronological activity log merging and deduplication
  - [x] Settings modal "Lists & WIP Limits" tab with persistence
  - [x] Add List and Delete List buttons in Settings
  - [x] Safety confirmation dialogs for deleting labels, fields, types, and lists
  - [x] Preferences "Reset to Defaults" button
  - [x] `FileSystemAdapter.cleanupTempFiles()` support for relative string paths
  - [x] Markdown ordered list (`<ol>`) rendering support alongside unordered (`<ul>`)
  - [x] Collapsed column hover styling and cursor feedback
