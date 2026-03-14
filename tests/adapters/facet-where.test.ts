import { describe, it, expect } from 'vitest';
import { getAdapter } from '../../src/adapters/api-adapter.js';

describe('buildFacetWhere — ODS (ODSQL syntax)', () => {
  const adapter = getAdapter('opendatasoft');

  it('single field, single value', () => {
    const selections = { region: new Set(['IDF']) };
    expect(adapter.buildFacetWhere!(selections)).toBe('region = "IDF"');
  });

  it('single field, multiple values uses IN', () => {
    const selections = { region: new Set(['IDF', 'OCC']) };
    expect(adapter.buildFacetWhere!(selections)).toBe('region IN ("IDF", "OCC")');
  });

  it('multiple fields joined with AND', () => {
    const selections = {
      region: new Set(['IDF']),
      dept: new Set(['75']),
    };
    expect(adapter.buildFacetWhere!(selections)).toBe('region = "IDF" AND dept = "75"');
  });

  it('excludeField omits the given field', () => {
    const selections = {
      region: new Set(['IDF']),
      dept: new Set(['75']),
    };
    expect(adapter.buildFacetWhere!(selections, 'region')).toBe('dept = "75"');
  });

  it('empty selections returns empty string', () => {
    expect(adapter.buildFacetWhere!({})).toBe('');
  });

  it('empty set for a field is skipped', () => {
    const selections = {
      region: new Set<string>(),
      dept: new Set(['75']),
    };
    expect(adapter.buildFacetWhere!(selections)).toBe('dept = "75"');
  });

  it('escapes double quotes in values', () => {
    const selections = { name: new Set(['Hello "World"']) };
    expect(adapter.buildFacetWhere!(selections)).toBe('name = "Hello \\"World\\""');
  });
});

describe('buildFacetWhere — Tabular (colon syntax)', () => {
  const adapter = getAdapter('tabular');

  it('single field, single value', () => {
    const selections = { region: new Set(['IDF']) };
    expect(adapter.buildFacetWhere!(selections)).toBe('region:eq:IDF');
  });

  it('single field, multiple values uses in with pipe', () => {
    const selections = { region: new Set(['IDF', 'OCC']) };
    expect(adapter.buildFacetWhere!(selections)).toBe('region:in:IDF|OCC');
  });

  it('multiple fields joined with comma-space', () => {
    const selections = {
      region: new Set(['IDF']),
      dept: new Set(['75']),
    };
    expect(adapter.buildFacetWhere!(selections)).toBe('region:eq:IDF, dept:eq:75');
  });

  it('excludeField omits the given field', () => {
    const selections = {
      region: new Set(['IDF']),
      dept: new Set(['75']),
    };
    expect(adapter.buildFacetWhere!(selections, 'region')).toBe('dept:eq:75');
  });

  it('empty selections returns empty string', () => {
    expect(adapter.buildFacetWhere!({})).toBe('');
  });
});

describe('buildFacetWhere — Grist (colon syntax)', () => {
  const adapter = getAdapter('grist');

  it('single field, single value', () => {
    const selections = { pays: new Set(['France']) };
    expect(adapter.buildFacetWhere!(selections)).toBe('pays:eq:France');
  });

  it('multiple values uses in', () => {
    const selections = { pays: new Set(['France', 'Belgique']) };
    expect(adapter.buildFacetWhere!(selections)).toBe('pays:in:France|Belgique');
  });
});

describe('buildFacetWhere — Generic (colon syntax fallback)', () => {
  const adapter = getAdapter('generic');

  it('uses colon syntax', () => {
    const selections = { field: new Set(['value']) };
    expect(adapter.buildFacetWhere!(selections)).toBe('field:eq:value');
  });
});
