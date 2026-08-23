/**
 * SoloKanban Settings Modal
 * Provides workspace settings tabs: Labels, Custom Fields, Feature Types, Projects (soft-delete), Preferences.
 */

import { escapeHtml } from './markdown.js';

export class SettingsModal {
  constructor(appState, onChangeCallback) {
    this.appState = appState;
    this.onChangeCallback = onChangeCallback;
    this.activeTab = 'labels';
  }

  open() {
    this.appState.activeModal = 'settings';
    this.renderModal();
  }

  close() {
    this.appState.activeModal = null;
    const el = document.getElementById('settings-modal');
    if (el) el.remove();
  }

  renderModal() {
    let existing = document.getElementById('settings-modal');
    if (existing) existing.remove();

    const html = `
      <div id="settings-modal" class="modal-overlay">
        <div class="modal-content settings-modal-dialog">
          <div class="modal-header">
            <h3>Workspace Settings</h3>
            <button id="settings-close-btn" class="modal-close-btn">&times;</button>
          </div>

          <div class="settings-tabs-header">
            <button class="tab-btn ${this.activeTab === 'labels' ? 'active' : ''}" data-tab="labels">Labels</button>
            <button class="tab-btn ${this.activeTab === 'fields' ? 'active' : ''}" data-tab="fields">Custom Fields</button>
            <button class="tab-btn ${this.activeTab === 'types' ? 'active' : ''}" data-tab="types">Feature Types</button>
            <button class="tab-btn ${this.activeTab === 'projects' ? 'active' : ''}" data-tab="projects">Projects</button>
            <button class="tab-btn ${this.activeTab === 'preferences' ? 'active' : ''}" data-tab="preferences">Preferences</button>
          </div>

          <div class="settings-tab-body" id="settings-tab-body">
            ${this.renderTabContent()}
          </div>
        </div>
      </div>`;

    document.body.insertAdjacentHTML('beforeend', html);
    this.bindEvents();
  }

  renderTabContent() {
    if (this.activeTab === 'labels') {
      const labels = this.appState.db.labels || [];
      const rows = labels.map(lbl => `
        <div class="settings-item-row" data-lbl-id="${lbl.id}">
          <input type="color" class="lbl-color-input" value="${lbl.color}"/>
          <input type="text" class="lbl-name-input" value="${escapeHtml(lbl.name)}"/>
          <button class="btn-danger btn-delete-label" data-lbl-id="${lbl.id}">Delete</button>
        </div>`).join('');

      return `
        <div class="settings-tab-labels">
          <h4>Manage Labels</h4>
          <p class="section-desc">Labels defined here apply across all project cards.</p>
          <div class="labels-list-container">${rows}</div>
          <button id="btn-add-new-label" class="btn-secondary">+ Add New Label</button>
        </div>`;
    } else if (this.activeTab === 'projects') {
      const projects = Array.from(this.appState.db.projects.values());
      const rows = projects.map(p => `
        <div class="settings-item-row" data-proj-id="${p.id}">
          <span class="proj-name"><strong>${escapeHtml(p.id)}</strong> (${p.lists?.length || 0} lists)</span>
          <button class="btn-danger btn-soft-delete-proj" data-proj-id="${p.id}">Soft-Delete to Trash</button>
        </div>`).join('');

      return `
        <div class="settings-tab-projects">
          <h4>Manage Projects</h4>
          <p class="section-desc">Deleting a project moves its directory to inert trash (<code>.solokanban/trash/</code>).</p>
          <div class="projects-list-container">${rows || '<p>No sub-projects found.</p>'}</div>
        </div>`;
    } else if (this.activeTab === 'preferences') {
      const prefs = this.appState.preferencesManager.preferences;
      return `
        <div class="settings-tab-preferences">
          <h4>UI Preferences</h4>
          <div class="form-group">
            <label>Board Background Color</label>
            <input type="color" id="pref-bg-color" value="${prefs.board?.background || '#0f172a'}"/>
          </div>
          <div class="form-group">
            <label>Stale Card Threshold (Days)</label>
            <input type="number" id="pref-stale-days" value="${prefs.card?.staleAfterDays || 7}"/>
          </div>
          <div class="form-group">
            <label>
              <input type="checkbox" id="pref-dark-mode" ${prefs.ui?.darkMode ? 'checked' : ''}/> Dark Mode
            </label>
          </div>
          <button id="btn-save-prefs" class="btn-primary">Save Preferences</button>
        </div>`;
    } else {
      return `<p>Configuration tab view.</p>`;
    }
  }

  bindEvents() {
    const modalEl = document.getElementById('settings-modal');
    if (!modalEl) return;

    modalEl.querySelector('#settings-close-btn').addEventListener('click', () => this.close());
    modalEl.addEventListener('click', (e) => {
      if (e.target === modalEl) this.close();
    });

    modalEl.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.activeTab = btn.dataset.tab;
        this.renderModal();
      });
    });

    if (this.activeTab === 'labels') {
      const addBtn = modalEl.querySelector('#btn-add-new-label');
      if (addBtn) {
        addBtn.addEventListener('click', async () => {
          const newId = `lbl-${Math.random().toString(36).substring(2, 7)}`;
          this.appState.db.labels.push({ id: newId, name: 'New Label', color: '#0984e3' });
          await this.appState.fsAdapter.writeFile('.solokanban/labels.json', JSON.stringify(this.appState.db.labels, null, 2));
          this.renderModal();
          if (this.onChangeCallback) this.onChangeCallback();
        });
      }

      modalEl.querySelectorAll('.btn-delete-label').forEach(btn => {
        btn.addEventListener('click', async () => {
          const lblId = btn.dataset.lblId;
          this.appState.db.labels = this.appState.db.labels.filter(l => l.id !== lblId);
          await this.appState.fsAdapter.writeFile('.solokanban/labels.json', JSON.stringify(this.appState.db.labels, null, 2));
          this.renderModal();
          if (this.onChangeCallback) this.onChangeCallback();
        });
      });
    } else if (this.activeTab === 'projects') {
      modalEl.querySelectorAll('.btn-soft-delete-proj').forEach(btn => {
        btn.addEventListener('click', async () => {
          const projId = btn.dataset.projId;
          if (confirm(`Move project ${projId} to trash?`)) {
            await this.appState.fsAdapter.softDeleteProject(projId);
            this.appState.db.projects.delete(projId);
            for (const [cardId, card] of this.appState.db.cards.entries()) {
              if (card.projectId === projId) {
                this.appState.db.cards.delete(cardId);
              }
            }
            // Rebuild search index (excludes trash)
            await this.appState.db.rebuildSearchIndex();
            this.renderModal();
            if (this.onChangeCallback) this.onChangeCallback();
          }
        });
      });
    } else if (this.activeTab === 'preferences') {
      const saveBtn = modalEl.querySelector('#btn-save-prefs');
      if (saveBtn) {
        saveBtn.addEventListener('click', async () => {
          const bgColor = modalEl.querySelector('#pref-bg-color').value;
          const staleDays = Number(modalEl.querySelector('#pref-stale-days').value);
          const darkMode = modalEl.querySelector('#pref-dark-mode').checked;

          await this.appState.preferencesManager.set('board.background', bgColor);
          await this.appState.preferencesManager.set('card.staleAfterDays', staleDays);
          await this.appState.preferencesManager.set('ui.darkMode', darkMode);

          this.close();
          if (this.onChangeCallback) this.onChangeCallback();
        });
      }
    }
  }
}
