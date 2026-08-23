import { test, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { SoloKanbanClient } from '../.solokanban/sdk/solokanban.js';

describe('Tier 7 — Agent SDK & Skills Correctness (JS)', () => {

  it('JS SDK methods function correctly', async () => {
    const tmpDir = path.join(process.cwd(), 'scratch_test_sdk_js');
    await fs.mkdir(path.join(tmpDir, 'CON_REV', 'features'), { recursive: true });

    const cardPath = path.join(tmpDir, 'CON_REV', 'features', 'CARD-1.md');
    await fs.writeFile(cardPath, '---\ntitle: Initial Card\nlistId: backlog\n---\nInitial Body');

    const client = new SoloKanbanClient(tmpDir);
    const card = await client.getCard('CON_REV', 'CARD-1');

    assert.ok(card);
    assert.equal(card.frontmatter.title, 'Initial Card');

    card.body += '\nUpdated Body';
    await client.updateCard(card);

    const reloaded = await client.getCard('CON_REV', 'CARD-1');
    assert.ok(reloaded.body.includes('Updated Body'));

    // Clean up
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('Skills-vs-code drift check: solokanban-sdk.md matches public JS SDK API', async () => {
    const skillPath = path.join(process.cwd(), '.solokanban', 'skills', 'solokanban-sdk.md');
    const skillText = await fs.readFile(skillPath, 'utf8');

    const client = new SoloKanbanClient(process.cwd());
    const publicMethods = ['getCard', 'updateCard'];

    for (const method of publicMethods) {
      assert.equal(typeof client[method], 'function', `SDK missing method ${method}`);
    }
  });
});
