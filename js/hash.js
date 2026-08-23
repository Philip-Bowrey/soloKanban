/**
 * SoloKanban Canonical Content Hashing
 * Computes deterministic SHA-256 content hash across JS and Node environments.
 */

import { serializeYaml, normalizeLineEndings } from './yaml.js';

let nodeCrypto = null;

// Dynamically import node:crypto if running in Node environment
if (typeof window === 'undefined' && typeof process !== 'undefined') {
  try {
    nodeCrypto = await import('node:crypto');
  } catch (e) {
    // Ignore
  }
}

/**
 * Filter out volatile meta fields from frontmatter object.
 * Excludes `meta.revision`, `meta.contentHash`, `meta.updatedAt`, `meta.updatedBy`.
 * @param {Record<string, any>} frontmatter 
 * @returns {Record<string, any>}
 */
export function filterVolatileMeta(frontmatter) {
  if (!frontmatter || typeof frontmatter !== 'object') return {};
  const copy = JSON.parse(JSON.stringify(frontmatter));

  if (copy.meta && typeof copy.meta === 'object') {
    delete copy.meta.revision;
    delete copy.meta.contentHash;
    delete copy.meta.updatedAt;
    delete copy.meta.updatedBy;

    // If meta is now empty, delete meta key as well
    if (Object.keys(copy.meta).length === 0) {
      delete copy.meta;
    }
  }

  return copy;
}

/**
 * Normalizes Markdown body for hashing:
 * 1. Normalize line endings to \n
 * 2. Strip trailing whitespace from each line
 * 3. Trim trailing newlines from the entire body
 * @param {string} body 
 * @returns {string}
 */
export function normalizeBodyForHash(body) {
  if (typeof body !== 'string') return '';
  const normalized = normalizeLineEndings(body);
  const lines = normalized.split('\n').map(line => line.trimEnd());
  return lines.join('\n').trimEnd();
}

/**
 * Generates the canonical canonicalization string H before SHA-256 computation.
 * @param {Record<string, any>} frontmatter 
 * @param {string} body 
 * @returns {string}
 */
export function buildCanonicalRepresentation(frontmatter, body) {
  const filtered = filterVolatileMeta(frontmatter);
  const canonicalYamlStr = serializeYaml(filtered);
  const normalizedBody = normalizeBodyForHash(body);
  return `${canonicalYamlStr}\n---\n${normalizedBody}`;
}

/**
 * Computes SHA-256 hash string (hex formatted) synchronously or asynchronously.
 * Must complete in under 200ms for a 50KB Markdown body.
 * @param {Record<string, any>} frontmatter 
 * @param {string} body 
 * @returns {Promise<string>} 64-character SHA-256 hex string
 */
export async function computeContentHash(frontmatter, body) {
  const canonicalStr = buildCanonicalRepresentation(frontmatter, body);

  if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle) {
    const encoder = new TextEncoder();
    const data = encoder.encode(canonicalStr);
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  } else if (nodeCrypto) {
    return nodeCrypto.createHash('sha256').update(canonicalStr, 'utf8').digest('hex');
  } else if (typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.subtle) {
    const encoder = new TextEncoder();
    const data = encoder.encode(canonicalStr);
    const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  } else {
    // Fallback simple SHA-256 implementation if crypto API unavailable
    return sha256PureJs(canonicalStr);
  }
}

/**
 * Synchronous version of computeContentHash when using Node.js crypto module.
 * @param {Record<string, any>} frontmatter 
 * @param {string} body 
 * @returns {string}
 */
export function computeContentHashSync(frontmatter, body) {
  const canonicalStr = buildCanonicalRepresentation(frontmatter, body);
  if (nodeCrypto) {
    return nodeCrypto.createHash('sha256').update(canonicalStr, 'utf8').digest('hex');
  }
  return sha256PureJs(canonicalStr);
}

// Minimal fast pure JS SHA-256 implementation for standalone/fallback contexts
function sha256PureJs(ascii) {
  function rightRotate(value, amount) {
    return (value >>> amount) | (value << (32 - amount));
  }

  var mathPow = Math.pow;
  var maxWord = mathPow(2, 32);
  var lengthProperty = 'length';
  var i, j;
  var result = '';

  var words = [];
  var asciiLength = ascii[lengthProperty] * 8;

  var hash = sha256PureJs.h = sha256PureJs.h || [];
  var k = sha256PureJs.k = sha256PureJs.k || [];
  var primeCounter = k[lengthProperty];

  var isComposite = {};
  for (var candidate = 2; primeCounter < 64; candidate++) {
    if (!isComposite[candidate]) {
      for (i = 0; i < 300; i += candidate) {
        isComposite[i] = candidate;
      }
      hash[primeCounter] = (mathPow(candidate, .5) * maxWord) | 0;
      k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
    }
  }

  ascii += '\x80';
  while (ascii[lengthProperty] % 64 - 56) ascii += '\x00';
  for (i = 0; i < ascii[lengthProperty]; i++) {
    j = ascii.charCodeAt(i);
    if (j >> 8) return ''; // UTF-8 fallback safe
    words[i >> 2] |= j << ((3 - i % 4) * 8);
  }
  words[words[lengthProperty]] = ((asciiLength / maxWord) | 0);
  words[words[lengthProperty]] = (asciiLength);

  for (j = 0; j < words[lengthProperty];) {
    var w = words.slice(j, j += 16);
    var oldHash = hash;
    hash = hash.slice(0, 8);

    for (i = 0; i < 64; i++) {
      var w15 = w[i - 15], w2 = w[i - 2];

      var a = hash[0], e = hash[4];
      var temp1 = hash[7]
        + (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25))
        + ((e & hash[5]) ^ ((~e) & hash[6]))
        + k[i]
        + (w[i] = (i < 16) ? w[i] : (
          w[i - 16]
          + (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3))
          + w[i - 7]
          + (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))
        ) | 0);
      var temp2 = (rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22))
        + ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));

      hash = [(temp1 + temp2) | 0].concat(hash);
      hash[4] = (hash[4] + temp1) | 0;
    }

    for (i = 0; i < 8; i++) {
      hash[i] = (hash[i] + oldHash[i]) | 0;
    }
  }

  for (i = 0; i < 8; i++) {
    for (j = 3; j >= 0; j--) {
      var b = (hash[i] >> (j * 8)) & 255;
      result += (b < 16 ? '0' : '') + b.toString(16);
    }
  }
  return result;
}
