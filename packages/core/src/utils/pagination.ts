/**
 * Pagination utilities — builds query parameters and extracts pagination
 * metadata from API responses using ProviderConfig.
 */

import type { ProviderConfig } from '@dsfr-data/shared';
import { getByPath } from './json-path.js';

export interface PaginationMeta {
  currentPage: number;
  pageSize: number;
  totalCount: number;
  hasMore: boolean;
}

/**
 * Build pagination query parameters for an API request.
 * Reads ProviderConfig.pagination to determine offset vs page vs none.
 */
export function buildPaginationParams(
  config: ProviderConfig,
  page: number,
  pageSize: number
): Record<string, string> {
  const { type, params } = config.pagination;

  if (type === 'offset') {
    const offset = (page - 1) * pageSize;
    return {
      [params.offset || 'offset']: String(offset),
      [params.limit || 'limit']: String(pageSize),
    };
  }

  if (type === 'page') {
    return {
      [params.page || 'page']: String(page),
      [params.pageSize || 'page_size']: String(pageSize),
    };
  }

  // type === 'none' or 'cursor'
  return {};
}

/**
 * Extract pagination metadata from an API response JSON.
 */
export function extractPaginationMeta(
  json: unknown,
  config: ProviderConfig,
  currentPage: number,
  pageSize: number
): PaginationMeta | null {
  if (config.pagination.type === 'none') return null;

  let totalCount = 0;
  if (config.response.totalCountPath) {
    const raw = getByPath(json, config.response.totalCountPath);
    totalCount = typeof raw === 'number' ? raw : 0;
  }

  const hasMore = totalCount > currentPage * pageSize;

  return {
    currentPage,
    pageSize,
    totalCount,
    hasMore,
  };
}
