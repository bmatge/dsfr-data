import { describe, it, expect } from 'vitest';
import { buildPaginationParams, extractPaginationMeta } from '@/utils/pagination.js';
import {
  ODS_CONFIG,
  TABULAR_CONFIG,
  GRIST_CONFIG,
  GENERIC_CONFIG,
  INSEE_CONFIG,
} from '@dsfr-data/shared';

describe('buildPaginationParams', () => {
  it('ODS offset: page=1 → offset=0, limit=100', () => {
    const result = buildPaginationParams(ODS_CONFIG, 1, 100);
    expect(result).toEqual({ offset: '0', limit: '100' });
  });

  it('ODS offset: page=3, pageSize=100 → offset=200, limit=100', () => {
    const result = buildPaginationParams(ODS_CONFIG, 3, 100);
    expect(result).toEqual({ offset: '200', limit: '100' });
  });

  it('ODS offset: page=1, pageSize=1 → offset=0, limit=1', () => {
    const result = buildPaginationParams(ODS_CONFIG, 1, 1);
    expect(result).toEqual({ offset: '0', limit: '1' });
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

  it('INSEE page: page=1 → page=1, maxResult=100', () => {
    const result = buildPaginationParams(INSEE_CONFIG, 1, 100);
    expect(result).toEqual({ page: '1', maxResult: '100' });
  });

  it('INSEE page: page=5, pageSize=1000 → page=5, maxResult=1000', () => {
    const result = buildPaginationParams(INSEE_CONFIG, 5, 1000);
    expect(result).toEqual({ page: '5', maxResult: '1000' });
  });

  it('Generic none: returns empty object', () => {
    const result = buildPaginationParams(GENERIC_CONFIG, 1, 100);
    expect(result).toEqual({});
  });

  it('all offset configs use consistent offset = (page-1)*pageSize', () => {
    for (const config of [ODS_CONFIG, GRIST_CONFIG]) {
      const p1 = buildPaginationParams(config, 1, 50);
      const p2 = buildPaginationParams(config, 2, 50);
      const p3 = buildPaginationParams(config, 3, 50);
      const offsetKey = config.pagination.params.offset || 'offset';
      expect(Number(p1[offsetKey])).toBe(0);
      expect(Number(p2[offsetKey])).toBe(50);
      expect(Number(p3[offsetKey])).toBe(100);
    }
  });

  it('all page configs pass page number directly', () => {
    for (const config of [TABULAR_CONFIG, INSEE_CONFIG]) {
      const pageKey = config.pagination.params.page || 'page';
      for (const p of [1, 5, 10]) {
        const result = buildPaginationParams(config, p, 100);
        expect(Number(result[pageKey])).toBe(p);
      }
    }
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

  it('ODS: hasMore=false when exactly at boundary', () => {
    const json = { results: [], total_count: 20 };
    const meta = extractPaginationMeta(json, ODS_CONFIG, 1, 20);
    expect(meta!.hasMore).toBe(false);
  });

  it('ODS: hasMore=true when one more item than page boundary', () => {
    const json = { results: [], total_count: 21 };
    const meta = extractPaginationMeta(json, ODS_CONFIG, 1, 20);
    expect(meta!.hasMore).toBe(true);
  });

  it('ODS: multi-page hasMore on page 3 of 5', () => {
    const json = { results: [], total_count: 100 };
    const meta = extractPaginationMeta(json, ODS_CONFIG, 3, 20);
    expect(meta!.hasMore).toBe(true);
    expect(meta!.currentPage).toBe(3);
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

  it('Tabular: hasMore=false on last page', () => {
    const json = { data: [], meta: { total: 250 } };
    const meta = extractPaginationMeta(json, TABULAR_CONFIG, 3, 100);
    expect(meta!.hasMore).toBe(false);
  });

  it('INSEE: extracts paging.count from response', () => {
    const json = { observations: [], paging: { count: 5000 } };
    const meta = extractPaginationMeta(json, INSEE_CONFIG, 1, 1000);
    expect(meta).toEqual({
      currentPage: 1,
      pageSize: 1000,
      totalCount: 5000,
      hasMore: true,
    });
  });

  it('INSEE: hasMore=false on last page', () => {
    const json = { observations: [], paging: { count: 800 } };
    const meta = extractPaginationMeta(json, INSEE_CONFIG, 1, 1000);
    expect(meta!.hasMore).toBe(false);
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

  it('returns totalCount 0 when totalCountPath points to non-number', () => {
    const json = { results: [], total_count: 'not-a-number' };
    const meta = extractPaginationMeta(json, ODS_CONFIG, 1, 20);
    expect(meta!.totalCount).toBe(0);
    expect(meta!.hasMore).toBe(false);
  });

  it('returns totalCount 0 when totalCountPath is missing from response', () => {
    const json = { results: [] };
    const meta = extractPaginationMeta(json, ODS_CONFIG, 1, 20);
    expect(meta!.totalCount).toBe(0);
    expect(meta!.hasMore).toBe(false);
  });
});
