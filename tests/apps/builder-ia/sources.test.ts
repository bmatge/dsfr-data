import { describe, it, expect, beforeEach, vi } from 'vitest';
import { analyzeFields, updateFieldsList, updateRawData } from '../../../apps/builder-ia/src/sources';
import { state } from '../../../apps/builder-ia/src/state';

describe('builder-ia sources', () => {
  beforeEach(() => {
    // Reset state
    state.source = null;
    state.localData = null;
    state.fields = [];
    state.chartConfig = null;
    state.chart = null;
    state.messages = [];
    state.isThinking = false;
  });

  describe('analyzeFields', () => {
    it('should do nothing when no localData', () => {
      analyzeFields();
      expect(state.fields).toEqual([]);
    });

    it('should do nothing for empty data', () => {
      state.localData = [];
      analyzeFields();
      expect(state.fields).toEqual([]);
    });

    it('should detect numeric fields', () => {
      state.localData = [{ population: 1000, nom: 'Paris' }];
      analyzeFields();
      const popField = state.fields.find(f => f.name === 'population');
      expect(popField).toBeDefined();
      expect(popField!.type).toBe('numerique');
    });

    it('should detect text fields', () => {
      state.localData = [{ population: 1000, nom: 'Paris' }];
      analyzeFields();
      const nameField = state.fields.find(f => f.name === 'nom');
      expect(nameField).toBeDefined();
      expect(nameField!.type).toBe('texte');
    });

    it('should detect date fields from ISO strings', () => {
      state.localData = [{ date: '2024-01-15', nom: 'test' }];
      analyzeFields();
      const dateField = state.fields.find(f => f.name === 'date');
      expect(dateField).toBeDefined();
      expect(dateField!.type).toBe('date');
    });

    it('should include sample value from first record', () => {
      state.localData = [{ score: 42 }];
      analyzeFields();
      expect(state.fields[0].sample).toBe(42);
    });

    it('should scan other records when first has null', () => {
      state.localData = [
        { value: null, label: 'a' },
        { value: 100, label: 'b' },
      ];
      analyzeFields();
      const valueField = state.fields.find(f => f.name === 'value');
      expect(valueField).toBeDefined();
      expect(valueField!.type).toBe('numerique');
      expect(valueField!.sample).toBe(100);
    });

    it('should default to texte for null-only fields', () => {
      state.localData = [
        { nothing: null },
      ];
      analyzeFields();
      expect(state.fields[0].type).toBe('texte');
    });

    it('should extract all keys from first record', () => {
      state.localData = [{ a: 1, b: 'x', c: true }];
      analyzeFields();
      expect(state.fields).toHaveLength(3);
      const names = state.fields.map(f => f.name);
      expect(names).toContain('a');
      expect(names).toContain('b');
      expect(names).toContain('c');
    });
  });

  describe('updateFieldsList', () => {
    beforeEach(() => {
      document.body.innerHTML = '<div id="field-list"></div>';
    });

    it('should show placeholder when no fields', () => {
      state.fields = [];
      updateFieldsList();
      const container = document.getElementById('field-list')!;
      expect(container.innerHTML).toContain('Selectionnez une source');
    });

    it('should render field tags', () => {
      state.fields = [
        { name: 'nom', type: 'texte', sample: 'Paris' },
        { name: 'score', type: 'numerique', sample: 42 },
      ];
      updateFieldsList();
      const container = document.getElementById('field-list')!;
      expect(container.innerHTML).toContain('nom');
      expect(container.innerHTML).toContain('score');
      expect(container.innerHTML).toContain('texte');
      expect(container.innerHTML).toContain('numerique');
    });

    it('should add numeric class for numeric fields', () => {
      state.fields = [
        { name: 'score', type: 'numerique', sample: 42 },
      ];
      updateFieldsList();
      const container = document.getElementById('field-list')!;
      expect(container.innerHTML).toContain('numeric');
    });

    it('should not add numeric class for text fields', () => {
      state.fields = [
        { name: 'nom', type: 'texte', sample: 'test' },
      ];
      updateFieldsList();
      const container = document.getElementById('field-list')!;
      const tags = container.querySelectorAll('.field-tag');
      expect(tags[0].classList.contains('numeric')).toBe(false);
    });
  });

  describe('updateRawData', () => {
    beforeEach(() => {
      document.body.innerHTML = '<pre id="raw-data"></pre>';
    });

    it('should display JSON data in the pre element', () => {
      state.localData = [{ a: 1 }, { a: 2 }];
      updateRawData();
      const pre = document.getElementById('raw-data')!;
      const content = JSON.parse(pre.textContent!);
      expect(content).toEqual([{ a: 1 }, { a: 2 }]);
    });

    it('should limit to 50 records', () => {
      state.localData = Array.from({ length: 100 }, (_, i) => ({ idx: i }));
      updateRawData();
      const pre = document.getElementById('raw-data')!;
      const content = JSON.parse(pre.textContent!);
      expect(content).toHaveLength(50);
    });

    it('should handle null localData', () => {
      state.localData = null;
      updateRawData();
      const pre = document.getElementById('raw-data')!;
      expect(pre.textContent).toBe('');
    });
  });
});
