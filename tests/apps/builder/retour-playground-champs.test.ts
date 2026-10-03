/**
 * Retour du Playground (ou du Pipeline) dans le Builder (#1176) : l'état déposé
 * est rouvert tel quel. Le champ d'étiquettes choisi (`nom_region`) n'est pas
 * remplacé par la suggestion automatique (`nom_departement`, premier champ
 * texte de la liste), le graphique est régénéré et la puce de statut dit
 * « Graphique à jour ».
 *
 * Cause : `populateFieldSelects()` appliquait ses « bons candidats » sans
 * regarder l'état qu'on venait de restaurer ; la régénération lisait alors
 * `state.data` (groupé par `nom_region`) sur un axe `nom_departement` sans
 * valeurs — aperçu vide.
 *
 * Preuve de mutation : retirer la garde `!labelConserve` de
 * `apps/builder/src/sources-fields.ts` rend le premier cas rouge ; retirer
 * `markGenerated()` de `loadFavoriteState` rend le second rouge.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const { navigateTo, toastWarning, toastError, confirmDialog, generateCodeForLocalData } =
  vi.hoisted(() => ({
    navigateTo: vi.fn(),
    toastWarning: vi.fn(),
    toastError: vi.fn(),
    confirmDialog: vi.fn(),
    generateCodeForLocalData: vi.fn(),
  }));

vi.mock('@dsfr-data/shared', async (importOriginal) => {
  const reel = await importOriginal<Record<string, unknown>>();
  return { ...reel, navigateTo, toastWarning, toastError, confirmDialog };
});
vi.mock('../../../apps/builder/src/ui/chart-type-selector', () => ({
  selectChartType: vi.fn(),
}));
vi.mock('../../../apps/builder/src/ui/chart-renderer', () => ({
  renderChart: vi.fn(),
}));
vi.mock('../../../apps/builder/src/ui/code-generator', () => ({
  generateCodeForLocalData,
  getLastGeneratedCode: () => '',
}));

import { loadFavoriteState } from '../../../apps/builder/src/sources';
import { state } from '../../../apps/builder/src/state';

const CHAMPS = [
  { name: 'nom_departement', type: 'string', sample: 'Ain' },
  { name: 'nom_region', type: 'string', sample: 'Auvergne-Rhône-Alpes' },
  { name: 'nombre_beneficiaires', type: 'number', sample: 12 },
];

/** Instantané déposé par `openInPlayground()` : barres par région, déjà généré. */
function deposer(): void {
  sessionStorage.setItem(
    'builder-state',
    JSON.stringify({
      chartType: 'bar',
      labelField: 'nom_region',
      valueField: 'nombre_beneficiaires',
      aggregation: 'sum',
      title: 'Bénéficiaires par région',
      fields: CHAMPS,
      data: [
        { nom_region: 'Bretagne', value: 10 },
        { nom_region: 'Normandie', value: 7 },
      ],
      localData: [{ nom_departement: 'Ain', nom_region: 'Auvergne-Rhône-Alpes' }],
      savedSource: { id: 'ods-1', name: 'industrie-du-futur', type: 'api', apiUrl: 'https://x' },
    })
  );
}

describe('retour du Playground : les champs choisis sont conservés (#1176)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    sessionStorage.clear();
    vi.clearAllMocks();
    window.history.replaceState(null, '', '/?from=playground');
    document.body.innerHTML = `
      <select id="saved-source"></select><span id="saved-source-info"></span>
      <input id="chart-title"><input id="chart-subtitle"><select id="chart-palette"></select>
      <select id="label-field"></select>
      <select id="value-field"></select>
      <select id="code-field"></select>
      <select id="aggregation"><option value="sum">sum</option></select>
      <div id="extra-series-container"></div>
      <div id="fields-status"></div>
      <div id="builder-dirty-status" hidden><span id="builder-dirty-status-text"></span></div>
    `;
    state.fields = [];
    state.labelField = '';
    state.valueField = '';
    state.codeField = '';
    state.extraSeries = [];
    state.data = [];
    state.localData = null;
    state.savedSource = null;
  });

  afterEach(() => {
    vi.useRealTimers();
    window.history.replaceState(null, '', '/');
  });

  it('le champ d’étiquettes reste nom_region, dans l’état et dans le select', async () => {
    deposer();
    await loadFavoriteState();
    await vi.runAllTimersAsync();

    expect(state.labelField).toBe('nom_region');
    expect(state.valueField).toBe('nombre_beneficiaires');
    expect((document.getElementById('label-field') as HTMLSelectElement).value).toBe('nom_region');
    expect(toastWarning).not.toHaveBeenCalled();
    expect(toastError).not.toHaveBeenCalled();
  });

  it('le graphique est régénéré et la puce de statut dit « Graphique à jour »', async () => {
    deposer();
    await loadFavoriteState();
    await vi.runAllTimersAsync();

    expect(generateCodeForLocalData).toHaveBeenCalledTimes(1);
    const puce = document.getElementById('builder-dirty-status')!;
    expect(puce.hidden).toBe(false);
    expect(document.getElementById('builder-dirty-status-text')!.textContent).toBe(
      'Graphique à jour'
    );
  });

  // #1204 : les réglages des formes ajoutées font le même aller-retour. Preuve
  // de mutation : retirer `syncFormesControls()` de `loadFavoriteState` rend
  // ce cas rouge (l'état est restauré, les contrôles restent vides).
  it('barres + ligne, format long, empilement, places du podium : état et contrôles restaurés', async () => {
    document.body.insertAdjacentHTML(
      'beforeend',
      `<select id="line-field"></select><input id="line-field-label">
       <select id="series-field"></select><input type="checkbox" id="stacked-toggle">
       <input type="number" id="podium-max-items" value="5">`
    );
    const { setupFormesListeners } = await import('../../../apps/builder/src/ui/formes');
    setupFormesListeners();
    sessionStorage.setItem(
      'builder-state',
      JSON.stringify({
        chartType: 'bar-line',
        labelField: 'nom_region',
        valueField: 'nombre_beneficiaires',
        lineField: 'nombre_beneficiaires',
        lineFieldLabel: 'Bénéficiaires',
        seriesField: 'nom_departement',
        stacked: true,
        podiumMaxItems: 3,
        aggregation: 'sum',
        fields: CHAMPS,
        data: [{ nom_region: 'Bretagne', value: 10, value2: 4 }],
        localData: [{ nom_departement: 'Ain', nom_region: 'Auvergne-Rhône-Alpes' }],
        savedSource: { id: 'ods-1', name: 'industrie-du-futur', type: 'api', apiUrl: 'https://x' },
      })
    );
    await loadFavoriteState();
    await vi.runAllTimersAsync();

    expect(state).toMatchObject({
      chartType: 'bar-line',
      lineField: 'nombre_beneficiaires',
      lineFieldLabel: 'Bénéficiaires',
      seriesField: 'nom_departement',
      stacked: true,
      podiumMaxItems: 3,
    });
    const valeur = (id: string) => (document.getElementById(id) as HTMLInputElement).value;
    expect(valeur('line-field')).toBe('nombre_beneficiaires');
    expect(valeur('line-field-label')).toBe('Bénéficiaires');
    expect(valeur('series-field')).toBe('nom_departement');
    expect(valeur('podium-max-items')).toBe('3');
    expect((document.getElementById('stacked-toggle') as HTMLInputElement).checked).toBe(true);
    expect(toastError).not.toHaveBeenCalled();
  });
});
