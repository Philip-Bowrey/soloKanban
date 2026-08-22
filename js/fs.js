// File System Access layer. This module is the ONLY place that talks to
// the filesystem. A board is a directory; a card is a file inside
// <board>/cards/; templates live in <board>/templates/; custom field
// definitions live in <board>/.solokanban/fields.json. There is no other
// data store — no IndexedDB-as-database, no network. IndexedDB is used
// here only to remember the directory *handle* between visits, per the
// File System Access API's own persistence model.

import { parseFile, stringifyFile } from './frontmatter.js';

const HANDLE_DB = 'solokanban-handles';
const HANDLE_STORE = 'handles';
const LAST_BOARD_KEY = 'last-board';

export function isSupported() {
  return 'showDirectoryPicker' in window;
}

// ---- Handle persistence (remembering the folder between visits) --------

function openHandleDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(HANDLE_DB, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(HANDLE_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveHandle(key, handle) {
  const db = await openHandleDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(HANDLE_STORE, 'readwrite');
    tx.objectStore(HANDLE_STORE).put(handle, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function loadHandle(key) {
  const db = await openHandleDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(HANDLE_STORE, 'readonly');
    const req = tx.objectStore(HANDLE_STORE).get(key);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

/** Returns the last-opened board's directory handle, if any, without prompting. */
export async function getRememberedBoardHandle() {
  return loadHandle(LAST_BOARD_KEY);
}

/** Verifies (or requests) read/write permission on a previously-saved handle. */
export async function ensurePermission(dirHandle) {
  const opts = { mode: 'readwrite' };
  if ((await dirHandle.queryPermission(opts)) === 'granted') return true;
  return (await dirHandle.requestPermission(opts)) === 'granted';
}

// ---- Board lifecycle -----------------------------------------------------

const DEFAULT_BOARD_JSON = {
  title: 'My Board',
  theme: { mode: 'system', font: 'monospace', background: '#0d1117' },
  lists: [
    { id: 'list-todo', title: 'To Do', wipLimit: 0, order: 0, isDoneColumn: false },
    { id: 'list-doing', title: 'In Progress', wipLimit: 3, order: 1, isDoneColumn: false },
    { id: 'list-done', title: 'Done', wipLimit: 0, order: 2, isDoneColumn: true },
  ],
  labels: [
    { id: 'label-bug', name: 'Bug', color: '#f85149' },
    { id: 'label-feature', name: 'Feature', color: '#58a6ff' },
  ],
  shortcutsEnabled: true,
};

const DEFAULT_FIELDS_JSON = { fields: [] };

/** Opens a folder picker, scaffolds the board if new, and returns a Board handle bundle. */
export async function pickAndOpenBoard() {
  const dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
  await saveHandle(LAST_BOARD_KEY, dirHandle);
  return openBoardFromHandle(dirHandle);
}

/** Opens a board from an already-known directory handle (returning user flow). */
export async function openBoardFromHandle(dirHandle) {
  const cardsDir = await dirHandle.getDirectoryHandle('cards', { create: true });
  const templatesDir = await dirHandle.getDirectoryHandle('templates', { create: true });
  const metaDir = await dirHandle.getDirectoryHandle('.solokanban', { create: true });

  const boardJson = await readJsonOrDefault(dirHandle, 'board.json', DEFAULT_BOARD_JSON);
  const fieldsJson = await readJsonOrDefault(metaDir, 'fields.json', DEFAULT_FIELDS_JSON);

  if (!(await fileExists(dirHandle, 'board.json'))) {
    await writeJson(dirHandle, 'board.json', boardJson);
  }
  if (!(await fileExists(metaDir, 'fields.json'))) {
    await writeJson(metaDir, 'fields.json', fieldsJson);
  }

  const cards = await readAllCardFiles(cardsDir);
  const templates = await readAllCardFiles(templatesDir);

  return {
    dirHandle,
    cardsDir,
    templatesDir,
    metaDir,
    board: boardJson,
    fields: fieldsJson.fields,
    cards,
    templates,
  };
}

// ---- board.json / fields.json --------------------------------------------

export async function saveBoardJson(ctx, board) {
  ctx.board = board;
  await writeJson(ctx.dirHandle, 'board.json', board);
}

export async function saveFieldsJson(ctx, fields) {
  ctx.fields = fields;
  await writeJson(ctx.metaDir, 'fields.json', { fields });
}

// ---- Card / template file I/O --------------------------------------------

async function readAllCardFiles(dirHandle) {
  const results = [];
  for await (const [name, handle] of dirHandle.entries()) {
    if (handle.kind !== 'file' || !name.endsWith('.md')) continue;
    const file = await handle.getFile();
    const raw = await file.text();
    const { frontmatter, body } = parseFile(raw);
    results.push({ id: frontmatter.id || name.replace(/\.md$/, ''), fileName: name, ...frontmatter, description: body });
  }
  return results;
}

function cardFileName(card) {
  return `${card.id}.md`;
}

function cardToFileShape(card) {
  const { description, fileName, ...frontmatter } = card;
  return { frontmatter, body: description || '' };
}

export async function writeCard(ctx, card) {
  const handle = await ctx.cardsDir.getFileHandle(cardFileName(card), { create: true });
  const writable = await handle.createWritable();
  await writable.write(stringifyFile(cardToFileShape(card)));
  await writable.close();
}

export async function writeTemplate(ctx, template) {
  const handle = await ctx.templatesDir.getFileHandle(cardFileName(template), { create: true });
  const writable = await handle.createWritable();
  await writable.write(stringifyFile(cardToFileShape(template)));
  await writable.close();
}

export async function deleteCard(ctx, card) {
  await ctx.cardsDir.removeEntry(cardFileName(card));
}

export async function deleteTemplate(ctx, template) {
  await ctx.templatesDir.removeEntry(cardFileName(template));
}

// ---- helpers ---------------------------------------------------------------

async function fileExists(dirHandle, name) {
  try {
    await dirHandle.getFileHandle(name);
    return true;
  } catch {
    return false;
  }
}

async function readJsonOrDefault(dirHandle, name, fallback) {
  try {
    const handle = await dirHandle.getFileHandle(name);
    const file = await handle.getFile();
    const text = await file.text();
    return JSON.parse(text);
  } catch {
    return structuredClone(fallback);
  }
}

async function writeJson(dirHandle, name, obj) {
  const handle = await dirHandle.getFileHandle(name, { create: true });
  const writable = await handle.createWritable();
  await writable.write(JSON.stringify(obj, null, 2));
  await writable.close();
}
