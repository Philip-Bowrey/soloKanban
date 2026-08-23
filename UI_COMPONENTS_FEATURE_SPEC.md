# SoloKanban — Modern UI Features, Functionality & Component Specification
*Inspired by Trello & Asana for a Local-First, Agent-Native Workflow*

---

## Executive Summary

This specification synthesizes the most effective UI/UX design patterns from **Trello** (board density, visual badges, checklist progress bars, quick-action headers) and **Asana** (side-sheet details, key-value property grids, quick-complete checkboxes, subtask management), tailored specifically for **SoloKanban’s zero-backend, markdown-first architecture**.

---

## 1. High-Level Visual & Layout Architecture

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ TOP GLOBAL NAV BAR (Brand, Workspace/Project Breadcrumb, Live Search, View Switcher, + New, Settings) │
├──────────────────────────┬──────────────────────────────────────────────┬──────────────────────────────┤
│ COLLAPSIBLE SIDEBAR      │ KANBAN BOARD CANVAS                          │ SLIDE-OVER DETAIL PANE       │
│ • Starred Projects       │ ┌──────────────┐ ┌──────────────┐ ┌────────┐ │ (Alternative to modal)       │
│ • Improvement Workspaces │ │ 📥 Backlog 3 │ │ ⚡ In Progress│ │ ✅ Done│ │ • Header & Completion Button  │
│ • Agent Presence Hub     │ ├──────────────┤ ├──────────────┤ ├────────┤ │ • Key-Value Metadata Grid    │
│ • Trash / Quarantine     │ │ [Card 1]     │ │ [Card 3]     │ │ [Card5]│ │ • Rich Section Headers      │
│                          │ │ [Card 2]     │ │ [Card 4]     │ └────────┘ │ • Interactive Checklists     │
│                          │ └──────────────┘ └──────────────┘            │ • Chronological Activity Log │
└──────────────────────────┴──────────────────────────────────────────────┴──────────────────────────────┘
```

---

## 2. Component-by-Component Specification

### A. Board Canvas & Column Components (Trello + Asana Hybrid)

| UI Component | Description & Functionality | Asana / Trello Inspiration | Local-First / Agent Adaptation |
|---|---|---|---|
| **1. List Header with Icon & Counter Pill** | Column headers support an emoji/icon (e.g. `💡 Ideas 7`, `⚡ Active 3`), dynamic count pill, and WIP limit indicators. | Asana & Trello column headers with item counts and emojis. | Backed by `project.json.lists[i].name` / `.wipLimit`. |
| **2. Column Action Menu (`•••`)** | Dropdown on column header: *Collapse list*, *Sort by (Priority, Due Date, Points)*, *Set WIP limit*, *Add Card*, *Move all cards*. | Trello column context menu. | Pure front-end sorting and preference persistence. |
| **3. Bottom Inline "+ Add a card" Composer** | Clicking "+ Add a card" at the bottom of any column opens an immediate inline text input with `Enter` to create and `Esc` to cancel. | Trello's sticky bottom list card composer. | Creates `.md` file in background with default template without interrupting board flow. |
| **4. Quick-Complete Check Circle on Card Face** | Hovering or clicking a subtle radio/checkbox circle on the card face marks the item complete (moves to Done column with one click). | Asana task cards with circular check button on left. | Updates card `listId: done` and sets `meta.deliveredAt` timestamp. |
| **5. Card Badge Summary Bar** | Bottom row of card face displaying badge chips: `📎 Attachments (count)`, `💬 Activity/Comments (count)`, `☑️ Checklist (0/3)`, `≡ Description presence`. | Trello card face badge indicators. | Extracted live from YAML frontmatter and checklist markdown. |
| **6. Visual Checklist Progress Ring / Bar** | Displays either a circular ring or micro progress bar indicating top-level checklist completion (`50%` or `2/4`). | Asana & Trello checklist counters. | Computed dynamically via `calculateProgress()` in `checklist.js`. |
| **7. Live Agent Pulse Badge with Tooltip** | Glowing pulse dot indicating an active AI agent working on the card, with rich tooltip (`agent:claude-code — refining tests`). | Agent-native enhancement. | Backed by `.solokanban/presence/<CARD_ID>/<ACTOR_ID>.json`. |

---

### B. Card Detail Experience (Modal & Slide-Over Panel)

| UI Component | Description & Functionality | Asana / Trello Inspiration | Local-First / Agent Adaptation |
|---|---|---|---|
| **1. Quick Action Button Toolbar** | Prominent toolbar directly beneath the title: `+ Add`, `🏷️ Labels`, `🕒 Dates`, `☑️ Checklist`, `👤 Assignee`, `⚡ Custom Fields`. | Trello card header quick-action bar. | Clicking any button opens a focused popover to add or modify that specific metadata field. |
| **2. Property Grid (Key-Value Metadata)** | Structured 2-column property table: `Assignee`, `Due Date`, `Priority`, `Feature Type`, `Story Points`, `Custom Fields`. | Asana task detail pane property rows. | Reads/writes YAML frontmatter directly; automatically applies workspace-defined options. |
| **3. Checklist Section with Visual Progress Bar** | Section title, `Hide completed items` toggle, `Delete checklist` button, and full-width **linear percentage progress bar** (e.g. `50%` blue fill). | Trello checklist component with progress bar. | Real-time calculation from `- [ ]` / `- [x]` markdown lines. |
| **4. Inline Subtask Adder with Keyboard Flow** | "+ Add an item..." input row at bottom of checklist; pressing `Enter` adds the item, commits to markdown, and keeps cursor focused for the next item. | Asana & Trello checklist creation flow. | Inserts `- [ ] <item>` into the card body and schedules debounced auto-save. |
| **5. Dual-View Mode Switcher (Modal vs Slide-Over)** | Toggle between **Center Modal** (focused inspection) and **Right-Side Slide-Over Panel** (browse board and inspect cards simultaneously). | Asana slide-over pane vs Trello centered modal. | User preference saved in `preferences.json.ui.detailViewMode`. |
| **6. Chronological Activity & Comment Stream** | Dedicated feed displaying human and agent activity entries (`[2026-08-23T11:45Z] Agent updated acceptance criteria`) with comment input. | Trello comments & activity sidebar. | Merged with `## Activity Log` section in markdown body. |

---

### C. Workspace & Project Navigation (Asana-Style)

| UI Component | Description & Functionality | Asana / Trello Inspiration | Local-First / Agent Adaptation |
|---|---|---|---|
| **1. Collapsible Workspace Sidebar** | Left-hand navigation tree showing *Starred Projects*, *Active Projects*, *Recent Boards*, *Presence Live Hub*, and *Settings*. | Asana left-hand navigation sidebar. | Scans `/projects/*.md` and workspace structure. |
| **2. Board / List View Tab Switcher** | Tab bar in the project header: `📋 Board`, `📝 List View`, `📊 Overview / Stats`. | Asana top project view tabs. | Renders existing data as Kanban columns or compact tabular checklist. |
| **3. Global Command Palette / Live Filter (`Cmd/Ctrl+K`)** | Floating search overlay with keyboard navigation, filtering by project, card title, assignee, or label. | Asana `Cmd+K` global search & Trello quick find. | Queries in-memory `SoloDb` and `search-index.json`. |
| **4. Filter & Group Bar** | Header dropdown controls: `Filter: [Labels] [Assignee] [Overdue]`, `Group by: [Priority] [Assignee] [Type] [None]`. | Trello filter modal & Asana grouping. | Pure DOM layout transformations stored in `preferences.json`. |

---

## 3. Recommended Implementation Phases

### Phase 1: Card Modal & Visual Richness (Immediate Impact)
- [ ] Add linear checklist **progress bar** (`0%` to `100%`) with percentage label inside checklist sections in `card-modal.js`.
- [ ] Add **Quick-Action Toolbar** buttons (`🏷️ Labels`, `🕒 Dates`, `☑️ Checklist`, `⚡ Priority`) at the top of the modal.
- [ ] Add "Hide completed items" toggle for long checklists.
- [ ] Ensure card face badge bar displays attachment, comment, and checklist icons (`📎`, `💬`, `☑️`).

### Phase 2: Board UX & Inline Fast Actions
- [ ] Add sticky **"+ Add a card" inline composer** at the bottom of each list column.
- [ ] Add **Quick-Complete circle** on card faces (click to move to Done list).
- [ ] Add column header count badges with optional column icons/emojis.

### Phase 3: Layout & View Enhancements
- [ ] Add optional **Slide-Over Detail Panel** mode (toggleable with Center Modal).
- [ ] Add **Tab Switcher** for `Board` vs `List` view.
- [ ] Add global `Cmd+K` Quick Search Modal.
