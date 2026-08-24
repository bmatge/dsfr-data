import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests #482 (bug 1) — enveloppe Grist jamais aplatie en mode URL.
 *
 * Bug d'origine : `<dsfr-data-source url="…/records" transform="records">`
 * livrait les records Grist bruts `{ id, fields: {…} }` — l'aval ne voyait
 * que 2 champs (`id`, `fields`) au lieu des colonnes réelles, et aucune
 * carte/datalist n'était exploitable. Le mode adapter (api-type="grist")
 * aplatissait, lui : deux chemins incohérents.
 */

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

import { flattenGristEnvelope } from '@/utils/grist-envelope.js';
import { DsfrDataSource } from '@/components/dsfr-data-source.js';
import { clearDataCache } from '@/utils/data-bridge.js';

describe('flattenGristEnvelope', () => {
  it('aplatit un tableau de records Grist { id, fields }', () => {
    const data = [
      { id: 1, fields: { nom: 'Ajaccio', lat: 41.9, lon: 8.7 } },
      { id: 2, fields: { nom: 'Bastia', lat: 42.7, lon: 9.4 } },
    ];
    expect(flattenGristEnvelope(data)).toEqual([
      { nom: 'Ajaccio', lat: 41.9, lon: 8.7 },
      { nom: 'Bastia', lat: 42.7, lon: 9.4 },
    ]);
  });

  it('accepte les records sans id (fields seul)', () => {
    expect(flattenGristEnvelope([{ fields: { a: 1 } }])).toEqual([{ a: 1 }]);
  });

  it('ne touche pas un tableau de lignes déjà plates', () => {
    const flat = [{ nom: 'Paris', lat: 48.8 }];
    expect(flattenGristEnvelope(flat)).toBe(flat);
  });

  it('ne déplie pas une colonne métier "fields" si d’autres clés existent', () => {
    const data = [{ id: 1, fields: { x: 1 }, autre: 'colonne' }];
    expect(flattenGristEnvelope(data)).toBe(data);
  });

  it('ne touche pas un tableau mixte (un seul record non-Grist suffit)', () => {
    const data = [{ id: 1, fields: { x: 1 } }, { nom: 'plat' }];
    expect(flattenGristEnvelope(data)).toBe(data);
  });

  it('ignore les valeurs non-tableau et le tableau vide', () => {
    expect(flattenGristEnvelope(null)).toBe(null);
    expect(flattenGristEnvelope({ records: [] })).toEqual({ records: [] });
    expect(flattenGristEnvelope([])).toEqual([]);
  });

  it('rejette fields non-objet (string, tableau)', () => {
    const str = [{ id: 1, fields: 'texte' }];
    const arr = [{ id: 1, fields: [1, 2] }];
    expect(flattenGristEnvelope(str)).toBe(str);
    expect(flattenGristEnvelope(arr)).toBe(arr);
  });
});

describe('#482 — dsfr-data-source aplatit l’enveloppe Grist en mode URL', () => {
  let source: DsfrDataSource;

  beforeEach(() => {
    clearDataCache('grist-url-source');
    mockFetch.mockReset();
    source = new DsfrDataSource();
  });

  it('transform="records" sur une réponse Grist livre des lignes plates', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          records: [
            { id: 1, fields: { nom: 'Ajaccio', lat: 41.9, lon: 8.7, geojson: '{"type":"Point"}' } },
          ],
        }),
    });

    source.url = 'https://grist.example.com/api/docs/xxx/tables/yyy/records';
    source.id = 'grist-url-source';
    source.transform = 'records';

    await (source as any)._fetchData();

    expect(source.getData()).toEqual([
      { nom: 'Ajaccio', lat: 41.9, lon: 8.7, geojson: '{"type":"Point"}' },
    ]);
  });

  it('une réponse non-Grist passe inchangée', async () => {
    const rows = [{ nom: 'Paris' }, { nom: 'Lyon' }];
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ records: rows }),
    });

    source.url = 'https://api.example.com/data';
    source.id = 'grist-url-source';
    source.transform = 'records';

    await (source as any)._fetchData();

    expect(source.getData()).toEqual(rows);
  });
});
