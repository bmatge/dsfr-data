import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DsfrDataPodium } from '../src/components/dsfr-data-podium.js';
import { clearDataCache, dispatchDataLoaded, dispatchDataLoading, dispatchDataError } from '../src/utils/data-bridge.js';

const REGIONS = [
  { nom: 'Ile-de-France', population: 12271794, type: 'Region' },
  { nom: 'Auvergne-Rhone-Alpes', population: 8092834, type: 'Region' },
  { nom: 'Nouvelle-Aquitaine', population: 6109841, type: 'Departement' },
  { nom: 'Hauts-de-France', population: 6003095, type: 'Region' },
  { nom: 'Occitanie', population: 5924858, type: 'Region' },
  { nom: 'Grand-Est', population: 5561287, type: 'Region' },
  { nom: 'Bretagne', population: 3394567, type: 'Region' },
];

describe('DsfrDataPodium', () => {
  let podium: DsfrDataPodium;

  beforeEach(() => {
    clearDataCache('test-podium');
    podium = new DsfrDataPodium();
    podium.labelField = 'nom';
    podium.valueField = 'population';
  });

  afterEach(() => {
    if (podium.isConnected) {
      podium.disconnectedCallback();
    }
  });

  it('is registered as custom element', () => {
    expect(customElements.get('dsfr-data-podium')).toBeDefined();
  });

  describe('_processItems', () => {
    it('returns empty array when no data', () => {
      expect((podium as any)._processItems()).toEqual([]);
    });

    it('returns empty array when labelField missing', () => {
      podium.labelField = '';
      (podium as any)._data = REGIONS;
      expect((podium as any)._processItems()).toEqual([]);
    });

    it('returns empty array when valueField missing', () => {
      podium.valueField = '';
      (podium as any)._data = REGIONS;
      expect((podium as any)._processItems()).toEqual([]);
    });

    it('sorts descending by value', () => {
      (podium as any)._data = [
        { nom: 'B', population: 100 },
        { nom: 'C', population: 300 },
        { nom: 'A', population: 200 },
      ];
      const items = (podium as any)._processItems();
      expect(items.map((i: any) => i.label)).toEqual(['C', 'A', 'B']);
    });

    it('respects noSort flag', () => {
      podium.noSort = true;
      (podium as any)._data = [
        { nom: 'B', population: 100 },
        { nom: 'C', population: 300 },
        { nom: 'A', population: 200 },
      ];
      const items = (podium as any)._processItems();
      expect(items.map((i: any) => i.label)).toEqual(['B', 'C', 'A']);
    });

    it('truncates to maxItems', () => {
      podium.maxItems = 3;
      (podium as any)._data = REGIONS;
      const items = (podium as any)._processItems();
      expect(items).toHaveLength(3);
    });

    it('defaults maxItems to 5', () => {
      (podium as any)._data = REGIONS;
      const items = (podium as any)._processItems();
      expect(items).toHaveLength(5);
    });

    it('assigns ranks starting at 1', () => {
      (podium as any)._data = REGIONS;
      const items = (podium as any)._processItems();
      expect(items.map((i: any) => i.rank)).toEqual([1, 2, 3, 4, 5]);
    });

    it('computes ratios relative to max value', () => {
      (podium as any)._data = [
        { nom: 'A', population: 100 },
        { nom: 'B', population: 50 },
      ];
      podium.maxItems = 10;
      const items = (podium as any)._processItems();
      expect(items[0].ratio).toBe(1);
      expect(items[1].ratio).toBe(0.5);
    });

    it('uses barMax when set', () => {
      podium.barMax = 200;
      (podium as any)._data = [
        { nom: 'A', population: 100 },
        { nom: 'B', population: 50 },
      ];
      podium.maxItems = 10;
      const items = (podium as any)._processItems();
      expect(items[0].ratio).toBe(0.5);
      expect(items[1].ratio).toBe(0.25);
    });

    it('uses static subtitle', () => {
      podium.subtitle = 'Region';
      (podium as any)._data = [{ nom: 'A', population: 100 }];
      podium.maxItems = 10;
      const items = (podium as any)._processItems();
      expect(items[0].subtitle).toBe('Region');
    });

    it('uses subtitleField over static subtitle', () => {
      podium.subtitle = 'Fallback';
      podium.subtitleField = 'type';
      (podium as any)._data = [{ nom: 'Nouvelle-Aquitaine', population: 6109841, type: 'Departement' }];
      podium.maxItems = 10;
      const items = (podium as any)._processItems();
      expect(items[0].subtitle).toBe('Departement');
    });

    it('assigns palette colors in order', () => {
      podium.selectedPalette = 'categorical';
      (podium as any)._data = [
        { nom: 'A', population: 100 },
        { nom: 'B', population: 50 },
      ];
      podium.maxItems = 10;
      const items = (podium as any)._processItems();
      expect(items[0].color).toBe('#000091');
      expect(items[1].color).toBe('#FCC63A');
    });

    it('falls back to sequentialDescending for unknown palette', () => {
      podium.selectedPalette = 'unknown-palette';
      (podium as any)._data = [{ nom: 'A', population: 100 }];
      podium.maxItems = 10;
      const items = (podium as any)._processItems();
      expect(items[0].color).toBe('#000091');
    });

    it('returns all items when fewer than maxItems', () => {
      podium.maxItems = 10;
      (podium as any)._data = [
        { nom: 'A', population: 100 },
        { nom: 'B', population: 50 },
      ];
      const items = (podium as any)._processItems();
      expect(items).toHaveLength(2);
    });

    it('handles nested field paths via getByPath', () => {
      podium.labelField = 'geo.nom';
      podium.valueField = 'stats.population';
      (podium as any)._data = [
        { geo: { nom: 'Paris' }, stats: { population: 2200000 } },
        { geo: { nom: 'Lyon' }, stats: { population: 500000 } },
      ];
      podium.maxItems = 10;
      const items = (podium as any)._processItems();
      expect(items[0].label).toBe('Paris');
      expect(items[0].value).toBe(2200000);
      expect(items[1].label).toBe('Lyon');
    });

    it('treats non-numeric values as 0', () => {
      (podium as any)._data = [
        { nom: 'A', population: 'invalid' },
        { nom: 'B', population: 50 },
      ];
      podium.maxItems = 10;
      const items = (podium as any)._processItems();
      // B (50) should be first after sort desc
      expect(items[0].label).toBe('B');
      expect(items[0].value).toBe(50);
      expect(items[1].label).toBe('A');
      expect(items[1].value).toBe(0);
    });

    it('handles all zero values without division by zero', () => {
      (podium as any)._data = [
        { nom: 'A', population: 0 },
        { nom: 'B', population: 0 },
      ];
      podium.maxItems = 10;
      const items = (podium as any)._processItems();
      // Math.max(0, 0, 1) = 1, so ratio = 0/1 = 0
      expect(items[0].ratio).toBe(0);
      expect(items[1].ratio).toBe(0);
    });

    it('handles barMax of 0 without division by zero', () => {
      podium.barMax = 0;
      (podium as any)._data = [{ nom: 'A', population: 100 }];
      podium.maxItems = 10;
      const items = (podium as any)._processItems();
      expect(items[0].ratio).toBe(0);
    });

    it('wraps palette colors when more items than palette length', () => {
      podium.selectedPalette = 'categorical';
      podium.maxItems = 12;
      // categorical has 9 colors — 10th item should wrap to index 0
      (podium as any)._data = Array.from({ length: 10 }, (_, i) => ({
        nom: `Item ${i}`,
        population: 100 - i,
      }));
      const items = (podium as any)._processItems();
      expect(items).toHaveLength(10);
      expect(items[9].color).toBe(items[0].color); // wraps around
    });

    it('returns empty subtitle when neither subtitle nor subtitleField set', () => {
      podium.subtitle = '';
      podium.subtitleField = '';
      (podium as any)._data = [{ nom: 'A', population: 100 }];
      podium.maxItems = 10;
      const items = (podium as any)._processItems();
      expect(items[0].subtitle).toBe('');
    });
  });

  describe('_formatValue', () => {
    it('formats number with French locale', () => {
      const formatted = (podium as any)._formatValue(12271794);
      // Intl.NumberFormat fr-FR uses non-breaking spaces
      expect(formatted.replace(/\s/g, '')).toContain('12271794');
    });

    it('appends unit when set', () => {
      podium.valueUnit = 'hab.';
      const formatted = (podium as any)._formatValue(1000);
      expect(formatted).toContain('hab.');
    });

    it('does not append unit when empty', () => {
      podium.valueUnit = '';
      const formatted = (podium as any)._formatValue(1000);
      expect(formatted).not.toContain(' ');
    });

    it('formats zero', () => {
      const formatted = (podium as any)._formatValue(0);
      expect(formatted).toBe('0');
    });
  });

  describe('_getAriaLabel', () => {
    it('returns empty classement message when no items', () => {
      expect((podium as any)._getAriaLabel()).toBe('Classement vide');
    });

    it('builds accessible label with ranks and values', () => {
      (podium as any)._data = [
        { nom: 'A', population: 300 },
        { nom: 'B', population: 100 },
      ];
      podium.maxItems = 10;
      const label = (podium as any)._getAriaLabel();
      expect(label).toContain('Classement');
      expect(label).toContain('1. A');
      expect(label).toContain('2. B');
    });

    it('includes unit in aria label when set', () => {
      podium.valueUnit = 'hab.';
      (podium as any)._data = [{ nom: 'Paris', population: 2200000 }];
      podium.maxItems = 10;
      const label = (podium as any)._getAriaLabel();
      expect(label).toContain('hab.');
    });
  });

  describe('Data integration via data-bridge', () => {
    it('receives data from source', () => {
      podium.source = 'test-podium';
      podium.connectedCallback();

      dispatchDataLoaded('test-podium', REGIONS);

      expect((podium as any)._data).toEqual(REGIONS);
    });

    it('picks up cached data on connect', () => {
      dispatchDataLoaded('test-podium', REGIONS);

      podium.source = 'test-podium';
      podium.connectedCallback();

      expect((podium as any)._data).toEqual(REGIONS);
    });

    it('tracks loading state', () => {
      podium.source = 'test-podium';
      podium.connectedCallback();

      dispatchDataLoading('test-podium');
      expect((podium as any)._sourceLoading).toBe(true);

      dispatchDataLoaded('test-podium', REGIONS);
      expect((podium as any)._sourceLoading).toBe(false);
    });

    it('tracks error state', () => {
      podium.source = 'test-podium';
      podium.connectedCallback();

      const error = new Error('Network failure');
      dispatchDataError('test-podium', error);
      expect((podium as any)._sourceError).toEqual(error);
    });
  });

  describe('onSourceData', () => {
    it('stores array data', () => {
      (podium as any).onSourceData([{ nom: 'A', population: 1 }]);
      expect((podium as any)._data).toEqual([{ nom: 'A', population: 1 }]);
    });

    it('converts non-array to empty array', () => {
      (podium as any).onSourceData({ nom: 'A' });
      expect((podium as any)._data).toEqual([]);
    });

    it('converts null to empty array', () => {
      (podium as any).onSourceData(null);
      expect((podium as any)._data).toEqual([]);
    });

    it('converts undefined to empty array', () => {
      (podium as any).onSourceData(undefined);
      expect((podium as any)._data).toEqual([]);
    });
  });

  describe('Light DOM', () => {
    it('uses Light DOM (createRenderRoot returns this)', () => {
      expect((podium as any).createRenderRoot()).toBe(podium);
    });
  });

  describe('Property defaults', () => {
    it('defaults maxItems to 5', () => {
      expect(podium.maxItems).toBe(5);
    });

    it('defaults selectedPalette to sequentialDescending', () => {
      expect(podium.selectedPalette).toBe('sequentialDescending');
    });

    it('defaults noSort to false', () => {
      expect(podium.noSort).toBe(false);
    });

    it('defaults subtitle to empty', () => {
      expect(podium.subtitle).toBe('');
    });

    it('defaults valueUnit to empty', () => {
      expect(podium.valueUnit).toBe('');
    });
  });
});
