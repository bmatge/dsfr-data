import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DsfrDataChart } from '@/components/dsfr-data-chart.js';
import { clearDataCache, dispatchDataLoaded } from '@/utils/data-bridge.js';

describe('DsfrDataChart', () => {
  let chart: DsfrDataChart;

  beforeEach(() => {
    clearDataCache('test-chart-src');
    chart = new DsfrDataChart();
  });

  afterEach(() => {
    if (chart.isConnected) {
      chart.disconnectedCallback();
    }
  });

  describe('onSourceData', () => {
    it('stores array data as-is', () => {
      chart.onSourceData([{ x: 1 }, { x: 2 }]);
      expect((chart as any)._data).toEqual([{ x: 1 }, { x: 2 }]);
    });

    it('stores empty array for non-array data', () => {
      chart.onSourceData({ single: 'object' });
      expect((chart as any)._data).toEqual([]);
    });

    it('stores empty array for null', () => {
      chart.onSourceData(null);
      expect((chart as any)._data).toEqual([]);
    });
  });

  describe('_processData', () => {
    it('returns empty arrays when no data', () => {
      (chart as any)._data = [];
      chart.labelField = 'label';
      chart.valueField = 'value';
      const result = (chart as any)._processData();
      expect(result.x).toBe('[[]]');
      expect(result.y).toBe('[[]]');
      expect(result.labels).toEqual([]);
    });

    it('extracts labels and values from data', () => {
      (chart as any)._data = [
        { cat: 'A', val: 10 },
        { cat: 'B', val: 20 },
        { cat: 'C', val: 30 },
      ];
      chart.labelField = 'cat';
      chart.valueField = 'val';

      const result = (chart as any)._processData();
      expect(JSON.parse(result.x)).toEqual([['A', 'B', 'C']]);
      expect(JSON.parse(result.y)).toEqual([[10, 20, 30]]);
      expect(result.labels).toEqual(['A', 'B', 'C']);
      expect(result.y2).toBeUndefined();
    });

    it('uses "N/A" for missing labels', () => {
      (chart as any)._data = [{ val: 10 }];
      chart.labelField = 'label';
      chart.valueField = 'val';

      const result = (chart as any)._processData();
      expect(JSON.parse(result.x)).toEqual([['N/A']]);
    });

    it('uses 0 for non-numeric values', () => {
      (chart as any)._data = [{ cat: 'A', val: 'not-a-number' }];
      chart.labelField = 'cat';
      chart.valueField = 'val';

      const result = (chart as any)._processData();
      expect(JSON.parse(result.y)).toEqual([[0]]);
    });

    it('processes second value field for bar-line', () => {
      (chart as any)._data = [
        { cat: 'A', v1: 10, v2: 100 },
        { cat: 'B', v1: 20, v2: 200 },
      ];
      chart.labelField = 'cat';
      chart.valueField = 'v1';
      chart.valueField2 = 'v2';

      const result = (chart as any)._processData();
      expect(JSON.parse(result.y)).toEqual([[10, 20]]);
      expect(JSON.parse(result.y2!)).toEqual([[100, 200]]);
    });
  });

  describe('_processMapData', () => {
    it('returns empty object when no data', () => {
      (chart as any)._data = [];
      chart.type = 'map';
      chart.labelField = 'code';
      chart.valueField = 'val';
      expect((chart as any)._processMapData()).toBe('{}');
    });

    it('builds dept map from code-field', () => {
      (chart as any)._data = [
        { dept: '75', val: 100 },
        { dept: '13', val: 200 },
      ];
      chart.type = 'map';
      chart.codeField = 'dept';
      chart.valueField = 'val';

      const result = JSON.parse((chart as any)._processMapData());
      expect(result['75']).toBe(100);
      expect(result['13']).toBe(200);
    });

    it('pads single-digit codes to 2 digits', () => {
      (chart as any)._data = [
        { dept: '1', val: 50 },
        { dept: '9', val: 75 },
      ];
      chart.type = 'map';
      chart.codeField = 'dept';
      chart.valueField = 'val';

      const result = JSON.parse((chart as any)._processMapData());
      expect(result['01']).toBe(50);
      expect(result['09']).toBe(75);
    });

    it('uses label-field when code-field is not set', () => {
      (chart as any)._data = [{ label: '33', val: 150 }];
      chart.type = 'map';
      chart.labelField = 'label';
      chart.valueField = 'val';

      const result = JSON.parse((chart as any)._processMapData());
      expect(result['33']).toBe(150);
    });

    it('rounds values to 2 decimal places', () => {
      (chart as any)._data = [{ dept: '75', val: 12.3456789 }];
      chart.type = 'map';
      chart.codeField = 'dept';
      chart.valueField = 'val';

      const result = JSON.parse((chart as any)._processMapData());
      expect(result['75']).toBe(12.35);
    });

    it('filters invalid dept codes for map type', () => {
      (chart as any)._data = [
        { dept: '75', val: 100 },
        { dept: 'INVALID', val: 200 },
      ];
      chart.type = 'map';
      chart.codeField = 'dept';
      chart.valueField = 'val';

      const result = JSON.parse((chart as any)._processMapData());
      expect(result['75']).toBe(100);
      expect(result['INVALID']).toBeUndefined();
    });

    it('accepts any non-empty code for map-reg type', () => {
      (chart as any)._data = [
        { reg: 'IDF', val: 100 },
        { reg: 'PACA', val: 200 },
      ];
      chart.type = 'map-reg';
      chart.codeField = 'reg';
      chart.valueField = 'val';

      const result = JSON.parse((chart as any)._processMapData());
      expect(result['IDF']).toBe(100);
      expect(result['PACA']).toBe(200);
    });
  });

  describe('_getCommonAttributes', () => {
    it('includes selected-palette', () => {
      chart.selectedPalette = 'sequential';
      const attrs = (chart as any)._getCommonAttributes();
      expect(attrs['selected-palette']).toBe('sequential');
    });

    it('includes unit-tooltip when set', () => {
      chart.unitTooltip = '%';
      const attrs = (chart as any)._getCommonAttributes();
      expect(attrs['unit-tooltip']).toBe('%');
    });

    it('omits empty attributes', () => {
      chart.unitTooltip = '';
      chart.xMin = '';
      const attrs = (chart as any)._getCommonAttributes();
      expect(attrs['unit-tooltip']).toBeUndefined();
      expect(attrs['x-min']).toBeUndefined();
    });

    it('includes axis bounds when set', () => {
      chart.xMin = '0';
      chart.xMax = '100';
      chart.yMin = '-10';
      chart.yMax = '50';
      const attrs = (chart as any)._getCommonAttributes();
      expect(attrs['x-min']).toBe('0');
      expect(attrs['x-max']).toBe('100');
      expect(attrs['y-min']).toBe('-10');
      expect(attrs['y-max']).toBe('50');
    });

    it('wraps plain string name in JSON array', () => {
      chart.name = 'Population';
      const attrs = (chart as any)._getCommonAttributes();
      expect(attrs['name']).toBe('["Population"]');
    });

    it('passes JSON array name as-is', () => {
      chart.name = '["Série 1", "Série 2"]';
      const attrs = (chart as any)._getCommonAttributes();
      expect(attrs['name']).toBe('["Série 1", "Série 2"]');
    });

    it('auto-generates name from valueField when name is empty', () => {
      chart.name = '';
      chart.valueField = 'population';
      const attrs = (chart as any)._getCommonAttributes();
      expect(attrs['name']).toBe('["population"]');
    });

    it('auto-generates name from both value fields for bar-line', () => {
      chart.name = '';
      chart.valueField = 'population';
      chart.valueField2 = 'surface';
      const attrs = (chart as any)._getCommonAttributes();
      expect(attrs['name']).toBe('["population","surface"]');
    });
  });

  describe('_refreshRadialScaleBounds', () => {
    it('schedules a rAF poll for radar with bounds', () => {
      chart.type = 'radar';
      chart.yMin = '0';
      chart.yMax = '4';
      (chart as any)._refreshRadialScaleBounds();
      expect((chart as any)._radialBoundsRaf).not.toBeNull();
      (chart as any)._cancelRadialBoundsRaf();
      expect((chart as any)._radialBoundsRaf).toBeNull();
    });

    it('does nothing for radar without bounds', () => {
      chart.type = 'radar';
      (chart as any)._refreshRadialScaleBounds();
      expect((chart as any)._radialBoundsRaf).toBeNull();
    });

    it('does nothing for non-radar types even with bounds', () => {
      chart.type = 'line';
      chart.yMin = '0';
      chart.yMax = '4';
      (chart as any)._refreshRadialScaleBounds();
      expect((chart as any)._radialBoundsRaf).toBeNull();
    });
  });

  describe('_getTypeSpecificAttributes', () => {
    beforeEach(() => {
      (chart as any)._data = [
        { cat: 'A', val: 10 },
        { cat: 'B', val: 20 },
      ];
      chart.labelField = 'cat';
      chart.valueField = 'val';
    });

    it('returns x and y for default (bar/line) types', () => {
      chart.type = 'bar';
      const { attrs } = (chart as any)._getTypeSpecificAttributes();
      expect(attrs['x']).toBeDefined();
      expect(attrs['y']).toBeDefined();
      expect(JSON.parse(attrs['x'])).toEqual([['A', 'B']]);
      expect(JSON.parse(attrs['y'])).toEqual([[10, 20]]);
    });

    it('returns percent for gauge type', () => {
      chart.type = 'gauge';
      chart.gaugeValue = 75;
      const { attrs } = (chart as any)._getTypeSpecificAttributes();
      expect(attrs['percent']).toBe('75');
      expect(attrs['init']).toBe('0');
      expect(attrs['target']).toBe('100');
    });

    it('uses first data value for gauge when gaugeValue is null', () => {
      chart.type = 'gauge';
      chart.gaugeValue = null;
      const { attrs } = (chart as any)._getTypeSpecificAttributes();
      expect(attrs['percent']).toBe('10');
    });

    it('returns pie-specific name from labels', () => {
      chart.type = 'pie';
      chart.name = '';
      const { attrs } = (chart as any)._getTypeSpecificAttributes();
      expect(attrs['x']).toBeDefined();
      expect(attrs['y']).toBeDefined();
      expect(JSON.parse(attrs['name'])).toEqual(['A', 'B']);
    });

    it('radar maps y-min/y-max to upstream scale-min/scale-max', () => {
      chart.type = 'radar';
      chart.yMin = '0';
      chart.yMax = '4';
      const { attrs } = (chart as any)._getTypeSpecificAttributes();
      expect(attrs['scale-min']).toBe('0');
      expect(attrs['scale-max']).toBe('4');
    });

    it('radar without y-min/y-max sets no scale bounds (unchanged behavior)', () => {
      chart.type = 'radar';
      const { attrs } = (chart as any)._getTypeSpecificAttributes();
      expect(attrs['scale-min']).toBeUndefined();
      expect(attrs['scale-max']).toBeUndefined();
    });

    it('radar with a single bound sets only that bound', () => {
      chart.type = 'radar';
      chart.yMax = '4';
      const { attrs } = (chart as any)._getTypeSpecificAttributes();
      expect(attrs['scale-min']).toBeUndefined();
      expect(attrs['scale-max']).toBe('4');
    });

    it('non-radar types do not get scale-min/scale-max', () => {
      chart.type = 'line';
      chart.yMin = '0';
      chart.yMax = '4';
      const { attrs } = (chart as any)._getTypeSpecificAttributes();
      expect(attrs['scale-min']).toBeUndefined();
      expect(attrs['scale-max']).toBeUndefined();
    });

    it('returns bar-line specific attributes', () => {
      (chart as any)._data = [{ cat: 'A', v1: 10, v2: 100 }];
      chart.type = 'bar-line';
      chart.valueField = 'v1';
      chart.valueField2 = 'v2';
      chart.unitTooltipBar = 'kg';

      const { attrs } = (chart as any)._getTypeSpecificAttributes();
      expect(attrs['y-bar']).toBeDefined();
      expect(attrs['y-line']).toBeDefined();
      expect(attrs['unit-tooltip-bar']).toBe('kg');
    });

    it('bar-line uses flat arrays (not double-wrapped)', () => {
      (chart as any)._data = [
        { cat: 'A', v1: 10, v2: 100 },
        { cat: 'B', v1: 20, v2: 200 },
      ];
      chart.type = 'bar-line';
      chart.labelField = 'cat';
      chart.valueField = 'v1';
      chart.valueField2 = 'v2';

      const { attrs } = (chart as any)._getTypeSpecificAttributes();
      // BarLineChart expects flat arrays, not [[values]]
      expect(JSON.parse(attrs['x'])).toEqual(['A', 'B']);
      expect(JSON.parse(attrs['y-bar'])).toEqual([10, 20]);
      expect(JSON.parse(attrs['y-line'])).toEqual([100, 200]);
    });

    it('bar-line maps name to name-bar/name-line', () => {
      (chart as any)._data = [{ cat: 'A', v1: 10, v2: 100 }];
      chart.type = 'bar-line';
      chart.labelField = 'cat';
      chart.valueField = 'v1';
      chart.valueField2 = 'v2';
      chart.name = '["Barres", "Ligne"]';

      const { attrs } = (chart as any)._getTypeSpecificAttributes();
      expect(attrs['name-bar']).toBe('Barres');
      expect(attrs['name-line']).toBe('Ligne');
    });

    it('bar-line maps unit-tooltip to unit-tooltip-line', () => {
      (chart as any)._data = [{ cat: 'A', v1: 10, v2: 100 }];
      chart.type = 'bar-line';
      chart.labelField = 'cat';
      chart.valueField = 'v1';
      chart.valueField2 = 'v2';
      (chart as any).unitTooltip = '%';

      const { attrs } = (chart as any)._getTypeSpecificAttributes();
      expect(attrs['unit-tooltip-line']).toBe('%');
    });

    it('returns map data and deferred value/date', () => {
      (chart as any)._data = [
        { dept: '75', val: 100 },
        { dept: '13', val: 200 },
      ];
      chart.type = 'map';
      chart.codeField = 'dept';

      const { deferred } = (chart as any)._getTypeSpecificAttributes();
      expect(deferred['data']).toBeDefined();
      expect(deferred['value']).toBeDefined();
      expect(Number(deferred['value'])).toBe(150); // avg of 100 and 200
      // #305 : plus de new Date() — la date du JOUR etait presentee comme
      // date de la donnee ; date n'est envoyee que si databox-date est fourni
      expect(deferred['date']).toBeUndefined();
    });

    it('includes horizontal and stacked for bar type', () => {
      chart.type = 'bar';
      chart.horizontal = true;
      chart.stacked = true;
      chart.highlightIndex = '[0, 2]';

      const { attrs } = (chart as any)._getTypeSpecificAttributes();
      expect(attrs['horizontal']).toBe('true');
      expect(attrs['stacked']).toBe('true');
      expect(attrs['highlight-index']).toBe('[0, 2]');
    });

    it('includes fill for pie type', () => {
      chart.type = 'pie';
      chart.fill = true;

      const { attrs } = (chart as any)._getTypeSpecificAttributes();
      expect(attrs['fill']).toBe('true');
    });

    it('includes highlight for map type', () => {
      (chart as any)._data = [{ dept: '75', val: 100 }];
      chart.type = 'map';
      chart.codeField = 'dept';
      chart.mapHighlight = '75';

      const { attrs } = (chart as any)._getTypeSpecificAttributes();
      expect(attrs['highlight']).toBe('75');
    });

    it('does not include horizontal/stacked for non-bar types', () => {
      chart.type = 'line';
      chart.horizontal = true;
      chart.stacked = true;

      const { attrs } = (chart as any)._getTypeSpecificAttributes();
      expect(attrs['horizontal']).toBeUndefined();
      expect(attrs['stacked']).toBeUndefined();
    });
  });

  describe('_getAriaLabel', () => {
    it('returns label with chart type and count', () => {
      (chart as any)._data = [{ a: 1 }, { a: 2 }, { a: 3 }];
      chart.type = 'bar';
      expect((chart as any)._getAriaLabel()).toBe('Graphique barres, 3 valeurs');
    });

    it('uses correct type names', () => {
      (chart as any)._data = [];
      const types: Record<string, string> = {
        bar: 'barres',
        line: 'lignes',
        pie: 'camembert',
        radar: 'radar',
        gauge: 'jauge',
        scatter: 'nuage de points',
        'bar-line': 'barres et lignes',
        map: 'carte departements',
        'map-reg': 'carte regions',
      };
      for (const [type, label] of Object.entries(types)) {
        chart.type = type as any;
        expect((chart as any)._getAriaLabel()).toContain(label);
      }
    });
  });

  describe('_createChartElement', () => {
    it('creates an element with the given tag and attributes', () => {
      (chart as any)._data = [{ a: 1 }];
      chart.type = 'bar';

      const wrapper = (chart as any)._createChartElement('bar-chart', {
        x: '[["A"]]',
        y: '[[10]]',
        'selected-palette': 'categorical',
      });

      expect(wrapper.tagName.toLowerCase()).toBe('div');
      expect(wrapper.className).toBe('dsfr-data-chart__wrapper');
      expect(wrapper.getAttribute('role')).toBe('img');
      expect(wrapper.getAttribute('aria-label')).toContain('barres');

      const child = wrapper.firstChild as HTMLElement;
      expect(child.tagName.toLowerCase()).toBe('bar-chart');
      expect(child.getAttribute('x')).toBe('[["A"]]');
      expect(child.getAttribute('y')).toBe('[[10]]');
    });

    it('skips empty attribute values', () => {
      (chart as any)._data = [];
      chart.type = 'bar';

      const wrapper = (chart as any)._createChartElement('bar-chart', {
        x: '[["A"]]',
        empty: '',
      });

      const child = wrapper.firstChild as HTMLElement;
      expect(child.getAttribute('x')).toBe('[["A"]]');
      expect(child.hasAttribute('empty')).toBe(false);
    });
  });

  describe('Data integration via data-bridge', () => {
    it('receives and processes data from source', () => {
      chart.source = 'test-chart-src';
      chart.type = 'bar';
      chart.labelField = 'cat';
      chart.valueField = 'val';
      chart.connectedCallback();

      dispatchDataLoaded('test-chart-src', [
        { cat: 'A', val: 10 },
        { cat: 'B', val: 20 },
      ]);

      expect((chart as any)._data).toHaveLength(2);
      const result = (chart as any)._processData();
      expect(JSON.parse(result.x)).toEqual([['A', 'B']]);
    });

    it('picks up cached data on connect', () => {
      dispatchDataLoaded('test-chart-src', [{ cat: 'X', val: 99 }]);

      chart.source = 'test-chart-src';
      chart.labelField = 'cat';
      chart.valueField = 'val';
      chart.connectedCallback();

      expect((chart as any)._data).toHaveLength(1);
    });
  });

  describe('DataBox properties', () => {
    it('databox defaults to false', () => {
      expect(chart.databox).toBe(false);
    });

    it('databox string properties default to empty', () => {
      expect(chart.databoxTitle).toBe('');
      expect(chart.databoxSource).toBe('');
      expect(chart.databoxDate).toBe('');
      expect(chart.databoxTrend).toBe('');
    });

    it('databox boolean properties default to false', () => {
      expect(chart.databoxDownload).toBe(false);
      expect(chart.databoxScreenshot).toBe(false);
      expect(chart.databoxFullscreen).toBe(false);
    });
  });

  describe('_createDataboxElement', () => {
    beforeEach(() => {
      (chart as any)._data = [
        { cat: 'A', val: 10 },
        { cat: 'B', val: 20 },
      ];
      chart.labelField = 'cat';
      chart.valueField = 'val';
      chart.type = 'bar';
      chart.id = 'test-chart';
    });

    it('creates a wrapper with databox and chart elements', () => {
      chart.databox = true;
      chart.databoxTitle = 'Mon titre';
      chart.databoxSource = 'INSEE';
      chart.databoxDownload = true;

      const wrapper = (chart as any)._createDataboxElement('bar-chart', { x: '[[]]', y: '[[]]' });
      expect(wrapper.className).toBe('dsfr-data-chart__databox-wrapper');
      const db = wrapper.querySelector('data-box');
      const chartEl = wrapper.querySelector('bar-chart');
      expect(db).toBeTruthy();
      expect(chartEl).toBeTruthy();
      expect(chartEl.getAttribute('databox-source')).toBe('default');
    });

    it('sets databox-id and databox-type on chart element', () => {
      chart.databox = true;
      chart.databoxTitle = 'Test';

      const wrapper = (chart as any)._createDataboxElement('bar-chart', { x: '[[]]', y: '[[]]' });
      const chartEl = wrapper.querySelector('bar-chart');
      expect(chartEl).toBeTruthy();
      expect(chartEl.getAttribute('databox-id')).toBe('databox-test-chart');
      expect(chartEl.getAttribute('databox-type')).toBe('chart');
      expect(chartEl.getAttribute('databox-source')).toBe('default');
    });

    it('places data-box first in DOM order for Vue Teleport', () => {
      chart.databox = true;
      chart.databoxTitle = 'Mon titre';

      const wrapper = (chart as any)._createDataboxElement('bar-chart', { x: '[[]]', y: '[[]]' });
      const db = wrapper.querySelector('data-box');
      const chartEl = wrapper.querySelector('bar-chart');
      expect(db).toBeTruthy();
      expect(db.getAttribute('title')).toBe('Mon titre');
      // segmented-control is required for DataBox to create Teleport targets
      expect(db.hasAttribute('segmented-control')).toBe(true);
      // DataBox must be before chart for Vue Teleport to work
      const children = [...wrapper.children];
      expect(children.indexOf(db)).toBeLessThan(children.indexOf(chartEl));
    });
  });

  describe('_renderChart with databox', () => {
    beforeEach(() => {
      (chart as any)._data = [
        { cat: 'A', val: 10 },
        { cat: 'B', val: 20 },
      ];
      chart.labelField = 'cat';
      chart.valueField = 'val';
      chart.type = 'bar';
      chart.id = 'test-chart';
    });

    it('renders standard wrapper when databox is false', () => {
      chart.databox = false;
      const result = (chart as any)._renderChart();
      expect(result.values[0].className).toBe('dsfr-data-chart__wrapper');
    });

    it('renders databox wrapper with chart when databox is true', () => {
      chart.databox = true;
      chart.databoxTitle = 'Test';
      const result = (chart as any)._renderChart();
      const wrapper = result.values[0];
      expect(wrapper.className).toBe('dsfr-data-chart__databox-wrapper');
      expect(wrapper.querySelector('bar-chart')).toBeTruthy();
      expect(wrapper.querySelector('data-box')).toBeTruthy();
    });
  });

  // --- Lignes de reference (#341) -------------------------------------------
  describe('reference-lines', () => {
    let el: DsfrDataChart;

    afterEach(() => {
      el?.remove();
    });

    async function mount(props: Partial<DsfrDataChart>): Promise<DsfrDataChart> {
      el = new DsfrDataChart();
      Object.assign(el, props);
      document.body.appendChild(el);
      await el.updateComplete;
      return el;
    }

    it('type non cartésien + reference-lines → data-dsfr-config-error', async () => {
      await mount({ type: 'pie', referenceLines: '[{"axis":"y","value":10}]' });
      expect(el.getAttribute('data-dsfr-config-error')).toMatch(/non supporté/);
    });

    it('JSON invalide → data-dsfr-config-error', async () => {
      await mount({ type: 'line', referenceLines: '[{bad json}]' });
      expect(el.getAttribute('data-dsfr-config-error')).toMatch(/JSON invalide/);
    });

    it('type cartésien + JSON valide → pas d erreur de config', async () => {
      await mount({ type: 'line', referenceLines: '[{"axis":"y","value":10}]' });
      expect(el.hasAttribute('data-dsfr-config-error')).toBe(false);
    });

    it('retrait de reference-lines efface l erreur', async () => {
      await mount({ type: 'pie', referenceLines: '[{"axis":"y","value":10}]' });
      expect(el.hasAttribute('data-dsfr-config-error')).toBe(true);
      el.referenceLines = '';
      await el.updateComplete;
      expect(el.hasAttribute('data-dsfr-config-error')).toBe(false);
    });

    it('aria-label inclut le résumé des repères sur un cartésien', () => {
      (chart as any)._data = [{ m: 'Jan', v: 1 }];
      chart.type = 'line';
      chart.labelField = 'm';
      chart.valueField = 'v';
      chart.referenceLines = '[{"axis":"x","value":"Jan","label":"Lancement"}]';
      expect((chart as any)._getAriaLabel()).toContain('Lancement');
    });
  });

  describe('targets (#377)', () => {
    let el: DsfrDataChart;

    afterEach(() => {
      el?.remove();
    });

    async function mount(props: Partial<DsfrDataChart>): Promise<DsfrDataChart> {
      el = new DsfrDataChart();
      Object.assign(el, props);
      document.body.appendChild(el);
      await el.updateComplete;
      return el;
    }

    const TARGETS = '[{"x":2030,"value":26,"label":"Cible 2030 : 26 %"}]';

    it('type non supporté (bar) + targets → data-dsfr-config-error', async () => {
      await mount({ type: 'bar', targets: TARGETS });
      expect(el.getAttribute('data-dsfr-config-error')).toMatch(/line et bar-line uniquement/);
    });

    it('JSON invalide → data-dsfr-config-error', async () => {
      await mount({ type: 'line', targets: '[{bad json}]' });
      expect(el.getAttribute('data-dsfr-config-error')).toMatch(/JSON invalide/);
    });

    it('type supporté + JSON valide → pas d erreur de config', async () => {
      await mount({ type: 'line', targets: TARGETS });
      expect(el.hasAttribute('data-dsfr-config-error')).toBe(false);
    });

    it('retrait de targets efface l erreur', async () => {
      await mount({ type: 'bar', targets: TARGETS });
      expect(el.hasAttribute('data-dsfr-config-error')).toBe(true);
      el.targets = '';
      await el.updateComplete;
      expect(el.hasAttribute('data-dsfr-config-error')).toBe(false);
    });

    it('erreurs reference-lines et targets combinées par « ; »', async () => {
      await mount({
        type: 'pie',
        referenceLines: '[{"axis":"y","value":10}]',
        targets: TARGETS,
      });
      const error = el.getAttribute('data-dsfr-config-error') ?? '';
      expect(error).toMatch(/reference-lines/);
      expect(error).toMatch(/targets/);
      expect(error).toContain(' ; ');
    });

    it('aria-label inclut le libellé de la cible', () => {
      (chart as any)._data = [{ m: '2025', v: 30 }];
      chart.type = 'line';
      chart.labelField = 'm';
      chart.valueField = 'v';
      chart.targets = TARGETS;
      expect((chart as any)._getAriaLabel()).toContain('Cible 2030 : 26 %');
    });

    describe('extension d axe X (padding des séries)', () => {
      beforeEach(() => {
        (chart as any)._data = [
          { annee: '2024', conso: 30, prod: 12 },
          { annee: '2025', conso: 27, prod: 14 },
        ];
        chart.labelField = 'annee';
        chart.valueField = 'conso';
        chart.targets = TARGETS;
      });

      it('line : x se termine par l échéance, séries paddées par null', () => {
        chart.type = 'line';
        chart.valueFields = 'prod';
        const { attrs } = (chart as any)._getTypeSpecificAttributes();
        const labels = JSON.parse(attrs['x'])[0];
        expect(String(labels[labels.length - 1])).toBe('2030');
        const series = JSON.parse(attrs['y']);
        expect(series).toHaveLength(2);
        expect(series[0][series[0].length - 1]).toBeNull();
        expect(series[1][series[1].length - 1]).toBeNull();
      });

      it('bar-line : x/y-bar/y-line paddés', () => {
        chart.type = 'bar-line';
        chart.valueField2 = 'prod';
        const { attrs } = (chart as any)._getTypeSpecificAttributes();
        const labels = JSON.parse(attrs['x']);
        expect(String(labels[labels.length - 1])).toBe('2030');
        const yBar = JSON.parse(attrs['y-bar']);
        const yLine = JSON.parse(attrs['y-line']);
        expect(yBar[yBar.length - 1]).toBeNull();
        expect(yLine[yLine.length - 1]).toBeNull();
        expect(yBar.slice(0, 2)).toEqual([30, 27]);
        expect(yLine.slice(0, 2)).toEqual([12, 14]);
      });

      it('pas de padding si l échéance existe déjà dans les labels', () => {
        chart.type = 'line';
        (chart as any)._data = [
          { annee: '2025', conso: 27 },
          { annee: '2030', conso: 20 },
        ];
        const { attrs } = (chart as any)._getTypeSpecificAttributes();
        expect(JSON.parse(attrs['x'])[0]).toEqual(['2025', '2030']);
        expect(JSON.parse(attrs['y'])).toEqual([[27, 20]]);
      });

      it('type non supporté : pas de padding', () => {
        chart.type = 'bar';
        const { attrs } = (chart as any)._getTypeSpecificAttributes();
        expect(JSON.parse(attrs['x'])[0]).toEqual(['2024', '2025']);
      });
    });

    describe('bornes Y automatiques', () => {
      beforeEach(() => {
        (chart as any)._data = [
          { annee: '2024', conso: 10 },
          { annee: '2025', conso: 12 },
        ];
        chart.type = 'line';
        chart.labelField = 'annee';
        chart.valueField = 'conso';
      });

      it('y-max posé si la cible dépasse le max des données et yMax vide', () => {
        chart.targets = '[{"x":2030,"value":26}]';
        const { attrs } = (chart as any)._getTypeSpecificAttributes();
        expect(attrs['y-max']).toBe('26');
      });

      it('y-max non posé si l utilisateur a fixé le sien', () => {
        chart.targets = '[{"x":2030,"value":26}]';
        chart.yMax = '40';
        const { attrs } = (chart as any)._getTypeSpecificAttributes();
        expect(attrs['y-max']).toBeUndefined();
      });

      it('y-min posé si la cible est sous le min des données', () => {
        chart.targets = '[{"x":2030,"value":2}]';
        const { attrs } = (chart as any)._getTypeSpecificAttributes();
        expect(attrs['y-min']).toBe('2');
      });

      it('cible dans la plage : aucune borne posée', () => {
        chart.targets = '[{"x":2030,"value":11}]';
        const { attrs } = (chart as any)._getTypeSpecificAttributes();
        expect(attrs['y-max']).toBeUndefined();
        expect(attrs['y-min']).toBeUndefined();
      });

      it('bar-line : bornes par axe (y-bar-max / y-line-max)', () => {
        chart.type = 'bar-line';
        (chart as any)._data = [
          { annee: '2024', conso: 10, prod: 20 },
          { annee: '2025', conso: 12, prod: 24 },
        ];
        chart.valueField2 = 'prod';
        chart.targets = '[{"x":2030,"value":18,"series":0},{"x":2030,"value":30,"series":1}]';
        const { attrs } = (chart as any)._getTypeSpecificAttributes();
        expect(attrs['y-bar-max']).toBe('18');
        expect(attrs['y-line-max']).toBe('30');
        expect(attrs['y-max']).toBeUndefined();
      });
    });

    describe('_processData expose allSeries', () => {
      it('mode wide : une entrée par value field', () => {
        (chart as any)._data = [
          { cat: 'A', v1: 1, v2: 3 },
          { cat: 'B', v1: 2, v2: 4 },
        ];
        chart.labelField = 'cat';
        chart.valueFields = 'v1,v2';
        const { allSeries } = (chart as any)._processData();
        expect(allSeries).toEqual([
          [1, 2],
          [3, 4],
        ]);
      });

      it('mode tidy : une entrée par valeur distincte de series-field', () => {
        (chart as any)._data = [
          { mois: 'Jan', groupe: 'A', v: 1 },
          { mois: 'Jan', groupe: 'B', v: 3 },
          { mois: 'Fev', groupe: 'A', v: 2 },
        ];
        chart.labelField = 'mois';
        chart.seriesField = 'groupe';
        chart.valueField = 'v';
        const { allSeries } = (chart as any)._processData();
        expect(allSeries).toEqual([
          [1, 2],
          [3, 0],
        ]);
      });

      it('mono-série : allSeries = [values]', () => {
        (chart as any)._data = [{ cat: 'A', v: 5 }];
        chart.labelField = 'cat';
        chart.valueField = 'v';
        const { allSeries, values } = (chart as any)._processData();
        expect(allSeries).toEqual([values]);
      });
    });

    describe('légende réalisé/projeté (étape C)', () => {
      const layout = {
        markers: [
          {
            x: 100,
            y: 50,
            fromX: 10,
            fromY: 40,
            color: '#000091',
            labelX: 100,
            labelY: 34,
            targetX: 2030,
            seriesName: 'S',
            seriesIndex: 0,
            value: 26,
          },
        ],
        boundary: null,
      };

      async function mountWithWrapper(props: Partial<DsfrDataChart>): Promise<DsfrDataChart> {
        await mount({ ...props, labelField: 'a', valueField: 'v' });
        (el as any)._data = [{ a: '2025', v: 1 }];
        await el.requestUpdate();
        await el.updateComplete;
        return el;
      }

      it('présente sous le wrapper quand des cibles existent', async () => {
        await mountWithWrapper({ type: 'line', targets: TARGETS });
        (el as any)._renderTargetsLegend(layout);
        const legend = el.querySelector(
          '.dsfr-data-chart__wrapper .dsfr-data-chart__targets-legend'
        );
        expect(legend).not.toBeNull();
        expect(legend!.textContent).toContain('Données historiques');
        expect(legend!.textContent).toContain('Trajectoire, cible extrapolée');
      });

      it('targets-legend="off" → absente', async () => {
        await mountWithWrapper({ type: 'line', targets: TARGETS, targetsLegend: 'off' });
        (el as any)._renderTargetsLegend(layout);
        expect(el.querySelector('.dsfr-data-chart__targets-legend')).toBeNull();
      });

      it('libellés custom via un tableau JSON', async () => {
        await mountWithWrapper({
          type: 'line',
          targets: TARGETS,
          targetsLegend: '["Réalisé","À venir"]',
        });
        (el as any)._renderTargetsLegend(layout);
        const legend = el.querySelector('.dsfr-data-chart__targets-legend');
        expect(legend!.textContent).toContain('Réalisé');
        expect(legend!.textContent).toContain('À venir');
      });

      it('aucun marker → pas de légende', async () => {
        await mountWithWrapper({ type: 'line', targets: TARGETS });
        (el as any)._renderTargetsLegend({ markers: [], boundary: null });
        expect(el.querySelector('.dsfr-data-chart__targets-legend')).toBeNull();
      });
    });
  });
});
