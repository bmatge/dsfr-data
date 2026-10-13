import { describe, it, expect, afterEach } from 'vitest';
import {
  DataflowRecorder,
  evaluerConstats,
  formatTrace,
  readCacheSnapshot,
  readErrorSnapshot,
  type Constat,
} from '@dsfr-data/shared';
import {
  clearDataCache,
  dispatchDataError,
  dispatchDataIdle,
  dispatchDataLoaded,
  dispatchDataLoading,
} from '@/utils/data-bridge.js';

/**
 * #1272 — le volet Diagnostic et les lignes périmées.
 *
 * Contre le VRAI data-bridge : une étape qui échoue après avoir livré garde
 * ses lignes, datées et marquées. Le collecteur le relève (`StageState.stale`),
 * `formatTrace` le dit, et la règle `pipeline/lignes-perimees` en fait :
 * - une RÉSERVE (`info`) sur l'étape en panne ;
 * - un AVERTISSEMENT sur une étape qui a émis APRÈS l'échec de son amont —
 *   ce qu'aucun transformateur de la bibliothèque ne fait plus, mais qu'un
 *   composant tiers ou une version antérieure fait encore.
 */

const IDS = ['lp-src', 'lp-calc', 'lp-vue'];
const ROWS = [{ a: 1 }, { a: 2 }, { a: 3 }];
const PANNE = new Error('HTTP 503: Service Unavailable');
const CTX = { app: '*', origine: 'https://app.exemple.fr' };

function pipeline(): () => void {
  const host = document.createElement('div');
  // Balises INERTES (aucun composant n'est importé ici) : le graphe se lit dans
  // le DOM, et l'étape du milieu joue un composant qui garde sa copie des lignes.
  host.innerHTML = `
    <dsfr-data-source id="lp-src" url="https://exemple.fr/data.json"></dsfr-data-source>
    <dsfr-data-normalize id="lp-calc" source="lp-src"></dsfr-data-normalize>
    <dsfr-data-kpi id="lp-vue" source="lp-calc"></dsfr-data-kpi>`;
  document.body.appendChild(host);
  return () => host.remove();
}

function deLaRegle(constats: Constat[]): Constat[] {
  return constats.filter((c) => c.regle === 'pipeline/lignes-perimees');
}

describe('#1272 — Diagnostic : lignes périmées', () => {
  let demonter: (() => void) | undefined;
  let recorder: DataflowRecorder | undefined;

  afterEach(() => {
    recorder?.stop();
    recorder = undefined;
    demonter?.();
    demonter = undefined;
    for (const id of IDS) clearDataCache(id);
  });

  function demarrer(): DataflowRecorder {
    demonter = pipeline();
    recorder = new DataflowRecorder({ root: document.body });
    recorder.start();
    return recorder;
  }

  it('l’étape en panne porte le compte et la date de ses lignes gardées', () => {
    const r = demarrer();
    dispatchDataLoaded('lp-src', ROWS);
    dispatchDataError('lp-src', PANNE);

    const etat = r.snapshot().states['lp-src'];
    expect(etat.status).toBe('error');
    expect(etat.rows).toBeUndefined();
    expect(etat.stale?.rows).toBe(3);
    expect(typeof etat.stale?.loadedAt).toBe('number');
  });

  it('le marquage tient pendant le nouvel essai, et se lève au chargement réussi', () => {
    const r = demarrer();
    dispatchDataLoaded('lp-src', ROWS);
    dispatchDataError('lp-src', PANNE);
    dispatchDataLoading('lp-src');
    expect(r.snapshot().states['lp-src'].stale?.rows).toBe(3);

    dispatchDataLoaded('lp-src', ROWS);
    expect(r.snapshot().states['lp-src'].stale).toBeUndefined();
  });

  it('une attente d’un filtre n’est pas une panne : rien de périmé', () => {
    const r = demarrer();
    dispatchDataLoaded('lp-src', ROWS);
    dispatchDataError('lp-src', PANNE);
    dispatchDataIdle('lp-src');
    expect(r.snapshot().states['lp-src'].stale).toBeUndefined();
  });

  it('une étape en panne sans chargement préalable n’a rien de périmé', () => {
    const r = demarrer();
    dispatchDataError('lp-src', PANNE);
    const trace = r.snapshot();
    expect(trace.states['lp-src'].stale).toBeUndefined();
    expect(deLaRegle(evaluerConstats(trace, CTX))).toEqual([]);
  });

  it('réserve : la règle et `formatTrace` disent les lignes gardées', () => {
    const r = demarrer();
    dispatchDataLoaded('lp-src', ROWS);
    dispatchDataError('lp-src', PANNE);
    const trace = r.snapshot();

    const trouves = deLaRegle(evaluerConstats(trace, CTX));
    expect(trouves).toHaveLength(1);
    expect(trouves[0]).toMatchObject({
      id: 'pipeline/lignes-perimees@lp-src',
      gravite: 'info',
      etape: 'lp-src',
      preuve: 'lp-src → 3 lignes du dernier chargement réussi',
    });
    expect(formatTrace(trace)).toMatch(
      /3 lignes du dernier chargement réussi \(\d\d:\d\d:\d\d\) en mémoire, PÉRIMÉES/
    );
  });

  it('avertissement : une étape qui émet APRÈS l’échec de son amont', () => {
    const r = demarrer();
    dispatchDataLoaded('lp-src', ROWS);
    dispatchDataLoaded('lp-calc', [{ total: 6 }]);
    dispatchDataError('lp-src', PANNE);
    // Le composant tiers recalcule sur sa copie et ré-émet, sans relayer l'erreur.
    dispatchDataLoaded('lp-calc', [{ total: 6 }]);
    const trace = r.snapshot();

    const fautif = deLaRegle(evaluerConstats(trace, CTX)).find((c) => c.etape === 'lp-calc');
    expect(fautif).toMatchObject({
      id: 'pipeline/lignes-perimees@lp-calc',
      gravite: 'avertissement',
      preuve: 'amont en échec : lp-src',
    });
    expect(fautif?.titre).toContain('calculé sur des lignes périmées');
  });

  it('pas d’avertissement quand l’étape avait émis AVANT l’échec et n’a rien réémis', () => {
    const r = demarrer();
    dispatchDataLoaded('lp-src', ROWS);
    dispatchDataLoaded('lp-calc', [{ total: 6 }]);
    dispatchDataError('lp-src', PANNE);
    const trace = r.snapshot();

    expect(deLaRegle(evaluerConstats(trace, CTX)).map((c) => c.etape)).toEqual(['lp-src']);
  });

  it('page sans tampon : une étape en panne n’est plus reconstituée « chargée »', () => {
    dispatchDataLoaded('lp-src', ROWS);
    dispatchDataError('lp-src', PANNE, 'https://exemple.fr/data.json');

    // Le cache courant ne la porte plus…
    expect(readCacheSnapshot(window).map((e) => e.sourceId)).not.toContain('lp-src');
    // … le registre d'erreur, si, avec la date des lignes gardées.
    const relevee = readErrorSnapshot(window).find((e) => e.sourceId === 'lp-src');
    expect(relevee?.attemptedUrl).toBe('https://exemple.fr/data.json');
    expect(typeof relevee?.lastLoadedAt).toBe('number');

    // Le collecteur arrive APRÈS : il reconstitue une étape en échec, pas des lignes.
    const r = demarrer();
    expect(r.backfillFromCache(window)).toBeGreaterThan(0);
    const etat = r.snapshot().states['lp-src'];
    expect(etat.status).toBe('error');
    expect(etat.message).toBe('HTTP 503: Service Unavailable');
    expect(etat.stale).toBeDefined();
    expect(etat.rows).toBeUndefined();
  });
});
