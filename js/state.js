// In-memory board state + a tiny pub-sub so render.js can react to changes.
// This module owns "what the app currently believes the board looks like";
// fs.js owns "what is actually on disk." Every mutation here is paired with
// a write via fs.js (debounced for text edits, immediate for structural
// changes) so the two never drift for long.

import * as fsLayer from './fs.js';

const listeners = new Set();
let ctx = null; // board handle bundle from fs.js
let focusedCardId = null;
let filter = { text: '', labelIds: [], fieldMatches: {} };

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify() {
  for (const fn of listeners) fn();
}

export function getCtx() {
  return ctx;
}

export function setCtx(newCtx) {
  ctx = newCtx;
  focusedCardId = null;
  notify();
}

export function genId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

// ---- Debounced per-card write queue ---------------------------------------

const pendingTimers = new Map();
const DEBOUNCE_MS = 500;

function writeCardDebounced(card) {
  const existing = pendingTimers.get(card.id);
  if (existing) clearTimeout(existing);
  const timer = setTimeout(() => {
    pendingTimers.delete(card.id);
    fsLayer.writeCard(ctx, card).catch(err => console.error('Failed to write card', card.id, err));
  }, DEBOUNCE_MS);
  pendingTimers.set(card.id, timer);
}

function writeCardImmediate(card) {
  const existing = pendingTimers.get(card.id);
  if (existing) { clearTimeout(existing); pendingTimers.delete(card.id); }
  return fsLayer.writeCard(ctx, card).catch(err => console.error('Failed to write card', card.id, err));
}

/** Flush any pending debounced writes immediately (e.g. before closing a modal). */
export function flushPendingWrites() {
  for (const [cardId, timer] of pendingTimers) {
    clearTimeout(timer);
    pendingTimers.delete(cardId);
    const card = getCard(cardId);
    if (card) fsLayer.writeCard(ctx, card).catch(err => console.error('Failed to flush card', cardId, err));
  }
}

// ---- Card queries -----------------------------------------------------------

export function getCard(id) {
  return ctx.cards.find(c => c.id === id) || null;
}

export function getCardsForList(listId) {
  return ctx.cards
    .filter(c => c.listId === listId)
    .filter(matchesFilter)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

export function getBlockingCard(card) {
  const rel = (card.relationships || []).find(r => r.type === 'blockedBy');
  if (!rel) return null;
  const blocker = getCard(rel.targetCardId);
  if (!blocker) return null;
  const list = ctx.board.lists.find(l => l.id === blocker.listId);
  if (list && list.isDoneColumn) return null; // resolved
  return blocker;
}

function matchesFilter(card) {
  if (filter.text) {
    const haystack = `${card.title} ${card.description || ''}`.toLowerCase();
    if (!haystack.includes(filter.text.toLowerCase())) return false;
  }
  if (filter.labelIds.length) {
    const cardLabels = card.labels || [];
    if (!filter.labelIds.some(id => cardLabels.includes(id))) return false;
  }
  for (const [field, value] of Object.entries(filter.fieldMatches)) {
    if (!value) continue;
    if ((card.customFields || {})[field] !== value) return false;
  }
  return true;
}

export function setFilter(partial) {
  filter = { ...filter, ...partial };
  notify();
}

export function getFilter() {
  return filter;
}

// ---- Card mutations -----------------------------------------------------------

export function createCard({ listId, title = 'Untitled card', fromTemplate = null }) {
  const listCards = ctx.cards.filter(c => c.listId === listId);
  const order = listCards.length ? Math.max(...listCards.map(c => c.order ?? 0)) + 1 : 0;

  const base = fromTemplate
    ? { ...structuredClone(fromTemplate), id: undefined, templateName: undefined }
    : {};

  const card = {
    id: genId('card'),
    listId,
    order,
    title: fromTemplate ? (fromTemplate.title || title) : title,
    description: base.description || '',
    labels: base.labels ? [...base.labels] : [],
    dueDate: base.dueDate || undefined,
    checklist: base.checklist ? structuredClone(base.checklist) : [],
    customFields: base.customFields ? { ...base.customFields } : {},
    relationships: [],
    isTemplate: false,
  };
  ctx.cards.push(card);
  writeCardImmediate(card);
  notify();
  return card;
}

export function updateCard(id, patch, { immediate = false } = {}) {
  const card = getCard(id);
  if (!card) return null;
  Object.assign(card, patch);
  if (immediate) writeCardImmediate(card);
  else writeCardDebounced(card);
  notify();
  return card;
}

export function moveCard(id, { listId, order }) {
  const card = getCard(id);
  if (!card) return;
  card.listId = listId;
  card.order = order;
  writeCardImmediate(card);
  notify();
}

export function reorderList(listId, orderedCardIds) {
  orderedCardIds.forEach((cardId, idx) => {
    const card = getCard(cardId);
    if (card) {
      card.order = idx;
      writeCardImmediate(card);
    }
  });
  notify();
}

export function deleteCard(id) {
  const card = getCard(id);
  if (!card) return;
  ctx.cards = ctx.cards.filter(c => c.id !== id);
  // Clean up dangling relationships pointing at the deleted card.
  for (const c of ctx.cards) {
    if (!c.relationships) continue;
    const before = c.relationships.length;
    c.relationships = c.relationships.filter(r => r.targetCardId !== id);
    if (c.relationships.length !== before) writeCardImmediate(c);
  }
  fsLayer.deleteCard(ctx, card).catch(err => console.error('Failed to delete card file', id, err));
  if (focusedCardId === id) focusedCardId = null;
  notify();
}

export function duplicateCard(id, { deep = true } = {}) {
  const original = getCard(id);
  if (!original) return null;
  const clone = structuredClone(original);
  clone.id = genId('card');
  clone.title = `${original.title} (copy)`;
  clone.order = (original.order ?? 0) + 0.5; // sits just after original; re-sort will normalize
  if (!deep) {
    clone.checklist = [];
    clone.customFields = {};
    clone.relationships = [];
  }
  ctx.cards.push(clone);
  normalizeOrders(clone.listId);
  writeCardImmediate(clone);
  notify();
  return clone;
}

function normalizeOrders(listId) {
  const cards = ctx.cards.filter(c => c.listId === listId).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  cards.forEach((c, idx) => { c.order = idx; });
}

export function addRelationship(cardId, targetCardId, type) {
  const card = getCard(cardId);
  if (!card) return;
  card.relationships = card.relationships || [];
  if (card.relationships.some(r => r.targetCardId === targetCardId && r.type === type)) return;
  card.relationships.push({ targetCardId, type });
  writeCardImmediate(card);

  // Mirror the inverse relationship on the target card for bidirectional pairs.
  const inverse = inverseRelationType(type);
  if (inverse) {
    const target = getCard(targetCardId);
    if (target) {
      target.relationships = target.relationships || [];
      if (!target.relationships.some(r => r.targetCardId === cardId && r.type === inverse)) {
        target.relationships.push({ targetCardId: cardId, type: inverse });
        writeCardImmediate(target);
      }
    }
  }
  notify();
}

export function removeRelationship(cardId, targetCardId, type) {
  const card = getCard(cardId);
  if (!card) return;
  card.relationships = (card.relationships || []).filter(r => !(r.targetCardId === targetCardId && r.type === type));
  writeCardImmediate(card);

  const inverse = inverseRelationType(type);
  if (inverse) {
    const target = getCard(targetCardId);
    if (target) {
      target.relationships = (target.relationships || []).filter(r => !(r.targetCardId === cardId && r.type === inverse));
      writeCardImmediate(target);
    }
  }
  notify();
}

function inverseRelationType(type) {
  return { blockedBy: 'blocks', blocks: 'blockedBy', childOf: 'parentOf', parentOf: 'childOf', relatesTo: 'relatesTo' }[type] || null;
}

// ---- Templates ---------------------------------------------------------------

export function saveAsTemplate(cardId, templateName) {
  const card = getCard(cardId);
  if (!card) return null;
  const template = structuredClone(card);
  template.id = genId('template');
  template.templateName = templateName;
  delete template.listId;
  delete template.order;
  delete template.relationships;
  ctx.templates.push(template);
  fsLayer.writeTemplate(ctx, template).catch(err => console.error('Failed to write template', err));
  notify();
  return template;
}

export function deleteTemplate(id) {
  const template = ctx.templates.find(t => t.id === id);
  if (!template) return;
  ctx.templates = ctx.templates.filter(t => t.id !== id);
  fsLayer.deleteTemplate(ctx, template).catch(err => console.error('Failed to delete template file', err));
  notify();
}

// ---- Lists / labels / board settings -------------------------------------

export function addList(title) {
  const order = ctx.board.lists.length ? Math.max(...ctx.board.lists.map(l => l.order)) + 1 : 0;
  const list = { id: genId('list'), title, wipLimit: 0, order, isDoneColumn: false };
  ctx.board.lists.push(list);
  fsLayer.saveBoardJson(ctx, ctx.board);
  notify();
  return list;
}

export function updateList(id, patch) {
  const list = ctx.board.lists.find(l => l.id === id);
  if (!list) return;
  Object.assign(list, patch);
  fsLayer.saveBoardJson(ctx, ctx.board);
  notify();
}

export function deleteList(id) {
  ctx.board.lists = ctx.board.lists.filter(l => l.id !== id);
  const orphaned = ctx.cards.filter(c => c.listId === id);
  for (const card of orphaned) deleteCard(card.id);
  fsLayer.saveBoardJson(ctx, ctx.board);
  notify();
}

export function reorderLists(orderedListIds) {
  orderedListIds.forEach((id, idx) => {
    const list = ctx.board.lists.find(l => l.id === id);
    if (list) list.order = idx;
  });
  fsLayer.saveBoardJson(ctx, ctx.board);
  notify();
}

export function updateTheme(patch) {
  ctx.board.theme = { ...ctx.board.theme, ...patch };
  fsLayer.saveBoardJson(ctx, ctx.board);
  notify();
}

export function addLabel(name, color) {
  const label = { id: genId('label'), name, color };
  ctx.board.labels.push(label);
  fsLayer.saveBoardJson(ctx, ctx.board);
  notify();
  return label;
}

export function addCustomField(name, type, options = []) {
  const field = { id: genId('field'), name, type, options };
  ctx.fields.push(field);
  fsLayer.saveFieldsJson(ctx, ctx.fields);
  notify();
  return field;
}

// ---- Focus (for keyboard navigation) -----------------------------------

export function getFocusedCardId() {
  return focusedCardId;
}

export function setFocusedCardId(id) {
  focusedCardId = id;
  notify();
}
