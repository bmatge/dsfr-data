import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Tests traversants #275 (EPIC B) — délégation serveur du WHERE de dsfr-data-query.
 *
 * Bug d'origine : en chemin délégué (serverGroupBy), la commande envoyée à
 * dsfr-data-source ne contenait jamais le where de la query ; le filtre était
 * ensuite appliqué client-side sur les lignes AGRÉGÉES où les champs bruts
 * n'existent plus → toutes les lignes éliminées. Le même HTML donnait des
 * résultats différents selon les capabilities de l'adapter.
 *
 * Contrat fixé :
 * - le where (colon) est traduit au dialecte de l'adapter (ODSQL ou colon)
 *   et envoyé avec la délégation group-by, sous la clé `query-<id>` ;
 * - un where intraduisible (syntaxe non-colon, opérateur inconnu) bloque TOUTE
 *   la délégation : le filtre doit s'appliquer sur les lignes brutes, donc
 *   avant un group-by qui reste alors client-side lui aussi ;
 * - le filtre n'est jamais ré-appliqué client-side sur des lignes agrégées ;
 * - la source dédoublonne les commandes where identiques (pas de refetch).
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
  subscribeToSourceCommands,
} from '@/utils/data-bridge.js';

const RAW_ROWS = [
  { region: 'IDF', population: 12000 },
  { region: 'IDF', population: 3000 },
  { region: 'PACA', population: 6000 },
  { region: 'PACA', population: 2000 },
  { region: 'BRE', population: 1000 },
];

// where population:gt:2500 puis group-by region + sum →
const AGGREGATED_ROWS = [
  { region: 'IDF', total: 15000 },
  { region: 'PACA', total: 6000 },
];

type Caps = {
  serverGroupBy?: boolean;
  serverOrderBy?: boolean;
  whereFormat?: 'odsql' | 'colon';
};

function makeSourceEl(
  id: string,
  caps: Caps | null,
  supportsServerFields?: (fields: string[]) => boolean
): HTMLElement {
  const el = document.createElement('div');
  el.id = id;
  if (caps) {
    (el as unknown as Record<string, unknown>).getAdapter = () => ({
      type: 'mock',
      capabilities: caps,
      ...(supportsServerFields ? { supportsServerFields } : {}),
    });
  }
  document.body.appendChild(el);
  return el;
}

describe('#275 — délégation serveur du where de dsfr-data-query', () => {
  let query: DsfrDataQuery;
  let sourceEl: HTMLElement | null = null;
  let commands: Array<Record<string, unknown>>;
  let unsubscribe: (() => void) | null = null;

  beforeEach(() => {
    query = new DsfrDataQuery();
    query.id = 'stats';
    query.source = 'b1-src';
    commands = [];
    clearDataCache('b1-src');
    clearDataMeta('b1-src');
    clearDataCache('stats');
    clearDataMeta('stats');
  });

  afterEach(() => {
    (query as unknown as { _cleanup(): void })._cleanup?.();
    unsubscribe?.();
    unsubscribe = null;
    sourceEl?.remove();
    sourceEl = null;
  });

  function setup(caps: Caps | null, supportsServerFields?: (fields: string[]) => boolean) {
    sourceEl = makeSourceEl('b1-src', caps, supportsServerFields);
    unsubscribe = subscribeToSourceCommands('b1-src', (cmd) =>
      commands.push(cmd as Record<string, unknown>)
    );
  }

  it('traduit le where colon en ODSQL et le joint à la délégation group-by', () => {
    setup({ serverGroupBy: true, whereFormat: 'odsql' });
    query.where = 'population:gt:2500';
    query.groupBy = 'region';
    query.aggregate = 'population:sum:total';

    (query as any)._negotiateServerSide();

    expect(commands).toHaveLength(1);
    expect(commands[0].groupBy).toBe('region');
    expect(commands[0].aggregate).toBe('population:sum:total');
    expect(commands[0].where).toBe('population > 2500');
    expect(commands[0].whereKey).toBe('query-stats');
    expect((query as any)._serverDelegated).toEqual({
      groupBy: true,
      aggregate: true,
      orderBy: false,
      where: true,
    });
  });

  it('transmet le where colon tel quel aux adapters colon', () => {
    setup({ serverGroupBy: true, whereFormat: 'colon' });
    query.filter = 'population:gt:2500, region:neq:BRE';
    query.groupBy = 'region';
    query.aggregate = 'population:sum:total';

    (query as any)._negotiateServerSide();

    expect(commands).toHaveLength(1);
    expect(commands[0].where).toBe('population:gt:2500, region:neq:BRE');
    expect(commands[0].whereKey).toBe('query-stats');
  });

  it("n'applique pas le filtre client sur les lignes agrégées reçues du serveur", () => {
    setup({ serverGroupBy: true, whereFormat: 'odsql' });
    query.where = 'population:gt:2500';
    query.groupBy = 'region';
    query.aggregate = 'population:sum:total';

    (query as any)._initialize();

    // Le serveur (simulé) renvoie les lignes agrégées : le champ brut
    // `population` n'existe plus. Avant le fix, le filtre population:gt:2500
    // était ré-appliqué dessus → toutes les lignes éliminées.
    dispatchDataLoaded('b1-src', AGGREGATED_ROWS);

    expect(query.getData()).toEqual(AGGREGATED_ROWS);
  });

  it('where intraduisible (syntaxe ODSQL) → aucune délégation, traitement client complet', () => {
    setup({ serverGroupBy: true, whereFormat: 'odsql' });
    query.where = 'population > 2500';
    query.groupBy = 'region';
    query.aggregate = 'population:sum:total';

    (query as any)._negotiateServerSide();

    expect(commands).toHaveLength(0);
    expect((query as any)._serverDelegated).toEqual({
      groupBy: false,
      aggregate: false,
      orderBy: false,
      where: false,
    });
  });

  it('where avec opérateur inconnu → aucune délégation', () => {
    setup({ serverGroupBy: true, whereFormat: 'odsql' });
    query.where = 'region:like:ID';
    query.groupBy = 'region';
    query.aggregate = 'population:sum:total';

    (query as any)._negotiateServerSide();

    expect(commands).toHaveLength(0);
    expect((query as any)._serverDelegated.groupBy).toBe(false);
  });

  it('les champs du where participent au contrôle supportsServerFields', () => {
    setup({ serverGroupBy: true, whereFormat: 'colon' }, (fields) =>
      fields.every((f) => /^[\p{L}\p{N}_]+$/u.test(f))
    );
    query.where = 'Date - Journée gazière:gt:5';
    query.groupBy = 'region';
    query.aggregate = 'population:sum:total';

    (query as any)._negotiateServerSide();

    expect(commands).toHaveLength(0);
    expect((query as any)._serverDelegated.groupBy).toBe(false);
  });

  it('sans where, la délégation group-by reste inchangée (pas de clé where dans la commande)', () => {
    setup({ serverGroupBy: true, whereFormat: 'odsql' });
    query.groupBy = 'region';
    query.aggregate = 'population:sum:total';

    (query as any)._negotiateServerSide();

    expect(commands).toHaveLength(1);
    expect(commands[0].groupBy).toBe('region');
    expect('where' in commands[0]).toBe(false);
    expect('whereKey' in commands[0]).toBe(false);
  });

  it('AC #275 — même HTML, même résultat : client (generic) vs délégué (ODS simulé)', () => {
    // Chemin A : pas d'adapter → tout client-side
    const srcA = makeSourceEl('b1-src-a', null);
    const queryA = new DsfrDataQuery();
    queryA.id = 'stats-a';
    queryA.source = 'b1-src-a';
    queryA.where = 'population:gt:2500';
    queryA.groupBy = 'region';
    queryA.aggregate = 'population:sum:total';

    (queryA as any)._initialize();
    dispatchDataLoaded('b1-src-a', RAW_ROWS);
    const resultClient = queryA.getData();

    // Chemin B : adapter odsql serverGroupBy → délégation ; le test joue le
    // rôle du serveur ODS (filtre + group-by + sum sur le même dataset)
    setup({ serverGroupBy: true, whereFormat: 'odsql' });
    query.where = 'population:gt:2500';
    query.groupBy = 'region';
    query.aggregate = 'population:sum:total';

    (query as any)._initialize();
    expect(commands).toHaveLength(1);
    dispatchDataLoaded('b1-src', AGGREGATED_ROWS);
    const resultServer = query.getData();

    expect(resultClient).toEqual(resultServer);
    expect(resultServer).toEqual(AGGREGATED_ROWS);

    (queryA as any)._cleanup();
    srcA.remove();
    clearDataCache('b1-src-a');
    clearDataCache('stats-a');
  });

  it('cleanup : le disconnect retire aussi la délégation where (overlay nettoyé)', () => {
    setup({ serverGroupBy: true, whereFormat: 'odsql' });
    query.where = 'population:gt:2500';
    query.groupBy = 'region';
    query.aggregate = 'population:sum:total';

    (query as any)._negotiateServerSide();
    expect(commands).toHaveLength(1);

    (query as any)._clearServerDelegation();

    expect(commands).toHaveLength(2);
    expect(commands[1].groupBy).toBe('');
    expect(commands[1].aggregate).toBe('');
    expect(commands[1].where).toBe('');
    expect(commands[1].whereKey).toBe('query-stats');
  });
});

describe('#275 — dédup des commandes where côté dsfr-data-source', () => {
  let source: DsfrDataSource;

  beforeEach(() => {
    source = new DsfrDataSource();
    source.id = 'dedup-src';
    // Mode adapter : les commandes where ne concernent que lui (#288 — le
    // mode URL les refuse explicitement)
    source.apiType = 'opendatasoft';
    source.datasetId = 'ds';
    clearDataCache('dedup-src');
    clearDataMeta('dedup-src');
  });

  afterEach(() => {
    (source as any)._cleanup();
  });

  it('une commande where identique ne déclenche pas de refetch', () => {
    (source as any)._setupCommandListener();
    const fetchSpy = vi.spyOn(source as any, '_scheduleFetch').mockImplementation(() => {});

    dispatchSourceCommand('dedup-src', { where: 'population > 2500', whereKey: 'query-stats' });
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Re-négociation avec le même where (changement de limit par ex.)
    dispatchSourceCommand('dedup-src', { where: 'population > 2500', whereKey: 'query-stats' });
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Valeur différente → refetch
    dispatchSourceCommand('dedup-src', { where: 'population > 5000', whereKey: 'query-stats' });
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    fetchSpy.mockRestore();
  });

  it('le retrait du where ne refetche que si un overlay existait', () => {
    (source as any)._setupCommandListener();
    const fetchSpy = vi.spyOn(source as any, '_scheduleFetch').mockImplementation(() => {});

    // Retrait sans overlay préalable → no-op
    dispatchSourceCommand('dedup-src', { where: '', whereKey: 'query-stats' });
    expect(fetchSpy).toHaveBeenCalledTimes(0);

    dispatchSourceCommand('dedup-src', { where: 'population > 2500', whereKey: 'query-stats' });
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    dispatchSourceCommand('dedup-src', { where: '', whereKey: 'query-stats' });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect((source as any)._whereOverlays.size).toBe(0);
  });

  it('le changement de where réinitialise la pagination à la page 1', () => {
    (source as any)._setupCommandListener();
    const fetchSpy = vi.spyOn(source as any, '_scheduleFetch').mockImplementation(() => {});

    dispatchSourceCommand('dedup-src', { page: 3 });
    expect((source as any)._currentPage).toBe(3);

    dispatchSourceCommand('dedup-src', { where: 'population > 2500', whereKey: 'query-stats' });
    expect((source as any)._currentPage).toBe(1);

    fetchSpy.mockRestore();
  });
});
