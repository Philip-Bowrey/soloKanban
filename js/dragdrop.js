/**
 * SoloKanban Drag-and-Drop Handler
 */

import { computeContentHash } from './hash.js';
import { serializeCardFile } from './yaml.js';
import { appendActivityLog } from './markdown.js';

export class DragDropHandler {
  constructor(appState, onMoveComplete) {
    this.appState = appState;
    this.onMoveComplete = onMoveComplete;
    this.draggedCardId = null;
  }

  attachListeners(boardContainer) {
    if (!boardContainer) return;

    boardContainer.querySelectorAll('.kanban-card-wrapper').forEach(cardEl => {
      cardEl.setAttribute('draggable', 'true');

      cardEl.addEventListener('dragstart', (e) => {
        this.draggedCardId = cardEl.dataset.cardId;
        cardEl.classList.add('dragging');
        e.dataTransfer.setData('text/plain', this.draggedCardId);
        e.dataTransfer.effectAllowed = 'move';
      });

      cardEl.addEventListener('dragend', () => {
        cardEl.classList.remove('dragging');
        this.draggedCardId = null;
      });
    });

    boardContainer.querySelectorAll('.column-cards-container').forEach(colEl => {
      colEl.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        colEl.classList.add('drag-over');
      });

      colEl.addEventListener('dragleave', () => {
        colEl.classList.remove('drag-over');
      });

      colEl.addEventListener('drop', async (e) => {
        e.preventDefault();
        colEl.classList.remove('drag-over');

        const cardId = e.dataTransfer.getData('text/plain') || this.draggedCardId;
        const targetListId = colEl.dataset.listId;

        if (cardId && targetListId) {
          await this.moveCardToList(cardId, targetListId);
        }
      });
    });
  }

  async moveCardToList(cardId, targetListId) {
    const card = this.appState.db.cards.get(cardId);
    if (!card) return;

    const sourceListId = card.frontmatter.listId || 'backlog';
    if (sourceListId === targetListId) return;

    const projectId = card.projectId;
    const projConfig = this.appState.db.projects.get(projectId) || { lists: [], featureOrder: {} };

    const oldFeatureOrder = JSON.parse(JSON.stringify(projConfig.featureOrder || {}));

    // 1. Update project.json featureOrder
    if (!projConfig.featureOrder[sourceListId]) projConfig.featureOrder[sourceListId] = [];
    if (!projConfig.featureOrder[targetListId]) projConfig.featureOrder[targetListId] = [];

    projConfig.featureOrder[sourceListId] = projConfig.featureOrder[sourceListId].filter(id => id !== cardId);
    if (!projConfig.featureOrder[targetListId].includes(cardId)) {
      projConfig.featureOrder[targetListId].push(cardId);
    }

    try {
      await this.appState.fsAdapter.writeFile(`${projectId}/project.json`, JSON.stringify(projConfig, null, 2));
    } catch (err) {
      return; // project.json write failed
    }

    // 2. Update Card File
    try {
      card.frontmatter.listId = targetListId;
      card.frontmatter.meta = card.frontmatter.meta || {};
      card.frontmatter.meta.revision = (card.frontmatter.meta.revision || 1) + 1;
      card.frontmatter.meta.updatedAt = new Date().toISOString();

      const isDoneList = (projConfig.lists || []).find(l => l.id === targetListId)?.done === true;
      if (isDoneList) {
        card.frontmatter.meta.deliveredAt = new Date().toISOString();
      } else {
        delete card.frontmatter.meta.deliveredAt;
      }

      card.body = appendActivityLog(card.body, `Moved card from ${sourceListId} to ${targetListId}`);
      card.frontmatter.meta.contentHash = await computeContentHash(card.frontmatter, card.body);

      const fileContent = serializeCardFile(card.frontmatter, card.body);
      await this.appState.fsAdapter.writeFile(card._filePath, fileContent);
    } catch (err) {
      // Compensating Rollback: restore old featureOrder in project.json
      projConfig.featureOrder = oldFeatureOrder;
      await this.appState.fsAdapter.writeFile(`${projectId}/project.json`, JSON.stringify(projConfig, null, 2)).catch(() => {});
      return;
    }

    if (this.onMoveComplete) this.onMoveComplete();
  }
}
