import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests traversants #282 (EPIC C) — meta de pagination dans le pipeline.
 *
 * Bugs d'origine :
 * - normalize publiait la meta APRÈS dispatchDataLoaded —
 *   document.dispatchEvent est synchrone, l'aval lisait la meta du batch
 *   précédent (un query aval d'un normalize sur fallback Grist sautait son
 *   traitement client sur des données brutes) ;
 * - unpivot et join ne propageaient pas la meta du tout → perte de
 *   needsClientProcessing.
 *
 * Contrat fixé :
 * - la meta est posée AVANT le dispatch (porté par emitTransformedData du
 *   mixin #280) ;
 * - unpivot/join propagent la meta avec `total` invalidé (ils changent le
 *   nombre de lignes) ; join propage la meta de sa source GAUCHE.
 *
 * AC : pipeline source(grist fallback) → normalize → query — le flag est lu
 * au bon cycle.
 */

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

import { DsfrDataQuery } from '@/components/dsfr-data-query.js';
import { DsfrDataNormalize } from '@/components/dsfr-data-normalize.js';
import { DsfrDataUnpivot } from '@/components/dsfr-data-unpivot.js';
import { DsfrDataJoin } from '@/components/dsfr-data-join.js';
import {
  clearDataCache,
  clearDataMeta,
  dispatchDataLoaded,
  getDataMeta,
  setDataMeta,
  subscribeToSource,
} from '@/utils/data-bridge.js';

const RAW_ROWS = [
  { region: 'IDF', population: 12000 },
  { region: 'IDF', population: 3000 },
  { region: 'PACA', population: 6000 },
];

function makeAdapterEl(id: string): HTMLElement {
  const el = document.createElement('div');
  el.id = id;
  (el as unknown as Record<string, unknown>).getAdapter = () => ({
    type: 'mock-grist',
    capabilities: { serverGroupBy: true, serverOrderBy: true, whereFormat: 'colon' },
  });
  document.body.appendChild(el);
  return el;
}

describe('#282 — AC : pipeline source(grist fallback) → normalize → query', () => {
  beforeEach(() => {
    for (const id of ['c3-src', 'c3-norm', 'c3-query']) {
      clearDataCache(id);
      clearDataMeta(id);
    }
  });

  it('le flag needsClientProcessing est lu au bon cycle (meta posée avant le dispatch)', async () => {
    const srcEl = makeAdapterEl('c3-src');

    const normalize = new DsfrDataNormalize();
    normalize.id = 'c3-norm';
    normalize.source = 'c3-src';
    document.body.appendChild(normalize);
    await normalize.updateComplete;

    const query = new DsfrDataQuery();
    query.id = 'c3-query';
    query.source = 'c3-norm';
    query.groupBy = 'region';
    query.aggregate = 'population:sum:total';
    document.body.appendChild(query);
    await query.updateComplete;

    // La query a délégué group-by/aggregate à travers normalize (adapter
    // serverGroupBy). Le fetch simulé revient en FALLBACK : l'adapter n'a
    // pas pu traiter server-side (ex: Grist SQL indisponible) — lignes
    // brutes + needsClientProcessing.
    setDataMeta('c3-src', {
      page: 1,
      pageSize: 0,
      total: RAW_ROWS.length,
      serverSide: false,
      needsClientProcessing: true,
    });
    dispatchDataLoaded('c3-src', RAW_ROWS);

    // Avant le fix : normalize publiait sa meta APRÈS son dispatch — la
    // query (synchrone) lisait la meta du batch précédent (undefined),
    // sautait son traitement client (group-by délégué) et laissait passer
    // les lignes brutes.
    const result = query.getData() as Array<Record<string, unknown>>;
    expect(result).toEqual([
      { region: 'IDF', total: 15000 },
      { region: 'PACA', total: 6000 },
    ]);

    query.remove();
    normalize.remove();
    srcEl.remove();
  });

  it('normalize pose la meta avant son émission (observable par un abonné synchrone)', async () => {
    const normalize = new DsfrDataNormalize();
    normalize.id = 'c3-norm';
    normalize.source = 'c3-src';
    document.body.appendChild(normalize);
    await normalize.updateComplete;

    let metaAtEmission: unknown = 'non-lu';
    const unsub = subscribeToSource('c3-norm', {
      onLoaded: () => {
        metaAtEmission = getDataMeta('c3-norm');
      },
    });

    setDataMeta('c3-src', { page: 3, pageSize: 20, total: 100, serverSide: true });
    dispatchDataLoaded('c3-src', RAW_ROWS);

    expect(metaAtEmission).toMatchObject({ page: 3, pageSize: 20, total: 100, serverSide: true });

    unsub();
    normalize.remove();
  });
});

describe('#282 — pass-through meta de unpivot et join (total invalidé)', () => {
  beforeEach(() => {
    for (const id of ['c3-src', 'c3-src-right', 'c3-unpivot', 'c3-join']) {
      clearDataCache(id);
      clearDataMeta(id);
    }
  });

  it('unpivot propage needsClientProcessing/serverSide mais invalide total', async () => {
    const unpivot = new DsfrDataUnpivot();
    unpivot.id = 'c3-unpivot';
    unpivot.source = 'c3-src';
    unpivot.idCols = 'region';
    unpivot.valueCols = 'population';
    document.body.appendChild(unpivot);
    await unpivot.updateComplete;

    setDataMeta('c3-src', {
      page: 1,
      pageSize: 20,
      total: 3,
      serverSide: true,
      needsClientProcessing: true,
    });
    dispatchDataLoaded('c3-src', RAW_ROWS);

    const meta = getDataMeta('c3-unpivot');
    expect(meta).toBeDefined();
    expect(meta!.needsClientProcessing).toBe(true);
    expect(meta!.serverSide).toBe(true);
    expect(meta!.pageSize).toBe(20);
    // L'unpivot multiplie les lignes : le total amont ne veut plus rien dire
    expect(meta!.total).toBeUndefined();

    unpivot.remove();
  });

  it('join propage la meta de sa source GAUCHE, total invalidé', async () => {
    const join = new DsfrDataJoin();
    join.id = 'c3-join';
    join.left = 'c3-src';
    join.right = 'c3-src-right';
    join.on = 'region';
    document.body.appendChild(join);
    await join.updateComplete;

    setDataMeta('c3-src', { page: 2, pageSize: 50, total: 1000, serverSide: true });
    setDataMeta('c3-src-right', { page: 9, pageSize: 9, total: 9, serverSide: false });
    dispatchDataLoaded('c3-src', RAW_ROWS);
    dispatchDataLoaded('c3-src-right', [{ region: 'IDF', budget: 100 }]);

    const meta = getDataMeta('c3-join');
    expect(meta).toBeDefined();
    // Meta de la GAUCHE (porteuse des lignes, cohérent avec le relais #272)
    expect(meta!.page).toBe(2);
    expect(meta!.pageSize).toBe(50);
    expect(meta!.serverSide).toBe(true);
    expect(meta!.total).toBeUndefined();

    join.remove();
  });

  it('sans meta amont, unpivot/join n’en publient pas', async () => {
    const unpivot = new DsfrDataUnpivot();
    unpivot.id = 'c3-unpivot';
    unpivot.source = 'c3-src';
    unpivot.idCols = 'region';
    unpivot.valueCols = 'population';
    document.body.appendChild(unpivot);
    await unpivot.updateComplete;

    dispatchDataLoaded('c3-src', RAW_ROWS);

    expect(getDataMeta('c3-unpivot')).toBeUndefined();
    unpivot.remove();
  });
});
