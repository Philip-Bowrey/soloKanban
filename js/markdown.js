// Minimal, dependency-free Markdown -> HTML renderer.
// Supports: headings, bold/italic, inline code, fenced code blocks, links,
// unordered/ordered lists, checkboxes ([ ] / [x]), blockquotes, paragraphs.
// Not a full CommonMark implementation — deliberately small, matching the
// subset of Markdown SoloKanban card descriptions actually need.

export function renderMarkdown(src) {
  if (!src) return '';
  const escaped = escapeHtml(src);
  const lines = escaped.split('\n');
  const html = [];
  let i = 0;
  let inCode = false;
  let codeLines = [];
  let listStack = []; // { type: 'ul'|'ol' }

  function closeLists() {
    while (listStack.length) {
      html.push(`</${listStack.pop().type}>`);
    }
  }

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code blocks
    if (/^```/.test(line)) {
      if (!inCode) {
        closeLists();
        inCode = true;
        codeLines = [];
      } else {
        inCode = false;
        html.push(`<pre><code>${codeLines.join('\n')}</code></pre>`);
      }
      i++;
      continue;
    }
    if (inCode) {
      codeLines.push(line);
      i++;
      continue;
    }

    // Blank line
    if (line.trim() === '') {
      closeLists();
      i++;
      continue;
    }

    // Headings
    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      closeLists();
      const level = headingMatch[1].length;
      html.push(`<h${level}>${inline(headingMatch[2])}</h${level}>`);
      i++;
      continue;
    }

    // Blockquote
    if (/^&gt;\s?/.test(line)) {
      closeLists();
      const quoteLines = [];
      while (i < lines.length && /^&gt;\s?/.test(lines[i])) {
        quoteLines.push(lines[i].replace(/^&gt;\s?/, ''));
        i++;
      }
      html.push(`<blockquote>${inline(quoteLines.join(' '))}</blockquote>`);
      continue;
    }

    // Checkbox list item
    const checkMatch = line.match(/^[-*]\s+\[( |x|X)\]\s+(.*)$/);
    if (checkMatch) {
      if (listStack.length === 0 || listStack[listStack.length - 1].type !== 'ul') {
        closeLists();
        html.push('<ul class="md-checklist">');
        listStack.push({ type: 'ul' });
      }
      const checked = /x/i.test(checkMatch[1]);
      html.push(`<li class="md-check-item"><input type="checkbox" disabled ${checked ? 'checked' : ''}/> <span>${inline(checkMatch[2])}</span></li>`);
      i++;
      continue;
    }

    // Unordered list item
    const ulMatch = line.match(/^[-*]\s+(.*)$/);
    if (ulMatch) {
      if (listStack.length === 0 || listStack[listStack.length - 1].type !== 'ul') {
        closeLists();
        html.push('<ul>');
        listStack.push({ type: 'ul' });
      }
      html.push(`<li>${inline(ulMatch[1])}</li>`);
      i++;
      continue;
    }

    // Ordered list item
    const olMatch = line.match(/^\d+\.\s+(.*)$/);
    if (olMatch) {
      if (listStack.length === 0 || listStack[listStack.length - 1].type !== 'ol') {
        closeLists();
        html.push('<ol>');
        listStack.push({ type: 'ol' });
      }
      html.push(`<li>${inline(olMatch[1])}</li>`);
      i++;
      continue;
    }

    // Paragraph (collect consecutive plain lines)
    closeLists();
    const paraLines = [line];
    i++;
    while (i < lines.length && lines[i].trim() !== '' && !isBlockStart(lines[i])) {
      paraLines.push(lines[i]);
      i++;
    }
    html.push(`<p>${inline(paraLines.join(' '))}</p>`);
  }

  if (inCode && codeLines.length) {
    html.push(`<pre><code>${codeLines.join('\n')}</code></pre>`);
  }
  closeLists();
  return html.join('\n');
}

function isBlockStart(line) {
  return /^#{1,6}\s/.test(line) || /^```/.test(line) || /^[-*]\s/.test(line) || /^\d+\.\s/.test(line) || /^&gt;\s?/.test(line);
}

function inline(text) {
  return text
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
