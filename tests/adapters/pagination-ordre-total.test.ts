import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * #1274, #1233 — pagination par décalage sans ordre total.
 *
 * Opendatasoft (#1274) : `/records` pagine par `offset` sans garantir l'ordre.
 * Sans `order_by`, ou sur un tri que ses ex-æquo ne départagent pas, des
 * lignes reviennent deux fois d'une page à l'autre et d'autres jamais, à
 * compte juste (mesure de l'issue : 321 lignes lues, 297 distinctes).
 * - une seule page : rien ne change, ni requête ni tri ajoutés ;
 * - plusieurs pages : la première, émise comme avant, sert de sonde ; la
 *   lecture repart sur un ordre TOTAL — le tri demandé, puis toutes les
 *   colonnes triables du jeu, lues dans ses métadonnées ;
 * - pagination serveur : chaque page part sur cet ordre ;
 * - ordre refusé par l'API, ou colonnes illisibles : pagination d'avant, et
 *   c'est dit (console, réserve `unstable-pagination`).
 *
 * Tabular (#1233) : en pagination serveur, le tri demandé reçoit la clé de
 * départage déjà écrite pour le chargement tronqué (`"__id".asc` dans la
 * valeur du tri) ; refusée, le tri simple reste, avec la réserve
 * `unstable-sort`.
 *
 * Les serveurs sont les faux serveurs de la recette, qui mentent comme les
 * API : ex-æquo ordonnés autrement d'une page à l'autre.
 */

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

import { OpenDataSoftAdapter } from '@/adapters/opendatasoft-adapter.js';
import { TabularAdapter } from '@/adapters/tabular-adapter.js';
import type { AdapterParams, FetchResult } from '@/adapters/api-adapter.js';
import {
  JEU,
  NOMBRE_DE_LIGNES,
  repondreOdsExport,
  repondreOdsMetadonnees,
  repondreOdsRecords,
  repondreTabular,
} from '../builder-e2e/api-fixtures.js';

type Ligne = Record<string, unknown>;

function params(overrides: Partial<AdapterParams> = {}): AdapterParams {
  return {
    baseUrl: 'https://portail.example',
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
    ...overrides,
  };
}

/** Une requête partie : son chemin et ses paramètres. */
interface Appel {
  chemin: string;
  q: URLSearchParams;
}
let appels: Appel[] = [];

const signal = () => new AbortController().signal;
const regions = (lignes: unknown[]) => (lignes as Ligne[]).map((l) => String(l.region));
const distinctes = (lignes: unknown[]) => new Set(regions(lignes)).size;
const records = () => appels.filter((a) => a.chemin.endsWith('/records'));
const metadonnees = () => appels.filter((a) => a.chemin.endsWith('/datasets/jeu'));
const ordres = () => records().map((a) => a.q.get('order_by'));

/** Toutes les colonnes du jeu de recette sont triables : c'est la clé de départage. */
const CLE = "region, code_dept, code_reg, academie, pays_iso2, population, `Nombre d'habitants`";

let warnSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  mockFetch.mockReset();
  appels = [];
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => warnSpy.mockRestore());

const avertis = (fragment: string) =>
  warnSpy.mock.calls.filter((c: unknown[]) => String(c[0]).includes(fragment));

// ---------------------------------------------------------------------------
// Opendatasoft
// ---------------------------------------------------------------------------

/**
 * Branche `fetch` sur le faux portail.
 * - `refuserCle` : 400 sur tout `order_by` de plus de clés que le tri demandé
 *   (`400`), ou l'erreur réseau opaque d'une réponse sans en-tête CORS ;
 * - `metadonnees` : `403` pour des métadonnées illisibles ;
 * - `panne` : toute requête échoue à partir de la N-ième ;
 * - `jeu` : d'autres lignes que le jeu de recette.
 */
function servirOds(
  options: {
    refuserCle?: '400' | 'reseau';
    metadonnees?: '403';
    panne?: number;
    jeu?: Ligne[];
  } = {}
): void {
  const jeu = options.jeu ?? (JEU as Ligne[]);
  mockFetch.mockImplementation(async (cible: unknown) => {
    const url = new URL(String(cible));
    appels.push({ chemin: url.pathname, q: url.searchParams });
    if (options.panne !== undefined && appels.length >= options.panne) {
      throw new TypeError('Failed to fetch');
    }
    if (url.pathname.endsWith('/exports/json')) {
      return { ok: true, json: () => Promise.resolve(repondreOdsExport(url, jeu)) };
    }
    if (!url.pathname.endsWith('/records')) {
      if (options.metadonnees === '403') return { ok: false, status: 403, statusText: 'Forbidden' };
      return { ok: true, json: () => Promise.resolve(repondreOdsMetadonnees(jeu)) };
    }
    const cles = (url.searchParams.get('order_by') ?? '').split(',').filter((c) => c.trim());
    if (options.refuserCle && cles.length > 1) {
      if (options.refuserCle === 'reseau') throw new TypeError('Failed to fetch');
      return { ok: false, status: 400, statusText: 'Bad Request' };
    }
    const corps = repondreOdsRecords(url, jeu);
    // Le vrai portail répond 400 à un tri qu'il refuse ; le faux le dit dans
    // l'enveloppe — rendu ici en vrai statut.
    if (corps.error_code) return { ok: false, status: 400, statusText: 'Bad Request' };
    return { ok: true, json: () => Promise.resolve(corps) };
  });
}

describe('#1274 — Opendatasoft, chargement complet', () => {
  it('le faux portail perd bien des lignes sans ordre total (témoin)', () => {
    const lues: Ligne[] = [];
    for (const offset of [0, 100]) {
      const url = new URL(`https://portail.example/records?limit=100&offset=${offset}`);
      lues.push(...repondreOdsRecords(url).results);
    }
    expect(lues).toHaveLength(NOMBRE_DE_LIGNES);
    expect(distinctes(lues)).toBeLessThan(NOMBRE_DE_LIGNES);
  });

  it('sans order-by : toutes les lignes, une fois chacune, sur toutes les colonnes triables', async () => {
    servirOds();
    const result = await new OpenDataSoftAdapter().fetchAll(params(), signal());

    expect(result.data).toHaveLength(NOMBRE_DE_LIGNES);
    expect(distinctes(result.data)).toBe(NOMBRE_DE_LIGNES);
    expect(result.totalCount).toBe(NOMBRE_DE_LIGNES);
    expect(result.caveats).toBeUndefined();
    expect(warnSpy).not.toHaveBeenCalled();
    // La sonde, émise comme avant ; les métadonnées ; puis deux pages triées
    expect(ordres()).toEqual([null, CLE, CLE]);
    expect(records().map((a) => a.q.get('offset'))).toEqual([null, null, '100']);
    expect(metadonnees()).toHaveLength(1);
    expect(appels).toHaveLength(4);
    // Ordre livré : celui de la clé, donc trié sur la première colonne du jeu
    const livrees = regions(result.data);
    expect(livrees).toEqual([...livrees].sort((a, b) => a.localeCompare(b, 'fr')));
  });

  it('order-by non total : le tri demandé reste en tête, la clé le complète', async () => {
    servirOds();
    const result = await new OpenDataSoftAdapter().fetchAll(
      params({ orderBy: 'academie:desc' }),
      signal()
    );

    expect(distinctes(result.data)).toBe(NOMBRE_DE_LIGNES);
    expect(result.caveats).toBeUndefined();
    expect(ordres()).toEqual([
      'academie DESC',
      "academie DESC, region, code_dept, code_reg, pays_iso2, population, `Nombre d'habitants`",
      "academie DESC, region, code_dept, code_reg, pays_iso2, population, `Nombre d'habitants`",
    ]);
    const academies = (result.data as Ligne[]).map((l) => String(l.academie));
    expect(academies).toEqual([...academies].sort((a, b) => b.localeCompare(a, 'fr')));
  });

  it('tronqué par limit : les premières lignes du tri, sans doublon', async () => {
    servirOds();
    const result = await new OpenDataSoftAdapter().fetchAll(
      params({ orderBy: 'academie:asc', limit: 120 }),
      signal()
    );

    const attendu = [...(JEU as Ligne[])]
      .sort(
        (a, b) =>
          String(a.academie).localeCompare(String(b.academie), 'fr') ||
          String(a.region).localeCompare(String(b.region), 'fr')
      )
      .slice(0, 120);
    expect(regions(result.data)).toEqual(regions(attendu));
    expect(records().map((a) => a.q.get('limit'))).toEqual(['100', '100', '20']);
  });

  it('tronqué par max-records, sans order-by : les premières lignes de la clé, sans doublon', async () => {
    servirOds();
    const result = await new OpenDataSoftAdapter().fetchAll(params({ maxRecords: 120 }), signal());

    expect(result.data).toHaveLength(120);
    expect(distinctes(result.data)).toBe(120);
    expect(ordres()).toEqual([null, CLE, CLE]);
  });

  it('une seule page : une requête, aucun tri ajouté, aucune lecture de métadonnées', async () => {
    servirOds();
    for (const p of [
      params({ where: 'code_reg = "11"' }),
      params({ limit: 100 }),
      params({ limit: 30, orderBy: 'academie:asc' }),
    ]) {
      appels = [];
      const result = await new OpenDataSoftAdapter().fetchAll(p, signal());
      expect(appels).toHaveLength(1);
      expect(appels[0].q.get('order_by')).toBe(p.orderBy ? 'academie ASC' : null);
      expect(result.caveats).toBeUndefined();
    }
  });

  it('fetch-mode="export" : une requête, aucun tri ajouté', async () => {
    servirOds();
    const result = await new OpenDataSoftAdapter().fetchAll(
      params({ fetchMode: 'export' }),
      signal()
    );

    expect(appels).toHaveLength(1);
    expect(appels[0].chemin).toContain('/exports/json');
    expect(appels[0].q.get('order_by')).toBeNull();
    expect(distinctes(result.data)).toBe(NOMBRE_DE_LIGNES);
  });

  it('une colonne non triable (géométrie) n’entre pas dans la clé', async () => {
    const jeu = (JEU as Ligne[]).map((ligne, i) => ({ ...ligne, geo: { lon: i, lat: i } }));
    servirOds({ jeu });
    const result = await new OpenDataSoftAdapter().fetchAll(params(), signal());

    expect(ordres()[1]).toBe(CLE);
    expect(distinctes(result.data)).toBe(NOMBRE_DE_LIGNES);
    expect(result.caveats).toBeUndefined();
  });

  it('un tri qui nomme déjà toutes les colonnes triables n’est pas complété', async () => {
    const jeu = (JEU as Ligne[]).map((l) => ({ region: l.region, population: l.population }));
    servirOds({ jeu });
    const result = await new OpenDataSoftAdapter().fetchAll(
      params({ orderBy: 'population:asc, region:asc' }),
      signal()
    );

    // Rien à ajouter : pas de relecture, la sonde est la première page
    expect(ordres()).toEqual(['population ASC, region ASC', 'population ASC, region ASC']);
    expect(distinctes(result.data)).toBe(NOMBRE_DE_LIGNES);
    expect(result.caveats).toBeUndefined();
  });
});

describe('#1274 — Opendatasoft, requêtes regroupées', () => {
  const groupes = { groupBy: 'region, code_reg', aggregate: 'population:sum' };

  it('sans order-by : rien n’est ajouté (les groupes sortent ordonnés par leur clé)', async () => {
    servirOds();
    const result = await new OpenDataSoftAdapter().fetchAll(params(groupes), signal());

    expect(result.data).toHaveLength(NOMBRE_DE_LIGNES);
    expect(ordres()).toEqual([null, null]);
    expect(metadonnees()).toHaveLength(0);
    expect(result.caveats).toBeUndefined();
  });

  it('trié sur une clé partielle : les autres clés du regroupement départagent', async () => {
    servirOds();
    const result = await new OpenDataSoftAdapter().fetchAll(
      params({ ...groupes, orderBy: 'code_reg:desc' }),
      signal()
    );

    expect(distinctes(result.data)).toBe(NOMBRE_DE_LIGNES);
    expect(ordres()).toEqual(['code_reg DESC', 'code_reg DESC, region', 'code_reg DESC, region']);
    // Des groupes n'ont pas besoin des colonnes du jeu : pas de métadonnées
    expect(metadonnees()).toHaveLength(0);
  });

  it('trié sur un agrégat : toutes les clés du regroupement départagent', async () => {
    servirOds();
    await new OpenDataSoftAdapter().fetchAll(
      params({ ...groupes, orderBy: 'population__sum:desc' }),
      signal()
    );
    expect(ordres()[1]).toBe('population__sum DESC, region, code_reg');
  });

  it('une clé de regroupement aliasée se trie par son alias', async () => {
    servirOds();
    const adapter = new OpenDataSoftAdapter();
    const url = new URL(
      adapter.buildServerSideUrl(
        params({ groupBy: 'year(date) as annee, region', aggregate: 'population:sum' }),
        { page: 2, effectiveWhere: '', orderBy: 'population__sum:desc' }
      )
    );
    expect(url.searchParams.get('order_by')).toBe('population__sum DESC, annee, region');
  });
});

describe('#1274 — Opendatasoft, pagination serveur', () => {
  /** Feuillette tout le jeu par pages de 20. */
  async function feuilleter(
    adapter: OpenDataSoftAdapter,
    orderBy: string
  ): Promise<{ lignes: unknown[]; pages: FetchResult[] }> {
    const lignes: unknown[] = [];
    const pages: FetchResult[] = [];
    for (let page = 1; page <= Math.ceil(NOMBRE_DE_LIGNES / 20); page++) {
      const result = await adapter.fetchPage(
        params(),
        { page, effectiveWhere: '', orderBy },
        signal()
      );
      pages.push(result);
      lignes.push(...result.data);
    }
    return { lignes, pages };
  }

  it('le faux portail perd bien des lignes par pages de 20 sans ordre total (témoin)', () => {
    const lues: Ligne[] = [];
    for (let offset = 0; offset < NOMBRE_DE_LIGNES; offset += 20) {
      const url = new URL(`https://portail.example/records?limit=20&offset=${offset}`);
      lues.push(...repondreOdsRecords(url).results);
    }
    expect(distinctes(lues)).toBeLessThan(NOMBRE_DE_LIGNES);
  });

  it('sans tri : l’union des pages est le jeu, chaque ligne une fois', async () => {
    servirOds();
    const { lignes, pages } = await feuilleter(new OpenDataSoftAdapter(), '');

    expect(lignes).toHaveLength(NOMBRE_DE_LIGNES);
    expect(distinctes(lignes)).toBe(NOMBRE_DE_LIGNES);
    expect(ordres().every((o) => o === CLE)).toBe(true);
    // Les métadonnées du jeu ne sont lues qu'une fois pour toutes les pages
    expect(metadonnees()).toHaveLength(1);
    expect(pages.every((p) => p.caveats === undefined && p.totalCount === NOMBRE_DE_LIGNES)).toBe(
      true
    );
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('tri de la liste sur une clé non unique : même garantie, le tri reste en tête', async () => {
    servirOds();
    const { lignes } = await feuilleter(new OpenDataSoftAdapter(), 'academie:asc');

    expect(distinctes(lignes)).toBe(NOMBRE_DE_LIGNES);
    expect(ordres()[0]).toMatch(/^academie ASC, region, /);
    const academies = (lignes as Ligne[]).map((l) => String(l.academie));
    expect(academies).toEqual([...academies].sort((a, b) => a.localeCompare(b, 'fr')));
  });

  it('l’URL de diagnostic est celle qui part, une fois les colonnes lues', async () => {
    servirOds();
    const adapter = new OpenDataSoftAdapter();
    const overlay = { page: 2, effectiveWhere: '', orderBy: 'academie:asc' };
    // Avant tout chargement : les colonnes ne sont pas connues, le tri seul
    expect(
      new URL(adapter.buildServerSideUrl(params(), overlay)).searchParams.get('order_by')
    ).toBe('academie ASC');
    await adapter.fetchPage(params(), overlay, signal());
    expect(adapter.buildServerSideUrl(params(), overlay)).toBe(
      `https://portail.example${records()[0].chemin}?${records()[0].q.toString()}`
    );
  });
});

describe('#1274 — Opendatasoft, repli', () => {
  for (const refus of ['400', 'reseau'] as const) {
    it(`chargement complet, clé refusée (${refus}) : la source charge comme avant, et c’est dit`, async () => {
      servirOds({ refuserCle: refus });
      const adapter = new OpenDataSoftAdapter();
      const result = await adapter.fetchAll(params(), signal());

      // Jamais un échec là où la source marchait : les lignes de la sonde et
      // de la page suivante, à compte juste — et possiblement doublées
      expect(result.data).toHaveLength(NOMBRE_DE_LIGNES);
      expect(result.totalCount).toBe(NOMBRE_DE_LIGNES);
      expect(result.caveats).toEqual(['unstable-pagination']);
      expect(ordres()).toEqual([null, CLE, null]);
      expect(avertis('sans ordre total')).toHaveLength(1);
      expect(avertis('a refusé le tri de départage')).toHaveLength(1);

      // Retenu pour ce jeu : la clé n'est plus redemandée, même réserve, un
      // seul avertissement
      appels = [];
      const suite = await adapter.fetchAll(params(), signal());
      expect(ordres()).toEqual([null, null]);
      expect(suite.caveats).toEqual(['unstable-pagination']);
      expect(avertis('sans ordre total')).toHaveLength(1);
    });
  }

  it('pagination serveur, clé refusée : la page est redemandée comme avant, et c’est retenu', async () => {
    servirOds({ refuserCle: '400' });
    const adapter = new OpenDataSoftAdapter();
    const overlay = { page: 1, effectiveWhere: '', orderBy: 'academie:asc' };
    const result = await adapter.fetchPage(params(), overlay, signal());

    expect(result.data).toHaveLength(20);
    expect(result.caveats).toEqual(['unstable-pagination']);
    expect(ordres()).toEqual([expect.stringMatching(/^academie ASC, region/), 'academie ASC']);
    expect(avertis('sans ordre total')).toHaveLength(1);

    appels = [];
    const suite = await adapter.fetchPage(params(), { ...overlay, page: 2 }, signal());
    expect(ordres()).toEqual(['academie ASC']);
    expect(suite.caveats).toEqual(['unstable-pagination']);
    expect(avertis('sans ordre total')).toHaveLength(1);
  });

  it('métadonnées illisibles : pas de clé, pagination d’avant, et c’est dit', async () => {
    servirOds({ metadonnees: '403' });
    const adapter = new OpenDataSoftAdapter();
    const result = await adapter.fetchAll(params({ orderBy: 'academie:asc' }), signal());

    expect(result.data).toHaveLength(NOMBRE_DE_LIGNES);
    expect(result.caveats).toEqual(['unstable-pagination']);
    expect(ordres()).toEqual(['academie ASC', 'academie ASC']);
    expect(avertis('aucune clé de départage')).toHaveLength(1);

    const page = await adapter.fetchPage(
      params(),
      { page: 1, effectiveWhere: '', orderBy: '' },
      signal()
    );
    expect(page.caveats).toEqual(['unstable-pagination']);
  });

  it('une panne après acceptation n’est pas un refus : l’erreur remonte, rien n’est retenu', async () => {
    servirOds();
    const adapter = new OpenDataSoftAdapter();
    await adapter.fetchAll(params(), signal());

    // La clé a été acceptée : la panne de la relecture remonte telle quelle
    appels = [];
    servirOds({ panne: 2 });
    await expect(adapter.fetchAll(params(), signal())).rejects.toThrow('Failed to fetch');

    appels = [];
    servirOds();
    const result = await adapter.fetchAll(params(), signal());
    expect(ordres()).toEqual([null, CLE, CLE]);
    expect(result.caveats).toBeUndefined();
  });

  it('pagination serveur, panne avant toute acceptation : deux requêtes, l’erreur remonte, rien n’est retenu', async () => {
    servirOds({ panne: 2 }); // la requête 1 lit les métadonnées
    const adapter = new OpenDataSoftAdapter();
    const overlay = { page: 1, effectiveWhere: '', orderBy: '' };
    await expect(adapter.fetchPage(params(), overlay, signal())).rejects.toThrow('Failed to fetch');
    expect(records()).toHaveLength(2); // avec la clé, puis sans : les deux échouent

    appels = [];
    servirOds();
    const result = await adapter.fetchPage(params(), overlay, signal());
    expect(ordres()).toEqual([CLE]);
    expect(result.caveats).toBeUndefined();
  });

  it('une annulation n’est pas un refus', async () => {
    const controleur = new AbortController();
    const adapter = new OpenDataSoftAdapter();
    vi.spyOn(adapter, 'describeFieldTypes').mockResolvedValue({ region: 'text' });
    mockFetch.mockImplementation(async () => {
      controleur.abort();
      const err = new Error('The operation was aborted.');
      err.name = 'AbortError';
      throw err;
    });
    await expect(
      adapter.fetchPage(params(), { page: 1, effectiveWhere: '', orderBy: '' }, controleur.signal)
    ).rejects.toThrow('aborted');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Tabular, pagination serveur
// ---------------------------------------------------------------------------

interface Fait {
  id: number;
  categorie: string;
  nombre: number;
}

const CATEGORIES = [
  'Homicides',
  'Usage de stupéfiants (AFD)',
  'Vols (avec violence)',
  'Cambriolages',
];

/** Le jeu `delegation-tabular-ex-aequo` : 450 lignes, des ex-æquo partout. */
const FAITS: Fait[] = Array.from({ length: 450 }, (_, i) => ({
  id: i + 1,
  categorie: CATEGORIES[i % 4],
  nombre: (i * 7) % 5,
}));

function paramsTabular(overrides: Partial<AdapterParams> = {}): AdapterParams {
  return params({
    baseUrl: 'https://tabular-api.data.gouv.fr',
    datasetId: '',
    resource: 'resource-456',
    pageSize: 50,
    ...overrides,
  });
}

/** Requêtes Tabular parties, query string décodée. */
let requetes: string[] = [];

function servirTabular(options: { refuserOrdreCompose?: boolean; panne?: number } = {}): void {
  requetes = [];
  mockFetch.mockImplementation(async (cible: unknown) => {
    const url = new URL(String(cible));
    const recherche = decodeURIComponent(url.search.replace(/\+/g, ' '));
    requetes.push(recherche);
    if (options.panne !== undefined && requetes.length >= options.panne) {
      throw new TypeError('Failed to fetch');
    }
    if (options.refuserOrdreCompose && /__sort=(asc|desc),/.test(recherche)) {
      // L'API répond ses 400 sans en-tête CORS : le navigateur n'en voit
      // qu'une erreur réseau
      throw new TypeError('Failed to fetch');
    }
    const corps = repondreTabular(url, FAITS as unknown as Ligne[]);
    return { ok: true, json: () => Promise.resolve(corps) };
  });
}

const ids = (lignes: unknown[]) => (lignes as Fait[]).map((l) => l.id);

async function feuilleterTabular(
  adapter: TabularAdapter,
  orderBy: string,
  p: AdapterParams = paramsTabular()
): Promise<{ lignes: unknown[]; pages: FetchResult[] }> {
  const lignes: unknown[] = [];
  const pages: FetchResult[] = [];
  for (let page = 1; page <= 9; page++) {
    const result = await adapter.fetchPage(p, { page, effectiveWhere: '', orderBy }, signal());
    pages.push(result);
    lignes.push(...result.data);
  }
  return { lignes, pages };
}

describe('#1233 — Tabular, pagination serveur', () => {
  it('le faux serveur perd bien des lignes sur un tri non total feuilleté (témoin)', () => {
    const lues: number[] = [];
    for (let page = 1; page <= 9; page++) {
      const url = new URL(
        `https://tabular-api.data.gouv.fr/api/resources/r/data/?nombre__sort=desc&page_size=50&page=${page}`
      );
      lues.push(...ids(repondreTabular(url, FAITS as unknown as Ligne[]).data));
    }
    expect(lues).toHaveLength(450);
    expect(new Set(lues).size).toBeLessThan(450);
  });

  it('tri sur une clé non unique : chaque page part sur un ordre total, aucune ligne perdue', async () => {
    servirTabular();
    const { lignes, pages } = await feuilleterTabular(new TabularAdapter(), 'nombre:desc');

    expect(lignes).toHaveLength(450);
    expect(new Set(ids(lignes)).size).toBe(450);
    expect(requetes).toHaveLength(9);
    expect(requetes.every((r) => r.includes('nombre__sort=desc,"__id".asc'))).toBe(true);
    expect(pages.every((p) => p.caveats === undefined)).toBe(true);
    expect(warnSpy).not.toHaveBeenCalled();
    // Les lignes sont celles du jeu trié (nombre décroissant, puis rang)
    const attendu = [...FAITS].sort((a, b) => b.nombre - a.nombre || a.id - b.id);
    expect(ids(lignes)).toEqual(attendu.map((f) => f.id));
  });

  it('tri à plusieurs clés : les suivantes entrent dans la valeur, `__id` en dernier', async () => {
    servirTabular();
    const { lignes } = await feuilleterTabular(new TabularAdapter(), 'categorie:asc, nombre:desc');

    expect(new Set(ids(lignes)).size).toBe(450);
    expect(requetes[0]).toContain('categorie__sort=asc,"nombre".desc,"__id".asc');
  });

  it('groupes triés sur une clé partielle : les autres clés du regroupement départagent', async () => {
    servirTabular();
    const adapter = new TabularAdapter();
    const url = adapter.buildServerSideUrl(
      paramsTabular({ groupBy: 'categorie, nombre', aggregate: 'id:count' }),
      { page: 2, effectiveWhere: '', orderBy: 'categorie:asc' }
    );
    expect(decodeURIComponent(url)).toContain('categorie__sort=asc,"nombre".asc');
  });

  it('tri déjà total (`__id`) ou absent : l’URL ne change pas', async () => {
    servirTabular();
    const adapter = new TabularAdapter();
    await adapter.fetchPage(
      paramsTabular(),
      { page: 2, effectiveWhere: '', orderBy: '__id:desc' },
      signal()
    );
    await adapter.fetchPage(
      paramsTabular(),
      { page: 2, effectiveWhere: '', orderBy: '' },
      signal()
    );
    expect(requetes).toEqual(['?__id__sort=desc&page_size=50&page=2', '?page_size=50&page=2']);
  });

  it('sans tri, le parcours est déjà celui de `__id` : toutes les lignes, une fois', async () => {
    servirTabular();
    const { lignes } = await feuilleterTabular(new TabularAdapter(), '');
    expect(ids(lignes)).toEqual(FAITS.map((f) => f.id));
  });

  it('ordre total refusé : la page est redemandée avec le tri simple, et c’est dit', async () => {
    servirTabular({ refuserOrdreCompose: true });
    const adapter = new TabularAdapter();
    const overlay = { page: 1, effectiveWhere: '', orderBy: 'nombre:desc' };
    const result = await adapter.fetchPage(paramsTabular(), overlay, signal());

    expect(result.data).toHaveLength(50);
    expect(result.caveats).toEqual(['unstable-sort']);
    expect(requetes).toEqual([
      '?nombre__sort=desc,"__id".asc&page_size=50&page=1',
      '?nombre__sort=desc&page_size=50&page=1',
    ]);
    expect(avertis('pagination serveur (server-side)')).toHaveLength(1);

    // Retenu : la page suivante part d'emblée avec le tri simple
    servirTabular({ refuserOrdreCompose: true });
    const suite = await adapter.fetchPage(paramsTabular(), { ...overlay, page: 2 }, signal());
    expect(requetes).toEqual(['?nombre__sort=desc&page_size=50&page=2']);
    expect(suite.caveats).toEqual(['unstable-sort']);
    expect(avertis('pagination serveur (server-side)')).toHaveLength(1);
    // L'URL de diagnostic suit : c'est celle qui part
    expect(decodeURIComponent(adapter.buildServerSideUrl(paramsTabular(), overlay))).not.toContain(
      '__id'
    );
  });

  it('une panne n’est pas un refus : l’erreur remonte, rien n’est retenu', async () => {
    servirTabular({ panne: 1 });
    const adapter = new TabularAdapter();
    const overlay = { page: 1, effectiveWhere: '', orderBy: 'nombre:desc' };
    await expect(adapter.fetchPage(paramsTabular(), overlay, signal())).rejects.toThrow(
      'Failed to fetch'
    );
    expect(requetes).toHaveLength(2); // ordre total, puis tri simple : les deux échouent

    servirTabular();
    const result = await adapter.fetchPage(paramsTabular(), overlay, signal());
    expect(requetes[0]).toContain('nombre__sort=desc,"__id".asc');
    expect(result.caveats).toBeUndefined();

    // Une fois l'ordre accepté, une panne remonte sans seconde requête
    servirTabular({ panne: 1 });
    await expect(adapter.fetchPage(paramsTabular(), overlay, signal())).rejects.toThrow(
      'Failed to fetch'
    );
    expect(requetes).toHaveLength(1);
  });

  it('une page sans tri qui échoue : une requête, erreur remontée telle quelle', async () => {
    servirTabular({ panne: 1 });
    await expect(
      new TabularAdapter().fetchPage(
        paramsTabular(),
        { page: 1, effectiveWhere: '', orderBy: '' },
        signal()
      )
    ).rejects.toThrow('Failed to fetch');
    expect(requetes).toHaveLength(1);
  });
});
