import { describe, it, expect } from 'vitest';
import { SKILLS, getRelevantSkills, buildSkillsContext } from '../../../apps/builder-ia/src/skills';
import type { Source } from '../../../apps/builder-ia/src/state';

// Type/constant imports for alignment checks
import type { FilterOperator, AggregateFunction } from '@/components/dsfr-data-query.js';

describe('builder-ia skills', () => {
  it('should have 29 skill definitions', () => {
    expect(Object.keys(SKILLS)).toHaveLength(29);
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
    expect(SKILLS).toHaveProperty('dsfrDataMap');
    expect(SKILLS).toHaveProperty('troubleshooting');
    expect(SKILLS).toHaveProperty('dsfrDataJoin');
    expect(SKILLS).toHaveProperty('dsfrDataPodium');
    expect(SKILLS).toHaveProperty('dsfrDataBeacon');
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
      const ids = result.map((s) => s.id);
      expect(ids).toContain('dsfrDataChart');
    });

    it('should match dsfrColors skill for "couleur" keyword', () => {
      const result = getRelevantSkills('change la couleur', null);
      const ids = result.map((s) => s.id);
      expect(ids).toContain('dsfrColors');
    });

    it('should match dsfrDataQuery skill for "filtre" keyword', () => {
      const result = getRelevantSkills('ajoute un filtre', null);
      const ids = result.map((s) => s.id);
      expect(ids).toContain('dsfrDataQuery');
    });

    it('should match multiple skills for a complex message', () => {
      const result = getRelevantSkills('fais un graphique avec un filtre sur les couleurs', null);
      const ids = result.map((s) => s.id);
      expect(ids).toContain('dsfrDataChart');
      expect(ids).toContain('dsfrDataQuery');
      expect(ids).toContain('dsfrColors');
    });

    it('should auto-include odsql skills for API sources', () => {
      const apiSource: Source = { id: '1', name: 'test', type: 'api', url: 'https://example.com' };
      const result = getRelevantSkills('bonjour', apiSource);
      const ids = result.map((s) => s.id);
      expect(ids).toContain('odsql');
      expect(ids).toContain('odsApiVersions');
    });

    it('should not duplicate odsql for API source when already triggered', () => {
      const apiSource: Source = { id: '1', name: 'test', type: 'api', url: 'https://example.com' };
      const result = getRelevantSkills('fais une requête api', apiSource);
      const odsqlCount = result.filter((s) => s.id === 'odsql').length;
      expect(odsqlCount).toBe(1);
    });

    it('should not auto-include odsql for non-API sources', () => {
      const manualSource: Source = { id: '1', name: 'test', type: 'manual' };
      const result = getRelevantSkills('bonjour', manualSource);
      expect(result).toEqual([]);
    });

    it('should be case-insensitive', () => {
      const result = getRelevantSkills('GRAPHIQUE EN BARRES', null);
      const ids = result.map((s) => s.id);
      expect(ids).toContain('dsfrDataChart');
    });

    it('should auto-include dsfrDataQuery for KPI with filtering context', () => {
      const result = getRelevantSkills('kpi prix moyen dans le departement 48', null);
      const ids = result.map((s) => s.id);
      expect(ids).toContain('dsfrDataQuery');
      expect(ids).toContain('dsfrDataKpi');
    });

    it('should auto-include dsfrDataQuery for chart with region filter', () => {
      const result = getRelevantSkills('graphique barres pour la region IDF', null);
      const ids = result.map((s) => s.id);
      expect(ids).toContain('dsfrDataQuery');
      expect(ids).toContain('dsfrDataChart');
    });

    it('should match dsfrDataQuery for "departement" keyword', () => {
      const result = getRelevantSkills('filtre par departement', null);
      const ids = result.map((s) => s.id);
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
    // La couverture des attributs, evenements, slots et variables CSS n'est plus
    // verifiee ici : elle est GENEREE depuis le code (#512) et gardee par
    // tests/apps/builder-ia/skills-reference.test.ts, qui controle toute la
    // chaine composants -> manifeste -> module genere -> SKILLS.
    // Ne restent ici que les alignements portant sur le texte REDIGE a la main.

    describe('chart types coverage', () => {
      // These must match the DSFRChartType union in dsfr-data-chart.ts
      const DSFR_CHART_TYPES = [
        'line',
        'bar',
        'pie',
        'radar',
        'gauge',
        'scatter',
        'bar-line',
        'map',
        'map-reg',
        'map-aca',
        'map-monde',
      ];

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
        'eq',
        'neq',
        'gt',
        'gte',
        'lt',
        'lte',
        'contains',
        'notcontains',
        'in',
        'notin',
        'isnull',
        'isnotnull',
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
        DsfrDataSource: 'dsfrDataSource',
        DsfrDataQuery: 'dsfrDataQuery',
        DsfrDataNormalize: 'dsfrDataNormalize',
        DsfrDataFacets: 'dsfrDataFacets',
        DsfrDataSearch: 'dsfrDataSearch',
        DsfrDataKpi: 'dsfrDataKpi',
        DsfrDataKpiGroup: 'dsfrDataKpiGroup',
        DsfrDataList: 'dsfrDataList',
        DsfrDataDisplay: 'dsfrDataDisplay',
        DsfrDataChart: 'dsfrDataChart',
        DsfrDataMap: 'dsfrDataMap',
        // Compagnons carto : documentes dans le skill unique dsfrDataMap
        DsfrDataMapLayer: 'dsfrDataMap',
        DsfrDataMapPopup: 'dsfrDataMap',
        DsfrDataMapInset: 'dsfrDataMap',
        DsfrDataMapTimeline: 'dsfrDataMap',
        DsfrDataA11y: 'dsfrDataA11y',
        DsfrDataJoin: 'dsfrDataJoin',
        DsfrDataUnpivot: 'dsfrDataUnpivot',
        DsfrDataPodium: 'dsfrDataPodium',
        DsfrDataContext: 'dsfrDataContext',
        DsfrDataContextFilter: 'dsfrDataContextFilter',
        DsfrDataContextTags: 'dsfrDataContextTags',
        DsfrDataBeacon: 'dsfrDataBeacon',
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
        'categorical',
        'sequentialAscending',
        'sequentialDescending',
        'divergentAscending',
        'divergentDescending',
        'neutral',
        'default',
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
