import { describe, it, expect, vi } from 'vitest';
import { generateDynamicCodeForApi } from '../../../apps/builder/src/ui/code-generator';
import { openFacetsModal } from '../../../apps/builder/src/ui/facets-config';
import { normalizeNote } from '../../../apps/builder/src/ui/normalize-config';
import { state } from '../../../apps/builder/src/state';

vi.mock('../../../apps/builder/src/ui/chart-renderer', () => ({ renderChart: vi.fn() }));
vi.mock('../../../apps/builder/src/ui/accessible-table', () => ({
  updateAccessibleTable: vi.fn(),
}));

/**
 * Lot B de la revue des tickets : le code exporté par le Builder en mode
 * dynamique, pour une source OpenDataSoft ou Tabular (#1169, #1170, #1171).
 */

const ODS =
  'https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/industrie-du-futur/records';
const TABULAR = 'https://tabular-api.data.gouv.fr/api/resources/abc-123/data/';

function reset(apiUrl: string): void {
  document.body.innerHTML = `
    <div id="generated-code"></div>
    <div id="raw-data"></div>
    <div id="facets-fields-list"></div>
    <div id="facets-fields-modal"></div>`;
  state.generationMode = 'dynamic';
  state.savedSource = { id: '1', name: 'Jeu', type: 'api', apiUrl };
  state.chartType = 'bar';
  state.labelField = 'nom_region';
  state.valueField = 'nombre_beneficiaires';
  state.aggregation = 'sum';
  state.sortOrder = 'desc';
  state.sortField = '';
  state.title = 'Bénéficiaires';
  state.extraSeries = [];
  state.fields = [
    { name: 'nom_region', fullPath: 'nom_region', type: 'string', sample: 'BRETAGNE' },
    { name: 'nom_departement', fullPath: 'nom_departement', type: 'string', sample: 'ORNE' },
    { name: 'nombre_beneficiaires', fullPath: 'nombre_beneficiaires', type: 'number', sample: 78 },
    {
      name: 'montant_investissement',
      fullPath: 'montant_investissement',
      type: 'number',
      sample: 1,
    },
  ] as typeof state.fields;
  state.localData = null;
  state.advancedMode = false;
  state.queryFilter = '';
  state.queryGroupBy = '';
  state.queryAggregate = '';
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
  const m = new RegExp(`${name}="([^"]*)"`).exec(html.slice(start, end));
  return m ? m[1] : null;
};

describe('#1169 — « Nettoyage des données » avec OpenDataSoft ou Tabular (après agrégation)', () => {
  for (const [nom, url] of [
    ['OpenDataSoft', ODS],
    ['Tabular', TABULAR],
  ] as const) {
    it(`${nom} : dsfr-data-normalize est émis, entre la query et le graphique`, () => {
      reset(url);
      state.normalizeConfig.enabled = true;
      state.normalizeConfig.trim = true;
      state.normalizeConfig.stripHtml = true;
      generateDynamicCodeForApi();

      expect(code()).toContain('<dsfr-data-normalize');
      expect(attr('dsfr-data-normalize', 'source')).toBe('query-data');
      expect(attr('dsfr-data-chart', 'source')).toBe('normalized-data');
      // Le regroupement reste calculé par le serveur, avant le nettoyage.
      expect(code().indexOf('<dsfr-data-query')).toBeLessThan(
        code().indexOf('<dsfr-data-normalize')
      );
    });
  }

  it('le renommage du champ d’axe est suivi par label-field', () => {
    reset(ODS);
    state.normalizeConfig.enabled = true;
    state.normalizeConfig.rename = 'nom_region:Région';
    generateDynamicCodeForApi();

    expect(attr('dsfr-data-normalize', 'rename')).toBe('nom_region:Région');
    expect(attr('dsfr-data-chart', 'label-field')).toBe('Région');
    expect(attr('dsfr-data-chart', 'value-field')).toBe('nombre_beneficiaires__sum');
  });

  it('lowercase-keys s’applique aussi aux champs du graphique', () => {
    reset(TABULAR);
    state.labelField = 'NomRegion';
    state.normalizeConfig.enabled = true;
    state.normalizeConfig.lowercaseKeys = true;
    generateDynamicCodeForApi();

    expect(attr('dsfr-data-chart', 'label-field')).toBe('nomregion');
  });

  it('nettoyage désactivé : rien ne change', () => {
    reset(ODS);
    generateDynamicCodeForApi();
    expect(code()).not.toContain('<dsfr-data-normalize');
    expect(attr('dsfr-data-chart', 'source')).toBe('query-data');
  });

  it('la section dit ce que fait le nettoyage, et quand il est sans effet', () => {
    reset(ODS);
    expect(normalizeNote()).toContain('résultat');
    state.chartType = 'datalist';
    expect(normalizeNote()).toContain('Sans effet');
    reset('https://example.org/data.json');
    expect(normalizeNote()).toBe('');
  });
});

describe('#1170 — « Requête avancée » : chaque agrégat est une série', () => {
  for (const [nom, url] of [
    ['OpenDataSoft', ODS],
    ['Tabular', TABULAR],
  ] as const) {
    it(`${nom} : deux agrégats → deux séries tracées`, () => {
      reset(url);
      state.advancedMode = true;
      state.queryAggregate =
        'nombre_beneficiaires:sum:beneficiaires, montant_investissement:sum:investissement';
      generateDynamicCodeForApi();

      expect(attr('dsfr-data-chart', 'value-field')).toBe('beneficiaires');
      expect(attr('dsfr-data-chart', 'value-fields')).toBe('investissement');
      expect(code()).toContain(`name='["beneficiaires","investissement"]'`);
    });
  }

  it('la série 2 du formulaire n’est plus perdue quand le champ est rempli', () => {
    reset(ODS);
    state.advancedMode = true;
    state.queryAggregate = 'nombre_beneficiaires:sum:beneficiaires';
    state.extraSeries = [{ field: 'montant_investissement', label: 'Investissement' }];
    generateDynamicCodeForApi();

    expect(attr('dsfr-data-source', 'select')).toContain(
      'sum(montant_investissement) as montant_investissement__sum'
    );
    expect(attr('dsfr-data-chart', 'value-fields')).toBe('montant_investissement__sum');
    expect(code()).toContain(`name='["beneficiaires","Investissement"]'`);
  });

  it('Tabular : l’alias écrit est respecté (il était ignoré)', () => {
    reset(TABULAR);
    state.advancedMode = true;
    state.queryAggregate = 'nombre_beneficiaires:sum:beneficiaires';
    generateDynamicCodeForApi();

    expect(attr('dsfr-data-query', 'aggregate')).toBe('nombre_beneficiaires:sum:beneficiaires');
    expect(attr('dsfr-data-chart', 'value-field')).toBe('beneficiaires');
  });

  it('camembert : une seule série tracée, les autres agrégats restent calculés', () => {
    reset(ODS);
    state.chartType = 'pie';
    state.advancedMode = true;
    state.queryAggregate = 'nombre_beneficiaires:sum, montant_investissement:sum';
    generateDynamicCodeForApi();

    expect(attr('dsfr-data-chart', 'value-fields')).toBeNull();
    expect(attr('dsfr-data-chart', 'value-field')).toBe('nombre_beneficiaires__sum');
  });
});

describe('#1171 — facettes d’un graphique OpenDataSoft ou Tabular', () => {
  it('OpenDataSoft : facettes serveur, tout champ du jeu est filtrable', () => {
    reset(ODS);
    state.facetsConfig.enabled = true;
    state.facetsConfig.fields = [
      {
        field: 'nom_departement',
        label: 'Département',
        display: 'checkbox',
        searchable: false,
        disjunctive: false,
      },
    ];
    generateDynamicCodeForApi();

    expect(code()).toMatch(/<dsfr-data-facets[^>]*server-facets/);
    expect(attr('dsfr-data-facets', 'fields')).toBe('nom_departement');
  });

  it('Tabular : valeurs précalculées, filtre relayé au serveur', () => {
    reset(TABULAR);
    state.localData = [
      { nom_region: 'BRETAGNE', nom_departement: 'FINISTERE', nombre_beneficiaires: 1 },
      { nom_region: 'NORMANDIE', nom_departement: 'ORNE', nombre_beneficiaires: 2 },
    ];
    state.facetsConfig.enabled = true;
    state.facetsConfig.fields = [
      {
        field: 'nom_departement',
        label: 'Département',
        display: 'checkbox',
        searchable: false,
        disjunctive: false,
      },
    ];
    generateDynamicCodeForApi();

    expect(code()).toContain(`static-values='{"nom_departement":["FINISTERE","ORNE"]}'`);
  });

  it('la modale s’ouvre sans aucun champ coché', () => {
    reset(ODS);
    openFacetsModal();
    const coches = document.querySelectorAll<HTMLInputElement>('.facets-field-active');
    expect(coches.length).toBe(4);
    expect([...coches].filter((c) => c.checked)).toHaveLength(0);
    expect(state.facetsConfig.fields).toHaveLength(0);
  });
});
