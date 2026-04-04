import './styles/pipeline-helper.css';
import { PipelineEditor } from './editor.js';
import { generateCode } from './code-generator.js';
import { PipelineExecutor } from './pipeline-executor.js';
import { importFromHtml } from './html-parser.js';
import { showInspector } from './ui/inspector.js';

let editor: PipelineEditor | null = null;
let executor: PipelineExecutor | null = null;

document.addEventListener('DOMContentLoaded', async () => {
  const container = document.getElementById('rete-container');
  if (!container) return;

  // Initialize editor
  editor = new PipelineEditor(container);

  // Check if we received code from the playground
  const urlParams = new URLSearchParams(window.location.search);
  const from = urlParams.get('from');
  let imported = false;

  if (from === 'playground') {
    const code = sessionStorage.getItem('pipeline-helper-code');
    console.log('[pipeline-helper] from=playground, code length:', code?.length ?? 0);
    if (code) {
      sessionStorage.removeItem('pipeline-helper-code');
      // Clean URL
      const url = new URL(window.location.href);
      url.searchParams.delete('from');
      window.history.replaceState({}, '', url.toString());
      // Import the HTML pipeline
      try {
        await importFromHtml(editor, code);
        imported = true;
        console.log('[pipeline-helper] Import successful, nodes:', editor.getNodes().length);
      } catch (err) {
        console.error('[pipeline-helper] Import error:', err);
      }
    }
  }

  if (!imported) {
    await editor.createExamplePipeline();
  }

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
    'btn-add-chart': 'chart',
    'btn-add-list': 'list',
    'btn-add-kpi': 'kpi',
    'btn-add-display': 'display',
    'btn-add-podium': 'podium',
    'btn-add-a11y': 'a11y',
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
    } catch (err: any) {
      console.error('Pipeline execution error:', err);
    }

    // Re-enable button after a short delay (events are async)
    setTimeout(() => {
      btn.disabled = false;
      btn.textContent = 'Executer';
    }, 1000);
  });

  // Delete button
  document.getElementById('btn-delete')?.addEventListener('click', () => {
    editor?.removeSelected();
  });

  // Arrange button
  document.getElementById('btn-arrange')?.addEventListener('click', () => {
    editor?.autoArrange();
  });

  // Fit/zoom button
  document.getElementById('btn-fit')?.addEventListener('click', () => {
    editor?.zoomToFit();
  });

  // Generate code button
  document.getElementById('btn-generate')?.addEventListener('click', () => {
    if (!editor) return;

    const code = generateCode(editor.getNodes(), editor.getConnections());
    const codePanel = document.getElementById('code-panel');
    const codeOutput = document.getElementById('code-output');

    if (codePanel && codeOutput) {
      codePanel.style.display = 'block';
      codeOutput.textContent = code;
    }
  });

  // Copy code button
  document.getElementById('btn-copy-code')?.addEventListener('click', () => {
    const codeOutput = document.getElementById('code-output');
    if (codeOutput?.textContent) {
      navigator.clipboard.writeText(codeOutput.textContent);
      const btn = document.getElementById('btn-copy-code');
      if (btn) {
        const original = btn.textContent;
        btn.textContent = 'Copie !';
        setTimeout(() => { btn.textContent = original; }, 1500);
      }
    }
  });

  // Open in playground button
  document.getElementById('btn-playground')?.addEventListener('click', () => {
    const codeOutput = document.getElementById('code-output');
    if (codeOutput?.textContent) {
      sessionStorage.setItem('playground-code', codeOutput.textContent);
      window.location.href = '../../apps/playground/?from=pipeline-helper';
    }
  });

  // Help toggle button
  document.getElementById('btn-toggle-help')?.addEventListener('click', () => {
    const el = document.getElementById('onboarding');
    if (el) {
      const visible = el.style.display !== 'none';
      el.style.display = visible ? 'none' : 'block';
    }
  });

  // Dismiss onboarding
  document.getElementById('btn-dismiss-onboarding')?.addEventListener('click', () => {
    const el = document.getElementById('onboarding');
    if (el) el.style.display = 'none';
    localStorage.setItem('pipeline-helper-onboarding-dismissed', '1');
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Delete' || e.key === 'Backspace') {
      // Only delete if not focused on an input
      const active = document.activeElement;
      if (active && (active.tagName === 'INPUT' || active.tagName === 'SELECT' || active.tagName === 'TEXTAREA')) {
        return;
      }
      editor?.removeSelected();
    }
  });
});
