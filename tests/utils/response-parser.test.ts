import { describe, it, expect } from 'vitest';
import { extractData, extractTotalCount } from '../../src/utils/response-parser.js';
import { ODS_CONFIG, TABULAR_CONFIG, GRIST_CONFIG, GENERIC_CONFIG } from '@dsfr-data/shared';

describe('extractData', () => {
  it('ODS: extracts results array', () => {
    const json = { results: [{ name: 'Paris' }, { name: 'Lyon' }], total_count: 2 };
    const data = extractData(json, ODS_CONFIG);
    expect(data).toEqual([{ name: 'Paris' }, { name: 'Lyon' }]);
  });

  it('Tabular: extracts data array', () => {
    const json = { data: [{ nom: 'Paris' }], meta: { total: 1 } };
    const data = extractData(json, TABULAR_CONFIG);
    expect(data).toEqual([{ nom: 'Paris' }]);
  });

  it('Grist: extracts and flattens records[].fields', () => {
    const json = {
      records: [
        { id: 1, fields: { Pays: 'France', Population: 67 } },
        { id: 2, fields: { Pays: 'Belgique', Population: 11 } },
      ],
    };
    const data = extractData(json, GRIST_CONFIG);
    expect(data).toEqual([
      { Pays: 'France', Population: 67 },
      { Pays: 'Belgique', Population: 11 },
    ]);
  });

  it('Grist: handles records without fields key', () => {
    const json = {
      records: [
        { id: 1, name: 'Raw record' },
      ],
    };
    const data = extractData(json, GRIST_CONFIG);
    expect(data).toEqual([{ id: 1, name: 'Raw record' }]);
  });

  it('Generic: returns raw array as-is', () => {
    const json = [{ a: 1 }, { a: 2 }];
    const data = extractData(json, GENERIC_CONFIG);
    expect(data).toEqual([{ a: 1 }, { a: 2 }]);
  });

  it('Generic: wraps non-array in array', () => {
    const json = { key: 'value' };
    const data = extractData(json, GENERIC_CONFIG);
    expect(data).toEqual([{ key: 'value' }]);
  });

  it('handles null data path gracefully', () => {
    const json = { results: null };
    const data = extractData(json, ODS_CONFIG);
    expect(data).toEqual([]);
  });
});

describe('extractTotalCount', () => {
  it('ODS: extracts total_count', () => {
    const json = { results: [], total_count: 42 };
    expect(extractTotalCount(json, ODS_CONFIG)).toBe(42);
  });

  it('Tabular: extracts meta.total', () => {
    const json = { data: [], meta: { total: 1000 } };
    expect(extractTotalCount(json, TABULAR_CONFIG)).toBe(1000);
  });

  it('Grist: returns null (no totalCountPath)', () => {
    const json = { records: [] };
    expect(extractTotalCount(json, GRIST_CONFIG)).toBeNull();
  });

  it('Generic: returns null (no totalCountPath)', () => {
    expect(extractTotalCount({}, GENERIC_CONFIG)).toBeNull();
  });

  it('returns null when path resolves to non-number', () => {
    const json = { total_count: 'not a number' };
    expect(extractTotalCount(json, ODS_CONFIG)).toBeNull();
  });
});
