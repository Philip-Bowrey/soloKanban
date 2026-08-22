// DOM rendering. Pure(ish) functions that take current state and produce
// DOM — no direct fs.js calls here, only state.js mutators, keeping the
// "filesystem is the database" boundary in one place.

import * as state from './state.js';
import { renderMarkdown } from './markdown.js';
import { openCardModal } from './modal.js';

const boardEl = document.getElementById('board');
const boardTitleEl = document.getElementById('board-title');

const REL_LABELS = {
  blockedBy: 'Blocked by',
  blocks: 'Blocks',
  childOf: 'Child of',
  parentOf: 'Parent of',
  relatesTo: 'Relates to',
};

export function renderAll() {
  const ctx = state.getCtx();
  if (!ctx) return;
  boardTitleEl.textContent = ctx.board.title;
  applyTheme(ctx.board.theme);
  boardEl.innerHTML = '';

  const lists = [...ctx.board.lists].sort((a, b) => a.order - b.order);
  for (const list of lists) {
    boardEl.appendChild(renderList(list));
  }
  boardEl.appendChild(renderAddListButton());
}

function applyTheme(theme) {
  const root = document.documentElement;
  root.dataset.mode = theme.mode || 'system';
  root.dataset.font = theme.font || 'monospace';
  if (theme.background) {
    document.body.style.setProperty('--board-bg', theme.background);
  }
}

function renderList(list) {
  const cards = state.getCardsForList(list.id);
  const el = document.createElement('section');
  el.className = 'list';
  el.dataset.listId = list.id;

  const overLimit = list.wipLimit > 0 && cards.length > list.wipLimit;

  el.innerHTML = `
    <header class="list-header">
      <h2 class="list-title" tabindex="-1">${escapeHtml(list.title)}</h2>
      <span class="list-count ${overLimit ? 'over-limit' : ''}">${cards.length}${list.wipLimit ? ' / ' + list.wipLimit : ''}</span>
      <button class="icon-btn list-menu-btn" title="List options" aria-label="List options">&#8942;</button>
    </header>
    <div class="list-menu hidden">
      <button data-action="rename">Rename</button>
      <button data-action="wip">Set WIP limit</button>
      <button data-action="toggle-done">${list.isDoneColumn ? 'Unmark as Done column' : 'Mark as Done column'}</button>
      <button data-action="delete" class="danger">Delete list</button>
    </div>
    <div class="card-list" data-list-id="${list.id}"></div>
    <div class="list-footer">
      <button class="add-card-btn" data-list-id="${list.id}">+ Add card</button>
      <button class="from-template-btn" data-list-id="${list.id}" title="New from template">From template&hellip;</button>
    </div>
  `;

  const cardListEl = el.querySelector('.card-list');
  for (const card of cards) {
    cardListEl.appendChild(renderCard(card));
  }

  wireListEvents(el, list);
  wireDragAndDrop(cardListEl, list.id);
  return el;
}

function renderCard(card) {
  const ctx = state.getCtx();
  const el = document.createElement('article');
  el.className = 'card';
  el.dataset.cardId = card.id;
  el.tabIndex = 0;
  el.draggable = true;

  if (card.id === state.getFocusedCardId()) el.classList.add('focused');

  const labels = (card.labels || [])
    .map(id => ctx.board.labels.find(l => l.id === id))
    .filter(Boolean);

  const checklist = card.checklist || [];
  const checklistDone = checklist.filter(i => i.done).length;

  const blocker = state.getBlockingCard(card);
  const dueBadge = renderDueBadge(card.dueDate);

  el.innerHTML = `
    <div class="card-labels">
      ${labels.map(l => `<span class="label-chip" style="background:${l.color}" title="${escapeHtml(l.name)}"></span>`).join('')}
    </div>
    <h3 class="card-title">${escapeHtml(card.title)}</h3>
    ${blocker ? `<div class="card-blocked-badge" title="Blocked by: ${escapeHtml(blocker.title)}">&#9888; Blocked by "${escapeHtml(blocker.title)}"</div>` : ''}
    <div class="card-meta">
      ${checklist.length ? `<span class="card-checklist-badge">&#9745; ${checklistDone}/${checklist.length}</span>` : ''}
      ${dueBadge}
    </div>
    <div class="card-filepath">cards/${card.id}.md</div>
  `;

  el.addEventListener('click', () => {
    state.setFocusedCardId(card.id);
    openCardModal(card.id);
  });
  el.addEventListener('focus', () => state.setFocusedCardId(card.id));

  return el;
}

function renderDueBadge(dueDate) {
  if (!dueDate) return '';
  const due = new Date(dueDate);
  const now = new Date();
  const isOverdue = due < now;
  const soon = !isOverdue && (due - now) < 1000 * 60 * 60 * 24 * 2;
  const cls = isOverdue ? 'overdue' : soon ? 'due-soon' : '';
  return `<span class="card-due-badge ${cls}">${formatDate(dueDate)}</span>`;
}

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return iso;
  }
}

function renderAddListButton() {
  const el = document.createElement('div');
  el.className = 'add-list';
  el.innerHTML = `<button id="add-list-btn">+ Add list</button>`;
  el.querySelector('button').addEventListener('click', () => {
    const title = prompt('List name');
    if (title && title.trim()) state.addList(title.trim());
  });
  return el;
}

function wireListEvents(el, list) {
  const menuBtn = el.querySelector('.list-menu-btn');
  const menu = el.querySelector('.list-menu');
  menuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    menu.classList.toggle('hidden');
  });
  document.addEventListener('click', () => menu.classList.add('hidden'), { once: true });

  menu.querySelector('[data-action="rename"]').addEventListener('click', () => {
    const title = prompt('Rename list', list.title);
    if (title && title.trim()) state.updateList(list.id, { title: title.trim() });
  });
  menu.querySelector('[data-action="wip"]').addEventListener('click', () => {
    const val = prompt('WIP limit (0 = none)', String(list.wipLimit || 0));
    if (val !== null) state.updateList(list.id, { wipLimit: Number(val) || 0 });
  });
  menu.querySelector('[data-action="toggle-done"]').addEventListener('click', () => {
    state.updateList(list.id, { isDoneColumn: !list.isDoneColumn });
  });
  menu.querySelector('[data-action="delete"]').addEventListener('click', () => {
    if (confirm(`Delete list "${list.title}" and all its cards?`)) state.deleteList(list.id);
  });

  el.querySelector('.add-card-btn').addEventListener('click', () => {
    const card = state.createCard({ listId: list.id });
    openCardModal(card.id, { focusTitle: true });
  });

  el.querySelector('.from-template-btn').addEventListener('click', (e) => {
    showTemplatePicker(e.currentTarget, list.id);
  });
}

function showTemplatePicker(anchor, listId) {
  const ctx = state.getCtx();
  const existing = document.querySelector('.template-picker');
  if (existing) existing.remove();

  const menu = document.createElement('div');
  menu.className = 'template-picker';
  if (ctx.templates.length === 0) {
    menu.innerHTML = `<div class="template-picker-empty">No templates yet. Save a card as a template first (press "t" on a focused card).</div>`;
  } else {
    menu.innerHTML = ctx.templates
      .map(t => `<button data-template-id="${t.id}">${escapeHtml(t.templateName || t.title)}</button>`)
      .join('');
  }
  anchor.parentElement.appendChild(menu);
  menu.querySelectorAll('button[data-template-id]').forEach(btn => {
    btn.addEventListener('click', () => {
      const template = ctx.templates.find(t => t.id === btn.dataset.templateId);
      const card = state.createCard({ listId, fromTemplate: template });
      menu.remove();
      openCardModal(card.id);
    });
  });
  setTimeout(() => {
    document.addEventListener('click', function onDocClick(e) {
      if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('click', onDocClick); }
    });
  }, 0);
}

// ---- Drag and drop ---------------------------------------------------------

function wireDragAndDrop(cardListEl, listId) {
  cardListEl.addEventListener('dragstart', (e) => {
    const cardEl = e.target.closest('.card');
    if (!cardEl) return;
    e.dataTransfer.setData('text/plain', cardEl.dataset.cardId);
    e.dataTransfer.effectAllowed = 'move';
    cardEl.classList.add('dragging');
  });

  cardListEl.addEventListener('dragend', (e) => {
    const cardEl = e.target.closest('.card');
    if (cardEl) cardEl.classList.remove('dragging');
  });

  cardListEl.addEventListener('dragover', (e) => {
    e.preventDefault();
    const dragging = cardListEl.querySelector('.dragging');
    if (!dragging) return;
    const after = getDragAfterElement(cardListEl, e.clientY);
    if (after == null) cardListEl.appendChild(dragging);
    else cardListEl.insertBefore(dragging, after);
  });

  cardListEl.addEventListener('drop', (e) => {
    e.preventDefault();
    const cardId = e.dataTransfer.getData('text/plain');
    const card = state.getCard(cardId);
    if (!card) return;

    const orderedIds = [...cardListEl.querySelectorAll('.card')].map(el => el.dataset.cardId);
    if (card.listId !== listId) {
      state.moveCard(cardId, { listId, order: orderedIds.indexOf(cardId) });
      state.reorderList(listId, orderedIds);
    } else {
      state.reorderList(listId, orderedIds);
    }
  });
}

function getDragAfterElement(container, y) {
  const els = [...container.querySelectorAll('.card:not(.dragging)')];
  return els.reduce((closest, child) => {
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closest.offset) {
      return { offset, element: child };
    }
    return closest;
  }, { offset: Number.NEGATIVE_INFINITY, element: null }).element;
}

// ---- shared helpers ---------------------------------------------------------

export function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export { REL_LABELS, renderMarkdown };
