/**
 * Formes ajoutées au Builder par #1204 : podium et barres + ligne.
 *
 * La bibliothèque les rendait déjà (`dsfr-data-podium`, `type="bar-line"`) ; le
 * Builder ne les proposait pas. Ces tests portent sur le CODE généré, dans les
 * quatre chemins du générateur : données locales intégrées, API intégrée,
 * chargement dynamique Grist, chargement dynamique API (OpenDataSoft, Tabular,
 * générique).
 *
 * Preuves de mutation (faites à la main, défaut retiré ensuite) :
 * - retirer le cas `bar-line` de `tracedExtraSeries` (state.ts) : les cas
 *   « barres + ligne » rougissent (plus de `value-field-2`, plus de `value2`) ;
 * - retirer la branche `podium` de `visualElement` (code-generator.ts) : les cas
 *   podium rougissent (le code écrit un `dsfr-data-chart type="podium"`) ;
 * - retirer `lineField` de `getBuilderStateToSave` (ui-helpers.ts) : le cas
 *   « instantané » rougit.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  generateChartFromLocalData,
  generateCode,
  generateDynamicCode,
  generateDynamicCodeForApi,
  effectivePalette,
  podiumPlaces,
} from '../../../apps/builder/src/ui/code-generator';
import { getBuilderStateToSave } from '../../../apps/builder/src/ui/ui-helpers';
import { selectChartType } from '../../../apps/builder/src/ui/chart-type-selector';
import {
  state,
  getCompleteness,
  tracedExtraSeries,
  supportsMultiSeries,
  PODIUM_PLACES_DEFAUT,
  type BuilderState,
} from '../../../apps/builder/src/state';

vi.mock('../../../apps/builder/src/ui/accessible-table', () => ({
  updateAccessibleTable: vi.fn(),
}));

const LIGNES = [
  { region: 'Bretagne', budget: 100, taux: 10 },
  { region: 'Bretagne', budget: 50, taux: 20 },
  { region: 'Normandie', budget: 80, taux: 30 },
  { region: 'Occitanie', budget: 20, taux: 5 },
];

const CHAMPS = [
  { name: 'region', type: 'string', sample: 'Bretagne' },
  { name: 'budget', type: 'number', sample: 100 },
  { name: 'taux', type: 'number', sample: 10 },
];

/** Champs tels que décrits pour une source Grist non aplatie (`fields.X`). */
const CHAMPS_GRIST = CHAMPS.map((c) => ({ ...c, fullPath: `fields.${c.name}` }));

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
    podiumMaxItems: PODIUM_PLACES_DEFAUT,
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
  } satisfies Partial<BuilderState>);
  document.body.innerHTML = '<div id="generated-code"></div><div id="raw-data"></div>';
}

const code = (): string => document.getElementById('generated-code')!.textContent!;

/** Lignes écrites dans `<dsfr-data-source data='…'>` du code intégré. */
function lignesIntegrees(): Record<string, unknown>[] {
  const m = /<dsfr-data-source id="chart-data" data='([^']*)'/.exec(code());
  expect(m, 'source intégrée introuvable').not.toBeNull();
  const brut = m![1]
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
  return JSON.parse(brut) as Record<string, unknown>[];
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

describe('état : complétude et séries tracées', () => {
  beforeEach(reinitialiser);

  it('barres + ligne : la configuration est incomplète sans le champ de la ligne', () => {
    state.chartType = 'bar-line';
    const avant = getCompleteness(state);
    expect(avant.config).toBe(false);
    expect(avant.missing).toEqual(['le champ de la ligne']);
    state.lineField = 'taux';
    expect(getCompleteness(state).config).toBe(true);
  });

  it('podium : libellé et valeur suffisent', () => {
    state.chartType = 'podium';
    expect(getCompleteness(state).config).toBe(true);
    state.valueField = '';
    expect(getCompleteness(state).missing).toEqual(['le champ Valeur à mesurer']);
  });

  it('barres + ligne trace exactement une série en plus, la ligne ; pas celles du formulaire', () => {
    state.chartType = 'bar-line';
    state.extraSeries = [{ field: 'budget', label: 'Autre' }];
    expect(tracedExtraSeries(state)).toEqual([]);
    state.lineField = 'taux';
    state.lineFieldLabel = 'Taux';
    expect(tracedExtraSeries(state)).toEqual([{ field: 'taux', label: 'Taux' }]);
    // Le bouton « Ajouter une série » ne vaut pas pour ces formes.
    expect(supportsMultiSeries('bar-line')).toBe(false);
    expect(supportsMultiSeries('podium')).toBe(false);
  });

  it('podium : aucune série en plus', () => {
    state.chartType = 'podium';
    state.extraSeries = [{ field: 'taux', label: '' }];
    state.lineField = 'taux';
    expect(tracedExtraSeries(state)).toEqual([]);
  });

  it('nombre de places : borné entre 1 et 20, sinon le défaut de la bibliothèque', () => {
    state.podiumMaxItems = 3;
    expect(podiumPlaces()).toBe(3);
    for (const hors of [0, -2, 21, Number.NaN]) {
      state.podiumMaxItems = hors;
      expect(podiumPlaces()).toBe(PODIUM_PLACES_DEFAUT);
    }
  });

  it('podium : seules les échelles colorent les rangs', () => {
    state.chartType = 'podium';
    state.palette = 'categorical';
    expect(effectivePalette()).toBe('sequentialDescending');
    state.palette = 'divergentAscending';
    expect(effectivePalette()).toBe('divergentAscending');
  });
});

describe('podium : code généré', () => {
  beforeEach(() => {
    reinitialiser();
    state.chartType = 'podium';
    state.podiumMaxItems = 3;
  });

  it('données locales intégrées : source en ligne puis dsfr-data-podium', () => {
    generateChartFromLocalData();
    const c = code();
    expect(c).toContain('<dsfr-data-podium');
    expect(c).not.toContain('<dsfr-data-chart');
    expect(c).toContain('source="chart-data"');
    expect(c).toContain('label-field="region"');
    expect(c).toContain('value-field="value"');
    expect(c).toContain('max-items="3"');
    expect(c).toContain('selected-palette="sequentialDescending"');
    expect(c).toContain('dsfr-data.core.umd.js');
    // Un podium ne charge pas DSFR Chart.
    expect(c).not.toContain('dsfr-chart');
    expect(lignesIntegrees()).toEqual([
      { region: 'Bretagne', value: 150 },
      { region: 'Normandie', value: 80 },
      { region: 'Occitanie', value: 20 },
    ]);
  });

  it('compagnon accessible : il lit la même source que le podium', () => {
    generateChartFromLocalData();
    expect(code()).toContain('<dsfr-data-a11y for="chart" source="chart-data" table download>');
    state.a11yEnabled = false;
    generateChartFromLocalData();
    expect(code()).not.toContain('<dsfr-data-a11y');
  });

  it('API intégrée : les lignes agrégées déjà chargées sont intégrées, sans script de chargement', () => {
    state.data = [
      { region: 'Bretagne', value: 150.456 },
      { region: 'Normandie', value: 80 },
    ];
    generateCode('https://data.exemple.fr/api/records?select=region');
    const c = code();
    expect(c).toContain('<dsfr-data-podium');
    expect(c).not.toContain('fetch(');
    expect(lignesIntegrees()).toEqual([
      { region: 'Bretagne', value: 150.46 },
      { region: 'Normandie', value: 80 },
    ]);
  });

  it('Grist dynamique : source, requête, podium', () => {
    state.generationMode = 'dynamic';
    state.savedSource = GRIST;
    generateDynamicCode();
    const c = code();
    expect(c).toContain('group-by="fields.region"');
    expect(c).toContain('aggregate="fields.budget:sum"');
    expect(c).toMatch(
      /<dsfr-data-podium\s+id="chart"\s+source="query-data"\s+label-field="fields.region"\s+value-field="fields.budget__sum"\s+max-items="3"/
    );
    expect(c).not.toContain('<dsfr-data-chart');
    expect(c).toContain('<dsfr-data-a11y for="chart" source="query-data"');
  });

  it.each([
    ['OpenDataSoft', ODS, 'budget__sum'],
    ['Tabular', TABULAR, 'budget__sum'],
    ['API générique', GENERIQUE, 'budget__sum'],
  ])('%s dynamique : podium sur la colonne agrégée', (_nom, source, colonne) => {
    state.generationMode = 'dynamic';
    state.savedSource = source;
    generateDynamicCodeForApi();
    const c = code();
    expect(c).toContain('<dsfr-data-podium');
    expect(c).toContain('label-field="region"');
    expect(c).toContain(`value-field="${colonne}"`);
    expect(c).toContain('max-items="3"');
    expect(c).not.toContain('<dsfr-data-chart');
  });
});

describe('barres + ligne : code généré', () => {
  beforeEach(() => {
    reinitialiser();
    state.chartType = 'bar-line';
    state.lineField = 'taux';
    state.valueFieldLabel = 'Budget';
    state.lineFieldLabel = 'Taux';
  });

  it('données locales intégrées : deux mesures agrégées, type bar-line, value-field-2', () => {
    generateChartFromLocalData();
    const c = code();
    expect(c).toContain('type="bar-line"');
    expect(c).toContain('label-field="region"');
    expect(c).toContain('value-field="value:Budget"');
    expect(c).toContain('value-field-2="value2:Taux"');
    expect(c).not.toContain('value-fields=');
    // name-bar puis name-line côté bibliothèque.
    expect(c).toContain(`name='["Budget","Taux"]'`);
    expect(c).toContain('dsfr-chart');
    expect(lignesIntegrees()).toEqual([
      { region: 'Bretagne', value: 150, value2: 30 },
      { region: 'Normandie', value: 80, value2: 30 },
      { region: 'Occitanie', value: 20, value2: 5 },
    ]);
  });

  it('sans libellé saisi : pas d’alias, les noms de champs nomment les séries', () => {
    state.valueFieldLabel = '';
    state.lineFieldLabel = '';
    generateChartFromLocalData();
    const c = code();
    expect(c).toContain('value-field="value"');
    expect(c).toContain('value-field-2="value2"');
    expect(c).toContain(`name='["budget","taux"]'`);
  });

  it('API intégrée : même balisage, sur les lignes déjà agrégées', () => {
    state.data = [{ region: 'Bretagne', value: 150, value2: 15 }];
    generateCode('https://data.exemple.fr/api/records');
    const c = code();
    expect(c).toContain('type="bar-line"');
    expect(c).toContain('value-field-2="value2:Taux"');
    expect(c).not.toContain('fetch(');
  });

  it('Grist dynamique : la requête agrège les deux mesures', () => {
    state.generationMode = 'dynamic';
    state.savedSource = GRIST;
    state.fields = CHAMPS_GRIST;
    generateDynamicCode();
    const c = code();
    expect(c).toContain('aggregate="fields.budget:sum, fields.taux:sum"');
    expect(c).toContain('type="bar-line"');
    expect(c).toContain('value-field="fields.budget__sum:Budget"');
    expect(c).toContain('value-field-2="fields.taux__sum:Taux"');
    expect(c).not.toContain('value-fields=');
    expect(c).toContain(`name='["Budget","Taux"]'`);
  });

  it('OpenDataSoft dynamique : les deux agrégats sont sélectionnés', () => {
    state.generationMode = 'dynamic';
    state.savedSource = ODS;
    generateDynamicCodeForApi();
    const c = code();
    expect(c).toContain('sum(budget) as budget__sum, sum(taux) as taux__sum');
    expect(c).toContain('value-field-2="taux__sum:Taux"');
  });

  it.each([
    ['Tabular', TABULAR],
    ['API générique', GENERIQUE],
  ])('%s dynamique : value-field-2 sur la seconde colonne agrégée', (_nom, source) => {
    state.generationMode = 'dynamic';
    state.savedSource = source;
    generateDynamicCodeForApi();
    const c = code();
    expect(c).toContain('type="bar-line"');
    expect(c).toContain('value-field-2="taux__sum:Taux"');
    expect(c).not.toContain('value-fields=');
  });

  it('requête avancée : deux agrégats au plus sont tracés', () => {
    state.generationMode = 'dynamic';
    state.savedSource = GENERIQUE;
    state.advancedMode = true;
    state.queryAggregate = 'budget:sum:total, taux:avg:moyenne, budget:max:pic';
    generateDynamicCodeForApi();
    const c = code();
    expect(c).toContain('value-field-2="moyenne"');
    expect(c).not.toContain('value-fields=');
    expect(c).toContain(`name='["total","moyenne"]'`);
  });
});

describe('enregistrement et réouverture', () => {
  beforeEach(reinitialiser);

  it('l’instantané porte les réglages des deux formes', () => {
    state.chartType = 'bar-line';
    state.lineField = 'taux';
    state.lineFieldLabel = 'Taux';
    state.podiumMaxItems = 7;
    const instantane = JSON.parse(JSON.stringify(getBuilderStateToSave())) as Record<
      string,
      unknown
    >;
    expect(instantane).toMatchObject({
      chartType: 'bar-line',
      lineField: 'taux',
      lineFieldLabel: 'Taux',
      podiumMaxItems: 7,
    });
  });
});

describe('sélecteur de type : contrôles affichés', () => {
  beforeEach(() => {
    reinitialiser();
    document.body.innerHTML = `
      <button class="chart-type-btn" data-type="bar"></button>
      <button class="chart-type-btn" data-type="bar-line"></button>
      <button class="chart-type-btn" data-type="podium"></button>
      <div class="fr-select-group"><label for="label-field"></label><select id="label-field"></select></div>
      <div class="fr-select-group"><label for="value-field"></label><select id="value-field"></select></div>
      <div id="line-field-group" style="display:none"></div>
      <div id="podium-config" style="display:none"></div>
      <div id="extra-series-group"><div id="extra-series-container"></div></div>
      <div class="fr-select-group"><select id="sort-order"></select></div>
      <div id="section-databox"></div>
      <div id="palette-config"><select id="chart-palette">
        <option value="default"></option><option value="sequentialDescending"></option>
      </select><div id="palette-swatches"></div><p id="palette-note" hidden></p></div>
    `;
  });

  const affiche = (id: string): boolean => document.getElementById(id)!.style.display !== 'none';

  it('barres + ligne : la seconde mesure s’affiche, pas « Ajouter une série »', () => {
    selectChartType('bar-line');
    expect(affiche('line-field-group')).toBe(true);
    expect(affiche('podium-config')).toBe(false);
    expect(affiche('extra-series-group')).toBe(false);
    expect(document.querySelector('[data-type="bar-line"]')!.getAttribute('aria-pressed')).toBe(
      'true'
    );
    expect(document.querySelector('label[for="value-field"]')!.textContent).toContain(
      'Valeur des barres'
    );
  });

  it('podium : nombre de places, palette en dégradé, ni tri ni cadre officiel', () => {
    selectChartType('podium');
    expect(affiche('podium-config')).toBe(true);
    expect(affiche('line-field-group')).toBe(false);
    expect(state.palette).toBe('sequentialDescending');
    expect(affiche('section-databox')).toBe(false);
    expect(
      (document.getElementById('sort-order')!.closest('.fr-select-group') as HTMLElement).style
        .display
    ).toBe('none');
  });

  it('retour à un type historique : les contrôles des formes disparaissent', () => {
    selectChartType('podium');
    selectChartType('bar');
    expect(affiche('podium-config')).toBe(false);
    expect(affiche('line-field-group')).toBe(false);
    expect(affiche('extra-series-group')).toBe(true);
  });
});
