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
import { getAdapter } from '@/adapters/adapter-registry.js';

/** Vue interne : le traitement client et la négociation sont privés. */
interface QueryInternals {
  _processClientSide(): void;
  _negotiateServerSide(): void;
  _serverDelegated: { groupBy: boolean; aggregate: boolean; orderBy: boolean; where: boolean };
  _rawData: Record<string, unknown>[];
  beforeTransformerSubscribe(): void;
  _handleSourceData(): void;
  emitTransformerError(error: Error): void;
}

/**
 * Deux enquêtes (2014 et 2021), plusieurs questions : la forme du cas
 * d'origine de AM-110 (usagers des archives). Les effectifs diffèrent d'une
 * année à l'autre, pour qu'une part rapportée au total général ne ressemble
 * à aucune part par année.
 */
const ENQUETE: Record<string, unknown>[] = [
  { annee: 2014, question: 'frequence', reponse: 'Souvent', n: 30 },
  { annee: 2014, question: 'frequence', reponse: 'Parfois', n: 50 },
  { annee: 2014, question: 'frequence', reponse: 'Jamais', n: 20 },
  { annee: 2014, question: 'satisfaction', reponse: 'Satisfait', n: 45 },
  { annee: 2014, question: 'satisfaction', reponse: 'Insatisfait', n: 15 },
  { annee: 2021, question: 'frequence', reponse: 'Souvent', n: 80 },
  { annee: 2021, question: 'frequence', reponse: 'Souvent', n: 40 },
  { annee: 2021, question: 'frequence', reponse: 'Parfois', n: 60 },
  { annee: 2021, question: 'frequence', reponse: 'Jamais', n: 20 },
  { annee: 2021, question: 'satisfaction', reponse: 'Satisfait', n: 90 },
  { annee: 2021, question: 'satisfaction', reponse: 'Insatisfait', n: 10 },
];

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

describe('AM-110 — part par groupe (share-by)', () => {
  let query: DsfrDataQuery;
  let internals: QueryInternals;

  beforeEach(() => {
    query = new DsfrDataQuery();
    internals = query as unknown as QueryInternals;
    query.id = 'part-groupe-query';
    query.source = 'part-groupe-source';
    internals._rawData = ENQUETE;
  });

  afterEach(() => {
    if (query.isConnected) query.disconnectedCallback();
    document.getElementById('part-groupe-source')?.remove();
    vi.restoreAllMocks();
  });

  /** Somme d'une colonne par clé, pour dire « les parts de chaque groupe somment à 100 ». */
  function sommePar(
    rows: Record<string, unknown>[],
    cle: (r: Record<string, unknown>) => string,
    colonne: string
  ): Record<string, number> {
    const out: Record<string, number> = {};
    for (const r of rows) out[cle(r)] = (out[cle(r)] ?? 0) + ((r[colonne] as number) ?? 0);
    return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, arrondir(v) as number]));
  }

  it('sans share-by, rien ne change : la part reste rapportée à toutes les lignes de sortie', () => {
    query.groupBy = 'annee, question, reponse';
    query.aggregate = 'n:sum, n__sum:share_percent';

    internals._processClientSide();

    const result = query.getData() as Record<string, unknown>[];
    // Total général 460 : « Souvent » en 2014 vaut 30 / 460, pas 30 / 100.
    expect(arrondir(result[0]['n__sum__share_percent'], 4)).toBe(arrondir((30 / 460) * 100, 4));
    const somme = result.reduce((a, r) => a + (r['n__sum__share_percent'] as number), 0);
    expect(arrondir(somme)).toBe(100);
  });

  it('avec share-by="annee, question", les parts de chaque couple somment à 100', () => {
    query.groupBy = 'annee, question, reponse';
    query.aggregate = 'n:sum, n__sum:share_percent';
    query.shareBy = 'annee, question';

    internals._processClientSide();

    const result = query.getData() as Record<string, unknown>[];
    const part = (annee: string, question: string, reponse: string) =>
      result.find((r) => r.annee === annee && r.question === question && r.reponse === reponse)?.[
        'n__sum__share_percent'
      ];
    expect(part('2014', 'frequence', 'Souvent')).toBe(30);
    expect(part('2014', 'frequence', 'Parfois')).toBe(50);
    expect(part('2014', 'satisfaction', 'Satisfait')).toBe(75);
    // 2021 : les deux lignes « Souvent » (80 + 40) sont d'abord regroupées.
    expect(part('2021', 'frequence', 'Souvent')).toBe(60);
    expect(part('2021', 'satisfaction', 'Insatisfait')).toBe(10);
    expect(sommePar(result, (r) => `${r.annee}/${r.question}`, 'n__sum__share_percent')).toEqual({
      '2014/frequence': 100,
      '2014/satisfaction': 100,
      '2021/frequence': 100,
      '2021/satisfaction': 100,
    });
  });

  it('avec une partition "annee", les parts de chaque année somment à 100 (critère de #1228)', () => {
    query.groupBy = 'annee, reponse';
    query.aggregate = 'n:sum, n__sum:share_percent, n__sum:share';
    query.shareBy = 'annee';

    internals._processClientSide();

    const result = query.getData() as Record<string, unknown>[];
    expect(sommePar(result, (r) => String(r.annee), 'n__sum__share_percent')).toEqual({
      '2014': 100,
      '2021': 100,
    });
    // `share` suit la même partition, en fraction.
    expect(sommePar(result, (r) => String(r.annee), 'n__sum__share')).toEqual({
      '2014': 1,
      '2021': 1,
    });
  });

  it('sans regroupement, la partition porte sur les lignes elles-mêmes', () => {
    query.aggregate = 'n:share_percent';
    query.shareBy = 'annee, question';
    internals._rawData = ENQUETE.filter((r) => r.question === 'satisfaction');

    internals._processClientSide();

    const result = query.getData() as Record<string, unknown>[];
    expect(result.map((r) => r['n__share_percent'])).toEqual([75, 25, 90, 10]);
    // Les lignes de la source ne sont jamais mutées.
    expect(ENQUETE[3]).not.toHaveProperty('n__share_percent');
  });

  it('le dénominateur est le total de la partition AVANT limit', () => {
    query.groupBy = 'annee, question, reponse';
    query.aggregate = 'n:sum, n__sum:share_percent';
    query.shareBy = 'annee, question';
    query.orderBy = 'n__sum:desc';
    query.limit = 2;

    internals._processClientSide();

    const result = query.getData() as Record<string, unknown>[];
    // Les deux plus gros effectifs : 2021 Souvent (120 / 200) et 2021 Satisfait (90 / 100).
    expect(result.map((r) => r['n__sum__share_percent'])).toEqual([60, 90]);
  });

  it('une valeur absente forme sa propre partition, comme elle forme son propre groupe', () => {
    query.aggregate = 'n:share_percent';
    query.shareBy = 'annee';
    internals._rawData = [
      { annee: 2014, n: 1 },
      { annee: 2014, n: 3 },
      { annee: null, n: 2 },
      { annee: '', n: 6 },
      { n: 2 },
    ];

    internals._processClientSide();

    const result = query.getData() as Record<string, unknown>[];
    expect(result.map((r) => r['n__share_percent'])).toEqual([25, 75, 20, 60, 20]);
  });

  it('total de partition nul, valeur non numérique : null, sans toucher aux autres partitions', () => {
    query.aggregate = 'n:share_percent';
    query.shareBy = 'annee';
    internals._rawData = [
      { annee: 2014, n: 0 },
      { annee: 2014, n: 0 },
      { annee: 2021, n: 30 },
      { annee: 2021, n: 'NC' },
      { annee: 2021, n: 10 },
    ];

    internals._processClientSide();

    const result = query.getData() as Record<string, unknown>[];
    expect(result.map((r) => r['n__share_percent'])).toEqual([null, null, 75, null, 25]);
  });

  it('deux valeurs ne se confondent pas dans la clé de partition', () => {
    query.aggregate = 'n:share_percent';
    query.shareBy = 'a, b';
    // Une clé construite par simple jonction confondrait ces deux partitions.
    internals._rawData = [
      { a: 'x|||y', b: 'z', n: 1 },
      { a: 'x', b: 'y|||z', n: 3 },
    ];

    internals._processClientSide();

    const result = query.getData() as Record<string, unknown>[];
    expect(result.map((r) => r['n__share_percent'])).toEqual([100, 100]);
  });

  it('les cumulées ne sont pas partitionnées', () => {
    query.aggregate = 'n:running_sum, n:share_percent';
    query.shareBy = 'annee';
    internals._rawData = [
      { annee: 2014, n: 10 },
      { annee: 2021, n: 30 },
    ];

    internals._processClientSide();

    const result = query.getData() as Record<string, unknown>[];
    expect(result.map((r) => r['n__running_sum'])).toEqual([10, 40]);
    expect(result.map((r) => r['n__share_percent'])).toEqual([100, 100]);
  });

  describe('erreurs de configuration', () => {
    it('un champ hors group-by : signalé, et la requête passe en erreur au lieu d’émettre', () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const erreur = vi.spyOn(internals, 'emitTransformerError').mockImplementation(() => {});
      query.groupBy = 'question, reponse';
      query.aggregate = 'n:sum, n__sum:share_percent';
      query.shareBy = 'annee, question';

      internals.beforeTransformerSubscribe();
      internals._handleSourceData();

      const message = query.getAttribute('data-dsfr-config-error') ?? '';
      expect(message).toContain('share-by="annee, question"');
      expect(message).toContain('"annee" n\'est pas un champ de group-by');
      expect(message).not.toContain('"question"');
      expect(spy).toHaveBeenCalled();
      expect(erreur).toHaveBeenCalledTimes(1);
      expect(query.getData()).toEqual([]);
    });

    it('un agrégat global replie tout : aucun champ ne survit, erreur aussi', () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const erreur = vi.spyOn(internals, 'emitTransformerError').mockImplementation(() => {});
      query.aggregate = 'n:sum, n__sum:share';
      query.shareBy = 'annee';

      internals.beforeTransformerSubscribe();
      internals._handleSourceData();

      expect(query.getAttribute('data-dsfr-config-error')).toContain('share-by="annee"');
      expect(erreur).toHaveBeenCalledTimes(1);
    });

    it('share-by sans part : signalé, sans effet, et les chiffres sont émis', () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const erreur = vi.spyOn(internals, 'emitTransformerError').mockImplementation(() => {});
      query.groupBy = 'annee';
      query.aggregate = 'n:sum';
      query.shareBy = 'annee';

      internals.beforeTransformerSubscribe();
      internals._handleSourceData();

      expect(query.getAttribute('data-dsfr-config-error')).toContain('aucune part dans aggregate');
      expect(erreur).not.toHaveBeenCalled();
      expect((query.getData() as Record<string, unknown>[]).map((r) => r['n__sum'])).toEqual([
        160, 300,
      ]);
    });

    it('une partition cohérente ne signale rien', () => {
      query.groupBy = 'annee, question';
      query.aggregate = 'n:sum, n__sum:share';
      query.shareBy = 'annee';

      internals.beforeTransformerSubscribe();

      expect(query.hasAttribute('data-dsfr-config-error')).toBe(false);
    });

    it('share-by fait partie des attributs qui relancent la requête', () => {
      const props = (
        query as unknown as { transformerReinitProps(): string[] }
      ).transformerReinitProps();
      expect(props).toContain('shareBy');
    });
  });

  /**
   * Ce qui se passe RÉELLEMENT face à un adaptateur qui sait regrouper : la
   * part — partitionnée ou non — est une fonction de fenêtre, elle retient le
   * regroupement côté client. Les trois adaptateurs sont les vrais, pris au
   * registre : Tabular, lui, se dit capable de tout sauf `distinct`.
   */
  describe.each(['opendatasoft', 'tabular', 'grist'])('délégation — adaptateur %s', (apiType) => {
    let commands: Array<Record<string, unknown>>;
    let unsubscribe: () => void;

    beforeEach(() => {
      const source = document.createElement('div');
      source.id = 'part-groupe-source';
      (source as unknown as { getAdapter: () => unknown }).getAdapter = () => getAdapter(apiType);
      document.body.appendChild(source);
      commands = [];
      unsubscribe = subscribeToSourceCommands('part-groupe-source', (cmd) => commands.push(cmd));
      query.groupBy = 'annee, question, reponse';
      query.aggregate = 'n:sum, n__sum:share_percent';
      query.shareBy = 'annee, question';
    });

    afterEach(() => unsubscribe?.());

    it('sait regrouper côté serveur — et délègue bien quand il n’y a pas de part', () => {
      expect(getAdapter(apiType)?.capabilities.serverGroupBy).toBe(true);
      query.aggregate = 'n:sum';
      query.shareBy = '';
      internals._negotiateServerSide();
      expect(internals._serverDelegated.groupBy).toBe(true);
    });

    it('ne délègue ni le regroupement, ni l’agrégat, ni le tri : la part est calculée sur les lignes reçues', () => {
      query.orderBy = 'n__sum:desc';
      internals._negotiateServerSide();

      expect(internals._serverDelegated).toEqual({
        groupBy: false,
        aggregate: false,
        orderBy: false,
        where: false,
      });
      expect(commands.some((c) => 'groupBy' in c || 'aggregate' in c)).toBe(false);
      expect(JSON.stringify(commands)).not.toContain('share');

      internals._processClientSide();
      const result = query.getData() as Record<string, unknown>[];
      // Tri par effectif décroissant : 2021 Souvent (120 sur 200), puis 2021 Satisfait (90 sur 100).
      expect(result.slice(0, 2).map((r) => r['n__sum__share_percent'])).toEqual([60, 90]);
    });

    it('délègue le where seul : le filtre passe avant le regroupement, la part suit', () => {
      query.where = 'annee:eq:2021';
      internals._negotiateServerSide();

      expect(internals._serverDelegated.groupBy).toBe(false);
      expect(internals._serverDelegated.where).toBe(true);
    });
  });
});
