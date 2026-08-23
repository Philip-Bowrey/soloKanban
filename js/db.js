/**
 * SoloKanban In-Memory Database & Search Index Manager
 */

export class SoloDb {
  constructor(fsAdapter) {
    this.fsAdapter = fsAdapter;
    this.cards = new Map(); // id -> card object
    this.projects = new Map(); // id -> project object
    this.labels = [];
    this.fields = [];
    this.featureTypes = [];
    this.workspaceConfig = null;
    this.searchIndex = [];
  }

  setFsAdapter(fsAdapter) {
    this.fsAdapter = fsAdapter;
  }

  clear() {
    this.cards.clear();
    this.projects.clear();
    this.labels = [];
    this.fields = [];
    this.featureTypes = [];
    this.workspaceConfig = null;
    this.searchIndex = [];
  }

  /**
   * Rebuild disposable search index cache (excludes trash).
   * Writes cache to /.solokanban/search-index.json
   */
  async rebuildSearchIndex() {
    this.searchIndex = [];

    for (const [id, card] of this.cards.entries()) {
      // Exclude trashed cards
      if (card._isTrash) continue;

      const title = card.frontmatter?.title || '';
      const body = card.body || '';
      const labels = (card.frontmatter?.labels || []).join(' ');
      const projectId = card.projectId || '';

      this.searchIndex.push({
        id,
        projectId,
        title,
        searchText: `${title} ${body} ${labels} ${id}`.toLowerCase(),
        filePath: card._filePath
      });
    }

    if (this.fsAdapter) {
      await this.fsAdapter.writeFile(
        '.solokanban/search-index.json',
        JSON.stringify(this.searchIndex, null, 2)
      );
    }

    return this.searchIndex;
  }

  /**
   * Search cards in index.
   * @param {string} query 
   * @returns {Array<object>}
   */
  search(query) {
    if (!query || typeof query !== 'string') return [];
    const q = query.toLowerCase().trim();
    if (!q) return [];

    return this.searchIndex.filter(item => item.searchText.includes(q));
  }
}
