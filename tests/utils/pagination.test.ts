import { describe, it, expect } from 'vitest';
import { buildPaginationParams, extractPaginationMeta } from '../../src/utils/pagination.js';
import { ODS_CONFIG, TABULAR_CONFIG, GRIST_CONFIG, GENERIC_CONFIG } from '@dsfr-data/shared';

describe('buildPaginationParams', () => {
  it('ODS offset: page=1 → offset=0, limit=100', () => {
    const result = buildPaginationParams(ODS_CONFIG, 1, 100);
    expect(result).toEqual({ offset: '0', limit: '100' });
  });

  it('ODS offset: page=3, pageSize=100 → offset=200, limit=100', () => {
    const result = buildPaginationParams(ODS_CONFIG, 3, 100);
    expect(result).toEqual({ offset: '200', limit: '100' });
  });

  it('Tabular page: page=1 → page=1, page_size=100', () => {
    const result = buildPaginationParams(TABULAR_CONFIG, 1, 100);
    expect(result).toEqual({ page: '1', page_size: '100' });
  });

  it('Tabular page: page=3, pageSize=50 → page=3, page_size=50', () => {
    const result = buildPaginationParams(TABULAR_CONFIG, 3, 50);
    expect(result).toEqual({ page: '3', page_size: '50' });
  });

  it('Grist offset: page=1 → offset=0, limit=100', () => {
    const result = buildPaginationParams(GRIST_CONFIG, 1, 100);
    expect(result).toEqual({ offset: '0', limit: '100' });
  });

  it('Grist offset: page=3, pageSize=20 → offset=40, limit=20', () => {
    const result = buildPaginationParams(GRIST_CONFIG, 3, 20);
    expect(result).toEqual({ offset: '40', limit: '20' });
  });

  it('Generic none: returns empty object', () => {
    const result = buildPaginationParams(GENERIC_CONFIG, 1, 100);
    expect(result).toEqual({});
  });
});

describe('extractPaginationMeta', () => {
  it('ODS: extracts total_count from response', () => {
    const json = { results: [], total_count: 42 };
    const meta = extractPaginationMeta(json, ODS_CONFIG, 1, 20);
    expect(meta).toEqual({
      currentPage: 1,
      pageSize: 20,
      totalCount: 42,
      hasMore: true,
    });
  });

  it('ODS: hasMore=false when on last page', () => {
    const json = { results: [], total_count: 15 };
    const meta = extractPaginationMeta(json, ODS_CONFIG, 1, 20);
    expect(meta!.hasMore).toBe(false);
  });

  it('Tabular: extracts meta.total from response', () => {
    const json = { data: [], meta: { total: 1000 } };
    const meta = extractPaginationMeta(json, TABULAR_CONFIG, 5, 100);
    expect(meta).toEqual({
      currentPage: 5,
      pageSize: 100,
      totalCount: 1000,
      hasMore: true,
    });
  });

  it('Grist: returns meta with totalCount 0 (no totalCountPath)', () => {
    const json = { records: [] };
    const meta = extractPaginationMeta(json, GRIST_CONFIG, 1, 100);
    expect(meta).toEqual({
      currentPage: 1,
      pageSize: 100,
      totalCount: 0,
      hasMore: false,
    });
  });

  it('Generic: returns null (no pagination)', () => {
    const meta = extractPaginationMeta([], GENERIC_CONFIG, 1, 100);
    expect(meta).toBeNull();
  });
});
