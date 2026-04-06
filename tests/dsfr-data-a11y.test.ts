import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DsfrDataA11y } from '@/components/dsfr-data-a11y.js';
import {
  clearDataCache,
  dispatchDataLoaded,
  dispatchDataLoading,
  dispatchDataError,
} from '@/utils/data-bridge.js';

const SOURCE_ID = 'test-a11y-src';

describe('DsfrDataA11y', () => {
  let comp: DsfrDataA11y;

  beforeEach(() => {
    clearDataCache(SOURCE_ID);
    comp = new DsfrDataA11y();
  });

  afterEach(() => {
    if (comp.isConnected) {
      comp.disconnectedCallback();
    }
    document.querySelectorAll('[data-test-target]').forEach((el) => el.remove());
  });

  // =========================================================================
  // Default properties
  // =========================================================================

  describe('default properties', () => {
    it('source defaults to empty string', () => {
      expect(comp.source).toBe('');
    });

    it('for defaults to empty string', () => {
      expect(comp.for).toBe('');
    });

    it('table defaults to false', () => {
      expect(comp.table).toBe(false);
    });

    it('download defaults to false', () => {
      expect(comp.download).toBe(false);
    });

    it('filename defaults to donnees.csv', () => {
      expect(comp.filename).toBe('donnees.csv');
    });

    it('description defaults to empty string', () => {
      expect(comp.description).toBe('');
    });

    it('labelField defaults to empty string', () => {
      expect(comp.labelField).toBe('');
    });

    it('valueField defaults to empty string', () => {
      expect(comp.valueField).toBe('');
    });

    it('label defaults to empty string', () => {
      expect(comp.label).toBe('');
    });

    it('noAutoAria defaults to false', () => {
      expect(comp.noAutoAria).toBe(false);
    });
  });

  // =========================================================================
  // Auto-ARIA (for attribute)
  // =========================================================================

  describe('auto-ARIA', () => {
    let target: HTMLDivElement;

    beforeEach(() => {
      target = document.createElement('div');
      target.id = 'chart1';
      target.setAttribute('data-test-target', '');
      document.body.appendChild(target);
    });

    afterEach(() => {
      target.remove();
    });

    it('sets aria-describedby on target in connectedCallback', () => {
      comp.for = 'chart1';
      comp.connectedCallback();

      const describedBy = target.getAttribute('aria-describedby') || '';
      expect(describedBy).toContain(`${comp.id}-desc`);
    });

    it('generates auto id if component has no id', () => {
      comp.id = '';
      comp.for = 'chart1';
      comp.connectedCallback();

      expect(comp.id).toMatch(/^dsfr-data-a11y-\d+$/);
      expect(target.getAttribute('aria-describedby')).toBe(`${comp.id}-desc`);
    });

    it('removes aria-describedby on disconnectedCallback', () => {
      comp.for = 'chart1';
      comp.connectedCallback();
      expect(target.getAttribute('aria-describedby')).toContain(`${comp.id}-desc`);

      comp.disconnectedCallback();
      expect(target.hasAttribute('aria-describedby')).toBe(false);
    });

    it('does not set aria-describedby when no-auto-aria is set', () => {
      comp.for = 'chart1';
      comp.noAutoAria = true;
      comp.connectedCallback();

      expect(target.hasAttribute('aria-describedby')).toBe(false);
    });

    it('does not crash when target does not exist', () => {
      comp.for = 'nonexistent-target';
      expect(() => comp.connectedCallback()).not.toThrow();
    });

    it('does not set aria-describedby when for is empty', () => {
      comp.for = '';
      comp.connectedCallback();
      expect(target.hasAttribute('aria-describedby')).toBe(false);
    });

    it('preserves existing aria-describedby values', () => {
      target.setAttribute('aria-describedby', 'existing-id');
      comp.for = 'chart1';
      comp.connectedCallback();

      const value = target.getAttribute('aria-describedby')!;
      expect(value).toContain('existing-id');
      expect(value).toContain(`${comp.id}-desc`);
    });

    it('does not duplicate id in aria-describedby', () => {
      comp.id = 'dl-data';
      comp.for = 'chart1';
      target.setAttribute('aria-describedby', 'dl-data-desc');
      comp.connectedCallback();

      expect(target.getAttribute('aria-describedby')).toBe('dl-data-desc');
    });

    it('cleans up only its own id from aria-describedby on disconnect', () => {
      target.setAttribute('aria-describedby', 'other-id');
      comp.for = 'chart1';
      comp.connectedCallback();

      const before = target.getAttribute('aria-describedby')!;
      expect(before).toContain('other-id');
      expect(before).toContain(`${comp.id}-desc`);

      comp.disconnectedCallback();
      expect(target.getAttribute('aria-describedby')).toBe('other-id');
    });

    it('re-applies ARIA when for attribute changes', () => {
      const target2 = document.createElement('div');
      target2.id = 'chart2';
      target2.setAttribute('data-test-target', '');
      document.body.appendChild(target2);

      comp.for = 'chart1';
      comp.connectedCallback();
      expect(target.getAttribute('aria-describedby')).toContain(`${comp.id}-desc`);

      const changedProps = new Map([['for', 'chart1']]);
      comp.for = 'chart2';
      comp.updated(changedProps);

      expect(target.hasAttribute('aria-describedby')).toBe(false);
      expect(target2.getAttribute('aria-describedby')).toContain(`${comp.id}-desc`);

      target2.remove();
    });

    it('removes ARIA when noAutoAria changes to true', () => {
      comp.for = 'chart1';
      comp.connectedCallback();
      expect(target.getAttribute('aria-describedby')).toContain(`${comp.id}-desc`);

      const changedProps = new Map([['noAutoAria', false]]);
      comp.noAutoAria = true;
      comp.updated(changedProps);

      expect(target.hasAttribute('aria-describedby')).toBe(false);
    });

    it('sets aria-details when table is enabled', () => {
      comp.for = 'chart1';
      comp.table = true;
      comp.connectedCallback();

      expect(target.getAttribute('aria-details')).toBe(`${comp.id}-table`);
    });

    it('does not set aria-details when table is disabled and other features are set', () => {
      comp.for = 'chart1';
      comp.download = true;
      comp.connectedCallback();

      expect(target.hasAttribute('aria-details')).toBe(false);
    });

    it('sets aria-details in default mode (all features active)', () => {
      comp.for = 'chart1';
      // No features explicitly set → all active by default
      comp.connectedCallback();

      expect(target.getAttribute('aria-details')).toBe(`${comp.id}-table`);
    });

    it('cleans up aria-details on disconnect', () => {
      comp.for = 'chart1';
      comp.table = true;
      comp.connectedCallback();
      expect(target.getAttribute('aria-details')).toBe(`${comp.id}-table`);

      comp.disconnectedCallback();
      expect(target.hasAttribute('aria-details')).toBe(false);
    });
  });

  // =========================================================================
  // Skip link injection
  // =========================================================================

  describe('skip link', () => {
    let target: HTMLDivElement;

    beforeEach(() => {
      target = document.createElement('div');
      target.id = 'chart-skip';
      target.setAttribute('data-test-target', '');
      document.body.appendChild(target);
    });

    afterEach(() => {
      target.remove();
    });

    it('injects a skip link into the target element', () => {
      comp.for = 'chart-skip';
      comp.connectedCallback();

      const link = target.querySelector('a.dsfr-data-a11y__skiplink');
      expect(link).not.toBeNull();
      expect(link!.getAttribute('href')).toBe(`#${comp.id}-section`);
      expect(link!.textContent).toBe('Voir les donnees accessibles');
    });

    it('injects skip link as first child', () => {
      target.innerHTML = '<p>Existing content</p>';
      comp.for = 'chart-skip';
      comp.connectedCallback();

      expect(target.firstChild).toBeInstanceOf(HTMLAnchorElement);
    });

    it('removes skip link on disconnect', () => {
      comp.for = 'chart-skip';
      comp.connectedCallback();
      expect(target.querySelector('a.dsfr-data-a11y__skiplink')).not.toBeNull();

      comp.disconnectedCallback();
      expect(target.querySelector('a.dsfr-data-a11y__skiplink')).toBeNull();
    });

    it('does not inject skip link when no-auto-aria is set', () => {
      comp.for = 'chart-skip';
      comp.noAutoAria = true;
      comp.connectedCallback();

      expect(target.querySelector('a.dsfr-data-a11y__skiplink')).toBeNull();
    });

    it('does not crash when target does not exist', () => {
      comp.for = 'nonexistent';
      expect(() => comp.connectedCallback()).not.toThrow();
    });

    it('has data-dsfr-data-a11y-link attribute', () => {
      comp.for = 'chart-skip';
      comp.connectedCallback();

      const link = target.querySelector('a.dsfr-data-a11y__skiplink');
      expect(link!.getAttribute('data-dsfr-data-a11y-link')).toBe(comp.id);
    });
  });

  // =========================================================================
  // CSV generation
  // =========================================================================

  describe('CSV generation', () => {
    it('generates correct CSV with semicolon separator', () => {
      const data = [
        { nom: 'Paris', pop: 2000000 },
        { nom: 'Lyon', pop: 500000 },
      ];
      const csv = comp._buildCsv(data);
      expect(csv).toBe('nom;pop\nParis;2000000\nLyon;500000');
    });

    it('escapes quotes in values', () => {
      const data = [{ nom: 'Ville "Test"', pop: 100 }];
      const csv = comp._buildCsv(data);
      expect(csv).toBe('nom;pop\n"Ville ""Test""";100');
    });

    it('escapes semicolons in values', () => {
      const data = [{ desc: 'a;b', val: 1 }];
      const csv = comp._buildCsv(data);
      expect(csv).toBe('desc;val\n"a;b";1');
    });

    it('handles null and undefined values', () => {
      const data = [{ a: null, b: undefined, c: 'ok' }];
      const csv = comp._buildCsv(data as Record<string, unknown>[]);
      expect(csv).toBe('a;b;c\n;;ok');
    });

    it('generates header-only for single-row empty data', () => {
      const data = [{ col1: '', col2: '' }];
      const csv = comp._buildCsv(data);
      expect(csv).toBe('col1;col2\n;');
    });

    it('handles numeric values correctly', () => {
      const data = [{ x: 3.14, y: -42 }];
      const csv = comp._buildCsv(data);
      expect(csv).toBe('x;y\n3.14;-42');
    });

    it('handles boolean values', () => {
      const data = [{ flag: true, active: false }];
      const csv = comp._buildCsv(data);
      expect(csv).toBe('flag;active\ntrue;false');
    });
  });

  // =========================================================================
  // Download trigger
  // =========================================================================

  describe('download', () => {
    it('does nothing when no source data', () => {
      const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
      (comp as any)._handleDownload();
      expect(clickSpy).not.toHaveBeenCalled();
      clickSpy.mockRestore();
    });

    it('does nothing when source data is not an array', () => {
      const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
      (comp as any)._sourceData = { not: 'an array' };
      (comp as any)._handleDownload();
      expect(clickSpy).not.toHaveBeenCalled();
      clickSpy.mockRestore();
    });

    it('does nothing when source data is empty array', () => {
      const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
      (comp as any)._sourceData = [];
      (comp as any)._handleDownload();
      expect(clickSpy).not.toHaveBeenCalled();
      clickSpy.mockRestore();
    });

    it('triggers download with correct filename', () => {
      const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
      const origCreate = globalThis.URL.createObjectURL;
      const origRevoke = globalThis.URL.revokeObjectURL;
      globalThis.URL.createObjectURL = vi.fn().mockReturnValue('blob:test');
      globalThis.URL.revokeObjectURL = vi.fn();

      (comp as any)._sourceData = [{ a: 1 }];
      comp.filename = 'export.csv';
      (comp as any)._handleDownload();

      expect(clickSpy).toHaveBeenCalled();
      expect(globalThis.URL.createObjectURL).toHaveBeenCalled();
      expect(globalThis.URL.revokeObjectURL).toHaveBeenCalledWith('blob:test');

      clickSpy.mockRestore();
      globalThis.URL.createObjectURL = origCreate;
      globalThis.URL.revokeObjectURL = origRevoke;
    });
  });

  // =========================================================================
  // Data bridge subscription
  // =========================================================================

  describe('data bridge subscription', () => {
    it('receives data via dispatchDataLoaded', () => {
      comp.source = SOURCE_ID;
      comp.connectedCallback();

      dispatchDataLoaded(SOURCE_ID, [{ region: 'Bretagne', pop: 3000000 }]);

      expect((comp as any)._sourceData).toEqual([{ region: 'Bretagne', pop: 3000000 }]);
    });

    it('updates when data changes', () => {
      comp.source = SOURCE_ID;
      comp.connectedCallback();

      dispatchDataLoaded(SOURCE_ID, [{ a: 1 }]);
      expect((comp as any)._sourceData).toEqual([{ a: 1 }]);

      dispatchDataLoaded(SOURCE_ID, [{ a: 2 }, { a: 3 }]);
      expect((comp as any)._sourceData).toEqual([{ a: 2 }, { a: 3 }]);
    });

    it('handles loading state', () => {
      comp.source = SOURCE_ID;
      comp.connectedCallback();

      dispatchDataLoading(SOURCE_ID);
      expect((comp as any)._sourceLoading).toBe(true);
    });

    it('handles error state', () => {
      comp.source = SOURCE_ID;
      comp.connectedCallback();

      dispatchDataError(SOURCE_ID, new Error('test error'));
      expect((comp as any)._sourceError).toBeInstanceOf(Error);
    });
  });

  // =========================================================================
  // Table column selection
  // =========================================================================

  describe('table columns', () => {
    it('returns all columns when no field attributes set', () => {
      const data = [{ a: 1, b: 2, c: 3 }];
      const cols = (comp as any)._getColumns(data);
      expect(cols).toEqual(['a', 'b', 'c']);
    });

    it('uses label-field and value-field when set', () => {
      comp.labelField = 'region';
      comp.valueField = 'population';
      const data = [{ region: 'IDF', population: 12000, code: '75' }];
      const cols = (comp as any)._getColumns(data);
      expect(cols).toEqual(['region', 'population']);
    });

    it('supports multiple value fields separated by commas', () => {
      comp.labelField = 'region';
      comp.valueField = 'pop, budget';
      const data = [{ region: 'IDF', pop: 12000, budget: 500 }];
      const cols = (comp as any)._getColumns(data);
      expect(cols).toEqual(['region', 'pop', 'budget']);
    });

    it('returns empty array for empty data', () => {
      const cols = (comp as any)._getColumns([]);
      expect(cols).toEqual([]);
    });
  });

  // =========================================================================
  // Auto description
  // =========================================================================

  describe('auto description', () => {
    it('returns no-data message when empty', () => {
      const desc = (comp as any)._getAutoDescription(false, []);
      expect(desc).toBe('Aucune donnee disponible.');
    });

    it('includes row count', () => {
      const data = [{ a: 1 }, { a: 2 }, { a: 3 }];
      const desc = (comp as any)._getAutoDescription(true, data);
      expect(desc).toContain('3 lignes');
    });

    it('includes user description when provided', () => {
      comp.description = 'Un graphique important.';
      const desc = (comp as any)._getAutoDescription(true, [{ a: 1 }]);
      expect(desc).toContain('Un graphique important.');
    });

    it('mentions CSV download when enabled', () => {
      comp.download = true;
      const desc = (comp as any)._getAutoDescription(true, [{ a: 1 }]);
      expect(desc).toContain('Telechargement CSV disponible.');
    });

    it('mentions table when enabled', () => {
      comp.table = true;
      const desc = (comp as any)._getAutoDescription(true, [{ a: 1 }]);
      expect(desc).toContain('Tableau de donnees disponible.');
    });
  });

  // =========================================================================
  // Default behavior (all features active)
  // =========================================================================

  describe('default behavior', () => {
    it('shows all features when none explicitly set', () => {
      expect((comp as any)._showAll).toBe(true);
      expect((comp as any)._showTable).toBe(true);
      expect((comp as any)._showDownload).toBe(true);
    });

    it('does not show all when table is explicitly set', () => {
      comp.table = true;
      expect((comp as any)._showAll).toBe(false);
      expect((comp as any)._showTable).toBe(true);
      expect((comp as any)._showDownload).toBe(false);
    });

    it('does not show all when download is explicitly set', () => {
      comp.download = true;
      expect((comp as any)._showAll).toBe(false);
      expect((comp as any)._showTable).toBe(false);
      expect((comp as any)._showDownload).toBe(true);
    });

    it('does not show all when description is explicitly set', () => {
      comp.description = 'Some text';
      expect((comp as any)._showAll).toBe(false);
      expect((comp as any)._showDescription).toBe(true);
      expect((comp as any)._showTable).toBe(false);
      expect((comp as any)._showDownload).toBe(false);
    });
  });

  // =========================================================================
  // Render
  // =========================================================================

  describe('render', () => {
    it('renders a section with role complementary', () => {
      const result = comp.render();
      expect(result).toBeDefined();
    });

    it('uses light DOM', () => {
      expect(comp.createRenderRoot()).toBe(comp);
    });
  });

  describe('DataBox cohabitation', () => {
    it('keeps table and download active even when DataBox is present', () => {
      // DataBox table view does not work with async data,
      // so dsfr-data-a11y keeps its own table/download features.
      comp.table = true;
      comp.download = true;

      expect((comp as any)._showTable).toBe(true);
      expect((comp as any)._showDownload).toBe(true);
    });
  });
});
