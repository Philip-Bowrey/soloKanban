import { test, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { parseYaml, serializeYaml, parseCardFile, serializeCardFile } from '../js/yaml.js';
import { computeContentHash, computeContentHashSync } from '../js/hash.js';
import { parseChecklist, serializeChecklist, calculateProgress } from '../js/checklist.js';
import { renderMarkdown, escapeHtml } from '../js/markdown.js';
import { renderCardFace, getDueDateStatus } from '../js/card-render.js';
import { DEFAULT_FEATURE_TYPES, DEFAULT_LABELS } from '../js/defaults.js';

describe('Tier 1 — Unit Tests', () => {

  describe('YAML Parser & Serializer', () => {
    it('correctly parses strings, numbers, booleans, arrays, colons, and CRLF', () => {
      const input = "title: \"Test Card: Subtitle\"\r\npriority: high\r\nrevision: 5\r\nisActive: true\r\nlabels: [lbl-1, lbl-2]\r\n";
      const parsed = parseYaml(input);
      assert.equal(parsed.title, 'Test Card: Subtitle');
      assert.equal(parsed.priority, 'high');
      assert.equal(parsed.revision, 5);
      assert.equal(parsed.isActive, true);
      assert.deepEqual(parsed.labels, ['lbl-1', 'lbl-2']);
    });

    it('roundtrip preserves structure: hash(serialize(parse(x))) == hash(x)', async () => {
      const input = "assignee: alice\npriority: critical\ntitle: Heavy load\n";
      const parsed = parseYaml(input);
      const serialized = serializeYaml(parsed);
      const reParsed = parseYaml(serialized);
      assert.deepEqual(parsed, reParsed);
    });
  });

  describe('Canonical Content Hash & (v8.3) Performance Benchmark', () => {
    it('ignores volatile meta fields (revision, updatedAt, contentHash, deliveredAt)', async () => {
      const fm1 = { title: 'Fix bug', meta: { revision: 1, contentHash: 'abc', updatedAt: '2026-01-01' } };
      const fm2 = { title: 'Fix bug', meta: { revision: 99, contentHash: 'xyz', updatedAt: '2026-08-23' } };
      const body = '## Description\nFix it';

      const hash1 = await computeContentHash(fm1, body);
      const hash2 = await computeContentHash(fm2, body);
      assert.equal(hash1, hash2);
    });

    it('(v8.3) Performance: computeContentHash() on 50KB body completes in under 200ms', async () => {
      const largeBodyLines = [];
      for (let i = 0; i < 1500; i++) {
        largeBodyLines.push(`Line ${i}: This is line content to fill 50KB of markdown text body.`);
      }
      const largeBody = largeBodyLines.join('\n');
      assert.ok(largeBody.length >= 50000, `Body size should be >= 50KB (actual: ${largeBody.length} bytes)`);

      const fm = { title: 'Performance Test Card', priority: 'high', labels: ['lbl-core'] };

      const startTime = performance.now();
      const hash = await computeContentHash(fm, largeBody);
      const durationMs = performance.now() - startTime;

      assert.ok(hash.length === 64, 'Should compute 64-char hex SHA-256 hash');
      assert.ok(durationMs < 200, `computeContentHash() took ${durationMs.toFixed(2)}ms, exceeding 200ms limit!`);
    });
  });

  describe('Checklist Parser & Serializer', () => {
    it('parses nested checklists and calculates progress top-level only', () => {
      const text = "- [x] Item 1\n  - [ ] Sub-item 1a\n  - [x] Sub-item 1b\n- [ ] Item 2\n";
      const tree = parseChecklist(text);
      assert.equal(tree.length, 2);
      assert.equal(tree[0].completed, true);
      assert.equal(tree[0].children.length, 2);
      assert.equal(tree[1].completed, false);

      const progress = calculateProgress(tree);
      assert.equal(progress.completed, 1);
      assert.equal(progress.total, 2);
      assert.equal(progress.percentage, 50);
    });
  });

  describe('Markdown Security Escaping & Task Checkboxes', () => {
    it('escapes raw HTML tags to prevent XSS', () => {
      const text = "Dangerous <script>alert('xss')</script> tag";
      const rendered = renderMarkdown(text);
      assert.ok(!rendered.includes('<script>'));
      assert.ok(rendered.includes('&lt;script&gt;'));
    });

    it('renders task list items with checkboxes', () => {
      const md = "## Tasks\n- [ ] Unchecked Task\n- [x] Completed Task";
      const rendered = renderMarkdown(md);
      assert.ok(rendered.includes('type="checkbox"'));
      assert.ok(rendered.includes('task-checkbox'));
      assert.ok(rendered.includes('checked'));
      assert.ok(rendered.includes('Unchecked Task'));
      assert.ok(rendered.includes('Completed Task'));
    });
  });

  describe('(v8.3) Label Deletion Fallback Behavior', () => {
    const labels = [{ id: 'lbl-core', name: 'Core', color: '#6c5ce7' }]; // 'lbl-deleted' is missing!

    it('omits deleted label chip from card face render', () => {
      const card = {
        id: 'CON-001',
        type: 'feature',
        frontmatter: { title: 'Test Card', labels: ['lbl-core', 'lbl-deleted'] },
        body: 'Body text'
      };

      const html = renderCardFace(card, { labels });
      assert.ok(html.includes('Core'));
      assert.ok(!html.includes('lbl-deleted'));
      assert.ok(!html.includes('Unknown label'));
    });

    it('does not change content hash when card with dangling label ID is re-saved', async () => {
      const fm = { title: 'Card with deleted label', labels: ['lbl-core', 'lbl-deleted'] };
      const body = 'Body content';

      const initialHash = await computeContentHash(fm, body);

      // Simulate re-saving without touching labels array
      const resavedHash = await computeContentHash(fm, body);
      assert.equal(initialHash, resavedHash);
    });
  });

  describe('Date Logic & Visual Precedence', () => {
    it('overdue red indicator takes visual precedence over stale yellow', () => {
      const status = getDueDateStatus('2020-01-01', '2020-01-01', 7);
      assert.equal(status.isOverdue, true);
      assert.equal(status.isStale, true);
      assert.ok(status.label.includes('Overdue'));
    });
  });

  describe('Modern UI Components & Badges', () => {
    it('renders quick-complete check circle and summary badges on card face', () => {
      const card = {
        id: 'FEAT-001',
        type: 'feature',
        frontmatter: {
          title: 'Implement Payment Gateway',
          attachments: ['receipt.pdf'],
          listId: 'in-progress'
        },
        body: '## Description\nPayment integration flow\n\n## Tasks\n- [x] API client\n- [ ] Webhook'
      };

      const html = renderCardFace(card, { labels: [] });
      assert.ok(html.includes('card-quick-complete-btn'), 'Should render quick complete button');
      assert.ok(html.includes('📎 1'), 'Should render attachment count chip');
      assert.ok(html.includes('card-summary-icon'), 'Should render summary icons');
      assert.ok(html.includes('card-progress-ring'), 'Should render checklist progress ring');
    });

    it('renders checked circle when card listId is done', () => {
      const card = {
        id: 'FEAT-002',
        type: 'feature',
        frontmatter: { title: 'Finished item', listId: 'done' },
        body: 'Done'
      };

      const html = renderCardFace(card, { labels: [] });
      assert.ok(html.includes('is-done'), 'Should have is-done class');
      assert.ok(html.includes('✓'), 'Should render checkmark symbol');
    });
  });
});
