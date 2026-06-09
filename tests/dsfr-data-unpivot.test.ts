import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Tests for dsfr-data-unpivot — bascule "wide" → "tidy" (melt déclaratif).
 *
 * Couvre la logique pure (performUnpivot, compileColsPattern) puis le composant.
 */

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

import { DsfrDataUnpivot } from '@/components/dsfr-data-unpivot.js';
import { performUnpivot, compileColsPattern } from '@dsfr-data/shared';
import {
  clearDataCache,
  setDataCache,
  getDataCache,
  dispatchDataLoaded,
  dispatchSourceCommand,
  subscribeToSourceCommands,
} from '@/utils/data-bridge.js';

// Table "wide" représentative du cas Plan_Elec : temps dans les noms de colonnes.
const WIDE_DATA = [
  {
    Indicateurs: 'Nombre immatriculations VE',
    Sous_theme: 'Véhicule Particulier',
    c2023_01: '14904',
    c2023_02: '19965',
    c2023_03: '36542',
  },
  {
    Indicateurs: 'PDM % VE',
    Sous_theme: 'Véhicule Particulier',
    c2023_01: '0,128',
    c2023_02: '0,153',
    c2023_03: '0,261',
  },
];

describe('performUnpivot (logique pure)', () => {
  it('melt simple avec value-cols explicites', () => {
    const result = performUnpivot([{ region: 'IDF', a: 1, b: 2 }], {
      idCols: ['region'],
      valueCols: ['a', 'b'],
      varName: 'k',
      valueName: 'v',
    });
    expect(result).toEqual([
      { region: 'IDF', k: 'a', v: 1 },
      { region: 'IDF', k: 'b', v: 2 },
    ]);
  });

  it('melt via value-cols-pattern + var-format (c2023_01 → 2023-01)', () => {
    const result = performUnpivot(WIDE_DATA, {
      idCols: ['Indicateurs', 'Sous_theme'],
      valueColsPattern: 'c{YYYY}_{MM}',
      varName: 'mois',
      varFormat: '{YYYY}-{MM}',
      valueName: 'valeur',
    });
    expect(result).toHaveLength(6); // 2 lignes × 3 mois
    expect(result[0]).toEqual({
      Indicateurs: 'Nombre immatriculations VE',
      Sous_theme: 'Véhicule Particulier',
      mois: '2023-01',
      valeur: '14904',
    });
    // La valeur reste brute (string) — typage délégué à normalize en aval.
    expect(typeof result[0].valeur).toBe('string');
    // Les colonnes id ne sont jamais dépliées.
    const months = result.map((r) => r.mois);
    expect(months).toEqual(['2023-01', '2023-02', '2023-03', '2023-01', '2023-02', '2023-03']);
  });

  it('porte correctement plusieurs id-cols sur chaque ligne', () => {
    const result = performUnpivot(WIDE_DATA, {
      idCols: ['Indicateurs', 'Sous_theme'],
      valueColsPattern: 'c{YYYY}_{MM}',
      varName: 'mois',
      valueName: 'valeur',
    });
    for (const row of result) {
      expect(row).toHaveProperty('Indicateurs');
      expect(row).toHaveProperty('Sous_theme');
    }
  });

  it('sans var-format, la clé est le nom de colonne brut', () => {
    const result = performUnpivot(WIDE_DATA, {
      idCols: ['Indicateurs', 'Sous_theme'],
      valueColsPattern: 'c{YYYY}_{MM}',
      varName: 'mois',
      valueName: 'valeur',
    });
    expect(result[0].mois).toBe('c2023_01');
  });

  it('dropEmpty exclut les cellules vides/null', () => {
    const data = [{ id: 'x', a: 10, b: null, c: '' }];
    const withEmpty = performUnpivot(data, {
      idCols: ['id'],
      valueCols: ['a', 'b', 'c'],
      varName: 'k',
      valueName: 'v',
    });
    expect(withEmpty).toHaveLength(3);
    const dropped = performUnpivot(data, {
      idCols: ['id'],
      valueCols: ['a', 'b', 'c'],
      varName: 'k',
      valueName: 'v',
      dropEmpty: true,
    });
    expect(dropped).toHaveLength(1);
    expect(dropped[0]).toEqual({ id: 'x', k: 'a', v: 10 });
  });

  it('un nouveau mois (nouvelle colonne) est dépliée sans changement de config', () => {
    const extended = WIDE_DATA.map((r) => ({ ...r, c2023_04: '999' }));
    const result = performUnpivot(extended, {
      idCols: ['Indicateurs', 'Sous_theme'],
      valueColsPattern: 'c{YYYY}_{MM}',
      varName: 'mois',
      varFormat: '{YYYY}-{MM}',
      valueName: 'valeur',
    });
    expect(result).toHaveLength(8); // 2 × 4 mois
    expect(result.some((r) => r.mois === '2023-04' && r.valeur === '999')).toBe(true);
  });

  it('sans value-cols ni pattern : déplie toutes les colonnes non-id', () => {
    const result = performUnpivot([{ id: 'x', a: 1, b: 2 }], {
      idCols: ['id'],
      varName: 'k',
      valueName: 'v',
    });
    expect(result).toEqual([
      { id: 'x', k: 'a', v: 1 },
      { id: 'x', k: 'b', v: 2 },
    ]);
  });

  it('rows vide → tableau vide', () => {
    expect(performUnpivot([], { idCols: ['x'] })).toEqual([]);
  });

  it('valeurs par défaut varName/valueName', () => {
    const result = performUnpivot([{ a: 1 }], {});
    expect(result[0]).toHaveProperty('variable', 'a');
    expect(result[0]).toHaveProperty('value', 1);
  });
});

describe('compileColsPattern', () => {
  it('tokens date à largeur fixe', () => {
    const { regex, tokens } = compileColsPattern('c{YYYY}_{MM}');
    expect(tokens).toEqual(['YYYY', 'MM']);
    expect(regex.test('c2023_01')).toBe(true);
    expect(regex.test('c2023_1')).toBe(false); // MM = 2 chiffres
    expect(regex.test('prefix_c2023_01')).toBe(false); // ancré
    const m = regex.exec('c2026_04');
    expect(m?.groups).toMatchObject({ YYYY: '2026', MM: '04' });
  });

  it('token générique matche un segment', () => {
    const { regex } = compileColsPattern('val_{name}');
    expect(regex.test('val_region')).toBe(true);
    expect(regex.test('val_region_extra')).toBe(false); // _ = séparateur
  });

  it('échappe les caractères regex littéraux', () => {
    const { regex } = compileColsPattern('a.b{Q}');
    expect(regex.test('a.b1')).toBe(true);
    expect(regex.test('axb1')).toBe(false); // le point est littéral
  });
});

describe('DsfrDataUnpivot (composant)', () => {
  let unpivot: DsfrDataUnpivot;

  beforeEach(() => {
    clearDataCache('test-unpivot');
    clearDataCache('wide-src');
    mockFetch.mockReset();
    unpivot = new DsfrDataUnpivot();
    unpivot.id = 'test-unpivot';
    unpivot.source = 'wide-src';
  });

  afterEach(() => {
    (unpivot as any)._cleanup?.();
  });

  it('transforme les données de la source amont et émet le tidy', () => {
    unpivot.idCols = 'Indicateurs, Sous_theme';
    unpivot.valueColsPattern = 'c{YYYY}_{MM}';
    unpivot.varName = 'mois';
    unpivot.varFormat = '{YYYY}-{MM}';
    unpivot.valueName = 'valeur';

    const received: unknown[] = [];
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.sourceId === 'test-unpivot') received.push(detail.data);
    };
    document.addEventListener('dsfr-data-loaded', handler);

    // Simule l'arrivée des données de la source amont via le cache + dispatch.
    setDataCache('wide-src', WIDE_DATA);
    (unpivot as any)._processData(WIDE_DATA);

    document.removeEventListener('dsfr-data-loaded', handler);

    const last = received[received.length - 1] as Array<Record<string, unknown>>;
    expect(last).toHaveLength(6);
    expect(last[0]).toMatchObject({ mois: '2023-01', valeur: '14904' });
    expect(getDataCache('test-unpivot')).toBeDefined();
  });
});

describe('DsfrDataUnpivot — cycle de vie', () => {
  let el: DsfrDataUnpivot;

  beforeEach(() => {
    clearDataCache('lc-out');
    clearDataCache('lc-src');
    el = new DsfrDataUnpivot();
    el.id = 'lc-out';
    el.source = 'lc-src';
    el.idCols = 'Indicateurs, Sous_theme';
    el.valueColsPattern = 'c{YYYY}_{MM}';
    el.varName = 'mois';
    el.varFormat = '{YYYY}-{MM}';
    el.valueName = 'valeur';
  });

  afterEach(() => {
    (el as any)._cleanup?.();
  });

  it("connectedCallback s'abonne et transforme les donnees a l'arrivee", () => {
    el.connectedCallback();
    dispatchDataLoaded('lc-src', WIDE_DATA);
    expect(el.getData()).toHaveLength(6);
    expect(getDataCache('lc-out')).toBeDefined();
  });

  it("traite les donnees deja presentes en cache au moment de l'abonnement", () => {
    setDataCache('lc-src', WIDE_DATA);
    el.connectedCallback();
    expect(el.getData()).toHaveLength(6);
  });

  it('willUpdate re-traite quand un parametre change (#281)', () => {
    setDataCache('lc-src', WIDE_DATA);
    el.connectedCallback();
    el.dropEmpty = true;
    (el as any)._transformerMountCycleDone = true;
    (el as any).willUpdate(new Map([['dropEmpty', false]]));
    expect(el.getData()).toHaveLength(6);
  });

  it('willUpdate re-initialise quand source change (#281)', () => {
    el.connectedCallback();
    const spy = vi.spyOn(el as any, 'reinitTransformer');
    (el as any)._transformerMountCycleDone = true; // cycle de montage consomme
    (el as any).willUpdate(new Map([['source', 'ancienne']]));
    expect(spy).toHaveBeenCalled();
  });

  it('relaie les commandes aval vers la source amont', () => {
    el.connectedCallback();
    let relayed: Record<string, unknown> | null = null;
    const unsub = subscribeToSourceCommands('lc-src', (cmd) => {
      relayed = cmd as Record<string, unknown>;
    });
    dispatchSourceCommand('lc-out', { where: 'x = 1', whereKey: 'k' });
    unsub();
    expect(relayed).toMatchObject({ where: 'x = 1' });
  });

  it('id manquant → erreur de config, pas de crash', () => {
    const bad = new DsfrDataUnpivot();
    bad.source = 'lc-src';
    expect(() => bad.connectedCallback()).not.toThrow();
    expect(bad.getData()).toHaveLength(0);
    (bad as any)._cleanup?.();
  });

  it('source manquante → erreur de config, pas de crash', () => {
    const bad = new DsfrDataUnpivot();
    bad.id = 'x-out';
    expect(() => bad.connectedCallback()).not.toThrow();
    (bad as any)._cleanup?.();
  });

  it('disconnectedCallback nettoie le cache de sortie', () => {
    setDataCache('lc-src', WIDE_DATA);
    el.connectedCallback();
    expect(getDataCache('lc-out')).toBeDefined();
    el.disconnectedCallback();
    expect(getDataCache('lc-out')).toBeUndefined();
  });

  it('mode value-cols explicite via attributs', () => {
    const e2 = new DsfrDataUnpivot();
    e2.id = 'vc-out';
    e2.source = 'vc-src';
    e2.idCols = 'region';
    e2.valueCols = 'a, b';
    e2.varName = 'k';
    e2.valueName = 'v';
    e2.connectedCallback();
    dispatchDataLoaded('vc-src', [{ region: 'IDF', a: 1, b: 2 }]);
    expect(e2.getData()).toEqual([
      { region: 'IDF', k: 'a', v: 1 },
      { region: 'IDF', k: 'b', v: 2 },
    ]);
    (e2 as any)._cleanup?.();
    clearDataCache('vc-out');
  });
});
