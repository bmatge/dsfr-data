/**
 * Réglages de lecture ajoutés au Builder par #1218 : unité des infobulles,
 * bornes des axes, lignes de référence, cibles, couleur fixée par catégorie,
 * libellé des catégories vides, chiffre de synthèse d'une carte.
 *
 * Trois étages :
 *   1. le module pur `lecture.ts` — quel réglage pour quel type, traduction en
 *      attributs, lecture défensive d'un état déposé ;
 *   2. le CODE généré, dans les chemins du générateur : données locales
 *      intégrées, API intégrée, Grist dynamique, API dynamique (OpenDataSoft,
 *      Tabular, générique) ;
 *   3. l'instantané des favoris et le formulaire (contrôles affichés par type).
 *
 * RÉTROCOMPATIBILITÉ : tant qu'aucun réglage n'est posé, aucun attribut n'est
 * écrit et les types historiques gardent, en données intégrées, leur balise
 * DSFR Chart nue. La suite existante (`code-generator.test.ts`,
 * `lot-b-code-exporte.test.ts`…) épingle ce code et passe sans modification.
 *
 * Preuves de mutation (faites à la main le 2026-10-05, défaut retiré ensuite) :
 * - retirer `${lectureAttrsHtml()}` de `visualElement` (code-generator.ts) :
 *   les 29 cas « code généré » qui lisent un attribut rougissent ;
 * - retirer `hasLectureAttrs(…)` de `usesLibEmbedded` : 8 cas « données
 *   intégrées » rougissent (la balise `<bar-chart>` nue revient, sans réglage) ;
 * - écrire `y-` au lieu de `${axe}-` dans `lectureAttrs` (lecture.ts) : le cas
 *   « barres horizontales » rougit ;
 * - retirer `...LECTURE_KEYS` de `getBuilderStateToSave` (ui-helpers.ts) : le
 *   cas « instantané » rougit ;
 * - retirer `emptyGroupLabel()` de l'agrégation locale : le cas « catégorie
 *   vide » rougit (« N/A » revient).
 * Réouverture d'un favori par `loadFavoriteState` et statut « modifié » :
 * `retour-playground-champs.test.ts`, avec leurs trois preuves.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import {
  generateChartFromLocalData,
  generateCode,
  generateDynamicCode,
  generateDynamicCodeForApi,
  usesLibEmbedded,
} from '../../../apps/builder/src/ui/code-generator';
import { getBuilderStateToSave } from '../../../apps/builder/src/ui/ui-helpers';
import { selectChartType } from '../../../apps/builder/src/ui/chart-type-selector';
import {
  colorSuggestions,
  restoreLecture,
  setupLectureListeners,
  syncLectureControls,
} from '../../../apps/builder/src/ui/lecture';
import {
  LECTURE_KEYS,
  colorMapValue,
  hasLectureAttrs,
  lectureApplicability,
  lectureAttrs,
  lectureDefaults,
  normalizeLecture,
  parseNumberInput,
  referenceLinesValue,
  targetsValue,
  type LectureSettings,
} from '../../../apps/builder/src/lecture';
import { state, type BuilderState, type ChartType } from '../../../apps/builder/src/state';

vi.mock('../../../apps/builder/src/ui/accessible-table', () => ({
  updateAccessibleTable: vi.fn(),
}));

const RACINE = resolve(import.meta.dirname, '../../..');

const LIGNES = [
  { region: 'Bretagne', annee: '2022', budget: 100, taux: 10 },
  { region: 'Bretagne', annee: '2023', budget: 50, taux: 20 },
  { region: 'Normandie', annee: '2022', budget: 80, taux: 30 },
  { region: '', annee: '2023', budget: 20, taux: 5 },
];

const CHAMPS = [
  { name: 'region', type: 'string', sample: 'Bretagne' },
  { name: 'annee', type: 'string', sample: '2022' },
  { name: 'budget', type: 'number', sample: 100 },
  { name: 'taux', type: 'number', sample: 10 },
];

function reinitialiser(): void {
  Object.assign(state, {
    chartType: 'bar',
    labelField: 'region',
    labelFieldLabel: '',
    valueField: 'budget',
    valueFieldLabel: '',
    valueField2: '',
    extraSeries: [],
    lineField: '',
    lineFieldLabel: '',
    seriesField: '',
    stacked: false,
    codeField: '',
    aggregation: 'sum',
    sortOrder: 'none',
    sortField: '',
    title: 'Mon graphique',
    subtitle: '',
    palette: 'default',
    data: [],
    localData: LIGNES.map((l) => ({ ...l })),
    fields: CHAMPS,
    savedSource: null,
    sourceType: 'saved',
    generationMode: 'embedded',
    advancedMode: false,
    queryFilter: '',
    queryGroupBy: '',
    queryAggregate: '',
    refreshInterval: 0,
    apiUrl: '',
    isSampleData: false,
    a11yEnabled: true,
    a11yTable: true,
    a11yDownload: true,
    a11yDescription: '',
    databoxEnabled: false,
    urlSync: false,
    normalizeConfig: {
      enabled: false,
      flatten: '',
      trim: false,
      numericAuto: false,
      numeric: '',
      rename: '',
      stripHtml: false,
      replace: '',
      lowercaseKeys: false,
    },
    facetsConfig: { enabled: false, fields: [], maxValues: 6, sort: 'count', hideEmpty: false },
    ...lectureDefaults(),
  } satisfies Partial<BuilderState>);
  document.body.innerHTML = '<div id="generated-code"></div><div id="raw-data"></div>';
}

const code = (): string => document.getElementById('generated-code')!.textContent!;

/** Attributs de la balise `<dsfr-data-chart>` du code généré, nom → valeur brute. */
function attributsDuGraphique(): Record<string, string> {
  const balise = /<dsfr-data-chart\b([\s\S]*?)>\s*<\/dsfr-data-chart>/.exec(code());
  expect(balise, 'balise dsfr-data-chart introuvable').not.toBeNull();
  const out: Record<string, string> = {};
  for (const m of balise![1].matchAll(/\s([a-z][a-z0-9-]*)(?:=(?:"([^"]*)"|'([^']*)'))?/g)) {
    out[m[1]] = m[2] ?? m[3] ?? '';
  }
  return out;
}

/** Valeur JSON d'un attribut écrit entre guillemets simples. */
function json(valeur: string): unknown {
  return JSON.parse(
    valeur
      .replace(/&#039;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&amp;/g, '&')
  );
}

const GRIST = {
  id: 'g1',
  name: 'Budget Grist',
  type: 'grist' as const,
  apiUrl: 'https://docs.getgrist.com/api/docs/doc1/tables/Budget/records',
  documentId: 'doc1',
  tableId: 'Budget',
};
const ODS = {
  id: 'o1',
  name: 'Budget ODS',
  type: 'api' as const,
  apiUrl: 'https://data.exemple.fr/api/explore/v2.1/catalog/datasets/budget/records',
};
const TABULAR = {
  id: 't1',
  name: 'Budget Tabular',
  type: 'api' as const,
  apiUrl: 'https://tabular-api.data.gouv.fr/api/resources/abc-123/data/',
};
const GENERIQUE = {
  id: 'a1',
  name: 'Budget API',
  type: 'api' as const,
  apiUrl: 'https://api.exemple.fr/budget',
};

/** Les quatorze attributs de `dsfr-data-chart` que ce lot écrit. */
const ATTRIBUTS = [
  'unit-tooltip',
  'unit-tooltip-bar',
  'x-min',
  'x-max',
  'y-min',
  'y-max',
  'reference-lines',
  'targets',
  'targets-zone',
  'targets-legend',
  'color-map',
  'empty-label',
  'map-summary',
  'map-summary-value',
];

/** Tous les réglages posés à la fois : chaque type n'en lit qu'une partie. */
function toutPoser(): LectureSettings {
  return {
    unitTooltip: '%',
    unitTooltipBar: '€',
    axisMin: '-5',
    axisMax: '40',
    xAxisMin: '0',
    xAxisMax: '10',
    referenceLines: [
      { kind: 'value', value: '13', label: 'Seuil' },
      { kind: 'label', value: '2022', label: 'Réforme' },
    ],
    targets: [{ x: '2030', value: '26', label: 'Cible 2030', series: 'line' }],
    targetsZone: false,
    targetsLegend: false,
    colorMap: [{ key: 'Bretagne', color: '#e1000f' }],
    emptyLabel: 'Sans région',
    mapSummary: 'sum',
    mapSummaryValue: '5,6',
  };
}

const noms = (type: string, s: LectureSettings): string[] =>
  lectureAttrs(type, s).map((a) => a.name);

// ---------------------------------------------------------------------------
// 1. Module pur
// ---------------------------------------------------------------------------

describe('lecture.ts : saisie des nombres', () => {
  it('lit les décimales et les milliers à la française', () => {
    expect(parseNumberInput('5,6')).toBe(5.6);
    expect(parseNumberInput('310 480')).toBe(310480);
    expect(parseNumberInput('1 200,5')).toBe(1200.5);
    expect(parseNumberInput('-10')).toBe(-10);
    expect(parseNumberInput('0')).toBe(0);
  });

  it('refuse ce qui n’est pas un nombre : aucune borne, aucun seuil faux', () => {
    for (const saisie of ['', '  ', 'douze', '12 %', '1,2,3', '1e3', '--4']) {
      expect(parseNumberInput(saisie), saisie).toBeNull();
    }
  });
});

describe('lecture.ts : quel réglage pour quel type', () => {
  it('aucun réglage posé : aucun attribut, pour aucun type', () => {
    const types = ['bar', 'horizontalBar', 'line', 'pie', 'doughnut', 'radar', 'scatter'];
    for (const type of [...types, 'gauge', 'kpi', 'map', 'datalist', 'podium', 'bar-line']) {
      expect(lectureAttrs(type, lectureDefaults()), type).toEqual([]);
      expect(hasLectureAttrs(type, lectureDefaults()), type).toBe(false);
    }
  });

  it('chaque type n’écrit que ce qu’il sait lire', () => {
    const s = toutPoser();
    expect(noms('bar', s)).toEqual([
      'empty-label',
      'unit-tooltip',
      'y-min',
      'y-max',
      'reference-lines',
      'color-map',
    ]);
    expect(noms('line', s)).toEqual([
      'empty-label',
      'unit-tooltip',
      'y-min',
      'y-max',
      'reference-lines',
      'targets',
      'targets-zone',
      'targets-legend',
      'color-map',
    ]);
    // Barres + ligne : deux unités, pas de bornes (sans effet dans DSFR Chart).
    expect(noms('bar-line', s)).toEqual([
      'empty-label',
      'unit-tooltip-bar',
      'unit-tooltip',
      'reference-lines',
      'targets',
      'targets-zone',
      'targets-legend',
      'color-map',
    ]);
    expect(noms('pie', s)).toEqual(['empty-label', 'unit-tooltip', 'color-map']);
    expect(noms('doughnut', s)).toEqual(['empty-label', 'unit-tooltip', 'color-map']);
    expect(noms('radar', s)).toEqual([
      'empty-label',
      'unit-tooltip',
      'y-min',
      'y-max',
      'color-map',
    ]);
    // Nuage : les deux axes se bornent, pas de catégorie vide.
    expect(noms('scatter', s)).toEqual([
      'unit-tooltip',
      'x-min',
      'x-max',
      'y-min',
      'y-max',
      'reference-lines',
      'color-map',
    ]);
    for (const carte of ['map', 'map-reg', 'map-aca', 'map-monde']) {
      expect(noms(carte, s), carte).toEqual(['map-summary']);
    }
    for (const type of ['gauge', 'kpi', 'datalist', 'podium']) {
      expect(noms(type, s), type).toEqual([]);
    }
  });

  it('à eux tous, les types écrivent les quatorze attributs du lot', () => {
    const ecrits = new Set<string>();
    const types = ['bar', 'horizontalBar', 'line', 'bar-line', 'pie', 'radar', 'scatter', 'map'];
    for (const type of types) for (const n of noms(type, toutPoser())) ecrits.add(n);
    for (const n of noms('map', { ...toutPoser(), mapSummary: 'value' })) ecrits.add(n);
    expect([...ecrits].sort()).toEqual([...ATTRIBUTS].sort());
  });

  it('barres horizontales : l’axe des valeurs est l’axe X', () => {
    const attrs = lectureAttrs('horizontalBar', toutPoser());
    const valeur = (n: string) => attrs.find((a) => a.name === n)?.value;
    expect(valeur('x-min')).toBe('-5');
    expect(valeur('x-max')).toBe('40');
    expect(valeur('y-min')).toBeUndefined();
    expect(valeur('y-max')).toBeUndefined();
    expect(JSON.parse(valeur('reference-lines')!)).toEqual([
      { axis: 'x', value: 13, label: 'Seuil' },
      { axis: 'y', value: '2022', label: 'Réforme' },
    ]);
  });

  it('une borne illisible n’est pas écrite, l’autre l’est', () => {
    const s = { ...lectureDefaults(), axisMin: 'zéro', axisMax: '1 000,5' };
    expect(lectureAttrs('line', s)).toEqual([{ name: 'y-max', value: '1000.5' }]);
  });
});

describe('lecture.ts : lignes de référence, cibles, couleurs', () => {
  it('seuil sur l’axe des valeurs, repère sur une étiquette', () => {
    expect(
      referenceLinesValue('bar', [
        { kind: 'value', value: '12,5', label: ' Moyenne ' },
        { kind: 'label', value: 'Bretagne', label: '' },
      ])
    ).toEqual([
      { axis: 'y', value: 12.5, label: 'Moyenne' },
      { axis: 'x', value: 'Bretagne' },
    ]);
  });

  it('une ligne incomplète ou illisible est écartée, pas écrite de travers', () => {
    expect(
      referenceLinesValue('line', [
        { kind: 'value', value: '', label: 'Vide' },
        { kind: 'value', value: 'beaucoup', label: 'Texte' },
        { kind: 'label', value: '  ', label: 'Vide' },
      ])
    ).toEqual([]);
  });

  it('nuage de points : le repère d’abscisse est un nombre', () => {
    expect(
      referenceLinesValue('scatter', [
        { kind: 'label', value: '2,5', label: 'X' },
        { kind: 'label', value: 'milieu', label: 'Texte' },
      ])
    ).toEqual([{ axis: 'x', value: 2.5, label: 'X' }]);
  });

  it('un type sans axes n’a ni ligne de référence ni cible', () => {
    const ligne = [{ kind: 'value' as const, value: '1', label: '' }];
    const cible = [{ x: '2030', value: '1', label: '', series: 'line' as const }];
    expect(referenceLinesValue('pie', ligne)).toEqual([]);
    expect(referenceLinesValue('radar', ligne)).toEqual([]);
    expect(targetsValue('bar', cible)).toEqual([]);
    expect(targetsValue('scatter', cible)).toEqual([]);
  });

  it('cible d’une courbe : échéance, valeur, libellé — sans série', () => {
    expect(
      targetsValue('line', [{ x: ' 2030 ', value: '26', label: 'Cible 2030', series: 'bar' }])
    ).toEqual([{ x: '2030', value: 26, label: 'Cible 2030' }]);
  });

  it('cible d’un barres + ligne : la mesure visée devient l’index de série', () => {
    expect(
      targetsValue('bar-line', [
        { x: '2030', value: '26', label: '', series: 'line' },
        { x: '2030', value: '500', label: '', series: 'bar' },
        { x: '', value: '1', label: 'sans échéance', series: 'line' },
        { x: '2031', value: '', label: 'sans valeur', series: 'line' },
      ])
    ).toEqual([
      { x: '2030', value: 26, series: 1 },
      { x: '2030', value: 500, series: 0 },
    ]);
  });

  it('couleurs : grammaire `modalité:#couleur`, séparateurs échappés, doublons écartés', () => {
    expect(
      colorMapValue('bar', [
        { key: 'Réalisé', color: '#000091' },
        { key: 'Île-de-France : cœur, couronne', color: '#E1000F' },
        { key: 'Réalisé', color: '#ffffff' },
        { key: '', color: '#000000' },
        { key: 'Faux', color: 'rouge' },
      ])
    ).toBe('Réalisé:#000091,Île-de-France %3A cœur%2C couronne:#E1000F');
    expect(colorMapValue('map', [{ key: 'Bretagne', color: '#000091' }])).toBe('');
  });

  it('cibles sans zone ni légende : « off » n’est écrit qu’avec une cible', () => {
    const sansCible = { ...lectureDefaults(), targetsZone: false, targetsLegend: false };
    expect(lectureAttrs('line', sansCible)).toEqual([]);
    const avec = {
      ...sansCible,
      targets: [{ x: '2030', value: '26', label: '', series: 'line' as const }],
    };
    expect(noms('line', avec)).toEqual(['targets', 'targets-zone', 'targets-legend']);
    expect(noms('line', { ...avec, targetsZone: true, targetsLegend: true })).toEqual(['targets']);
  });

  it('synthèse d’une carte : somme, aucun chiffre, ou valeur publiée', () => {
    const d = lectureDefaults();
    expect(lectureAttrs('map', { ...d, mapSummary: 'sum' })).toEqual([
      { name: 'map-summary', value: 'sum' },
    ]);
    expect(lectureAttrs('map-reg', { ...d, mapSummary: 'none' })).toEqual([
      { name: 'map-summary', value: 'none' },
    ]);
    expect(lectureAttrs('map', { ...d, mapSummary: 'value', mapSummaryValue: '310 480' })).toEqual([
      { name: 'map-summary-value', value: '310480' },
    ]);
    // Valeur publiée illisible : rien n'est écrit, la moyenne par défaut reste.
    expect(lectureAttrs('map', { ...d, mapSummary: 'value', mapSummaryValue: 'n.c.' })).toEqual([]);
    // Une valeur saisie puis un autre mode choisi : la valeur n'est pas écrite.
    expect(noms('map', { ...d, mapSummary: 'sum', mapSummaryValue: '5,6' })).toEqual([
      'map-summary',
    ]);
  });
});

describe('lecture.ts : état déposé', () => {
  it('un favori enregistré avant #1218 ne porte aucun réglage : tout revient au défaut', () => {
    const ancien = { chartType: 'bar', labelField: 'region', valueField: 'budget', palette: 'x' };
    expect(normalizeLecture(ancien)).toEqual(lectureDefaults());
    expect(normalizeLecture(null)).toEqual(lectureDefaults());
    expect(normalizeLecture('texte')).toEqual(lectureDefaults());
  });

  it('un favori de ce lot revient tel quel', () => {
    expect(normalizeLecture(toutPoser())).toEqual(toutPoser());
    // … y compris après un aller-retour JSON, comme dans sessionStorage.
    expect(normalizeLecture(JSON.parse(JSON.stringify(toutPoser())))).toEqual(toutPoser());
  });

  it('des clés mal formées sont remises en forme, jamais appliquées de travers', () => {
    const propre = normalizeLecture({
      unitTooltip: 12,
      axisMax: 40,
      referenceLines: 'pas une liste',
      targets: [null, 'x', { x: 2030, value: 26 }],
      targetsZone: 'non',
      colorMap: [
        { key: 'A', color: 'javascript:alert(1)' },
        { key: 'B', color: '#ABCDEF' },
      ],
      mapSummary: 'weighted',
    });
    expect(propre.unitTooltip).toBe('12');
    expect(propre.axisMax).toBe('40');
    expect(propre.referenceLines).toEqual([]);
    expect(propre.targets).toEqual([{ x: '2030', value: '26', label: '', series: 'line' }]);
    expect(propre.targetsZone).toBe(true);
    expect(propre.colorMap).toEqual([
      { key: 'A', color: '#000091' },
      { key: 'B', color: '#ABCDEF' },
    ]);
    expect(propre.mapSummary).toBe('');
  });

  it('la liste des clés d’état est celle des valeurs par défaut', () => {
    expect([...LECTURE_KEYS].sort()).toEqual(Object.keys(lectureDefaults()).sort());
    expect(LECTURE_KEYS).toHaveLength(14);
  });
});

// ---------------------------------------------------------------------------
// 2. Code généré
// ---------------------------------------------------------------------------

describe('code généré : rien de posé, rien de changé', () => {
  beforeEach(reinitialiser);

  it('données intégrées : la balise DSFR Chart nue reste, sans aucun attribut du lot', () => {
    expect(usesLibEmbedded()).toBe(false);
    generateChartFromLocalData();
    const c = code();
    expect(c).toContain('<bar-chart id="chart"');
    expect(c).not.toContain('<dsfr-data-chart');
    for (const attribut of ATTRIBUTS) expect(c, attribut).not.toContain(`${attribut}=`);
    // Le repli historique d'une catégorie vide reste « N/A ».
    expect(state.data.map((d) => d.region)).toEqual(['Bretagne', 'Normandie', 'N/A']);
  });

  it.each([
    ['Grist', GRIST, generateDynamicCode],
    ['OpenDataSoft', ODS, generateDynamicCodeForApi],
    ['Tabular', TABULAR, generateDynamicCodeForApi],
    ['API générique', GENERIQUE, generateDynamicCodeForApi],
  ])('%s dynamique : aucun attribut du lot', (_nom, source, generer) => {
    state.generationMode = 'dynamic';
    state.savedSource = source;
    generer();
    const attrs = attributsDuGraphique();
    for (const attribut of ATTRIBUTS) expect(attrs, attribut).not.toHaveProperty(attribut);
  });

  it('un réglage que le type ne lit pas ne change pas le code', () => {
    generateChartFromLocalData();
    const sans = code();
    // Cibles et synthèse de carte : sans objet pour des barres.
    state.targets = [{ x: '2030', value: '26', label: '', series: 'line' }];
    state.mapSummary = 'sum';
    state.xAxisMax = '10';
    state.unitTooltipBar = '€';
    expect(usesLibEmbedded()).toBe(false);
    generateChartFromLocalData();
    expect(code()).toBe(sans);
  });
});

describe('code généré : données intégrées', () => {
  beforeEach(reinitialiser);

  it('un réglage posé fait passer le graphique par la bibliothèque', () => {
    state.unitTooltip = '%';
    expect(usesLibEmbedded()).toBe(true);
    generateChartFromLocalData();
    const c = code();
    expect(c).not.toContain('<bar-chart');
    expect(c).toContain(`<dsfr-data-source id="chart-data" data='`);
    expect(c).toContain('dsfr-data.core.umd.js');
    expect(attributsDuGraphique()).toMatchObject({
      source: 'chart-data',
      type: 'bar',
      'label-field': 'region',
      'value-field': 'value',
      'unit-tooltip': '%',
    });
    // Le compagnon accessible lit la même source.
    expect(c).toContain('<dsfr-data-a11y for="chart" source="chart-data" table download>');
  });

  it('barres : unité, bornes, seuil, couleur, catégorie vide', () => {
    Object.assign(state, {
      unitTooltip: '%',
      axisMin: '-5',
      axisMax: '40',
      referenceLines: [{ kind: 'value', value: '13', label: 'Moyenne' }],
      colorMap: [{ key: 'Bretagne', color: '#e1000f' }],
      emptyLabel: 'Sans région',
    });
    generateChartFromLocalData();
    const attrs = attributsDuGraphique();
    expect(attrs).toMatchObject({
      'unit-tooltip': '%',
      'y-min': '-5',
      'y-max': '40',
      'color-map': 'Bretagne:#e1000f',
      'empty-label': 'Sans région',
    });
    expect(json(attrs['reference-lines'])).toEqual([{ axis: 'y', value: 13, label: 'Moyenne' }]);
    // Catégorie vide : le libellé choisi remplace « N/A » dans les lignes intégrées.
    expect(state.data.map((d) => d.region)).toEqual(['Bretagne', 'Normandie', 'Sans région']);
    expect(code()).toContain('Sans région');
    expect(code()).not.toContain('N/A');
  });

  it('barres horizontales : les bornes vont sur l’axe X', () => {
    state.chartType = 'horizontalBar';
    state.axisMax = '200';
    generateChartFromLocalData();
    const attrs = attributsDuGraphique();
    expect(attrs).toMatchObject({ type: 'bar', 'x-max': '200' });
    expect(attrs).toHaveProperty('horizontal');
    expect(attrs).not.toHaveProperty('y-max');
  });

  it('lignes : cible, sans zone ni légende', () => {
    Object.assign(state, {
      chartType: 'line',
      labelField: 'annee',
      targets: [{ x: '2030', value: '26', label: 'Cible 2030 : 26 %', series: 'line' }],
      targetsZone: false,
      targetsLegend: false,
    });
    generateChartFromLocalData();
    const attrs = attributsDuGraphique();
    expect(json(attrs.targets)).toEqual([{ x: '2030', value: 26, label: 'Cible 2030 : 26 %' }]);
    expect(attrs['targets-zone']).toBe('off');
    expect(attrs['targets-legend']).toBe('off');
  });

  it('barres + ligne : deux unités, cible sur la ligne', () => {
    Object.assign(state, {
      chartType: 'bar-line',
      labelField: 'annee',
      lineField: 'taux',
      unitTooltip: '%',
      unitTooltipBar: 'M€',
      targets: [{ x: '2030', value: '26', label: '', series: 'line' }],
    });
    generateChartFromLocalData();
    const attrs = attributsDuGraphique();
    expect(attrs).toMatchObject({
      type: 'bar-line',
      'unit-tooltip': '%',
      'unit-tooltip-bar': 'M€',
    });
    expect(json(attrs.targets)).toEqual([{ x: '2030', value: 26, series: 1 }]);
  });

  it('camembert : couleurs fixées et unité', () => {
    Object.assign(state, {
      chartType: 'pie',
      unitTooltip: 'agents',
      colorMap: [
        { key: 'Bretagne', color: '#000091' },
        { key: 'Normandie', color: '#e1000f' },
      ],
    });
    generateChartFromLocalData();
    const attrs = attributsDuGraphique();
    expect(attrs).toMatchObject({
      type: 'pie',
      'unit-tooltip': 'agents',
      'color-map': 'Bretagne:#000091,Normandie:#e1000f',
      'selected-palette': 'categorical',
    });
    expect(attrs).toHaveProperty('fill');
  });

  it('carte départementale : la somme passe par la bibliothèque, plus de moyenne calculée', () => {
    Object.assign(state, {
      chartType: 'map',
      labelField: '',
      codeField: 'dep',
      valueField: 'licences',
      palette: 'sequentialAscending',
      localData: [
        { dep: '75', licences: 1200 },
        { dep: '13', licences: 800 },
      ],
      fields: [
        { name: 'dep', type: 'string', sample: '75' },
        { name: 'licences', type: 'number', sample: 1200 },
      ],
      mapSummary: 'sum',
    });
    generateChartFromLocalData();
    const c = code();
    expect(c).not.toContain('<map-chart');
    expect(attributsDuGraphique()).toMatchObject({
      type: 'map',
      'code-field': 'dep',
      'value-field': 'value',
      'map-summary': 'sum',
    });
  });

  it('carte : sans réglage, la balise DSFR Chart nue et sa moyenne restent', () => {
    Object.assign(state, {
      chartType: 'map',
      labelField: '',
      codeField: 'dep',
      valueField: 'licences',
      localData: [
        { dep: '75', licences: 1200 },
        { dep: '13', licences: 800 },
      ],
    });
    generateChartFromLocalData();
    expect(code()).toContain('<map-chart id="chart"');
    expect(code()).toContain('value="1000"');
  });

  it('API intégrée : les lignes agrégées déjà chargées sont intégrées, avec le réglage', () => {
    state.data = [
      { region: 'Bretagne', value: 150 },
      { region: null, value: 20 },
    ];
    state.emptyLabel = 'Sans région';
    state.axisMax = '200';
    generateCode('https://data.exemple.fr/api/records?select=region');
    const c = code();
    expect(c).not.toContain('fetch(');
    expect(attributsDuGraphique()).toMatchObject({
      source: 'chart-data',
      'empty-label': 'Sans région',
      'y-max': '200',
    });
  });

  it('une valeur saisie ne casse pas le balisage', () => {
    state.unitTooltip = '"><script>alert(1)</script>';
    state.referenceLines = [{ kind: 'value', value: '1', label: `l'objectif "A" <b>` }];
    generateChartFromLocalData();
    const c = code();
    expect(c).not.toContain('<script>alert(1)</script>');
    expect(c).toContain('unit-tooltip="&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;"');
    const attrs = attributsDuGraphique();
    expect(json(attrs['reference-lines'])).toEqual([
      { axis: 'y', value: 1, label: `l'objectif "A" <b>` },
    ]);
  });
});

describe('code généré : chargement dynamique', () => {
  beforeEach(() => {
    reinitialiser();
    state.generationMode = 'dynamic';
    Object.assign(state, toutPoser());
  });

  it.each([
    ['Grist', GRIST, generateDynamicCode],
    ['OpenDataSoft', ODS, generateDynamicCodeForApi],
    ['Tabular', TABULAR, generateDynamicCodeForApi],
    ['API générique', GENERIQUE, generateDynamicCodeForApi],
  ])(
    '%s : barres — unité, bornes, seuil et repère, couleur, catégorie vide',
    (_n, source, generer) => {
      state.savedSource = source;
      generer();
      const attrs = attributsDuGraphique();
      expect(attrs).toMatchObject({
        type: 'bar',
        'unit-tooltip': '%',
        'y-min': '-5',
        'y-max': '40',
        'color-map': 'Bretagne:#e1000f',
        'empty-label': 'Sans région',
      });
      expect(json(attrs['reference-lines'])).toEqual([
        { axis: 'y', value: 13, label: 'Seuil' },
        { axis: 'x', value: '2022', label: 'Réforme' },
      ]);
      // Ce que des barres ne lisent pas n'est pas écrit.
      for (const absent of ['targets', 'x-min', 'unit-tooltip-bar', 'map-summary']) {
        expect(attrs, absent).not.toHaveProperty(absent);
      }
      // La requête n'est pas touchée : les réglages de lecture ne changent pas la donnée.
      expect(code()).toContain('<dsfr-data-source');
    }
  );

  it.each([
    ['Grist', GRIST, generateDynamicCode],
    ['OpenDataSoft', ODS, generateDynamicCodeForApi],
    ['Tabular', TABULAR, generateDynamicCodeForApi],
    ['API générique', GENERIQUE, generateDynamicCodeForApi],
  ])('%s : lignes — cible, zone et légende', (_n, source, generer) => {
    state.savedSource = source;
    state.chartType = 'line';
    generer();
    const attrs = attributsDuGraphique();
    expect(json(attrs.targets)).toEqual([{ x: '2030', value: 26, label: 'Cible 2030' }]);
    expect(attrs).toMatchObject({ 'targets-zone': 'off', 'targets-legend': 'off' });
  });

  it.each([
    ['Grist', GRIST, generateDynamicCode],
    ['OpenDataSoft', ODS, generateDynamicCodeForApi],
    ['Tabular', TABULAR, generateDynamicCodeForApi],
    ['API générique', GENERIQUE, generateDynamicCodeForApi],
  ])('%s : barres + ligne — deux unités, cible sur la ligne', (_n, source, generer) => {
    state.savedSource = source;
    state.chartType = 'bar-line';
    state.lineField = 'taux';
    generer();
    const attrs = attributsDuGraphique();
    expect(attrs).toMatchObject({ 'unit-tooltip': '%', 'unit-tooltip-bar': '€' });
    expect(json(attrs.targets)).toEqual([{ x: '2030', value: 26, series: 1, label: 'Cible 2030' }]);
    expect(attrs).not.toHaveProperty('y-max');
  });

  it.each([
    ['Grist', GRIST, generateDynamicCode],
    ['OpenDataSoft', ODS, generateDynamicCodeForApi],
    ['Tabular', TABULAR, generateDynamicCodeForApi],
    ['API générique', GENERIQUE, generateDynamicCodeForApi],
  ])('%s : nuage — les deux axes bornés', (_n, source, generer) => {
    state.savedSource = source;
    state.chartType = 'scatter';
    generer();
    expect(attributsDuGraphique()).toMatchObject({
      'x-min': '0',
      'x-max': '10',
      'y-min': '-5',
      'y-max': '40',
    });
  });

  it.each([
    ['Grist', GRIST, generateDynamicCode],
    ['OpenDataSoft', ODS, generateDynamicCodeForApi],
    ['Tabular', TABULAR, generateDynamicCodeForApi],
    ['API générique', GENERIQUE, generateDynamicCodeForApi],
  ])('%s : carte — somme, puis valeur publiée', (_n, source, generer) => {
    state.savedSource = source;
    state.chartType = 'map-reg';
    state.codeField = 'region';
    state.palette = 'sequentialAscending';
    generer();
    let attrs = attributsDuGraphique();
    expect(attrs).toMatchObject({ type: 'map-reg', 'map-summary': 'sum' });
    for (const absent of ['unit-tooltip', 'color-map', 'reference-lines', 'empty-label']) {
      expect(attrs, absent).not.toHaveProperty(absent);
    }
    state.mapSummary = 'value';
    generer();
    attrs = attributsDuGraphique();
    expect(attrs['map-summary-value']).toBe('5.6');
    expect(attrs).not.toHaveProperty('map-summary');
  });

  it('podium, KPI, jauge, tableau : aucun attribut du lot dans le code', () => {
    state.savedSource = GENERIQUE;
    for (const type of ['podium', 'kpi', 'gauge', 'datalist'] as ChartType[]) {
      state.chartType = type;
      generateDynamicCodeForApi();
      for (const attribut of ATTRIBUTS)
        expect(code(), `${type} ${attribut}`).not.toContain(`${attribut}=`);
    }
  });
});

// ---------------------------------------------------------------------------
// 3. Instantané, réouverture, formulaire
// ---------------------------------------------------------------------------

describe('enregistrement et réouverture', () => {
  beforeEach(reinitialiser);

  it('l’instantané porte les quatorze réglages', () => {
    Object.assign(state, toutPoser());
    expect(getBuilderStateToSave()).toMatchObject(toutPoser());
  });

  it('un instantané rouvert rend les mêmes réglages', () => {
    Object.assign(state, toutPoser());
    const depose = JSON.parse(JSON.stringify(getBuilderStateToSave())) as Record<string, unknown>;
    Object.assign(state, lectureDefaults());
    restoreLecture(depose);
    expect(state).toMatchObject(toutPoser());
  });

  it('un favori d’avant #1218 efface les réglages de la session, et génère le code d’avant', () => {
    generateChartFromLocalData();
    const avant = code();
    // La session en cours porte des réglages…
    Object.assign(state, toutPoser());
    generateChartFromLocalData();
    expect(code()).not.toBe(avant);
    // … un ancien favori (aucune clé du lot) est rouvert : ils ne lui sont pas prêtés.
    restoreLecture({ chartType: 'bar', labelField: 'region', valueField: 'budget' });
    for (const cle of LECTURE_KEYS) expect(state[cle], cle).toEqual(lectureDefaults()[cle]);
    generateChartFromLocalData();
    expect(code()).toBe(avant);
  });
});

describe('formulaire : contrôles affichés par type, saisie, réouverture', () => {
  /** Section « Apparence » du vrai `index.html`. */
  function sectionApparence(): string {
    const html = readFileSync(join(RACINE, 'apps/builder/index.html'), 'utf-8');
    const debut = html.indexOf('<div class="config-section collapsed" id="section-appearance"');
    const fin = html.indexOf('<div class="advanced-group-label">', debut);
    expect(debut, 'section Apparence introuvable').toBeGreaterThan(-1);
    return html.slice(debut, fin);
  }

  beforeEach(() => {
    reinitialiser();
    document.body.innerHTML = sectionApparence();
    setupLectureListeners();
  });

  const affiche = (id: string): boolean => {
    for (let n = document.getElementById(id); n; n = n.parentElement) {
      if (n.style.display === 'none') return false;
    }
    return document.getElementById(id) !== null;
  };

  const CONTROLES: Record<keyof ReturnType<typeof lectureApplicability>, string> = {
    unit: 'chart-unit',
    unitBar: 'chart-unit-bar',
    axisBounds: 'axis-min',
    xBounds: 'x-axis-min',
    referenceLines: 'add-reference-line-btn',
    targets: 'add-target-btn',
    colorMap: 'add-color-map-btn',
    emptyLabel: 'empty-label',
    mapSummary: 'map-summary',
  };

  it.each([
    'bar',
    'horizontalBar',
    'line',
    'pie',
    'doughnut',
    'radar',
    'scatter',
    'gauge',
    'kpi',
    'map',
    'datalist',
    'podium',
    'bar-line',
    'map-reg',
    'map-aca',
    'map-monde',
  ] as ChartType[])('%s : seuls les réglages que le type lit sont affichés', (type) => {
    selectChartType(type);
    const attendu = lectureApplicability(type);
    for (const [reglage, id] of Object.entries(CONTROLES)) {
      expect(affiche(id), `${type} › ${reglage}`).toBe(attendu[reglage as keyof typeof attendu]);
    }
  });

  it('barres + ligne : l’unité générale devient celle de la ligne', () => {
    selectChartType('bar-line');
    expect(document.querySelector('label[for="chart-unit"]')!.textContent).toContain(
      'Unité de la ligne'
    );
    selectChartType('bar');
    expect(document.querySelector('label[for="chart-unit"]')!.textContent).toMatch(/^Unité/);
    expect(document.querySelector('label[for="chart-unit"]')!.textContent).not.toContain('ligne');
  });

  it('la saisie met l’état à jour', () => {
    const saisir = (id: string, valeur: string) => {
      const input = document.getElementById(id) as HTMLInputElement;
      input.value = valeur;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    };
    saisir('chart-unit', '%');
    saisir('empty-label', 'Sans région');
    saisir('axis-max', '40');
    expect(state).toMatchObject({ unitTooltip: '%', emptyLabel: 'Sans région', axisMax: '40' });

    const synthese = document.getElementById('map-summary') as HTMLSelectElement;
    selectChartType('map');
    expect(affiche('map-summary-value')).toBe(false);
    synthese.value = 'value';
    synthese.dispatchEvent(new Event('change', { bubbles: true }));
    expect(state.mapSummary).toBe('value');
    expect(affiche('map-summary-value')).toBe(true);
  });

  it('éditeurs de lignes : ajouter, saisir, supprimer', () => {
    selectChartType('line');
    document.getElementById('add-reference-line-btn')!.click();
    document.getElementById('add-reference-line-btn')!.click();
    expect(state.referenceLines).toHaveLength(2);
    const valeur = document.getElementById('reference-value-1') as HTMLInputElement;
    valeur.value = '13';
    valeur.dispatchEvent(new Event('input', { bubbles: true }));
    const position = document.getElementById('reference-kind-1') as HTMLSelectElement;
    position.value = 'label';
    position.dispatchEvent(new Event('change', { bubbles: true }));
    expect(state.referenceLines[1]).toEqual({ kind: 'label', value: '13', label: '' });
    // Supprimer la première : la seconde garde sa saisie et prend le rang 0.
    document
      .querySelector<HTMLElement>('#reference-lines-container [data-action="remove"]')!
      .click();
    expect(state.referenceLines).toEqual([{ kind: 'label', value: '13', label: '' }]);
    expect((document.getElementById('reference-value-0') as HTMLInputElement).value).toBe('13');

    // Cibles : la zone et la légende n'apparaissent qu'avec une cible.
    expect(affiche('targets-zone')).toBe(false);
    document.getElementById('add-target-btn')!.click();
    expect(state.targets).toEqual([{ x: '', value: '', label: '', series: 'line' }]);
    expect(affiche('targets-zone')).toBe(true);
    const zone = document.getElementById('targets-zone') as HTMLInputElement;
    zone.checked = false;
    zone.dispatchEvent(new Event('change', { bubbles: true }));
    expect(state.targetsZone).toBe(false);

    // Couleurs
    document.getElementById('add-color-map-btn')!.click();
    expect(state.colorMap).toEqual([{ key: '', color: '#000091' }]);
  });

  it('cible : la mesure n’est proposée que pour un barres + ligne', () => {
    state.targets = [{ x: '2030', value: '26', label: '', series: 'bar' }];
    selectChartType('line');
    expect(affiche('target-series-0')).toBe(false);
    selectChartType('bar-line');
    expect(affiche('target-series-0')).toBe(true);
    expect((document.getElementById('target-series-0') as HTMLSelectElement).value).toBe('bar');
  });

  it('réouverture : les contrôles reprennent l’état, les divulgations se déplient', () => {
    Object.assign(state, toutPoser(), { chartType: 'line' });
    syncLectureControls();
    const v = (id: string) => (document.getElementById(id) as HTMLInputElement).value;
    expect(v('chart-unit')).toBe('%');
    expect(v('empty-label')).toBe('Sans région');
    expect(v('axis-min')).toBe('-5');
    expect(v('axis-max')).toBe('40');
    expect(v('reference-value-0')).toBe('13');
    expect(v('reference-kind-1')).toBe('label');
    expect(v('target-x-0')).toBe('2030');
    expect(v('color-map-key-0')).toBe('Bretagne');
    expect(v('color-map-color-0')).toBe('#e1000f');
    expect(v('map-summary')).toBe('sum');
    expect((document.getElementById('targets-zone') as HTMLInputElement).checked).toBe(false);
    expect((document.getElementById('axes-details') as HTMLDetailsElement).open).toBe(true);
    expect((document.getElementById('color-map-details') as HTMLDetailsElement).open).toBe(true);
  });

  it('réouverture d’un ancien favori : contrôles vides, divulgations repliées', () => {
    restoreLecture({ chartType: 'bar' });
    syncLectureControls();
    const v = (id: string) => (document.getElementById(id) as HTMLInputElement).value;
    for (const id of ['chart-unit', 'empty-label', 'axis-min', 'axis-max', 'map-summary']) {
      expect(v(id), id).toBe('');
    }
    expect(document.querySelectorAll('.lecture-row')).toHaveLength(0);
    expect((document.getElementById('axes-details') as HTMLDetailsElement).open).toBe(false);
    expect((document.getElementById('color-map-details') as HTMLDetailsElement).open).toBe(false);
  });

  it('une valeur rouverte ne peut pas injecter de balisage dans le volet', () => {
    state.referenceLines = [{ kind: 'value', value: '"><img src=x onerror=alert(1)>', label: '' }];
    syncLectureControls();
    expect(document.querySelector('#reference-lines-container img')).toBeNull();
    expect((document.getElementById('reference-value-0') as HTMLInputElement).value).toBe(
      '"><img src=x onerror=alert(1)>'
    );
  });

  it('noms proposés pour une couleur : séries, puis étiquettes des données générées', () => {
    Object.assign(state, {
      valueFieldLabel: 'Réalisé',
      extraSeries: [{ field: 'taux', label: 'Objectif' }],
      data: [
        { region: 'Bretagne', value: 1 },
        { region: 'Normandie', value: 2 },
      ],
    });
    expect(colorSuggestions()).toEqual(['Réalisé', 'Objectif', 'Bretagne', 'Normandie']);
    // Une seule série : la légende la nomme par le titre du graphique.
    state.extraSeries = [];
    expect(colorSuggestions()).toEqual(['Mon graphique', 'Bretagne', 'Normandie']);
    // Camembert : seules les parts se colorent.
    state.chartType = 'pie';
    expect(colorSuggestions()).toEqual(['Bretagne', 'Normandie']);
  });
});
