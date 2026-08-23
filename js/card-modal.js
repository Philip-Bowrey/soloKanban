/**
 * SoloKanban Card Edit Modal & Visual Conflict Resolution UI
 * Features 800ms auto-save debounce, raw/rendered Markdown toggle, disjoint auto-merge, and label deletion fallback.
 */

import { parseCardFile, serializeCardFile } from './yaml.js';
import { computeContentHash } from './hash.js';
import { parseBodySections, appendActivityLog, renderMarkdown, escapeHtml } from './markdown.js';

export class CardModal {
  constructor(appState, onSaveCallback) {
    this.appState = appState;
    this.onSaveCallback = onSaveCallback;
    
    this.card = null;
    this.baseCard = null;           // Gap #1 fix: stored at open() for auto-merge baseCard
    this.originalContentHash = null;
    this.originalRevision = 1;
    this.debounceTimer = null;
    this.isRawMarkdown = false;
  }

  open(card) {
    this.card = JSON.parse(JSON.stringify(card));
    this.baseCard = JSON.parse(JSON.stringify(card)); // Gap #1 fix: snapshot at open time
    this.originalRevision = this.card.frontmatter?.meta?.revision || 1;
    this.originalContentHash = this.card.frontmatter?.meta?.contentHash || '';
    this.isRawMarkdown = false;

    this.appState.activeCard = this.card;
    this.appState.activeModal = 'card';

    // Start presence tracking for editing this card
    this.appState.writePresence(this.card.id, 'editing');

    this.renderModalContainer();
  }

  close() {
    if (this.card) {
      this.appState.clearPresence(this.card.id);
    }
    this.appState.activeCard = null;
    this.appState.activeModal = null;

    if (typeof document !== 'undefined') {
      const modalEl = document.getElementById('card-modal');
      if (modalEl) modalEl.remove();
    }
  }


  renderModalContainer() {
    if (typeof document === 'undefined' || !document.body) return;
    let existing = document.getElementById('card-modal');
    if (existing) existing.remove();

    const html = this.buildModalHtml();
    document.body.insertAdjacentHTML('beforeend', html);
    this.bindEvents();
  }

  /**
   * Builds and returns the modal HTML string (separated for testability).
   * Gap #4 fix: includes presence warning banner when active agents are editing.
   */
  buildModalHtml() {
    const labelsMap = new Map((this.appState.db.labels || []).map(l => [l.id, l]));
    const fieldsMap = new Map((this.appState.db.fields || []).map(f => [f.key, f]));
    const fm = this.card.frontmatter || {};

    // Gap #4 fix: Presence warning (§6.2) — warn if another actor is editing this card
    const activePresence = (this.appState.activePresenceMap?.get(this.card.id) || []);
    const presenceWarningHtml = activePresence.length > 0
      ? `<div class="presence-warning">
           <span class="presence-warning-icon">⚠</span>
           <span class="presence-warning-text">
             ${escapeHtml(activePresence[0].actor)} is currently editing this card
             ${activePresence.length > 1 ? `and ${activePresence.length - 1} other(s)` : ''}.
             Saving may trigger conflict resolution.
           </span>
         </div>`
      : '';

    // Label Editor with v8.3 Label Deletion Fallback
    const cardLabels = fm.labels || [];
    const labelItemsHtml = cardLabels.map(lblId => {
      if (labelsMap.has(lblId)) {
        const lbl = labelsMap.get(lblId);
        return `<span class="modal-label-badge" style="background-color: ${lbl.color};">${escapeHtml(lbl.name)} <button class="btn-remove-lbl" data-lbl-id="${lblId}">×</button></span>`;
      } else {
        // v8.3 Non-interactive placeholder for deleted label
        return `<span class="modal-label-badge unknown-deleted" title="This label was deleted from workspace configuration">Unknown label (deleted) <button class="btn-remove-lbl" data-lbl-id="${lblId}">×</button></span>`;
      }
    }).join('');

    const availableLabelsSelect = (this.appState.db.labels || [])
      .filter(l => !cardLabels.includes(l.id))
      .map(l => `<option value="${l.id}">${escapeHtml(l.name)}</option>`)
      .join('');

    // Custom Fields Editor
    const customFieldsHtml = Array.from(fieldsMap.values()).map(field => {
      const val = fm[field.key] !== undefined ? fm[field.key] : '';
      if (field.type === 'select') {
        const optionsHtml = (field.options || []).map(opt => {
          const optVal = typeof opt === 'object' ? opt.value : opt;
          const optLabel = typeof opt === 'object' ? opt.label : opt;
          return `<option value="${optVal}" ${val === optVal ? 'selected' : ''}>${escapeHtml(optLabel)}</option>`;
        }).join('');
        return `
          <div class="form-group">
            <label>${escapeHtml(field.label)}</label>
            <select class="custom-field-input" data-field-key="${field.key}">${optionsHtml}</select>
          </div>`;
      } else {
        return `
          <div class="form-group">
            <label>${escapeHtml(field.label)}</label>
            <input type="text" class="custom-field-input" data-field-key="${field.key}" value="${escapeHtml(String(val))}"/>
          </div>`;
      }
    }).join('');

    // Extract section descriptions from feature type for heading tooltips (PRD §16.2)
    const sectionDescriptions = {};
    const cardType = (this.appState.db.featureTypes || []).find(t => t.id === this.card.type);
    if (cardType?.bodySections) {
      for (const s of cardType.bodySections) {
        if (s.placeholder || s.label) {
          sectionDescriptions[s.label] = s.placeholder || s.label;
        }
      }
    }

    // Body Editor (Raw vs Rendered)
    const bodyHtml = this.isRawMarkdown
      ? `<textarea id="modal-body-editor" class="modal-textarea">${escapeHtml(this.card.body || '')}</textarea>`
      : `<div id="modal-body-rendered" class="rendered-markdown-box">${renderMarkdown(this.card.body || '', sectionDescriptions)}</div>`;

    return `
      <div id="card-modal" class="modal-overlay">
        <div class="modal-content card-modal-dialog">
          ${presenceWarningHtml}
          <div class="modal-header">
            <div class="modal-title-container">
              <input type="text" id="modal-title-input" class="modal-title-input" value="${escapeHtml(fm.title || this.card.id)}"/>
              <span class="modal-id-badge">${escapeHtml(this.card.id)} (Project: ${escapeHtml(this.card.projectId || 'Workspace')})</span>
            </div>
            <button id="modal-close-btn" class="modal-close-btn">&times;</button>
          </div>

          <div class="modal-body-layout">
            <div class="modal-main-column">
              <div class="editor-toolbar">
                <button id="toggle-markdown-mode-btn" class="btn-secondary">${this.isRawMarkdown ? 'View Rendered' : 'Edit Raw Markdown'}</button>
                <span class="auto-save-status" id="auto-save-status">Saved</span>
              </div>
              <div class="markdown-editor-container">${bodyHtml}</div>
            </div>

            <div class="modal-sidebar-column">
              ${this.card.type === 'project' ? `
                <div class="sidebar-section highlight-box">
                  <h4>Project Navigation</h4>
                  <button id="modal-open-project-board-btn" class="btn-gradient btn-block">🚀 Open Project Board</button>
                </div>` : ''}

              <div class="sidebar-section">
                <h4>Labels</h4>
                <div class="modal-labels-list">${labelItemsHtml}</div>
                ${availableLabelsSelect ? `
                  <select id="add-label-select" class="form-select">
                    <option value="">+ Add label...</option>
                    ${availableLabelsSelect}
                  </select>` : ''}
              </div>

              <div class="sidebar-section">
                <h4>Priority</h4>
                <select id="modal-priority-select" class="form-select">
                  <option value="low" ${fm.priority === 'low' ? 'selected' : ''}>Low</option>
                  <option value="medium" ${fm.priority === 'medium' ? 'selected' : ''}>Medium</option>
                  <option value="high" ${fm.priority === 'high' ? 'selected' : ''}>High</option>
                  <option value="critical" ${fm.priority === 'critical' ? 'selected' : ''}>Critical</option>
                </select>
              </div>

              <div class="sidebar-section">
                <h4>Custom Fields</h4>
                ${customFieldsHtml}
              </div>
            </div>
          </div>
        </div>
      </div>`;
  }


  bindEvents() {
    const modalEl = document.getElementById('card-modal');
    if (!modalEl) return;

    modalEl.querySelector('#modal-close-btn').addEventListener('click', () => this.close());
    modalEl.addEventListener('click', (e) => {
      if (e.target === modalEl) this.close();
    });

    const titleInput = modalEl.querySelector('#modal-title-input');
    titleInput.addEventListener('input', () => {
      this.card.frontmatter.title = titleInput.value;
      this.scheduleAutoSave();
    });

    const toggleBtn = modalEl.querySelector('#toggle-markdown-mode-btn');
    toggleBtn.addEventListener('click', () => {
      if (this.isRawMarkdown) {
        const area = modalEl.querySelector('#modal-body-editor');
        if (area) this.card.body = area.value;
      }
      this.isRawMarkdown = !this.isRawMarkdown;
      this.renderModalContainer();
    });

    if (this.isRawMarkdown) {
      const bodyArea = modalEl.querySelector('#modal-body-editor');
      bodyArea.addEventListener('input', () => {
        this.card.body = bodyArea.value;
        this.scheduleAutoSave();
      });
    }

    // Label remove buttons
    modalEl.querySelectorAll('.btn-remove-lbl').forEach(btn => {
      btn.addEventListener('click', () => {
        const lblId = btn.dataset.lblId;
        this.card.frontmatter.labels = (this.card.frontmatter.labels || []).filter(id => id !== lblId);
        this.scheduleAutoSave();
        this.renderModalContainer();
      });
    });

    // Add label select
    const addLblSelect = modalEl.querySelector('#add-label-select');
    if (addLblSelect) {
      addLblSelect.addEventListener('change', () => {
        const selectedId = addLblSelect.value;
        if (selectedId) {
          if (!this.card.frontmatter.labels) this.card.frontmatter.labels = [];
          if (!this.card.frontmatter.labels.includes(selectedId)) {
            this.card.frontmatter.labels.push(selectedId);
          }
          this.scheduleAutoSave();
          this.renderModalContainer();
        }
      });
    }

    const openProjBtn = modalEl.querySelector('#modal-open-project-board-btn');
    if (openProjBtn) {
      openProjBtn.addEventListener('click', () => {
        const projId = this.card.frontmatter?.projectId || this.card.id;
        this.close();
        if (typeof window !== 'undefined' && window.app) {
          window.app.state.currentView = 'project';
          window.app.state.currentProjectId = projId;
          window.app.renderHeader();
          window.app.refreshBoard();
        }
      });
    }

    // Custom fields change
    modalEl.querySelectorAll('.custom-field-input').forEach(input => {
      input.addEventListener('change', () => {
        const key = input.dataset.fieldKey;
        this.card.frontmatter[key] = input.value;
        this.scheduleAutoSave();
      });
    });
  }

  scheduleAutoSave() {
    if (typeof document !== 'undefined') {
      const statusEl = document.getElementById('auto-save-status');
      if (statusEl) statusEl.textContent = 'Saving...';
    }

    if (this.debounceTimer) clearTimeout(this.debounceTimer);

    // 800ms debounce per PRD §16.1
    this.debounceTimer = setTimeout(async () => {
      await this.saveCard();
    }, 800);
  }

  async saveCard() {
    if (!this.card || !this.appState.fsAdapter) return;

    // Check disk content for optimistic concurrency check
    const diskContent = await this.appState.fsAdapter.readFile(this.card._filePath);
    if (diskContent) {
      const diskParsed = parseCardFile(diskContent);
      const diskHash = await computeContentHash(diskParsed.frontmatter, diskParsed.body);

      // If disk content has changed since we loaded/last saved
      if (diskHash !== this.originalContentHash) {
        // Attempt Disjoint Auto-Merge Fast Path per PRD §6.5.1
        const mergedResult = this.attemptAutoMerge(this.card, diskParsed, this.baseCard);
        if (mergedResult.success) {
          this.card = mergedResult.mergedCard;
        } else {
          // Fallback to Visual Merge Modal
          this.showMergeModal(this.card, diskParsed);
          return;
        }
      }
    }

    // Standard write
    this.card.frontmatter.meta = this.card.frontmatter.meta || {};
    this.card.frontmatter.meta.revision = (this.originalRevision || 1) + 1;
    this.card.frontmatter.meta.updatedAt = new Date().toISOString();
    this.card.frontmatter.meta.contentHash = await computeContentHash(this.card.frontmatter, this.card.body);

    const fileContent = serializeCardFile(this.card.frontmatter, this.card.body);
    await this.appState.fsAdapter.writeFile(this.card._filePath, fileContent);

    this.originalRevision = this.card.frontmatter.meta.revision;
    this.originalContentHash = this.card.frontmatter.meta.contentHash;
    this.baseCard = JSON.parse(JSON.stringify(this.card));

    // Update in-memory DB card record
    this.appState.db.cards.set(this.card.id, this.card);

    if (typeof document !== 'undefined') {
      const statusEl = document.getElementById('auto-save-status');
      if (statusEl) statusEl.textContent = 'Saved';
    }

    if (this.onSaveCallback) this.onSaveCallback();
  }

  /**
   * Disjoint Body Section Auto-Merge Fast Path (§6.5.1)
   * Auto-merges if edits touch disjoint body sections and frontmatters match.
   */
  attemptAutoMerge(localCard, incomingParsed, baseCard = null) {
    const filterFm = (fm) => {
      const copy = JSON.parse(JSON.stringify(fm || {}));
      if (copy.meta) {
        delete copy.meta.revision;
        delete copy.meta.contentHash;
        delete copy.meta.updatedAt;
        delete copy.meta.updatedBy;
        if (Object.keys(copy.meta).length === 0) delete copy.meta;
      }
      return JSON.stringify(copy);
    };

    // Frontmatter conflicts cannot auto-merge
    if (filterFm(localCard.frontmatter) !== filterFm(incomingParsed.frontmatter)) {
      return { success: false };
    }

    const localSections = parseBodySections(localCard.body);
    const incomingSections = parseBodySections(incomingParsed.body);

    const mergedSectionsMap = new Map();
    let hasConflict = false;

    const allSectionIds = new Set([
      ...localSections.sections.map(s => s.id),
      ...incomingSections.sections.map(s => s.id)
    ]);

    for (const id of allSectionIds) {
      const localSec = localSections.sections.find(s => s.id === id);
      const incSec = incomingSections.sections.find(s => s.id === id);

      if (localSec && incSec) {
        if (localSec.content === incSec.content) {
          mergedSectionsMap.set(id, { title: localSec.title, content: localSec.content });
        } else {
          // One side edited section, other side didn't (or both edited same section -> conflict)
          // If baseCard is provided, check which side changed; otherwise if one section content matches base or is empty
          if (baseCard) {
            const baseSec = parseBodySections(baseCard.body).sections.find(s => s.id === id);
            const baseContent = baseSec ? baseSec.content : '';
            if (localSec.content === baseContent) {
              mergedSectionsMap.set(id, { title: incSec.title, content: incSec.content });
            } else if (incSec.content === baseContent) {
              mergedSectionsMap.set(id, { title: localSec.title, content: localSec.content });
            } else {
              hasConflict = true;
              break;
            }
          } else {
            // Heuristic: if one side edited and the other side is unchanged or disjoint
            hasConflict = true;
            break;
          }
        }
      } else if (localSec) {
        mergedSectionsMap.set(id, { title: localSec.title, content: localSec.content });
      } else if (incSec) {
        mergedSectionsMap.set(id, { title: incSec.title, content: incSec.content });
      }
    }

    if (hasConflict) return { success: false };

    // Build merged body
    const bodyParts = [];
    for (const [id, secObj] of mergedSectionsMap.entries()) {
      bodyParts.push(`## ${secObj.title || id}\n${secObj.content}`);
    }
    if (localSections.activityLog || incomingSections.activityLog) {
      bodyParts.push(`## Activity Log\n${localSections.activityLog}\n${incomingSections.activityLog}`);
    }

    const mergedCard = JSON.parse(JSON.stringify(localCard));
    mergedCard.body = bodyParts.join('\n\n');

    return { success: true, mergedCard };
  }

  showMergeModal(localCard, incomingParsed) {
    if (typeof document === 'undefined' || !document.body) return;

    let existing = document.getElementById('merge-modal');
    if (existing) existing.remove();

    const html = `
      <div id="merge-modal" class="modal-overlay">
        <div class="modal-content merge-modal-dialog">
          <h3>Conflict Detected (Stale Write)</h3>
          <p>Another user or agent modified this card while you were editing.</p>

          <div class="merge-choice-container">
            <button id="btn-keep-local" class="btn-primary">Keep My Local Edits</button>
            <button id="btn-accept-incoming" class="btn-secondary">Accept Incoming Edits</button>
          </div>
        </div>
      </div>`;

    document.body.insertAdjacentHTML('beforeend', html);

    document.getElementById('btn-keep-local').addEventListener('click', async () => {
      document.getElementById('merge-modal').remove();
      this.originalContentHash = await computeContentHash(incomingParsed.frontmatter, incomingParsed.body);
      await this.saveCard();
    });

    document.getElementById('btn-accept-incoming').addEventListener('click', () => {
      document.getElementById('merge-modal').remove();
      this.card.frontmatter = incomingParsed.frontmatter;
      this.card.body = incomingParsed.body;
      this.renderModalContainer();
    });
  }
}
