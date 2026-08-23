/**
 * SoloKanban Main App Bootstrapper
 * Handles browser detection, first-run banner copy differentiation, folder picker, and router navigation.
 */

import { FileSystemAdapter } from './filesystem.js';
import { AppState } from './state.js';
import { SoloDb } from './db.js';
import { PreferencesManager } from './preferences.js';
import { WorkspaceManager } from './workspace.js';
import { BoardRenderer } from './board.js';
import { DragDropHandler } from './dragdrop.js';
import { CardModal } from './card-modal.js';
import { SettingsModal } from './settings.js';
import { SdkUpdater } from './sdk-update.js';
import { escapeHtml } from './markdown.js';

export function isChromiumBrowser() {
  if (typeof window === 'undefined') return true;
  const userAgent = window.navigator.userAgent.toLowerCase();
  const isChromiumBrand = window.navigator.userAgentData?.brands?.some(b => b.brand.toLowerCase().includes('chromium') || b.brand.toLowerCase().includes('chrome'));
  return isChromiumBrand || (userAgent.includes('chrome') || userAgent.includes('chromium') || userAgent.includes('edg') || userAgent.includes('opera'));
}

export class SoloKanbanApp {
  constructor() {
    this.state = new AppState();
    this.db = new SoloDb();
    this.preferencesManager = new PreferencesManager();
    
    this.state.db = this.db;
    this.state.preferencesManager = this.preferencesManager;

    this.workspaceManager = null;
    this.boardRenderer = null;
    this.cardModal = null;
    this.settingsModal = null;
    this.dragDropHandler = null;
  }

  async init() {
    this.state.initActivityListeners();

    this.cardModal = new CardModal(this.state, () => this.refreshBoard());
    this.settingsModal = new SettingsModal(this.state, () => this.refreshBoard());
    this.boardRenderer = new BoardRenderer(this.state);
    this.dragDropHandler = new DragDropHandler(this.state, () => this.refreshBoard());

    this.bindHeaderEvents();
  }

  async openWorkspaceHandle(dirHandle) {
    const fsAdapter = new FileSystemAdapter(dirHandle);
    this.state.fsAdapter = fsAdapter;
    this.db.setFsAdapter(fsAdapter);
    this.preferencesManager.setFsAdapter(fsAdapter);

    this.workspaceManager = new WorkspaceManager(fsAdapter, this.db);
    await this.workspaceManager.initializeWorkspace();
    await this.preferencesManager.load();
    await this.workspaceManager.scanWorkspace();

    // Run SDK update check
    const sdkUpdater = new SdkUpdater(fsAdapter);
    sdkUpdater.checkForUpdates().catch(() => {});

    // Start adaptive presence heartbeats
    this.state.startPresenceHeartbeat();

    // Check First-Run Banner Copy Differentiation (PRD §3, §18)
    await this.checkFirstRunBanner();

    this.renderHeader();
    this.refreshBoard();
  }

  async checkFirstRunBanner() {
    if (this.preferencesManager.isFirstRunBannerDismissed()) return;

    const bannerContainer = document.getElementById('first-run-banner-container');
    if (!bannerContainer) return;

    const isChromium = isChromiumBrowser();
    const bannerCopy = isChromium
      ? "SoloKanban works best in Chromium. You are using a supported browser."
      : "SoloKanban requires a Chromium-based browser (Chrome, Edge, Opera) to access local files. Your files remain editable manually via any text editor (e.g., VS Code, Obsidian).";

    const bannerClass = isChromium ? 'banner-info' : 'banner-warning';

    bannerContainer.innerHTML = `
      <div class="first-run-banner ${bannerClass}">
        <span class="banner-text">${escapeHtml(bannerCopy)}</span>
        <button id="dismiss-banner-btn" class="btn-dismiss">&times;</button>
      </div>`;

    document.getElementById('dismiss-banner-btn').addEventListener('click', async () => {
      await this.preferencesManager.dismissFirstRunBanner();
      bannerContainer.innerHTML = '';
    });
  }

  renderHeader() {
    const breadcrumbEl = document.getElementById('breadcrumb-nav');
    if (!breadcrumbEl) return;

    if (this.state.currentView === 'workspace') {
      breadcrumbEl.innerHTML = `<span><strong>Workspace Board</strong></span>`;
    } else {
      const projId = this.state.currentProjectId;
      breadcrumbEl.innerHTML = `
        <button id="nav-back-workspace-btn" class="btn-link">Workspace</button>
        <span class="sep">/</span>
        <span><strong>${escapeHtml(projId)}</strong></span>`;

      document.getElementById('nav-back-workspace-btn')?.addEventListener('click', () => {
        this.state.currentView = 'workspace';
        this.state.currentProjectId = null;
        this.renderHeader();
        this.refreshBoard();
      });
    }
  }

  async handleCreateCard(listId = 'backlog') {
    if (!this.workspaceManager) {
      alert('Please open a workspace folder first using the "📁 Open Workspace Folder" button.');
      return;
    }

    let newCardRecord = null;
    if (this.state.currentView === 'workspace') {
      const title = prompt('Enter Project Name:', 'New Project');
      if (title === null) return;
      newCardRecord = await this.workspaceManager.createProjectCard(title || 'New Project', listId);
    } else {
      const projId = this.state.currentProjectId;
      const title = prompt('Enter Feature Card Title:', 'New Feature');
      if (title === null) return;
      newCardRecord = await this.workspaceManager.createFeatureCard(projId, 'feature', title || 'New Feature', listId);
    }

    this.refreshBoard();
    if (newCardRecord) {
      this.cardModal.open(newCardRecord);
    }
  }

  refreshBoard() {
    const boardContainer = document.getElementById('kanban-board-container');
    if (!boardContainer) return;

    this.boardRenderer.renderBoard(boardContainer);
    this.dragDropHandler.attachListeners(boardContainer);
    this.bindCardClickListeners();
    this.bindAddCardButtons();
    this.bindColumnCollapseListeners();
  }

  bindColumnCollapseListeners() {
    document.querySelectorAll('.collapse-list-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const listId = btn.dataset.listId || btn.closest('.kanban-column')?.dataset.listId;
        if (!listId) return;
        const collapsed = new Set(this.preferencesManager.get('board.collapsedLists') || []);
        collapsed.add(listId);
        await this.preferencesManager.set('board.collapsedLists', Array.from(collapsed));
        this.refreshBoard();
      });
    });

    document.querySelectorAll('.column-header-collapsed, .expand-list-btn').forEach(el => {
      el.addEventListener('click', async (e) => {
        e.stopPropagation();
        const listId = el.dataset.listId || el.closest('.kanban-column')?.dataset.listId;
        if (!listId) return;
        const collapsed = new Set(this.preferencesManager.get('board.collapsedLists') || []);
        collapsed.delete(listId);
        await this.preferencesManager.set('board.collapsedLists', Array.from(collapsed));
        this.refreshBoard();
      });
    });
  }

  bindAddCardButtons() {
    document.querySelectorAll('.btn-add-card-header, .btn-add-card-footer').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const listId = btn.dataset.listId || 'backlog';
        this.handleCreateCard(listId);
      });
    });
  }

  bindCardClickListeners() {
    document.querySelectorAll('.kanban-card-wrapper').forEach(cardEl => {
      cardEl.addEventListener('click', (e) => {
        if (cardEl.classList.contains('dragging')) return;

        const cardId = cardEl.dataset.cardId;
        const card = this.db.cards.get(cardId);
        if (!card) return;

        // Per PRD §8.1: Clicking a project card opens its edit modal.
        // Inside the modal is a button to navigate to the project board.
        this.cardModal.open(card);
      });
    });
  }

  bindHeaderEvents() {
    const createCardBtn = document.getElementById('create-card-btn');
    if (createCardBtn) {
      createCardBtn.addEventListener('click', () => {
        this.handleCreateCard('backlog');
      });
    }

    const openFolderBtn = document.getElementById('open-folder-btn');
    if (openFolderBtn) {
      openFolderBtn.addEventListener('click', async () => {
        try {
          if ('showDirectoryPicker' in window) {
            const handle = await window.showDirectoryPicker();
            await this.openWorkspaceHandle(handle);
          } else {
            alert('File System Access API is not supported in this browser. Please use Chrome, Edge, or Opera.');
          }
        } catch (e) {
          // Cancelled by user
        }
      });
    }

    const searchInput = document.getElementById('global-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        this.state.filterSearch = searchInput.value;
        this.refreshBoard();
      });
    }

    const swimlaneSelect = document.getElementById('swimlane-select');
    if (swimlaneSelect) {
      swimlaneSelect.addEventListener('change', async () => {
        const val = swimlaneSelect.value || null;
        await this.preferencesManager.set('board.swimlaneBy', val);
        this.refreshBoard();
      });
    }

    const settingsBtn = document.getElementById('open-settings-btn');
    if (settingsBtn) {
      settingsBtn.addEventListener('click', () => {
        this.settingsModal.open();
      });
    }
  }
}

// Auto-boot on DOM ready if window exists
if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    window.app = new SoloKanbanApp();
    window.app.init();
  });
}
