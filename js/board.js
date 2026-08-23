/**
 * SoloKanban Kanban Board Component
 * Renders lists, swimlanes, WIP limits, column stats, list dividers, and collapsed columns.
 */

import { renderCardFace } from './card-render.js';
import { escapeHtml } from './markdown.js';
import { DEFAULT_WORKSPACE_CONFIG, DEFAULT_PROJECT_CONFIG } from './defaults.js';

export function getListEmoji(listName = '', listId = '') {
  const lower = `${listName} ${listId}`.toLowerCase();
  if (lower.includes('backlog') || lower.includes('inbox')) return '📥';
  if (lower.includes('idea') || lower.includes('plan')) return '💡';
  if (lower.includes('progress') || lower.includes('active') || lower.includes('doing')) return '⚡';
  if (lower.includes('done') || lower.includes('delivered') || lower.includes('finished')) return '✅';
  if (lower.includes('review') || lower.includes('qa') || lower.includes('test')) return '🔍';
  if (lower.includes('discuss')) return '🗣️';
  if (lower.includes('blocked') || lower.includes('hold')) return '🛑';
  return '📋';
}

export class BoardRenderer {
  constructor(appState) {
    this.appState = appState;
  }

  /**
   * Renders board container HTML.
   * @param {HTMLElement} container 
   */
  renderBoard(container) {
    if (!container) return;
    const db = this.appState.db;
    const prefs = this.appState.preferencesManager?.preferences?.board || {};
    const collapsedLists = new Set(prefs.collapsedLists || []);
    const swimlaneBy = prefs.swimlaneBy || null;

    let config = null;
    let cardsToRender = [];

    if (this.appState.currentView === 'workspace') {
      const wsConfig = db.workspaceConfig || DEFAULT_WORKSPACE_CONFIG;
      config = {
        lists: (wsConfig.lists && wsConfig.lists.length > 0) ? wsConfig.lists : DEFAULT_WORKSPACE_CONFIG.lists,
        featureOrder: wsConfig.featureOrder || {},
        layout: wsConfig.layout || { dividers: [] }
      };
      cardsToRender = Array.from(db.cards.values()).filter(c => c.type === 'project');
    } else {
      const projId = this.appState.currentProjectId;
      const projConfig = db.projects.get(projId) || DEFAULT_PROJECT_CONFIG;
      config = {
        lists: (projConfig.lists && projConfig.lists.length > 0) ? projConfig.lists : DEFAULT_PROJECT_CONFIG.lists,
        featureOrder: projConfig.featureOrder || {},
        layout: projConfig.layout || { dividers: [] }
      };
      cardsToRender = Array.from(db.cards.values()).filter(c => c.projectId === projId && c.type !== 'project');
    }

    // Apply Filters
    cardsToRender = this.applyFilters(cardsToRender);

    if (container.style) {
      container.style.backgroundColor = prefs.background || '#0f172a';
    }

    if (this.appState.viewMode === 'list') {
      container.innerHTML = this.renderListView(config, cardsToRender);
    } else if (swimlaneBy) {
      container.innerHTML = this.renderSwimlaneView(config, cardsToRender, swimlaneBy, collapsedLists);
    } else {
      container.innerHTML = this.renderStandardView(config, cardsToRender, collapsedLists);
    }
  }

  renderListView(config, cards) {
    const lists = config.lists || [];
    const htmlSections = [];

    for (const list of lists) {
      const listCards = this.getCardsForList(list.id, cards, config);
      const emoji = getListEmoji(list.name, list.id);
      
      const rowsHtml = listCards.map(card => {
        const fm = card.frontmatter || {};
        const isDone = (fm.listId === 'done' || list.done);
        const prio = fm.priority ? `<span class="list-view-badge prio-${fm.priority.toLowerCase()}">${escapeHtml(fm.priority)}</span>` : '';
        const dueDate = fm.dueDate ? `<span class="list-view-badge date">📅 ${escapeHtml(fm.dueDate)}</span>` : '';
        const points = fm.storyPoints ? `<span class="list-view-badge points">🎯 ${escapeHtml(String(fm.storyPoints))} pts</span>` : '';
        const assignee = fm.assignee ? `<span class="list-view-avatar" title="${escapeHtml(fm.assignee)}">${fm.assignee.substring(0, 2).toUpperCase()}</span>` : '';
        const listOptions = lists.map(l => `<option value="${l.id}" ${l.id === list.id ? 'selected' : ''}>${escapeHtml(l.name || l.title || l.id)}</option>`).join('');

        return `
          <div class="list-view-row" data-card-id="${card.id}">
            <div class="list-view-cell select-cell">
              <button class="card-quick-complete-btn ${isDone ? 'is-done' : ''}" data-card-id="${card.id}">${isDone ? '✓' : '○'}</button>
            </div>
            <div class="list-view-cell title-cell">
              <span class="list-view-card-title">${escapeHtml(fm.title || card.id)}</span>
              <span class="list-view-card-id">${escapeHtml(card.id)}</span>
            </div>
            <div class="list-view-cell badges-cell">
              ${prio}
              ${dueDate}
              ${points}
            </div>
            <div class="list-view-cell move-cell">
              <select class="list-view-move-select" data-card-id="${card.id}" title="Move list">
                ${listOptions}
              </select>
            </div>
            <div class="list-view-cell avatar-cell">
              ${assignee}
            </div>
          </div>`;
      }).join('');

      htmlSections.push(`
        <div class="list-view-section" data-list-id="${list.id}">
          <div class="list-view-section-header">
            <span class="section-emoji">${emoji}</span>
            <h3 class="section-title">${escapeHtml(list.name)}</h3>
            <span class="card-count-pill">${listCards.length}</span>
            <button class="btn-add-card-header btn-icon" data-list-id="${list.id}" title="Add Card">+</button>
          </div>
          <div class="list-view-table">
            ${rowsHtml || `<div class="empty-list-view-row btn-add-card-footer" data-list-id="${list.id}">+ Add a card to ${escapeHtml(list.name)}</div>`}
          </div>
        </div>`);
    }

    return `<div class="kanban-list-view-container">${htmlSections.join('')}</div>`;
  }

  applyFilters(cards) {
    return cards.filter(card => {
      const fm = card.frontmatter || {};
      if (this.appState.filterSearch) {
        const q = this.appState.filterSearch.toLowerCase();
        const text = `${fm.title} ${card.body} ${card.id}`.toLowerCase();
        if (!text.includes(q)) return false;
      }
      if (this.appState.filterLabel && (!fm.labels || !fm.labels.includes(this.appState.filterLabel))) {
        return false;
      }
      if (this.appState.filterAssignee && fm.assignee !== this.appState.filterAssignee) {
        return false;
      }
      if (this.appState.filterType && card.type !== this.appState.filterType) {
        return false;
      }
      if (this.appState.filterPriority && fm.priority !== this.appState.filterPriority) {
        return false;
      }
      return true;
    });
  }

  renderStandardView(config, cards, collapsedLists) {
    const lists = config.lists || [];
    const dividers = config.layout?.dividers || [];
    const htmlLists = [];

    for (const list of lists) {
      const listCards = this.getCardsForList(list.id, cards, config);
      const isCollapsed = collapsedLists.has(list.id);

      htmlLists.push(this.renderListColumn(list, listCards, dividers, isCollapsed));
    }

    return `<div class="kanban-board-grid">${htmlLists.join('')}</div>`;
  }

  renderListColumn(list, listCards, dividers, isCollapsed) {
    if (isCollapsed) {
      return `
        <div class="kanban-column collapsed" data-list-id="${list.id}">
          <div class="column-header-collapsed" title="Click to expand list">
            <span class="collapsed-title">${escapeHtml(list.name)}</span>
            <span class="card-count-pill">${listCards.length}</span>
          </div>
        </div>`;
    }

    // WIP Limit checks
    let wipBadgeHtml = '';
    let isWipExceeded = false;
    let isWipNear = false;

    if (list.wipLimit) {
      const limit = Number(list.wipLimit);
      const count = listCards.length;
      if (count >= limit) isWipExceeded = true;
      else if (count >= limit * 0.8) isWipNear = true;

      const wipClass = isWipExceeded ? 'wip-exceeded' : isWipNear ? 'wip-near' : '';
      wipBadgeHtml = `<span class="wip-limit-badge ${wipClass}">${count}/${limit}</span>`;
    }

    // Customizable Column Stats (PRD §9.4)
    const boardPrefs = this.appState.preferencesManager?.preferences?.board || {};
    const configuredStats = boardPrefs.columnStats || ['count', 'points'];
    const statItems = [];

    if (configuredStats.includes('count') || configuredStats.length === 0) {
      statItems.push(`<span>${listCards.length} cards</span>`);
    }
    if (configuredStats.includes('points')) {
      const totalPoints = listCards.reduce((sum, c) => sum + (Number(c.frontmatter?.storyPoints) || 0), 0);
      if (totalPoints > 0) statItems.push(`<span>${totalPoints} pts</span>`);
    }
    if (configuredStats.includes('priority')) {
      const highPrioCount = listCards.filter(c => ['high', 'critical'].includes(String(c.frontmatter?.priority).toLowerCase())).length;
      if (highPrioCount > 0) statItems.push(`<span>⚡ ${highPrioCount} high</span>`);
    }

    const statsHtml = `<div class="column-stats">${statItems.join(' • ')}</div>`;

    // Render Cards & Dividers
    const cardElementsHtml = [];
    const listDividers = dividers.filter(d => d.listId === list.id);

    for (const card of listCards) {
      const activePresence = this.appState.activePresenceMap.get(card.id) || [];
      const cardHtml = renderCardFace(card, {
        labels: this.appState.db.labels,
        fields: this.appState.db.fields,
        featureTypes: this.appState.db.featureTypes,
        preferences: this.appState.preferencesManager?.preferences,
        activePresence,
        searchQuery: this.appState.filterSearch
      });

      cardElementsHtml.push(`<div class="kanban-card-wrapper" data-card-id="${card.id}">${cardHtml}</div>`);

      // Check if divider exists after this card
      const divider = listDividers.find(d => d.afterCardId === card.id);
      if (divider) {
        cardElementsHtml.push(`<div class="list-divider" data-divider-id="${divider.id}"><hr/></div>`);
      }
    }

    if (cardElementsHtml.length === 0) {
      cardElementsHtml.push(`<div class="empty-column-placeholder btn-add-card-footer" data-list-id="${list.id}">+ Add a card to ${escapeHtml(list.name)}</div>`);
    }

    return `
      <div class="kanban-column" data-list-id="${list.id}">
        <div class="column-header">
          <div class="column-title-bar">
            <div class="column-title-left">
              <span class="column-emoji">${getListEmoji(list.name, list.id)}</span>
              <h3 class="column-title">${escapeHtml(list.name)}</h3>
              <span class="card-count-pill">${listCards.length}</span>
            </div>
            <div class="column-actions">
              ${wipBadgeHtml}
              <button class="btn-icon btn-add-card-header" data-list-id="${list.id}" title="Add Card">+</button>
              <button class="btn-icon collapse-list-btn" data-list-id="${list.id}" title="Collapse column">◀</button>
            </div>
          </div>
          ${statsHtml}
        </div>

        <div class="column-cards-container" data-list-id="${list.id}">
          ${cardElementsHtml.join('')}
        </div>

        <div class="column-footer">
          <button class="btn-add-card-footer" data-list-id="${list.id}">+ Add Card</button>
        </div>
      </div>`;
  }

  renderSwimlaneView(config, cards, swimlaneBy, collapsedLists) {
    const lists = config.lists || [];
    const groups = new Map();

    for (const card of cards) {
      let groupKey = 'Unassigned';
      const fm = card.frontmatter || {};
      if (swimlaneBy === 'assignee') groupKey = fm.assignee || 'Unassigned';
      else if (swimlaneBy === 'priority') groupKey = fm.priority || 'No Priority';
      else if (swimlaneBy === 'type') groupKey = card.type || 'Default';

      if (!groups.has(groupKey)) {
        groups.set(groupKey, []);
      }
      groups.get(groupKey).push(card);
    }

    const htmlRows = [];
    for (const [groupName, groupCards] of groups.entries()) {
      const rowColumns = [];
      for (const list of lists) {
        const listCards = groupCards.filter(c => (c.frontmatter?.listId || 'backlog') === list.id);
        rowColumns.push(this.renderListColumn(list, listCards, [], false));
      }

      htmlRows.push(`
        <div class="swimlane-row">
          <div class="swimlane-header"><h4>${escapeHtml(groupName)}</h4></div>
          <div class="swimlane-grid">${rowColumns.join('')}</div>
        </div>`);
    }

    return `<div class="kanban-swimlane-container">${htmlRows.join('')}</div>`;
  }

  getCardsForList(listId, cards, config) {
    const featureOrder = config.featureOrder?.[listId] || [];
    const cardMap = new Map(cards.map(c => [c.id, c]));

    const orderedCards = [];
    for (const cardId of featureOrder) {
      if (cardMap.has(cardId)) {
        orderedCards.push(cardMap.get(cardId));
        cardMap.delete(cardId);
      }
    }

    // Add any remaining cards assigned to listId
    for (const card of cardMap.values()) {
      if ((card.frontmatter?.listId || 'backlog') === listId) {
        orderedCards.push(card);
      }
    }

    return orderedCards;
  }
}
