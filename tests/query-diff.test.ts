import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * #775 — agrégat `diff`, inverse de `running_sum` (#738).
 *
 * Les compteurs publiés DÉJÀ cumulés sont un format courant en open data
 * institutionnel, et l'incrément y est la seule question intéressante. Même
 * squelette que le cumul : après `order-by`, jamais délégué, avertissement
 * sans `order-by`. La première ligne vaut `null`, jamais 0.
 */

import { DsfrDataQuery } from '@/components/dsfr-data-query.js';
import {
  AGGREGATE_FUNCTIONS,
  isRunningAggregate,
  validateAggregateFunctions,
} from '@/utils/aggregates.js';
import { subscribeToSourceCommands } from '@/utils/data-bridge.js';

interface QueryInternals {
  _processClientSide(): void;
  _negotiateServerSide(): void;
  _serverDelegated: { groupBy: boolean; aggregate: boolean; orderBy: boolean; where: boolean };
  _rawData: Record<string, unknown>[];
  beforeTransformerSubscribe(): void;
}

/** Un compteur cumulé, reçu dans le désordre. */
const COMPTEUR: Record<string, unknown>[] = [
  { mois: '2026-03', cumul: 60 },
  { mois: '2026-01', cumul: 10 },
  { mois: '2026-02', cumul: 25 },
  { mois: '2026-04', cumul: 100 },
];

describe('#775 — diff', () => {
  let query: DsfrDataQuery;
  let internals: QueryInternals;

  beforeEach(() => {
    query = new DsfrDataQuery();
    internals = query as unknown as QueryInternals;
    query.id = 'diff-query';
    query.source = 'diff-source';
  });

  afterEach(() => {
    if (query.isConnected) query.disconnectedCallback();
    vi.restoreAllMocks();
  });

  const column = (name: string) =>
    (query.getData() as Record<string, unknown>[]).map((r) => r[name]);

  it('est une fonction reconnue, du même genre que le cumul', () => {
    expect(AGGREGATE_FUNCTIONS).toContain('diff');
    expect(validateAggregateFunctions('cumul:diff')).toBeNull();
    expect(isRunningAggregate('diff')).toBe(true);
  });

  it('AC : sur une série ordonnée, rend les incréments', () => {
    query.aggregate = 'cumul:diff';
    query.orderBy = 'mois:asc';
    internals._rawData = COMPTEUR;
    internals._processClientSide();

    expect(column('mois')).toEqual(['2026-01', '2026-02', '2026-03', '2026-04']);
    expect(column('cumul__diff')).toEqual([null, 15, 35, 40]);
  });

  it('AC : la première ligne vaut null, jamais 0', () => {
    query.aggregate = 'cumul:diff';
    query.orderBy = 'mois:asc';
    internals._rawData = COMPTEUR;
    internals._processClientSide();
    expect(column('cumul__diff')[0]).toBeNull();
  });

  it('inverse exact du cumul : diff(running_sum(x)) retrouve x', () => {
    query.aggregate = 'flux:running_sum, flux__running_sum:diff';
    query.orderBy = 'mois:asc';
    internals._rawData = [
      { mois: '1', flux: 10 },
      { mois: '2', flux: 15 },
      { mois: '3', flux: 35 },
    ];
    internals._processClientSide();
    expect(column('flux__running_sum__diff')).toEqual([null, 15, 35]);
  });

  it('une valeur non numérique donne null pour elle et pour la suivante', () => {
    query.aggregate = 'cumul:diff';
    query.orderBy = 'mois:asc';
    internals._rawData = [
      { mois: '1', cumul: 10 },
      { mois: '2', cumul: 'n/a' },
      { mois: '3', cumul: 40 },
      { mois: '4', cumul: '1 045,5' },
    ];
    internals._processClientSide();
    expect(column('cumul__diff')).toEqual([null, null, null, 1005.5]);
  });

  it('se compose avec un group-by, après le tri', () => {
    query.groupBy = 'mois';
    query.aggregate = 'cumul:max, cumul__max:diff';
    query.orderBy = 'mois:desc';
    internals._rawData = COMPTEUR;
    internals._processClientSide();
    // Ordre décroissant : l'écart est calculé dans l'ordre de sortie.
    expect(column('cumul__max__diff')).toEqual([null, -40, -35, -15]);
  });

  it('accepte un alias explicite', () => {
    query.aggregate = 'cumul:diff:flux';
    query.orderBy = 'mois:asc';
    internals._rawData = COMPTEUR;
    internals._processClientSide();
    expect(column('flux')).toEqual([null, 15, 35, 40]);
  });

  it('AC : sans order-by, un avertissement le signale', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    query.aggregate = 'cumul:diff';
    internals.beforeTransformerSubscribe();
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('order-by'));
  });

  it('n’est jamais délégué au serveur', () => {
    const source = document.createElement('div');
    source.id = 'diff-neg-source';
    (source as unknown as { getAdapter: () => unknown }).getAdapter = () => ({
      type: 'opendatasoft',
      capabilities: { serverGroupBy: true, serverOrderBy: true, whereFormat: 'odsql' },
    });
    document.body.appendChild(source);
    const commands: Array<Record<string, unknown>> = [];
    const unsubscribe = subscribeToSourceCommands('diff-neg-source', (cmd) => commands.push(cmd));
    query.source = 'diff-neg-source';
    query.groupBy = 'mois';
    query.aggregate = 'cumul:max, cumul__max:diff';

    internals._negotiateServerSide();

    expect(internals._serverDelegated.aggregate).toBe(false);
    expect(commands.some((c) => String(c.aggregate ?? '').includes('diff'))).toBe(false);
    unsubscribe();
    source.remove();
  });
});
