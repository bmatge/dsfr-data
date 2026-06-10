import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Tests traversants #287 (EPIC D) — durcissement du mode SQL Grist.
 *
 * Bugs d'origine :
 * - `_mergeWhere(params.where, overlay.effectiveWhere)` avec deux chaînes
 *   identiques : `effectiveWhere` (getEffectiveWhere de la source) contient
 *   DÉJÀ le where statique → SQL `WHERE X AND X` avec args doublés ;
 * - identifiant vide non gardé : `group-by="a,"` → throw `Empty SQL
 *   identifier` (les agrégats sont gardés par le parseur partagé #269,
 *   pas le GROUP BY ni le WHERE) ;
 * - cache de disponibilité SQL par hostname sans TTL : un 403 sur UN
 *   document désactivait le SQL pour TOUS les documents du host,
 *   définitivement ; sonde non liée au signal du composant, et un abort
 *   du composant empoisonnait le cache.
 */

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

import { GristAdapter } from '@/adapters/grist-adapter.js';
import type { AdapterParams } from '@/adapters/api-adapter.js';

const DOC_A = 'https://grist.example.fr/api/docs/docAAA/tables/Table1/records';
const DOC_B = 'https://grist.example.fr/api/docs/docBBB/tables/Table1/records';

function makeParams(overrides: Partial<AdapterParams> = {}): AdapterParams {
  return {
    baseUrl: DOC_A,
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
    pageSize: 0,
    ...overrides,
  };
}

describe('#287 — plus de double merge du WHERE (effectiveWhere contient déjà le statique)', () => {
  const adapter = new GristAdapter();

  it('_mergeWhere ne re-fusionne pas le where statique', () => {
    // La source envoie effectiveWhere = statique + overlays déjà joints
    expect((adapter as any)._mergeWhere('x:eq:1', 'x:eq:1, b:eq:2')).toBe('x:eq:1, b:eq:2');
    expect((adapter as any)._mergeWhere('x:eq:1', undefined)).toBe('x:eq:1');
    expect((adapter as any)._mergeWhere(undefined, 'b:eq:2')).toBe('b:eq:2');
    expect((adapter as any)._mergeWhere(undefined, undefined)).toBe('');
  });

  it('AC : SQL généré sans doublon (une clause, un arg)', () => {
    const { where, args } = (adapter as any)._buildSqlQuery(
      makeParams({ where: 'region:eq:IDF', groupBy: 'region', aggregate: 'pop:sum' }),
      { page: 0, effectiveWhere: 'region:eq:IDF', orderBy: '' },
      'Table1'
    );
    expect(where).toBe('"region" = ?');
    expect(args).toEqual(['IDF']);
  });
});

describe('#287 — gardes de parsing (identifiants vides)', () => {
  const adapter = new GristAdapter();

  it('AC : group-by avec virgule traînante ne jette plus', () => {
    const { groupBy, select } = (adapter as any)._buildSqlQuery(
      makeParams({ groupBy: 'region,', aggregate: 'pop:sum' }),
      undefined,
      'Table1'
    );
    expect(groupBy).toBe('"region"');
    expect(select).toContain('SUM("pop")');
  });

  it('AC : aggregate malformé (a:sum,) ne jette plus (parseur partagé #269)', () => {
    expect(() =>
      (adapter as any)._buildSqlQuery(
        makeParams({ groupBy: 'region', aggregate: 'pop:sum,' }),
        undefined,
        'Table1'
      )
    ).not.toThrow();
  });

  it('clause where sans champ ou opérateur : ignorée sans throw', () => {
    const args: unknown[] = [];
    const sql = (adapter as any)._colonWhereToSql(':eq:v, region:eq:IDF', args);
    expect(sql).toBe('"region" = ?');
    expect(args).toEqual(['IDF']);
  });
});

describe('#287 — cache de disponibilité SQL : par document, avec TTL', () => {
  let adapter: GristAdapter;

  beforeEach(() => {
    adapter = new GristAdapter();
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('AC : un 403 sur un document ne condamne pas les autres documents du host', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 403 });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const availableA = await (adapter as any)._checkSqlAvailability(makeParams());
    expect(availableA).toBe(false);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Autre document, même host : doit être sondé (avant : cache par host → 0 appel)
    mockFetch.mockResolvedValue({ ok: true });
    const availableB = await (adapter as any)._checkSqlAvailability(makeParams({ baseUrl: DOC_B }));
    expect(availableB).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(2);

    warnSpy.mockRestore();
  });

  it('AC : un 403 ponctuel expire (TTL) — le document est re-sondé', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-10T10:00:00Z'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    mockFetch.mockResolvedValue({ ok: false, status: 403 });
    expect(await (adapter as any)._checkSqlAvailability(makeParams())).toBe(false);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Dans la fenêtre de TTL : cache négatif servi, pas de nouvelle sonde
    expect(await (adapter as any)._checkSqlAvailability(makeParams())).toBe(false);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // TTL négatif expiré : re-sonde, le SQL est revenu
    vi.setSystemTime(new Date('2026-06-10T10:05:00Z'));
    mockFetch.mockResolvedValue({ ok: true });
    expect(await (adapter as any)._checkSqlAvailability(makeParams())).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(2);

    warnSpy.mockRestore();
  });

  it("un abort du composant n'empoisonne pas le cache", async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const controller = new AbortController();
    controller.abort();
    mockFetch.mockRejectedValue(Object.assign(new Error('aborted'), { name: 'AbortError' }));

    const available = await (adapter as any)._checkSqlAvailability(makeParams(), controller.signal);
    expect(available).toBe(false);

    // Pas d'entrée de cache : la prochaine tentative re-sonde
    mockFetch.mockResolvedValue({ ok: true });
    expect(await (adapter as any)._checkSqlAvailability(makeParams())).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(2);

    warnSpy.mockRestore();
  });

  it('la sonde reçoit un signal (timeout 2s, lié au composant quand fourni)', async () => {
    mockFetch.mockResolvedValue({ ok: true });
    const controller = new AbortController();

    await (adapter as any)._checkSqlAvailability(makeParams(), controller.signal);

    const options = mockFetch.mock.calls[0][1];
    expect(options.signal).toBeDefined();
  });
});
