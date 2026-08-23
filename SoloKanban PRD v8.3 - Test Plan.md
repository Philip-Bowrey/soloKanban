# SoloKanban Test Framework (v8.3-aligned)

## How to use this

Build and test in tier order — each tier gates the next. Tests marked **(v8.3)** are new this revision; everything else carries forward unchanged from v8.2[cite: 1].

---

## Tier 0 — Property-based / fuzz tests (write first, run continuously)

**Prerequisite:** deterministic corpus strategy — fixed seed, defined grammar, minimum 10,000 iterations, results reproducible across runs[cite: 1].

**Corpus definition:**

- Frontmatter values: strings (including empty, whitespace-only, unicode, escaped quotes, colons-in-strings), numbers, booleans, arrays, nested objects (where the schema allows)[cite: 1].
- Markdown bodies: empty sections, whitespace-only sections, nested checklists at varying indentation depth, Activity Log entries with varying timestamp/actor formats[cite: 1].

**Tests:**

- `hash(x) == hash(x)` always, across the full corpus[cite: 1].
- Content-identical-but-superficially-different documents (line endings, trailing whitespace, key order) hash identically[cite: 1].
- `serializeYaml(parseYaml(x))` produces the same canonical output in **both** JS and Python for the same input — not just matching hashes, matching serialized structure. _(Refinement: hash equality alone doesn't prove the SDKs agree if a canonicalization bug happens not to move the hash on the tested cases.)_[cite: 1]
- `parseChecklist(x)` produces an identical tree structure (same nesting, same completion states) in both languages[cite: 1].
- `appendActivityLog(x, entry)` places the entry in the same position and format in both languages[cite: 1].
- Run the full fuzz suite through both JS and Python with the same seed; assert identical hash **and** identical serialized output for every case[cite: 1].

**Gate:** must be green before Tier 3[cite: 1].

---

## Tier 1 — Unit tests (pure logic, no file system)

### YAML Parser / Serializer

- Correct types for string/number/boolean/array; quoted strings with colons; nested objects; empty frontmatter; comments ignored; CRLF→LF normalization[cite: 1].
- `hash(serialize(parse(x))) == hash(x)` (byte-identical re-serialization is not required)[cite: 1].

### Canonical Content Hash

- Deterministic; changes on any body change; ignores volatile meta fields (`revision`, `updatedAt`, `updatedBy`, `contentHash`, `deliveredAt`); trailing whitespace stripped; keys sorted; stable under feature-type schema changes for existing cards[cite: 1].
- **(v8.3) Performance:** `computeContentHash()` on a 50KB Markdown body completes in **under 200ms** on typical hardware (per §6.3's explicit target)[cite: 1, 2]. Run as a benchmark test with a hard assertion, not just a manual check — this is a stated numeric requirement now, not a vibe[cite: 1]. Also assert it stays comfortably under the 800ms auto-save debounce (§16.1) with margin for the rest of the save pipeline, not just the hash step in isolation[cite: 1, 2].

### Checklist Parser / Serializer

- Flat/nested parsing; progress counts top-level only; empty checklist; malformed lines ignored; exact-indentation round-trip[cite: 1].

### Markdown Renderer

- Headings, bold/italic, links, lists render correctly; HTML is escaped (`<script>` not executed)[cite: 1].

### Feature Type Validation

- Required fields enforced; defaults applied; `cardVisible` respected; section order preserved; unknown type falls back gracefully[cite: 1].

### Label / Custom Field Colour Resolution

- **(v8.3, now fully specified — was previously flagged as needing a spec decision):**[cite: 1]
    - Card references a label ID that exists → correct colour/name rendered[cite: 1].
    - Card references a label ID that has been **deleted** → label chip is **omitted** from the card face render; no crash, no placeholder on the face itself (per §7.2.1, the placeholder is edit-modal-only)[cite: 1, 2].
    - Same deleted-label card, opened in the **edit modal** → an "Unknown label (deleted)" placeholder is shown next to the label field, allowing removal[cite: 1, 2].
    - The placeholder is confirmed non-interactive with respect to content: re-saving the card without touching the label field leaves `meta.contentHash` and the stored `labels` frontmatter array **unchanged** — the placeholder must not silently strip or rewrite the dangling ID[cite: 1, 2].
    - User explicitly removes the stale reference via the placeholder UI → `labels` array is updated, hash changes accordingly (this _is_ a real content change, unlike just viewing the placeholder)[cite: 1].
- Custom field option colour resolution; `cardVisible` filtering[cite: 1].

### Date Logic

- Due today → amber; overdue → red; done card → no due colour; overdue precedes stale; empty dueDate omitted cleanly; midnight boundary case[cite: 1].

---

## Tier 2 — File system adapter tests (mocked FS Access API)

### Workspace Initialization

- Full structure created on blank folder (all `.solokanban/` subdirs, defaults, SDK, skills); existing workspace not overwritten[cite: 1].

### File Read/Write

- Read/write/create semantics; nested path traversal[cite: 1].

### Migration

- Legacy `layout.json` → migrated into `project.json.layout` on open; both-present case resolves in favor of `project.json.layout`[cite: 1].

### Atomic Write

- Temp-file-then-rename sequence; failure between hash-verify and rename leaves original untouched[cite: 1].

### **(v8.3) Temp file cleanup on failed update**

- Trigger a checksum-mismatched SDK/skill download → assert:[cite: 1]
    - Existing local file is byte-identical and untouched (content and `lastModified`)[cite: 1].
    - **No temp file remains** in the destination directory afterward — explicitly list the directory post-failure and assert no stray `.tmp`/partial files exist[cite: 1].
- Trigger a network failure mid-download (connection drop before the buffer completes) → same two assertions: original file untouched, no orphaned temp file[cite: 1].
- Repeat both cases immediately followed by a _successful_ retry → assert the retry isn't blocked or confused by any leftover state from the prior failure[cite: 1].

### Soft-delete directory collision (adapter level)

- Mock system clock to return identical timestamp across consecutive project soft-deletes (`/.solokanban/trash/<projectId>_<timestamp>/`)[cite: 2].
- Assert file system adapter appends a disambiguating suffix or handles collision gracefully without silently overwriting existing trash directory contents.

### Error Handling

- Permission denied, file not found, wrong handle type all throw cleanly[cite: 1].

### Quarantine

- Malformed YAML frontmatter → card moved to quarantine, board render doesn't crash, other cards unaffected[cite: 1].

---

## Tier 3 — Concurrency & data integrity

**Prerequisite: deterministic virtual clock.** All time-dependent tests in this tier must run against an injectable `now()` — no real `setTimeout`/`sleep` in the test bodies[cite: 1]. This is required infrastructure before any TTL-related test below can be considered trustworthy in CI; without it these tests will be flaky by construction[cite: 1].

|Scenario|Sequence|Assertion|
|---|---|---|
|Basic stale-write conflict|A and B load card at revision N. A saves → N+1. B saves (still on N).|B raises `ConflictException`; A's content persists; B's edits surfaced for merge, not lost.|
|Auto-merge, disjoint sections|A edits `## Description`, B edits `## Validation`, same base revision.|Merges automatically, no exception to B, both edits present, revision bumped once, hash validates against final content.|
|Auto-merge boundary: same section, genuinely conflicting edits|A changes one word in `## Description`; B changes a _different_ word in the same `## Description` section, same base revision. _(Corrected from earlier draft: a trailing-whitespace-only diff is stripped by canonicalization per §6.3 and wouldn't reliably exercise this path — using two distinct word-level edits in the same section removes the ambiguity.)_|Treated as same-section conflict — modal/exception path, not auto-merge; both edits are visible to the user for manual resolution, neither silently wins.|
|Auto-merge frontmatter/body boundary parsing|Actor A edits the last frontmatter field (immediately above `---`). Actor B edits the first body section line (immediately below `---`) on the same base revision.|Parser correctly identifies A's edit as frontmatter, routing the change to the Merge Modal (whole-block frontmatter resolution) rather than attempting a section auto-merge.|
|Auto-merge boundary: body-only edit near delimiter|Both Actor A and Actor B edit only within the body, with one edit occurring on the line immediately after `---`.|Treated as a valid, disjoint body-section edit; auto-merges smoothly without being misclassified by boundary-parsing logic.|
|Frontmatter conflict, disjoint fields|A changes `priority`, B changes `dueDate`.|Whole-block frontmatter conflict raised regardless of field disjointness — auto-merge never applies to frontmatter.|
|Auto-merge proceeds despite active presence|Agent A holds an open `edit_session` (live presence) on card X. Human B saves a disjoint-section change to X mid-session.|Auto-merge fires normally — no suppression check against presence, no modal. A's presence file untouched. _(§6.5.1: "Presence does not suppress auto-merge.")_|
|Agent's stale write after silent auto-merge|Continuing above: A saves its own change, still holding its pre-merge revision.|Ordinary `ConflictException` — standard stale-revision path, not special-cased.|
|Move: rollback path|A moves card X, `project.json` write succeeds, card file write forced to fail.|Rollback restores X to original list; Activity Log warning written; card file `listId` unchanged.|
|Move: rollback-also-fails, duplicate membership|Card X manually placed in two lists. Trigger scan.|X ends up only in the list first in `lists` order; card file rewritten to match; new revision/hash.|
|Move: reconciliation, orphaned card|Card Y absent from every list. Trigger scan.|Y appended to backlog; `deliveredAt` unset.|
|Reconciliation idempotency|Run scan twice on an already-consistent workspace.|Second run is a no-op — zero writes.|
|Multi-agent overlap, concrete interleaving|Agent 1 loads at N. Agent 2 loads at N, saves → N+1. Agent 1 saves at N.|Agent 1 raises `ConflictException`; Agent 2's write intact; no interleaved content.|
|Presence TTL, active→idle transition|Virtual clock: keystroke, then advance 31s idle, check interval.|Switches 15s→60s only after the 30s threshold; a keystroke at second 29 (virtual time) resets the clock.|
|Presence TTL expiry, idle|Virtual clock: write presence, advance 121s with no heartbeat.|Treated as expired — badge doesn't render, "active agent" warning doesn't fire on modal open.|
|Presence TTL, exact boundary|Virtual clock: advance exactly 120s (idle TTL) and exactly 30s (active TTL) — test the boundary value itself, not just past it.|Confirms whether the boundary is inclusive or exclusive as actually implemented; pin this down explicitly since the PRD states the numbers but not boundary inclusivity.|
|SDK heartbeat holds during idle `edit_session`|Virtual clock: agent begins `edit_session`, then simulates 5 minutes of virtual time with zero file writes or simulated UI events.|Heartbeat fires every 15s throughout, TTL stays 30s the whole time — confirms SDK path runs on its own timer and does not decay toward the UI's 60s/120s idle policy.|
|SDK heartbeat independent of webapp idle state|Simulate a webapp session on Card A transitioning into 60s/120s idle state while an agent holds an active `edit_session` on Card B.|The agent's card maintains 15s/30s heartbeat intervals while the webapp card operates at 60s/120s — asserts no global or shared timer state leaks across actor types.|
|Soft-delete collision, end-to-end|Trigger two soft-deletes of projects sharing the same `projectId` forced into the exact same timestamp window.|Both trashed directories exist independently in `.solokanban/trash/`; the second delete does not overwrite or corrupt the contents of the first. *(Note: PRD §17.1 should clarify timestamp precision/suffix behavior; test verifies non-destructive outcome.)*|

**Chaos test (scoped, with replay support):**

- Run N random valid operations (create/update/move/delete/label-change) against the same workspace using both the JS and Python SDK interleaved, with the full operation sequence logged[cite: 1].
- Assert: no operation ever results in a file that fails hash self-validation, no operation silently loses a previously-committed write, and the workspace remains parseable (no card lands in quarantine unexpectedly)[cite: 1].
- **On any failure, the harness must support minimizing the logged sequence** (bisecting to the smallest reproducing subsequence) — an unscoped chaos failure with a 200-operation log and no replay path is not actionable; this requirement is part of the test's definition, not an optional nicety[cite: 1].

---

## Tier 4 — Integration tests (module interactions, mocked FS)

### Board Rendering

- Workspace/project board card display from correct sources; swimlanes; collapsible lists; WIP limit display[cite: 1].

### Card CRUD

- Create/update/move/archive with correct file + index side effects; Done-list `deliveredAt` set/unset[cite: 1].

### Auto-Update

- Outdated file updates on checksum match; corrupted download discarded with existing file untouched (**and** temp-file-clean, per Tier 2); offline failure leaves file intact; user-created skill files never overwritten[cite: 1].

### Cross-SDK round-trip

- Write via Python SDK, read via JS SDK (same mocked FS) → identical parsed content and hash; reverse direction too[cite: 1].

### Trash inertness

- Trashed project with a pre-existing internal inconsistency (`featureOrder` duplicate) → full workspace scan → left untouched, not "fixed" by reconciliation[cite: 1].
- Trashed project containing a card with a deliberately invalid hash → scan/open workspace → no quarantine action, no warning, no crash[cite: 1].
- **(v8.3) Trash excluded from search index specifically** — this is a distinct code path from scan/hash/reconciliation and needs its own test:[cite: 1]
    - Populate a workspace, soft-delete a project containing cards with distinctive searchable text[cite: 1].
    - Rebuild `search-index.json`[cite: 1].
    - Search for that distinctive text → assert **zero results** from the trashed project's cards[cite: 1].
    - Confirm the _live_ (non-trashed) projects' cards are still fully searchable — i.e., the exclusion is scoped to trash, not a blanket search breakage[cite: 1].

### Label deletion, integration level

- Delete a label via the settings UI while a card referencing it is currently open in the edit modal → assert the modal updates live to show the "Unknown label (deleted)" placeholder without requiring a reload, and the card's underlying file is untouched by the deletion itself (only `labels.json` changes)[cite: 1].

---

## Tier 5 — End-to-end (real Chromium via Playwright)

### Basic Flow

- Open → create project → create feature card → edit → auto-save → drag-drop move → close/reopen → state restored[cite: 1].

### UI Interactions

- Esc/click-outside modal close; tooltips; click-to-edit/blur-to-save; empty checklist button; sub-item collapse/expand; progress ring updates; live agent badge + tooltip; settings tabs; preferences apply[cite: 1].

### Conflict Resolution UI

- Real two-actor conflict → modal with correct diff → frontmatter whole-block choice → section-by-section merge → Activity Log terminal → hash recomputed correctly[cite: 1].

### **(v8.3) First-run banner — now two distinct, fully-specified tests**

- **Chromium first visit:** fresh profile, Chromium browser → banner shows exact copy _"SoloKanban works best in Chromium. You are using a supported browser."_ → dismissible → `preferences.json` `ui.firstRunBannerDismissed` set to true on dismiss → reload → banner does not reappear[cite: 1, 2].
- **Non-Chromium first visit:** fresh profile, mocked non-Chromium user agent → banner shows exact copy _"SoloKanban requires a Chromium-based browser (Chrome, Edge, Opera) to access local files. Your files remain editable manually via any text editor (e.g., VS Code, Obsidian)."_ → dismissible → same persistence behavior[cite: 1, 2].
- **Persistence is workspace-scoped, not browser-scoped, confirm which:** the dismissal flag lives in `preferences.json` inside the workspace folder (§4.1 assumption 15), so opening a _different_ workspace folder in the same browser should show the banner again on that workspace's first open — worth an explicit test since it's easy to accidentally implement this as a browser-level flag (e.g., localStorage) instead of the spec's workspace-level one[cite: 1, 2].

### Label deletion, E2E

- Delete a label from Settings → Labels tab while it's applied to several cards across the board → navigate back to the board → confirm no label chips render for the deleted label anywhere, no console errors, board renders normally[cite: 1].

---

## Tier 6 — Regression suite (append-only)

Carried forward:

- Empty fields don't render `[object Object]`[cite: 1].
- `projectId` immutable in edit modal[cite: 1].
- Title field shows only title, no stray prefix[cite: 1].
- Project card click opens card view, not board directly[cite: 1].
- Drag-and-drop doesn't register as accidental click[cite: 1].
- Checklist progress counts parents only[cite: 1].
- Activity Log always last section after merge[cite: 1].
- Due date countdown correct; stale/overdue precedence correct[cite: 1].

**(v8.3) New entries:**

- `layout.json` migration: old file's dividers correctly appear in `project.json.layout` after open, and stale `layout.json` is not silently re-read on a subsequent open[cite: 1, 2].
- Idle presence TTL is exactly **120s**, not a regressed 90s or 30s value (this specific number changed across v8.1→v8.2 — worth pinning as a named regression test given it already moved once)[cite: 1].
- Presence badge tooltip includes both `actor` and `intent`, not just one or the other[cite: 1, 2].
- Deleted-label card: reopening and re-saving without touching the label field does not alter `meta.contentHash` (guards against a "helpful" auto-cleanup that silently strips the dangling ID and changes content unexpectedly)[cite: 1, 2].
- First-run banner copy does not regress to the single undifferentiated v8.2 message — Chromium and non-Chromium visitors must see the distinct v8.3 copy, not the same generic warning[cite: 1, 2].

---

## Tier 7 — Agent-SDK & skills correctness

- Core SDK methods behave per spec (`get_card`, `update_card` revision check, `create_card`, `list_cards` filters, `move_card`)[cite: 1, 2].
- `edit_session` presence create/remove[cite: 1].
- SDK never modifies `project.json.layout`[cite: 1, 2].
- **Skills-vs-code drift check**: automated comparison between `solokanban-sdk.md` documented methods and actual public API via introspection, run on every SDK change[cite: 1].

---

## Tier 8 — Performance / load smoke tests

- Render board with 100+ cards without degradation[cite: 1].
- Rapid-typing auto-save doesn't corrupt file (debounce race, now testable deterministically against the virtual clock from Tier 3)[cite: 1].
- **(v8.3, tightened)** `computeContentHash()` on a 50KB body completes under 200ms — this is now a Tier 1 hard-gated unit test (see above), but also re-run here under realistic load (board already rendering 100+ cards, hash computed for one of them) to confirm the target holds under contention, not just in isolation[cite: 1, 2].
- Project board with 200 features and active presence badges renders without O(n²) presence-scan behavior — measure scan time as feature count scales (e.g., 50/100/200) and assert roughly linear growth, not quadratic[cite: 1].

---

## Sequencing & gating summary

1. **Tier 0 + Tier 1 must be green before Tier 3.** This now includes the hash performance benchmark as a hard gate, not just correctness[cite: 1].
2. **Tier 3 requires the virtual clock as infrastructure before any test in it is meaningful** — build this once, reuse across every TTL/timing scenario[cite: 1].
3. **Tier 3 remains the highest-value tier overall** — weight development time here disproportionately[cite: 1].
4. All five v8.3 spec additions (label deletion, banner copy, hash performance, temp-file cleanup, search-index trash exclusion) now have fully-sourced tests with no invented behavior — the items previously deferred pending spec decisions are fully closed as of this revision[cite: 1].
5. **Tier 6 is append-only** and now includes explicit protection against the idle-TTL value regressing, since that number has already changed once across versions[cite: 1].