import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  generateCodeForLocalData,
  generateDynamicCodeForApi,
  effectivePalette,
  valueFieldAttr,
} from '../../../apps/builder/src/ui/code-generator';
import {
  selectChartType,
  applyPiePalette,
  PIE_PALETTE_NOTE,
} from '../../../apps/builder/src/ui/chart-type-selector';
import { syncA11yWithDatabox } from '../../../apps/builder/src/ui/ui-helpers';
import { state } from '../../../apps/builder/src/state';

vi.mock('../../../apps/builder/src/ui/chart-renderer', () => ({ renderChart: vi.fn() }));
vi.mock('../../../apps/builder/src/ui/accessible-table', () => ({
  updateAccessibleTable: vi.fn(),
}));

/**
 * Lot C de la recette vidéo : rendu du camembert (#1174) et cadre officiel
 * DSFR (#1179), côté Builder.
 */

const ODS =
  'https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/industrie-du-futur/records';

function resetDom(): void {
  document.body.innerHTML = `
    <div id="generated-code"></div>
    <div id="raw-data"></div>
    <div id="facets-fields-list"></div>
    <div id="facets-fields-modal"></div>
    <select id="chart-palette">
      <option value="default">Bleu France</option>
      <option value="categorical">Couleurs distinctes par catégorie</option>
      <option value="sequentialAscending">Dégradé</option>
    </select>
    <div id="palette-swatches"></div>
    <p id="palette-note" hidden></p>
    <button class="chart-type-btn" data-type="bar"></button>
    <button class="chart-type-btn" data-type="pie"></button>
    <button class="chart-type-btn" data-type="doughnut"></button>
    <p id="a11y-databox-note" hidden>Tableau de données et téléchargement CSV : fournis par le cadre officiel DSFR.</p>
    <input type="checkbox" id="a11y-table" checked>
    <input type="checkbox" id="a11y-download" checked>`;
}

function resetState(): void {
  state.generationMode = 'embedded';
  state.savedSource = null;
  state.chartType = 'bar';
  state.palette = 'default';
  state.labelField = 'nom_region';
  state.valueField = 'nombre_beneficiaires';
  state.valueFieldLabel = '';
  state.valueField2 = '';
  state.extraSeries = [];
  state.aggregation = 'sum';
  state.sortOrder = 'desc';
  state.sortField = '';
  state.title = 'Bénéficiaires par région';
  state.subtitle = '';
  state.fields = [
    { name: 'nom_region', fullPath: 'nom_region', type: 'string', sample: 'BRETAGNE' },
    { name: 'nombre_beneficiaires', fullPath: 'nombre_beneficiaires', type: 'number', sample: 78 },
  ] as typeof state.fields;
  state.data = [
    { nom_region: 'Bretagne', value: 78 },
    { nom_region: 'Normandie', value: 41 },
    { nom_region: 'Occitanie', value: 12 },
  ];
  state.localData = null;
  state.advancedMode = false;
  state.queryFilter = '';
  state.queryGroupBy = '';
  state.queryAggregate = '';
  state.databoxEnabled = false;
  state.a11yEnabled = true;
  state.a11yTable = true;
  state.a11yDownload = true;
  state.normalizeConfig = {
    enabled: false,
    flatten: '',
    trim: false,
    numericAuto: false,
    numeric: '',
    rename: '',
    stripHtml: false,
    replace: '',
    lowercaseKeys: false,
  };
  state.facetsConfig = {
    enabled: false,
    fields: [],
    maxValues: 6,
    sort: 'count',
    hideEmpty: false,
  };
  state.urlSync = false;
}

const code = () => document.getElementById('generated-code')!.textContent!;
const attr = (tag: string, name: string): string | null => {
  const html = code();
  const start = html.indexOf(`<${tag}`);
  if (start < 0) return null;
  const end = html.indexOf('>', start);
  const tag_ = html.slice(start, end);
  const at = tag_.indexOf(` ${name}=`);
  if (at < 0) return null;
  const quote = tag_[at + name.length + 2];
  const from = at + name.length + 3;
  return tag_.slice(from, tag_.indexOf(quote, from));
};

beforeEach(() => {
  resetDom();
  resetState();
});

describe('#1174 — camembert : une couleur par part, les parts en légende', () => {
  it('le choix du type camembert pose la palette categorical, verrouille le choix et le dit', () => {
    selectChartType('pie');
    const select = document.getElementById('chart-palette') as HTMLSelectElement;
    const note = document.getElementById('palette-note') as HTMLElement;
    expect(state.palette).toBe('categorical');
    expect(select.value).toBe('categorical');
    expect(select.disabled).toBe(true);
    expect(note.hidden).toBe(false);
    expect(note.textContent).toBe(PIE_PALETTE_NOTE);
  });

  it('l’anneau suit la même règle', () => {
    selectChartType('doughnut');
    expect(state.palette).toBe('categorical');
  });

  it('revenir aux barres rend le choix, sans toucher à la palette', () => {
    selectChartType('pie');
    selectChartType('bar');
    const select = document.getElementById('chart-palette') as HTMLSelectElement;
    const note = document.getElementById('palette-note') as HTMLElement;
    expect(select.disabled).toBe(false);
    expect(note.hidden).toBe(true);
    expect(state.palette).toBe('categorical');
  });

  it('applyPiePalette sans les éléments du formulaire ne plante pas', () => {
    document.body.innerHTML = '';
    state.chartType = 'pie';
    expect(() => applyPiePalette(true)).not.toThrow();
    expect(state.palette).toBe('categorical');
  });

  it('effectivePalette : categorical pour pie et doughnut quel que soit l’état, inchangée ailleurs', () => {
    state.palette = 'default';
    state.chartType = 'pie';
    expect(effectivePalette()).toBe('categorical');
    state.chartType = 'doughnut';
    expect(effectivePalette()).toBe('categorical');
    state.chartType = 'bar';
    expect(effectivePalette()).toBe('default');
    state.chartType = 'map';
    expect(effectivePalette()).toBe('sequentialAscending');
    state.palette = 'divergentAscending';
    expect(effectivePalette()).toBe('divergentAscending');
  });

  it('embarqué : <pie-chart> reçoit un nom par part et la palette categorical', () => {
    state.chartType = 'pie';
    state.palette = 'default';
    generateCodeForLocalData();
    expect(JSON.parse(attr('pie-chart', 'name')!)).toEqual(['Bretagne', 'Normandie', 'Occitanie']);
    expect(attr('pie-chart', 'selected-palette')).toBe('categorical');
  });

  it('embarqué : les barres gardent le nom de série et la palette choisie', () => {
    state.chartType = 'bar';
    state.valueFieldLabel = 'Bénéficiaires';
    generateCodeForLocalData();
    expect(JSON.parse(attr('bar-chart', 'name')!)).toEqual(['Bénéficiaires']);
    expect(attr('bar-chart', 'selected-palette')).toBe('default');
  });

  it('dynamique OpenDataSoft : dsfr-data-chart type="pie" reçoit la palette categorical', () => {
    state.generationMode = 'dynamic';
    state.savedSource = { id: '1', name: 'Jeu', type: 'api', apiUrl: ODS };
    state.chartType = 'doughnut';
    state.palette = 'default';
    generateDynamicCodeForApi();
    expect(attr('dsfr-data-chart', 'type')).toBe('pie');
    expect(attr('dsfr-data-chart', 'selected-palette')).toBe('categorical');
  });
});

describe('#1179 — cadre officiel DSFR', () => {
  it('valueFieldAttr : l’alias inline porte le nom de série saisi', () => {
    state.valueFieldLabel = 'Bénéficiaires';
    expect(valueFieldAttr('nombre_beneficiaires__sum')).toBe(
      'nombre_beneficiaires__sum:Bénéficiaires'
    );
  });

  it('valueFieldAttr : sans libellé, ou avec un libellé égal au chemin ou contenant « : », le chemin seul', () => {
    expect(valueFieldAttr('n__sum')).toBe('n__sum');
    state.valueFieldLabel = 'n__sum';
    expect(valueFieldAttr('n__sum')).toBe('n__sum');
    state.valueFieldLabel = 'Ratio : part';
    expect(valueFieldAttr('n__sum')).toBe('n__sum');
    state.valueFieldLabel = 'Bénéficiaires';
    expect(valueFieldAttr('n__sum:Déjà')).toBe('n__sum:Déjà');
  });

  it('dynamique OpenDataSoft : value-field porte l’alias, lu par le tableau du cadre et le CSV', () => {
    state.generationMode = 'dynamic';
    state.savedSource = { id: '1', name: 'Jeu', type: 'api', apiUrl: ODS };
    state.valueFieldLabel = 'Bénéficiaires';
    state.databoxEnabled = true;
    generateDynamicCodeForApi();
    expect(attr('dsfr-data-chart', 'value-field')).toBe('nombre_beneficiaires__sum:Bénéficiaires');
    expect(code()).toContain('databox');
  });

  it('dynamique OpenDataSoft : sans libellé saisi, le chemin seul (rendu historique)', () => {
    state.generationMode = 'dynamic';
    state.savedSource = { id: '1', name: 'Jeu', type: 'api', apiUrl: ODS };
    generateDynamicCodeForApi();
    expect(attr('dsfr-data-chart', 'value-field')).toBe('nombre_beneficiaires__sum');
  });

  it('cadre coché : les cases Tableau et CSV restent visibles, désactivées, avec la note', () => {
    syncA11yWithDatabox(true);
    const table = document.getElementById('a11y-table') as HTMLInputElement;
    const download = document.getElementById('a11y-download') as HTMLInputElement;
    const note = document.getElementById('a11y-databox-note') as HTMLElement;
    expect(table.disabled).toBe(true);
    expect(download.disabled).toBe(true);
    expect(table.checked).toBe(true);
    expect(note.hidden).toBe(false);
    expect(note.textContent).toContain('cadre officiel DSFR');
  });

  it('cadre décoché : les cases redeviennent actives et la note disparaît', () => {
    syncA11yWithDatabox(true);
    syncA11yWithDatabox(false);
    expect((document.getElementById('a11y-table') as HTMLInputElement).disabled).toBe(false);
    expect((document.getElementById('a11y-databox-note') as HTMLElement).hidden).toBe(true);
  });

  it('sans argument, la fonction lit l’état', () => {
    state.databoxEnabled = true;
    syncA11yWithDatabox();
    expect((document.getElementById('a11y-download') as HTMLInputElement).disabled).toBe(true);
  });
});
