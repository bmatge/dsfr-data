/**
 * Playground app - main entry point
 */

import {
  loadFromStorage,
  saveToStorage,
  STORAGE_KEYS,
  toastWarning,
  toastSuccess,
  appHref,
  confirmDialog,
  initAuth,
  CDN_URLS,
  LIB_URL,
  injectTourStyles,
  startTourIfFirstVisit,
  PLAYGROUND_TOUR,
} from '@dsfr-data/shared';
import { initEditor } from './editor.js';
import type { CodeMirrorEditor } from './editor.js';
import { examples } from './examples/examples-data.js';
import { getPreviewHTML } from './preview.js';

let editor: CodeMirrorEditor;

/** Standard dependency block for external use */
const DEPS_BLOCK = `<!-- Dependances (DSFR + DSFR Chart + dsfr-data) -->
<link rel="stylesheet" href="${CDN_URLS.dsfrCss}">
<link rel="stylesheet" href="${CDN_URLS.dsfrUtilityCss}">
<link rel="stylesheet" href="${CDN_URLS.dsfrChartCss}">
<script src="${CDN_URLS.chartJs}"><\/script>
<script type="module" src="${CDN_URLS.dsfrChartJs}"><\/script>
<script src="${LIB_URL}/dsfr-data.core.umd.js"><\/script>

`;

/** Regex to detect dependency lines (CDN links for dsfr, chart.js, dsfr-data) */
const DEPS_LINE_RE =
  /^[ \t]*(<link[^>]*(dsfr|DSFRChart)[^>]*>|<script[^>]*(dsfr|chart\.js|DSFRChart|dsfr-data)[^>]*><\/script>)[ \t]*\n?/gm;
const DEPS_COMMENT_RE = /^[ \t]*<!--\s*Dependances[^>]*-->\s*\n?/gm;

function hasDeps(code: string): boolean {
  return DEPS_LINE_RE.test(code) || /dsfr-data\.(core\.)?(umd|esm)\.js/.test(code);
}

function addDeps(code: string): string {
  return DEPS_BLOCK + code;
}

function removeDeps(code: string): string {
  let result = code;
  // Reset regex lastIndex (they have /g flag)
  DEPS_LINE_RE.lastIndex = 0;
  DEPS_COMMENT_RE.lastIndex = 0;
  result = result.replace(DEPS_LINE_RE, '');
  result = result.replace(DEPS_COMMENT_RE, '');
  // Clean up leading blank lines
  result = result.replace(/^\n+/, '');
  return result;
}

function updateDepsButton(hasDepsState: boolean): void {
  const btn = document.getElementById('deps-btn');
  if (!btn) return;
  if (hasDepsState) {
    btn.innerHTML = '<i class="ri-code-s-slash-line" aria-hidden="true"></i> - Deps';
    btn.title = 'Retirer les dependances CDN';
  } else {
    btn.innerHTML = '<i class="ri-code-s-slash-line" aria-hidden="true"></i> + Deps';
    btn.title = 'Ajouter les dependances CDN pour usage externe';
  }
}

function toggleDeps(): void {
  const code = editor.getValue();
  DEPS_LINE_RE.lastIndex = 0;
  if (hasDeps(code)) {
    editor.setValue(removeDeps(code));
    updateDepsButton(false);
  } else {
    editor.setValue(addDeps(code));
    updateDepsButton(true);
  }
  runCode();
}

function runCode(): void {
  const code = editor.getValue();
  const iframe = document.getElementById('preview-frame') as HTMLIFrameElement | null;
  if (iframe) {
    iframe.srcdoc = getPreviewHTML(code);
    // Auto-resize iframe to fit its content once loaded
    iframe.onload = () => autoResizeIframe(iframe);
  }
}

/** Resize iframe height to match its content, with a ResizeObserver for dynamic content */
function autoResizeIframe(iframe: HTMLIFrameElement): void {
  try {
    const doc = iframe.contentDocument;
    if (!doc?.body) return;

    const resize = () => {
      const height = doc.documentElement.scrollHeight;
      if (height > 0) {
        iframe.style.height = height + 'px';
      }
    };

    // Initial sizing after a short delay (let charts/components render)
    setTimeout(resize, 300);
    setTimeout(resize, 1000);

    // Watch for dynamic content changes (chart renders, data loads, etc.)
    const ro = new ResizeObserver(resize);
    ro.observe(doc.body);
  } catch {
    // Cross-origin iframe — can't access content, keep default sizing
  }
}

async function loadExample(name: string, skipConfirm = false): Promise<void> {
  if (examples[name]) {
    if (
      !skipConfirm &&
      editor.getValue().trim() &&
      !(await confirmDialog('Remplacer le code actuel par cet exemple ?'))
    )
      return;
    editor.setValue(examples[name]);
    DEPS_LINE_RE.lastIndex = 0;
    updateDepsButton(hasDeps(examples[name]));
    runCode();
  }
}

function copyCode(): void {
  const code = editor.getValue();
  if (!code || code.trim() === '') return;

  navigator.clipboard.writeText(code).then(() => {
    toastSuccess('Code copie dans le presse-papiers');
  });
}

function saveFavorite(): void {
  const code = editor.getValue();

  if (!code || code.trim() === '') {
    toastWarning('Ecrivez du code avant de le sauvegarder en favori.');
    return;
  }

  const name = prompt('Nom du favori :', 'Mon code');
  if (!name) return;

  interface FavoriteEntry {
    id: string;
    name: string;
    code: string;
    chartType: string;
    source: string;
    createdAt: string;
  }

  const favorites = loadFromStorage<FavoriteEntry[]>(STORAGE_KEYS.FAVORITES, []);

  const favorite: FavoriteEntry = {
    id: crypto.randomUUID(),
    name,
    code,
    chartType: 'playground',
    source: 'playground',
    createdAt: new Date().toISOString(),
  };

  favorites.unshift(favorite);
  saveToStorage(STORAGE_KEYS.FAVORITES, favorites);

  // Visual feedback
  const btn = document.getElementById('save-btn');
  if (btn) {
    const originalHTML = btn.innerHTML;
    btn.innerHTML = '<i class="ri-check-line" aria-hidden="true"></i> Sauvegarde !';
    btn.style.background = 'var(--background-contrast-success)';
    setTimeout(() => {
      btn.innerHTML = originalHTML;
      btn.style.background = '';
    }, 2000);
  }
}

// Initialization
document.addEventListener('DOMContentLoaded', async () => {
  await initAuth();

  // Show back link if navigated from another app
  const fromApp = new URLSearchParams(window.location.search).get('from');
  if (fromApp) {
    // When going back to builder, pass from=playground so builder can restore its state
    const backHref =
      fromApp === 'builder' || fromApp === 'builder-ia'
        ? appHref(fromApp as any, { from: 'playground' })
        : appHref(fromApp as any);
    const backLabel =
      fromApp === 'builder' ? 'Builder' : fromApp === 'builder-ia' ? 'Builder IA' : fromApp;
    const backBar = document.createElement('div');
    backBar.className = 'fr-mb-1w';
    backBar.innerHTML = `<a href="${backHref}" class="fr-link fr-icon-arrow-left-line fr-link--icon-left">Retour au ${backLabel}</a>`;
    const main = document.querySelector('main .fr-container') || document.querySelector('main');
    if (main) main.prepend(backBar);
  }

  editor = initEditor('code-editor');

  // Dynamically size CodeMirror to fill the editor panel
  const editorPanel = document.querySelector('.playground-editor') as HTMLElement;
  const toolbar = document.querySelector('.editor-toolbar') as HTMLElement;
  if (editorPanel && toolbar) {
    const sizeEditor = () => {
      const available = editorPanel.clientHeight - toolbar.offsetHeight;
      if (available > 0) {
        editor.setSize(null, available);
      }
    };
    new ResizeObserver(sizeEditor).observe(editorPanel);
    sizeEditor();
  }

  // Load example from URL param, favorites, or default
  const exampleParam = new URLSearchParams(window.location.search).get('example');
  if (exampleParam && examples[exampleParam]) {
    // Select the matching option in the dropdown
    const select = document.getElementById('example-select') as HTMLSelectElement;
    if (select) select.value = exampleParam;
    loadExample(exampleParam, true);
  } else {
    loadExample('direct-bar', true);
  }

  // Event listeners
  document.getElementById('run-btn')?.addEventListener('click', runCode);
  document.getElementById('reset-btn')?.addEventListener('click', () => {
    const select = document.getElementById('example-select') as HTMLSelectElement;
    loadExample(select.value);
  });
  document.getElementById('example-select')?.addEventListener('change', (e) => {
    loadExample((e.target as HTMLSelectElement).value);
  });

  // Ctrl+Enter shortcut
  editor.on('keydown', (_cm: CodeMirrorEditor, event: KeyboardEvent) => {
    if (event.ctrlKey && event.key === 'Enter') {
      runCode();
    }
  });

  // Ctrl+S shortcut - save to favorites
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      const saveBtn = document.getElementById('save-btn');
      if (saveBtn) saveBtn.click();
    }
  });

  // Dependencies toggle
  document.getElementById('deps-btn')?.addEventListener('click', toggleDeps);

  // Copy code button
  document.getElementById('copy-btn')?.addEventListener('click', copyCode);

  // Save to favorites button
  document.getElementById('save-btn')?.addEventListener('click', saveFavorite);

  // Pipeline helper button
  document.getElementById('pipeline-btn')?.addEventListener('click', () => {
    const code = editor.getValue();
    if (!code.trim()) return;
    sessionStorage.setItem('pipeline-helper-code', code);
    window.location.href = appHref('pipeline-helper', { from: 'playground' });
  });

  // Load code from sessionStorage if coming from another app
  const urlParams = new URLSearchParams(window.location.search);
  const from = urlParams.get('from');
  if (
    from === 'favorites' ||
    from === 'builder' ||
    from === 'builder-ia' ||
    from === 'pipeline-helper'
  ) {
    const savedCode = sessionStorage.getItem('playground-code');
    if (savedCode) {
      editor.setValue(savedCode);
      DEPS_LINE_RE.lastIndex = 0;
      updateDepsButton(hasDeps(savedCode));
      runCode();
      sessionStorage.removeItem('playground-code');
    }
  }

  // Product tour
  injectTourStyles();
  startTourIfFirstVisit(PLAYGROUND_TOUR);
});
