import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * #927 — `map-summary` : le MODE de synthèse du résumé d'une carte.
 *
 * Le résumé d'une carte de VOLUMES était une moyenne de volumes — « 3 074,06
 * en France » pour 310 480 licences, un chiffre sans signification. #763 avait
 * réglé les TAUX (`map-summary-weight`) et permis une valeur fournie
 * (`map-summary-value`), mais celle-ci est un littéral : juste pour une
 * fédération, fausse dès qu'on en change ou qu'on filtre une région.
 *
 * Contrat : additif. Sans `map-summary`, le résumé garde exactement son ordre
 * historique (valeur fournie, sinon pondérée si un effectif est posé, sinon
 * moyenne non pondérée) — aucun chiffre déjà publié ne bouge.
 */

import { DsfrDataChart, MAP_SUMMARY_MODES } from '@/components/dsfr-data-chart.js';

interface ChartInternals {
  _data: unknown[];
  _getTypeSpecificAttributes(): { deferred: Record<string, string> };
  _refreshChartOverlays(): void;
}

/**
 * Trois départements et une ligne au code invalide, qui n'est pas dessinée et
 * ne doit peser dans aucun résumé. Somme des volumes dessinés : 310 480.
 * Moyenne : 103 493,33 — le chiffre que la carte annonçait « en France ».
 */
const ROWS = [
  { dep: '75', lics: 101_304, pop: 2_100_000 },
  { dep: '13', lics: 105_640, pop: 2_050_000 },
  { dep: '59', lics: 103_536, pop: 2_600_000 },
  { dep: 'XYZ', lics: 999_999, pop: 10 },
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
  chart.valueField = 'lics';
  internals._data = ROWS;
});

afterEach(() => {
  vi.restoreAllMocks();
});

const summary = () => internals._getTypeSpecificAttributes().deferred.value;

describe('#927 — l’attribut absent ne change rien', () => {
  it('le résumé reste la moyenne non pondérée des lignes dessinées', () => {
    expect(chart.mapSummary).toBe('');
    // (101 304 + 105 640 + 103 536) / 3 — la moyenne de volumes de AM-079.
    expect(summary()).toBe('103493.33');
  });

  it('un champ d’effectif seul pondère encore, comme en #763', () => {
    chart.mapSummaryWeight = 'pop';
    expect(summary()).toBe('103480.59');
  });

  it('une valeur fournie prime encore', () => {
    chart.mapSummaryValue = '310480';
    chart.mapSummaryWeight = 'pop';
    expect(summary()).toBe('310480');
  });
});

describe('#927 — map-summary="sum" : la somme, seule synthèse juste d’un volume', () => {
  it('rend le total des lignes dessinées', () => {
    chart.mapSummary = 'sum';
    expect(summary()).toBe('310480');
  });

  it('suit les filtres : le total d’un sous-ensemble est celui du sous-ensemble', () => {
    chart.mapSummary = 'sum';
    internals._data = ROWS.filter((r) => r.dep === '75');
    // Ce qu'un littéral `map-summary-value="310480"` ne sait pas faire.
    expect(summary()).toBe('101304');
  });

  it('n’additionne pas les lignes écartées faute de code géographique', () => {
    chart.mapSummary = 'sum';
    // La ligne « XYZ » porte 999 999 : si elle comptait, le total serait
    // 1 310 479 — plausible, et faux.
    expect(summary()).toBe('310480');
  });

  it('avertit quand deux lignes portent le même code : la carte n’en dessine qu’une', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    chart.mapSummary = 'sum';
    internals._data = [
      { dep: '75', lics: 100 },
      { dep: '75', lics: 400 },
      { dep: '13', lics: 500 },
    ];

    // La somme compte bien les deux lignes de 75 — mais la carte affiche 400.
    expect(summary()).toBe('1000');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('map-summary="sum"'));
    expect(warn.mock.calls[0][0]).toContain('2 territoire(s) dessiné(s)');
  });

  it('pas de résumé sans aucune valeur numérique', () => {
    chart.mapSummary = 'sum';
    internals._data = [{ dep: '75', lics: 'n.d.' }];
    expect(summary()).toBeUndefined();
  });
});

describe('#927 — map-summary="none" : retirer le résumé', () => {
  it('n’affiche aucune valeur', () => {
    chart.mapSummary = 'none';
    expect(summary()).toBeUndefined();
  });

  it('prime sur une valeur fournie et sur un effectif', () => {
    chart.mapSummary = 'none';
    chart.mapSummaryValue = '310480';
    chart.mapSummaryWeight = 'pop';
    expect(summary()).toBeUndefined();
  });

  it('n’est pas une erreur de configuration', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    chart.mapSummary = 'none';
    summary();
    internals._refreshChartOverlays();
    expect(chart.hasAttribute('data-dsfr-config-error')).toBe(false);
    expect(errorSpy).not.toHaveBeenCalled();
  });
});

describe('#927 — les deux autres modes', () => {
  it('avg force la moyenne non pondérée, même avec un effectif posé', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    chart.mapSummary = 'avg';
    chart.mapSummaryWeight = 'pop';
    expect(summary()).toBe('103493.33');
    // L'intention contredite est dite, pas subie.
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('map-summary-weight="pop"'));
  });

  it('weighted pondère explicitement', () => {
    chart.mapSummary = 'weighted';
    chart.mapSummaryWeight = 'pop';
    expect(summary()).toBe('103480.59');
  });

  it('weighted sans effectif est une erreur de configuration, sans résumé', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    chart.mapSummary = 'weighted';
    expect(summary()).toBeUndefined();

    internals._refreshChartOverlays();
    expect(chart.getAttribute('data-dsfr-config-error')).toContain('map-summary="weighted"');
  });
});

describe('#927 — garde-fous de la grammaire', () => {
  it('la liste blanche est celle des quatre modes', () => {
    expect([...MAP_SUMMARY_MODES]).toEqual(['sum', 'avg', 'weighted', 'none']);
  });

  it('un mode inconnu est une erreur nommée, sans résumé de repli', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    chart.mapSummary = 'somme';
    // Surtout pas 103 493,33 : un repli silencieux serait plausible et faux.
    expect(summary()).toBeUndefined();

    internals._refreshChartOverlays();
    const erreur = chart.getAttribute('data-dsfr-config-error') ?? '';
    expect(erreur).toContain('map-summary="somme"');
    expect(erreur).toContain('sum, avg, weighted, none');
  });

  it('la casse et les espaces sont tolérés', () => {
    chart.mapSummary = '  SUM ';
    expect(summary()).toBe('310480');
  });

  it('un mode ignoré par une valeur fournie est signalé', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    chart.mapSummary = 'sum';
    chart.mapSummaryValue = '310480';
    expect(summary()).toBe('310480');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('fait autorité'));
  });
});
