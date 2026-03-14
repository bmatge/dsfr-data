import { describe, it, expect, beforeEach } from 'vitest';
import { selectChartType } from '../../../apps/builder/src/ui/chart-type-selector';
import { state } from '../../../apps/builder/src/state';
import type { ChartType } from '../../../apps/builder/src/state';

/**
 * Helper: build the DOM fixture used by selectChartType.
 * Creates every element the function queries (buttons, config containers,
 * form groups with the expected wrapper classes, select elements, labels).
 */
function buildDOM(): void {
  document.body.innerHTML = `
    <!-- Chart-type buttons -->
    <button class="chart-type-btn selected" data-type="bar"></button>
    <button class="chart-type-btn" data-type="line"></button>
    <button class="chart-type-btn" data-type="pie"></button>
    <button class="chart-type-btn" data-type="doughnut"></button>
    <button class="chart-type-btn" data-type="radar"></button>
    <button class="chart-type-btn" data-type="scatter"></button>
    <button class="chart-type-btn" data-type="horizontalBar"></button>
    <button class="chart-type-btn" data-type="kpi"></button>
    <button class="chart-type-btn" data-type="gauge"></button>
    <button class="chart-type-btn" data-type="map"></button>
    <button class="chart-type-btn" data-type="datalist"></button>

    <!-- KPI config panel -->
    <div id="kpi-config"></div>

    <!-- Datalist config panel -->
    <div class="datalist-config" id="datalist-config"></div>

    <!-- Palette config -->
    <div id="palette-config" style="display: block;"></div>

    <!-- Palette select (for map auto-switch) -->
    <select id="chart-palette">
      <option value="default">Default</option>
      <option value="sequentialAscending">Sequential Ascending</option>
      <option value="sequentialDescending">Sequential Descending</option>
    </select>

    <!-- Label field inside a .fr-select-group wrapper -->
    <div class="fr-select-group" style="display: block;">
      <label for="label-field">Label</label>
      <select id="label-field"></select>
    </div>

    <!-- Sort order inside a .fr-select-group wrapper -->
    <div class="fr-select-group" style="display: block;">
      <select id="sort-order"></select>
    </div>

    <!-- Value field inside a .fr-select-group wrapper -->
    <div class="fr-select-group" style="display: block;">
      <label for="value-field">Value</label>
      <select id="value-field"></select>
    </div>

    <!-- Aggregation inside a .fr-select-group wrapper -->
    <div class="fr-select-group" style="display: block;">
      <label for="aggregation">Aggregation</label>
      <select id="aggregation"></select>
    </div>

    <!-- Multi-series value field 2 -->
    <div id="value-field-2-group" style="display: none;">
      <select id="value-field-2"></select>
    </div>

    <!-- Map code field -->
    <div id="code-field-group" style="display: none;">
      <select id="code-field"></select>
    </div>
  `;
}

/** Reset the mutable singleton state to known defaults. */
function resetState(): void {
  state.chartType = 'bar';
  state.palette = 'default';
  state.valueField2 = '';
  state.codeField = '';
}

describe('selectChartType', () => {
  beforeEach(() => {
    buildDOM();
    resetState();
  });

  // -----------------------------------------------------------
  // 1. Setting state.chartType
  // -----------------------------------------------------------
  describe('state.chartType', () => {
    it('should set state.chartType to the given type', () => {
      selectChartType('line');
      expect(state.chartType).toBe('line');
    });

    it('should update state.chartType when called again with a different type', () => {
      selectChartType('pie');
      expect(state.chartType).toBe('pie');
      selectChartType('radar');
      expect(state.chartType).toBe('radar');
    });
  });

  // -----------------------------------------------------------
  // 2. Adding 'selected' class to the correct button
  // -----------------------------------------------------------
  describe('selected class on button', () => {
    it('should add "selected" class to the button matching the type', () => {
      selectChartType('line');
      const btn = document.querySelector('[data-type="line"]');
      expect(btn!.classList.contains('selected')).toBe(true);
    });

    it('should add "selected" to kpi button', () => {
      selectChartType('kpi');
      const btn = document.querySelector('[data-type="kpi"]');
      expect(btn!.classList.contains('selected')).toBe(true);
    });
  });

  // -----------------------------------------------------------
  // 3. Removing 'selected' class from other buttons
  // -----------------------------------------------------------
  describe('removing selected from other buttons', () => {
    it('should remove "selected" from all other chart-type buttons', () => {
      // bar starts with 'selected' in the fixture
      selectChartType('line');

      const barBtn = document.querySelector('[data-type="bar"]');
      expect(barBtn!.classList.contains('selected')).toBe(false);

      const lineBtn = document.querySelector('[data-type="line"]');
      expect(lineBtn!.classList.contains('selected')).toBe(true);
    });

    it('should leave only one button selected after multiple calls', () => {
      selectChartType('pie');
      selectChartType('scatter');

      const allSelected = document.querySelectorAll('.chart-type-btn.selected');
      expect(allSelected).toHaveLength(1);
      expect((allSelected[0] as HTMLElement).dataset.type).toBe('scatter');
    });
  });

  // -----------------------------------------------------------
  // 4. Toggling KPI config visibility
  // -----------------------------------------------------------
  describe('KPI config visibility', () => {
    it('should add "visible" class to #kpi-config when type is kpi', () => {
      selectChartType('kpi');
      const kpiConfig = document.getElementById('kpi-config')!;
      expect(kpiConfig.classList.contains('visible')).toBe(true);
    });

    it('should remove "visible" class from #kpi-config when type is not kpi', () => {
      selectChartType('kpi');
      selectChartType('bar');
      const kpiConfig = document.getElementById('kpi-config')!;
      expect(kpiConfig.classList.contains('visible')).toBe(false);
    });

    it('should not add "visible" for gauge (only kpi gets it)', () => {
      selectChartType('gauge');
      const kpiConfig = document.getElementById('kpi-config')!;
      expect(kpiConfig.classList.contains('visible')).toBe(false);
    });
  });

  // -----------------------------------------------------------
  // 5. Hiding palette for single-value types (kpi, gauge)
  // -----------------------------------------------------------
  describe('palette config for single-value types', () => {
    it('should hide palette config for kpi', () => {
      selectChartType('kpi');
      const palette = document.getElementById('palette-config') as HTMLElement;
      expect(palette.style.display).toBe('none');
    });

    it('should hide palette config for gauge', () => {
      selectChartType('gauge');
      const palette = document.getElementById('palette-config') as HTMLElement;
      expect(palette.style.display).toBe('none');
    });

    it('should show palette config for bar', () => {
      selectChartType('bar');
      const palette = document.getElementById('palette-config') as HTMLElement;
      expect(palette.style.display).toBe('block');
    });

    it('should show palette config for map', () => {
      selectChartType('map');
      const palette = document.getElementById('palette-config') as HTMLElement;
      expect(palette.style.display).toBe('block');
    });
  });

  // -----------------------------------------------------------
  // 6. Forcing sequential palette for map type
  // -----------------------------------------------------------
  describe('map palette forcing', () => {
    it('should force palette to sequentialAscending when map is selected and palette is not sequential', () => {
      state.palette = 'default';
      selectChartType('map');
      expect(state.palette).toBe('sequentialAscending');
    });

    it('should update the palette select element value', () => {
      state.palette = 'default';
      selectChartType('map');
      const paletteSelect = document.getElementById('chart-palette') as HTMLSelectElement;
      expect(paletteSelect.value).toBe('sequentialAscending');
    });

    it('should not change palette if already sequential', () => {
      state.palette = 'sequentialDescending';
      selectChartType('map');
      expect(state.palette).toBe('sequentialDescending');
    });

    it('should not force palette for non-map types', () => {
      state.palette = 'default';
      selectChartType('bar');
      expect(state.palette).toBe('default');
    });
  });

  // -----------------------------------------------------------
  // 7. Hiding label field for single-value types
  // -----------------------------------------------------------
  describe('label field visibility', () => {
    it('should hide the label field group for kpi', () => {
      selectChartType('kpi');
      const group = document.getElementById('label-field')!.closest('.fr-select-group') as HTMLElement;
      expect(group.style.display).toBe('none');
    });

    it('should hide the label field group for gauge', () => {
      selectChartType('gauge');
      const group = document.getElementById('label-field')!.closest('.fr-select-group') as HTMLElement;
      expect(group.style.display).toBe('none');
    });

    it('should show the label field group for bar', () => {
      selectChartType('bar');
      const group = document.getElementById('label-field')!.closest('.fr-select-group') as HTMLElement;
      expect(group.style.display).toBe('block');
    });

    it('should show the label field group for scatter', () => {
      selectChartType('scatter');
      const group = document.getElementById('label-field')!.closest('.fr-select-group') as HTMLElement;
      expect(group.style.display).toBe('block');
    });
  });

  // -----------------------------------------------------------
  // 8. Hiding sort for kpi/gauge/map/radar/scatter
  // -----------------------------------------------------------
  describe('sort order visibility', () => {
    const hiddenSortTypes: ChartType[] = ['kpi', 'gauge', 'map', 'radar', 'scatter'];
    const visibleSortTypes: ChartType[] = ['bar', 'horizontalBar', 'line', 'pie', 'doughnut'];

    for (const type of hiddenSortTypes) {
      it(`should hide sort order for ${type}`, () => {
        selectChartType(type);
        const group = document.getElementById('sort-order')!.closest('.fr-select-group') as HTMLElement;
        expect(group.style.display).toBe('none');
      });
    }

    for (const type of visibleSortTypes) {
      it(`should show sort order for ${type}`, () => {
        selectChartType(type);
        const group = document.getElementById('sort-order')!.closest('.fr-select-group') as HTMLElement;
        expect(group.style.display).toBe('block');
      });
    }
  });

  // -----------------------------------------------------------
  // 10. Showing multi-series for bar/horizontalBar/line/radar
  // -----------------------------------------------------------
  describe('multi-series support', () => {
    const multiSeriesTypes: ChartType[] = ['bar', 'horizontalBar', 'line', 'radar'];
    const noMultiSeriesTypes: ChartType[] = ['pie', 'doughnut', 'scatter', 'kpi', 'gauge', 'map', 'datalist'];

    for (const type of multiSeriesTypes) {
      it(`should show value-field-2-group for ${type}`, () => {
        selectChartType(type);
        const group = document.getElementById('value-field-2-group') as HTMLElement;
        expect(group.style.display).toBe('block');
      });
    }

    for (const type of noMultiSeriesTypes) {
      it(`should hide value-field-2-group for ${type}`, () => {
        selectChartType(type);
        const group = document.getElementById('value-field-2-group') as HTMLElement;
        expect(group.style.display).toBe('none');
      });
    }
  });

  // -----------------------------------------------------------
  // 11. Resetting valueField2 when multi-series not supported
  // -----------------------------------------------------------
  describe('valueField2 reset', () => {
    it('should reset state.valueField2 to empty when type does not support multi-series', () => {
      state.valueField2 = 'population';
      selectChartType('pie');
      expect(state.valueField2).toBe('');
    });

    it('should reset the value-field-2 select element', () => {
      const vf2 = document.getElementById('value-field-2') as HTMLSelectElement;
      vf2.value = 'some-field';
      selectChartType('scatter');
      expect(vf2.value).toBe('');
    });

    it('should not reset valueField2 when type supports multi-series', () => {
      state.valueField2 = 'population';
      selectChartType('bar');
      expect(state.valueField2).toBe('population');
    });
  });

  // -----------------------------------------------------------
  // 12. Showing code field group for map type
  // -----------------------------------------------------------
  describe('code field group visibility', () => {
    it('should show code-field-group for map', () => {
      selectChartType('map');
      const group = document.getElementById('code-field-group') as HTMLElement;
      expect(group.style.display).toBe('block');
    });

    it('should hide code-field-group for bar', () => {
      selectChartType('bar');
      const group = document.getElementById('code-field-group') as HTMLElement;
      expect(group.style.display).toBe('none');
    });

    it('should hide code-field-group for kpi', () => {
      selectChartType('kpi');
      const group = document.getElementById('code-field-group') as HTMLElement;
      expect(group.style.display).toBe('none');
    });
  });

  // -----------------------------------------------------------
  // 13. Resetting codeField when not map
  // -----------------------------------------------------------
  describe('codeField reset', () => {
    it('should reset state.codeField to empty when type is not map', () => {
      state.codeField = 'code_dept';
      selectChartType('bar');
      expect(state.codeField).toBe('');
    });

    it('should reset the code-field select element when type is not map', () => {
      const codeSelect = document.getElementById('code-field') as HTMLSelectElement;
      codeSelect.value = 'code_dept';
      selectChartType('line');
      expect(codeSelect.value).toBe('');
    });

    it('should not reset codeField when type is map', () => {
      state.codeField = 'code_dept';
      selectChartType('map');
      expect(state.codeField).toBe('code_dept');
    });
  });

  // -----------------------------------------------------------
  // 14. Datalist type visibility
  // -----------------------------------------------------------
  describe('datalist type visibility', () => {
    it('should set state.chartType to datalist', () => {
      selectChartType('datalist');
      expect(state.chartType).toBe('datalist');
    });

    it('should add "selected" to datalist button', () => {
      selectChartType('datalist');
      const btn = document.querySelector('[data-type="datalist"]');
      expect(btn!.classList.contains('selected')).toBe(true);
    });

    it('should hide palette config for datalist', () => {
      selectChartType('datalist');
      const palette = document.getElementById('palette-config') as HTMLElement;
      expect(palette.style.display).toBe('none');
    });

    it('should show label field for datalist', () => {
      selectChartType('datalist');
      const group = document.getElementById('label-field')!.closest('.fr-select-group') as HTMLElement;
      expect(group.style.display).toBe('block');
    });

    it('should hide value field for datalist', () => {
      selectChartType('datalist');
      const group = document.getElementById('value-field')!.closest('.fr-select-group') as HTMLElement;
      expect(group.style.display).toBe('none');
    });

    it('should hide aggregation for datalist', () => {
      selectChartType('datalist');
      const group = document.getElementById('aggregation')!.closest('.fr-select-group') as HTMLElement;
      expect(group.style.display).toBe('none');
    });


    it('should show sort order for datalist', () => {
      selectChartType('datalist');
      const group = document.getElementById('sort-order')!.closest('.fr-select-group') as HTMLElement;
      expect(group.style.display).toBe('block');
    });

    it('should hide value-field-2-group for datalist', () => {
      selectChartType('datalist');
      const group = document.getElementById('value-field-2-group') as HTMLElement;
      expect(group.style.display).toBe('none');
    });

    it('should hide code-field-group for datalist', () => {
      selectChartType('datalist');
      const group = document.getElementById('code-field-group') as HTMLElement;
      expect(group.style.display).toBe('none');
    });

    it('should show datalist-config for datalist', () => {
      selectChartType('datalist');
      const config = document.getElementById('datalist-config')!;
      expect(config.classList.contains('visible')).toBe(true);
    });

    it('should hide datalist-config for non-datalist types', () => {
      selectChartType('datalist');
      selectChartType('bar');
      const config = document.getElementById('datalist-config')!;
      expect(config.classList.contains('visible')).toBe(false);
    });
  });
});
