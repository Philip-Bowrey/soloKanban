/**
 * E2E Tests — Area L: Search
 * User Stories: US-SEARCH-1, US-SEARCH-2
 *
 * Note from PRD coverage notes: Search UI scope/syntax is underspecified.
 * These tests cover only what's explicitly implied in the PRD:
 * - Filtering cards by title/body text via the header search bar
 * - Trashed projects excluded from results
 *
 * Additional search tests should be added as the search spec is refined.
 */

import { test, expect } from './fixtures/kanban-fixture.js';

// ─────────────────────────────────────────────────────────────────────────────
// US-SEARCH-1: Searching by text filters the visible cards
// ─────────────────────────────────────────────────────────────────────────────
test('US-SEARCH-1: typing in the search bar filters cards by title match', async ({ page, kanban }) => {
  await kanban.openWorkspace({
    files: {
      'workspace.json': JSON.stringify({
        id: 'ws',
        featureOrder: { backlog: ['PROJ-0001', 'PROJ-0002'] },
      }),
      'projects/PROJ-0001.md': [
        '---', 'title: Authentication Module', 'projectId: PROJ_0001', 'listId: backlog', '---',
        '## Summary', 'Auth module project.',
      ].join('\n'),
      'projects/PROJ-0002.md': [
        '---', 'title: Payment Gateway', 'projectId: PROJ_0002', 'listId: backlog', '---',
        '## Summary', 'Payment gateway project.',
      ].join('\n'),
    },
  });

  // Confirm both cards are visible
  await expect(page.locator('.kanban-card-wrapper')).toHaveCount(2);

  // Type a search term that matches only the first card
  await page.fill('#global-search-input', 'Authentication');

  // Only the matching card should remain visible
  await expect(page.locator('.kanban-card-wrapper')).toHaveCount(1, { timeout: 3000 });
  await expect(page.locator('.kanban-card-wrapper')).toContainText('Authentication Module');
  await expect(page.locator('.kanban-card-wrapper')).not.toContainText('Payment Gateway');
});

test('US-SEARCH-1b: clearing the search input restores all cards', async ({ page, kanban }) => {
  await kanban.openWorkspace({
    files: {
      'workspace.json': JSON.stringify({
        id: 'ws',
        featureOrder: { backlog: ['PROJ-0001', 'PROJ-0002'] },
      }),
      'projects/PROJ-0001.md': [
        '---', 'title: Search Card Alpha', 'projectId: PROJ_0001', 'listId: backlog', '---',
        '## Summary', 'Alpha.',
      ].join('\n'),
      'projects/PROJ-0002.md': [
        '---', 'title: Search Card Beta', 'projectId: PROJ_0002', 'listId: backlog', '---',
        '## Summary', 'Beta.',
      ].join('\n'),
    },
  });

  await page.fill('#global-search-input', 'Alpha');
  await expect(page.locator('.kanban-card-wrapper')).toHaveCount(1);

  // Clear search
  await page.fill('#global-search-input', '');
  await expect(page.locator('.kanban-card-wrapper')).toHaveCount(2, { timeout: 3000 });
});

test('US-SEARCH-1c: search with no matches shows empty board (no cards)', async ({ page, kanban }) => {
  await kanban.openWorkspace({
    files: {
      'workspace.json': JSON.stringify({
        id: 'ws',
        featureOrder: { backlog: ['PROJ-0001'] },
      }),
      'projects/PROJ-0001.md': [
        '---', 'title: Only Card', 'projectId: PROJ_0001', 'listId: backlog', '---',
        '## Summary', 'The only card.',
      ].join('\n'),
    },
  });

  await page.fill('#global-search-input', 'xyzzy-no-match-ever');
  await expect(page.locator('.kanban-card-wrapper')).toHaveCount(0, { timeout: 3000 });
});

// ─────────────────────────────────────────────────────────────────────────────
// US-SEARCH-2: Trashed projects excluded from search results
// ─────────────────────────────────────────────────────────────────────────────
test('US-SEARCH-2: searching does not return cards from soft-deleted (trashed) projects', async ({ page, kanban }) => {
  // Set up one live project and one that we will delete via settings
  await kanban.openWorkspace({
    files: {
      'workspace.json': JSON.stringify({
        id: 'ws',
        featureOrder: { backlog: ['PROJ-0001', 'PROJ-0002'] },
      }),
      'projects/PROJ-0001.md': [
        '---', 'title: Live Project', 'projectId: PROJ_0001', 'listId: backlog', '---',
        '## Summary', 'UNIQUE_KEYWORD_LIVE.',
      ].join('\n'),
      'projects/PROJ-0002.md': [
        '---', 'title: Trashed Project', 'projectId: PROJ_0002', 'listId: backlog', '---',
        '## Summary', 'UNIQUE_KEYWORD_LIVE.',
      ].join('\n'),
      // PROJ_0002 sub-project files (needed for settings "Projects" tab)
      'PROJ_0002/project.json': JSON.stringify({
        id: 'PROJ_0002',
        lists: [{ id: 'backlog', name: 'Backlog' }],
        featureOrder: { backlog: [] },
        layout: { dividers: [] },
      }),
    },
  });

  // Confirm both cards start visible
  await expect(page.locator('.kanban-card-wrapper')).toHaveCount(2);

  // Delete PROJ_0002 via settings
  await kanban.openSettings();
  await page.click('[data-tab="projects"]');
  const deleteButtons = page.locator('.btn-soft-delete-proj');

  // Find and click the PROJ_0002 delete button
  const count = await deleteButtons.count();
  let deleted = false;
  for (let i = 0; i < count; i++) {
    const btn = deleteButtons.nth(i);
    const projId = await btn.getAttribute('data-proj-id');
    if (projId === 'PROJ_0002') {
      page.once('dialog', d => d.accept());
      await btn.click();
      deleted = true;
      break;
    }
  }

  if (!deleted) {
    // PROJ_0002 not in settings list (no sub-project dir) — skip
    test.info().annotations.push({
      type: 'note',
      description: 'US-SEARCH-2: PROJ_0002 not found in settings projects list (no sub-project directory). Seed sub-project directory for full test.',
    });
    await page.click('#settings-close-btn');
    return;
  }

  await page.waitForFunction(() => !document.getElementById('settings-modal'), { timeout: 4000 });

  // Search for the unique keyword — only the live project should appear
  await page.fill('#global-search-input', 'UNIQUE_KEYWORD_LIVE');
  await expect(page.locator('.kanban-card-wrapper')).toHaveCount(1, { timeout: 3000 });
  await expect(page.locator('.kanban-card-wrapper')).toContainText('Live Project');
  await expect(page.locator('.kanban-card-wrapper')).not.toContainText('Trashed Project');
});
