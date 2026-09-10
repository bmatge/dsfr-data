import { describe, it, expect, vi, afterEach } from 'vitest';

/**
 * Tests #729 — référentiels de clés des cartes `map-reg` et `map-aca`.
 *
 * `@gouvfr/dsfr-chart` n'accepte que ses propres clés (`IDF`, `20R`, `971`
 * pour les régions ; `PARIS`, `BESANCON`, `ORLEANS-TOURS` pour les académies)
 * et ne normalise rien. Une clé hors référentiel n'est pas dessinée : elle
 * doit être traduite quand c'est possible, et comptée sinon — c'est le vrai
 * bug, une carte à moitié muette qui se déclarait complète.
 */

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

import { toAcademyKey, toRegionKey } from '@/utils/map-geo-keys.js';
import { DsfrDataChart } from '@/components/dsfr-data-chart.js';

/** Vue interne du graphique (membres privés inspectés par les tests). */
interface ChartInternals {
  _data: unknown[];
  _processMapData: () => string;
}

function mapChart(type: DsfrDataChart['type'], rows: Record<string, unknown>[]): DsfrDataChart {
  const chart = new DsfrDataChart();
  chart.type = type;
  chart.codeField = 'code';
  chart.valueField = 'val';
  (chart as unknown as ChartInternals)._data = rows;
  return chart;
}

function mapDataOf(chart: DsfrDataChart): Record<string, number> {
  return JSON.parse((chart as unknown as ChartInternals)._processMapData()) as Record<
    string,
    number
  >;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('toAcademyKey — désaccentuation bornée par la liste blanche', () => {
  it.each([
    ['Académie de Besançon', 'BESANCON'],
    ['ACADEMIE DE BESANCON', 'BESANCON'],
    ['Besançon', 'BESANCON'],
    ['BESANCON', 'BESANCON'],
    ['  paris  ', 'PARIS'],
    ['Académie d’Amiens', 'AMIENS'],
    ["Académie d'Aix-Marseille", 'AIX-MARSEILLE'],
    ['Académie d’Orléans-Tours', 'ORLEANS-TOURS'],
    ['Orleans Tours', 'ORLEANS-TOURS'],
    ['Académie de La Réunion', 'REUNION'],
    ['La Réunion', 'REUNION'],
    ['Académie de Nancy-Metz', 'NANCY-METZ'],
    ['Académie de Créteil', 'CRETEIL'],
    ['Académie de Normandie', 'NORMANDIE'],
  ])('%s -> %s', (input, expected) => {
    expect(toAcademyKey(input)).toBe(expected);
  });

  it.each([
    '',
    '   ',
    'Polynésie française',
    'Wallis-et-Futuna',
    'Saint-Pierre-et-Miquelon',
    'AEFE',
    'Académie de Nulle-Part',
    '75',
  ])('hors référentiel : %s -> chaîne vide', (input) => {
    expect(toAcademyKey(input)).toBe('');
  });
});

describe('toRegionKey — INSEE, ISO 3166-2 et noms', () => {
  it.each([
    ['11', 'IDF'],
    ['84', 'ARA'],
    ['94', '20R'],
    ['01', '971'],
    ['1', '971'],
    ['06', '976'],
    ['IDF', 'IDF'],
    ['idf', 'IDF'],
    ['971', '971'],
    ['20R', '20R'],
    ['Île-de-France', 'IDF'],
    ['ile de france', 'IDF'],
    ["Provence-Alpes-Côte d'Azur", 'PAC'],
    ['Bourgogne-Franche-Comté', 'BFC'],
    ['La Réunion', '974'],
  ])('%s -> %s', (input, expected) => {
    expect(toRegionKey(input)).toBe(expected);
  });

  it.each(['', '  ', '99', 'ZZZ', '2A', 'Bretagne du Sud'])(
    'hors référentiel : %s -> chaîne vide',
    (input) => {
      expect(toRegionKey(input)).toBe('');
    }
  );
});

describe('#729 — _processMapData compte les clés hors référentiel', () => {
  it('map-aca : les libellés accentués passent, les territoires absents sont comptés', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const chart = mapChart('map-aca', [
      { code: 'Académie de Besançon', val: 1 },
      { code: 'PARIS', val: 2 },
      { code: 'Polynésie française', val: 3 },
      { code: 'Wallis-et-Futuna', val: 4 },
      { code: '', val: 5 },
    ]);

    expect(Object.keys(mapDataOf(chart)).sort()).toEqual(['BESANCON', 'PARIS']);
    expect(chart.getSkippedCount()).toBe(3);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toContain('3 ligne(s) sur 5');
  });

  it('map-reg : code INSEE traduit, code inconnu compté', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const chart = mapChart('map-reg', [
      { code: '11', val: 1 },
      { code: '94', val: 2 },
      { code: 'PAC', val: 3 },
      { code: '99', val: 4 },
    ]);

    expect(mapDataOf(chart)).toEqual({ IDF: 1, '20R': 2, PAC: 3 });
    expect(chart.getSkippedCount()).toBe(1);
  });

  it('map-reg : deux lignes sur la même région se recouvrent sans être comptées', () => {
    const chart = mapChart('map-reg', [
      { code: '11', val: 1 },
      { code: 'Île-de-France', val: 2 },
    ]);

    expect(mapDataOf(chart)).toEqual({ IDF: 2 });
    expect(chart.getSkippedCount()).toBe(0);
  });
});
