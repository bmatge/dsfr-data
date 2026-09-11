import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * #765 — une dsfr-data-query ne délègue plus son group-by (ni son agrégat, ni
 * son tri) à une source que d'autres composants lisent.
 *
 * La source n'a qu'UN regroupement serveur, sans clé d'émetteur (le where,
 * lui, est clé depuis ADR-031), et elle sert ses lignes à TOUS ses abonnés.
 * Mesuré sur un tableau de bord exporté par le Studio (plan-de-relance,
 * bibliothèque 0.28.1, navigateur réel) : une seule requête
 * `group_by=type_entreprise`, KPI « projets » à 11 au lieu de 3 080, et le
 * graphique « par région » affichant les groupes du graphique « par type ».
 */

const urls: string[] = [];

/** Faux portail ODS : regroupe vraiment selon `group_by`. */
const RAW = [
  { region: 'IDF', type: 'PME', population: 10 },
  { region: 'IDF', type: 'ETI', population: 20 },
  { region: 'BRE', type: 'PME', population: 5 },
];
function odsResponse(url: string) {
  const gb = new URL(url).searchParams.get('group_by');
  const rows = gb
    ? [...new Set(RAW.map((r) => r[gb as 'region' | 'type']))].map((k) => ({
        [gb]: k,
        population__sum: RAW.filter((r) => r[gb as 'region' | 'type'] === k).reduce(
          (a, r) => a + r.population,
          0
        ),
      }))
    : RAW;
  return { ok: true, status: 200, json: async () => ({ total_count: rows.length, results: rows }) };
}
globalThis.fetch = vi.fn(async (u: RequestInfo | URL) => {
  urls.push(decodeURIComponent(String(u)));
  return odsResponse(String(u)) as unknown as Response;
}) as unknown as typeof fetch;

import { DsfrDataSource } from '@/components/dsfr-data-source.js';
import { DsfrDataQuery } from '@/components/dsfr-data-query.js';
import { DsfrDataNormalize } from '@/components/dsfr-data-normalize.js';
import { getDataCache, clearDataCache, clearDataMeta } from '@/utils/data-bridge.js';

const settle = async () => {
  for (let i = 0; i < 25; i++) await new Promise((r) => setTimeout(r, 5));
};

let seq = 0;
const mounted: Element[] = [];
const ids: string[] = [];

function source(): DsfrDataSource {
  seq += 1;
  const src = new DsfrDataSource();
  src.id = `sh-src-${seq}`;
  src.setAttribute('api-type', 'opendatasoft');
  src.setAttribute('base-url', 'https://ods.example');
  src.setAttribute('dataset-id', 'jeu');
  ids.push(src.id);
  return src;
}
function query(id: string, sourceId: string, groupBy: string): DsfrDataQuery {
  const q = new DsfrDataQuery();
  q.id = `${id}-${seq}`;
  q.source = sourceId;
  q.groupBy = groupBy;
  q.aggregate = 'population:sum';
  ids.push(q.id);
  return q;
}
function reader(sourceId: string): HTMLElement {
  // Un lecteur quelconque de la source (un KPI dans l'export du Studio) :
  // seul l'attribut `source` compte pour la négociation.
  const el = document.createElement('dsfr-data-kpi-stub');
  el.setAttribute('source', sourceId);
  return el;
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

describe('#765 — source partagée : pas de délégation', () => {
  it('deux graphiques + un lecteur : chacun ses groupes, la source garde les lignes brutes', async () => {
    const src = source();
    const qRegion = query('q-region', src.id, 'region');
    const qType = query('q-type', src.id, 'type');
    // Page statique : tous les éléments présents avant l'initialisation.
    const kpi = reader(src.id);
    mount(src, kpi, qRegion, qType);
    await settle();

    expect(urls.some((u) => u.includes('group_by'))).toBe(false);
    expect(getDataCache(src.id)).toEqual(RAW);
    expect(getDataCache(qRegion.id)).toEqual([
      { region: 'IDF', population__sum: 30 },
      { region: 'BRE', population__sum: 5 },
    ]);
    expect(getDataCache(qType.id)).toEqual([
      { type: 'PME', population__sum: 15 },
      { type: 'ETI', population__sum: 20 },
    ]);
  });

  it('l’avertissement nomme la source, les autres lecteurs et la voie : une source dédiée', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const src = source();
    const qRegion = query('q-region', src.id, 'region');
    mount(src, reader(src.id), qRegion);
    await settle();
    const message = warn.mock.calls.map((c) => String(c[0])).find((m) => m.includes('#765')) ?? '';
    expect(message).toContain(`dsfr-data-query[${qRegion.id}]`);
    expect(message).toContain(`"${src.id}"`);
    expect(message).toContain('kpi-stub');
    expect(message).toContain('sa propre');
  });

  it('seule lectrice de sa source, la query délègue comme avant', async () => {
    const src = source();
    const q = query('q-seule', src.id, 'region');
    mount(src, q);
    await settle();
    expect(urls.some((u) => u.includes('group_by=region'))).toBe(true);
    expect(getDataCache(q.id)).toEqual([
      { region: 'IDF', population__sum: 30 },
      { region: 'BRE', population__sum: 5 },
    ]);
  });

  it('le partage est vu à travers un transformateur qui relaie (normalize)', async () => {
    const src = source();
    const norm = new DsfrDataNormalize();
    norm.id = `sh-norm-${seq}`;
    norm.source = src.id;
    ids.push(norm.id);
    const q = query('q-norm', norm.id, 'region');
    mount(src, norm, reader(src.id), q);
    await settle();
    expect(urls.some((u) => u.includes('group_by'))).toBe(false);
    expect(getDataCache(src.id)).toEqual(RAW);
  });

  it('un lecteur ajouté après coup fait renégocier la query qui déléguait', async () => {
    const src = source();
    const qRegion = query('q-region', src.id, 'region');
    mount(src, qRegion);
    await settle();
    expect(urls.some((u) => u.includes('group_by=region'))).toBe(true);

    // Arrivent ensuite un lecteur et une seconde query : la seconde trouve la
    // chaîne partagée et le signale, la première libère ses overlays.
    const qType = query('q-type', src.id, 'type');
    mount(reader(src.id), qType);
    await settle();

    expect(urls[urls.length - 1]).not.toContain('group_by');
    expect(getDataCache(src.id)).toEqual(RAW);
    expect(getDataCache(qRegion.id)).toEqual([
      { region: 'IDF', population__sum: 30 },
      { region: 'BRE', population__sum: 5 },
    ]);
    expect(getDataCache(qType.id)).toEqual([
      { type: 'PME', population__sum: 15 },
      { type: 'ETI', population__sum: 20 },
    ]);
  });
});
