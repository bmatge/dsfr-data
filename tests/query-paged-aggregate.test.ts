import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * #1242 — un regroupement que `dsfr-data-query` garde côté client ne porte que
 * sur les lignes REÇUES, et une source qui pagine au serveur n'en livre qu'une
 * page. Mesuré avant correction : part de la France 15,03 % au lieu de
 * 14,62 %, somme 39 220 000 au lieu de 127 684 000, sans un mot.
 *
 * Arbitrage du 2026-10-04, conditionnel :
 * - la source porte `server-side` (mode adaptateur) : le montage se corrige par
 *   des attributs → ERREUR DE CONFIGURATION, aucun chiffre émis ;
 * - mode URL `paginate` : aucun attribut ne charge le jeu entier → statu quo,
 *   avertissement en console et réserve `aggregate-on-page` au Diagnostic.
 *
 * Ne sont PAS concernées : une requête qui délègue réellement son
 * regroupement, une requête qui ne regroupe pas (liste paginée).
 */

import { DsfrDataQuery } from '@/components/dsfr-data-query.js';
import { DsfrDataNormalize } from '@/components/dsfr-data-normalize.js';
import {
  clearDataCache,
  clearDataMeta,
  dispatchDataLoaded,
  getDataMeta,
  setDataMeta,
} from '@/utils/data-bridge.js';

/** Une page de 3 lignes sur un jeu qui en compte 9. */
const PAGE = [
  { region: 'IDF', population: 12000 },
  { region: 'IDF', population: 3000 },
  { region: 'PACA', population: 6000 },
];

const IDS = ['pa-src', 'pa-norm', 'pa-q'];
const MARQUEUR = 'data-dsfr-config-error';

type Mode = 'server-side' | 'paginate' | 'tiers';

/** Une source factice : adaptateur délégable, et le mode de pagination voulu. */
function source(mode: Mode, capacites: Record<string, unknown> = {}): HTMLElement {
  const el = document.createElement('div');
  el.id = 'pa-src';
  const vue = el as unknown as Record<string, unknown>;
  vue.getAdapter = () => ({
    type: 'mock',
    capabilities: {
      serverGroupBy: true,
      serverOrderBy: true,
      whereFormat: 'colon',
      ...capacites,
    },
  });
  if (mode === 'server-side') vue.serverSide = true;
  if (mode === 'paginate') vue.paginate = true;
  document.body.appendChild(el);
  return el;
}

async function requete(attrs: Partial<DsfrDataQuery>, amont = 'pa-src'): Promise<DsfrDataQuery> {
  const q = new DsfrDataQuery();
  q.id = 'pa-q';
  q.source = amont;
  Object.assign(q, attrs);
  document.body.appendChild(q);
  await q.updateComplete;
  return q;
}

/** La source émet une page, meta posée avant le dispatch comme en vrai. */
function emettrePage(extra: Record<string, unknown> = {}, lignes: unknown[] = PAGE): void {
  setDataMeta('pa-src', { page: 1, pageSize: 3, total: 9, serverSide: true, ...extra });
  dispatchDataLoaded('pa-src', lignes);
}

let errorSpy: ReturnType<typeof vi.spyOn>;
let warnSpy: ReturnType<typeof vi.spyOn>;
const dits = (spy: ReturnType<typeof vi.spyOn>, fragment: string) =>
  spy.mock.calls.filter((c: unknown[]) => String(c[0]).includes(fragment));

beforeEach(() => {
  for (const id of IDS) {
    clearDataCache(id);
    clearDataMeta(id);
  }
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  for (const id of IDS) document.getElementById(id)?.remove();
  errorSpy.mockRestore();
  warnSpy.mockRestore();
});

describe('#1242 — source en server-side : erreur de configuration', () => {
  it('part (share) : aucun chiffre, le marqueur nomme les attributs et la correction', async () => {
    source('server-side');
    const q = await requete({
      groupBy: 'region',
      aggregate: 'population:sum, population__sum:share_percent:part',
    });
    emettrePage();

    const message = q.getAttribute(MARQUEUR) ?? '';
    expect(message).toContain('group-by="region"');
    expect(message).toContain('aggregate="population:sum, population__sum:share_percent:part"');
    expect(message).toContain("une part ou un cumul n'est jamais délégué");
    expect(message).toContain('dsfr-data-source "pa-src" est en pagination serveur (server-side)');
    expect(message).toContain('Retirez server-side de dsfr-data-source "pa-src"');
    expect(message).toContain('max-records');
    expect(q.getError()?.message).toBe(message);
    expect(q.getData()).toEqual([]);
    expect(getDataMeta('pa-q')).toBeUndefined();
  });

  it.each([
    [
      'agrégat global',
      { aggregate: 'population:sum' },
      "un agrégat sans group-by n'est jamais délégué",
    ],
    [
      'cumul',
      {
        groupBy: 'region',
        aggregate: 'population:sum, population__sum:running_sum',
        orderBy: 'region:asc',
      },
      "une part ou un cumul n'est jamais délégué",
    ],
    [
      'explode',
      { groupBy: 'region', explode: 'region', aggregate: 'population:sum' },
      "explode n'est jamais délégué",
    ],
  ])('%s : même refus', async (_nom, attrs, cause) => {
    source('server-side');
    const q = await requete(attrs as Partial<DsfrDataQuery>);
    emettrePage();
    expect(q.getAttribute(MARQUEUR)).toContain(cause);
    expect(q.getError()).not.toBeNull();
    expect(q.getData()).toEqual([]);
  });

  it('l’adaptateur ne sait pas regrouper : même refus', async () => {
    source('server-side', { serverGroupBy: false });
    const q = await requete({ groupBy: 'region', aggregate: 'population:sum' });
    emettrePage();
    expect(q.getAttribute(MARQUEUR)).toContain("il n'a pas pu être délégué au serveur");
    expect(q.getData()).toEqual([]);
  });

  it('regroupement délégué mais rendu en lignes brutes (needsClientProcessing) : même refus', async () => {
    source('server-side');
    const q = await requete({ groupBy: 'region', aggregate: 'population:sum' });
    emettrePage({ needsClientProcessing: true });
    expect(q.getAttribute(MARQUEUR)).toContain("l'API n'a pas su le traiter");
    expect(q.getData()).toEqual([]);
  });

  it('à travers un transformateur qui change le schéma (normalize compute)', async () => {
    source('server-side');
    const n = new DsfrDataNormalize();
    n.id = 'pa-norm';
    n.source = 'pa-src';
    n.compute = 'double = population * 2';
    document.body.appendChild(n);
    await n.updateComplete;
    const q = await requete({ groupBy: 'region', aggregate: 'double:sum' }, 'pa-norm');
    emettrePage();
    // La source nommée est celle qui CHARGE, pas le transformateur intermédiaire
    expect(q.getAttribute(MARQUEUR)).toContain('Retirez server-side de dsfr-data-source "pa-src"');
    expect(q.getData()).toEqual([]);
  });

  it('dit une fois en console, même quand la source change de page', async () => {
    source('server-side');
    const q = await requete({ aggregate: 'population:sum' });
    emettrePage();
    emettrePage({ page: 2 });
    expect(dits(errorSpy, 'pagination serveur (server-side)')).toHaveLength(1);
    expect(q.getError()).not.toBeNull();
  });

  it('la source cesse de paginer : le marqueur tombe, le chiffre revient', async () => {
    source('server-side');
    const q = await requete({ aggregate: 'population:sum' });
    emettrePage();
    expect(q.hasAttribute(MARQUEUR)).toBe(true);

    emettrePage({ serverSide: false, pageSize: 0, total: 3 });
    expect(q.hasAttribute(MARQUEUR)).toBe(false);
    expect(q.getError()).toBeNull();
    expect(q.getData()).toEqual([{ population__sum: 21000 }]);
  });
});

describe('#1242 — ce qui ne doit pas casser', () => {
  it('regroupement réellement délégué : les groupes de la page passent tels quels', async () => {
    source('server-side');
    const q = await requete({ groupBy: 'region', aggregate: 'population:sum' });
    const groupes = [
      { region: 'IDF', population__sum: 15000 },
      { region: 'PACA', population__sum: 6000 },
    ];
    emettrePage({}, groupes);
    expect(q.hasAttribute(MARQUEUR)).toBe(false);
    expect(q.getError()).toBeNull();
    expect(q.getData()).toEqual(groupes);
    expect(getDataMeta('pa-q')?.caveats).toBeUndefined();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('liste paginée sans regroupement (where, order-by) : rien à dire', async () => {
    source('server-side');
    const q = await requete({ where: 'region:eq:IDF', orderBy: 'population:desc' });
    emettrePage();
    expect(q.hasAttribute(MARQUEUR)).toBe(false);
    expect(q.getError()).toBeNull();
    expect((q.getData() as unknown[]).length).toBeGreaterThan(0);
    expect(getDataMeta('pa-q')).toMatchObject({ serverSide: true, total: 9 });
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('chargement complet : le regroupement client reste ce qu’il était', async () => {
    source('tiers');
    const q = await requete({
      groupBy: 'region',
      aggregate: 'population:sum, population__sum:share',
    });
    emettrePage({ serverSide: false, pageSize: 0, total: 3 });
    expect(q.hasAttribute(MARQUEUR)).toBe(false);
    expect(q.getData()).toEqual([
      { region: 'IDF', population__sum: 15000, population__sum__share: 15000 / 21000 },
      { region: 'PACA', population__sum: 6000, population__sum__share: 6000 / 21000 },
    ]);
  });
});

describe('#1242 — mode URL `paginate` : statu quo, et dit', () => {
  it('le calcul a lieu sur la page, avec un avertissement et la réserve au Diagnostic', async () => {
    source('paginate', { serverGroupBy: false });
    const q = await requete({ groupBy: 'region', aggregate: 'population:sum' });
    emettrePage();

    expect(q.hasAttribute(MARQUEUR)).toBe(false);
    expect(q.getError()).toBeNull();
    expect(q.getData()).toEqual([
      { region: 'IDF', population__sum: 15000 },
      { region: 'PACA', population__sum: 6000 },
    ]);
    const avertissements = dits(warnSpy, 'sur la seule page reçue');
    expect(avertissements).toHaveLength(1);
    expect(String(avertissements[0][0])).toContain('dsfr-data-query[pa-q]');
    expect(String(avertissements[0][0])).toContain('3 lignes sur 9');
    expect(String(avertissements[0][0])).toContain('(paginate)');
    expect(getDataMeta('pa-q')?.caveats).toEqual(['aggregate-on-page']);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('un seul avertissement tant que la page ne change pas de taille', async () => {
    source('paginate', { serverGroupBy: false });
    await requete({ aggregate: 'population:sum' });
    emettrePage();
    emettrePage({ page: 2 });
    expect(dits(warnSpy, 'sur la seule page reçue')).toHaveLength(1);
  });

  it('émetteur inconnu qui se dit paginé : même statu quo, sans nommer d’attribut', async () => {
    source('tiers', { serverGroupBy: false });
    const q = await requete({ aggregate: 'population:sum' });
    emettrePage();
    expect(q.hasAttribute(MARQUEUR)).toBe(false);
    expect(q.getData()).toEqual([{ population__sum: 21000 }]);
    expect(String(dits(warnSpy, 'sur la seule page reçue')[0][0])).not.toContain('(paginate)');
    expect(getDataMeta('pa-q')?.caveats).toEqual(['aggregate-on-page']);
  });

  it('sans regroupement : ni avertissement ni réserve', async () => {
    source('paginate', { serverGroupBy: false });
    await requete({ where: 'region:eq:IDF' });
    emettrePage();
    expect(warnSpy).not.toHaveBeenCalled();
    expect(getDataMeta('pa-q')?.caveats).toBeUndefined();
  });
});

describe('réserves de l’amont : jamais relayées, celles de l’étape gardées', () => {
  it('la réserve de la source ne descend pas dans la meta de la requête', async () => {
    source('tiers');
    await requete({ where: 'region:eq:IDF' });
    emettrePage({ serverSide: false, pageSize: 0, total: 3, caveats: ['unstable-sort'] });
    expect(getDataMeta('pa-src')?.caveats).toEqual(['unstable-sort']);
    expect(getDataMeta('pa-q')).toBeDefined();
    expect(getDataMeta('pa-q')?.caveats).toBeUndefined();
  });
});
