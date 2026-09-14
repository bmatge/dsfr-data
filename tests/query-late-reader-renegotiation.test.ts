import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * #853 — un lecteur qui n'est PAS une query, ajouté après l'initialisation,
 * conteste la délégation (forme tardive de #765, constat BUG-009 du banc).
 *
 * `dsfr-data-delegation-contested` n'avait qu'un seul émetteur : une AUTRE
 * `dsfr-data-query` pendant sa propre négociation. Un KPI, une liste ou un
 * graphique inséré après coup ne négociait rien — l'overlay `group_by` restait
 * posé et le KPI comptait les GROUPES. Mesure du banc : 8 au lieu de 137.
 */

const urls: string[] = [];
const RAW = [
  { region: 'IDF', population: 10 },
  { region: 'IDF', population: 20 },
  { region: 'BRE', population: 5 },
];
globalThis.fetch = vi.fn(async (u: RequestInfo | URL) => {
  const url = decodeURIComponent(String(u));
  urls.push(url);
  const gb = new URL(url).searchParams.get('group_by');
  const rows = gb
    ? [...new Set(RAW.map((r) => r.region))].map((k) => ({
        region: k,
        population__sum: RAW.filter((r) => r.region === k).reduce((a, r) => a + r.population, 0),
      }))
    : RAW;
  return {
    ok: true,
    status: 200,
    json: async () => ({ total_count: rows.length, results: rows }),
  } as unknown as Response;
}) as unknown as typeof fetch;

import { DsfrDataSource } from '@/components/dsfr-data-source.js';
import { DsfrDataQuery } from '@/components/dsfr-data-query.js';
import { DsfrDataKpi } from '@/components/dsfr-data-kpi.js';
import { DsfrDataNormalize } from '@/components/dsfr-data-normalize.js';
import { getDataCache, clearDataCache, clearDataMeta } from '@/utils/data-bridge.js';

const until = async (cond: () => boolean) => {
  await vi.waitFor(() => expect(cond()).toBe(true), { timeout: 2_000, interval: 5 });
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
};
const hasRows = (id: string) => {
  const rows = getDataCache(id);
  return Array.isArray(rows) && rows.length > 0;
};

const mounted: Element[] = [];
const ids: string[] = [];
let seq = 0;

function source(): DsfrDataSource {
  seq += 1;
  const src = new DsfrDataSource();
  src.id = `late-src-${seq}`;
  src.setAttribute('api-type', 'opendatasoft');
  src.setAttribute('base-url', 'https://ods.example');
  src.setAttribute('dataset-id', 'jeu');
  ids.push(src.id);
  return src;
}
function query(sourceId: string): DsfrDataQuery {
  const q = new DsfrDataQuery();
  q.id = `late-q-${seq}`;
  q.source = sourceId;
  q.groupBy = 'region';
  q.aggregate = 'population:sum';
  ids.push(q.id);
  return q;
}
function kpi(sourceId: string): DsfrDataKpi {
  const k = new DsfrDataKpi();
  k.source = sourceId;
  k.setAttribute('source', sourceId);
  k.value = 'count';
  return k;
}
function mount(...els: Element[]) {
  document.body.append(...els);
  mounted.push(...els);
}

beforeEach(() => {
  urls.length = 0;
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  for (const el of mounted.splice(0)) el.remove();
  for (const id of ids.splice(0)) {
    clearDataCache(id);
    clearDataMeta(id);
  }
  vi.restoreAllMocks();
});

describe('#853 — un lecteur tardif conteste la délégation', () => {
  it('un KPI ajouté après coup fait libérer l’overlay group_by', async () => {
    const src = source();
    const q = query(src.id);
    mount(src, q);
    await until(() => hasRows(q.id));
    // Seule lectrice : elle a délégué.
    expect(urls.some((u) => u.includes('group_by=region'))).toBe(true);

    // Le KPI arrive ensuite — et il n'y a AUCUNE autre query pour émettre la
    // contestation : c'est son inscription au registre qui la déclenche.
    const k = kpi(src.id);
    mount(k);
    await until(() => !urls[urls.length - 1].includes('group_by'));

    expect(getDataCache(src.id)).toEqual(RAW);
    // Le KPI compte les LIGNES, pas les groupes.
    await until(() => k.querySelector('.dsfr-data-kpi__value') !== null);
    expect(k.querySelector('.dsfr-data-kpi__value')?.textContent?.trim()).toBe('3');
    // Et la query garde ses propres chiffres, recalculés côté client.
    expect(getDataCache(q.id)).toEqual([
      { region: 'IDF', population__sum: 30 },
      { region: 'BRE', population__sum: 5 },
    ]);
  });

  it('le lecteur tardif est vu à travers un relais', async () => {
    const src = source();
    const norm = new DsfrDataNormalize();
    norm.id = `late-norm-${seq}`;
    norm.source = src.id;
    ids.push(norm.id);
    const q = query(norm.id);
    mount(src, norm, q);
    await until(() => hasRows(q.id));
    expect(urls.some((u) => u.includes('group_by=region'))).toBe(true);

    // Le KPI lit la SOURCE, deux maillons plus haut que la query.
    mount(kpi(src.id));
    await until(() => !urls[urls.length - 1].includes('group_by'));
    expect(getDataCache(src.id)).toEqual(RAW);
  });

  it('un lecteur d’une AUTRE chaîne ne fait rien renégocier', async () => {
    const src = source();
    const q = query(src.id);
    mount(src, q);
    await until(() => hasRows(q.id));
    const avant = urls.length;

    mount(kpi('une-source-etrangere'));
    await new Promise((r) => setTimeout(r, 20));

    expect(urls.length).toBe(avant);
    expect(urls[urls.length - 1]).toContain('group_by=region');
  });
});
