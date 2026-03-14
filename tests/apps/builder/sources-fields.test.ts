import { describe, it, expect, beforeEach } from 'vitest';
import { populateFieldSelects } from '../../../apps/builder/src/sources-fields';
import { state } from '../../../apps/builder/src/state';
import type { Field } from '../../../apps/builder/src/state';

describe('builder sources-fields', () => {
  beforeEach(() => {
    // Reset state fields
    state.fields = [];
    state.labelField = '';
    state.valueField = '';
    state.valueField2 = '';
    state.codeField = '';

    // Setup DOM with required select elements
    document.body.innerHTML = `
      <select id="label-field"></select>
      <select id="value-field"></select>
      <select id="value-field-2"></select>
      <select id="code-field"></select>
    `;
  });

  it('should do nothing when select elements are missing', () => {
    document.body.innerHTML = '';
    state.fields = [{ name: 'test', type: 'string', sample: 'x' }];
    expect(() => populateFieldSelects()).not.toThrow();
  });

  it('should add default options to all selects', () => {
    state.fields = [];
    populateFieldSelects();

    const labelSelect = document.getElementById('label-field') as HTMLSelectElement;
    const valueSelect = document.getElementById('value-field') as HTMLSelectElement;
    const valueSelect2 = document.getElementById('value-field-2') as HTMLSelectElement;
    const codeSelect = document.getElementById('code-field') as HTMLSelectElement;

    expect(labelSelect.options).toHaveLength(1);
    expect(valueSelect.options).toHaveLength(1);
    expect(valueSelect2.options).toHaveLength(1);
    expect(codeSelect.options).toHaveLength(1);
  });

  it('should populate label and value selects with all fields', () => {
    state.fields = [
      { name: 'region', type: 'string', sample: 'Bretagne' },
      { name: 'population', type: 'number', sample: 3300000 },
    ];
    populateFieldSelects();

    const labelSelect = document.getElementById('label-field') as HTMLSelectElement;
    const valueSelect = document.getElementById('value-field') as HTMLSelectElement;

    // +1 for the default option
    expect(labelSelect.options).toHaveLength(3);
    expect(valueSelect.options).toHaveLength(3);
  });

  it('should only add numeric fields to value-field-2', () => {
    state.fields = [
      { name: 'region', type: 'string', sample: 'Bretagne' },
      { name: 'population', type: 'number', sample: 3300000 },
      { name: 'surface', type: 'number', sample: 27208 },
    ];
    populateFieldSelects();

    const valueSelect2 = document.getElementById('value-field-2') as HTMLSelectElement;
    // Default option + 2 numeric fields
    expect(valueSelect2.options).toHaveLength(3);
  });

  it('should add string and number fields to code-field', () => {
    state.fields = [
      { name: 'region', type: 'string', sample: 'Bretagne' },
      { name: 'code_dept', type: 'string', sample: '35' },
      { name: 'population', type: 'number', sample: 3300000 },
      { name: 'active', type: 'boolean', sample: true },
    ];
    populateFieldSelects();

    const codeSelect = document.getElementById('code-field') as HTMLSelectElement;
    // Default option + 3 (region, code_dept, population) - boolean is excluded
    expect(codeSelect.options).toHaveLength(4);
  });

  it('should display field type in option text', () => {
    state.fields = [
      { name: 'score', type: 'number', sample: 42 },
    ];
    populateFieldSelects();

    const labelSelect = document.getElementById('label-field') as HTMLSelectElement;
    expect(labelSelect.options[1].textContent).toContain('score');
    expect(labelSelect.options[1].textContent).toContain('number');
  });

  it('should use displayName when available', () => {
    state.fields = [
      { name: 'pop', displayName: 'Population', type: 'number', sample: 1000, fullPath: 'fields.pop' },
    ];
    populateFieldSelects();

    const labelSelect = document.getElementById('label-field') as HTMLSelectElement;
    expect(labelSelect.options[1].textContent).toContain('Population');
  });

  describe('auto-selection', () => {
    it('should auto-select a string field with "region" in name as label', () => {
      state.fields = [
        { name: 'region', type: 'string', sample: 'Bretagne' },
        { name: 'population', type: 'number', sample: 3300000 },
      ];
      populateFieldSelects();

      const labelSelect = document.getElementById('label-field') as HTMLSelectElement;
      expect(labelSelect.value).toBe('region');
    });

    it('should auto-select a number field with "valeur" in name as value', () => {
      state.fields = [
        { name: 'nom', type: 'string', sample: 'test' },
        { name: 'valeur', type: 'number', sample: 100 },
      ];
      populateFieldSelects();

      const valueSelect = document.getElementById('value-field') as HTMLSelectElement;
      expect(valueSelect.value).toBe('valeur');
    });

    it('should auto-select code field containing "dept"', () => {
      state.fields = [
        { name: 'nom', type: 'string', sample: 'Finistere' },
        { name: 'code_dept', type: 'string', sample: '29' },
        { name: 'pop', type: 'number', sample: 1000 },
      ];
      populateFieldSelects();

      const codeSelect = document.getElementById('code-field') as HTMLSelectElement;
      expect(codeSelect.value).toBe('code_dept');
    });

    it('should not auto-select when no matching candidates', () => {
      state.fields = [
        { name: 'x', type: 'string', sample: 'a' },
        { name: 'y', type: 'number', sample: 1 },
      ];
      populateFieldSelects();

      const labelSelect = document.getElementById('label-field') as HTMLSelectElement;
      const valueSelect = document.getElementById('value-field') as HTMLSelectElement;
      // No auto-selection: default option stays selected
      expect(labelSelect.value).toBe('');
      expect(valueSelect.value).toBe('');
    });
  });
});
