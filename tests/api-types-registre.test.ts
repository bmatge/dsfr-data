import { describe, it, expect, vi, afterEach } from 'vitest';

/**
 * #1139 — les messages qui listent les api-types les dérivent du registre.
 *
 * `registerAdapter` est public : une liste en dur (« opendatasoft, tabular,
 * grist, insee ») taisait l'adaptateur d'une page, et vieillissait à chaque
 * ajout. Les listes viennent désormais de `listAdapterTypes()` (et, pour les
 * filtres serveur, de la capacité `serverFetch`).
 */

const mockFetch = vi.fn(async () => ({ ok: true, json: async () => ({ data: [], meta: {} }) }));
globalThis.fetch = mockFetch as unknown as typeof fetch;

import { DsfrDataSource } from '@/components/dsfr-data-source.js';
import { getAdapter, listAdapterTypes, registerAdapter } from '@/adapters/adapter-registry.js';
import type { ApiAdapter } from '@/adapters/api-adapter.js';
import { clearDataCache, dispatchSourceCommand } from '@/utils/data-bridge.js';

interface SourceInternals {
  _fetchData(): Promise<void>;
}

/** Adaptateur tiers minimal : seuls type et capacités comptent ici. */
function tiers(type: string, serverFetch: boolean): ApiAdapter {
  return {
    ...(getAdapter('generic') as ApiAdapter),
    type,
    capabilities: { ...getAdapter('generic')!.capabilities, serverFetch },
  } as ApiAdapter;
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('#1139 — listes d’api-types dérivées du registre', () => {
  it('listAdapterTypes nomme les adaptateurs de la bibliothèque et ceux ajoutés', () => {
    registerAdapter(tiers('ckan-1139', true));
    expect(listAdapterTypes()).toEqual(
      expect.arrayContaining(['generic', 'opendatasoft', 'tabular', 'grist', 'insee', 'ckan-1139'])
    );
  });

  it('api-type inconnu : le message liste le registre, adaptateur tiers compris', async () => {
    registerAdapter(tiers('ckan-1139', true));
    const source = new DsfrDataSource();
    source.id = 'inconnu-1139';
    source.apiType = 'nexistepas';
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await (source as unknown as SourceInternals)._fetchData();

    const message = source.getAttribute('data-dsfr-config-error') || '';
    expect(message).toContain('ckan-1139');
    expect(message).toContain('opendatasoft');
  });

  it('mode URL : les api-types proposés pour filtrer côté serveur suivent serverFetch', async () => {
    registerAdapter(tiers('ckan-1139', true));
    registerAdapter(tiers('local-1139', false));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    clearDataCache('url-1139');
    const source = new DsfrDataSource();
    source.id = 'url-1139';
    source.url = 'https://api.example.com/items';
    source.paginate = true;
    document.body.appendChild(source);
    await source.updateComplete;

    dispatchSourceCommand('url-1139', { where: 'a:eq:1' });

    const message = warn.mock.calls.map((c) => String(c[0])).find((m) => m.includes('#288'));
    expect(message).toContain('ckan-1139');
    expect(message).not.toContain('local-1139');
    expect(message).not.toMatch(/\(generic/);
  });
});
