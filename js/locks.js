/**
 * SoloKanban Advisory Lock & Web Locks Adapter
 */

export class LockManager {
  constructor(fsAdapter) {
    this.fsAdapter = fsAdapter;
  }

  /**
   * Acquire browser Web Lock if available.
   * @param {string} resourceName 
   * @param {Function} callback 
   */
  async withWebLock(resourceName, callback) {
    if (typeof window !== 'undefined' && window.navigator && window.navigator.locks) {
      return window.navigator.locks.request(resourceName, async () => {
        return await callback();
      });
    } else {
      return await callback();
    }
  }

  /**
   * Write advisory lock file to /.solokanban/locks/<resourceId>.lock.json
   * @param {string} resourceId 
   * @param {string} actorId 
   */
  async acquireAdvisoryLock(resourceId, actorId) {
    if (!this.fsAdapter) return false;
    const lockPath = `.solokanban/locks/${resourceId}.lock.json`;
    const lockData = {
      resourceId,
      actorId,
      acquiredAt: new Date().toISOString()
    };
    try {
      await this.fsAdapter.writeFile(lockPath, JSON.stringify(lockData, null, 2));
      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * Check if advisory lock file exists.
   * @param {string} resourceId 
   */
  async getAdvisoryLock(resourceId) {
    if (!this.fsAdapter) return null;
    const lockPath = `.solokanban/locks/${resourceId}.lock.json`;
    try {
      const content = await this.fsAdapter.readFile(lockPath);
      if (content) return JSON.parse(content);
    } catch (e) {}
    return null;
  }

  /**
   * Release advisory lock file.
   * @param {string} resourceId 
   */
  async releaseAdvisoryLock(resourceId) {
    if (!this.fsAdapter) return;
    const lockPath = `.solokanban/locks/${resourceId}.lock.json`;
    try {
      await this.fsAdapter.deleteFile(lockPath);
    } catch (e) {}
  }
}
