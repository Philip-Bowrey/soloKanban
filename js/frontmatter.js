// Minimal YAML-frontmatter parser/stringifier tailored to SoloKanban's card
// schema. Not a general YAML implementation — deliberately small and
// dependency-free, matching only the shapes SoloKanban itself writes:
// strings, numbers, booleans, flat arrays of strings ([a, b, c]), and two
// specific nested-object-array shapes (checklist items, relationships).

const FM_DELIM = '---';

/** Split a raw file's text into { frontmatter: object, body: string }. */
export function parseFile(raw) {
  if (!raw.startsWith(FM_DELIM)) {
    return { frontmatter: {}, body: raw };
  }
  const end = raw.indexOf('\n' + FM_DELIM, FM_DELIM.length);
  if (end === -1) {
    return { frontmatter: {}, body: raw };
  }
  const yamlBlock = raw.slice(FM_DELIM.length, end).trim();
  let body = raw.slice(end + (1 + FM_DELIM.length));
  // Drop a single leading newline after the closing delimiter.
  if (body.startsWith('\n')) body = body.slice(1);
  return { frontmatter: parseYamlBlock(yamlBlock), body };
}

/** Serialize { frontmatter, body } back into raw file text. */
export function stringifyFile({ frontmatter, body }) {
  const yaml = stringifyYamlBlock(frontmatter);
  return `${FM_DELIM}\n${yaml}\n${FM_DELIM}\n\n${(body || '').trim()}\n`;
}

// ---- YAML block (flat, 2-level nesting only) ----------------------------

function parseYamlBlock(yaml) {
  const lines = yaml.split('\n');
  const result = {};
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }

    const topMatch = line.match(/^(\w[\w-]*):\s*(.*)$/);
    if (!topMatch) { i++; continue; }
    const [, key, rest] = topMatch;

    if (rest.trim() === '' && lines[i + 1] && /^\s{2,}[\w \-]+:/.test(lines[i + 1]) && !/^\s*-\s/.test(lines[i + 1])) {
      // "key:" followed by indented "  sub: val" lines with no leading "-" — a nested map.
      const obj = {};
      i++;
      while (i < lines.length && /^\s{2,}[\w \-]+:/.test(lines[i])) {
        const m = lines[i].match(/^\s+([\w \-]+?):\s*(.*)$/);
        obj[m[1]] = coerceScalar(m[2].trim());
        i++;
      }
      result[key] = obj;
    } else if (rest.trim() === '') {
      // Possible block list of scalars or objects on following indented lines.
      const items = [];
      i++;
      while (i < lines.length && /^\s*-\s/.test(lines[i])) {
        const itemLine = lines[i];
        const inlineMatch = itemLine.match(/^\s*-\s*(.*)$/);
        const firstFieldText = inlineMatch[1];

        if (firstFieldText.includes(':')) {
          // Block object item, e.g. "- text: Foo" followed by indented "done: true"
          const obj = {};
          const [k, ...vRest] = firstFieldText.split(':');
          obj[k.trim()] = coerceScalar(vRest.join(':').trim());
          i++;
          while (i < lines.length && /^\s{2,}\w[\w-]*:/.test(lines[i])) {
            const m = lines[i].match(/^\s+(\w[\w-]*):\s*(.*)$/);
            obj[m[1]] = coerceScalar(m[2].trim());
            i++;
          }
          items.push(obj);
        } else {
          items.push(coerceScalar(firstFieldText.trim()));
          i++;
        }
      }
      result[key] = items;
    } else if (rest.trim().startsWith('[') && rest.trim().endsWith(']')) {
      // Inline array, e.g. "labels: [a, b, c]"
      const inner = rest.trim().slice(1, -1).trim();
      result[key] = inner === '' ? [] : inner.split(',').map(s => coerceScalar(s.trim()));
      i++;
    } else if (rest.trim() === '{}') {
      result[key] = {};
      i++;
    } else if (rest.trim() === '') {
      // "key:" with nothing following (no indented sub-lines at all) — empty map.
      result[key] = {};
      i++;
    } else {
      result[key] = coerceScalar(rest.trim());
      i++;
    }
  }
  return result;
}

function coerceScalar(text) {
  if (text === '') return '';
  if (text === 'true') return true;
  if (text === 'false') return false;
  if (text === 'null' || text === '~') return null;
  if (/^-?\d+(\.\d+)?$/.test(text)) return Number(text);
  // Strip matching quotes and unescape backslash-escaped characters within them.
  if (text.startsWith('"') && text.endsWith('"') && text.length >= 2) {
    try {
      return JSON.parse(text);
    } catch {
      return text.slice(1, -1);
    }
  }
  if (text.startsWith("'") && text.endsWith("'") && text.length >= 2) {
    return text.slice(1, -1).replace(/''/g, "'");
  }
  return text;
}

function stringifyYamlBlock(obj, indent = 0) {
  const pad = '  '.repeat(indent);
  const lines = [];
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      if (value.length === 0) {
        lines.push(`${pad}${key}: []`);
      } else if (typeof value[0] === 'object' && value[0] !== null) {
        lines.push(`${pad}${key}:`);
        for (const item of value) {
          const entries = Object.entries(item);
          entries.forEach(([k, v], idx) => {
            const prefix = idx === 0 ? `${pad}  - ` : `${pad}    `;
            lines.push(`${prefix}${k}: ${formatScalar(v)}`);
          });
        }
      } else {
        lines.push(`${pad}${key}: [${value.map(formatScalar).join(', ')}]`);
      }
    } else if (value !== null && typeof value === 'object') {
      const entries = Object.entries(value);
      if (entries.length === 0) {
        lines.push(`${pad}${key}: {}`);
      } else {
        lines.push(`${pad}${key}:`);
        for (const [k, v] of entries) {
          lines.push(`${pad}  ${k}: ${formatScalar(v)}`);
        }
      }
    } else {
      lines.push(`${pad}${key}: ${formatScalar(value)}`);
    }
  }
  return lines.join('\n');
}

function formatScalar(value) {
  if (typeof value === 'string') {
    if (value === '' || /^(true|false|null|~)$/.test(value) || /^-?\d+(\.\d+)?$/.test(value) || /[:#[\]{}]/.test(value)) {
      return JSON.stringify(value);
    }
    return value;
  }
  return String(value);
}
