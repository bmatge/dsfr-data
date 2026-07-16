import { describe, it, expect } from 'vitest';
import {
  CHART_TYPES,
  ACTION_JSON_SCHEMA,
  CONFIG_SCHEMA,
  FINAL_ACTION_TOOLS,
  SKILL_LOOKUP_TOOLS,
  FINAL_TOOL_NAMES,
  toolNameToAction,
  validateAction,
} from '../../../apps/builder-ia/src/ia/action-schema';

describe('builder-ia action-schema', () => {
  describe('alignement avec ChartConfig', () => {
    it("l'enum type du schema couvre exactement les types de ChartConfig", () => {
      // Source de verite : les types declares dans state.ts ChartConfig.
      const chartConfigTypes = [
        'bar',
        'line',
        'pie',
        'doughnut',
        'radar',
        'horizontalBar',
        'scatter',
        'gauge',
        'kpi',
        'map',
        'bar-line',
        'map-reg',
        'map-aca',
        'map-monde',
        'datalist',
        'podium',
      ];
      expect([...CHART_TYPES].sort()).toEqual([...chartConfigTypes].sort());
      expect(CONFIG_SCHEMA.properties.type.enum).toEqual([...CHART_TYPES]);
    });

    it('le schema exige action + message au minimum', () => {
      expect(ACTION_JSON_SCHEMA.required).toContain('action');
      expect(ACTION_JSON_SCHEMA.required).toContain('message');
      expect(ACTION_JSON_SCHEMA.additionalProperties).toBe(false);
    });
  });

  describe('validateAction', () => {
    it('accepte un createChart canonique (exemple de skill)', () => {
      const result = validateAction({
        action: 'createChart',
        message: 'Top 5 regions',
        config: {
          type: 'bar',
          labelField: 'region',
          valueField: 'population',
          aggregation: 'sum',
          limit: 5,
          sortOrder: 'desc',
        },
      });
      expect(result).not.toBeNull();
      expect(result?.action).toBe('createChart');
      expect(result?.config?.type).toBe('bar');
      expect(result?.message).toBe('Top 5 regions');
    });

    it('accepte un reloadData canonique', () => {
      const result = validateAction({
        action: 'reloadData',
        message: 'Prix moyen par region',
        query: { where: 'prix > 50', group_by: 'region' },
      });
      expect(result?.action).toBe('reloadData');
      expect(result?.query).toEqual({ where: 'prix > 50', group_by: 'region' });
    });

    it('accepte resetChart sans payload', () => {
      const result = validateAction({ action: 'resetChart', message: 'On repart de zero' });
      expect(result?.action).toBe('resetChart');
    });

    it('rejette une action hallucinee', () => {
      expect(validateAction({ action: 'table', config: { type: 'bar' } })).toBeNull();
      expect(validateAction({ action: 'filter' })).toBeNull();
    });

    it('rejette createChart avec un type invalide', () => {
      expect(
        validateAction({ action: 'createChart', config: { type: 'pyramide', valueField: 'x' } })
      ).toBeNull();
    });

    it('rejette createChart sans valueField', () => {
      expect(validateAction({ action: 'createChart', config: { type: 'bar' } })).toBeNull();
    });

    it('rejette les entrees non-objet', () => {
      expect(validateAction(null)).toBeNull();
      expect(validateAction('createChart')).toBeNull();
      expect(validateAction(42)).toBeNull();
    });
  });

  describe('tools', () => {
    it('expose les 3 tools finaux et 2 tools de lookup', () => {
      const finalNames = FINAL_ACTION_TOOLS.map((t) => t.function.name);
      expect(finalNames).toEqual(['create_chart', 'reload_data', 'reset_chart']);
      const lookupNames = SKILL_LOOKUP_TOOLS.map((t) => t.function.name);
      expect(lookupNames).toEqual(['get_relevant_skills', 'get_skill']);
    });

    it('FINAL_TOOL_NAMES contient les tools terminaux', () => {
      expect(FINAL_TOOL_NAMES.has('create_chart')).toBe(true);
      expect(FINAL_TOOL_NAMES.has('get_skill')).toBe(false);
    });

    it('toolNameToAction mappe correctement', () => {
      expect(toolNameToAction('create_chart')).toBe('createChart');
      expect(toolNameToAction('reload_data')).toBe('reloadData');
      expect(toolNameToAction('reset_chart')).toBe('resetChart');
      expect(toolNameToAction('get_skill')).toBeNull();
    });
  });
});
