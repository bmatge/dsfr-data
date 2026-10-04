// @vitest-environment node
//
// Relais cachable (ADR-155, lot 2, #1232) — la BIBLIOTHÈQUE parle au VRAI relais.
//
// Le contrôle de données « relayé = direct » (`tests/verif-donnees/delegation.ts`)
// joue le relais par une réécriture inverse dans `page.route` : le relais réel
// n'y est pas exercé. Ici, les adaptateurs de la bibliothèque appellent le relais
// Node de référence (`proxy/relay/node/`, code de production), branché sur un
// faux amont local qui sert un jeu à la façon d'un portail Opendatasoft.
//
// Aucun service réel n'est joint : l'hôte est en `.conformance.test` (domaine
// réservé), la résolution DNS et la connexion sont injectées dans `createRelay`
// (voir `tests/relay/support/reference.mjs`).
//
// Hors navigateur : il n'y a ni `window` ni CORS. Ce que le navigateur ajoute
// (requête « simple », pas de pré-vérification) est éprouvé par
// `e2e/relay-url.spec.ts`.

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { OpenDataSoftAdapter } from '@/adapters/opendatasoft-adapter.js';
import type { AdapterParams } from '@/adapters/api-adapter.js';
import { classifySourceError } from '@/utils/source-errors.js';
import {
  isRelaySafePath,
  isRelaySafeSearch,
  resetRelayWarnings,
  resolveDataTransport,
} from '@dsfr-data/shared';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));

/** Ce que les supports `.mjs` du banc exposent, pour ce test. */
interface Reference {
  url: URL;
  close(): Promise<void>;
}
interface ReferenceModule {
  startReference(options: {
    upstreamPort: number;
    config?: (profile: Record<string, unknown>) => Record<string, unknown>;
  }): Promise<Reference>;
}
interface TargetModule {
  isSafePath(path: string): boolean;
  isSafeSearch(search: string): boolean;
  parseTarget(
    rawUrl: string,
    prefix: string,
    maxUrlLength: number
  ): { host: string; path: string; search: string };
}

/** Import d'un module `.mjs` du dépôt, sans déclaration de types. */
async function importer<T>(chemin: string): Promise<T> {
  const url = pathToFileURL(join(ROOT, chemin)).href;
  return (await import(/* @vite-ignore */ url)) as T;
}

// ---------------------------------------------------------------------------
// Le faux portail : 250 lignes, servies comme un portail Opendatasoft
// (`tests/relay/support/portal-upstream.mjs`, partagé avec `e2e/relay-url.spec.ts`)
// ---------------------------------------------------------------------------

interface Ligne {
  id: number;
  region: string;
  montant: number;
}
interface PortalUpstream {
  port: number;
  requests: { url: string; headers: Record<string, string | string[] | undefined> }[];
  setDelay(ms: number): void;
  close(): Promise<void>;
}
interface PortalModule {
  PORTAL_HOST: string;
  FORBIDDEN_PORTAL_HOST: string;
  EXPORT_PATH: string;
  REGIONS: string[];
  ROWS: Ligne[];
  TOTAL: number;
  TOTAL_BY_REGION: Map<string, number>;
  startPortalUpstream(): Promise<PortalUpstream>;
}

let portail: PortalModule;
let amont: PortalUpstream;
let relais: Reference;
let relaisEtroit: Reference;
let target: TargetModule;

/** Requêtes reçues par l'amont : URL brute et en-têtes. */
let recues: PortalUpstream['requests'];
let HOTE: string;
let HOTE_INTERDIT: string;
let EXPORT: string;
let REGIONS: string[];
let JEU: Ligne[];
let SOMME: number;
let SOMME_PAR_REGION: Map<string, number>;

beforeAll(async () => {
  portail = await importer<PortalModule>('tests/relay/support/portal-upstream.mjs');
  ({
    PORTAL_HOST: HOTE,
    FORBIDDEN_PORTAL_HOST: HOTE_INTERDIT,
    EXPORT_PATH: EXPORT,
    REGIONS,
    ROWS: JEU,
    TOTAL: SOMME,
    TOTAL_BY_REGION: SOMME_PAR_REGION,
  } = portail);
  amont = await portail.startPortalUpstream();
  recues = amont.requests;
  const upstreamPort = amont.port;

  const { startReference } = await importer<ReferenceModule>('tests/relay/support/reference.mjs');
  relais = await startReference({ upstreamPort });
  // Un relais où un client n'a droit qu'à UNE requête vers l'amont à la fois.
  relaisEtroit = await startReference({
    upstreamPort,
    config: (profile) => ({
      ...profile,
      limits: { ...(profile.limits as Record<string, unknown>), maxUpstreamRequests: 2 },
    }),
  });
  target = await importer<TargetModule>('proxy/relay/node/target.mjs');
});

afterAll(async () => {
  await relais?.close();
  await relaisEtroit?.close();
  await amont?.close();
});

function params(overrides: Partial<AdapterParams> = {}): AdapterParams {
  return {
    baseUrl: `https://${HOTE}`,
    datasetId: 'jeu',
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
    relayUrl: relais.url.href,
    ...overrides,
  };
}

/** Chemin et requête d'une URL cible, tels que l'amont doit les recevoir. */
function cheminEtRequete(cible: string): string {
  const url = new URL(cible);
  return cible.slice(url.origin.length);
}

const signal = (): AbortSignal => new AbortController().signal;

describe('la bibliothèque à travers le relais de référence (ADR-155, #1232)', () => {
  it('pagine : trois pages, la somme du jeu, chaque URL reçue octet pour octet', async () => {
    const adapter = new OpenDataSoftAdapter();
    const p = params({ maxRecords: 500, where: 'montant > 0' });
    recues.length = 0;
    const result = await adapter.fetchAll(p, signal());

    const lignes = result.data as Ligne[];
    expect(lignes).toHaveLength(JEU.length);
    expect(lignes.reduce((total, ligne) => total + ligne.montant, 0)).toBe(SOMME);
    expect(new Set(lignes.map((ligne) => ligne.id)).size).toBe(JEU.length);

    // L'amont a reçu EXACTEMENT ce que l'adaptateur aurait envoyé en direct
    expect(recues.map((r) => r.url)).toEqual([
      cheminEtRequete(adapter.buildUrl(p, 100, 0)),
      cheminEtRequete(adapter.buildUrl(p, 100, 100)),
      cheminEtRequete(adapter.buildUrl(p, 100, 200)),
    ]);
    expect(recues[1].url).toContain('offset=100');
    expect(recues.every((r) => r.headers.host === HOTE)).toBe(true);
  });

  it('délègue un group-by : la clause arrive intacte, mêmes sommes qu’un recalcul', async () => {
    const adapter = new OpenDataSoftAdapter();
    const p = params({ groupBy: 'region', aggregate: 'montant:sum:total' });
    recues.length = 0;
    const result = await adapter.fetchAll(p, signal());

    expect(recues).toHaveLength(1);
    expect(recues[0].url).toBe(cheminEtRequete(adapter.buildUrl(p, 100, 0)));
    expect(recues[0].url).toContain('group_by=region');
    const sommes = new Map(
      (result.data as Record<string, unknown>[]).map((ligne) => [
        String(ligne.region),
        Number(Object.entries(ligne).find(([cle]) => cle !== 'region')?.[1]),
      ])
    );
    expect(sommes).toEqual(SOMME_PAR_REGION);
  });

  it('server-side : la page demandée, et elle seule', async () => {
    const adapter = new OpenDataSoftAdapter();
    const p = params({ pageSize: 20 });
    const overlay = { page: 3, effectiveWhere: '', orderBy: 'id:asc' };
    recues.length = 0;
    const result = await adapter.fetchPage(p, overlay, signal());

    expect(recues).toHaveLength(1);
    expect(recues[0].url).toBe(cheminEtRequete(adapter.buildServerSideUrl(p, overlay)));
    expect((result.data as Ligne[]).map((ligne) => ligne.id)).toEqual(
      JEU.slice(40, 60).map((ligne) => ligne.id)
    );
    expect(result.totalCount).toBe(JEU.length);
  });

  it('fetch-mode="export" : UNE requête, le jeu entier', async () => {
    const adapter = new OpenDataSoftAdapter();
    const p = params({ fetchMode: 'export', maxRecords: 500 });
    recues.length = 0;
    const result = await adapter.fetchAll(p, signal());

    expect(recues).toHaveLength(1);
    expect(recues[0].url.startsWith(EXPORT)).toBe(true);
    expect(result.data).toHaveLength(JEU.length);
  });

  it('une même requête rejouée : la même URL, donc le cache du relais — l’amont n’est pas rappelé', async () => {
    const adapter = new OpenDataSoftAdapter();
    const p = params({ maxRecords: 500, where: 'montant >= 1' });
    const appels: string[] = [];
    const brut = globalThis.fetch;
    const espion = vi.spyOn(globalThis, 'fetch').mockImplementation((entree, init) => {
      appels.push(String(entree));
      return brut(entree, init);
    });
    try {
      recues.length = 0;
      const premier = await adapter.fetchAll(p, signal());
      const vus = recues.length;
      const urls = [...appels];
      appels.length = 0;
      const second = await adapter.fetchAll(p, signal());

      expect(vus).toBe(3);
      expect(appels).toEqual(urls); // au caractère près
      expect(recues).toHaveLength(vus); // servi par le cache du relais
      expect(second.data).toEqual(premier.data);
      // La requête de la bibliothèque est « simple » : ni en-tête, ni cookie
      for (const call of espion.mock.calls) {
        expect(call[1]).toMatchObject({ credentials: 'omit' });
        expect((call[1] as RequestInit).headers).toBeUndefined();
      }
    } finally {
      espion.mockRestore();
    }
  });

  it('les en-têtes de la source ne quittent pas la bibliothèque', async () => {
    const adapter = new OpenDataSoftAdapter();
    const p = params({
      maxRecords: 500,
      where: 'montant >= 2',
      headers: { Authorization: 'Apikey CLE-DU-NAVIGATEUR' },
    });
    const espion = vi.spyOn(globalThis, 'fetch');
    try {
      recues.length = 0;
      await adapter.fetchAll(p, signal());
      expect(espion.mock.calls.length).toBeGreaterThan(0);
      for (const call of espion.mock.calls) {
        expect(JSON.stringify(call[1])).not.toContain('CLE-DU-NAVIGATEUR');
      }
      expect(recues.every((r) => r.headers.authorization === undefined)).toBe(true);
    } finally {
      espion.mockRestore();
    }
  });

  it('deux cibles, deux URL : un autre jeu ne lit pas le cache du premier', async () => {
    const adapter = new OpenDataSoftAdapter();
    const a = adapter.buildUrl(params({ where: 'montant > 5' }), 100, 0);
    const b = adapter.buildUrl(params({ where: 'montant > 6' }), 100, 0);
    const options = { relayUrl: relais.url.href };
    expect(resolveDataTransport(a, options).url).not.toBe(resolveDataTransport(b, options).url);
  });

  it('hôte hors liste blanche : 403, classé « accès restreint »', async () => {
    const adapter = new OpenDataSoftAdapter();
    const erreur = await adapter
      .fetchAll(params({ baseUrl: `https://${HOTE_INTERDIT}` }), signal())
      .then(
        () => null,
        (e: Error) => e
      );
    expect(erreur?.message).toContain('HTTP 403');
    expect(classifySourceError(erreur)).toBe('acces-restreint');
  });

  it('jeu inconnu de l’amont : 404, classé « données introuvables »', async () => {
    const adapter = new OpenDataSoftAdapter();
    const erreur = await adapter.fetchAll(params({ datasetId: 'absent' }), signal()).then(
      () => null,
      (e: Error) => e
    );
    expect(erreur?.message).toContain('HTTP 404');
    expect(classifySourceError(erreur)).toBe('donnees-introuvables');
  });

  it('part du client atteinte (503 + Retry-After) : les requêtes en trop sont réessayées, toutes aboutissent', async () => {
    const adapter = new OpenDataSoftAdapter();
    const espion = vi.spyOn(globalThis, 'fetch');
    amont.setDelay(250);
    try {
      // Trois sources d'une même page, trois URL absentes du cache, une seule
      // place amont pour ce client : sans nouvel essai, deux tomberaient en 503.
      const resultats = await Promise.all(
        [11, 12, 13].map((seuil) =>
          adapter.fetchAll(
            params({
              relayUrl: relaisEtroit.url.href,
              groupBy: 'region',
              aggregate: 'montant:sum:total',
              where: `montant > -${seuil}`,
            }),
            signal()
          )
        )
      );
      for (const result of resultats) expect(result.data).toHaveLength(REGIONS.length);
      const statuts = await Promise.all(
        espion.mock.results.map(async (r) => ((await r.value) as Response).status)
      );
      expect(statuts.filter((s) => s === 200)).toHaveLength(3);
      expect(statuts.filter((s) => s === 503).length).toBeGreaterThanOrEqual(1);
    } finally {
      amont.setDelay(0);
      espion.mockRestore();
    }
  }, 20_000);
});

// ---------------------------------------------------------------------------
// La bibliothèque n'envoie jamais au relais ce qu'il refuserait (400)
// ---------------------------------------------------------------------------

describe('chemins et requêtes : la bibliothèque et le relais jugent pareil', () => {
  const CHEMINS = [
    '/',
    '/api/explore/v2.1/catalog/datasets/jeu/records',
    '/api/resources/ea1b5c3d-0000-4000-8000-000000000001/data/',
    '/jeu@portail/records',
    "/a/b;v=1/c!$&'()*+,=:@~_-.x",
    '/a%20b/%C3%A9t%C3%A9',
    '/a/../b',
    '/a/./b',
    '/a//b',
    '/a/..;/b',
    '/a/%2e%2e/b',
    '/a/.%2E/b',
    '/a%2fb',
    '/a%2Fb',
    '/a%5cb',
    '/a\\b',
    '/a%252e%252e',
    '/a%3bb',
    '/a%00b',
    '/a%0d%0ab',
    '/a%7fb',
    '/a/%c0%ae%c0%ae/b',
    '/a/%c1%9c',
    '/a/%e0%80%ae',
    '/a/%f0%80%80%ae',
    '/a/%f8%80%80%80%ae',
    '/a/%fc%80%80%80%80%ae',
    '/a/%ef%bc%8e%ef%bc%8e/b',
    '/a/%ef%bc%8f',
    '/a/%ef%bc%bc',
    '/a|b',
    '/a[0]',
    '/a^b',
    '/a b',
    '/a%zz',
    '/a%2',
    '/été',
  ];
  const REQUETES = [
    '',
    '?',
    '?a=1&b=2',
    '?where=annee%20%3E%202020&select=sum(x)%20as%20t',
    '?q=a+b%2Cc|d[0]{x}^`',
    '?a=%00',
    '?a=%0a',
    '?a=%0D',
    '?a=1#b',
    '?a= b',
    '?a=é',
  ];

  it.each(CHEMINS)('chemin %s', (chemin) => {
    expect(isRelaySafePath(chemin)).toBe(target.isSafePath(chemin));
  });

  it.each(REQUETES)('requête « %s »', (requete) => {
    expect(isRelaySafeSearch(requete)).toBe(target.isSafeSearch(requete));
  });

  it('toute URL que la bibliothèque relaie est lue par le relais, et rend la cible à l’octet', () => {
    resetRelayWarnings();
    const muet = vi.spyOn(console, 'warn').mockImplementation(() => {});
    let relayees = 0;
    try {
      for (const chemin of CHEMINS) {
        for (const requete of REQUETES) {
          let cible: string;
          try {
            cible = new URL(`https://ouvert.conformance.test${chemin}${requete}`).href;
          } catch {
            continue;
          }
          const transport = resolveDataTransport(cible, { relayUrl: '/donnees-relais' });
          if (!transport.relayed) continue;
          relayees += 1;
          // Le relais ne lève pas (ni 400, ni 403) et retrouve hôte, chemin et requête
          const lue = target.parseTarget(transport.url, '/donnees-relais', 8000);
          expect(`https://${lue.host}${lue.path}${lue.search}`).toBe(cible.split('#')[0]);
        }
      }
    } finally {
      muet.mockRestore();
    }
    expect(relayees).toBeGreaterThan(20);
  });
});
