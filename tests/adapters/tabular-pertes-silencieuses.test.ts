import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * #1202, #1233 — ce que l'API Tabular perd sans le dire (PG-033, PG-034 du banc).
 *
 * PG-033 : pagination par offset sur un tri non total → doublons et absents.
 * - tout le jeu est voulu et tient sous le plafond : l'adaptateur relit sans
 *   `__sort` et trie lui-même, lignes brutes (#1202) comme groupes (#1233) ;
 * - `limit` ou plafond `max-records` : il demande un ordre TOTAL au serveur,
 *   clé de départage dans la valeur du tri (#1233) ;
 * - ordre total refusé par l'API : tri serveur gardé, et dit (`caveats`).
 *
 * PG-034 : `__in` écarte une valeur NUE à parenthèse avec un HTTP 200, et lit
 * la même valeur entre guillemets → la clause part citée, en chargement complet
 * comme en pagination serveur (#1233, arbitrage du 2026-10-04). Si l'API refuse
 * cette forme : en chargement complet l'adaptateur calcule la clause (le chemin
 * de la 0.45.0), en pagination serveur elle repart nue, et c'est dit.
 *
 * Le serveur est le faux serveur de la recette (`repondreTabular`), qui ment
 * comme l'API : ex-æquo ordonnés autrement d'une page à l'autre, un seul
 * `__sort` lu, `__in` qui écarte une parenthèse nue et lit une valeur citée.
 */

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

import { TabularAdapter } from '@/adapters/tabular-adapter.js';
import type { AdapterParams } from '@/adapters/api-adapter.js';
import { lireListeTabular, repondreTabular } from '../builder-e2e/api-fixtures.js';

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

/** Le jeu `delegation-tabular-ex-aequo` : 450 lignes, trois pages, des ex-æquo partout. */
const JEU: Fait[] = Array.from({ length: 450 }, (_, i) => ({
  id: i + 1,
  categorie: CATEGORIES[i % 4],
  nombre: (i * 7) % 5,
}));

function params(overrides: Partial<AdapterParams> = {}): AdapterParams {
  return {
    baseUrl: 'https://tabular-api.data.gouv.fr',
    datasetId: '',
    resource: 'resource-456',
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

/** Requêtes parties, query string décodée. */
let appels: string[] = [];

/**
 * Branche `fetch` sur le faux serveur.
 * - `refuserOrdreCompose` : 400 sur une valeur de tri composée ;
 * - `refuserGuillemets` : une liste `in` / `notin` citée est refusée — `400`,
 *   ou `reseau` : l'erreur opaque que voit le navigateur, l'API répondant ses
 *   400 sans en-tête CORS ;
 * - `panne` : toute requête échoue (réseau), ou seulement à partir de la N-ième.
 */
function servir(
  options: {
    refuserOrdreCompose?: boolean;
    refuserGuillemets?: '400' | 'reseau';
    panne?: number;
  } = {}
): void {
  mockFetch.mockImplementation(async (cible: unknown) => {
    const url = new URL(String(cible));
    const recherche = decodeURIComponent(url.search.replace(/\+/g, ' '));
    appels.push(recherche);
    if (options.panne !== undefined && appels.length >= options.panne) {
      throw new TypeError('Failed to fetch');
    }
    if (options.refuserOrdreCompose && /__sort=(asc|desc),/.test(recherche)) {
      return { ok: false, status: 400, statusText: 'Bad Request' };
    }
    if (options.refuserGuillemets && /__(in|notin)=[^&]*"/.test(recherche)) {
      if (options.refuserGuillemets === 'reseau') throw new TypeError('Failed to fetch');
      return { ok: false, status: 400, statusText: 'Bad Request' };
    }
    const corps = repondreTabular(url, JEU as unknown as Array<Record<string, unknown>>);
    return { ok: true, json: () => Promise.resolve(corps) };
  });
}

const signal = () => new AbortController().signal;
const ids = (lignes: unknown[]) => (lignes as Fait[]).map((l) => l.id);
const avecTri = () => appels.filter((a) => a.includes('__sort'));

let warnSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  mockFetch.mockReset();
  appels = [];
  servir();
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => warnSpy.mockRestore());

const avertis = (fragment: string) =>
  warnSpy.mock.calls.filter((c: unknown[]) => String(c[0]).includes(fragment));

describe('PG-033 — tri d’un chargement paginé, lignes brutes', () => {
  it('le faux serveur perd bien des lignes sur un tri paginé non total (témoin)', () => {
    const lues: number[] = [];
    for (const page of [1, 2, 3]) {
      const url = new URL(
        `https://tabular-api.data.gouv.fr/api/resources/r/data/?nombre__sort=desc&page_size=200&page=${page}`
      );
      lues.push(
        ...ids(repondreTabular(url, JEU as unknown as Array<Record<string, unknown>>).data)
      );
    }
    expect(lues).toHaveLength(450);
    expect(new Set(lues).size).toBeLessThan(450);
  });

  it('jeu sous le plafond : relu sans __sort, trié ici, chaque ligne une fois', async () => {
    const result = await new TabularAdapter().fetchAll(
      params({ orderBy: 'nombre:desc' }),
      signal()
    );

    expect(appels[0]).toContain('nombre__sort=desc');
    expect(appels.slice(1).some((a) => a.includes('__sort'))).toBe(false);
    expect(appels).toHaveLength(4); // la sonde, puis trois pages
    expect(result.data).toHaveLength(450);
    expect(new Set(ids(result.data)).size).toBe(450);
    const nombres = (result.data as Fait[]).map((r) => r.nombre);
    expect(nombres).toEqual([...nombres].sort((a, b) => b - a));
    expect(result.caveats).toBeUndefined();
  });

  it('une seule page : le serveur trie, une requête, sans clé de départage', async () => {
    await new TabularAdapter().fetchAll(
      params({ orderBy: 'nombre:desc', where: 'categorie:eq:Homicides' }),
      signal()
    );
    expect(appels).toHaveLength(1);
    expect(appels[0]).toContain('nombre__sort=desc&');
  });

  it('un limit que la première page couvre : une requête, aucun avertissement', async () => {
    const result = await new TabularAdapter().fetchAll(
      params({ orderBy: 'nombre:desc', limit: 50 }),
      signal()
    );
    expect(appels).toHaveLength(1);
    expect(result.data).toHaveLength(50);
    expect(avertis('PG-033')).toHaveLength(0);
    expect(result.caveats).toBeUndefined();
  });

  it('tronqué par max-records : ordre total demandé au serveur, les 400 premières lignes, chacune une fois', async () => {
    const result = await new TabularAdapter().fetchAll(
      params({ orderBy: 'nombre:desc', maxRecords: 400 }),
      signal()
    );

    const attendu = [...JEU].sort((a, b) => b.nombre - a.nombre || a.id - b.id).slice(0, 400);
    expect(ids(result.data)).toEqual(attendu.map((l) => l.id));
    // la sonde (tri simple), puis deux pages portant l'ordre total
    expect(appels).toHaveLength(3);
    expect(appels[0]).toContain('nombre__sort=desc&');
    expect(appels[1]).toContain('nombre__sort=desc,"__id".asc');
    expect(appels[2]).toContain('nombre__sort=desc,"__id".asc');
    expect(result.truncated).toBe(true);
    expect(result.caveats).toBeUndefined();
    expect(avertis('PG-033')).toHaveLength(0);
  });

  it('limit sur plusieurs pages : ordre total, et les clés suivantes du tri y entrent', async () => {
    const result = await new TabularAdapter().fetchAll(
      params({ orderBy: 'nombre:desc, categorie:asc', limit: 300 }),
      signal()
    );
    const attendu = [...JEU]
      .sort(
        (a, b) => b.nombre - a.nombre || a.categorie.localeCompare(b.categorie, 'fr') || a.id - b.id
      )
      .slice(0, 300);
    expect(ids(result.data)).toEqual(attendu.map((l) => l.id));
    expect(appels[1]).toContain('nombre__sort=desc,"categorie".asc,"__id".asc');
  });

  it('ordre total refusé par l’API : tri serveur gardé, dit en console et en réserve, jamais redemandé', async () => {
    servir({ refuserOrdreCompose: true });
    const adapter = new TabularAdapter();
    const result = await adapter.fetchAll(
      params({ orderBy: 'nombre:desc', maxRecords: 400 }),
      signal()
    );

    expect(result.data).toHaveLength(400);
    expect(result.caveats).toEqual(['unstable-sort']);
    expect(avertis('PG-033')).toHaveLength(1);
    // sonde, ordre total refusé, puis la deuxième page au tri simple
    expect(appels.filter((a) => /__sort=desc,/.test(a))).toHaveLength(1);
    expect(appels).toHaveLength(3);

    appels = [];
    const again = await adapter.fetchAll(
      params({ orderBy: 'nombre:desc', maxRecords: 400 }),
      signal()
    );
    expect(appels.filter((a) => /__sort=desc,/.test(a))).toHaveLength(0);
    expect(again.caveats).toEqual(['unstable-sort']);
    expect(avertis('PG-033')).toHaveLength(1);
  });

  it('un tri sur __id est déjà total : pagination ordinaire', async () => {
    const result = await new TabularAdapter().fetchAll(params({ orderBy: '__id:asc' }), signal());
    expect(appels).toHaveLength(3);
    expect(avecTri()).toHaveLength(3);
    expect(ids(result.data)).toEqual(JEU.map((l) => l.id));
  });
});

describe('PG-033 — tri d’un chargement paginé, groupes (#1233)', () => {
  const GROUPE = { groupBy: 'categorie, id', aggregate: 'nombre:sum' };

  it('le faux serveur perd bien des groupes sur un tri paginé non total (témoin)', () => {
    const lus: number[] = [];
    for (const page of [1, 2, 3]) {
      const url = new URL(
        `https://tabular-api.data.gouv.fr/api/resources/r/data/?categorie__sort=asc&page_size=200&page=${page}&categorie__groupby&id__groupby&nombre__sum`
      );
      lus.push(...ids(repondreTabular(url, JEU as unknown as Array<Record<string, unknown>>).data));
    }
    expect(lus).toHaveLength(450);
    expect(new Set(lus).size).toBeLessThan(450);
  });

  it('plus d’une page de groupes : relus sans __sort, triés ici, chaque groupe une fois', async () => {
    const result = await new TabularAdapter().fetchAll(
      params({ ...GROUPE, orderBy: 'categorie:asc' }),
      signal()
    );

    expect(appels[0]).toContain('categorie__sort=asc');
    expect(appels.slice(1).some((a) => a.includes('__sort'))).toBe(false);
    expect(appels).toHaveLength(4);
    expect(result.data).toHaveLength(450);
    expect(new Set(ids(result.data)).size).toBe(450);
    const categories = (result.data as Fait[]).map((r) => r.categorie);
    expect(categories).toEqual([...categories].sort((a, b) => a.localeCompare(b)));
    expect(result.needsClientProcessing).toBe(false);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('regroupement sur la seule colonne triée : ordre déjà total, tri serveur gardé', async () => {
    const result = await new TabularAdapter().fetchAll(
      params({ groupBy: 'id', aggregate: 'nombre:sum', orderBy: 'id:desc' }),
      signal()
    );
    expect(appels).toHaveLength(3);
    expect(avecTri()).toHaveLength(3);
    expect(appels.every((a) => a.includes('id__sort=desc&'))).toBe(true);
    expect(ids(result.data)).toEqual(JEU.map((l) => l.id).reverse());
  });

  it('une seule page de groupes : une requête, tri serveur', async () => {
    await new TabularAdapter().fetchAll(
      params({ groupBy: 'categorie, nombre', aggregate: 'id:count', orderBy: 'categorie:asc' }),
      signal()
    );
    expect(appels).toHaveLength(1);
    expect(appels[0]).toContain('categorie__sort=asc&');
  });

  it('limit sur plusieurs pages de groupes : ordre total par les colonnes de regroupement', async () => {
    const result = await new TabularAdapter().fetchAll(
      params({ ...GROUPE, orderBy: 'categorie:asc', limit: 300 }),
      signal()
    );
    const attendu = [...JEU]
      .sort((a, b) => a.categorie.localeCompare(b.categorie, 'fr') || a.id - b.id)
      .slice(0, 300);
    expect(ids(result.data)).toEqual(attendu.map((l) => l.id));
    expect(appels[1]).toContain('categorie__sort=asc,"id".asc');
    expect(appels).toHaveLength(3);
  });

  it('groupes tronqués par max-records : ordre total, les premiers groupes du tri', async () => {
    const result = await new TabularAdapter().fetchAll(
      params({ ...GROUPE, orderBy: 'categorie:desc', maxRecords: 400 }),
      signal()
    );
    const attendu = [...JEU]
      .sort((a, b) => b.categorie.localeCompare(a.categorie, 'fr') || a.id - b.id)
      .slice(0, 400);
    expect(ids(result.data)).toEqual(attendu.map((l) => l.id));
    expect(result.truncated).toBe(true);
    expect(appels.at(-1)).toContain('categorie__sort=desc,"id".asc');
  });

  it('ordre total refusé : les groupes sont relus sans tri et triés ici', async () => {
    servir({ refuserOrdreCompose: true });
    const result = await new TabularAdapter().fetchAll(
      params({ ...GROUPE, orderBy: 'categorie:asc', limit: 300 }),
      signal()
    );
    const attendu = [...JEU]
      .sort((a, b) => a.categorie.localeCompare(b.categorie) || a.id - b.id)
      .slice(0, 300);
    expect(new Set(ids(result.data))).toEqual(new Set(attendu.map((l) => l.id)));
    expect(result.caveats).toBeUndefined();
  });
});

describe('PG-034 — in/notin à parenthèse ou à virgule : délégué entre guillemets (#1233)', () => {
  const adapter = new TabularAdapter();
  const IN = 'categorie:in:Homicides|Usage de stupéfiants (AFD)';
  const IN_CITE = 'categorie__in=Homicides,"Usage de stupéfiants (AFD)"';
  const gardees = JEU.filter(
    (l) => l.categorie === 'Homicides' || l.categorie === 'Usage de stupéfiants (AFD)'
  );
  const total = (cle: string, valeur: string, jeu: unknown[] = JEU) => {
    const url = new URL('https://tabular-api.data.gouv.fr/api/resources/r/data/?page_size=1');
    url.searchParams.set(cle, valeur);
    return repondreTabular(url, jeu as Array<Record<string, unknown>>).meta.total;
  };

  it('est jugé délégable, comme une liste ordinaire', () => {
    expect(adapter.supportsServerWhere(IN)).toBe(true);
    expect(adapter.supportsServerWhere('cat:notin:Vols (avec violence)')).toBe(true);
    expect(adapter.supportsServerWhere('cat:in:A%2CB|C')).toBe(true);
    expect(adapter.supportsServerWhere('cat:in:Homicides|Cambriolages')).toBe(true);
    expect(adapter.supportsServerWhere('cat:eq:Usage de stupéfiants (AFD)')).toBe(true);
  });

  describe('le faux serveur lit la liste comme l’API (témoins des mesures du 2026-10-04)', () => {
    it('valeur nue à parenthèse : écartée sans erreur', () => {
      expect(total('categorie__in', 'Homicides,Usage de stupéfiants (AFD)')).toBe(113);
      expect(total('categorie__in', 'Usage de stupéfiants (AFD)')).toBe(0);
      expect(total('categorie__notin', 'Usage de stupéfiants (AFD)')).toBe(450);
    });

    it('valeur entre guillemets : lue, seule ou mêlée à des valeurs nues', () => {
      expect(gardees).toHaveLength(226);
      expect(total('categorie__in', 'Homicides,"Usage de stupéfiants (AFD)"')).toBe(226);
      expect(total('categorie__in', '"Homicides","Usage de stupéfiants (AFD)"')).toBe(226);
      expect(total('categorie__notin', '"Usage de stupéfiants (AFD)"')).toBe(450 - 113);
    });

    it('virgule : sépare des valeurs nues, appartient à une valeur citée', () => {
      const jeu = [{ pcs: 'Elève, étudiant' }, { pcs: 'Technicien' }, { pcs: 'Elève' }];
      expect(total('pcs__in', '"Elève, étudiant",Technicien', jeu)).toBe(2);
      expect(total('pcs__in', 'Elève, étudiant,Technicien', jeu)).toBe(2); // « Elève » et « Technicien »
      expect(lireListeTabular('Elève, étudiant')).toEqual(['Elève', ' étudiant']);
      // Une liste citée d'un seul tenant est UNE valeur
      expect(total('categorie__in', '"Homicides,Usage de stupéfiants (AFD)"')).toBe(0);
    });

    it('barre oblique inverse : échappe le caractère suivant dans une valeur citée', () => {
      expect(total('categorie__in', '"Homi\\cides"')).toBe(113);
      expect(lireListeTabular('"dit \\"oui\\"","a\\\\b"')).toEqual(['dit "oui"', 'a\\b']);
    });

    it('guillemet jamais refermé : zéro ligne, sans erreur ; valeur vide : rien de plus', () => {
      expect(total('categorie__in', '"Usage de stupéfiants (AFD)')).toBe(0);
      expect(total('categorie__in', 'Homicides,""')).toBe(113);
      expect(total('categorie__in', '')).toBe(0);
    });
  });

  describe('chargement complet', () => {
    it('la clause part entre guillemets : seules les lignes gardées sont lues', async () => {
      const result = await new TabularAdapter().fetchAll(params({ where: IN }), signal());

      expect(appels).toHaveLength(2); // 226 lignes, deux pages — au lieu des trois du jeu entier
      expect(appels.every((a) => a.includes(IN_CITE))).toBe(true);
      expect(ids(result.data)).toEqual(gardees.map((l) => l.id));
      expect(result.totalCount).toBe(226);
      expect(result.truncated).toBeUndefined();
      expect(result.caveats).toBeUndefined();
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('seules les valeurs qui en ont besoin sont citées ; guillemet et barre oblique échappés', () => {
      const url = new TabularAdapter().buildUrl(
        params({ where: 'c:in:A%2CB|simple|d\'apostrophe|dit "oui"|a\\b|(x)' })
      );
      expect(decodeURIComponent(new URL(url).search.replace(/\+/g, ' '))).toContain(
        'c__in="A,B",simple,d\'apostrophe,"dit \\"oui\\"",a\\b,"(x)"'
      );
    });

    it('notin : les valeurs listées sont retirées par le serveur', async () => {
      const result = await new TabularAdapter().fetchAll(
        params({ where: 'categorie:notin:Vols (avec violence)|Cambriolages' }),
        signal()
      );
      expect(
        appels.every((a) => a.includes('categorie__notin="Vols (avec violence)",Cambriolages'))
      ).toBe(true);
      expect(ids(result.data)).toEqual(gardees.map((l) => l.id));
    });

    it('le group-by posé à côté reste délégué, dans la même requête', async () => {
      const result = await new TabularAdapter().fetchAll(
        params({ where: IN, groupBy: 'categorie', aggregate: 'nombre:sum' }),
        signal()
      );
      expect(appels).toHaveLength(1);
      expect(appels[0]).toContain('categorie__groupby');
      expect(appels[0]).toContain(IN_CITE);
      expect(result.needsClientProcessing).toBe(false);
      const somme = (cat: string) =>
        gardees.filter((l) => l.categorie === cat).reduce((a, l) => a + l.nombre, 0);
      expect(
        Object.fromEntries(
          (result.data as Array<Record<string, unknown>>).map((g) => [g.categorie, g.nombre__sum])
        )
      ).toEqual({
        Homicides: somme('Homicides'),
        'Usage de stupéfiants (AFD)': somme('Usage de stupéfiants (AFD)'),
      });
    });

    it('une liste sans parenthèse part au serveur comme avant, sans guillemets', async () => {
      const result = await new TabularAdapter().fetchAll(
        params({ where: 'categorie:in:Homicides|Cambriolages' }),
        signal()
      );
      expect(appels).toHaveLength(2);
      expect(appels.every((a) => a.includes('categorie__in=Homicides,Cambriolages'))).toBe(true);
      expect(result.data).toHaveLength(225);
    });
  });

  describe('repli : l’API refuse la liste entre guillemets', () => {
    for (const forme of ['400', 'reseau'] as const) {
      it(`refus ${forme === '400' ? 'HTTP 400' : 'vu comme une erreur réseau (pas de CORS)'} : clause calculée ici, dite, retenue`, async () => {
        servir({ refuserGuillemets: forme });
        const local = new TabularAdapter();
        const result = await local.fetchAll(params({ where: IN }), signal());

        // la requête citée, refusée, puis le jeu entier sans la clause
        expect(appels[0]).toContain(IN_CITE);
        expect(appels.slice(1)).toHaveLength(3);
        expect(appels.slice(1).some((a) => a.includes('__in'))).toBe(false);
        expect(ids(result.data)).toEqual(gardees.map((l) => l.id));
        expect(result.totalCount).toBe(226);
        expect(result.caveats).toEqual(['in-quoted-refused']);
        expect(avertis('a refusé la clause')).toHaveLength(1);

        // retenu : la forme citée n'est plus redemandée
        appels = [];
        const again = await local.fetchAll(params({ where: IN }), signal());
        expect(appels.some((a) => a.includes('__in'))).toBe(false);
        expect(ids(again.data)).toEqual(gardees.map((l) => l.id));
        expect(again.caveats).toEqual(['in-quoted-refused']);
        expect(avertis('a refusé la clause')).toHaveLength(1);
        // … et l'adaptateur ne la juge pas moins traduisible : c'est lui qui replie
        expect(local.supportsServerWhere(IN)).toBe(true);
      });
    }

    it('les autres clauses restent déléguées', async () => {
      servir({ refuserGuillemets: '400' });
      const result = await new TabularAdapter().fetchAll(
        params({ where: `nombre:gte:3, ${IN}` }),
        signal()
      );
      expect(appels.every((a) => a.includes('nombre__greater=3'))).toBe(true);
      expect(ids(result.data)).toEqual(gardees.filter((l) => l.nombre >= 3).map((l) => l.id));
    });

    it('order-by et limit passent APRÈS le filtre', async () => {
      servir({ refuserGuillemets: '400' });
      const result = await new TabularAdapter().fetchAll(
        params({ where: IN, orderBy: 'nombre:desc', limit: 10 }),
        signal()
      );
      const attendu = [...gardees].sort((a, b) => b.nombre - a.nombre || a.id - b.id).slice(0, 10);
      expect(ids(result.data)).toEqual(attendu.map((l) => l.id));
      expect(result.totalCount).toBe(226);
      expect(appels.slice(1).some((a) => a.includes('__sort'))).toBe(false);
    });

    it('avec un group-by : lignes brutes filtrées, regroupement rendu à l’aval, et dit', async () => {
      servir({ refuserGuillemets: '400' });
      const result = await new TabularAdapter().fetchAll(
        params({ where: IN, groupBy: 'categorie', aggregate: 'nombre:sum' }),
        signal()
      );
      expect(appels.slice(1).some((a) => a.includes('__groupby') || a.includes('__in'))).toBe(
        false
      );
      expect(ids(result.data)).toEqual(gardees.map((l) => l.id));
      expect(result.needsClientProcessing).toBe(true);
      expect(avertis('group-by/aggregate non délégables')).toHaveLength(1);
    });

    it('un select qui ne nomme pas la colonne filtrée : elle est lue, puis retirée', async () => {
      servir({ refuserGuillemets: '400' });
      const result = await new TabularAdapter().fetchAll(
        params({ where: IN, select: 'id, nombre' }),
        signal()
      );
      expect(appels[1]).toContain('columns=id,nombre,categorie');
      expect(ids(result.data)).toEqual(gardees.map((l) => l.id));
      expect(Object.keys((result.data as Fait[])[0])).toEqual(['id', 'nombre']);
    });

    it('plafond max-records atteint : filtre partiel, tronqué, et dit', async () => {
      servir({ refuserGuillemets: '400' });
      const result = await new TabularAdapter().fetchAll(
        params({ where: IN, maxRecords: 200 }),
        signal()
      );
      expect(result.truncated).toBe(true);
      expect(result.totalCount).toBeUndefined();
      expect(ids(result.data)).toEqual(gardees.filter((l) => l.id <= 200).map((l) => l.id));
      expect(avertis('le plafond max-records a coupé')).toHaveLength(1);
    });

    it('une panne n’est pas un refus : l’erreur remonte, rien n’est retenu', async () => {
      servir({ panne: 1 });
      const local = new TabularAdapter();
      await expect(local.fetchAll(params({ where: IN }), signal())).rejects.toThrow(
        'Failed to fetch'
      );

      appels = [];
      servir();
      const result = await local.fetchAll(params({ where: IN }), signal());
      expect(appels[0]).toContain(IN_CITE);
      expect(result.caveats).toBeUndefined();
    });

    it('une panne APRÈS une première page lue n’est pas un refus non plus', async () => {
      servir({ panne: 2 });
      const local = new TabularAdapter();
      await expect(local.fetchAll(params({ where: IN }), signal())).rejects.toThrow(
        'Failed to fetch'
      );
      // la forme citée a été lue page 1 : pas de second chargement « de repli »
      expect(appels).toHaveLength(2);
      expect(appels.every((a) => a.includes(IN_CITE))).toBe(true);
    });

    it('une annulation n’est pas un refus', async () => {
      const controleur = new AbortController();
      mockFetch.mockImplementation(async () => {
        controleur.abort();
        const err = new Error('The operation was aborted.');
        err.name = 'AbortError';
        throw err;
      });
      const local = new TabularAdapter();
      await expect(local.fetchAll(params({ where: IN }), controleur.signal)).rejects.toThrow(
        'aborted'
      );
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('pagination serveur', () => {
    const overlay = { page: 1, effectiveWhere: IN, orderBy: '' };

    it('la clause part entre guillemets : page juste, total juste, rien à dire', async () => {
      const result = await new TabularAdapter().fetchPage(
        params({ where: IN, pageSize: 20 }),
        overlay,
        signal()
      );
      expect(appels).toHaveLength(1);
      expect(appels[0]).toContain(IN_CITE);
      expect(result.totalCount).toBe(226);
      expect(ids(result.data)).toEqual(gardees.slice(0, 20).map((l) => l.id));
      expect(result.caveats).toBeUndefined();
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('forme refusée : la page est redemandée nue, incomplète, et c’est dit', async () => {
      servir({ refuserGuillemets: 'reseau' });
      const local = new TabularAdapter();
      const result = await local.fetchPage(params({ where: IN, pageSize: 20 }), overlay, signal());

      expect(appels[0]).toContain(IN_CITE);
      expect(appels[1]).toContain('categorie__in=Homicides,Usage de stupéfiants (AFD)');
      expect(result.totalCount).toBe(113); // la valeur à parenthèse est écartée par l'API
      expect(result.caveats).toEqual(['in-quoted-refused', 'in-values-dropped']);
      expect(avertis('PG-034')).toHaveLength(1);

      // retenu : la page suivante part nue d'emblée, même réserve, un seul avertissement
      appels = [];
      const suite = await local.fetchPage(
        params({ where: IN, pageSize: 20 }),
        { ...overlay, page: 2 },
        signal()
      );
      expect(appels).toHaveLength(1);
      expect(appels[0]).not.toContain('"');
      expect(suite.caveats).toEqual(['in-quoted-refused', 'in-values-dropped']);
      expect(avertis('PG-034')).toHaveLength(1);
    });

    it('une panne n’est pas un refus : l’erreur remonte, rien n’est retenu', async () => {
      servir({ panne: 1 });
      const local = new TabularAdapter();
      await expect(
        local.fetchPage(params({ where: IN, pageSize: 20 }), overlay, signal())
      ).rejects.toThrow('Failed to fetch');
      expect(appels).toHaveLength(2); // citée, puis nue : les deux échouent

      appels = [];
      servir();
      const result = await local.fetchPage(params({ where: IN, pageSize: 20 }), overlay, signal());
      expect(appels[0]).toContain(IN_CITE);
      expect(result.caveats).toBeUndefined();
    });

    it('une page sans liste à citer ne change pas : une requête, erreur remontée telle quelle', async () => {
      servir({ panne: 1 });
      await expect(
        new TabularAdapter().fetchPage(
          params({ pageSize: 20 }),
          { page: 1, effectiveWhere: 'categorie:in:Homicides|Cambriolages', orderBy: '' },
          signal()
        )
      ).rejects.toThrow('Failed to fetch');
      expect(appels).toHaveLength(1);
    });
  });
});
