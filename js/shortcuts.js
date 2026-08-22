// Global keyboard shortcut layer. A single keydown listener with a guard
// that bails out whenever an input/textarea/contenteditable element is
// focused, so normal typing is never hijacked.

import * as state from './state.js';
import { openCardModal, closeModal, isModalOpen, getCurrentCardId } from './modal.js';

const cheatSheet = document.getElementById('cheat-sheet');
const searchInput = document.getElementById('search-input');

export function initShortcuts() {
  document.addEventListener('keydown', onKeyDown);
  document.getElementById('cheat-sheet-close').addEventListener('click', () => cheatSheet.classList.add('hidden'));
}

function isTypingTarget(el) {
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

function onKeyDown(e) {
  const ctx = state.getCtx();
  if (!ctx) return;

  if (e.key === 'Escape') {
    if (!cheatSheet.classList.contains('hidden')) { cheatSheet.classList.add('hidden'); return; }
    if (isModalOpen()) { closeModal(); return; }
    if (document.activeElement) document.activeElement.blur();
    return;
  }

  if (isTypingTarget(document.activeElement)) return;
  if (isModalOpen()) return; // modal has its own controls; avoid double-handling board shortcuts

  if (e.key === '?') {
    e.preventDefault();
    cheatSheet.classList.toggle('hidden');
    return;
  }

  if (e.key === 'n' || e.key === 'c') {
    e.preventDefault();
    const list = defaultList();
    if (list) {
      const card = state.createCard({ listId: list.id });
      openCardModal(card.id, { focusTitle: true });
    }
    return;
  }

  if (e.key === 'f' || e.key === '/') {
    e.preventDefault();
    searchInput.focus();
    return;
  }

  const focusedId = state.getFocusedCardId();

  if (['j', 'k', 'h', 'l', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
    e.preventDefault();
    moveFocus(e.key);
    return;
  }

  if ((e.key === ' ' || e.key === 'Enter') && focusedId) {
    e.preventDefault();
    openCardModal(focusedId);
    return;
  }

  if (e.key === 'e' && focusedId) {
    e.preventDefault();
    openCardModal(focusedId, { focusTitle: true });
    return;
  }

  if (e.key === 'l' && focusedId) {
    e.preventDefault();
    openCardModal(focusedId);
    return;
  }

  if (e.key === 'd' && focusedId) {
    e.preventDefault();
    openCardModal(focusedId);
    setTimeout(() => document.getElementById('due-date-input')?.focus(), 0);
    return;
  }

  if (e.key === 't' && focusedId) {
    e.preventDefault();
    const card = state.getCard(focusedId);
    if (card) {
      const name = prompt('Template name', card.title);
      if (name && name.trim()) state.saveAsTemplate(card.id, name.trim());
    }
    return;
  }

  if ((e.key === 'd' || e.key === 'D') && (e.ctrlKey || e.metaKey) && focusedId) {
    e.preventDefault();
    const clone = state.duplicateCard(focusedId, { deep: true });
    if (clone) state.setFocusedCardId(clone.id);
    return;
  }

  if ((e.key === 'Delete' || e.key === 'Backspace') && focusedId) {
    e.preventDefault();
    const card = state.getCard(focusedId);
    if (card && confirm(`Delete "${card.title}"?`)) {
      state.deleteCard(focusedId);
    }
    return;
  }
}

function defaultList() {
  const ctx = state.getCtx();
  const focusedId = state.getFocusedCardId();
  if (focusedId) {
    const card = state.getCard(focusedId);
    if (card) return ctx.board.lists.find(l => l.id === card.listId);
  }
  return [...ctx.board.lists].sort((a, b) => a.order - b.order)[0] || null;
}

function moveFocus(key) {
  const ctx = state.getCtx();
  const lists = [...ctx.board.lists].sort((a, b) => a.order - b.order);
  const focusedId = state.getFocusedCardId();
  const focusedCard = focusedId ? state.getCard(focusedId) : null;

  if (!focusedCard) {
    // Nothing focused yet: focus the first card of the first non-empty list.
    for (const list of lists) {
      const cards = state.getCardsForList(list.id);
      if (cards.length) { focusAndScroll(cards[0].id); return; }
    }
    return;
  }

  const listIdx = lists.findIndex(l => l.id === focusedCard.listId);
  const cardsInList = state.getCardsForList(focusedCard.listId);
  const cardIdx = cardsInList.findIndex(c => c.id === focusedCard.id);

  if (key === 'j' || key === 'ArrowDown') {
    const next = cardsInList[cardIdx + 1];
    if (next) focusAndScroll(next.id);
  } else if (key === 'k' || key === 'ArrowUp') {
    const prev = cardsInList[cardIdx - 1];
    if (prev) focusAndScroll(prev.id);
  } else if (key === 'l' || key === 'ArrowRight') {
    for (let i = listIdx + 1; i < lists.length; i++) {
      const cards = state.getCardsForList(lists[i].id);
      if (cards.length) { focusAndScroll(cards[Math.min(cardIdx, cards.length - 1)].id); return; }
    }
  } else if (key === 'h' || key === 'ArrowLeft') {
    for (let i = listIdx - 1; i >= 0; i--) {
      const cards = state.getCardsForList(lists[i].id);
      if (cards.length) { focusAndScroll(cards[Math.min(cardIdx, cards.length - 1)].id); return; }
    }
  }
}

function focusAndScroll(cardId) {
  state.setFocusedCardId(cardId);
  requestAnimationFrame(() => {
    const el = document.querySelector(`.card[data-card-id="${cardId}"]`);
    if (el) { el.focus(); el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
  });
}
