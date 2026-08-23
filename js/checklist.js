/**
 * SoloKanban Checklist Parser & Serializer
 * Supports nested checklists, top-level-only progress tracking, and exact-indentation roundtrips.
 */

/**
 * @typedef {Object} ChecklistItem
 * @property {string} text
 * @property {boolean} completed
 * @property {number} indentDepth
 * @property {ChecklistItem[]} children
 */

/**
 * Parses checklist text into a hierarchical tree of items.
 * @param {string} checklistText 
 * @returns {ChecklistItem[]} Top-level checklist items
 */
export function parseChecklist(checklistText) {
  if (!checklistText || typeof checklistText !== 'string') return [];
  const lines = checklistText.split('\n');

  const rootItems = [];
  const itemStack = []; // { item, depth }

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Match list item with checkbox: e.g. "- [ ] item" or "  * [x] item"
    const match = line.match(/^(\s*)[-*]\s*\[([ xX])\]\s*(.*)$/);
    if (!match) continue;

    const indentSpaces = match[1].length;
    const depth = Math.floor(indentSpaces / 2);
    const completed = match[2].toLowerCase() === 'x';
    const text = match[3].trim();

    const item = {
      text,
      completed,
      indentDepth: depth,
      children: []
    };

    // Find parent in stack
    while (itemStack.length > 0 && itemStack[itemStack.length - 1].depth >= depth) {
      itemStack.pop();
    }

    if (itemStack.length === 0) {
      rootItems.push(item);
    } else {
      itemStack[itemStack.length - 1].item.children.push(item);
    }

    itemStack.push({ item, depth });
  }

  return rootItems;
}

/**
 * Serializes a tree of checklist items back to Markdown checklist text.
 * @param {ChecklistItem[]} items 
 * @param {number} depth 
 * @returns {string}
 */
export function serializeChecklist(items, depth = 0) {
  if (!Array.isArray(items) || items.length === 0) return '';
  const lines = [];
  const indent = '  '.repeat(depth);

  for (const item of items) {
    const check = item.completed ? '[x]' : '[ ]';
    lines.push(`${indent}- ${check} ${item.text}`);
    if (item.children && item.children.length > 0) {
      lines.push(serializeChecklist(item.children, depth + 1));
    }
  }

  return lines.join('\n');
}

/**
 * Calculates completion progress for top-level checklist items only.
 * @param {ChecklistItem[]} items 
 * @returns {{ completed: number, total: number, percentage: number }}
 */
export function calculateProgress(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return { completed: 0, total: 0, percentage: 0 };
  }

  const total = items.length;
  const completed = items.filter(item => item.completed).length;
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

  return { completed, total, percentage };
}

/**
 * Calculates total sub-task counts across all nested levels.
 * @param {ChecklistItem[]} items 
 * @returns {{ completed: number, total: number }}
 */
export function calculateSubtaskStats(items) {
  if (!Array.isArray(items)) return { completed: 0, total: 0 };

  let completed = 0;
  let total = 0;

  function countRecursive(itemList) {
    for (const item of itemList) {
      total++;
      if (item.completed) completed++;
      if (item.children && item.children.length > 0) {
        countRecursive(item.children);
      }
    }
  }

  countRecursive(items);
  return { completed, total };
}
