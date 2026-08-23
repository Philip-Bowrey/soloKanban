import { escapeHtml } from './markdown.js';
import { WorkspaceManager } from './workspace.js';

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
            <button class="tab-btn ${this.activeTab === 'lists' ? 'active' : ''}" data-tab="lists">Lists & WIP</button>
            <button class="tab-btn ${this.activeTab === 'projects' ? 'active' : ''}" data-tab="projects">Projects</button>
            <button class="tab-btn ${this.activeTab === 'preferences' ? 'active' : ''}" data-tab="preferences">Preferences</button>
          </div>

          <div class="settings-tab-body" id="settings-tab-body">
            ${this.renderTabContent()}
          </div>
        </div>
      </div>`;

    if (typeof document !== 'undefined' && document.body) {
      document.body.insertAdjacentHTML('beforeend', html);
      this.bindEvents();
    }
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
          <div class="labels-list-container">${rows || '<p>No labels configured.</p>'}</div>
          <button id="btn-add-new-label" class="btn-secondary">+ Add New Label</button>
        </div>`;
    } else if (this.activeTab === 'fields') {
      const fields = this.appState.db.fields || [];
      const rows = fields.map(field => `
        <div class="settings-item-row" data-field-key="${escapeHtml(field.key)}">
          <input type="text" class="field-label-input" value="${escapeHtml(field.label)}" placeholder="Field Label"/>
          <span class="field-key-badge"><code>${escapeHtml(field.key)}</code> (${escapeHtml(field.type || 'text')})</span>
          <label class="field-visible-toggle">
            <input type="checkbox" class="field-card-visible-input" ${field.cardVisible ? 'checked' : ''}/> Show on Card
          </label>
          <button class="btn-danger btn-delete-field" data-field-key="${escapeHtml(field.key)}">Delete</button>
        </div>`).join('');

      return `
        <div class="settings-tab-fields">
          <h4>Manage Custom Fields</h4>
          <p class="section-desc">Custom frontmatter fields attached to cards.</p>
          <div class="fields-list-container">${rows || '<p>No custom fields configured.</p>'}</div>
          <button id="btn-add-new-field" class="btn-secondary">+ Add New Field</button>
        </div>`;
    } else if (this.activeTab === 'types') {
      const types = this.appState.db.featureTypes || [];
      const rows = types.map(t => `
        <div class="settings-item-row" data-type-id="${escapeHtml(t.id)}">
          <input type="color" class="type-color-input" value="${t.color || '#0984e3'}"/>
          <input type="text" class="type-name-input" value="${escapeHtml(t.name)}" placeholder="Type Name"/>
          <span class="type-id-badge"><code>${escapeHtml(t.id)}</code></span>
          <button class="btn-danger btn-delete-type" data-type-id="${escapeHtml(t.id)}">Delete</button>
        </div>`).join('');

      return `
        <div class="settings-tab-types">
          <h4>Manage Feature Types</h4>
          <p class="section-desc">Feature card templates with custom sections and fields.</p>
          <div class="types-list-container">${rows || '<p>No feature types configured.</p>'}</div>
          <button id="btn-add-new-type" class="btn-secondary">+ Add Feature Type</button>
        </div>`;
    } else if (this.activeTab === 'lists') {
      let currentLists = [];
      if (this.appState.currentView === 'project' && this.appState.currentProjectId) {
        const proj = this.appState.db.projects.get(this.appState.currentProjectId);
        currentLists = proj?.lists || [];
      } else {
        currentLists = this.appState.db.workspaceConfig?.lists || [];
      }

      const rows = currentLists.map(l => `
        <div class="settings-item-row settings-list-row" data-list-id="${escapeHtml(l.id)}">
          <input type="text" class="list-name-input" value="${escapeHtml(l.title || l.name || l.id)}" placeholder="List Title"/>
          <span class="list-id-badge"><code>${escapeHtml(l.id)}</code></span>
          <label class="wip-limit-label">
            WIP Limit:
            <input type="number" class="list-wip-input" min="0" value="${l.wipLimit || 0}" placeholder="No limit"/>
          </label>
        </div>`).join('');

      return `
        <div class="settings-tab-lists">
          <h4>Lists & WIP Limits</h4>
          <p class="section-desc">Configure column titles and Work-In-Progress (WIP) limits. (0 = no limit)</p>
          <div class="lists-config-container">${rows || '<p>No lists configured.</p>'}</div>
          <button id="btn-save-lists-config" class="btn-primary">Save Lists & WIP Limits</button>
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
          <p class="section-desc">Deleting a project moves its directory to inert trash (<code>.solokanban/trash/</code>) and removes its card from the workspace board.</p>
          <div class="projects-list-container">${rows || '<p>No sub-projects found.</p>'}</div>
        </div>`;
    } else if (this.activeTab === 'preferences') {
      const prefs = this.appState.preferencesManager?.preferences || {};
      const cardPrefs = prefs.card || {};
      const uiPrefs = prefs.ui || {};
      const boardPrefs = prefs.board || {};

      return `
        <div class="settings-tab-preferences">
          <h4>UI Preferences</h4>
          <div class="form-group">
            <label>Board Background Color</label>
            <input type="color" id="pref-bg-color" value="${boardPrefs.background || '#0f172a'}"/>
          </div>
          <div class="form-group">
            <label>Stale Card Threshold (Days)</label>
            <input type="number" id="pref-stale-days" value="${cardPrefs.staleAfterDays || 7}"/>
          </div>
          <div class="form-group">
            <label>
              <input type="checkbox" id="pref-dark-mode" ${uiPrefs.darkMode ? 'checked' : ''}/> Dark Mode
            </label>
          </div>
          <div class="form-group">
            <label>
              <input type="checkbox" id="pref-agent-badges" ${cardPrefs.showAgentBadge !== false ? 'checked' : ''}/> Show Live Agent Badges
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

    modalEl.querySelector('#settings-close-btn')?.addEventListener('click', () => this.close());
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
          await this.appState.fsAdapter?.writeFile('.solokanban/labels.json', JSON.stringify(this.appState.db.labels, null, 2));
          this.renderModal();
          if (this.onChangeCallback) this.onChangeCallback();
        });
      }

      modalEl.querySelectorAll('.lbl-name-input').forEach(input => {
        input.addEventListener('change', async (e) => {
          const row = input.closest('.settings-item-row');
          const lblId = row?.dataset.lblId;
          const lbl = this.appState.db.labels.find(l => l.id === lblId);
          if (lbl) {
            lbl.name = input.value;
            await this.appState.fsAdapter?.writeFile('.solokanban/labels.json', JSON.stringify(this.appState.db.labels, null, 2));
            if (this.onChangeCallback) this.onChangeCallback();
          }
        });
      });

      modalEl.querySelectorAll('.lbl-color-input').forEach(input => {
        input.addEventListener('change', async (e) => {
          const row = input.closest('.settings-item-row');
          const lblId = row?.dataset.lblId;
          const lbl = this.appState.db.labels.find(l => l.id === lblId);
          if (lbl) {
            lbl.color = input.value;
            await this.appState.fsAdapter?.writeFile('.solokanban/labels.json', JSON.stringify(this.appState.db.labels, null, 2));
            if (this.onChangeCallback) this.onChangeCallback();
          }
        });
      });

      modalEl.querySelectorAll('.btn-delete-label').forEach(btn => {
        btn.addEventListener('click', async () => {
          const lblId = btn.dataset.lblId;
          this.appState.db.labels = this.appState.db.labels.filter(l => l.id !== lblId);
          await this.appState.fsAdapter?.writeFile('.solokanban/labels.json', JSON.stringify(this.appState.db.labels, null, 2));
          this.renderModal();
          if (this.onChangeCallback) this.onChangeCallback();
        });
      });
    } else if (this.activeTab === 'fields') {
      const addFieldBtn = modalEl.querySelector('#btn-add-new-field');
      if (addFieldBtn) {
        addFieldBtn.addEventListener('click', async () => {
          const newKey = `field_${Math.random().toString(36).substring(2, 7)}`;
          this.appState.db.fields.push({ key: newKey, label: 'New Field', type: 'text', cardVisible: true });
          await this.appState.fsAdapter?.writeFile('.solokanban/fields.json', JSON.stringify(this.appState.db.fields, null, 2));
          this.renderModal();
          if (this.onChangeCallback) this.onChangeCallback();
        });
      }

      modalEl.querySelectorAll('.field-label-input').forEach(input => {
        input.addEventListener('change', async () => {
          const row = input.closest('.settings-item-row');
          const key = row?.dataset.fieldKey;
          const field = this.appState.db.fields.find(f => f.key === key);
          if (field) {
            field.label = input.value;
            await this.appState.fsAdapter?.writeFile('.solokanban/fields.json', JSON.stringify(this.appState.db.fields, null, 2));
            if (this.onChangeCallback) this.onChangeCallback();
          }
        });
      });

      modalEl.querySelectorAll('.field-card-visible-input').forEach(input => {
        input.addEventListener('change', async () => {
          const row = input.closest('.settings-item-row');
          const key = row?.dataset.fieldKey;
          const field = this.appState.db.fields.find(f => f.key === key);
          if (field) {
            field.cardVisible = input.checked;
            await this.appState.fsAdapter?.writeFile('.solokanban/fields.json', JSON.stringify(this.appState.db.fields, null, 2));
            if (this.onChangeCallback) this.onChangeCallback();
          }
        });
      });

      modalEl.querySelectorAll('.btn-delete-field').forEach(btn => {
        btn.addEventListener('click', async () => {
          const key = btn.dataset.fieldKey;
          this.appState.db.fields = this.appState.db.fields.filter(f => f.key !== key);
          await this.appState.fsAdapter?.writeFile('.solokanban/fields.json', JSON.stringify(this.appState.db.fields, null, 2));
          this.renderModal();
          if (this.onChangeCallback) this.onChangeCallback();
        });
      });
    } else if (this.activeTab === 'types') {
      const addTypeBtn = modalEl.querySelector('#btn-add-new-type');
      if (addTypeBtn) {
        addTypeBtn.addEventListener('click', async () => {
          const newId = `type_${Math.random().toString(36).substring(2, 7)}`;
          this.appState.db.featureTypes.push({
            id: newId,
            name: 'New Type',
            color: '#0984e3',
            frontmatterFields: [],
            bodySections: [{ id: 'description', label: 'Description', type: 'markdown', placeholder: 'Details...' }]
          });
          await this.appState.fsAdapter?.writeFile('.solokanban/feature-types.json', JSON.stringify(this.appState.db.featureTypes, null, 2));
          this.renderModal();
          if (this.onChangeCallback) this.onChangeCallback();
        });
      }

      modalEl.querySelectorAll('.type-name-input').forEach(input => {
        input.addEventListener('change', async () => {
          const row = input.closest('.settings-item-row');
          const id = row?.dataset.typeId;
          const t = this.appState.db.featureTypes.find(type => type.id === id);
          if (t) {
            t.name = input.value;
            await this.appState.fsAdapter?.writeFile('.solokanban/feature-types.json', JSON.stringify(this.appState.db.featureTypes, null, 2));
            if (this.onChangeCallback) this.onChangeCallback();
          }
        });
      });

      modalEl.querySelectorAll('.type-color-input').forEach(input => {
        input.addEventListener('change', async () => {
          const row = input.closest('.settings-item-row');
          const id = row?.dataset.typeId;
          const t = this.appState.db.featureTypes.find(type => type.id === id);
          if (t) {
            t.color = input.value;
            await this.appState.fsAdapter?.writeFile('.solokanban/feature-types.json', JSON.stringify(this.appState.db.featureTypes, null, 2));
            if (this.onChangeCallback) this.onChangeCallback();
          }
        });
      });

      modalEl.querySelectorAll('.btn-delete-type').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.dataset.typeId;
          this.appState.db.featureTypes = this.appState.db.featureTypes.filter(t => t.id !== id);
          await this.appState.fsAdapter?.writeFile('.solokanban/feature-types.json', JSON.stringify(this.appState.db.featureTypes, null, 2));
          this.renderModal();
          if (this.onChangeCallback) this.onChangeCallback();
        });
      });
    } else if (this.activeTab === 'projects') {
      modalEl.querySelectorAll('.btn-soft-delete-proj').forEach(btn => {
        btn.addEventListener('click', async () => {
          const projId = btn.dataset.projId;
          if (typeof confirm === 'undefined' || confirm(`Move project ${projId} to trash?`)) {
            const manager = new WorkspaceManager(this.appState.fsAdapter, this.appState.db);
            await manager.softDeleteProjectFull(projId);
            this.close();
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
          const showAgentBadge = modalEl.querySelector('#pref-agent-badges').checked;

          await this.appState.preferencesManager.set('board.background', bgColor);
          await this.appState.preferencesManager.set('card.staleAfterDays', staleDays);
          await this.appState.preferencesManager.set('card.showAgentBadge', showAgentBadge);
          await this.appState.preferencesManager.set('ui.darkMode', darkMode);
          this.appState.preferencesManager.applyDarkMode();

          this.close();
          if (this.onChangeCallback) this.onChangeCallback();
        });
      }
    }
  }
}

