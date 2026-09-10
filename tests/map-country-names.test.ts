import { describe, it, expect, vi, afterEach } from 'vitest';

/**
 * #743 — un nom de pays écrit en français vaut son code ISO sur `map-monde`.
 *
 * `toIsoA2` n'acceptait qu'un alpha-2, un alpha-3 ou un numérique : un jeu qui
 * nomme ses pays en français — le cas courant des données publiques — obligeait
 * à réécrire chaque correspondance à la main. La table est une liste blanche,
 * comme les référentiels d'académies et de régions (#729) : un nom inconnu
 * reste compté par `getSkippedCount()`, jamais transmis en silence.
 */

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

import {
  toIsoA2,
  frenchNameToIsoA2,
  FRENCH_COUNTRY_NAMES,
  ISO_A2_TO_NUM,
} from '@/data/continent-lookup.js';
import { DsfrDataChart } from '@/components/dsfr-data-chart.js';

/** Vue interne du graphique (membres privés inspectés par les tests). */
interface ChartInternals {
  _data: unknown[];
  _processMapData: () => string;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('#743 — frenchNameToIsoA2', () => {
  it('« Allemagne », « allemagne » et « DE » désignent le même pays', () => {
    expect(frenchNameToIsoA2('Allemagne')).toBe('DE');
    expect(frenchNameToIsoA2('allemagne')).toBe('DE');
    expect(toIsoA2('Allemagne')).toBe('DE');
    expect(toIsoA2('allemagne')).toBe('DE');
    expect(toIsoA2('DE')).toBe('DE');
  });

  it('ignore les accents, la casse et les espaces de bord', () => {
    expect(frenchNameToIsoA2('  Brésil ')).toBe('BR');
    expect(frenchNameToIsoA2('BRESIL')).toBe('BR');
    expect(frenchNameToIsoA2('brésil')).toBe('BR');
  });

  it('aplatit les traits d’union et les apostrophes typographiques', () => {
    expect(frenchNameToIsoA2('Pays-Bas')).toBe('NL');
    expect(frenchNameToIsoA2('pays bas')).toBe('NL');
    expect(frenchNameToIsoA2('États-Unis')).toBe('US');
    expect(frenchNameToIsoA2('Côte d’Ivoire')).toBe('CI');
    expect(frenchNameToIsoA2("Cote d'ivoire")).toBe('CI');
  });

  it('retire l’article de tête', () => {
    expect(frenchNameToIsoA2('la France')).toBe('FR');
    expect(frenchNameToIsoA2('Les Pays-Bas')).toBe('NL');
    expect(frenchNameToIsoA2("l'Inde")).toBe('IN');
    expect(frenchNameToIsoA2('le Mexique')).toBe('MX');
  });

  it('accepte les formes longues et les variantes courantes', () => {
    expect(frenchNameToIsoA2("République fédérale d'Allemagne")).toBe('DE');
    expect(frenchNameToIsoA2("États-Unis d'Amérique")).toBe('US');
    expect(frenchNameToIsoA2('Royaume-Uni')).toBe('GB');
    expect(frenchNameToIsoA2('République tchèque')).toBe('CZ');
    expect(frenchNameToIsoA2('Tchéquie')).toBe('CZ');
    expect(frenchNameToIsoA2('Birmanie')).toBe('MM');
    expect(frenchNameToIsoA2('Myanmar')).toBe('MM');
  });

  it('renvoie une chaîne vide sur un nom hors référentiel', () => {
    expect(frenchNameToIsoA2('Atlantide')).toBe('');
    expect(frenchNameToIsoA2('Angleterre')).toBe('');
    expect(frenchNameToIsoA2('')).toBe('');
    expect(frenchNameToIsoA2('   ')).toBe('');
  });

  it('les clés de la table sont déjà normalisées et pointent sur un alpha-2 connu', () => {
    for (const [name, a2] of Object.entries(FRENCH_COUNTRY_NAMES)) {
      expect(name).toBe(name.toUpperCase());
      expect(name).not.toMatch(/[̀-ͯ-]/);
      expect(ISO_A2_TO_NUM[a2]).toBeDefined();
    }
  });

  it('chaque pays du référentiel alpha-2 a au moins un nom français', () => {
    const covered = new Set(Object.values(FRENCH_COUNTRY_NAMES));
    const missing = Object.keys(ISO_A2_TO_NUM).filter((a2) => !covered.has(a2));
    expect(missing).toEqual([]);
  });
});

describe('#743 — toIsoA2 conserve les formes existantes', () => {
  it('alpha-2, alpha-3 et numérique restent reconnus', () => {
    expect(toIsoA2('FR')).toBe('FR');
    expect(toIsoA2('fra')).toBe('FR');
    expect(toIsoA2('250')).toBe('FR');
    expect(toIsoA2('76')).toBe('BR');
  });

  it('un code hors référentiel reste une chaîne vide', () => {
    expect(toIsoA2('XX')).toBe('');
    expect(toIsoA2('XYZ')).toBe('');
    expect(toIsoA2('999')).toBe('');
  });

  it('« RDC », qui a la forme d’un alpha-3, retombe sur le nom français', () => {
    expect(toIsoA2('RDC')).toBe('CD');
  });
});

describe('#743 — dsfr-data-chart type="map-monde"', () => {
  function mondeChart(rows: unknown[]): DsfrDataChart {
    const chart = new DsfrDataChart();
    chart.id = 'monde';
    chart.type = 'map-monde';
    chart.codeField = 'pays';
    chart.valueField = 'val';
    (chart as unknown as ChartInternals)._data = rows;
    return chart;
  }

  it('les noms français sont traduits en clés alpha-2', () => {
    const chart = mondeChart([
      { pays: 'Allemagne', val: 1 },
      { pays: 'espagne', val: 2 },
      { pays: 'Côte d’Ivoire', val: 3 },
      { pays: 'IT', val: 4 },
    ]);
    const data = JSON.parse((chart as unknown as ChartInternals)._processMapData());
    expect(data).toEqual({ DE: 1, ES: 2, CI: 3, IT: 4 });
    expect(chart.getSkippedCount()).toBe(0);
  });

  it('un nom inconnu est compté comme ignoré, pas avalé en silence', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const chart = mondeChart([
      { pays: 'Allemagne', val: 1 },
      { pays: 'Atlantide', val: 2 },
      { pays: 'Angleterre', val: 3 },
    ]);
    const data = JSON.parse((chart as unknown as ChartInternals)._processMapData());
    expect(Object.keys(data)).toEqual(['DE']);
    expect(chart.getSkippedCount()).toBe(2);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toContain('2 ligne(s) sur 3');
  });
});
