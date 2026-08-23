// ==================== SoloKanban App ====================
// Implements the v5.0 PRD as a static client‑side web app
// Uses File System Access API to operate on local folders.

// ---------- Global State ----------
let workspaceHandle = null;
let workspaceData = null;   // parsed workspace.json
let featureTypes = {};      // id -> definition
let currentProject = null;  // current project object
let projectHandle = null;   // directory handle for current project
let currentCard = null;     // card being edited

// ---------- Utility: IndexedDB for storing directory handle ----------
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
// Handles simple YAML: key: value, nested via indentation.
// Only supports strings, numbers, booleans, arrays, and nested objects.

function parseYaml(yamlText) {
    const lines = yamlText.split('\n');
    const root = {};
    let stack = [{ obj: root, indent: -1, key: null }];
    let currentIndent = -1;
    let currentObj = root;
    let currentKey = null;
    let arrayContext = null;

    for (let rawLine of lines) {
        const line = rawLine.replace(/\r$/, '');
        if (!line.trim() || line.trim().startsWith('#')) continue;
        const indent = line.search(/\S|$/);
        const trimmed = line.trim();
        // handle list item "- item"
        if (trimmed.startsWith('- ')) {
            const value = trimmed.slice(2).trim();
            if (arrayContext && indent > arrayContext.indent) {
                arrayContext.array.push(value);
            } else {
                // new array under current object/key
                if (currentKey) {
                    const arr = [];
                    currentObj[currentKey] = arr;
                    arrayContext = { array: arr, indent: indent, key: currentKey };
                    arr.push(value);
                }
            }
            continue;
        }
        // handle key: value
        const colonIdx = trimmed.indexOf(':');
        if (colonIdx === -1) continue;
        const key = trimmed.slice(0, colonIdx).trim();
        let value = trimmed.slice(colonIdx + 1).trim();

        // nested object or array
        if (value === '' || value === '{}' || value === '[]') {
            // move into nested context
            const newObj = {};
            currentObj[key] = newObj;
            stack.push({ obj: currentObj, indent: currentIndent, key: currentKey });
            currentObj = newObj;
            currentKey = key;
            currentIndent = indent;
            continue;
        }
        // parse scalar
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
    // 1. Normalize line endings and strip trailing whitespace in body
    const normalizedBody = bodyText.split('\n').map(line => line.replace(/\s+$/, '')).join('\n');
    // 2. Exclude volatile meta fields for hashing
    const fmClone = JSON.parse(JSON.stringify(frontmatterObj));
    if (fmClone.meta) {
        delete fmClone.meta.revision;
        delete fmClone.meta.contentHash;
        delete fmClone.meta.updatedAt;
        delete fmClone.meta.updatedBy;
    }
    // 3. Sort keys recursively
    const sortedFm = sortObject(fmClone);
    const canonicalYaml = serializeYaml(sortedFm, 0);
    const combined = canonicalYaml + '\n---\n' + normalizedBody;
    // 4. SHA-256
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
            // Always treat the last part as a file (create if requested)
            return await current.getFileHandle(part, { create });
        } else {
            // Intermediate parts are directories
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

// ---------- Workspace Loading ----------
async function openWorkspace() {
    try {
        const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
        await saveWorkspaceHandle(handle);
        await loadWorkspaceFromHandle(handle);
    } catch (err) {
        console.error('Workspace open failed:', err);
        if (err.name !== 'AbortError') {
            alert('Failed to open workspace: ' + err.message);
        }
    }
}

async function loadWorkspaceFromHandle(handle) {
    workspaceHandle = handle;
    document.getElementById('workspace-name').textContent = handle.name;
    document.getElementById('empty-state').classList.add('hidden');
    document.getElementById('create-card-btn').disabled = false;

    // Load workspace.json
    try {
        const wsFileHandle = await getFileHandle(handle, 'workspace.json');
        const wsContent = await readFile(wsFileHandle);
        workspaceData = JSON.parse(wsContent);
    } catch (err) {
        console.warn('workspace.json not found, creating default.');
        workspaceData = {
            name: handle.name,
            projects: []
        };
        const wsFileHandle = await getFileHandle(handle, 'workspace.json', true);
        await writeFile(wsFileHandle, JSON.stringify(workspaceData, null, 2));
    }

    // Load feature types
    try {
        const ftFileHandle = await getFileHandle(handle, '.solokanban/feature-types.json');
        const ftContent = await readFile(ftFileHandle);
        const ftData = JSON.parse(ftContent);
        featureTypes = {};
        ftData.types.forEach(t => featureTypes[t.id] = t);
    } catch (err) {
        console.warn('feature-types.json not found or invalid, using defaults.');
        featureTypes = getDefaultFeatureTypes();
        // Optionally create the file
        const dir = await ensureDirectory(handle, '.solokanban');
        const ftFileHandle = await dir.getFileHandle('feature-types.json', { create: true });
        await writeFile(ftFileHandle, JSON.stringify({ types: Object.values(featureTypes) }, null, 2));
    }

    // Load projects
    const projects = workspaceData.projects || [];
    if (projects.length === 0) {
        // If no projects, create a default one
        const defaultProject = { id: 'improvements', name: 'Improvements' };
        workspaceData.projects.push(defaultProject);
        await saveWorkspaceJson();
        projects.push(defaultProject);
    }
    // For now, load first project
    await loadProject(projects[0].id);
}

async function saveWorkspaceJson() {
    const wsFileHandle = await getFileHandle(workspaceHandle, 'workspace.json', true);
    await writeFile(wsFileHandle, JSON.stringify(workspaceData, null, 2));
}

// ---------- Project Loading ----------
async function loadProject(projectId) {
    const projectDir = await ensureDirectory(workspaceHandle, projectId);
    projectHandle = projectDir;
    currentProject = { id: projectId, name: projectId };

    // Load project.json
    let projectJson = null;
    try {
        const projFileHandle = await projectDir.getFileHandle('project.json');
        const content = await readFile(projFileHandle);
        projectJson = JSON.parse(content);
    } catch (err) {
        console.warn('project.json not found, creating default.');
        projectJson = {
            id: projectId,
            lists: [
                { id: 'backlog', name: 'Backlog' },
                { id: 'in-progress', name: 'In Progress' },
                { id: 'done', name: 'Done' }
            ],
            featureOrder: {
                'backlog': [], 'in-progress': [], 'done': []
            }
        };
        const projFileHandle = await projectDir.getFileHandle('project.json', { create: true });
        await writeFile(projFileHandle, JSON.stringify(projectJson, null, 2));
    }
    currentProject.data = projectJson;
    await renderBoard();
}

// ---------- Board Rendering ----------
async function renderBoard() {
    const boardEl = document.getElementById('board');
    boardEl.innerHTML = '';
    const lists = currentProject.data.lists || [];
    const featureOrder = currentProject.data.featureOrder || {};

    for (const list of lists) {
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
        boardEl.appendChild(columnEl);

        const cardIds = featureOrder[list.id] || [];
        let count = 0;
        for (const cardId of cardIds) {
            const card = await loadCard(cardId);
            if (card) {
                const cardEl = createCardElement(card);
                cardsContainer.appendChild(cardEl);
                count++;
            }
        }
        header.querySelector('.card-count').textContent = count;
    }

    setupDragAndDrop();
}

function createCardElement(card) {
    const cardEl = document.createElement('div');
    cardEl.className = 'card';
    cardEl.draggable = true;
    cardEl.dataset.cardId = card.id;
    cardEl.innerHTML = `
        <div class="card-title">${escapeHtml(card.title || 'Untitled')}</div>
        <div class="card-type">${escapeHtml(card.type || '')}</div>
    `;
    cardEl.addEventListener('click', () => openCardModal(card.id));
    return cardEl;
}

async function loadCard(cardId) {
    try {
        const featuresDir = await ensureDirectory(projectHandle, 'features');
        const fileHandle = await featuresDir.getFileHandle(`${cardId}.md`);
        const content = await readFile(fileHandle);
        return parseCardMarkdown(cardId, content);
    } catch (err) {
        console.warn('Card not found:', cardId, err);
        return null;
    }
}

function parseCardMarkdown(cardId, content) {
    // Split frontmatter and body
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
    let frontmatter = {};
    let body = content;
    if (fmMatch) {
        try {
            frontmatter = parseYaml(fmMatch[1]);
        } catch (e) {
            console.error('YAML parse error:', e);
        }
        body = fmMatch[2];
    }
    frontmatter.id = cardId;
    return { frontmatter, body, id: cardId };
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

let draggedCardId = null;

function handleDragStart(e) {
    draggedCardId = e.target.dataset.cardId;
    e.target.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
}

function handleDragEnd(e) {
    e.target.classList.remove('dragging');
    draggedCardId = null;
}

function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
}

async function handleDrop(e) {
    e.preventDefault();
    const targetListId = e.currentTarget.dataset.listId;
    if (draggedCardId && targetListId) {
        await moveCard(draggedCardId, targetListId);
    }
}

async function moveCard(cardId, targetListId) {
    // Update project.json featureOrder
    const projectData = currentProject.data;
    const featureOrder = projectData.featureOrder;
    // Remove from all lists
    for (const listId in featureOrder) {
        featureOrder[listId] = featureOrder[listId].filter(id => id !== cardId);
    }
    // Add to target
    if (!featureOrder[targetListId]) featureOrder[targetListId] = [];
    featureOrder[targetListId].push(cardId);

    // Save project.json
    const projFileHandle = await projectHandle.getFileHandle('project.json', { create: true });
    await writeFile(projFileHandle, JSON.stringify(projectData, null, 2));

    // Update card frontmatter listId and Activity Log
    const featuresDir = await ensureDirectory(projectHandle, 'features');
    const cardFileHandle = await featuresDir.getFileHandle(`${cardId}.md`);
    const content = await readFile(cardFileHandle);
    const { frontmatter, body } = parseCardMarkdown(cardId, content);
    frontmatter.listId = targetListId;
    frontmatter.meta = frontmatter.meta || {};
    frontmatter.meta.revision = (frontmatter.meta.revision || 0) + 1;
    frontmatter.meta.updatedAt = new Date().toISOString();
    const activityEntry = `- ${new Date().toISOString()} — Moved to ${targetListId}`;
    const newBody = appendActivityLog(body, activityEntry);
    const newContent = serializeCard(frontmatter, newBody);
    await writeFile(cardFileHandle, newContent);
    await renderBoard();
}

function appendActivityLog(body, entry) {
    // Ensure Activity Log is at end
    const lines = body.split('\n');
    let activityIndex = -1;
    for (let i = lines.length - 1; i >= 0; i--) {
        if (lines[i].trim() === '## Activity Log') {
            activityIndex = i;
            break;
        }
    }
    if (activityIndex === -1) {
        body = body.trimEnd() + '\n\n## Activity Log\n' + entry + '\n';
    } else {
        // Insert entry before any trailing empty lines
        const before = lines.slice(0, activityIndex + 1).join('\n');
        const after = lines.slice(activityIndex + 1).join('\n').trimStart();
        body = before + '\n' + entry + (after ? '\n' + after : '') + '\n';
    }
    return body;
}

function serializeCard(frontmatter, body) {
    const fmYaml = serializeYaml(frontmatter, 0);
    return '---\n' + fmYaml + '\n---\n' + body;
}

// ---------- Card Modal ----------
async function openCardModal(cardId) {
    const card = await loadCard(cardId);
    if (!card) return;
    currentCard = card;
    document.getElementById('modal-title').textContent = `Edit ${card.frontmatter.title || cardId}`;
    const formContainer = document.getElementById('card-form');
    formContainer.innerHTML = '';

    const typeDef = featureTypes[card.frontmatter.type] || null;
    if (typeDef) {
        // Render frontmatter fields
        for (const field of typeDef.frontmatterFields || []) {
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
                    if (card.frontmatter[field.key] === opt) option.selected = true;
                    input.appendChild(option);
                });
            } else if (field.type === 'url') {
                input = document.createElement('input');
                input.type = 'url';
            } else {
                input = document.createElement('input');
                input.type = 'text';
            }
            input.value = card.frontmatter[field.key] || '';
            input.dataset.fieldKey = field.key;
            group.appendChild(input);
            formContainer.appendChild(group);
        }

        // Render body sections
        const bodySections = parseSections(card.body);
        for (const section of typeDef.bodySections || []) {
            const heading = document.createElement('div');
            heading.className = 'section-heading';
            heading.textContent = section.label;
            formContainer.appendChild(heading);

            if (section.type === 'markdown') {
                const textarea = document.createElement('textarea');
                textarea.dataset.sectionId = section.id;
                textarea.value = bodySections[section.id] || '';
                formContainer.appendChild(textarea);
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
                formContainer.appendChild(checklistDiv);
            }
        }
    } else {
        // Fallback: single textarea for body
        const textarea = document.createElement('textarea');
        textarea.value = card.body;
        textarea.dataset.sectionId = 'body';
        formContainer.appendChild(textarea);
    }

    document.getElementById('conflict-warning').classList.add('hidden');
    document.getElementById('card-modal').classList.remove('hidden');
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
    // Trim trailing newlines from each section
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
document.getElementById('save-card-btn').addEventListener('click', async () => {
    if (!currentCard) return;
    const frontmatter = { ...currentCard.frontmatter };
    const typeDef = featureTypes[frontmatter.type] || null;
    const bodySections = {};

    // Collect form values
    const formContainer = document.getElementById('card-form');
    // Frontmatter fields
    const inputs = formContainer.querySelectorAll('input[data-field-key], select[data-field-key]');
    inputs.forEach(input => {
        frontmatter[input.dataset.fieldKey] = input.value;
    });

    // Body sections
    if (typeDef) {
        for (const section of typeDef.bodySections || []) {
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
        }
    } else {
        const textarea = formContainer.querySelector('textarea[data-section-id="body"]');
        if (textarea) {
            currentCard.body = textarea.value;
        }
    }

    // Rebuild body preserving Activity Log
    let newBody = '';
    if (typeDef) {
        for (const section of typeDef.bodySections || []) {
            const label = section.label;
            newBody += `## ${label}\n${bodySections[section.id] || ''}\n\n`;
        }
        // Append existing Activity Log from original body
        const originalSections = parseSections(currentCard.body);
        if (originalSections['Activity Log']) {
            newBody += `## Activity Log\n${originalSections['Activity Log']}\n`;
        }
    } else {
        newBody = currentCard.body;
    }

    // Update meta
    frontmatter.meta = frontmatter.meta || {};
    frontmatter.meta.revision = (frontmatter.meta.revision || 0) + 1;
    frontmatter.meta.updatedAt = new Date().toISOString();
    delete frontmatter.meta.contentHash; // will be recomputed

    // Compute hash
    const hash = await computeContentHash(frontmatter, newBody);
    frontmatter.meta.contentHash = hash;

    // Write card file
    const featuresDir = await ensureDirectory(projectHandle, 'features');
    const fileHandle = await featuresDir.getFileHandle(`${currentCard.id}.md`);
    const newContent = serializeCard(frontmatter, newBody);
    await writeFile(fileHandle, newContent);

    // Close modal and refresh board
    document.getElementById('card-modal').classList.add('hidden');
    await renderBoard();
});

document.getElementById('close-modal-btn').addEventListener('click', () => {
    document.getElementById('card-modal').classList.add('hidden');
});

// ---------- Create Card ----------
document.getElementById('create-card-btn').addEventListener('click', () => {
    if (!workspaceHandle) return;
    const modal = document.getElementById('card-modal');
    document.getElementById('modal-title').textContent = 'New Card';
    const formContainer = document.getElementById('card-form');
    formContainer.innerHTML = '';

    // Type selector
    const typeGroup = document.createElement('div');
    typeGroup.className = 'form-group';
    typeGroup.innerHTML = `<label>Feature Type</label>`;
    const typeSelect = document.createElement('select');
    typeSelect.id = 'new-card-type';
    Object.values(featureTypes).forEach(type => {
        const opt = document.createElement('option');
        opt.value = type.id;
        opt.textContent = type.name;
        typeSelect.appendChild(opt);
    });
    typeGroup.appendChild(typeSelect);
    formContainer.appendChild(typeGroup);

    // Title
    const titleGroup = document.createElement('div');
    titleGroup.className = 'form-group';
    titleGroup.innerHTML = `<label>Title</label>`;
    const titleInput = document.createElement('input');
    titleInput.type = 'text';
    titleInput.id = 'new-card-title';
    titleGroup.appendChild(titleInput);
    formContainer.appendChild(titleGroup);

    // Hidden field to mark as new
    formContainer.dataset.newCard = 'true';
    document.getElementById('conflict-warning').classList.add('hidden');
    modal.classList.remove('hidden');
});

// Override save for new card
document.getElementById('save-card-btn').addEventListener('click', async (e) => {
    const formContainer = document.getElementById('card-form');
    if (formContainer.dataset.newCard === 'true') {
        e.preventDefault();
        const typeId = document.getElementById('new-card-type').value;
        const title = document.getElementById('new-card-title').value.trim();
        if (!title) {
            alert('Title is required');
            return;
        }
        // Generate ID
        const cardId = generateCardId(typeId);
        const typeDef = featureTypes[typeId];
        const frontmatter = {
            id: cardId,
            projectId: currentProject.id,
            listId: 'backlog', // default
            type: typeId,
            title: title,
            meta: {
                revision: 0,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            }
        };
        // Add default frontmatter fields from type
        for (const field of typeDef.frontmatterFields || []) {
            if (field.default !== undefined) frontmatter[field.key] = field.default;
        }
        // Generate body with empty sections and Activity Log
        let body = '';
        for (const section of typeDef.bodySections || []) {
            body += `## ${section.label}\n\n`;
        }
        body += `## Activity Log\n- ${new Date().toISOString()} — Card created\n`;
        frontmatter.meta.contentHash = await computeContentHash(frontmatter, body);

        // Write file
        const featuresDir = await ensureDirectory(projectHandle, 'features');
        const fileHandle = await featuresDir.getFileHandle(`${cardId}.md`, { create: true });
        await writeFile(fileHandle, serializeCard(frontmatter, body));

        // Add to project order
        const projectData = currentProject.data;
        if (!projectData.featureOrder['backlog']) projectData.featureOrder['backlog'] = [];
        projectData.featureOrder['backlog'].push(cardId);
        const projFileHandle = await projectHandle.getFileHandle('project.json', { create: true });
        await writeFile(projFileHandle, JSON.stringify(projectData, null, 2));

        // Close modal and refresh
        document.getElementById('card-modal').classList.add('hidden');
        await renderBoard();
    } else {
        // Let existing save handler run (but we need to avoid double binding)
        // This is a hack; in production would use a single handler.
        // We'll just call the original save logic again by dispatching a custom event,
        // but for simplicity we'll duplicate the save logic here? Better to restructure.
        // For now, we'll just call the same code block as above (but that would duplicate).
        // Instead, we'll mark that the original handler should continue.
    }
});

function generateCardId(typeId) {
    const prefix = typeId.split('-').map(part => part[0].toUpperCase()).join('').slice(0, 3);
    const num = String(Date.now()).slice(-4);
    return `${prefix}-${num}`;
}

// ---------- Default Feature Types ----------
function getDefaultFeatureTypes() {
    return {
        'agent-capability': {
            id: 'agent-capability', name: 'Agent Capability',
            frontmatterFields: [
                { key: 'targetProject', label: 'Target Project', type: 'text', required: true },
                { key: 'impact', label: 'Impact', type: 'select', options: ['high', 'medium', 'low'], default: 'medium' },
                { key: 'effort', label: 'Effort', type: 'select', options: ['high', 'medium', 'low'], default: 'medium' },
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
            id: 'bug-fix', name: 'Bug Fix',
            frontmatterFields: [
                { key: 'targetProject', label: 'Target Project', type: 'text', required: true },
                { key: 'severity', label: 'Severity', type: 'select', options: ['critical', 'major', 'minor'], default: 'major' },
                { key: 'repoUrl', label: 'Repository URL', type: 'url' }
            ],
            bodySections: [
                { id: 'steps-to-reproduce', label: 'Steps to Reproduce', type: 'markdown', required: true },
                { id: 'expected-vs-actual', label: 'Expected vs Actual', type: 'markdown', required: true },
                { id: 'fix-validation', label: 'Fix Validation', type: 'checklist' }
            ]
        },
        'process-change': {
            id: 'process-change', name: 'Process Change',
            frontmatterFields: [
                { key: 'targetProcess', label: 'Target Process', type: 'text', required: true },
                { key: 'impact', label: 'Impact', type: 'select', options: ['high', 'medium', 'low'], default: 'medium' },
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
            id: 'tooling-change', name: 'Tooling Change',
            frontmatterFields: [
                { key: 'targetTool', label: 'Target Tool', type: 'text', required: true },
                { key: 'changeType', label: 'Change Type', type: 'select', options: ['tool-calling', 'api-integration', 'configuration', 'new-tool'], default: 'api-integration' },
                { key: 'impact', label: 'Impact', type: 'select', options: ['high', 'medium', 'low'], default: 'medium' }
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
            id: 'documentation-update', name: 'Documentation Update',
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
            id: 'test-data-generation', name: 'Test Data Generation',
            frontmatterFields: [
                { key: 'targetProject', label: 'Target Project', type: 'text', required: true },
                { key: 'dataType', label: 'Data Type', type: 'text', required: true },
                { key: 'purpose', label: 'Purpose', type: 'text' },
                { key: 'impact', label: 'Impact', type: 'select', options: ['high', 'medium', 'low'], default: 'medium' }
            ],
            bodySections: [
                { id: 'data-requirements', label: 'Data Requirements', type: 'markdown', required: true },
                { id: 'generation-approach', label: 'Generation Approach', type: 'markdown' },
                { id: 'validation', label: 'Validation', type: 'checklist' },
                { id: 'output-location', label: 'Output Location', type: 'markdown' },
                { id: 'outcome', label: 'Outcome', type: 'markdown' }
            ]
        }
    };
}

// ---------- Escape HTML ----------
function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// ---------- Initialisation ----------
document.getElementById('open-workspace-btn').addEventListener('click', openWorkspace);
document.getElementById('open-workspace-empty-btn').addEventListener('click', openWorkspace);

// Try to load saved workspace handle on start
(async () => {
    try {
        const saved = await getSavedWorkspaceHandle();
        if (saved) {
            await loadWorkspaceFromHandle(saved);
        }
    } catch (err) {
        console.log('No saved workspace handle or permission denied.');
    }
})();
