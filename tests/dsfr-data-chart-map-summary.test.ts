import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * #763 — le résumé « en France » d'une choroplèthe.
 *
 * Il était la moyenne arithmétique des valeurs territoriales, calculée par
 * `dsfr-data-chart` (et non par DSFR Chart, qui affiche la prop `value` qu'on
 * lui passe). Une moyenne de taux n'est pas le taux national dès que les
 * territoires pèsent différemment : le banc d'essai a mesuré −24 % sur le taux
 * de personnels des collèges (4,27 % affiché, 5,6 % réel).
 */

import { DsfrDataChart } from '@/components/dsfr-data-chart.js';

interface ChartInternals {
  _data: unknown[];
  _getTypeSpecificAttributes(): { deferred: Record<string, string> };
  _refreshChartOverlays(): void;
}

/**
 * Deux départements de tailles très différentes : la moyenne des taux (6)
 * est loin du taux national, Σ(taux × élèves) / Σ(élèves) = 2,8. La ligne au
 * code invalide n'est pas dessinée et ne doit peser dans aucun calcul.
 */
const ROWS = [
  { dep: '75', taux: 10, eleves: 1000 },
  { dep: '13', taux: 2, eleves: 9000 },
  { dep: 'XYZ', taux: 100, eleves: 50 },
];

let chart: DsfrDataChart;
let internals: ChartInternals;

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  chart = new DsfrDataChart();
  internals = chart as unknown as ChartInternals;
  chart.id = 'carte';
  chart.type = 'map';
  chart.codeField = 'dep';
  chart.valueField = 'taux';
  internals._data = ROWS;
});

afterEach(() => {
  vi.restoreAllMocks();
});

const summary = () => internals._getTypeSpecificAttributes().deferred.value;

describe('#763 — calcul par défaut', () => {
  it('reste la moyenne NON pondérée, mais des seules lignes dessinées', () => {
    // Avant : (10 + 2 + 100) / 3 = 37,33 — la ligne ignorée pesait.
    expect(summary()).toBe('6');
  });

  it('pas de résumé sans ligne dessinée', () => {
    internals._data = [{ dep: 'XYZ', taux: 3 }];
    expect(summary()).toBeUndefined();
  });

  it('vaut aussi pour les autres découpages', () => {
    chart.type = 'map-reg';
    internals._data = [
      { dep: '11', taux: 4 },
      { dep: '84', taux: 8 },
    ];
    expect(summary()).toBe('6');
  });
});

describe('#763 — map-summary-weight : moyenne pondérée', () => {
  it('rend Σ(valeur × effectif) / Σ(effectif)', () => {
    chart.mapSummaryWeight = 'eleves';
    expect(summary()).toBe('2.8');
  });

  it('écarte les lignes sans effectif numérique', () => {
    chart.mapSummaryWeight = 'eleves';
    internals._data = [...ROWS, { dep: '59', taux: 50, eleves: 'n.d.' }];
    expect(summary()).toBe('2.8');
  });

  it('un champ d’effectif absent est une erreur de configuration, sans résumé', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    chart.mapSummaryWeight = 'effectif';
    expect(summary()).toBeUndefined();

    internals._refreshChartOverlays();
    expect(chart.getAttribute('data-dsfr-config-error')).toContain('map-summary-weight="effectif"');
    // Une seule erreur console, même si le rendu se répète.
    internals._refreshChartOverlays();
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });
});

describe('#763 — map-summary-value : valeur fournie par la page', () => {
  it('affiche la valeur nationale publiée', () => {
    chart.mapSummaryValue = '5.6';
    expect(summary()).toBe('5.6');
  });

  it('accepte les décimales à la française', () => {
    chart.mapSummaryValue = '5,6';
    expect(summary()).toBe('5.6');
  });

  it('prime sur map-summary-weight', () => {
    chart.mapSummaryValue = '5.6';
    chart.mapSummaryWeight = 'eleves';
    expect(summary()).toBe('5.6');
  });

  it('une valeur non numérique est une erreur de configuration, sans résumé', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    chart.mapSummaryValue = 'national';
    expect(summary()).toBeUndefined();

    internals._refreshChartOverlays();
    expect(chart.getAttribute('data-dsfr-config-error')).toContain('map-summary-value="national"');
  });

  it('l’erreur disparaît quand la configuration redevient valide', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    chart.mapSummaryValue = 'national';
    summary();
    internals._refreshChartOverlays();
    chart.mapSummaryValue = '5,6';
    summary();
    internals._refreshChartOverlays();
    expect(chart.hasAttribute('data-dsfr-config-error')).toBe(false);
  });
});

describe('#763 — hors carte', () => {
  it('une erreur de résumé restée d’un type carte ne fuit pas sur un graphique', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    chart.mapSummaryValue = 'national';
    summary();
    chart.type = 'bar';
    internals._refreshChartOverlays();
    expect(chart.hasAttribute('data-dsfr-config-error')).toBe(false);
  });
});
