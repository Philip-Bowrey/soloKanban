# SoloKanban UI Implementation Review – Problems & Areas for Improvement

This report focuses on the **user interface and frontend implementation** of the SoloKanban v8.3 codebase, highlighting issues that affect usability, consistency, performance, and accessibility. While the overall UI is modern and visually appealing, several implementation choices degrade the user experience.

---

## 🔴 Critical UI/UX Problems

### 1. **Modal Re-renders Cause Focus Loss & Flicker**
- **Issue:** The card modal is re-rendered entirely (via `renderModalContainer()`) after every auto‑save, including when the user types in a field, toggles a checkbox, or adds a label.
- **Consequences:**
  - Input focus is lost, forcing the user to click back into the field they were editing.
  - The scroll position inside the modal resets to the top.
  - The entire DOM is replaced, causing a visual flicker and performance degradation.
- **Impact:** This makes editing cards frustrating, especially when typing long Markdown content.

### 2. **“Add an item…” Inputs in Checklists Are Ephemeral**
- **Issue:** In the rendered Markdown view, checklist “Add item” inputs are dynamically injected after rendering. However, they are **not persisted** across re‑renders (which happen on every auto‑save).
- **Consequence:** If the user starts typing in the “Add item” input and the auto‑save triggers (e.g., due to a checkbox toggle elsewhere), the input disappears and the typed text is lost.
- **Impact:** Checklist creation becomes unreliable and confusing.

### 3. **Task Checkbox State Relies on Fragile Index Mapping**
- **Issue:** Checkbox click handlers use a `data-task-index` that counts all checkbox items in the body. When the Markdown body changes (e.g., adding/removing items), the index may shift, causing the wrong checkbox to be toggled.
- **Consequence:** After adding a new checklist item, toggling a checkbox might affect a different item than intended.
- **Impact:** Data corruption (incorrect checklist state) without immediate visual feedback.

### 4. **Board Re‑renders on Every Presence Heartbeat**
- **Issue:** The board is fully re‑rendered every time the presence heartbeat runs (every 15 s active, 60 s idle), because `refreshBoard()` is called after `scanAllPresence()`.
- **Consequence:** Even if no card data changed, the board DOM is rebuilt, causing flicker and wasted CPU.
- **Impact:** Unnecessary reflows, especially noticeable with many cards.

### 5. **Drag‑and‑Drop Does Not Provide Visual Feedback During Drag**
- **Issue:** The only feedback is a slight opacity change on the dragged card. There is no ghost element, no insertion indicator, and no highlight on the drop target beyond a subtle background change.
- **Consequence:** Users cannot clearly see where the card will be dropped.
- **Impact:** Drag‑and‑drop feels clunky and error‑prone.

### 6. **Missing “Collapse” State Persistence in UI**
- **Issue:** Collapsed lists are stored in `preferences.json` and re‑applied on page load, but the collapse button (`◀`) does not indicate whether the list is currently collapsed (no toggle state).
- **Consequence:** Users cannot expand a collapsed list except by clicking the collapsed header, but there is no visual cue that clicking will expand.
- **Impact:** Discoverability of the expand action is poor.

### 7. **No Confirmation Before Deleting a Label, Field, or Feature Type**
- **Issue:** Clicking “Delete” on a label, custom field, or feature type immediately removes it **without confirmation**.
- **Consequence:** Accidental deletion is easy, especially since label deletion cascades to card rendering (showing “Unknown label” placeholders).
- **Impact:** Loss of configuration data, frustrating for users.

### 8. **WIP Limit Badges Are Static – No Way to Set WIP Limits in UI**
- **Issue:** While the board shows WIP limit badges (e.g., `5/8`), there is **no UI** to define or edit `wipLimit` per list.
- **Consequence:** The badge is decorative and cannot be configured.
- **Impact:** The feature is essentially unusable; users must manually edit `project.json`.

### 9. **List View Does Not Support Quick Actions**
- **Issue:** In list view, clicking a row opens the card modal, but there is no quick‑complete button (unlike the board view). Also, there is no drag‑and‑drop to move cards between lists.
- **Consequence:** List view is read‑only except for opening modals.
- **Impact:** Reduced productivity for users who prefer list view.

### 10. **Search Does Not Highlight Matches**
- **Issue:** The global search filters cards, but matching text is not highlighted in the card titles or bodies.
- **Consequence:** Users cannot immediately see why a card matched the query.
- **Impact:** Less useful search experience.

### 11. **Settings Modal Lacks “Cancel” / “Apply” Pattern**
- **Issue:** Changes in settings are applied **immediately** on each input change (e.g., renaming a label). There is no “Save” / “Cancel” workflow.
- **Consequence:** Accidental changes are instantly saved, and there is no way to revert.
- **Impact:** User anxiety and potential for misconfiguration.

### 12. **First‑Run Banner Blocks Board Interaction Until Dismissed**
- **Issue:** The banner is placed above the board but does not obscure it; however, it pushes the board down. If the user does not dismiss it, the board is slightly shifted, but still usable. Not a major issue.

---

## 🟡 Usability & Design Inconsistencies

### 13. **Inconsistent Use of “Add Card” Buttons**
- **Issue:** The header has a “＋ New Card” button that creates a card in the **first (backlog) list** of the current board. The column headers and footers have “+ Add Card” that target that specific list. This is clear, but the header button does not allow choosing a target list.
- **Suggestion:** The header button could open a small dropdown to select the list.

### 14. **Card Quick‑Complete Button Behaviour**
- **Issue:** In the board view, clicking the circle toggles the card between “Done” and “Backlog” (hard‑coded). If the board has a different “done” list (e.g., “Complete”), it still moves to `done` ID.
- **Consequence:** If the user renames the “done” list or uses a custom list, the quick‑complete may move the card to a non‑existent list.
- **Impact:** Quick‑complete is fragile.

### 15. **Swimlane View Repeats Column Headers for Each Row**
- **Issue:** In swimlane mode, each row (group) renders its own set of column headers (e.g., “Backlog”, “In Progress”, “Done”). This results in redundant headers and wasted vertical space.
- **Consequence:** Cluttered UI; users must scroll more.
- **Suggestion:** A more compact design would place group labels on the left and reuse a single header row.

### 16. **Background Colour Preference Affects Only Board, Not Modal or Settings**
- **Issue:** The board background colour set in preferences applies only to the board container, while the modal and settings dialogs always use the dark theme background.
- **Consequence:** Inconsistent visual experience.

### 17. **Column Stats Are Hard‑coded**
- **Issue:** The PRD allows customisable column stats (e.g., count, story points, high‑priority count, checklist completion). The implementation only shows **card count** and **total story points**.
- **Consequence:** Users cannot tailor stats to their workflow.

### 18. **No Loading Indicators for File Operations**
- **Issue:** Opening a large workspace or saving many cards may take time, but there are no spinners or progress indicators.
- **Consequence:** Users may think the app is unresponsive.

### 19. **Scrollbar Overlap on Kanban Columns**
- **Issue:** The column container (`column-cards-container`) has `overflow-y: auto`, but the scrollbar appears inside the column, overlapping the card content in some browsers.
- **Consequence:** Visual clutter and potential clipping of card content.

---

## 🔧 Implementation‑Level UI Issues

### 20. **Raw Markdown Editing Lacks Syntax Highlighting**
- **Issue:** The raw Markdown textarea is plain with no syntax highlighting or line numbers.
- **Consequence:** Hard to read and edit large Markdown.

### 21. **Modal Close Button is Too Small**
- **Issue:** The × button in the modal header is 1.5rem, but its click target is only the character itself, not a padded area.
- **Consequence:** Difficult to hit on touch devices.

### 22. **Labels in Modal Have No Colour Preview in Select Dropdown**
- **Issue:** The “Add label” dropdown shows label names but not their colours.
- **Consequence:** Users cannot easily identify labels by colour when adding them.

### 23. **Activity Log Section Is Not Rendered in Modal**
- **Issue:** The modal displays the Activity Log as a Markdown section but does not format it specially (e.g., with timestamps or a compact list).
- **Consequence:** The log is mixed with other content, reducing readability.

### 24. **Missing Tooltips on Most UI Elements**
- **Issue:** Only the agent badge and some buttons have tooltips. Many icons (e.g., collapse, settings, view toggle) lack tooltips or aria‑labels.
- **Consequence:** Poor discoverability for new users.

### 25. **No Empty State for Empty Board**
- **Issue:** When a workspace has no projects or a project has no features, the board shows empty columns with a placeholder “+ Add a card to …”. This is acceptable but could be more inviting (e.g., a larger “Get started” banner).

### 26. **Inconsistent Date Format Display**
- **Issue:** Due dates are shown as raw strings (e.g., `"2026-08-23"`). The countdown (“in 3 days”) is shown, but the raw date is also shown in the `title` attribute, which may be confusing.

### 27. **No Undo/Redo Support**
- **Issue:** Auto‑save is immediate; there is no undo history for card edits.
- **Consequence:** Accidental changes cannot be reverted except by manually editing the file.

### 28. **Presence Badge Tooltip Shows Raw Actor ID**
- **Issue:** The tooltip displays the actor ID (e.g., `human-abc123`) which is not user‑friendly.
- **Suggestion:** Display a human‑readable name or allow custom aliases.

---

## 📋 Summary of UI Gaps vs. PRD

| PRD Section | Feature | Implementation Status |
|-------------|---------|------------------------|
| §9.3        | WIP limits UI | ❌ No UI to set limits |
| §9.4        | Customisable column stats | ❌ Only count and story points |
| §10.2       | Attachment thumbnails | ❌ Only count badge |
| §10.8       | Badges for comments | ❌ Not implemented (no comment feature) |
| §16.4       | Inline checklist adding | ⚠️ Present but broken due to re‑renders |
| §17         | Settings modal for lists | ❌ No list editing |
| §18         | Search cache rebuild | ⚠️ Not auto‑refreshed on card edits |

---

## ✅ Recommended Fixes

1. **Optimise modal rendering** – Use a virtual DOM or only update changed parts, or use `contenteditable` for the body to avoid full re‑renders.
2. **Persist “Add item” inputs** – Move the input outside the re‑rendered region or manage it via state.
3. **Add loading indicators** – Simple spinner during file operations.
4. **Implement confirmation dialogs** – For deletions in settings.
5. **Add WIP limit editing UI** – In the settings modal or in a per‑list context menu.
6. **Improve drag‑and‑drop** – Show a ghost element and insertion line.
7. **Make quick‑complete dynamic** – Use the actual `done` list from the project config.
8. **Add search highlighting** – Use a simple mark‑up when rendering filtered cards.
9. **Improve accessibility** – Add ARIA labels, keyboard support for drag/drop, and focus management.
10. **Use a more robust checklist parser** – Avoid fragile index‑based mapping.

These fixes would dramatically improve the user experience and bring the UI closer to the polished, professional feel implied by the PRD.
