import { describe, it, expect, afterEach } from 'vitest';
import '../../../packages/app-ui/src/app-assistant.js';
import '../../../packages/app-ui/src/app-diagnostic-panel.js';
import type { AppAssistant } from '../../../packages/app-ui/src/app-assistant.js';
import type { AppDiagnosticPanel } from '../../../packages/app-ui/src/app-diagnostic-panel.js';
import { DataflowRecorder, type Constat } from '@dsfr-data/shared';
import { dispatchDataLoaded } from '@/utils/data-bridge.js';

/**
 * Volet Diagnostic loge dans l'onglet « Diagnostic » du panneau de
 * l'assistant : plus de rail en bas d'ecran, un seul compteur de constats,
 * et le bouton « Diagnostic » de la barre ouvre l'onglet.
 */

/** Vue interne du panneau, pour lire l'onglet courant sans `as any`. */
interface VueAssistant {
  _onglet: 'conversation' | 'diagnostic';
}

async function monter() {
  const assistant = document.createElement('app-assistant') as AppAssistant;
  const diagnostic = document.createElement('app-diagnostic-panel') as AppDiagnosticPanel;
  document.body.append(diagnostic, assistant);
  await assistant.updateComplete;
  assistant.integrerDiagnostic(diagnostic);
  await assistant.updateComplete;
  await assistant.updateComplete;
  await diagnostic.updateComplete;
  return { assistant, diagnostic, vue: assistant as unknown as VueAssistant };
}

afterEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
  document.documentElement.style.removeProperty('--app-diagnostic-h');
});

describe('Diagnostic integre a l’assistant', () => {
  it('le volet est deplace dans l’onglet, sans rail ni reserve en bas', async () => {
    const { assistant, diagnostic } = await monter();
    expect(diagnostic.hasAttribute('integre')).toBe(true);
    expect(assistant.querySelector('.assistant-detail')?.contains(diagnostic)).toBe(true);
    // Mutation : rendre le rail en mode integre → une bande fixe revient en bas.
    expect(diagnostic.querySelector('.app-diag__rail')).toBeNull();
    expect(document.documentElement.style.getPropertyValue('--app-diagnostic-h')).toBe('0px');
    const onglets = [...assistant.querySelectorAll('.assistant-onglets [role="tab"]')].map((t) =>
      t.textContent!.trim()
    );
    expect(onglets).toEqual(['Conversation', 'Diagnostic']);
  });

  it('ouvrir le Diagnostic (bouton de la barre) ouvre le panneau sur son onglet', async () => {
    const { assistant, diagnostic, vue } = await monter();
    diagnostic.toggle(true);
    await assistant.updateComplete;
    expect(assistant.open).toBe(true);
    expect(vue._onglet).toBe('diagnostic');
    expect(assistant.querySelector('.assistant-detail')?.hasAttribute('hidden')).toBe(false);
    expect(assistant.querySelector('.assistant-conversation')?.hasAttribute('hidden')).toBe(true);
  });

  it('refermer le Diagnostic referme le panneau ; reduire le panneau referme le Diagnostic', async () => {
    const { assistant, diagnostic } = await monter();
    diagnostic.toggle(true);
    diagnostic.toggle(false);
    expect(assistant.open).toBe(false);

    diagnostic.toggle(true);
    assistant.toggle(false);
    // Mutation : retirer `_synchroniserDiagnostic(false)` de toggle() → le
    // volet reste « ouvert » et le prochain clic sur le bouton le referme.
    expect(diagnostic.isOpen).toBe(false);
  });

  it('revenir a la Conversation referme le Diagnostic sans fermer le panneau', async () => {
    const { assistant, diagnostic, vue } = await monter();
    diagnostic.toggle(true);
    await assistant.updateComplete;
    assistant.querySelector<HTMLButtonElement>('.assistant-onglets [role="tab"]')!.click();
    await assistant.updateComplete;
    expect(vue._onglet).toBe('conversation');
    expect(assistant.open).toBe(true);
    expect(diagnostic.isOpen).toBe(false);
  });

  it('l’annonce d’une erreur est rendue hors du panneau masque', async () => {
    const { assistant, diagnostic } = await monter();
    expect(assistant.open).toBe(false);
    // Trace reelle observee sur le bus (comme app-diagnostic-panel.test.ts).
    const hote = document.createElement('div');
    hote.innerHTML = '<dsfr-data-source id="src"></dsfr-data-source>';
    document.body.appendChild(hote);
    const recorder = new DataflowRecorder({ root: document.body });
    recorder.start();
    dispatchDataLoaded('src', [{ a: 1 }]);
    const trace = recorder.snapshot();
    recorder.stop();
    const erreur: Constat = {
      id: 'a/erreur@src',
      regle: 'a/erreur',
      gravite: 'erreur',
      titre: 'Source injoignable',
      explication: '',
      preuve: '',
      reperes: [],
    };
    diagnostic.constats = [erreur];
    diagnostic.trace = trace;
    await diagnostic.updateComplete;
    await assistant.updateComplete;
    const region = assistant.querySelector('[data-annonce-constats]')!;
    expect(region.closest('.assistant-panneau')).toBeNull();
    expect(region.textContent).toContain('Source injoignable');
  });
});
