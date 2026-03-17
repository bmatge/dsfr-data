import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  generateChartFromLocalData,
  generateCodeForLocalData,
  generateCode,
  generateDsfrDataQueryCode,
  generateDynamicCode,
  generateDynamicCodeForApi,
  generateMiddlewareElements,
  generateFacetsElement,
  generateOdsQueryCode,
  generateTabularQueryCode,
  computeStaticFacetValues,
} from '../../../apps/builder/src/ui/code-generator';
import { filterToOdsql, applyLocalFilter } from '@dsfr-data/shared';
import { state } from '../../../apps/builder/src/state';

vi.mock('../../../apps/builder/src/ui/chart-renderer', () => ({
  renderChart: vi.fn(),
}));
vi.mock('../../../apps/builder/src/ui/accessible-table', () => ({
  updateAccessibleTable: vi.fn(),
}));

function resetState(): void {
  state.chartType = 'bar';
  state.labelField = '';
  state.valueField = '';
  state.valueField2 = '';
  state.extraSeries = [];
  state.codeField = '';
  state.aggregation = 'avg';
  state.sortOrder = 'desc';
  state.title = 'Mon graphique';
  state.subtitle = '';
  state.palette = 'default';
  state.color2 = '#E1000F';
  state.data = [];
  state.data2 = [];
  state.localData = null;
  state.savedSource = null;
  state.generationMode = 'embedded';
  state.advancedMode = false;
  state.queryFilter = '';
  state.queryGroupBy = '';
  state.queryAggregate = '';
  state.sourceType = 'saved';
  state.fields = [];
  state.chartInstance = null;
  state.refreshInterval = 0;
  state.apiUrl = '';
  state.datalistRecherche = true;
  state.datalistFiltres = false;
  state.datalistExportCsv = true;
  state.datalistExportHtml = false;
  state.datalistColumns = [];
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
}

describe('generateDsfrDataQueryCode', () => {
  beforeEach(() => {
    resetState();
  });

  it('should always generate a dsfr-data-query element even when advancedMode is false', () => {
    state.advancedMode = false;
    state.aggregation = 'avg';
    state.sortOrder = 'desc';
  
    const result = generateDsfrDataQueryCode('my-source', 'fields.region', 'fields.population');
    expect(result.queryElement).toContain('<dsfr-data-query');
    expect(result.queryElement).toContain('source="my-source"');
    expect(result.queryElement).toContain('group-by="fields.region"');
    expect(result.queryElement).toContain('aggregate="fields.population:avg"');
  });

  it('should always return chartSource = "query-data"', () => {
    state.advancedMode = false;
    const result = generateDsfrDataQueryCode('my-source', 'fields.region', 'fields.population');
    expect(result.chartSource).toBe('query-data');
  });

  it('should build dsfr-data-query element with source, group-by, filter, aggregate, order-by when advancedMode is true', () => {
    state.advancedMode = true;
    state.queryFilter = 'population>1000';
    state.queryGroupBy = 'region';
    state.queryAggregate = 'population:sum';
    state.sortOrder = 'desc';

    const result = generateDsfrDataQueryCode('chart-data', 'fields.region', 'fields.value');

    expect(result.queryElement).toContain('<dsfr-data-query');
    expect(result.queryElement).toContain('id="query-data"');
    expect(result.queryElement).toContain('source="chart-data"');
    expect(result.queryElement).toContain('group-by="region"');
    expect(result.queryElement).toContain('filter="population&gt;1000"');
    expect(result.queryElement).toContain('aggregate="population:sum"');
    expect(result.queryElement).toContain('order-by="population__sum:desc"');
    expect(result.queryElement).not.toContain('limit=');
  });

  it('should return chartSource = "query-data" when advancedMode is true', () => {
    state.advancedMode = true;
    state.sortOrder = 'desc';
  

    const result = generateDsfrDataQueryCode('chart-data', 'fields.region', 'fields.value');
    expect(result.chartSource).toBe('query-data');
  });

  it('should use labelFieldPath as group-by when queryGroupBy is empty', () => {
    state.advancedMode = true;
    state.queryGroupBy = '';
    state.sortOrder = 'desc';
  

    const result = generateDsfrDataQueryCode('chart-data', 'fields.commune', 'fields.value');
    expect(result.queryElement).toContain('group-by="fields.commune"');
  });

  it('should use valueFieldPath__aggregation for order-by when queryAggregate is empty', () => {
    state.advancedMode = true;
    state.queryAggregate = '';
    state.aggregation = 'sum';
    state.sortOrder = 'asc';
  

    const result = generateDsfrDataQueryCode('chart-data', 'fields.region', 'fields.population');
    expect(result.queryElement).toContain('order-by="fields.population__sum:asc"');
  });

  it('should not include filter attribute when queryFilter is empty', () => {
    state.advancedMode = true;
    state.queryFilter = '';
    state.sortOrder = 'desc';


    const result = generateDsfrDataQueryCode('chart-data', 'fields.region', 'fields.value');
    expect(result.queryElement).not.toContain('filter=');
  });

  it('should use default aggregate from form when queryAggregate is empty', () => {
    state.advancedMode = true;
    state.queryAggregate = '';
    state.aggregation = 'avg';
    state.sortOrder = 'desc';


    const result = generateDsfrDataQueryCode('chart-data', 'fields.region', 'fields.population');
    expect(result.queryElement).toContain('aggregate="fields.population:avg"');
  });
});

describe('generateChartFromLocalData', () => {
  beforeEach(() => {
    resetState();
    document.body.innerHTML = `
      <div id="generated-code"></div>
      <div id="raw-data"></div>
      <select id="kpi-variant"><option value="">Default</option><option value="info">Info</option></select>
      <input id="kpi-unit" value="">
    `;
  });

  const sampleData = [
    { region: 'Bretagne', population: 10 },
    { region: 'Bretagne', population: 20 },
    { region: 'Normandie', population: 30 },
    { region: 'Normandie', population: 40 },
    { region: 'Occitanie', population: 50 },
  ];

  it('should aggregate local data with "avg" aggregation', () => {
    state.localData = sampleData;
    state.labelField = 'region';
    state.valueField = 'population';
    state.aggregation = 'avg';
  

    generateChartFromLocalData();

    const bretagne = state.data.find(d => d['region'] === 'Bretagne');
    const normandie = state.data.find(d => d['region'] === 'Normandie');
    const occitanie = state.data.find(d => d['region'] === 'Occitanie');

    expect(bretagne?.value).toBe(15); // (10 + 20) / 2
    expect(normandie?.value).toBe(35); // (30 + 40) / 2
    expect(occitanie?.value).toBe(50); // 50 / 1
  });

  it('should aggregate local data with "sum" aggregation', () => {
    state.localData = sampleData;
    state.labelField = 'region';
    state.valueField = 'population';
    state.aggregation = 'sum';
  

    generateChartFromLocalData();

    const bretagne = state.data.find(d => d['region'] === 'Bretagne');
    const normandie = state.data.find(d => d['region'] === 'Normandie');

    expect(bretagne?.value).toBe(30); // 10 + 20
    expect(normandie?.value).toBe(70); // 30 + 40
  });

  it('should aggregate local data with "count" aggregation', () => {
    state.localData = sampleData;
    state.labelField = 'region';
    state.valueField = 'population';
    state.aggregation = 'count';
  

    generateChartFromLocalData();

    const bretagne = state.data.find(d => d['region'] === 'Bretagne');
    const normandie = state.data.find(d => d['region'] === 'Normandie');
    const occitanie = state.data.find(d => d['region'] === 'Occitanie');

    expect(bretagne?.value).toBe(2);
    expect(normandie?.value).toBe(2);
    expect(occitanie?.value).toBe(1);
  });

  it('should aggregate local data with "min" aggregation', () => {
    state.localData = sampleData;
    state.labelField = 'region';
    state.valueField = 'population';
    state.aggregation = 'min';
  

    generateChartFromLocalData();

    const bretagne = state.data.find(d => d['region'] === 'Bretagne');
    const normandie = state.data.find(d => d['region'] === 'Normandie');

    expect(bretagne?.value).toBe(10);
    expect(normandie?.value).toBe(30);
  });

  it('should aggregate local data with "max" aggregation', () => {
    state.localData = sampleData;
    state.labelField = 'region';
    state.valueField = 'population';
    state.aggregation = 'max';
  

    generateChartFromLocalData();

    const bretagne = state.data.find(d => d['region'] === 'Bretagne');
    const normandie = state.data.find(d => d['region'] === 'Normandie');

    expect(bretagne?.value).toBe(20);
    expect(normandie?.value).toBe(40);
  });

  it('should sort results by value desc', () => {
    state.localData = sampleData;
    state.labelField = 'region';
    state.valueField = 'population';
    state.aggregation = 'sum';
    state.sortOrder = 'desc';
  

    generateChartFromLocalData();

    const values = state.data.map(d => d.value as number);
    for (let i = 0; i < values.length - 1; i++) {
      expect(values[i]).toBeGreaterThanOrEqual(values[i + 1]);
    }
  });

  it('should sort results by value asc', () => {
    state.localData = sampleData;
    state.labelField = 'region';
    state.valueField = 'population';
    state.aggregation = 'sum';
    state.sortOrder = 'asc';
  

    generateChartFromLocalData();

    const values = state.data.map(d => d.value as number);
    for (let i = 0; i < values.length - 1; i++) {
      expect(values[i]).toBeLessThanOrEqual(values[i + 1]);
    }
  });

  it('should set state.data with aggregated results', () => {
    state.localData = [
      { city: 'Paris', score: 100 },
      { city: 'Lyon', score: 200 },
    ];
    state.labelField = 'city';
    state.valueField = 'score';
    state.aggregation = 'sum';
  

    generateChartFromLocalData();

    expect(state.data).toHaveLength(2);
    expect(state.data.every(d => 'value' in d)).toBe(true);
    expect(state.data.every(d => 'city' in d)).toBe(true);
  });

  it('should group by codeField instead of labelField for map chart type', () => {
    state.localData = [
      { region: 'Bretagne', dept_code: '35', population: 100 },
      { region: 'Bretagne', dept_code: '35', population: 200 },
      { region: 'Normandie', dept_code: '76', population: 150 },
    ];
    state.chartType = 'map';
    state.labelField = 'region';
    state.codeField = 'dept_code';
    state.valueField = 'population';
    state.aggregation = 'sum';
  

    generateChartFromLocalData();

    // Results should be keyed by codeField, not labelField
    const item35 = state.data.find(d => d['dept_code'] === '35');
    const item76 = state.data.find(d => d['dept_code'] === '76');

    expect(item35).toBeDefined();
    expect(item35?.value).toBe(300);
    expect(item76).toBeDefined();
    expect(item76?.value).toBe(150);

    // labelField should NOT be used as a key for map type
    const byRegion = state.data.find(d => 'region' in d);
    expect(byRegion).toBeUndefined();
  });

  it('should update raw-data element with JSON stringified results', () => {
    state.localData = [
      { city: 'Paris', score: 100 },
    ];
    state.labelField = 'city';
    state.valueField = 'score';
    state.aggregation = 'sum';
  

    generateChartFromLocalData();

    const rawDataEl = document.getElementById('raw-data');
    expect(rawDataEl?.textContent).toBe(JSON.stringify(state.data, null, 2));
  });

  it('should handle empty localData gracefully', () => {
    state.localData = [];
    state.labelField = 'city';
    state.valueField = 'score';
    state.aggregation = 'sum';
  

    generateChartFromLocalData();

    expect(state.data).toEqual([]);
  });

  it('should handle null localData gracefully', () => {
    state.localData = null;
    state.labelField = 'city';
    state.valueField = 'score';
    state.aggregation = 'sum';
  

    generateChartFromLocalData();

    expect(state.data).toEqual([]);
  });
});

describe('generateCodeForLocalData', () => {
  beforeEach(() => {
    resetState();
    document.body.innerHTML = `
      <div id="generated-code"></div>
      <div id="raw-data"></div>
      <select id="kpi-variant"><option value="">Default</option><option value="info">Info</option></select>
      <input id="kpi-unit" value="">
    `;
  });

  it('should generate KPI HTML code when chartType is "kpi"', () => {
    state.chartType = 'kpi';
    state.data = [{ value: 42 }];
    state.title = 'Total items';

    generateCodeForLocalData();

    const code = document.getElementById('generated-code')!.textContent!;
    expect(code).toContain('kpi-card');
    expect(code).toContain('kpi-value');
    expect(code).toContain('kpi-label');
    expect(code).toContain('Total items');
    expect(code).toContain('KPI');
  });

  it('should apply KPI variant from select element', () => {
    state.chartType = 'kpi';
    state.data = [{ value: 100 }];
    state.title = 'Score';

    const variantSelect = document.getElementById('kpi-variant') as HTMLSelectElement;
    variantSelect.value = 'info';

    generateCodeForLocalData();

    const code = document.getElementById('generated-code')!.textContent!;
    expect(code).toContain('kpi-card--info');
  });

  it('should generate gauge HTML code when chartType is "gauge"', () => {
    state.chartType = 'gauge';
    state.data = [{ value: 75.4 }];
    state.title = 'Completion';

    generateCodeForLocalData();

    const code = document.getElementById('generated-code')!.textContent!;
    expect(code).toContain('gauge-chart');
    expect(code).toContain('percent="75"');
    expect(code).toContain('Completion');
    expect(code).toContain('Jauge');
  });

  it('should generate scatter HTML code when chartType is "scatter"', () => {
    state.chartType = 'scatter';
    state.labelField = 'age';
    state.valueField = 'salary';
    state.data = [
      { age: 25, value: 30000 },
      { age: 35, value: 45000 },
    ];
    state.title = 'Age vs Salary';

    generateCodeForLocalData();

    const code = document.getElementById('generated-code')!.textContent!;
    expect(code).toContain('<scatter-chart');
    expect(code).toContain('Nuage de points');
    expect(code).toContain('DSFRChart');
  });

  it('should generate DSFR bar-chart element for bar type', () => {
    state.chartType = 'bar';
    state.labelField = 'region';
    state.valueField = 'population';
    state.data = [
      { region: 'Bretagne', value: 150 },
      { region: 'Normandie', value: 200 },
    ];
    state.title = 'Population par region';

    generateCodeForLocalData();

    const code = document.getElementById('generated-code')!.textContent!;
    expect(code).toContain('<bar-chart');
    expect(code).toContain('DSFRChart');
    expect(code).toContain('Population par region');
    expect(code).toContain('Bretagne');
    expect(code).toContain('Normandie');
  });

  it('should do nothing when generated-code element is missing', () => {
    document.body.innerHTML = '';

    state.chartType = 'bar';
    state.data = [{ region: 'Test', value: 100 }];

    // Should not throw
    expect(() => generateCodeForLocalData()).not.toThrow();
  });

  it('should generate horizontalBar as bar-chart with horizontal attribute', () => {
    state.chartType = 'horizontalBar';
    state.labelField = 'region';
    state.valueField = 'count';
    state.data = [{ region: 'Bretagne', value: 100 }];

    generateCodeForLocalData();

    const code = document.getElementById('generated-code')!.textContent!;
    expect(code).toContain('<bar-chart');
    expect(code).toContain('horizontal');
  });

  it('should generate map code for map chart type', () => {
    state.chartType = 'map';
    state.codeField = 'code_dept';
    state.data = [
      { code_dept: '35', value: 100 },
      { code_dept: '76', value: 200 },
    ];
    state.title = 'Carte departements';

    generateCodeForLocalData();

    const code = document.getElementById('generated-code')!.textContent!;
    expect(code).toContain('map-chart');
    expect(code).toContain('Carte');
    expect(code).toContain('DSFRChart');
  });

  it('should include subtitle in generated code when set', () => {
    state.chartType = 'bar';
    state.labelField = 'region';
    state.valueField = 'population';
    state.subtitle = 'En milliers';
    state.data = [{ region: 'Bretagne', value: 100 }];

    generateCodeForLocalData();

    const code = document.getElementById('generated-code')!.textContent!;
    expect(code).toContain('En milliers');
  });

  it('should embed data as x/y attributes in DSFR chart element', () => {
    state.chartType = 'line';
    state.labelField = 'year';
    state.valueField = 'gdp';
    state.data = [
      { year: '2020', value: 1000 },
      { year: '2021', value: 1100 },
    ];

    generateCodeForLocalData();

    const code = document.getElementById('generated-code')!.textContent!;
    expect(code).toContain('<line-chart');
    expect(code).toContain("x='[[\"2020\",\"2021\"]]'");
    expect(code).toContain("y='[[1000,1100]]'");
  });

  it('should generate pie-chart with fill attribute for pie type', () => {
    state.chartType = 'pie';
    state.labelField = 'category';
    state.valueField = 'amount';
    state.data = [
      { category: 'A', value: 10 },
      { category: 'B', value: 20 },
    ];

    generateCodeForLocalData();

    const code = document.getElementById('generated-code')!.textContent!;
    expect(code).toContain('<pie-chart');
    expect(code).toContain('fill');
  });

  it('should handle KPI with unit from kpi-unit input', () => {
    state.chartType = 'kpi';
    state.data = [{ value: 1500 }];
    state.title = 'Revenue';

    const unitInput = document.getElementById('kpi-unit') as HTMLInputElement;
    unitInput.value = '%';

    generateCodeForLocalData();

    const code = document.getElementById('generated-code')!.textContent!;
    expect(code).toContain('kpi-value');
    // The formatted value should contain the percentage sign
    expect(code).toContain('%');
  });

  it('should generate datalist HTML code when chartType is "datalist"', () => {
    state.chartType = 'datalist';
    state.localData = [
      { region: 'Bretagne', population: 3300000 },
      { region: 'Normandie', population: 3300000 },
    ];
    state.fields = [
      { name: 'region', type: 'string', sample: 'Bretagne' },
      { name: 'population', type: 'number', sample: 3300000 },
    ];
    state.labelField = 'region';
    state.title = 'Donnees regionales';
  
    state.sortOrder = 'desc';

    generateCodeForLocalData();

    const code = document.getElementById('generated-code')!.textContent!;
    expect(code).toContain('dsfr-data-list');
    expect(code).toContain('colonnes=');
    expect(code).toContain('recherche');
    expect(code).toContain('pagination=');
    expect(code).toContain('export="csv"');
    expect(code).toContain('Donnees regionales');
    expect(code).toContain('onSourceData');
  });

  it('should generate datalist code with tri attribute when sortOrder is set', () => {
    state.chartType = 'datalist';
    state.localData = [{ region: 'Bretagne', population: 3300000 }];
    state.fields = [
      { name: 'region', type: 'string', sample: 'Bretagne' },
      { name: 'population', type: 'number', sample: 3300000 },
    ];
    state.labelField = 'region';
    state.sortOrder = 'desc';
  

    generateCodeForLocalData();

    const code = document.getElementById('generated-code')!.textContent!;
    expect(code).toContain('tri="region:desc"');
  });

  it('should use custom datalist columns when configured', () => {
    state.chartType = 'datalist';
    state.localData = [{ region: 'Bretagne', population: 3300000, code: '35' }];
    state.fields = [
      { name: 'region', type: 'string', sample: 'Bretagne' },
      { name: 'population', type: 'number', sample: 3300000 },
      { name: 'code', type: 'string', sample: '35' },
    ];
    state.datalistColumns = [
      { field: 'region', label: 'Region', visible: true, filtrable: false },
      { field: 'population', label: 'Pop.', visible: true, filtrable: false },
      { field: 'code', label: 'Code', visible: false, filtrable: false },
    ];
    state.labelField = 'region';
  

    generateCodeForLocalData();

    const code = document.getElementById('generated-code')!.textContent!;
    expect(code).toContain('colonnes="region:Region, population:Pop."');
    expect(code).not.toContain('code:Code');
  });

  it('should not include recherche attribute when datalistRecherche is false', () => {
    state.chartType = 'datalist';
    state.localData = [{ region: 'Bretagne' }];
    state.fields = [{ name: 'region', type: 'string', sample: 'Bretagne' }];
    state.labelField = 'region';
  
    state.datalistRecherche = false;
    state.datalistExportCsv = false;

    generateCodeForLocalData();

    const code = document.getElementById('generated-code')!.textContent!;
    expect(code).not.toContain('recherche');
    expect(code).not.toContain('export="csv"');
  });

  it('should include filtres attribute when datalistFiltres is true', () => {
    state.chartType = 'datalist';
    state.localData = [{ region: 'Bretagne', code: '35' }];
    state.fields = [
      { name: 'region', type: 'string', sample: 'Bretagne' },
      { name: 'code', type: 'string', sample: '35' },
    ];
    state.datalistColumns = [
      { field: 'region', label: 'Region', visible: true, filtrable: true },
      { field: 'code', label: 'Code', visible: true, filtrable: false },
    ];
    state.datalistFiltres = true;
    state.labelField = 'region';
  

    generateCodeForLocalData();

    const code = document.getElementById('generated-code')!.textContent!;
    expect(code).toContain('filtres="region"');
  });
});

// =====================================================================
// filterToOdsql
// =====================================================================
describe('filterToOdsql', () => {
  it('should convert eq operator to =', () => {
    expect(filterToOdsql('region:eq:Bretagne')).toBe('region = "Bretagne"');
  });

  it('should convert neq operator to !=', () => {
    expect(filterToOdsql('region:neq:Paris')).toBe('region != "Paris"');
  });

  it('should convert gt/gte/lt/lte operators', () => {
    expect(filterToOdsql('pop:gt:1000')).toBe('pop > "1000"');
    expect(filterToOdsql('pop:gte:1000')).toBe('pop >= "1000"');
    expect(filterToOdsql('pop:lt:500')).toBe('pop < "500"');
    expect(filterToOdsql('pop:lte:500')).toBe('pop <= "500"');
  });

  it('should convert contains to LIKE', () => {
    expect(filterToOdsql('name:contains:bret')).toBe('name like "%bret%"');
  });

  it('should convert notcontains to NOT LIKE', () => {
    expect(filterToOdsql('name:notcontains:paris')).toBe('NOT name like "%paris%"');
  });

  it('should convert in operator', () => {
    expect(filterToOdsql('region:in:Bretagne|Normandie')).toBe('region in ("Bretagne", "Normandie")');
  });

  it('should convert notin operator', () => {
    expect(filterToOdsql('region:notin:Paris|Lyon')).toBe('NOT region in ("Paris", "Lyon")');
  });

  it('should convert isnull operator', () => {
    expect(filterToOdsql('region:isnull:')).toBe('region is null');
  });

  it('should convert isnotnull operator', () => {
    expect(filterToOdsql('region:isnotnull:')).toBe('region is not null');
  });

  it('should join multiple filters with AND', () => {
    const result = filterToOdsql('region:eq:Bretagne, pop:gt:1000');
    expect(result).toBe('region = "Bretagne" AND pop > "1000"');
  });

  it('should skip invalid segments (less than 3 parts)', () => {
    expect(filterToOdsql('invalid')).toBe('');
    expect(filterToOdsql('field:unknown_op:val')).toBe('');
  });
});

// =====================================================================
// applyLocalFilter
// =====================================================================
describe('applyLocalFilter', () => {
  const data = [
    { region: 'Bretagne', pop: 100 },
    { region: 'Normandie', pop: 200 },
    { region: 'Occitanie', pop: 300 },
  ];

  it('should filter with eq operator', () => {
    const result = applyLocalFilter(data, 'region:eq:Bretagne');
    expect(result).toHaveLength(1);
    expect(result[0].region).toBe('Bretagne');
  });

  it('should filter with neq operator', () => {
    const result = applyLocalFilter(data, 'region:neq:Bretagne');
    expect(result).toHaveLength(2);
  });

  it('should filter with gt operator', () => {
    const result = applyLocalFilter(data, 'pop:gt:150');
    expect(result).toHaveLength(2);
  });

  it('should filter with gte operator', () => {
    const result = applyLocalFilter(data, 'pop:gte:200');
    expect(result).toHaveLength(2);
  });

  it('should filter with lt operator', () => {
    const result = applyLocalFilter(data, 'pop:lt:200');
    expect(result).toHaveLength(1);
  });

  it('should filter with lte operator', () => {
    const result = applyLocalFilter(data, 'pop:lte:200');
    expect(result).toHaveLength(2);
  });

  it('should filter with contains operator (case-insensitive)', () => {
    const result = applyLocalFilter(data, 'region:contains:bret');
    expect(result).toHaveLength(1);
    expect(result[0].region).toBe('Bretagne');
  });

  it('should filter with notcontains operator', () => {
    const result = applyLocalFilter(data, 'region:notcontains:bret');
    expect(result).toHaveLength(2);
  });

  it('should filter with isnull operator', () => {
    const dataWithNull = [...data, { region: null as any, pop: 0 }];
    const result = applyLocalFilter(dataWithNull, 'region:isnull:');
    expect(result).toHaveLength(1);
  });

  it('should filter with isnotnull operator', () => {
    const dataWithNull = [...data, { region: null as any, pop: 0 }];
    const result = applyLocalFilter(dataWithNull, 'region:isnotnull:');
    expect(result).toHaveLength(3);
  });

  it('should apply multiple filters (AND logic)', () => {
    const result = applyLocalFilter(data, 'pop:gt:100, pop:lt:300');
    expect(result).toHaveLength(1);
    expect(result[0].region).toBe('Normandie');
  });
});

// =====================================================================
// generateFacetsElement
// =====================================================================
describe('generateFacetsElement', () => {
  beforeEach(() => {
    resetState();
  });

  it('should return empty when facets are disabled', () => {
    state.facetsConfig.enabled = false;
    state.facetsConfig.fields = [{ field: 'region', label: 'Region', display: 'checkbox', searchable: false, disjunctive: false }];
    const result = generateFacetsElement('chart-data');
    expect(result.element).toBe('');
    expect(result.finalSourceId).toBe('chart-data');
  });

  it('should return empty when no fields configured', () => {
    state.facetsConfig.enabled = true;
    state.facetsConfig.fields = [];
    const result = generateFacetsElement('chart-data');
    expect(result.element).toBe('');
  });

  it('should return empty when all fields have empty field name', () => {
    state.facetsConfig.enabled = true;
    state.facetsConfig.fields = [{ field: '', label: '', display: 'checkbox', searchable: false, disjunctive: false }];
    const result = generateFacetsElement('chart-data');
    expect(result.element).toBe('');
  });

  it('should generate dsfr-data-facets with fields attribute', () => {
    state.facetsConfig.enabled = true;
    state.facetsConfig.fields = [
      { field: 'region', label: 'Region', display: 'checkbox', searchable: false, disjunctive: false },
      { field: 'dept', label: 'Departement', display: 'checkbox', searchable: false, disjunctive: false },
    ];
    const result = generateFacetsElement('chart-data');
    expect(result.element).toContain('<dsfr-data-facets');
    expect(result.element).toContain('id="faceted-data"');
    expect(result.element).toContain('source="chart-data"');
    expect(result.element).toContain('fields="region, dept"');
    expect(result.finalSourceId).toBe('faceted-data');
  });

  it('should include custom labels when different from field name', () => {
    state.facetsConfig.enabled = true;
    state.facetsConfig.fields = [
      { field: 'region', label: 'Ma Region', display: 'checkbox', searchable: false, disjunctive: false },
    ];
    const result = generateFacetsElement('src');
    expect(result.element).toContain('labels="region:Ma Region"');
  });

  it('should not include labels attribute when labels match field names', () => {
    state.facetsConfig.enabled = true;
    state.facetsConfig.fields = [
      { field: 'region', label: 'region', display: 'checkbox', searchable: false, disjunctive: false },
    ];
    const result = generateFacetsElement('src');
    expect(result.element).not.toContain('labels=');
  });

  it('should include display attribute for non-checkbox displays', () => {
    state.facetsConfig.enabled = true;
    state.facetsConfig.fields = [
      { field: 'region', label: 'Region', display: 'select', searchable: false, disjunctive: false },
    ];
    const result = generateFacetsElement('src');
    expect(result.element).toContain('display="region:select"');
  });

  it('should not include display attribute when all are checkbox', () => {
    state.facetsConfig.enabled = true;
    state.facetsConfig.fields = [
      { field: 'region', label: 'Region', display: 'checkbox', searchable: false, disjunctive: false },
    ];
    const result = generateFacetsElement('src');
    expect(result.element).not.toContain('display=');
  });

  it('should include disjunctive attribute when fields are disjunctive', () => {
    state.facetsConfig.enabled = true;
    state.facetsConfig.fields = [
      { field: 'region', label: 'Region', display: 'checkbox', searchable: false, disjunctive: true },
    ];
    const result = generateFacetsElement('src');
    expect(result.element).toContain('disjunctive="region"');
  });

  it('should include searchable attribute when fields are searchable', () => {
    state.facetsConfig.enabled = true;
    state.facetsConfig.fields = [
      { field: 'region', label: 'Region', display: 'checkbox', searchable: true, disjunctive: false },
    ];
    const result = generateFacetsElement('src');
    expect(result.element).toContain('searchable="region"');
  });

  it('should include max-values when not default (6)', () => {
    state.facetsConfig.enabled = true;
    state.facetsConfig.maxValues = 10;
    state.facetsConfig.fields = [
      { field: 'region', label: 'Region', display: 'checkbox', searchable: false, disjunctive: false },
    ];
    const result = generateFacetsElement('src');
    expect(result.element).toContain('max-values="10"');
  });

  it('should not include max-values when default (6)', () => {
    state.facetsConfig.enabled = true;
    state.facetsConfig.maxValues = 6;
    state.facetsConfig.fields = [
      { field: 'region', label: 'Region', display: 'checkbox', searchable: false, disjunctive: false },
    ];
    const result = generateFacetsElement('src');
    expect(result.element).not.toContain('max-values=');
  });

  it('should include sort when not default (count)', () => {
    state.facetsConfig.enabled = true;
    state.facetsConfig.sort = 'alpha';
    state.facetsConfig.fields = [
      { field: 'region', label: 'Region', display: 'checkbox', searchable: false, disjunctive: false },
    ];
    const result = generateFacetsElement('src');
    expect(result.element).toContain('sort="alpha"');
  });

  it('should include hide-empty when true', () => {
    state.facetsConfig.enabled = true;
    state.facetsConfig.hideEmpty = true;
    state.facetsConfig.fields = [
      { field: 'region', label: 'Region', display: 'checkbox', searchable: false, disjunctive: false },
    ];
    const result = generateFacetsElement('src');
    expect(result.element).toContain('hide-empty');
  });
});

// =====================================================================
// generateMiddlewareElements
// =====================================================================
describe('generateMiddlewareElements', () => {
  beforeEach(() => {
    resetState();
  });

  it('should return empty elements when no middleware enabled', () => {
    const result = generateMiddlewareElements('chart-data');
    expect(result.elements).toBe('');
    expect(result.finalSourceId).toBe('chart-data');
  });

  it('should generate dsfr-data-normalize when normalize enabled', () => {
    state.normalizeConfig.enabled = true;
    state.normalizeConfig.trim = true;
    state.normalizeConfig.flatten = 'fields';
    const result = generateMiddlewareElements('chart-data');
    expect(result.elements).toContain('<dsfr-data-normalize');
    expect(result.elements).toContain('id="normalized-data"');
    expect(result.elements).toContain('source="chart-data"');
    expect(result.elements).toContain('trim');
    expect(result.elements).toContain('flatten="fields"');
    expect(result.finalSourceId).toBe('normalized-data');
  });

  it('should include all normalize attributes when set', () => {
    state.normalizeConfig.enabled = true;
    state.normalizeConfig.trim = true;
    state.normalizeConfig.numericAuto = true;
    state.normalizeConfig.numeric = 'pop,count';
    state.normalizeConfig.rename = 'old_name:new_name';
    state.normalizeConfig.stripHtml = true;
    state.normalizeConfig.replace = 'foo:bar';
    state.normalizeConfig.lowercaseKeys = true;
    state.normalizeConfig.flatten = 'data';
    const result = generateMiddlewareElements('src');
    expect(result.elements).toContain('trim');
    expect(result.elements).toContain('numeric-auto');
    expect(result.elements).toContain('numeric="pop,count"');
    expect(result.elements).toContain('rename="old_name:new_name"');
    expect(result.elements).toContain('strip-html');
    expect(result.elements).toContain('replace="foo:bar"');
    expect(result.elements).toContain('lowercase-keys');
    expect(result.elements).toContain('flatten="data"');
  });

  it('should chain normalize then facets', () => {
    state.normalizeConfig.enabled = true;
    state.normalizeConfig.flatten = 'fields';
    state.facetsConfig.enabled = true;
    state.facetsConfig.fields = [
      { field: 'region', label: 'Region', display: 'checkbox', searchable: false, disjunctive: false },
    ];
    const result = generateMiddlewareElements('chart-data');
    expect(result.elements).toContain('<dsfr-data-normalize');
    expect(result.elements).toContain('<dsfr-data-facets');
    // Facets should source from normalized-data
    expect(result.elements).toContain('source="normalized-data"');
    expect(result.finalSourceId).toBe('faceted-data');
  });

  it('should generate only facets when normalize disabled', () => {
    state.facetsConfig.enabled = true;
    state.facetsConfig.fields = [
      { field: 'region', label: 'Region', display: 'checkbox', searchable: false, disjunctive: false },
    ];
    const result = generateMiddlewareElements('chart-data');
    expect(result.elements).not.toContain('<dsfr-data-normalize');
    expect(result.elements).toContain('<dsfr-data-facets');
    expect(result.elements).toContain('source="chart-data"');
    expect(result.finalSourceId).toBe('faceted-data');
  });
});

// =====================================================================
// generateOdsQueryCode
// =====================================================================
describe('generateOdsQueryCode', () => {
  beforeEach(() => {
    resetState();
  });

  it('should generate ODS query with base-url and dataset-id', () => {
    state.aggregation = 'sum';
    const result = generateOdsQueryCode(
      { baseUrl: 'https://data.iledefrance.fr', datasetId: 'elus' },
      'region', 'population'
    );
    expect(result.queryElement).toContain('api-type="opendatasoft"');
    expect(result.queryElement).toContain('base-url="https://data.iledefrance.fr"');
    expect(result.queryElement).toContain('dataset-id="elus"');
    expect(result.chartSource).toBe('query-data');
  });

  it('should generate select with sum aggregation', () => {
    state.aggregation = 'sum';
    const result = generateOdsQueryCode(
      { baseUrl: 'https://ods.example.com', datasetId: 'ds1' },
      'region', 'population'
    );
    expect(result.queryElement).toContain('select="region, sum(population) as population__sum"');
    expect(result.valueField).toBe('population__sum');
  });

  it('should generate select with count aggregation', () => {
    state.aggregation = 'count';
    const result = generateOdsQueryCode(
      { baseUrl: 'https://ods.example.com', datasetId: 'ds1' },
      'region', 'population'
    );
    expect(result.queryElement).toContain('count(*) as count');
    expect(result.valueField).toBe('count');
  });

  it('should generate group-by from labelFieldPath', () => {
    state.aggregation = 'avg';
    const result = generateOdsQueryCode(
      { baseUrl: 'https://ods.example.com', datasetId: 'ds1' },
      'region', 'population'
    );
    expect(result.queryElement).toContain('group-by="region"');
    expect(result.labelField).toBe('region');
  });

  it('should generate order-by with sort order', () => {
    state.aggregation = 'sum';
    state.sortOrder = 'desc';
    const result = generateOdsQueryCode(
      { baseUrl: 'https://ods.example.com', datasetId: 'ds1' },
      'region', 'population'
    );
    expect(result.queryElement).toContain('order-by="population__sum:desc"');
  });

  it('should not include order-by when sortOrder is none', () => {
    state.aggregation = 'sum';
    state.sortOrder = 'none';
    const result = generateOdsQueryCode(
      { baseUrl: 'https://ods.example.com', datasetId: 'ds1' },
      'region', 'population'
    );
    expect(result.queryElement).not.toContain('order-by=');
  });

  it('should convert filter to ODSQL where clause in advanced mode', () => {
    state.advancedMode = true;
    state.queryFilter = 'region:eq:Bretagne';
    state.aggregation = 'sum';
    const result = generateOdsQueryCode(
      { baseUrl: 'https://ods.example.com', datasetId: 'ds1' },
      'region', 'population'
    );
    expect(result.queryElement).toContain('where=');
  });

  it('should use custom group-by and aggregate in advanced mode', () => {
    state.advancedMode = true;
    state.queryGroupBy = 'dept';
    state.queryAggregate = 'pop:sum:total_pop';
    state.sortOrder = 'desc';
    const result = generateOdsQueryCode(
      { baseUrl: 'https://ods.example.com', datasetId: 'ds1' },
      'region', 'population'
    );
    expect(result.queryElement).toContain('group-by="dept"');
    expect(result.queryElement).toContain('sum(pop) as total_pop');
    expect(result.valueField).toBe('total_pop');
  });

  it('should generate second series aggregation', () => {
    state.aggregation = 'sum';
    state.extraSeries = [{ field: 'budget', label: '' }];
    state.chartType = 'bar';
    const result = generateOdsQueryCode(
      { baseUrl: 'https://ods.example.com', datasetId: 'ds1' },
      'region', 'population'
    );
    expect(result.queryElement).toContain('sum(budget) as budget__sum');
    expect(result.valueField2).toBe('budget__sum');
  });
});

// =====================================================================
// generateTabularQueryCode
// =====================================================================
describe('generateTabularQueryCode', () => {
  beforeEach(() => {
    resetState();
  });

  it('should generate Tabular query with base-url and resource', () => {
    state.aggregation = 'sum';
    const result = generateTabularQueryCode(
      { baseUrl: 'https://tabular-api.data.gouv.fr', resourceId: 'abc-123' },
      'region', 'population'
    );
    expect(result.queryElement).toContain('api-type="tabular"');
    expect(result.queryElement).toContain('base-url="https://tabular-api.data.gouv.fr"');
    expect(result.queryElement).toContain('resource="abc-123"');
    expect(result.chartSource).toBe('query-data');
  });

  it('should generate aggregate with colon syntax', () => {
    state.aggregation = 'sum';
    const result = generateTabularQueryCode(
      { baseUrl: 'https://tabular-api.data.gouv.fr', resourceId: 'r1' },
      'region', 'population'
    );
    expect(result.queryElement).toContain('aggregate="population:sum"');
    expect(result.valueField).toBe('population__sum');
  });

  it('should generate group-by from labelFieldPath', () => {
    state.aggregation = 'avg';
    const result = generateTabularQueryCode(
      { baseUrl: 'https://tabular-api.data.gouv.fr', resourceId: 'r1' },
      'region', 'population'
    );
    expect(result.queryElement).toContain('group-by="region"');
  });

  it('should generate order-by with sort order', () => {
    state.aggregation = 'sum';
    state.sortOrder = 'asc';
    const result = generateTabularQueryCode(
      { baseUrl: 'https://tabular-api.data.gouv.fr', resourceId: 'r1' },
      'region', 'population'
    );
    expect(result.queryElement).toContain('order-by="population__sum:asc"');
  });

  it('should include filter in advanced mode', () => {
    state.advancedMode = true;
    state.queryFilter = 'region:eq:Bretagne';
    state.aggregation = 'sum';
    const result = generateTabularQueryCode(
      { baseUrl: 'https://tabular-api.data.gouv.fr', resourceId: 'r1' },
      'region', 'population'
    );
    expect(result.queryElement).toContain('filter="region:eq:Bretagne"');
  });

  it('should use custom aggregate in advanced mode', () => {
    state.advancedMode = true;
    state.queryAggregate = 'pop:sum';
    state.sortOrder = 'desc';
    const result = generateTabularQueryCode(
      { baseUrl: 'https://tabular-api.data.gouv.fr', resourceId: 'r1' },
      'region', 'population'
    );
    expect(result.queryElement).toContain('aggregate="pop:sum"');
    expect(result.valueField).toBe('pop__sum');
  });

  it('should generate second series aggregation', () => {
    state.aggregation = 'avg';
    state.extraSeries = [{ field: 'budget', label: '' }];
    state.chartType = 'line';
    state.fields = [{ name: 'budget', fullPath: 'budget', type: 'number', sample: 100 }];
    const result = generateTabularQueryCode(
      { baseUrl: 'https://tabular-api.data.gouv.fr', resourceId: 'r1' },
      'region', 'population'
    );
    expect(result.queryElement).toContain('budget:avg');
    expect(result.valueField2).toContain('budget');
  });
});

// =====================================================================
// generateDynamicCode (Grist dynamic)
// =====================================================================
describe('generateDynamicCode', () => {
  beforeEach(() => {
    resetState();
    document.body.innerHTML = `
      <div id="generated-code"></div>
      <div id="raw-data"></div>
      <select id="kpi-variant"><option value="">Default</option></select>
      <input id="kpi-unit" value="">
    `;
    state.generationMode = 'dynamic';
    state.savedSource = {
      id: '1',
      name: 'Ma source Grist',
      type: 'grist',
      apiUrl: 'https://grist.numerique.gouv.fr/api/docs/doc1/tables/Table1/records',
      documentId: 'doc1',
      tableId: 'Table1',
    };
    state.labelField = 'region';
    state.valueField = 'population';
    state.fields = [
      { name: 'region', fullPath: 'fields.region', type: 'string', sample: 'Bretagne' },
      { name: 'population', fullPath: 'fields.population', type: 'number', sample: 100 },
    ];
  });

  it('should generate dsfr-data-source + dsfr-data-query + dsfr-data-chart for bar chart', () => {
    state.chartType = 'bar';
    state.aggregation = 'sum';
    generateDynamicCode();
    const code = document.getElementById('generated-code')!.textContent!;
    expect(code).toContain('<dsfr-data-source');
    expect(code).toContain('<dsfr-data-query');
    expect(code).toContain('<dsfr-data-chart');
    expect(code).toContain('type="bar"');
    expect(code).toContain('transform="records"');
  });

  it('should use proxy URL for grist.numerique.gouv.fr', () => {
    generateDynamicCode();
    const code = document.getElementById('generated-code')!.textContent!;
    expect(code).toContain('grist-gouv-proxy');
    expect(code).toContain('/api/docs/doc1/tables/Table1/records');
  });

  it('should use proxy URL for docs.getgrist.com', () => {
    state.savedSource!.apiUrl = 'https://docs.getgrist.com/api/docs/doc2/tables/Table2/records';
    state.savedSource!.documentId = 'doc2';
    state.savedSource!.tableId = 'Table2';
    generateDynamicCode();
    const code = document.getElementById('generated-code')!.textContent!;
    expect(code).toContain('grist-proxy');
    expect(code).toContain('/api/docs/doc2/tables/Table2/records');
  });

  it('should use fields.X paths when normalize flatten is disabled', () => {
    state.normalizeConfig.enabled = false;
    state.aggregation = 'sum';
    generateDynamicCode();
    const code = document.getElementById('generated-code')!.textContent!;
    expect(code).toContain('group-by="fields.region"');
    expect(code).toContain('aggregate="fields.population:sum"');
  });

  it('should use flat field names when normalize flatten is enabled', () => {
    state.normalizeConfig.enabled = true;
    state.normalizeConfig.flatten = 'fields';
    state.aggregation = 'sum';
    generateDynamicCode();
    const code = document.getElementById('generated-code')!.textContent!;
    expect(code).toContain('group-by="region"');
    expect(code).toContain('aggregate="population:sum"');
    expect(code).not.toContain('group-by="fields.region"');
    expect(code).not.toContain('aggregate="fields.population:sum"');
  });

  it('should use codeField as group-by for map charts', () => {
    state.chartType = 'map';
    state.codeField = 'code_dept';
    state.fields.push({ name: 'code_dept', fullPath: 'fields.code_dept', type: 'string', sample: '35' });
    state.aggregation = 'sum';
    generateDynamicCode();
    const code = document.getElementById('generated-code')!.textContent!;
    expect(code).toContain('group-by="fields.code_dept"');
    expect(code).toContain('code-field="code_dept"');
  });

  it('should use flat codeField for map when normalize flatten enabled', () => {
    state.chartType = 'map';
    state.codeField = 'code_dept';
    state.normalizeConfig.enabled = true;
    state.normalizeConfig.flatten = 'fields';
    state.aggregation = 'sum';
    generateDynamicCode();
    const code = document.getElementById('generated-code')!.textContent!;
    expect(code).toContain('group-by="code_dept"');
    expect(code).not.toContain('group-by="fields.code_dept"');
  });

  it('should generate datalist for datalist type', () => {
    state.chartType = 'datalist';
    state.fields = [
      { name: 'region', fullPath: 'fields.region', type: 'string', sample: 'Bretagne' },
      { name: 'population', fullPath: 'fields.population', type: 'number', sample: 100 },
    ];
    state.datalistColumns = [
      { field: 'region', label: 'Region', visible: true, filtrable: false },
      { field: 'population', label: 'Pop.', visible: true, filtrable: false },
    ];
    generateDynamicCode();
    const code = document.getElementById('generated-code')!.textContent!;
    expect(code).toContain('<dsfr-data-source');
    expect(code).toContain('<dsfr-data-list');
    expect(code).toContain('colonnes="region:Region, population:Pop."');
    expect(code).not.toContain('<dsfr-data-chart');
  });

  it('should fallback to embedded for KPI type', () => {
    state.chartType = 'kpi';
    state.data = [{ value: 42 }];
    generateDynamicCode();
    const code = document.getElementById('generated-code')!.textContent!;
    // KPI generates embedded code, not dsfr-data-source
    expect(code).not.toContain('<dsfr-data-source');
    expect(code).toContain('kpi');
  });

  it('should include refresh attribute when refreshInterval > 0', () => {
    state.refreshInterval = 60;
    state.aggregation = 'sum';
    generateDynamicCode();
    const code = document.getElementById('generated-code')!.textContent!;
    expect(code).toContain('refresh="60"');
  });

  it('should not include refresh attribute when refreshInterval is 0', () => {
    state.refreshInterval = 0;
    state.aggregation = 'sum';
    generateDynamicCode();
    const code = document.getElementById('generated-code')!.textContent!;
    expect(code).not.toContain('refresh=');
  });

  it('should include second series attribute when extraSeries is set', () => {
    state.extraSeries = [{ field: 'budget', label: '' }];
    state.fields.push({ name: 'budget', fullPath: 'fields.budget', type: 'number', sample: 500 });
    state.aggregation = 'sum';
    generateDynamicCode();
    const code = document.getElementById('generated-code')!.textContent!;
    expect(code).toContain('value-fields=');
  });

  it('should generate horizontalBar as type="bar" with horizontal attribute', () => {
    state.chartType = 'horizontalBar';
    state.aggregation = 'sum';
    generateDynamicCode();
    const code = document.getElementById('generated-code')!.textContent!;
    expect(code).toContain('type="bar"');
    expect(code).toContain('horizontal');
  });

  it('should generate doughnut as type="pie" without fill', () => {
    state.chartType = 'doughnut';
    state.aggregation = 'sum';
    generateDynamicCode();
    const code = document.getElementById('generated-code')!.textContent!;
    expect(code).toContain('type="pie"');
    expect(code).not.toContain('fill');
  });

  it('should use advanced mode custom query settings', () => {
    state.advancedMode = true;
    state.queryFilter = 'population:gt:1000';
    state.queryGroupBy = 'dept';
    state.queryAggregate = 'population:sum';
    state.sortOrder = 'asc';
    generateDynamicCode();
    const code = document.getElementById('generated-code')!.textContent!;
    expect(code).toContain('group-by="dept"');
    expect(code).toContain('aggregate="population:sum"');
    expect(code).toContain('filter=');
  });

  it('should include facets when enabled', () => {
    state.facetsConfig.enabled = true;
    state.facetsConfig.fields = [
      { field: 'region', label: 'Region', display: 'checkbox', searchable: false, disjunctive: false },
    ];
    state.aggregation = 'sum';
    generateDynamicCode();
    const code = document.getElementById('generated-code')!.textContent!;
    // Facets are part of middleware between source and query
    expect(code).toContain('<dsfr-data-facets');
  });

  it('should do nothing when source is not grist', () => {
    state.savedSource = { id: '1', name: 'API', type: 'api', apiUrl: 'https://example.com' };
    generateDynamicCode();
    const code = document.getElementById('generated-code')!.textContent!;
    expect(code).toBe('');
  });

  it('should generate map with sequentialAscending palette', () => {
    state.chartType = 'map';
    state.codeField = 'code_dept';
    state.palette = 'default';
    state.aggregation = 'sum';
    generateDynamicCode();
    const code = document.getElementById('generated-code')!.textContent!;
    expect(code).toContain('selected-palette="sequentialAscending"');
  });

  it('should keep sequential/divergent palette for maps', () => {
    state.chartType = 'map';
    state.codeField = 'code_dept';
    state.palette = 'sequentialDescending';
    state.aggregation = 'sum';
    generateDynamicCode();
    const code = document.getElementById('generated-code')!.textContent!;
    expect(code).toContain('selected-palette="sequentialDescending"');
  });
});

// =====================================================================
// generateDynamicCodeForApi (API dynamic)
// =====================================================================
describe('generateDynamicCodeForApi', () => {
  beforeEach(() => {
    resetState();
    document.body.innerHTML = `
      <div id="generated-code"></div>
      <div id="raw-data"></div>
      <select id="kpi-variant"><option value="">Default</option></select>
      <input id="kpi-unit" value="">
    `;
    state.generationMode = 'dynamic';
  });

  it('should detect ODS source and generate dsfr-data-source + dsfr-data-query', () => {
    state.savedSource = {
      id: '1', name: 'ODS Source', type: 'api',
      apiUrl: 'https://data.iledefrance.fr/api/explore/v2.1/catalog/datasets/elus-regionaux/records',
    };
    state.labelField = 'region';
    state.valueField = 'population';
    state.aggregation = 'sum';
    state.chartType = 'bar';
    generateDynamicCodeForApi();
    const code = document.getElementById('generated-code')!.textContent!;
    expect(code).toContain('<dsfr-data-source');
    expect(code).toContain('api-type="opendatasoft"');
    expect(code).toContain('base-url="https://data.iledefrance.fr"');
    expect(code).toContain('dataset-id="elus-regionaux"');
    expect(code).toContain('<dsfr-data-query');
    expect(code).toContain('source="chart-src"');
    expect(code).toContain('<dsfr-data-chart');
  });

  it('should detect Tabular source and generate dsfr-data-source + dsfr-data-query', () => {
    state.savedSource = {
      id: '1', name: 'Tabular Source', type: 'api',
      apiUrl: 'https://tabular-api.data.gouv.fr/api/resources/abc-123/data/',
    };
    state.labelField = 'region';
    state.valueField = 'population';
    state.aggregation = 'sum';
    state.chartType = 'bar';
    generateDynamicCodeForApi();
    const code = document.getElementById('generated-code')!.textContent!;
    expect(code).toContain('<dsfr-data-source');
    expect(code).toContain('api-type="tabular"');
    expect(code).toContain('base-url="https://tabular-api.data.gouv.fr"');
    expect(code).toContain('resource="abc-123"');
    expect(code).toContain('<dsfr-data-query');
    expect(code).toContain('source="chart-src"');
  });

  it('should use dsfr-data-source for generic API sources', () => {
    state.savedSource = {
      id: '1', name: 'Generic API', type: 'api',
      apiUrl: 'https://example.com/api/data',
    };
    state.labelField = 'region';
    state.valueField = 'population';
    state.aggregation = 'sum';
    state.chartType = 'bar';
    generateDynamicCodeForApi();
    const code = document.getElementById('generated-code')!.textContent!;
    expect(code).toContain('<dsfr-data-source');
    expect(code).toContain('url="https://example.com/api/data"');
    expect(code).toContain('<dsfr-data-query');
    expect(code).toContain('<dsfr-data-chart');
  });

  it('should generate facets for ODS sources', () => {
    state.savedSource = {
      id: '1', name: 'ODS Source', type: 'api',
      apiUrl: 'https://data.iledefrance.fr/api/explore/v2.1/catalog/datasets/elus/records',
    };
    state.labelField = 'region';
    state.valueField = 'population';
    state.aggregation = 'sum';
    state.chartType = 'bar';
    state.facetsConfig.enabled = true;
    state.facetsConfig.fields = [
      { field: 'dept', label: 'Departement', display: 'checkbox', searchable: false, disjunctive: false },
    ];
    generateDynamicCodeForApi();
    const code = document.getElementById('generated-code')!.textContent!;
    expect(code).toContain('<dsfr-data-facets');
    expect(code).toContain('fields="dept"');
  });

  it('should generate facets for Tabular sources', () => {
    state.savedSource = {
      id: '1', name: 'Tabular', type: 'api',
      apiUrl: 'https://tabular-api.data.gouv.fr/api/resources/abc-123/data/',
    };
    state.labelField = 'region';
    state.valueField = 'population';
    state.aggregation = 'sum';
    state.chartType = 'bar';
    state.facetsConfig.enabled = true;
    state.facetsConfig.fields = [
      { field: 'dept', label: 'Departement', display: 'checkbox', searchable: false, disjunctive: false },
    ];
    generateDynamicCodeForApi();
    const code = document.getElementById('generated-code')!.textContent!;
    expect(code).toContain('<dsfr-data-facets');
  });

  it('should use codeField as group-by for map charts', () => {
    state.savedSource = {
      id: '1', name: 'ODS Source', type: 'api',
      apiUrl: 'https://data.iledefrance.fr/api/explore/v2.1/catalog/datasets/elus/records',
    };
    state.chartType = 'map';
    state.labelField = 'region';
    state.valueField = 'population';
    state.codeField = 'code_dept';
    state.aggregation = 'sum';
    generateDynamicCodeForApi();
    const code = document.getElementById('generated-code')!.textContent!;
    expect(code).toContain('group-by="code_dept"');
    expect(code).toContain('code-field="code_dept"');
  });

  it('should generate dsfr-data-source + dsfr-data-kpi for ODS KPI type', () => {
    state.savedSource = {
      id: '1', name: 'ODS Source', type: 'api',
      apiUrl: 'https://data.iledefrance.fr/api/explore/v2.1/catalog/datasets/elus/records',
    };
    state.chartType = 'kpi';
    state.valueField = 'population';
    state.aggregation = 'avg';
    state.data = [{ value: 99 }];
    generateDynamicCodeForApi();
    const code = document.getElementById('generated-code')!.textContent!;
    expect(code).toContain('<dsfr-data-source');
    expect(code).toContain('api-type="opendatasoft"');
    expect(code).toContain('select="avg(population) as value"');
    expect(code).toContain('<dsfr-data-kpi');
    expect(code).toContain('valeur="value"');
  });

  it('should generate datalist for ODS source with server-side pagination', () => {
    state.savedSource = {
      id: '1', name: 'ODS Source', type: 'api',
      apiUrl: 'https://data.iledefrance.fr/api/explore/v2.1/catalog/datasets/elus/records',
    };
    state.chartType = 'datalist';
    state.labelField = 'region';
    state.fields = [{ name: 'region', type: 'string', sample: 'Bretagne' }];
    generateDynamicCodeForApi();
    const code = document.getElementById('generated-code')!.textContent!;
    // Must use dsfr-data-source + dsfr-data-query pattern
    expect(code).toContain('<dsfr-data-source');
    expect(code).toContain('api-type="opendatasoft"');
    expect(code).toContain('<dsfr-data-query');
    expect(code).toContain('<dsfr-data-list');
    expect(code).not.toContain('<dsfr-data-chart');
    expect(code).toContain('server-side');
    expect(code).toContain('page-size="20"');
    expect(code).toContain('server-tri');
    expect(code).toContain('pagination="20"');
  });

  it('should generate datalist for Tabular source with server-side pagination', () => {
    state.savedSource = {
      id: '1', name: 'Tabular', type: 'api',
      apiUrl: 'https://tabular-api.data.gouv.fr/api/resources/abc-123/data/',
    };
    state.chartType = 'datalist';
    state.labelField = 'region';
    state.fields = [{ name: 'region', type: 'string', sample: 'Bretagne' }];
    generateDynamicCodeForApi();
    const code = document.getElementById('generated-code')!.textContent!;
    // Must use dsfr-data-source + dsfr-data-query pattern
    expect(code).toContain('<dsfr-data-source');
    expect(code).toContain('api-type="tabular"');
    expect(code).toContain('<dsfr-data-query');
    expect(code).toContain('<dsfr-data-list');
    expect(code).toContain('server-side');
    expect(code).toContain('page-size="20"');
    expect(code).toContain('server-tri');
    expect(code).toContain('pagination="20"');
  });

  it('should generate datalist for generic API source without server-side', () => {
    state.savedSource = {
      id: '1', name: 'API', type: 'api',
      apiUrl: 'https://example.com/api/data',
    };
    state.chartType = 'datalist';
    state.labelField = 'region';
    state.fields = [{ name: 'region', type: 'string', sample: 'Bretagne' }];
    generateDynamicCodeForApi();
    const code = document.getElementById('generated-code')!.textContent!;
    expect(code).toContain('<dsfr-data-source');
    expect(code).toContain('<dsfr-data-list');
    expect(code).not.toContain('server-side');
    expect(code).not.toContain('server-tri');
  });

  it('should use flat field paths when normalize flatten enabled', () => {
    state.savedSource = {
      id: '1', name: 'API', type: 'api',
      apiUrl: 'https://example.com/api/data',
    };
    state.labelField = 'region';
    state.valueField = 'population';
    state.fields = [
      { name: 'region', fullPath: 'data.region', type: 'string', sample: 'Bretagne' },
      { name: 'population', fullPath: 'data.population', type: 'number', sample: 100 },
    ];
    state.normalizeConfig.enabled = true;
    state.normalizeConfig.flatten = 'data';
    state.aggregation = 'sum';
    state.chartType = 'bar';
    generateDynamicCodeForApi();
    const code = document.getElementById('generated-code')!.textContent!;
    // With flatten enabled, should use flat field names
    expect(code).toContain('group-by="region"');
    expect(code).not.toContain('group-by="data.region"');
  });

  it('should use fullPath when normalize flatten is disabled', () => {
    state.savedSource = {
      id: '1', name: 'API', type: 'api',
      apiUrl: 'https://example.com/api/data',
    };
    state.labelField = 'region';
    state.valueField = 'population';
    state.fields = [
      { name: 'region', fullPath: 'data.region', type: 'string', sample: 'Bretagne' },
      { name: 'population', fullPath: 'data.population', type: 'number', sample: 100 },
    ];
    state.normalizeConfig.enabled = false;
    state.aggregation = 'sum';
    state.chartType = 'bar';
    generateDynamicCodeForApi();
    const code = document.getElementById('generated-code')!.textContent!;
    // Without flatten, should use fullPath
    expect(code).toContain('group-by="data.region"');
  });

  it('should do nothing when source is not api type', () => {
    state.savedSource = { id: '1', name: 'Grist', type: 'grist' };
    generateDynamicCodeForApi();
    const code = document.getElementById('generated-code')!.textContent!;
    expect(code).toBe('');
  });

  it('should include refresh attribute when set', () => {
    state.savedSource = {
      id: '1', name: 'API', type: 'api',
      apiUrl: 'https://example.com/api/data',
    };
    state.labelField = 'region';
    state.valueField = 'population';
    state.aggregation = 'sum';
    state.chartType = 'bar';
    state.refreshInterval = 120;
    generateDynamicCodeForApi();
    const code = document.getElementById('generated-code')!.textContent!;
    expect(code).toContain('refresh="120"');
  });

  it('should include second series for API sources', () => {
    state.savedSource = {
      id: '1', name: 'ODS Source', type: 'api',
      apiUrl: 'https://data.iledefrance.fr/api/explore/v2.1/catalog/datasets/elus/records',
    };
    state.labelField = 'region';
    state.valueField = 'population';
    state.extraSeries = [{ field: 'budget', label: '' }];
    state.aggregation = 'sum';
    state.chartType = 'bar';
    generateDynamicCodeForApi();
    const code = document.getElementById('generated-code')!.textContent!;
    expect(code).toContain('value-fields=');
  });
});

// =====================================================================
// Regression tests for recently fixed bugs
// =====================================================================
describe('regression tests', () => {
  beforeEach(() => {
    resetState();
    document.body.innerHTML = `
      <div id="generated-code"></div>
      <div id="raw-data"></div>
      <select id="kpi-variant"><option value="">Default</option></select>
      <input id="kpi-unit" value="">
    `;
  });

  it('BUG FIX: normalize flatten should produce flat field paths in Grist dynamic code', () => {
    state.savedSource = {
      id: '1', name: 'Grist', type: 'grist',
      apiUrl: 'https://grist.numerique.gouv.fr/api/docs/doc1/tables/Table1/records',
      documentId: 'doc1', tableId: 'Table1',
    };
    state.labelField = 'region';
    state.valueField = 'population';
    state.fields = [
      { name: 'region', fullPath: 'fields.region', type: 'string', sample: 'Bretagne' },
      { name: 'population', fullPath: 'fields.population', type: 'number', sample: 100 },
    ];
    state.normalizeConfig.enabled = true;
    state.normalizeConfig.flatten = 'fields';
    state.aggregation = 'sum';
    state.chartType = 'bar';

    generateDynamicCode();
    const code = document.getElementById('generated-code')!.textContent!;

    // After flatten, paths should be flat (region, not fields.region)
    expect(code).toContain('group-by="region"');
    expect(code).toContain('aggregate="population:sum"');
    expect(code).not.toContain('group-by="fields.region"');
    expect(code).not.toContain('aggregate="fields.population:sum"');
  });

  it('BUG FIX: map should group by codeField in Grist dynamic mode', () => {
    state.savedSource = {
      id: '1', name: 'Grist', type: 'grist',
      apiUrl: 'https://grist.numerique.gouv.fr/api/docs/doc1/tables/Table1/records',
      documentId: 'doc1', tableId: 'Table1',
    };
    state.chartType = 'map';
    state.labelField = 'region';
    state.valueField = 'population';
    state.codeField = 'code_dept';
    state.fields = [
      { name: 'region', fullPath: 'fields.region', type: 'string', sample: 'Bretagne' },
      { name: 'population', fullPath: 'fields.population', type: 'number', sample: 100 },
      { name: 'code_dept', fullPath: 'fields.code_dept', type: 'string', sample: '35' },
    ];
    state.aggregation = 'sum';

    generateDynamicCode();
    const code = document.getElementById('generated-code')!.textContent!;

    // Map should group by codeField, not labelField
    expect(code).toContain('group-by="fields.code_dept"');
    expect(code).not.toContain('group-by="fields.region"');
  });

  it('BUG FIX: facets should be generated for ODS API sources', () => {
    state.savedSource = {
      id: '1', name: 'ODS', type: 'api',
      apiUrl: 'https://data.iledefrance.fr/api/explore/v2.1/catalog/datasets/elus/records',
    };
    state.labelField = 'region';
    state.valueField = 'population';
    state.aggregation = 'sum';
    state.chartType = 'bar';
    state.facetsConfig.enabled = true;
    state.facetsConfig.fields = [
      { field: 'dept', label: 'Departement', display: 'checkbox', searchable: false, disjunctive: false },
    ];

    generateDynamicCodeForApi();
    const code = document.getElementById('generated-code')!.textContent!;

    expect(code).toContain('<dsfr-data-facets');
    expect(code).toContain('fields="dept"');
  });

  it('BUG FIX: facets should be generated for Tabular API sources', () => {
    state.savedSource = {
      id: '1', name: 'Tabular', type: 'api',
      apiUrl: 'https://tabular-api.data.gouv.fr/api/resources/abc-123/data/',
    };
    state.labelField = 'region';
    state.valueField = 'population';
    state.aggregation = 'sum';
    state.chartType = 'bar';
    state.facetsConfig.enabled = true;
    state.facetsConfig.fields = [
      { field: 'dept', label: 'Departement', display: 'checkbox', searchable: false, disjunctive: false },
    ];

    generateDynamicCodeForApi();
    const code = document.getElementById('generated-code')!.textContent!;

    expect(code).toContain('<dsfr-data-facets');
    expect(code).toContain('fields="dept"');
  });

  it('BUG FIX: map codeField + normalize flatten in Grist dynamic code', () => {
    state.savedSource = {
      id: '1', name: 'Grist', type: 'grist',
      apiUrl: 'https://grist.numerique.gouv.fr/api/docs/doc1/tables/Table1/records',
      documentId: 'doc1', tableId: 'Table1',
    };
    state.chartType = 'map';
    state.labelField = 'region';
    state.valueField = 'population';
    state.codeField = 'code_dept';
    state.fields = [
      { name: 'region', fullPath: 'fields.region', type: 'string', sample: 'Bretagne' },
      { name: 'population', fullPath: 'fields.population', type: 'number', sample: 100 },
      { name: 'code_dept', fullPath: 'fields.code_dept', type: 'string', sample: '35' },
    ];
    state.normalizeConfig.enabled = true;
    state.normalizeConfig.flatten = 'fields';
    state.aggregation = 'sum';

    generateDynamicCode();
    const code = document.getElementById('generated-code')!.textContent!;

    // After flatten, map should use flat codeField path
    expect(code).toContain('group-by="code_dept"');
    expect(code).not.toContain('group-by="fields.code_dept"');
  });
});

// =====================================================================
// Regression: api-type must be on dsfr-data-source, never on dsfr-data-query
// =====================================================================
describe('regression: api-type on dsfr-data-source not dsfr-data-query', () => {
  beforeEach(() => {
    resetState();
    document.body.innerHTML = `
      <div id="generated-code"></div>
      <div id="raw-data"></div>
      <select id="kpi-variant"><option value="">Default</option></select>
      <input id="kpi-unit" value="">
    `;
    state.generationMode = 'dynamic';
  });

  /**
   * Verify that api-type appears on <dsfr-data-source>, NOT on <dsfr-data-query>.
   */
  function assertNoDeprecatedPattern(code: string) {
    // api-type must NOT appear on dsfr-data-query
    expect(code).not.toMatch(/<dsfr-data-query[^>]*api-type=/);
    // api-type must appear on dsfr-data-source (if present at all)
    if (code.includes('api-type=')) {
      expect(code).toMatch(/<dsfr-data-source[^>]*api-type=/);
    }
  }

  it('ODS bar chart should use dsfr-data-source for api-type, not dsfr-data-query', () => {
    state.savedSource = {
      id: '1', name: 'ODS', type: 'api',
      apiUrl: 'https://data.iledefrance.fr/api/explore/v2.1/catalog/datasets/elus/records',
    };
    state.labelField = 'region';
    state.valueField = 'population';
    state.aggregation = 'sum';
    state.chartType = 'bar';
    generateDynamicCodeForApi();
    const code = document.getElementById('generated-code')!.textContent!;
    assertNoDeprecatedPattern(code);
  });

  it('Tabular bar chart should use dsfr-data-source for api-type, not dsfr-data-query', () => {
    state.savedSource = {
      id: '1', name: 'Tabular', type: 'api',
      apiUrl: 'https://tabular-api.data.gouv.fr/api/resources/abc-123/data/',
    };
    state.labelField = 'region';
    state.valueField = 'population';
    state.aggregation = 'sum';
    state.chartType = 'bar';
    generateDynamicCodeForApi();
    const code = document.getElementById('generated-code')!.textContent!;
    assertNoDeprecatedPattern(code);
  });

  it('ODS datalist should use dsfr-data-source for api-type, not dsfr-data-query', () => {
    state.savedSource = {
      id: '1', name: 'ODS', type: 'api',
      apiUrl: 'https://data.iledefrance.fr/api/explore/v2.1/catalog/datasets/elus/records',
    };
    state.chartType = 'datalist';
    state.labelField = 'region';
    state.fields = [{ name: 'region', type: 'string', sample: 'Bretagne' }];
    generateDynamicCodeForApi();
    const code = document.getElementById('generated-code')!.textContent!;
    assertNoDeprecatedPattern(code);
  });

  it('Tabular datalist should use dsfr-data-source for api-type, not dsfr-data-query', () => {
    state.savedSource = {
      id: '1', name: 'Tabular', type: 'api',
      apiUrl: 'https://tabular-api.data.gouv.fr/api/resources/abc-123/data/',
    };
    state.chartType = 'datalist';
    state.labelField = 'region';
    state.fields = [{ name: 'region', type: 'string', sample: 'Bretagne' }];
    generateDynamicCodeForApi();
    const code = document.getElementById('generated-code')!.textContent!;
    assertNoDeprecatedPattern(code);
  });

  it('ODS map should use dsfr-data-source for api-type, not dsfr-data-query', () => {
    state.savedSource = {
      id: '1', name: 'ODS', type: 'api',
      apiUrl: 'https://data.iledefrance.fr/api/explore/v2.1/catalog/datasets/elus/records',
    };
    state.chartType = 'map';
    state.labelField = 'region';
    state.valueField = 'population';
    state.codeField = 'code_dept';
    state.aggregation = 'sum';
    generateDynamicCodeForApi();
    const code = document.getElementById('generated-code')!.textContent!;
    assertNoDeprecatedPattern(code);
  });

  it('Tabular map should use dsfr-data-source for api-type, not dsfr-data-query', () => {
    state.savedSource = {
      id: '1', name: 'Tabular', type: 'api',
      apiUrl: 'https://tabular-api.data.gouv.fr/api/resources/abc-123/data/',
    };
    state.chartType = 'map';
    state.labelField = 'region';
    state.valueField = 'population';
    state.codeField = 'code_dept';
    state.aggregation = 'sum';
    generateDynamicCodeForApi();
    const code = document.getElementById('generated-code')!.textContent!;
    assertNoDeprecatedPattern(code);
  });

  it('ODS chart with facets should use dsfr-data-source for api-type, not dsfr-data-query', () => {
    state.savedSource = {
      id: '1', name: 'ODS', type: 'api',
      apiUrl: 'https://data.iledefrance.fr/api/explore/v2.1/catalog/datasets/elus/records',
    };
    state.labelField = 'region';
    state.valueField = 'population';
    state.aggregation = 'sum';
    state.chartType = 'bar';
    state.facetsConfig.enabled = true;
    state.facetsConfig.fields = [
      { field: 'dept', label: 'Departement', display: 'checkbox', searchable: false, disjunctive: false },
    ];
    generateDynamicCodeForApi();
    const code = document.getElementById('generated-code')!.textContent!;
    assertNoDeprecatedPattern(code);
  });
});

// =====================================================================
// Alignment tests: DSFR_TAG_MAP covers all chart types
// =====================================================================
describe('alignment: chart types in DSFR_TAG_MAP', () => {
  beforeEach(() => {
    resetState();
    document.body.innerHTML = `
      <div id="generated-code"></div>
      <div id="raw-data"></div>
      <select id="kpi-variant"><option value="">Default</option></select>
      <input id="kpi-unit" value="">
    `;
  });

  const chartTypesWithDsfrTag: Array<{ builderType: string; expectedTag: string }> = [
    { builderType: 'bar', expectedTag: 'bar-chart' },
    { builderType: 'horizontalBar', expectedTag: 'bar-chart' },
    { builderType: 'line', expectedTag: 'line-chart' },
    { builderType: 'pie', expectedTag: 'pie-chart' },
    { builderType: 'doughnut', expectedTag: 'pie-chart' },
    { builderType: 'radar', expectedTag: 'radar-chart' },
    { builderType: 'scatter', expectedTag: 'scatter-chart' },
    { builderType: 'gauge', expectedTag: 'gauge-chart' },
    { builderType: 'map', expectedTag: 'map-chart' },
  ];

  for (const { builderType, expectedTag } of chartTypesWithDsfrTag) {
    it(`should generate ${expectedTag} for ${builderType} type in local data code`, () => {
      state.chartType = builderType as any;
      state.labelField = 'region';
      state.valueField = 'population';
      state.codeField = 'code_dept';
      state.data = [
        { region: 'Bretagne', value: 100, code_dept: '35' },
        { region: 'Normandie', value: 200, code_dept: '76' },
      ];
      state.title = 'Test chart';

      generateCodeForLocalData();

      const code = document.getElementById('generated-code')!.textContent!;
      expect(code).toContain(`<${expectedTag}`);
    });
  }

  it('should generate KPI card (not DSFR tag) for kpi type', () => {
    state.chartType = 'kpi';
    state.data = [{ value: 42 }];
    state.title = 'Test';
    generateCodeForLocalData();
    const code = document.getElementById('generated-code')!.textContent!;
    expect(code).toContain('kpi-card');
    expect(code).not.toContain('-chart');
  });

  it('should generate datalist (not DSFR tag) for datalist type', () => {
    state.chartType = 'datalist';
    state.localData = [{ region: 'Bretagne' }];
    state.fields = [{ name: 'region', type: 'string', sample: 'Bretagne' }];
    state.labelField = 'region';
    generateCodeForLocalData();
    const code = document.getElementById('generated-code')!.textContent!;
    expect(code).toContain('dsfr-data-list');
  });
});

// =====================================================================
// Alignment: all aggregation types work in dsfr-data-query code
// =====================================================================
describe('alignment: aggregation types in generateDsfrDataQueryCode', () => {
  beforeEach(() => {
    resetState();
  });

  const aggregations = ['avg', 'sum', 'count', 'min', 'max'] as const;

  for (const agg of aggregations) {
    it(`should handle ${agg} aggregation`, () => {
      state.aggregation = agg;
      state.sortOrder = 'desc';
      const result = generateDsfrDataQueryCode('src', 'region', 'population');
      // generateDsfrDataQueryCode always uses valueFieldPath:aggregation format
      expect(result.queryElement).toContain(`aggregate="population:${agg}"`);
    });
  }
});

// =====================================================================
// Alignment: all aggregation types work in ODS query code
// =====================================================================
describe('alignment: aggregation types in generateOdsQueryCode', () => {
  beforeEach(() => {
    resetState();
  });

  const aggregations = ['avg', 'sum', 'count', 'min', 'max'] as const;

  for (const agg of aggregations) {
    it(`should handle ${agg} aggregation in ODS query`, () => {
      state.aggregation = agg;
      state.sortOrder = 'desc';
      const result = generateOdsQueryCode(
        { baseUrl: 'https://ods.example.com', datasetId: 'ds1' },
        'region', 'population'
      );
      if (agg === 'count') {
        expect(result.queryElement).toContain('count(*) as count');
      } else {
        expect(result.queryElement).toContain(`${agg}(population)`);
      }
    });
  }
});

// =====================================================================
// Alignment: all aggregation types work in Tabular query code
// =====================================================================
describe('alignment: aggregation types in generateTabularQueryCode', () => {
  beforeEach(() => {
    resetState();
  });

  const aggregations = ['avg', 'sum', 'count', 'min', 'max'] as const;

  for (const agg of aggregations) {
    it(`should handle ${agg} aggregation in Tabular query`, () => {
      state.aggregation = agg;
      state.sortOrder = 'desc';
      const result = generateTabularQueryCode(
        { baseUrl: 'https://tabular-api.data.gouv.fr', resourceId: 'r1' },
        'region', 'population'
      );
      expect(result.queryElement).toContain(`population:${agg}`);
    });
  }
});

// =====================================================================
// Alignment: all filter operators work in filterToOdsql
// =====================================================================
describe('alignment: all filter operators in filterToOdsql', () => {
  const operators = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'contains', 'notcontains', 'in', 'notin', 'isnull', 'isnotnull'];

  for (const op of operators) {
    it(`should handle ${op} operator`, () => {
      const result = filterToOdsql(`field:${op}:value`);
      expect(result).not.toBe('');
    });
  }
});

// =====================================================================
// Alignment: all filter operators work in applyLocalFilter
// =====================================================================
describe('alignment: all filter operators in applyLocalFilter', () => {
  const data = [{ field: 'value', num: 10 }];
  const operators = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'contains', 'notcontains', 'isnull', 'isnotnull'];

  for (const op of operators) {
    it(`should handle ${op} operator without crashing`, () => {
      const result = applyLocalFilter(data, `field:${op}:value`);
      expect(Array.isArray(result)).toBe(true);
    });
  }
});

// =====================================================================
// Alignment: middleware attributes coverage
// =====================================================================
describe('alignment: normalize config attributes', () => {
  beforeEach(() => {
    resetState();
  });

  it('should generate normalize with all boolean attributes', () => {
    state.normalizeConfig.enabled = true;
    state.normalizeConfig.trim = true;
    state.normalizeConfig.numericAuto = true;
    state.normalizeConfig.stripHtml = true;
    state.normalizeConfig.lowercaseKeys = true;

    const result = generateMiddlewareElements('src');
    expect(result.elements).toContain('trim');
    expect(result.elements).toContain('numeric-auto');
    expect(result.elements).toContain('strip-html');
    expect(result.elements).toContain('lowercase-keys');
  });

  it('should generate normalize with all string attributes', () => {
    state.normalizeConfig.enabled = true;
    state.normalizeConfig.numeric = 'pop,count';
    state.normalizeConfig.rename = 'old:new';
    state.normalizeConfig.replace = 'a:b';
    state.normalizeConfig.flatten = 'fields';

    const result = generateMiddlewareElements('src');
    expect(result.elements).toContain('numeric="pop,count"');
    expect(result.elements).toContain('rename="old:new"');
    expect(result.elements).toContain('replace="a:b"');
    expect(result.elements).toContain('flatten="fields"');
  });

  it('should not include attributes that are false/empty', () => {
    state.normalizeConfig.enabled = true;
    // All others default to false/empty

    const result = generateMiddlewareElements('src');
    expect(result.elements).toContain('<dsfr-data-normalize');
    expect(result.elements).not.toContain('trim');
    expect(result.elements).not.toContain('numeric-auto');
    expect(result.elements).not.toContain('strip-html');
    expect(result.elements).not.toContain('lowercase-keys');
    expect(result.elements).not.toContain('flatten=');
    expect(result.elements).not.toContain('numeric=');
    expect(result.elements).not.toContain('rename=');
    expect(result.elements).not.toContain('replace=');
  });
});

// =====================================================================
// generateCode (API fetch embedded mode)
// =====================================================================
describe('generateCode (API fetch embedded)', () => {
  beforeEach(() => {
    resetState();
    document.body.innerHTML = `
      <div id="generated-code"></div>
      <div id="raw-data"></div>
      <select id="kpi-variant"><option value="">Default</option><option value="info">Info</option></select>
      <input id="kpi-unit" value="">
    `;
  });

  it('should generate KPI with fetch and formatKPIValue', () => {
    state.chartType = 'kpi';
    state.title = 'Population totale';
    state.valueField = 'population';
    state.aggregation = 'sum';
    generateCode('https://api.example.com?select=sum(population)%20as%20value&limit=1');
    const code = document.getElementById('generated-code')!.textContent!;
    expect(code).toContain('kpi-card');
    expect(code).toContain('kpi-value');
    expect(code).toContain('Population totale');
    expect(code).toContain('async function loadKPI');
    expect(code).toContain('fetch(API_URL)');
    expect(code).toContain('json.results');
    expect(code).toContain('formatKPIValue');
  });

  it('should generate KPI with variant class', () => {
    state.chartType = 'kpi';
    state.title = 'Alerte';
    const variantSelect = document.getElementById('kpi-variant') as HTMLSelectElement;
    variantSelect.value = 'info';
    generateCode('https://api.example.com?select=count(*)&limit=1');
    const code = document.getElementById('generated-code')!.textContent!;
    expect(code).toContain('kpi-card--info');
  });

  it('should generate KPI with unit', () => {
    state.chartType = 'kpi';
    state.title = 'Prix moyen';
    const unitInput = document.getElementById('kpi-unit') as HTMLInputElement;
    unitInput.value = '\u20ac';
    generateCode('https://api.example.com?select=avg(prix)%20as%20value&limit=1');
    const code = document.getElementById('generated-code')!.textContent!;
    expect(code).toContain('\u20ac');
  });

  it('should generate gauge with fetch and dynamic value', () => {
    state.chartType = 'gauge';
    state.title = 'Taux de completion';
    generateCode('https://api.example.com?select=avg(taux)%20as%20value&limit=1');
    const code = document.getElementById('generated-code')!.textContent!;
    expect(code).toContain('gauge-chart');
    expect(code).toContain('Taux de completion');
    expect(code).toContain('async function loadGauge');
    expect(code).toContain('percent=');
    expect(code).toContain('gauge-container');
  });

  it('should generate datalist with fetch and ODS pagination helper', () => {
    state.chartType = 'datalist';
    state.title = 'Ma liste';
    state.labelField = 'region';
    state.datalistColumns = [
      { field: 'region', label: 'Region', visible: true, filtrable: false },
      { field: 'population', label: 'Pop.', visible: true, filtrable: false },
    ];
    state.datalistRecherche = true;
    state.datalistExportCsv = true;
    generateCode('https://api.example.com?limit=200');
    const code = document.getElementById('generated-code')!.textContent!;
    expect(code).toContain('dsfr-data-list');
    expect(code).toContain('colonnes="region:Region, population:Pop."');
    expect(code).toContain('recherche');
    expect(code).toContain('export="csv"');
    expect(code).toContain('async function loadTable');
    expect(code).toContain('fetchAllODS');
    expect(code).toContain('onSourceData(data)');
  });

  it('should generate datalist with multiple export formats', () => {
    state.chartType = 'datalist';
    state.labelField = 'region';
    state.datalistExportCsv = true;
    state.datalistExportHtml = true;
    state.fields = [{ name: 'region', type: 'string', sample: 'Bretagne' }];
    generateCode('https://api.example.com?limit=200');
    const code = document.getElementById('generated-code')!.textContent!;
    expect(code).toContain('export="csv,html"');
  });

  it('should generate datalist with filtrable columns', () => {
    state.chartType = 'datalist';
    state.labelField = 'region';
    state.datalistFiltres = true;
    state.datalistColumns = [
      { field: 'region', label: 'Region', visible: true, filtrable: true },
      { field: 'population', label: 'Pop.', visible: true, filtrable: false },
    ];
    generateCode('https://api.example.com?limit=200');
    const code = document.getElementById('generated-code')!.textContent!;
    expect(code).toContain('filtres="region"');
  });

  it('should generate datalist with sort attribute', () => {
    state.chartType = 'datalist';
    state.labelField = 'region';
    state.sortOrder = 'asc';
    state.fields = [{ name: 'region', type: 'string', sample: 'Bretagne' }];
    generateCode('https://api.example.com?limit=200');
    const code = document.getElementById('generated-code')!.textContent!;
    expect(code).toContain('tri="region:asc"');
  });

  it('should not generate sort attribute when sortOrder is none', () => {
    state.chartType = 'datalist';
    state.labelField = 'region';
    state.sortOrder = 'none';
    state.fields = [{ name: 'region', type: 'string', sample: 'Bretagne' }];
    generateCode('https://api.example.com?limit=200');
    const code = document.getElementById('generated-code')!.textContent!;
    expect(code).not.toContain('tri=');
  });

  it('should generate scatter chart with fetch and createElement', () => {
    state.chartType = 'scatter';
    state.title = 'Nuage de points';
    state.labelField = 'x_values';
    state.valueField = 'y_values';
    state.palette = 'categorical';
    generateCode('https://api.example.com?select=x_values,y_values&limit=200');
    const code = document.getElementById('generated-code')!.textContent!;
    expect(code).toContain('scatter-chart');
    expect(code).toContain('scatter-container');
    expect(code).toContain('async function loadChart');
    expect(code).toContain('fetchAllODS');
    expect(code).toContain('setAttribute');
    expect(code).toContain('selected-palette');
    expect(code).toContain('categorical');
  });

  it('should generate map chart with fetch, isValidDeptCode, and mapData', () => {
    state.chartType = 'map';
    state.title = 'Carte departements';
    state.codeField = 'code_dept';
    state.valueField = 'population';
    state.palette = 'sequentialAscending';
    generateCode('https://api.example.com?select=code_dept,sum(pop)%20as%20value&group_by=code_dept&limit=200');
    const code = document.getElementById('generated-code')!.textContent!;
    expect(code).toContain('map-chart');
    expect(code).toContain('map-container');
    expect(code).toContain('async function loadMap');
    expect(code).toContain('isValidDeptCode');
    expect(code).toContain('mapData');
    expect(code).toContain("d['code_dept']");
    expect(code).toContain('selected-palette');
    expect(code).toContain('sequentialAscending');
    expect(code).toContain('padStart(2');
  });

  it('should generate map with default palette when non-sequential chosen', () => {
    state.chartType = 'map';
    state.codeField = 'code_dept';
    state.palette = 'default';
    generateCode('https://api.example.com?limit=200');
    const code = document.getElementById('generated-code')!.textContent!;
    expect(code).toContain('sequentialAscending');
  });

  it('should generate bar chart with fetch and DSFR element', () => {
    state.chartType = 'bar';
    state.title = 'Population par region';
    state.labelField = 'region';
    state.valueField = 'population';
    state.palette = 'default';
    state.sortOrder = 'desc';
    generateCode('https://api.example.com?select=region,sum(pop)%20as%20value&group_by=region&order_by=value%20desc&limit=200');
    const code = document.getElementById('generated-code')!.textContent!;
    expect(code).toContain('bar-chart');
    expect(code).toContain('chart-container');
    expect(code).toContain('async function loadChart');
    expect(code).toContain('fetchAllODS');
    expect(code).toContain('setAttribute');
    expect(code).toContain('selected-palette');
  });

  it('should generate line chart', () => {
    state.chartType = 'line';
    state.labelField = 'annee';
    state.valueField = 'population';
    generateCode('https://api.example.com?limit=200');
    const code = document.getElementById('generated-code')!.textContent!;
    expect(code).toContain('line-chart');
  });

  it('should generate pie chart with fill attribute', () => {
    state.chartType = 'pie';
    state.labelField = 'region';
    state.valueField = 'population';
    generateCode('https://api.example.com?limit=200');
    const code = document.getElementById('generated-code')!.textContent!;
    expect(code).toContain('pie-chart');
    expect(code).toContain('fill');
  });

  it('should generate doughnut as pie chart without fill', () => {
    state.chartType = 'doughnut';
    state.labelField = 'region';
    state.valueField = 'population';
    generateCode('https://api.example.com?limit=200');
    const code = document.getElementById('generated-code')!.textContent!;
    expect(code).toContain('pie-chart');
    expect(code).not.toContain('fill');
  });

  it('should generate horizontal bar chart with horizontal attribute', () => {
    state.chartType = 'horizontalBar';
    state.labelField = 'region';
    state.valueField = 'population';
    generateCode('https://api.example.com?limit=200');
    const code = document.getElementById('generated-code')!.textContent!;
    expect(code).toContain('bar-chart');
    expect(code).toContain('horizontal');
  });

  it('should generate radar chart', () => {
    state.chartType = 'radar';
    state.labelField = 'critere';
    state.valueField = 'score';
    generateCode('https://api.example.com?limit=200');
    const code = document.getElementById('generated-code')!.textContent!;
    expect(code).toContain('radar-chart');
  });

  it('should generate second series for bar chart', () => {
    state.chartType = 'bar';
    state.labelField = 'region';
    state.valueField = 'population';
    state.extraSeries = [{ field: 'budget', label: '' }];
    generateCode('https://api.example.com?limit=200');
    const code = document.getElementById('generated-code')!.textContent!;
    expect(code).toContain('bar-chart');
    expect(code).toContain('values2');
    // name attribute should include both series
    expect(code).toContain('population');
    expect(code).toContain('budget');
  });

  it('should not generate second series for pie chart', () => {
    state.chartType = 'pie';
    state.labelField = 'region';
    state.valueField = 'population';
    state.extraSeries = [{ field: 'budget', label: '' }];
    generateCode('https://api.example.com?limit=200');
    const code = document.getElementById('generated-code')!.textContent!;
    expect(code).not.toContain('values2');
  });

  it('should include subtitle when set', () => {
    state.chartType = 'bar';
    state.labelField = 'region';
    state.valueField = 'population';
    state.subtitle = 'Donnees 2024';
    generateCode('https://api.example.com?limit=200');
    const code = document.getElementById('generated-code')!.textContent!;
    expect(code).toContain('Donnees 2024');
    expect(code).toContain('fr-text--sm');
  });

  it('should not include subtitle when empty', () => {
    state.chartType = 'bar';
    state.labelField = 'region';
    state.valueField = 'population';
    state.subtitle = '';
    generateCode('https://api.example.com?limit=200');
    const code = document.getElementById('generated-code')!.textContent!;
    expect(code).not.toContain('fr-text--sm');
  });

  it('should include ODS fetch helper in standard chart code', () => {
    state.chartType = 'bar';
    state.labelField = 'region';
    state.valueField = 'population';
    generateCode('https://api.example.com?limit=200');
    const code = document.getElementById('generated-code')!.textContent!;
    expect(code).toContain('async function fetchAllODS');
    expect(code).toContain('offset');
    expect(code).toContain('total_count');
  });

  it('should include DSFR CSS and JS dependencies', () => {
    state.chartType = 'bar';
    state.labelField = 'region';
    state.valueField = 'population';
    generateCode('https://api.example.com?limit=200');
    const code = document.getElementById('generated-code')!.textContent!;
    expect(code).toContain('dsfr.min.css');
    expect(code).toContain('DSFRChart.css');
    expect(code).toContain('DSFRChart.js');
  });

  it('should use the API URL in generated code', () => {
    state.chartType = 'bar';
    state.labelField = 'region';
    state.valueField = 'population';
    const apiUrl = 'https://data.gouv.fr/api/explore/v2.1/catalog/datasets/test/records?select=region,sum(pop)%20as%20value&group_by=region';
    generateCode(apiUrl);
    const code = document.getElementById('generated-code')!.textContent!;
    expect(code).toContain(apiUrl);
  });

  it('should auto-detect columns from fields when no custom datalistColumns', () => {
    state.chartType = 'datalist';
    state.labelField = 'region';
    state.datalistColumns = [];
    state.fields = [
      { name: 'region', type: 'string', sample: 'Bretagne' },
      { name: 'population', type: 'number', sample: 100 },
    ];
    generateCode('https://api.example.com?limit=200');
    const code = document.getElementById('generated-code')!.textContent!;
    expect(code).toContain('colonnes="region:region, population:population"');
  });

  it('should do nothing when generated-code element is missing', () => {
    document.body.innerHTML = '';
    state.chartType = 'bar';
    state.labelField = 'region';
    state.valueField = 'population';
    // Should not throw
    expect(() => generateCode('https://api.example.com')).not.toThrow();
  });
});

// =====================================================================
// generateFacetsElement with FacetsMode
// =====================================================================
describe('generateFacetsElement with FacetsMode', () => {
  beforeEach(() => {
    resetState();
    state.facetsConfig.enabled = true;
    state.facetsConfig.fields = [
      { field: 'region', label: 'Region', display: 'checkbox', searchable: false, disjunctive: false },
      { field: 'dept', label: 'Departement', display: 'select', searchable: true, disjunctive: true },
    ];
  });

  it('should generate server-facets attribute when serverFacets mode', () => {
    const result = generateFacetsElement('src', { serverFacets: true });
    expect(result.element).toContain('server-facets');
  });

  it('should not generate server-facets by default', () => {
    const result = generateFacetsElement('src');
    expect(result.element).not.toContain('server-facets');
  });

  it('should generate static-values attribute when staticValues mode', () => {
    const result = generateFacetsElement('src', {
      staticValues: { region: ['Bretagne', 'Normandie'], dept: ['35', '76'] },
    });
    expect(result.element).toContain("static-values='");
    expect(result.element).toContain('"Bretagne"');
    expect(result.element).toContain('"Normandie"');
  });

  it('should prefix field names with fieldPrefix', () => {
    const result = generateFacetsElement('src', { fieldPrefix: 'fields.' });
    expect(result.element).toContain('fields="fields.region, fields.dept"');
    expect(result.element).toContain('display="fields.dept:select"');
    expect(result.element).toContain('disjunctive="fields.dept"');
    expect(result.element).toContain('searchable="fields.dept"');
  });

  it('should prefix labels with fieldPrefix', () => {
    state.facetsConfig.fields = [
      { field: 'region', label: 'Ma Region', display: 'checkbox', searchable: false, disjunctive: false },
    ];
    const result = generateFacetsElement('src', { fieldPrefix: 'fields.' });
    expect(result.element).toContain('labels="fields.region:Ma Region"');
  });

  it('should not prefix when fieldPrefix is empty/undefined', () => {
    const result = generateFacetsElement('src');
    expect(result.element).toContain('fields="region, dept"');
    expect(result.element).not.toContain('fields.region');
  });
});

// =====================================================================
// computeStaticFacetValues
// =====================================================================
describe('computeStaticFacetValues', () => {
  beforeEach(() => {
    resetState();
  });

  it('should return null when facets disabled', () => {
    state.facetsConfig.enabled = false;
    state.localData = [{ region: 'Bretagne' }];
    expect(computeStaticFacetValues()).toBeNull();
  });

  it('should return null when no fields configured', () => {
    state.facetsConfig.enabled = true;
    state.facetsConfig.fields = [];
    state.localData = [{ region: 'Bretagne' }];
    expect(computeStaticFacetValues()).toBeNull();
  });

  it('should return null when no local data', () => {
    state.facetsConfig.enabled = true;
    state.facetsConfig.fields = [{ field: 'region', label: 'Region', display: 'checkbox', searchable: false, disjunctive: false }];
    state.localData = null;
    expect(computeStaticFacetValues()).toBeNull();
  });

  it('should compute unique sorted values for each field', () => {
    state.facetsConfig.enabled = true;
    state.facetsConfig.fields = [
      { field: 'region', label: 'Region', display: 'checkbox', searchable: false, disjunctive: false },
    ];
    state.localData = [
      { region: 'Normandie' },
      { region: 'Bretagne' },
      { region: 'Normandie' },
      { region: 'Occitanie' },
    ];
    const result = computeStaticFacetValues();
    expect(result).not.toBeNull();
    expect(result!.region).toEqual(['Bretagne', 'Normandie', 'Occitanie']);
  });

  it('should skip null/undefined/empty values', () => {
    state.facetsConfig.enabled = true;
    state.facetsConfig.fields = [
      { field: 'region', label: 'Region', display: 'checkbox', searchable: false, disjunctive: false },
    ];
    state.localData = [
      { region: 'Bretagne' },
      { region: null },
      { region: undefined },
      { region: '' },
    ];
    const result = computeStaticFacetValues();
    expect(result).not.toBeNull();
    expect(result!.region).toEqual(['Bretagne']);
  });

  it('should return null when field has too many unique values (>200)', () => {
    state.facetsConfig.enabled = true;
    state.facetsConfig.fields = [
      { field: 'id', label: 'ID', display: 'checkbox', searchable: false, disjunctive: false },
    ];
    state.localData = Array.from({ length: 201 }, (_, i) => ({ id: `id-${i}` }));
    const result = computeStaticFacetValues();
    expect(result).toBeNull();
  });

  it('should compute values for multiple fields', () => {
    state.facetsConfig.enabled = true;
    state.facetsConfig.fields = [
      { field: 'region', label: 'Region', display: 'checkbox', searchable: false, disjunctive: false },
      { field: 'type', label: 'Type', display: 'checkbox', searchable: false, disjunctive: false },
    ];
    state.localData = [
      { region: 'Bretagne', type: 'A' },
      { region: 'Normandie', type: 'B' },
    ];
    const result = computeStaticFacetValues();
    expect(result).not.toBeNull();
    expect(result!.region).toEqual(['Bretagne', 'Normandie']);
    expect(result!.type).toEqual(['A', 'B']);
  });
});

// =====================================================================
// Grist facets field paths (BUG FIX)
// =====================================================================
describe('Grist facets field paths', () => {
  beforeEach(() => {
    resetState();
    document.body.innerHTML = `
      <div id="generated-code"></div>
      <div id="raw-data"></div>
      <select id="kpi-variant"><option value="">Default</option></select>
      <input id="kpi-unit" value="">
    `;
    state.generationMode = 'dynamic';
    state.savedSource = {
      id: '1',
      name: 'Ma source Grist',
      type: 'grist',
      apiUrl: 'https://grist.numerique.gouv.fr/api/docs/doc1/tables/Table1/records',
      documentId: 'doc1',
      tableId: 'Table1',
    };
    state.labelField = 'region';
    state.valueField = 'population';
    state.fields = [
      { name: 'region', fullPath: 'fields.region', type: 'string', sample: 'Bretagne' },
      { name: 'population', fullPath: 'fields.population', type: 'number', sample: 100 },
    ];
  });

  it('BUG FIX: facets should use fields.X paths when Grist without normalize flatten', () => {
    state.normalizeConfig.enabled = false;
    state.aggregation = 'sum';
    state.chartType = 'bar';
    state.facetsConfig.enabled = true;
    state.facetsConfig.fields = [
      { field: 'region', label: 'Region', display: 'checkbox', searchable: false, disjunctive: false },
    ];
    generateDynamicCode();
    const code = document.getElementById('generated-code')!.textContent!;
    expect(code).toContain('<dsfr-data-facets');
    expect(code).toContain('fields="fields.region"');
  });

  it('facets should use flat names when Grist WITH normalize flatten', () => {
    state.normalizeConfig.enabled = true;
    state.normalizeConfig.flatten = 'fields';
    state.aggregation = 'sum';
    state.chartType = 'bar';
    state.facetsConfig.enabled = true;
    state.facetsConfig.fields = [
      { field: 'region', label: 'Region', display: 'checkbox', searchable: false, disjunctive: false },
    ];
    generateDynamicCode();
    const code = document.getElementById('generated-code')!.textContent!;
    expect(code).toContain('<dsfr-data-facets');
    expect(code).toContain('fields="region"');
    expect(code).not.toContain('fields="fields.region"');
  });

  it('BUG FIX: Grist datalist facets should also use fields.X paths', () => {
    state.normalizeConfig.enabled = false;
    state.chartType = 'datalist';
    state.datalistColumns = [
      { field: 'region', label: 'Region', visible: true, filtrable: false },
    ];
    state.facetsConfig.enabled = true;
    state.facetsConfig.fields = [
      { field: 'region', label: 'Region', display: 'checkbox', searchable: false, disjunctive: false },
    ];
    generateDynamicCode();
    const code = document.getElementById('generated-code')!.textContent!;
    expect(code).toContain('<dsfr-data-facets');
    expect(code).toContain('fields="fields.region"');
  });

  it('should prefix disjunctive and display fields for Grist without flatten', () => {
    state.normalizeConfig.enabled = false;
    state.aggregation = 'sum';
    state.chartType = 'bar';
    state.facetsConfig.enabled = true;
    state.facetsConfig.fields = [
      { field: 'region', label: 'Region', display: 'select', searchable: true, disjunctive: true },
    ];
    generateDynamicCode();
    const code = document.getElementById('generated-code')!.textContent!;
    expect(code).toContain('fields="fields.region"');
    expect(code).toContain('display="fields.region:select"');
    expect(code).toContain('disjunctive="fields.region"');
    expect(code).toContain('searchable="fields.region"');
  });
});
