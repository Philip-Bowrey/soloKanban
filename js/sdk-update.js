/**
 * SoloKanban SDK & Skills Auto-Updater
 * Checks version.json, verifies SHA-256 checksums, and ensures temp file cleanup on failure.
 */

import { computeContentHash } from './hash.js';

export class SdkUpdater {
  constructor(fsAdapter) {
    this.fsAdapter = fsAdapter;
  }

  /**
   * Run SDK and skills update check against version.json manifest.
   * @param {Object} options 
   * @param {string} options.manifestUrl 
   */
  async checkForUpdates(manifestUrl = 'version.json') {
    if (!this.fsAdapter) return;

    let manifest = null;
    try {
      if (typeof window !== 'undefined' && window.fetch) {
        const resp = await fetch(manifestUrl);
        if (resp.ok) {
          manifest = await resp.json();
        }
      }
    } catch (e) {
      // Offline or manifest missing
      return;
    }

    if (!manifest || !manifest.files) return;

    for (const [relPath, fileMeta] of Object.entries(manifest.files)) {
      try {
        await this.updateSingleFile(relPath, fileMeta);
      } catch (err) {
        // Clean up temp files on failure
        await this.fsAdapter.cleanupTempFiles('.solokanban/sdk');
        await this.fsAdapter.cleanupTempFiles('.solokanban/skills');
      }
    }
  }

  async updateSingleFile(relPath, fileMeta) {
    const existingContent = await this.fsAdapter.readFile(relPath);

    // If local file exists, check if user-created or up-to-date
    if (existingContent) {
      const localSha = await this.computeRawSha256(existingContent);
      if (localSha === fileMeta.sha256) {
        return; // Already up-to-date
      }
    }

    // Fetch remote file
    let remoteContent = null;
    try {
      const resp = await fetch(relPath);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      remoteContent = await resp.text();
    } catch (e) {
      // Network failure -> do not touch existing file
      return;
    }

    // Verify SHA-256 hash
    const downloadedSha = await this.computeRawSha256(remoteContent);
    if (downloadedSha !== fileMeta.sha256) {
      // Checksum mismatch! Discard download, ensure no temp file remains.
      await this.fsAdapter.cleanupTempFiles(relPath.substring(0, relPath.lastIndexOf('/')));
      console.warn(`Checksum mismatch for ${relPath}. Expected ${fileMeta.sha256}, got ${downloadedSha}`);
      return;
    }

    // Write file atomically
    await this.fsAdapter.writeFile(relPath, remoteContent);
  }

  async computeRawSha256(contentStr) {
    if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle) {
      const encoder = new TextEncoder();
      const data = encoder.encode(contentStr);
      const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }
    // Node environment fallback
    const { createHash } = await import('node:crypto');
    return createHash('sha256').update(contentStr, 'utf8').digest('hex');
  }
}
