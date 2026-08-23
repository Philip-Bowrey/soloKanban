/**
 * E2E Tests — Area B: Workspace Board & Project Management
 * User Stories: US-PROJ-1 through US-PROJ-6
 *
 * Covers: create project, click card → modal (not board), "Open Project Board",
 * breadcrumb navigation, delete to trash with confirmation.
 */

import { test, expect } from './fixtures/kanban-fixture.js';

// ─────────────────────────────────────────────────────────────────────────────
// US-PROJ-1: Create a new project
// ─────────────────────────────────────────────────────────────────────────────
test('US-PROJ-1: creating a project adds a card to the workspace board', async ({ page, kanban }) => {
  await kanban.openWorkspace();
  await kanban.createProject('Alpha Launch');

  // Card appears on board
  await expect(page.locator('.kanban-card-wrapper')).toHaveCount(1);
  await expect(page.locator('.kanban-card-wrapper')).toContainText('Alpha Launch');

  // project.json file exists in virtual FS
  // (The project folder is PROJ_0001 based on the incrementing ID logic)
  const projectJson = await kanban.readMockFile('PROJ_0001/project.json');
  expect(projectJson).not.toBeNull();
  const parsed = JSON.parse(projectJson);
  expect(parsed.id).toBe('PROJ_0001');

  // projects/PROJ-0001.md exists
  const cardFile = await kanban.readMockFile('projects/PROJ-0001.md');
  expect(cardFile).toContain('Alpha Launch');
});

// ─────────────────────────────────────────────────────────────────────────────
// US-PROJ-2: Clicking a project card opens its edit modal (not the board)
// ─────────────────────────────────────────────────────────────────────────────
test('US-PROJ-2: clicking a project card opens the edit modal, not the project board', async ({ page, kanban }) => {
  await kanban.openWorkspace();
  await kanban.createProject('Beta Launch');

  // Close the auto-opened modal (createProject opens the card modal)
  await kanban.closeModal();

  // Click the card on the board
  await page.click('.kanban-card-wrapper');

  // Card modal is visible
  await expect(page.locator('#card-modal')).toBeVisible();

  // We are NOT on the project board yet (nav-back-workspace-btn should not exist)
  await expect(page.locator('#nav-back-workspace-btn')).toHaveCount(0);
});

// ─────────────────────────────────────────────────────────────────────────────
// US-PROJ-3: "Open Project Board" button inside modal navigates to project board
// ─────────────────────────────────────────────────────────────────────────────
test('US-PROJ-3: Open Project Board button inside the card modal navigates to project board', async ({ page, kanban }) => {
  await kanban.openWorkspace();
  await kanban.createProject('Gamma Launch');

  // Modal is already open; click the "Open Project Board" button
  await expect(page.locator('#modal-open-project-board-btn')).toBeVisible();
  await page.click('#modal-open-project-board-btn');

  // Modal is closed and we're now on the project board
  await expect(page.locator('#card-modal')).toHaveCount(0);
  await expect(page.locator('#nav-back-workspace-btn')).toBeVisible();
  await expect(page.locator('#breadcrumb-nav')).toContainText('PROJ_0001');
});

// ─────────────────────────────────────────────────────────────────────────────
// US-PROJ-4: Breadcrumb "Workspace" link returns to workspace board
// ─────────────────────────────────────────────────────────────────────────────
test('US-PROJ-4: breadcrumb shows Workspace / ProjectName and clicking Workspace returns', async ({ page, kanban }) => {
  await kanban.openWorkspace();
  await kanban.createProject('Delta Launch');

  // Navigate to project board
  await page.click('#modal-open-project-board-btn');
  await expect(page.locator('#nav-back-workspace-btn')).toBeVisible();

  // Breadcrumb has both "Workspace" link and project name
  await expect(page.locator('#breadcrumb-nav')).toContainText('Workspace');
  await expect(page.locator('#breadcrumb-nav')).toContainText('PROJ_0001');

  // Click breadcrumb to go back
  await page.click('#nav-back-workspace-btn');
  await expect(page.locator('#nav-back-workspace-btn')).toHaveCount(0);
  await expect(page.locator('#breadcrumb-nav')).toContainText('Workspace Board');
});

// ─────────────────────────────────────────────────────────────────────────────
// US-PROJ-5: Delete project removes card and moves files to trash
// ─────────────────────────────────────────────────────────────────────────────
test('US-PROJ-5: deleting a project removes the card immediately and moves files to trash', async ({ page, kanban }) => {
  await kanban.openWorkspace();
  await kanban.createProject('Epsilon Project');
  await kanban.closeModal();

  // Open settings → Projects tab
  await kanban.openSettings();
  await page.click('[data-tab="projects"]');
  await expect(page.locator('.btn-soft-delete-proj')).toBeVisible();

  // Accept the confirmation dialog
  page.once('dialog', dialog => dialog.accept());
  await page.click('.btn-soft-delete-proj');

  // Settings modal closes, board refreshes — no cards
  await expect(page.locator('#settings-modal')).toHaveCount(0);
  await expect(page.locator('.kanban-card-wrapper')).toHaveCount(0);

  // Files should be in trash, not in root
  const trashedProject = await page.evaluate(async () => {
    // Check that PROJ_0001 directory no longer exists at root
    try {
      await window.__mockRootHandle.getDirectoryHandle('PROJ_0001');
      return 'still_at_root';
    } catch (e) {
      return 'moved';
    }
  });
  expect(trashedProject).toBe('moved');
});

// ─────────────────────────────────────────────────────────────────────────────
// US-PROJ-6: Deleting a project requires an explicit confirmation step
// ─────────────────────────────────────────────────────────────────────────────
test('US-PROJ-6: project deletion requires confirm dialog before executing', async ({ page, kanban }) => {
  await kanban.openWorkspace();
  await kanban.createProject('Zeta Project');
  await kanban.closeModal();

  await kanban.openSettings();
  await page.click('[data-tab="projects"]');
  await expect(page.locator('.btn-soft-delete-proj')).toBeVisible();

  // Dismiss the dialog (cancel)
  page.once('dialog', dialog => dialog.dismiss());
  await page.click('.btn-soft-delete-proj');

  // Card should still be on board
  await page.click('#settings-close-btn');
  await expect(page.locator('.kanban-card-wrapper')).toHaveCount(1);
});
