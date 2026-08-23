/**
 * Tier 9 — PRD Audit Gap Regression Tests
 * Tests the 8 specific gaps identified in the PRD compliance audit.
 * These tests FAIL before the fixes and PASS after.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { CardModal } from '../js/card-modal.js';
import { AppState } from '../js/state.js';
import { MockFileSystemAdapter } from '../js/filesystem.js';
import { SoloDb } from '../js/db.js';
import { WorkspaceManager } from '../js/workspace.js';
import { BoardRenderer } from '../js/board.js';
import { SettingsModal } from '../js/settings.js';
import { computeContentHash } from '../js/hash.js';
import { serializeCardFile } from '../js/yaml.js';

// ─────────────────────────────────────────────────────────────────────────────
// GAP #1: Auto-merge must work without explicit baseCard in production path
// The fix: store baseCard on open() and pass it to attemptAutoMerge()
// ─────────────────────────────────────────────────────────────────────────────
describe('Gap #1 — Auto-Merge Production Path (baseCard Required)', () => {

  it('open() stores baseCard so attemptAutoMerge can detect disjoint edits', () => {
    const appState = new AppState();
    const db = new SoloDb();
    appState.db = db;
    db.labels = [];
    db.fields = [];
    db.featureTypes = [];
    appState.fsAdapter = new MockFileSystemAdapter({});

    const modal = new CardModal(appState, () => {});
    const card = {
      id: 'CARD-001',
      type: 'feature',
      frontmatter: { title: 'Test Card', priority: 'medium', meta: { revision: 1 } },
      body: '## Description\nOriginal description.\n\n## Validation\nOriginal validation.',
      _filePath: 'PROJ_1/features/CARD-001.md'
    };

    modal.open(card);

    assert.ok(modal.baseCard !== undefined && modal.baseCard !== null,
      'open() must set this.baseCard for auto-merge to work (Gap #1 fix)');
    assert.equal(modal.baseCard.body, card.body,
      'baseCard.body must equal the card body at open time');
    assert.equal(modal.baseCard.frontmatter.title, 'Test Card',
      'baseCard.frontmatter must equal the card frontmatter at open time');
  });

  it('disjoint concurrent edits auto-merge without merge modal when baseCard is set', async () => {
    const baseBody = '## Description\nOriginal.\n\n## Validation\nOriginal validation.';
    const baseHash = await computeContentHash({ title: 'Card A' }, baseBody);

    const initialContent = serializeCardFile(
      { title: 'Card A', meta: { revision: 1, contentHash: baseHash, updatedAt: '2026-01-01T00:00:00Z' } },
      baseBody
    );

    const mockFs = new MockFileSystemAdapter({
      'PROJ_1/features/CARD-001.md': initialContent
    });

    const appState = new AppState();
    const db = new SoloDb(mockFs);
    appState.fsAdapter = mockFs;
    appState.db = db;
    db.labels = [];
    db.fields = [];
    db.featureTypes = [];

    let mergeModalShown = false;
    const modal = new CardModal(appState, () => {});
    modal.showMergeModal = () => { mergeModalShown = true; };

    const card = {
      id: 'CARD-001',
      type: 'feature',
      frontmatter: { title: 'Card A', meta: { revision: 1, contentHash: baseHash } },
      body: baseBody,
      _filePath: 'PROJ_1/features/CARD-001.md'
    };
    modal.open(card);

    // User edits Description (local)
    modal.card.body = '## Description\nUser edit.\n\n## Validation\nOriginal validation.';

    // Agent edits Validation concurrently (disk diverges)
    const agentBody = '## Description\nOriginal.\n\n## Validation\nAgent edit.';
    const agentHash = await computeContentHash({ title: 'Card A' }, agentBody);
    const agentContent = serializeCardFile(
      { title: 'Card A', meta: { revision: 2, contentHash: agentHash, updatedAt: '2026-02-01T00:00:00Z' } },
      agentBody
    );
    await mockFs.writeFile('PROJ_1/features/CARD-001.md', agentContent);

    // Save should auto-merge (not show modal) because sections are disjoint
    await modal.saveCard();

    assert.equal(mergeModalShown, false,
      'Disjoint concurrent edits must NOT show merge modal when baseCard is correctly stored (Gap #1)');

    const savedContent = await mockFs.readFile('PROJ_1/features/CARD-001.md');
    assert.ok(savedContent.includes('User edit'),
      'Saved file must contain local edit after auto-merge');
    assert.ok(savedContent.includes('Agent edit'),
      'Saved file must contain agent edit after auto-merge');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GAP #2: Soft-delete must also remove projects/<id>.md and update workspace.json
// ─────────────────────────────────────────────────────────────────────────────
describe('Gap #2 — Complete Soft-Delete (project card + workspace.json)', () => {

  it('after full soft-delete, projects/<id>.md is removed from filesystem', async () => {
    const mockFs = new MockFileSystemAdapter({
      'workspace.json': JSON.stringify({
        id: 'ws',
        featureOrder: { backlog: ['PROJ-0001'], 'in-progress': [], done: [] }
      }),
      'projects/PROJ-0001.md': '---\ntitle: My Project\nprojectId: PROJ_0001\n---\nBody.',
      'PROJ_0001/project.json': JSON.stringify({ id: 'PROJ_0001', lists: [], featureOrder: {} }),
    });

    const appState = new AppState();
    const db = new SoloDb(mockFs);
    appState.fsAdapter = mockFs;
    appState.db = db;

    db.projects.set('PROJ_0001', { id: 'PROJ_0001' });
    db.cards.set('PROJ-0001', {
      id: 'PROJ-0001', type: 'project',
      frontmatter: { title: 'My Project', projectId: 'PROJ_0001' },
      _filePath: 'projects/PROJ-0001.md', _isTrash: false
    });

    // Use WorkspaceManager.softDeleteProjectFull() (the fixed version)
    const manager = new WorkspaceManager(mockFs, db);
    await manager.softDeleteProjectFull('PROJ_0001');

    const cardFile = await mockFs.readFile('projects/PROJ-0001.md');
    assert.equal(cardFile, null,
      'projects/<id>.md must be deleted after full soft-delete (Gap #2 fix)');
  });

  it('after full soft-delete, workspace.json featureOrder no longer references the project', async () => {
    const mockFs = new MockFileSystemAdapter({
      'workspace.json': JSON.stringify({
        id: 'ws',
        featureOrder: { backlog: ['PROJ-0001'], 'in-progress': [], done: [] }
      }),
      'projects/PROJ-0001.md': '---\ntitle: My Project\nprojectId: PROJ_0001\n---\nBody.',
      'PROJ_0001/project.json': JSON.stringify({ id: 'PROJ_0001', lists: [], featureOrder: {} }),
    });

    const appState = new AppState();
    const db = new SoloDb(mockFs);
    appState.fsAdapter = mockFs;
    appState.db = db;

    db.projects.set('PROJ_0001', { id: 'PROJ_0001' });
    db.cards.set('PROJ-0001', {
      id: 'PROJ-0001', type: 'project',
      frontmatter: { title: 'My Project', projectId: 'PROJ_0001' },
      _filePath: 'projects/PROJ-0001.md', _isTrash: false
    });

    const manager = new WorkspaceManager(mockFs, db);
    await manager.softDeleteProjectFull('PROJ_0001');

    const wsStr = await mockFs.readFile('workspace.json');
    const ws = JSON.parse(wsStr);
    const allIds = Object.values(ws.featureOrder).flat();
    assert.ok(!allIds.includes('PROJ-0001'),
      'workspace.json featureOrder must not reference the deleted project after soft-delete (Gap #2 fix)');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GAP #3: Swimlane renderSwimlaneView groups.clear bug
// ─────────────────────────────────────────────────────────────────────────────
describe('Gap #3 — Swimlane Group Assignment (groups.clear bug)', () => {

  it('renderSwimlaneView renders all cards without duplicates or losses', () => {
    const appState = new AppState();
    const db = new SoloDb();
    appState.db = db;
    appState.filterSearch = '';
    appState.filterLabel = null;
    appState.filterAssignee = null;
    appState.filterType = null;
    appState.filterPriority = null;
    appState.activePresenceMap = new Map();
    appState.preferencesManager = {
      preferences: { board: { swimlaneBy: 'priority', collapsedLists: [] }, card: {} }
    };

    const cards = [
      { id: 'C1', projectId: 'PROJ_1', type: 'feature', frontmatter: { title: 'Card 1', priority: 'high', listId: 'backlog' }, body: '' },
      { id: 'C2', projectId: 'PROJ_1', type: 'feature', frontmatter: { title: 'Card 2', priority: 'high', listId: 'backlog' }, body: '' },
      { id: 'C3', projectId: 'PROJ_1', type: 'feature', frontmatter: { title: 'Card 3', priority: 'medium', listId: 'in-progress' }, body: '' },
    ];
    for (const c of cards) db.cards.set(c.id, c);
    db.projects.set('PROJ_1', {
      id: 'PROJ_1',
      lists: [{ id: 'backlog', name: 'Backlog' }, { id: 'in-progress', name: 'In Progress' }],
      featureOrder: { backlog: ['C1', 'C2'], 'in-progress': ['C3'] },
      layout: { dividers: [] }
    });

    appState.currentView = 'project';
    appState.currentProjectId = 'PROJ_1';

    const renderer = new BoardRenderer(appState);
    const mockContainer = { style: {}, innerHTML: '' };
    renderer.renderBoard(mockContainer);
    const html = mockContainer.innerHTML;

    // Count card wrapper occurrences — each card must appear exactly once in the rendered output
    const c1count = (html.match(/class="kanban-card-wrapper" data-card-id="C1"/g) || []).length;
    const c2count = (html.match(/class="kanban-card-wrapper" data-card-id="C2"/g) || []).length;
    const c3count = (html.match(/class="kanban-card-wrapper" data-card-id="C3"/g) || []).length;

    assert.equal(c1count, 1, 'C1 must appear exactly once in swimlane view (no duplicates from groups.clear bug)');
    assert.equal(c2count, 1, 'C2 must appear exactly once in swimlane view');
    assert.equal(c3count, 1, 'C3 must appear exactly once in swimlane view');

    // Both priority groups must be present
    assert.ok(html.includes('high') || html.includes('High'), 'high priority group must appear in swimlane');
    assert.ok(html.includes('medium') || html.includes('Medium'), 'medium priority group must appear in swimlane');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GAP #4: Card modal shows presence warning when agent is active
// ─────────────────────────────────────────────────────────────────────────────
describe('Gap #4 — Card Modal Presence Warning', () => {

  it('buildModalHtml() includes presence warning when active agent is editing the card', () => {
    const appState = new AppState();
    const db = new SoloDb();
    appState.db = db;
    db.labels = [];
    db.fields = [];
    db.featureTypes = [];
    appState.fsAdapter = new MockFileSystemAdapter({});

    appState.activePresenceMap.set('CARD-001', [{
      actor: 'agent:claude-code-v1',
      actorType: 'agent',
      intent: 'editing',
      heartbeatAt: new Date().toISOString(),
      ttlSeconds: 30
    }]);

    const modal = new CardModal(appState, () => {});
    modal.card = {
      id: 'CARD-001', type: 'feature',
      frontmatter: { title: 'Presence Card' },
      body: '## Description\nBody.',
      _filePath: 'PROJ_1/features/CARD-001.md'
    };
    modal.isRawMarkdown = false;

    // buildModalHtml should be a method that returns the HTML string
    const html = modal.buildModalHtml();

    assert.ok(
      html.includes('presence-warning') || html.includes('agent-warning'),
      'Modal HTML must contain a presence warning element (Gap #4)'
    );
    assert.ok(
      html.includes('agent:claude-code-v1'),
      'Presence warning must include the agent actor name (Gap #4)'
    );
  });

  it('buildModalHtml() has NO presence warning when no agent is active', () => {
    const appState = new AppState();
    const db = new SoloDb();
    appState.db = db;
    db.labels = [];
    db.fields = [];
    db.featureTypes = [];
    appState.fsAdapter = new MockFileSystemAdapter({});
    // No active presence

    const modal = new CardModal(appState, () => {});
    modal.card = {
      id: 'CARD-002', type: 'feature',
      frontmatter: { title: 'Quiet Card' },
      body: '## Description\nBody.',
      _filePath: 'PROJ_1/features/CARD-002.md'
    };
    modal.isRawMarkdown = false;

    const html = modal.buildModalHtml();
    assert.ok(
      !html.includes('presence-warning') && !html.includes('agent-warning'),
      'Modal HTML must NOT show presence warning when no agent is active'
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GAP #5: Settings tabs Custom Fields and Feature Types are functional
// ─────────────────────────────────────────────────────────────────────────────
describe('Gap #5 — Settings Custom Fields & Feature Types Tabs', () => {

  it('"fields" tab renders field list rows, not placeholder text', () => {
    const appState = new AppState();
    const db = new SoloDb();
    appState.db = db;
    db.fields = [
      { key: 'sprint', label: 'Sprint Number', type: 'text', cardVisible: false },
    ];
    appState.preferencesManager = { preferences: { board: {}, card: {}, ui: {} } };
    appState.fsAdapter = new MockFileSystemAdapter({});

    const modal = new SettingsModal(appState, () => {});
    modal.activeTab = 'fields';
    const html = modal.renderTabContent();

    assert.ok(!html.includes('Configuration tab view'),
      '"fields" tab must NOT render the generic placeholder (Gap #5)');
    assert.ok(
      html.includes('Sprint Number') || html.includes('sprint'),
      '"fields" tab must render the defined custom fields'
    );
  });

  it('"types" tab renders feature type list, not placeholder text', () => {
    const appState = new AppState();
    const db = new SoloDb();
    appState.db = db;
    db.featureTypes = [
      { id: 'feature', name: 'Feature / Capability', color: '#0984e3', bodySections: [], frontmatterFields: [] },
    ];
    appState.preferencesManager = { preferences: { board: {}, card: {}, ui: {} } };
    appState.fsAdapter = new MockFileSystemAdapter({});

    const modal = new SettingsModal(appState, () => {});
    modal.activeTab = 'types';
    const html = modal.renderTabContent();

    assert.ok(!html.includes('Configuration tab view'),
      '"types" tab must NOT render the generic placeholder (Gap #5)');
    assert.ok(
      html.includes('Feature / Capability') || html.includes('feature'),
      '"types" tab must render the defined feature types'
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GAP #6: Preferences tab must include showAgentBadge toggle
// ─────────────────────────────────────────────────────────────────────────────
describe('Gap #6 — Preferences Tab showAgentBadge Toggle', () => {

  it('Preferences tab HTML includes an agent badge toggle control', () => {
    const appState = new AppState();
    const db = new SoloDb();
    appState.db = db;
    appState.preferencesManager = {
      preferences: {
        board: { background: '#0f172a' },
        card: { staleAfterDays: 7, showAgentBadge: true },
        ui: { darkMode: false }
      }
    };
    appState.fsAdapter = new MockFileSystemAdapter({});

    const modal = new SettingsModal(appState, () => {});
    modal.activeTab = 'preferences';
    const html = modal.renderTabContent();

    assert.ok(
      html.includes('pref-agent-badges') || html.includes('showAgentBadge') ||
      html.includes('agent-badge') || html.includes('Agent Badge') || html.includes('agent badges'),
      'Preferences tab must include a toggle for agent presence badges (Gap #6)'
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GAP #7: Workspace board uses workspace.json lists, not hardcoded defaults
// ─────────────────────────────────────────────────────────────────────────────
describe('Gap #7 — Board Renderer Uses workspace.json Lists for Workspace View', () => {

  it('workspace board renders using lists from workspace.json, not hardcoded backlog/in-progress/done', () => {
    const appState = new AppState();
    const db = new SoloDb();
    appState.db = db;
    appState.filterSearch = '';
    appState.filterLabel = null;
    appState.filterAssignee = null;
    appState.filterType = null;
    appState.filterPriority = null;
    appState.activePresenceMap = new Map();
    appState.preferencesManager = {
      preferences: { board: { collapsedLists: [] }, card: {} }
    };

    // Store custom workspace config (the fix reads from db.workspaceConfig)
    db.workspaceConfig = {
      id: 'ws',
      lists: [
        { id: 'ideas', name: 'Ideas' },
        { id: 'planned', name: 'Planned' },
        { id: 'shipped', name: 'Shipped', done: true },
      ],
      featureOrder: { ideas: [], planned: [], shipped: [] },
      layout: { dividers: [] }
    };

    appState.currentView = 'workspace';

    const renderer = new BoardRenderer(appState);
    const mockContainer = { style: {}, innerHTML: '' };
    renderer.renderBoard(mockContainer);
    const html = mockContainer.innerHTML;

    // Custom list names must appear
    assert.ok(html.includes('Ideas'), 'Custom list "Ideas" must appear (Gap #7 fix)');
    assert.ok(html.includes('Planned'), 'Custom list "Planned" must appear (Gap #7 fix)');
    assert.ok(html.includes('Shipped'), 'Custom list "Shipped" must appear (Gap #7 fix)');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GAP #8: initializeWorkspace creates agents.json
// ─────────────────────────────────────────────────────────────────────────────
describe('Gap #8 — initializeWorkspace Creates agents.json', () => {

  it('initializeWorkspace creates .solokanban/agents.json if not present', async () => {
    const mockFs = new MockFileSystemAdapter({});
    const db = new SoloDb(mockFs);
    const manager = new WorkspaceManager(mockFs, db);

    await manager.initializeWorkspace();

    const agentsJson = await mockFs.readFile('.solokanban/agents.json');
    assert.ok(agentsJson !== null,
      '.solokanban/agents.json must be created by initializeWorkspace() (Gap #8)');
    assert.doesNotThrow(() => JSON.parse(agentsJson),
      'agents.json must contain valid JSON');
  });

  it('initializeWorkspace does NOT overwrite an existing agents.json', async () => {
    const existingAgents = JSON.stringify([{ id: 'claude', label: 'Claude Code' }]);
    const mockFs = new MockFileSystemAdapter({
      '.solokanban/agents.json': existingAgents
    });
    const db = new SoloDb(mockFs);
    const manager = new WorkspaceManager(mockFs, db);

    await manager.initializeWorkspace();

    const agentsJson = await mockFs.readFile('.solokanban/agents.json');
    assert.equal(agentsJson, existingAgents,
      'initializeWorkspace must not overwrite an existing agents.json (existing user data)');
  });
});
