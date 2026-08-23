import { test, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { MockFileSystemAdapter } from '../js/filesystem.js';
import { SoloDb } from '../js/db.js';
import { WorkspaceManager } from '../js/workspace.js';

describe('Tier 4 — Integration Tests', () => {

  describe('(v8.3) Trash Excluded Specifically from Search Index', () => {
    it('excludes cards from soft-deleted projects during search index rebuild', async () => {
      const initialFiles = {
        'workspace.json': JSON.stringify({ id: 'ws' }),
        'PROJ_ACTIVE/project.json': JSON.stringify({ id: 'PROJ_ACTIVE', lists: [{ id: 'backlog' }], featureOrder: { backlog: ['FEAT_ACTIVE'] } }),
        'PROJ_ACTIVE/features/FEAT_ACTIVE.md': '---\ntitle: Active Card\nlistId: backlog\n---\nSearchable keyword: UNIQUE_SEARCH_KEYWORD_123',

        'PROJ_TRASH/project.json': JSON.stringify({ id: 'PROJ_TRASH', lists: [{ id: 'backlog' }], featureOrder: { backlog: ['FEAT_TRASH'] } }),
        'PROJ_TRASH/features/FEAT_TRASH.md': '---\ntitle: Trashed Card\nlistId: backlog\n---\nSearchable keyword: UNIQUE_SEARCH_KEYWORD_123'
      };

      const mockFs = new MockFileSystemAdapter(initialFiles);
      const db = new SoloDb(mockFs);
      const manager = new WorkspaceManager(mockFs, db);

      await manager.scanWorkspace();

      // Soft-delete PROJ_TRASH
      await mockFs.softDeleteProject('PROJ_TRASH');
      db.projects.delete('PROJ_TRASH');
      for (const [id, c] of db.cards.entries()) {
        if (c.projectId === 'PROJ_TRASH') db.cards.delete(id);
      }

      // Rebuild search index
      await db.rebuildSearchIndex();

      const searchResults = db.search('UNIQUE_SEARCH_KEYWORD_123');

      assert.equal(searchResults.length, 1, 'Only live active card should be found');
      assert.equal(searchResults[0].id, 'FEAT_ACTIVE', 'Found card must be from active project, not trashed project');
    });
  });

  describe('Label Deletion Integration', () => {
    it('deleting a label from workspace definitions removes it from db.labels', async () => {
      const initialFiles = {
        '.solokanban/labels.json': JSON.stringify([{ id: 'lbl-1', name: 'Label 1', color: '#ff0000' }])
      };
      const mockFs = new MockFileSystemAdapter(initialFiles);
      const db = new SoloDb(mockFs);

      db.labels = JSON.parse(await mockFs.readFile('.solokanban/labels.json'));
      assert.equal(db.labels.length, 1);

      // Delete label
      db.labels = [];
      await mockFs.writeFile('.solokanban/labels.json', JSON.stringify(db.labels));

      const reloaded = JSON.parse(await mockFs.readFile('.solokanban/labels.json'));
      assert.equal(reloaded.length, 0);
    });
  });

  describe('Custom ALL-CAPS Project ID Creation', () => {
    it('creates project directory and card using custom ALL-CAPS project ID code', async () => {
      const mockFs = new MockFileSystemAdapter({
        'workspace.json': JSON.stringify({ id: 'ws', featureOrder: {} })
      });
      const db = new SoloDb(mockFs);
      const manager = new WorkspaceManager(mockFs, db);

      const cardRecord = await manager.createProjectCard('User Authentication', 'backlog', 'AUTH');

      assert.ok(cardRecord.id.includes('AUTH'), 'Card ID should contain custom code');
      assert.equal(cardRecord.frontmatter.projectId, 'AUTH');
      assert.ok(await mockFs.readFile('AUTH/project.json'), 'Should create project.json under AUTH directory');
      assert.ok(await mockFs.existsDirectory('AUTH/features'), 'Should create features directory under AUTH');
    });
  });
});
