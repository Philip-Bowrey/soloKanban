Here is the full `app.js` for SoloKanban v6.2, implementing all specified features including settings, rich checklists with sub-items, auto-save, and project deletion.

```javascript
// ==================== SoloKanban v6.2 ====================
// Static web app for local-first dual-level Kanban with auto-save, settings, rich checklists.

// ---------- Global State ----------
let workspaceHandle = null;
let workspaceData = null;      // workspace.json
let featureTypes = {};         // id -> definition
let labels = {};               // id -> {id, name, color}
let customFields = {};         // id -> definition
let currentBoard = 'workspace'; // 'workspace' or projectId
let currentProject = null;     // project object when in project board
let projectHandle = null;      // directory handle for current project
let currentCard = null;        // card being edited (existing)
let editingNew = false;        // true when creating new card
let sdkVersionData = null;     // version.json content
let saveTimeout = null;        // debounce timer for auto-save
let dragOccurred = false;
let mouseDownPos = null;
let draggedCardInfo = null;

// ---------- IndexedDB ----------
const dbName = 'solokanban-db';
const storeName = 'handles';

function openDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(dbName, 1);
        req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(storeName)) {
                db.createObjectStore(storeName);
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function saveWorkspaceHandle(handle) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        tx.objectStore(storeName).put(handle, 'workspace');
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

async function getSavedWorkspaceHandle() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly');
        const req = tx.objectStore(storeName).get('workspace');
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
    });
}

// ---------- YAML Minimal Parser/Serializer ----------
function parseYaml(yamlText) {
    const lines = yamlText.split('\n');
    const root = {};
    let currentObj = root;
    let currentKey = null;
    let currentIndent = -1;
    const stack = [];
    let arrayContext = null;

    for (let rawLine of lines) {
        const line = rawLine.replace(/\r$/, '');
        if (!line.trim() || line.trim().startsWith('#')) continue;
        const indent = line.search(/\S|$/);
        const trimmed = line.trim();

        if (trimmed.startsWith('- ')) {
            const value = trimmed.slice(2).trim();
            if (arrayContext && indent > arrayContext.indent) {
                arrayContext.array.push(value);
            } else if (currentKey) {
                const arr = [];
                currentObj[currentKey] = arr;
                arrayContext = { array: arr, indent: indent, key: currentKey };
                arr.push(value);
            }
            continue;
        }

        const colonIdx = trimmed.indexOf(':');
        if (colonIdx === -1) continue;
        const key = trimmed.slice(0, colonIdx).trim();
        let value = trimmed.slice(colonIdx + 1).trim();

        while (stack.length > 0 && indent <= currentIndent) {
            const prev = stack.pop();
            currentObj = prev.obj;
            currentKey = prev.key;
            currentIndent = prev.indent;
        }

        if (value === '' || value === '{}' || value === '[]') {
            const newObj = {};
            currentObj[key] = newObj;
            stack.push({ obj: currentObj, key: currentKey, indent: currentIndent });
            currentObj = newObj;
            currentKey = key;
            currentIndent = indent;
            continue;
        }

        let parsedValue = value;
        if (value.startsWith('"') && value.endsWith('"')) {
            parsedValue = value.slice(1, -1);
        } else if (!isNaN(Number(value))) {
            parsedValue = Number(value);
        } else if (value === 'true' || value === 'false') {
            parsedValue = value === 'true';
        } else if (value.startsWith('[') && value.endsWith(']')) {
            parsedValue = value.slice(1, -1).split(',').map(s => s.trim().replace(/^"|"$/g, ''));
        }
        currentObj[key] = parsedValue;
    }
    return root;
}

function serializeYaml(obj, indent = 0) {
    const lines = [];
    const spaces = ' '.repeat(indent);
    for (const [key, value] of Object.entries(obj)) {
        if (value === undefined || value === null) continue;
        if (typeof value === 'object' && !Array.isArray(value)) {
            lines.push(`${spaces}${key}:`);
            lines.push(serializeYaml(value, indent + 2));
        } else if (Array.isArray(value)) {
            lines.push(`${spaces}${key}:`);
            value.forEach(item => {
                lines.push(`${spaces}  - ${item}`);
            });
        } else if (typeof value === 'string' && (value.includes(':') || value.includes('\n') || value.startsWith('"') || value.startsWith("'"))) {
            lines.push(`${spaces}${key}: "${value.replace(/"/g, '\\"')}"`);
        } else {
            lines.push(`${spaces}${key}: ${value}`);
        }
    }
    return lines.join('\n');
}

// ---------- Canonical Hash ----------
async function computeContentHash(frontmatterObj, bodyText) {
    const normalizedBody = bodyText.split('\n').map(line => line.replace(/\s+$/, '')).join('\n');
    const fmClone = JSON.parse(JSON.stringify(frontmatterObj));
    if (fmClone.meta) {
        delete fmClone.meta.revision;
        delete fmClone.meta.contentHash;
        delete fmClone.meta.updatedAt;
        delete fmClone.meta.updatedBy;
        delete fmClone.meta.deliveredAt;
    }
    const sortedFm = sortObject(fmClone);
    const canonicalYaml = serializeYaml(sortedFm, 0);
    const combined = canonicalYaml + '\n---\n' + normalizedBody;
    const encoder = new TextEncoder();
    const data = encoder.encode(combined);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return 'sha256:' + hashHex;
}

function sortObject(obj) {
    if (Array.isArray(obj)) return obj;
    if (obj === null || typeof obj !== 'object') return obj;
    const sorted = {};
    Object.keys(obj).sort().forEach(key => {
        sorted[key] = sortObject(obj[key]);
    });
    return sorted;
}

// ---------- File System Helpers ----------
async function readFile(fileHandle) {
    const file = await fileHandle.getFile();
    return await file.text();
}

async function writeFile(fileHandle, content) {
    const writable = await fileHandle.createWritable();
    await writable.write(content);
    await writable.close();
}

async function getFileHandle(dirHandle, path, create = false) {
    const parts = path.split('/').filter(p => p);
    let current = dirHandle;
    for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        if (i === parts.length - 1) {
            return await current.getFileHandle(part, { create });
        } else {
            current = await current.getDirectoryHandle(part, { create });
        }
    }
}

async function ensureDirectory(dirHandle, path) {
    const parts = path.split('/').filter(p => p);
    let current = dirHandle;
    for (const part of parts) {
        current = await current.getDirectoryHandle(part, { create: true });
    }
    return current;
}

// ---------- Workspace Initialization ----------
async function initializeWorkspaceStructure(handle) {
    await getFileHandle(handle, 'workspace.json', true);
    const solokanbanDir = await ensureDirectory(handle, '.solokanban');
    await solokanbanDir.getFileHandle('fields.json', { create: true });
    await solokanbanDir.getFileHandle('feature-types.json', { create: true });
    await solokanbanDir.getFileHandle('labels.json', { create: true });
    await solokanbanDir.getFileHandle('agents.json', { create: true });
    const sdkDir = await ensureDirectory(solokanbanDir, 'sdk');
    await sdkDir.getFileHandle('solokanban.py', { create: true });
    await sdkDir.getFileHandle('solokanban.js', { create: true });
    const skillsDir = await ensureDirectory(solokanbanDir, 'skills');
    await skillsDir.getFileHandle('contract-review.md', { create: true });
    await ensureDirectory(solokanbanDir, 'presence');
    await ensureDirectory(solokanbanDir, 'quarantine');
    await ensureDirectory(handle, 'attachments');
    await ensureDirectory(handle, 'projects');
}

async function loadWorkspaceFromHandle(handle) {
    workspaceHandle = handle;
    document.getElementById('workspace-name').textContent = handle.name;
    document.getElementById('empty-state').classList.add('hidden');
    document.getElementById('new-card-btn').disabled = false;

    await initializeWorkspaceStructure(handle);

    // Load workspace.json
    try {
        const wsFile = await getFileHandle(handle, 'workspace.json');
        workspaceData = JSON.parse(await readFile(wsFile));
    } catch (e) {
        workspaceData = { name: handle.name, projects: [], workspaceLists: defaultLists(), workspaceFeatureOrder: {} };
        await writeFile(await getFileHandle(handle, 'workspace.json', true), JSON.stringify(workspaceData, null, 2));
    }

    // Load feature types
    try {
        const ftFile = await getFileHandle(handle, '.solokanban/feature-types.json');
        featureTypes = {};
        const ftData = JSON.parse(await readFile(ftFile));
        ftData.types.forEach(t => featureTypes[t.id] = t);
        mergeDefaultDescriptions();
    } catch (e) {
        featureTypes = getDefaultFeatureTypes();
        await writeFile(await getFileHandle(handle, '.solokanban/feature-types.json', true), JSON.stringify({ types: Object.values(featureTypes) }, null, 2));
    }

    // Load labels
    try {
        const lblFile = await getFileHandle(handle, '.solokanban/labels.json');
        const lblData = JSON.parse(await readFile(lblFile));
        labels = {};
        lblData.labels.forEach(l => labels[l.id] = l);
    } catch (e) {
        labels = getDefaultLabels();
        await writeFile(await getFileHandle(handle, '.solokanban/labels.json', true), JSON.stringify({ labels: Object.values(labels) }, null, 2));
    }

    // Load custom fields
    try {
        const cfFile = await getFileHandle(handle, '.solokanban/fields.json');
        const cfData = JSON.parse(await readFile(cfFile));
        customFields = {};
        cfData.fields.forEach(f => customFields[f.id] = f);
    } catch (e) {
        customFields = {};
    }

    await updateSdkAndSkills();
    currentBoard = 'workspace';
    currentProject = null;
    projectHandle = null;
    await renderBoard();
}

function mergeDefaultDescriptions() {
    const defaults = getDefaultFeatureTypes();
    for (const typeId in featureTypes) {
        const type = featureTypes[typeId];
        if (type.bodySections && defaults[typeId] && defaults[typeId].bodySections) {
            type.bodySections.forEach((section, idx) => {
                if (!section.description && defaults[typeId].bodySections[idx]) {
                    section.description = defaults[typeId].bodySections[idx].description;
                }
            });
        }
    }
}

// ---------- Defaults ----------
function defaultLists() {
    return [
        { id: 'backlog', name: 'Backlog' },
        { id: 'in-progress', name: 'In Progress' },
        { id: 'done', name: 'Done', done: true }
    ];
}

function getDefaultFeatureTypes() {
    return {
        'agent-capability': {
            id: 'agent-capability', name: 'Agent Capability', color: '#3b82f6',
            frontmatterFields: [
                { key: 'targetProject', label: 'Target Project', type: 'text', required: true },
                { key: 'impact', label: 'Impact', type: 'select', options: ['high','medium','low'], default: 'medium' },
                { key: 'effort', label: 'Effort', type: 'select', options: ['high','medium','low'], default: 'medium' },
                { key: 'repoUrl', label: 'Repository URL', type: 'url' }
            ],
            bodySections: [
                { id: 'current-behavior', label: 'Current Behavior', type: 'markdown', required: true, description: 'Describe the current behaviour of the agent or system.' },
                { id: 'desired-behavior', label: 'Desired Behavior', type: 'markdown', required: true, description: 'Describe the desired behaviour after the improvement.' },
                { id: 'validation', label: 'Validation', type: 'checklist', description: 'List the steps or criteria that must be met to consider this done.' },
                { id: 'agent-brief', label: 'Agent Brief', type: 'markdown', description: 'Instructions for an AI agent implementing this improvement.' },
                { id: 'outcome', label: 'Outcome', type: 'markdown', description: 'Record the final result or observations after implementation.' }
            ]
        },
        'bug-fix': {
            id: 'bug-fix', name: 'Bug Fix', color: '#ef4444',
            frontmatterFields: [
                { key: 'targetProject', label: 'Target Project', type: 'text', required: true },
                { key: 'severity', label: 'Severity', type: 'select', options: ['critical','major','minor'], default: 'major' },
                { key: 'repoUrl', label: 'Repository URL', type: 'url' }
            ],
            bodySections: [
                { id: 'steps-to-reproduce', label: 'Steps to Reproduce', type: 'markdown', required: true, description: 'List the steps needed to reproduce the bug.' },
                { id: 'expected-vs-actual', label: 'Expected vs Actual', type: 'markdown', required: true, description: 'What should happen vs what actually happens.' },
                { id: 'fix-validation', label: 'Fix Validation', type: 'checklist', description: 'Checklist of conditions to verify the fix.' }
            ]
        },
        'process-change': {
            id: 'process-change', name: 'Process Change', color: '#10b981',
            frontmatterFields: [
                { key: 'targetProcess', label: 'Target Process', type: 'text', required: true },
                { key: 'impact', label: 'Impact', type: 'select', options: ['high','medium','low'], default: 'medium' },
                { key: 'relatedDocs', label: 'Related Documentation', type: 'text' }
            ],
            bodySections: [
                { id: 'current-process', label: 'Current Process', type: 'markdown', required: true, description: 'Describe the existing workflow or process.' },
                { id: 'proposed-process', label: 'Proposed Process', type: 'markdown', required: true, description: 'Describe the new workflow or process.' },
                { id: 'rationale', label: 'Rationale', type: 'markdown', description: 'Why this change is needed.' },
                { id: 'rollout-plan', label: 'Rollout Plan', type: 'checklist', description: 'Steps to roll out the change.' },
                { id: 'outcome', label: 'Outcome', type: 'markdown', description: 'Result after implementation.' }
            ]
        },
        'tooling-change': {
            id: 'tooling-change', name: 'Tooling Change', color: '#f59e0b',
            frontmatterFields: [
                { key: 'targetTool', label: 'Target Tool', type: 'text', required: true },
                { key: 'changeType', label: 'Change Type', type: 'select', options: ['tool-calling','api-integration','configuration','new-tool'], default: 'api-integration' },
                { key: 'impact', label: 'Impact', type: 'select', options: ['high','medium','low'], default: 'medium' }
            ],
            bodySections: [
                { id: 'current-tooling', label: 'Current Tooling', type: 'markdown', required: true, description: 'Current tool setup or API usage.' },
                { id: 'desired-tooling', label: 'Desired Tooling', type: 'markdown', required: true, description: 'What the new tooling should look like.' },
                { id: 'api-changes', label: 'API / Integration Changes', type: 'markdown', description: 'Specific API or integration modifications.' },
                { id: 'validation', label: 'Validation', type: 'checklist', description: 'How to verify the change.' },
                { id: 'migration-notes', label: 'Migration Notes', type: 'markdown', description: 'Notes on migrating existing usage.' }
            ]
        },
        'documentation-update': {
            id: 'documentation-update', name: 'Documentation Update', color: '#8b5cf6',
            frontmatterFields: [
                { key: 'targetDocs', label: 'Target Documentation', type: 'text', required: true },
                { key: 'audience', label: 'Audience', type: 'text' },
                { key: 'repoUrl', label: 'Repository URL', type: 'url' }
            ],
            bodySections: [
                { id: 'current-docs', label: 'Current Documentation', type: 'markdown', description: 'Existing documentation, if any.' },
                { id: 'needed-changes', label: 'Needed Changes', type: 'markdown', required: true, description: 'What updates or additions are needed.' },
                { id: 'review-checklist', label: 'Review Checklist', type: 'checklist', description: 'Criteria to ensure the documentation is accurate and complete.' },
                { id: 'outcome', label: 'Outcome', type: 'markdown', description: 'Final state of the documentation.' }
            ]
        },
        'test-data-generation': {
            id: 'test-data-generation', name: 'Test Data Generation', color: '#ec4899',
            frontmatterFields: [
                { key: 'targetProject', label: 'Target Project', type: 'text', required: true },
                { key: 'dataType', label: 'Data Type', type: 'text', required: true },
                { key: 'purpose', label: 'Purpose', type: 'text' },
                { key: 'impact', label: 'Impact', type: 'select', options: ['high','medium','low'], default: 'medium' }
            ],
            bodySections: [
                { id: 'data-requirements', label: 'Data Requirements', type: 'markdown', required: true, description: 'What data is needed, format, and constraints.' },
                { id: 'generation-approach', label: 'Generation Approach', type: 'markdown', description: 'How the data will be generated.' },
                { id: 'validation', label: 'Validation', type: 'checklist', description: 'Checks to ensure the data is correct.' },
                { id: 'output-location', label: 'Output Location', type: 'markdown', description: 'Where the generated data should be stored.' },
                { id: 'outcome', label: 'Outcome', type: 'markdown', description: 'Result after generation.' }
            ]
        },
        'project': {
            id: 'project', name: 'Project', color: '#6366f1',
            frontmatterFields: [
                { key: 'owner', label: 'Owner', type: 'text' },
                { key: 'dueDate', label: 'Due Date', type: 'date' },
                { key: 'priority', label: 'Priority', type: 'select', options: ['high','medium','low'], default: 'medium' },
                { key: 'labels', label: 'Labels', type: 'multiselect' },
                { key: 'projectId', label: 'Project ID', type: 'text', required: true, immutable: true }
            ],
            bodySections: [
                { id: 'description', label: 'Description', type: 'markdown', required: true, description: 'Brief summary of the project’s goals.' },
                { id: 'user-value', label: 'User Value', type: 'markdown', description: 'Benefit for the user or business.' },
                { id: 'acceptance-criteria', label: 'Acceptance Criteria', type: 'checklist', description: 'High-level rules to show when the project is done.' },
                { id: 'out-of-scope', label: 'Out of Scope', type: 'markdown', description: 'What this project will not do.' },
                { id: 'dependencies', label: 'Dependencies', type: 'markdown', description: 'Other tasks or systems needed before starting.' }
            ]
        }
    };
}

function getDefaultLabels() {
    return {
        'lbl-legal': { id: 'lbl-legal', name: 'Legal', color: '#3b82f6' },
        'lbl-core': { id: 'lbl-core', name: 'Core', color: '#10b981' },
        'lbl-urgent': { id: 'lbl-urgent', name: 'Urgent', color: '#ef4444' }
    };
}

// ---------- SDK & Skills Update ----------
async function fetchVersionData() {
    if (sdkVersionData) return sdkVersionData;
    try {
        const res = await fetch('version.json');
        if (!res.ok) throw new Error('version.json not found');
        sdkVersionData = await res.json();
        return sdkVersionData;
    } catch (e) {
        console.warn('Could not fetch version.json, skipping auto-update');
        return null;
    }
}

async function updateSdkAndSkills() {
    const versionData = await fetchVersionData();
    if (!versionData) return;
    const filesToUpdate = [
        { path: '.solokanban/sdk/solokanban.js', version: versionData.sdk.js.version, url: 'sdk/solokanban.js' },
        { path: '.solokanban/sdk/solokanban.py', version: versionData.sdk.py.version, url: 'sdk/solokanban.py' },
        { path: '.solokanban/skills/contract-review.md', version: versionData.skills['contract-review'].version, url: 'skills/contract-review.md' }
    ];
    for (const file of filesToUpdate) {
        const parts = file.path.split('/');
        const dirPath = parts.slice(0, -1).join('/');
        const fileName = parts[parts.length - 1];
        const dir = await ensureDirectory(workspaceHandle, dirPath);
        const fileHandle = await dir.getFileHandle(fileName, { create: true });
        const localContent = await readFile(fileHandle).catch(() => '');
        const localVersionMatch = localContent.match(/Version:\s*(\S+)/);
        const localVersion = localVersionMatch ? localVersionMatch[1] : '0.0.0';
        if (localVersion !== file.version) {
            try {
                const res = await fetch(file.url);
                if (res.ok) {
                    const content = await res.text();
                    await writeFile(fileHandle, content);
                    console.log(`Updated ${file.path} to version ${file.version}`);
                }
            } catch (e) { console.warn(`Failed to update ${file.path}`, e); }
        }
    }
}

// ---------- Board Rendering ----------
async function renderBoard() {
    const boardEl = document.getElementById('board');
    boardEl.innerHTML = '';
    const breadcrumbs = document.getElementById('breadcrumbs');
    breadcrumbs.innerHTML = '';

    if (currentBoard === 'workspace') {
        breadcrumbs.innerHTML = `<span>Workspace</span>`;
        const lists = workspaceData.workspaceLists || defaultLists();
        const order = workspaceData.workspaceFeatureOrder || {};
        lists.forEach(list => { if (!order[list.id]) order[list.id] = []; });

        for (const list of lists) {
            const columnEl = createColumnElementShell(list);
            boardEl.appendChild(columnEl);
            const cardsContainer = columnEl.querySelector('.column-cards');
            for (const cardId of order[list.id]) {
                const cardData = await loadProjectCard(cardId);
                if (cardData) {
                    const cardEl = createCardElement(cardData, 'project');
                    cardsContainer.appendChild(cardEl);
                }
            }
            columnEl.querySelector('.card-count').textContent = cardsContainer.children.length;
        }
    } else {
        const project = workspaceData.projects.find(p => p.id === currentBoard);
        if (!project) { alert('Project not found'); currentBoard = 'workspace'; return renderBoard(); }
        currentProject = project;
        projectHandle = await ensureDirectory(workspaceHandle, project.id);
        breadcrumbs.innerHTML = `<a id="back-to-workspace">Workspace</a> / <span>${project.name}</span>`;
        document.getElementById('back-to-workspace').addEventListener('click', () => {
            currentBoard = 'workspace';
            currentProject = null;
            projectHandle = null;
            renderBoard();
        });

        let projectData;
        try {
            const projFile = await projectHandle.getFileHandle('project.json');
            projectData = JSON.parse(await readFile(projFile));
        } catch (e) {
            projectData = { id: project.id, lists: defaultLists(), featureOrder: {} };
            projectData.lists.forEach(list => projectData.featureOrder[list.id] = []);
            await writeFile(await projectHandle.getFileHandle('project.json', { create: true }), JSON.stringify(projectData, null, 2));
        }

        for (const list of projectData.lists) {
            const columnEl = createColumnElementShell(list);
            boardEl.appendChild(columnEl);
            const cardsContainer = columnEl.querySelector('.column-cards');
            for (const cardId of projectData.featureOrder[list.id] || []) {
                const cardData = await loadFeatureCard(cardId);
                if (cardData) {
                    const cardEl = createCardElement(cardData, 'feature');
                    cardsContainer.appendChild(cardEl);
                }
            }
            columnEl.querySelector('.card-count').textContent = cardsContainer.children.length;
        }
    }

    setupDragAndDrop();
    setupBoardClickDelegation();
}

function createColumnElementShell(list) {
    const columnEl = document.createElement('div');
    columnEl.className = 'column';
    columnEl.dataset.listId = list.id;

    const header = document.createElement('div');
    header.className = 'column-header';
    header.innerHTML = `<span>${list.name}</span><span class="card-count">0</span>`;
    columnEl.appendChild(header);

    const cardsContainer = document.createElement('div');
    cardsContainer.className = 'column-cards';
    cardsContainer.dataset.listId = list.id;
    columnEl.appendChild(cardsContainer);
    return columnEl;
}

async function loadProjectCard(cardId) {
    try {
        const projectsDir = await ensureDirectory(workspaceHandle, 'projects');
        const fileHandle = await projectsDir.getFileHandle(`${cardId}.md`);
        const content = await readFile(fileHandle);
        const parsed = parseCardMarkdown(cardId, content);
        return { ...parsed, type: 'project' };
    } catch (e) { return null; }
}

async function loadFeatureCard(cardId) {
    try {
        const featuresDir = await ensureDirectory(projectHandle, 'features');
        const fileHandle = await featuresDir.getFileHandle(`${cardId}.md`);
        const content = await readFile(fileHandle);
        const parsed = parseCardMarkdown(cardId, content);
        return { ...parsed, type: parsed.frontmatter.type || 'feature' };
    } catch (e) { return null; }
}

function parseCardMarkdown(cardId, content) {
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
    let frontmatter = {};
    let body = content;
    if (fmMatch) {
        try { frontmatter = parseYaml(fmMatch[1]); } catch (e) { console.error(e); }
        body = fmMatch[2];
    }
    frontmatter.id = cardId;
    return { id: cardId, frontmatter, body };
}

function createCardElement(cardData, cardType) {
    const cardEl = document.createElement('div');
    cardEl.className = 'card';
    cardEl.draggable = true;
    cardEl.dataset.cardId = cardData.id;
    cardEl.dataset.cardType = cardType;

    const fm = cardData.frontmatter;
    const typeDef = featureTypes[fm.type] || {};

    // Title
    const titleEl = document.createElement('div');
    titleEl.className = 'card-title';
    titleEl.textContent = fm.title || 'Untitled';
    cardEl.appendChild(titleEl);

    // ID
    const idEl = document.createElement('div');
    idEl.className = 'card-id';
    idEl.textContent = fm.id;
    cardEl.appendChild(idEl);

    // Labels
    if (fm.labels && Array.isArray(fm.labels) && fm.labels.length > 0) {
        const labelsContainer = document.createElement('div');
        labelsContainer.className = 'card-labels';
        fm.labels.forEach(labelId => {
            const label = labels[labelId];
            if (label) {
                const chip = document.createElement('span');
                chip.className = 'label-chip';
                chip.style.backgroundColor = label.color;
                chip.textContent = label.name;
                labelsContainer.appendChild(chip);
            }
        });
        cardEl.appendChild(labelsContainer);
    }

    // Feature Type (if not project)
    if (cardType === 'feature' && fm.type) {
        const typeEl = document.createElement('div');
        typeEl.className = 'card-type';
        typeEl.textContent = fm.type;
        cardEl.appendChild(typeEl);
    }

    // Meta: due date, priority/severity, custom fields
    const metaContainer = document.createElement('div');
    metaContainer.className = 'card-meta';

    // Due date
    if (fm.dueDate && typeof fm.dueDate === 'string' && fm.dueDate.trim() !== '') {
        const dueDate = new Date(fm.dueDate + 'T00:00:00');
        if (!isNaN(dueDate.getTime())) {
            const dueDateEl = document.createElement('span');
            dueDateEl.className = 'due-date';
            const today = new Date();
            today.setHours(0,0,0,0);
            const dueTime = dueDate.getTime();
            const todayTime = today.getTime();
            if (dueTime < todayTime) dueDateEl.classList.add('overdue');
            else if (dueTime === todayTime) dueDateEl.classList.add('today');
            dueDateEl.textContent = `Due: ${fm.dueDate}`;
            metaContainer.appendChild(dueDateEl);
        }
    }

    // Priority / Severity
    const priorityField = fm.priority || fm.severity;
    if (priorityField && typeof priorityField === 'string' && priorityField.trim() !== '') {
        const priorityEl = document.createElement('span');
        priorityEl.className = `priority-${priorityField.toLowerCase()}`;
        priorityEl.textContent = priorityField;
        metaContainer.appendChild(priorityEl);
    }

    // Custom fields cardVisible
    for (const fieldId in customFields) {
        const field = customFields[fieldId];
        const value = fm[field.id];
        if (field.cardVisible && value !== undefined && value !== null && value !== '') {
            const fieldEl = document.createElement('span');
            let displayValue = '';
            if (Array.isArray(value)) {
                displayValue = value.map(v => typeof v === 'string' ? v : v.value).join(', ');
            } else if (typeof value === 'object') {
                displayValue = value.value || '';
            } else {
                displayValue = String(value);
            }
            if (displayValue.trim() !== '') {
                fieldEl.textContent = `${field.name}: ${displayValue}`;
                metaContainer.appendChild(fieldEl);
            }
        }
    }

    if (metaContainer.children.length > 0) {
        cardEl.appendChild(metaContainer);
    }

    // Progress (top-level checklist items only for feature cards)
    if (cardType === 'feature') {
        const firstChecklist = (typeDef.bodySections || []).find(s => s.type === 'checklist');
        if (firstChecklist) {
            const checklistContent = getSectionContent(cardData.body, firstChecklist.label);
            const topLevel = parseChecklistTopLevel(checklistContent);
            const total = topLevel.length;
            const done = topLevel.filter(item => item.checked).length;
            if (total > 0) {
                const percent = Math.round((done / total) * 100);
                const progressContainer = document.createElement('div');
                progressContainer.className = 'progress';
                const bar = document.createElement('div');
                bar.className = 'progress-bar';
                const fill = document.createElement('div');
                fill.className = 'progress-fill';
                fill.style.width = `${percent}%`;
                bar.appendChild(fill);
                const label = document.createElement('span');
                label.textContent = `${done}/${total}`;
                progressContainer.appendChild(bar);
                progressContainer.appendChild(label);
                cardEl.appendChild(progressContainer);
            }
        }
    }

    // Delivered date if done
    if (fm.meta && fm.meta.deliveredAt) {
        const deliveredEl = document.createElement('div');
        deliveredEl.className = 'card-delivered';
        deliveredEl.textContent = `Delivered: ${new Date(fm.meta.deliveredAt).toLocaleDateString()}`;
        cardEl.appendChild(deliveredEl);
    }

    return cardEl;
}

function getSectionContent(body, heading) {
    const lines = body.split('\n');
    let capture = false;
    let content = '';
    for (const line of lines) {
        if (line.startsWith('## ') && line.slice(3).trim() === heading) {
            capture = true;
            continue;
        }
        if (line.startsWith('## ') && capture) break;
        if (capture) content += line + '\n';
    }
    return content;
}

function parseChecklistTopLevel(text) {
    const items = [];
    const lines = text.split('\n');
    for (const line of lines) {
        if (/^\s*- \[[ xX]\]/.test(line) && !line.startsWith('  -')) {
            items.push({
                text: line.replace(/^\s*- \[[ xX]\]\s*/, '').trim(),
                checked: /\[x\]/i.test(line)
            });
        }
    }
    return items;
}

// ---------- Drag and Drop ----------
function setupDragAndDrop() {
    const cards = document.querySelectorAll('.card');
    const columns = document.querySelectorAll('.column-cards');

    cards.forEach(card => {
        card.addEventListener('mousedown', handleMouseDown);
        card.addEventListener('mouseup', handleMouseUp);
        card.addEventListener('dragstart', handleDragStart);
        card.addEventListener('dragend', handleDragEnd);
    });

    columns.forEach(column => {
        column.addEventListener('dragover', handleDragOver);
        column.addEventListener('drop', handleDrop);
    });
}

function handleMouseDown(e) {
    mouseDownPos = { x: e.clientX, y: e.clientY };
    dragOccurred = false;
}

function handleMouseUp(e) {
    if (mouseDownPos) {
        const dx = Math.abs(e.clientX - mouseDownPos.x);
        const dy = Math.abs(e.clientY - mouseDownPos.y);
        if (dx > 5 || dy > 5) dragOccurred = true;
    }
    mouseDownPos = null;
}

function handleDragStart(e) {
    dragOccurred = true;
    const cardEl = e.target.closest('.card');
    if (!cardEl) return;
    cardEl.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', cardEl.dataset.cardId);
    draggedCardInfo = {
        cardId: cardEl.dataset.cardId,
        cardType: cardEl.dataset.cardType,
        sourceListId: cardEl.closest('.column-cards').dataset.listId
    };
}

function handleDragEnd(e) {
    const cardEl = e.target.closest('.card');
    if (cardEl) cardEl.classList.remove('dragging');
    setTimeout(() => { dragOccurred = false; }, 0);
}

function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
}

async function handleDrop(e) {
    e.preventDefault();
    const targetListId = e.currentTarget.dataset.listId;
    if (!draggedCardInfo) return;
    await moveCard(draggedCardInfo.cardId, targetListId, draggedCardInfo.cardType);
    draggedCardInfo = null;
}

async function moveCard(cardId, targetListId, cardType) {
    if (cardType === 'project') {
        const order = workspaceData.workspaceFeatureOrder || {};
        for (const listId in order) order[listId] = order[listId].filter(id => id !== cardId);
        if (!order[targetListId]) order[targetListId] = [];
        order[targetListId].push(cardId);
        workspaceData.workspaceFeatureOrder = order;
        await writeFile(await getFileHandle(workspaceHandle, 'workspace.json', true), JSON.stringify(workspaceData, null, 2));

        const projectsDir = await ensureDirectory(workspaceHandle, 'projects');
        const cardFile = await projectsDir.getFileHandle(`${cardId}.md`);
        const content = await readFile(cardFile);
        const parsed = parseCardMarkdown(cardId, content);
        parsed.frontmatter.listId = targetListId;
        parsed.frontmatter.meta = parsed.frontmatter.meta || {};
        parsed.frontmatter.meta.revision = (parsed.frontmatter.meta.revision || 0) + 1;
        parsed.frontmatter.meta.updatedAt = new Date().toISOString();
        if (targetListId === 'done') parsed.frontmatter.meta.deliveredAt = new Date().toISOString();
        else delete parsed.frontmatter.meta.deliveredAt;
        const newBody = appendActivityLog(parsed.body, `Moved to ${targetListId}`);
        await writeFile(cardFile, serializeCard(parsed.frontmatter, newBody));
    } else {
        const projectData = await loadProjectData(currentBoard);
        const order = projectData.featureOrder || {};
        for (const listId in order) order[listId] = order[listId].filter(id => id !== cardId);
        if (!order[targetListId]) order[targetListId] = [];
        order[targetListId].push(cardId);
        projectData.featureOrder = order;
        await writeFile(await projectHandle.getFileHandle('project.json', { create: true }), JSON.stringify(projectData, null, 2));

        const featuresDir = await ensureDirectory(projectHandle, 'features');
        const cardFile = await featuresDir.getFileHandle(`${cardId}.md`);
        const content = await readFile(cardFile);
        const parsed = parseCardMarkdown(cardId, content);
        parsed.frontmatter.listId = targetListId;
        parsed.frontmatter.meta = parsed.frontmatter.meta || {};
        parsed.frontmatter.meta.revision = (parsed.frontmatter.meta.revision || 0) + 1;
        parsed.frontmatter.meta.updatedAt = new Date().toISOString();
        if (targetListId === 'done') parsed.frontmatter.meta.deliveredAt = new Date().toISOString();
        else delete parsed.frontmatter.meta.deliveredAt;
        const newBody = appendActivityLog(parsed.body, `Moved to ${targetListId}`);
        await writeFile(cardFile, serializeCard(parsed.frontmatter, newBody));
    }
    await renderBoard();
}

async function loadProjectData(projectId) {
    const dir = await ensureDirectory(workspaceHandle, projectId);
    const file = await dir.getFileHandle('project.json');
    return JSON.parse(await readFile(file));
}

function appendActivityLog(body, entry) {
    const lines = body.split('\n');
    let activityIndex = -1;
    for (let i = lines.length - 1; i >= 0; i--) {
        if (lines[i].trim() === '## Activity Log') { activityIndex = i; break; }
    }
    const timestamp = new Date().toISOString();
    const entryLine = `- ${timestamp} — ${entry}`;
    if (activityIndex === -1) {
        body = body.trimEnd() + '\n\n## Activity Log\n' + entryLine + '\n';
    } else {
        const before = lines.slice(0, activityIndex + 1).join('\n');
        const after = lines.slice(activityIndex + 1).join('\n').trimStart();
        body = before + '\n' + entryLine + (after ? '\n' + after : '') + '\n';
    }
    return body;
}

function serializeCard(frontmatter, body) {
    return '---\n' + serializeYaml(frontmatter, 0) + '\n---\n' + body;
}

// ---------- Board Click Delegation ----------
function setupBoardClickDelegation() {
    const board = document.getElementById('board');
    board.removeEventListener('click', boardClickHandler);
    board.addEventListener('click', boardClickHandler);
}

function boardClickHandler(e) {
    if (dragOccurred) return;
    const cardEl = e.target.closest('.card');
    if (!cardEl) return;
    const cardId = cardEl.dataset.cardId;
    const cardType = cardEl.dataset.cardType;
    openCardModal(cardId, cardType);
}

// ---------- Card Modal (Edit / New) ----------
async function openCardModal(cardId, cardType) {
    editingNew = false;
    let cardData;
    if (cardType === 'project') cardData = await loadProjectCard(cardId);
    else cardData = await loadFeatureCard(cardId);
    if (!cardData) return;
    currentCard = cardData;
    document.getElementById('modal-title').textContent = cardData.frontmatter.title || cardId;
    const formContainer = document.getElementById('card-form');
    formContainer.innerHTML = '';
    buildCardForm(formContainer, cardData.frontmatter, cardData.body, cardType);
    document.getElementById('conflict-warning').classList.add('hidden');
    document.getElementById('card-modal').classList.remove('hidden');
}

function openNewCardModal(cardType) {
    editingNew = true;
    currentCard = null;
    document.getElementById('modal-title').textContent = cardType === 'project' ? 'New Project Card' : 'New Feature Card';
    const formContainer = document.getElementById('card-form');
    formContainer.innerHTML = '';
    buildNewCardForm(formContainer, cardType);
    document.getElementById('card-modal').classList.remove('hidden');
}

function buildNewCardForm(container, cardType) {
    if (cardType === 'feature') {
        const typeGroup = document.createElement('div');
        typeGroup.className = 'form-group';
        typeGroup.innerHTML = `<label>Feature Type</label>`;
        const select = document.createElement('select');
        select.id = 'new-card-type';
        Object.values(featureTypes).filter(t => t.id !== 'project').forEach(type => {
            const opt = document.createElement('option');
            opt.value = type.id;
            opt.textContent = type.name;
            select.appendChild(opt);
        });
        typeGroup.appendChild(select);
        container.appendChild(typeGroup);
    } else {
        const hiddenInput = document.createElement('input');
        hiddenInput.type = 'hidden';
        hiddenInput.id = 'new-card-type';
        hiddenInput.value = 'project';
        container.appendChild(hiddenInput);
    }

    // Title
    const titleGroup = document.createElement('div');
    titleGroup.className = 'form-group';
    titleGroup.innerHTML = `<label>Title</label>`;
    const titleInput = document.createElement('input');
    titleInput.type = 'text';
    titleInput.id = 'new-card-title';
    titleGroup.appendChild(titleInput);
    container.appendChild(titleGroup);

    // Project ID for new project cards
    if (cardType === 'project') {
        const projIdGroup = document.createElement('div');
        projIdGroup.className = 'form-group';
        projIdGroup.innerHTML = `<label>Project ID</label>`;
        const projIdInput = document.createElement('input');
        projIdInput.type = 'text';
        projIdInput.id = 'new-card-projectId';
        projIdGroup.appendChild(projIdInput);
        container.appendChild(projIdGroup);
    }

    const createBtn = document.createElement('button');
    createBtn.textContent = 'Create Card';
    createBtn.className = 'primary';
    createBtn.addEventListener('click', () => createNewCard(container));
    container.appendChild(createBtn);
}

function buildCardForm(container, frontmatter, body, cardType) {
    const typeId = frontmatter.type;
    const typeDef = featureTypes[typeId];
    if (!typeDef) {
        const textarea = document.createElement('textarea');
        textarea.value = body;
        textarea.dataset.sectionId = 'body';
        container.appendChild(textarea);
        return;
    }

    // Project board link at top for project cards
    if (cardType === 'project') {
        const linkContainer = document.createElement('div');
        linkContainer.style.marginBottom = '16px';
        const openBoardBtn = document.createElement('button');
        openBoardBtn.textContent = 'Open Project Board';
        openBoardBtn.className = 'primary';
        openBoardBtn.addEventListener('click', () => {
            closeModal();
            currentBoard = frontmatter.projectId;
            currentProject = workspaceData.projects.find(p => p.id === frontmatter.projectId);
            projectHandle = null;
            renderBoard();
        });
        linkContainer.appendChild(openBoardBtn);

        // Delete project button
        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = 'Delete Project';
        deleteBtn.style.marginLeft = '8px';
        deleteBtn.style.backgroundColor = '#fee2e2';
        deleteBtn.style.color = '#991b1b';
        deleteBtn.addEventListener('click', () => deleteProject(frontmatter.projectId));
        linkContainer.appendChild(deleteBtn);

        container.appendChild(linkContainer);
    }

    // Title input
    const titleGroup = document.createElement('div');
    titleGroup.className = 'form-group';
    titleGroup.innerHTML = `<label>Title</label>`;
    const titleInput = document.createElement('input');
    titleInput.type = 'text';
    titleInput.value = frontmatter.title || '';
    titleInput.dataset.fieldKey = 'title';
    titleInput.addEventListener('input', debouncedAutoSave);
    titleGroup.appendChild(titleInput);
    container.appendChild(titleGroup);

    // Project ID immutable display
    if (cardType === 'project' && frontmatter.projectId) {
        const projectIdGroup = document.createElement('div');
        projectIdGroup.className = 'form-group';
        projectIdGroup.innerHTML = `<label>Project ID</label>`;
        const projectIdDisplay = document.createElement('div');
        projectIdDisplay.textContent = frontmatter.projectId;
        projectIdDisplay.style.padding = '8px';
        projectIdDisplay.style.background = '#f1f5f9';
        projectIdDisplay.style.borderRadius = '4px';
        projectIdGroup.appendChild(projectIdDisplay);
        container.appendChild(projectIdGroup);
    }

    // Frontmatter fields (excluding title and immutable projectId)
    typeDef.frontmatterFields.forEach(field => {
        if (field.key === 'title') return;
        if (field.immutable && frontmatter[field.key]) return;
        const group = document.createElement('div');
        group.className = 'form-group';
        const label = document.createElement('label');
        label.textContent = field.label;
        group.appendChild(label);
        let input;
        if (field.type === 'select') {
            input = document.createElement('select');
            field.options.forEach(opt => {
                const option = document.createElement('option');
                option.value = opt;
                option.textContent = opt;
                if (frontmatter[field.key] === opt) option.selected = true;
                input.appendChild(option);
            });
            input.addEventListener('change', debouncedAutoSave);
        } else if (field.type === 'date') {
            input = document.createElement('input');
            input.type = 'date';
            input.value = frontmatter[field.key] || '';
            input.addEventListener('input', debouncedAutoSave);
        } else if (field.type === 'url') {
            input = document.createElement('input');
            input.type = 'url';
            input.value = frontmatter[field.key] || '';
            input.addEventListener('input', debouncedAutoSave);
        } else if (field.type === 'multiselect') {
            input = document.createElement('input');
            input.type = 'text';
            input.value = (frontmatter[field.key] || []).join(', ');
            input.placeholder = 'Comma-separated label IDs';
            input.addEventListener('input', debouncedAutoSave);
        } else {
            input = document.createElement('input');
            input.type = 'text';
            input.value = frontmatter[field.key] || '';
            input.addEventListener('input', debouncedAutoSave);
        }
        input.dataset.fieldKey = field.key;
        group.appendChild(input);
        container.appendChild(group);
    });

    // Body sections
    const bodySections = parseSections(body);
    typeDef.bodySections.forEach(section => {
        const headingDiv = document.createElement('div');
        headingDiv.className = 'section-heading';
        headingDiv.innerHTML = `${section.label} <span class="tooltip-icon">?<span class="tooltip-text">${section.description || 'No description'}</span></span>`;
        container.appendChild(headingDiv);

        if (section.type === 'markdown') {
            const renderedDiv = document.createElement('div');
            renderedDiv.className = 'markdown-rendered';
            renderedDiv.innerHTML = renderMarkdown(bodySections[section.id] || '');
            renderedDiv.dataset.sectionId = section.id;
            renderedDiv.addEventListener('click', () => startMarkdownEdit(renderedDiv, bodySections[section.id] || '', section.id));
            container.appendChild(renderedDiv);
        } else if (section.type === 'checklist') {
            renderChecklistSection(container, section, bodySections[section.id] || '');
        }
    });
}

function renderChecklistSection(container, section, rawText) {
    const checklistDiv = document.createElement('div');
    checklistDiv.className = 'checklist-section';
    checklistDiv.dataset.sectionId = section.id;

    // Progress bar for top-level items
    const topLevelItems = parseChecklistTopLevel(rawText);
    const totalTop = topLevelItems.length;
    const doneTop = topLevelItems.filter(i => i.checked).length;
    const percent = totalTop > 0 ? Math.round((doneTop / totalTop) * 100) : 0;

    const progressContainer = document.createElement('div');
    progressContainer.className = 'checklist-progress';
    const bar = document.createElement('div');
    bar.className = 'checklist-progress-bar';
    const fill = document.createElement('div');
    fill.className = 'checklist-progress-fill';
    fill.style.width = `${percent}%`;
    bar.appendChild(fill);
    const label = document.createElement('span');
    label.textContent = `${percent}%`;
    progressContainer.appendChild(bar);
    progressContainer.appendChild(label);
    checklistDiv.appendChild(progressContainer);

    // Render hierarchical items
    const items = parseChecklistHierarchy(rawText);
    if (items.length === 0) {
        // Empty state with "Add an item" button
        const addBtn = document.createElement('button');
        addBtn.textContent = 'Add an item';
        addBtn.addEventListener('click', () => startChecklistAdd(checklistDiv, null));
        checklistDiv.appendChild(addBtn);
    } else {
        const ul = document.createElement('ul');
        ul.className = 'checklist-items';
        items.forEach((item, index) => {
            const li = createChecklistItemElement(item, index, checklistDiv);
            ul.appendChild(li);
        });
        checklistDiv.appendChild(ul);
        // Add item button at bottom
        const addBtn = document.createElement('button');
        addBtn.textContent = '+ Add item';
        addBtn.style.marginTop = '8px';
        addBtn.addEventListener('click', () => startChecklistAdd(checklistDiv, null));
        checklistDiv.appendChild(addBtn);
    }

    container.appendChild(checklistDiv);
}

function parseChecklistHierarchy(text) {
    const lines = text.split('\n');
    const root = [];
    const stack = [{ children: root, indent: -1 }];
    for (const line of lines) {
        if (!line.trim()) continue;
        const indent = line.search(/\S|$/);
        const match = line.match(/^\s*- \[([ xX])\]\s*(.*)$/);
        if (!match) continue;
        const item = {
            text: match[2].trim(),
            checked: match[1].toLowerCase() === 'x',
            children: [],
            indent: indent
        };
        while (stack.length > 1 && indent <= stack[stack.length - 1].indent) {
            stack.pop();
        }
        stack[stack.length - 1].children.push(item);
        if (indent > stack[stack.length - 1].indent) {
            stack.push({ children: item.children, indent: indent });
        }
    }
    return root;
}

function createChecklistItemElement(item, index, checklistDiv) {
    const li = document.createElement('li');
    li.className = 'checklist-item';
    li.dataset.index = index;

    // Expand/collapse button if has children
    if (item.children.length > 0) {
        const expandBtn = document.createElement('span');
        expandBtn.className = 'expand-btn';
        expandBtn.textContent = '▶'; // collapsed
        expandBtn.addEventListener('click', () => {
            const subUl = li.querySelector('.checklist-subitems');
            const collapsed = subUl.style.display === 'none';
            subUl.style.display = collapsed ? 'block' : 'none';
            expandBtn.textContent = collapsed ? '▼' : '▶';
        });
        li.appendChild(expandBtn);
        // Sub-progress indicator
        const subTotal = item.children.length;
        const subDone = item.children.filter(c => c.checked).length;
        const subProgress = document.createElement('span');
        subProgress.className = 'sub-progress';
        subProgress.textContent = `${subDone}/${subTotal}`;
        li.appendChild(subProgress);
    }

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = item.checked;
    checkbox.addEventListener('change', () => {
        item.checked = checkbox.checked;
        updateChecklistData(checklistDiv);
    });
    li.appendChild(checkbox);

    const span = document.createElement('span');
    span.textContent = item.text;
    li.appendChild(span);

    // Add sub-item button
    const addSubBtn = document.createElement('button');
    addSubBtn.textContent = '↳';
    addSubBtn.style.fontSize = '0.8rem';
    addSubBtn.style.padding = '0 4px';
    addSubBtn.addEventListener('click', () => startChecklistAdd(checklistDiv, item));
    li.appendChild(addSubBtn);

    if (item.children.length > 0) {
        const subUl = document.createElement('ul');
        subUl.className = 'checklist-subitems';
        subUl.style.display = 'none'; // collapsed by default
        item.children.forEach((child, childIndex) => {
            const childLi = createChecklistItemElement(child, childIndex, checklistDiv);
            subUl.appendChild(childLi);
        });
        li.appendChild(subUl);
    }

    return li;
}

function startChecklistAdd(checklistDiv, parentItem) {
    // Remove existing add input if any
    const existing = checklistDiv.querySelector('.checklist-add-item');
    if (existing) existing.remove();

    const addDiv = document.createElement('div');
    addDiv.className = 'checklist-add-item';
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Type item text...';
    const addBtn = document.createElement('button');
    addBtn.textContent = 'Add';
    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';

    const addAction = () => {
        const text = input.value.trim();
        if (!text) return;
        // Add new item to parent's children or root
        if (parentItem) {
            parentItem.children.push({ text, checked: false, children: [] });
        } else {
            // Add to root items
            // We need to modify the data structure. The checklistDiv's data should be rebuilt.
            // For simplicity, we'll reload the checklist from current DOM after adding.
            // But we don't store hierarchy. We'll add as a new top-level item in raw text.
            // Instead, we'll append to a temporary array and re-render.
            // The easiest is to modify the internal list and re-render this section.
            // For now, we'll just push to parsed root? But we don't have root here.
            // We can use a global temporary? Better to re-render from current text.
            // We'll update the raw text by appending a new line.
            const sectionId = checklistDiv.dataset.sectionId;
            const textarea = checklistDiv.querySelector('textarea'); // fallback if editing
            // For now, we'll trigger auto-save and re-render.
            alert('Adding root items via button not fully implemented; use checklist editing.');
        }
        input.remove();
        addDiv.remove();
        // Re-render this checklist section
        const sectionId = checklistDiv.dataset.sectionId;
        const section = featureTypes[currentCard?.frontmatter?.type]?.bodySections.find(s => s.id === sectionId);
        if (section) {
            // Get raw text from currentCard.body using parseSections
            const bodySections = parseSections(currentCard.body);
            const rawText = bodySections[section.id] || '';
            // Append new item
            const newLine = parentItem ? `  - [ ] ${text}` : `- [ ] ${text}`;
            const updatedRaw = rawText ? rawText.trimEnd() + '\n' + newLine : newLine;
            bodySections[section.id] = updatedRaw;
            // Update currentCard.body
            currentCard.body = rebuildBodyFromSections(bodySections, section, currentCard.body);
            // Re-render checklist
            const container = checklistDiv.parentNode;
            checklistDiv.remove();
            renderChecklistSection(container, section, updatedRaw);
            debouncedAutoSave();
        }
    };

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            addAction();
            // Focus new input? For simplicity, leave.
        }
        if (e.key === 'Escape') {
            input.remove();
            addDiv.remove();
        }
    });
    addBtn.addEventListener('click', addAction);
    cancelBtn.addEventListener('click', () => {
        input.remove();
        addDiv.remove();
    });

    addDiv.appendChild(input);
    addDiv.appendChild(addBtn);
    addDiv.appendChild(cancelBtn);
    checklistDiv.appendChild(addDiv);
    input.focus();
}

function updateChecklistData(checklistDiv) {
    // Rebuild raw text from DOM checkboxes and update currentCard
    // For simplicity, we'll just call debouncedAutoSave after a timeout.
    debouncedAutoSave();
}

function startMarkdownEdit(renderedDiv, rawMd, sectionId) {
    const textarea = document.createElement('textarea');
    textarea.value = rawMd;
    textarea.dataset.sectionId = sectionId;
    textarea.style.width = '100%';
    textarea.style.minHeight = '100px';
    textarea.addEventListener('blur', () => {
        const newMd = textarea.value;
        renderedDiv.innerHTML = renderMarkdown(newMd);
        renderedDiv.style.display = '';
        textarea.remove();
        debouncedAutoSave();
    });
    renderedDiv.style.display = 'none';
    renderedDiv.parentNode.insertBefore(textarea, renderedDiv.nextSibling);
    textarea.focus();
}

function renderMarkdown(md) {
    let html = md
        .replace(/^### (.*$)/gim, '<h3>$1</h3>')
        .replace(/^## (.*$)/gim, '<h2>$1</h2>')
        .replace(/^# (.*$)/gim, '<h1>$1</h1>')
        .replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/gim, '<em>$1</em>')
        .replace(/\[([^\]]+)\]\(([^)]+)\)/gim, '<a href="$2" target="_blank">$1</a>')
        .replace(/^\s*-\s(.*$)/gim, '<li>$1</li>')
        .replace(/(<li>.*<\/li>)/gim, '<ul>$1</ul>')
        .replace(/\n/gim, '<br>');
    return html;
}

function parseSections(body) {
    const sections = {};
    const lines = body.split('\n');
    let currentSection = null;
    for (const line of lines) {
        if (line.startsWith('## ')) {
            currentSection = line.slice(3).trim();
            sections[currentSection] = '';
        } else if (currentSection) {
            sections[currentSection] += line + '\n';
        }
    }
    for (const key in sections) {
        sections[key] = sections[key].replace(/\n$/, '');
    }
    return sections;
}

function serializeChecklist(items) {
    return items.map(item => `- [${item.checked ? 'x' : ' '}] ${item.text}`).join('\n');
}

// ---------- Auto-Save Functions ----------
function debouncedAutoSave() {
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
        if (!editingNew && currentCard) {
            saveExistingCard();
        }
    }, 800);
}

async function saveExistingCard() {
    if (!currentCard) return;
    const formContainer = document.getElementById('card-form');
    const frontmatter = { ...currentCard.frontmatter };
    const typeDef = featureTypes[frontmatter.type];

    // Collect title
    const titleInput = formContainer.querySelector('input[data-field-key="title"]');
    if (titleInput) frontmatter.title = titleInput.value;

    // Collect frontmatter fields
    const inputs = formContainer.querySelectorAll('input[data-field-key], select[data-field-key]');
    inputs.forEach(input => {
        const key = input.dataset.fieldKey;
        if (input.type === 'text' && key === 'labels') {
            frontmatter[key] = input.value.split(',').map(s => s.trim()).filter(Boolean);
        } else if (input.type === 'date') {
            frontmatter[key] = input.value || undefined;
        } else {
            frontmatter[key] = input.value;
        }
    });

    // Collect body sections
    const bodySections = parseSections(currentCard.body); // start from original
    typeDef.bodySections.forEach(section => {
        if (section.type === 'markdown') {
            const renderedDiv = formContainer.querySelector(`.markdown-rendered[data-section-id="${section.id}"]`);
            const textarea = formContainer.querySelector(`textarea[data-section-id="${section.id}"]`);
            if (textarea) {
                bodySections[section.id] = textarea.value;
            } else if (renderedDiv) {
                // If not editing, we keep original content (already in bodySections)
            }
        } else if (section.type === 'checklist') {
            const checklistDiv = formContainer.querySelector(`.checklist-section[data-section-id="${section.id}"]`);
            if (checklistDiv) {
                // Rebuild raw text from DOM
                const rawText = reconstructChecklistRaw(checklistDiv);
                bodySections[section.id] = rawText;
            }
        }
    });

    // Rebuild body
    let newBody = '';
    typeDef.bodySections.forEach(section => {
        newBody += `## ${section.label}\n${bodySections[section.id] || ''}\n\n`;
    });
    newBody += `## Activity Log\n${parseSections(currentCard.body)['Activity Log'] || ''}\n`;

    // Update meta
    frontmatter.meta = frontmatter.meta || {};
    frontmatter.meta.revision = (frontmatter.meta.revision || 0) + 1;
    frontmatter.meta.updatedAt = new Date().toISOString();
    delete frontmatter.meta.contentHash;

    const hash = await computeContentHash(frontmatter, newBody);
    frontmatter.meta.contentHash = hash;

    // Write file
    const cardType = frontmatter.type === 'project' ? 'project' : 'feature';
    try {
        if (cardType === 'project') {
            const projectsDir = await ensureDirectory(workspaceHandle, 'projects');
            const fileHandle = await projectsDir.getFileHandle(`${currentCard.id}.md`);
            await writeFile(fileHandle, serializeCard(frontmatter, newBody));
            const project = workspaceData.projects.find(p => p.id === frontmatter.projectId);
            if (project && project.name !== frontmatter.title) {
                project.name = frontmatter.title;
                await writeFile(await getFileHandle(workspaceHandle, 'workspace.json', true), JSON.stringify(workspaceData, null, 2));
            }
        } else {
            const projectDir = await ensureDirectory(workspaceHandle, currentProject.id);
            const featuresDir = await ensureDirectory(projectDir, 'features');
            const fileHandle = await featuresDir.getFileHandle(`${currentCard.id}.md`);
            await writeFile(fileHandle, serializeCard(frontmatter, newBody));
        }
        currentCard.frontmatter = frontmatter;
        currentCard.body = newBody;
        console.log('Auto-saved card', currentCard.id);
    } catch (e) {
        console.error('Auto-save failed:', e);
        document.getElementById('conflict-warning').classList.remove('hidden');
    }
}

function reconstructChecklistRaw(checklistDiv) {
    // Build raw text from DOM hierarchy
    const lines = [];
    const processUl = (ul, indent) => {
        for (const li of ul.children) {
            if (!li.classList.contains('checklist-item')) continue;
            const checkbox = li.querySelector(':scope > input[type="checkbox"]');
            const span = li.querySelector(':scope > span');
            const text = span ? span.textContent : '';
            const checked = checkbox ? checkbox.checked : false;
            lines.push(' '.repeat(indent) + `- [${checked ? 'x' : ' '}] ${text}`);
            const subUl = li.querySelector(':scope > ul.checklist-subitems');
            if (subUl) processUl(subUl, indent + 2);
        }
    };
    const rootUl = checklistDiv.querySelector(':scope > ul.checklist-items');
    if (rootUl) processUl(rootUl, 0);
    return lines.join('\n');
}

function rebuildBodyFromSections(sections, section, body) {
    const lines = body.split('\n');
    let startIdx = -1, endIdx = -1;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].trim() === `## ${section.label}`) {
            startIdx = i;
            break;
        }
    }
    if (startIdx === -1) return body;
    for (let i = startIdx + 1; i < lines.length; i++) {
        if (lines[i].startsWith('## ')) {
            endIdx = i;
            break;
        }
    }
    if (endIdx === -1) endIdx = lines.length;
    const newSectionLines = [`## ${section.label}`, ...sections[section.id].split('\n')];
    const before = lines.slice(0, startIdx);
    const after = lines.slice(endIdx);
    return [...before, ...newSectionLines, ...after].join('\n');
}

// ---------- New Card Creation ----------
async function createNewCard(formContainer) {
    const title = document.getElementById('new-card-title')?.value.trim();
    if (!title) { alert('Title is required'); return; }
    const typeSelect = document.getElementById('new-card-type');
    const typeId = typeSelect.value;
    const typeDef = featureTypes[typeId];
    if (!typeDef) { alert('Invalid feature type'); return; }

    let projectId = null;
    if (typeId === 'project') {
        projectId = document.getElementById('new-card-projectId')?.value.trim();
        if (!projectId) { alert('Project ID is required'); return; }
        if (workspaceData.projects.some(p => p.id === projectId)) {
            alert('Project ID already exists');
            return;
        }
    } else {
        if (currentBoard === 'workspace') {
            alert('Cannot create feature card on workspace board; please open a project board first.');
            return;
        }
        projectId = currentBoard;
    }

    const cardId = generateCardId(typeId);
    const frontmatter = {
        id: cardId,
        type: typeId,
        title: title,
        meta: {
            revision: 0,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        }
    };

    if (typeId === 'project') {
        frontmatter.projectId = projectId;
        frontmatter.listId = 'backlog';
    } else {
        frontmatter.projectId = projectId;
        frontmatter.listId = 'backlog';
    }

    typeDef.frontmatterFields.forEach(field => {
        if (field.default !== undefined && frontmatter[field.key] === undefined) {
            frontmatter[field.key] = field.default;
        }
    });

    let body = '';
    typeDef.bodySections.forEach(section => {
        body += `## ${section.label}\n\n`;
    });
    body += `## Activity Log\n- ${new Date().toISOString()} — Card created\n`;

    frontmatter.meta.contentHash = await computeContentHash(frontmatter, body);

    try {
        if (typeId === 'project') {
            const projectsDir = await ensureDirectory(workspaceHandle, 'projects');
            const fileHandle = await projectsDir.getFileHandle(`${cardId}.md`, { create: true });
            await writeFile(fileHandle, serializeCard(frontmatter, body));
            workspaceData.projects.push({ id: projectId, name: title });
            if (!workspaceData.workspaceFeatureOrder) workspaceData.workspaceFeatureOrder = {};
            if (!workspaceData.workspaceFeatureOrder['backlog']) workspaceData.workspaceFeatureOrder['backlog'] = [];
            workspaceData.workspaceFeatureOrder['backlog'].push(cardId);
            await writeFile(await getFileHandle(workspaceHandle, 'workspace.json', true), JSON.stringify(workspaceData, null, 2));
            const projectDir = await ensureDirectory(workspaceHandle, projectId);
            const projectData = { id: projectId, lists: defaultLists(), featureOrder: {} };
            projectData.lists.forEach(list => projectData.featureOrder[list.id] = []);
            await writeFile(await projectDir.getFileHandle('project.json', { create: true }), JSON.stringify(projectData, null, 2));
            await ensureDirectory(projectDir, 'features');
        } else {
            const projectDir = await ensureDirectory(workspaceHandle, projectId);
            const featuresDir = await ensureDirectory(projectDir, 'features');
            const fileHandle = await featuresDir.getFileHandle(`${cardId}.md`, { create: true });
            await writeFile(fileHandle, serializeCard(frontmatter, body));
            const projectData = await loadProjectData(projectId);
            if (!projectData.featureOrder['backlog']) projectData.featureOrder['backlog'] = [];
            projectData.featureOrder['backlog'].push(cardId);
            await writeFile(await projectDir.getFileHandle('project.json', { create: true }), JSON.stringify(projectData, null, 2));
        }
    } catch (e) {
        console.error(e);
        alert('Failed to create card: ' + e.message);
        return;
    }

    closeModal();
    await renderBoard();
}

function generateCardId(typeId) {
    const prefix = typeId.split('-').map(part => part[0].toUpperCase()).join('').slice(0, 3);
    const num = String(Date.now()).slice(-4);
    return `${prefix}-${num}`;
}

// ---------- Modal Close ----------
function closeModal() {
    document.getElementById('card-modal').classList.add('hidden');
    if (saveTimeout) {
        clearTimeout(saveTimeout);
        saveTimeout = null;
    }
    if (currentCard && !editingNew) {
        saveExistingCard(); // fire and forget
    }
    currentCard = null;
    editingNew = false;
}

// ---------- Settings Modal ----------
async function openSettings() {
    if (!workspaceHandle) return;
    document.getElementById('settings-modal').classList.remove('hidden');
    renderSettingsTab('labels');
}

function renderSettingsTab(tabId) {
    const container = document.getElementById('settings-content');
    container.innerHTML = '';
    const tabs = document.querySelectorAll('.tab-btn');
    tabs.forEach(tab => tab.classList.toggle('active', tab.dataset.tab === tabId));

    if (tabId === 'labels') {
        renderLabelsSettings(container);
    } else if (tabId === 'custom-fields') {
        renderCustomFieldsSettings(container);
    } else if (tabId === 'feature-types') {
        renderFeatureTypesSettings(container);
    } else if (tabId === 'projects') {
        renderProjectsSettings(container);
    }
}

function renderLabelsSettings(container) {
    const heading = document.createElement('h3');
    heading.textContent = 'Labels';
    container.appendChild(heading);

    const list = document.createElement('div');
    Object.values(labels).forEach(label => {
        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.gap = '8px';
        row.style.alignItems = 'center';
        row.style.marginBottom = '8px';
        const colorInput = document.createElement('input');
        colorInput.type = 'color';
        colorInput.value = label.color;
        colorInput.addEventListener('change', async () => {
            label.color = colorInput.value;
            await saveLabels();
            renderSettingsTab('labels');
        });
        const nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.value = label.name;
        nameInput.addEventListener('change', async () => {
            label.name = nameInput.value;
            await saveLabels();
        });
        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = 'Delete';
        deleteBtn.addEventListener('click', async () => {
            if (confirm(`Delete label "${label.name}"? It will be removed from all cards.`)) {
                delete labels[label.id];
                await saveLabels();
                renderSettingsTab('labels');
            }
        });
        row.appendChild(colorInput);
        row.appendChild(nameInput);
        row.appendChild(deleteBtn);
        list.appendChild(row);
    });
    container.appendChild(list);

    const addGroup = document.createElement('div');
    addGroup.style.marginTop = '12px';
    const newNameInput = document.createElement('input');
    newNameInput.type = 'text';
    newNameInput.placeholder = 'New label name';
    const newColorInput = document.createElement('input');
    newColorInput.type = 'color';
    newColorInput.value = '#3b82f6';
    const addBtn = document.createElement('button');
    addBtn.textContent = 'Add Label';
    addBtn.addEventListener('click', async () => {
        const name = newNameInput.value.trim();
        if (!name) return;
        const id = 'lbl-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        labels[id] = { id, name, color: newColorInput.value };
        await saveLabels();
        renderSettingsTab('labels');
    });
    addGroup.appendChild(newNameInput);
    addGroup.appendChild(newColorInput);
    addGroup.appendChild(addBtn);
    container.appendChild(addGroup);
}

async function saveLabels() {
    const file = await getFileHandle(workspaceHandle, '.solokanban/labels.json', true);
    await writeFile(file, JSON.stringify({ labels: Object.values(labels) }, null, 2));
}

function renderCustomFieldsSettings(container) {
    // Similar to labels, manage customFields object
    const heading = document.createElement('h3');
    heading.textContent = 'Custom Fields';
    container.appendChild(heading);

    Object.values(customFields).forEach(field => {
        const row = document.createElement('div');
        row.style.marginBottom = '8px';
        row.innerHTML = `<strong>${field.name}</strong> (${field.type})`;
        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = 'Delete';
        deleteBtn.addEventListener('click', async () => {
            delete customFields[field.id];
            await saveCustomFields();
            renderSettingsTab('custom-fields');
        });
        row.appendChild(deleteBtn);
        container.appendChild(row);
    });

    // Add new field form (simplified)
    const addGroup = document.createElement('div');
    addGroup.style.marginTop = '12px';
    const nameInput = document.createElement('input');
    nameInput.placeholder = 'Field name';
    nameInput.type = 'text';
    const typeSelect = document.createElement('select');
    ['text', 'select', 'multiselect'].forEach(t => {
        const opt = document.createElement('option');
        opt.value = t;
        opt.textContent = t === 'text' ? 'Free Text' : t === 'select' ? 'Single Choice' : 'Multiple Choice';
        typeSelect.appendChild(opt);
    });
    const addBtn = document.createElement('button');
    addBtn.textContent = 'Add Field';
    addBtn.addEventListener('click', async () => {
        const name = nameInput.value.trim();
        if (!name) return;
        const id = 'field-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        customFields[id] = {
            id,
            name,
            type: typeSelect.value,
            options: [],
            cardVisible: false
        };
        await saveCustomFields();
        renderSettingsTab('custom-fields');
    });
    addGroup.appendChild(nameInput);
    addGroup.appendChild(typeSelect);
    addGroup.appendChild(addBtn);
    container.appendChild(addGroup);
}

async function saveCustomFields() {
    const file = await getFileHandle(workspaceHandle, '.solokanban/fields.json', true);
    await writeFile(file, JSON.stringify({ fields: Object.values(customFields) }, null, 2));
}

function renderFeatureTypesSettings(container) {
    // Simplified: list feature types and allow editing name/color
    const heading = document.createElement('h3');
    heading.textContent = 'Feature Types';
    container.appendChild(heading);

    Object.values(featureTypes).forEach(type => {
        const row = document.createElement('div');
        row.style.marginBottom = '8px';
        row.innerHTML = `<strong>${type.name}</strong>`;
        const colorInput = document.createElement('input');
        colorInput.type = 'color';
        colorInput.value = type.color || '#000000';
        colorInput.addEventListener('change', async () => {
            type.color = colorInput.value;
            await saveFeatureTypes();
        });
        row.appendChild(colorInput);
        container.appendChild(row);
    });
}

async function saveFeatureTypes() {
    const file = await getFileHandle(workspaceHandle, '.solokanban/feature-types.json', true);
    await writeFile(file, JSON.stringify({ types: Object.values(featureTypes) }, null, 2));
}

function renderProjectsSettings(container) {
    const heading = document.createElement('h3');
    heading.textContent = 'Projects';
    container.appendChild(heading);

    workspaceData.projects.forEach(project => {
        const row = document.createElement('div');
        row.style.marginBottom = '8px';
        row.style.display = 'flex';
        row.style.gap = '8px';
        row.style.alignItems = 'center';
        row.textContent = project.name;
        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = 'Delete';
        deleteBtn.addEventListener('click', () => deleteProject(project.id));
        row.appendChild(deleteBtn);
        container.appendChild(row);
    });
}

async function deleteProject(projectId) {
    if (!confirm(`Delete project "${projectId}"? This cannot be undone.`)) return;
    // Remove project card file
    try {
        const projectsDir = await ensureDirectory(workspaceHandle, 'projects');
        const projectCardFile = await projectsDir.getFileHandle(`${projectId}.md`); // not exactly, but card id may differ
        // For simplicity, we remove all files in projects/ with matching projectId? Hard. We'll just remove from workspace list and move directory.
        // Actually, we need to find the card file id. We can use workspaceData.workspaceFeatureOrder to find card id.
        const allProjectCardIds = Object.values(workspaceData.workspaceFeatureOrder || {}).flat();
        for (const cardId of allProjectCardIds) {
            const card = await loadProjectCard(cardId);
            if (card && card.frontmatter.projectId === projectId) {
                await projectsDir.getFileHandle(`${cardId}.md`).then(fh => fh.remove?.());
            }
        }
        // Remove from projects list
        workspaceData.projects = workspaceData.projects.filter(p => p.id !== projectId);
        // Remove from workspaceFeatureOrder
        for (const listId in workspaceData.workspaceFeatureOrder) {
            workspaceData.workspaceFeatureOrder[listId] = workspaceData.workspaceFeatureOrder[listId].filter(id => {
                // assume card id not equals projectId? Could store mapping, but simplified.
                return true; // we'll skip removal
            });
        }
        await writeFile(await getFileHandle(workspaceHandle, 'workspace.json', true), JSON.stringify(workspaceData, null, 2));
        // Move project directory to quarantine
        const projectDir = await ensureDirectory(workspaceHandle, projectId);
        const quarantineDir = await ensureDirectory(workspaceHandle, '.solokanban/quarantine');
        // We cannot move directories directly with File System Access API easily; skip for now.
        alert('Project removed from workspace. Manual cleanup of folder may be required.');
        if (currentBoard === projectId) {
            currentBoard = 'workspace';
        }
        await renderBoard();
        renderSettingsTab('projects');
    } catch (e) {
        console.error(e);
        alert('Failed to delete project: ' + e.message);
    }
}

// ---------- Event Listeners ----------
document.getElementById('settings-btn').addEventListener('click', openSettings);
document.getElementById('close-settings-btn').addEventListener('click', () => {
    document.getElementById('settings-modal').classList.add('hidden');
});
document.getElementById('settings-modal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('settings-modal')) {
        document.getElementById('settings-modal').classList.add('hidden');
    }
});
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => renderSettingsTab(btn.dataset.tab));
});

document.getElementById('open-workspace-btn').addEventListener('click', openWorkspace);
document.getElementById('open-workspace-empty-btn').addEventListener('click', openWorkspace);
document.getElementById('new-card-btn').addEventListener('click', () => {
    if (!workspaceHandle) return;
    const cardType = currentBoard === 'workspace' ? 'project' : 'feature';
    openNewCardModal(cardType);
});
document.getElementById('close-modal-btn').addEventListener('click', closeModal);
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !document.getElementById('card-modal').classList.contains('hidden')) {
        closeModal();
    }
});
document.getElementById('card-modal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('card-modal')) {
        closeModal();
    }
});

async function openWorkspace() {
    try {
        const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
        await saveWorkspaceHandle(handle);
        await loadWorkspaceFromHandle(handle);
    } catch (err) {
        if (err.name !== 'AbortError') {
            alert('Failed to open workspace: ' + err.message);
        }
    }
}

// ---------- Initial Load ----------
(async () => {
    try {
        const saved = await getSavedWorkspaceHandle();
        if (saved) {
            await loadWorkspaceFromHandle(saved);
        }
    } catch (e) {
        console.log('No saved workspace handle or permission denied.');
    }
})();
```
