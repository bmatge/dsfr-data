import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests traversants #281 (EPIC C) — init unique au montage.
 *
 * Bug d'origine : connectedCallback initialisait, puis le PREMIER cycle Lit
 * (willUpdate avec toutes les props posées dans changedProperties)
 * ré-initialisait : double abonnement, double lecture du cache, double
 * émission, double négociation serveur. Le contournement n'existait que dans
 * dsfr-data-join — avec un corollaire : un join sans attributs n'appelait
 * jamais son init → reportConfigError jamais déclenché (échec silencieux).
 *
 * Contrat fixé (TransformerMixin + SourceSubscriberMixin) :
 * - connectedCallback est le SEUL point d'init ; le premier willUpdate est
 *   consommé sans re-init ;
 * - un join sans attributs signale sa config manquante au montage ;
 * - un transformateur re-attaché au DOM se re-branche (Lit ne re-déclenche
 *   pas willUpdate à la reconnexion).
 *
 * AC : un seul abonnement/émission au montage (test espionnant le
 * data-bridge), via de VRAIS cycles Lit (appendChild + updateComplete).
 */

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

import { DsfrDataQuery } from '@/components/dsfr-data-query.js';
import { DsfrDataJoin } from '@/components/dsfr-data-join.js';
import { DsfrDataUnpivot } from '@/components/dsfr-data-unpivot.js';
import { DsfrDataNormalize } from '@/components/dsfr-data-normalize.js';
import { DsfrDataSearch } from '@/components/dsfr-data-search.js';
import { DsfrDataKpi } from '@/components/dsfr-data-kpi.js';
import {
  clearDataCache,
  clearDataMeta,
  dispatchDataLoaded,
  subscribeToSource,
} from '@/utils/data-bridge.js';

const SRC = 'c2-src';
const ROWS = [
  { region: 'IDF', population: 12000 },
  { region: 'PACA', population: 5000 },
];

/** Compte les émissions dsfr-data-loaded sous l'id donné */
function countEmissions(id: string) {
  const counter = { count: 0 };
  const unsub = subscribeToSource(id, {
    onLoaded: () => {
      counter.count++;
    },
  });
  return { counter, unsub };
}

describe('#281 — AC : une seule émission au montage (vrais cycles Lit)', () => {
  beforeEach(() => {
    clearDataCache(SRC);
    clearDataMeta(SRC);
    // Pré-peuple le cache : c'est la lecture du cache à l'init qui était
    // doublée par le double-init
    dispatchDataLoaded(SRC, ROWS);
  });

  it('query : exactement une émission au montage', async () => {
    clearDataCache('c2-query');
    const { counter, unsub } = countEmissions('c2-query');

    const el = new DsfrDataQuery();
    el.id = 'c2-query';
    el.source = SRC;
    el.groupBy = 'region';
    el.aggregate = 'population:sum:total';
    document.body.appendChild(el);
    await el.updateComplete;

    expect(counter.count).toBe(1);
    unsub();
    el.remove();
  });

  it('normalize : exactement une émission au montage', async () => {
    clearDataCache('c2-normalize');
    const { counter, unsub } = countEmissions('c2-normalize');

    const el = new DsfrDataNormalize();
    el.id = 'c2-normalize';
    el.source = SRC;
    document.body.appendChild(el);
    await el.updateComplete;

    expect(counter.count).toBe(1);
    unsub();
    el.remove();
  });

  it('unpivot : exactement une émission au montage', async () => {
    clearDataCache('c2-unpivot');
    const { counter, unsub } = countEmissions('c2-unpivot');

    const el = new DsfrDataUnpivot();
    el.id = 'c2-unpivot';
    el.source = SRC;
    el.idCols = 'region';
    el.valueCols = 'population';
    document.body.appendChild(el);
    await el.updateComplete;

    expect(counter.count).toBe(1);
    unsub();
    el.remove();
  });

  it('search : exactement une émission au montage', async () => {
    clearDataCache('c2-search');
    const { counter, unsub } = countEmissions('c2-search');

    const el = new DsfrDataSearch();
    el.id = 'c2-search';
    el.source = SRC;
    document.body.appendChild(el);
    await el.updateComplete;

    expect(counter.count).toBe(1);
    unsub();
    el.remove();
  });

  it('join : exactement une émission au montage (deux sources en cache)', async () => {
    clearDataCache('c2-join');
    clearDataCache('c2-src-right');
    dispatchDataLoaded('c2-src-right', [{ region: 'IDF', budget: 100 }]);
    const { counter, unsub } = countEmissions('c2-join');

    const el = new DsfrDataJoin();
    el.id = 'c2-join';
    el.left = SRC;
    el.right = 'c2-src-right';
    el.on = 'region';
    document.body.appendChild(el);
    await el.updateComplete;

    expect(counter.count).toBe(1);
    unsub();
    el.remove();
    clearDataCache('c2-src-right');
  });

  it('affichage (SourceSubscriberMixin) : onSourceData appelé une seule fois au montage', async () => {
    const el = new DsfrDataKpi();
    el.source = SRC;
    (el as unknown as { field: string }).field = 'population';
    const spy = vi.spyOn(el as unknown as { onSourceData(d: unknown): void }, 'onSourceData');

    document.body.appendChild(el);
    await el.updateComplete;

    expect(spy).toHaveBeenCalledTimes(1);
    el.remove();
  });

  it('query : une seule négociation serveur au montage', async () => {
    clearDataCache('c2-query-neg');
    const el = new DsfrDataQuery();
    el.id = 'c2-query-neg';
    el.source = SRC;
    el.groupBy = 'region';
    const spy = vi.spyOn(el as any, '_negotiateServerSide');

    document.body.appendChild(el);
    await el.updateComplete;

    expect(spy).toHaveBeenCalledTimes(1);
    el.remove();
  });
});

describe('#281 — AC : join sans attributs signale sa config manquante', () => {
  it('un join nu (id seul) pose data-dsfr-config-error au montage', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const el = new DsfrDataJoin();
    el.id = 'c2-join-vide';
    document.body.appendChild(el);
    await el.updateComplete;

    expect(el.getAttribute('data-dsfr-config-error')).toMatch(/left, right, on/);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('manquant'));

    errorSpy.mockRestore();
    el.remove();
  });

  it('un join sans id le signale aussi', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const el = new DsfrDataJoin();
    document.body.appendChild(el);
    await el.updateComplete;

    expect(el.getAttribute('data-dsfr-config-error')).toMatch(/id/);

    errorSpy.mockRestore();
    el.remove();
  });
});

describe('#281 — re-attach DOM : le transformateur se re-branche', () => {
  it('un query déplacé dans le DOM continue de recevoir les émissions', async () => {
    clearDataCache(SRC);
    clearDataMeta(SRC);
    clearDataCache('c2-reattach');
    dispatchDataLoaded(SRC, ROWS);

    const el = new DsfrDataQuery();
    el.id = 'c2-reattach';
    el.source = SRC;
    document.body.appendChild(el);
    await el.updateComplete;
    expect(el.getData()).toHaveLength(2);

    // Déplacement : disconnect (cleanup mixin) puis reconnect
    const container = document.createElement('div');
    document.body.appendChild(container);
    container.appendChild(el);
    await el.updateComplete;

    // Une nouvelle émission amont doit encore être traitée
    dispatchDataLoaded(SRC, [{ region: 'BRE', population: 1000 }]);
    expect(el.getData()).toHaveLength(1);

    el.remove();
    container.remove();
  });
});
