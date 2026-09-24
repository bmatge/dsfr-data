import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests #482 (bug 1) — enveloppe Grist jamais aplatie en mode URL.
 *
 * Bug d'origine : `<dsfr-data-source url="…/records" transform="records">`
 * livrait les records Grist bruts `{ id, fields: {…} }` — l'aval ne voyait
 * que 2 champs (`id`, `fields`) au lieu des colonnes réelles, et aucune
 * carte/datalist n'était exploitable.
 *
 * #1136 : l'aplatissement n'est plus un test de forme dans le composant
 * (`flattenGristEnvelope`, supprimé) mais la stratégie que déclare la
 * `ProviderConfig` du fournisseur détecté depuis l'URL, appliquée par
 * `flattenProviderRecords` — la même que le chemin connexion
 * (ARCHITECTURE §12, « un seul aplatissement »). Le garde-fou #482 sur la
 * forme des lignes est conservé : les colonnes métier sont à plat.
 */

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

import { DsfrDataSource } from '@/components/dsfr-data-source.js';
import { clearDataCache, clearDataMeta, getDataMeta } from '@/utils/data-bridge.js';

interface SourceInternals {
  _fetchData(): Promise<void>;
  _buildUrl(): string;
}

function respond(json: unknown) {
  mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(json) });
}

describe('#482 — dsfr-data-source aplatit l’enveloppe Grist en mode URL', () => {
  let source: DsfrDataSource;

  beforeEach(() => {
    clearDataCache('grist-url-source');
    clearDataMeta('grist-url-source');
    mockFetch.mockReset();
    source = new DsfrDataSource();
  });

  it('transform="records" sur une réponse Grist livre des lignes plates', async () => {
    respond({
      records: [
        { id: 1, fields: { nom: 'Ajaccio', lat: 41.9, lon: 8.7, geojson: '{"type":"Point"}' } },
      ],
    });

    source.url = 'https://grist.example.com/api/docs/xxx/tables/yyy/records';
    source.id = 'grist-url-source';
    source.transform = 'records';

    await (source as unknown as SourceInternals)._fetchData();

    // Colonnes métier à plat, plus aucune clé `fields` ; l'`id` de la ligne
    // est conservé, comme sur le chemin connexion (flattenNestedKey).
    expect(source.getData()).toEqual([
      { id: 1, nom: 'Ajaccio', lat: 41.9, lon: 8.7, geojson: '{"type":"Point"}' },
    ]);
  });

  it('une URL Grist derrière un proxy est reconnue à son chemin', async () => {
    respond({ records: [{ id: 7, fields: { a: 1 } }] });

    source.url = '/grist-proxy/api/docs/xxx/tables/yyy/records';
    source.id = 'grist-url-source';
    source.transform = 'records';

    await (source as unknown as SourceInternals)._fetchData();

    expect(source.getData()).toEqual([{ id: 7, a: 1 }]);
  });

  it('une réponse non-Grist passe inchangée', async () => {
    const rows = [{ nom: 'Paris' }, { nom: 'Lyon' }];
    respond({ records: rows });

    source.url = 'https://api.example.com/data';
    source.id = 'grist-url-source';
    source.transform = 'records';

    await (source as unknown as SourceInternals)._fetchData();

    expect(source.getData()).toEqual(rows);
  });

  it('hors URL Grist, une colonne métier « fields » n’est jamais dépliée', async () => {
    const rows = [{ id: 1, fields: { x: 1 } }];
    respond(rows);

    source.url = 'https://api.example.com/lignes';
    source.id = 'grist-url-source';

    await (source as unknown as SourceInternals)._fetchData();

    expect(source.getData()).toEqual(rows);
  });
});

describe('#1136 — même aplatissement pour tout fournisseur imbriqué', () => {
  it('une URL Melodi en mode URL livre des observations à plat, comme l’adaptateur', async () => {
    clearDataCache('melodi-url');
    mockFetch.mockReset();
    respond({
      observations: [
        {
          dimensions: { GEO: 'FR', TIME_PERIOD: '2022' },
          measures: { OBS_VALUE_NIVEAU: { value: 12 } },
          attributes: { OBS_STATUS: 'A' },
        },
      ],
    });
    const source = new DsfrDataSource();
    source.id = 'melodi-url';
    source.url = 'https://api.insee.fr/melodi/data/DS_TEST?maxResult=10';
    source.transform = 'observations';

    await (source as unknown as SourceInternals)._fetchData();

    expect(source.getData()).toEqual([
      { GEO: 'FR', TIME_PERIOD: '2022', OBS_VALUE: 12, OBS_STATUS: 'A' },
    ]);
  });
});

describe('#1136 — pagination du mode URL lue dans GENERIC_CONFIG.pagination', () => {
  beforeEach(() => {
    clearDataCache('url-paginee');
    clearDataMeta('url-paginee');
    mockFetch.mockReset();
  });

  function pagedSource(): DsfrDataSource {
    const source = new DsfrDataSource();
    source.id = 'url-paginee';
    source.url = 'https://api.example.com/items';
    source.paginate = true;
    source.pageSize = 25;
    return source;
  }

  it('injecte page et page_size dans l’URL', () => {
    const url = new URL((pagedSource() as unknown as SourceInternals)._buildUrl());
    expect(url.searchParams.get('page')).toBe('1');
    expect(url.searchParams.get('page_size')).toBe('25');
  });

  it('lit data et meta.{page,page_size,total} de la réponse', async () => {
    const source = pagedSource();
    respond({ data: [{ n: 1 }, { n: 2 }], meta: { page: 3, page_size: 2, total: 42 } });

    await (source as unknown as SourceInternals)._fetchData();

    expect(source.getData()).toEqual([{ n: 1 }, { n: 2 }]);
    expect(getDataMeta('url-paginee')).toMatchObject({
      page: 3,
      pageSize: 2,
      total: 42,
      serverSide: true,
    });
  });

  it('meta partielle : les replis de la source (page courante, page-size, 0)', async () => {
    const source = pagedSource();
    respond({ data: [], meta: {} });

    await (source as unknown as SourceInternals)._fetchData();

    expect(getDataMeta('url-paginee')).toMatchObject({ page: 1, pageSize: 25, total: 0 });
  });

  it('sans meta, aucune meta de pagination n’est publiée', async () => {
    const source = pagedSource();
    respond({ data: [{ n: 1 }] });

    await (source as unknown as SourceInternals)._fetchData();

    expect(getDataMeta('url-paginee')).toBeUndefined();
    expect(source.getData()).toEqual([{ n: 1 }]);
  });
});
