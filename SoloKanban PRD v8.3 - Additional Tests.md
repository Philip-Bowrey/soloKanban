# SoloKanban — Human User Stories for E2E Testing

Each story follows **As a user, I want to [X], so that [Y]** with acceptance criteria phrased as observable, automatable outcomes. Stories are grouped to mirror natural test-suite boundaries. IDs are stable references for traceability back to test files (`US-<area>-<n>`).

---

## A. Workspace Setup & First Run

**US-SETUP-1**: As a first-time user, I want to open a folder as my workspace, so that SoloKanban initializes all required files without me doing anything manually.

- _AC:_ Selecting a blank folder via the directory picker results in a visible board with zero projects and no console errors; the underlying folder gains the full `.solokanban/` structure.

**US-SETUP-2**: As a returning user, I want to reopen a folder I've already used, so that my existing projects and settings load exactly as I left them.

- _AC:_ Reopening a previously-initialized folder shows existing projects, preserves list order, and does not re-create or reset any config file.

**US-SETUP-3**: As a Chromium user, I want a one-time heads-up that this app works best in my browser, so that I'm reassured rather than confused.

- _AC:_ First visit shows the Chromium-affirming banner exactly once; dismissing it persists across reloads of the same workspace.

**US-SETUP-4**: As a non-Chromium user, I want to be told clearly that I need a different browser, and that my files aren't locked away, so that I'm not stuck without options.

- _AC:_ First visit in a non-Chromium browser shows the stronger warning banner including the manual-editing note (VS Code/Obsidian/etc.); dismissing it persists.

**US-SETUP-5**: As a user, I want to open a second, different workspace folder, so that I can manage multiple independent boards.

- _AC:_ Opening Workspace B after having dismissed the banner in Workspace A shows the banner again in B — dismissal is per-workspace, not global to the browser.

---

## B. Workspace Board & Project Management

**US-PROJ-1**: As a user, I want to create a new project, so that I have a place to track improvements to it.

- _AC:_ Creating a project produces a new card on the workspace board with the title I entered; a corresponding project folder and `project.json` exist on disk.

**US-PROJ-2**: As a user, I want to click a project card to see its details, so that I can review or edit it without leaving the workspace view.

- _AC:_ Clicking a project card opens its edit modal (not the project board directly).

**US-PROJ-3**: As a user, I want a dedicated button to jump into a project's board, so that I can start managing its feature cards.

- _AC:_ Inside the project card's modal, a distinct "Open Project Board" action navigates to that project's dedicated board.

**US-PROJ-4**: As a user, I want a breadcrumb showing where I am, so that I can navigate back to the workspace easily.

- _AC:_ Project board shows "Workspace / ProjectName" breadcrumb; clicking "Workspace" returns to the top-level board.

**US-PROJ-5**: As a user, I want to delete a project I no longer need, so that my workspace board stays relevant.

- _AC:_ Deleting a project removes its card from the workspace board immediately; the project's folder is moved to trash on disk, not permanently destroyed.

**US-PROJ-6**: As a user, I want reassurance that deleting a project isn't instantly irreversible, so that I don't fear an accidental click.

- _AC:_ The delete action in Settings → Projects requires an explicit confirmation step before executing.

---

## C. Project Board & Feature Cards

**US-CARD-1**: As a user, I want to create a feature card in a project, so that I can track a specific improvement.

- _AC:_ Creating a card via the "add card" control on a list produces a visible card in that list, using the selected feature type's template.

**US-CARD-2**: As a user, I want to choose from different feature types when creating a card, so that the card has the right fields for the kind of work it represents.

- _AC:_ The create-card flow offers all workspace-defined feature types; selecting one populates the card's frontmatter fields and body sections per that type's definition.

**US-CARD-3**: As a user, I want to click a card to open and edit it, so that I can update its details.

- _AC:_ Clicking any feature card opens its edit modal with current title, fields, and body content populated.

**US-CARD-4**: As a user, I want my edits to save automatically as I type, so that I never lose work by forgetting to click "Save."

- _AC:_ Typing in a card field, then pausing, triggers a save without any explicit save action, within the documented debounce window; the change is visible in the underlying file.

**US-CARD-5**: As a user, I want to close a card modal with Esc or by clicking outside it, so that dismissing feels natural.

- _AC:_ Both Esc and an outside click close the modal; either action also finalizes any pending unsaved edit.

**US-CARD-6**: As a user, I want the card's title to always be editable but its project/ID to be fixed, so that I don't accidentally break its identity.

- _AC:_ The title field accepts edits; the project ID field is visibly non-editable (read-only styling, no input focus).

**US-CARD-7**: As a user, I want to drag a card from one list to another, so that I can reflect its new status.

- _AC:_ Drag-and-drop moves the card visually and persists the new list assignment; reloading the board shows the card in its new location.

**US-CARD-8**: As a user, I want a small drag movement not to be mistaken for a click, so that I don't accidentally open a card when I meant to reorder it.

- _AC:_ A drag gesture under some minimal movement threshold does not trigger the card's click-to-open behavior; a genuine drag does not also open the modal afterward.

**US-CARD-9**: As a user, I want moving a card into a "Done" list to record when it was completed, so that I have a completion timestamp.

- _AC:_ Moving a card into a list marked `done: true` sets a delivered timestamp visible in the card's metadata; moving it back out clears that timestamp.

**US-CARD-10**: As a user, I want to archive a card instead of deleting it, so that it's out of my active view but not gone.

- _AC:_ Archiving a card removes it from active board lists but the underlying file remains; there's a way to view archived cards (if the UI provides one) or otherwise confirm the archive flag is set.

---

## D. Rich Text & Markdown Editing

**US-MD-1**: As a user, I want to see a card's body content nicely formatted by default, so that it's easy to read.

- _AC:_ Body sections render Markdown (headings, bold, lists, links) rather than showing raw syntax, on initial card open.

**US-MD-2**: As a user, I want to click into a rendered section to edit its raw Markdown, so that I have full control over formatting.

- _AC:_ Clicking a rendered body section switches that section into a raw-text editable state.

**US-MD-3**: As a user, I want clicking away from an edited section to save it and return to the rendered view, so that the editing flow feels seamless.

- _AC:_ Blurring the raw-edit textarea both persists the change and re-renders the section as formatted Markdown.

**US-MD-4**: As a user, I want to hover a section heading and see what it's for, so that I understand what content belongs there.

- _AC:_ Hovering a body section's heading shows a tooltip with that section's description (as defined by the feature type).

---

## E. Checklists

**US-CHK-1**: As a user, I want to add checklist items to a card, so that I can track sub-tasks.

- _AC:_ An empty checklist section shows an "Add an item" affordance; using it creates a new, editable checklist item.

**US-CHK-2**: As a user, I want to check items off as I complete them, so that I can see my progress.

- _AC:_ Clicking a checklist item's checkbox toggles its completed state and immediately updates the visible progress indicator.

**US-CHK-3**: As a user, I want to add sub-items under a checklist item, so that I can break down larger tasks.

- _AC:_ Sub-items nest visually under their parent and are collapsed by default; expanding shows them with their own `x/y` sub-progress count.

**US-CHK-4**: As a user, I want the overall progress bar to reflect only top-level items, so that deeply nested sub-tasks don't distort the big picture.

- _AC:_ Checking/unchecking a sub-item does not change the top-level progress bar; only checking/unchecking a top-level item does.

**US-CHK-5**: As a user, I want to add a new item by pressing Enter, with focus jumping to the next new item automatically, so that rapid entry is fast.

- _AC:_ Typing text and pressing Enter in an item-add field saves that item and immediately focuses a fresh empty input for the next one.

---

## F. Labels & Custom Fields

**US-LBL-1**: As a user, I want to create a workspace-level label with a name and colour, so that I can tag cards consistently.

- _AC:_ A new label created in Settings → Labels is immediately available to attach to any card, workspace-wide.

**US-LBL-2**: As a user, I want a label's colour to update everywhere at once if I change it, so that I don't have to fix every card individually.

- _AC:_ Changing a label's colour in Settings updates the rendered colour on every card that references it, without touching those cards' underlying files.

**US-LBL-3**: As a user, I want cards referencing a label I later delete to not break, so that deleting a label is safe.

- _AC:_ Deleting a label removes its chip from any card face that referenced it; opening that card's edit modal shows an "Unknown label (deleted)" placeholder instead of an error.

**US-LBL-4**: As a user, I want to clean up a stale label reference from a card, so that I can tidy up after deleting a label.

- _AC:_ Using the "Unknown label (deleted)" placeholder's removal action clears the dangling reference from that card's stored labels.

**US-FIELD-1**: As a user, I want to define a custom field (text, single-choice, or multi-choice), so that I can capture project-specific data.

- _AC:_ A new custom field created in Settings appears as an editable field in the card modal for cards of applicable feature types.

**US-FIELD-2**: As a user, I want to mark a custom field as visible on the card face, so that important info is visible without opening the card.

- _AC:_ Toggling a field's `cardVisible` setting makes its value appear as a chip directly on the card face on the board.

---

## G. Board & List Display Customization

**US-BOARD-1**: As a user, I want to group cards into swimlanes by label, assignee, type, or priority, so that I can see workload distribution at a glance.

- _AC:_ Selecting a swimlane grouping option visually reorganizes the board into horizontal lanes matching that attribute; the choice persists across reloads.

**US-BOARD-2**: As a user, I want to collapse a list I don't need to see right now, so that I can focus on what matters.

- _AC:_ Collapsing a list shrinks it to a narrow strip; the collapsed state survives a reload.

**US-BOARD-3**: As a user, I want to set a WIP limit on a list, so that I can visually catch overcommitment.

- _AC:_ A list with a WIP limit shows `current/limit` in its header, turning amber near the limit and red at/over it.

**US-BOARD-4**: As a user, I want to see quick stats in a list's header (card count, points, etc.), so that I don't need to open every card to gauge progress.

- _AC:_ Selecting a stat type in list settings updates that list's header to show the chosen aggregate, recalculating as cards move in/out.

**US-BOARD-5**: As a user, I want to customize my board's background, so that I can visually distinguish workspaces.

- _AC:_ Setting a board background colour/image is immediately visible and persists across reloads; it has no effect on any card's saved content.

**US-BOARD-6**: As a user, I want to add a visual divider within a list, so that I can group cards logically without creating a new column.

- _AC:_ Adding a divider inserts a non-draggable separator at the chosen position; it persists across reloads and cannot be dragged like a card.

---

## H. Card Face Visual Indicators

**US-VIS-1**: As a user, I want to see at a glance which cards haven't been touched in a while, so that I can spot neglected work.

- _AC:_ A card untouched past the configured staleness threshold shows the aging indicator; updating the card clears it.

**US-VIS-2**: As a user, I want to see how much time is left (or overdue) on a card's due date without opening it, so that I can prioritize quickly.

- _AC:_ A card with a due date shows a relative countdown ("in 3 days") or overdue label ("overdue by 2 days") matching the actual date math.

**US-VIS-3**: As a user, I want the most urgent visual signal to win when a card is both stale and overdue, so that I'm not confused by competing indicators.

- _AC:_ A card that is simultaneously stale and overdue shows only the overdue treatment; the stale tint is visually suppressed.

**US-VIS-4**: As a user, I want to see a priority flag on cards at a glance, so that I know what's urgent without reading details.

- _AC:_ A card with a priority value set shows the corresponding coloured flag icon on its face.

**US-VIS-5**: As a user, I want a compact progress ring showing checklist completion, so that I don't have to open the card to see how far along it is.

- _AC:_ A card with a checklist shows a progress ring reflecting top-level item completion; the ring updates live as items are checked.

**US-VIS-6**: As a user, I want small icon badges for attachments, comments, and checklists, so that I know what a card contains before opening it.

- _AC:_ Cards with attachments/comments/checklist items show the corresponding badge with an accurate count; clicking a badge opens the relevant section directly.

**US-VIS-7**: As a user, I want empty fields to simply not show up on the card face, so that the board doesn't look cluttered with placeholders.

- _AC:_ A card with no due date, no priority, no story points, etc. shows none of those elements — never a placeholder like "N/A" or a rendering artifact.

---

## I. Live Agent Presence

**US-PRES-1**: As a user, I want to see when an AI agent is actively working on a card, so that I don't accidentally step on its edits.

- _AC:_ A card with an active agent `edit_session` shows a pulsing indicator on its face, visible from the board without opening the card.

**US-PRES-2**: As a user, I want to know _what_ an active agent is doing, not just that it's active, so that I can decide whether to wait or proceed.

- _AC:_ Hovering the presence badge shows a tooltip with the agent's identity and stated intent (e.g., "agent:claude-code-v1 — editing").

**US-PRES-3**: As a user, I want to be warned if I open a card an agent is actively editing, so that I'm aware before I start typing.

- _AC:_ Opening a card modal while a live agent presence file exists shows a visible warning inside the modal.

**US-PRES-4**: As a user, I want a stale presence indicator (agent crashed or disconnected) to disappear on its own, so that I'm not permanently misled about who's active.

- _AC:_ After the presence TTL elapses with no further heartbeat, the badge and warning stop appearing, without requiring any manual dismissal.

---

## J. Conflict Resolution

**US-CONF-1**: As a user, I want two independent edits to different parts of a card to combine automatically, so that I'm not bothered with a merge screen for non-overlapping changes.

- _AC:_ When my edit and an agent's concurrent edit touch different body sections, both changes appear in the saved card with no modal shown to me.

**US-CONF-2**: As a user, I want to be shown a clear merge screen when my edit truly conflicts with someone else's, so that I can decide what to keep.

- _AC:_ When my edit and a concurrent edit touch the _same_ body section, a Merge Modal opens showing both versions side by side.

**US-CONF-3**: As a user, I want to choose "Keep Local," "Accept Incoming," or edit manually for each conflicting section, so that I have full control over the merge.

- _AC:_ Each conflicting section in the modal offers all three choices; selecting one applies only to that section.

**US-CONF-4**: As a user, I want a "keep everything mine" or "accept everything theirs" shortcut, so that I don't have to resolve every section individually when I already know which side I trust.

- _AC:_ The global override buttons ("Keep All Local"/"Accept All Incoming") resolve every conflicting section at once, without requiring per-section clicks.

**US-CONF-5**: As a user, I want frontmatter conflicts (like due date or priority) to be resolved as a whole, not merged field-by-field, so that I don't end up with corrupted metadata.

- _AC:_ When frontmatter differs between versions, the modal presents it as a single raw diff with only "Keep Local" or "Accept Incoming" as options — no per-field merge control.

**US-CONF-6**: As a user, I want my Activity Log to never get scrambled or overwritten during a merge, so that my history of changes stays trustworthy.

- _AC:_ After any merge (auto or manual), the Activity Log section contains entries from both sides in chronological order and remains the last section in the card.

---

## K. Settings & Configuration

**US-SET-1**: As a user, I want a single settings panel for labels, custom fields, feature types, projects, and preferences, so that all configuration lives in one place.

- _AC:_ Opening Settings shows all five tabs; switching between them preserves unsaved state in each (or saves incrementally) without data loss.

**US-SET-2**: As a user, I want to toggle dark mode, so that I can use the app comfortably at night.

- _AC:_ Toggling dark mode in Preferences immediately re-themes the UI and persists across reloads.

**US-SET-3**: As a user, I want to set my preferred staleness threshold, so that the aging indicator matches my own definition of "neglected."

- _AC:_ Changing the staleness threshold in Preferences updates which cards show the aging indicator on next board render.

**US-SET-4**: As a user, I want to turn off live agent badges if I find them distracting, so that I can simplify my board view.

- _AC:_ Disabling the agent badge preference hides presence indicators from the board without deleting the underlying presence data.

---

## L. Search _(underspecified in the PRD — flagged, not assumed)_

The PRD references a "search cache" (`search-index.json`) and lists "search" among core goals, but no section defines search UI behavior, scope, or query syntax. The stories below cover only what's explicitly implied; anything about filters, ranking, or search-as-you-type would be guessing and should be confirmed against the PRD (or a design doc) before being written as a hard E2E assertion.

**US-SEARCH-1**: As a user, I want to search for a card by text content, so that I can find something without browsing every list.

- _AC:_ Entering a search term returns cards whose title or body contains a match; clicking a result opens that card.

**US-SEARCH-2**: As a user, I want deleted (trashed) projects excluded from search results, so that I'm not shown cards I can no longer act on.

- _AC:_ A search term unique to a trashed project's cards returns zero matches from that project, while matches from live projects still appear.

---

## M. Multi-Actor / Human-Facing Concurrency Scenarios

These stories describe the human experience specifically in overlap scenarios — distinct from the backend-focused conflict tests in the earlier test plan, but the human-facing surface of the same mechanics.

**US-MULTI-1**: As a user, I want to see that someone else is editing a card the moment I open it, not discover it only after I've already made changes, so that I can avoid wasted work.

- _AC:_ The active-agent warning appears immediately on modal open, before any typing occurs.

**US-MULTI-2**: As a user, I want my own edit to never be silently discarded, even if it conflicts with someone else's, so that I never lose work without knowing it.

- _AC:_ In every conflict scenario (auto-merge or modal), my edit's content is provably present somewhere in the outcome — either merged automatically or explicitly offered to me as a choice, never dropped.

**US-MULTI-3**: As a user, I want to keep working normally most of the time even with an agent occasionally active on the same project, so that presence doesn't feel like it's blocking me.

- _AC:_ Editing and saving a card with no actual section overlap against a concurrently active agent completes normally, with no forced wait and no modal.

---

## Coverage notes for building the E2E suite

- **A–K map directly to Tier 5 of the earlier test plan** — these stories are the human-readable spec that Tier 5's Playwright scenarios should be written against; each `US-` ID can become one or more `test()` blocks.
- **Section L (Search) needs a spec answer before its stories go beyond the two listed** — don't invent query syntax, filters, or ranking behavior for E2E assertions; get that from the PRD author first, same as the earlier flagged items.
- **Section M overlaps deliberately with the backend concurrency tests (Tier 3)** — Tier 3 tests the _mechanism_ (hash checks, revision numbers); these stories test the _human-visible experience_ of that mechanism. Both are needed — a mechanism that's correct but invisible to the user (e.g., a merge that succeeds silently but gives no indication anything happened) would pass Tier 3 and still fail US-CONF-1 if, say, the merged content doesn't visibly refresh in an already-open modal.
- **US-PROJ-6 and US-CARD-8** describe UI behavior (confirmation dialog copy, drag-threshold pixel value) that the PRD doesn't pin to exact numbers — write the automated test against "a confirmation step exists" and "small movements don't trigger click" rather than a specific pixel threshold unless one gets specified.