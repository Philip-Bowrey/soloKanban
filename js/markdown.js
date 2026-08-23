/**
 * SoloKanban Markdown Parser & Renderer
 * Lightweight, safe Markdown renderer with section parsing and security escaping.
 */

/**
 * Escapes raw HTML tags to prevent XSS.
 * @param {string} text 
 * @returns {string}
 */
export function escapeHtml(text) {
  if (typeof text !== 'string') return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Renders Markdown text to HTML.
 * @param {string} mdText 
 * @returns {string}
 */
export function renderMarkdown(mdText) {
  if (!mdText || typeof mdText !== 'string') return '';
  const lines = mdText.split('\n');
  const htmlLines = [];
  let inList = false;

  for (let line of lines) {
    const trimmed = line.trim();

    // Check lists
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      if (!inList) {
        htmlLines.push('<ul>');
        inList = true;
      }
      const itemContent = renderInline(trimmed.substring(2));
      htmlLines.push(`<li>${itemContent}</li>`);
      continue;
    } else if (inList) {
      htmlLines.push('</ul>');
      inList = false;
    }

    if (!trimmed) {
      continue;
    }

    // Headings
    if (line.startsWith('### ')) {
      htmlLines.push(`<h3>${renderInline(line.substring(4))}</h3>`);
    } else if (line.startsWith('## ')) {
      htmlLines.push(`<h2>${renderInline(line.substring(3))}</h2>`);
    } else if (line.startsWith('# ')) {
      htmlLines.push(`<h1>${renderInline(line.substring(2))}</h1>`);
    } else if (line.startsWith('> ')) {
      htmlLines.push(`<blockquote>${renderInline(line.substring(2))}</blockquote>`);
    } else {
      htmlLines.push(`<p>${renderInline(line)}</p>`);
    }
  }

  if (inList) {
    htmlLines.push('</ul>');
  }

  return htmlLines.join('\n');
}

/**
 * Render inline markdown elements (bold, italic, code, links).
 * @param {string} text 
 * @returns {string}
 */
export function renderInline(text) {
  let escaped = escapeHtml(text);

  // Links: [label](url)
  escaped = escaped.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, label, url) => {
    // Only allow safe protocols
    if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('#') || url.startsWith('file://')) {
      return `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`;
    }
    return label;
  });

  // Bold **text** or __text__
  escaped = escaped.replace(/(\*\*|__)(.*?)\1/g, '<strong>$2</strong>');

  // Italic *text* or _text_
  escaped = escaped.replace(/(\*|_)(.*?)\1/g, '<em>$2</em>');

  // Inline code `code`
  escaped = escaped.replace(/`([^`]+)`/g, '<code>$1</code>');

  return escaped;
}

/**
 * Splits a Markdown body into structured sections by `## Header` titles.
 * @param {string} body 
 * @returns {{ sections: Array<{ id: string, title: string, content: string }>, activityLog: string }}
 */
export function parseBodySections(body) {
  if (typeof body !== 'string') return { sections: [], activityLog: '' };
  
  const lines = body.split('\n');
  const sections = [];
  let currentSection = { id: '_default', title: '', lines: [] };
  let activityLogLines = [];
  let inActivityLog = false;

  for (const line of lines) {
    if (line.startsWith('## ')) {
      const headerTitle = line.substring(3).trim();

      // Save previous section if not empty
      if (currentSection.lines.length > 0 || currentSection.title) {
        if (inActivityLog) {
          activityLogLines = currentSection.lines;
        } else {
          sections.push({
            id: currentSection.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
            title: currentSection.title,
            content: currentSection.lines.join('\n').trim()
          });
        }
      }

      if (headerTitle.toLowerCase() === 'activity log') {
        inActivityLog = true;
        currentSection = { id: 'activity-log', title: 'Activity Log', lines: [] };
      } else {
        inActivityLog = false;
        currentSection = {
          id: headerTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
          title: headerTitle,
          lines: []
        };
      }
    } else {
      currentSection.lines.push(line);
    }
  }

  // Push last section
  if (currentSection.lines.length > 0 || currentSection.title) {
    if (inActivityLog) {
      activityLogLines = currentSection.lines;
    } else {
      sections.push({
        id: currentSection.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
        title: currentSection.title,
        content: currentSection.lines.join('\n').trim()
      });
    }
  }

  return {
    sections,
    activityLog: activityLogLines.join('\n').trim()
  };
}

/**
 * Appends an entry to the Activity Log section, ensuring Activity Log remains terminal.
 * @param {string} body 
 * @returns {string}
 */
export function appendActivityLog(body, entry) {
  const { sections, activityLog } = parseBodySections(body);

  const timestamp = new Date().toISOString();
  const newLogLine = `- [${timestamp}] ${entry}`;

  const updatedLog = activityLog ? `${activityLog}\n${newLogLine}` : newLogLine;

  const bodyParts = [];
  for (const sec of sections) {
    if (sec.title) {
      bodyParts.push(`## ${sec.title}`);
    }
    if (sec.content) {
      bodyParts.push(sec.content);
    }
    bodyParts.push('');
  }

  bodyParts.push('## Activity Log');
  bodyParts.push(updatedLog);

  return bodyParts.join('\n').trim();
}
