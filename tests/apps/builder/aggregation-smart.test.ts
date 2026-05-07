import { describe, it, expect, beforeEach } from 'vitest';
import {
  suggestAggregationDefault,
  isLabelFieldUniqueInSample,
  applyAggregationDefault,
  updateAggregationBadge,
  resetAggregationUserModified,
} from '../../../apps/builder/src/ui/aggregation-smart';
import { state } from '../../../apps/builder/src/state';

describe('builder aggregation-smart', () => {
  beforeEach(() => {
    state.fields = [];
    state.labelField = '';
    state.valueField = '';
    state.aggregation = 'sum';
    state.aggregationUserModified = false;
    state.localData = null;

    document.body.innerHTML = `
      <label for="aggregation">
        Agg
        <span class="agg-badge" id="aggregation-badge" hidden></span>
      </label>
      <select id="aggregation">
        <option value="sum">Somme</option>
        <option value="avg">Moyenne</option>
        <option value="count">Comptage</option>
      </select>
    `;
  });

  describe('suggestAggregationDefault', () => {
    it("returns 'count' when no value field is set", () => {
      state.valueField = '';
      expect(suggestAggregationDefault()).toBe('count');
    });

    it("returns 'sum' for 'montant' field", () => {
      state.valueField = 'montant_aide';
      state.fields = [{ name: 'montant_aide', type: 'number', sample: 100 }];
      expect(suggestAggregationDefault()).toBe('sum');
    });

    it("returns 'sum' for 'population' field", () => {
      state.valueField = 'population';
      state.fields = [{ name: 'population', type: 'number', sample: 100 }];
      expect(suggestAggregationDefault()).toBe('sum');
    });

    it("returns 'avg' for 'taux' field", () => {
      state.valueField = 'taux_chomage';
      state.fields = [{ name: 'taux_chomage', type: 'number', sample: 7.5 }];
      expect(suggestAggregationDefault()).toBe('avg');
    });

    it("returns 'avg' for 'temperature' field", () => {
      state.valueField = 'temperature_moyenne';
      state.fields = [{ name: 'temperature_moyenne', type: 'number', sample: 15.2 }];
      expect(suggestAggregationDefault()).toBe('avg');
    });

    it("falls back to 'sum' for unknown field names", () => {
      state.valueField = 'foo';
      state.fields = [{ name: 'foo', type: 'number', sample: 42 }];
      expect(suggestAggregationDefault()).toBe('sum');
    });

    it('uses displayName when present (accent-insensitive)', () => {
      state.valueField = 'col_b';
      state.fields = [
        { name: 'col_b', displayName: 'Dépense annuelle', type: 'number', sample: 1000 },
      ];
      expect(suggestAggregationDefault()).toBe('sum');
    });
  });

  describe('isLabelFieldUniqueInSample', () => {
    it('returns false when no data is loaded', () => {
      state.localData = null;
      state.labelField = 'region';
      expect(isLabelFieldUniqueInSample()).toBe(false);
    });

    it('returns false when no labelField is set', () => {
      state.localData = [{ region: 'A' }, { region: 'B' }];
      state.labelField = '';
      expect(isLabelFieldUniqueInSample()).toBe(false);
    });

    it('returns false when sample has fewer than 2 rows', () => {
      state.localData = [{ region: 'A' }];
      state.labelField = 'region';
      expect(isLabelFieldUniqueInSample()).toBe(false);
    });

    it('returns true when each labelField value appears once', () => {
      state.localData = [{ region: 'A' }, { region: 'B' }, { region: 'C' }];
      state.labelField = 'region';
      expect(isLabelFieldUniqueInSample()).toBe(true);
    });

    it('returns false when at least one duplicate exists', () => {
      state.localData = [{ region: 'A' }, { region: 'B' }, { region: 'A' }];
      state.labelField = 'region';
      expect(isLabelFieldUniqueInSample()).toBe(false);
    });
  });

  describe('applyAggregationDefault', () => {
    it('does nothing when user has already modified aggregation', () => {
      state.aggregationUserModified = true;
      state.aggregation = 'min';
      state.valueField = 'montant';
      state.fields = [{ name: 'montant', type: 'number', sample: 100 }];

      applyAggregationDefault();

      expect(state.aggregation).toBe('min');
    });

    it('updates state and DOM when user has not modified yet', () => {
      state.aggregationUserModified = false;
      state.valueField = 'population';
      state.fields = [{ name: 'population', type: 'number', sample: 100 }];

      applyAggregationDefault();

      expect(state.aggregation).toBe('sum');
      const select = document.getElementById('aggregation') as HTMLSelectElement;
      expect(select.value).toBe('sum');
    });
  });

  describe('updateAggregationBadge', () => {
    it('shows the badge when sample is unique', () => {
      state.localData = [{ region: 'A' }, { region: 'B' }];
      state.labelField = 'region';

      updateAggregationBadge();

      const badge = document.getElementById('aggregation-badge') as HTMLElement;
      expect(badge.hidden).toBe(false);
      expect(badge.textContent).toContain('deja groupees');
    });

    it('hides the badge when duplicates exist', () => {
      state.localData = [{ region: 'A' }, { region: 'A' }];
      state.labelField = 'region';

      updateAggregationBadge();

      const badge = document.getElementById('aggregation-badge') as HTMLElement;
      expect(badge.hidden).toBe(true);
    });
  });

  describe('resetAggregationUserModified', () => {
    it('clears the flag', () => {
      state.aggregationUserModified = true;
      resetAggregationUserModified();
      expect(state.aggregationUserModified).toBe(false);
    });
  });
});
