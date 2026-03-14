import { describe, it, expect } from 'vitest';
import { generateWidgetHTML } from '../../../apps/dashboard/src/code-generator';
import type { Widget } from '../../../apps/dashboard/src/state';

function makeWidget(overrides: Partial<Widget> & { type: Widget['type'] }): Widget {
  return {
    id: 'w-test',
    title: 'Test Widget',
    position: { row: 0, col: 0 },
    config: {},
    ...overrides,
  };
}

describe('dashboard/code-generator', () => {
  describe('generateWidgetHTML', () => {
    it('should generate KPI HTML with dsfr-data-kpi tag', () => {
      const widget = makeWidget({
        type: 'kpi',
        config: { valeur: '1234', label: 'Total', format: 'nombre', icone: '' },
      });
      const html = generateWidgetHTML(widget);
      expect(html).toContain('<dsfr-data-kpi');
      expect(html).toContain('valeur="1234"');
      expect(html).toContain('label="Total"');
      expect(html).toContain('format="nombre"');
    });

    it('should include icone attribute when set', () => {
      const widget = makeWidget({
        type: 'kpi',
        config: { valeur: '42', label: 'Count', format: 'nombre', icone: 'ri-user-line' },
      });
      const html = generateWidgetHTML(widget);
      expect(html).toContain('icone="ri-user-line"');
    });

    it('should not include icone attribute when empty', () => {
      const widget = makeWidget({
        type: 'kpi',
        config: { valeur: '42', label: 'Count', format: 'nombre', icone: '' },
      });
      const html = generateWidgetHTML(widget);
      expect(html).not.toContain('icone=');
    });

    it('should generate chart HTML with dsfr-data-chart tag', () => {
      const widget = makeWidget({
        type: 'chart',
        config: { chartType: 'line', labelField: 'date', valueField: 'count', palette: 'sequential' },
      });
      const html = generateWidgetHTML(widget);
      expect(html).toContain('<dsfr-data-chart');
      expect(html).toContain('type="line"');
      expect(html).toContain('label-field="date"');
      expect(html).toContain('value-field="count"');
      expect(html).toContain('selected-palette="sequential"');
    });

    it('should generate chart HTML from favorite with code', () => {
      const widget = makeWidget({
        type: 'chart',
        title: 'Fav Chart',
        config: { fromFavorite: true, code: '<dsfr-data-chart type="bar"></dsfr-data-chart>' },
      });
      const html = generateWidgetHTML(widget);
      expect(html).toContain('<!-- Graphique: Fav Chart -->');
      expect(html).toContain('<dsfr-data-chart type="bar"></dsfr-data-chart>');
    });

    it('should generate table HTML with dsfr-data-list tag', () => {
      const widget = makeWidget({
        type: 'table',
        config: { columns: ['col1', 'col2'], searchable: true, sortable: true },
      });
      const html = generateWidgetHTML(widget);
      expect(html).toContain('<dsfr-data-list');
      expect(html).toContain('searchable');
      expect(html).toContain('sortable');
    });

    it('should generate table without searchable/sortable when disabled', () => {
      const widget = makeWidget({
        type: 'table',
        config: { columns: [], searchable: false, sortable: false },
      });
      const html = generateWidgetHTML(widget);
      expect(html).toContain('<dsfr-data-list');
      expect(html).not.toContain('searchable');
      expect(html).not.toContain('sortable');
    });

    it('should generate text as paragraph by default', () => {
      const widget = makeWidget({
        type: 'text',
        config: { content: 'Hello world', style: 'paragraph' },
      });
      const html = generateWidgetHTML(widget);
      expect(html).toContain('<p>Hello world</p>');
    });

    it('should generate text as callout', () => {
      const widget = makeWidget({
        type: 'text',
        config: { content: 'Important info', style: 'callout' },
      });
      const html = generateWidgetHTML(widget);
      expect(html).toContain('fr-callout');
      expect(html).toContain('Important info');
    });

    it('should generate text as title', () => {
      const widget = makeWidget({
        type: 'text',
        config: { content: 'Section Title', style: 'title' },
      });
      const html = generateWidgetHTML(widget);
      expect(html).toContain('<h2>Section Title</h2>');
    });

    it('should generate comment for unknown type', () => {
      const widget = makeWidget({
        type: 'unknown' as any,
        title: 'Mystery',
      });
      const html = generateWidgetHTML(widget);
      expect(html).toContain('<!-- Widget: Mystery -->');
    });

    it('should escape HTML in titles and values', () => {
      const widget = makeWidget({
        type: 'kpi',
        config: { valeur: '<script>alert("xss")</script>', label: 'Safe', format: 'nombre', icone: '' },
      });
      const html = generateWidgetHTML(widget);
      expect(html).not.toContain('<script>');
      expect(html).toContain('&lt;script&gt;');
    });
  });
});
