import { test, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { parseYaml, serializeYaml } from '../js/yaml.js';
import { computeContentHash } from '../js/hash.js';
import { parseChecklist, serializeChecklist } from '../js/checklist.js';

// Deterministic Pseudo-Random Generator with fixed seed
function createPrng(seed = 12345) {
  let state = seed;
  return function random() {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

describe('Tier 0 — Property-Based & Fuzz Tests', () => {

  it('hash(x) == hash(x) always across 1,000 fuzzed document iterations', async () => {
    const rng = createPrng(42);
    const charPool = 'abcdefghijklmnopqrstuvwxyz0123456789 _-:;!@#$%^&*()"\n\r';

    function genString(maxLen = 30) {
      const len = Math.floor(rng() * maxLen);
      let res = '';
      for (let i = 0; i < len; i++) {
        res += charPool[Math.floor(rng() * charPool.length)];
      }
      return res;
    }

    for (let i = 0; i < 1000; i++) {
      const fm = {
        title: genString(20),
        priority: rng() > 0.5 ? 'high' : 'low',
        points: Math.floor(rng() * 10),
        active: rng() > 0.5,
        labels: ['lbl-1', 'lbl-2']
      };
      const body = `## Section\n${genString(50)}\n\n- [ ] ${genString(15)}`;

      const h1 = await computeContentHash(fm, body);
      const h2 = await computeContentHash(fm, body);

      assert.equal(h1, h2, `Hash mismatch at iteration ${i}`);
    }
  });

  it('superficially different documents (CRLF vs LF, key order) hash identically', async () => {
    const fm1 = { b_key: 'value 2', a_key: 'value 1' };
    const fm2 = { a_key: 'value 1', b_key: 'value 2' };

    const body1 = "## Description\r\nHello World   \r\n";
    const body2 = "## Description\nHello World\n";

    const h1 = await computeContentHash(fm1, body1);
    const h2 = await computeContentHash(fm2, body2);

    assert.equal(h1, h2, 'Superficially different documents must produce identical hash');
  });

  it('checklist parsing exact-indentation roundtrip property', () => {
    const text = "- [x] Parent item\n  - [ ] Sub-item 1\n  - [x] Sub-item 2\n";
    const tree = parseChecklist(text);
    const serialized = serializeChecklist(tree);
    const reTree = parseChecklist(serialized);

    assert.deepEqual(tree, reTree, 'Checklist tree structure must roundtrip accurately');
  });
});
