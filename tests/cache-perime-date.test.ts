/**
 * #1272 — les lignes d'une étape en panne restent en mémoire, PÉRIMÉES ET DATÉES.
 *
 * Avant : `dispatchDataError` ne touchait pas au cache des lignes. Tout lecteur
 * qui ne passait pas par `SourceSubscriberMixin` (#1222) lisait l'ancien jeu
 * comme s'il était à jour — `getDataCache`, `element.getData()`, et surtout les
 * transformateurs, qui recalculaient dessus et ré-émettaient.
 *
 * Ce fichier porte le CYCLE DE VIE du marquage :
 * - il se pose au premier échec d'une étape qui avait livré, avec la date du
 *   dernier chargement réussi et la cause classée par le barème ;
 * - il tient pendant le nouvel essai (le registre d'erreur, lui, est effacé) ;
 * - il se lève au chargement réussi, et seulement là ;
 * - une remise à zéro (retrait du DOM, retour en attente d'un filtre) nettoie
 *   tout : ce n'est pas une panne ;
 * - un transformateur dont une entrée est périmée n'émet plus rien.
 *
 * Les chiffres affichés sont gardés par `tests/verif-donnees/affichages.ts`
 * (trois contrôles, preuves de mutation dans `tools/oracle/README.md`).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DsfrDataSource } from '@/components/dsfr-data-source.js';
import { DsfrDataQuery } from '@/components/dsfr-data-query.js';
import { DsfrDataNormalize } from '@/components/dsfr-data-normalize.js';
import { DsfrDataJoin } from '@/components/dsfr-data-join.js';
import { DsfrDataConcat } from '@/components/dsfr-data-concat.js';
import { DsfrDataKpi } from '@/components/dsfr-data-kpi.js';
import {
  DATA_EVENTS,
  clearDataCache,
  clearDataMeta,
  dispatchDataError,
  dispatchDataIdle,
  dispatchDataLoaded,
  dispatchDataLoading,
  dispatchSourceCommand,
  getDataCache,
  getDataErrorState,
  getLastKnownData,
  isDataStale,
  requestSourceRetry,
  type DataErrorEvent,
  type DataLoadedEvent,
} from '@/utils/data-bridge.js';
import { ScopeEmitter } from '@/utils/scope-emitter.js';
import { httpError, releaseBody } from '@/utils/http-error.js';

void DsfrDataSource;
void DsfrDataQuery;
void DsfrDataNormalize;
void DsfrDataJoin;
void DsfrDataConcat;
void DsfrDataKpi;

const S = 'perime-src';
const S2 = 'perime-src-2';
const Q = 'perime-query';
const N = 'perime-normalize';
const J = 'perime-join';
const C = 'perime-concat';
const IDS = [S, S2, Q, N, J, C, 'perime-tardif', 'zone-Nord', 'zone-Sud'];

const ROWS = [
  { zone: 'Nord', population: 10 },
  { zone: 'Sud', population: 32 },
];
const REF = [
  { zone: 'Nord', rang: 1 },
  { zone: 'Sud', rang: 2 },
];
const PANNE = new Error('HTTP 503: Service Unavailable');
const INTROUVABLE = new Error('HTTP 404: Not Found');

type Updatable = HTMLElement & { updateComplete: Promise<boolean> };

async function monter<T extends Updatable>(el: T, props: Record<string, unknown>): Promise<T> {
  Object.assign(el, props);
  document.body.appendChild(el);
  await el.updateComplete;
  return el;
}

/** Tous les événements `loaded` et `error` du bus, dans l'ordre. */
function ecouter(): {
  loaded: DataLoadedEvent[];
  errors: DataErrorEvent[];
  stop: () => void;
} {
  const loaded: DataLoadedEvent[] = [];
  const errors: DataErrorEvent[] = [];
  const onLoaded = (e: Event) => loaded.push((e as CustomEvent<DataLoadedEvent>).detail);
  const onError = (e: Event) => errors.push((e as CustomEvent<DataErrorEvent>).detail);
  document.addEventListener(DATA_EVENTS.LOADED, onLoaded);
  document.addEventListener(DATA_EVENTS.ERROR, onError);
  return {
    loaded,
    errors,
    stop: () => {
      document.removeEventListener(DATA_EVENTS.LOADED, onLoaded);
      document.removeEventListener(DATA_EVENTS.ERROR, onError);
    },
  };
}

const pause = (ms = 15): Promise<void> => new Promise((r) => setTimeout(r, ms));

beforeEach(() => {
  for (const id of IDS) {
    clearDataCache(id);
    clearDataMeta(id);
  }
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  document.body.innerHTML = '';
  for (const id of IDS) {
    clearDataCache(id);
    clearDataMeta(id);
  }
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('#1272 — le marquage, sur le bus', () => {
  it('un chargement réussi est daté, et rien n’est périmé', () => {
    const bus = ecouter();
    const avant = Date.now();
    dispatchDataLoaded(S, ROWS);
    bus.stop();

    const connu = getLastKnownData(S);
    expect(connu?.data).toBe(ROWS);
    expect(connu?.stale).toBeUndefined();
    expect(connu!.loadedAt).toBeGreaterThanOrEqual(avant);
    expect(isDataStale(S)).toBe(false);
    expect(bus.loaded[0]).toEqual({ sourceId: S, data: ROWS, loadedAt: connu!.loadedAt });
  });

  it('un échec après un chargement : les lignes sortent du cache, datées et marquées', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-12T10:00:00Z'));
    dispatchDataLoaded(S, ROWS);
    const charge = Date.now();
    vi.setSystemTime(new Date('2026-10-12T10:05:00Z'));
    const bus = ecouter();
    dispatchDataError(S, PANNE, 'https://exemple.fr/data.json');
    bus.stop();

    // Le chemin par défaut ne rend plus rien…
    expect(getDataCache(S)).toBeUndefined();
    // … les lignes sont gardées, avec leur date et la cause du barème.
    expect(getLastKnownData(S)).toEqual({
      data: ROWS,
      loadedAt: charge,
      stale: { since: Date.now(), cause: 'service-indisponible', originId: S },
    });
    expect(isDataStale(S)).toBe(true);
    // Le registre d'erreur et l'événement disent la même date.
    expect(getDataErrorState(S)?.lastLoadedAt).toBe(charge);
    expect(bus.errors[0]).toEqual({
      sourceId: S,
      error: PANNE,
      attemptedUrl: 'https://exemple.fr/data.json',
      lastLoadedAt: charge,
    });
  });

  it('un échec sans chargement préalable : rien de périmé, détail d’événement inchangé', () => {
    const bus = ecouter();
    dispatchDataError(S, PANNE);
    bus.stop();

    expect(getLastKnownData(S)).toBeUndefined();
    expect(isDataStale(S)).toBe(false);
    expect(getDataErrorState(S)?.lastLoadedAt).toBeUndefined();
    expect(bus.errors[0]).toEqual({ sourceId: S, error: PANNE });
  });

  it('le nouvel essai efface l’erreur, PAS le marquage', () => {
    dispatchDataLoaded(S, ROWS);
    dispatchDataError(S, PANNE);
    dispatchDataLoading(S);

    expect(getDataErrorState(S)).toBeUndefined();
    expect(isDataStale(S)).toBe(true);
    expect(getDataCache(S)).toBeUndefined();
    expect(getLastKnownData(S)?.stale?.cause).toBe('service-indisponible');
  });

  it('un second échec garde les lignes et la date du premier, et prend la cause du dernier', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-12T10:00:00Z'));
    dispatchDataLoaded(S, ROWS);
    const charge = Date.now();
    vi.setSystemTime(new Date('2026-10-12T10:05:00Z'));
    dispatchDataError(S, PANNE);
    const premierEchec = Date.now();
    vi.setSystemTime(new Date('2026-10-12T10:06:00Z'));
    dispatchDataLoading(S);
    dispatchDataError(S, INTROUVABLE);

    expect(getLastKnownData(S)).toEqual({
      data: ROWS,
      loadedAt: charge,
      stale: { since: premierEchec, cause: 'donnees-introuvables', originId: S },
    });
    expect(getDataErrorState(S)?.lastLoadedAt).toBe(charge);
  });

  it('un chargement réussi lève le marquage, avec une nouvelle date', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-12T10:00:00Z'));
    dispatchDataLoaded(S, ROWS);
    vi.setSystemTime(new Date('2026-10-12T10:05:00Z'));
    dispatchDataError(S, PANNE);
    vi.setSystemTime(new Date('2026-10-12T10:07:00Z'));
    const NOUVELLES = [{ zone: 'Est', population: 7 }];
    dispatchDataLoaded(S, NOUVELLES);

    expect(isDataStale(S)).toBe(false);
    expect(getDataCache(S)).toBe(NOUVELLES);
    expect(getLastKnownData(S)).toEqual({ data: NOUVELLES, loadedAt: Date.now() });
  });

  it('`require-where` qui repasse en attente n’est pas une panne : tout est nettoyé', () => {
    dispatchDataLoaded(S, ROWS);
    dispatchDataIdle(S);
    expect(getLastKnownData(S)).toBeUndefined();
    expect(isDataStale(S)).toBe(false);

    // Et une attente qui suit une panne ne laisse pas de lignes périmées derrière elle.
    dispatchDataLoaded(S, ROWS);
    dispatchDataError(S, PANNE);
    dispatchDataIdle(S);
    expect(getLastKnownData(S)).toBeUndefined();
    expect(isDataStale(S)).toBe(false);
  });

  it('une remise à zéro (`clearDataCache`) nettoie les lignes périmées', () => {
    dispatchDataLoaded(S, ROWS);
    dispatchDataError(S, PANNE);
    clearDataCache(S);
    expect(getLastKnownData(S)).toBeUndefined();
    expect(isDataStale(S)).toBe(false);
    expect(getDataErrorState(S)).toBeUndefined();
  });

  it('une erreur relayée marque l’étape avec l’ORIGINE de la panne', () => {
    dispatchDataLoaded(S, ROWS);
    dispatchDataLoaded(Q, [{ total: 42 }]);
    dispatchDataError(S, INTROUVABLE);
    dispatchDataError(Q, INTROUVABLE, undefined, { relayedFrom: S });

    expect(getDataCache(Q)).toBeUndefined();
    expect(getLastKnownData(Q)?.data).toEqual([{ total: 42 }]);
    expect(getLastKnownData(Q)?.stale).toMatchObject({
      cause: 'donnees-introuvables',
      originId: S,
    });
  });
});

describe('#1272 — la source', () => {
  /** Une source en mode URL dont chaque appel prend la réponse suivante de la file. */
  async function source(
    reponses: Array<{ status: number; rows?: unknown }>
  ): Promise<{ el: DsfrDataSource; fetchMock: ReturnType<typeof vi.fn> }> {
    const fetchMock = vi.fn(async () => {
      const r = reponses.shift() ?? { status: 500 };
      return {
        ok: r.status < 400,
        status: r.status,
        statusText: r.status === 404 ? 'Not Found' : r.status < 400 ? 'OK' : 'Service Unavailable',
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => r.rows,
      };
    });
    vi.stubGlobal('fetch', fetchMock);
    const el = await monter(new DsfrDataSource() as DsfrDataSource & Updatable, {
      id: S,
      url: 'https://exemple.fr/data.json',
    });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await pause();
    return { el, fetchMock };
  }

  it('`getData()` ne rend plus les lignes pendant la panne ; `getLastKnownData()` les rend datées', async () => {
    const { el } = await source([{ status: 200, rows: ROWS }, { status: 503 }]);
    expect(el.getData()).toEqual(ROWS);
    expect(el.isStale()).toBe(false);

    el.reload();
    await vi.waitFor(() => expect(el.getError()).not.toBeNull());

    expect(el.getData()).toBeNull();
    expect(el.isStale()).toBe(true);
    const connu = el.getLastKnownData();
    expect(connu?.data).toEqual(ROWS);
    expect(connu?.stale).toMatchObject({ cause: 'service-indisponible', originId: S });
    expect(connu!.loadedAt).toBeLessThanOrEqual(connu!.stale!.since);
  });

  it('« Réessayer » qui réussit lève le marquage', async () => {
    const NOUVELLES = [{ zone: 'Est', population: 7 }];
    const { el } = await source([
      { status: 200, rows: ROWS },
      { status: 503 },
      { status: 200, rows: NOUVELLES },
    ]);
    el.reload();
    await vi.waitFor(() => expect(el.isStale()).toBe(true));

    requestSourceRetry(S);
    await vi.waitFor(() => expect(el.getData()).toEqual(NOUVELLES));
    expect(el.isStale()).toBe(false);
    expect(el.getLastKnownData()?.stale).toBeUndefined();
    expect(getDataCache(S)).toEqual(NOUVELLES);
  });

  it('pendant le nouvel essai, les anciennes lignes ne reviennent pas', async () => {
    const { el } = await source([{ status: 200, rows: ROWS }, { status: 503 }]);
    el.reload();
    await vi.waitFor(() => expect(el.isStale()).toBe(true));

    // Nouvel essai lancé, pas encore revenu : ni erreur, ni lignes à jour.
    dispatchDataLoading(S);
    (el as unknown as { _error: Error | null })._error = null;
    expect(el.getData()).toBeNull();
    expect(getDataCache(S)).toBeUndefined();
  });

  it('une commande sans effet ne ré-émet pas les anciennes lignes pendant la panne', async () => {
    const { el, fetchMock } = await source([{ status: 200, rows: ROWS }, { status: 503 }]);
    el.reload();
    await vi.waitFor(() => expect(el.isStale()).toBe(true));

    const bus = ecouter();
    // Mode URL : une commande `where` est refusée, et « une commande produit
    // toujours une émission » (#276) ré-émettait alors le cache courant.
    dispatchSourceCommand(S, { where: 'zone:eq:Nord' });
    await pause(30);
    bus.stop();

    expect(bus.loaded).toEqual([]);
    expect(getDataErrorState(S)).toBeDefined();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('retirée de la page, la source ne laisse rien derrière elle', async () => {
    const { el } = await source([{ status: 200, rows: ROWS }, { status: 503 }]);
    el.reload();
    await vi.waitFor(() => expect(el.isStale()).toBe(true));

    el.remove();
    expect(getLastKnownData(S)).toBeUndefined();
    expect(isDataStale(S)).toBe(false);
  });

  it('le corps de la réponse d’erreur est libéré', async () => {
    const cancel = vi.fn(async () => {});
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      bodyUsed: false,
      body: { cancel },
      headers: new Headers(),
    }));
    vi.stubGlobal('fetch', fetchMock);
    const el = await monter(new DsfrDataSource() as DsfrDataSource & Updatable, {
      id: S,
      url: 'https://exemple.fr/data.json',
    });
    await vi.waitFor(() => expect(el.getError()).not.toBeNull());

    expect(cancel).toHaveBeenCalledTimes(1);
    expect(el.getError()?.message).toBe('HTTP 404: Not Found');
  });
});

describe('#1272 — corps d’une réponse refusée', () => {
  it('`httpError` garde le format lu par le barème et abandonne le corps', () => {
    const cancel = vi.fn(async () => {});
    const reponse = {
      status: 503,
      statusText: 'Service Unavailable',
      bodyUsed: false,
      body: { cancel },
    };
    expect(httpError(reponse as unknown as Response).message).toBe('HTTP 503: Service Unavailable');
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('`releaseBody` ne lève jamais : corps absent, déjà lu, ou abandon refusé', async () => {
    expect(() => releaseBody(null)).not.toThrow();
    expect(() => releaseBody({ body: null } as unknown as Response)).not.toThrow();

    const dejaLu = vi.fn(async () => {});
    releaseBody({ bodyUsed: true, body: { cancel: dejaLu } } as unknown as Response);
    expect(dejaLu).not.toHaveBeenCalled();

    const verrouille = {
      bodyUsed: false,
      body: {
        cancel: () => {
          throw new TypeError('locked');
        },
      },
    };
    expect(() => releaseBody(verrouille as unknown as Response)).not.toThrow();

    const rejette = { bodyUsed: false, body: { cancel: () => Promise.reject(new Error('non')) } };
    expect(() => releaseBody(rejette as unknown as Response)).not.toThrow();
    await pause(1);
  });
});

describe('#1272 — un transformateur ne calcule pas sur une entrée périmée', () => {
  it('requête : l’erreur relayée retire son résultat du cache, `getData()` rend vide', async () => {
    dispatchDataLoaded(S, ROWS);
    const q = await monter(new DsfrDataQuery() as DsfrDataQuery & Updatable, {
      id: Q,
      source: S,
      where: 'population:gt:0',
    });
    await vi.waitFor(() => expect(q.getData()).toHaveLength(2));
    expect(q.isStale()).toBe(false);

    dispatchDataError(S, PANNE);

    expect(q.getError()).toBe(PANNE);
    expect(q.isStale()).toBe(true);
    expect(q.getData()).toEqual([]);
    expect(getDataCache(Q)).toBeUndefined();
    expect(q.getLastKnownData()?.data).toHaveLength(2);
    expect(q.getLastKnownData()?.stale).toMatchObject({ originId: S });
  });

  it('requête montée APRÈS la panne : elle relaie l’erreur, et ne lit pas l’ancien jeu', async () => {
    dispatchDataLoaded(S, ROWS);
    dispatchDataError(S, INTROUVABLE);
    const bus = ecouter();
    const q = await monter(new DsfrDataQuery() as DsfrDataQuery & Updatable, {
      id: Q,
      source: S,
      where: 'population:gt:0',
    });
    await pause();
    bus.stop();

    expect(bus.loaded.filter((e) => e.sourceId === Q)).toEqual([]);
    expect(q.getError()).toBe(INTROUVABLE);
    expect(getDataErrorState(Q)).toMatchObject({ originId: S, cause: 'donnees-introuvables' });
    expect(q.getData()).toEqual([]);
  });

  it('normalize : un attribut qui change pendant la panne ne relance pas le calcul', async () => {
    dispatchDataLoaded(S, ROWS);
    const n = await monter(new DsfrDataNormalize() as DsfrDataNormalize & Updatable, {
      id: N,
      source: S,
      rename: 'population:habitants',
    });
    await vi.waitFor(() => expect(getDataCache(N)).toBeDefined());
    dispatchDataError(S, PANNE);
    expect(getDataErrorState(N)).toBeDefined();

    const bus = ecouter();
    n.rename = 'population:habitants | zone:secteur';
    await n.updateComplete;
    await pause();
    bus.stop();

    expect(bus.loaded).toEqual([]);
    expect(getDataErrorState(N)).toBeDefined();
    expect(getDataCache(N)).toBeUndefined();
  });

  it('jointure : le rechargement de l’AUTRE entrée ne refait pas la jointure sur l’ancien côté', async () => {
    dispatchDataLoaded(S, ROWS);
    dispatchDataLoaded(S2, REF);
    const j = await monter(new DsfrDataJoin() as DsfrDataJoin & Updatable, {
      id: J,
      left: S,
      right: S2,
      on: 'zone',
    });
    await vi.waitFor(() => expect(j.getData()).toHaveLength(2));

    dispatchDataError(S, PANNE);
    expect(j.getError()).toBe(PANNE);

    const bus = ecouter();
    dispatchDataLoaded(S2, [...REF, { zone: 'Est', rang: 3 }]);
    await pause();
    bus.stop();

    expect(bus.loaded.filter((e) => e.sourceId === J)).toEqual([]);
    // L'état d'erreur tient : l'aval ne repasse pas de « indisponible » à l'ancien chiffre.
    expect(getDataErrorState(J)).toMatchObject({ originId: S });
    expect(j.getError()).toBe(PANNE);
    expect(j.getData()).toEqual([]);
  });

  it('empilement : même garde, quand l’autre source revient', async () => {
    dispatchDataLoaded(S, ROWS);
    dispatchDataLoaded(S2, ROWS);
    const c = await monter(new DsfrDataConcat() as DsfrDataConcat & Updatable, {
      id: C,
      sources: `${S},${S2}`,
    });
    await vi.waitFor(() => expect(c.getData()).toHaveLength(4));

    dispatchDataError(S, PANNE);
    const bus = ecouter();
    dispatchDataLoaded(S2, ROWS);
    await pause();
    bus.stop();

    expect(bus.loaded.filter((e) => e.sourceId === C)).toEqual([]);
    expect(getDataErrorState(C)).toMatchObject({ originId: S });
    expect(c.getData()).toEqual([]);
  });

  it('pendant le nouvel essai de l’amont, rien n’est émis non plus', async () => {
    dispatchDataLoaded(S, ROWS);
    dispatchDataLoaded(S2, REF);
    await monter(new DsfrDataJoin() as DsfrDataJoin & Updatable, {
      id: J,
      left: S,
      right: S2,
      on: 'zone',
    });
    await vi.waitFor(() => expect(getDataCache(J)).toBeDefined());
    dispatchDataError(S, PANNE);
    dispatchDataLoading(S);

    const bus = ecouter();
    dispatchDataLoaded(S2, REF);
    await pause();
    bus.stop();
    expect(bus.loaded.filter((e) => e.sourceId === J)).toEqual([]);
  });

  it('au retour de l’amont, le transformateur ré-émet, daté de son amont', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-12T10:00:00Z'));
    dispatchDataLoaded(S, ROWS);
    const q = await monter(new DsfrDataQuery() as DsfrDataQuery & Updatable, {
      id: Q,
      source: S,
      where: 'population:gt:0',
    });
    await vi.waitFor(() => expect(q.getData()).toHaveLength(2));
    dispatchDataError(S, PANNE);

    vi.setSystemTime(new Date('2026-10-12T10:10:00Z'));
    dispatchDataLoaded(S, [...ROWS, { zone: 'Est', population: 7 }]);
    const retour = Date.now();
    vi.setSystemTime(new Date('2026-10-12T10:20:00Z'));
    await vi.waitFor(() => expect(q.getData()).toHaveLength(3));

    expect(q.isStale()).toBe(false);
    expect(q.getError()).toBeNull();
    expect(getLastKnownData(Q)).toMatchObject({ loadedAt: retour });
    expect(getLastKnownData(Q)?.stale).toBeUndefined();
  });
});

describe('#1272 — les lecteurs du cache, un par un', () => {
  it('afficheur monté pendant le nouvel essai : en chargement, sans l’ancien chiffre', async () => {
    dispatchDataLoaded(S, ROWS);
    dispatchDataError(S, PANNE);
    dispatchDataLoading(S);

    const kpi = await monter(new DsfrDataKpi() as DsfrDataKpi & Updatable, {
      source: S,
      value: 'population:sum',
      label: 'Population',
    });
    const interne = kpi as unknown as { _sourceLoading: boolean; _sourceData: unknown };
    expect(interne._sourceLoading).toBe(true);
    expect(interne._sourceData).toBeNull();
    expect(kpi.textContent).not.toContain('42');
  });

  it('`scopes` monté après la panne : les ids scopés sont en erreur, origine relayée', () => {
    dispatchDataLoaded(S, ROWS);
    dispatchDataError(S, PANNE);

    const emetteur = new ScopeEmitter(
      () => {},
      () => true
    );
    emetteur.configure(`${S}:zone:zone`, 'zone');
    emetteur.setKeys(['Nord', 'Sud']);
    emetteur.emit();

    expect(getDataCache('zone-Nord')).toBeUndefined();
    expect(getDataErrorState('zone-Nord')).toMatchObject({ originId: S });
    emetteur.teardown();
  });

  it('KPI en chargement : l’`aria-label` ne porte plus le dernier chiffre reçu', async () => {
    dispatchDataLoaded(S, ROWS);
    const kpi = await monter(new DsfrDataKpi() as DsfrDataKpi & Updatable, {
      source: S,
      value: 'population:sum',
      label: 'Population',
    });
    const figure = (): string =>
      kpi.querySelector('[role="figure"]')?.getAttribute('aria-label') ?? '';
    expect(figure()).toBe('Population: 42');

    dispatchDataLoading(S);
    await kpi.updateComplete;
    expect(figure()).toBe('Population: chargement en cours');
    expect(figure()).not.toContain('42');
  });
});
