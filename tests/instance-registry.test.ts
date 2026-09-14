import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * #836 — le registre d'instances `dsfr-data-*`.
 *
 * `dsfr-data-query` doit savoir qui lit sa chaîne avant de déléguer un
 * regroupement au serveur (#765). La réponse se lisait par un
 * `document.querySelectorAll('*')` PAR SAUT DE CHAÎNE, refait à chaque
 * négociation et à chaque contestation : sur un tableau de bord de vingt
 * requêtes et quelques milliers de nœuds, autant de balayages complets du DOM
 * à l'initialisation. Ce fichier tient les deux bouts : le registre dit la
 * même chose que le balayage, et le balayage a disparu.
 */

const urls: string[] = [];
const RAW = [
  { region: 'IDF', population: 10 },
  { region: 'BRE', population: 5 },
];
globalThis.fetch = vi.fn(async (u: RequestInfo | URL) => {
  urls.push(decodeURIComponent(String(u)));
  return {
    ok: true,
    status: 200,
    json: async () => ({ total_count: RAW.length, results: RAW }),
  } as unknown as Response;
}) as unknown as typeof fetch;

import { DsfrDataSource } from '@/components/dsfr-data-source.js';
import { DsfrDataQuery } from '@/components/dsfr-data-query.js';
import { DsfrDataKpi } from '@/components/dsfr-data-kpi.js';
import { DsfrDataNormalize } from '@/components/dsfr-data-normalize.js';
import { dsfrDataInstances } from '@/utils/instance-registry.js';
import { clearDataCache, clearDataMeta } from '@/utils/data-bridge.js';

const mounted: Element[] = [];
const ids: string[] = [];

function source(id: string): DsfrDataSource {
  const src = new DsfrDataSource();
  src.id = id;
  src.setAttribute('api-type', 'opendatasoft');
  src.setAttribute('base-url', 'https://ods.example');
  src.setAttribute('dataset-id', 'jeu');
  ids.push(id);
  return src;
}
function query(id: string, sourceId: string): DsfrDataQuery {
  const q = new DsfrDataQuery();
  q.id = id;
  q.source = sourceId;
  q.groupBy = 'region';
  q.aggregate = 'population:sum';
  ids.push(id);
  return q;
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

describe('#836 — registre des instances dsfr-data-*', () => {
  it('un composant s’inscrit au montage et se retire au démontage', () => {
    const avant = dsfrDataInstances().size;
    const kpi = new DsfrDataKpi();
    kpi.source = 'peu-importe';
    mount(kpi);
    expect(dsfrDataInstances().has(kpi)).toBe(true);
    expect(dsfrDataInstances().size).toBe(avant + 1);

    kpi.remove();
    mounted.splice(mounted.indexOf(kpi), 1);
    expect(dsfrDataInstances().has(kpi)).toBe(false);
    expect(dsfrDataInstances().size).toBe(avant);
  });

  it('les trois familles s’inscrivent : transformateur, afficheur, relais', () => {
    const src = source('reg-src');
    const norm = new DsfrDataNormalize();
    norm.id = 'reg-norm';
    norm.source = 'reg-src';
    ids.push(norm.id);
    const q = query('reg-q', 'reg-norm');
    const kpi = new DsfrDataKpi();
    kpi.source = 'reg-norm';
    kpi.value = 'count';
    mount(src, norm, q, kpi);

    // La source ne LIT aucune chaîne : elle n'a pas à figurer au registre.
    expect(dsfrDataInstances().has(src)).toBe(false);
    for (const el of [norm, q, kpi]) expect(dsfrDataInstances().has(el)).toBe(true);
  });

  it('un élément inerte au bon « source » n’est pas un lecteur', () => {
    // Le balayage du DOM comptait toute balise `dsfr-data-*`, rehaussée ou
    // non. Un élément qu'aucune définition ne rehausse n'affiche rien et ne
    // lit rien : il ne conteste aucune délégation.
    const inerte = document.createElement('dsfr-data-inconnu');
    inerte.setAttribute('source', 'reg-src2');
    mount(inerte);
    expect(dsfrDataInstances().has(inerte)).toBe(false);
  });
});

describe('#836 — la négociation ne balaie plus le document', () => {
  it('vingt queries et deux mille nœuds : aucun querySelectorAll', async () => {
    // Le décor : deux mille nœuds ordinaires, que le balayage visitait à
    // chaque saut de chaîne de chaque query.
    const decor = document.createElement('div');
    for (let i = 0; i < 2_000; i++) decor.append(document.createElement('span'));
    mount(decor);

    const sources: DsfrDataSource[] = [];
    const queries: DsfrDataQuery[] = [];
    for (let i = 0; i < 20; i++) {
      sources.push(source(`perf-src-${i}`));
      queries.push(query(`perf-q-${i}`, `perf-src-${i}`));
    }

    const scan = vi.spyOn(document, 'querySelectorAll');
    mount(...sources, ...queries);
    // Et la renégociation, qui repassait par le même balayage : un lecteur
    // tardif sur chaque chaîne.
    for (let i = 0; i < 20; i++) {
      const kpi = new DsfrDataKpi();
      kpi.source = `perf-src-${i}`;
      kpi.value = 'count';
      mount(kpi);
    }
    await vi.waitFor(() => expect(urls.length).toBeGreaterThan(0), { timeout: 2_000 });

    expect(scan).not.toHaveBeenCalled();
  });
});
