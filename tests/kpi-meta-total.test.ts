import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * #659 — `meta.total` pré-limite, avertissement du KPI `count` et
 * `value="meta:total"`.
 *
 * Trois annuaires ont affiche « 12 activites » pour 28, 22 et 29 pendant
 * sept lots : `dsfr-data-query` tranchait `slice(0, limit)` puis emettait
 * sans toucher la meta, et le KPI `count` comptait les lignes recues.
 */

import { DsfrDataQuery } from '@/components/dsfr-data-query.js';
import { DsfrDataKpi } from '@/components/dsfr-data-kpi.js';
import { DsfrDataSearch } from '@/components/dsfr-data-search.js';
import {
  clearDataCache,
  clearDataMeta,
  dispatchDataLoaded,
  getDataMeta,
  setDataMeta,
} from '@/utils/data-bridge.js';
import { DataflowRecorder, formatTrace, summarizeTrace } from '@dsfr-data/shared';

/** Vue interne du KPI : calcul et validation, sans passer par render(). */
interface KpiInternals {
  _sourceData: unknown;
  _computeValue(): number | string | null;
  _validateConfig(): void;
  _blockingConfigError: string | null;
}
const kpiInternals = (el: DsfrDataKpi) => el as unknown as KpiInternals;

/** Vue interne de la query : alimentation directe, hors cycle Lit. */
interface QueryInternals {
  _rawData: unknown[];
  _processClientSide(): void;
}
const queryInternals = (el: DsfrDataQuery) => el as unknown as QueryInternals;

const ACTIVITES = Array.from({ length: 28 }, (_, i) => ({ id: i + 1, nom: `activité ${i + 1}` }));

const IDS = ['src', 'top12', 'srv', 'q-all', 'searched'];

function cleanup() {
  for (const id of IDS) {
    clearDataCache(id);
    clearDataMeta(id);
  }
}

describe('#659 — dsfr-data-query publie total = lignes avant limit', () => {
  let query: DsfrDataQuery;

  beforeEach(() => {
    cleanup();
    query = new DsfrDataQuery();
    query.id = 'top12';
    query.source = 'src';
  });
  afterEach(() => {
    query.disconnectedCallback();
    cleanup();
  });

  it('limit="12" sur 28 lignes → 12 lignes émises, meta.total 28, truncated', () => {
    query.limit = 12;
    setDataMeta('src', { page: 1, pageSize: 0, total: 28, serverSide: false });
    queryInternals(query)._rawData = ACTIVITES;

    queryInternals(query)._processClientSide();

    expect(query.getData()).toHaveLength(12);
    expect(getDataMeta('top12')).toMatchObject({ total: 28, truncated: true, serverSide: false });
  });

  it('le total suit le filtre : lignes APRÈS filtre et AVANT limit', () => {
    query.limit = 5;
    query.filter = 'id:lte:10';
    queryInternals(query)._rawData = ACTIVITES;

    queryInternals(query)._processClientSide();

    expect(query.getData()).toHaveLength(5);
    expect(getDataMeta('top12')!.total).toBe(10);
  });

  it('sans limit, total = lignes émises, pas de truncated', () => {
    queryInternals(query)._rawData = ACTIVITES;

    queryInternals(query)._processClientSide();

    expect(getDataMeta('top12')).toMatchObject({ total: 28 });
    expect(getDataMeta('top12')!.truncated).toBeUndefined();
  });

  it('limit non atteinte (limit="50" sur 28) → pas de truncated', () => {
    query.limit = 50;
    queryInternals(query)._rawData = ACTIVITES;

    queryInternals(query)._processClientSide();

    expect(getDataMeta('top12')).toMatchObject({ total: 28 });
    expect(getDataMeta('top12')!.truncated).toBeUndefined();
  });

  it('conserve le reste de la meta amont (needsClientProcessing) et remplace sa troncature', () => {
    setDataMeta('src', {
      page: 1,
      pageSize: 0,
      total: 3080,
      serverSide: false,
      needsClientProcessing: true,
      truncated: true,
    });
    queryInternals(query)._rawData = ACTIVITES;

    queryInternals(query)._processClientSide();

    // La troncature amont decrit la SOURCE (sa propre ligne de trace) ; la
    // meta de la query decrit ce que la query a fait de ce qu'elle a recu.
    expect(getDataMeta('top12')).toEqual({
      page: 1,
      pageSize: 0,
      serverSide: false,
      needsClientProcessing: true,
      total: 28,
    });
  });

  it('en pagination serveur, conserve le total serveur (l’aval pagine dessus)', () => {
    query.limit = 12;
    setDataMeta('src', { page: 1, pageSize: 50, total: 3080, serverSide: true });
    queryInternals(query)._rawData = ACTIVITES;

    queryInternals(query)._processClientSide();

    expect(getDataMeta('top12')).toMatchObject({ total: 3080, serverSide: true, truncated: true });
  });
});

describe('#659 — KPI count : avertissement quand les lignes sont tronquées', () => {
  let kpi: DsfrDataKpi;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    cleanup();
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    kpi = new DsfrDataKpi();
    kpi.source = 'top12';
  });
  afterEach(() => {
    warnSpy.mockRestore();
    cleanup();
  });

  it('AC : count sur une query limit="12" (28 lignes) → warn unique nommant la query et le total', () => {
    kpi.value = 'count';
    setDataMeta('top12', { page: 1, pageSize: 0, total: 28, serverSide: false, truncated: true });
    kpiInternals(kpi)._sourceData = ACTIVITES.slice(0, 12);

    expect(kpiInternals(kpi)._computeValue()).toBe(12);
    // render() rappelle _computeValue plusieurs fois (couleur, aria) : un seul warn.
    kpiInternals(kpi)._computeValue();
    kpiInternals(kpi)._computeValue();

    const partial = warnSpy.mock.calls.filter((c: unknown[]) =>
      String(c[0]).includes('meta.total')
    );
    expect(partial).toHaveLength(1);
    expect(String(partial[0][0])).toContain('"top12"');
    expect(String(partial[0][0])).toContain('28');
    expect(String(partial[0][0])).toContain('12 lignes');
    expect(String(partial[0][0])).toContain('meta:total');
  });

  it('couvre la page 1 d’une source paginée (server-side)', () => {
    kpi.source = 'srv';
    kpi.value = 'count';
    setDataMeta('srv', { page: 1, pageSize: 50, total: 3080, serverSide: true });
    kpiInternals(kpi)._sourceData = Array.from({ length: 50 }, (_, i) => ({ id: i }));

    expect(kpiInternals(kpi)._computeValue()).toBe(50);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('3080'));
  });

  it('ne warne pas quand total = lignes reçues, ni sur une autre agrégation', () => {
    kpi.value = 'count';
    setDataMeta('top12', { page: 1, pageSize: 0, total: 28, serverSide: false });
    kpiInternals(kpi)._sourceData = ACTIVITES;
    kpiInternals(kpi)._computeValue();

    kpi.value = 'id:sum';
    setDataMeta('top12', { page: 1, pageSize: 0, total: 28, serverSide: false, truncated: true });
    kpiInternals(kpi)._sourceData = ACTIVITES.slice(0, 12);
    kpiInternals(kpi)._computeValue();

    expect(warnSpy.mock.calls.some((c: unknown[]) => String(c[0]).includes('meta.total'))).toBe(
      false
    );
  });
});

describe('#659 — value="meta:total"', () => {
  let kpi: DsfrDataKpi;

  beforeEach(() => {
    cleanup();
    kpi = new DsfrDataKpi();
    kpi.value = 'meta:total';
  });
  afterEach(cleanup);

  it('derrière une query limit="12" : 28, pas 12', () => {
    kpi.source = 'top12';
    setDataMeta('top12', { page: 1, pageSize: 0, total: 28, serverSide: false, truncated: true });
    kpiInternals(kpi)._sourceData = ACTIVITES.slice(0, 12);

    expect(kpiInternals(kpi)._computeValue()).toBe(28);
  });

  it('AC : sur une source server-side, affiche total_count et suit recherche et facettes', () => {
    kpi.source = 'srv';
    setDataMeta('srv', { page: 1, pageSize: 50, total: 3080, serverSide: true });
    kpiInternals(kpi)._sourceData = Array.from({ length: 50 }, (_, i) => ({ id: i }));
    expect(kpiInternals(kpi)._computeValue()).toBe(3080);

    // Une recherche ou une facette relance le fetch : la source repose sa
    // meta AVANT d'emettre, le KPI lit la nouvelle valeur.
    setDataMeta('srv', { page: 1, pageSize: 50, total: 41, serverSide: true });
    kpiInternals(kpi)._sourceData = Array.from({ length: 41 }, (_, i) => ({ id: i }));
    expect(kpiInternals(kpi)._computeValue()).toBe(41);
  });

  it('suit la meta à travers un dsfr-data-search server-search abonné via le bus', () => {
    const search = new DsfrDataSearch();
    search.id = 'searched';
    search.source = 'srv';
    search.serverSearch = true;
    document.body.appendChild(search);

    kpi.source = 'searched';
    document.body.appendChild(kpi);

    setDataMeta('srv', { page: 1, pageSize: 50, total: 3080, serverSide: true });
    dispatchDataLoaded(
      'srv',
      Array.from({ length: 50 }, (_, i) => ({ id: i }))
    );
    expect(kpiInternals(kpi)._computeValue()).toBe(3080);

    setDataMeta('srv', { page: 1, pageSize: 50, total: 7, serverSide: true });
    dispatchDataLoaded(
      'srv',
      Array.from({ length: 7 }, (_, i) => ({ id: i }))
    );
    expect(kpiInternals(kpi)._computeValue()).toBe(7);

    kpi.remove();
    search.remove();
  });

  it('AC : sur une source non paginée sans meta = nombre de lignes', () => {
    kpi.source = 'src';
    kpiInternals(kpi)._sourceData = ACTIVITES;

    expect(kpiInternals(kpi)._computeValue()).toBe(28);
  });

  it('sans données : null (comme les autres expressions)', () => {
    kpi.source = 'src';
    expect(kpiInternals(kpi)._computeValue()).toBeNull();
  });

  it('n’est pas une erreur de configuration (#649 ne la rejette pas)', () => {
    kpi.source = 'src';
    kpiInternals(kpi)._validateConfig();
    expect(kpiInternals(kpi)._blockingConfigError).toBeNull();
    expect(kpi.hasAttribute('data-dsfr-config-error')).toBe(false);
  });
});

describe('#659 — la trace montre la troncature par limit sur la query', () => {
  let host: HTMLElement | undefined;
  let recorder: DataflowRecorder | undefined;

  afterEach(() => {
    recorder?.stop();
    host?.remove();
    cleanup();
  });

  it('« tronqué à 12 / 28 lignes (attribut limit) »', () => {
    host = document.createElement('div');
    host.innerHTML = `
      <dsfr-data-source id="src" api-type="opendatasoft" dataset-id="ds"></dsfr-data-source>
      <dsfr-data-query id="top12" source="src" limit="12"></dsfr-data-query>
      <dsfr-data-kpi source="top12" value="count"></dsfr-data-kpi>
    `;
    document.body.appendChild(host);
    recorder = new DataflowRecorder({ root: document.body });
    recorder.start();

    setDataMeta('src', { page: 1, pageSize: 0, total: 28, serverSide: false });
    dispatchDataLoaded('src', ACTIVITES);
    setDataMeta('top12', { page: 1, pageSize: 0, total: 28, serverSide: false, truncated: true });
    dispatchDataLoaded('top12', ACTIVITES.slice(0, 12));

    const trace = recorder.snapshot();
    const text = formatTrace(trace);

    expect(text).toContain('⚠ tronqué à 12 / 28 lignes (attribut limit)');
    expect(summarizeTrace(trace).alerts).toBe(1);
  });
});
