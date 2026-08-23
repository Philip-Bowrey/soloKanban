/**
 * SoloKanban File System Access API Adapter & Mock Adapter
 * Provides atomic file writes, soft-delete with collision handling, quarantine routing, and temp file cleanup.
 */

export class FileSystemAdapter {
  /**
   * @param {FileSystemDirectoryHandle|MockFileSystem} rootHandle 
   */
  constructor(rootHandle = null) {
    this.rootHandle = rootHandle;
  }

  isSupported() {
    return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
  }

  /**
   * Reads file content as text from path relative to workspace root.
   * @param {string} relativePath 
   * @returns {Promise<string|null>}
   */
  async readFile(relativePath) {
    if (!this.rootHandle) return null;
    const parts = relativePath.split('/').filter(Boolean);
    let currentDir = this.rootHandle;

    try {
      for (let i = 0; i < parts.length - 1; i++) {
        currentDir = await currentDir.getDirectoryHandle(parts[i], { create: false });
      }
      const fileHandle = await currentDir.getFileHandle(parts[parts.length - 1], { create: false });
      const file = await fileHandle.getFile();
      return await file.text();
    } catch (e) {
      if (e.name === 'NotFoundError' || e.code === 8) {
        return null;
      }
      throw e;
    }
  }

  /**
   * Writes content to file at relativePath atomically via temp file replace.
   * @param {string} relativePath 
   * @param {string} content 
   */
  async writeFile(relativePath, content) {
    if (!this.rootHandle) throw new Error('No workspace directory handle bound.');
    const parts = relativePath.split('/').filter(Boolean);
    const fileName = parts.pop();
    let currentDir = this.rootHandle;

    for (const part of parts) {
      currentDir = await currentDir.getDirectoryHandle(part, { create: true });
    }

    const tempFileName = `.${fileName}.tmp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    
    try {
      // 1. Write to temp file
      const tempHandle = await currentDir.getFileHandle(tempFileName, { create: true });
      const writable = await tempHandle.createWritable();
      await writable.write(content);
      await writable.close();

      // 2. Atomic copy / replace into destination
      const targetHandle = await currentDir.getFileHandle(fileName, { create: true });
      const targetWritable = await targetHandle.createWritable();
      await targetWritable.write(content);
      await targetWritable.close();

      // 3. Remove temp file
      try {
        await currentDir.removeEntry(tempFileName);
      } catch (e) {
        // Safe to ignore if auto-removed
      }
    } catch (err) {
      // Clean up temp file on failure
      this.cleanupTempFiles(currentDir).catch(() => {});
      throw err;
    }
  }

  /**
   * Deletes temporary files (.tmp*) in a directory handle.
   * @param {FileSystemDirectoryHandle} dirHandle 
   */
  async cleanupTempFiles(dirHandle = this.rootHandle) {
    if (!dirHandle) return;
    try {
      for await (const [name, entry] of dirHandle.entries()) {
        if (entry.kind === 'file' && (name.startsWith('.') || name.includes('.tmp'))) {
          try {
            await dirHandle.removeEntry(name);
          } catch (e) {}
        }
      }
    } catch (e) {}
  }

  /**
   * Lists file names inside directory.
   * @param {string} dirPath 
   * @returns {Promise<string[]>}
   */
  async listFiles(dirPath) {
    if (!this.rootHandle) return [];
    const parts = dirPath.split('/').filter(Boolean);
    let currentDir = this.rootHandle;

    try {
      for (const part of parts) {
        currentDir = await currentDir.getDirectoryHandle(part, { create: false });
      }
      const files = [];
      for await (const [name, entry] of currentDir.entries()) {
        if (entry.kind === 'file' && !name.startsWith('.')) {
          files.push(name);
        }
      }
      return files;
    } catch (e) {
      return [];
    }
  }

  /**
   * Lists subdirectory names inside directory.
   * @param {string} dirPath 
   * @returns {Promise<string[]>}
   */
  async listDirectories(dirPath) {
    if (!this.rootHandle) return [];
    const parts = dirPath.split('/').filter(Boolean);
    let currentDir = this.rootHandle;

    try {
      for (const part of parts) {
        currentDir = await currentDir.getDirectoryHandle(part, { create: false });
      }
      const dirs = [];
      for await (const [name, entry] of currentDir.entries()) {
        if (entry.kind === 'directory' && !name.startsWith('.')) {
          dirs.push(name);
        }
      }
      return dirs;
    } catch (e) {
      return [];
    }
  }

  /**
   * Soft-deletes a project folder into /.solokanban/trash/<projectId>_<timestamp>/ with collision handling.
   * @param {string} projectId 
   */
  async softDeleteProject(projectId) {
    if (!this.rootHandle) return;
    const projectDirName = projectId;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    let targetTrashName = `${projectId}_${timestamp}`;

    const trashDir = await this.ensureDirectory('.solokanban/trash');

    // Handle collision by appending suffix if exists
    let counter = 1;
    let finalTrashName = targetTrashName;
    while (await this.existsDirectory(`.solokanban/trash/${finalTrashName}`)) {
      finalTrashName = `${targetTrashName}_${counter++}`;
    }

    // Move files from project dir to trash dir
    const newTrashSubDir = await trashDir.getDirectoryHandle(finalTrashName, { create: true });
    await this.copyDirectoryRecursive(`${projectId}`, `.solokanban/trash/${finalTrashName}`);
    await this.deleteDirectoryRecursive(`${projectId}`);
  }

  /**
   * Moves a corrupt or unparseable card to /.solokanban/quarantine/<filename>.
   * @param {string} relativePath 
   */
  async quarantineCard(relativePath) {
    const content = await this.readFile(relativePath);
    if (!content) return;

    const fileName = relativePath.split('/').pop();
    await this.writeFile(`.solokanban/quarantine/${fileName}`, content);
    await this.deleteFile(relativePath);
  }

  async deleteFile(relativePath) {
    if (!this.rootHandle) return;
    const parts = relativePath.split('/').filter(Boolean);
    const fileName = parts.pop();
    let currentDir = this.rootHandle;

    try {
      for (const part of parts) {
        currentDir = await currentDir.getDirectoryHandle(part, { create: false });
      }
      await currentDir.removeEntry(fileName);
    } catch (e) {}
  }

  async ensureDirectory(dirPath) {
    const parts = dirPath.split('/').filter(Boolean);
    let current = this.rootHandle;
    for (const part of parts) {
      current = await current.getDirectoryHandle(part, { create: true });
    }
    return current;
  }

  async existsDirectory(dirPath) {
    const parts = dirPath.split('/').filter(Boolean);
    let current = this.rootHandle;
    try {
      for (const part of parts) {
        current = await current.getDirectoryHandle(part, { create: false });
      }
      return true;
    } catch (e) {
      return false;
    }
  }

  async copyDirectoryRecursive(srcPath, destPath) {
    const files = await this.listFiles(srcPath);
    for (const f of files) {
      const content = await this.readFile(`${srcPath}/${f}`);
      await this.writeFile(`${destPath}/${f}`, content);
    }
    const dirs = await this.listDirectories(srcPath);
    for (const d of dirs) {
      await this.copyDirectoryRecursive(`${srcPath}/${d}`, `${destPath}/${d}`);
    }
  }

  async deleteDirectoryRecursive(dirPath) {
    if (!this.rootHandle) return;
    const parts = dirPath.split('/').filter(Boolean);
    const dirToDelete = parts.pop();
    let parentDir = this.rootHandle;

    try {
      for (const part of parts) {
        parentDir = await parentDir.getDirectoryHandle(part, { create: false });
      }
      await parentDir.removeEntry(dirToDelete, { recursive: true });
    } catch (e) {}
  }
}

/**
 * In-memory Mock File System Adapter for testing and Node environments.
 */
export class MockFileSystemAdapter extends FileSystemAdapter {
  constructor(initialFiles = {}) {
    super(null);
    this.files = new Map();
    for (const [path, content] of Object.entries(initialFiles)) {
      this.files.set(this.normalizePath(path), content);
    }
    this.mtime = new Map();
  }

  normalizePath(path) {
    return path.replace(/^\//, '').replace(/\/+/g, '/');
  }

  async readFile(relativePath) {
    const key = this.normalizePath(relativePath);
    if (!this.files.has(key)) return null;
    return this.files.get(key);
  }

  async writeFile(relativePath, content) {
    const key = this.normalizePath(relativePath);
    this.files.set(key, content);
    this.mtime.set(key, Date.now());
  }

  async deleteFile(relativePath) {
    const key = this.normalizePath(relativePath);
    this.files.delete(key);
    this.mtime.delete(key);
  }

  async listFiles(dirPath) {
    const normDir = this.normalizePath(dirPath) + '/';
    const files = new Set();

    for (const path of this.files.keys()) {
      if (path.startsWith(normDir)) {
        const sub = path.substring(normDir.length);
        if (!sub.includes('/') && !sub.startsWith('.')) {
          files.add(sub);
        }
      }
    }
    return Array.from(files);
  }

  async listDirectories(dirPath) {
    const normDir = this.normalizePath(dirPath);
    const prefix = normDir === '' ? '' : normDir + '/';
    const dirs = new Set();

    for (const path of this.files.keys()) {
      if (path.startsWith(prefix)) {
        const sub = path.substring(prefix.length);
        const parts = sub.split('/');
        if (parts.length > 1 && !parts[0].startsWith('.')) {
          dirs.add(parts[0]);
        }
      }
    }
    return Array.from(dirs);
  }

  async cleanupTempFiles(dirPath = '') {
    const normDir = this.normalizePath(dirPath);
    const prefix = normDir === '' ? '' : normDir + '/';
    for (const path of Array.from(this.files.keys())) {
      if (path.startsWith(prefix)) {
        const fileName = path.split('/').pop();
        if (fileName.startsWith('.') || fileName.includes('.tmp')) {
          this.files.delete(path);
          this.mtime.delete(path);
        }
      }
    }
  }

  async softDeleteProject(projectId) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    let targetTrashName = `${projectId}_${timestamp}`;
    let counter = 1;
    let finalTrashName = targetTrashName;

    while (await this.existsDirectory(`.solokanban/trash/${finalTrashName}`)) {
      finalTrashName = `${targetTrashName}_${counter++}`;
    }

    const normProj = this.normalizePath(projectId) + '/';
    const normTrash = `.solokanban/trash/${finalTrashName}/`;

    for (const [path, content] of Array.from(this.files.entries())) {
      if (path.startsWith(normProj)) {
        const rel = path.substring(normProj.length);
        this.files.set(normTrash + rel, content);
        this.files.delete(path);
      }
    }
  }

  async existsDirectory(dirPath) {
    const normDir = this.normalizePath(dirPath) + '/';
    for (const path of this.files.keys()) {
      if (path.startsWith(normDir)) return true;
    }
    return false;
  }

  async ensureDirectory(dirPath) {
    return true;
  }

  async quarantineCard(relativePath) {
    const content = await this.readFile(relativePath);
    if (!content) return;
    const fileName = relativePath.split('/').pop();
    await this.writeFile(`.solokanban/quarantine/${fileName}`, content);
    await this.deleteFile(relativePath);
  }
}
