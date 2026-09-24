import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Tests #1137 — les clés réservées de `params` sont déclarées par
 * l'adaptateur, plus codées en dur dans la source.
 *
 * Avant : `dsfr-data-source` portait la liste de query-string d'Opendatasoft
 * (`select`, `where`, `group_by`…) quel que soit l'api-type. Le jour où un
 * autre adaptateur transmet `extraParams`, ses propres clés (`page_size` de
 * Tabular, `champ__sort`…) n'étaient pas protégées. Chaque adaptateur déclare
 * désormais `reservedParamKeys` ; la source ne porte que le message.
 */

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

import { DsfrDataSource } from '@/components/dsfr-data-source.js';
import { getAdapter, registerAdapter } from '@/adapters/adapter-registry.js';
import type { ApiAdapter } from '@/adapters/api-adapter.js';
import { clearDataCache, clearDataMeta } from '@/utils/data-bridge.js';

interface SourceInternals {
  _fetchViaAdapter(): Promise<void>;
}

function tabularSource(params: string): DsfrDataSource {
  const source = new DsfrDataSource();
  source.id = 'tab-reserve';
  source.apiType = 'tabular';
  source.resource = 'ressource-test';
  source.params = params;
  return source;
}

let warnSpy: ReturnType<typeof vi.spyOn>;
let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  mockFetch.mockReset();
  clearDataCache('tab-reserve');
  clearDataMeta('tab-reserve');
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  warnSpy.mockRestore();
  errorSpy.mockRestore();
});

describe('#1137 — chaque adaptateur déclare ses clés réservées', () => {
  it('Opendatasoft garde les sept clés de #726', () => {
    expect([...(getAdapter('opendatasoft')?.reservedParamKeys ?? [])].sort()).toEqual(
      ['facet', 'group_by', 'limit', 'offset', 'order_by', 'select', 'where'].sort()
    );
  });

  it('Tabular déclare pagination, projection, OU et suffixes de colonne', () => {
    const keys = getAdapter('tabular')?.reservedParamKeys;
    for (const k of ['page', 'page_size', 'columns', 'or', '*__sort', '*__exact', '*__sum']) {
      expect(keys?.has(k), k).toBe(true);
    }
  });
});

describe('#1137 — AC : params=\'{"page_size":1}\' sur Tabular est refusé avec message', () => {
  it('page_size est retiré du passe-plat', () => {
    const source = tabularSource('{"page_size":1,"lang":"fr"}');
    expect(source.getAdapterParams().extraParams).toEqual({ lang: 'fr' });
  });

  it('un suffixe de colonne (champ__sort) est réservé', () => {
    const source = tabularSource('{"annee__sort":"desc","nom__exact":"x"}');
    expect(source.getAdapterParams().extraParams).toBeUndefined();
  });

  it('le refus produit une erreur de configuration nommant la clé', async () => {
    const source = tabularSource('{"page_size":1}');
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: [{ a: 1 }], meta: { total: 1 }, links: {} }),
    });

    await (source as unknown as SourceInternals)._fetchViaAdapter();

    const message = source.getAttribute('data-dsfr-config-error') || '';
    expect(message).toContain('"page_size"');
    expect(message).toContain('réservée');
  });

  it('une clé réservée ailleurs (where d’Opendatasoft) ne l’est pas sur Tabular', () => {
    const source = tabularSource('{"where":"x"}');
    expect(source.getAdapterParams().extraParams).toEqual({ where: 'x' });
  });
});

describe('#1137 — un adaptateur tiers sans déclaration ne réserve rien', () => {
  it('registerAdapter sans reservedParamKeys : tout passe', () => {
    const tiers = {
      ...getAdapter('generic'),
      type: 'tiers-1137',
      capabilities: getAdapter('generic')!.capabilities,
    } as ApiAdapter;
    registerAdapter(tiers);
    const source = new DsfrDataSource();
    source.id = 'tiers';
    source.apiType = 'tiers-1137';
    source.params = '{"page_size":1,"select":"x"}';
    expect(source.getAdapterParams().extraParams).toEqual({ page_size: '1', select: 'x' });
  });
});
