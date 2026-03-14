import { describe, it, expect, beforeEach, vi } from 'vitest';
import { state } from '../../../apps/builder/src/state';
import { initDatalistColumns, openColumnsModal, saveColumnsModal, setupDatalistListeners } from '../../../apps/builder/src/ui/datalist-config';

// Mock chart-renderer to avoid side-effects
vi.mock('../../../apps/builder/src/ui/chart-renderer', () => ({
  renderChart: vi.fn(),
}));

function resetState(): void {
  state.fields = [];
  state.datalistRecherche = true;
  state.datalistFiltres = false;
  state.datalistExportCsv = true;
  state.datalistColumns = [];
  state.localData = null;
}

function buildDOM(): void {
  document.body.innerHTML = `
    <input type="checkbox" id="datalist-recherche" checked>
    <input type="checkbox" id="datalist-filtres">
    <input type="checkbox" id="datalist-export" checked>
    <button id="datalist-columns-btn"></button>
    <div class="modal-overlay" id="datalist-columns-modal">
      <div class="modal">
        <button id="datalist-columns-close"></button>
        <div id="datalist-columns-list"></div>
        <button id="datalist-columns-save"></button>
      </div>
    </div>
  `;
}

describe('initDatalistColumns', () => {
  beforeEach(() => {
    resetState();
  });

  it('should do nothing when fields are empty', () => {
    initDatalistColumns();
    expect(state.datalistColumns).toEqual([]);
  });

  it('should initialize columns from fields', () => {
    state.fields = [
      { name: 'region', type: 'string', sample: 'Bretagne' },
      { name: 'population', type: 'number', sample: 3300000 },
    ];

    initDatalistColumns();

    expect(state.datalistColumns).toHaveLength(2);
    expect(state.datalistColumns[0]).toEqual({
      field: 'region',
      label: 'region',
      visible: true,
      filtrable: false,
    });
    expect(state.datalistColumns[1]).toEqual({
      field: 'population',
      label: 'population',
      visible: true,
      filtrable: false,
    });
  });

  it('should not reinitialize if fields have not changed', () => {
    state.fields = [
      { name: 'region', type: 'string', sample: 'Bretagne' },
    ];
    initDatalistColumns();

    // Modify a label
    state.datalistColumns[0].label = 'Custom Label';
    initDatalistColumns();

    // Should not have been reset
    expect(state.datalistColumns[0].label).toBe('Custom Label');
  });

  it('should reinitialize when fields change', () => {
    state.fields = [
      { name: 'region', type: 'string', sample: 'Bretagne' },
    ];
    initDatalistColumns();
    state.datalistColumns[0].label = 'Custom Label';

    // Change fields
    state.fields = [
      { name: 'region', type: 'string', sample: 'Bretagne' },
      { name: 'code', type: 'string', sample: '35' },
    ];
    initDatalistColumns();

    expect(state.datalistColumns).toHaveLength(2);
    expect(state.datalistColumns[0].label).toBe('region');
  });
});

describe('openColumnsModal', () => {
  beforeEach(() => {
    resetState();
    buildDOM();
  });

  it('should populate modal with column rows', () => {
    state.fields = [
      { name: 'region', type: 'string', sample: 'Bretagne' },
      { name: 'population', type: 'number', sample: 3300000 },
    ];
    state.datalistColumns = [
      { field: 'region', label: 'Region', visible: true, filtrable: false },
      { field: 'population', label: 'Pop.', visible: false, filtrable: true },
    ];

    openColumnsModal();

    const rows = document.querySelectorAll('.datalist-column-row');
    expect(rows).toHaveLength(2);

    // First row: region, visible, label = Region
    const visibleCheckbox0 = rows[0].querySelector('.datalist-col-visible') as HTMLInputElement;
    expect(visibleCheckbox0.checked).toBe(true);
    const labelInput0 = rows[0].querySelector('.datalist-col-label') as HTMLInputElement;
    expect(labelInput0.value).toBe('Region');

    // Second row: population, not visible, filtrable, label = Pop.
    const visibleCheckbox1 = rows[1].querySelector('.datalist-col-visible') as HTMLInputElement;
    expect(visibleCheckbox1.checked).toBe(false);
    const filtrableCheckbox1 = rows[1].querySelector('.datalist-col-filtrable') as HTMLInputElement;
    expect(filtrableCheckbox1.checked).toBe(true);
    const labelInput1 = rows[1].querySelector('.datalist-col-label') as HTMLInputElement;
    expect(labelInput1.value).toBe('Pop.');
  });

  it('should open the modal overlay', () => {
    state.fields = [{ name: 'region', type: 'string', sample: 'Bretagne' }];
    state.datalistColumns = [{ field: 'region', label: 'region', visible: true, filtrable: false }];

    openColumnsModal();

    const modal = document.getElementById('datalist-columns-modal')!;
    expect(modal.classList.contains('active')).toBe(true);
  });
});

describe('saveColumnsModal', () => {
  beforeEach(() => {
    resetState();
    buildDOM();
  });

  it('should read modal inputs and update state', () => {
    state.datalistColumns = [
      { field: 'region', label: 'Region', visible: true, filtrable: false },
      { field: 'population', label: 'Pop.', visible: true, filtrable: false },
    ];

    // Open to populate rows
    openColumnsModal();

    // Modify: hide population, make region filtrable, change label
    const rows = document.querySelectorAll('.datalist-column-row');
    (rows[0].querySelector('.datalist-col-label') as HTMLInputElement).value = 'Nom Region';
    (rows[0].querySelector('.datalist-col-filtrable') as HTMLInputElement).checked = true;
    (rows[1].querySelector('.datalist-col-visible') as HTMLInputElement).checked = false;

    saveColumnsModal();

    expect(state.datalistColumns[0].label).toBe('Nom Region');
    expect(state.datalistColumns[0].filtrable).toBe(true);
    expect(state.datalistColumns[1].visible).toBe(false);
  });

  it('should close the modal after saving', () => {
    state.datalistColumns = [
      { field: 'region', label: 'Region', visible: true, filtrable: false },
    ];
    openColumnsModal();
    saveColumnsModal();

    const modal = document.getElementById('datalist-columns-modal')!;
    expect(modal.classList.contains('active')).toBe(false);
  });
});

describe('setupDatalistListeners', () => {
  beforeEach(() => {
    resetState();
    buildDOM();
  });

  it('should update state when recherche checkbox changes', () => {
    setupDatalistListeners();

    const checkbox = document.getElementById('datalist-recherche') as HTMLInputElement;
    checkbox.checked = false;
    checkbox.dispatchEvent(new Event('change'));

    expect(state.datalistRecherche).toBe(false);
  });

  it('should update state when filtres checkbox changes', () => {
    setupDatalistListeners();

    const checkbox = document.getElementById('datalist-filtres') as HTMLInputElement;
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change'));

    expect(state.datalistFiltres).toBe(true);
  });

  it('should update state when export checkbox changes', () => {
    setupDatalistListeners();

    const checkbox = document.getElementById('datalist-export') as HTMLInputElement;
    checkbox.checked = false;
    checkbox.dispatchEvent(new Event('change'));

    expect(state.datalistExportCsv).toBe(false);
  });
});
