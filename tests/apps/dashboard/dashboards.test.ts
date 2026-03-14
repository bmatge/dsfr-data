import { describe, it, expect, beforeEach, vi } from 'vitest';
import { state, createEmptyDashboard } from '../../../apps/dashboard/src/state';

// Mock @dsfr-data/shared
vi.mock('@dsfr-data/shared', () => ({
  escapeHtml: (s: string) => s.replace(/</g, '&lt;').replace(/>/g, '&gt;'),
  saveToStorage: vi.fn(),
  STORAGE_KEYS: { DASHBOARDS: 'dsfr-data-dashboards' },
  toastWarning: vi.fn(),
  toastSuccess: vi.fn(),
  navigateTo: vi.fn(),
  confirmDialog: vi.fn(),
  getApiAdapter: vi.fn(() => null),
  PROXY_BASE_URL: 'https://chartsbuilder.matge.com',
  LIB_URL: 'https://chartsbuilder.matge.com/dist',
  CDN_URLS: {
    dsfrCss: 'https://cdn.jsdelivr.net/npm/@gouvfr/dsfr@1.11.2/dist/dsfr.min.css',
    dsfrUtilityCss: 'https://cdn.jsdelivr.net/npm/@gouvfr/dsfr@1.11.2/dist/utility/utility.min.css',
    dsfrModuleJs: 'https://cdn.jsdelivr.net/npm/@gouvfr/dsfr@1.11.2/dist/dsfr.module.min.js',
    dsfrChartCss: 'https://cdn.jsdelivr.net/npm/@gouvfr/dsfr-chart@2.0.4/dist/DSFRChart/DSFRChart.css',
    dsfrChartJs: 'https://cdn.jsdelivr.net/npm/@gouvfr/dsfr-chart@2.0.4/dist/DSFRChart/DSFRChart.js',
    chartJs: 'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js',
  },
}));

import { confirmSave, openSaveModal, closeSaveModal, newDashboard, loadDashboard, deleteDashboard } from '../../../apps/dashboard/src/dashboards';
import { saveToStorage, toastWarning, toastSuccess, confirmDialog } from '@dsfr-data/shared';

describe('dashboard/dashboards', () => {
  beforeEach(() => {
    state.dashboard = createEmptyDashboard();
    state.savedDashboards = [];
    vi.clearAllMocks();

    // Set up minimal DOM with save modal fields
    document.body.innerHTML = `
      <input id="dashboard-title" value="" />
      <input id="save-dashboard-name" value="" />
      <textarea id="save-dashboard-description"></textarea>
      <div id="save-modal" class="config-modal"></div>
      <select id="grid-columns"><option value="2">2</option></select>
      <div id="dashboard-grid"></div>
      <div id="generated-code"></div>
      <div id="generated-json"></div>
    `;
  });

  describe('openSaveModal', () => {
    it('should pre-fill name and description from state', () => {
      state.dashboard.name = 'Test Dashboard';
      state.dashboard.description = 'A description';
      openSaveModal();
      expect((document.getElementById('save-dashboard-name') as HTMLInputElement).value).toBe('Test Dashboard');
      expect((document.getElementById('save-dashboard-description') as HTMLTextAreaElement).value).toBe('A description');
      expect(document.getElementById('save-modal')?.classList.contains('active')).toBe(true);
    });
  });

  describe('closeSaveModal', () => {
    it('should remove active class from save modal', () => {
      document.getElementById('save-modal')?.classList.add('active');
      closeSaveModal();
      expect(document.getElementById('save-modal')?.classList.contains('active')).toBe(false);
    });
  });

  describe('confirmSave', () => {
    it('should warn when name is empty', () => {
      (document.getElementById('save-dashboard-name') as HTMLInputElement).value = '';
      confirmSave();
      expect(toastWarning).toHaveBeenCalledWith('Veuillez donner un nom au tableau de bord');
      expect(saveToStorage).not.toHaveBeenCalled();
    });

    it('should save a new dashboard with name and description', () => {
      (document.getElementById('save-dashboard-name') as HTMLInputElement).value = 'Mon Dashboard';
      (document.getElementById('save-dashboard-description') as HTMLTextAreaElement).value = 'Une description';
      confirmSave();
      expect(state.dashboard.name).toBe('Mon Dashboard');
      expect(state.dashboard.description).toBe('Une description');
      expect(state.dashboard.id).toBeTruthy();
      expect(state.dashboard.createdAt).toBeTruthy();
      expect(state.savedDashboards).toHaveLength(1);
      expect(saveToStorage).toHaveBeenCalled();
      expect(toastSuccess).toHaveBeenCalled();
    });

    it('should update an existing dashboard', () => {
      state.dashboard.id = 'existing-id';
      state.savedDashboards = [{ ...createEmptyDashboard(), id: 'existing-id', name: 'Old Name' }];
      (document.getElementById('save-dashboard-name') as HTMLInputElement).value = 'New Name';

      confirmSave();
      expect(state.savedDashboards).toHaveLength(1);
      expect(state.savedDashboards[0].name).toBe('New Name');
    });

    it('should sync toolbar title after save', () => {
      (document.getElementById('save-dashboard-name') as HTMLInputElement).value = 'Updated Title';
      confirmSave();
      expect((document.getElementById('dashboard-title') as HTMLInputElement).value).toBe('Updated Title');
    });
  });

  describe('deleteDashboard', () => {
    it('should remove dashboard from savedDashboards', async () => {
      const dash = { ...createEmptyDashboard(), id: 'dash-1', name: 'To Delete' };
      state.savedDashboards = [dash];

      vi.mocked(confirmDialog).mockResolvedValue(true);

      // Add dashboards-modal and dashboards-list for re-render
      document.body.innerHTML += '<div id="dashboards-modal"><div id="dashboards-list"></div></div>';

      await deleteDashboard('dash-1');
      expect(state.savedDashboards).toHaveLength(0);
      expect(saveToStorage).toHaveBeenCalled();
      expect(toastSuccess).toHaveBeenCalled();
    });

    it('should reset current dashboard id if deleting the active one', async () => {
      const dash = { ...createEmptyDashboard(), id: 'dash-1', name: 'Active' };
      state.savedDashboards = [dash];
      state.dashboard.id = 'dash-1';

      vi.mocked(confirmDialog).mockResolvedValue(true);
      document.body.innerHTML += '<div id="dashboards-modal"><div id="dashboards-list"></div></div>';

      await deleteDashboard('dash-1');
      expect(state.dashboard.id).toBeNull();
    });

    it('should not delete when confirm is cancelled', async () => {
      const dash = { ...createEmptyDashboard(), id: 'dash-1', name: 'Keep' };
      state.savedDashboards = [dash];

      vi.mocked(confirmDialog).mockResolvedValue(false);

      await deleteDashboard('dash-1');
      expect(state.savedDashboards).toHaveLength(1);
      expect(saveToStorage).not.toHaveBeenCalled();
    });

    it('should do nothing for unknown id', () => {
      deleteDashboard('nonexistent');
      expect(saveToStorage).not.toHaveBeenCalled();
    });
  });

  describe('newDashboard', () => {
    it('should reset to empty dashboard when no widgets', () => {
      state.dashboard.name = 'Custom Name';
      newDashboard();
      expect(state.dashboard.name).toBe('Mon tableau de bord');
      expect(state.dashboard.widgets).toEqual([]);
    });
  });

  describe('loadDashboard', () => {
    it('should load a saved dashboard by id', () => {
      const saved = {
        ...createEmptyDashboard(),
        id: 'dash-1',
        name: 'Saved Dashboard',
        widgets: [{ id: 'w-1', type: 'kpi' as const, title: 'KPI', position: { row: 0, col: 0 }, config: {} }],
      };
      state.savedDashboards = [saved];

      document.body.innerHTML += '<div id="dashboards-modal" class="active"></div>';

      loadDashboard('dash-1');
      expect(state.dashboard.name).toBe('Saved Dashboard');
      expect(state.dashboard.widgets).toHaveLength(1);
    });

    it('should do nothing for unknown id', () => {
      state.dashboard.name = 'Original';
      loadDashboard('nonexistent');
      expect(state.dashboard.name).toBe('Original');
    });
  });
});
