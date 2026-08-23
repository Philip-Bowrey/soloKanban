/**
 * SoloKanban YAML Parser & Serializer
 * Strict, deterministic, zero-dependency YAML handling for frontmatter.
 */

/**
 * Normalizes all line endings in string from CRLF to LF.
 * @param {string} str 
 * @returns {string}
 */
export function normalizeLineEndings(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

/**
 * Parses YAML frontmatter text or standalone YAML string into a JS object.
 * @param {string} yamlStr 
 * @returns {Record<string, any>}
 */
export function parseYaml(yamlStr) {
  if (!yamlStr || typeof yamlStr !== 'string') return {};
  const normalized = normalizeLineEndings(yamlStr).trim();
  if (!normalized) return {};

  const lines = normalized.split('\n');
  const result = {};
  
  let i = 0;
  while (i < lines.length) {
    let line = lines[i];
    // Remove trailing whitespace and comments (unless quoted)
    const commentIdx = line.indexOf('#');
    if (commentIdx !== -1 && !isInsideQuotes(line, commentIdx)) {
      line = line.substring(0, commentIdx);
    }
    const trimmedLine = line.trimEnd();

    if (!trimmedLine || trimmedLine.trim() === '') {
      i++;
      continue;
    }

    // Top level key-value pair
    const match = line.match(/^([a-zA-Z0-9_\-\.]+)\s*:\s*(.*)$/);
    if (match) {
      const key = match[1];
      let rawVal = match[2].trim();

      if (rawVal === '') {
        // Could be start of multiline object or array
        const multiline = collectIndentedBlock(lines, i + 1);
        if (multiline.lines.length > 0) {
          result[key] = parseIndentedValue(multiline.lines);
          i = multiline.nextIndex;
          continue;
        } else {
          result[key] = null;
        }
      } else {
        result[key] = parsePrimitive(rawVal);
      }
    }
    i++;
  }

  return result;
}

function isInsideQuotes(str, index) {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < index; i++) {
    const char = str[i];
    if (char === "'" && !inDouble) inSingle = !inSingle;
    if (char === '"' && !inSingle) inDouble = !inDouble;
  }
  return inSingle || inDouble;
}

function collectIndentedBlock(lines, startIndex) {
  const blockLines = [];
  let i = startIndex;
  let baseIndent = null;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      if (blockLines.length > 0) {
        blockLines.push(line);
      }
      i++;
      continue;
    }

    const currentIndent = line.search(/\S/);
    if (baseIndent === null) {
      if (currentIndent <= 0) break; // Not indented
      baseIndent = currentIndent;
    } else if (currentIndent < baseIndent) {
      break; // End of block
    }

    blockLines.push(line);
    i++;
  }

  // Remove trailing blank lines
  while (blockLines.length > 0 && !blockLines[blockLines.length - 1].trim()) {
    blockLines.pop();
  }

  return { lines: blockLines, nextIndex: i };
}

function parseIndentedValue(lines) {
  if (lines.length === 0) return null;
  const firstNonEmpty = lines.find(l => l.trim());
  if (!firstNonEmpty) return null;

  const trimmed = firstNonEmpty.trim();
  if (trimmed.startsWith('-')) {
    // Array
    const arr = [];
    let currentItemLines = [];

    for (const line of lines) {
      const lTrim = line.trim();
      if (!lTrim) continue;
      if (lTrim.startsWith('-')) {
        if (currentItemLines.length > 0) {
          arr.push(parseArrayItem(currentItemLines));
        }
        currentItemLines = [lTrim.substring(1).trim()];
      } else {
        currentItemLines.push(lTrim);
      }
    }
    if (currentItemLines.length > 0) {
      arr.push(parseArrayItem(currentItemLines));
    }
    return arr;
  } else {
    // Nested object
    const unindented = lines.map(l => l.trim()).join('\n');
    return parseYaml(unindented);
  }
}

function parseArrayItem(lines) {
  const first = lines[0].trim();
  if (lines.length === 1) {
    return parsePrimitive(first);
  }
  // Multiline string or object
  return parsePrimitive(lines.join(' '));
}

export function parsePrimitive(valStr) {
  if (valStr === undefined || valStr === null) return null;
  const str = valStr.trim();
  if (str === '' || str === 'null' || str === '~') return null;
  if (str === 'true') return true;
  if (str === 'false') return false;

  // Quoted string
  if ((str.startsWith('"') && str.endsWith('"')) || (str.startsWith("'") && str.endsWith("'"))) {
    const inner = str.slice(1, -1);
    return inner.replace(/\\"/g, '"').replace(/\\'/g, "'").replace(/\\\\/g, '\\');
  }

  // Flow array: [a, b, c]
  if (str.startsWith('[') && str.endsWith(']')) {
    const content = str.slice(1, -1).trim();
    if (!content) return [];
    return splitFlowArray(content).map(item => parsePrimitive(item));
  }

  // Number
  if (/^-?\d+(\.\d+)?$/.test(str)) {
    return Number(str);
  }

  return str;
}

function splitFlowArray(str) {
  const items = [];
  let current = '';
  let inSingle = false;
  let inDouble = false;

  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    if (char === "'" && !inDouble) inSingle = !inSingle;
    else if (char === '"' && !inSingle) inDouble = !inDouble;

    if (char === ',' && !inSingle && !inDouble) {
      items.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  if (current.trim()) items.push(current.trim());
  return items;
}

/**
 * Serializes a JS object to canonical YAML string with lexicographically sorted top-level keys.
 * @param {Record<string, any>} obj 
 * @returns {string}
 */
export function serializeYaml(obj) {
  if (!obj || typeof obj !== 'object') return '';
  
  const keys = Object.keys(obj).sort();
  const lines = [];

  for (const key of keys) {
    const val = obj[key];
    if (val === undefined) continue;

    lines.push(`${key}: ${formatValue(val, 0)}`);
  }

  return lines.join('\n');
}

function formatValue(val, indentDepth = 0) {
  if (val === null || val === undefined) return 'null';
  if (typeof val === 'boolean') return val ? 'true' : 'false';
  if (typeof val === 'number') return String(val);
  
  if (typeof val === 'string') {
    // If string has special chars like colons, quotes, newlines, or looks like primitive, quote it
    if (
      val === '' ||
      val === 'true' || val === 'false' || val === 'null' ||
      val.includes(': ') || val.includes('\n') || val.includes('#') ||
      val.startsWith('[') || val.startsWith('{') ||
      /^[\s"']|[\s"']$/.test(val)
    ) {
      return `"${val.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
    }
    return val;
  }

  if (Array.isArray(val)) {
    if (val.length === 0) return '[]';
    // Check if simple primitives
    const allSimple = val.every(v => v === null || typeof v === 'boolean' || typeof v === 'number' || (typeof v === 'string' && !v.includes(',') && !v.includes('"') && !v.includes("'")));
    if (allSimple && val.length <= 5) {
      return `[${val.map(v => formatValue(v)).join(', ')}]`;
    }
    // Multiline array
    const indent = '  '.repeat(indentDepth + 1);
    const items = val.map(v => `${indent}- ${formatValue(v, indentDepth + 1)}`);
    return '\n' + items.join('\n');
  }

  if (typeof val === 'object') {
    const keys = Object.keys(val).sort();
    if (keys.length === 0) return '{}';
    const indent = '  '.repeat(indentDepth + 1);
    const items = keys.map(k => `${indent}${k}: ${formatValue(val[k], indentDepth + 1)}`);
    return '\n' + items.join('\n');
  }

  return String(val);
}

/**
 * Splits a Markdown card into frontmatter object and body string.
 * @param {string} fileContent 
 * @returns {{ frontmatter: Record<string, any>, body: string, rawYaml: string }}
 */
export function parseCardFile(fileContent) {
  const normalized = normalizeLineEndings(fileContent);
  if (!normalized.startsWith('---')) {
    throw new Error('Malformed card file: missing opening frontmatter delimiter');
  }

  const firstDelimiterEnd = normalized.indexOf('\n---', 3);
  if (firstDelimiterEnd === -1) {
    throw new Error('Malformed card file: missing closing frontmatter delimiter');
  }

  const rawYaml = normalized.substring(4, firstDelimiterEnd).trim();
  const body = normalized.substring(firstDelimiterEnd + 4).replace(/^\n/, '');
  const frontmatter = parseYaml(rawYaml);

  return { frontmatter, body, rawYaml };
}

/**
 * Serializes frontmatter object and Markdown body into full card file content.
 * @param {Record<string, any>} frontmatter 
 * @param {string} body 
 * @returns {string}
 */
export function serializeCardFile(frontmatter, body) {
  const yamlStr = serializeYaml(frontmatter);
  const normalizedBody = normalizeLineEndings(body || '');
  return `---\n${yamlStr}\n---\n${normalizedBody}`;
}
