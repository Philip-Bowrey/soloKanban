// ==================== SoloKanban v6.0 ====================
// Static web app for local-first dual-level Kanban.

// ---------- Global State ----------
let workspaceHandle = null;
let workspaceData = null;      // workspace.json
let featureTypes = {};         // id -> definition
let labels = {};               // id -> {id, name, color}
let customFields = {};         // id -> definition
let currentBoard = 'workspace'; // 'workspace' or projectId
let currentProject = null;     // project object when in project board
let projectHandle = null;      // directory handle for current project
let currentCard = null;        // card being edited
let editingNew = false;        // true when creating new card
let sdkVersionData = null;     // version.json content

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
    // Root files
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

    // Update SDK/skills
    await updateSdkAndSkills();

    // Load workspace board
    currentBoard = 'workspace';
    currentProject = null;
    projectHandle = null;
    await renderBoard();
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
                { id: 'current-behavior', label: 'Current Behavior', type: 'markdown', required: true },
                { id: 'desired-behavior', label: 'Desired Behavior', type: 'markdown', required: true },
                { id: 'validation', label: 'Validation', type: 'checklist' },
                { id: 'agent-brief', label: 'Agent Brief', type: 'markdown' },
                { id: 'outcome', label: 'Outcome', type: 'markdown' }
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
                { id: 'steps-to-reproduce', label: 'Steps to Reproduce', type: 'markdown', required: true },
                { id: 'expected-vs-actual', label: 'Expected vs Actual', type: 'markdown', required: true },
                { id: 'fix-validation', label: 'Fix Validation', type: 'checklist' }
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
                { id: 'current-process', label: 'Current Process', type: 'markdown', required: true },
                { id: 'proposed-process', label: 'Proposed Process', type: 'markdown', required: true },
                { id: 'rationale', label: 'Rationale', type: 'markdown' },
                { id: 'rollout-plan', label: 'Rollout Plan', type: 'checklist' },
                { id: 'outcome', label: 'Outcome', type: 'markdown' }
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
                { id: 'current-tooling', label: 'Current Tooling', type: 'markdown', required: true },
                { id: 'desired-tooling', label: 'Desired Tooling', type: 'markdown', required: true },
                { id: 'api-changes', label: 'API / Integration Changes', type: 'markdown' },
                { id: 'validation', label: 'Validation', type: 'checklist' },
                { id: 'migration-notes', label: 'Migration Notes', type: 'markdown' }
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
                { id: 'current-docs', label: 'Current Documentation', type: 'markdown' },
                { id: 'needed-changes', label: 'Needed Changes', type: 'markdown', required: true },
                { id: 'review-checklist', label: 'Review Checklist', type: 'checklist' },
                { id: 'outcome', label: 'Outcome', type: 'markdown' }
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
                { id: 'data-requirements', label: 'Data Requirements', type: 'markdown', required: true },
                { id: 'generation-approach', label: 'Generation Approach', type: 'markdown' },
                { id: 'validation', label: 'Validation', type: 'checklist' },
                { id: 'output-location', label: 'Output Location', type: 'markdown' },
                { id: 'outcome', label: 'Outcome', type: 'markdown' }
            ]
        },
        'project': {
            id: 'project', name: 'Project', color: '#6366f1',
            frontmatterFields: [
                { key: 'owner', label: 'Owner', type: 'text' },
                { key: 'dueDate', label: 'Due Date', type: 'date' },
                { key: 'priority', label: 'Priority', type: 'select', options: ['high','medium','low'], default: 'medium' },
                { key: 'labels', label: 'Labels', type: 'multiselect' },
                { key: 'projectId', label: 'Project ID', type: 'text', required: true }
            ],
            bodySections: [
                { id: 'description', label: 'Description', type: 'markdown', required: true },
                { id: 'user-value', label: 'User Value', type: 'markdown' },
                { id: 'acceptance-criteria', label: 'Acceptance Criteria', type: 'checklist' },
                { id: 'out-of-scope', label: 'Out of Scope', type: 'markdown' },
                { id: 'dependencies', label: 'Dependencies', type: 'markdown' }
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
            } catch (e) {
                console.warn(`Failed to update ${file.path}`, e);
            }
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
        // Workspace board: show project cards from /projects/
        breadcrumbs.innerHTML = `<span>Workspace</span>`;
        const lists = workspaceData.workspaceLists || defaultLists();
        const order = workspaceData.workspaceFeatureOrder || {};

        // Ensure order object has all lists
        lists.forEach(list => {
            if (!order[list.id]) order[list.id] = [];
        });

        for (const list of lists) {
            const columnEl = createColumnElement(list, order[list.id] || [], 'project');
            boardEl.appendChild(columnEl);
        }
    } else {
        // Project board
        const project = workspaceData.projects.find(p => p.id === currentBoard);
        if (!project) {
            alert('Project not found');
            currentBoard = 'workspace';
            return renderBoard();
        }
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
            // Initialize if missing
            projectData = {
                id: project.id,
                lists: defaultLists(),
                featureOrder: {}
            };
            projectData.lists.forEach(list => projectData.featureOrder[list.id] = []);
            await writeFile(await projectHandle.getFileHandle('project.json', { create: true }), JSON.stringify(projectData, null, 2));
        }

        for (const list of projectData.lists) {
            const columnEl = createColumnElement(list, projectData.featureOrder[list.id] || [], 'feature');
            boardEl.appendChild(columnEl);
        }
    }

    setupDragAndDrop();
}

function createColumnElement(list, cardIds, cardType) {
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

    let count = 0;
    cardIds.forEach(cardId => {
        // Load and render card asynchronously? For simplicity, we'll do it synchronously using async/await in caller.
        // But here we can't await in forEach; we'll need to restructure.
        // We'll handle in renderBoard by awaiting loadCardForDisplay.
    });
    return columnEl;
}

// We'll need to adjust renderBoard to populate cards with async loading.
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
    if (fm.dueDate) {
        const dueDateEl = document.createElement('span');
        dueDateEl.className = 'due-date';
        const due = new Date(fm.dueDate + 'T00:00:00');
        const today = new Date();
        today.setHours(0,0,0,0);
        const dueTime = due.getTime();
        const todayTime = today.getTime();
        if (dueTime < todayTime) {
            dueDateEl.classList.add('overdue');
        } else if (dueTime === todayTime) {
            dueDateEl.classList.add('today');
        }
        dueDateEl.textContent = `Due: ${fm.dueDate}`;
        metaContainer.appendChild(dueDateEl);
    }

    // Priority / Severity
    const priorityField = fm.priority || fm.severity;
    if (priorityField) {
        const priorityEl = document.createElement('span');
        priorityEl.className = `priority-${priorityField.toLowerCase()}`;
        priorityEl.textContent = priorityField;
        metaContainer.appendChild(priorityEl);
    }

    // Custom fields cardVisible
    for (const fieldId in customFields) {
        const field = customFields[fieldId];
        if (field.cardVisible && fm[field.id] !== undefined) {
            const fieldEl = document.createElement('span');
            fieldEl.textContent = `${field.name}: ${fm[field.id]}`;
            metaContainer.appendChild(fieldEl);
        }
    }

    if (metaContainer.children.length > 0) {
        cardEl.appendChild(metaContainer);
    }

    // Progress
    let progressText = '';
    if (cardType === 'feature') {
        const firstChecklist = (typeDef.bodySections || []).find(s => s.type === 'checklist');
        if (firstChecklist) {
            const checklistContent = getSectionContent(cardData.body, firstChecklist.label);
            const total = countChecklistItems(checklistContent);
            const done = countCheckedItems(checklistContent);
            progressText = `${done}/${total}`;
        }
    } else if (cardType === 'project') {
        // Aggregate from child features: percentage done
        // This would require loading all features and counting done list membership.
        // For simplicity, we'll omit or compute lazily. We'll just show placeholder.
        // In a complete implementation, we'd compute. For now, skip.
    }

    if (progressText) {
        const progressContainer = document.createElement('div');
        progressContainer.className = 'progress';
        const [done, total] = progressText.split('/').map(Number);
        const percent = total > 0 ? Math.round((done/total)*100) : 0;
        const bar = document.createElement('div');
        bar.className = 'progress-bar';
        const fill = document.createElement('div');
        fill.className = 'progress-fill';
        fill.style.width = `${percent}%`;
        bar.appendChild(fill);
        const label = document.createElement('span');
        label.textContent = progressText;
        progressContainer.appendChild(bar);
        progressContainer.appendChild(label);
        cardEl.appendChild(progressContainer);
    }

    // Delivered date if done
    if (fm.meta && fm.meta.deliveredAt) {
        const deliveredEl = document.createElement('div');
        deliveredEl.className = 'card-delivered';
        deliveredEl.textContent = `Delivered: ${new Date(fm.meta.deliveredAt).toLocaleDateString()}`;
        cardEl.appendChild(deliveredEl);
    }

    cardEl.addEventListener('click', () => openCardModal(cardData.id, cardType));
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
        if (line.startsWith('## ') && capture) {
            break;
        }
        if (capture) content += line + '\n';
    }
    return content;
}

function countChecklistItems(text) {
    return (text.match(/^\s*- \[[ xX]\]/gm) || []).length;
}

function countCheckedItems(text) {
    return (text.match(/^\s*- \[[xX]\]/gm) || []).length;
}

// ---------- Drag and Drop ----------
function setupDragAndDrop() {
    const cards = document.querySelectorAll('.card');
    const columns = document.querySelectorAll('.column-cards');

    cards.forEach(card => {
        card.addEventListener('dragstart', handleDragStart);
        card.addEventListener('dragend', handleDragEnd);
    });

    columns.forEach(column => {
        column.addEventListener('dragover', handleDragOver);
        column.addEventListener('drop', handleDrop);
    });
}

let draggedCardInfo = null;

function handleDragStart(e) {
    const cardEl = e.target.closest('.card');
    draggedCardInfo = {
        cardId: cardEl.dataset.cardId,
        cardType: cardEl.dataset.cardType,
        sourceListId: cardEl.closest('.column-cards').dataset.listId
    };
    cardEl.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
}

function handleDragEnd(e) {
    e.target.classList.remove('dragging');
    draggedCardInfo = null;
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
}

async function moveCard(cardId, targetListId, cardType) {
    if (cardType === 'project') {
        // Move in workspace order
        const order = workspaceData.workspaceFeatureOrder || {};
        for (const listId in order) {
            order[listId] = order[listId].filter(id => id !== cardId);
        }
        if (!order[targetListId]) order[targetListId] = [];
        order[targetListId].push(cardId);
        workspaceData.workspaceFeatureOrder = order;
        await writeFile(await getFileHandle(workspaceHandle, 'workspace.json', true), JSON.stringify(workspaceData, null, 2));
        // Update project card frontmatter listId (not strictly needed for workspace board, but for consistency)
        const projectsDir = await ensureDirectory(workspaceHandle, 'projects');
        const cardFile = await projectsDir.getFileHandle(`${cardId}.md`);
        const content = await readFile(cardFile);
        const parsed = parseCardMarkdown(cardId, content);
        parsed.frontmatter.listId = targetListId;
        parsed.frontmatter.meta = parsed.frontmatter.meta || {};
        parsed.frontmatter.meta.revision = (parsed.frontmatter.meta.revision || 0) + 1;
        parsed.frontmatter.meta.updatedAt = new Date().toISOString();
        if (targetListId === 'done') {
            parsed.frontmatter.meta.deliveredAt = new Date().toISOString();
        }
        const newBody = appendActivityLog(parsed.body, `Moved to ${targetListId}`);
        await writeFile(cardFile, serializeCard(parsed.frontmatter, newBody));
    } else {
        // Feature card in project board
        const projectData = await loadProjectData(currentBoard);
        const order = projectData.featureOrder || {};
        for (const listId in order) {
            order[listId] = order[listId].filter(id => id !== cardId);
        }
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
        if (targetListId === 'done') {
            parsed.frontmatter.meta.deliveredAt = new Date().toISOString();
        }
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
        if (lines[i].trim() === '## Activity Log') {
            activityIndex = i;
            break;
        }
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

// ---------- Card Modal (Edit / New) ----------
async function openCardModal(cardId, cardType) {
    editingNew = false;
    let cardData;
    if (cardType === 'project') {
        cardData = await loadProjectCard(cardId);
    } else {
        cardData = await loadFeatureCard(cardId);
    }
    if (!cardData) return;
    currentCard = cardData;
    document.getElementById('modal-title').textContent = `Edit ${cardData.frontmatter.title || cardId}`;
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
    // Type selector (only for feature cards; project cards fixed type 'project')
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
        // For project card, type is fixed
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

    // For project cards, also need projectId field
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
}

function buildCardForm(container, frontmatter, body, cardType) {
    const typeId = frontmatter.type;
    const typeDef = featureTypes[typeId];
    if (!typeDef) {
        // Fallback: simple textarea
        const textarea = document.createElement('textarea');
        textarea.value = body;
        textarea.dataset.sectionId = 'body';
        container.appendChild(textarea);
        return;
    }

    // Frontmatter fields
    typeDef.frontmatterFields.forEach(field => {
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
        } else if (field.type === 'date') {
            input = document.createElement('input');
            input.type = 'date';
            input.value = frontmatter[field.key] || '';
        } else if (field.type === 'url') {
            input = document.createElement('input');
            input.type = 'url';
            input.value = frontmatter[field.key] || '';
        } else if (field.type === 'multiselect') {
            // For labels, we'll implement a simple text input for now
            input = document.createElement('input');
            input.type = 'text';
            input.value = (frontmatter[field.key] || []).join(', ');
            input.placeholder = 'Comma-separated label IDs';
        } else {
            input = document.createElement('input');
            input.type = 'text';
            input.value = frontmatter[field.key] || '';
        }
        input.dataset.fieldKey = field.key;
        group.appendChild(input);
        container.appendChild(group);
    });

    // Body sections
    const bodySections = parseSections(body);
    typeDef.bodySections.forEach(section => {
        const heading = document.createElement('div');
        heading.className = 'section-heading';
        heading.textContent = section.label;
        container.appendChild(heading);

        if (section.type === 'markdown') {
            const textarea = document.createElement('textarea');
            textarea.dataset.sectionId = section.id;
            textarea.value = bodySections[section.id] || '';
            container.appendChild(textarea);
        } else if (section.type === 'checklist') {
            const checklistDiv = document.createElement('div');
            checklistDiv.dataset.sectionId = section.id;
            const items = parseChecklist(bodySections[section.id] || '');
            items.forEach((item, index) => {
                const div = document.createElement('div');
                div.className = 'checklist-item';
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.checked = item.checked;
                checkbox.dataset.index = index;
                const span = document.createElement('span');
                span.textContent = item.text;
                div.appendChild(checkbox);
                div.appendChild(span);
                checklistDiv.appendChild(div);
            });
            container.appendChild(checklistDiv);
        }
    });
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

function parseChecklist(text) {
    const items = [];
    const lines = text.split('\n');
    for (const line of lines) {
        if (line.trim().startsWith('- [ ]')) {
            items.push({ checked: false, text: line.replace('- [ ]', '').trim() });
        } else if (line.trim().startsWith('- [x]') || line.trim().startsWith('- [X]')) {
            items.push({ checked: true, text: line.replace('- [x]', '').replace('- [X]', '').trim() });
        }
    }
    return items;
}

function serializeChecklist(items) {
    return items.map(item => `- [${item.checked ? 'x' : ' '}] ${item.text}`).join('\n');
}

// ---------- Save Card ----------
document.getElementById('save-card-btn').addEventListener('click', saveCard);

async function saveCard() {
    const formContainer = document.getElementById('card-form');
    if (editingNew) {
        await createNewCard(formContainer);
    } else {
        await updateExistingCard(formContainer);
    }
}

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
        // Check uniqueness
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

    // Generate card ID
    const cardId = generateCardId(typeId);

    // Build frontmatter
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
        // Add default listId? For workspace board, we use workspaceFeatureOrder; card listId is optional.
        // We'll set listId to 'backlog' for simplicity.
        frontmatter.listId = 'backlog';
    } else {
        frontmatter.projectId = projectId;
        frontmatter.listId = 'backlog';
    }

    // Apply default values for fields
    typeDef.frontmatterFields.forEach(field => {
        if (field.default !== undefined && frontmatter[field.key] === undefined) {
            frontmatter[field.key] = field.default;
        }
    });

    // Build body
    let body = '';
    typeDef.bodySections.forEach(section => {
        body += `## ${section.label}\n\n`;
    });
    body += `## Activity Log\n- ${new Date().toISOString()} — Card created\n`;

    frontmatter.meta.contentHash = await computeContentHash(frontmatter, body);

    // Write file
    try {
        if (typeId === 'project') {
            const projectsDir = await ensureDirectory(workspaceHandle, 'projects');
            const fileHandle = await projectsDir.getFileHandle(`${cardId}.md`, { create: true });
            await writeFile(fileHandle, serializeCard(frontmatter, body));
            // Add to workspaceData.projects and order
            workspaceData.projects.push({ id: projectId, name: title });
            if (!workspaceData.workspaceFeatureOrder) workspaceData.workspaceFeatureOrder = {};
            if (!workspaceData.workspaceFeatureOrder['backlog']) workspaceData.workspaceFeatureOrder['backlog'] = [];
            workspaceData.workspaceFeatureOrder['backlog'].push(cardId);
            await writeFile(await getFileHandle(workspaceHandle, 'workspace.json', true), JSON.stringify(workspaceData, null, 2));
            // Create project directory and project.json
            const projectDir = await ensureDirectory(workspaceHandle, projectId);
            const projectData = { id: projectId, lists: defaultLists(), featureOrder: {} };
            projectData.lists.forEach(list => projectData.featureOrder[list.id] = []);
            await writeFile(await projectDir.getFileHandle('project.json', { create: true }), JSON.stringify(projectData, null, 2));
            // Create features dir
            await ensureDirectory(projectDir, 'features');
        } else {
            const projectDir = await ensureDirectory(workspaceHandle, projectId);
            const featuresDir = await ensureDirectory(projectDir, 'features');
            const fileHandle = await featuresDir.getFileHandle(`${cardId}.md`, { create: true });
            await writeFile(fileHandle, serializeCard(frontmatter, body));
            // Add to project order
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

    document.getElementById('card-modal').classList.add('hidden');
    await renderBoard();
}

async function updateExistingCard(formContainer) {
    if (!currentCard) return;
    const frontmatter = { ...currentCard.frontmatter };
    const typeDef = featureTypes[frontmatter.type];
    const bodySections = {};

    // Frontmatter fields
    const inputs = formContainer.querySelectorAll('input[data-field-key], select[data-field-key]');
    inputs.forEach(input => {
        const key = input.dataset.fieldKey;
        if (input.type === 'text' && key === 'labels') {
            // Parse comma-separated labels for multiselect
            frontmatter[key] = input.value.split(',').map(s => s.trim()).filter(Boolean);
        } else {
            frontmatter[key] = input.value;
        }
    });

    // Body sections
    if (typeDef) {
        typeDef.bodySections.forEach(section => {
            if (section.type === 'markdown') {
                const textarea = formContainer.querySelector(`textarea[data-section-id="${section.id}"]`);
                if (textarea) bodySections[section.id] = textarea.value;
            } else if (section.type === 'checklist') {
                const checklistDiv = formContainer.querySelector(`div[data-section-id="${section.id}"]`);
                if (checklistDiv) {
                    const items = [];
                    checklistDiv.querySelectorAll('.checklist-item').forEach(div => {
                        const checkbox = div.querySelector('input[type="checkbox"]');
                        const span = div.querySelector('span');
                        items.push({ checked: checkbox.checked, text: span.textContent });
                    });
                    bodySections[section.id] = serializeChecklist(items);
                }
            }
        });
    }

    // Rebuild body
    let newBody = '';
    if (typeDef) {
        typeDef.bodySections.forEach(section => {
            newBody += `## ${section.label}\n${bodySections[section.id] || ''}\n\n`;
        });
        const originalSections = parseSections(currentCard.body);
        if (originalSections['Activity Log']) {
            newBody += `## Activity Log\n${originalSections['Activity Log']}\n`;
        }
    } else {
        const textarea = formContainer.querySelector('textarea[data-section-id="body"]');
        if (textarea) newBody = textarea.value;
    }

    // Update meta
    frontmatter.meta = frontmatter.meta || {};
    frontmatter.meta.revision = (frontmatter.meta.revision || 0) + 1;
    frontmatter.meta.updatedAt = new Date().toISOString();
    delete frontmatter.meta.contentHash;

    const hash = await computeContentHash(frontmatter, newBody);
    frontmatter.meta.contentHash = hash;

    // Write file
    const cardType = currentCard.type === 'project' ? 'project' : 'feature';
    try {
        if (cardType === 'project') {
            const projectsDir = await ensureDirectory(workspaceHandle, 'projects');
            const fileHandle = await projectsDir.getFileHandle(`${currentCard.id}.md`);
            await writeFile(fileHandle, serializeCard(frontmatter, newBody));
            // Update project name in workspaceData if title changed
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
    } catch (e) {
        console.error(e);
        alert('Failed to update card: ' + e.message);
        return;
    }

    document.getElementById('card-modal').classList.add('hidden');
    await renderBoard();
}

function generateCardId(typeId) {
    const prefix = typeId.split('-').map(part => part[0].toUpperCase()).join('').slice(0, 3);
    const num = String(Date.now()).slice(-4);
    return `${prefix}-${num}`;
}

// ---------- Event Listeners ----------
document.getElementById('open-workspace-btn').addEventListener('click', async () => {
    try {
        const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
        await saveWorkspaceHandle(handle);
        await loadWorkspaceFromHandle(handle);
    } catch (err) {
        if (err.name !== 'AbortError') {
            alert('Failed to open workspace: ' + err.message);
        }
    }
});

document.getElementById('open-workspace-empty-btn').addEventListener('click', async () => {
    try {
        const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
        await saveWorkspaceHandle(handle);
        await loadWorkspaceFromHandle(handle);
    } catch (err) {
        if (err.name !== 'AbortError') {
            alert('Failed to open workspace: ' + err.message);
        }
    }
});

document.getElementById('new-card-btn').addEventListener('click', () => {
    if (!workspaceHandle) return;
    const cardType = currentBoard === 'workspace' ? 'project' : 'feature';
    openNewCardModal(cardType);
});

document.getElementById('close-modal-btn').addEventListener('click', () => {
    document.getElementById('card-modal').classList.add('hidden');
});

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
