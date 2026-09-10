import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Tests de dsfr-data-pivot (#255) — repli « long » → « wide », symétrique de
 * dsfr-data-unpivot.
 *
 * Couvre la logique pure (performPivot : agrégats, null, ordre, plafond,
 * alias), le composant (délégation amont via le mixin, meta, erreurs de
 * configuration), puis deux cas d'usage de bout en bout :
 * (1) #640 pt 2 — une grille dont les colonnes suivent une facette (query
 *     filtrée → pivot → dsfr-data-list sans `columns` figées) ;
 * (2) la différence entre deux séries — pivot puis
 *     `normalize compute="ecart = annee_2023 - annee_2022"`.
 */

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

import { DsfrDataPivot } from '@/components/dsfr-data-pivot.js';
import { DsfrDataUnpivot } from '@/components/dsfr-data-unpivot.js';
import { DsfrDataQuery } from '@/components/dsfr-data-query.js';
import { DsfrDataNormalize } from '@/components/dsfr-data-normalize.js';
import { DsfrDataList } from '@/components/dsfr-data-list.js';
import type { PivotOptions } from '@dsfr-data/shared';
import {
  performPivot,
  performUnpivot,
  parsePivotLabels,
  PivotError,
  PIVOT_AGGREGATES,
  DataflowRecorder,
  formatTrace,
} from '@dsfr-data/shared';
import {
  clearDataCache,
  clearDataMeta,
  setDataCache,
  getDataCache,
  getDataMeta,
  setDataMeta,
  dispatchDataLoaded,
  dispatchSourceCommand,
  subscribeToSourceCommands,
} from '@/utils/data-bridge.js';

type Row = Record<string, unknown>;

/** Vue interne du composant (membres privés inspectés sans `as any` dispersé). */
interface PivotInternals {
  _processData(raw: unknown): void;
  _cleanup(): void;
  _transformerMountCycleDone: boolean;
  willUpdate(changed: Map<PropertyKey, unknown>): void;
  reinitTransformer(): void;
}

const internals = (el: DsfrDataPivot): PivotInternals => el as unknown as PivotInternals;

// Jeu long représentatif : communes × années → montant.
const LONG: Row[] = [
  { commune: 'Lyon', annee: 2022, montant: 10 },
  { commune: 'Lyon', annee: 2023, montant: 12 },
  { commune: 'Nice', annee: 2022, montant: 7 },
  { commune: 'Nice', annee: 2023, montant: '9,5' },
  { commune: 'Lyon', annee: 2023, montant: 3 }, // même cellule que (Lyon, 2023) → agrégat
];

const BASE: PivotOptions = { rowFields: ['commune'], columnField: 'annee', valueField: 'montant' };

describe('performPivot (logique pure)', () => {
  it('une ligne par valeur de row, une colonne par valeur de column, somme par défaut', () => {
    const { rows, stats } = performPivot(LONG, { ...BASE });
    expect(rows).toEqual([
      { commune: 'Lyon', '2022': 10, '2023': 15 },
      { commune: 'Nice', '2022': 7, '2023': 9.5 }, // '9,5' : décimale française (#301)
    ]);
    expect(stats).toEqual({
      columns: 2,
      rowFields: ['commune'],
      columnNames: ['2022', '2023'],
      emptyCells: 0,
      rows: 2,
      skippedRows: 0,
    });
  });

  it('cellule absente → null, jamais 0 (#301) ; comptée dans emptyCells', () => {
    const { rows, stats } = performPivot(
      [
        { commune: 'Lyon', annee: 2022, montant: 10 },
        { commune: 'Nice', annee: 2023, montant: 7 },
      ],
      { ...BASE }
    );
    expect(rows).toEqual([
      { commune: 'Lyon', '2022': 10, '2023': null },
      { commune: 'Nice', '2022': null, '2023': 7 },
    ]);
    expect(stats.emptyCells).toBe(2);
    // Toutes les lignes portent toutes les colonnes : schéma uniforme. (Les clés
    // entières sortent en tête d'Object.keys : l'ordre voulu est dans stats.)
    for (const r of rows) expect(Object.keys(r).sort()).toEqual(['2022', '2023', 'commune']);
    expect([...stats.rowFields, ...stats.columnNames]).toEqual(['commune', '2022', '2023']);
  });

  it('sum sur une cellule sans valeur numérique → null, pas 0', () => {
    const { rows, stats } = performPivot([{ commune: 'Lyon', annee: 2022, montant: 'NC' }], {
      ...BASE,
    });
    expect(rows[0]['2022']).toBeNull();
    expect(stats.emptyCells).toBe(1);
  });

  it.each([
    ['count', 2],
    ['avg', 7.5],
    ['min', 3],
    ['max', 12],
    ['first', 12],
    ['last', 3],
  ] as const)('agrégat %s', (aggregate, expected) => {
    const { rows } = performPivot(LONG, { ...BASE, aggregate });
    const lyon = rows.find((r) => r.commune === 'Lyon') as Row;
    expect(lyon['2023']).toBe(expected);
  });

  it('min / max sur des valeurs non numériques : ordre lexicographique (dates ISO)', () => {
    const data = [
      { k: 'a', c: 'x', d: '2026-03-01' },
      { k: 'a', c: 'x', d: '2026-01-15' },
    ];
    const opts: PivotOptions = { rowFields: ['k'], columnField: 'c', valueField: 'd' };
    expect(performPivot(data, { ...opts, aggregate: 'min' }).rows[0].x).toBe('2026-01-15');
    expect(performPivot(data, { ...opts, aggregate: 'max' }).rows[0].x).toBe('2026-03-01');
  });

  it('la liste des agrégats est la grammaire commune du pipeline', () => {
    expect([...PIVOT_AGGREGATES]).toEqual(['sum', 'count', 'avg', 'min', 'max', 'first', 'last']);
  });

  it('plusieurs champs de row : identité composite, null / "" / 0 distingués', () => {
    const data = [
      { etab: 'A', dep: '01', service: 's1', tarif: 1 },
      { etab: 'A', dep: '02', service: 's1', tarif: 2 },
      { etab: 'A', dep: null, service: 's1', tarif: 3 },
      { etab: 'A', dep: '', service: 's1', tarif: 4 },
      { etab: 'A', dep: 0, service: 's1', tarif: 5 },
    ];
    const { rows } = performPivot(data, {
      rowFields: ['etab', 'dep'],
      columnField: 'service',
      valueField: 'tarif',
    });
    expect(rows).toHaveLength(5);
    expect(rows[0]).toEqual({ etab: 'A', dep: '01', s1: 1 });
    expect(rows[2]).toEqual({ etab: 'A', dep: null, s1: 3 });
  });

  it('ordre des colonnes : apparition par défaut, column-order asc/desc (numérique si possible)', () => {
    const data = [
      { k: 'a', annee: 2023, v: 1 },
      { k: 'a', annee: 2021, v: 1 },
      { k: 'a', annee: 2022, v: 1 },
      { k: 'b', annee: 2020, v: 1 },
    ];
    const opts: PivotOptions = { rowFields: ['k'], columnField: 'annee', valueField: 'v' };
    expect(performPivot(data, opts).stats.columnNames).toEqual(['2023', '2021', '2022', '2020']);
    expect(performPivot(data, { ...opts, columnOrder: 'asc' }).stats.columnNames).toEqual([
      '2020',
      '2021',
      '2022',
      '2023',
    ]);
    expect(performPivot(data, { ...opts, columnOrder: 'desc' }).stats.columnNames).toEqual([
      '2023',
      '2022',
      '2021',
      '2020',
    ]);
    // Tri numérique, pas lexicographique : 10 après 9.
    const nums = [
      { k: 'a', n: 10, v: 1 },
      { k: 'a', n: 9, v: 1 },
    ];
    expect(
      performPivot(nums, {
        rowFields: ['k'],
        columnField: 'n',
        valueField: 'v',
        columnOrder: 'asc',
      }).stats.columnNames
    ).toEqual(['9', '10']);
  });

  it('column-format : noms de colonnes sûrs pour compute (annee_{value})', () => {
    const { rows, stats } = performPivot(LONG, { ...BASE, columnFormat: 'annee_{value}' });
    expect(stats.columnNames).toEqual(['annee_2022', 'annee_2023']);
    expect(rows[0]).toEqual({ commune: 'Lyon', annee_2022: 10, annee_2023: 15 });
  });

  it('labels : renomme par valeur brute et prime sur column-format', () => {
    const labels = parsePivotLabels('2022:Année 2022 | 2023:Année 2023');
    const { stats } = performPivot(LONG, { ...BASE, labels, columnFormat: 'annee_{value}' });
    expect(stats.columnNames).toEqual(['Année 2022', 'Année 2023']);
    // Libellé partiel : la valeur non libellée suit column-format.
    const partial = performPivot(LONG, {
      ...BASE,
      labels: parsePivotLabels('2022:Avant'),
      columnFormat: 'a_{value}',
    });
    expect(partial.stats.columnNames).toEqual(['Avant', 'a_2023']);
  });

  it('parsePivotLabels : grammaire de facets, échappement %3A / %7C (#315)', () => {
    const map = parsePivotLabels('a:Libellé A | b%3Ac:Deux%7Cpoints | sans-separateur');
    expect([...map.entries()]).toEqual([
      ['a', 'Libellé A'],
      ['b:c', 'Deux|points'],
    ]);
    expect(parsePivotLabels('').size).toBe(0);
  });

  it('plafond max-columns : erreur explicite, pas un tableau', () => {
    const data = Array.from({ length: 60 }, (_, i) => ({ k: 'a', c: `v${i}`, v: 1 }));
    const opts: PivotOptions = { rowFields: ['k'], columnField: 'c', valueField: 'v' };
    // Défaut 50.
    expect(() => performPivot(data, opts)).toThrow(PivotError);
    try {
      performPivot(data, opts);
    } catch (e) {
      expect((e as PivotError).code).toBe('max-columns');
      expect((e as PivotError).message).toContain('plus de 50 valeurs distinctes dans "c"');
      expect((e as PivotError).message).toContain('max-columns');
    }
    // Plafond relevé : passe.
    expect(performPivot(data, { ...opts, maxColumns: 60 }).stats.columns).toBe(60);
    // Plafond abaissé : casse dès la 3e valeur.
    expect(() => performPivot(data, { ...opts, maxColumns: 2 })).toThrow(/plus de 2 valeurs/);
  });

  it('collision entre une colonne générée et un champ de row → erreur', () => {
    const data = [{ k: 'a', c: 'k', v: 1 }];
    expect(() =>
      performPivot(data, { rowFields: ['k'], columnField: 'c', valueField: 'v' })
    ).toThrow(/même nom qu'un champ de "row"/);
    // Deux valeurs libellées pareil → collision aussi.
    expect(() =>
      performPivot(
        [
          { k: 'a', c: 'x', v: 1 },
          { k: 'a', c: 'y', v: 1 },
        ],
        {
          rowFields: ['k'],
          columnField: 'c',
          valueField: 'v',
          labels: parsePivotLabels('x:Même | y:Même'),
        }
      )
    ).toThrow(/même colonne "Même"/);
  });

  it('valeur de column réservée (__proto__) → erreur, pas de pollution de prototype', () => {
    expect(() =>
      performPivot([{ k: 'a', c: '__proto__', v: 1 }], {
        rowFields: ['k'],
        columnField: 'c',
        valueField: 'v',
      })
    ).toThrow(PivotError);
  });

  it('ligne dont le champ column est vide : ignorée et comptée (skippedRows)', () => {
    const { rows, stats } = performPivot(
      [
        { commune: 'Lyon', annee: 2022, montant: 1 },
        { commune: 'Lyon', annee: null, montant: 99 },
        { commune: 'Lyon', annee: '', montant: 99 },
        { commune: 'Nice', montant: 99 },
      ],
      { ...BASE }
    );
    expect(rows).toEqual([{ commune: 'Lyon', '2022': 1 }]);
    expect(stats.skippedRows).toBe(3);
  });

  it('configuration invalide → PivotError config', () => {
    const data = [{ k: 'a', c: 'x', v: 1 }];
    expect(() => performPivot(data, { rowFields: [], columnField: 'c', valueField: 'v' })).toThrow(
      /"row" requis/
    );
    expect(() =>
      performPivot(data, { rowFields: ['k'], columnField: '', valueField: 'v' })
    ).toThrow(/"column" requis/);
    expect(() =>
      performPivot(data, { rowFields: ['k'], columnField: 'c', valueField: '' })
    ).toThrow(/"value" requis/);
    expect(() =>
      performPivot(data, {
        rowFields: ['k'],
        columnField: 'c',
        valueField: 'v',
        aggregate: 'somme' as never,
      })
    ).toThrow(/"somme" inconnue/);
  });

  it('rows vide → aucune ligne, aucune colonne', () => {
    expect(performPivot([], { ...BASE })).toEqual({
      rows: [],
      stats: {
        columns: 0,
        rowFields: ['commune'],
        columnNames: [],
        emptyCells: 0,
        rows: 0,
        skippedRows: 0,
      },
    });
  });

  it('symétrie : pivot(unpivot(wide)) rend le wide de départ', () => {
    const wide = [
      { commune: 'Lyon', a2022: 10, a2023: 12 },
      { commune: 'Nice', a2022: 7, a2023: 9 },
    ];
    const long = performUnpivot(wide, {
      idCols: ['commune'],
      valueColsPattern: 'a{YYYY}',
      varName: 'annee',
      varFormat: '{YYYY}',
      valueName: 'montant',
    });
    const back = performPivot(long, { ...BASE, columnFormat: 'a{value}', aggregate: 'first' });
    expect(back.rows).toEqual(wide);
  });
});

describe('DsfrDataPivot (composant)', () => {
  let pivot: DsfrDataPivot;

  beforeEach(() => {
    clearDataCache('pv-out');
    clearDataMeta('pv-out');
    clearDataCache('pv-src');
    clearDataMeta('pv-src');
    mockFetch.mockReset();
    pivot = new DsfrDataPivot();
    pivot.id = 'pv-out';
    pivot.source = 'pv-src';
    pivot.row = 'commune';
    pivot.column = 'annee';
    pivot.value = 'montant';
  });

  afterEach(() => {
    internals(pivot)._cleanup();
  });

  it("connectedCallback s'abonne et pivote les données à l'arrivée", () => {
    pivot.connectedCallback();
    dispatchDataLoaded('pv-src', LONG);
    expect(pivot.getData()).toEqual([
      { commune: 'Lyon', '2022': 10, '2023': 15 },
      { commune: 'Nice', '2022': 7, '2023': 9.5 },
    ]);
    expect(getDataCache('pv-out')).toBeDefined();
  });

  it("traite les données déjà en cache au moment de l'abonnement", () => {
    setDataCache('pv-src', LONG);
    pivot.connectedCallback();
    expect(pivot.getData()).toHaveLength(2);
  });

  it('meta : transformerOwnMeta publie colonnes générées et cellules vides (#604)', () => {
    pivot.connectedCallback();
    dispatchDataLoaded('pv-src', [
      { commune: 'Lyon', annee: 2022, montant: 10 },
      { commune: 'Nice', annee: 2023, montant: 7 },
    ]);
    const meta = getDataMeta('pv-out');
    expect(meta?.pivot).toEqual({
      columns: 2,
      rowFields: ['commune'],
      columnNames: ['2022', '2023'],
      emptyCells: 2,
      rows: 2,
      skippedRows: 0,
    });
    expect(meta?.total).toBeUndefined();
    expect(pivot.getPivotStats()?.columns).toBe(2);
  });

  it('meta amont propagée avec total invalidé (#282) et statistiques du pivot', () => {
    setDataMeta('pv-src', { page: 1, pageSize: 100, total: 5, serverSide: true });
    pivot.connectedCallback();
    dispatchDataLoaded('pv-src', LONG);
    const meta = getDataMeta('pv-out');
    expect(meta?.serverSide).toBe(true);
    expect(meta?.total).toBeUndefined();
    expect(meta?.pivot?.columns).toBe(2);
  });

  it('les statistiques se lisent dans la trace du volet Diagnostic (#604)', () => {
    const host = document.createElement('div');
    host.innerHTML = `
      <dsfr-data-source id="pv-src"></dsfr-data-source>
      <dsfr-data-pivot id="pv-out" source="pv-src" row="commune" column="annee" value="montant"></dsfr-data-pivot>
    `;
    document.body.appendChild(host);
    const recorder = new DataflowRecorder({ root: document.body });
    recorder.start();
    dispatchDataLoaded('pv-src', [
      { commune: 'Lyon', annee: 2022, montant: 10 },
      { commune: 'Nice', annee: 2023, montant: 7 },
      { commune: 'Nice', annee: null, montant: 1 },
    ]);
    const text = formatTrace(recorder.snapshot());
    recorder.stop();
    host.remove();
    expect(text).toContain('pivot : 2 colonnes générées (2022, 2023), 2 cellules vides');
    expect(text).toContain('1 ligne ignorée (champ de colonne vide)');
  });

  it('willUpdate re-traite quand un paramètre change (#281) : nouvelle facette → nouvelles colonnes', () => {
    setDataCache('pv-src', LONG);
    pivot.connectedCallback();
    pivot.columnFormat = 'annee_{value}';
    internals(pivot)._transformerMountCycleDone = true;
    internals(pivot).willUpdate(new Map([['columnFormat', '']]));
    expect(Object.keys(pivot.getData()[0])).toEqual(['commune', 'annee_2022', 'annee_2023']);
    expect(pivot.getPivotStats()?.columnNames).toEqual(['annee_2022', 'annee_2023']);
  });

  it('willUpdate ré-initialise quand source change (#281)', () => {
    pivot.connectedCallback();
    const spy = vi.spyOn(internals(pivot), 'reinitTransformer');
    internals(pivot)._transformerMountCycleDone = true;
    internals(pivot).willUpdate(new Map([['source', 'ancienne']]));
    expect(spy).toHaveBeenCalled();
  });

  it('nouvelle valeur de column dans la source → nouvelle colonne sans changer le HTML', () => {
    pivot.connectedCallback();
    dispatchDataLoaded('pv-src', LONG);
    expect(pivot.getPivotStats()?.columnNames).toEqual(['2022', '2023']);
    dispatchDataLoaded('pv-src', [...LONG, { commune: 'Lyon', annee: 2024, montant: 1 }]);
    expect(pivot.getPivotStats()?.columnNames).toEqual(['2022', '2023', '2024']);
    expect(pivot.getData()[1]).toEqual({ commune: 'Nice', '2022': 7, '2023': 9.5, '2024': null });
  });

  it('relaie les commandes aval vers la source amont', () => {
    pivot.connectedCallback();
    let relayed: Record<string, unknown> | null = null;
    const unsub = subscribeToSourceCommands('pv-src', (cmd) => {
      relayed = cmd as Record<string, unknown>;
    });
    dispatchSourceCommand('pv-out', { where: 'x = 1', whereKey: 'k' });
    unsub();
    expect(relayed).toMatchObject({ where: 'x = 1', origin: 'pv-out' });
  });

  it('délégation amont (SourceElement) : getAdapter / getEffectiveWhere / getAdapterParams et transformsSchema', () => {
    expect(pivot.transformsSchema()).toBe(true);
    expect(pivot.getAdapter()).toBeNull();
    expect(pivot.getEffectiveWhere()).toBe('');
    expect(pivot.getAdapterParams()).toBeNull();
  });

  it('agrégat inconnu → erreur de configuration explicite ET erreur aval, jamais un tableau (#649)', () => {
    pivot.aggregate = 'somme';
    const errors: string[] = [];
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.sourceId === 'pv-out') errors.push(String(detail.error?.message));
    };
    document.addEventListener('dsfr-data-error', handler);
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    pivot.connectedCallback();
    dispatchDataLoaded('pv-src', LONG);
    document.removeEventListener('dsfr-data-error', handler);
    consoleSpy.mockRestore();

    expect(pivot.getAttribute('data-dsfr-config-error')).toContain('"somme" inconnue');
    expect(pivot.getAttribute('data-dsfr-config-error')).toContain('sum, count, avg, min, max');
    expect(errors).toHaveLength(1);
    expect(pivot.getData()).toHaveLength(0);
    expect(getDataCache('pv-out')).toBeUndefined();
  });

  it('plafond max-columns dépassé → data-dsfr-config-error + erreur aval ; levé par un filtre amont', () => {
    pivot.maxColumns = 2;
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    pivot.connectedCallback();
    dispatchDataLoaded('pv-src', [...LONG, { commune: 'Lyon', annee: 2024, montant: 1 }]);
    expect(pivot.getAttribute('data-dsfr-config-error')).toContain('plus de 2 valeurs distinctes');
    expect(pivot.getError()).toBeInstanceOf(PivotError);
    expect(pivot.getPivotStats()).toBeNull();
    // La source ré-émet un lot filtré : l'erreur tombe.
    dispatchDataLoaded('pv-src', LONG);
    consoleSpy.mockRestore();
    expect(pivot.hasAttribute('data-dsfr-config-error')).toBe(false);
    expect(pivot.getError()).toBeNull();
    expect(pivot.getPivotStats()?.columns).toBe(2);
  });

  it('row / column / value manquants → erreur de configuration nommant l’attribut', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    pivot.column = '';
    pivot.connectedCallback();
    expect(pivot.getAttribute('data-dsfr-config-error')).toContain('"column" requis');
    consoleSpy.mockRestore();
  });

  it('id manquant → erreur de config, pas de crash', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const bad = new DsfrDataPivot();
    bad.source = 'pv-src';
    expect(() => bad.connectedCallback()).not.toThrow();
    expect(bad.getData()).toHaveLength(0);
    internals(bad)._cleanup();
    consoleSpy.mockRestore();
  });

  it('disconnectedCallback nettoie le cache et la meta de sortie', () => {
    setDataCache('pv-src', LONG);
    pivot.connectedCallback();
    expect(getDataCache('pv-out')).toBeDefined();
    expect(getDataMeta('pv-out')).toBeDefined();
    pivot.disconnectedCallback();
    expect(getDataCache('pv-out')).toBeUndefined();
    expect(getDataMeta('pv-out')).toBeUndefined();
  });

  it('attributs HTML : labels et column-order lus depuis le markup', () => {
    const host = document.createElement('div');
    host.innerHTML = `
      <dsfr-data-pivot id="pv-attr" source="pv-src" row="commune" column="annee" value="montant"
        aggregate="first" column-order="desc" labels="2022:Avant | 2023:Après" max-columns="10">
      </dsfr-data-pivot>
    `;
    document.body.appendChild(host);
    const el = host.querySelector('dsfr-data-pivot') as DsfrDataPivot;
    dispatchDataLoaded('pv-src', LONG);
    expect(el.maxColumns).toBe(10);
    expect(el.getPivotStats()?.columnNames).toEqual(['Après', 'Avant']);
    expect(el.getData()[0]).toEqual({ commune: 'Lyon', Après: 12, Avant: 10 });
    host.remove();
    clearDataCache('pv-attr');
    clearDataMeta('pv-attr');
  });
});

/**
 * Cas d'usage (1) — #640 pt 2 : les colonnes d'une grille suivent une facette.
 *
 * Un jeu long `etab × service → tarif` est filtré par une query (ce que fait
 * une facette sur `service`), pivoté, puis affiché par un dsfr-data-list SANS
 * `columns` figées : les colonnes visibles sont exactement les services
 * retenus par le filtre, sans une ligne de script.
 */
describe('cas d’usage #640 pt 2 — les colonnes de la grille suivent la facette', () => {
  const TARIFS: Row[] = [
    { etab: 'Banque A', dep: '75', service: 'Carte', tarif: 40 },
    { etab: 'Banque A', dep: '75', service: 'Tenue de compte', tarif: 24 },
    { etab: 'Banque A', dep: '75', service: 'Virement', tarif: 0 },
    { etab: 'Banque B', dep: '69', service: 'Carte', tarif: 45 },
    { etab: 'Banque B', dep: '69', service: 'Tenue de compte', tarif: 30 },
    { etab: 'Banque B', dep: '69', service: 'Virement', tarif: 1 },
  ];
  const ids = ['t-src', 't-q', 't-wide'];
  let host: HTMLDivElement;

  beforeEach(() => {
    for (const id of ids) {
      clearDataCache(id);
      clearDataMeta(id);
    }
    host = document.createElement('div');
    document.body.appendChild(host);
  });

  afterEach(() => {
    host.remove();
    for (const id of ids) {
      clearDataCache(id);
      clearDataMeta(id);
    }
  });

  it('query filtrée → pivot → list sans columns : les colonnes sont les services retenus', async () => {
    host.innerHTML = `
      <dsfr-data-query id="t-q" source="t-src" where="service:in:Carte|Virement"></dsfr-data-query>
      <dsfr-data-pivot id="t-wide" source="t-q" row="etab, dep" column="service" value="tarif" aggregate="first"></dsfr-data-pivot>
      <dsfr-data-list source="t-wide"></dsfr-data-list>
    `;
    const query = host.querySelector('dsfr-data-query') as DsfrDataQuery;
    const list = host.querySelector('dsfr-data-list') as DsfrDataList;
    // Les classes doivent être importées comme VALEURS (enregistrement des tags).
    expect(query).toBeInstanceOf(DsfrDataQuery);
    expect(list).toBeInstanceOf(DsfrDataList);
    dispatchDataLoaded('t-src', TARIFS);
    await list.updateComplete;

    expect(list.parseColumns().map((c) => c.key)).toEqual(['etab', 'dep', 'Carte', 'Virement']);
    expect(list.parseColumns().map((c) => c.label)).toEqual(['etab', 'dep', 'Carte', 'Virement']);
    const headers = [...list.querySelectorAll('thead th')].map((th) => th.textContent?.trim());
    expect(headers).toEqual(['etab', 'dep', 'Carte', 'Virement']);
    const firstRow = [...list.querySelectorAll('tbody tr')][0];
    expect([...firstRow.querySelectorAll('td')].map((td) => td.textContent?.trim())).toEqual([
      'Banque A',
      '75',
      '40',
      '0',
    ]);

    // La facette change (autre sélection) : les colonnes suivent, sans toucher au HTML de la grille.
    query.where = 'service:eq:Tenue de compte';
    await query.updateComplete;
    await list.updateComplete;
    expect(list.parseColumns().map((c) => c.key)).toEqual(['etab', 'dep', 'Tenue de compte']);
  });

  it('colonnes entières (années) : la grille garde l’ordre du pivot, même à travers un normalize', async () => {
    // JavaScript énumère les clés entières en tête : sans l'indice porté par la
    // meta, Object.keys donnerait « 2022 | 2023 | commune ».
    host.innerHTML = `
      <dsfr-data-pivot id="t-q" source="t-src" row="commune" column="annee" value="montant"></dsfr-data-pivot>
      <dsfr-data-normalize id="t-wide" source="t-q" numeric-auto></dsfr-data-normalize>
      <dsfr-data-list source="t-wide"></dsfr-data-list>
    `;
    const list = host.querySelector('dsfr-data-list') as DsfrDataList;
    expect(host.querySelector('dsfr-data-normalize')).toBeInstanceOf(DsfrDataNormalize);
    dispatchDataLoaded('t-src', LONG);
    await list.updateComplete;
    expect(list.parseColumns().map((c) => c.key)).toEqual(['commune', '2022', '2023']);
  });

  it('columns-auto : colonnes libellées et figées en tête, les générées suivent (#640)', async () => {
    host.innerHTML = `
      <dsfr-data-pivot id="t-wide" source="t-src" row="etab, dep" column="service" value="tarif"></dsfr-data-pivot>
      <dsfr-data-list source="t-wide" columns="etab:Établissement, dep:Département" columns-auto></dsfr-data-list>
    `;
    const list = host.querySelector('dsfr-data-list') as DsfrDataList;
    expect(list).toBeInstanceOf(DsfrDataList);
    dispatchDataLoaded('t-src', TARIFS);
    await list.updateComplete;
    expect(list.parseColumns()).toEqual([
      { key: 'etab', label: 'Établissement' },
      { key: 'dep', label: 'Département' },
      { key: 'Carte', label: 'Carte' },
      { key: 'Tenue de compte', label: 'Tenue de compte' },
      { key: 'Virement', label: 'Virement' },
    ]);
  });

  it('sans columns-auto, columns reste figé (comportement historique)', async () => {
    host.innerHTML = `
      <dsfr-data-pivot id="t-wide" source="t-src" row="etab, dep" column="service" value="tarif"></dsfr-data-pivot>
      <dsfr-data-list source="t-wide" columns="etab:Établissement"></dsfr-data-list>
    `;
    const list = host.querySelector('dsfr-data-list') as DsfrDataList;
    expect(list).toBeInstanceOf(DsfrDataList);
    dispatchDataLoaded('t-src', TARIFS);
    await list.updateComplete;
    expect(list.parseColumns()).toEqual([{ key: 'etab', label: 'Établissement' }]);
  });
});

/**
 * Cas d'usage (2) — différence entre deux séries (AM-018, ADR-105) : pivot
 * puis `compute` sur deux colonnes. Le compute v1 (arithmétique) suffit.
 */
describe('cas d’usage — écart entre deux séries : pivot puis normalize compute', () => {
  const ids = ['e-src', 'e-wide', 'e-out'];

  beforeEach(() => {
    for (const id of ids) {
      clearDataCache(id);
      clearDataMeta(id);
    }
  });

  afterEach(() => {
    for (const id of ids) {
      clearDataCache(id);
      clearDataMeta(id);
    }
  });

  it('column-format="annee_{value}" puis compute="ecart = annee_2023 - annee_2022"', () => {
    const pivot = new DsfrDataPivot();
    pivot.id = 'e-wide';
    pivot.source = 'e-src';
    pivot.row = 'commune';
    pivot.column = 'annee';
    pivot.value = 'montant';
    pivot.columnFormat = 'annee_{value}';
    const normalize = new DsfrDataNormalize();
    normalize.id = 'e-out';
    normalize.source = 'e-wide';
    normalize.compute = 'ecart = annee_2023 - annee_2022';

    pivot.connectedCallback();
    normalize.connectedCallback();
    dispatchDataLoaded('e-src', LONG);

    const out = getDataCache('e-out') as Row[];
    expect(out).toEqual([
      { commune: 'Lyon', annee_2022: 10, annee_2023: 15, ecart: 5 },
      { commune: 'Nice', annee_2022: 7, annee_2023: 9.5, ecart: 2.5 },
    ]);

    internals(pivot)._cleanup();
    (normalize as unknown as { _cleanup(): void })._cleanup();
  });

  it('pivot en aval d’un unpivot : aller-retour déclaratif sans script', () => {
    const unpivot = new DsfrDataUnpivot();
    unpivot.id = 'e-wide';
    unpivot.source = 'e-src';
    unpivot.idCols = 'commune';
    unpivot.valueCols = 'a2022:2022, a2023:2023';
    unpivot.varName = 'annee';
    unpivot.valueName = 'montant';
    const pivot = new DsfrDataPivot();
    pivot.id = 'e-out';
    pivot.source = 'e-wide';
    pivot.row = 'commune';
    pivot.column = 'annee';
    pivot.value = 'montant';
    pivot.aggregate = 'first';
    pivot.columnFormat = 'a{value}';

    unpivot.connectedCallback();
    pivot.connectedCallback();
    const wide = [
      { commune: 'Lyon', a2022: 10, a2023: 12 },
      { commune: 'Nice', a2022: 7, a2023: 9 },
    ];
    dispatchDataLoaded('e-src', wide);
    expect(getDataCache('e-out')).toEqual(wide);

    (unpivot as unknown as { _cleanup(): void })._cleanup();
    internals(pivot)._cleanup();
  });
});
