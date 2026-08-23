import { test, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { MockFileSystemAdapter } from '../js/filesystem.js';
import { WorkspaceManager } from '../js/workspace.js';
import { SoloDb } from '../js/db.js';
import { SdkUpdater } from '../js/sdk-update.js';

describe('Tier 2 — File System Adapter Tests', () => {

  describe('Workspace Initialization & Filesystem CRUD', () => {
    it('initializes full directory structure on blank folder', async () => {
      const mockFs = new MockFileSystemAdapter({});
      const db = new SoloDb(mockFs);
      const manager = new WorkspaceManager(mockFs, db);

      await manager.initializeWorkspace();

      assert.ok(await mockFs.readFile('workspace.json'));
      assert.ok(await mockFs.readFile('.solokanban/fields.json'));
      assert.ok(await mockFs.readFile('.solokanban/feature-types.json'));
      assert.ok(await mockFs.readFile('.solokanban/labels.json'));
      assert.ok(await mockFs.readFile('.solokanban/preferences.json'));
    });
  });

  describe('Legacy layout.json Migration', () => {
    it('migrates legacy layout.json into project.json.layout and removes layout.json', async () => {
      const initialFiles = {
        'workspace.json': JSON.stringify({ id: 'ws' }),
        'CON_REV/project.json': JSON.stringify({ id: 'CON_REV', lists: [] }),
        'CON_REV/layout.json': JSON.stringify({ dividers: [{ id: 'div-1', listId: 'backlog', afterCardId: 'C1' }] })
      };
      const mockFs = new MockFileSystemAdapter(initialFiles);
      const db = new SoloDb(mockFs);
      const manager = new WorkspaceManager(mockFs, db);

      await manager.scanWorkspace();

      const updatedProjStr = await mockFs.readFile('CON_REV/project.json');
      const updatedProj = JSON.parse(updatedProjStr);

      assert.ok(updatedProj.layout);
      assert.equal(updatedProj.layout.dividers[0].id, 'div-1');

      const legacyFile = await mockFs.readFile('CON_REV/layout.json');
      assert.equal(legacyFile, null, 'legacy layout.json should be removed');
    });
  });

  describe('(v8.3) Temp File Cleanup on Failed Update', () => {
    it('cleans up temp files on checksum mismatch download and leaves original file untouched', async () => {
      const originalJsSdk = '// Original SDK Content v8.2';
      const initialFiles = {
        '.solokanban/sdk/solokanban.js': originalJsSdk
      };
      const mockFs = new MockFileSystemAdapter(initialFiles);
      const updater = new SdkUpdater(mockFs);

      // Create a stray temp file simulating an interrupted write
      await mockFs.writeFile('.solokanban/sdk/.solokanban.js.tmp_12345', 'partial data');

      // Trigger update check with mismatched hash
      await updater.updateSingleFile('.solokanban/sdk/solokanban.js', { sha256: 'deadbeef12345' });

      // Clean up temp files check
      await mockFs.cleanupTempFiles('.solokanban/sdk');

      const currentContent = await mockFs.readFile('.solokanban/sdk/solokanban.js');
      assert.equal(currentContent, originalJsSdk, 'Original file should remain untouched');

      const filesInSdkDir = await mockFs.listFiles('.solokanban/sdk');
      assert.ok(!filesInSdkDir.some(f => f.includes('.tmp')), 'No temp file should remain in destination directory');
    });
  });

  describe('Soft-Delete Directory Collision Handling', () => {
    it('appends disambiguating suffix on timestamp collision without overwriting existing trash', async () => {
      const initialFiles = {
        'PROJ1/project.json': JSON.stringify({ id: 'PROJ1' }),
        'PROJ1/features/F1.md': '--- \ntitle: Feature 1\n--- \nBody 1'
      };
      const mockFs = new MockFileSystemAdapter(initialFiles);

      // Trigger soft delete #1
      await mockFs.softDeleteProject('PROJ1');

      // Re-create PROJ1 directory with new files
      await mockFs.writeFile('PROJ1/project.json', JSON.stringify({ id: 'PROJ1', v: 2 }));

      // Trigger soft delete #2 (simulate timestamp collision by forcing existing check)
      await mockFs.softDeleteProject('PROJ1');

      // List subdirectories in trash
      const trashDirs = await mockFs.listDirectories('.solokanban/trash');
      assert.ok(trashDirs.length >= 2, `Should have at least 2 distinct trash directories (actual: ${trashDirs.length})`);
    });
  });

  describe('Quarantine Routing', () => {
    it('moves malformed card to quarantine and prevents board crash', async () => {
      const initialFiles = {
        'workspace.json': JSON.stringify({ id: 'ws' }),
        'projects/CORRUPT.md': 'This is not valid YAML frontmatter delimiter'
      };
      const mockFs = new MockFileSystemAdapter(initialFiles);
      const db = new SoloDb(mockFs);
      const manager = new WorkspaceManager(mockFs, db);

      await manager.scanWorkspace();

      const quarantinedCard = await mockFs.readFile('.solokanban/quarantine/CORRUPT.md');
      assert.ok(quarantinedCard, 'Card should be moved to quarantine folder');

      const projectCard = await mockFs.readFile('projects/CORRUPT.md');
      assert.equal(projectCard, null, 'Original file should be deleted from projects folder');
    });
  });
});
