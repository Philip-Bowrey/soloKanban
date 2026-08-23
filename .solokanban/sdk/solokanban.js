/**
 * SoloKanban Standard JS SDK (v8.3)
 * Zero-dependency agent SDK for interacting with local SoloKanban workspaces.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as crypto from 'node:crypto';

export class SoloKanbanClient {
  constructor(workspacePath) {
    this.workspacePath = path.resolve(workspacePath);
    this.actorId = `agent:js-sdk-${process.pid}`;
  }

  normalizeLineEndings(str) {
    return (str || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  }

  parseYaml(yamlStr) {
    if (!yamlStr) return {};
    const lines = this.normalizeLineEndings(yamlStr).split('\n');
    const res = {};
    for (const line of lines) {
      const match = line.match(/^([a-zA-Z0-9_\-\.]+)\s*:\s*(.*)$/);
      if (match) {
        let val = match[2].trim();
        if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
        else if (val === 'true') val = true;
        else if (val === 'false') val = false;
        else if (val === 'null') val = null;
        else if (/^\d+$/.test(val)) val = Number(val);
        res[match[1]] = val;
      }
    }
    return res;
  }

  serializeYaml(obj) {
    if (!obj) return '';
    const keys = Object.keys(obj).sort();
    const lines = [];
    for (const k of keys) {
      const v = obj[k];
      if (v === undefined) continue;
      if (typeof v === 'string' && (v.includes(':') || v.includes('\n'))) {
        lines.push(`${k}: "${v.replace(/"/g, '\\"')}"`);
      } else {
        lines.push(`${k}: ${v}`);
      }
    }
    return lines.join('\n');
  }

  parseCardFile(content) {
    const norm = this.normalizeLineEndings(content);
    if (!norm.startsWith('---')) return { frontmatter: {}, body: norm };
    const end = norm.indexOf('\n---', 3);
    if (end === -1) return { frontmatter: {}, body: norm };
    const rawYaml = norm.substring(4, end).trim();
    const body = norm.substring(end + 4).replace(/^\n/, '');
    return { frontmatter: this.parseYaml(rawYaml), body };
  }

  computeContentHash(frontmatter, body) {
    const copy = JSON.parse(JSON.stringify(frontmatter));
    if (copy.meta) {
      delete copy.meta.revision;
      delete copy.meta.contentHash;
      delete copy.meta.updatedAt;
      delete copy.meta.updatedBy;
      if (Object.keys(copy.meta).length === 0) delete copy.meta;
    }
    const yamlStr = this.serializeYaml(copy);
    const normBody = this.normalizeLineEndings(body).split('\n').map(l => l.trimEnd()).join('\n').trimEnd();
    const canonical = `${yamlStr}\n---\n${normBody}`;
    return crypto.createHash('sha256').update(canonical, 'utf8').digest('hex');
  }

  async getCard(projectId, cardId) {
    const filePath = projectId === 'projects'
      ? path.join(this.workspacePath, 'projects', `${cardId}.md`)
      : path.join(this.workspacePath, projectId, 'features', `${cardId}.md`);

    try {
      const content = await fs.readFile(filePath, 'utf8');
      const parsed = this.parseCardFile(content);
      return { id: cardId, projectId, frontmatter: parsed.frontmatter, body: parsed.body, filePath };
    } catch (e) {
      return null;
    }
  }

  async updateCard(card) {
    const disk = await this.getCard(card.projectId, card.id);
    if (disk && disk.frontmatter?.meta?.contentHash) {
      const expectedHash = disk.frontmatter.meta.contentHash;
      const expectedRev = disk.frontmatter.meta.revision || 1;
      if (card.frontmatter?.meta?.revision && card.frontmatter.meta.revision < expectedRev) {
        throw new Error(`ConflictException: Stale revision ${card.frontmatter.meta.revision} vs ${expectedRev}`);
      }
    }

    card.frontmatter.meta = card.frontmatter.meta || {};
    card.frontmatter.meta.revision = (card.frontmatter.meta.revision || 1) + 1;
    card.frontmatter.meta.updatedAt = new Date().toISOString();
    card.frontmatter.meta.contentHash = this.computeContentHash(card.frontmatter, card.body);

    const fileContent = `---\n${this.serializeYaml(card.frontmatter)}\n---\n${this.normalizeLineEndings(card.body)}`;
    await fs.writeFile(card.filePath, fileContent, 'utf8');
    return card;
  }
}
