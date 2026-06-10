import { describe, it, expect, vi } from 'vitest';

/**
 * Tests traversants #301 (EPIC G) — parsing numérique unifié.
 *
 * Bugs d'origine : trois parseurs coexistaient — Number() (chart/podium/
 * query/aggregations), parseFloat (display/formatters), toNumber (normalize
 * seul). Une valeur "1 234,5" (CSV data.gouv via Tabular) devenait 0 dans
 * chart/podium, 1 dans display, 1234.5 après normalize. toNumber lui-même
 * était bogué sur les séparateurs multiples (replace(',', '.') ne remplace
 * que la première virgule). min/max → Infinity quand aucune valeur n'est
 * numérique. `numeric` non-strict transformait "N/A" en 0 quand
 * numeric-auto est strict.
 */

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

import { toNumber } from '@dsfr-data/shared/lib';
import { computeAggregation } from '@/utils/aggregations.js';
import { DsfrDataQuery } from '@/components/dsfr-data-query.js';
import { clearDataCache, dispatchDataLoaded } from '@/utils/data-bridge.js';

describe('#301 — AC : toNumber gère les séparateurs multiples', () => {
  it("toNumber('1,234,567') === 1234567 (milliers anglais)", () => {
    expect(toNumber('1,234,567')).toBe(1234567);
  });

  it("toNumber('1.234.567') === 1234567 (milliers français à points)", () => {
    expect(toNumber('1.234.567')).toBe(1234567);
  });

  it('virgule unique : décimale française (convention French-first)', () => {
    expect(toNumber('1,234')).toBe(1.234);
    expect(toNumber('1 234,5')).toBe(1234.5);
  });

  it('formats mixtes inchangés', () => {
    expect(toNumber('1.234,56')).toBe(1234.56);
    expect(toNumber('1,234.56')).toBe(1234.56);
  });

  it('strict : non-parseable → null, jamais 0', () => {
    expect(toNumber('N/A', true)).toBeNull();
    expect(toNumber('', true)).toBeNull();
    expect(toNumber('abc', true)).toBeNull();
  });
});

describe('#301 — aggregations : NaN exclus, min/max vides → null', () => {
  const MIXED = [
    { score: '1 234,5' },
    { score: 'N/A' },
    { score: 765.5 },
    { score: null },
  ] as Record<string, unknown>[];

  it('sum parse les décimales françaises et exclut les non-numériques', () => {
    expect(computeAggregation(MIXED, 'sum:score')).toBe(2000);
  });

  it('avg divise par le nombre de valeurs NUMÉRIQUES (les N/A ne comptent plus comme 0)', () => {
    expect(computeAggregation(MIXED, 'avg:score')).toBe(1000);
  });

  it('min/max sans aucune valeur numérique → null (fini Infinity)', () => {
    const junk = [{ score: 'N/A' }, { score: 'x' }] as Record<string, unknown>[];
    expect(computeAggregation(junk, 'min:score')).toBeNull();
    expect(computeAggregation(junk, 'max:score')).toBeNull();
  });
});

describe('#301 — AC : pipeline avec décimales françaises agrégé sans normalize intercalé', () => {
  it('query group-by + sum sur des valeurs "1 234,5"', () => {
    clearDataCache('g2-src');
    const query = new DsfrDataQuery();
    query.id = 'g2-query';
    query.source = 'g2-src';
    query.groupBy = 'region';
    query.aggregate = 'population:sum:total';
    (query as any)._initialize();

    dispatchDataLoaded('g2-src', [
      { region: 'IDF', population: '1 234,5' },
      { region: 'IDF', population: '765,5' },
      { region: 'BRE', population: 'N/A' },
    ]);

    expect(query.getData()).toEqual([
      { region: 'IDF', total: 2000 },
      { region: 'BRE', total: 0 },
    ]);

    (query as any)._cleanup();
    clearDataCache('g2-query');
  });
});
