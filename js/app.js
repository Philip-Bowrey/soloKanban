import * as fsLayer from './fs.js';
import * as state from './state.js';
import { renderAll } from './render.js';
import { initShortcuts } from './shortcuts.js';

const openBtn = document.getElementById('open-board-btn');
const continueBtn = document.getElementById('continue-board-btn');
const unsupportedEl = document.getElementById('unsupported-notice');
const pickerEl = document.getElementById('board-picker');
const appEl = document.getElementById('app');
const searchInput = document.getElementById('search-input');
const themeToggleBtn = document.getElementById('theme-toggle-btn');
const exportBtn = document.getElementById('export-board-btn');

async function boot() {
  if (!fsLayer.isSupported()) {
    unsupportedEl.classList.remove('hidden');
    pickerEl.classList.add('hidden');
    return;
  }

  state.subscribe(renderAll);
  initShortcuts();

  openBtn.addEventListener('click', async () => {
    try {
      const ctx = await fsLayer.pickAndOpenBoard();
      state.setCtx(ctx);
      showApp();
    } catch (err) {
      if (err.name !== 'AbortError') console.error('Failed to open board', err);
    }
  });

  const remembered = await fsLayer.getRememberedBoardHandle().catch(() => null);
  if (remembered) {
    continueBtn.classList.remove('hidden');
    continueBtn.textContent = `Continue with "${remembered.name}"`;
    continueBtn.addEventListener('click', async () => {
      try {
        const granted = await fsLayer.ensurePermission(remembered);
        if (!granted) { alert('Permission was not granted for that folder.'); return; }
        const ctx = await fsLayer.openBoardFromHandle(remembered);
        state.setCtx(ctx);
        showApp();
      } catch (err) {
        console.error('Failed to reopen remembered board', err);
        alert('Could not reopen that folder. It may have been moved or deleted — try "Open a board folder" instead.');
      }
    });
  }

  wireTopBar();
}

function showApp() {
  pickerEl.classList.add('hidden');
  appEl.classList.remove('hidden');
}

function wireTopBar() {
  searchInput.addEventListener('input', () => {
    state.setFilter({ text: searchInput.value });
  });

  themeToggleBtn.addEventListener('click', () => {
    const ctx = state.getCtx();
    if (!ctx) return;
    const order = ['system', 'light', 'dark'];
    const next = order[(order.indexOf(ctx.board.theme.mode) + 1) % order.length];
    state.updateTheme({ mode: next });
    themeToggleBtn.textContent = themeLabel(next);
  });

  exportBtn.addEventListener('click', exportBoardAsZip);
}

function themeLabel(mode) {
  return { system: '🖥 System', light: '☀ Light', dark: '🌙 Dark' }[mode] || mode;
}

async function exportBoardAsZip() {
  const ctx = state.getCtx();
  if (!ctx) return;
  alert(
    'Export bundles every file in this board folder into a .zip for backup.\n\n' +
    'This build does not vendor a zip library, so as a fallback: your board folder ' +
    'already IS the backup — copy, sync, or git-commit it directly from your file manager.'
  );
}

boot();
