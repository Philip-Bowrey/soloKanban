/**
 * SoloKanban Card Face Renderer
 * Modern, rich card face rendering with covers, badges, visual precedence rules, and presence tooltips.
 */

import { parseChecklist, calculateProgress, calculateSubtaskStats } from './checklist.js';
import { escapeHtml } from './markdown.js';

/**
 * Render complete HTML string for a card face.
 * @param {Object} card 
 * @param {Object} context 
 * @param {Array} context.labels 
 * @param {Array} context.fields 
 * @param {Array} context.featureTypes 
 * @param {Object} context.preferences 
 * @param {Array} context.activePresence 
 * @returns {string} HTML string
 */
export function renderCardFace(card, context = {}) {
  const fm = card.frontmatter || {};
  const labelsMap = new Map((context.labels || []).map(l => [l.id, l]));
  const fieldsMap = new Map((context.fields || []).map(f => [f.key, f]));
  const typesMap = new Map((context.featureTypes || []).map(t => [t.id, t]));
  const cardPrefs = context.preferences?.card || {};
  const activePresence = context.activePresence || [];

  const cardType = typesMap.get(card.type) || { name: card.type || 'Feature', color: '#0984e3' };

  // Calculate Due Date & Aging status
  const dateStatus = getDueDateStatus(fm.dueDate, fm.meta?.updatedAt, cardPrefs.staleAfterDays || 7);

  // Parse Checklist
  const checklistItems = parseChecklist(card.body || '');
  const progress = calculateProgress(checklistItems);
  const subtaskStats = calculateSubtaskStats(checklistItems);

  // Cover Banner
  let coverHtml = '';
  if (fm.cover) {
    if (fm.cover.startsWith('http') || fm.cover.startsWith('data:')) {
      coverHtml = `<div class="card-cover-image" style="background-image: url('${escapeHtml(fm.cover)}');"></div>`;
    } else {
      coverHtml = `<div class="card-cover-banner" style="background-color: ${escapeHtml(fm.cover)};"></div>`;
    }
  }

  // Label chips (v8.3: Omit deleted labels from card face render!)
  const labelChipsHtml = (fm.labels || [])
    .filter(lblId => labelsMap.has(lblId)) // Omit deleted label IDs
    .map(lblId => {
      const lbl = labelsMap.get(lblId);
      return `<span class="card-label-chip" style="background-color: ${lbl.color};">${escapeHtml(lbl.name)}</span>`;
    })
    .join('');

  // Priority Flag (Jira style)
  let priorityHtml = '';
  if (fm.priority) {
    const prio = String(fm.priority).toLowerCase();
    const prioClass = prio === 'critical' ? 'prio-critical' : prio === 'high' ? 'prio-high' : prio === 'medium' ? 'prio-medium' : 'prio-low';
    const prioIcon = prio === 'critical' ? '🔥' : prio === 'high' ? '⚡' : prio === 'medium' ? '▲' : '▼';
    priorityHtml = `<span class="card-priority-badge ${prioClass}" title="Priority: ${escapeHtml(fm.priority)}">${prioIcon} ${escapeHtml(fm.priority)}</span>`;
  }

  // Due Date Badge & Stale Badge (Visual hierarchy: Overdue red takes precedence over stale yellow)
  let dateBadgeHtml = '';
  if (dateStatus.isOverdue) {
    dateBadgeHtml = `<span class="card-date-badge overdue" title="Overdue">${escapeHtml(dateStatus.label)}</span>`;
  } else if (dateStatus.isDueSoon) {
    dateBadgeHtml = `<span class="card-date-badge due-soon" title="Due soon">${escapeHtml(dateStatus.label)}</span>`;
  } else if (dateStatus.isStale && cardPrefs.staleAfterDays) {
    dateBadgeHtml = `<span class="card-date-badge stale" title="Stale card">${escapeHtml(dateStatus.staleLabel)}</span>`;
  } else if (dateStatus.label) {
    dateBadgeHtml = `<span class="card-date-badge" title="Due date">${escapeHtml(dateStatus.label)}</span>`;
  }

  // Story Points Badge
  let storyPointsHtml = '';
  if (fm.storyPoints && cardPrefs.showStoryPoints !== false) {
    storyPointsHtml = `<span class="card-story-badge" title="Story Points">${escapeHtml(String(fm.storyPoints))} pts</span>`;
  }

  // Subtask & Checklist Badges
  let subtaskBadgeHtml = '';
  if (subtaskStats.total > 0 && cardPrefs.showSubtaskBadge !== false) {
    subtaskBadgeHtml = `<span class="card-subtask-badge" title="Subtask progress">☑ ${subtaskStats.completed}/${subtaskStats.total}</span>`;
  }

  // Checklist Progress Ring
  let progressRingHtml = '';
  if (progress.total > 0) {
    const dashoffset = 100 - progress.percentage;
    progressRingHtml = `
      <div class="card-progress-ring" title="Top-level progress: ${progress.percentage}%">
        <svg viewBox="0 0 36 36">
          <path class="ring-bg" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"/>
          <path class="ring-fill" stroke-dasharray="100, 100" stroke-dashoffset="${dashoffset}" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"/>
        </svg>
      </div>`;
  }

  // Custom Field Chips
  const customFieldChips = [];
  for (const [key, fieldDef] of fieldsMap.entries()) {
    if (fieldDef.cardVisible && fm[key] !== undefined && fm[key] !== null) {
      let valDisplay = String(fm[key]);
      let chipColor = '#475569';

      if (fieldDef.options && Array.isArray(fieldDef.options)) {
        const opt = fieldDef.options.find(o => o.value === fm[key] || o.label === fm[key]);
        if (opt && opt.color) chipColor = opt.color;
      }

      customFieldChips.push(`<span class="card-custom-chip" style="background-color: ${chipColor};">${escapeHtml(fieldDef.label)}: ${escapeHtml(valDisplay)}</span>`);
    }
  }

  // Live Agent Status Badge & Tooltip (PRD §10.12)
  let agentBadgeHtml = '';
  if (activePresence.length > 0 && cardPrefs.showAgentBadge !== false) {
    const primaryActor = activePresence[0];
    const tooltipText = activePresence
      .map(p => `${escapeHtml(p.actor)} — ${escapeHtml(p.intent || 'editing')}`)
      .join('\n');

    agentBadgeHtml = `
      <div class="card-agent-badge" title="${tooltipText}">
        <span class="pulsing-dot"></span>
        <span class="agent-name">${escapeHtml(primaryActor.actor)}</span>
      </div>`;
  }

  // Owner / Assignee Avatar
  let avatarHtml = '';
  const owner = fm.assignee || fm.owner;
  if (owner && cardPrefs.showAvatar !== false) {
    const initials = owner.substring(0, 2).toUpperCase();
    avatarHtml = `<span class="card-avatar" title="Assigned to ${escapeHtml(owner)}">${initials}</span>`;
  }

  return `
    <div class="card-face" data-card-id="${card.id}">
      ${coverHtml}
      <div class="card-header-bar">
        <span class="card-type-tag" style="background-color: ${cardType.color};">${escapeHtml(cardType.name)}</span>
        <span class="card-id-tag">${escapeHtml(card.id)}</span>
        ${agentBadgeHtml}
      </div>

      ${labelChipsHtml ? `<div class="card-labels-container">${labelChipsHtml}</div>` : ''}

      <div class="card-title">${escapeHtml(fm.title || card.id)}</div>

      ${customFieldChips.length > 0 ? `<div class="card-custom-fields-container">${customFieldChips.join('')}</div>` : ''}

      <div class="card-footer-bar">
        <div class="card-footer-left">
          ${priorityHtml}
          ${dateBadgeHtml}
          ${storyPointsHtml}
          ${subtaskBadgeHtml}
        </div>
        <div class="card-footer-right">
          ${progressRingHtml}
          ${avatarHtml}
        </div>
      </div>
    </div>`;
}

/**
 * Calculates due date countdown label and stale indicator.
 */
export function getDueDateStatus(dueDateStr, updatedAtStr, staleDays = 7) {
  const result = {
    label: '',
    isOverdue: false,
    isDueSoon: false,
    isStale: false,
    staleLabel: ''
  };

  const now = new Date();

  if (dueDateStr) {
    const due = new Date(dueDateStr);
    if (!isNaN(due.getTime())) {
      const diffMs = due.getTime() - now.getTime();
      const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

      if (diffDays < 0) {
        result.isOverdue = true;
        result.label = `Overdue by ${Math.abs(diffDays)}d`;
      } else if (diffDays === 0) {
        result.isDueSoon = true;
        result.label = 'Due today';
      } else if (diffDays <= 3) {
        result.isDueSoon = true;
        result.label = `Due in ${diffDays}d`;
      } else {
        result.label = `Due ${dueDateStr}`;
      }
    }
  }

  if (updatedAtStr) {
    const updated = new Date(updatedAtStr);
    if (!isNaN(updated.getTime())) {
      const staleMs = now.getTime() - updated.getTime();
      const staleDaysActual = Math.floor(staleMs / (1000 * 60 * 60 * 24));
      if (staleDaysActual >= staleDays) {
        result.isStale = true;
        result.staleLabel = `Stale (${staleDaysActual}d)`;
      }
    }
  }

  return result;
}
