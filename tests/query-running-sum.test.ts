import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Tests #738 — agrégat cumulé `running_sum` sur dsfr-data-query.
 *
 * Le cumul n'existait que dans la timeline de la carte, sous une forme qui
 * n'est pas un agrégat (un `slice(0, frame)` sur des frames), et #671 l'exclut
 * explicitement de `compute` (ADR-105 réserve l'inter-lignes à `query`).
 *
 * Contrat : transformation ORDONNÉE appliquée après `order-by`, sur les lignes
 * de sortie, toujours côté client — un adaptateur qui n'implémente pas
 * `supportsServerAggregate` accepterait sinon une fonction qu'il ne sait pas
 * traduire.
 */

import { DsfrDataQuery } from '@/components/dsfr-data-query.js';
import {
  AGGREGATE_FUNCTIONS,
  isRunningAggregate,
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

const VENTES: Record<string, unknown>[] = [
  { mois: '2026-03', montant: 30 },
  { mois: '2026-01', montant: 10 },
  { mois: '2026-02', montant: 20 },
];

describe('#738 — running_sum', () => {
  let query: DsfrDataQuery;
  let internals: QueryInternals;

  beforeEach(() => {
    query = new DsfrDataQuery();
    internals = query as unknown as QueryInternals;
    query.id = 'cumul-query';
    query.source = 'cumul-source';
  });

  afterEach(() => {
    if (query.isConnected) query.disconnectedCallback();
    vi.restoreAllMocks();
  });

  it('est une fonction d’agrégat reconnue, et cumulée', () => {
    expect(AGGREGATE_FUNCTIONS).toContain('running_sum');
    expect(validateAggregateFunctions('montant:running_sum')).toBeNull();
    expect(isRunningAggregate('running_sum')).toBe(true);
    expect(isRunningAggregate('sum')).toBe(false);
    // Une faute de frappe reste une erreur de configuration (#649)
    expect(validateAggregateFunctions('montant:runningsum')).toContain('inconnue');
  });

  it('une série ordonnée par date produit un cumul croissant', () => {
    query.groupBy = 'mois';
    query.aggregate = 'montant:sum, montant__sum:running_sum';
    query.orderBy = 'mois:asc';
    internals._rawData = VENTES;

    internals._processClientSide();

    const result = query.getData() as Record<string, unknown>[];
    expect(result.map((r) => r.mois)).toEqual(['2026-01', '2026-02', '2026-03']);
    expect(result.map((r) => r['montant__sum'])).toEqual([10, 20, 30]);
    expect(result.map((r) => r['montant__sum__running_sum'])).toEqual([10, 30, 60]);
  });

  it('le cumul est calculé APRÈS le tri, pas dans l’ordre reçu', () => {
    query.groupBy = 'mois';
    query.aggregate = 'montant:sum, montant__sum:running_sum';
    query.orderBy = 'mois:desc';
    internals._rawData = VENTES;

    internals._processClientSide();

    const result = query.getData() as Record<string, unknown>[];
    expect(result.map((r) => r['montant__sum__running_sum'])).toEqual([30, 50, 60]);
  });

  it('sans group-by, cumule ligne à ligne sans replier en une seule ligne', () => {
    query.aggregate = 'montant:running_sum';
    query.orderBy = 'mois:asc';
    internals._rawData = VENTES;

    internals._processClientSide();

    const result = query.getData() as Record<string, unknown>[];
    expect(result).toHaveLength(3);
    expect(result.map((r) => r['montant__running_sum'])).toEqual([10, 30, 60]);
    // Les lignes source ne sont pas mutées
    expect(VENTES.every((r) => !('montant__running_sum' in r))).toBe(true);
  });

  it('cohabite avec un agrégat global sur les autres fonctions', () => {
    query.aggregate = 'montant:sum';
    internals._rawData = VENTES;
    internals._processClientSide();
    expect(query.getData()).toHaveLength(1);
  });

  it('accepte un alias explicite', () => {
    query.aggregate = 'montant:running_sum:cumul';
    query.orderBy = 'mois:asc';
    internals._rawData = VENTES;

    internals._processClientSide();

    expect((query.getData() as Record<string, unknown>[]).map((r) => r.cumul)).toEqual([
      10, 30, 60,
    ]);
  });

  it('ignore les valeurs non numériques et reporte le cumul en cours', () => {
    query.aggregate = 'montant:running_sum';
    internals._rawData = [
      { mois: '1', montant: 10 },
      { mois: '2', montant: null },
      { mois: '3', montant: 'n/a' },
      { mois: '4', montant: '1 234,5' },
    ];

    internals._processClientSide();

    expect(
      (query.getData() as Record<string, unknown>[]).map((r) => r['montant__running_sum'])
    ).toEqual([10, 10, 10, 1244.5]);
  });

  it('avertit quand le cumul est demandé sans order-by', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    query.aggregate = 'montant:running_sum';

    internals.beforeTransformerSubscribe();

    expect(spy).toHaveBeenCalledWith(expect.stringContaining('order-by'));
    expect(spy.mock.calls[0][0]).toContain('cumul-query');
  });

  it('n’avertit pas quand order-by est posé, ni sans cumul', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    query.aggregate = 'montant:running_sum';
    query.orderBy = 'mois:asc';
    internals.beforeTransformerSubscribe();

    query.aggregate = 'montant:sum';
    query.orderBy = '';
    internals.beforeTransformerSubscribe();

    expect(spy).not.toHaveBeenCalled();
  });

  describe('délégation serveur', () => {
    let mockSource: HTMLElement;
    let commands: Array<Record<string, unknown>>;
    let unsubscribe: () => void;

    /** Adaptateur type ODS/Grist : pas de `supportsServerAggregate`. */
    beforeEach(() => {
      mockSource = document.createElement('div');
      mockSource.id = 'cumul-neg-source';
      (mockSource as unknown as { getAdapter: () => unknown }).getAdapter = () => ({
        type: 'opendatasoft',
        capabilities: { serverGroupBy: true, serverOrderBy: true, whereFormat: 'odsql' },
      });
      document.body.appendChild(mockSource);
      query.source = 'cumul-neg-source';
      query.groupBy = 'mois';
      commands = [];
      unsubscribe = subscribeToSourceCommands('cumul-neg-source', (cmd) => commands.push(cmd));
    });

    afterEach(() => {
      unsubscribe?.();
      mockSource?.remove();
    });

    it('délègue normalement un agrégat réducteur', () => {
      query.aggregate = 'montant:sum';
      internals._negotiateServerSide();
      expect(internals._serverDelegated.aggregate).toBe(true);
    });

    it('ne délègue jamais un cumul, même à un adaptateur qui ne se prononce pas', () => {
      query.aggregate = 'montant:sum, montant__sum:running_sum';
      internals._negotiateServerSide();

      expect(internals._serverDelegated.groupBy).toBe(false);
      expect(internals._serverDelegated.aggregate).toBe(false);
      expect(commands.some((c) => String(c.aggregate ?? '').includes('running_sum'))).toBe(false);
    });
  });
});
