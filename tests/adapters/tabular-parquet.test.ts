import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { TabularAdapter } from '@/adapters/tabular-adapter.js';
import type { AdapterParams } from '@/adapters/api-adapter.js';
import {
  normalizeParquetValue,
  parquetExportFromResource,
  DATAGOUV_RESOURCE_API,
} from '@/adapters/tabular-parquet.js';

/**
 * `fetch-mode="export"` sur une source Tabular (#1055, étude #1022) : lecture
 * de l'export Parquet de data.gouv, avec repli sur la pagination.
 *
 * Le faux réseau sert un VRAI fichier Parquet (`parquet/types.parquet`,
 * produit par `parquet/generer.py` : ZSTD, INT64, DATE, TIMESTAMP, trois
 * groupes de lignes) et honore l'en-tête `Range` comme le S3 de data.gouv
 * (206 + la plage demandée).
 */

const RESSOURCE = 'res-parquet-0001';
const PARQUET_URL = 'https://hydra.test.invalid/parquet/res-parquet-0001.parquet';
const FICHIER = readFileSync(join(__dirname, 'parquet/types.parquet'));
const RESOLUTION_URL = `${DATAGOUV_RESOURCE_API}${RESSOURCE}/`;

interface Appel {
  url: string;
  init?: RequestInit;
}

let appels: Appel[] = [];
let resolution: unknown;
let s3Status = 206;

function reponseJson(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** Le faux S3 : plage `bytes=a-b` servie en 206, comme `hydra.s3`. */
function reponseParquet(init?: RequestInit): Response {
  if (s3Status !== 206) return new Response('erreur', { status: s3Status });
  const range = new Headers(init?.headers).get('Range') ?? '';
  const m = /^bytes=(\d+)-(\d*)$/.exec(range);
  const debut = m ? Number(m[1]) : 0;
  const fin = m && m[2] ? Number(m[2]) + 1 : FICHIER.length;
  const tranche = FICHIER.subarray(debut, fin);
  return new Response(new Uint8Array(tranche), { status: m ? 206 : 200 });
}

/** Pagination Tabular : toutes les lignes en une page, pour le repli. */
function reponseTabular(): Response {
  return reponseJson({
    data: [{ __id: 1, code: '01', population: 1 }],
    meta: { page: 1, page_size: 200, total: 1 },
    links: { next: null },
  });
}

const mockFetch = vi.fn(async (entree: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof entree === 'string' ? entree : entree.toString();
  appels.push({ url, init });
  if (url === RESOLUTION_URL) return reponseJson(resolution);
  if (url === PARQUET_URL) return reponseParquet(init);
  if (url.startsWith('https://tabular-api.data.gouv.fr/')) return reponseTabular();
  return new Response('inconnu', { status: 404 });
});

function params(overrides: Partial<AdapterParams> = {}): AdapterParams {
  return {
    baseUrl: 'https://tabular-api.data.gouv.fr',
    datasetId: '',
    resource: RESSOURCE,
    select: '',
    where: '',
    filter: '',
    groupBy: '',
    aggregate: '',
    orderBy: '',
    limit: 0,
    transform: '',
    pageSize: 20,
    fetchMode: 'export',
    headers: { Authorization: 'Bearer secret-de-la-source' },
    ...overrides,
  };
}

const signal = () => new AbortController().signal;
const appelsVers = (prefixe: string) => appels.filter((a) => a.url.startsWith(prefixe));

describe('TabularAdapter — fetch-mode="export" (Parquet, #1055)', () => {
  let warn: ReturnType<typeof vi.spyOn>;
  const fetchOriginal = globalThis.fetch;

  beforeEach(() => {
    appels = [];
    s3Status = 206;
    resolution = {
      resource: {
        extras: {
          'analysis:parsing:parquet_url': PARQUET_URL,
          'analysis:parsing:parquet_size': FICHIER.length,
        },
      },
      dataset_id: 'jeu',
    };
    globalThis.fetch = mockFetch as unknown as typeof fetch;
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    globalThis.fetch = fetchOriginal;
    warn.mockRestore();
  });

  it('lit tout le fichier, dans la forme de l’API (nombres, dates AAAA-MM-JJ, __id)', async () => {
    const result = await new TabularAdapter().fetchAll(params(), signal());

    expect(result.totalCount).toBe(5);
    expect(result.needsClientProcessing).toBe(false);
    expect(result.truncated).toBeUndefined();
    expect(result.data).toHaveLength(5);
    expect(result.data[0]).toEqual({
      __id: 1,
      code: '01',
      population: 652432,
      surface: 5762.4,
      actif: true,
      date_creation: '1790-03-04',
      horodatage: '2026-09-22T23:14:05.000Z',
      note: 3,
    });
    const lignes = result.data as Array<Record<string, unknown>>;
    expect(lignes.map((r) => r.date_creation)).toEqual([
      '1790-03-04',
      '1967-07-22',
      '2000-01-01',
      '2024-02-29',
      '1970-01-01',
    ]);
    expect(lignes[1].note).toBeNull();
    // Aucun BigInt ne survit : JSON.stringify casserait, et un agrégat aussi
    expect(() => JSON.stringify(result.data)).not.toThrow();
    const somme = lignes.reduce((s, r) => s + (r.population as number), 0);
    expect(somme).toBe(652432 + 531345 + 335975 + 165197 + 140916);
    // Aucune requête vers l'API paginée
    expect(appelsVers('https://tabular-api.data.gouv.fr/')).toHaveLength(0);
  });

  it('lit par plages, sans credentials ni en-têtes de la source', async () => {
    await new TabularAdapter().fetchAll(params(), signal());

    const s3 = appelsVers(PARQUET_URL);
    expect(s3.length).toBeGreaterThan(0);
    for (const a of s3) {
      expect(a.init?.credentials).toBe('omit');
      const h = new Headers(a.init?.headers);
      expect(h.get('Range')).toMatch(/^bytes=\d+-\d+$/);
      expect(h.get('Authorization')).toBeNull();
    }
    const res = appelsVers(RESOLUTION_URL);
    expect(res).toHaveLength(1);
    expect(res[0].init?.credentials).toBe('omit');
    expect(new Headers(res[0].init?.headers).get('Authorization')).toBeNull();
  });

  it('résout parquet_url une seule fois par ressource', async () => {
    const adapter = new TabularAdapter();
    await Promise.all([adapter.fetchAll(params(), signal()), adapter.fetchAll(params(), signal())]);
    await adapter.fetchAll(params(), signal());
    expect(appelsVers(RESOLUTION_URL)).toHaveLength(1);
  });

  it('projette les colonnes du select (sans __id), et nomme une colonne absente', async () => {
    const result = await new TabularAdapter().fetchAll(
      params({ select: 'code, population, inconnue' }),
      signal()
    );
    expect(result.data[0]).toEqual({ code: '01', population: 652432 });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('"inconnue"'));
  });

  it('max-records borne les lignes LUES et dit la troncature', async () => {
    const result = await new TabularAdapter().fetchAll(params({ maxRecords: 3 }), signal());
    expect(result.data).toHaveLength(3);
    expect(result.totalCount).toBe(5);
    expect(result.truncated).toBe(true);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("l'attribut max-records de dsfr-data-source")
    );
  });

  it('un limit explicite plus petit tronque sans avertir', async () => {
    const result = await new TabularAdapter().fetchAll(params({ limit: 2 }), signal());
    expect(result.data).toHaveLength(2);
    expect(result.truncated).toBeUndefined();
    expect(warn).not.toHaveBeenCalled();
  });

  it.each([
    ['where', { where: 'code:eq:01' }],
    ['group-by', { groupBy: 'code', aggregate: 'population:sum' }],
    ['order-by', { orderBy: 'population:desc' }],
  ])('%s délégué : pagination, avertissement UNIQUE qui nomme dsfr-data-source', async (_n, o) => {
    const adapter = new TabularAdapter();
    await adapter.fetchAll(params(o), signal());
    await adapter.fetchAll(params(o), signal());

    expect(appelsVers(RESOLUTION_URL)).toHaveLength(0);
    expect(appelsVers(PARQUET_URL)).toHaveLength(0);
    expect(appelsVers('https://tabular-api.data.gouv.fr/').length).toBeGreaterThan(0);
    const avis = warn.mock.calls.filter((c: unknown[]) =>
      String(c[0]).includes('fetch-mode="export" ignoré sur dsfr-data-source')
    );
    expect(avis).toHaveLength(1);
  });

  it('pas de parquet_url : pagination, avertissement unique', async () => {
    resolution = { resource: { extras: {} } };
    const adapter = new TabularAdapter();
    const result = await adapter.fetchAll(params(), signal());
    await adapter.fetchAll(params(), signal());

    expect(result.data).toEqual([{ __id: 1, code: '01', population: 1 }]);
    const avis = warn.mock.calls.filter((c: unknown[]) =>
      String(c[0]).includes("pas d'export Parquet")
    );
    expect(avis).toHaveLength(1);
  });

  it('S3 en erreur : pagination, jamais une erreur de la source', async () => {
    s3Status = 500;
    const result = await new TabularAdapter().fetchAll(params(), signal());
    expect(result.data).toHaveLength(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('lecture de l’export impossible'));
  });

  it('une annulation remonte, sans repli sur la pagination', async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    await expect(new TabularAdapter().fetchAll(params(), ctrl.signal)).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(appelsVers('https://tabular-api.data.gouv.fr/')).toHaveLength(0);
  });

  it('fetch-mode="records" (défaut) ne touche jamais au Parquet', async () => {
    await new TabularAdapter().fetchAll(params({ fetchMode: 'records' }), signal());
    expect(appelsVers(RESOLUTION_URL)).toHaveLength(0);
    expect(appelsVers(PARQUET_URL)).toHaveLength(0);
  });
});

describe('parquetExportFromResource', () => {
  it('lit parquet_url et sa taille', () => {
    expect(
      parquetExportFromResource({
        resource: {
          extras: {
            'analysis:parsing:parquet_url': 'https://hydra.s3/x.parquet',
            'analysis:parsing:parquet_size': 42,
          },
        },
      })
    ).toEqual({ url: 'https://hydra.s3/x.parquet', size: 42 });
  });

  it('rend null sans export, ou sur une URL non https', () => {
    expect(parquetExportFromResource({ resource: { extras: {} } })).toBeNull();
    expect(parquetExportFromResource(null)).toBeNull();
    expect(
      parquetExportFromResource({
        resource: { extras: { 'analysis:parsing:parquet_url': 'javascript:alert(1)' } },
      })
    ).toBeNull();
  });
});

describe('normalizeParquetValue', () => {
  it('BigInt → number, Date → AAAA-MM-JJ ou ISO, le reste inchangé', () => {
    expect(normalizeParquetValue(BigInt(1377794508))).toBe(1377794508);
    expect(normalizeParquetValue(new Date(Date.UTC(1967, 6, 22)))).toBe('1967-07-22');
    expect(normalizeParquetValue(new Date(Date.UTC(2026, 8, 22, 23, 14, 5)))).toBe(
      '2026-09-22T23:14:05.000Z'
    );
    expect(normalizeParquetValue('texte')).toBe('texte');
    expect(normalizeParquetValue(null)).toBeNull();
    expect(normalizeParquetValue(1.5)).toBe(1.5);
  });
});
