import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * #929 (PG-031) — `map-summary-field` : la colonne sur laquelle le résumé
 * d'une carte est CALCULÉ, distincte de celle qu'elle AFFICHE.
 *
 * L'énoncé du constat disait « le résumé porte sur la colonne affichée » ;
 * au sens strict c'est inexact, et la vérification l'a établi : le composant
 * arrondit au centième pour DESSINER la carte (`mapData`) mais résume les
 * lignes SOURCE (`_mapRows`) — le premier test ci-dessous le garde. Ce qui est
 * vrai, et qui suffit à fausser un taux national, c'est qu'un
 * `dsfr-data-normalize round="champ:1"` en amont réécrit la colonne dans la
 * donnée : le composant ne voit jamais la valeur brute, et Σ(valeur ×
 * effectif) / Σ(effectif) porte alors sur des valeurs arrondies.
 *
 * Mesure de l'issue, rejouée sur les 101 départements de la fédération 101
 * (API data.sports.gouv.fr, 2026-09-19) : taux national exact 4,536752…,
 * pondéré sur la valeur brute 4,536752… (identique), pondéré sur
 * `round(x, 1)` 4,533085… — l'écart de 0,0037 que la page a dû contourner en
 * arrondissant au centième.
 *
 * Contrat : purement additif. Attribut absent, rien ne change.
 */

import { DsfrDataChart } from '@/components/dsfr-data-chart.js';

interface ChartInternals {
  _data: unknown[];
  _getTypeSpecificAttributes(): { deferred: Record<string, string> };
}

/**
 * Trois départements, deux colonnes pour le MÊME indicateur : `taux` tel qu'il
 * sort de l'API, `taux_aff` arrondi au dixième pour l'infobulle — ce que pose
 * un `dsfr-data-normalize`. Les effectifs sont écartés d'un ordre de grandeur,
 * sinon pondérée et simple coïncideraient et le contrôle ne garderait rien.
 */
const ROWS = [
  { dep: '75', taux: 6.7328, taux_aff: 6.7, pop: 2_100_000 },
  { dep: '13', taux: 5.1519, taux_aff: 5.2, pop: 2_050_000 },
  { dep: '59', taux: 3.9842, taux_aff: 4.0, pop: 2_600_000 },
];

const wavg = (champ: 'taux' | 'taux_aff') => {
  const num = ROWS.reduce((s, r) => s + r[champ] * r.pop, 0);
  const den = ROWS.reduce((s, r) => s + r.pop, 0);
  return (Math.round((num / den) * 100) / 100).toString();
};

let chart: DsfrDataChart;
let internals: ChartInternals;

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  chart = new DsfrDataChart();
  internals = chart as unknown as ChartInternals;
  chart.id = 'carte';
  chart.type = 'map';
  chart.codeField = 'dep';
  internals._data = ROWS;
});

afterEach(() => {
  vi.restoreAllMocks();
});

const summary = () => internals._getTypeSpecificAttributes().deferred.value;

describe('#929 — ce que le résumé lit VRAIMENT', () => {
  it('le résumé ignore l’arrondi au centième que la carte applique pour dessiner', () => {
    // `_processMapData` écrit Math.round(v * 100) / 100 dans les données de la
    // carte. Si le résumé lisait CELLES-LÀ, la moyenne des trois vaudrait
    // (6,73 + 5,15 + 3,98) / 3 = 5,2867 → "5.29". Il lit les lignes source.
    chart.valueField = 'taux';
    expect(summary()).toBe('5.29');
    // …et la preuve par un cas où les deux diffèrent : trois valeurs dont
    // l'arrondi au centième déplace la moyenne.
    internals._data = [
      { dep: '75', taux: 1.005 },
      { dep: '13', taux: 1.005 },
      { dep: '59', taux: 1.005 },
    ];
    // Moyenne des valeurs source : 1,005 → affichée "1". Moyenne des valeurs
    // dessinées (1,01 chacune) vaudrait "1.01".
    expect(summary()).toBe('1');
  });

  it('mais un arrondi posé EN AMONT est dans la donnée, et fausse la pondération', () => {
    chart.valueField = 'taux_aff';
    chart.mapSummaryWeight = 'pop';
    expect(summary()).toBe(wavg('taux_aff'));
    expect(summary()).not.toBe(wavg('taux'));
  });
});

describe('#929 — map-summary-field : calculer sur une colonne, afficher l’autre', () => {
  it('pondère sur la colonne brute pendant que la carte affiche l’arrondie', () => {
    chart.valueField = 'taux_aff';
    chart.mapSummaryWeight = 'pop';
    chart.mapSummaryField = 'taux';
    expect(summary()).toBe(wavg('taux'));
  });

  it('vaut aussi pour la moyenne non pondérée', () => {
    chart.valueField = 'taux_aff';
    chart.mapSummaryField = 'taux';
    const moyenne = ROWS.reduce((s, r) => s + r.taux, 0) / ROWS.length;
    expect(summary()).toBe((Math.round(moyenne * 100) / 100).toString());
  });

  it('vaut aussi pour la somme', () => {
    chart.valueField = 'taux_aff';
    chart.mapSummary = 'sum';
    chart.mapSummaryField = 'taux';
    const total = ROWS.reduce((s, r) => s + r.taux, 0);
    expect(summary()).toBe((Math.round(total * 100) / 100).toString());
  });

  it('ne change rien à ce que la carte DESSINE', () => {
    chart.valueField = 'taux_aff';
    chart.mapSummaryField = 'taux';
    const attrs = internals._getTypeSpecificAttributes() as unknown as {
      deferred: Record<string, string>;
    };
    expect(JSON.parse(attrs.deferred.data)).toEqual({ '75': 6.7, '13': 5.2, '59': 4 });
  });

  it('attribut absent : le chiffre publié ne bouge pas', () => {
    chart.valueField = 'taux_aff';
    chart.mapSummaryWeight = 'pop';
    expect(chart.mapSummaryField).toBe('');
    expect(summary()).toBe(wavg('taux_aff'));
  });

  it('une valeur fournie continue de primer', () => {
    chart.valueField = 'taux_aff';
    chart.mapSummaryField = 'taux';
    chart.mapSummaryValue = '4,54';
    expect(summary()).toBe('4.54');
  });

  it('map-summary="none" continue de tout emporter', () => {
    chart.valueField = 'taux_aff';
    chart.mapSummaryField = 'taux';
    chart.mapSummary = 'none';
    expect(summary()).toBeUndefined();
  });
});

describe('#929 — un champ de calcul introuvable est une erreur, pas un repli', () => {
  it('n’affiche AUCUN résumé plutôt que celui de la colonne affichée', () => {
    chart.valueField = 'taux_aff';
    chart.mapSummaryField = 'taux_brut';
    expect(summary()).toBeUndefined();
  });

  it('le dit dans l’état d’erreur du composant', () => {
    chart.valueField = 'taux_aff';
    chart.mapSummaryWeight = 'pop';
    chart.mapSummaryField = 'taux_brut';
    internals._getTypeSpecificAttributes();
    const erreur = (chart as unknown as { _mapSummaryError: string | null })._mapSummaryError;
    expect(erreur).toContain('map-summary-field="taux_brut"');
    expect(erreur).toContain('3 ligne(s)');
  });
});
