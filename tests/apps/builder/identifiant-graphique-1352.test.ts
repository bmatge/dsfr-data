import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  generateCodeForLocalData,
  generateDynamicCodeForApi,
  scopeGeneratedIds,
} from '../../../apps/builder/src/ui/code-generator';
import { getBuilderStateToSave } from '../../../apps/builder/src/ui/ui-helpers';
import {
  state,
  CHART_ID_PATTERN,
  ensureChartId,
  nouvelIdentifiant,
} from '../../../apps/builder/src/state';
import { scopeFavoriteIds } from '../../../packages/shared/src/dashboard/export-html';

vi.mock('../../../apps/builder/src/ui/chart-renderer', () => ({ renderChart: vi.fn() }));
vi.mock('../../../apps/builder/src/ui/accessible-table', () => ({
  updateAccessibleTable: vi.fn(),
}));

/**
 * #1352 — un identifiant par graphique généré (retour usager).
 *
 * Le code du Builder portait des id figés : deux extraits sur une même page
 * partageaient `chart-src`, et le second graphique s'abonnait aux données du
 * premier. L'identifiant est accolé à chaque id déclaré et à chaque référence.
 */

const ODS =
  'https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/industrie-du-futur/records';

function resetDom(): void {
  document.body.innerHTML = `
    <div id="generated-code"></div>
    <div id="raw-data"></div>
    <div id="facets-fields-list"></div>
    <div id="facets-fields-modal"></div>
    <select id="chart-palette"><option value="default">Couleur unique (bleu)</option></select>
    <div id="palette-swatches"></div>
    <div id="chart-container"></div>
  `;
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
  state.chartId = '';
  state.fields = [
    { name: 'nom_region', fullPath: 'nom_region', type: 'string', sample: 'BRETAGNE' },
    { name: 'nombre_beneficiaires', fullPath: 'nombre_beneficiaires', type: 'number', sample: 78 },
  ] as typeof state.fields;
  state.data = [
    { nom_region: 'Bretagne', value: 78 },
    { nom_region: 'Normandie', value: 41 },
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
const idsDe = (html: string) =>
  [...html.matchAll(/\s(?:id|databox-id)="([^"]+)"/g)].map((m) => m[1]);
// `source` de <data-box> est un texte (la mention de source), pas un id : on
// ne retient que les valeurs qui ont la forme d'un id.
const referencesDe = (html: string) =>
  [...html.matchAll(/\s(?:source|for)="([^"]+)"/g)]
    .map((m) => m[1].trim())
    .filter((v) => /^[\w-]+$/.test(v));

beforeEach(() => {
  resetDom();
  resetState();
});

describe('identifiant : forme et attribution', () => {
  it('nouvelIdentifiant : une lettre puis trois caractères, toujours valide', () => {
    for (let i = 0; i < 200; i++) {
      const id = nouvelIdentifiant();
      expect(id).toMatch(/^[a-z][a-z0-9]{3}$/);
      expect(CHART_ID_PATTERN.test(id)).toBe(true);
    }
  });

  it('ensureChartId : attribue si vide ou invalide, conserve un identifiant valide', () => {
    state.chartId = '';
    const attribue = ensureChartId();
    expect(attribue).toBe(state.chartId);
    expect(CHART_ID_PATTERN.test(attribue)).toBe(true);
    expect(ensureChartId()).toBe(attribue);

    state.chartId = 'budget-2025';
    expect(ensureChartId()).toBe('budget-2025');

    state.chartId = '1er graphique';
    expect(ensureChartId()).not.toBe('1er graphique');
  });

  it('CHART_ID_PATTERN : un id HTML sobre', () => {
    for (const ok of ['a', 'budget-2025', 'Chart_1', 'x'.repeat(41)]) {
      expect(CHART_ID_PATTERN.test(ok), ok).toBe(true);
    }
    for (const ko of ['', '1abc', 'a b', 'é', 'a.b', 'a#b', 'x'.repeat(42)]) {
      expect(CHART_ID_PATTERN.test(ko), JSON.stringify(ko)).toBe(false);
    }
  });

  it('le favori enregistre l’identifiant', () => {
    state.chartId = 'budget-2025';
    expect(getBuilderStateToSave().chartId).toBe('budget-2025');
  });
});

describe('code généré : chaque id et chaque référence portent l’identifiant', () => {
  it('sans identifiant, le code garde ses id historiques', () => {
    generateCodeForLocalData();
    expect(code()).toContain('id="chart"');
    expect(idsDe(code())).not.toContainEqual(expect.stringContaining('--'));
  });

  it('embarqué : aucun id sans suffixe, aucune référence orpheline', () => {
    state.chartId = 'budget';
    generateCodeForLocalData();
    const html = code();
    const ids = idsDe(html);
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) expect(id, id).toMatch(/--budget$/);
    for (const ref of referencesDe(html)) expect(ids, ref).toContain(ref);
    expect(html).toContain('id="chart--budget"');
    expect(html).toContain('for="chart--budget"');
  });

  it('dynamique OpenDataSoft avec cadre : dsfr-data-chart dérive sa DataBox de son id suffixé', () => {
    state.chartId = 'budget';
    state.generationMode = 'dynamic';
    state.savedSource = { id: '1', name: 'Jeu', type: 'api', apiUrl: ODS };
    state.databoxEnabled = true;
    generateDynamicCodeForApi();
    const html = code();
    const ids = idsDe(html);
    for (const id of ids) expect(id, id).toMatch(/--budget$/);
    for (const ref of referencesDe(html)) expect(ids, ref).toContain(ref);
    expect(html).toContain('id="chart--budget"');
    // Le cadre est un attribut du composant : la DataBox (`databox-chart--budget`)
    // est construite au rendu depuis cet id, aucun databox-id en dur à suffixer.
    expect(html).toMatch(/\sdatabox\b/);
    expect(html).not.toContain('databox-id=');
  });

  it('nuage de points embarqué (DSFR Chart natif) : databox-id suit sur la DataBox, le graphique et le bouchon', () => {
    state.chartId = 'budget';
    state.chartType = 'scatter';
    state.databoxEnabled = true;
    generateCodeForLocalData();
    const html = code();
    expect(html).toMatch(/<scatter-chart[^>]*\sid="chart--budget"/);
    expect(html).toContain('<data-box id="databox-chart--budget"');
    expect(html).not.toMatch(/databox-id="databox-chart"/);
    // La DataBox porte l'identifiant dans `id` ; le graphique et le bouchon de
    // tableau le citent dans `databox-id` : les trois doivent coïncider.
    const dbIds = [...html.matchAll(/databox-id="([^"]+)"/g)].map((m) => m[1]);
    expect(dbIds).toEqual(['databox-chart--budget', 'databox-chart--budget']);
    for (const ref of referencesDe(html)) expect(idsDe(html), ref).toContain(ref);
  });

  it('deux générations avec deux identifiants ne partagent aucun id', () => {
    state.chartId = 'un';
    generateCodeForLocalData();
    const premier = new Set(idsDe(code()));
    state.chartId = 'deux';
    generateCodeForLocalData();
    const second = idsDe(code());
    for (const id of second) expect(premier.has(id), id).toBe(false);
  });

  it('scopeGeneratedIds : la même règle que l’export du tableau de bord', () => {
    state.chartId = 'w';
    const extrait =
      '<dsfr-data-source id="s"></dsfr-data-source><dsfr-data-chart id="c" source="s">';
    expect(scopeGeneratedIds(extrait)).toBe(scopeFavoriteIds(extrait, 'w'));
    expect(scopeGeneratedIds(extrait)).toContain('id="c--w" source="s--w"');
  });
});

describe('scopeFavoriteIds couvre databox-id (partagé avec le tableau de bord)', () => {
  it('suffixe databox-id sur la DataBox, le graphique et le bouchon', () => {
    const favori = `<data-box databox-id="databox-chart" name="x"></data-box>
<bar-chart id="chart" databox-id="databox-chart" databox-type="chart"></bar-chart>
<div databox-id="databox-chart" databox-type="table"></div>`;
    const out = scopeFavoriteIds(favori, 'w1');
    expect(out.match(/databox-id="databox-chart--w1"/g)).toHaveLength(3);
    expect(out).toContain('id="chart--w1"');
    expect(out).toContain('databox-type="chart"');
  });
});
