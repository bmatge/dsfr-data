import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Tests traversants #278 (EPIC B) — filtres et tri de dsfr-data-query.
 *
 * Bugs d'origine :
 * - `in`/`notin` en égalité STRICTE alors que `eq` est lâche →
 *   `dept:in:75|13` ne matchait jamais `"75"` (string) alors que
 *   `dept:eq:75` matchait ;
 * - tri : `Number(null) === 0` et comparateur mixte numérique/string non
 *   transitif → ordre arbitraire sur colonnes mixtes ;
 * - `contains` : `String(undefined) === "undefined"` matchait ;
 * - gt/gte/lt/lte : `Number(null) === 0` → null passait `lt:5` ;
 * - `aggregate` sans `group-by` : no-op silencieux alors que la grammaire
 *   est acceptée côté source (agrégat global).
 *
 * Contrat fixé :
 * - opérateurs positifs (eq, in, contains, gt/gte/lt/lte) : null/undefined
 *   ne matchent JAMAIS ; coercition lâche string/number partout ;
 * - opérateurs négatifs (neq, notin, notcontains) : null passe (cohérent) ;
 * - tri total à 3 niveaux : null/vide < numérique < chaîne — transitif ;
 * - agrégat global : `aggregate` sans `group-by` produit UNE ligne.
 */

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

import { DsfrDataQuery } from '@/components/dsfr-data-query.js';
import { clearDataCache, clearDataMeta, dispatchDataLoaded } from '@/utils/data-bridge.js';
import { applyLocalFilter } from '@dsfr-data/shared/lib';

describe('#278 — in/notin avec coercition lâche (parité avec eq)', () => {
  let query: DsfrDataQuery;

  beforeEach(() => {
    query = new DsfrDataQuery();
  });

  it('dept:in:75|13 matche les valeurs string ET number', () => {
    const filters = (query as any)._parseFilters('dept:in:75|13');
    expect((query as any)._matchesFilter({ dept: '75' }, filters[0])).toBe(true);
    expect((query as any)._matchesFilter({ dept: 75 }, filters[0])).toBe(true);
    expect((query as any)._matchesFilter({ dept: '13' }, filters[0])).toBe(true);
    expect((query as any)._matchesFilter({ dept: '92' }, filters[0])).toBe(false);
  });

  it('in et eq gardent la même sémantique de coercition', () => {
    const eqFilter = (query as any)._parseFilters('dept:eq:75')[0];
    const inFilter = (query as any)._parseFilters('dept:in:75')[0];
    for (const row of [{ dept: '75' }, { dept: 75 }, { dept: '75 ' }, { dept: 13 }]) {
      expect((query as any)._matchesFilter(row, inFilter)).toBe(
        (query as any)._matchesFilter(row, eqFilter)
      );
    }
  });

  it('notin exclut avec coercition lâche', () => {
    const filter = (query as any)._parseFilters('dept:notin:75|13')[0];
    expect((query as any)._matchesFilter({ dept: '75' }, filter)).toBe(false);
    expect((query as any)._matchesFilter({ dept: 75 }, filter)).toBe(false);
    expect((query as any)._matchesFilter({ dept: '92' }, filter)).toBe(true);
  });

  it('in ne matche jamais null/undefined ; notin les laisse passer', () => {
    const inFilter = (query as any)._parseFilters('dept:in:75|13')[0];
    const notinFilter = (query as any)._parseFilters('dept:notin:75|13')[0];
    expect((query as any)._matchesFilter({ dept: null }, inFilter)).toBe(false);
    expect((query as any)._matchesFilter({}, inFilter)).toBe(false);
    expect((query as any)._matchesFilter({ dept: null }, notinFilter)).toBe(true);
  });

  it('in avec valeurs booléennes parsées', () => {
    const filter = (query as any)._parseFilters('actif:in:true')[0];
    expect((query as any)._matchesFilter({ actif: true }, filter)).toBe(true);
    expect((query as any)._matchesFilter({ actif: 'true' }, filter)).toBe(true);
    expect((query as any)._matchesFilter({ actif: false }, filter)).toBe(false);
  });
});

describe('#278 — contains/notcontains et null', () => {
  let query: DsfrDataQuery;

  beforeEach(() => {
    query = new DsfrDataQuery();
  });

  it('contains ne matche jamais null/undefined (fini String(undefined)="undefined")', () => {
    const filter = (query as any)._parseFilters('desc:contains:undefined')[0];
    expect((query as any)._matchesFilter({ desc: undefined }, filter)).toBe(false);
    expect((query as any)._matchesFilter({ desc: null }, filter)).toBe(false);
    expect((query as any)._matchesFilter({}, filter)).toBe(false);
    expect((query as any)._matchesFilter({ desc: 'vraiment undefined' }, filter)).toBe(true);
  });

  it('notcontains laisse passer null/undefined (un null ne contient rien)', () => {
    const filter = (query as any)._parseFilters('desc:notcontains:spam')[0];
    expect((query as any)._matchesFilter({ desc: null }, filter)).toBe(true);
    expect((query as any)._matchesFilter({}, filter)).toBe(true);
    expect((query as any)._matchesFilter({ desc: 'du spam ici' }, filter)).toBe(false);
    expect((query as any)._matchesFilter({ desc: 'propre' }, filter)).toBe(true);
  });

  it('contains reste insensible à la casse', () => {
    const filter = (query as any)._parseFilters('ville:contains:PARIS')[0];
    expect((query as any)._matchesFilter({ ville: 'paris 15e' }, filter)).toBe(true);
  });
});

describe('#278 — comparaisons gt/gte/lt/lte', () => {
  let query: DsfrDataQuery;

  beforeEach(() => {
    query = new DsfrDataQuery();
  });

  it('null/undefined ne matchent jamais une comparaison (fini Number(null)=0)', () => {
    const lt = (query as any)._parseFilters('population:lt:5000')[0];
    const gt = (query as any)._parseFilters('population:gt:-10')[0];
    const lte = (query as any)._parseFilters('population:lte:5000')[0];
    const gte = (query as any)._parseFilters('population:gte:-10')[0];
    for (const row of [{ population: null }, { population: undefined }, {}]) {
      expect((query as any)._matchesFilter(row, lt)).toBe(false);
      expect((query as any)._matchesFilter(row, gt)).toBe(false);
      expect((query as any)._matchesFilter(row, lte)).toBe(false);
      expect((query as any)._matchesFilter(row, gte)).toBe(false);
    }
  });

  it('les nombres en string se comparent numériquement ("9" < "10")', () => {
    const filter = (query as any)._parseFilters('rang:lt:10')[0];
    expect((query as any)._matchesFilter({ rang: '9' }, filter)).toBe(true);
    expect((query as any)._matchesFilter({ rang: 9 }, filter)).toBe(true);
    expect((query as any)._matchesFilter({ rang: '11' }, filter)).toBe(false);
  });

  it('les dates ISO se comparent lexicographiquement', () => {
    const filter = (query as any)._parseFilters('date:gte:2024-03-01')[0];
    expect((query as any)._matchesFilter({ date: '2024-06-15' }, filter)).toBe(true);
    expect((query as any)._matchesFilter({ date: '2024-03-01' }, filter)).toBe(true);
    expect((query as any)._matchesFilter({ date: '2023-12-31' }, filter)).toBe(false);
  });
});

describe('#278 — tri total à 3 niveaux (null < numérique < chaîne)', () => {
  let query: DsfrDataQuery;

  beforeEach(() => {
    query = new DsfrDataQuery();
  });

  const MIXED = [
    { v: 'abc' },
    { v: 5 },
    { v: null },
    { v: '10' },
    { v: 'zzz' },
    { v: 3 },
    { v: undefined },
    { v: '' },
  ];

  it('asc : nulls/vides d’abord, puis numériques (y compris strings), puis chaînes', () => {
    query.orderBy = 'v:asc';
    const result = (query as any)._applySort(MIXED).map((r: any) => r.v);
    expect(result).toEqual([null, undefined, '', 3, 5, '10', 'abc', 'zzz']);
  });

  it('desc : ordre exactement inverse', () => {
    query.orderBy = 'v:desc';
    const result = (query as any)._applySort(MIXED).map((r: any) => r.v);
    expect(result).toEqual(['zzz', 'abc', '10', 5, 3, null, undefined, '']);
  });

  it('le comparateur est transitif : trier deux permutations donne le même ordre', () => {
    query.orderBy = 'v:asc';
    const shuffled = [...MIXED].reverse();
    const a = (query as any)._applySort(MIXED).map((r: any) => String(r.v));
    const b = (query as any)._applySort(shuffled).map((r: any) => String(r.v));
    // null et undefined sont équivalents (rang 0) : comparer par rang
    const rank = (s: string) => (['null', 'undefined', ''].includes(s) ? '∅' : s);
    expect(a.map(rank)).toEqual(b.map(rank));
  });

  it('le tri est stable pour les clés égales', () => {
    query.orderBy = 'k:asc';
    const rows = [
      { k: 1, tag: 'a' },
      { k: 1, tag: 'b' },
      { k: 0, tag: 'c' },
      { k: 1, tag: 'd' },
    ];
    const result = (query as any)._applySort(rows);
    expect(result.map((r: any) => r.tag)).toEqual(['c', 'a', 'b', 'd']);
  });

  it('tri multi-champs : grammaire commune du pipeline "f1:dir, f2:dir" (#273)', () => {
    query.orderBy = 'region:asc, population:desc';
    const rows = [
      { region: 'IDF', population: 3000 },
      { region: 'BRE', population: 1000 },
      { region: 'IDF', population: 12000 },
      { region: 'BRE', population: 2000 },
    ];
    const result = (query as any)._applySort(rows);
    expect(result).toEqual([
      { region: 'BRE', population: 2000 },
      { region: 'BRE', population: 1000 },
      { region: 'IDF', population: 12000 },
      { region: 'IDF', population: 3000 },
    ]);
  });

  it('colonnes purement numériques et purement texte : comportement inchangé', () => {
    query.orderBy = 'n:desc';
    const nums = (query as any)._applySort([{ n: 1 }, { n: 30 }, { n: 4 }]).map((r: any) => r.n);
    expect(nums).toEqual([30, 4, 1]);

    query.orderBy = 's:asc';
    const strs = (query as any)
      ._applySort([{ s: 'Paris' }, { s: 'Lyon' }, { s: 'Marseille' }])
      .map((r: any) => r.s);
    expect(strs).toEqual(['Lyon', 'Marseille', 'Paris']);
  });
});

describe('#278 — agrégat global (aggregate sans group-by)', () => {
  let query: DsfrDataQuery;

  beforeEach(() => {
    query = new DsfrDataQuery();
    query.id = 'b4-global';
    query.source = 'b4-src';
    clearDataCache('b4-src');
    clearDataMeta('b4-src');
    clearDataCache('b4-global');
  });

  afterEach(() => {
    (query as any)._cleanup();
  });

  const ROWS = [
    { region: 'IDF', population: 12000 },
    { region: 'PACA', population: 5000 },
    { region: 'BRE', population: 3000 },
    { region: 'NOR', population: 3300 },
  ];

  it('produit UNE ligne avec la convention d’alias field__fn', () => {
    query.aggregate = 'population:sum, population:avg, region:count';
    (query as any)._initialize();
    dispatchDataLoaded('b4-src', ROWS);

    expect(query.getData()).toEqual([
      { population__sum: 23300, population__avg: 5825, region__count: 4 },
    ]);
  });

  it('respecte les alias explicites', () => {
    query.aggregate = 'population:sum:total';
    (query as any)._initialize();
    dispatchDataLoaded('b4-src', ROWS);

    expect(query.getData()).toEqual([{ total: 23300 }]);
  });

  it('s’applique après le filtre', () => {
    query.where = 'population:gt:3100';
    query.aggregate = 'population:sum';
    (query as any)._initialize();
    dispatchDataLoaded('b4-src', ROWS);

    expect(query.getData()).toEqual([{ population__sum: 20300 }]);
  });

  it('données vides → une ligne de zéros (count 0)', () => {
    query.aggregate = 'population:sum, region:count';
    (query as any)._initialize();
    dispatchDataLoaded('b4-src', []);

    expect(query.getData()).toEqual([{ population__sum: 0, region__count: 0 }]);
  });

  it('sans aggregate ni group-by, pass-through inchangé', () => {
    (query as any)._initialize();
    dispatchDataLoaded('b4-src', ROWS);
    expect(query.getData()).toEqual(ROWS);
  });
});

describe('#278 — parité applyLocalFilter (shared) sur null', () => {
  it('contains ne matche pas null/undefined', () => {
    const rows = [{ desc: null }, { desc: undefined }, { desc: 'spam ici' }] as Record<
      string,
      unknown
    >[];
    expect(applyLocalFilter(rows, 'desc:contains:spam')).toEqual([{ desc: 'spam ici' }]);
    expect(applyLocalFilter(rows, 'desc:contains:undefined')).toEqual([]);
  });

  it('gt/lt ne matchent pas null/undefined', () => {
    const rows = [{ n: null }, { n: 3 }, { n: 10 }] as Record<string, unknown>[];
    expect(applyLocalFilter(rows, 'n:lt:5')).toEqual([{ n: 3 }]);
    expect(applyLocalFilter(rows, 'n:gt:0')).toEqual([{ n: 3 }, { n: 10 }]);
  });

  it('notcontains laisse passer null', () => {
    const rows = [{ desc: null }, { desc: 'spam' }, { desc: 'ok' }] as Record<string, unknown>[];
    expect(applyLocalFilter(rows, 'desc:notcontains:spam')).toEqual([
      { desc: null },
      { desc: 'ok' },
    ]);
  });
});
