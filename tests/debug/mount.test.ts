import { describe, it, expect, afterEach, vi } from 'vitest';
import { AppDiagnosticPanel } from '../../packages/app-ui/src/app-diagnostic-panel.js';
import {
  mountDiagnosticPanel,
  transmettreDiagnostic,
  recupererDiagnostic,
  DIAGNOSTIC_HANDOFF_KEY,
  type Constat,
  type MountedDiagnostic,
  type RegleConstat,
  type Trace,
} from '@dsfr-data/shared';

/**
 * Montage du volet dans les apps (#606).
 *
 * Les apps ne rendent pas leur apercu de la meme facon, et il ne faut pas
 * faire semblant du contraire :
 *
 *   - iframe srcdoc  : Playground, Builder, Studio, Dashboard
 *   - meme document  : Carto (#map-canvas), Pipeline (conteneur d'execution)
 *   - rien a observer : Assistant IA — chart-renderer.ts dessine avec
 *     @gouvfr/dsfr-chart en direct, sans aucun composant dsfr-data (#609)
 *
 * Le volet couvre les trois, et c'est le meme composant partout.
 */

const STORAGE_KEY = 'dsfr-data-diagnostic-open';

describe('mountDiagnosticPanel — les trois modes', () => {
  let mounted: MountedDiagnostic | undefined;
  let host: HTMLElement | undefined;

  afterEach(() => {
    mounted?.destroy();
    mounted = undefined;
    host?.remove();
    host = undefined;
    document.querySelectorAll('app-diagnostic-panel').forEach((el) => el.remove());
    localStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem(DIAGNOSTIC_HANDOFF_KEY);
  });

  it('est enregistré comme custom element', () => {
    // Usage en position de VALEUR : sinon l'import est elide et rien ne
    // rehausse les elements crees par le helper.
    expect(customElements.get('app-diagnostic-panel')).toBe(AppDiagnosticPanel);
  });

  describe('mode live / iframe', () => {
    it('observe le pipeline de l’iframe', () => {
      const frame = document.createElement('iframe');
      document.body.appendChild(frame);
      host = frame;
      const doc = frame.contentDocument!;
      doc.body.innerHTML = `<dsfr-data-source id="src"></dsfr-data-source>`;

      mounted = mountDiagnosticPanel({ frame });
      doc.dispatchEvent(
        new CustomEvent('dsfr-data-loaded', { detail: { sourceId: 'src', data: [{ a: 1 }] } })
      );

      expect(mounted.panel.mode).toBe('live');
      expect(mounted.attachment).not.toBeNull();
      expect(mounted.attachment!.snapshot()!.states.src.rows).toBe(1);
    });
  });

  describe('mode live / même document', () => {
    it('observe une racine du document courant (Carto, Pipeline)', () => {
      // La Carto instancie de VRAIS composants dans #map-canvas : il n'y a
      // pas d'iframe a ecouter, juste une racine.
      const canvas = document.createElement('div');
      canvas.id = 'map-canvas';
      canvas.innerHTML = `
        <dsfr-data-source id="carto-src"></dsfr-data-source>
        <dsfr-data-map-layer id="l1" source="carto-src"></dsfr-data-map-layer>
      `;
      document.body.appendChild(canvas);
      host = canvas;

      mounted = mountDiagnosticPanel({ liveRoot: canvas });

      expect(mounted.panel.mode).toBe('live');
      expect(mounted.attachment).toBeNull();
      expect(mounted.recorder).not.toBeNull();
      expect(mounted.recorder!.snapshot().graph.nodes.map((n) => n.id)).toEqual([
        'carto-src',
        'l1',
      ]);
    });

    it('reçoit les émissions du document courant', async () => {
      const canvas = document.createElement('div');
      canvas.innerHTML = `<dsfr-data-source id="carto-src"></dsfr-data-source>`;
      document.body.appendChild(canvas);
      host = canvas;
      mounted = mountDiagnosticPanel({ liveRoot: canvas });

      document.dispatchEvent(
        new CustomEvent('dsfr-data-loaded', {
          detail: { sourceId: 'carto-src', data: [{ a: 1 }, { a: 2 }] },
        })
      );
      await Promise.resolve();

      expect(mounted.recorder!.snapshot().states['carto-src'].rows).toBe(2);
      expect(mounted.panel.trace?.states['carto-src'].rows).toBe(2);
    });

    it('destroy() arrête le collecteur du document courant', () => {
      const canvas = document.createElement('div');
      document.body.appendChild(canvas);
      host = canvas;
      const local = mountDiagnosticPanel({ liveRoot: canvas });
      const recorder = local.recorder!;

      local.destroy();

      expect(recorder.isRunning).toBe(false);
    });
  });

  describe('mode rapporté', () => {
    it('est le mode par défaut quand il n’y a rien à observer', () => {
      // Constat, pas repli : l'Assistant IA n'emet rien sur le bus.
      mounted = mountDiagnosticPanel({});

      expect(mounted.panel.mode).toBe('rapporte');
      expect(mounted.attachment).toBeNull();
      expect(mounted.recorder).toBeNull();
    });

    it('affiche une trace qu’on lui donne', () => {
      mounted = mountDiagnosticPanel({});
      const trace = {
        graph: { nodes: [], dangling: [] },
        events: [],
        states: {},
        order: [],
        sinceLastEventMs: null,
        lastEventAt: null,
        quiescent: true,
        delegation: {},
        reseau: [],
        console: [],
      };

      mounted.setTrace(trace);

      expect(mounted.panel.trace).toBe(trace);
    });
  });
});

describe('passation d’un diagnostic entre apps', () => {
  afterEach(() => sessionStorage.removeItem(DIAGNOSTIC_HANDOFF_KEY));

  it('transmet puis consomme une seule fois', () => {
    // Le mode rapporte n'a d'interet que si quelque chose peut y arriver.
    transmettreDiagnostic('Flux — 2 étapes…');

    expect(recupererDiagnostic()).toBe('Flux — 2 étapes…');
    expect(recupererDiagnostic()).toBeNull();
  });

  it('rend null quand rien n’a été transmis', () => {
    expect(recupererDiagnostic()).toBeNull();
  });

  it('ne jette pas quand le stockage est indisponible', () => {
    // Navigation privee : l'utilisateur garde « Copier le diagnostic ».
    const original = Object.getOwnPropertyDescriptor(window, 'sessionStorage');
    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      get() {
        throw new Error('stockage refusé');
      },
    });

    expect(() => transmettreDiagnostic('x')).not.toThrow();
    expect(recupererDiagnostic()).toBeNull();

    if (original) Object.defineProperty(window, 'sessionStorage', original);
  });
});

describe('câblage du bouton de la barre d’actions', () => {
  let mounted: MountedDiagnostic | undefined;
  let button: HTMLButtonElement | undefined;

  afterEach(() => {
    mounted?.destroy();
    mounted = undefined;
    button?.remove();
    button = undefined;
    localStorage.removeItem(STORAGE_KEY);
  });

  it('bascule le volet et reflète son état', async () => {
    button = document.createElement('button');
    button.id = 'diagnostic-btn';
    document.body.appendChild(button);
    mounted = mountDiagnosticPanel({ toggleButtonId: 'diagnostic-btn' });

    button.click();
    await (mounted.panel as unknown as { updateComplete: Promise<unknown> }).updateComplete;

    expect(mounted.panel.isOpen).toBe(true);
    expect(button.getAttribute('aria-expanded')).toBe('true');

    button.click();
    expect(mounted.panel.isOpen).toBe(false);
    expect(button.getAttribute('aria-expanded')).toBe('false');
  });

  it('tolère un bouton absent', () => {
    expect(() => {
      const m = mountDiagnosticPanel({ toggleButtonId: 'nexiste-pas' });
      m.destroy();
    }).not.toThrow();
  });

  it('destroy() détache l’écouteur du bouton', () => {
    button = document.createElement('button');
    button.id = 'diagnostic-btn';
    document.body.appendChild(button);
    const local = mountDiagnosticPanel({ toggleButtonId: 'diagnostic-btn' });
    local.destroy();

    // Le volet n'existe plus : cliquer ne doit rien atteindre.
    expect(() => button!.click()).not.toThrow();
    expect(document.querySelector('app-diagnostic-panel')).toBeNull();
  });
});

describe('envoi vers l’assistant', () => {
  let mounted: MountedDiagnostic | undefined;

  afterEach(() => {
    mounted?.destroy();
    mounted = undefined;
    localStorage.removeItem(STORAGE_KEY);
  });

  it('remet exactement le texte du volet — un seul format', async () => {
    // Le contrat central de l'epic : ce que l'utilisateur lit et ce que
    // l'assistant recoit sont le MEME objet.
    const recu = vi.fn();
    mounted = mountDiagnosticPanel({ canSend: true, onSend: recu });
    mounted.panel.toggle(true);
    await (mounted.panel as unknown as { updateComplete: Promise<unknown> }).updateComplete;

    mounted.panel.dispatchEvent(
      new CustomEvent('diagnostic-send', {
        detail: { text: mounted.panel.diagnosticText },
        bubbles: true,
      })
    );

    expect(recu).toHaveBeenCalledWith(mounted.text());
  });
});

describe('clôture de quiescence en mode « même document » (B3)', () => {
  let mounted: MountedDiagnostic | undefined;
  let host: HTMLElement | undefined;

  afterEach(() => {
    mounted?.destroy();
    mounted = undefined;
    host?.remove();
    host = undefined;
    vi.useRealTimers();
    document.querySelectorAll('app-diagnostic-panel').forEach((el) => el.remove());
    localStorage.removeItem(STORAGE_KEY);
  });

  it('republie après le silence — sinon « le pipeline tourne encore » à jamais', async () => {
    // Le mode iframe avait recu cette cloture ; le mode meme-document l'avait
    // perdue. Consequence sur la Carto et le Pipeline : un avertissement
    // permanent, donc invisible — exactement le defaut corrige pour l'iframe.
    vi.useFakeTimers();
    const canvas = document.createElement('div');
    canvas.innerHTML = `<dsfr-data-source id="carto-src"></dsfr-data-source>`;
    document.body.appendChild(canvas);
    host = canvas;
    mounted = mountDiagnosticPanel({ liveRoot: canvas });

    document.dispatchEvent(
      new CustomEvent('dsfr-data-loaded', { detail: { sourceId: 'carto-src', data: [{ a: 1 }] } })
    );
    await Promise.resolve();
    expect(mounted.panel.trace?.quiescent).toBe(false);

    vi.advanceTimersByTime(600);
    await Promise.resolve();

    expect(mounted.panel.trace?.quiescent).toBe(true);
  });

  it('publie un état stabilisé même sans le moindre événement', () => {
    vi.useFakeTimers();
    const canvas = document.createElement('div');
    document.body.appendChild(canvas);
    host = canvas;
    mounted = mountDiagnosticPanel({ liveRoot: canvas });

    vi.advanceTimersByTime(600);

    expect(mounted.panel.trace?.quiescent).toBe(true);
  });

  it('destroy() annule la clôture en attente', () => {
    vi.useFakeTimers();
    const canvas = document.createElement('div');
    document.body.appendChild(canvas);
    host = canvas;
    const local = mountDiagnosticPanel({ liveRoot: canvas });
    local.destroy();

    // Ne doit pas toucher un volet demonte.
    expect(() => vi.advanceTimersByTime(600)).not.toThrow();
  });
});

describe('constats et « Me montrer » (#1001)', () => {
  let mounted: MountedDiagnostic | undefined;
  let host: HTMLElement | undefined;

  afterEach(() => {
    mounted?.destroy();
    mounted = undefined;
    host?.remove();
    host = undefined;
    localStorage.removeItem(STORAGE_KEY);
  });

  /**
   * Trace minimale : un afficheur dont l'amont est absent de la page suffit à
   * produire un constat générique. Le nœud est nécessaire : une trace sans
   * étape ni événement est « pas encore exécutée », et le volet n'y montre rien.
   */
  function traceAmontManquant(): Trace {
    return {
      graph: {
        nodes: [
          {
            id: 'c1',
            tag: 'dsfr-data-chart',
            role: 'display',
            synthetic: false,
            ambiguous: false,
            upstream: [],
            attrs: { source: 'fantome' },
          },
        ],
        dangling: [{ node: 'c1', missing: 'fantome' }],
      },
      events: [],
      states: {},
      order: [],
      sinceLastEventMs: null,
      lastEventAt: null,
      quiescent: true,
      delegation: {},
      reseau: [],
      console: [],
    };
  }

  function constatFixe(id: string, reperes: string[] = []): Constat {
    return { id, regle: id, gravite: 'erreur', titre: id, explication: '', reperes, preuve: '' };
  }

  it('évalue les constats génériques sans option, à chaque setTrace', () => {
    mounted = mountDiagnosticPanel({});
    mounted.setTrace(traceAmontManquant());

    expect(mounted.constats().map((c) => c.id)).toEqual(['pipeline/amont-manquant@c1']);
    // Le volet reçoit la MÊME liste que l'app : une seule évaluation.
    expect(mounted.panel.constats).toBe(mounted.constats());

    mounted.setTrace(null);
    expect(mounted.constats()).toEqual([]);
    expect(mounted.panel.constats).toEqual([]);
  });

  it('compose les règles de l’app et relit son contexte à chaque évaluation', () => {
    let etat = 'avant';
    const vus: unknown[] = [];
    const regle: RegleConstat = {
      id: 'test/etat',
      appliesTo: ['mon-app'],
      evaluer: (_trace, ctx) => {
        vus.push(ctx.etat);
        return [{ ...constatFixe('test/etat'), titre: `état ${String(ctx.etat)}` }];
      },
    };
    mounted = mountDiagnosticPanel({
      constats: { contexte: () => ({ app: 'mon-app', etat }), regles: [regle] },
    });

    mounted.setTrace(traceAmontManquant());
    etat = 'après';
    mounted.setTrace(traceAmontManquant());

    expect(vus).toEqual(['avant', 'après']);
    // Les règles de l'app REMPLACENT le défaut : pas d'amont-manquant ici.
    expect(mounted.constats().map((c) => c.titre)).toEqual(['état après']);
  });

  it('accepte un contexte fixe', () => {
    const regle: RegleConstat = {
      id: 'test/app',
      appliesTo: ['*'],
      evaluer: (_t, ctx) => [constatFixe(ctx.app)],
    };
    mounted = mountDiagnosticPanel({ constats: { contexte: { app: 'fixe' }, regles: [regle] } });
    mounted.setTrace(traceAmontManquant());

    expect(mounted.constats().map((c) => c.id)).toEqual(['fixe']);
  });

  it('évalue aussi en mode live / même document', async () => {
    const canvas = document.createElement('div');
    canvas.innerHTML = `<dsfr-data-source id="carto-vide"></dsfr-data-source>`;
    document.body.appendChild(canvas);
    host = canvas;
    mounted = mountDiagnosticPanel({ liveRoot: canvas });

    document.dispatchEvent(
      new CustomEvent('dsfr-data-loaded', { detail: { sourceId: 'carto-vide', data: [] } })
    );
    await Promise.resolve();

    expect(mounted.constats().map((c) => c.id)).toContain('pipeline/zero-ligne@carto-vide');
  });

  it('évalue aussi en mode live / iframe', async () => {
    const frame = document.createElement('iframe');
    document.body.appendChild(frame);
    host = frame;
    const doc = frame.contentDocument!;
    doc.body.innerHTML = `<dsfr-data-source id="src-vide"></dsfr-data-source>`;
    mounted = mountDiagnosticPanel({ frame });

    doc.dispatchEvent(
      new CustomEvent('dsfr-data-loaded', { detail: { sourceId: 'src-vide', data: [] } })
    );
    await Promise.resolve();

    expect(mounted.constats().map((c) => c.id)).toContain('pipeline/zero-ligne@src-vide');
  });

  it('onMontrer reçoit le repère et le constat', async () => {
    const onMontrer = vi.fn();
    const regle: RegleConstat = {
      id: 'test/montrer',
      appliesTo: ['*'],
      evaluer: () => [constatFixe('test/montrer', ['carto.couches.liste', 'carto.autre'])],
    };
    mounted = mountDiagnosticPanel({
      constats: { contexte: { app: 'x' }, regles: [regle] },
      onMontrer,
    });
    mounted.setTrace(traceAmontManquant());
    mounted.panel.toggle(true);
    await (mounted.panel as AppDiagnosticPanel).updateComplete;

    const bouton = Array.from(mounted.panel.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Me montrer'
    );
    bouton!.click();

    expect(onMontrer).toHaveBeenCalledTimes(1);
    expect(onMontrer).toHaveBeenCalledWith('carto.couches.liste', mounted.constats()[0]);
  });

  it('n’ouvre jamais le volet de lui-même quand une erreur arrive', async () => {
    mounted = mountDiagnosticPanel({});
    mounted.setTrace(traceAmontManquant());
    await (mounted.panel as AppDiagnosticPanel).updateComplete;

    expect(mounted.constats()[0].gravite).toBe('erreur');
    expect(mounted.panel.isOpen).toBe(false);
  });
});
