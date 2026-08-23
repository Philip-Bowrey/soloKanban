/**
 * SoloKanban Workspace Manager
 * Handles workspace initialization, dual-level board scanning, legacy layout migration, and move reconciliation.
 */

import { parseCardFile, serializeCardFile } from './yaml.js';
import { computeContentHash } from './hash.js';
import {
  DEFAULT_FEATURE_TYPES,
  DEFAULT_LABELS,
  DEFAULT_FIELDS,
  DEFAULT_PREFERENCES,
  DEFAULT_WORKSPACE_CONFIG
} from './defaults.js';

export class WorkspaceManager {
  constructor(fsAdapter, db) {
    this.fsAdapter = fsAdapter;
    this.db = db;
  }

  /**
   * Initializes a fresh workspace directory structure.
   */
  async initializeWorkspace() {
    await this.fsAdapter.ensureDirectory('.solokanban');
    await this.fsAdapter.ensureDirectory('.solokanban/sdk');
    await this.fsAdapter.ensureDirectory('.solokanban/skills');
    await this.fsAdapter.ensureDirectory('.solokanban/locks');
    await this.fsAdapter.ensureDirectory('.solokanban/presence');
    await this.fsAdapter.ensureDirectory('.solokanban/trash');
    await this.fsAdapter.ensureDirectory('.solokanban/quarantine');
    await this.fsAdapter.ensureDirectory('projects');
    await this.fsAdapter.ensureDirectory('attachments');

    // Create workspace.json if missing
    if (!(await this.fsAdapter.readFile('workspace.json'))) {
      await this.fsAdapter.writeFile('workspace.json', JSON.stringify(DEFAULT_WORKSPACE_CONFIG, null, 2));
    }

    // Create config files if missing
    if (!(await this.fsAdapter.readFile('.solokanban/fields.json'))) {
      await this.fsAdapter.writeFile('.solokanban/fields.json', JSON.stringify(DEFAULT_FIELDS, null, 2));
    }
    if (!(await this.fsAdapter.readFile('.solokanban/feature-types.json'))) {
      await this.fsAdapter.writeFile('.solokanban/feature-types.json', JSON.stringify(DEFAULT_FEATURE_TYPES, null, 2));
    }
    if (!(await this.fsAdapter.readFile('.solokanban/labels.json'))) {
      await this.fsAdapter.writeFile('.solokanban/labels.json', JSON.stringify(DEFAULT_LABELS, null, 2));
    }
    if (!(await this.fsAdapter.readFile('.solokanban/preferences.json'))) {
      await this.fsAdapter.writeFile('.solokanban/preferences.json', JSON.stringify(DEFAULT_PREFERENCES, null, 2));
    }
    if (!(await this.fsAdapter.readFile('.solokanban/agents.json'))) {
      await this.fsAdapter.writeFile('.solokanban/agents.json', JSON.stringify([], null, 2));
    }
  }

  /**
   * Scans and loads full workspace data into DB.
   */
  async scanWorkspace() {
    this.db.clear();

    // 1. Load config
    const labelsStr = await this.fsAdapter.readFile('.solokanban/labels.json');
    if (labelsStr) this.db.labels = JSON.parse(labelsStr);

    const fieldsStr = await this.fsAdapter.readFile('.solokanban/fields.json');
    if (fieldsStr) this.db.fields = JSON.parse(fieldsStr);

    const featureTypesStr = await this.fsAdapter.readFile('.solokanban/feature-types.json');
    if (featureTypesStr) this.db.featureTypes = JSON.parse(featureTypesStr);

    // 2. Load workspace config
    const workspaceConfigStr = await this.fsAdapter.readFile('workspace.json');
    const workspaceConfig = workspaceConfigStr ? JSON.parse(workspaceConfigStr) : DEFAULT_WORKSPACE_CONFIG;
    this.db.workspaceConfig = workspaceConfig;

    // 3. Scan workspace project cards (/projects/*.md)
    const projectCardFiles = await this.fsAdapter.listFiles('projects');
    for (const file of projectCardFiles) {
      if (file.endsWith('.md')) {
        const filePath = `projects/${file}`;
        const content = await this.fsAdapter.readFile(filePath);
        try {
          const parsed = parseCardFile(content);
          const cardId = file.replace('.md', '');
          this.db.cards.set(cardId, {
            id: cardId,
            type: 'project',
            frontmatter: parsed.frontmatter,
            body: parsed.body,
            _filePath: filePath,
            _isTrash: false
          });
        } catch (e) {
          await this.fsAdapter.quarantineCard(filePath);
        }
      }
    }

    // 4. Scan sub-project directories (exclude .solokanban, projects, attachments)
    const rootDirs = await this.fsAdapter.listDirectories('');
    for (const dirName of rootDirs) {
      if (dirName.startsWith('.')) continue; // skip hidden & .solokanban
      if (dirName === 'projects' || dirName === 'attachments') continue;

      // Check if project.json exists
      const projConfigStr = await this.fsAdapter.readFile(`${dirName}/project.json`);
      if (projConfigStr) {
        let projConfig = JSON.parse(projConfigStr);

        // Migrate legacy layout.json if present
        projConfig = await this.migrateLegacyLayout(dirName, projConfig);

        this.db.projects.set(dirName, projConfig);

        // Reconcile list assignments & scan feature cards
        await this.scanAndReconcileProject(dirName, projConfig);
      }
    }

    // Rebuild search index (excludes trash)
    await this.db.rebuildSearchIndex();
  }

  /**
   * Migrate legacy layout.json into project.json.layout
   */
  async migrateLegacyLayout(projectDir, projConfig) {
    const legacyLayoutStr = await this.fsAdapter.readFile(`${projectDir}/layout.json`);
    if (legacyLayoutStr) {
      try {
        const legacyLayout = JSON.parse(legacyLayoutStr);
        if (!projConfig.layout) {
          projConfig.layout = legacyLayout;
        } else if (legacyLayout.dividers) {
          projConfig.layout.dividers = legacyLayout.dividers;
        }
        // Write updated project.json
        await this.fsAdapter.writeFile(`${projectDir}/project.json`, JSON.stringify(projConfig, null, 2));
        // Remove legacy layout.json
        await this.fsAdapter.deleteFile(`${projectDir}/layout.json`);
      } catch (e) {}
    }
    return projConfig;
  }

  /**
   * Scan feature cards in project and reconcile partial failure list assignment.
   */
  async scanAndReconcileProject(projectId, projConfig) {
    const featureFiles = await this.fsAdapter.listFiles(`${projectId}/features`);
    const existingCardFiles = new Map();

    for (const file of featureFiles) {
      if (file.endsWith('.md')) {
        const cardId = file.replace('.md', '');
        const filePath = `${projectId}/features/${file}`;
        const content = await this.fsAdapter.readFile(filePath);
        try {
          const parsed = parseCardFile(content);
          existingCardFiles.set(cardId, { parsed, filePath });
        } catch (e) {
          await this.fsAdapter.quarantineCard(filePath);
        }
      }
    }

    // Reconcile list membership per PRD §6.4
    const lists = projConfig.lists || [];
    const listIds = lists.map(l => l.id);
    const featureOrder = projConfig.featureOrder || {};

    const cardToListMap = new Map();
    const allSeenCardIds = new Set();

    // 1. Process featureOrder in project.json
    for (const listId of listIds) {
      const order = featureOrder[listId] || [];
      const cleanOrder = [];

      for (const cardId of order) {
        if (!existingCardFiles.has(cardId)) continue; // File missing
        if (!cardToListMap.has(cardId)) {
          cardToListMap.set(cardId, listId);
          cleanOrder.push(cardId);
        }
        allSeenCardIds.add(cardId);
      }
      featureOrder[listId] = cleanOrder;
    }

    // 2. Any card file not in featureOrder -> append to backlog (first list)
    const backlogId = listIds[0] || 'backlog';
    if (!featureOrder[backlogId]) featureOrder[backlogId] = [];

    for (const [cardId, data] of existingCardFiles.entries()) {
      if (!allSeenCardIds.has(cardId)) {
        cardToListMap.set(cardId, backlogId);
        featureOrder[backlogId].push(cardId);
      }
    }

    // Update project.json if reconciled
    projConfig.featureOrder = featureOrder;
    await this.fsAdapter.writeFile(`${projectId}/project.json`, JSON.stringify(projConfig, null, 2));

    // 3. Update card file listId if modified
    for (const [cardId, listId] of cardToListMap.entries()) {
      const { parsed, filePath } = existingCardFiles.get(cardId);
      const isDoneList = lists.find(l => l.id === listId)?.done === true;

      let fileNeedsUpdate = false;
      if (parsed.frontmatter.listId !== listId) {
        parsed.frontmatter.listId = listId;
        fileNeedsUpdate = true;
      }

      if (isDoneList && !parsed.frontmatter.meta?.deliveredAt) {
        if (!parsed.frontmatter.meta) parsed.frontmatter.meta = {};
        parsed.frontmatter.meta.deliveredAt = new Date().toISOString();
        fileNeedsUpdate = true;
      } else if (!isDoneList && parsed.frontmatter.meta?.deliveredAt) {
        delete parsed.frontmatter.meta.deliveredAt;
        fileNeedsUpdate = true;
      }

      if (fileNeedsUpdate) {
        parsed.frontmatter.meta = parsed.frontmatter.meta || {};
        parsed.frontmatter.meta.revision = (parsed.frontmatter.meta.revision || 1) + 1;
        parsed.frontmatter.meta.updatedAt = new Date().toISOString();
        parsed.frontmatter.meta.contentHash = await computeContentHash(parsed.frontmatter, parsed.body);

        const newContent = serializeCardFile(parsed.frontmatter, parsed.body);
        await this.fsAdapter.writeFile(filePath, newContent);
      }

      this.db.cards.set(cardId, {
        id: cardId,
        projectId,
        frontmatter: parsed.frontmatter,
        body: parsed.body,
        _filePath: filePath,
        _isTrash: false
      });
    }
  }

  /**
   * Creates a new project card and initializes its project board directory.
   * Supports custom ALL-CAPS project IDs (e.g., AUTH, BILLING).
   */
  async createProjectCard(title = 'New Project', listId = 'backlog', customProjId = '') {
    let projCode, cardId;

    if (customProjId && customProjId.trim()) {
      const cleanId = customProjId.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
      projCode = cleanId;
      cardId = cleanId.startsWith('PROJ-') ? cleanId : (cleanId.startsWith('PROJ_') ? cleanId.replace('_', '-') : `PROJ-${cleanId}`);
      // Ensure unique cardId and projCode
      let counter = 1;
      let finalCardId = cardId;
      let finalProjCode = projCode;
      while (this.db.cards.has(finalCardId) || this.db.projects.has(finalProjCode)) {
        finalCardId = `${cardId}-${counter}`;
        finalProjCode = `${projCode}_${counter}`;
        counter++;
      }
      cardId = finalCardId;
      projCode = finalProjCode;
    } else {
      let maxNum = 0;
      for (const cId of this.db.cards.keys()) {
        if (cId.startsWith('PROJ-')) {
          const num = parseInt(cId.replace('PROJ-', ''), 10);
          if (!isNaN(num) && num > maxNum) maxNum = num;
        }
      }
      const nextNumStr = String(maxNum + 1).padStart(4, '0');
      projCode = `PROJ_${nextNumStr}`;
      cardId = `PROJ-${nextNumStr}`;
    }

    const frontmatter = {
      title,
      projectId: projCode,
      listId,
      status: 'active',
      meta: {
        revision: 1,
        updatedAt: new Date().toISOString(),
        updatedBy: 'human'
      }
    };
    const body = `## Project Summary\nBrief overview of the project goal...\n\n## Scope & Boundaries\nKey deliverables...\n\n## Activity Log\n- [${new Date().toISOString()}] Project card created`;
    frontmatter.meta.contentHash = await computeContentHash(frontmatter, body);

    const filePath = `projects/${cardId}.md`;
    await this.fsAdapter.writeFile(filePath, serializeCardFile(frontmatter, body));

    await this.fsAdapter.ensureDirectory(projCode);
    await this.fsAdapter.ensureDirectory(`${projCode}/features`);
    await this.fsAdapter.ensureDirectory(`${projCode}/wiki`);

    const projConfig = {
      id: projCode,
      lists: [
        { id: 'backlog', name: 'Backlog' },
        { id: 'in-progress', name: 'In Progress' },
        { id: 'done', name: 'Done', done: true }
      ],
      featureOrder: { backlog: [], 'in-progress': [], done: [] },
      layout: { dividers: [] }
    };
    await this.fsAdapter.writeFile(`${projCode}/project.json`, JSON.stringify(projConfig, null, 2));

    const wsConfigStr = await this.fsAdapter.readFile('workspace.json');
    const wsConfig = wsConfigStr ? JSON.parse(wsConfigStr) : { featureOrder: {} };
    if (!wsConfig.featureOrder) wsConfig.featureOrder = {};
    if (!wsConfig.featureOrder[listId]) wsConfig.featureOrder[listId] = [];
    wsConfig.featureOrder[listId].push(cardId);
    await this.fsAdapter.writeFile('workspace.json', JSON.stringify(wsConfig, null, 2));
    // Keep in-memory workspaceConfig in sync so board ordering reflects the new card
    this.db.workspaceConfig = wsConfig;

    const cardRecord = {
      id: cardId,
      type: 'project',
      frontmatter,
      body,
      _filePath: filePath,
      _isTrash: false
    };
    this.db.cards.set(cardId, cardRecord);
    this.db.projects.set(projCode, projConfig);
    await this.db.rebuildSearchIndex();

    return cardRecord;
  }

  /**
   * Creates a new feature card under a project.
   */
  async createFeatureCard(projectId, type = 'feature', title = 'New Feature', listId = 'backlog') {
    let maxNum = 0;
    const prefix = `${projectId}-`;
    for (const cardId of this.db.cards.keys()) {
      if (cardId.startsWith(prefix)) {
        const num = parseInt(cardId.replace(prefix, ''), 10);
        if (!isNaN(num) && num > maxNum) maxNum = num;
      }
    }
    const nextNumStr = String(maxNum + 1).padStart(4, '0');
    const cardId = `${projectId}-${nextNumStr}`;

    const frontmatter = {
      title,
      listId,
      priority: 'medium',
      assignee: '',
      meta: {
        revision: 1,
        updatedAt: new Date().toISOString(),
        updatedBy: 'human'
      }
    };

    const featureTypeDef = (this.db.featureTypes || []).find(t => t.id === type);
    let bodySections = [];
    if (featureTypeDef && featureTypeDef.bodySections) {
      for (const sec of featureTypeDef.bodySections) {
        if (sec.type === 'checklist') {
          bodySections.push(`## ${sec.label}\n- [ ] Task 1`);
        } else {
          bodySections.push(`## ${sec.label}\n${sec.placeholder || ''}`);
        }
      }
    } else {
      bodySections.push('## Description\nFeature specification...');
    }
    bodySections.push(`## Activity Log\n- [${new Date().toISOString()}] Feature card created`);
    const body = bodySections.join('\n\n');

    frontmatter.meta.contentHash = await computeContentHash(frontmatter, body);

    const filePath = `${projectId}/features/${cardId}.md`;
    await this.fsAdapter.writeFile(filePath, serializeCardFile(frontmatter, body));

    const projConfigStr = await this.fsAdapter.readFile(`${projectId}/project.json`);
    const projConfig = projConfigStr ? JSON.parse(projConfigStr) : { featureOrder: {} };
    if (!projConfig.featureOrder) projConfig.featureOrder = {};
    if (!projConfig.featureOrder[listId]) projConfig.featureOrder[listId] = [];
    projConfig.featureOrder[listId].push(cardId);
    await this.fsAdapter.writeFile(`${projectId}/project.json`, JSON.stringify(projConfig, null, 2));

    const cardRecord = {
      id: cardId,
      projectId,
      type,
      frontmatter,
      body,
      _filePath: filePath,
      _isTrash: false
    };
    this.db.cards.set(cardId, cardRecord);
    this.db.projects.set(projectId, projConfig);
    await this.db.rebuildSearchIndex();

    return cardRecord;
  }

  /**
   * Complete soft-delete of a project:
   * 1. Moves the sub-project directory to .solokanban/trash/ (via fsAdapter.softDeleteProject)
   * 2. Finds and deletes the corresponding project card in /projects/ (<cardId>.md)
   * 3. Removes the project card ID from workspace.json featureOrder
   * 4. Updates in-memory db (db.projects, db.cards, db.workspaceConfig)
   * 5. Rebuilds search index
   */
  async softDeleteProjectFull(projectId) {
    if (!this.fsAdapter || !projectId) return;

    // 1. Move sub-project directory to trash
    await this.fsAdapter.softDeleteProject(projectId);

    // 2. Find matching project card in db.cards
    let targetCardId = null;
    let cardFilePath = null;

    for (const [cardId, card] of this.db.cards.entries()) {
      if (card.type === 'project' && (card.id === projectId || card.frontmatter?.projectId === projectId || card._filePath === `projects/${projectId}.md`)) {
        targetCardId = cardId;
        cardFilePath = card._filePath;
        break;
      }
    }

    if (!cardFilePath && targetCardId) {
      cardFilePath = `projects/${targetCardId}.md`;
    } else if (!cardFilePath) {
      // Fallback: check if projects/<projectId>.md exists
      if (await this.fsAdapter.readFile(`projects/${projectId}.md`)) {
        cardFilePath = `projects/${projectId}.md`;
        targetCardId = projectId;
      }
    }

    // Delete card file from projects/
    if (cardFilePath) {
      await this.fsAdapter.deleteFile(cardFilePath);
    }

    // 3. Remove from workspace.json featureOrder
    const wsConfigStr = await this.fsAdapter.readFile('workspace.json');
    if (wsConfigStr) {
      try {
        const wsConfig = JSON.parse(wsConfigStr);
        if (wsConfig.featureOrder) {
          for (const listId of Object.keys(wsConfig.featureOrder)) {
            wsConfig.featureOrder[listId] = (wsConfig.featureOrder[listId] || []).filter(
              id => id !== targetCardId && id !== projectId
            );
          }
          await this.fsAdapter.writeFile('workspace.json', JSON.stringify(wsConfig, null, 2));
          this.db.workspaceConfig = wsConfig;
        }
      } catch (e) {}
    }

    // 4. Update in-memory DB
    this.db.projects.delete(projectId);
    if (targetCardId) {
      this.db.cards.delete(targetCardId);
    }
    for (const [cardId, card] of Array.from(this.db.cards.entries())) {
      if (card.projectId === projectId || card.id === projectId) {
        this.db.cards.delete(cardId);
      }
    }

    // 5. Rebuild search index
    await this.db.rebuildSearchIndex();
  }
}
