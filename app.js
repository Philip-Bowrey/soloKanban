// ==================== SoloKanban v6.2 ====================
// Static web app for local-first dual-level Kanban with auto-save, settings, rich checklists.

// ---------- Global State ----------
let workspaceHandle = null;
let workspaceData = null;
let featureTypes = {};
let labels = {};
let customFields = {};
let currentBoard = 'workspace';
let currentProject = null;
let projectHandle = null;
let currentCard = null;
let editingNew = false;
let sdkVersionData = null;
let saveTimeout = null;
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
        // Ensure descriptions exist
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
async function fetchVersionData() { ... } // unchanged from previous
async function updateSdkAndSkills() { ... } // unchanged

// ---------- Board Rendering ----------
async function renderBoard() { ... } // largely unchanged, but use new card element functions

// ---------- Card Element Rendering ----------
function createCardElement(cardData, cardType) { ... } // adjust to avoid object display and support checklist progress

// ---------- Drag and Drop ----------
// Updated with click suppression as before

// ---------- Card Modal ----------
async function openCardModal(cardId, cardType) { ... }
function openNewCardModal(cardType) { ... }
function buildNewCardForm(container, cardType) { ... } // includes create button
function buildCardForm(container, frontmatter, body, cardType) { ... } // includes title, immutable projectId, fields, body sections with checklists

// Checklist rendering functions:
function renderChecklistSection(container, section, rawText, typeDef) { ... }
function startMarkdownEdit(renderedDiv, rawMd, sectionId) { ... }
function renderMarkdown(md) { ... }
function parseChecklist(text) { ... } // returns hierarchical structure
function serializeChecklist(items) { ... }

// Auto-save functions:
function debouncedAutoSave() { ... }
async function saveExistingCard() { ... } // collects form data including checklists
async function createNewCard(formContainer) { ... }

// Settings Modal
async function openSettings() { ... }
function renderSettingsTabs() { ... }
async function saveSettings() { ... }

// Project deletion
async function deleteProject(projectId) { ... }

// Event listeners for settings, modal close, etc.

// Initial load
(async () => { ... })();
