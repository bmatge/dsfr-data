import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * #672 — agrégat `distinct` (alias `count-distinct`) dans la grammaire
 * commune : KPI, query client, ODS `count(distinct x)`, Grist SQL
 * `COUNT(DISTINCT x)`, délégation REFUSÉE côté Tabular (calcul client sur
 * les lignes reçues, warn si tronquées).
 */

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

import {
  parseExpression,
  computeAggregation,
  countDistinct,
  KPI_AGGREGATION_TYPES,
} from '@/utils/aggregations.js';
import {
  AGGREGATE_FUNCTIONS,
  parseAggregates,
  validateAggregateFunctions,
} from '@/utils/aggregates.js';
import { DsfrDataQuery } from '@/components/dsfr-data-query.js';
import { DsfrDataKpi } from '@/components/dsfr-data-kpi.js';
import { OpenDataSoftAdapter } from '@/adapters/opendatasoft-adapter.js';
import { TabularAdapter } from '@/adapters/tabular-adapter.js';
import { GristAdapter } from '@/adapters/grist-adapter.js';
import type { AdapterParams } from '@/adapters/api-adapter.js';
import {
  clearDataCache,
  clearDataMeta,
  setDataMeta,
  subscribeToSourceCommands,
} from '@/utils/data-bridge.js';

const DEPARTEMENTS = [
  { nom_departement: 'Ain', commune: 'Bourg' },
  { nom_departement: 'Ain', commune: 'Oyonnax' },
  { nom_departement: 'Aisne', commune: 'Laon' },
  { nom_departement: null, commune: 'Inconnue' },
  { nom_departement: '', commune: 'Vide' },
  { nom_departement: '  ', commune: 'Blanche' },
  { nom_departement: 'Allier', commune: 'Moulins' },
];

function makeParams(overrides: Partial<AdapterParams> = {}): AdapterParams {
  return {
    baseUrl: 'https://example.org/api/docs/doc1/tables/t1/records',
    datasetId: 'ds',
    resource: 'res',
    where: '',
    filter: '',
    select: '',
    groupBy: 'region',
    aggregate: 'commune:distinct',
    orderBy: '',
    serverSide: false,
    pageSize: 20,
    limit: 0,
    headers: {},
    ...overrides,
  } as AdapterParams;
}

/** Vue interne de la query (groupement client). */
interface QueryInternals {
  _applyGroupByAndAggregate(d: Record<string, unknown>[]): Record<string, unknown>[];
  _computeGlobalAggregates(d: Record<string, unknown>[]): Record<string, unknown>;
  _negotiateServerSide(): void;
  _serverDelegated: { groupBy: boolean; aggregate: boolean };
  _cleanup?(): void;
}
const queryInternals = (q: DsfrDataQuery) => q as unknown as QueryInternals;

/** Vue interne du KPI. */
interface KpiInternals {
  _sourceData: unknown;
  _computeValue(): number | string | null;
}
const kpiInternals = (k: DsfrDataKpi) => k as unknown as KpiInternals;

describe('#672 — grammaire KPI : champ:distinct', () => {
  it('distinct est dans la liste blanche, count-distinct est son alias', () => {
    expect(KPI_AGGREGATION_TYPES).toContain('distinct');
    expect(parseExpression('nom_departement:distinct')).toEqual({
      type: 'distinct',
      field: 'nom_departement',
    });
    expect(parseExpression('nom_departement:count-distinct')).toEqual({
      type: 'distinct',
      field: 'nom_departement',
    });
  });

  it('AC : compte les valeurs distinctes, null et chaîne vide (ou blanche) exclus', () => {
    // Ain, Aisne, Allier — null, '' et '  ' ne comptent pas
    expect(computeAggregation(DEPARTEMENTS, 'nom_departement:distinct')).toBe(3);
    expect(computeAggregation(DEPARTEMENTS, 'nom_departement:count-distinct')).toBe(3);
  });

  it('compare sur la valeur ramenée en chaîne : 75 et "75" comptent pour une', () => {
    expect(countDistinct([{ d: 75 }, { d: '75' }, { d: 13 }], 'd')).toBe(2);
  });

  it('un champ tableau compte ses éléments distincts', () => {
    const rows = [{ tags: ['a', 'b'] }, { tags: ['b', 'c'] }, { tags: [] }, { tags: null }];
    expect(countDistinct(rows, 'tags')).toBe(3);
  });

  it('tableau vide -> 0, chemin imbriqué accepté', () => {
    expect(computeAggregation([], 'x:distinct')).toBe(0);
    expect(
      computeAggregation([{ f: { code: 'A' } }, { f: { code: 'A' } }], 'f.code:distinct')
    ).toBe(1);
  });
});

describe('#672 — dsfr-data-kpi : value="champ:distinct"', () => {
  let kpi: DsfrDataKpi;
  beforeEach(() => {
    clearDataCache('depts');
    clearDataMeta('depts');
    kpi = new DsfrDataKpi();
    kpi.source = 'depts';
  });
  afterEach(() => {
    vi.restoreAllMocks();
    clearDataMeta('depts');
  });

  it('AC : value="nom_departement:distinct" -> nombre de départements', () => {
    kpi.value = 'nom_departement:distinct';
    kpiInternals(kpi)._sourceData = DEPARTEMENTS;
    expect(kpiInternals(kpi)._computeValue()).toBe(3);
  });

  it('lignes tronquées : warn meta.total comme pour count (#659)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    setDataMeta('depts', { page: 1, pageSize: 0, total: 101, serverSide: false });
    kpi.value = 'nom_departement:distinct';
    kpiInternals(kpi)._sourceData = DEPARTEMENTS;
    kpiInternals(kpi)._computeValue();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('value="distinct"');
    expect(warn.mock.calls[0][0]).toContain('101');
  });
});

describe('#672 — grammaire query : distinct', () => {
  it('distinct est dans AGGREGATE_FUNCTIONS, count-distinct est canonisé', () => {
    expect(AGGREGATE_FUNCTIONS).toContain('distinct');
    expect(parseAggregates('commune:distinct')).toEqual([
      { field: 'commune', function: 'distinct', alias: 'commune__distinct' },
    ]);
    // Aller-retour alias : la forme canonique nomme la colonne
    expect(parseAggregates('commune:count-distinct')).toEqual([
      { field: 'commune', function: 'distinct', alias: 'commune__distinct' },
    ]);
    expect(validateAggregateFunctions('commune:distinct, id:count')).toBeNull();
  });

  it('count-if est refusé (dupliquerait where) avec un message orientant vers where', () => {
    const msg = validateAggregateFunctions('statut:count-if');
    expect(msg).toContain('count-if');
    expect(msg).toContain('where=');
    expect(validateAggregateFunctions('statut:countif')).toContain('where=');
  });

  it('client-side : group-by + distinct -> colonne champ__distinct', () => {
    const query = new DsfrDataQuery();
    query.groupBy = 'nom_departement';
    query.aggregate = 'commune:distinct';
    const rows = queryInternals(query)._applyGroupByAndAggregate([
      { nom_departement: 'Ain', commune: 'Bourg' },
      { nom_departement: 'Ain', commune: 'Bourg' },
      { nom_departement: 'Ain', commune: 'Oyonnax' },
      { nom_departement: 'Aisne', commune: 'Laon' },
      { nom_departement: 'Aisne', commune: '' },
    ]);
    expect(rows.find((r) => r.nom_departement === 'Ain')?.commune__distinct).toBe(2);
    expect(rows.find((r) => r.nom_departement === 'Aisne')?.commune__distinct).toBe(1);
  });

  it('client-side : agrégat global distinct', () => {
    const query = new DsfrDataQuery();
    query.aggregate = 'nom_departement:count-distinct';
    expect(queryInternals(query)._computeGlobalAggregates(DEPARTEMENTS)).toEqual({
      nom_departement__distinct: 3,
    });
  });
});

describe('#672 — traduction par adaptateur', () => {
  it('ODS : count(distinct champ) as champ__distinct', () => {
    const adapter = new OpenDataSoftAdapter();
    const url = new URL(adapter.buildUrl(makeParams({ baseUrl: 'https://data.example.org' })));
    expect(url.searchParams.get('select')).toContain(
      'count(distinct commune) as commune__distinct'
    );
  });

  it('ODS : alias count-distinct -> même select, même colonne', () => {
    const adapter = new OpenDataSoftAdapter();
    const url = new URL(
      adapter.buildUrl(
        makeParams({ baseUrl: 'https://data.example.org', aggregate: 'commune:count-distinct' })
      )
    );
    expect(url.searchParams.get('select')).toContain(
      'count(distinct commune) as commune__distinct'
    );
  });

  it('Grist SQL : COUNT(DISTINCT "champ") as "champ__distinct"', async () => {
    const adapter = new GristAdapter();
    mockFetch.mockReset();
    mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ records: [[1]] }) });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({ columns: ['region', 'commune__distinct'], records: [['A', 2]] }),
    });

    const result = await adapter.fetchAll(makeParams(), new AbortController().signal);
    const body = JSON.parse((mockFetch.mock.calls[1][1] as RequestInit).body as string) as {
      sql: string;
    };
    expect(body.sql).toContain('COUNT(DISTINCT "commune") as "commune__distinct"');
    expect(result.data[0]).toHaveProperty('commune__distinct', 2);
  });

  describe('Tabular : délégation refusée', () => {
    let adapter: TabularAdapter;
    let warn: ReturnType<typeof vi.fn<(...args: unknown[]) => void>>;
    beforeEach(() => {
      adapter = new TabularAdapter();
      mockFetch.mockReset();
      warn = vi.fn<(...args: unknown[]) => void>();
      vi.spyOn(console, 'warn').mockImplementation(warn);
    });
    afterEach(() => vi.restoreAllMocks());

    it('supportsServerAggregate refuse distinct, accepte les autres', () => {
      expect(adapter.supportsServerAggregate('distinct')).toBe(false);
      expect(adapter.supportsServerAggregate('sum')).toBe(true);
      expect(adapter.supportsServerAggregate('count')).toBe(true);
    });

    it("l'URL ne porte ni champ__distinct ni champ__groupby (pas de 400 silencieux)", () => {
      const url = adapter.buildUrl(makeParams());
      expect(url).not.toContain('__distinct');
      expect(url).not.toContain('__groupby');
    });

    it('fetchAll : lignes brutes, needsClientProcessing=true, warn explicite', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: DEPARTEMENTS, links: {}, meta: { page: 1, total: 7 } }),
      });
      const result = await adapter.fetchAll(makeParams(), new AbortController().signal);
      expect(result.needsClientProcessing).toBe(true);
      expect(result.data).toHaveLength(7);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0][0]).toContain('distinct');
      expect(warn.mock.calls[0][0]).toContain('client');
    });

    it('fetchAll tronqué (limit) : second warn nommant meta.total (#659)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: DEPARTEMENTS.slice(0, 3),
            links: { next: 'https://tabular-api.data.gouv.fr/x?page=2' },
            meta: { page: 1, total: 101 },
          }),
      });
      await adapter.fetchAll(makeParams({ limit: 3 }), new AbortController().signal);
      const messages = warn.mock.calls.map((c) => String(c[0]));
      expect(messages.some((m) => m.includes('meta.total') && m.includes('101'))).toBe(true);
    });
  });

  describe('dsfr-data-query : pas de délégation quand l’adapter refuse la fonction', () => {
    let query: DsfrDataQuery;
    let sourceEl: HTMLElement;
    let commands: Array<Record<string, unknown>>;
    let unsubscribe: () => void;

    function makeSource(supportsServerAggregate?: (fn: string) => boolean) {
      const el = document.createElement('div');
      el.id = 'tab-src';
      (el as unknown as Record<string, unknown>).getAdapter = () => ({
        type: 'mock',
        capabilities: { serverGroupBy: true, whereFormat: 'colon' },
        ...(supportsServerAggregate ? { supportsServerAggregate } : {}),
      });
      document.body.appendChild(el);
      return el;
    }

    beforeEach(() => {
      clearDataCache('tab-src');
      clearDataMeta('tab-src');
      commands = [];
      unsubscribe = subscribeToSourceCommands('tab-src', (cmd) =>
        commands.push(cmd as Record<string, unknown>)
      );
      query = new DsfrDataQuery();
      query.id = 'q';
      query.source = 'tab-src';
      query.groupBy = 'nom_departement';
    });
    afterEach(() => {
      queryInternals(query)._cleanup?.();
      unsubscribe();
      sourceEl.remove();
    });

    it('distinct refusé (Tabular) : group-by et aggregate restent client-side', () => {
      sourceEl = makeSource((fn) => fn !== 'distinct');
      query.aggregate = 'commune:distinct';
      queryInternals(query)._negotiateServerSide();
      expect(commands.some((c) => c.groupBy)).toBe(false);
      expect(queryInternals(query)._serverDelegated.groupBy).toBe(false);
      expect(queryInternals(query)._serverDelegated.aggregate).toBe(false);
    });

    it('adapter sans supportsServerAggregate : délégation inchangée', () => {
      sourceEl = makeSource();
      query.aggregate = 'commune:distinct';
      queryInternals(query)._negotiateServerSide();
      expect(commands[0]?.aggregate).toBe('commune:distinct');
      expect(queryInternals(query)._serverDelegated.aggregate).toBe(true);
    });
  });
});
