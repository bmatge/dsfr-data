import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Tests #394 — `order-by` d'une query en aval d'un transformateur créateur
 * de colonnes (unpivot, normalize rename/compute) ne doit PAS être poussé
 * en tri serveur.
 *
 * Bug d'origine : query → unpivot → source Grist. La négociation serveur de
 * dsfr-data-query atteignait l'adapter Grist à travers la délégation
 * transparente getAdapter() de l'unpivot, déléguait `order-by="annee:asc"`
 * (caps.serverOrderBy), et le relais de commandes du TransformerMixin
 * remontait la commande jusqu'à la source → `GET …/records?sort=annee` →
 * 500 `unknown key annee` (la colonne `annee` est créée par l'unpivot, elle
 * n'existe pas dans la table Grist wide `c2017…c2026`). Toute la chaîne en
 * aval de la source tombait (pattern « un fetch, N consommateurs »).
 *
 * Contrat fixé : quand la chaîne entre la query et la source qui fetch
 * contient un transformateur qui crée/renomme des colonnes
 * (transformsSchema() === true), la query ne délègue RIEN au serveur — ses
 * opérations s'expriment dans le schéma POST-transformation. Le tri se fait
 * client-side sur les données transformées.
 */

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

import { DsfrDataQuery } from '@/components/dsfr-data-query.js';
import { DsfrDataUnpivot } from '@/components/dsfr-data-unpivot.js';
import { DsfrDataNormalize } from '@/components/dsfr-data-normalize.js';
import {
  clearDataCache,
  clearDataMeta,
  dispatchDataLoaded,
  subscribeToSourceCommands,
} from '@/utils/data-bridge.js';

// Table wide représentative du cas Plan_Elec (#394) : le temps est encodé
// dans les NOMS de colonnes ; `annee` n'existe pas côté serveur.
const WIDE_ROWS = [
  {
    Indicateur: 'Électricité produite totale',
    c2017: '529',
    c2018: '548',
    c2019: '537',
  },
  {
    Indicateur: 'Autre indicateur',
    c2017: '10',
    c2018: '11',
    c2019: '12',
  },
];

/** Source factice exposant un adapter aux capabilities Grist (tri serveur supporté). */
function makeGristLikeSourceEl(id: string): HTMLElement {
  const el = document.createElement('div');
  el.id = id;
  (el as unknown as Record<string, unknown>).getAdapter = () => ({
    type: 'grist',
    capabilities: {
      serverFetch: true,
      serverGroupBy: true,
      serverOrderBy: true,
      whereFormat: 'colon',
    },
  });
  document.body.appendChild(el);
  return el;
}

describe('#394 — order-by en aval d’un unpivot : jamais de tri serveur', () => {
  let sourceEl: HTMLElement;
  let unpivot: DsfrDataUnpivot;
  let query: DsfrDataQuery;
  let sourceCommands: Array<Record<string, unknown>>;
  let tidyCommands: Array<Record<string, unknown>>;
  let unsubs: Array<() => void>;

  beforeEach(() => {
    for (const id of ['g394-src', 'g394-tidy', 'g394-q']) {
      clearDataCache(id);
      clearDataMeta(id);
    }
    sourceEl = makeGristLikeSourceEl('g394-src');

    unpivot = new DsfrDataUnpivot();
    unpivot.id = 'g394-tidy';
    unpivot.source = 'g394-src';
    unpivot.idCols = 'Indicateur';
    unpivot.valueColsPattern = 'c{YYYY}';
    unpivot.varName = 'annee';
    unpivot.varFormat = '{YYYY}';
    unpivot.valueName = 'valeur';
    document.body.appendChild(unpivot);

    sourceCommands = [];
    tidyCommands = [];
    unsubs = [
      subscribeToSourceCommands('g394-src', (cmd) =>
        sourceCommands.push(cmd as Record<string, unknown>)
      ),
      subscribeToSourceCommands('g394-tidy', (cmd) =>
        tidyCommands.push(cmd as Record<string, unknown>)
      ),
    ];

    query = new DsfrDataQuery();
    query.id = 'g394-q';
    query.source = 'g394-tidy';
  });

  afterEach(() => {
    (query as any)._cleanup();
    unsubs.forEach((fn) => fn());
    unpivot.remove();
    sourceEl.remove();
  });

  it('AC : l’order-by sur une colonne créée par l’unpivot n’est pas relayé en tri serveur', () => {
    query.orderBy = 'annee:asc';
    (query as any)._initialize();

    // Aucune commande orderBy ne doit atteindre ni l'unpivot ni la source —
    // avant le fix, la source recevait { orderBy: 'annee:asc' } et refetchait
    // avec ?sort=annee → 500 unknown key.
    expect(tidyCommands.filter((c) => 'orderBy' in c)).toHaveLength(0);
    expect(sourceCommands.filter((c) => 'orderBy' in c)).toHaveLength(0);
    expect((query as any)._serverDelegated.orderBy).toBe(false);
  });

  it('AC : repli en tri client sur les données transformées (post-unpivot)', () => {
    query.orderBy = 'annee:desc';
    (query as any)._initialize();

    // La source émet le tableau wide ; l'unpivot le transforme ; la query
    // trie client-side sur la colonne créée `annee`.
    dispatchDataLoaded('g394-src', WIDE_ROWS);

    const data = query.getData() as Array<Record<string, unknown>>;
    expect(data).toHaveLength(6);
    expect(data.map((r) => r.annee)).toEqual(['2019', '2019', '2018', '2018', '2017', '2017']);
  });

  it('where + group-by non plus : aucune délégation quand le schéma amont est transformé', () => {
    // Même contrat pour les autres opérations : `annee` (where) et `valeur`
    // (aggregate) n'existent pas côté serveur — délégation interdite.
    query.where = 'annee:gte:2018';
    query.groupBy = 'Indicateur';
    query.aggregate = 'valeur:sum:total';
    (query as any)._initialize();

    expect(tidyCommands).toHaveLength(0);
    expect(sourceCommands).toHaveLength(0);

    dispatchDataLoaded('g394-src', WIDE_ROWS);
    const data = query.getData() as Array<Record<string, unknown>>;
    // 2 indicateurs, agrégés client-side sur les années >= 2018
    expect(data).toHaveLength(2);
    expect(data[0]).toMatchObject({ Indicateur: 'Électricité produite totale', total: 1085 });
  });

  it('contrôle (non-régression) : query branchée directement sur la source délègue toujours', () => {
    const direct = new DsfrDataQuery();
    direct.id = 'g394-direct';
    direct.source = 'g394-src';
    direct.orderBy = 'Valeur:desc';
    (direct as any)._initialize();

    expect(sourceCommands.filter((c) => c.orderBy === 'Valeur:desc')).toHaveLength(1);
    expect((direct as any)._serverDelegated.orderBy).toBe(true);

    (direct as any)._cleanup();
    (direct as any)._clearServerDelegation();
    clearDataCache('g394-direct');
    clearDataMeta('g394-direct');
  });
});

describe('#394 — transformsSchema() sur la chaîne de transformateurs', () => {
  afterEach(() => {
    document.body.querySelectorAll('dsfr-data-unpivot, dsfr-data-normalize, div').forEach((el) => {
      if (el.id.startsWith('ts394-')) el.remove();
    });
  });

  it('unpivot transforme toujours le schéma', () => {
    const unpivot = new DsfrDataUnpivot();
    expect(unpivot.transformsSchema()).toBe(true);
  });

  it('normalize avec rename ou compute transforme le schéma', () => {
    const withRename = new DsfrDataNormalize();
    withRename.rename = 'pop:Population';
    expect(withRename.transformsSchema()).toBe(true);

    const withCompute = new DsfrDataNormalize();
    withCompute.compute = 'pct = valeur * 100';
    expect(withCompute.transformsSchema()).toBe(true);
  });

  it('normalize purement valeur (numeric-auto, trim) préserve le schéma', () => {
    const plain = new DsfrDataNormalize();
    plain.numericAuto = true;
    plain.trim = true;
    expect(plain.transformsSchema()).toBe(false);
  });

  it('normalize pass-through relaie le statut de son amont (chaîne normalize → unpivot)', () => {
    const unpivot = new DsfrDataUnpivot();
    unpivot.id = 'ts394-tidy';
    document.body.appendChild(unpivot);

    const normalize = new DsfrDataNormalize();
    normalize.numericAuto = true;
    normalize.source = 'ts394-tidy';
    expect(normalize.transformsSchema()).toBe(true);
  });

  it('normalize pass-through sur une source simple préserve le schéma', () => {
    const src = document.createElement('div');
    src.id = 'ts394-src';
    document.body.appendChild(src);

    const normalize = new DsfrDataNormalize();
    normalize.numericAuto = true;
    normalize.source = 'ts394-src';
    expect(normalize.transformsSchema()).toBe(false);
  });
});
