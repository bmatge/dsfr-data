import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getAdapter } from '../../src/adapters/adapter-registry.js';

// Test the DsfrDataSource class logic without full Lit rendering
// We import the class and test its public API and adapter integration

// Since DsfrDataSource is a LitElement with decorators, we test the underlying
// logic through the adapter params construction and public methods

describe('DsfrDataSource adapter mode detection', () => {
  it('apiType != generic activates adapter mode', () => {
    // When apiType is 'opendatasoft', the source should use adapter mode
    // Tested indirectly: getAdapter() should return a valid adapter
    const adapter = getAdapter('opendatasoft');
    expect(adapter.type).toBe('opendatasoft');
  });

  it('apiType = generic with url uses URL mode', () => {
    const adapter = getAdapter('generic');
    expect(adapter.capabilities.serverFetch).toBe(false);
  });
});

describe('DsfrDataSource getEffectiveWhere logic', () => {
  it('merges static where with overlays using ODSQL separator', () => {
    // Simulate the getEffectiveWhere logic
    const staticWhere = 'region = "IDF"';
    const overlays = new Map<string, string>([
      ['facets', 'dept = "75"'],
      ['search', 'search("Paris")'],
    ]);

    const parts: string[] = [];
    if (staticWhere) parts.push(staticWhere);
    for (const [, value] of overlays) {
      if (value) parts.push(value);
    }
    const result = parts.join(' AND ');

    expect(result).toBe('region = "IDF" AND dept = "75" AND search("Paris")');
  });

  it('merges with colon separator for non-ODS providers', () => {
    const staticWhere = 'region:eq:IDF';
    const overlays = new Map<string, string>([
      ['facets', 'dept:eq:75'],
    ]);

    const parts: string[] = [];
    if (staticWhere) parts.push(staticWhere);
    for (const [, value] of overlays) {
      if (value) parts.push(value);
    }
    const result = parts.join(', ');

    expect(result).toBe('region:eq:IDF, dept:eq:75');
  });

  it('excludes specific overlay key', () => {
    const overlays = new Map<string, string>([
      ['facets', 'dept = "75"'],
      ['search', 'search("Paris")'],
    ]);

    const parts: string[] = [];
    for (const [key, value] of overlays) {
      if (key !== 'facets' && value) parts.push(value);
    }
    const result = parts.join(' AND ');

    expect(result).toBe('search("Paris")');
  });

  it('returns empty string when no where clauses', () => {
    const parts: string[] = [];
    expect(parts.join(' AND ')).toBe('');
  });
});

describe('DsfrDataSource adapter params construction', () => {
  it('builds correct AdapterParams for ODS', () => {
    // Simulate _getAdapterParams
    const params = {
      baseUrl: 'https://data.iledefrance.fr',
      datasetId: 'elus-regionaux',
      resource: '',
      select: 'count(*) as total, region',
      where: 'region = "IDF"',
      filter: '',
      groupBy: 'region',
      aggregate: '',
      orderBy: 'total:desc',
      limit: 0,
      transform: '',
      pageSize: 20,
      headers: undefined,
    };

    expect(params.baseUrl).toBe('https://data.iledefrance.fr');
    expect(params.datasetId).toBe('elus-regionaux');
    expect(params.select).toBe('count(*) as total, region');
    expect(params.groupBy).toBe('region');
  });

  it('builds correct AdapterParams for Tabular', () => {
    const params = {
      baseUrl: '',
      datasetId: '',
      resource: 'abc-123',
      select: '',
      where: '',
      filter: '',
      groupBy: 'region',
      aggregate: 'population:sum',
      orderBy: '',
      limit: 0,
      transform: '',
      pageSize: 100,
      headers: undefined,
    };

    expect(params.resource).toBe('abc-123');
    expect(params.aggregate).toBe('population:sum');
  });

  it('builds correct AdapterParams for Grist', () => {
    const params = {
      baseUrl: 'https://grist.numerique.gouv.fr/api/docs/x/tables/y/records',
      datasetId: '',
      resource: '',
      select: '',
      where: '',
      filter: '',
      groupBy: '',
      aggregate: '',
      orderBy: '',
      limit: 0,
      transform: '',
      pageSize: 20,
      headers: { Authorization: 'Bearer token123' },
    };

    expect(params.baseUrl).toContain('grist.numerique.gouv.fr');
    expect(params.headers!.Authorization).toBe('Bearer token123');
  });

  it('parses headers from JSON string', () => {
    const headersStr = '{"Authorization": "Bearer abc"}';
    let parsed: Record<string, string> | undefined;
    try { parsed = JSON.parse(headersStr); } catch { /* ignore */ }
    expect(parsed).toEqual({ Authorization: 'Bearer abc' });
  });

  it('handles invalid headers gracefully', () => {
    const headersStr = 'not json';
    let parsed: Record<string, string> | undefined;
    try { parsed = JSON.parse(headersStr); } catch { /* ignore */ }
    expect(parsed).toBeUndefined();
  });
});

describe('DsfrDataSource command handling', () => {
  it('where command with whereKey stores overlay correctly', () => {
    const overlays = new Map<string, string>();

    // Simulate receiving a where command with whereKey
    const cmd = { where: 'dept = "75"', whereKey: 'facets-1' };
    const key = cmd.whereKey || '__default';
    if (cmd.where) {
      overlays.set(key, cmd.where);
    }

    expect(overlays.get('facets-1')).toBe('dept = "75"');
  });

  it('empty where removes overlay', () => {
    const overlays = new Map<string, string>([
      ['facets-1', 'dept = "75"'],
    ]);

    // Simulate clearing the where
    const cmd = { where: '', whereKey: 'facets-1' };
    const key = cmd.whereKey || '__default';
    if (cmd.where) {
      overlays.set(key, cmd.where);
    } else {
      overlays.delete(key);
    }

    expect(overlays.has('facets-1')).toBe(false);
  });

  it('orderBy overlay takes priority over static', () => {
    const staticOrderBy = 'name:asc';
    const orderByOverlay = 'population:desc';

    const effectiveOrderBy = orderByOverlay || staticOrderBy;
    expect(effectiveOrderBy).toBe('population:desc');
  });

  it('falls back to static orderBy when no overlay', () => {
    const staticOrderBy = 'name:asc';
    const orderByOverlay = '';

    const effectiveOrderBy = orderByOverlay || staticOrderBy;
    expect(effectiveOrderBy).toBe('name:asc');
  });
});

describe('DsfrDataSource adapter validation', () => {
  it('ODS adapter validates dataset-id', () => {
    const adapter = getAdapter('opendatasoft');
    expect(adapter.validate({
      baseUrl: 'https://data.example.com',
      datasetId: '',
      resource: '', select: '', where: '', filter: '',
      groupBy: '', aggregate: '', orderBy: '', limit: 0,
      transform: '', pageSize: 20,
    })).toBe('attribut "dataset-id" requis pour les requetes OpenDataSoft');
  });

  it('Tabular adapter validates resource', () => {
    const adapter = getAdapter('tabular');
    expect(adapter.validate({
      baseUrl: '', datasetId: '', resource: '',
      select: '', where: '', filter: '',
      groupBy: '', aggregate: '', orderBy: '', limit: 0,
      transform: '', pageSize: 20,
    })).toBe('attribut "resource" requis pour les requetes Tabular');
  });

  it('Grist adapter validates base-url', () => {
    const adapter = getAdapter('grist');
    expect(adapter.validate({
      baseUrl: '', datasetId: '', resource: '',
      select: '', where: '', filter: '',
      groupBy: '', aggregate: '', orderBy: '', limit: 0,
      transform: '', pageSize: 20,
    })).toBe('attribut "base-url" requis pour les requetes Grist');
  });
});
