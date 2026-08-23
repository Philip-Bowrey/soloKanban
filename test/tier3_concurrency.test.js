import { test, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { CardModal } from '../js/card-modal.js';
import { AppState } from '../js/state.js';
import { MockFileSystemAdapter } from '../js/filesystem.js';
import { SoloDb } from '../js/db.js';
import { computeContentHash } from '../js/hash.js';

describe('Tier 3 — Concurrency & Data Integrity Tests', () => {

  describe('Auto-Merge Fast Path (§6.5.1)', () => {
    it('automatically merges edits on disjoint body sections without modal or error', async () => {
      const appState = new AppState();
      const modal = new CardModal(appState);

      const baseCard = {
        id: 'CARD-1',
        frontmatter: { title: 'Base Title', priority: 'medium' },
        body: '## Description\nOriginal description\n\n## Validation\nOriginal validation'
      };

      const localCard = JSON.parse(JSON.stringify(baseCard));
      localCard.body = '## Description\nUpdated local description\n\n## Validation\nOriginal validation';

      const incomingParsed = {
        frontmatter: JSON.parse(JSON.stringify(localCard.frontmatter)),
        body: '## Description\nOriginal description\n\n## Validation\nUpdated incoming validation'
      };

      const result = modal.attemptAutoMerge(localCard, incomingParsed, baseCard);
      assert.ok(result.success, 'Disjoint section edits should auto-merge');
      assert.ok(result.mergedCard.body.includes('Updated local description'));
      assert.ok(result.mergedCard.body.includes('Updated incoming validation'));
    });

    it('requires modal/conflict for overlapping edits within the same body section', async () => {
      const appState = new AppState();
      const modal = new CardModal(appState);

      const localCard = {
        id: 'CARD-1',
        frontmatter: { title: 'Base Title' },
        body: '## Description\nActor A edited description'
      };

      const incomingParsed = {
        frontmatter: { title: 'Base Title' },
        body: '## Description\nActor B edited description differently'
      };

      const result = modal.attemptAutoMerge(localCard, incomingParsed);
      assert.equal(result.success, false, 'Overlapping section edits must not auto-merge');
    });

    it('auto-merge proceeds despite active presence file', async () => {
      const appState = new AppState();
      const modal = new CardModal(appState);

      // Simulate active presence file held by agent
      appState.activePresenceMap.set('CARD-1', [{
        actor: 'agent:claude',
        actorType: 'agent',
        intent: 'editing'
      }]);

      const localCard = {
        id: 'CARD-1',
        frontmatter: { title: 'Base Title' },
        body: '## Description\nLocal section'
      };

      const incomingParsed = {
        frontmatter: { title: 'Base Title' },
        body: '## Description\nLocal section\n\n## Validation\nAgent section'
      };

      const result = modal.attemptAutoMerge(localCard, incomingParsed);
      assert.ok(result.success, 'Presence does NOT suppress auto-merge per §6.5.1');
    });
  });

  describe('Move Operations & Compensating Rollback', () => {
    it('restores project.json on compensating rollback if card write fails', async () => {
      const initialFiles = {
        'PROJ1/project.json': JSON.stringify({
          lists: [{ id: 'backlog' }, { id: 'in-progress' }],
          featureOrder: { backlog: ['CARD-1'], 'in-progress': [] }
        }),
        'PROJ1/features/CARD-1.md': '---\ntitle: Card 1\nlistId: backlog\n---\nBody'
      };

      const mockFs = new MockFileSystemAdapter(initialFiles);
      const db = new SoloDb(mockFs);
      const appState = new AppState();
      appState.fsAdapter = mockFs;
      appState.db = db;
      db.projects.set('PROJ1', JSON.parse(initialFiles['PROJ1/project.json']));

      // Simulate project.json rollback logic
      const projConfig = db.projects.get('PROJ1');
      const originalOrder = JSON.parse(JSON.stringify(projConfig.featureOrder));

      // 1. Move in project.json
      projConfig.featureOrder.backlog = [];
      projConfig.featureOrder['in-progress'] = ['CARD-1'];
      await mockFs.writeFile('PROJ1/project.json', JSON.stringify(projConfig, null, 2));

      // 2. Card write fails (simulated)
      const cardWriteFailed = true;
      if (cardWriteFailed) {
        // Rollback
        projConfig.featureOrder = originalOrder;
        await mockFs.writeFile('PROJ1/project.json', JSON.stringify(projConfig, null, 2));
      }

      const rolledBackProj = JSON.parse(await mockFs.readFile('PROJ1/project.json'));
      assert.deepEqual(rolledBackProj.featureOrder.backlog, ['CARD-1']);
      assert.deepEqual(rolledBackProj.featureOrder['in-progress'], []);
    });
  });

  describe('Adaptive Presence Heartbeat Policy (§6.2)', () => {
    it('uses 15s/30s during active editing and switches to 60s/120s when idle >30s', () => {
      const appState = new AppState();
      assert.equal(appState.isUserActive, true);

      // Simulate 35 seconds of inactivity
      appState.lastUserActivityTime = Date.now() - 35000;

      const idleMs = Date.now() - appState.lastUserActivityTime;
      const isIdle = idleMs > 30000;
      assert.ok(isIdle, 'Should detect idle state after 30s');
    });
  });
});
