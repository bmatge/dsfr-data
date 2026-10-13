/**
 * Pagination serveur de l'adaptateur Grist (#1279), contre le faux Grist de
 * la vérification des données (`tests/verif-donnees/fixtures-grist.ts`), qui
 * se comporte comme le vrai — mesuré le 2026-10-13 sur grist.numerique.gouv.fr
 * (document public `pU5HXX7VJC6jdgU6oBJRxn`, table `Scrutin_c1`, 101 lignes) :
 *
 * - `GET /records` ne lit que `filter`, `sort` et `limit`. `offset` est
 *   IGNORÉ, sans erreur : `limit=5&offset=5` rend les ids 1 à 5, comme
 *   `limit=5`. Chaque page d'un tableau `server-side` montrait donc les
 *   lignes de la première.
 * - `/sql` rend `{ statement, records: [{ fields: {…} }] }` — pas de tableau
 *   `columns`, pas de lignes en tableaux. L'adaptateur lisait l'autre forme :
 *   chaque ligne d'un `group-by` délégué devenait un objet vide, et les
 *   facettes serveur n'avaient aucune valeur.
 * - `/sql` honore `LIMIT` / `OFFSET` ; sans `ORDER BY` total, rien ne garantit
 *   l'ordre des ex-æquo d'une requête à l'autre. Le faux serveur les retourne
 *   sur une page de rang impair : sans clé de départage, la page deux est
 *   fausse.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GristAdapter } from '@/adapters/grist-adapter.js';
import type { AdapterParams, ServerSideOverlay } from '@/adapters/api-adapter.js';
import { repondreGristDocument, tableGrist } from '../verif-donnees/fixtures-grist.js';

const DOC = 'https://grist.exemple.invalid/api/docs/docTest';
const BASE_URL = `${DOC}/tables/Lignes/records`;

interface Ligne {
  /** Une colonne de la table, unique — ce par quoi un test reconnaît une ligne. */
  rang: number;
  categorie: string;
  nombre: number;
}

/** 90 lignes, `nombre` sur cinq valeurs : des ex-æquo partout. `id` Grist = `rang`. */
const LIGNES: Ligne[] = Array.from({ length: 90 }, (_, i) => ({
  rang: i + 1,
  categorie: ['A', 'B', 'C', 'D'][i % 4],
  nombre: (7 * i) % 5,
}));
const TABLES = { Lignes: tableGrist(LIGNES as unknown as Record<string, unknown>[]) };

/** `nombre` décroissant, puis l'identifiant de ligne : l'ordre total attendu. */
const PAR_NOMBRE: Ligne[] = [...LIGNES].sort((a, b) => b.nombre - a.nombre || a.rang - b.rang);

function makeParams(overrides: Partial<AdapterParams> = {}): AdapterParams {
  return {
    baseUrl: BASE_URL,
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

const page = (n: number, orderBy = ''): ServerSideOverlay => ({
  page: n,
  effectiveWhere: '',
  orderBy,
});

/** Ce que le faux serveur a reçu. */
const recu: Array<{ url: string; sql?: string }> = [];

function installerFauxGrist(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      const corps = typeof init?.body === 'string' ? init.body : null;
      // La sonde de disponibilité (`GET /sql?q=SELECT 1`) n'est pas une requête de données
      if (corps || !url.pathname.endsWith('/sql')) {
        recu.push({
          url: url.href,
          ...(corps ? { sql: (JSON.parse(corps) as { sql: string }).sql } : {}),
        });
      }
      const reponse = repondreGristDocument(url, corps, DOC, TABLES);
      if (reponse === null) throw new Error(`requête non prévue par le faux Grist : ${url.href}`);
      return new Response(JSON.stringify(reponse));
    })
  );
}

const rangs = (data: unknown[]): number[] => (data as Ligne[]).map((l) => l.rang);
const signal = (): AbortSignal => new AbortController().signal;

describe('GristAdapter — pagination serveur (#1279)', () => {
  let adapter: GristAdapter;

  beforeEach(() => {
    recu.length = 0;
    adapter = new GristAdapter();
    installerFauxGrist();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('mode Records — /records ne connaît pas offset', () => {
    it('la page deux rend les lignes 21 à 40, pas celles de la première', async () => {
      const p1 = await adapter.fetchPage(makeParams(), page(1), signal());
      const p2 = await adapter.fetchPage(makeParams(), page(2), signal());
      expect(p1.data).toEqual(LIGNES.slice(0, 20));
      expect(p2.data).toEqual(LIGNES.slice(20, 40));
      expect(new URL(recu[1].url).searchParams.get('limit')).toBe('40');
      expect(new URL(recu[1].url).searchParams.has('offset')).toBe(false);
    });

    it('feuilleter tout le jeu rend chaque ligne une fois, et le total à la dernière page', async () => {
      const vues: number[] = [];
      let total: number | undefined;
      for (let n = 1; n <= 5; n++) {
        const r = await adapter.fetchPage(makeParams(), page(n), signal());
        vues.push(...rangs(r.data));
        total = r.totalCount;
        if (n < 5) expect(r.totalCount).toBeUndefined();
      }
      expect(vues).toEqual(LIGNES.map((l) => l.rang));
      expect(total).toBe(90);
    });

    it("une page au-delà de la fin est vide, et dit le total qu'elle a vu", async () => {
      const r = await adapter.fetchPage(makeParams(), page(7), signal());
      expect(r.data).toEqual([]);
      expect(r.totalCount).toBe(90);
    });

    it('un tri paginé est complété par id : ordre total, page deux juste', async () => {
      const p2 = await adapter.fetchPage(makeParams({ orderBy: 'nombre:desc' }), page(2), signal());
      expect(new URL(recu[0].url).searchParams.get('sort')).toBe('-nombre,id');
      expect(p2.data).toEqual(PAR_NOMBRE.slice(20, 40));
    });

    it("un tri qui nomme déjà id n'est pas complété", () => {
      const url = new URL(
        adapter.buildServerSideUrl(makeParams({ orderBy: 'nombre:desc, id:desc' }), page(2))
      );
      expect(url.searchParams.get('sort')).toBe('-nombre,-id');
    });

    it('le chargement complet ne change pas : une requête, ni limit ni id ajoutés', async () => {
      const r = await adapter.fetchAll(makeParams({ orderBy: 'nombre:desc' }), signal());
      expect(r.data).toHaveLength(90);
      expect(recu).toHaveLength(1);
      const url = new URL(recu[0].url);
      expect(url.searchParams.get('sort')).toBe('-nombre');
      expect(url.searchParams.has('limit')).toBe(false);
    });
  });

  describe("mode SQL — la réponse réelle, et un ordre total d'une page à l'autre", () => {
    // Un opérateur que `/records` ne sait pas filtrer : la requête part en SQL
    const avance = { where: 'nombre:gte:0' };

    it('lit les lignes `{ fields }` que rend /sql (elles devenaient des objets vides)', async () => {
      const r = await adapter.fetchAll(
        makeParams({ groupBy: 'categorie', aggregate: 'nombre:sum:total' }),
        signal()
      );
      const attendu = ['A', 'B', 'C', 'D'].map((categorie) => ({
        categorie,
        total: LIGNES.filter((l) => l.categorie === categorie).reduce((s, l) => s + l.nombre, 0),
      }));
      expect(
        [...(r.data as Array<{ categorie: string; total: number }>)].sort((a, b) =>
          a.categorie < b.categorie ? -1 : 1
        )
      ).toEqual(attendu);
    });

    it('lit les facettes par nom de colonne (elles restaient sans valeur)', async () => {
      const facettes = await adapter.fetchFacets(makeParams(), ['categorie'], '');
      expect(facettes).toHaveLength(1);
      expect([...facettes[0].values].sort((a, b) => (a.value < b.value ? -1 : 1))).toEqual([
        { value: 'A', count: 23 },
        { value: 'B', count: 23 },
        { value: 'C', count: 22 },
        { value: 'D', count: 22 },
      ]);
    });

    it('sans tri, une page part sur ORDER BY id : la page deux est juste', async () => {
      const p2 = await adapter.fetchPage(makeParams(avance), page(2), signal());
      expect(recu[0].sql).toContain('ORDER BY "id" ASC LIMIT 20 OFFSET 20');
      expect(rangs(p2.data)).toEqual(LIGNES.slice(20, 40).map((l) => l.rang));
    });

    it('un tri sur une clé non unique est départagé par id, sur toutes les pages', async () => {
      const vues: number[] = [];
      for (let n = 1; n <= 5; n++) {
        const r = await adapter.fetchPage(
          makeParams({ ...avance, orderBy: 'nombre:desc' }),
          page(n),
          signal()
        );
        vues.push(...rangs(r.data));
      }
      expect(recu[0].sql).toContain('ORDER BY "nombre" DESC, "id" ASC LIMIT 20');
      expect(vues).toEqual(PAR_NOMBRE.map((l) => l.rang));
    });

    it("le tri de l'afficheur (overlay) est départagé de même", async () => {
      await adapter.fetchPage(makeParams(avance), page(2, 'categorie:asc'), signal());
      expect(recu[0].sql).toContain('ORDER BY "categorie" ASC, "id" ASC LIMIT 20 OFFSET 20');
    });

    it('des groupes paginés sont ordonnés par leurs clés', async () => {
      const params = makeParams({ groupBy: 'categorie, nombre', pageSize: 8 });
      const vues: string[] = [];
      for (let n = 1; n <= 3; n++) {
        const r = await adapter.fetchPage(params, page(n), signal());
        vues.push(
          ...(r.data as Array<{ categorie: string; nombre: number }>).map(
            (g) => `${g.categorie}|${g.nombre}`
          )
        );
      }
      expect(recu[0].sql).toContain('ORDER BY "categorie" ASC, "nombre" ASC LIMIT 8');
      expect(vues).toHaveLength(20);
      expect(new Set(vues).size).toBe(20);
      expect(vues).toEqual([...vues].sort());
    });

    it('des groupes triés sur une de leurs clés sont départagés par les autres', async () => {
      await adapter.fetchPage(
        makeParams({ groupBy: 'categorie, nombre', orderBy: 'nombre:desc', pageSize: 8 }),
        page(2),
        signal()
      );
      expect(recu[0].sql).toContain('ORDER BY "nombre" DESC, "categorie" ASC LIMIT 8 OFFSET 8');
    });

    it("le total d'une page pleine est inconnu, celui de la dernière est le vrai", async () => {
      const p1 = await adapter.fetchPage(makeParams(avance), page(1), signal());
      const p5 = await adapter.fetchPage(makeParams(avance), page(5), signal());
      expect(p1.data).toHaveLength(20);
      expect(p1.totalCount).toBeUndefined();
      expect(p5.data).toHaveLength(10);
      expect(p5.totalCount).toBe(90);
    });

    it('le chargement complet ne change pas : ni ORDER BY ni LIMIT ajoutés', async () => {
      const r = await adapter.fetchAll(makeParams(avance), signal());
      expect(r.data).toHaveLength(90);
      expect(r.totalCount).toBe(90);
      expect(recu[0].sql).toBe('SELECT * FROM "Lignes" WHERE "nombre" >= ?');
    });

    it("l'ancienne forme de réponse (lignes en tableaux, `columns`) reste lue", () => {
      expect(
        adapter._sqlResultToObjects({ columns: ['region', 'total'], records: [['Bretagne', 3]] })
      ).toEqual([{ region: 'Bretagne', total: 3 }]);
    });
  });
});
