import { describe, it, expect } from 'vitest';
import {
  SKILLS,
  getRelevantSkills,
  buildSkillsContext,
} from '../../../apps/builder-ia/src/skills';
import type { Source } from '../../../apps/builder-ia/src/state';

// Component imports for introspection
import { DsfrDataSource } from '../../../src/components/dsfr-data-source.js';
import { DsfrDataQuery } from '../../../src/components/dsfr-data-query.js';
import { DsfrDataKpi } from '../../../src/components/dsfr-data-kpi.js';
import { DsfrDataList } from '../../../src/components/dsfr-data-list.js';
import { DsfrDataChart } from '../../../src/components/dsfr-data-chart.js';
import { DsfrDataNormalize } from '../../../src/components/dsfr-data-normalize.js';
import { DsfrDataFacets } from '../../../src/components/dsfr-data-facets.js';
import { DsfrDataDisplay } from '../../../src/components/dsfr-data-display.js';
import { DsfrDataSearch } from '../../../src/components/dsfr-data-search.js';
import { DsfrDataA11y } from '../../../src/components/dsfr-data-a11y.js';
import { DsfrDataKpiGroup } from '../../../src/components/dsfr-data-kpi-group.js';
import { DsfrDataWorldMap } from '../../../src/components/dsfr-data-world-map.js';
import { DsfrDataJoin } from '../../../src/components/dsfr-data-join.js';

// Type/constant imports for alignment checks
import type { FilterOperator, AggregateFunction } from '../../../src/components/dsfr-data-query.js';

/**
 * Extract HTML attribute names from a Lit component class via elementProperties.
 * - If attribute option is false → skip (internal property)
 * - If attribute option is a string → use it (explicit mapping)
 * - Otherwise → Lit lowercases the property name
 */
function getHtmlAttributes(ComponentClass: typeof DsfrDataSource): Set<string> {
  const attrs = new Set<string>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const props = (ComponentClass as any).elementProperties as Map<string, { attribute?: string | false }> | undefined;
  if (!props) return attrs;

  for (const [propName, options] of props) {
    if (options?.attribute === false) continue; // @state() or internal
    const htmlAttr = typeof options?.attribute === 'string'
      ? options.attribute
      : propName.toLowerCase();
    attrs.add(htmlAttr);
  }
  return attrs;
}

describe('builder-ia skills', () => {
  it('should have 24 skill definitions', () => {
    expect(Object.keys(SKILLS)).toHaveLength(24);
  });

  it('should have expected skill IDs', () => {
    expect(SKILLS).toHaveProperty('createChartAction');
    expect(SKILLS).toHaveProperty('reloadDataAction');
    expect(SKILLS).toHaveProperty('dsfrDataSource');
    expect(SKILLS).toHaveProperty('dsfrDataQuery');
    expect(SKILLS).toHaveProperty('dsfrDataNormalize');
    expect(SKILLS).toHaveProperty('dsfrDataFacets');
    expect(SKILLS).toHaveProperty('dsfrDataSearch');
    expect(SKILLS).toHaveProperty('dsfrDataKpi');
    expect(SKILLS).toHaveProperty('dsfrDataKpiGroup');
    expect(SKILLS).toHaveProperty('dsfrDataChart');
    expect(SKILLS).toHaveProperty('dsfrDataList');
    expect(SKILLS).toHaveProperty('dsfrDataDisplay');
    expect(SKILLS).toHaveProperty('dsfrChartNative');
    expect(SKILLS).toHaveProperty('compositionPatterns');
    expect(SKILLS).toHaveProperty('odsql');
    expect(SKILLS).toHaveProperty('odsApiVersions');
    expect(SKILLS).toHaveProperty('chartTypes');
    expect(SKILLS).toHaveProperty('dsfrColors');
    expect(SKILLS).toHaveProperty('apiProviders');
    expect(SKILLS).toHaveProperty('dsfrDataA11y');
    expect(SKILLS).toHaveProperty('dsfrDataWorldMap');
    expect(SKILLS).toHaveProperty('dsfrDataMap');
    expect(SKILLS).toHaveProperty('troubleshooting');
    expect(SKILLS).toHaveProperty('dsfrDataJoin');
  });

  it('each skill should have required properties', () => {
    for (const [key, skill] of Object.entries(SKILLS)) {
      expect(skill.id, `${key} should have id`).toBe(key);
      expect(skill.name, `${key} should have name`).toBeTruthy();
      expect(skill.trigger, `${key} should have triggers`).toBeInstanceOf(Array);
      expect(skill.trigger.length, `${key} should have at least one trigger`).toBeGreaterThan(0);
      expect(skill.content, `${key} should have content`).toBeTruthy();
    }
  });

  describe('getRelevantSkills', () => {
    it('should return empty array for unrelated message', () => {
      const result = getRelevantSkills('bonjour comment ca va', null);
      expect(result).toEqual([]);
    });

    it('should match dsfrDataChart skill for "graphique" keyword', () => {
      const result = getRelevantSkills('je veux un graphique', null);
      const ids = result.map(s => s.id);
      expect(ids).toContain('dsfrDataChart');
    });

    it('should match dsfrColors skill for "couleur" keyword', () => {
      const result = getRelevantSkills('change la couleur', null);
      const ids = result.map(s => s.id);
      expect(ids).toContain('dsfrColors');
    });

    it('should match dsfrDataQuery skill for "filtre" keyword', () => {
      const result = getRelevantSkills('ajoute un filtre', null);
      const ids = result.map(s => s.id);
      expect(ids).toContain('dsfrDataQuery');
    });

    it('should match multiple skills for a complex message', () => {
      const result = getRelevantSkills('fais un graphique avec un filtre sur les couleurs', null);
      const ids = result.map(s => s.id);
      expect(ids).toContain('dsfrDataChart');
      expect(ids).toContain('dsfrDataQuery');
      expect(ids).toContain('dsfrColors');
    });

    it('should auto-include odsql skills for API sources', () => {
      const apiSource: Source = { id: '1', name: 'test', type: 'api', url: 'https://example.com' };
      const result = getRelevantSkills('bonjour', apiSource);
      const ids = result.map(s => s.id);
      expect(ids).toContain('odsql');
      expect(ids).toContain('odsApiVersions');
    });

    it('should not duplicate odsql for API source when already triggered', () => {
      const apiSource: Source = { id: '1', name: 'test', type: 'api', url: 'https://example.com' };
      const result = getRelevantSkills('fais une requete api', apiSource);
      const odsqlCount = result.filter(s => s.id === 'odsql').length;
      expect(odsqlCount).toBe(1);
    });

    it('should not auto-include odsql for non-API sources', () => {
      const manualSource: Source = { id: '1', name: 'test', type: 'manual' };
      const result = getRelevantSkills('bonjour', manualSource);
      expect(result).toEqual([]);
    });

    it('should be case-insensitive', () => {
      const result = getRelevantSkills('GRAPHIQUE EN BARRES', null);
      const ids = result.map(s => s.id);
      expect(ids).toContain('dsfrDataChart');
    });

    it('should auto-include dsfrDataQuery for KPI with filtering context', () => {
      const result = getRelevantSkills('kpi prix moyen dans le departement 48', null);
      const ids = result.map(s => s.id);
      expect(ids).toContain('dsfrDataQuery');
      expect(ids).toContain('dsfrDataKpi');
    });

    it('should auto-include dsfrDataQuery for chart with region filter', () => {
      const result = getRelevantSkills('graphique barres pour la region IDF', null);
      const ids = result.map(s => s.id);
      expect(ids).toContain('dsfrDataQuery');
      expect(ids).toContain('dsfrDataChart');
    });

    it('should match dsfrDataQuery for "departement" keyword', () => {
      const result = getRelevantSkills('filtre par departement', null);
      const ids = result.map(s => s.id);
      expect(ids).toContain('dsfrDataQuery');
    });
  });

  describe('buildSkillsContext', () => {
    it('should return empty string for no skills', () => {
      expect(buildSkillsContext([])).toBe('');
    });

    it('should include skill content', () => {
      const skills = [SKILLS.dsfrColors];
      const result = buildSkillsContext(skills);
      expect(result).toContain('SKILLS INJECTES');
      expect(result).toContain('Bleu France');
    });

    it('should concatenate multiple skills', () => {
      const skills = [SKILLS.chartTypes, SKILLS.dsfrColors];
      const result = buildSkillsContext(skills);
      expect(result).toContain('Choix du type de graphique');
      expect(result).toContain('Bleu France');
    });
  });

  // =========================================================================
  // Skills ↔ Components alignment tests
  // =========================================================================

  describe('skills-component alignment', () => {

    // Attributes that are standard HTML and not component-specific
    const IGNORED_ATTRS = new Set(['id']);

    /**
     * Check that every HTML attribute of a component is mentioned in the skill content.
     */
    function assertAttributesCovered(
      componentClass: typeof DsfrDataSource,
      skillId: string,
      componentName: string,
    ) {
      const attrs = getHtmlAttributes(componentClass);
      const content = SKILLS[skillId].content;

      for (const attr of attrs) {
        if (IGNORED_ATTRS.has(attr)) continue;
        expect(
          content.includes(attr),
          `Skill "${skillId}" should document attribute "${attr}" from <${componentName}>`
        ).toBe(true);
      }
    }

    describe('attribute coverage', () => {
      it('dsfrDataSource skill covers all <dsfr-data-source> attributes', () => {
        assertAttributesCovered(DsfrDataSource, 'dsfrDataSource', 'dsfr-data-source');
      });

      it('dsfrDataQuery skill covers all <dsfr-data-query> attributes', () => {
        assertAttributesCovered(DsfrDataQuery as unknown as typeof DsfrDataSource, 'dsfrDataQuery', 'dsfr-data-query');
      });

      it('dsfrDataKpi skill covers all <dsfr-data-kpi> attributes', () => {
        assertAttributesCovered(DsfrDataKpi as unknown as typeof DsfrDataSource, 'dsfrDataKpi', 'dsfr-data-kpi');
      });

      it('dsfrDataList skill covers all <dsfr-data-list> attributes', () => {
        assertAttributesCovered(DsfrDataList as unknown as typeof DsfrDataSource, 'dsfrDataList', 'dsfr-data-list');
      });

      it('dsfrDataNormalize skill covers all <dsfr-data-normalize> attributes', () => {
        assertAttributesCovered(DsfrDataNormalize as unknown as typeof DsfrDataSource, 'dsfrDataNormalize', 'dsfr-data-normalize');
      });

      it('dsfrDataFacets skill covers all <dsfr-data-facets> attributes', () => {
        assertAttributesCovered(DsfrDataFacets as unknown as typeof DsfrDataSource, 'dsfrDataFacets', 'dsfr-data-facets');
      });

      it('dsfrDataSearch skill covers all <dsfr-data-search> attributes', () => {
        assertAttributesCovered(DsfrDataSearch as unknown as typeof DsfrDataSource, 'dsfrDataSearch', 'dsfr-data-search');
      });

      it('dsfrDataChart skill covers all <dsfr-data-chart> attributes', () => {
        assertAttributesCovered(DsfrDataChart as unknown as typeof DsfrDataSource, 'dsfrDataChart', 'dsfr-data-chart');
      });

      it('dsfrDataDisplay skill covers all <dsfr-data-display> attributes', () => {
        assertAttributesCovered(DsfrDataDisplay as unknown as typeof DsfrDataSource, 'dsfrDataDisplay', 'dsfr-data-display');
      });

      it('dsfrDataA11y skill covers all <dsfr-data-a11y> attributes', () => {
        assertAttributesCovered(DsfrDataA11y as unknown as typeof DsfrDataSource, 'dsfrDataA11y', 'dsfr-data-a11y');
      });

      it('dsfrDataKpiGroup skill covers all <dsfr-data-kpi-group> attributes', () => {
        assertAttributesCovered(DsfrDataKpiGroup as unknown as typeof DsfrDataSource, 'dsfrDataKpiGroup', 'dsfr-data-kpi-group');
      });

      it('dsfrDataWorldMap skill covers all <dsfr-data-world-map> attributes', () => {
        assertAttributesCovered(DsfrDataWorldMap as unknown as typeof DsfrDataSource, 'dsfrDataWorldMap', 'dsfr-data-world-map');
      });

      it('dsfrDataJoin skill covers all <dsfr-data-join> attributes', () => {
        assertAttributesCovered(DsfrDataJoin as unknown as typeof DsfrDataSource, 'dsfrDataJoin', 'dsfr-data-join');
      });
    });

    describe('chart types coverage', () => {
      // These must match the DSFRChartType union in dsfr-data-chart.ts
      const DSFR_CHART_TYPES = ['line', 'bar', 'pie', 'radar', 'gauge', 'scatter', 'bar-line', 'map', 'map-reg'];

      it('dsfrDataChart skill mentions all supported chart types', () => {
        const content = SKILLS.dsfrDataChart.content;
        for (const type of DSFR_CHART_TYPES) {
          expect(
            content.includes(type),
            `Skill "dsfrDataChart" should mention chart type "${type}"`
          ).toBe(true);
        }
      });

      it('chartTypes skill mentions all supported chart types', () => {
        const content = SKILLS.chartTypes.content;
        for (const type of DSFR_CHART_TYPES) {
          expect(
            content.includes(type),
            `Skill "chartTypes" should mention chart type "${type}"`
          ).toBe(true);
        }
      });
    });

    describe('filter operators coverage', () => {
      // Must match the FilterOperator type in dsfr-data-query.ts
      const FILTER_OPERATORS: FilterOperator[] = [
        'eq', 'neq', 'gt', 'gte', 'lt', 'lte',
        'contains', 'notcontains', 'in', 'notin',
        'isnull', 'isnotnull',
      ];

      it('dsfrDataQuery skill documents all filter operators', () => {
        const content = SKILLS.dsfrDataQuery.content;
        for (const op of FILTER_OPERATORS) {
          expect(
            content.includes(op),
            `Skill "dsfrDataQuery" should document filter operator "${op}"`
          ).toBe(true);
        }
      });
    });

    describe('aggregation functions coverage', () => {
      // Must match the AggregateFunction type in dsfr-data-query.ts
      const AGG_FUNCTIONS: AggregateFunction[] = ['count', 'sum', 'avg', 'min', 'max'];

      it('dsfrDataQuery skill documents all aggregation functions', () => {
        const content = SKILLS.dsfrDataQuery.content;
        for (const fn of AGG_FUNCTIONS) {
          expect(
            content.includes(fn),
            `Skill "dsfrDataQuery" should document aggregation function "${fn}"`
          ).toBe(true);
        }
      });
    });

    describe('exported components coverage', () => {
      // Map of exported component classes to their expected skill ID
      const COMPONENT_SKILL_MAP: Record<string, string> = {
        'DsfrDataSource': 'dsfrDataSource',
        'DsfrDataQuery': 'dsfrDataQuery',
        'DsfrDataNormalize': 'dsfrDataNormalize',
        'DsfrDataFacets': 'dsfrDataFacets',
        'DsfrDataSearch': 'dsfrDataSearch',
        'DsfrDataKpi': 'dsfrDataKpi',
        'DsfrDataKpiGroup': 'dsfrDataKpiGroup',
        'DsfrDataList': 'dsfrDataList',
        'DsfrDataDisplay': 'dsfrDataDisplay',
        'DsfrDataChart': 'dsfrDataChart',
        'DsfrDataWorldMap': 'dsfrDataWorldMap',
      };

      it('every data component has a corresponding skill', () => {
        for (const [componentName, skillId] of Object.entries(COMPONENT_SKILL_MAP)) {
          expect(
            SKILLS[skillId],
            `Component ${componentName} should have a corresponding skill "${skillId}"`
          ).toBeDefined();
        }
      });
    });

    describe('DSFR palettes coverage', () => {
      const DSFR_PALETTES = [
        'categorical', 'sequentialAscending', 'sequentialDescending',
        'divergentAscending', 'divergentDescending', 'neutral', 'default',
      ];

      it('dsfrColors skill documents all DSFR Chart palettes', () => {
        const content = SKILLS.dsfrColors.content;
        for (const palette of DSFR_PALETTES) {
          expect(
            content.includes(palette),
            `Skill "dsfrColors" should document palette "${palette}"`
          ).toBe(true);
        }
      });

      it('dsfrDataChart skill documents all DSFR Chart palettes', () => {
        const content = SKILLS.dsfrDataChart.content;
        for (const palette of DSFR_PALETTES) {
          expect(
            content.includes(palette),
            `Skill "dsfrDataChart" should document palette "${palette}"`
          ).toBe(true);
        }
      });
    });
  });
});
