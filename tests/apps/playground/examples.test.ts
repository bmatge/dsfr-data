import { describe, it, expect } from 'vitest';
import { examples } from '../../../apps/playground/src/examples/examples-data';

describe('playground examples', () => {
  const directKeys = [
    'direct-bar', 'direct-bar-databox', 'direct-line-databox',
    'direct-kpi', 'direct-datalist', 'direct-worldmap'
  ];

  const serverPaginateKeys = [
    'server-paginate-datalist', 'server-paginate-display', 'paginate-kpi-global'
  ];

  const queryKeys = [
    'query-bar', 'query-pie', 'query-map'
  ];

  const normalizeKeys = [
    'normalize-bar', 'normalize-pie', 'normalize-datalist'
  ];

  const displayKeys = [
    'direct-display', 'query-display', 'normalize-display'
  ];

  const facetsKeys = [
    'facets-datalist', 'facets-bar', 'facets-map'
  ];

  const searchClientKeys = [
    'search-kpi-chart'
  ];

  const searchServerKeys = [
    'search-datalist', 'search-display'
  ];

  const searchKeys = [...searchClientKeys, ...searchServerKeys];

  const serverSideKeys = [
    'server-side-ods', 'server-side-tabular-tri'
  ];

  const serverFacetsKeys = [
    'server-facets-display'
  ];

  const joinKeys = [
    'join-basic', 'join-query'
  ];

  const allKeys = [...directKeys, ...serverPaginateKeys, ...queryKeys, ...normalizeKeys, ...displayKeys, ...facetsKeys, ...searchKeys, ...serverSideKeys, ...serverFacetsKeys, ...joinKeys];

  it('should have all expected example keys', () => {
    for (const key of allKeys) {
      expect(examples).toHaveProperty(key);
    }
  });

  it('should have 29 examples', () => {
    expect(Object.keys(examples)).toHaveLength(29);
  });

  it('should have non-empty code for all examples', () => {
    for (const [key, code] of Object.entries(examples)) {
      expect(code.trim().length, `Example "${key}" should not be empty`).toBeGreaterThan(0);
    }
  });

  it('should have HTML content in examples', () => {
    for (const [key, code] of Object.entries(examples)) {
      expect(code, `Example "${key}" should contain HTML`).toContain('<');
    }
  });

  it('direct examples should use dsfr-data-source', () => {
    for (const key of directKeys) {
      const hasSource = examples[key].includes('dsfr-data-source');
      expect(hasSource, `${key} should use dsfr-data-source`).toBe(true);
      if (!['direct-kpi', 'direct-datalist', 'direct-display', 'direct-worldmap'].includes(key)) {
        expect(examples[key], `${key} should use dsfr-data-chart`).toContain('dsfr-data-chart');
      }
    }
  });

  it('display examples should use dsfr-data-display', () => {
    for (const key of displayKeys) {
      expect(examples[key], `${key} should use dsfr-data-source`).toContain('dsfr-data-source');
      expect(examples[key], `${key} should use dsfr-data-display`).toContain('dsfr-data-display');
      expect(examples[key], `${key} should use template`).toContain('<template>');
    }
  });

  it('query examples should use dsfr-data-source and dsfr-data-query', () => {
    for (const key of queryKeys) {
      expect(examples[key], `${key} should use dsfr-data-source`).toContain('dsfr-data-source');
      expect(examples[key], `${key} should use dsfr-data-query`).toContain('dsfr-data-query');
    }
  });

  it('kpi examples should use dsfr-data-kpi', () => {
    expect(examples['direct-kpi']).toContain('dsfr-data-kpi');
  });

  it('datalist examples should use dsfr-data-list', () => {
    expect(examples['direct-datalist']).toContain('dsfr-data-list');
  });

  it('normalize examples should use dsfr-data-source and dsfr-data-normalize', () => {
    for (const key of normalizeKeys) {
      expect(examples[key], `${key} should use dsfr-data-source`).toContain('dsfr-data-source');
      expect(examples[key], `${key} should use dsfr-data-normalize`).toContain('dsfr-data-normalize');
    }
  });

  it('facets examples should use dsfr-data-source, dsfr-data-facets and dsfr-data-normalize', () => {
    for (const key of facetsKeys) {
      expect(examples[key], `${key} should use dsfr-data-source`).toContain('dsfr-data-source');
      expect(examples[key], `${key} should use dsfr-data-normalize`).toContain('dsfr-data-normalize');
      expect(examples[key], `${key} should use dsfr-data-facets`).toContain('dsfr-data-facets');
    }
  });

  it('client-side search examples should use dsfr-data-source and dsfr-data-search', () => {
    for (const key of searchClientKeys) {
      expect(examples[key], `${key} should use dsfr-data-source`).toContain('dsfr-data-source');
      expect(examples[key], `${key} should use dsfr-data-search`).toContain('dsfr-data-search');
    }
  });

  it('server-side search examples should use dsfr-data-source server-side and dsfr-data-search server-search', () => {
    for (const key of searchServerKeys) {
      expect(examples[key], `${key} should use dsfr-data-source`).toContain('dsfr-data-source');
      expect(examples[key], `${key} should use server-side`).toContain('server-side');
      expect(examples[key], `${key} should use dsfr-data-search`).toContain('dsfr-data-search');
      expect(examples[key], `${key} should use server-search`).toContain('server-search');
    }
  });

  it('server-side examples should use dsfr-data-source with server-side', () => {
    for (const key of serverSideKeys) {
      expect(examples[key], `${key} should use dsfr-data-source`).toContain('dsfr-data-source');
      expect(examples[key], `${key} should use server-side`).toContain('server-side');
    }
  });

  it('server-facets examples should use dsfr-data-source server-side and dsfr-data-facets server-facets', () => {
    for (const key of serverFacetsKeys) {
      expect(examples[key], `${key} should use dsfr-data-source`).toContain('dsfr-data-source');
      expect(examples[key], `${key} should use server-side`).toContain('server-side');
      expect(examples[key], `${key} should use dsfr-data-facets`).toContain('dsfr-data-facets');
      expect(examples[key], `${key} should use server-facets`).toContain('server-facets');
    }
  });
});
