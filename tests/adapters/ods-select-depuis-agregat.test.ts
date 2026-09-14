import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Tests #859 (constats BUG-009 et PG-015 du banc d'essai) — sur une delegation
 * de `group-by`, le `select` de l'adaptateur ODS est COMPOSE depuis l'agregat.
 *
 * Le `select` explicite de la source l'emportait : l'URL partait sans
 * `count(champ) as nb`, la colonne d'alias n'existait pas, et la query — qui a
 * marque la delegation et saute son calcul client — affichait 0 la ou le
 * recalcul donne 3 458 et 224. Chiffre faux et plausible (#301).
 */

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

import { OpenDataSoftAdapter } from '@/adapters/opendatasoft-adapter.js';
import type { AdapterParams, ServerSideOverlay } from '@/adapters/api-adapter.js';

function odsParams(overrides: Partial<AdapterParams> = {}): AdapterParams {
  return {
    baseUrl: 'https://data.example.com',
    datasetId: 'tourisme-handicap',
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
    ...overrides,
  };
}

function overlay(overrides: Partial<ServerSideOverlay> = {}): ServerSideOverlay {
  return { page: 1, effectiveWhere: '', orderBy: '', ...overrides };
}

let warnSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  mockFetch.mockReset();
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  warnSpy.mockRestore();
});

describe('#859 — ODS : le select est compose depuis l’agregat', () => {
  const adapter = new OpenDataSoftAdapter();

  const SELECT_SOURCE = 'nom_du_professionnel, departement, region';
  const delegue = {
    select: SELECT_SOURCE,
    groupBy: 'departement',
    aggregate: 'nom_du_professionnel:count:nb',
  };

  it('buildUrl : le select de la source n’ecrase pas la colonne d’alias', () => {
    const url = new URL(adapter.buildUrl(odsParams(delegue)));

    expect(url.searchParams.get('select')).toBe('count(*) as nb, departement');
    expect(url.searchParams.get('group_by')).toBe('departement');
  });

  it('buildServerSideUrl : meme regle sur une page', () => {
    const url = new URL(adapter.buildServerSideUrl(odsParams(delegue), overlay({ page: 2 })));

    expect(url.searchParams.get('select')).toBe('count(*) as nb, departement');
    expect(url.searchParams.get('group_by')).toBe('departement');
  });

  it('buildExportUrl : meme regle sur /exports/json', () => {
    const url = new URL(adapter.buildExportUrl(odsParams(delegue), 1001));

    expect(url.pathname).toContain('/exports/json');
    expect(url.searchParams.get('select')).toBe('count(*) as nb, departement');
  });

  it('un agregat sur un champ nomme emporte sa colonne et celles du group-by', () => {
    const url = new URL(
      adapter.buildUrl(
        odsParams({
          select: 'code_reg, population',
          groupBy: 'code_reg, pays_iso2',
          aggregate: 'population:sum',
        })
      )
    );

    expect(url.searchParams.get('select')).toBe(
      'sum(population) as population__sum, code_reg, pays_iso2'
    );
  });

  it('sans agregat, le select explicite de la source est conserve', () => {
    const url = new URL(adapter.buildUrl(odsParams({ select: SELECT_SOURCE })));

    expect(url.searchParams.get('select')).toBe(SELECT_SOURCE);
    expect(url.searchParams.get('group_by')).toBeNull();
  });

  it('select incompatible : delegation refusee, avertissement nomme, calcul client', async () => {
    const params = odsParams({
      // `annee` n'existe que par le select de la source : la recomposition
      // du select depuis l'agregat en perdrait la definition
      select: 'year(date_ouverture) as annee, montant',
      groupBy: 'annee',
      aggregate: 'montant:sum',
    });

    const url = new URL(adapter.buildUrl(params));
    expect(url.searchParams.get('select')).toBe('year(date_ouverture) as annee, montant');
    expect(url.searchParams.get('group_by')).toBeNull();

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ results: [{ annee: 2024, montant: 10 }], total_count: 1 }),
    });
    const result = await adapter.fetchAll(params, new AbortController().signal);

    expect(result.needsClientProcessing).toBe(true);
    const message = warnSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('\n');
    expect(message).toContain('group-by non délégué');
    expect(message).toContain('"annee"');
  });

  it('select incompatible en server-side : meme refus sur fetchPage', async () => {
    const params = odsParams({
      select: 'periode as an, montant',
      groupBy: 'an',
      aggregate: 'montant:sum',
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ results: [{ an: '2024', montant: 10 }], total_count: 1 }),
    });
    const result = await adapter.fetchPage(params, overlay(), new AbortController().signal);

    expect(result.needsClientProcessing).toBe(true);
    // Sans group_by, `total_count` redevient un nombre de LIGNES fiable
    expect(result.totalCount).toBe(1);
  });

  it('un renommage a l’identique n’est pas un conflit', () => {
    const url = new URL(
      adapter.buildUrl(
        odsParams({
          select: '`departement` as departement, nom_du_professionnel',
          groupBy: 'departement',
          aggregate: 'nom_du_professionnel:count:nb',
        })
      )
    );

    expect(url.searchParams.get('select')).toBe('count(*) as nb, departement');
    expect(url.searchParams.get('group_by')).toBe('departement');
  });
});
