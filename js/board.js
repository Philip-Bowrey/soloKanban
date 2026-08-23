/**
 * SoloKanban Kanban Board Component
 * Renders lists, swimlanes, WIP limits, column stats, list dividers, and collapsed columns.
 */

import { renderCardFace } from './card-render.js';
import { escapeHtml } from './markdown.js';

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
      config = {
        lists: [
          { id: 'backlog', name: 'Backlog' },
          { id: 'in-progress', name: 'In Progress' },
          { id: 'done', name: 'Done', done: true }
        ],
        layout: { dividers: [] }
      };
      cardsToRender = Array.from(db.cards.values()).filter(c => c.type === 'project');
    } else {
      const projId = this.appState.currentProjectId;
      config = db.projects.get(projId) || {
        lists: [
          { id: 'backlog', name: 'Backlog' },
          { id: 'in-progress', name: 'In Progress' },
          { id: 'done', name: 'Done', done: true }
        ],
        featureOrder: {},
        layout: { dividers: [] }
      };
      cardsToRender = Array.from(db.cards.values()).filter(c => c.projectId === projId && c.type !== 'project');
    }

    // Apply Filters
    cardsToRender = this.applyFilters(cardsToRender);

    container.style.backgroundColor = prefs.background || '#0f172a';

    if (swimlaneBy) {
      container.innerHTML = this.renderSwimlaneView(config, cardsToRender, swimlaneBy, collapsedLists);
    } else {
      container.innerHTML = this.renderStandardView(config, cardsToRender, collapsedLists);
    }
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

    // Column Stats
    const totalPoints = listCards.reduce((sum, c) => sum + (Number(c.frontmatter?.storyPoints) || 0), 0);
    const statsHtml = `<div class="column-stats"><span>${listCards.length} cards</span>${totalPoints > 0 ? ` • <span>${totalPoints} pts</span>` : ''}</div>`;

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
        activePresence
      });

      cardElementsHtml.push(`<div class="kanban-card-wrapper" data-card-id="${card.id}">${cardHtml}</div>`);

      // Check if divider exists after this card
      const divider = listDividers.find(d => d.afterCardId === card.id);
      if (divider) {
        cardElementsHtml.push(`<div class="list-divider" data-divider-id="${divider.id}"><hr/></div>`);
      }
    }

    return `
      <div class="kanban-column" data-list-id="${list.id}">
        <div class="column-header">
          <div class="column-title-bar">
            <h3 class="column-title">${escapeHtml(list.name)}</h3>
            ${wipBadgeHtml}
            <button class="btn-icon collapse-list-btn" title="Collapse column">◀</button>
          </div>
          ${statsHtml}
        </div>

        <div class="column-cards-container" data-list-id="${list.id}">
          ${cardElementsHtml.join('')}
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

      if (!groups.has(groupKey)) groups.clear ? groups.set(groupKey, []) : null;
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
