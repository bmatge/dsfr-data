/**
 * #1336 — le tableau accessible d'un graphique du Builder annonçait les clés
 * techniques des lignes agrégées (« value », « value2 ») au lieu des libellés
 * saisis dans le formulaire, ceux-là mêmes que porte la légende.
 *
 * Le Builder écrivait `<dsfr-data-a11y for source table download>` sans
 * `label-field` ni `value-field` : le composant retombait alors sur les clés
 * de la première ligne, DANS LEUR ORDRE D'APPARITION — d'où un tableau
 * « value | region | value2 » dont la colonne de libellé n'était même pas la
 * première (c'est elle, et elle seule, que vise `empty-label`). Le tableau du
 * cadre officiel avait reçu ses libellés en #1179 ; le compagnon accessible,
 * non.
 *
 * Le dernier cas monte le vrai composant sur le code produit : c'est la seule
 * preuve que l'en-tête affiché change, et pas seulement l'attribut écrit.
 *
 * Preuves de mutation (faites à la main, défaut retiré ensuite) :
 * - rendre `a11yChartFields` muet (`return ''`) : huit cas rougissent, dont le
 *   tableau rendu, qui annonce de nouveau « value » et « value2 » ;
 * - retirer `escapeColonValue` d'`a11yColumn` : le cas des libellés ponctués
 *   rougit (« Budget : voté » coupe l'alias, « a,b » invente une colonne) ;
 * - passer `a11yEmbeddedChartFields()` aux tableaux de données (`my-table`) :
 *   le cas du tableau de données rougit (ses colonnes brutes disparaissent).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { generateChartFromLocalData } from '../../../apps/builder/src/ui/code-generator';
import { state, PODIUM_PLACES_DEFAUT, type BuilderState } from '../../../apps/builder/src/state';
import { DsfrDataA11y } from '@/components/dsfr-data-a11y.js';
import { clearDataCache, dispatchDataLoaded } from '@/utils/data-bridge.js';

vi.mock('../../../apps/builder/src/ui/accessible-table', () => ({
  updateAccessibleTable: vi.fn(),
}));

const LIGNES = [
  { region: 'Bretagne', budget: 100, taux: 10, an: '2024' },
  { region: 'Bretagne', budget: 50, taux: 20, an: '2025' },
  { region: 'Normandie', budget: 80, taux: 30, an: '2024' },
];

const CHAMPS = [
  { name: 'region', type: 'string', sample: 'Bretagne' },
  { name: 'budget', type: 'number', sample: 100 },
  { name: 'taux', type: 'number', sample: 10 },
  { name: 'an', type: 'string', sample: '2024' },
];

function reinitialiser(): void {
  Object.assign(state, {
    chartType: 'bar',
    labelField: 'region',
    labelFieldLabel: 'Région',
    valueField: 'budget',
    valueFieldLabel: 'Budget voté',
    valueField2: '',
    extraSeries: [],
    lineField: '',
    lineFieldLabel: '',
    podiumMaxItems: PODIUM_PLACES_DEFAUT,
    codeField: '',
    aggregation: 'sum',
    sortOrder: 'none',
    sortField: '',
    seriesField: '',
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

/** Le code produit, relu par le navigateur plutôt qu'à coups d'expressions. */
function codeAnalyse(): HTMLDivElement {
  const div = document.createElement('div');
  // Détaché : les éléments personnalisés ne sont pas instanciés, seuls leurs
  // attributs sont lus — c'est bien le CODE qu'on vérifie ici.
  div.innerHTML = code();
  return div;
}

/** Attributs de l'unique `<dsfr-data-a11y>` du code produit. */
function attributsA11y(): Record<string, string> {
  const el = codeAnalyse().querySelector('dsfr-data-a11y');
  expect(el, 'compagnon accessible introuvable').not.toBeNull();
  return Object.fromEntries(Array.from(el!.attributes).map((a) => [a.name, a.value]));
}

/** Lignes écrites dans la source intégrée du code produit. */
function lignesIntegrees(id: string): Record<string, unknown>[] {
  const el = codeAnalyse().querySelector(`dsfr-data-source#${id}`);
  expect(el, `source ${id} introuvable`).not.toBeNull();
  return JSON.parse(el!.getAttribute('data') ?? '[]') as Record<string, unknown>[];
}

describe('tableau accessible : les colonnes portent les libellés du graphique (#1336)', () => {
  beforeEach(reinitialiser);

  it('données intégrées : le libellé des étiquettes et celui de la série', () => {
    generateChartFromLocalData();
    expect(attributsA11y()).toMatchObject({
      'label-field': 'region:Région',
      'value-field': 'value:Budget voté',
    });
  });

  it('séries multiples : une colonne par série, dans l’ordre de la légende', () => {
    state.extraSeries = [{ field: 'taux', label: "Taux d'exécution" }];
    generateChartFromLocalData();
    const attrs = attributsA11y();
    expect(attrs['value-field']).toBe("value:Budget voté,value2:Taux d'exécution");
    // Les mêmes noms que la légende du graphique.
    expect(code()).toContain(`name='["Budget voté","Taux d&#039;exécution"]'`);
  });

  it('barres + ligne : la mesure de la ligne est nommée comme sa série', () => {
    Object.assign(state, {
      chartType: 'bar-line',
      lineField: 'taux',
      lineFieldLabel: 'Taux',
    } satisfies Partial<BuilderState>);
    generateChartFromLocalData();
    expect(attributsA11y()['value-field']).toBe('value:Budget voté,value2:Taux');
  });

  it('sans libellé saisi : la colonne porte le nom du CHAMP, jamais l’alias technique', () => {
    state.labelFieldLabel = '';
    state.valueFieldLabel = '';
    generateChartFromLocalData();
    expect(attributsA11y()).toMatchObject({
      'label-field': 'region',
      'value-field': 'value:budget',
    });
  });

  it('carte : la colonne de libellé est le champ géographique, sans le libellé de l’axe', () => {
    Object.assign(state, {
      chartType: 'map',
      codeField: 'code_dep',
      labelField: 'region',
      labelFieldLabel: 'Région',
      localData: [{ code_dep: '35', budget: 100 }],
    } satisfies Partial<BuilderState>);
    generateChartFromLocalData();
    expect(attributsA11y()).toMatchObject({
      'label-field': 'code_dep',
      'value-field': 'value:Budget voté',
    });
  });

  it('format long : le tableau pivote comme le graphique sépare ses séries', () => {
    Object.assign(state, { chartType: 'line', seriesField: 'an' } satisfies Partial<BuilderState>);
    generateChartFromLocalData();
    expect(attributsA11y()).toMatchObject({
      'label-field': 'region:Région',
      'value-field': 'value:Budget voté',
      'series-field': 'an',
    });
  });

  it('libellé ponctué : `:` et `,` sont échappés, pas pris pour la grammaire', () => {
    state.labelFieldLabel = 'Région : métropole';
    state.valueFieldLabel = 'Budget, voté';
    generateChartFromLocalData();
    expect(attributsA11y()).toMatchObject({
      'label-field': 'region:Région %3A métropole',
      'value-field': 'value:Budget%2C voté',
    });
  });

  it('tableau de données : aucune colonne nommée, toutes les colonnes se lisent', () => {
    state.chartType = 'datalist';
    generateChartFromLocalData();
    const attrs = attributsA11y();
    expect(attrs['label-field']).toBeUndefined();
    expect(attrs['value-field']).toBeUndefined();
  });

  it('compagnon désactivé : rien n’est écrit', () => {
    state.a11yEnabled = false;
    generateChartFromLocalData();
    expect(code()).not.toContain('<dsfr-data-a11y');
  });
});

describe('le tableau RENDU porte ces en-têtes (#1336)', () => {
  const SOURCE_ID = 'a11y-data';
  let comp: DsfrDataA11y;

  beforeEach(() => {
    reinitialiser();
    clearDataCache(SOURCE_ID);
    comp = new DsfrDataA11y();
  });

  afterEach(() => comp.remove());

  it('en-têtes et ordre des colonnes, sur le code que le Builder produit', async () => {
    state.extraSeries = [{ field: 'taux', label: "Taux d'exécution" }];
    generateChartFromLocalData();
    const attrs = attributsA11y();
    const rows = lignesIntegrees(SOURCE_ID);

    // Les clés brutes des lignes : c'est ce que le tableau annonçait.
    expect(Object.keys(rows[0])).toEqual(['value', 'region', 'value2']);

    comp.source = SOURCE_ID;
    comp.table = true;
    comp.noAutoAria = true;
    for (const [name, value] of Object.entries(attrs)) comp.setAttribute(name, value);
    document.body.appendChild(comp);
    dispatchDataLoaded(SOURCE_ID, rows);
    await comp.updateComplete;

    const entetes = Array.from(comp.querySelectorAll('thead th')).map((th) =>
      (th.textContent ?? '').trim()
    );
    expect(entetes).toEqual(['Région', 'Budget voté', "Taux d'exécution"]);

    const corps = Array.from(comp.querySelectorAll('tbody tr')).map((tr) =>
      Array.from(tr.children).map((c) => (c.textContent ?? '').trim())
    );
    expect(corps).toEqual([
      ['Bretagne', '150', '30'],
      ['Normandie', '80', '30'],
    ]);
  });
});
