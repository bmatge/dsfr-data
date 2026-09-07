import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AppDiagnosticPanel } from '../../../packages/app-ui/src/app-diagnostic-panel.js';
import { DataflowRecorder, mountDiagnosticPanel, type Trace } from '@dsfr-data/shared';
import { dispatchDataLoaded, dispatchDataError, clearDataCache } from '@/utils/data-bridge.js';

/**
 * Le volet Diagnostic (#605).
 *
 * Deux axes verifies ici : le RENDU (ce que l'utilisateur lit doit
 * correspondre a la trace) et l'ACCESSIBILITE (bascule annoncee, region
 * etiquetee, Echap, onglets) — la suite a deja des tests RGAA et axe-core,
 * autant tenir la barre des le depart.
 *
 * Le test le plus important est celui du rail : si l'etat replie n'informe
 * pas, personne n'ouvrira le volet et tout le chantier est inerte.
 */

const STORAGE_KEY = 'dsfr-data-diagnostic-open';

/** Construit une trace reelle en observant le vrai bus. */
function buildTrace(html: string, emit: () => void): { trace: Trace; cleanup: () => void } {
  const host = document.createElement('div');
  host.innerHTML = html;
  document.body.appendChild(host);
  const recorder = new DataflowRecorder({ root: document.body });
  recorder.start();
  emit();
  const trace = recorder.snapshot();
  recorder.stop();
  return { trace, cleanup: () => host.remove() };
}

async function mountPanel(): Promise<AppDiagnosticPanel> {
  const panel = document.createElement('app-diagnostic-panel') as AppDiagnosticPanel;
  document.body.appendChild(panel);
  await panel.updateComplete;
  return panel;
}

describe('app-diagnostic-panel', () => {
  // Ce test tient un role structurel : il utilise la classe en position de
  // VALEUR. Sans lui, l'import ne servirait qu'a typer (`as
  // AppDiagnosticPanel`), TypeScript l'eliderait, le module ne serait jamais
  // evalue et le custom element jamais enregistre — tous les autres tests du
  // fichier echoueraient sur un HTMLElement nu. Meme role que dans
  // app-action-bar.test.ts.
  it('est enregistré comme custom element', () => {
    expect(customElements.get('app-diagnostic-panel')).toBe(AppDiagnosticPanel);
  });

  let panel: AppDiagnosticPanel | undefined;
  let cleanup: (() => void) | undefined;

  beforeEach(() => {
    localStorage.removeItem(STORAGE_KEY);
    for (const id of ['src', 'q1', 'c1']) clearDataCache(id);
  });

  afterEach(() => {
    panel?.remove();
    panel = undefined;
    cleanup?.();
    cleanup = undefined;
  });

  describe('le rail replié', () => {
    it('est fermé au premier lancement — le volet ne s’impose pas', async () => {
      panel = await mountPanel();

      expect(panel.isOpen).toBe(false);
      expect(panel.querySelector('.app-diag__body')?.hasAttribute('hidden')).toBe(true);
    });

    it('annonce l’absence d’exécution plutôt que de rester muet', async () => {
      panel = await mountPanel();

      expect(panel.querySelector('.app-diag__rail-summary')?.textContent).toContain(
        'aucune exécution'
      );
    });

    it('porte le résumé chiffré — c’est ce qui donne envie de l’ouvrir', async () => {
      const built = buildTrace(
        `<dsfr-data-source id="src"></dsfr-data-source>
         <dsfr-data-query id="q1" source="src"></dsfr-data-query>`,
        () => {
          dispatchDataLoaded(
            'src',
            Array.from({ length: 100 }, () => ({ a: 1 }))
          );
          dispatchDataLoaded(
            'q1',
            Array.from({ length: 8 }, () => ({ a: 1 }))
          );
        }
      );
      cleanup = built.cleanup;
      panel = await mountPanel();
      panel.trace = built.trace;
      await panel.updateComplete;

      const summary = panel.querySelector('.app-diag__rail-summary')?.textContent ?? '';
      expect(summary).toContain('2 étapes');
      expect(summary).toContain('100 → 8 lignes');
    });

    it('signale les alertes dans le rail', async () => {
      const built = buildTrace(`<dsfr-data-source id="src"></dsfr-data-source>`, () => {
        dispatchDataLoaded('src', []);
      });
      cleanup = built.cleanup;
      panel = await mountPanel();
      panel.trace = built.trace;
      await panel.updateComplete;

      expect(panel.querySelector('.app-diag__alert')?.textContent).toContain('alerte');
    });

    it('affiche l’absence d’alerte sur une chaîne saine', async () => {
      const built = buildTrace(`<dsfr-data-source id="src"></dsfr-data-source>`, () => {
        dispatchDataLoaded('src', [{ a: 1 }]);
      });
      cleanup = built.cleanup;
      panel = await mountPanel();
      panel.trace = built.trace;
      await panel.updateComplete;

      expect(panel.querySelector('.app-diag__ok')?.textContent).toContain('aucune alerte');
    });
  });

  describe('accessibilité', () => {
    it('la bascule annonce son état et désigne la région pilotée', async () => {
      panel = await mountPanel();
      const rail = panel.querySelector('.app-diag__rail') as HTMLButtonElement;
      const body = panel.querySelector('.app-diag__body') as HTMLElement;

      expect(rail.getAttribute('aria-expanded')).toBe('false');
      expect(rail.getAttribute('aria-controls')).toBe(body.id);
      expect(body.id).toBeTruthy();

      rail.click();
      await panel.updateComplete;

      expect(rail.getAttribute('aria-expanded')).toBe('true');
    });

    it('la région est étiquetée', async () => {
      panel = await mountPanel();
      const body = panel.querySelector('.app-diag__body') as HTMLElement;

      expect(body.getAttribute('role')).toBe('region');
      expect(body.getAttribute('aria-label')).toBeTruthy();
    });

    it('Échap referme le volet ouvert', async () => {
      panel = await mountPanel();
      panel.toggle(true);
      await panel.updateComplete;

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      await panel.updateComplete;

      expect(panel.isOpen).toBe(false);
    });

    it('Échap ne fait rien quand le volet est déjà fermé', async () => {
      // Le volet n'est pas modal : il ne doit pas capter Echap au detriment
      // d'une modale ou d'un menu ouvert par-dessus.
      panel = await mountPanel();
      const toggled = vi.fn();
      panel.addEventListener('diagnostic-toggle', toggled);

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

      expect(toggled).not.toHaveBeenCalled();
    });

    it('les onglets forment un tablist avec un seul sélectionné', async () => {
      panel = await mountPanel();
      panel.toggle(true);
      await panel.updateComplete;

      const tabs = Array.from(panel.querySelectorAll('[role="tab"]'));
      expect(tabs).toHaveLength(3);
      expect(tabs.filter((t) => t.getAttribute('aria-selected') === 'true')).toHaveLength(1);
      expect(panel.querySelector('[role="tablist"]')?.getAttribute('aria-label')).toBeTruthy();
    });

    it('retire son écouteur clavier au démontage', async () => {
      panel = await mountPanel();
      panel.toggle(true);
      await panel.updateComplete;
      panel.remove();

      // Ne doit pas jeter : l'ecouteur ne doit plus toucher un composant
      // detache (fuite classique des tiroirs).
      expect(() =>
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
      ).not.toThrow();
    });
  });

  describe('onglet Flux', () => {
    it('rend une carte par étape, en ordre amont → aval', async () => {
      const built = buildTrace(
        `<dsfr-data-chart id="c1" source="q1"></dsfr-data-chart>
         <dsfr-data-query id="q1" source="src"></dsfr-data-query>
         <dsfr-data-source id="src"></dsfr-data-source>`,
        () => dispatchDataLoaded('src', [{ a: 1 }])
      );
      cleanup = built.cleanup;
      panel = await mountPanel();
      panel.trace = built.trace;
      panel.toggle(true);
      await panel.updateComplete;

      const ids = Array.from(panel.querySelectorAll('.app-diag__stage-id')).map(
        (el) => el.textContent
      );
      expect(ids).toEqual(['src', 'q1', 'c1']);
    });

    it('affiche l’échec et l’URL réellement appelée (#603)', async () => {
      const built = buildTrace(`<dsfr-data-source id="src"></dsfr-data-source>`, () => {
        dispatchDataError('src', new Error('HTTP 400: Bad Request'), 'https://api.fr/data?x=1');
      });
      cleanup = built.cleanup;
      panel = await mountPanel();
      panel.trace = built.trace;
      panel.toggle(true);
      await panel.updateComplete;

      const text = panel.textContent ?? '';
      expect(text).toContain('HTTP 400: Bad Request');
      expect(text).toContain('https://api.fr/data?x=1');
    });

    it('signale un amont introuvable', async () => {
      const built = buildTrace(
        `<dsfr-data-chart id="c1" source="fantome"></dsfr-data-chart>`,
        () => {}
      );
      cleanup = built.cleanup;
      panel = await mountPanel();
      panel.trace = built.trace;
      panel.toggle(true);
      await panel.updateComplete;

      expect(panel.textContent).toContain('fantome');
    });
  });

  describe('onglet Champs', () => {
    it('rend la matrice champ × étape avec les absences', async () => {
      const built = buildTrace(
        `<dsfr-data-source id="src"></dsfr-data-source>
         <dsfr-data-query id="q1" source="src"></dsfr-data-query>`,
        () => {
          dispatchDataLoaded('src', [{ dept: 'A', montant: 1 }]);
          dispatchDataLoaded('q1', [{ dept: 'A', montant__sum: 1 }]);
        }
      );
      cleanup = built.cleanup;
      panel = await mountPanel();
      panel.trace = built.trace;
      panel.toggle(true);
      await panel.updateComplete;

      const champsTab = Array.from(panel.querySelectorAll('[role="tab"]')).find(
        (t) => t.textContent?.trim() === 'Champs'
      ) as HTMLButtonElement;
      champsTab.click();
      await panel.updateComplete;

      const rows = Array.from(panel.querySelectorAll('tbody tr')).map(
        (tr) => tr.querySelector('th')?.textContent
      );
      expect(rows).toEqual(['dept', 'montant', 'montant__sum']);
      // Un champ disparu en aval est marque absent : c'est LA lecture qui
      // explique une dataviz vide apres un renommage amont.
      expect(panel.querySelectorAll('td[data-absent="true"]').length).toBe(2);
    });
  });

  describe('le texte du diagnostic — un seul format', () => {
    it('est celui que copient ET envoient les deux boutons', async () => {
      const built = buildTrace(`<dsfr-data-source id="src"></dsfr-data-source>`, () =>
        dispatchDataLoaded('src', [{ a: 1 }])
      );
      cleanup = built.cleanup;
      panel = await mountPanel();
      panel.trace = built.trace;
      panel.canSend = true;
      panel.toggle(true);
      await panel.updateComplete;

      const sent = vi.fn();
      panel.addEventListener('diagnostic-send', (e) =>
        sent((e as CustomEvent<{ text: string }>).detail.text)
      );
      const sendBtn = Array.from(panel.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('assistant')
      ) as HTMLButtonElement;
      sendBtn.click();

      // Le contrat central du chantier : ce que l'utilisateur lit et ce que
      // l'assistant recoit sont le MEME objet.
      expect(sent).toHaveBeenCalledWith(panel.diagnosticText);
      expect(panel.diagnosticText).toContain('Flux —');
    });

    it('n’affiche pas le bouton d’envoi hors apps conversationnelles', async () => {
      panel = await mountPanel();
      panel.toggle(true);
      await panel.updateComplete;

      const sendBtn = Array.from(panel.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('assistant')
      );
      expect(sendBtn).toBeUndefined();
    });
  });

  describe('persistance', () => {
    it('retient l’ouverture entre deux visites', async () => {
      panel = await mountPanel();
      panel.toggle(true);
      panel.remove();

      const second = await mountPanel();
      expect(second.isOpen).toBe(true);
      second.remove();
    });
  });
});

describe('mountDiagnosticPanel', () => {
  // L'etat d'ouverture est persiste : sans purge, le test de persistance du
  // bloc precedent ouvrirait le volet de celui-ci.
  beforeEach(() => {
    localStorage.removeItem(STORAGE_KEY);
  });

  afterEach(() => {
    document.querySelectorAll('app-diagnostic-panel').forEach((el) => el.remove());
    localStorage.removeItem(STORAGE_KEY);
  });

  it('monte le volet et le câble au bouton de la barre d’actions', async () => {
    const button = document.createElement('button');
    button.id = 'diag-btn';
    document.body.appendChild(button);

    const mounted = mountDiagnosticPanel({ toggleButtonId: 'diag-btn' });
    button.click();
    await (mounted.panel as unknown as { updateComplete: Promise<unknown> }).updateComplete;

    expect(mounted.panel.isOpen).toBe(true);
    expect(button.getAttribute('aria-expanded')).toBe('true');

    mounted.destroy();
    button.remove();
  });

  it('sans iframe, il est en mode rapporté — pour les apps sans pipeline observable', () => {
    // L'Assistant IA rend son apercu sans aucun composant dsfr-data : il n'y
    // a rien a observer, mais il doit pouvoir LIRE un diagnostic.
    const mounted = mountDiagnosticPanel({});

    expect(mounted.panel.mode).toBe('rapporte');

    mounted.destroy();
  });

  it('destroy() nettoie tout', () => {
    const mounted = mountDiagnosticPanel({});
    mounted.destroy();

    expect(document.querySelector('app-diagnostic-panel')).toBeNull();
  });
});
