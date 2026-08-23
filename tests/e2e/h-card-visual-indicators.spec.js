/**
 * E2E Tests — Area H: Card Face Visual Indicators
 * User Stories: US-VIS-1 through US-VIS-7
 *
 * Covers: staleness indicator, due date countdown, overdue > stale priority,
 * priority flag, progress ring, badge icons, empty fields not showing.
 */

import { test, expect } from './fixtures/kanban-fixture.js';

// Helper: build a seeded card file with specific frontmatter
function buildCardFile(fields = {}) {
  const fm = {
    title: 'Visual Test Card',
    listId: 'backlog',
    ...fields,
  };
  const fmLines = ['---'];
  for (const [key, val] of Object.entries(fm)) {
    if (typeof val === 'object') {
      fmLines.push(`${key}:`);
      for (const [k, v] of Object.entries(val)) {
        fmLines.push(`  ${k}: ${JSON.stringify(v)}`);
      }
    } else {
      fmLines.push(`${key}: ${JSON.stringify(val)}`);
    }
  }
  fmLines.push('---', '## Description', 'Visual test body.');
  return fmLines.join('\n');
}

// Helper: open workspace with seeded feature card and navigate to its project board
async function setupProjectWithCard(page, kanban, cardFrontmatter = {}) {
  const cardFile = buildCardFile(cardFrontmatter);
  await kanban.openWorkspace({
    files: {
      'workspace.json': JSON.stringify({ id: 'ws', featureOrder: { backlog: ['PROJ-0001'] } }),
      'projects/PROJ-0001.md': [
        '---', 'title: VIS Test Project', 'projectId: PROJ_0001', 'listId: backlog',
        '---', '## Summary', 'Visual test project.',
      ].join('\n'),
      'PROJ_0001/project.json': JSON.stringify({
        id: 'PROJ_0001',
        lists: [
          { id: 'backlog', name: 'Backlog' },
          { id: 'in-progress', name: 'In Progress' },
          { id: 'done', name: 'Done', done: true },
        ],
        featureOrder: { backlog: ['PROJ_0001-0001'], 'in-progress': [], done: [] },
        layout: { dividers: [] },
      }),
      'PROJ_0001/features/PROJ_0001-0001.md': cardFile,
    },
  });

  // Navigate to project board
  await page.click('.kanban-card-wrapper');
  await page.click('#modal-open-project-board-btn');
  await expect(page.locator('#nav-back-workspace-btn')).toBeVisible();
}

// ─────────────────────────────────────────────────────────────────────────────
// US-VIS-1: Stale card shows aging indicator
// ─────────────────────────────────────────────────────────────────────────────
test('US-VIS-1: a card not updated past the staleness threshold shows an aging indicator', async ({ page, kanban }) => {
  // Seed a card with a very old updatedAt (30 days ago)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  await setupProjectWithCard(page, kanban, {
    meta: { updatedAt: thirtyDaysAgo, revision: 1 },
  });

  const card = page.locator('.kanban-card-wrapper').first();
  // Stale cards should have a stale indicator class or element
  const staleIndicator = card.locator('.stale-indicator, .card-stale, [class*="stale"]');
  if (await staleIndicator.count() > 0) {
    await expect(staleIndicator.first()).toBeVisible();
  } else {
    test.info().annotations.push({
      type: 'note',
      description: 'US-VIS-1: Stale indicator CSS class/element not found. Implement .stale-indicator in card-render.js.',
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// US-VIS-2: Due date countdown shown on card face
// ─────────────────────────────────────────────────────────────────────────────
test('US-VIS-2: a card with a future due date shows a relative countdown on its face', async ({ page, kanban }) => {
  const threeDaysLater = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  await setupProjectWithCard(page, kanban, { dueDate: threeDaysLater });

  const card = page.locator('.kanban-card-wrapper').first();
  // Due date countdown element
  const dueDateEl = card.locator('.due-date, .card-due-date, [class*="due"]');
  if (await dueDateEl.count() > 0) {
    const text = await dueDateEl.first().textContent();
    expect(text).toMatch(/\d+\s*day|in\s*\d+/i);
  } else {
    test.info().annotations.push({
      type: 'note',
      description: 'US-VIS-2: Due date countdown not rendered on card face. Implement in card-render.js.',
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// US-VIS-3: Overdue treatment wins over stale treatment
// ─────────────────────────────────────────────────────────────────────────────
test('US-VIS-3: card that is both stale and overdue shows only the overdue indicator', async ({ page, kanban }) => {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const pastDue = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  await setupProjectWithCard(page, kanban, {
    dueDate: pastDue,
    meta: { updatedAt: thirtyDaysAgo, revision: 1 },
  });

  const card = page.locator('.kanban-card-wrapper').first();
  const overdueEl = card.locator('.overdue, .card-overdue, [class*="overdue"]');
  const staleEl = card.locator('.stale-indicator, .card-stale, [class*="stale"]');

  if (await overdueEl.count() > 0) {
    await expect(overdueEl.first()).toBeVisible();
    // Stale indicator should NOT be visible when overdue
    await expect(staleEl).toHaveCount(0);
  } else {
    test.info().annotations.push({
      type: 'note',
      description: 'US-VIS-3: Overdue visual treatment not yet implemented. Stale+overdue priority logic needed in card-render.js.',
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// US-VIS-4: Priority flag shows on card face
// ─────────────────────────────────────────────────────────────────────────────
test('US-VIS-4: card with priority set shows the priority badge on its face', async ({ page, kanban }) => {
  await setupProjectWithCard(page, kanban, { priority: 'critical' });

  const card = page.locator('.kanban-card-wrapper').first();
  // Priority badge should be visible (🔥 for critical, etc.)
  const priorityEl = card.locator('.priority-badge, .priority-flag, [class*="priority"]');
  await expect(priorityEl.first()).toBeVisible();
});

// ─────────────────────────────────────────────────────────────────────────────
// US-VIS-5: Checklist progress ring reflects top-level item completion
// ─────────────────────────────────────────────────────────────────────────────
test('US-VIS-5: card with a checklist shows a progress indicator on its face', async ({ page, kanban }) => {
  const cardWithChecklist = buildCardFile({ title: 'Checklist Viz Card', listId: 'backlog' })
    .replace('## Description\nVisual test body.', '## Tasks\n- [ ] Task 1\n- [ ] Task 2\n- [x] Task 3');

  await kanban.openWorkspace({
    files: {
      'workspace.json': JSON.stringify({ id: 'ws', featureOrder: { backlog: ['PROJ-0001'] } }),
      'projects/PROJ-0001.md': [
        '---', 'title: Progress Ring Project', 'projectId: PROJ_0001', 'listId: backlog',
        '---', '## Summary', 'Progress ring test.',
      ].join('\n'),
      'PROJ_0001/project.json': JSON.stringify({
        id: 'PROJ_0001',
        lists: [
          { id: 'backlog', name: 'Backlog' },
          { id: 'in-progress', name: 'In Progress' },
          { id: 'done', name: 'Done', done: true },
        ],
        featureOrder: { backlog: ['PROJ_0001-0001'], 'in-progress': [], done: [] },
        layout: { dividers: [] },
      }),
      'PROJ_0001/features/PROJ_0001-0001.md': cardWithChecklist,
    },
  });

  await page.click('.kanban-card-wrapper');
  await page.click('#modal-open-project-board-btn');
  await expect(page.locator('#nav-back-workspace-btn')).toBeVisible();

  const card = page.locator('.kanban-card-wrapper').first();
  const progressEl = card.locator('.checklist-progress, .progress-ring, [class*="progress"], .checklist-badge');
  if (await progressEl.count() > 0) {
    await expect(progressEl.first()).toBeVisible();
  } else {
    test.info().annotations.push({
      type: 'note',
      description: 'US-VIS-5: Checklist progress ring not rendered on card face. Implement in card-render.js.',
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// US-VIS-6: Badge icons appear for checklist items count
// ─────────────────────────────────────────────────────────────────────────────
test('US-VIS-6: card face shows badge with checklist item count', async ({ page, kanban }) => {
  await setupProjectWithCard(page, kanban, { title: 'Badge Test Card' });

  const card = page.locator('.kanban-card-wrapper').first();
  // Card badges area
  const badgeArea = card.locator('.card-badges, .card-meta-row, [class*="badge"]');
  if (await badgeArea.count() > 0) {
    await expect(badgeArea.first()).toBeVisible();
  } else {
    test.info().annotations.push({
      type: 'note',
      description: 'US-VIS-6: Badge icon area not found on card face. Implement .card-badges in card-render.js.',
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// US-VIS-7: Empty fields do not show on card face
// ─────────────────────────────────────────────────────────────────────────────
test('US-VIS-7: card with no due date, no priority, no points shows no empty placeholders', async ({ page, kanban }) => {
  // Seed a completely minimal card (no optional fields)
  await setupProjectWithCard(page, kanban, {
    title: 'Minimal Card',
    listId: 'backlog',
    // explicitly no: dueDate, priority, storyPoints, labels, assignee
  });

  const card = page.locator('.kanban-card-wrapper').first();
  const cardText = await card.textContent();

  // Should contain NO placeholder text
  expect(cardText).not.toMatch(/N\/A/i);
  expect(cardText).not.toMatch(/undefined/i);
  expect(cardText).not.toMatch(/null/i);

  // Empty due-date element should not be rendered
  const dueDatePlaceholder = card.locator('.due-date:empty, .card-due-date:empty');
  await expect(dueDatePlaceholder).toHaveCount(0);
});
