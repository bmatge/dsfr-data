import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AppDiagnosticPanel } from '../../../packages/app-ui/src/app-diagnostic-panel.js';
import {
  DataflowRecorder,
  evaluerConstats,
  mountDiagnosticPanel,
  type Constat,
  type Trace,
} from '@dsfr-data/shared';
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

/** Delegation entierement retombee cote client. */
const DELEGATION_NONE = { groupBy: false, aggregate: false, orderBy: false, where: false };

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

/**
 * Pose une trace ET ses constats, comme le fait `mountDiagnosticPanel` : le
 * volet ne calcule plus lui-même ce qui est une panne (#1001).
 */
function poser(panel: AppDiagnosticPanel, trace: Trace): void {
  panel.constats = evaluerConstats(trace, { app: '*' });
  panel.trace = trace;
}

/** Sélectionne un onglet par son libellé. */
async function ouvrirOnglet(panel: AppDiagnosticPanel, libelle: string): Promise<void> {
  const tab = Array.from(panel.querySelectorAll<HTMLButtonElement>('[role="tab"]')).find(
    (t) => t.textContent?.trim() === libelle
  );
  tab?.click();
  await panel.updateComplete;
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
      poser(panel, built.trace);
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
      poser(panel, built.trace);
      await panel.updateComplete;

      expect(panel.querySelector('.app-diag__alert')?.textContent).toContain('alerte');
    });

    it('affiche l’absence d’alerte sur une chaîne saine', async () => {
      const built = buildTrace(`<dsfr-data-source id="src"></dsfr-data-source>`, () => {
        dispatchDataLoaded('src', [{ a: 1 }]);
      });
      cleanup = built.cleanup;
      panel = await mountPanel();
      poser(panel, built.trace);
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
      expect(tabs).toHaveLength(4);
      expect(tabs.filter((t) => t.getAttribute('aria-selected') === 'true')).toHaveLength(1);
      expect(panel.querySelector('[role="tablist"]')?.getAttribute('aria-label')).toBeTruthy();
    });

    it('chaque onglet pilote un tabpanel identifié', async () => {
      // `aria-selected` seul ne fait pas un tablist : sans aria-controls ni
      // tabpanel, le lecteur d'ecran n'a aucun moyen d'atteindre le contenu
      // que l'onglet commande (RGAA 7.3).
      panel = await mountPanel();
      panel.toggle(true);
      await panel.updateComplete;

      const tabs = Array.from(panel.querySelectorAll('[role="tab"]'));
      const tabpanel = panel.querySelector('[role="tabpanel"]');

      expect(tabpanel).not.toBeNull();
      for (const tab of tabs) {
        expect(tab.getAttribute('aria-controls')).toBe(tabpanel!.id);
      }
      const selected = tabs.find((t) => t.getAttribute('aria-selected') === 'true')!;
      expect(tabpanel!.getAttribute('aria-labelledby')).toBe(selected.id);
    });

    it('applique le roving tabindex — un seul onglet dans l’ordre de tabulation', async () => {
      panel = await mountPanel();
      panel.toggle(true);
      await panel.updateComplete;

      const tabs = Array.from(panel.querySelectorAll('[role="tab"]'));

      expect(tabs.filter((t) => t.getAttribute('tabindex') === '0')).toHaveLength(1);
      expect(tabs.filter((t) => t.getAttribute('tabindex') === '-1')).toHaveLength(3);
      expect(tabs.find((t) => t.getAttribute('tabindex') === '0')).toBe(
        tabs.find((t) => t.getAttribute('aria-selected') === 'true')
      );
    });

    it('les flèches, Home et Fin naviguent entre onglets', async () => {
      panel = await mountPanel();
      panel.toggle(true);
      await panel.updateComplete;
      const tablist = panel.querySelector('[role="tablist"]') as HTMLElement;
      const selected = () =>
        panel!.querySelector('[role="tab"][aria-selected="true"]')?.textContent?.trim();

      const press = async (key: string) => {
        tablist.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
        await panel!.updateComplete;
      };

      // Constats en tête et par défaut : c'est l'onglet qui dit quoi corriger.
      expect(selected()).toBe('Constats');
      await press('ArrowRight');
      expect(selected()).toBe('Flux');
      await press('ArrowRight');
      expect(selected()).toBe('Champs');
      await press('ArrowRight');
      expect(selected()).toBe('Journal');
      // Boucle : le motif WAI-ARIA revient au premier.
      await press('ArrowRight');
      expect(selected()).toBe('Constats');
      await press('ArrowLeft');
      expect(selected()).toBe('Journal');
      await press('Home');
      expect(selected()).toBe('Constats');
      await press('End');
      expect(selected()).toBe('Journal');
    });

    it('une touche non gérée ne perturbe pas les onglets', async () => {
      panel = await mountPanel();
      panel.toggle(true);
      await panel.updateComplete;
      const tablist = panel.querySelector('[role="tablist"]') as HTMLElement;

      tablist.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
      await panel.updateComplete;

      expect(panel.querySelector('[role="tab"][aria-selected="true"]')?.textContent?.trim()).toBe(
        'Constats'
      );
    });

    it('les boutons sans diagnostic sont annoncés, pas juste éteints', async () => {
      // `disabled` sort le bouton de l'ordre de tabulation ET le rend muet :
      // l'utilisateur ne sait pas POURQUOI il ne peut pas copier.
      panel = await mountPanel();
      panel.toggle(true);
      await panel.updateComplete;

      const copy = Array.from(panel.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Copier')
      )!;

      expect(copy.getAttribute('aria-disabled')).toBe('true');
      expect(copy.getAttribute('title')).toContain('exécutez');
      expect(copy.hasAttribute('disabled')).toBe(false);
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
      poser(panel, built.trace);
      panel.toggle(true);
      await panel.updateComplete;

      await ouvrirOnglet(panel, 'Flux');
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
      poser(panel, built.trace);
      panel.toggle(true);
      await panel.updateComplete;

      await ouvrirOnglet(panel, 'Flux');
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
      poser(panel, built.trace);
      panel.toggle(true);
      await panel.updateComplete;

      await ouvrirOnglet(panel, 'Flux');
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
      poser(panel, built.trace);
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
      poser(panel, built.trace);
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

  describe('« pas encore exécuté » n’est pas « aucun composant »', () => {
    it('affiche emptyHint sur une trace vide de bout en bout', async () => {
      // Une trace existe des le branchement a l'iframe, mais elle ne decrit
      // rien tant que rien n'a tourne. La confondre avec une page depourvue
      // de composants envoyait chercher une panne inexistante.
      const built = buildTrace('', () => {});
      cleanup = built.cleanup;
      panel = await mountPanel();
      panel.emptyHint = 'Exécutez le code pour observer le flux.';
      poser(panel, built.trace);
      panel.toggle(true);
      await panel.updateComplete;

      expect(panel.textContent).toContain('Exécutez le code pour observer le flux.');
      expect(panel.querySelector('.app-diag__rail-summary')?.textContent).toContain(
        'aucune exécution'
      );
    });

    it('distingue une page réellement dépourvue de composants', async () => {
      const built = buildTrace(`<dsfr-data-source id="src"></dsfr-data-source>`, () =>
        dispatchDataLoaded('src', [{ a: 1 }])
      );
      cleanup = built.cleanup;
      panel = await mountPanel();
      panel.emptyHint = 'Exécutez le code pour observer le flux.';
      poser(panel, built.trace);
      panel.toggle(true);
      await panel.updateComplete;

      expect(panel.textContent).not.toContain('Exécutez le code pour observer le flux.');
    });
  });

  describe('l’alerte « côté client » ne crie pas au loup', () => {
    it('ne s’affiche pas pour un query qui ne fait que filtrer', async () => {
      // Meme garde que formatTrace : le volet est la surface la PLUS visible,
      // un faux positif y apprend a ignorer l'alerte.
      const built = buildTrace(
        `<dsfr-data-source id="src"></dsfr-data-source>
         <dsfr-data-query id="q1" source="src" filter="dept:eq:A"></dsfr-data-query>`,
        () => {
          dispatchDataLoaded('src', [{ dept: 'A' }]);
          dispatchDataLoaded('q1', [{ dept: 'A' }]);
        }
      );
      cleanup = built.cleanup;
      panel = await mountPanel();
      poser(panel, { ...built.trace, delegation: { q1: DELEGATION_NONE } });
      panel.toggle(true);
      await panel.updateComplete;

      await ouvrirOnglet(panel, 'Flux');
      expect(panel.textContent).not.toContain('côté client');
    });

    it('s’affiche quand une agrégation est bien demandée', async () => {
      const built = buildTrace(
        `<dsfr-data-source id="src"></dsfr-data-source>
         <dsfr-data-query id="q1" source="src" group-by="dept"></dsfr-data-query>`,
        () => {
          dispatchDataLoaded('src', [{ dept: 'A' }]);
          dispatchDataLoaded('q1', [{ dept: 'A' }]);
        }
      );
      cleanup = built.cleanup;
      panel = await mountPanel();
      poser(panel, { ...built.trace, delegation: { q1: DELEGATION_NONE } });
      panel.toggle(true);
      await panel.updateComplete;

      await ouvrirOnglet(panel, 'Flux');
      expect(panel.textContent).toContain('côté client');
    });
  });

  describe('accords en nombre', () => {
    it('écrit « 1 ligne », jamais « 1 lignes »', async () => {
      const built = buildTrace(
        `<dsfr-data-source id="src"></dsfr-data-source>
         <dsfr-data-query id="q1" source="src"></dsfr-data-query>`,
        () => {
          dispatchDataLoaded('src', [{ a: 1 }]);
          dispatchDataLoaded('q1', [{ a: 1 }]);
        }
      );
      cleanup = built.cleanup;
      panel = await mountPanel();
      poser(panel, built.trace);
      panel.toggle(true);
      await panel.updateComplete;

      await ouvrirOnglet(panel, 'Flux');
      const text = panel.textContent!.replace(/\s+/g, ' ');
      expect(text).not.toContain('1 lignes');
      expect(text).not.toContain('1 champs');
      expect(text).toContain('reçoit 1 ligne');
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

describe('les constats dans le volet (#1001)', () => {
  let panel: AppDiagnosticPanel | undefined;
  let cleanup: (() => void) | undefined;

  /** Un constat fabriqué : le volet rend ce qu'on lui donne, il ne juge pas. */
  function constat(partiel: Partial<Constat> & Pick<Constat, 'id' | 'gravite'>): Constat {
    return {
      regle: partiel.id.split('@')[0],
      titre: `titre ${partiel.id}`,
      explication: `explication ${partiel.id}`,
      reperes: [],
      preuve: `preuve ${partiel.id}`,
      ...partiel,
    };
  }

  /** Une trace saine : aucune règle générique n'y trouve rien. */
  async function monterSain(constats: readonly Constat[]): Promise<AppDiagnosticPanel> {
    const built = buildTrace(`<dsfr-data-source id="src"></dsfr-data-source>`, () =>
      dispatchDataLoaded('src', [{ a: 1 }])
    );
    cleanup = built.cleanup;
    const p = await mountPanel();
    p.constats = constats;
    p.trace = built.trace;
    await p.updateComplete;
    return p;
  }

  beforeEach(() => {
    localStorage.removeItem(STORAGE_KEY);
    clearDataCache('src');
  });

  afterEach(() => {
    panel?.remove();
    panel = undefined;
    cleanup?.();
    cleanup = undefined;
  });

  describe('la pastille du rail', () => {
    it('compte les constats non-info, colorée par la pire gravité', async () => {
      panel = await monterSain([
        constat({ id: 'a/erreur@src', gravite: 'erreur', etape: 'src' }),
        constat({ id: 'a/avert', gravite: 'avertissement' }),
        constat({ id: 'a/info@src', gravite: 'info', etape: 'src' }),
      ]);

      const pastille = panel.querySelector('.app-diag__rail .app-diag__badge');
      expect(pastille?.textContent?.replace(/\s+/g, ' ').trim()).toBe('2 constats à corriger');
      expect(pastille?.getAttribute('data-gravite')).toBe('erreur');
      // Même compte que le résumé : une seule source.
      expect(panel.querySelector('.app-diag__alert')?.textContent).toContain('2 alertes');
    });

    it('prend la couleur d’avertissement sans erreur', async () => {
      panel = await monterSain([constat({ id: 'a/avert', gravite: 'avertissement' })]);

      const pastille = panel.querySelector('.app-diag__badge');
      expect(pastille?.getAttribute('data-gravite')).toBe('avertissement');
      expect(pastille?.textContent?.replace(/\s+/g, ' ').trim()).toBe('1 constat à corriger');
    });

    it('est absente quand il n’y a que des informations', async () => {
      panel = await monterSain([constat({ id: 'a/info', gravite: 'info' })]);

      expect(panel.querySelector('.app-diag__badge')).toBeNull();
      expect(panel.querySelector('.app-diag__ok')?.textContent).toContain('aucune alerte');
    });

    it('ne compte rien sur une trace vide, même avec des constats en attente', async () => {
      panel = await mountPanel();
      panel.constats = [constat({ id: 'a/erreur', gravite: 'erreur' })];
      await panel.updateComplete;

      expect(panel.querySelector('.app-diag__badge')).toBeNull();
    });
  });

  describe('une seule source pour les marqueurs d’étape', () => {
    it('la carte d’étape rend les constats qui la visent, et rien d’autre', async () => {
      panel = await monterSain([
        constat({
          id: 'a/panne@src',
          gravite: 'avertissement',
          etape: 'src',
          titre: 'src : panne',
        }),
      ]);
      panel.toggle(true);
      await ouvrirOnglet(panel, 'Flux');

      const carte = panel.querySelector('.app-diag__stage')!;
      expect(carte.getAttribute('data-warn')).toBe('true');
      const note = carte.querySelector('[data-constat="a/panne@src"]');
      // Le préfixe d'étape est retiré : l'id de l'étape est déjà en tête de carte.
      expect(note?.textContent?.replace(/\s+/g, ' ').trim()).toBe('⚠ panne');
    });

    it('sans constat, aucune alerte d’étape — le volet ne recalcule rien', async () => {
      // `rows: 0` était une alerte calculée par le volet : ce n'est plus lui
      // qui décide. Sans constat, la carte ne s'alarme pas.
      const built = buildTrace(`<dsfr-data-source id="src"></dsfr-data-source>`, () =>
        dispatchDataLoaded('src', [])
      );
      cleanup = built.cleanup;
      panel = await mountPanel();
      panel.trace = built.trace;
      panel.toggle(true);
      await ouvrirOnglet(panel, 'Flux');

      expect(panel.querySelector('.app-diag__stage')?.getAttribute('data-warn')).toBe('false');
      expect(panel.textContent).not.toContain('aucune ligne');

      // Et avec les constats génériques, la même trace est signalée.
      poser(panel, built.trace);
      await panel.updateComplete;
      expect(panel.querySelector('.app-diag__stage')?.getAttribute('data-warn')).toBe('true');
      expect(panel.textContent).toContain('aucune ligne');
    });

    it('une info ne colore pas la carte', async () => {
      panel = await monterSain([
        constat({ id: 'a/info@src', gravite: 'info', etape: 'src', titre: 'src : fait utile' }),
      ]);
      panel.toggle(true);
      await ouvrirOnglet(panel, 'Flux');

      expect(panel.querySelector('.app-diag__stage')?.getAttribute('data-warn')).toBe('false');
      expect(panel.textContent).toContain('fait utile');
    });
  });

  describe('l’onglet Constats', () => {
    it('est l’onglet par défaut et rend titre, explication, geste et preuve', async () => {
      panel = await monterSain([
        constat({ id: 'a/erreur', gravite: 'erreur', action: 'Faire ceci' }),
      ]);
      panel.toggle(true);
      await panel.updateComplete;

      const item = panel.querySelector('.app-diag__constat')!;
      const text = item.textContent!.replace(/\s+/g, ' ');
      expect(item.getAttribute('data-gravite')).toBe('erreur');
      expect(text).toContain('Erreur : titre a/erreur');
      expect(text).toContain('explication a/erreur');
      expect(text).toContain('À faire : Faire ceci');
      expect(text).toContain('Observé : preuve a/erreur');
    });

    it('dit qu’il n’y a rien à corriger', async () => {
      panel = await monterSain([]);
      panel.toggle(true);
      await panel.updateComplete;

      expect(panel.textContent).toContain('Aucun constat');
    });

    it('rend un titre venu des données comme du texte, jamais comme du balisage', async () => {
      panel = await monterSain([
        constat({ id: 'a/x', gravite: 'erreur', titre: '<img src=x onerror=alert(1)>' }),
      ]);
      panel.toggle(true);
      await panel.updateComplete;

      expect(panel.querySelector('.app-diag__constat img')).toBeNull();
      expect(panel.textContent).toContain('<img src=x onerror=alert(1)>');
    });
  });

  describe('« Me montrer »', () => {
    const boutons = (p: AppDiagnosticPanel) =>
      Array.from(p.querySelectorAll<HTMLButtonElement>('.app-diag__constat button'));

    it('émet constat-montrer avec le premier repère, sans rien résoudre', async () => {
      const c = constat({
        id: 'carte/sans-geo@layer',
        gravite: 'erreur',
        reperes: ['carto.couches.geo-field', 'carto.couches.liste'],
      });
      panel = await monterSain([c]);
      panel.toggle(true);
      await panel.updateComplete;

      // Écouté sur le document : l'événement doit remonter jusqu'à l'app.
      const recu = vi.fn();
      const ecoute = (e: Event) => recu((e as CustomEvent).detail);
      document.addEventListener('constat-montrer', ecoute);
      const [bouton] = boutons(panel);
      expect(bouton.textContent?.trim()).toBe('Me montrer');
      expect(bouton.className).toContain('fr-btn--tertiary-no-outline');
      expect(bouton.className).toContain('fr-icon-eye-line');
      bouton.click();
      document.removeEventListener('constat-montrer', ecoute);

      expect(recu).toHaveBeenCalledTimes(1);
      expect(recu).toHaveBeenCalledWith({ repere: 'carto.couches.geo-field', constat: c });
    });

    it('l’événement traverse les shadow roots (composed)', async () => {
      panel = await monterSain([
        constat({ id: 'a/x', gravite: 'erreur', reperes: ['app.zone.controle'] }),
      ]);
      panel.toggle(true);
      await panel.updateComplete;

      let evenement: Event | undefined;
      panel.addEventListener('constat-montrer', (e) => (evenement = e), { once: true });
      boutons(panel)[0].click();
      expect(evenement?.bubbles).toBe(true);
      expect(evenement?.composed).toBe(true);
    });

    it('est désactivé sans repère, et n’émet rien', async () => {
      panel = await monterSain([constat({ id: 'a/x', gravite: 'erreur', reperes: [] })]);
      panel.toggle(true);
      await panel.updateComplete;

      const recu = vi.fn();
      panel.addEventListener('constat-montrer', recu);
      const [bouton] = boutons(panel);
      expect(bouton.disabled).toBe(true);
      bouton.click();
      expect(recu).not.toHaveBeenCalled();
    });

    it('est rattaché au titre de son constat pour le lecteur d’écran', async () => {
      panel = await monterSain([
        constat({ id: 'a/x', gravite: 'erreur', reperes: ['app.zone.controle'] }),
      ]);
      panel.toggle(true);
      await panel.updateComplete;

      const [bouton] = boutons(panel);
      const titre = panel.querySelector(`#${CSS.escape(bouton.getAttribute('aria-describedby')!)}`);
      expect(titre?.textContent).toContain('titre a/x');
    });
  });

  describe('l’arrivée d’une erreur', () => {
    it('est annoncée poliment, sans ouvrir le volet', async () => {
      panel = await monterSain([]);
      const bascules = vi.fn();
      panel.addEventListener('diagnostic-toggle', bascules);

      panel.constats = [constat({ id: 'a/erreur', gravite: 'erreur', titre: 'Carte vide' })];
      await panel.updateComplete;

      expect(panel.isOpen).toBe(false);
      expect(bascules).not.toHaveBeenCalled();
      const live = panel.querySelector('[aria-live="polite"]');
      expect(live?.textContent).toBe('Carte vide');
      // Aucun déplacement du focus (ADR-143 §7, mode « Dire »).
      expect(panel.contains(document.activeElement)).toBe(false);
    });

    it('n’annonce ni les avertissements ni les erreurs déjà dites', async () => {
      const deja = constat({ id: 'a/deja', gravite: 'erreur', titre: 'Déjà dite' });
      panel = await monterSain([deja]);
      const live = panel.querySelector('[aria-live="polite"]')!;
      expect(live.textContent).toBe('Déjà dite');

      panel.constats = [deja, constat({ id: 'a/avert', gravite: 'avertissement' })];
      await panel.updateComplete;
      expect(live.textContent).toBe('Déjà dite');

      panel.constats = [deja, constat({ id: 'a/neuve', gravite: 'erreur', titre: 'Neuve' })];
      await panel.updateComplete;
      expect(live.textContent).toBe('Neuve');
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

describe('masquage des valeurs — ce qui sort du navigateur', () => {
  let panel: AppDiagnosticPanel | undefined;
  let cleanup: (() => void) | undefined;

  afterEach(() => {
    panel?.remove();
    panel = undefined;
    cleanup?.();
    cleanup = undefined;
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem('dsfr-data-diagnostic-redact');
    clearDataCache('src');
  });

  async function panneauAvecDonnees() {
    const built = buildTrace(`<dsfr-data-source id="src"></dsfr-data-source>`, () =>
      dispatchDataLoaded('src', [{ nom: 'Dupont', salaire: 42000 }])
    );
    cleanup = built.cleanup;
    const p = await mountPanel();
    p.trace = built.trace;
    p.toggle(true);
    await p.updateComplete;
    return p;
  }

  it('offre le réglage dans l’interface, pas seulement en code', async () => {
    // Le DoD l'exige : l'utilisateur decide ce qui sort du navigateur.
    panel = await panneauAvecDonnees();

    const checkbox = panel.querySelector('.app-diag__redact input') as HTMLInputElement;
    expect(checkbox).not.toBeNull();
    expect(panel.querySelector('.app-diag__redact label')?.textContent).toContain('Masquer');
  });

  it('rend les valeurs par défaut', async () => {
    panel = await panneauAvecDonnees();

    expect(panel.diagnosticText).toContain('Dupont');
    expect(panel.redactValues).toBe(false);
  });

  it('les masque une fois coché, sans perdre champs ni comptes', async () => {
    panel = await panneauAvecDonnees();
    const checkbox = panel.querySelector('.app-diag__redact input') as HTMLInputElement;

    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change'));
    await panel.updateComplete;

    expect(panel.redactValues).toBe(true);
    expect(panel.diagnosticText).not.toContain('Dupont');
    expect(panel.diagnosticText).not.toContain('42000');
    expect(panel.diagnosticText).toContain('nom');
    expect(panel.diagnosticText).toContain('1 ligne');
  });

  it('le réglage survit à une nouvelle visite', async () => {
    // Un choix de confidentialite qui se reinitialise a chaque ouverture
    // serait un piege : l'utilisateur croirait ses valeurs masquees.
    panel = await panneauAvecDonnees();
    const checkbox = panel.querySelector('.app-diag__redact input') as HTMLInputElement;
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change'));
    panel.remove();

    const second = await mountPanel();
    expect(second.redactValues).toBe(true);
    second.remove();
  });

  it('le texte envoyé à l’assistant est celui que l’utilisateur voit', async () => {
    // UN seul reglage : ce qui est copie, envoye et lu par le modele est le
    // meme texte. Deux chemins divergents rendraient la confidentialite
    // invérifiable.
    panel = await panneauAvecDonnees();
    panel.canSend = true;
    const checkbox = panel.querySelector('.app-diag__redact input') as HTMLInputElement;
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change'));
    await panel.updateComplete;

    const envoye = vi.fn();
    panel.addEventListener('diagnostic-send', (e) =>
      envoye((e as CustomEvent<{ text: string }>).detail.text)
    );
    const btn = Array.from(panel.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('assistant')
    ) as HTMLButtonElement;
    btn.click();

    expect(envoye).toHaveBeenCalledWith(panel.diagnosticText);
    expect(envoye.mock.calls[0][0]).not.toContain('Dupont');
  });
});
