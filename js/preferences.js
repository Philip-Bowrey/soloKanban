/**
 * SoloKanban Preferences Manager
 */

import { DEFAULT_PREFERENCES } from './defaults.js';

export class PreferencesManager {
  constructor(fsAdapter = null) {
    this.fsAdapter = fsAdapter;
    this.preferences = JSON.parse(JSON.stringify(DEFAULT_PREFERENCES));
  }

  setFsAdapter(fsAdapter) {
    this.fsAdapter = fsAdapter;
  }

  async load() {
    if (!this.fsAdapter) return this.preferences;
    try {
      const content = await this.fsAdapter.readFile('.solokanban/preferences.json');
      if (content) {
        const parsed = JSON.parse(content);
        this.preferences = {
          board: { ...DEFAULT_PREFERENCES.board, ...(parsed.board || {}) },
          card: { ...DEFAULT_PREFERENCES.card, ...(parsed.card || {}) },
          ui: { ...DEFAULT_PREFERENCES.ui, ...(parsed.ui || {}) }
        };
      }
    } catch (e) {
      // Use defaults if missing or corrupt
      this.preferences = JSON.parse(JSON.stringify(DEFAULT_PREFERENCES));
    }
    return this.preferences;
  }

  /** Applies dark mode class to document body based on current preferences */
  applyDarkMode() {
    if (typeof document !== 'undefined') {
      document.body.classList.toggle('dark-mode', this.preferences.ui?.darkMode === true);
    }
  }

  async save() {
    if (!this.fsAdapter) return;
    const content = JSON.stringify(this.preferences, null, 2);
    await this.fsAdapter.writeFile('.solokanban/preferences.json', content);
  }

  get(path) {
    const parts = path.split('.');
    let current = this.preferences;
    for (const part of parts) {
      if (current === undefined || current === null) return undefined;
      current = current[part];
    }
    return current;
  }

  async set(path, value) {
    const parts = path.split('.');
    let current = this.preferences;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!current[part] || typeof current[part] !== 'object') {
        current[part] = {};
      }
      current = current[part];
    }
    current[parts[parts.length - 1]] = value;
    await this.save();
  }

  isFirstRunBannerDismissed() {
    return !!this.get('ui.firstRunBannerDismissed');
  }

  async dismissFirstRunBanner() {
    await this.set('ui.firstRunBannerDismissed', true);
  }
}
