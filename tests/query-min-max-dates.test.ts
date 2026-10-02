import { describe, it, expect } from 'vitest';
import { DsfrDataQuery } from '@/components/dsfr-data-query.js';
import { toNumber, toLeadingNumber } from '@dsfr-data/shared';

/**
 * #1200 — BUG-023 et BUG-032 du banc : `min`/`max` de la query lisaient une
 * date ou un mois comme un nombre (« 2026-09-25 » → 2026, « 2024-09 » → 2024),
 * parce que la lecture « stricte » acceptait tout préfixe numérique.
 */

interface QueryInternals {
  _computeAggregate(
    items: Record<string, unknown>[],
    agg: { field: string; function: string; alias: string }
  ): number | string | null;
}
const internals = (q: DsfrDataQuery) => q as unknown as QueryInternals;
const agg = (field: string, fn: string) => ({ field, function: fn, alias: `${field}__${fn}` });

describe('#1200 — min/max de la query comme le KPI', () => {
  const q = new DsfrDataQuery();

  it('dates ISO : la date, pas l’année', () => {
    const items = [{ d: '2025-01-03' }, { d: '2026-09-25' }, { d: '2024-12-31' }];
    expect(internals(q)._computeAggregate(items, agg('d', 'max'))).toBe('2026-09-25');
    expect(internals(q)._computeAggregate(items, agg('d', 'min'))).toBe('2024-12-31');
  });

  it('mois AAAA-MM : le mois, en ordre chronologique', () => {
    const items = [{ m: '2024-09' }, { m: '2023-12' }, { m: '2024-11' }, { m: '' }];
    expect(internals(q)._computeAggregate(items, agg('m', 'max'))).toBe('2024-11');
    expect(internals(q)._computeAggregate(items, agg('m', 'min'))).toBe('2023-12');
  });

  it('colonne numérique : inchangé, décimales françaises comprises', () => {
    const items = [{ v: '1 234,5' }, { v: 12 }, { v: 'N/A' }];
    expect(internals(q)._computeAggregate(items, agg('v', 'max'))).toBe(1234.5);
    expect(internals(q)._computeAggregate(items, agg('v', 'min'))).toBe(12);
  });
});

describe('#1200 — toNumber strict et toLeadingNumber', () => {
  it('strict refuse un préfixe, garde un symbole d’unité final', () => {
    for (const v of ['2026-09-25', '2024-09', '75A', '1922-1930', '12 ans']) {
      expect(toNumber(v, true), v).toBeNull();
    }
    expect(toNumber('45,2 %', true)).toBe(45.2);
    expect(toNumber('12 €', true)).toBe(12);
    expect(toNumber('1.234,56', true)).toBe(1234.56);
  });

  it('non strict inchangé (préfixe, 0 par défaut)', () => {
    expect(toNumber('75A')).toBe(75);
    expect(toNumber('abc')).toBe(0);
  });

  it('toLeadingNumber lit exprès le nombre de tête', () => {
    expect(toLeadingNumber('1922-1930')).toBe(1922);
    expect(toLeadingNumber('1 234,5 habitants')).toBe(1234.5);
    expect(toLeadingNumber('vers 1880')).toBeNull();
    expect(toLeadingNumber('')).toBeNull();
    expect(toLeadingNumber(42)).toBe(42);
  });
});
