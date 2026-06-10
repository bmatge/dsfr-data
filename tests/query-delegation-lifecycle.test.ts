import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Tests traversants #276 (EPIC B) — cycle de vie de la délégation serveur
 * de dsfr-data-query : gel des données au changement d'attribut, overlay
 * orphelin au retrait de group-by ou au changement de source.
 *
 * Bugs d'origine :
 * - changement d'attribut (`limit`…) → `_negotiateServerSide` renvoyait la
 *   même commande → dédupliquée par la source (pas de refetch) ; la query
 *   sautait le cache et attendait une émission qui ne venait jamais →
 *   changer `limit="10"` en `limit="5"` n'avait aucun effet ;
 * - retrait de `group-by` ou changement de `source` : le tracking était
 *   réinitialisé AVANT tout cleanup → la source gardait indéfiniment
 *   l'overlay groupBy et servait des données agrégées.
 *
 * Contrat fixé :
 * - une re-négociation identique ne redispatche pas et lit le cache (qui
 *   correspond à l'état courant des overlays) ;
 * - les opérations qui ne sont plus déléguées sont libérées (valeur vide) ;
 * - au changement de source, les clears partent vers l'ANCIENNE source ;
 * - côté source, une commande entièrement dédupliquée ré-émet le cache en
 *   asynchrone (contrat « commande → toujours une émission »).
 */

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

import { DsfrDataQuery } from '@/components/dsfr-data-query.js';
import { DsfrDataSource } from '@/components/dsfr-data-source.js';
import {
  clearDataCache,
  clearDataMeta,
  dispatchDataLoaded,
  dispatchSourceCommand,
  subscribeToSource,
  subscribeToSourceCommands,
} from '@/utils/data-bridge.js';

const RAW_ROWS = [
  { region: 'IDF', population: 12000 },
  { region: 'IDF', population: 3000 },
  { region: 'PACA', population: 6000 },
  { region: 'BRE', population: 1000 },
];

const AGGREGATED_ROWS = [
  { region: 'IDF', total: 15000 },
  { region: 'PACA', total: 6000 },
  { region: 'BRE', total: 1000 },
];

function makeSourceEl(id: string, withAdapter: boolean): HTMLElement {
  const el = document.createElement('div');
  el.id = id;
  if (withAdapter) {
    (el as unknown as Record<string, unknown>).getAdapter = () => ({
      type: 'mock',
      capabilities: { serverGroupBy: true, serverOrderBy: true, whereFormat: 'odsql' },
    });
  }
  document.body.appendChild(el);
  return el;
}

describe('#276 — gel des données au changement d’attribut (re-négociation dédupliquée)', () => {
  let query: DsfrDataQuery;
  let sourceEl: HTMLElement;
  let commands: Array<Record<string, unknown>>;
  let unsubscribe: () => void;

  beforeEach(() => {
    clearDataCache('b2-src');
    clearDataMeta('b2-src');
    clearDataCache('b2-stats');
    clearDataMeta('b2-stats');
    sourceEl = makeSourceEl('b2-src', true);
    commands = [];
    unsubscribe = subscribeToSourceCommands('b2-src', (cmd) =>
      commands.push(cmd as Record<string, unknown>)
    );
    query = new DsfrDataQuery();
    query.id = 'b2-stats';
    query.source = 'b2-src';
    query.groupBy = 'region';
    query.aggregate = 'population:sum:total';
  });

  afterEach(() => {
    (query as any)._cleanup();
    unsubscribe();
    sourceEl.remove();
  });

  it('AC : changer limit sur une query déléguée met à jour l’aval', () => {
    (query as any)._initialize();
    expect(commands).toHaveLength(1);

    // Le « serveur » répond aux overlays : lignes agrégées
    dispatchDataLoaded('b2-src', AGGREGATED_ROWS);
    expect(query.getData()).toHaveLength(3);

    // Changement d'attribut purement client → re-négociation identique :
    // pas de nouvelle commande, mais le cache (à jour) est relu
    query.limit = 2;
    (query as any)._initialize();

    expect(commands).toHaveLength(1);
    expect(query.getData()).toEqual(AGGREGATED_ROWS.slice(0, 2));
  });

  it('une re-négociation avec délégation modifiée redispatche et attend l’émission fraîche', () => {
    (query as any)._initialize();
    dispatchDataLoaded('b2-src', AGGREGATED_ROWS);
    expect(commands).toHaveLength(1);

    query.groupBy = 'dept';
    (query as any)._initialize();

    expect(commands).toHaveLength(2);
    expect(commands[1].groupBy).toBe('dept');
    // Émission pas encore arrivée → le cache (périmé) ne doit pas être lu
    expect((query as any)._sourceEmittedSinceCommand).toBe(false);
  });

  it('AC : retirer group-by libère l’overlay et rend les lignes brutes', () => {
    (query as any)._initialize();
    dispatchDataLoaded('b2-src', AGGREGATED_ROWS);
    expect(commands).toHaveLength(1);

    query.groupBy = '';
    query.aggregate = '';
    (query as any)._initialize();

    // Clears envoyés à la source (groupBy + aggregate délégués avant)
    expect(commands).toHaveLength(2);
    expect(commands[1].groupBy).toBe('');
    expect(commands[1].aggregate).toBe('');

    // La source refetche et émet les lignes brutes → pass-through
    dispatchDataLoaded('b2-src', RAW_ROWS);
    expect(query.getData()).toEqual(RAW_ROWS);
  });

  it('le where délégué est libéré avec le group-by quand il disparaît', () => {
    query.where = 'population:gt:2500';
    (query as any)._initialize();
    expect(commands).toHaveLength(1);
    expect(commands[0].where).toBe('population > 2500');

    query.where = '';
    query.groupBy = '';
    query.aggregate = '';
    (query as any)._initialize();

    expect(commands).toHaveLength(2);
    expect(commands[1].where).toBe('');
    expect(commands[1].whereKey).toBe('query-b2-stats');
  });

  it('au changement de source, les clears partent vers l’ancienne source', () => {
    const sourceB = makeSourceEl('b2-src-b', false);
    const commandsB: Array<Record<string, unknown>> = [];
    const unsubB = subscribeToSourceCommands('b2-src-b', (cmd) =>
      commandsB.push(cmd as Record<string, unknown>)
    );

    query.where = 'population:gt:2500';
    (query as any)._initialize();
    expect(commands).toHaveLength(1);

    query.source = 'b2-src-b';
    (query as any)._initialize();

    // L'ancienne source reçoit les clears…
    expect(commands).toHaveLength(2);
    expect(commands[1].groupBy).toBe('');
    expect(commands[1].aggregate).toBe('');
    expect(commands[1].where).toBe('');
    expect(commands[1].whereKey).toBe('query-b2-stats');
    // …la nouvelle (sans adapter) ne reçoit rien
    expect(commandsB).toHaveLength(0);

    unsubB();
    sourceB.remove();
    clearDataCache('b2-src-b');
  });

  it('le disconnect nettoie la cible réellement déléguée même si source a changé entre-temps', () => {
    (query as any)._initialize();
    expect(commands).toHaveLength(1);

    // source modifiée SANS re-négociation (pas de willUpdate en test direct)
    query.source = 'b2-src-b';
    (query as any)._clearServerDelegation();

    // Le clear part vers b2-src (cible de la délégation), pas b2-src-b
    expect(commands).toHaveLength(2);
    expect(commands[1].groupBy).toBe('');
  });
});

describe('#276 — ré-émission du cache par la source sur commande dédupliquée', () => {
  let source: DsfrDataSource;

  beforeEach(() => {
    source = new DsfrDataSource();
    source.id = 'b2-reemit';
    source.paginate = true;
    clearDataCache('b2-reemit');
    clearDataMeta('b2-reemit');
  });

  afterEach(() => {
    (source as any)._cleanup();
  });

  it('une commande no-op ré-émet le cache en asynchrone', async () => {
    (source as any)._setupCommandListener();
    (source as any)._data = [{ a: 1 }];

    const received: unknown[] = [];
    const unsub = subscribeToSource('b2-reemit', {
      onLoaded: (data: unknown) => received.push(data),
    });

    // page 1 = page courante → commande entièrement no-op
    dispatchSourceCommand('b2-reemit', { page: 1 });

    // Asynchrone : l'appelant a le temps de s'abonner après sa commande
    expect(received).toHaveLength(0);
    await new Promise((r) => setTimeout(r, 10));
    expect(received).toHaveLength(1);
    expect(received[0]).toEqual([{ a: 1 }]);

    unsub();
  });

  it('plusieurs commandes no-op consécutives ne produisent qu’une ré-émission', async () => {
    (source as any)._setupCommandListener();
    (source as any)._data = [{ a: 1 }];

    const received: unknown[] = [];
    const unsub = subscribeToSource('b2-reemit', {
      onLoaded: (data: unknown) => received.push(data),
    });

    dispatchSourceCommand('b2-reemit', { page: 1 });
    dispatchSourceCommand('b2-reemit', { page: 1 });
    dispatchSourceCommand('b2-reemit', { page: 1 });

    await new Promise((r) => setTimeout(r, 10));
    expect(received).toHaveLength(1);

    unsub();
  });

  it('pas de ré-émission quand la commande déclenche un fetch', async () => {
    (source as any)._setupCommandListener();
    (source as any)._data = [{ a: 1 }];
    const fetchSpy = vi.spyOn(source as any, '_scheduleFetch').mockImplementation(() => {});

    const received: unknown[] = [];
    const unsub = subscribeToSource('b2-reemit', {
      onLoaded: (data: unknown) => received.push(data),
    });

    dispatchSourceCommand('b2-reemit', { page: 2 });

    await new Promise((r) => setTimeout(r, 10));
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(received).toHaveLength(0);

    fetchSpy.mockRestore();
    unsub();
  });

  it('pas de ré-émission quand la source n’a encore aucune donnée', async () => {
    (source as any)._setupCommandListener();

    const received: unknown[] = [];
    const unsub = subscribeToSource('b2-reemit', {
      onLoaded: (data: unknown) => received.push(data),
    });

    dispatchSourceCommand('b2-reemit', { page: 1 });

    await new Promise((r) => setTimeout(r, 10));
    expect(received).toHaveLength(0);

    unsub();
  });
});

describe('#276 — scénario bout-en-bout : gel résolu via la ré-émission', () => {
  it('un second transformateur identique reçoit les données malgré la dédup de sa commande', async () => {
    // Simule le scénario « 3 queries identiques sur la même source Grist » :
    // la 2e query envoie une commande identique à celle de la 1re (dédupliquée
    // par la source dont le fetch est déjà terminé) — sans ré-émission, elle
    // attendrait indéfiniment.
    clearDataCache('b2-e2e-src');
    clearDataMeta('b2-e2e-src');

    const source = new DsfrDataSource();
    source.id = 'b2-e2e-src';
    // Mode adapter : les commandes groupBy ne concernent que lui (#288)
    source.apiType = 'grist';
    source.baseUrl = 'https://grist.example.fr/api/docs/d/tables/T/records';
    (source as any)._setupCommandListener();

    const sourceEl = document.createElement('div');
    sourceEl.id = 'b2-e2e-src-el'; // el distinct : la vraie source est hors DOM
    document.body.appendChild(sourceEl);

    // État post-fetch de la 1re query : overlay groupBy en place, données servies
    dispatchSourceCommand('b2-e2e-src', { groupBy: 'region', aggregate: 'population:sum:total' });
    (source as any)._scheduleFetch = () => {}; // le fetch « a déjà eu lieu »
    (source as any)._fetchScheduled = false;
    (source as any)._data = AGGREGATED_ROWS;
    dispatchDataLoaded('b2-e2e-src', AGGREGATED_ROWS);

    // 2e query : même commande → dédupliquée → doit être servie par ré-émission
    const received: unknown[] = [];
    dispatchSourceCommand('b2-e2e-src', { groupBy: 'region', aggregate: 'population:sum:total' });
    const unsub = subscribeToSource('b2-e2e-src', {
      onLoaded: (data: unknown) => received.push(data),
    });

    await new Promise((r) => setTimeout(r, 10));
    expect(received).toHaveLength(1);
    expect(received[0]).toEqual(AGGREGATED_ROWS);

    unsub();
    (source as any)._cleanup();
    sourceEl.remove();
    clearDataCache('b2-e2e-src');
  });
});
