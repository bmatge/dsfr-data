// Journal réseau et console (#994) : EN PREMIER, avant la bibliothèque et le
// code de l'app, pour voir leurs premières requêtes. Les modules ES
// s'évaluent dans l'ordre des imports.
import '@dsfr-data/shared/debug/installer-journal';
import './styles/pipeline-helper.css';
import { PipelineEditor } from './editor.js';
import { generateCode } from './code-generator.js';
import { PipelineExecutor } from './pipeline-executor.js';
import { importFromHtml } from './html-parser.js';
import { showInspector } from './ui/inspector.js';
import { creerAdaptateurPipeline } from './assistant/adaptateur.js';
import { monterAssistantPipeline, montrerReperePipeline } from './assistant/index.js';
import type { EtatPipeline } from './assistant/prerequis.js';
import { arriveDuBuilder, monterRetourBuilder } from './retour-builder.js';
import {
  confirmDialog,
  injectTourStyles,
  startTour,
  startTourIfFirstVisit,
  PIPELINE_TOUR,
  mountDiagnosticPanel,
  type AdaptateurReperage,
  type MountedAssistant,
} from '@dsfr-data/shared';

let editor: PipelineEditor | null = null;
let executor: PipelineExecutor | null = null;
/** Assistant contextuel (#1018), monté une fois l'éditeur Rete créé. */
let assistant: MountedAssistant | null = null;
/** Adaptateur de révélation (#1008) : il a besoin de l'éditeur. */
let adaptateur: AdaptateurReperage<EtatPipeline> | null = null;

document.addEventListener('DOMContentLoaded', async () => {
  // Volet Diagnostic (#606) — l'exécuteur instancie de vrais composants dans
  // un conteneur caché du document courant : même mode que la Carto. Le
  // Pipeline garde sa vue par nœud, plus riche ; le volet lui apporte le
  // diagnostic textuel partagé (« Copier le diagnostic »).
  const diagnostic =
    mountDiagnosticPanel({
      liveRoot: document.body,
      toggleButtonId: 'diagnostic-btn',
      // « Demander à l'assistant » (#1018) : ouvre l'assistant du Pipeline, sans
      // quitter l'app. Il lit les mêmes constats que le volet.
      canSend: true,
      envoi: 'demander',
      onSend: () => assistant?.ouvrir(),
      onMontrer: (repere) => {
        if (adaptateur) void montrerReperePipeline(repere, adaptateur);
      },
      onConstats: () => assistant?.rafraichirConstats(),
      emptyHint: 'Exécutez le pipeline pour observer ce qui transite entre les étapes.',
    }) ?? null;
  const container = document.getElementById('rete-container');
  if (!container) return;

  // Initialize editor
  editor = new PipelineEditor(container);
  const revelation = creerAdaptateurPipeline(editor);
  adaptateur = revelation;
  // Correspondance locale d'abord ; Albert en secours s'il est configuré.
  assistant = monterAssistantPipeline({ adaptateur: revelation, diagnostic });

  // Code confié par le Playground ou par le Builder (`openInPipeline`). Le
  // Builder passait `from=builder`, que rien ne lisait : le Pipeline s'ouvrait
  // sur l'exemple au lieu de son graphique (#1095).
  const urlParams = new URLSearchParams(window.location.search);
  const from = urlParams.get('from');
  let imported = false;

  if (from === 'playground' || arriveDuBuilder(from)) {
    const code = sessionStorage.getItem('pipeline-helper-code');
    // eslint-disable-next-line no-console -- debug trace for cross-app handoff
    console.log('[pipeline-helper] from=%s, code length: %d', from, code?.length ?? 0);
    if (code) {
      sessionStorage.removeItem('pipeline-helper-code');
      // Clean URL — sauf au départ du Builder : `from=builder` garde le
      // « Revenir au Builder » après un rechargement de la page.
      if (from === 'playground') {
        const url = new URL(window.location.href);
        url.searchParams.delete('from');
        window.history.replaceState({}, '', url.toString());
      }
      // Import the HTML pipeline
      try {
        await importFromHtml(editor, code);
        imported = true;
        // eslint-disable-next-line no-console -- debug trace for cross-app handoff
        console.log('[pipeline-helper] Import successful, nodes:', editor.getNodes().length);
      } catch (err) {
        console.error('[pipeline-helper] Import error:', err);
      }
    }
  }

  if (!imported) {
    await editor.createExamplePipeline();
  }

  // « Revenir au Builder » (#1095) : après l'import, pour que le code
  // d'arrivée soit celui du pipeline tel que l'usager le découvre.
  const editeur = editor;
  monterRetourBuilder({
    from,
    codeCourant: () => generateCode(editeur.getNodes(), editeur.getConnections()),
  });

  // Inspector: show data when a node is clicked
  editor.onNodeSelected = (node) => {
    showInspector(node);
  };

  // Toolbar: add node buttons
  const nodeButtons: Record<string, string> = {
    'btn-add-source': 'source',
    'btn-add-normalize': 'normalize',
    'btn-add-query': 'query',
    'btn-add-join': 'join',
    'btn-add-search': 'search',
    'btn-add-facets': 'facets',
    'btn-add-output': 'output',
  };

  for (const [btnId, nodeType] of Object.entries(nodeButtons)) {
    const btn = document.getElementById(btnId);
    btn?.addEventListener('click', () => {
      editor?.addNode(nodeType);
    });
  }

  // Execute pipeline button
  executor = new PipelineExecutor();

  document.getElementById('btn-execute')?.addEventListener('click', async () => {
    if (!editor || !executor) return;

    const btn = document.getElementById('btn-execute') as HTMLButtonElement;
    btn.disabled = true;
    btn.textContent = 'Execution...';

    // Reset previous statuses
    executor.resetStatuses(editor.getNodes());

    // Run the pipeline
    try {
      await executor.execute(editor.getNodes(), editor.getConnections());
    } catch (err) {
      console.error('Pipeline execution error:', err);
    }

    refreshCode();

    // Re-enable button after a short delay (events are async)
    setTimeout(() => {
      btn.disabled = false;
      btn.textContent = 'Exécuter';
    }, 1000);
  });

  // Delete button
  // Suppression : confirmation seulement si le nœud a du contenu (lot UX 6, #543)
  const deleteSelected = async () => {
    if (!editor) return;
    if (
      editor.selectedHaveContent() &&
      !(await confirmDialog('Supprimer le(s) nœud(s) sélectionné(s) et leurs connexions ?'))
    )
      return;
    void editor.removeSelected();
  };
  document.getElementById('btn-delete')?.addEventListener('click', () => void deleteSelected());

  // Arrange button
  document.getElementById('btn-arrange')?.addEventListener('click', () => {
    editor?.autoArrange();
  });

  // Fit/zoom button
  document.getElementById('btn-fit')?.addEventListener('click', () => {
    editor?.zoomToFit();
  });

  // Generate code → open modal
  /** Onglet « Code » : reflète le pipeline courant. */
  const refreshCode = () => {
    if (!editor) return '';
    const code = generateCode(editor.getNodes(), editor.getConnections());
    const codeOutput = document.getElementById('code-output');
    if (codeOutput) codeOutput.textContent = code;
    return code;
  };
  document.getElementById('pipeline-tab-code-btn')?.addEventListener('click', refreshCode);

  // « Copier le code » (barre d'actions) : copie directe + onglet Code à jour
  document.getElementById('btn-generate')?.addEventListener('click', () => {
    const code = refreshCode();
    if (!code) return;
    navigator.clipboard.writeText(code).catch(() => {});
    const btn = document.getElementById('btn-generate');
    if (btn) {
      const original = btn.textContent;
      btn.textContent = 'Copié !';
      setTimeout(() => {
        btn.textContent = original;
      }, 1500);
    }
  });

  // Open in playground (modale « code » et menu « Ouvrir dans ▾ » de la barre)
  const openInPlayground = () => {
    const code = refreshCode();
    if (code) {
      sessionStorage.setItem('playground-code', code);
      window.location.href = '../../apps/playground/?from=pipeline-helper';
    }
  };
  document.getElementById('btn-playground')?.addEventListener('click', openInPlayground);
  document.getElementById('open-playground-btn')?.addEventListener('click', openInPlayground);

  // « Visite guidée » (lot UX 7, #544) : tour partagé, auto au premier passage.
  // Étapes en repères (#1013) : l'adaptateur sélectionne l'onglet avant de montrer.
  injectTourStyles();
  const visite = { ...PIPELINE_TOUR, adaptateur: revelation };
  document.getElementById('btn-toggle-help')?.addEventListener('click', () => startTour(visite));
  startTourIfFirstVisit(visite);

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Delete' || e.key === 'Backspace') {
      // Only delete if not focused on an input
      const active = document.activeElement;
      if (
        active &&
        (active.tagName === 'INPUT' || active.tagName === 'SELECT' || active.tagName === 'TEXTAREA')
      ) {
        return;
      }
      void deleteSelected();
    }
  });
});
