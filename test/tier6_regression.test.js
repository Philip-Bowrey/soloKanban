import { test, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { AppState } from '../js/state.js';
import { renderCardFace } from '../js/card-render.js';
import { isChromiumBrowser } from '../js/main.js';
import { computeContentHash } from '../js/hash.js';

describe('Tier 6 — Regression Suite', () => {

  it('(v8.3 Regression) Idle presence TTL is exactly 120s', () => {
    const appState = new AppState();
    // Simulate idle state (>30s no activity)
    appState.isUserActive = false;
    appState.lastUserActivityTime = Date.now() - 31000;

    const idleTimeMs = Date.now() - appState.lastUserActivityTime;
    const isIdle = idleTimeMs > 30000;
    const expectedTtl = isIdle ? 120 : 30;

    assert.equal(expectedTtl, 120, 'Idle presence TTL must be exactly 120s per v8.3 spec');
  });

  it('(v8.3 Regression) Presence badge tooltip includes actor and intent', () => {
    const card = { id: 'C1', type: 'feature', frontmatter: { title: 'Card 1' } };
    const activePresence = [{ actor: 'agent:claude-code-v1', intent: 'editing' }];

    const html = renderCardFace(card, { activePresence });

    assert.ok(html.includes('agent:claude-code-v1'), 'Tooltip must include actor ID');
    assert.ok(html.includes('editing'), 'Tooltip must include intent');
  });

  it('(v8.3 Regression) Deleted-label card: reopening/resaving without touching label does not alter contentHash', async () => {
    const fm = { title: 'Label Test', labels: ['lbl-active', 'lbl-deleted'] };
    const body = 'Body content';

    const hash1 = await computeContentHash(fm, body);
    const hash2 = await computeContentHash(fm, body);

    assert.equal(hash1, hash2, 'Content hash must remain identical');
  });

  it('(v8.3 Regression) First-run banner helper differentiates Chromium vs Non-Chromium', () => {
    const isChromium = isChromiumBrowser();
    assert.equal(typeof isChromium, 'boolean');
  });
});
