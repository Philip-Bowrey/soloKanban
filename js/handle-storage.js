/**
 * SoloKanban Workspace Directory Handle Storage
 * Uses IndexedDB to persist FileSystemDirectoryHandle across browser reloads.
 */

const DB_NAME = 'solokanban_idb';
const DB_VERSION = 1;
const STORE_NAME = 'handles';
const KEY_ACTIVE_WORKSPACE = 'active_workspace';

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      return reject(new Error('IndexedDB not supported'));
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Saves a FileSystemDirectoryHandle to IndexedDB.
 * @param {FileSystemDirectoryHandle} dirHandle 
 */
export async function saveWorkspaceHandle(dirHandle) {
  try {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const record = {
        id: KEY_ACTIVE_WORKSPACE,
        handle: dirHandle,
        name: dirHandle.name || 'Workspace',
        savedAt: new Date().toISOString()
      };
      const req = store.put(record);
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('[SoloKanban] Could not persist workspace handle to IndexedDB:', err);
    return false;
  }
}

/**
 * Retrieves the previously stored FileSystemDirectoryHandle from IndexedDB.
 * @returns {Promise<{ handle: FileSystemDirectoryHandle, name: string } | null>}
 */
export async function getStoredWorkspaceHandle() {
  try {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(KEY_ACTIVE_WORKSPACE);
      req.onsuccess = () => {
        if (req.result && req.result.handle) {
          resolve(req.result);
        } else {
          resolve(null);
        }
      };
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    return null;
  }
}

/**
 * Clears stored workspace handle from IndexedDB.
 */
export async function clearStoredWorkspaceHandle() {
  try {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(KEY_ACTIVE_WORKSPACE);
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    return false;
  }
}

/**
 * Queries or requests readwrite permission for a stored directory handle.
 * @param {FileSystemDirectoryHandle} handle 
 * @param {boolean} promptUser If true, requests permission interactively when not already granted.
 * @returns {Promise<boolean>} True if permission is granted.
 */
export async function verifyHandlePermission(handle, promptUser = false) {
  if (!handle || typeof handle.queryPermission !== 'function') {
    return true; // Virtual or mock handle
  }
  try {
    const opts = { mode: 'readwrite' };
    const queryStatus = await handle.queryPermission(opts);
    if (queryStatus === 'granted') {
      return true;
    }
    if (promptUser && typeof handle.requestPermission === 'function') {
      const reqStatus = await handle.requestPermission(opts);
      return reqStatus === 'granted';
    }
  } catch (e) {
    console.warn('[SoloKanban] Permission check failed:', e);
  }
  return false;
}
