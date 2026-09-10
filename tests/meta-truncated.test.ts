import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * #658 — `meta.truncated` et ligne Diagnostic quand `max-records` tronque.
 *
 * Le `console.warn` de troncature existait deja (#233) mais aucun signal
 * structure : depuis 0.21.0 la trace affichait « meta : total 3080 » face a
 * « 1000 lignes » sans qualifier la troncature. La source pose desormais
 * `truncated` dans sa meta, et `formatTrace` le rend en alerte nommant la
 * cause (plafond max-records ou attribut limit).
 */

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

import { OpenDataSoftAdapter } from '@/adapters/opendatasoft-adapter.js';
import { DsfrDataSource } from '@/components/dsfr-data-source.js';
import {
  clearDataCache,
  clearDataMeta,
  dispatchDataLoaded,
  getDataMeta,
  setDataMeta,
} from '@/utils/data-bridge.js';
import { DataflowRecorder, formatTrace, summarizeTrace } from '@dsfr-data/shared';

/** Vue interne : declenchement du fetch sans passer par le cycle Lit. */
interface SourceInternals {
  _fetchData(): Promise<void>;
}
const internals = (el: DsfrDataSource) => el as unknown as SourceInternals;

/** API ODS de `total` records servis par pages de 100. */
function mockOdsDataset(total: number) {
  mockFetch.mockReset();
  mockFetch.mockImplementation(async (url: string) => {
    const u = new URL(url);
    const offset = parseInt(u.searchParams.get('offset') || '0', 10);
    const limit = parseInt(u.searchParams.get('limit') || '100', 10);
    const count = Math.max(0, Math.min(limit, total - offset));
    return {
      ok: true,
      json: async () => ({
        total_count: total,
        results: Array.from({ length: count }, (_, i) => ({ id: offset + i })),
      }),
    };
  });
}

/** API ODS group_by : total_count = taille de page (#641), pages toujours pleines. */
function mockOdsGroupedEndless() {
  mockFetch.mockReset();
  mockFetch.mockImplementation(async (url: string) => {
    const u = new URL(url);
    const limit = parseInt(u.searchParams.get('limit') || '100', 10);
    return {
      ok: true,
      json: async () => ({
        total_count: limit,
        results: Array.from({ length: limit }, (_, i) => ({ g: `g${i}`, n: 1 })),
      }),
    };
  });
}

const PARAMS = {
  baseUrl: 'https://data.example.fr',
  datasetId: 'ds',
  resource: '',
  select: '',
  where: '',
  filter: '',
  groupBy: '',
  aggregate: '',
  orderBy: '',
  limit: 0,
  transform: '',
  pageSize: 0,
};

function makeSource(id: string): DsfrDataSource {
  const source = new DsfrDataSource();
  source.id = id;
  source.apiType = 'opendatasoft';
  source.baseUrl = 'https://data.example.fr';
  source.datasetId = 'ds';
  return source;
}

describe('#658 — adapter ODS : signal de troncature quand le total est inconnu', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => warnSpy.mockRestore());

  it('group_by plafonné sur une page pleine → truncated: true, totalCount inconnu', async () => {
    mockOdsGroupedEndless();
    const adapter = new OpenDataSoftAdapter();

    const result = await adapter.fetchAll(
      { ...PARAMS, groupBy: 'g', maxRecords: 200 },
      new AbortController().signal
    );

    expect(result.data).toHaveLength(200);
    expect(result.totalCount).toBeUndefined();
    expect(result.truncated).toBe(true);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('plafond max-records'));
  });

  it('jeu complet → pas de signal de troncature', async () => {
    mockOdsDataset(150);
    const adapter = new OpenDataSoftAdapter();

    const result = await adapter.fetchAll(PARAMS, new AbortController().signal);

    expect(result.data).toHaveLength(150);
    expect(result.totalCount).toBe(150);
    expect(result.truncated).toBeUndefined();
  });
});

describe('#658 — dsfr-data-source pose meta.truncated', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    warnSpy.mockRestore();
    for (const id of ['t-src', 't-full', 't-grouped', 't-limit']) {
      clearDataCache(id);
      clearDataMeta(id);
    }
  });

  it('AC : source plafonnée (2500 lignes, cap 1000) → getDataMeta(id).truncated === true', async () => {
    mockOdsDataset(2500);
    const source = makeSource('t-src');

    await internals(source)._fetchData();

    const meta = getDataMeta('t-src');
    expect(meta).toMatchObject({ serverSide: false, total: 2500, truncated: true });
  });

  it('jeu entièrement rapatrié → pas de truncated', async () => {
    mockOdsDataset(250);
    const source = makeSource('t-full');

    await internals(source)._fetchData();

    const meta = getDataMeta('t-full');
    expect(meta!.total).toBe(250);
    expect(meta!.truncated).toBeUndefined();
  });

  it('group_by au plafond (total inconnu, #641) → truncated posé depuis le signal adapter', async () => {
    mockOdsGroupedEndless();
    const source = makeSource('t-grouped');
    source.groupBy = 'g';
    source.maxRecords = 200;

    await internals(source)._fetchData();

    const meta = getDataMeta('t-grouped');
    expect(meta!.total).toBeUndefined();
    expect(meta!.truncated).toBe(true);
  });

  it('limit explicite sous le total → truncated aussi (la meta dit ce qui manque)', async () => {
    mockOdsDataset(2500);
    const source = makeSource('t-limit');
    source.limit = 100;

    await internals(source)._fetchData();

    expect(getDataMeta('t-limit')).toMatchObject({ total: 2500, truncated: true });
  });
});

describe('#658 — la trace rend la troncature en alerte', () => {
  let host: HTMLElement | undefined;
  let recorder: DataflowRecorder | undefined;

  afterEach(() => {
    recorder?.stop();
    recorder = undefined;
    host?.remove();
    host = undefined;
    for (const id of ['src', 'srcg', 'srcl', 'q1']) {
      clearDataCache(id);
      clearDataMeta(id);
    }
  });

  function mount(html: string) {
    host = document.createElement('div');
    host.innerHTML = html;
    document.body.appendChild(host);
    recorder = new DataflowRecorder({ root: document.body });
    recorder.start();
  }

  it('« tronqué à 1 000 / 3 080 lignes (plafond max-records …) », comptée comme alerte', () => {
    mount(`<dsfr-data-source id="src" api-type="opendatasoft" dataset-id="ds"></dsfr-data-source>`);
    setDataMeta('src', { page: 1, pageSize: 0, total: 3080, serverSide: false, truncated: true });
    dispatchDataLoaded(
      'src',
      Array.from({ length: 1000 }, (_, i) => ({ id: i }))
    );

    const trace = recorder!.snapshot();
    const text = formatTrace(trace);

    expect(text).toContain('⚠ tronqué à 1 000 / 3 080 lignes (plafond max-records');
    expect(text).toContain('relevable');
    expect(summarizeTrace(trace).alerts).toBe(1);
  });

  it('nomme la valeur de max-records quand elle est posée, et limit quand c’est lui', () => {
    mount(`
      <dsfr-data-source id="srcg" api-type="opendatasoft" dataset-id="ds" max-records="200"></dsfr-data-source>
      <dsfr-data-source id="srcl" api-type="opendatasoft" dataset-id="ds" limit="100"></dsfr-data-source>
    `);
    setDataMeta('srcg', { page: 1, pageSize: 0, serverSide: false, truncated: true });
    dispatchDataLoaded(
      'srcg',
      Array.from({ length: 200 }, (_, i) => ({ g: i }))
    );
    setDataMeta('srcl', { page: 1, pageSize: 0, total: 2500, serverSide: false, truncated: true });
    dispatchDataLoaded(
      'srcl',
      Array.from({ length: 100 }, (_, i) => ({ id: i }))
    );

    const text = formatTrace(recorder!.snapshot());

    // Total inconnu (group_by) : pas de denominateur, mais l'alerte est la.
    expect(text).toContain('⚠ tronqué à 200 (total inconnu) lignes (plafond max-records="200")');
    expect(text).toContain('⚠ tronqué à 100 / 2 500 lignes (attribut limit)');
  });

  it('ne dit rien quand la meta n’est pas tronquée', () => {
    mount(`<dsfr-data-source id="src" api-type="opendatasoft" dataset-id="ds"></dsfr-data-source>`);
    setDataMeta('src', { page: 1, pageSize: 0, total: 3, serverSide: false });
    dispatchDataLoaded('src', [{ id: 1 }, { id: 2 }, { id: 3 }]);

    const trace = recorder!.snapshot();
    expect(formatTrace(trace)).not.toContain('tronqué');
    expect(summarizeTrace(trace).alerts).toBe(0);
  });
});
