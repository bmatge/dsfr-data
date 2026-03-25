import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DsfrDataChart } from '../src/components/dsfr-data-chart.js';
import { clearDataCache, dispatchDataLoaded } from '../src/utils/data-bridge.js';

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
      (chart as any)._data = [
        { label: '33', val: 150 },
      ];
      chart.type = 'map';
      chart.labelField = 'label';
      chart.valueField = 'val';

      const result = JSON.parse((chart as any)._processMapData());
      expect(result['33']).toBe(150);
    });

    it('rounds values to 2 decimal places', () => {
      (chart as any)._data = [
        { dept: '75', val: 12.3456789 },
      ];
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
      chart.name = '["Serie 1", "Serie 2"]';
      const attrs = (chart as any)._getCommonAttributes();
      expect(attrs['name']).toBe('["Serie 1", "Serie 2"]');
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

    it('returns bar-line specific attributes', () => {
      (chart as any)._data = [
        { cat: 'A', v1: 10, v2: 100 },
      ];
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
      expect(deferred['date']).toMatch(/^\d{4}-\d{2}-\d{2}$/);
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
        bar: 'barres', line: 'lignes', pie: 'camembert', radar: 'radar',
        gauge: 'jauge', scatter: 'nuage de points', 'bar-line': 'barres et lignes',
        map: 'carte departements', 'map-reg': 'carte regions',
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

    it('creates a data-box element wrapping the chart', () => {
      chart.databox = true;
      chart.databoxTitle = 'Mon titre';
      chart.databoxSource = 'INSEE';
      chart.databoxDate = 'Mars 2024';
      chart.databoxDownload = true;

      const el = (chart as any)._createDataboxElement('bar-chart', { x: '[[]]', y: '[[]]' });
      expect(el.tagName.toLowerCase()).toBe('data-box');
      expect(el.getAttribute('title')).toBe('Mon titre');
      expect(el.getAttribute('source')).toBe('INSEE');
      expect(el.getAttribute('date')).toBe('Mars 2024');
      expect(el.hasAttribute('download')).toBe(true);
      expect(el.hasAttribute('segmented-control')).toBe(true);
    });

    it('sets databox-id and databox-type on the inner chart element', () => {
      chart.databox = true;
      chart.databoxTitle = 'Test';

      const el = (chart as any)._createDataboxElement('bar-chart', { x: '[[]]', y: '[[]]' });
      const inner = el.querySelector('bar-chart');
      expect(inner).toBeTruthy();
      expect(inner.getAttribute('databox-id')).toBe('databox-test-chart');
      expect(inner.getAttribute('databox-type')).toBe('chart');
    });

    it('does not set optional attributes when empty', () => {
      chart.databox = true;

      const el = (chart as any)._createDataboxElement('bar-chart', { x: '[[]]', y: '[[]]' });
      expect(el.hasAttribute('title')).toBe(false);
      expect(el.hasAttribute('screenshot')).toBe(false);
      expect(el.hasAttribute('fullscreen')).toBe(false);
      expect(el.hasAttribute('trend')).toBe(false);
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

    it('renders data-box when databox is true', () => {
      chart.databox = true;
      chart.databoxTitle = 'Test';
      const result = (chart as any)._renderChart();
      expect(result.values[0].tagName.toLowerCase()).toBe('data-box');
    });
  });
});
