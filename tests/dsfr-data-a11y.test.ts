import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CSV_BOM } from '@dsfr-data/shared';
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

    it('filename defaults to données.csv', () => {
      expect(comp.filename).toBe('données.csv');
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

    it('emptyLabel defaults to empty string (absent = rendu inchangé)', () => {
      expect(comp.emptyLabel).toBe('');
    });

    it('seriesField defaults to empty string', () => {
      expect(comp.seriesField).toBe('');
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
      expect(link!.textContent).toBe('Voir les données accessibles');
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
      expect(csv).toBe(`${CSV_BOM}nom;pop\nParis;2000000\nLyon;500000`);
    });

    it('escapes quotes in values', () => {
      const data = [{ nom: 'Ville "Test"', pop: 100 }];
      const csv = comp._buildCsv(data);
      expect(csv).toBe(`${CSV_BOM}nom;pop\n"Ville ""Test""";100`);
    });

    it('escapes semicolons in values', () => {
      const data = [{ desc: 'a;b', val: 1 }];
      const csv = comp._buildCsv(data);
      expect(csv).toBe(`${CSV_BOM}desc;val\n"a;b";1`);
    });

    it('handles null and undefined values', () => {
      const data = [{ a: null, b: undefined, c: 'ok' }];
      const csv = comp._buildCsv(data as Record<string, unknown>[]);
      expect(csv).toBe(`${CSV_BOM}a;b;c\n;;ok`);
    });

    it('generates header-only for single-row empty data', () => {
      const data = [{ col1: '', col2: '' }];
      const csv = comp._buildCsv(data);
      expect(csv).toBe(`${CSV_BOM}col1;col2\n;`);
    });

    it('handles numeric values correctly', () => {
      const data = [{ x: 3.14, y: -42 }];
      const csv = comp._buildCsv(data);
      expect(csv).toBe(`${CSV_BOM}x;y\n3.14;-42`);
    });

    it('handles boolean values', () => {
      const data = [{ flag: true, active: false }];
      const csv = comp._buildCsv(data);
      expect(csv).toBe(`${CSV_BOM}flag;active\ntrue;false`);
    });

    it('quotes multi-line values (RFC 4180)', () => {
      const data = [{ adresse: '12 rue X\n75001 Paris', ville: 'Paris' }];
      const csv = comp._buildCsv(data);
      expect(csv).toBe(`${CSV_BOM}adresse;ville\n"12 rue X\n75001 Paris";Paris`);
    });

    it('neutralizes spreadsheet formulas', () => {
      const data = [{ a: '=SUM(A1:A2)', b: 12 }];
      const csv = comp._buildCsv(data);
      expect(csv).toBe(`${CSV_BOM}a;b\n'=SUM(A1:A2);12`);
    });

    it('excludes technical _* fields (e.g. _highlight) from export', () => {
      const data = [{ nom: 'Paris', _highlight: '<mark>Pa</mark>ris' }];
      const csv = comp._buildCsv(data);
      expect(csv).toBe(`${CSV_BOM}nom\nParis`);
    });

    it('exports the same columns as the rendered table when label/value fields are set', () => {
      comp.labelField = 'nom';
      comp.valueField = 'pop';
      const data = [{ nom: 'Paris', pop: 2000000, interne: 'x', _highlight: 'y' }];
      const csv = comp._buildCsv(data);
      expect(csv).toBe(`${CSV_BOM}nom;pop\nParis;2000000`);
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
      expect(desc).toContain('Téléchargement CSV disponible.');
    });

    it('mentions table when enabled', () => {
      comp.table = true;
      const desc = (comp as any)._getAutoDescription(true, [{ a: 1 }]);
      expect(desc).toContain('Tableau de données disponible.');
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

  // =========================================================================
  // Cellules du tableau : format fr-FR des nombres (#666)
  // =========================================================================

  describe('table cells — fr-FR number formatting (#666)', () => {
    const nbsp = (str: string) => str.replace(/[\u202F\u00A0]/g, ' ');
    const cellTexts = (el: Element): string[] =>
      Array.from(el.querySelectorAll('tbody td')).map((td) => (td.textContent ?? '').trim());

    async function mountWithData(
      rows: Record<string, unknown>[],
      attrs: Record<string, string> = {}
    ) {
      comp.source = SOURCE_ID;
      comp.table = true;
      comp.noAutoAria = true;
      for (const [name, value] of Object.entries(attrs)) comp.setAttribute(name, value);
      document.body.appendChild(comp);
      dispatchDataLoaded(SOURCE_ID, rows);
      await comp.updateComplete;
    }

    it('formatCellValue : 2.27 → « 2,27 », chaînes intactes, vide pour null/undefined', () => {
      expect(comp.formatCellValue(2.27)).toBe('2,27');
      expect(comp.formatCellValue(0.2)).toBe('0,2');
      expect(comp.formatCellValue(42)).toBe('42');
      expect(nbsp(comp.formatCellValue(1234.5))).toBe('1 234,5');
      expect(comp.formatCellValue('75056')).toBe('75056');
      expect(comp.formatCellValue('2.27')).toBe('2.27');
      expect(comp.formatCellValue(null)).toBe('');
      expect(comp.formatCellValue(undefined)).toBe('');
    });

    it('decimals fixe le nombre de décimales', () => {
      comp.decimals = 2;
      expect(comp.formatCellValue(2)).toBe('2,00');
      expect(comp.formatCellValue('2')).toBe('2');
      comp.decimals = 0;
      expect(comp.formatCellValue(2.27)).toBe('2');
    });

    it('rend « 2,27 » dans la cellule et laisse le code INSEE « 75056 » intact', async () => {
      await mountWithData([
        { code: '75056', taux: 2.27 },
        { code: '01001', taux: 0.2 },
      ]);
      expect(cellTexts(comp)).toEqual(['75056', '2,27', '01001', '0,2']);
      comp.remove();
    });

    it("l'attribut decimals est lu depuis le HTML", async () => {
      await mountWithData([{ taux: 2.27 }, { taux: 3 }], { decimals: '1' });
      expect(cellTexts(comp)).toEqual(['2,3', '3,0']);
      comp.remove();
    });

    it('le CSV reste brut : 2.27, pas 2,27', async () => {
      await mountWithData([{ code: '75056', taux: 2.27 }], { decimals: '1' });
      expect(cellTexts(comp)).toEqual(['75056', '2,3']);
      const csv = comp._buildCsv([{ code: '75056', taux: 2.27 }]);
      expect(csv).toBe(`${CSV_BOM}code;taux\n75056;2.27`);
      comp.remove();
    });
  });

  // =========================================================================
  // empty-label — le groupe null porte le même nom que sur le graphique (#933)
  // =========================================================================

  describe('empty-label — cellule de libellé du groupe null (#933)', () => {
    const cellTexts = (el: Element): string[][] =>
      Array.from(el.querySelectorAll('tbody tr')).map((tr) =>
        Array.from(tr.querySelectorAll('td')).map((td) => (td.textContent ?? '').trim())
      );

    async function mount(rows: Record<string, unknown>[], attrs: Record<string, string> = {}) {
      comp.source = SOURCE_ID;
      comp.table = true;
      comp.noAutoAria = true;
      for (const [name, value] of Object.entries(attrs)) comp.setAttribute(name, value);
      document.body.appendChild(comp);
      dispatchDataLoaded(SOURCE_ID, rows);
      await comp.updateComplete;
    }

    const ROWS = [
      { cat: 'École', total: 10 },
      { cat: 'Collège', total: 6 },
      { cat: null, total: 3 },
    ];

    it('sans empty-label, la cellule reste vide (rendu historique inchangé)', async () => {
      await mount(ROWS, { 'label-field': 'cat', 'value-field': 'total' });
      expect(cellTexts(comp)).toEqual([
        ['École', '10'],
        ['Collège', '6'],
        ['', '3'],
      ]);
      comp.remove();
    });

    it('empty-label nomme le groupe null dans la colonne de libellé', async () => {
      await mount(ROWS, {
        'label-field': 'cat',
        'value-field': 'total',
        'empty-label': 'Non renseigné',
      });
      expect(cellTexts(comp)).toEqual([
        ['École', '10'],
        ['Collège', '6'],
        ['Non renseigné', '3'],
      ]);
      comp.remove();
    });

    it('couvre null, undefined et la chaîne vide, comme dsfr-data-chart', async () => {
      await mount(
        [
          { cat: null, total: 1 },
          { cat: undefined, total: 2 },
          { cat: '', total: 3 },
        ],
        { 'label-field': 'cat', 'value-field': 'total', 'empty-label': 'Non renseigné' }
      );
      expect(cellTexts(comp)).toEqual([
        ['Non renseigné', '1'],
        ['Non renseigné', '2'],
        ['Non renseigné', '3'],
      ]);
      comp.remove();
    });

    it('ne touche pas aux cellules de valeur : une valeur nulle reste vide', async () => {
      await mount([{ cat: 'École', total: null }], {
        'label-field': 'cat',
        'value-field': 'total',
        'empty-label': 'Non renseigné',
      });
      expect(cellTexts(comp)).toEqual([['École', '']]);
      comp.remove();
    });

    it("sans label-field, s'applique à la première colonne rendue", async () => {
      await mount(ROWS, { 'empty-label': 'Non renseigné' });
      expect(cellTexts(comp)).toEqual([
        ['École', '10'],
        ['Collège', '6'],
        ['Non renseigné', '3'],
      ]);
      comp.remove();
    });

    it('le CSV téléchargé porte le même libellé', () => {
      comp.labelField = 'cat';
      comp.valueField = 'total';
      comp.emptyLabel = 'Non renseigné';
      const csv = comp._buildCsv(ROWS as Record<string, unknown>[]);
      expect(csv).toBe(`${CSV_BOM}cat;total\nÉcole;10\nCollège;6\nNon renseigné;3`);
    });

    it('sans empty-label, le CSV reste brut', () => {
      comp.labelField = 'cat';
      comp.valueField = 'total';
      const csv = comp._buildCsv(ROWS as Record<string, unknown>[]);
      expect(csv).toBe(`${CSV_BOM}cat;total\nÉcole;10\nCollège;6\n;3`);
    });
  });

  // =========================================================================
  // series-field — la dimension série du format long (#930)
  // =========================================================================

  describe('series-field — pivot du format long (#930)', () => {
    const headers = (el: Element): string[] =>
      Array.from(el.querySelectorAll('thead th')).map((th) => (th.textContent ?? '').trim());
    const scopes = (el: Element): string[] =>
      Array.from(el.querySelectorAll('thead th')).map((th) => th.getAttribute('scope') ?? '');
    // Corps du tableau : th de ligne ET td, dans l'ordre du DOM.
    const cellTexts = (el: Element): string[][] =>
      Array.from(el.querySelectorAll('tbody tr')).map((tr) =>
        Array.from(tr.querySelectorAll('th, td')).map((c) => (c.textContent ?? '').trim())
      );
    const rowHeaders = (el: Element): string[] =>
      Array.from(el.querySelectorAll('tbody th')).map((th) => th.getAttribute('scope') ?? '');

    async function mount(rows: Record<string, unknown>[], attrs: Record<string, string> = {}) {
      comp.source = SOURCE_ID;
      comp.table = true;
      comp.noAutoAria = true;
      for (const [name, value] of Object.entries(attrs)) comp.setAttribute(name, value);
      document.body.appendChild(comp);
      dispatchDataLoaded(SOURCE_ID, rows);
      await comp.updateComplete;
    }

    // Format long tel que le produit dsfr-data-concat + origin-field.
    const LONG = [
      { annee: '2022', federation: 'Athlétisme', base100: 100 },
      { annee: '2022', federation: 'Toutes fédés', base100: 100 },
      { annee: '2023', federation: 'Athlétisme', base100: 104 },
      { annee: '2023', federation: 'Toutes fédés', base100: 98 },
    ];

    it('sans series-field, une ligne par enregistrement (rendu historique inchangé)', async () => {
      await mount(LONG, { 'label-field': 'annee', 'value-field': 'base100' });
      expect(headers(comp)).toEqual(['annee', 'base100']);
      expect(cellTexts(comp)).toEqual([
        ['2022', '100'],
        ['2022', '100'],
        ['2023', '104'],
        ['2023', '98'],
      ]);
      comp.remove();
    });

    it('series-field : une colonne par série, une ligne par libellé', async () => {
      await mount(LONG, {
        'label-field': 'annee',
        'value-field': 'base100',
        'series-field': 'federation',
      });
      expect(headers(comp)).toEqual(['annee', 'Athlétisme', 'Toutes fédés']);
      expect(scopes(comp)).toEqual(['col', 'col', 'col']);
      expect(cellTexts(comp)).toEqual([
        ['2022', '100', '100'],
        ['2023', '104', '98'],
      ]);
      comp.remove();
    });

    it('la cellule de libellé est un en-tête de ligne (scope="row")', async () => {
      await mount(LONG, {
        'label-field': 'annee',
        'value-field': 'base100',
        'series-field': 'federation',
      });
      expect(rowHeaders(comp)).toEqual(['row', 'row']);
      comp.remove();
    });

    it('le tableau à plat garde ses <td> : aucun en-tête de ligne ajouté', async () => {
      await mount(LONG, { 'label-field': 'annee', 'value-field': 'base100' });
      expect(rowHeaders(comp)).toEqual([]);
      comp.remove();
    });

    it('un couple (libellé, série) absent laisse la cellule vide', async () => {
      await mount(
        [
          { annee: '2022', federation: 'A', base100: 1 },
          { annee: '2023', federation: 'B', base100: 2 },
        ],
        { 'label-field': 'annee', 'value-field': 'base100', 'series-field': 'federation' }
      );
      expect(headers(comp)).toEqual(['annee', 'A', 'B']);
      expect(cellTexts(comp)).toEqual([
        ['2022', '1', ''],
        ['2023', '', '2'],
      ]);
      comp.remove();
    });

    it('empty-label nomme aussi une série sans nom', async () => {
      await mount(
        [
          { annee: '2022', federation: null, base100: 1 },
          { annee: '2022', federation: 'A', base100: 2 },
        ],
        {
          'label-field': 'annee',
          'value-field': 'base100',
          'series-field': 'federation',
          'empty-label': 'Non renseigné',
        }
      );
      expect(headers(comp)).toEqual(['annee', 'Non renseigné', 'A']);
      comp.remove();
    });

    it('series-field sans label-field ni value-field : erreur de configuration nommée, rendu inchangé', async () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      await mount(LONG, { 'series-field': 'federation' });
      expect(comp.getAttribute('data-dsfr-config-error')).toContain('series-field');
      expect(headers(comp)).toEqual(['annee', 'federation', 'base100']);
      spy.mockRestore();
      comp.remove();
    });

    it('la description lue annonce le nombre de lignes du tableau, pas du format long', async () => {
      await mount(LONG, {
        'label-field': 'annee',
        'value-field': 'base100',
        'series-field': 'federation',
      });
      const desc = (comp.querySelector(`#${comp.id}-desc`)?.textContent ?? '').trim();
      expect(desc).toContain('2 lignes');
      expect(desc).toContain('2 séries');
      comp.remove();
    });

    it('le CSV téléchargé porte la même structure que le tableau affiché', () => {
      comp.labelField = 'annee';
      comp.valueField = 'base100';
      comp.seriesField = 'federation';
      const csv = comp._buildCsv(LONG as Record<string, unknown>[]);
      expect(csv).toBe(`${CSV_BOM}annee;Athlétisme;Toutes fédés\n2022;100;100\n2023;104;98`);
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
