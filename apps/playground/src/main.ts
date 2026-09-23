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
  startTour,
  PLAYGROUND_TOUR,
  exportPreviewImage,
  ImageExportError,
  IMAGE_EXPORT_MESSAGES,
  toastError,
  mountDiagnosticPanel,
  CLE_CODE_RAPPORTE,
  REGLES_GENERIQUES,
  type MountedAssistant,
} from '@dsfr-data/shared';
import { initEditor } from './editor.js';
import type { CodeMirrorEditor } from './editor.js';
import { examples } from './examples/examples-data.js';
import { EXEMPLE_PAR_DEFAUT } from './examples/catalogue.js';
import { initSelecteurExemples, type SelecteurExemples } from './examples/selector.js';
import { getPreviewHTML } from './preview.js';
import { creerAdaptateurPlayground } from './assistant/adaptateur.js';
import { monterAssistantPlayground, montrerReperePlayground } from './assistant/index.js';
import { REGLE_BALISAGE } from './assistant/constats-balisage.js';

let editor: CodeMirrorEditor;
let selecteur: SelecteurExemples | null = null;
/** Code de l'exemple actuellement charge, pour distinguer une VRAIE edition. */
let codeCharge = '';
/** Id de cet exemple, pour reculer le selecteur si le remplacement est refuse. */
let codeChargeId = '';

/** Standard dependency block for external use */
const DEPS_BLOCK = `<!-- Dependances (DSFR + DSFR Chart + dsfr-data) -->
<link rel="stylesheet" href="${CDN_URLS.dsfrCss}">
<link rel="stylesheet" href="${CDN_URLS.dsfrUtilityCss}">
<link rel="stylesheet" href="${CDN_URLS.dsfrChartCss}">
<script type="module" src="${CDN_URLS.dsfrChartJs}"></script>
<script src="${LIB_URL}/dsfr-data.core.umd.js"></script>

`;

/**
 * Regex to detect dependency lines (CDN links for dsfr, DSFRChart, dsfr-data).
 * `chart\.js` reste dans le motif pour nettoyer les snippets anterieurs a #656
 * (DSFR Chart embarque Chart.js, on ne l'injecte plus) — jamais pour l'ajouter.
 */
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
    btn.textContent = 'Retirer les dépendances';
    btn.title = 'Retirer les dépendances CDN';
  } else {
    btn.textContent = 'Ajouter des dépendances';
    btn.title = 'Ajouter les dépendances CDN pour usage externe';
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
    iframe.srcdoc = getPreviewHTML(code, { debug: true });
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
  const code = examples[name];
  if (!code) return;

  // La confirmation ne protege que du travail reel : on ne la pose que si
  // l'editeur s'ecarte de l'exemple charge. Passer d'un exemple intact a un
  // autre ne demande plus rien — c'est la manoeuvre courante du playground.
  const modifie = editor.getValue().trim() !== codeCharge.trim();
  if (
    !skipConfirm &&
    modifie &&
    editor.getValue().trim() &&
    !(await confirmDialog('Remplacer vos modifications par cet exemple ?'))
  ) {
    // Refus : le selecteur doit continuer de designer ce qui est REELLEMENT
    // charge, sinon l'interface annonce un exemple que l'editeur ne contient pas.
    selecteur?.pointerSur(name === codeChargeId ? name : codeChargeId);
    return;
  }

  editor.setValue(code);
  codeCharge = code;
  codeChargeId = name;
  selecteur?.marquerCharge(name);
  // Le volet couvre l'editeur : le garder ouvert masquerait le code qu'on
  // vient de demander. La bascule de la barre d'actions le rouvre aussitot.
  selecteur?.basculer(false);
  DEPS_LINE_RE.lastIndex = 0;
  updateDepsButton(hasDeps(code));
  runCode();
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
    /** Originating app — maps to server column `source_app`. */
    sourceApp: string;
    createdAt: string;
  }

  const favorites = loadFromStorage<FavoriteEntry[]>(STORAGE_KEYS.FAVORITES, []);

  const favorite: FavoriteEntry = {
    id: crypto.randomUUID(),
    name,
    code,
    chartType: 'playground',
    sourceApp: 'playground',
    createdAt: new Date().toISOString(),
  };

  favorites.unshift(favorite);
  saveToStorage(STORAGE_KEYS.FAVORITES, favorites);

  // Visual feedback
  const btn = document.getElementById('save-btn');
  if (btn) {
    const originalText = btn.textContent;
    btn.textContent = 'Ajouté aux favoris';
    btn.style.background = 'var(--background-contrast-success)';
    setTimeout(() => {
      btn.textContent = originalText;
      btn.style.background = '';
    }, 2000);
  }
}

// Initialization

/** Assistant contextuel (#1018), monté au chargement après le volet Diagnostic. */
let assistant: MountedAssistant | null = null;

document.addEventListener('DOMContentLoaded', async () => {
  await initAuth();

  // Show back link if navigated from another app. The `from` query param is
  // user-controlled, so only accept a whitelisted set of values and build the
  // anchor via DOM APIs (textContent) to avoid XSS.
  const fromApp = new URLSearchParams(window.location.search).get('from');
  const BACK_LABELS: Record<string, string> = {
    builder: 'Builder',
    'builder-ia': 'Builder IA',
    favorites: 'Favoris',
  };
  if (fromApp && Object.prototype.hasOwnProperty.call(BACK_LABELS, fromApp)) {
    const backHref =
      fromApp === 'builder' || fromApp === 'builder-ia'
        ? appHref(fromApp as 'builder' | 'builder-ia', { from: 'playground' })
        : appHref(fromApp as 'favorites');
    const backBar = document.createElement('div');
    backBar.className = 'fr-mb-1w';
    const link = document.createElement('a');
    link.href = backHref;
    link.className = 'fr-link fr-icon-arrow-left-line fr-link--icon-left';
    link.textContent = `Retour au ${BACK_LABELS[fromApp]}`;
    // Le Builder rouvre sa configuration d'avant le départ, pas ce code. On lui
    // rapporte l'état réel de l'éditeur pour qu'il sache s'il va écraser une
    // modification, et puisse le dire avant de le faire (#965).
    //
    // Sur `pagehide` et non sur le clic du lien : on repart aussi par la barre
    // de navigation ou par le bouton « page précédente », et ces sorties-là
    // méritent le même avertissement.
    if (fromApp === 'builder') {
      window.addEventListener('pagehide', () => {
        try {
          sessionStorage.setItem(CLE_CODE_RAPPORTE, editor.getValue());
        } catch {
          // QuotaExceededError — le Builder avertira faute de preuve du contraire
        }
      });
    }
    backBar.appendChild(link);
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

  // Les trois selects croises peuplent eux-memes le select des exemples ; le
  // chargement initial vient de `?example=` quand il designe un exemple connu.
  selecteur = initSelecteurExemples((id) => loadExample(id));

  const exampleParam = new URLSearchParams(window.location.search).get('example');
  if (exampleParam && examples[exampleParam]) {
    selecteur?.pointerSur(exampleParam);
    loadExample(exampleParam, true);
  } else {
    selecteur?.pointerSur(EXEMPLE_PAR_DEFAUT);
    loadExample(EXEMPLE_PAR_DEFAUT, true);
  }

  // Event listeners
  document.getElementById('run-btn')?.addEventListener('click', runCode);
  document.getElementById('reset-btn')?.addEventListener('click', () => {
    const courant = selecteur?.courant();
    if (courant) loadExample(courant);
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

  // Export image de l'apercu (iframe same-origin)
  const exportImage = async (format: 'png' | 'jpg') => {
    try {
      const frame = document.getElementById('preview-frame') as HTMLIFrameElement | null;
      if (!frame) throw new ImageExportError('iframe-inaccessible');
      await exportPreviewImage(frame, format, 'apercu-playground');
    } catch (err) {
      if (err instanceof ImageExportError) toastError(IMAGE_EXPORT_MESSAGES[err.reason]);
      else throw err;
    }
  };
  document
    .getElementById('export-png-btn')
    ?.addEventListener('click', () => void exportImage('png'));
  document
    .getElementById('export-jpg-btn')
    ?.addEventListener('click', () => void exportImage('jpg'));

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

  // Volet Diagnostic (#605) : observe le pipeline qui tourne dans l'aperçu.
  // L'aperçu est une iframe srcdoc rechargée à chaque exécution — le
  // rattachement suit les rechargements, sinon le volet resterait sourd
  // après le premier « Exécuter ».
  //
  // Constats (#1009) : ceux de l'exécution (règles génériques, #996) ET ceux
  // du code (analyse statique du balisage, #995), réévalués à chaque trace sur
  // le code courant. « Me montrer » pose le curseur sur la ligne en cause
  // (repère de code) ou révèle le contrôle de l'interface (registre).
  const adaptateur = creerAdaptateurPlayground(editor, {
    ouvrirVolet: () => selecteur?.basculer(true),
  });
  const diagnostic =
    mountDiagnosticPanel({
      frame: document.getElementById('preview-frame') as HTMLIFrameElement | null,
      toggleButtonId: 'diagnostic-btn',
      // « Demander à l'assistant » (#1018) : ouvre l'assistant du Playground,
      // sans quitter l'app. Il lit les mêmes constats que le volet.
      canSend: true,
      envoi: 'demander',
      onSend: () => assistant?.ouvrir(),
      onConstats: () => assistant?.rafraichirConstats(),
      emptyHint: 'Exécutez le code pour observer ce qui transite entre les composants.',
      constats: {
        contexte: () => ({
          app: 'playground',
          etat: { code: editor.getValue() },
          origine: window.location.origin,
        }),
        regles: [...REGLES_GENERIQUES, REGLE_BALISAGE],
      },
      onMontrer: (repere) => montrerReperePlayground(repere, editor, adaptateur),
    }) ?? null;
  // Correspondance locale d'abord ; Albert en secours s'il est configuré.
  assistant = monterAssistantPlayground({ editor, adaptateur, diagnostic });

  // Product tour : auto au premier passage, sinon « Visite guidée » de la barre
  injectTourStyles();
  // Étapes en repères (#1013) : l'adaptateur ouvre le volet avant de montrer.
  const visite = { ...PLAYGROUND_TOUR, adaptateur };
  startTourIfFirstVisit(visite);
  document.getElementById('tour-btn')?.addEventListener('click', () => startTour(visite));
});
