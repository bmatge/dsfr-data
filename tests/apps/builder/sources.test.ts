import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadSavedSources, handleSavedSourceChange, loadFieldsFromLocalData } from '../../../apps/builder/src/sources';
import { state } from '../../../apps/builder/src/state';
import type { Source } from '../../../apps/builder/src/state';
import { populateFieldSelects } from '../../../apps/builder/src/sources-fields';

vi.mock('../../../apps/builder/src/ui/chart-type-selector', () => ({
  selectChartType: vi.fn(),
}));
vi.mock('../../../apps/builder/src/sources-fields', () => ({
  populateFieldSelects: vi.fn(),
}));
vi.mock('../../../apps/builder/src/ui/chart-renderer', () => ({
  renderChart: vi.fn(),
}));
vi.mock('../../../apps/builder/src/ui/code-generator', () => ({
  generateCodeForLocalData: vi.fn(),
}));

function setupDOM(): void {
  document.body.innerHTML = `
    <div id="source-panel-saved">
      <div class="fr-select-group">
        <select id="saved-source">
          <option value="">— Choisir —</option>
        </select>
      </div>
      <div id="saved-source-info"></div>
    </div>
    <div id="fields-status"></div>
    <div id="section-generation-mode" style="display:none"></div>
    <div id="dynamic-warning" style="display:none"></div>
  `;
}

function makeSource(overrides: Partial<Source> = {}): Source {
  return {
    id: 'src-1',
    name: 'Test Source',
    type: 'grist',
    data: [{ region: 'Bretagne', pop: 3300000 }],
    recordCount: 1,
    ...overrides,
  };
}

describe('builder sources', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    state.savedSource = null;
    state.localData = null;
    state.fields = [];
    state.chartType = 'bar';
    state.title = 'Mon graphique';
    state.subtitle = '';
    state.palette = 'default';
    state.data = [];
    state.advancedMode = false;
    setupDOM();
    vi.clearAllMocks();
  });

  // -------------------------------------------------------
  // loadSavedSources
  // -------------------------------------------------------
  describe('loadSavedSources', () => {
    it('does nothing when source-panel-saved element is missing', () => {
      document.body.innerHTML = '';
      expect(() => loadSavedSources()).not.toThrow();
    });

    it('shows empty message when no sources exist', () => {
      // localStorage is empty -> no sources
      loadSavedSources();

      const panel = document.getElementById('source-panel-saved')!;
      const emptyMsg = panel.querySelector('.empty-sources-message');
      expect(emptyMsg).not.toBeNull();
      expect(emptyMsg!.textContent).toContain('Pas encore de donn');

      // Select group should be hidden
      const selectGroup = panel.querySelector('.fr-select-group') as HTMLElement;
      expect(selectGroup.style.display).toBe('none');
    });

    it('populates select dropdown with saved sources', () => {
      const sources: Source[] = [
        makeSource({ id: 'src-1', name: 'Source A', type: 'grist' }),
        makeSource({ id: 'src-2', name: 'Source B', type: 'api' }),
      ];
      localStorage.setItem('dsfr-data-sources', JSON.stringify(sources));

      loadSavedSources();

      const select = document.getElementById('saved-source') as HTMLSelectElement;
      // 1 default option + 2 source options
      expect(select.options).toHaveLength(3);
      expect(select.options[1].value).toBe('src-1');
      expect(select.options[2].value).toBe('src-2');
    });

    it('adds badge emoji based on source type (grist)', () => {
      const sources: Source[] = [makeSource({ id: 'g1', name: 'Grist Source', type: 'grist' })];
      localStorage.setItem('dsfr-data-sources', JSON.stringify(sources));

      loadSavedSources();

      const select = document.getElementById('saved-source') as HTMLSelectElement;
      // Grist badge: green circle emoji
      expect(select.options[1].textContent).toContain('Grist');
      expect(select.options[1].textContent).toContain('\uD83D\uDFE2');
    });

    it('adds badge emoji based on source type (manual)', () => {
      const sources: Source[] = [makeSource({ id: 'm1', name: 'Manual Source', type: 'manual' })];
      localStorage.setItem('dsfr-data-sources', JSON.stringify(sources));

      loadSavedSources();

      const select = document.getElementById('saved-source') as HTMLSelectElement;
      // Manual badge: purple circle emoji
      expect(select.options[1].textContent).toContain('Manuel');
      expect(select.options[1].textContent).toContain('\uD83D\uDFE3');
    });

    it('adds badge emoji based on source type (api)', () => {
      const sources: Source[] = [makeSource({ id: 'a1', name: 'API Source', type: 'api' })];
      localStorage.setItem('dsfr-data-sources', JSON.stringify(sources));

      loadSavedSources();

      const select = document.getElementById('saved-source') as HTMLSelectElement;
      // API badge: blue circle emoji
      expect(select.options[1].textContent).toContain('API');
      expect(select.options[1].textContent).toContain('\uD83D\uDD35');
    });

    it('adds selected source from localStorage even if not in sources list', () => {
      const sources: Source[] = [makeSource({ id: 'src-1', name: 'Source A' })];
      const selectedSource = makeSource({ id: 'src-selected', name: 'Recent Source', type: 'api' });
      localStorage.setItem('dsfr-data-sources', JSON.stringify(sources));
      localStorage.setItem('dsfr-data-selected-source', JSON.stringify(selectedSource));

      loadSavedSources();

      const select = document.getElementById('saved-source') as HTMLSelectElement;
      // 1 default + 1 saved + 1 selected (recent)
      expect(select.options).toHaveLength(3);
      const lastOption = select.options[2];
      expect(lastOption.value).toBe('src-selected');
      expect(lastOption.textContent).toContain('(r\u00e9cent)');
      expect(lastOption.selected).toBe(true);
    });

    it('does not duplicate selected source if already in sources list', () => {
      const source = makeSource({ id: 'src-1', name: 'Source A' });
      localStorage.setItem('dsfr-data-sources', JSON.stringify([source]));
      localStorage.setItem('dsfr-data-selected-source', JSON.stringify(source));

      loadSavedSources();

      const select = document.getElementById('saved-source') as HTMLSelectElement;
      // 1 default + 1 saved (no duplicate)
      expect(select.options).toHaveLength(2);
    });
  });

  // -------------------------------------------------------
  // handleSavedSourceChange
  // -------------------------------------------------------
  describe('handleSavedSourceChange', () => {
    it('does nothing when select element is missing', () => {
      document.body.innerHTML = '';
      expect(() => handleSavedSourceChange()).not.toThrow();
      expect(state.savedSource).toBeNull();
    });

    it('clears info when no source data on selected option', () => {
      const infoEl = document.getElementById('saved-source-info')!;
      infoEl.innerHTML = 'some previous content';

      // Default option (index 0) has no data-source attribute
      const select = document.getElementById('saved-source') as HTMLSelectElement;
      select.selectedIndex = 0;

      handleSavedSourceChange();

      expect(infoEl.innerHTML).toBe('');
    });

    it('parses source from data attribute and sets state.savedSource', () => {
      const source = makeSource({ id: 'src-1', name: 'My Source', type: 'grist', data: [] });
      const select = document.getElementById('saved-source') as HTMLSelectElement;

      const option = document.createElement('option');
      option.value = 'src-1';
      option.dataset.source = JSON.stringify(source);
      option.textContent = 'My Source';
      select.appendChild(option);
      select.selectedIndex = 1; // select the new option

      handleSavedSourceChange();

      expect(state.savedSource).not.toBeNull();
      expect(state.savedSource!.id).toBe('src-1');
      expect(state.savedSource!.name).toBe('My Source');
    });

    it('loads fields from local data when source has data', () => {
      const source = makeSource({
        id: 'src-2',
        name: 'Data Source',
        type: 'manual',
        data: [{ city: 'Paris', count: 100 }],
      });
      const select = document.getElementById('saved-source') as HTMLSelectElement;

      const option = document.createElement('option');
      option.value = 'src-2';
      option.dataset.source = JSON.stringify(source);
      select.appendChild(option);
      select.selectedIndex = 1;

      handleSavedSourceChange();

      expect(state.localData).toEqual([{ city: 'Paris', count: 100 }]);
      expect(populateFieldSelects).toHaveBeenCalled();
    });

    it('shows source info with badge and record count', () => {
      const source = makeSource({ id: 'src-3', name: 'Info Source', type: 'api', recordCount: 42, data: [] });
      const select = document.getElementById('saved-source') as HTMLSelectElement;

      const option = document.createElement('option');
      option.value = 'src-3';
      option.dataset.source = JSON.stringify(source);
      select.appendChild(option);
      select.selectedIndex = 1;

      handleSavedSourceChange();

      const infoEl = document.getElementById('saved-source-info')!;
      expect(infoEl.innerHTML).toContain('source-badge-api');
      expect(infoEl.innerHTML).toContain('API');
      expect(infoEl.innerHTML).toContain('42');
      expect(infoEl.innerHTML).toContain('enregistrements');
    });

    it('shows grist badge class for grist source', () => {
      const source = makeSource({ id: 'src-g', type: 'grist', data: [] });
      const select = document.getElementById('saved-source') as HTMLSelectElement;

      const option = document.createElement('option');
      option.value = 'src-g';
      option.dataset.source = JSON.stringify(source);
      select.appendChild(option);
      select.selectedIndex = 1;

      handleSavedSourceChange();

      const infoEl = document.getElementById('saved-source-info')!;
      expect(infoEl.innerHTML).toContain('source-badge-grist');
      expect(infoEl.innerHTML).toContain('Grist');
    });

    it('shows manual badge class for manual source', () => {
      const source = makeSource({ id: 'src-m', type: 'manual', data: [] });
      const select = document.getElementById('saved-source') as HTMLSelectElement;

      const option = document.createElement('option');
      option.value = 'src-m';
      option.dataset.source = JSON.stringify(source);
      select.appendChild(option);
      select.selectedIndex = 1;

      handleSavedSourceChange();

      const infoEl = document.getElementById('saved-source-info')!;
      expect(infoEl.innerHTML).toContain('source-badge-manual');
      expect(infoEl.innerHTML).toContain('Manuel');
    });

    it('shows question mark when recordCount is missing', () => {
      const source = makeSource({ id: 'src-no-count', type: 'api', recordCount: undefined, data: [] });
      const select = document.getElementById('saved-source') as HTMLSelectElement;

      const option = document.createElement('option');
      option.value = 'src-no-count';
      option.dataset.source = JSON.stringify(source);
      select.appendChild(option);
      select.selectedIndex = 1;

      handleSavedSourceChange();

      const infoEl = document.getElementById('saved-source-info')!;
      expect(infoEl.innerHTML).toContain('?');
      expect(infoEl.innerHTML).toContain('enregistrements');
    });
  });

  // -------------------------------------------------------
  // loadFieldsFromLocalData
  // -------------------------------------------------------
  describe('loadFieldsFromLocalData', () => {
    it('does nothing when localData is empty', () => {
      state.localData = null;
      loadFieldsFromLocalData();
      expect(state.fields).toEqual([]);

      state.localData = [];
      loadFieldsFromLocalData();
      expect(state.fields).toEqual([]);
    });

    it('extracts fields from flat data structure', () => {
      state.localData = [{ region: 'Bretagne', population: 3300000, active: true }];
      state.savedSource = makeSource({ type: 'manual' });

      loadFieldsFromLocalData();

      expect(state.fields).toHaveLength(3);
      expect(state.fields[0]).toMatchObject({
        name: 'region',
        fullPath: 'region',
        displayName: 'region',
        type: 'string',
        sample: 'Bretagne',
      });
      expect(state.fields[1]).toMatchObject({
        name: 'population',
        fullPath: 'population',
        type: 'number',
        sample: 3300000,
      });
      expect(state.fields[2]).toMatchObject({
        name: 'active',
        fullPath: 'active',
        type: 'boolean',
        sample: true,
      });
    });

    it('extracts fields from Grist raw records (with fields.X prefix)', () => {
      const rawRecords = [
        { fields: { nom_region: 'Bretagne', population: 3300000 } },
        { fields: { nom_region: 'Normandie', population: 2700000 } },
      ];
      state.localData = [{ nom_region: 'Bretagne', population: 3300000 }];
      state.savedSource = makeSource({
        type: 'grist',
        rawRecords,
      });

      loadFieldsFromLocalData();

      expect(state.fields).toHaveLength(2);
      expect(state.fields[0]).toMatchObject({
        name: 'nom_region',
        fullPath: 'nom_region',
        displayName: 'nom_region',
        type: 'string',
        sample: 'Bretagne',
      });
      expect(state.fields[1]).toMatchObject({
        name: 'population',
        fullPath: 'population',
        displayName: 'population',
        type: 'number',
        sample: 3300000,
      });
    });

    it('detects field types from sample values', () => {
      state.localData = [
        { name: 'Test', count: 42, flag: false, ratio: 3.14 },
      ];
      state.savedSource = makeSource({ type: 'manual' });

      loadFieldsFromLocalData();

      const fieldMap = Object.fromEntries(state.fields.map(f => [f.name, f]));
      expect(fieldMap['name'].type).toBe('string');
      expect(fieldMap['count'].type).toBe('number');
      expect(fieldMap['flag'].type).toBe('boolean');
      expect(fieldMap['ratio'].type).toBe('number');
    });

    it('scans multiple records for null values to detect actual type', () => {
      state.localData = [
        { code: null, value: 10 },
        { code: null, value: 20 },
        { code: '29', value: 30 },
      ];
      state.savedSource = makeSource({ type: 'manual' });

      loadFieldsFromLocalData();

      const codeField = state.fields.find(f => f.name === 'code')!;
      expect(codeField.type).toBe('string');
      expect(codeField.sample).toBe('29');
    });

    it('defaults to string type when all values are null', () => {
      state.localData = [
        { code: null, value: 10 },
        { code: null, value: 20 },
      ];
      state.savedSource = makeSource({ type: 'manual' });

      loadFieldsFromLocalData();

      const codeField = state.fields.find(f => f.name === 'code')!;
      expect(codeField.type).toBe('string');
    });

    it('calls populateFieldSelects after extracting fields', () => {
      state.localData = [{ x: 1 }];
      state.savedSource = makeSource({ type: 'manual' });

      loadFieldsFromLocalData();

      expect(populateFieldSelects).toHaveBeenCalled();
    });

    it('shows generation mode section for grist sources', () => {
      state.localData = [{ x: 1 }];
      state.savedSource = makeSource({ type: 'grist' });

      loadFieldsFromLocalData();

      const section = document.getElementById('section-generation-mode') as HTMLElement;
      expect(section.style.display).toBe('block');
    });

    it('shows generation mode section for api sources', () => {
      state.localData = [{ x: 1 }];
      state.savedSource = makeSource({ type: 'api' });

      loadFieldsFromLocalData();

      const section = document.getElementById('section-generation-mode') as HTMLElement;
      expect(section.style.display).toBe('block');
    });

    it('hides generation mode section for manual sources', () => {
      // First show it to confirm it gets hidden
      const section = document.getElementById('section-generation-mode') as HTMLElement;
      section.style.display = 'block';

      state.localData = [{ x: 1 }];
      state.savedSource = makeSource({ type: 'manual' });

      loadFieldsFromLocalData();

      expect(section.style.display).toBe('none');
    });

    it('shows dynamic warning for non-public grist sources', () => {
      state.localData = [{ x: 1 }];
      state.savedSource = makeSource({ type: 'grist', isPublic: false });

      loadFieldsFromLocalData();

      const warning = document.getElementById('dynamic-warning') as HTMLElement;
      expect(warning.style.display).toBe('block');
    });

    it('hides dynamic warning for public grist sources', () => {
      state.localData = [{ x: 1 }];
      state.savedSource = makeSource({ type: 'grist', isPublic: true });

      loadFieldsFromLocalData();

      const warning = document.getElementById('dynamic-warning') as HTMLElement;
      expect(warning.style.display).toBe('none');
    });

    it('updates fields-status to show data preview button', () => {
      state.localData = [{ x: 1 }];
      state.savedSource = makeSource({ type: 'manual' });

      loadFieldsFromLocalData();

      const statusEl = document.getElementById('fields-status')!;
      expect(statusEl.innerHTML).toContain('show-data-preview-btn');
      expect(statusEl.innerHTML).toContain('Voir');
    });
  });
});
