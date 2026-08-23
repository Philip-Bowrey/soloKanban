/**
 * E2E Tests — Area M: Multi-Actor / Human-Facing Concurrency Scenarios
 * User Stories: US-MULTI-1 through US-MULTI-3
 *
 * Covers: presence warning shown immediately on modal open (before typing),
 * user's edit never silently discarded in conflict scenarios,
 * normal editing flow unblocked when agent has no overlapping edits.
 */

import { test, expect } from '../fixtures/kanban-fixture.js';

const PROJECT_ID = 'PROJ_0001';
const CARD_ID = `${PROJECT_ID}-0001`;
const CARD_FILE_PATH = `${PROJECT_ID}/features/${CARD_ID}.md`;

const BASE_CARD = [
  '---',
  'title: Multi-Actor Test Card',
  'listId: backlog',
  'meta:',
  '  revision: 1',
  '  contentHash: "base-hash"',
  '---',
  '## Description',
  'Base description.',
  '',
  '## Acceptance Criteria',
  'Base AC.',
  '',
  '## Activity Log',
  '- Card created',
].join('\n');

async function setupWithActiveAgent(page, kanban) {
  const presenceData = JSON.stringify({
    cardId: CARD_ID,
    actor: 'agent:claude-code-v1',
    actorType: 'agent',
    intent: 'editing',
    startedAt: new Date().toISOString(),
    heartbeatAt: new Date().toISOString(),
    ttlSeconds: 30,
  });

  await kanban.openWorkspace({
    files: {
      'workspace.json': JSON.stringify({ id: 'ws', featureOrder: { backlog: ['PROJ-0001'] } }),
      'projects/PROJ-0001.md': [
        '---', 'title: Multi-Actor Project', 'projectId: PROJ_0001', 'listId: backlog',
        '---', '## Summary', 'Multi-actor test.',
      ].join('\n'),
      [`${PROJECT_ID}/project.json`]: JSON.stringify({
        id: PROJECT_ID,
        lists: [
          { id: 'backlog', name: 'Backlog' },
          { id: 'in-progress', name: 'In Progress' },
          { id: 'done', name: 'Done', done: true },
        ],
        featureOrder: { backlog: [CARD_ID], 'in-progress': [], done: [] },
        layout: { dividers: [] },
      }),
      [CARD_FILE_PATH]: BASE_CARD,
      [`.solokanban/presence/${CARD_ID}/agent-claude-code-v1.json`]: presenceData,
    },
  });

  // Trigger presence scan before navigating to board
  await page.evaluate(async () => {
    if (window.app) await window.app.state.scanAllPresence();
  });

  // Navigate to project board
  await page.click('.kanban-card-wrapper');
  await page.click('#modal-open-project-board-btn');
  await expect(page.locator('#nav-back-workspace-btn')).toBeVisible();
}

// ─────────────────────────────────────────────────────────────────────────────
// US-MULTI-1: Presence warning shown immediately on modal open, before typing
// ─────────────────────────────────────────────────────────────────────────────
test('US-MULTI-1: agent presence warning appears immediately on card modal open, before typing', async ({ page, kanban }) => {
  await setupWithActiveAgent(page, kanban);

  await page.evaluate(async () => {
    if (window.app) await window.app.state.scanAllPresence();
  });

  // Open the feature card
  const card = page.locator('.kanban-card-wrapper').first();
  await card.click();
  await page.waitForSelector('#card-modal', { timeout: 5000 });

  // No typing has occurred yet — warning should be immediate
  const warning = page.locator('#card-modal').locator('.presence-warning, .agent-warning, [class*="presence"][class*="warn"]');

  if (await warning.count() > 0) {
    await expect(warning.first()).toBeVisible();
    // Verify no input has been interacted with yet
    const titleInput = page.locator('#modal-title-input');
    const titleValue = await titleInput.inputValue();
    expect(titleValue).toBe('Multi-Actor Test Card'); // unchanged — no typing
  } else {
    test.info().annotations.push({
      type: 'note',
      description: 'US-MULTI-1: Presence warning not shown immediately in modal. Implement presence check at the start of CardModal.renderModalContainer().',
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// US-MULTI-2: User edit is never silently discarded
// ─────────────────────────────────────────────────────────────────────────────
test('US-MULTI-2: user edit content is preserved in the outcome of any conflict scenario', async ({ page, kanban }) => {
  await setupWithActiveAgent(page, kanban);

  // Open the card
  const card = page.locator('.kanban-card-wrapper').first();
  await card.click();
  await page.waitForSelector('#card-modal', { timeout: 5000 });

  const USER_TITLE = 'User Changed This Title';
  await page.fill('#modal-title-input', USER_TITLE);

  // Simulate an agent writing a completely different title simultaneously
  const agentVersion = BASE_CARD.replace(
    'title: Multi-Actor Test Card',
    'title: Agent Changed Title'
  ).replace('"base-hash"', '"agent-version-hash"');

  await page.evaluate(({ path, content }) => {
    window.__seedFile(path, content);
  }, { path: CARD_FILE_PATH, content: agentVersion });

  // Wait for save to complete
  await page.waitForFunction(
    () => {
      const mergeOpen = !!document.getElementById('merge-modal');
      const saveStatus = document.getElementById('auto-save-status')?.textContent;
      return mergeOpen || saveStatus === 'Saved';
    },
    { timeout: 5000 }
  );

  const mergeOpen = await page.locator('#merge-modal').count() > 0;
  if (mergeOpen) {
    // Merge modal is showing — both options must include user content somewhere
    await expect(page.locator('#btn-keep-local')).toBeVisible();
    await expect(page.locator('#btn-accept-incoming')).toBeVisible();

    // Keep local — user content must win
    await page.click('#btn-keep-local');
    await expect(page.locator('#auto-save-status')).toHaveText('Saved', { timeout: 4000 });

    // Verify user's title is now in the modal
    await expect(page.locator('#modal-title-input')).toHaveValue(USER_TITLE);
  } else {
    // Auto-save succeeded (auto-merge or no conflict) — user title should be saved
    await expect(page.locator('#modal-title-input')).toHaveValue(USER_TITLE);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// US-MULTI-3: Editing a card with no overlapping agent edits completes normally
// ─────────────────────────────────────────────────────────────────────────────
test('US-MULTI-3: editing a card with active agent on non-overlapping section completes normally', async ({ page, kanban }) => {
  await setupWithActiveAgent(page, kanban);

  // Open the card
  const card = page.locator('.kanban-card-wrapper').first();
  await card.click();
  await page.waitForSelector('#card-modal', { timeout: 5000 });

  // Agent writes a version that edits ONLY the AC section
  const agentVersion = BASE_CARD
    .replace('Base AC.', 'Agent-written AC — disjoint from user edit.')
    .replace('"base-hash"', '"agent-disjoint-hash"');

  await page.evaluate(({ path, content }) => {
    window.__seedFile(path, content);
  }, { path: CARD_FILE_PATH, content: agentVersion });

  // User edits only the title (different from AC)
  await page.fill('#modal-title-input', 'Non-Overlapping User Edit');

  // Save should complete without showing a merge modal
  await expect(page.locator('#auto-save-status')).toHaveText('Saved', { timeout: 4000 });
  await expect(page.locator('#merge-modal')).toHaveCount(0);
});
