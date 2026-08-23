/**
 * SoloKanban Card Edit Modal & Visual Conflict Resolution UI
 * Features 800ms auto-save debounce, raw/rendered Markdown toggle, disjoint auto-merge, and label deletion fallback.
 */

import { parseCardFile, serializeCardFile, serializeYaml } from './yaml.js';
import { computeContentHash } from './hash.js';
import { parseBodySections, appendActivityLog, mergeActivityLogs, renderMarkdown, escapeHtml } from './markdown.js';
import { parseChecklist, calculateProgress } from './checklist.js';

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

  async open(card) {
    this.card = JSON.parse(JSON.stringify(card));
    this.baseCard = JSON.parse(JSON.stringify(card)); // Gap #1 fix: snapshot at open time
    this.originalRevision = this.card.frontmatter?.meta?.revision || 1;
    this.originalContentHash = await computeContentHash(this.card.frontmatter || {}, this.card.body || '');
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

    // Quick Actions Bar (Trello-inspired)
    const quickActionsHtml = `
      <div class="modal-quick-actions-bar">
        <button type="button" class="quick-action-btn" id="qa-labels-btn">🏷️ Labels</button>
        <button type="button" class="quick-action-btn" id="qa-priority-btn">⚡ Priority</button>
        <button type="button" class="quick-action-btn" id="qa-dates-btn">📅 Due Date</button>
        <button type="button" class="quick-action-btn" id="qa-assignee-btn">👤 Assignee</button>
        <button type="button" class="quick-action-btn" id="qa-checklist-btn">☑️ Checklist</button>
      </div>`;

    // Linear Checklist Progress Bar (Trello / Asana style)
    const checklistItems = parseChecklist(this.card.body || '');
    const progress = calculateProgress(checklistItems);
    const progressBarHtml = (!this.isRawMarkdown && progress.total > 0)
      ? `<div class="modal-checklist-progress-container">
           <div class="modal-checklist-progress-info">
             <span class="modal-checklist-pct-badge">${progress.percentage}% completed</span>
             <span class="modal-checklist-count-text">${progress.completed} of ${progress.total} tasks</span>
           </div>
           <div class="modal-checklist-progress-track">
             <div class="modal-checklist-progress-fill" style="width: ${progress.percentage}%;"></div>
           </div>
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
          <div class="form-group property-row">
            <label class="form-label">${escapeHtml(field.label)}</label>
            <select class="form-select custom-field-input" data-field-key="${field.key}">${optionsHtml}</select>
          </div>`;
      } else {
        return `
          <div class="form-group property-row">
            <label class="form-label">${escapeHtml(field.label)}</label>
            <input type="text" class="form-input custom-field-input" data-field-key="${field.key}" value="${escapeHtml(String(val))}"/>
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
      : `${progressBarHtml}<div id="modal-body-rendered" class="rendered-markdown-box">${renderMarkdown(this.card.body || '', sectionDescriptions)}</div>`;

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

          ${quickActionsHtml}

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

              <div class="sidebar-section property-grid-section">
                <h4>Properties</h4>
                
                <div class="form-group property-row">
                  <label class="form-label"><span class="prop-icon">👤</span> Assignee</label>
                  <input type="text" id="modal-assignee-input" class="form-input" placeholder="No assignee" value="${escapeHtml(fm.assignee || '')}"/>
                </div>

                <div class="form-group property-row">
                  <label class="form-label"><span class="prop-icon">📅</span> Due Date</label>
                  <input type="date" id="modal-duedate-input" class="form-input" value="${escapeHtml(fm.dueDate || '')}"/>
                </div>

                <div class="form-group property-row">
                  <label class="form-label"><span class="prop-icon">⚡</span> Priority</label>
                  <select id="modal-priority-select" class="form-select">
                    <option value="low" ${fm.priority === 'low' ? 'selected' : ''}>Low</option>
                    <option value="medium" ${fm.priority === 'medium' || !fm.priority ? 'selected' : ''}>Medium</option>
                    <option value="high" ${fm.priority === 'high' ? 'selected' : ''}>High</option>
                    <option value="critical" ${fm.priority === 'critical' ? 'selected' : ''}>Critical</option>
                  </select>
                </div>

                <div class="form-group property-row">
                  <label class="form-label"><span class="prop-icon">🎯</span> Story Points</label>
                  <input type="number" id="modal-storypoints-input" class="form-input" placeholder="e.g. 3" value="${escapeHtml(fm.storyPoints !== undefined ? String(fm.storyPoints) : '')}"/>
                </div>
              </div>

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

    // PRD §16.1: Close via Esc key
    const escHandler = (e) => {
      if (e.key === 'Escape') {
        document.removeEventListener('keydown', escHandler);
        this.close();
      }
    };
    document.addEventListener('keydown', escHandler);

    modalEl.querySelector('#modal-close-btn').addEventListener('click', () => {
      document.removeEventListener('keydown', escHandler);
      this.close();
    });
    modalEl.addEventListener('click', (e) => {
      if (e.target === modalEl) {
        document.removeEventListener('keydown', escHandler);
        this.close();
      }
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
    } else {
      // Wire up checkbox toggle behaviour
      modalEl.querySelectorAll('.task-checkbox').forEach(cb => {
        cb.addEventListener('change', () => {
          const taskIdx = parseInt(cb.dataset.taskIndex, 10);
          if (isNaN(taskIdx)) return;

          let currentIdx = 0;
          const bodyLines = (this.card.body || '').split('\n');
          for (let i = 0; i < bodyLines.length; i++) {
            const m = bodyLines[i].match(/^(\s*[-*]\s*\[)([ xX?])(\]\s*.*)$/);
            if (m) {
              if (currentIdx === taskIdx) {
                const newCheck = cb.checked ? 'x' : ' ';
                bodyLines[i] = `${m[1]}${newCheck}${m[3]}`;
                break;
              }
              currentIdx++;
            }
          }
          this.card.body = bodyLines.join('\n');
          this.scheduleAutoSave();

          const parentLi = cb.closest('.task-list-item');
          if (parentLi) {
            parentLi.classList.toggle('is-checked', cb.checked);
          }
        });
      });

      // Inject "Add item" affordance after each task checklist block (PRD §16.4)
      const renderedBox = modalEl.querySelector('#modal-body-rendered, .rendered-markdown-box');
      if (renderedBox) {
        const taskLists = renderedBox.querySelectorAll('ul');
        taskLists.forEach(ul => {
          // Only inject for task lists (containing at least one task-list-item)
          if (!ul.querySelector('.task-list-item')) return;

          const addRow = document.createElement('div');
          addRow.className = 'checklist-add-row';
          addRow.innerHTML = `
            <input type="text" class="checklist-new-input" placeholder="+ Add an item...">
          `;
          ul.after(addRow);

          const input = addRow.querySelector('.checklist-new-input');
          const addItem = () => {
            const text = input.value.trim();
            if (!text) return;
            const bodyLines = (this.card.body || '').split('\n');
            // Find the last checklist item in body and insert after it
            let lastCheckIdx = -1;
            for (let i = 0; i < bodyLines.length; i++) {
              if (bodyLines[i].match(/^\s*[-*]\s*\[[ xX?]\]/)) {
                lastCheckIdx = i;
              }
            }
            const newItem = `- [ ] ${text}`;
            if (lastCheckIdx >= 0) {
              bodyLines.splice(lastCheckIdx + 1, 0, newItem);
            } else {
              bodyLines.push(newItem);
            }
            this.card.body = bodyLines.join('\n');
            this.scheduleAutoSave();

            // Targeted in-place DOM update: append <li> and preserve focus (UI #1 & #2)
            const newLi = document.createElement('li');
            newLi.className = 'task-list-item';
            const currentTotalTasks = renderedBox.querySelectorAll('.task-checkbox').length;
            newLi.innerHTML = `<input type="checkbox" class="task-checkbox" data-task-index="${currentTotalTasks}"> <span class="task-label">${escapeHtml(text)}</span>`;
            ul.appendChild(newLi);

            // Wire change listener on new checkbox
            const newCb = newLi.querySelector('.task-checkbox');
            newCb.addEventListener('change', () => {
              const bodyLines = (this.card.body || '').split('\n');
              let taskIdx = parseInt(newCb.dataset.taskIndex, 10);
              let cIdx = 0;
              for (let i = 0; i < bodyLines.length; i++) {
                const m = bodyLines[i].match(/^(\s*[-*]\s*\[)([ xX?])(\]\s*.*)$/);
                if (m) {
                  if (cIdx === taskIdx) {
                    bodyLines[i] = `${m[1]}${newCb.checked ? 'x' : ' '}${m[3]}`;
                    break;
                  }
                  cIdx++;
                }
              }
              this.card.body = bodyLines.join('\n');
              this.scheduleAutoSave();
              newLi.classList.toggle('is-checked', newCb.checked);
              this.updateProgressBarInPlace();
            });

            this.updateProgressBarInPlace();
            input.value = '';
            input.focus();
          };

          input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addItem();
            }
          });
        });

        // PRD §16.4: Empty checklist sections show "Add an item" affordance
        const headings = renderedBox.querySelectorAll('h1, h2, h3');
        headings.forEach(heading => {
          const headerText = heading.textContent.trim();
          const isChecklistHeading = /acceptance|criteria|checklist|task|to-do|todo/i.test(headerText);
          const nextEl = heading.nextElementSibling;
          const hasListDirectly = nextEl && (nextEl.tagName === 'UL' || nextEl.classList.contains('checklist-add-row'));
          if (isChecklistHeading && !hasListDirectly) {
            const addRow = document.createElement('div');
            addRow.className = 'checklist-add-row';
            addRow.innerHTML = `
              <input type="text" class="checklist-new-input" placeholder="+ Add an item...">
            `;
            heading.after(addRow);

            const input = addRow.querySelector('.checklist-new-input');
            input.addEventListener('keydown', (e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                const text = input.value.trim();
                if (!text) return;
                const bodyLines = (this.card.body || '').split('\n');
                let hIdx = -1;
                for (let i = 0; i < bodyLines.length; i++) {
                  if (bodyLines[i].replace(/^#+\s*/, '').trim().toLowerCase() === headerText.toLowerCase()) {
                    hIdx = i;
                    break;
                  }
                }
                const newItem = `- [ ] ${text}`;
                if (hIdx >= 0) {
                  bodyLines.splice(hIdx + 1, 0, newItem);
                } else {
                  bodyLines.push(newItem);
                }
                this.card.body = bodyLines.join('\n');
                this.scheduleAutoSave();

                // Create UL list directly after heading
                const newUl = document.createElement('ul');
                newUl.innerHTML = `<li class="task-list-item"><input type="checkbox" class="task-checkbox" data-task-index="0"> <span class="task-label">${escapeHtml(text)}</span></li>`;
                heading.after(newUl);
                newUl.after(addRow);

                const newCb = newUl.querySelector('.task-checkbox');
                newCb.addEventListener('change', () => {
                  const bLines = (this.card.body || '').split('\n');
                  for (let i = 0; i < bLines.length; i++) {
                    const m = bLines[i].match(/^(\s*[-*]\s*\[)([ xX?])(\]\s*.*)$/);
                    if (m) {
                      bLines[i] = `${m[1]}${newCb.checked ? 'x' : ' '}${m[3]}`;
                      break;
                    }
                  }
                  this.card.body = bLines.join('\n');
                  this.scheduleAutoSave();
                  newUl.querySelector('.task-list-item').classList.toggle('is-checked', newCb.checked);
                  this.updateProgressBarInPlace();
                });

                this.updateProgressBarInPlace();
                input.value = '';
                input.focus();
              }
            });
          }
        });
      }
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
          try {
            localStorage.setItem('solokanban_last_view', 'project');
            localStorage.setItem('solokanban_last_project', projId);
          } catch (e) {}
          window.app.renderHeader();
          window.app.refreshBoard();
        }
      });
    }

    // Priority select change
    const prioSelect = modalEl.querySelector('#modal-priority-select');
    if (prioSelect) {
      prioSelect.addEventListener('change', () => {
        this.card.frontmatter.priority = prioSelect.value;
        this.scheduleAutoSave();
      });
    }

    // Assignee input change
    const assigneeInput = modalEl.querySelector('#modal-assignee-input');
    if (assigneeInput) {
      assigneeInput.addEventListener('input', () => {
        this.card.frontmatter.assignee = assigneeInput.value.trim() || undefined;
        this.scheduleAutoSave();
      });
    }

    // Due Date input change
    const dueDateInput = modalEl.querySelector('#modal-duedate-input');
    if (dueDateInput) {
      dueDateInput.addEventListener('change', () => {
        this.card.frontmatter.dueDate = dueDateInput.value || undefined;
        this.scheduleAutoSave();
      });
    }

    // Story Points input change
    const storyPointsInput = modalEl.querySelector('#modal-storypoints-input');
    if (storyPointsInput) {
      storyPointsInput.addEventListener('input', () => {
        const val = storyPointsInput.value.trim();
        this.card.frontmatter.storyPoints = val ? Number(val) : undefined;
        this.scheduleAutoSave();
      });
    }

    // Quick Actions Bar Buttons (Trello style)
    modalEl.querySelector('#qa-labels-btn')?.addEventListener('click', () => {
      const select = modalEl.querySelector('#add-label-select');
      if (select) {
        select.focus();
        select.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    });

    modalEl.querySelector('#qa-priority-btn')?.addEventListener('click', () => {
      const select = modalEl.querySelector('#modal-priority-select');
      if (select) {
        select.focus();
        select.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    });

    modalEl.querySelector('#qa-dates-btn')?.addEventListener('click', () => {
      const dateInput = modalEl.querySelector('#modal-duedate-input');
      if (dateInput) {
        dateInput.focus();
        dateInput.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    });

    modalEl.querySelector('#qa-assignee-btn')?.addEventListener('click', () => {
      const assigneeIn = modalEl.querySelector('#modal-assignee-input');
      if (assigneeIn) {
        assigneeIn.focus();
        assigneeIn.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    });

    modalEl.querySelector('#qa-checklist-btn')?.addEventListener('click', () => {
      const checkInput = modalEl.querySelector('.checklist-new-input');
      if (checkInput) {
        checkInput.focus();
        checkInput.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    });

    // Custom fields change
    modalEl.querySelectorAll('.custom-field-input').forEach(input => {
      input.addEventListener('change', () => {
        const key = input.dataset.fieldKey;
        this.card.frontmatter[key] = input.value;
        this.scheduleAutoSave();
      });
    });
  }

  updateProgressBarInPlace() {
    const checklistItems = parseChecklist(this.card.body || '');
    const progress = calculateProgress(checklistItems);
    const pctBadge = document.querySelector('.modal-checklist-pct-badge');
    const countText = document.querySelector('.modal-checklist-count-text');
    const fill = document.querySelector('.modal-checklist-progress-fill');
    if (pctBadge) pctBadge.textContent = `${progress.percentage}% completed`;
    if (countText) countText.textContent = `${progress.completed} of ${progress.total} tasks`;
    if (fill) fill.style.width = `${progress.percentage}%`;
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

    // Update in-memory DB card record & rebuild search index (PRD §18)
    this.appState.db.cards.set(this.card.id, this.card);
    if (this.appState.db.rebuildSearchIndex) {
      this.appState.db.rebuildSearchIndex();
    }

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

    const localFmStr = filterFm(localCard.frontmatter);
    const incFmStr = filterFm(incomingParsed.frontmatter);
    const baseFmStr = baseCard ? filterFm(baseCard.frontmatter) : null;

    let mergedFrontmatter = localCard.frontmatter;

    if (localFmStr !== incFmStr) {
      if (baseFmStr) {
        if (incFmStr === baseFmStr) {
          // Incoming didn't touch frontmatter; keep local user frontmatter
          mergedFrontmatter = localCard.frontmatter;
        } else if (localFmStr === baseFmStr) {
          // Local user didn't touch frontmatter; accept incoming frontmatter
          mergedFrontmatter = incomingParsed.frontmatter;
        } else {
          // Both sides made conflicting frontmatter edits -> show merge modal
          return { success: false };
        }
      } else {
        return { success: false };
      }
    }

    const localSections = parseBodySections(localCard.body);
    const incomingSections = parseBodySections(incomingParsed.body);

    const mergedSectionsMap = new Map();
    let hasConflict = false;

    // Canonical ordering from feature type if available
    const cardType = (this.appState?.db?.featureTypes || []).find(t => t.id === localCard.type);
    const definedOrder = cardType?.bodySections?.map(s => s.label.toLowerCase().replace(/[^a-z0-9]/g, '-')) || [];

    const allSectionIds = Array.from(new Set([
      ...definedOrder,
      ...localSections.sections.map(s => s.id),
      ...incomingSections.sections.map(s => s.id)
    ]));

    for (const id of allSectionIds) {
      const localSec = localSections.sections.find(s => s.id === id);
      const incSec = incomingSections.sections.find(s => s.id === id);

      if (localSec && incSec) {
        if (localSec.content === incSec.content) {
          mergedSectionsMap.set(id, { title: localSec.title, content: localSec.content });
        } else {
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
      if (secObj.content !== undefined) {
        bodyParts.push(`## ${secObj.title || id}\n${secObj.content}`);
      }
    }
    if (localSections.activityLog || incomingSections.activityLog) {
      const mergedLog = mergeActivityLogs(localSections.activityLog, incomingSections.activityLog);
      bodyParts.push(`## Activity Log\n${mergedLog}`);
    }

    const mergedCard = JSON.parse(JSON.stringify(localCard));
    mergedCard.frontmatter = mergedFrontmatter;
    mergedCard.body = bodyParts.join('\n\n');

    return { success: true, mergedCard };
  }

  showMergeModal(localCard, incomingParsed) {
    if (typeof document === 'undefined' || !document.body) return;

    let existing = document.getElementById('merge-modal');
    if (existing) existing.remove();

    const localSections = parseBodySections(localCard.body);
    const incomingSections = parseBodySections(incomingParsed.body);

    const allSectionIds = Array.from(new Set([
      ...localSections.sections.map(s => s.id),
      ...incomingSections.sections.map(s => s.id)
    ]));

    const sectionRowsHtml = allSectionIds.map(id => {
      const localSec = localSections.sections.find(s => s.id === id) || { title: id, content: '' };
      const incSec = incomingSections.sections.find(s => s.id === id) || { title: id, content: '' };
      const isDiff = localSec.content !== incSec.content;

      return `
        <div class="merge-section-row ${isDiff ? 'is-conflict' : 'is-matched'}" data-section-id="${escapeHtml(id)}">
          <div class="merge-section-title">
            <strong>## ${escapeHtml(localSec.title || incSec.title || id)}</strong>
            ${isDiff ? '<span class="conflict-badge">Conflict</span>' : '<span class="matched-badge">Identical</span>'}
          </div>
          <div class="merge-section-diff-grid">
            <div class="diff-pane local-pane">
              <div class="diff-pane-header">
                <span>My Local Version</span>
                <button type="button" class="btn-xs btn-pick-local" data-section-id="${escapeHtml(id)}">Keep Local</button>
              </div>
              <textarea class="diff-editor local-diff-text" data-section-id="${escapeHtml(id)}">${escapeHtml(localSec.content)}</textarea>
            </div>
            <div class="diff-pane incoming-pane">
              <div class="diff-pane-header">
                <span>Incoming Version</span>
                <button type="button" class="btn-xs btn-pick-incoming" data-section-id="${escapeHtml(id)}">Accept Incoming</button>
              </div>
              <textarea class="diff-editor incoming-diff-text" data-section-id="${escapeHtml(id)}" readonly>${escapeHtml(incSec.content)}</textarea>
            </div>
          </div>
        </div>`;
    }).join('');

    const localFmYaml = serializeYaml(localCard.frontmatter || {});
    const incFmYaml = serializeYaml(incomingParsed.frontmatter || {});

    const html = `
      <div id="merge-modal" class="modal-overlay">
        <div class="modal-content merge-modal-dialog">
          <div class="merge-modal-header">
            <h3>🔀 Conflict Resolution (Stale Write Detected)</h3>
            <p>Another user or agent modified this card concurrently. Choose which changes to keep for each section.</p>
          </div>

          <div class="merge-global-actions">
            <button id="btn-keep-local" class="btn-primary">Keep All Local</button>
            <button id="btn-accept-incoming" class="btn-secondary">Accept All Incoming</button>
          </div>

          <div class="merge-frontmatter-container">
            <h4>Frontmatter (Metadata)</h4>
            <div class="merge-frontmatter-grid">
              <div class="diff-pane">
                <div class="diff-pane-header">
                  <span>My Local Frontmatter</span>
                  <button type="button" id="btn-pick-local-fm" class="btn-xs active">Keep Local Frontmatter</button>
                </div>
                <pre class="yaml-diff-box">${escapeHtml(localFmYaml)}</pre>
              </div>
              <div class="diff-pane">
                <div class="diff-pane-header">
                  <span>Incoming Frontmatter</span>
                  <button type="button" id="btn-pick-incoming-fm" class="btn-xs">Accept Incoming Frontmatter</button>
                </div>
                <pre class="yaml-diff-box">${escapeHtml(incFmYaml)}</pre>
              </div>
            </div>
          </div>

          <div class="merge-sections-container">
            <h4>Body Sections</h4>
            ${sectionRowsHtml}
          </div>

          <div class="merge-modal-footer">
            <button id="btn-confirm-merge" class="btn-gradient btn-lg">Save Resolved Card</button>
          </div>
        </div>
      </div>`;

    document.body.insertAdjacentHTML('beforeend', html);

    let chosenFm = localCard.frontmatter;

    document.getElementById('btn-pick-local-fm')?.addEventListener('click', () => {
      chosenFm = localCard.frontmatter;
      document.getElementById('btn-pick-local-fm').classList.add('active');
      document.getElementById('btn-pick-incoming-fm').classList.remove('active');
    });

    document.getElementById('btn-pick-incoming-fm')?.addEventListener('click', () => {
      chosenFm = incomingParsed.frontmatter;
      document.getElementById('btn-pick-incoming-fm').classList.add('active');
      document.getElementById('btn-pick-local-fm').classList.remove('active');
    });

    // Section-by-section buttons
    document.querySelectorAll('.btn-pick-incoming').forEach(btn => {
      btn.addEventListener('click', () => {
        const secId = btn.dataset.sectionId;
        const incSec = incomingSections.sections.find(s => s.id === secId);
        const localTextarea = document.querySelector(`.local-diff-text[data-section-id="${secId}"]`);
        if (localTextarea && incSec) {
          localTextarea.value = incSec.content;
          localTextarea.classList.add('accepted-incoming');
        }
      });
    });

    document.querySelectorAll('.btn-pick-local').forEach(btn => {
      btn.addEventListener('click', () => {
        const secId = btn.dataset.sectionId;
        const localSec = localSections.sections.find(s => s.id === secId);
        const localTextarea = document.querySelector(`.local-diff-text[data-section-id="${secId}"]`);
        if (localTextarea && localSec) {
          localTextarea.value = localSec.content;
          localTextarea.classList.remove('accepted-incoming');
        }
      });
    });

    // Global buttons (used in tests & fast flow)
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

    // Granular resolved merge
    document.getElementById('btn-confirm-merge').addEventListener('click', async () => {
      const mergedBodyParts = [];
      for (const id of allSectionIds) {
        const sec = localSections.sections.find(s => s.id === id) || incomingSections.sections.find(s => s.id === id);
        const textarea = document.querySelector(`.local-diff-text[data-section-id="${id}"]`);
        const content = textarea ? textarea.value : (sec ? sec.content : '');
        mergedBodyParts.push(`## ${sec?.title || id}\n${content}`);
      }
      if (localSections.activityLog || incomingSections.activityLog) {
        const mergedLog = mergeActivityLogs(localSections.activityLog, incomingSections.activityLog);
        mergedBodyParts.push(`## Activity Log\n${mergedLog}`);
      }

      document.getElementById('merge-modal').remove();
      this.card.frontmatter = chosenFm;
      this.card.body = mergedBodyParts.join('\n\n');
      this.originalContentHash = await computeContentHash(incomingParsed.frontmatter, incomingParsed.body);
      await this.saveCard();
      this.renderModalContainer();
    });
  }
}
