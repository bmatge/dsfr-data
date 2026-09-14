import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * #855 — la délégation traverse un relais (`dsfr-data-normalize`).
 *
 * La promesse était écrite partout : `relayTargetOf` liste
 * `dsfr-data-normalize`, le JSDoc de `source` l'annonce, `getAdapter()` parle
 * de « délégation transparente », `TransformerMixin` relaie les commandes. Et
 * pourtant, sur une page réelle, aucune URL ne portait `group_by` : deux
 * `/records` nus, le jeu entier rapatrié puis regroupé dans le navigateur.
 *
 * La cause n'était pas le relais mais le REHAUSSEMENT. L'ordre des
 * `customElements.define` (l'ordre des exports de `index.ts`) définit
 * `dsfr-data-query` avant `dsfr-data-normalize` : au moment où la query
 * négociait, son amont était encore un `HTMLElement` nu, sans `getAdapter()`.
 * Faute d'adaptateur, aucune délégation — et plus rien pour la refaire.
 *
 * Le registre d'instances (#836) donne le signal manquant : le maillon
 * s'inscrit en se faisant rehausser, la query renégocie.
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

function mount(...els: Element[]) {
  document.body.append(...els);
  mounted.push(...els);
}

beforeEach(() => {
  urls.length = 0;
  seq += 1;
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

describe('#855 — la délégation franchit un relais', () => {
  it('query → normalize → source : la commande atteint la source', async () => {
    const src = new DsfrDataSource();
    src.id = `rel-src-${seq}`;
    src.setAttribute('api-type', 'opendatasoft');
    src.setAttribute('base-url', 'https://ods.example');
    src.setAttribute('dataset-id', 'jeu');
    const norm = new DsfrDataNormalize();
    norm.id = `rel-norm-${seq}`;
    norm.source = src.id;
    norm.numeric = 'population';
    const q = new DsfrDataQuery();
    q.id = `rel-q-${seq}`;
    q.source = norm.id;
    q.groupBy = 'region';
    q.aggregate = 'population:sum';
    ids.push(src.id, norm.id, q.id);

    mount(src, norm, q);
    await until(() => hasRows(q.id));

    expect(urls.some((u) => u.includes('group_by=region'))).toBe(true);
    expect(getDataCache(q.id)).toEqual([
      { region: 'IDF', population__sum: 30 },
      { region: 'BRE', population__sum: 5 },
    ]);
  });

  it('le maillon arrivé APRÈS la query fait renégocier (rehaussement tardif)', async () => {
    // La forme du défaut : au moment où la query négocie, son amont n'est pas
    // encore utilisable (ici : pas encore dans le document ; en page réelle :
    // pas encore rehaussé). Sans le signal du registre, la query resterait
    // client-side pour toujours.
    const src = new DsfrDataSource();
    src.id = `tard-src-${seq}`;
    src.setAttribute('api-type', 'opendatasoft');
    src.setAttribute('base-url', 'https://ods.example');
    src.setAttribute('dataset-id', 'jeu');
    const q = new DsfrDataQuery();
    q.id = `tard-q-${seq}`;
    q.source = `tard-norm-${seq}`;
    q.groupBy = 'region';
    q.aggregate = 'population:sum';
    ids.push(src.id, `tard-norm-${seq}`, q.id);

    mount(src, q);
    await new Promise((r) => setTimeout(r, 0));
    expect(urls.some((u) => u.includes('group_by'))).toBe(false);

    const norm = new DsfrDataNormalize();
    norm.id = `tard-norm-${seq}`;
    norm.source = src.id;
    norm.numeric = 'population';
    mount(norm);

    await until(() => urls.some((u) => u.includes('group_by=region')));
    expect(getDataCache(q.id)).toEqual([
      { region: 'IDF', population__sum: 30 },
      { region: 'BRE', population__sum: 5 },
    ]);
  });

  it('#394 tient : un normalize qui renomme des colonnes ne délègue rien', async () => {
    const src = new DsfrDataSource();
    src.id = `ren-src-${seq}`;
    src.setAttribute('api-type', 'opendatasoft');
    src.setAttribute('base-url', 'https://ods.example');
    src.setAttribute('dataset-id', 'jeu');
    const norm = new DsfrDataNormalize();
    norm.id = `ren-norm-${seq}`;
    norm.source = src.id;
    norm.rename = 'region:zone';
    const q = new DsfrDataQuery();
    q.id = `ren-q-${seq}`;
    q.source = norm.id;
    q.groupBy = 'zone';
    q.aggregate = 'population:sum';
    ids.push(src.id, norm.id, q.id);

    mount(src, norm, q);
    await until(() => hasRows(q.id));

    expect(urls.some((u) => u.includes('group_by'))).toBe(false);
    expect(getDataCache(q.id)).toEqual([
      { zone: 'IDF', population__sum: 30 },
      { zone: 'BRE', population__sum: 5 },
    ]);
  });
});
