// Card detail modal: viewing, inline editing, checklist, labels, due date,
// custom fields, relationships, and template actions all live here so
// render.js can stay focused on the board grid itself.

import * as state from './state.js';
import { renderMarkdown } from './markdown.js';
import { escapeHtml, REL_LABELS } from './render.js';

const overlay = document.getElementById('modal-overlay');
const container = document.getElementById('modal-container');

let currentCardId = null;

export function isModalOpen() {
  return !overlay.classList.contains('hidden');
}

export function closeModal() {
  state.flushPendingWrites();
  overlay.classList.add('hidden');
  container.innerHTML = '';
  currentCardId = null;
}

export function openCardModal(cardId, { focusTitle = false } = {}) {
  currentCardId = cardId;
  overlay.classList.remove('hidden');
  renderModal({ focusTitle });
}

overlay.addEventListener('click', (e) => {
  if (e.target === overlay) closeModal();
});

function renderModal({ focusTitle = false } = {}) {
  const card = state.getCard(currentCardId);
  if (!card) { closeModal(); return; }
  const ctx = state.getCtx();

  const labels = ctx.board.labels;
  const cardLabels = card.labels || [];
  const checklist = card.checklist || [];
  const checklistDone = checklist.filter(i => i.done).length;
  const relationships = card.relationships || [];

  container.innerHTML = `
    <div class="modal-header">
      <input class="modal-title-input" value="${escapeAttr(card.title)}" placeholder="Card title" />
      <div class="modal-header-actions">
        <button id="modal-duplicate" title="Duplicate (Ctrl/Cmd+D)">Duplicate</button>
        <button id="modal-template" title="Save as template (t)">Save as template&hellip;</button>
        <button id="modal-delete" class="danger" title="Delete (Delete)">Delete</button>
        <button id="modal-close" class="icon-btn" aria-label="Close">&times;</button>
      </div>
    </div>
    <div class="modal-filepath">cards/${card.id}.md</div>

    <div class="modal-body">
      <div class="modal-main">
        <section class="modal-section">
          <h4>Labels</h4>
          <div class="label-picker">
            ${labels.map(l => `
              <button class="label-toggle ${cardLabels.includes(l.id) ? 'active' : ''}" data-label-id="${l.id}" style="--label-color:${l.color}">
                <span class="label-chip" style="background:${l.color}"></span>${escapeHtml(l.name)}
              </button>
            `).join('')}
            <button id="add-label-btn" class="add-label-btn">+ New label</button>
          </div>
        </section>

        <section class="modal-section">
          <h4>Description</h4>
          <textarea id="description-input" class="description-input" placeholder="Write in Markdown&hellip;">${escapeHtml(card.description || '')}</textarea>
          <div id="description-preview" class="description-preview">${renderMarkdown(card.description || '')}</div>
          <button id="toggle-preview" class="link-btn">Toggle preview</button>
        </section>

        <section class="modal-section">
          <h4>Checklist ${checklist.length ? `<span class="muted">(${checklistDone}/${checklist.length})</span>` : ''}</h4>
          <div class="checklist-progress"><div class="checklist-progress-bar" style="width:${checklist.length ? (checklistDone / checklist.length * 100) : 0}%"></div></div>
          <ul class="checklist">
            ${checklist.map((item, idx) => `
              <li>
                <input type="checkbox" data-idx="${idx}" ${item.done ? 'checked' : ''} />
                <input type="text" class="checklist-text" data-idx="${idx}" value="${escapeAttr(item.text)}" />
                <button class="icon-btn checklist-remove" data-idx="${idx}" aria-label="Remove item">&times;</button>
              </li>
            `).join('')}
          </ul>
          <button id="add-checklist-item" class="link-btn">+ Add item</button>
        </section>

        <section class="modal-section">
          <h4>Relationships</h4>
          <ul class="relationships-list">
            ${relationships.map(r => {
              const target = state.getCard(r.targetCardId);
              return `<li>
                <span class="rel-type">${REL_LABELS[r.type] || r.type}</span>
                <button class="rel-target-link" data-target-id="${r.targetCardId}">${target ? escapeHtml(target.title) : '(missing card)'}</button>
                <button class="icon-btn rel-remove" data-target-id="${r.targetCardId}" data-type="${r.type}" aria-label="Remove relationship">&times;</button>
              </li>`;
            }).join('') || '<li class="muted">No relationships yet.</li>'}
          </ul>
          <button id="add-relationship" class="link-btn">+ Link another card&hellip;</button>
        </section>
      </div>

      <aside class="modal-sidebar">
        <section class="modal-section">
          <h4>Due date</h4>
          <input type="date" id="due-date-input" value="${card.dueDate ? card.dueDate.slice(0, 10) : ''}" />
        </section>

        <section class="modal-section">
          <h4>Custom fields</h4>
          ${ctx.fields.map(f => renderCustomFieldInput(f, card)).join('') || '<p class="muted">No custom fields defined.</p>'}
          <button id="add-field-btn" class="link-btn">+ New field&hellip;</button>
        </section>

        <section class="modal-section">
          <h4>Move to list</h4>
          <select id="list-select">
            ${[...ctx.board.lists].sort((a, b) => a.order - b.order).map(l => `<option value="${l.id}" ${l.id === card.listId ? 'selected' : ''}>${escapeHtml(l.title)}</option>`).join('')}
          </select>
        </section>
      </aside>
    </div>
  `;

  wireModalEvents(card, { focusTitle });
}

function renderCustomFieldInput(field, card) {
  const value = (card.customFields || {})[field.name] ?? '';
  if (field.type === 'select') {
    return `<label class="field-row">${escapeHtml(field.name)}
      <select data-field="${escapeAttr(field.name)}" class="custom-field-input">
        <option value="">&mdash;</option>
        ${field.options.map(o => `<option value="${escapeAttr(o)}" ${o === value ? 'selected' : ''}>${escapeHtml(o)}</option>`).join('')}
      </select></label>`;
  }
  const inputType = field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : field.type === 'url' ? 'url' : 'text';
  return `<label class="field-row">${escapeHtml(field.name)}
    <input type="${inputType}" data-field="${escapeAttr(field.name)}" class="custom-field-input" value="${escapeAttr(value)}" /></label>`;
}

function wireModalEvents(card, { focusTitle }) {
  container.querySelector('#modal-close').addEventListener('click', closeModal);
  container.querySelector('#modal-delete').addEventListener('click', () => {
    if (confirm(`Delete "${card.title}"?`)) {
      state.deleteCard(card.id);
      closeModal();
    }
  });
  container.querySelector('#modal-duplicate').addEventListener('click', () => {
    const clone = state.duplicateCard(card.id, { deep: true });
    closeModal();
    openCardModal(clone.id);
  });
  container.querySelector('#modal-template').addEventListener('click', () => {
    const name = prompt('Template name', card.title);
    if (name && name.trim()) state.saveAsTemplate(card.id, name.trim());
  });

  const titleInput = container.querySelector('.modal-title-input');
  titleInput.addEventListener('input', () => state.updateCard(card.id, { title: titleInput.value }));
  if (focusTitle) { titleInput.focus(); titleInput.select(); }

  const descInput = container.querySelector('#description-input');
  const descPreview = container.querySelector('#description-preview');
  descInput.addEventListener('input', () => {
    state.updateCard(card.id, { description: descInput.value });
    descPreview.innerHTML = renderMarkdown(descInput.value);
  });
  container.querySelector('#toggle-preview').addEventListener('click', () => {
    descInput.classList.toggle('hidden');
    descPreview.classList.toggle('hidden');
  });
  descPreview.classList.add('hidden');

  container.querySelectorAll('.label-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const labelId = btn.dataset.labelId;
      const current = new Set(card.labels || []);
      if (current.has(labelId)) current.delete(labelId); else current.add(labelId);
      state.updateCard(card.id, { labels: [...current] }, { immediate: true });
      renderModal({});
    });
  });
  container.querySelector('#add-label-btn').addEventListener('click', () => {
    const name = prompt('Label name');
    if (!name) return;
    const color = prompt('Hex color (e.g. #58a6ff)', '#58a6ff') || '#58a6ff';
    state.addLabel(name.trim(), color.trim());
    renderModal({});
  });

  container.querySelectorAll('.checklist input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', () => {
      const items = structuredClone(card.checklist || []);
      items[Number(cb.dataset.idx)].done = cb.checked;
      state.updateCard(card.id, { checklist: items }, { immediate: true });
      renderModal({});
    });
  });
  container.querySelectorAll('.checklist-text').forEach(input => {
    input.addEventListener('input', () => {
      const items = structuredClone(card.checklist || []);
      items[Number(input.dataset.idx)].text = input.value;
      state.updateCard(card.id, { checklist: items });
    });
  });
  container.querySelectorAll('.checklist-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      const items = structuredClone(card.checklist || []);
      items.splice(Number(btn.dataset.idx), 1);
      state.updateCard(card.id, { checklist: items }, { immediate: true });
      renderModal({});
    });
  });
  container.querySelector('#add-checklist-item').addEventListener('click', () => {
    const items = structuredClone(card.checklist || []);
    items.push({ text: '', done: false });
    state.updateCard(card.id, { checklist: items }, { immediate: true });
    renderModal({});
    const inputs = container.querySelectorAll('.checklist-text');
    inputs[inputs.length - 1]?.focus();
  });

  container.querySelector('#due-date-input').addEventListener('change', (e) => {
    state.updateCard(card.id, { dueDate: e.target.value || undefined }, { immediate: true });
  });

  container.querySelectorAll('.custom-field-input').forEach(input => {
    input.addEventListener('change', () => {
      const fields = { ...(card.customFields || {}) };
      fields[input.dataset.field] = input.value;
      state.updateCard(card.id, { customFields: fields }, { immediate: true });
    });
  });
  container.querySelector('#add-field-btn').addEventListener('click', () => {
    const name = prompt('Field name');
    if (!name) return;
    const type = prompt('Field type: text, number, date, url, or select', 'text') || 'text';
    let options = [];
    if (type === 'select') {
      const raw = prompt('Options, comma-separated', 'Low, Medium, High') || '';
      options = raw.split(',').map(s => s.trim()).filter(Boolean);
    }
    state.addCustomField(name.trim(), type.trim(), options);
    renderModal({});
  });

  container.querySelector('#list-select').addEventListener('change', (e) => {
    state.moveCard(card.id, { listId: e.target.value, order: 9999 });
    renderModal({});
  });

  container.querySelectorAll('.rel-target-link').forEach(btn => {
    btn.addEventListener('click', () => openCardModal(btn.dataset.targetId));
  });
  container.querySelectorAll('.rel-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      state.removeRelationship(card.id, btn.dataset.targetId, btn.dataset.type);
      renderModal({});
    });
  });
  container.querySelector('#add-relationship').addEventListener('click', () => {
    showRelationshipPicker(card);
  });
}

function showRelationshipPicker(card) {
  const ctx = state.getCtx();
  const others = ctx.cards.filter(c => c.id !== card.id);
  const titleList = others.map((c, i) => `${i + 1}. ${c.title}`).join('\n');
  const choice = prompt(`Link to which card? Enter its number:\n${titleList}`);
  if (!choice) return;
  const idx = Number(choice) - 1;
  const target = others[idx];
  if (!target) return;
  const type = prompt('Relationship type: blockedBy, blocks, childOf, parentOf, relatesTo', 'relatesTo');
  if (!type || !REL_LABELS[type]) { alert('Unrecognized relationship type.'); return; }
  state.addRelationship(card.id, target.id, type);
  renderModal({});
}

function escapeAttr(str) {
  return escapeHtml(str ?? '');
}

export function getCurrentCardId() {
  return currentCardId;
}
