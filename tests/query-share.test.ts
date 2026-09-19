import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Tests #926 — part du total (`share` / `share_percent`) sur dsfr-data-query.
 *
 * Avant : une répartition coûtait deux sources, deux clés constantes
 * (`compute="k = 1"`), un `dsfr-data-join on="k"` et un `compute` de division.
 * Le ratio du KPI (#673) rend UN nombre, pas une colonne : un GRAPHIQUE de
 * parts restait hors d'atteinte.
 *
 * Contrat : fonction de FENÊTRE, comme les cumulées — une ligne par ligne de
 * sortie, jamais déléguée, appliquée AVANT `limit` (le dénominateur est le
 * total des lignes de sortie, pas celui des N premières). À la différence des
 * cumulées, elle ne dépend pas de l'ordre : pas d'avertissement sans
 * `order-by`.
 */

import { DsfrDataQuery } from '@/components/dsfr-data-query.js';
import {
  AGGREGATE_FUNCTIONS,
  isRunningAggregate,
  isShareAggregate,
  isWindowAggregate,
  validateAggregateFunctions,
} from '@/utils/aggregates.js';
import { subscribeToSourceCommands } from '@/utils/data-bridge.js';

/** Vue interne : le traitement client et la négociation sont privés. */
interface QueryInternals {
  _processClientSide(): void;
  _negotiateServerSide(): void;
  _serverDelegated: { groupBy: boolean; aggregate: boolean; orderBy: boolean; where: boolean };
  _rawData: Record<string, unknown>[];
  beforeTransformerSubscribe(): void;
}

/**
 * Typologie des licences d'une fédération, forme du cas d'origine
 * (sports/portrait-federation) : 101 304 licences réparties en quatre
 * typologies de communes.
 */
const LICENCES: Record<string, unknown>[] = [
  { typologie: 'Urbain dense', lics: 33_800 },
  { typologie: 'Urbain densité intermédiaire', lics: 36_500 },
  { typologie: 'Rural sous influence', lics: 20_000 },
  { typologie: 'Rural autonome', lics: 11_004 },
];

const TOTAL = 101_304;

const arrondir = (n: unknown, d = 6) =>
  typeof n === 'number' ? Math.round(n * 10 ** d) / 10 ** d : n;

describe('#926 — part du total', () => {
  let query: DsfrDataQuery;
  let internals: QueryInternals;

  beforeEach(() => {
    query = new DsfrDataQuery();
    internals = query as unknown as QueryInternals;
    query.id = 'part-query';
    query.source = 'part-source';
  });

  afterEach(() => {
    if (query.isConnected) query.disconnectedCallback();
    vi.restoreAllMocks();
  });

  it('est une fonction d’agrégat reconnue, de fenêtre mais non ordonnée', () => {
    expect(AGGREGATE_FUNCTIONS).toContain('share');
    expect(AGGREGATE_FUNCTIONS).toContain('share_percent');
    expect(validateAggregateFunctions('lics:share')).toBeNull();
    expect(validateAggregateFunctions('lics:share_percent')).toBeNull();
    expect(isShareAggregate('share')).toBe(true);
    expect(isShareAggregate('share_percent')).toBe(true);
    expect(isShareAggregate('sum')).toBe(false);
    // De fenêtre (pas de repli de groupe, pas de délégation)…
    expect(isWindowAggregate('share')).toBe(true);
    // … mais pas ordonnée : l'ordre des lignes ne change pas une part.
    expect(isRunningAggregate('share')).toBe(false);
    // Une faute de frappe reste une erreur de configuration (#649)
    expect(validateAggregateFunctions('lics:shares')).toContain('inconnue');
  });

  it('après un group-by, chaque groupe porte sa part du total', () => {
    query.groupBy = 'typologie';
    query.aggregate = 'lics:sum, lics__sum:share';
    internals._rawData = LICENCES;

    internals._processClientSide();

    const result = query.getData() as Record<string, unknown>[];
    expect(result.map((r) => r['lics__sum'])).toEqual([33_800, 36_500, 20_000, 11_004]);
    expect(result.map((r) => arrondir(r['lics__sum__share']))).toEqual([
      arrondir(33_800 / TOTAL),
      arrondir(36_500 / TOTAL),
      arrondir(20_000 / TOTAL),
      arrondir(11_004 / TOTAL),
    ]);
    // Une répartition somme à 1 : c'est ce qui la distingue d'un taux.
    const somme = result.reduce((a, r) => a + (r['lics__sum__share'] as number), 0);
    expect(arrondir(somme, 10)).toBe(1);
  });

  it('share_percent rend la même part en points de pourcentage', () => {
    query.groupBy = 'typologie';
    query.aggregate = 'lics:sum, lics__sum:share_percent';
    internals._rawData = LICENCES;

    internals._processClientSide();

    const result = query.getData() as Record<string, unknown>[];
    expect(result.map((r) => arrondir(r['lics__sum__share_percent'], 1))).toEqual([
      33.4, 36, 19.7, 10.9,
    ]);
  });

  it('accepte un alias explicite', () => {
    query.groupBy = 'typologie';
    query.aggregate = 'lics:sum, lics__sum:share_percent:part';
    internals._rawData = LICENCES;

    internals._processClientSide();

    expect((query.getData() as Record<string, unknown>[]).map((r) => arrondir(r.part, 1))).toEqual([
      33.4, 36, 19.7, 10.9,
    ]);
  });

  it('sans group-by, chaque ligne porte sa part sans replier en une seule ligne', () => {
    query.aggregate = 'lics:share';
    internals._rawData = LICENCES;

    internals._processClientSide();

    const result = query.getData() as Record<string, unknown>[];
    expect(result).toHaveLength(4);
    expect(arrondir(result[0]['lics__share'])).toBe(arrondir(33_800 / TOTAL));
    // Les lignes source ne sont pas mutées
    expect(LICENCES.every((r) => !('lics__share' in r))).toBe(true);
  });

  it('le dénominateur est le total AVANT limit : un top N ne somme pas à 100 %', () => {
    query.groupBy = 'typologie';
    query.aggregate = 'lics:sum, lics__sum:share_percent';
    query.orderBy = 'lics__sum:desc';
    query.limit = 2;
    internals._rawData = LICENCES;

    internals._processClientSide();

    const result = query.getData() as Record<string, unknown>[];
    expect(result).toHaveLength(2);
    // 36 500 et 33 800 sur 101 304 — et non sur leur propre somme (70 300),
    // qui donnerait 51,9 / 48,1 et ferait d'une troncature d'affichage une
    // redéfinition silencieuse du total.
    expect(result.map((r) => arrondir(r['lics__sum__share_percent'], 1))).toEqual([36, 33.4]);
  });

  it('le dénominateur suit le filtre : une part est une part de l’ensemble filtré', () => {
    query.where = 'typologie:contains:Rural';
    query.groupBy = 'typologie';
    query.aggregate = 'lics:sum, lics__sum:share_percent';
    internals._rawData = LICENCES;

    internals._processClientSide();

    const result = query.getData() as Record<string, unknown>[];
    expect(result.map((r) => arrondir(r['lics__sum__share_percent'], 1))).toEqual([64.5, 35.5]);
  });

  it('une valeur non numérique rend null, et ne compte pas au dénominateur', () => {
    query.aggregate = 'lics:share_percent';
    internals._rawData = [{ lics: 30 }, { lics: null }, { lics: 'n/a' }, { lics: '70' }];

    internals._processClientSide();

    // Dénominateur 100 : une absence n'est ni un zéro ni une part nulle.
    expect(
      (query.getData() as Record<string, unknown>[]).map((r) => r['lics__share_percent'])
    ).toEqual([30, null, null, 70]);
  });

  it('un total nul rend null, jamais l’infini ni un zéro de complaisance', () => {
    query.aggregate = 'solde:share';
    internals._rawData = [{ solde: 5 }, { solde: -5 }, { solde: 0 }];

    internals._processClientSide();

    expect((query.getData() as Record<string, unknown>[]).map((r) => r['solde__share'])).toEqual([
      null,
      null,
      null,
    ]);
  });

  it('n’avertit pas sur l’absence d’order-by, à la différence d’un cumul', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    query.aggregate = 'lics:sum, lics__sum:share';
    query.groupBy = 'typologie';

    internals.beforeTransformerSubscribe();

    expect(spy).not.toHaveBeenCalled();
  });

  it('se chaîne avec un cumul, dans l’ordre déclaré', () => {
    query.aggregate = 'lics:running_sum, lics__running_sum:share_percent';
    query.orderBy = 'lics:asc';
    internals._rawData = [{ lics: 10 }, { lics: 30 }];

    internals._processClientSide();

    const result = query.getData() as Record<string, unknown>[];
    // Cumuls 10 et 40, total des cumuls 50 : 20 % et 80 %.
    expect(result.map((r) => r['lics__running_sum'])).toEqual([10, 40]);
    expect(result.map((r) => r['lics__running_sum__share_percent'])).toEqual([20, 80]);
  });

  describe('délégation serveur', () => {
    let mockSource: HTMLElement;
    let commands: Array<Record<string, unknown>>;
    let unsubscribe: () => void;

    /** Adaptateur type ODS/Grist : pas de `supportsServerAggregate`. */
    beforeEach(() => {
      mockSource = document.createElement('div');
      mockSource.id = 'part-neg-source';
      (mockSource as unknown as { getAdapter: () => unknown }).getAdapter = () => ({
        type: 'opendatasoft',
        capabilities: { serverGroupBy: true, serverOrderBy: true, whereFormat: 'odsql' },
      });
      document.body.appendChild(mockSource);
      query.source = 'part-neg-source';
      query.groupBy = 'typologie';
      commands = [];
      unsubscribe = subscribeToSourceCommands('part-neg-source', (cmd) => commands.push(cmd));
    });

    afterEach(() => {
      unsubscribe?.();
      mockSource?.remove();
    });

    it('ne délègue jamais une part, même à un adaptateur qui ne se prononce pas', () => {
      query.aggregate = 'lics:sum, lics__sum:share';
      internals._negotiateServerSide();

      expect(internals._serverDelegated.groupBy).toBe(false);
      expect(internals._serverDelegated.aggregate).toBe(false);
      expect(commands.some((c) => String(c.aggregate ?? '').includes('share'))).toBe(false);
    });
  });
});
