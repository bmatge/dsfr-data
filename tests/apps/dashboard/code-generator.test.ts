import { describe, it, expect } from 'vitest';
import { generateWidgetHTML } from '../../../apps/dashboard/src/code-generator';
import type { Widget } from '../../../apps/dashboard/src/state';

function makeWidget(overrides: Partial<Widget> & { type: Widget['type'] }): Widget {
  return {
    id: 'w-test',
    title: 'Test Widget',
    position: { row: 0, col: 0 },
    config: { value: '', label: '', format: 'nombre', icon: '' },
    ...overrides,
    // Le spread compose type et config independamment : TypeScript ne peut pas
    // prouver la coherence de l'union. C'est voulu — ces tests eprouvent aussi
    // des combinaisons que l'app ne produirait pas.
  } as unknown as Widget;
}

describe('dashboard/code-generator', () => {
  describe('generateWidgetHTML', () => {
    it('should generate KPI HTML with dsfr-data-kpi tag', () => {
      const widget = makeWidget({
        type: 'kpi',
        config: { value: '1234', label: 'Total', format: 'nombre', icon: '' },
      });
      const html = generateWidgetHTML(widget);
      expect(html).toContain('<dsfr-data-kpi');
      expect(html).toContain('value="1234"');
      expect(html).toContain('label="Total"');
      expect(html).toContain('format="nombre"');
    });

    it('should include icon attribute when set', () => {
      const widget = makeWidget({
        type: 'kpi',
        config: { value: '42', label: 'Count', format: 'nombre', icon: 'ri-user-line' },
      });
      const html = generateWidgetHTML(widget);
      expect(html).toContain('icon="ri-user-line"');
    });

    it('should not include icon attribute when empty', () => {
      const widget = makeWidget({
        type: 'kpi',
        config: { value: '42', label: 'Count', format: 'nombre', icon: '' },
      });
      const html = generateWidgetHTML(widget);
      expect(html).not.toContain('icon=');
    });

    it('should generate chart HTML with dsfr-data-chart tag', () => {
      const widget = makeWidget({
        type: 'chart',
        config: {
          type: 'line',
          labelField: 'date',
          valueField: 'count',
          palette: 'sequentialAscending',
        },
      });
      const html = generateWidgetHTML(widget);
      expect(html).toContain('<dsfr-data-chart');
      expect(html).toContain('type="line"');
      expect(html).toContain('label-field="date"');
      expect(html).toContain('value-field="count"');
      expect(html).toContain('selected-palette="sequentialAscending"');
    });

    it('should generate chart HTML from favorite with code', () => {
      const widget = makeWidget({
        type: 'chart',
        title: 'Fav Chart',
        config: {
          fromFavorite: true,
          favoriteId: 'fav',
          code: '<dsfr-data-chart type="bar"></dsfr-data-chart>',
        },
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

    // Le repli « <!-- Widget: … --> » a disparu avec l'union discriminee (#521) :
    // `generateWidgetHTML` couvre desormais les quatre types de facon exhaustive,
    // et un type hors union est ecarte plus tot, par `normalizeWidget`.

    it('should escape HTML in titles and values', () => {
      const widget = makeWidget({
        type: 'kpi',
        config: {
          value: '<script>alert("xss")</script>',
          label: 'Safe',
          format: 'nombre',
          icon: '',
        },
      });
      const html = generateWidgetHTML(widget);
      expect(html).not.toContain('<script>');
      expect(html).toContain('&lt;script&gt;');
    });
  });
});
