/**
 * Format long (`series-field`) et barres empilées (`stacked`) dans le Builder
 * (#1204).
 *
 * Format long : chaque ligne porte une étiquette, une série et une valeur ; un
 * champ nomme la série. C'est l'autre écriture des séries multiples, exclusive
 * avec « Ajouter une série » (une colonne par série). Le Builder regroupe alors
 * par étiquette ET par série, et laisse `dsfr-data-chart` pivoter.
 *
 * Preuves de mutation (faites à la main, défaut retiré ensuite) :
 * - `withSeriesGroup` qui rend toujours `groupBy` (code-generator.ts) : les
 *   regroupements dynamiques rougissent ;
 * - retirer `if (activeSeriesField(s)) return [];` de `tracedExtraSeries`
 *   (state.ts) : « exclusif avec les séries du formulaire » rougit ;
 * - `STACKED_TYPES` étendu à `'line'` (state.ts) : « réservé aux barres » rougit.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
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
  refreshFormesSelects,
  setupFormesListeners,
  syncFormesControls,
} from '../../../apps/builder/src/ui/formes';
import {
  state,
  activeSeriesField,
  stackedActive,
  tracedExtraSeries,
  PODIUM_PLACES_DEFAUT,
  type BuilderState,
  type ChartType,
} from '../../../apps/builder/src/state';

vi.mock('../../../apps/builder/src/ui/accessible-table', () => ({
  updateAccessibleTable: vi.fn(),
}));

/** Format long : une ligne par année et par filière. */
const LIGNES = [
  { annee: '2023', filiere: 'Bois', production: 10 },
  { annee: '2023', filiere: 'Bois', production: 5 },
  { annee: '2023', filiere: 'Solaire', production: 7 },
  { annee: '2024', filiere: 'Bois', production: 12 },
  { annee: '2024', filiere: 'Solaire', production: 9 },
];

const CHAMPS = [
  { name: 'annee', type: 'string', sample: '2023' },
  { name: 'filiere', type: 'string', sample: 'Bois' },
  { name: 'production', type: 'number', sample: 10 },
];

function reinitialiser(): void {
  Object.assign(state, {
    chartType: 'bar',
    labelField: 'annee',
    labelFieldLabel: '',
    valueField: 'production',
    valueFieldLabel: '',
    valueField2: '',
    extraSeries: [],
    lineField: '',
    lineFieldLabel: '',
    podiumMaxItems: PODIUM_PLACES_DEFAUT,
    seriesField: 'filiere',
    stacked: false,
    codeField: '',
    aggregation: 'sum',
    sortOrder: 'none',
    sortField: '',
    title: 'Production',
    subtitle: '',
    palette: 'categorical',
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
  name: 'Énergie Grist',
  type: 'grist' as const,
  apiUrl: 'https://docs.getgrist.com/api/docs/doc1/tables/Energie/records',
  documentId: 'doc1',
  tableId: 'Energie',
};
const ODS = {
  id: 'o1',
  name: 'Énergie ODS',
  type: 'api' as const,
  apiUrl: 'https://data.exemple.fr/api/explore/v2.1/catalog/datasets/energie/records',
};
const TABULAR = {
  id: 't1',
  name: 'Énergie Tabular',
  type: 'api' as const,
  apiUrl: 'https://tabular-api.data.gouv.fr/api/resources/abc-123/data/',
};
const GENERIQUE = {
  id: 'a1',
  name: 'Énergie API',
  type: 'api' as const,
  apiUrl: 'https://api.exemple.fr/energie',
};

describe('format long : état', () => {
  beforeEach(reinitialiser);

  it('vaut pour les barres, les lignes et le radar ; ignoré ailleurs', () => {
    for (const type of ['bar', 'horizontalBar', 'line', 'radar'] as ChartType[]) {
      state.chartType = type;
      expect(activeSeriesField(state), type).toBe('filiere');
    }
    for (const type of ['pie', 'scatter', 'map', 'podium', 'bar-line', 'kpi'] as ChartType[]) {
      state.chartType = type;
      expect(activeSeriesField(state), type).toBe('');
      expect(usesLibEmbedded() && type !== 'podium' && type !== 'bar-line', type).toBe(false);
    }
  });

  it('exclusif avec les séries du formulaire : elles ne sont plus tracées', () => {
    state.extraSeries = [{ field: 'production', label: 'Autre' }];
    expect(tracedExtraSeries(state)).toEqual([]);
    state.seriesField = '';
    expect(tracedExtraSeries(state)).toEqual([{ field: 'production', label: 'Autre' }]);
  });

  it('l’instantané porte le champ des séries et l’empilement', () => {
    state.stacked = true;
    const instantane = JSON.parse(JSON.stringify(getBuilderStateToSave())) as Record<
      string,
      unknown
    >;
    expect(instantane).toMatchObject({ seriesField: 'filiere', stacked: true });
  });
});

describe('format long : code généré', () => {
  beforeEach(reinitialiser);

  it('données locales intégrées : un groupe par étiquette et par série, pivot par la bibliothèque', () => {
    generateChartFromLocalData();
    const c = code();
    expect(lignesIntegrees()).toEqual([
      { annee: '2023', filiere: 'Bois', value: 15 },
      { annee: '2023', filiere: 'Solaire', value: 7 },
      { annee: '2024', filiere: 'Bois', value: 12 },
      { annee: '2024', filiere: 'Solaire', value: 9 },
    ]);
    expect(c).toContain('<dsfr-data-chart');
    expect(c).toContain('type="bar"');
    expect(c).toContain('label-field="annee"');
    expect(c).toContain('value-field="value"');
    expect(c).toContain('series-field="filiere"');
    // Les noms de séries viennent du champ : ni `name`, ni `value-fields`.
    expect(c).not.toContain('name=');
    expect(c).not.toContain('value-fields=');
    expect(c).not.toContain('<bar-chart');
  });

  it('sans champ de séries : le code intégré historique est inchangé (balise DSFR Chart nue)', () => {
    state.seriesField = '';
    generateChartFromLocalData();
    expect(code()).toContain('<bar-chart id="chart"');
    expect(code()).not.toContain('series-field');
    expect(state.data).toEqual([
      { value: 22, annee: '2023' },
      { value: 21, annee: '2024' },
    ]);
  });

  it('les séries du formulaire sont ignorées, pas agrégées en colonnes', () => {
    state.extraSeries = [{ field: 'production', label: 'Doublon' }];
    generateChartFromLocalData();
    expect(Object.keys(lignesIntegrees()[0])).toEqual(['value', 'annee', 'filiere']);
  });

  it('API intégrée : les lignes déjà regroupées sont intégrées', () => {
    state.data = [
      { annee: '2023', filiere: 'Bois', value: 15 },
      { annee: '2023', filiere: 'Solaire', value: 7 },
    ];
    generateCode('https://data.exemple.fr/api/records');
    expect(code()).toContain('series-field="filiere"');
    expect(code()).not.toContain('fetch(');
    expect(lignesIntegrees()).toEqual(state.data);
  });

  it('Grist dynamique : regroupement par étiquette et série, chemins préfixés', () => {
    state.generationMode = 'dynamic';
    state.savedSource = GRIST;
    generateDynamicCode();
    const c = code();
    expect(c).toContain('group-by="fields.annee, fields.filiere"');
    expect(c).toContain('aggregate="fields.production:sum"');
    expect(c).toContain('series-field="fields.filiere"');
    expect(c).toContain('label-field="fields.annee"');
    expect(c).not.toContain('name=');
  });

  it('Grist aplati : chemins nus', () => {
    state.generationMode = 'dynamic';
    state.savedSource = GRIST;
    state.normalizeConfig = { ...state.normalizeConfig, enabled: true, flatten: 'fields' };
    generateDynamicCode();
    expect(code()).toContain('group-by="annee, filiere"');
    expect(code()).toContain('series-field="filiere"');
  });

  it('OpenDataSoft dynamique : le serveur regroupe sur les deux champs', () => {
    state.generationMode = 'dynamic';
    state.savedSource = ODS;
    generateDynamicCodeForApi();
    const c = code();
    expect(c).toContain('group-by="annee, filiere"');
    expect(c).toContain('select="annee, filiere, sum(production) as production__sum"');
    expect(c).toContain('series-field="filiere"');
    expect(c).toContain('label-field="annee"');
  });

  it.each([
    ['Tabular', TABULAR],
    ['API générique', GENERIQUE],
  ])('%s dynamique : la requête regroupe sur les deux champs', (_nom, source) => {
    state.generationMode = 'dynamic';
    state.savedSource = source;
    generateDynamicCodeForApi();
    const c = code();
    expect(c).toContain('group-by="annee, filiere"');
    expect(c).toContain('series-field="filiere"');
    expect(c).toContain('value-field="production__sum"');
  });

  it('requête avancée : un regroupement qui nomme déjà la série n’est pas doublé', () => {
    state.generationMode = 'dynamic';
    state.savedSource = GENERIQUE;
    state.advancedMode = true;
    state.queryGroupBy = 'annee, filiere';
    generateDynamicCodeForApi();
    expect(code()).toContain('group-by="annee, filiere"');
    expect(code()).not.toContain('filiere, filiere');
  });

  it('camembert : le champ des séries est ignoré, dans le code comme dans la requête', () => {
    state.chartType = 'pie';
    state.generationMode = 'dynamic';
    state.savedSource = GENERIQUE;
    generateDynamicCodeForApi();
    expect(code()).toContain('group-by="annee"');
    expect(code()).not.toContain('series-field');
  });
});

describe('barres empilées', () => {
  beforeEach(() => {
    reinitialiser();
    state.stacked = true;
  });

  it('réservé aux barres, verticales ou horizontales', () => {
    for (const type of ['bar', 'horizontalBar'] as ChartType[]) {
      state.chartType = type;
      expect(stackedActive(state), type).toBe(true);
    }
    for (const type of ['line', 'radar', 'pie', 'bar-line', 'podium', 'map'] as ChartType[]) {
      state.chartType = type;
      expect(stackedActive(state), type).toBe(false);
    }
    state.chartType = 'bar';
    state.stacked = false;
    expect(stackedActive(state)).toBe(false);
  });

  it('format long intégré : stacked sur dsfr-data-chart', () => {
    generateChartFromLocalData();
    expect(code()).toMatch(/type="bar"\n\s+stacked\n/);
  });

  it('séries en colonnes, intégré : stacked sur la balise DSFR Chart', () => {
    state.seriesField = '';
    generateChartFromLocalData();
    expect(code()).toMatch(/<bar-chart id="chart"[\s\S]*\n\s+stacked>/);
  });

  it('barres horizontales dynamiques : horizontal et stacked', () => {
    state.chartType = 'horizontalBar';
    state.generationMode = 'dynamic';
    state.savedSource = GENERIQUE;
    generateDynamicCodeForApi();
    expect(code()).toMatch(/type="bar"\n\s+horizontal\n\s+stacked\n/);
  });

  it('API intégrée, séries en colonnes : l’attribut est posé par le script', () => {
    state.seriesField = '';
    state.data = [{ annee: '2023', value: 22 }];
    generateCode('https://data.exemple.fr/api/records');
    expect(code()).toContain("el.setAttribute('stacked', '');");
  });

  it('lignes : jamais empilées, même si le réglage est resté coché', () => {
    state.chartType = 'line';
    state.generationMode = 'dynamic';
    state.savedSource = GRIST;
    generateDynamicCode();
    expect(code()).not.toMatch(/\n\s+stacked\b/);
  });
});

describe('format long et empilement : contrôles', () => {
  beforeEach(() => {
    reinitialiser();
    state.seriesField = '';
    document.body.innerHTML = `
      <button class="chart-type-btn" data-type="bar"></button>
      <button class="chart-type-btn" data-type="line"></button>
      <button class="chart-type-btn" data-type="pie"></button>
      <div id="series-field-group" style="display:none"><select id="series-field"></select></div>
      <div id="stacked-group" style="display:none"><input type="checkbox" id="stacked-toggle"></div>
      <div id="extra-series-group"><div id="extra-series-container"></div></div>
      <div id="line-field-group"><select id="line-field"></select></div>
      <div id="palette-config"><select id="chart-palette"></select><div id="palette-swatches"></div><p id="palette-note" hidden></p></div>
    `;
  });

  const affiche = (id: string): boolean => document.getElementById(id)!.style.display !== 'none';

  it('barres : champ des séries et empilement ; lignes : champ des séries seul ; camembert : aucun', () => {
    selectChartType('bar');
    expect([affiche('series-field-group'), affiche('stacked-group')]).toEqual([true, true]);
    selectChartType('line');
    expect([affiche('series-field-group'), affiche('stacked-group')]).toEqual([true, false]);
    selectChartType('pie');
    expect([affiche('series-field-group'), affiche('stacked-group')]).toEqual([false, false]);
  });

  it('choisir un champ de séries masque « Ajouter une série » ; le vider le ramène', () => {
    selectChartType('bar');
    setupFormesListeners();
    refreshFormesSelects();
    const select = document.getElementById('series-field') as HTMLSelectElement;
    expect(select.options[0].textContent).toBe('— Aucun (une colonne par série) —');
    expect([...select.options].map((o) => o.value)).toEqual(['', 'annee', 'filiere', 'production']);
    expect(affiche('extra-series-group')).toBe(true);

    select.value = 'filiere';
    select.dispatchEvent(new Event('change'));
    expect(state.seriesField).toBe('filiere');
    expect(affiche('extra-series-group')).toBe(false);

    select.value = '';
    select.dispatchEvent(new Event('change'));
    expect(affiche('extra-series-group')).toBe(true);
  });

  it('la case règle l’empilement', () => {
    setupFormesListeners();
    const caseEmpiler = document.getElementById('stacked-toggle') as HTMLInputElement;
    caseEmpiler.checked = true;
    caseEmpiler.dispatchEvent(new Event('change'));
    expect(state.stacked).toBe(true);
  });

  it('configuration rouverte : les contrôles reprennent l’état', () => {
    state.seriesField = 'filiere';
    state.stacked = true;
    selectChartType('bar');
    refreshFormesSelects();
    syncFormesControls();
    expect((document.getElementById('series-field') as HTMLSelectElement).value).toBe('filiere');
    expect((document.getElementById('stacked-toggle') as HTMLInputElement).checked).toBe(true);
    expect(affiche('extra-series-group')).toBe(false);
  });

  it('changement de source : un champ de séries devenu étranger est vidé', () => {
    state.seriesField = 'filiere';
    state.fields = [{ name: 'autre', type: 'string', sample: 'x' }];
    refreshFormesSelects();
    expect(state.seriesField).toBe('');
  });
});
