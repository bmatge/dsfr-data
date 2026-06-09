import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Tests traversants #279 (EPIC B) — sémantique de pur transformateur pour
 * refresh / reload() de dsfr-data-query.
 *
 * Bugs d'origine :
 * - `reload()` relisait le cache au lieu de demander un refetch — contrat
 *   OPPOSÉ à dsfr-data-source.reload() qui refetche ;
 * - `refresh` retraitait périodiquement le même cache (no-op coûteux), ou
 *   tombait sur le gel #276.
 *
 * Contrat fixé :
 * - `reload()` délègue à la source amont (chaîne query→query→source) ; le
 *   refetch redescend naturellement le pipeline. Repli cache si l'amont
 *   n'expose pas reload() (normalize/unpivot/join avant EPIC C) ;
 * - `refresh` est retiré de query (il appartient à la source) avec un
 *   console.warn de migration.
 */

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

import { DsfrDataQuery } from '@/components/dsfr-data-query.js';
import { clearDataCache, clearDataMeta, dispatchDataLoaded } from '@/utils/data-bridge.js';

describe('#279 — reload() délègue le refetch à la source amont', () => {
  let query: DsfrDataQuery;
  let upstream: HTMLElement | null = null;

  beforeEach(() => {
    query = new DsfrDataQuery();
    query.id = 'b5-query';
    query.source = 'b5-src';
    clearDataCache('b5-src');
    clearDataMeta('b5-src');
    clearDataCache('b5-query');
  });

  afterEach(() => {
    (query as any)._cleanup();
    upstream?.remove();
    upstream = null;
  });

  it('AC : reload() provoque un refetch amont observable', () => {
    upstream = document.createElement('div');
    upstream.id = 'b5-src';
    const reloadSpy = vi.fn();
    (upstream as unknown as Record<string, unknown>).reload = reloadSpy;
    document.body.appendChild(upstream);

    query.reload();

    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });

  it('la chaîne query → query → source propage le reload jusqu’à la source', () => {
    upstream = document.createElement('div');
    upstream.id = 'b5-root-src';
    const reloadSpy = vi.fn();
    (upstream as unknown as Record<string, unknown>).reload = reloadSpy;
    document.body.appendChild(upstream);

    const innerQuery = new DsfrDataQuery();
    innerQuery.id = 'b5-inner';
    innerQuery.source = 'b5-root-src';
    document.body.appendChild(innerQuery);

    query.source = 'b5-inner';
    query.reload();

    expect(reloadSpy).toHaveBeenCalledTimes(1);

    innerQuery.remove();
    clearDataCache('b5-inner');
  });

  it('repli : amont sans reload() (normalize/unpivot/join) → retraite le cache', () => {
    upstream = document.createElement('div');
    upstream.id = 'b5-src';
    document.body.appendChild(upstream);

    query.orderBy = 'value:desc';
    dispatchDataLoaded('b5-src', [
      { name: 'A', value: 10 },
      { name: 'B', value: 30 },
    ]);

    query.reload();

    const data = query.getData() as Record<string, unknown>[];
    expect(data[0].name).toBe('B');
  });

  it('repli : aucun élément amont dans le DOM → cache lu (comportement historique)', () => {
    query.orderBy = 'value:asc';
    dispatchDataLoaded('b5-src', [
      { name: 'A', value: 30 },
      { name: 'B', value: 10 },
    ]);

    query.reload();

    const data = query.getData() as Record<string, unknown>[];
    expect(data[0].name).toBe('B');
  });

  it('reload() sans source ne jette pas', () => {
    query.source = '';
    expect(() => query.reload()).not.toThrow();
  });
});

describe('#279 — refresh retiré de dsfr-data-query', () => {
  let query: DsfrDataQuery;

  beforeEach(() => {
    query = new DsfrDataQuery();
    query.id = 'b5-refresh';
    query.source = 'b5-src';
  });

  afterEach(() => {
    (query as any)._cleanup();
  });

  it('refresh n’est plus une propriété du composant', () => {
    expect('refresh' in query).toBe(false);
    const props = (DsfrDataQuery as any).elementProperties as Map<string, unknown>;
    expect([...props.keys()]).not.toContain('refresh');
  });

  it('plus aucune mécanique d’intervalle dans query', () => {
    expect((query as any)._setupRefresh).toBeUndefined();
    expect((query as any)._refreshInterval).toBeUndefined();
  });

  it('l’attribut HTML refresh encore présent émet un console.warn de migration', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    query.setAttribute('refresh', '60');

    (query as any)._warnRemovedAttributes();

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(String(warnSpy.mock.calls[0][0])).toMatch(/refresh/);
    expect(String(warnSpy.mock.calls[0][0])).toMatch(/dsfr-data-source/);
    warnSpy.mockRestore();
  });
});
