import { describe, it, expect, vi, afterEach } from 'vitest';

/**
 * #900 — l'avertissement #765 « source partagée » était ré-émis une fois par
 * voisin inscrit : O(N²) `console.warn` pour N queries sur une même source
 * (7 139 pour N = 119, mesure du spike #889, motif de #877).
 *
 * La déduplication comparait `${source}|${sharedWith.join(',')}` et
 * `sharedWith` s'allonge d'un élément à chaque lecteur inscrit : la signature
 * changeait donc à chaque inscription et l'avertissement repartait.
 */

const RAW = [
  { region: 'IDF', type: 'PME', population: 10 },
  { region: 'IDF', type: 'ETI', population: 20 },
  { region: 'BRE', type: 'PME', population: 5 },
];
globalThis.fetch = vi.fn(async (u: RequestInfo | URL) => {
  const gb = new URL(decodeURIComponent(String(u))).searchParams.get('group_by');
  const rows = gb
    ? [...new Set(RAW.map((r) => r[gb as 'region' | 'type']))].map((k) => ({ [gb]: k }))
    : RAW;
  return {
    ok: true,
    status: 200,
    json: async () => ({ total_count: rows.length, results: rows }),
  } as unknown as Response;
}) as unknown as typeof fetch;

import { DsfrDataSource } from '@/components/dsfr-data-source.js';
import { DsfrDataQuery } from '@/components/dsfr-data-query.js';
import { getDataCache, clearDataCache, clearDataMeta } from '@/utils/data-bridge.js';

const until = async (cond: () => boolean) => {
  await vi.waitFor(() => expect(cond()).toBe(true), { timeout: 10_000, interval: 5 });
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
};
const hasRows = (id: string) => {
  const rows = getDataCache(id);
  return Array.isArray(rows) && rows.length > 0;
};

const mounted: Element[] = [];
const ids: string[] = [];

afterEach(() => {
  for (const el of mounted.splice(0)) el.remove();
  for (const id of ids.splice(0)) {
    clearDataCache(id);
    clearDataMeta(id);
  }
  vi.restoreAllMocks();
});

const N = 50;

function page(prefix: string) {
  const src = new DsfrDataSource();
  src.id = `${prefix}-src`;
  src.setAttribute('api-type', 'opendatasoft');
  src.setAttribute('base-url', 'https://ods.example');
  src.setAttribute('dataset-id', 'jeu');
  ids.push(src.id);

  const queries: DsfrDataQuery[] = [];
  for (let i = 0; i < N; i++) {
    const q = new DsfrDataQuery();
    q.id = `${prefix}-q-${i}`;
    q.source = src.id;
    q.groupBy = 'region';
    ids.push(q.id);
    queries.push(q);
  }
  return { src, queries };
}

const messagesPartage = (warn: ReturnType<typeof vi.spyOn>) =>
  warn.mock.calls.map((c) => String(c[0])).filter((m) => m.includes('#765'));

describe('#900 — un avertissement par query, pas un par voisin', () => {
  it(`${N} queries sur une source partagée : au plus ${N} avertissements (pas N²/2)`, async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { src, queries } = page('w900');
    document.body.append(src, ...queries);
    mounted.push(src, ...queries);
    await until(() => queries.every((q) => hasRows(q.id)));

    expect(messagesPartage(warn).length).toBeLessThanOrEqual(N);
  });

  it("l'avertissement reste émis, et il nomme la source et un voisin", async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { src, queries } = page('w900-msg');
    document.body.append(src, ...queries);
    mounted.push(src, ...queries);
    await until(() => queries.every((q) => hasRows(q.id)));

    const msgs = messagesPartage(warn);
    expect(msgs.length).toBeGreaterThan(0);
    expect(msgs[0]).toContain(`"${src.id}"`);
    expect(msgs[0]).toContain('query');
  });
});
