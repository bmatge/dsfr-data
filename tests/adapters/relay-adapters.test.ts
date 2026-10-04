import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Relais cachable (ADR-155, #1232, constat AM-114) — les quatre adaptateurs.
 *
 * Chaque scénario est joué DEUX fois, sans relais puis avec `relayUrl`, sur le
 * même faux serveur. L'invariant : la requête relayée porte, derrière
 * `<relais>/<hôte>`, le chemin et la requête de la requête directe, au
 * caractère près et dans le même ordre d'appels. Pagination, `server-side`,
 * export et délégation `where` / `group-by` / `order-by` ne vivent que dans
 * l'URL cible : s'ils y sont en direct, ils y sont à travers le relais.
 *
 * Et rien d'autre ne change que le transport : mêmes lignes rendues.
 */

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

import { OpenDataSoftAdapter } from '@/adapters/opendatasoft-adapter.js';
import { TabularAdapter } from '@/adapters/tabular-adapter.js';
import { GristAdapter } from '@/adapters/grist-adapter.js';
import { InseeAdapter } from '@/adapters/insee-adapter.js';
import type { AdapterParams, ApiAdapter, FetchResult } from '@/adapters/api-adapter.js';
import { clearInseeLabelCache, resetRelayWarnings } from '@dsfr-data/shared';

const RELAIS = '/donnees-relais';
const CLE = { Authorization: 'Bearer CLE-DU-NAVIGATEUR' };

interface Appel {
  url: string;
  init: RequestInit | undefined;
}
let appels: Appel[] = [];
let warnSpy: ReturnType<typeof vi.spyOn>;

/** L'URL cible d'un appel : la réécriture inverse du relais, écrite à la main. */
function cibleDe(url: string): string {
  if (!url.startsWith(`${RELAIS}/`)) return url;
  return `https://${url.slice(RELAIS.length + 1)}`;
}

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

const lignes = (n: number, debut = 0): Record<string, unknown>[] =>
  Array.from({ length: n }, (_, i) => ({ id: debut + i, region: `R${(debut + i) % 4}`, n: 1 }));

/** Le faux serveur : répond à la CIBLE, que l'appel soit direct ou relayé. */
function repondre(cible: string): Response {
  const url = new URL(cible);
  const q = url.searchParams;

  if (url.hostname === 'portail.example') {
    if (url.pathname.endsWith('/exports/json')) return json(lignes(150));
    if (url.pathname.endsWith('/facets')) {
      return json({ facets: [{ name: 'region', facets: [{ value: 'R0', count: 3 }] }] });
    }
    if (url.pathname.endsWith('/records')) {
      if (q.get('group_by')) return json({ results: [{ region: 'R0', total: 38 }] });
      const limit = Number(q.get('limit') ?? '10');
      const offset = Number(q.get('offset') ?? '0');
      return json({ total_count: 150, results: lignes(Math.min(limit, 150 - offset), offset) });
    }
    return json({ dataset_id: 'jeu', fields: [] });
  }

  if (url.hostname === 'tabular-api.data.gouv.fr') {
    if (url.pathname.endsWith('/profile/')) return json({ profile: { columns: {} } });
    const page = Number(q.get('page') ?? '1');
    const taille = Number(q.get('page_size') ?? '20');
    const groupe = [...q.keys()].some((k) => k.endsWith('__groupby'));
    const total = groupe ? 4 : 450;
    const debut = (page - 1) * taille;
    const suivant = new URL(url.href);
    suivant.searchParams.set('page', String(page + 1));
    return json({
      data: lignes(Math.max(0, Math.min(taille, total - debut)), debut),
      meta: { page, page_size: taille, total },
      links: { next: debut + taille < total ? suivant.href : null },
    });
  }

  // Le proxy du site (`proxy-url`) relaie Grist par son endpoint dédié
  if (url.hostname === 'grist.numerique.gouv.fr' || url.hostname === 'mon-proxy.example') {
    if (url.pathname.endsWith('/sql')) return json({ records: [['R0', 3]] });
    if (url.pathname.endsWith('/columns')) return json({ columns: [] });
    if (url.pathname.endsWith('/tables')) return json({ tables: [] });
    return json({ records: [{ id: 1, fields: { region: 'R0', n: 1 } }] });
  }

  if (url.hostname === 'api.insee.fr') {
    if (url.pathname.includes('/range/')) return json({ range: [] });
    return json({
      observations: [{ dimensions: { GEO: 'FR' }, measures: { OBS_VALUE_NIVEAU: { value: 1 } } }],
      paging: { count: 1, isLast: true },
    });
  }

  return new Response('{}', { status: 404 });
}

beforeEach(() => {
  appels = [];
  resetRelayWarnings();
  clearInseeLabelCache();
  mockFetch.mockReset();
  mockFetch.mockImplementation(async (url: string, init?: RequestInit) => {
    appels.push({ url: String(url), init });
    return repondre(cibleDe(String(url)));
  });
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  warnSpy.mockRestore();
});

function params(overrides: Partial<AdapterParams>): AdapterParams {
  return {
    baseUrl: '',
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
    pageSize: 20,
    ...overrides,
  };
}

const signal = (): AbortSignal => new AbortController().signal;

/** Joue le scénario sans relais puis avec, sur deux adaptateurs neufs. */
async function jouer<T>(
  creer: () => ApiAdapter,
  base: Partial<AdapterParams>,
  scenario: (adapter: ApiAdapter, p: AdapterParams) => Promise<T>
): Promise<{ direct: Appel[]; relaye: Appel[]; resultatDirect: T; resultatRelaye: T }> {
  appels = [];
  const resultatDirect = await scenario(creer(), params(base));
  const direct = appels;
  appels = [];
  clearInseeLabelCache();
  const resultatRelaye = await scenario(creer(), params({ ...base, relayUrl: RELAIS }));
  return { direct, relaye: appels, resultatDirect, resultatRelaye };
}

/** L'invariant : mêmes cibles, dans le même ordre, toutes parties au relais. */
function exigerRelayeEgalDirect(direct: Appel[], relaye: Appel[]): void {
  expect(direct.length).toBeGreaterThan(0);
  expect(relaye.map((a) => cibleDe(a.url))).toEqual(direct.map((a) => a.url));
  for (const appel of relaye) {
    expect(appel.url.startsWith(`${RELAIS}/`)).toBe(true);
    // Requête « simple » : ni en-tête, ni cookie, jamais HEAD
    expect(appel.init?.headers).toBeUndefined();
    expect(appel.init?.credentials).toBe('omit');
    expect(appel.init?.method).toBeUndefined();
    expect(JSON.stringify(appel.init ?? {})).not.toContain('CLE-DU-NAVIGATEUR');
  }
  for (const appel of direct) expect(appel.url.startsWith(RELAIS)).toBe(false);
}

// ---------------------------------------------------------------------------
// Opendatasoft
// ---------------------------------------------------------------------------

describe('Opendatasoft à travers le relais', () => {
  const ODS = { baseUrl: 'https://portail.example', datasetId: 'jeu', headers: CLE };
  const creer = (): ApiAdapter => new OpenDataSoftAdapter();

  it('pagination : chaque page est reconstruite puis réécrite (offset cumulé)', async () => {
    const r = await jouer(creer, { ...ODS, maxRecords: 500 }, (a, p) => a.fetchAll(p, signal()));
    exigerRelayeEgalDirect(r.direct, r.relaye);
    expect(r.relaye).toHaveLength(2);
    expect(r.relaye[0].url).toBe(
      '/donnees-relais/portail.example/api/explore/v2.1/catalog/datasets/jeu/records?limit=100'
    );
    expect(r.relaye[1].url).toContain('offset=100');
    expect((r.resultatRelaye as FetchResult).data).toEqual((r.resultatDirect as FetchResult).data);
    expect((r.resultatRelaye as FetchResult).data).toHaveLength(150);
    // En direct, la clé part bien : hors relais, rien ne change
    expect(JSON.stringify(r.direct[0].init)).toContain('CLE-DU-NAVIGATEUR');
  });

  it('délégation where / group-by / order-by : inchangée dans l’URL cible', async () => {
    const r = await jouer(
      creer,
      {
        ...ODS,
        where: 'region = "Île-de-France" and montant > 10',
        groupBy: 'region',
        aggregate: 'montant:sum:total',
        orderBy: 'total:desc',
      },
      (a, p) => a.fetchAll(p, signal())
    );
    exigerRelayeEgalDirect(r.direct, r.relaye);
    const cible = new URL(cibleDe(r.relaye[0].url));
    expect(cible.searchParams.get('where')).toBe('region = "Île-de-France" and montant > 10');
    expect(cible.searchParams.get('group_by')).toBe('region');
    expect(cible.searchParams.get('order_by')).toContain('total');
    expect(cible.searchParams.get('select')).toContain('sum(montant)');
  });

  it('server-side : fetchPage réécrit l’URL de buildServerSideUrl', async () => {
    const overlay = { page: 3, effectiveWhere: 'n > 0', orderBy: 'id:desc' };
    const r = await jouer(creer, { ...ODS, pageSize: 20 }, (a, p) =>
      a.fetchPage(p, overlay, signal())
    );
    exigerRelayeEgalDirect(r.direct, r.relaye);
    expect(r.relaye).toHaveLength(1);
    expect(cibleDe(r.relaye[0].url)).toBe(
      new OpenDataSoftAdapter().buildServerSideUrl(params(ODS), overlay)
    );
    expect(r.relaye[0].url).toContain('offset=40');
  });

  it('fetch-mode="export" : une URL au lieu de N pages, donc une entrée de cache', async () => {
    const r = await jouer(creer, { ...ODS, fetchMode: 'export', maxRecords: 500 }, (a, p) =>
      a.fetchAll(p, signal())
    );
    exigerRelayeEgalDirect(r.direct, r.relaye);
    expect(r.relaye).toHaveLength(1);
    expect(r.relaye[0].url).toContain('/donnees-relais/portail.example/');
    expect(r.relaye[0].url).toContain('/exports/json');
  });

  it('facettes serveur : relayées elles aussi', async () => {
    const r = await jouer(creer, ODS, (a, p) => a.fetchFacets!(p, ['region'], 'n > 0', signal()));
    exigerRelayeEgalDirect(r.direct, r.relaye);
    expect(r.resultatRelaye).toEqual(r.resultatDirect);
  });
});

// ---------------------------------------------------------------------------
// Tabular
// ---------------------------------------------------------------------------

describe('Tabular à travers le relais', () => {
  const TAB = { resource: 'ea1b5c3d-0000-4000-8000-000000000001', headers: CLE };
  const creer = (): ApiAdapter => new TabularAdapter();

  it('pagination : links.next ne sert qu’au numéro de page, la suivante est réécrite', async () => {
    const r = await jouer(creer, TAB, (a, p) => a.fetchAll(p, signal()));
    exigerRelayeEgalDirect(r.direct, r.relaye);
    expect(r.relaye.length).toBeGreaterThanOrEqual(2);
    expect(
      r.relaye[0].url.startsWith('/donnees-relais/tabular-api.data.gouv.fr/api/resources/')
    ).toBe(true);
    expect(r.relaye[1].url).toContain('page=2');
    expect((r.resultatRelaye as FetchResult).data).toHaveLength(450);
    expect((r.resultatRelaye as FetchResult).data).toEqual((r.resultatDirect as FetchResult).data);
  });

  it('délégation where / group-by / order-by : inchangée dans l’URL cible', async () => {
    const r = await jouer(
      creer,
      {
        ...TAB,
        where: 'region:eq:R1',
        groupBy: 'region',
        aggregate: 'n:sum:total',
        orderBy: 'region:asc',
      },
      (a, p) => a.fetchAll(p, signal())
    );
    exigerRelayeEgalDirect(r.direct, r.relaye);
    const cible = r.relaye.map((a) => cibleDe(a.url)).join(' ');
    expect(cible).toContain('region__exact=R1');
    expect(cible).toContain('region__groupby');
    expect(cible).toContain('n__sum');
    expect(cible).toContain('region__sort=asc');
  });

  it('server-side : la page demandée est réécrite', async () => {
    const overlay = { page: 2, effectiveWhere: '', orderBy: '' };
    const r = await jouer(creer, { ...TAB, pageSize: 20 }, (a, p) =>
      a.fetchPage(p, overlay, signal())
    );
    exigerRelayeEgalDirect(r.direct, r.relaye);
    expect(r.relaye[0].url).toContain('page=2');
  });

  it('profil de ressource : relayé', async () => {
    const r = await jouer(creer, TAB, (a, p) => (a as TabularAdapter).fetchProfile(p, signal()));
    exigerRelayeEgalDirect(r.direct, r.relaye);
    expect(r.relaye[0].url).toContain('/profile/');
  });

  it('fetch-mode="export" avec un relais : retombe sur la pagination, EN LE DISANT, sans appeler data.gouv', async () => {
    const adapter = new TabularAdapter();
    const result = await adapter.fetchAll(
      params({ ...TAB, fetchMode: 'export', relayUrl: RELAIS }),
      signal()
    );
    expect(result.data).toHaveLength(450);
    // Tout est passé par le relais : ni www.data.gouv.fr, ni le stockage objet
    for (const appel of appels)
      expect(appel.url.startsWith(`${RELAIS}/tabular-api.data.gouv.fr/`)).toBe(true);
    const dits = warnSpy.mock.calls.map((c: unknown[]) => String(c[0]));
    const repli = dits.filter((m: string) => m.includes('fetch-mode="export" ignoré'));
    expect(repli).toHaveLength(1);
    expect(repli[0]).toContain('relay-url');
    expect(repli[0]).toContain('paginée');
    // Dit une fois par adaptateur, pas à chaque chargement
    await adapter.fetchAll(params({ ...TAB, fetchMode: 'export', relayUrl: RELAIS }), signal());
    expect(
      warnSpy.mock.calls.filter((c: unknown[]) =>
        String(c[0]).includes('fetch-mode="export" ignoré')
      )
    ).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Grist
// ---------------------------------------------------------------------------

describe('Grist à travers le relais', () => {
  const GRIST = {
    baseUrl: 'https://grist.numerique.gouv.fr/api/docs/DOC/tables/Table1/records',
    headers: CLE,
  };
  const creer = (): ApiAdapter => new GristAdapter();

  it('mode Records (GET) : relayé, filtre et tri dans l’URL cible', async () => {
    const r = await jouer(creer, { ...GRIST, where: 'region:eq:R0', orderBy: 'n:desc' }, (a, p) =>
      a.fetchAll(p, signal())
    );
    exigerRelayeEgalDirect(r.direct, r.relaye);
    expect(
      r.relaye[0].url.startsWith(
        '/donnees-relais/grist.numerique.gouv.fr/api/docs/DOC/tables/Table1/records'
      )
    ).toBe(true);
    expect(r.resultatRelaye).toEqual(r.resultatDirect);
  });

  it('server-side en mode Records : relayé', async () => {
    const overlay = { page: 2, effectiveWhere: '', orderBy: '' };
    const r = await jouer(creer, GRIST, (a, p) => a.fetchPage(p, overlay, signal()));
    exigerRelayeEgalDirect(r.direct, r.relaye);
  });

  it('R5 — mode SQL (POST) : hors relais, le chemin actuel, AVEC ses en-têtes', async () => {
    const sql = { ...GRIST, groupBy: 'region', aggregate: 'n:sum:total' };
    const r = await jouer(creer, sql, (a, p) => a.fetchAll(p, signal()));
    // Sonde SQL puis POST : les mêmes appels, relais posé ou non
    expect(r.relaye.map((a) => a.url)).toEqual(r.direct.map((a) => a.url));
    expect(r.relaye.map((a) => a.init?.method)).toEqual(['GET', 'POST']);
    for (const appel of r.relaye) {
      expect(appel.url.startsWith('https://grist.numerique.gouv.fr/api/docs/DOC/sql')).toBe(true);
      expect(JSON.stringify(appel.init?.headers)).toContain('CLE-DU-NAVIGATEUR');
    }
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('R5 — mode SQL avec proxy-url ET relais : le POST garde le proxy', async () => {
    const adapter = new GristAdapter();
    await adapter.fetchAll(
      params({
        ...GRIST,
        groupBy: 'region',
        aggregate: 'n:sum:total',
        relayUrl: RELAIS,
        proxyUrl: 'https://mon-proxy.example',
      }),
      signal()
    );
    expect(appels.map((a) => a.url.split('?')[0])).toEqual([
      'https://mon-proxy.example/grist-gouv-proxy/api/docs/DOC/sql',
      'https://mon-proxy.example/grist-gouv-proxy/api/docs/DOC/sql',
    ]);
  });
});

// ---------------------------------------------------------------------------
// INSEE Melodi
// ---------------------------------------------------------------------------

describe('INSEE Melodi à travers le relais', () => {
  const INSEE = { datasetId: 'DS_TEST', where: 'GEO:eq:FR', headers: CLE };
  const creer = (): ApiAdapter => new InseeAdapter();

  it('chargement complet et libellés : relayés, filtre de dimension dans l’URL cible', async () => {
    const r = await jouer(creer, INSEE, (a, p) => a.fetchAll(p, signal()));
    exigerRelayeEgalDirect(r.direct, r.relaye);
    expect(r.relaye[0].url.startsWith('/donnees-relais/api.insee.fr/melodi/data/DS_TEST')).toBe(
      true
    );
    expect(r.relaye[0].url).toContain('GEO=FR');
    // Les libellés (`/range/`) empruntent le même transport
    expect(
      r.relaye.some((a) => a.url.startsWith('/donnees-relais/api.insee.fr/melodi/range/'))
    ).toBe(true);
    expect(r.resultatRelaye).toEqual(r.resultatDirect);
  });

  it('server-side : relayé', async () => {
    const overlay = { page: 2, effectiveWhere: 'GEO:eq:FR', orderBy: '' };
    const r = await jouer(creer, INSEE, (a, p) => a.fetchPage(p, overlay, signal()));
    exigerRelayeEgalDirect(r.direct, r.relaye);
  });
});
