import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * #856 / #854 — un `where` SEUL (sans `group-by`) part au serveur.
 *
 * `cmd.where` n'était posé que dans la branche `if (this.groupBy && …)` de
 * `_negotiateServerSide` : une query à `where` seul rapatriait le jeu entier
 * pour en garder une poignée (137 lignes pour 20, mesure du banc d'essai), et
 * une source `require-where` restait en attente pour toujours — sans message,
 * alors que son JSDoc rangeait explicitement « la délégation d'un
 * dsfr-data-query » parmi les filtres qui lèvent l'attente (#854).
 *
 * La clause est posée en overlay CLÉ PAR ÉMETTEUR (ADR-031), donc fusionnable
 * avec celles des facettes, de la recherche et du contexte — à la différence
 * du regroupement, qui n'a qu'UN emplacement sur la source (#765).
 */

const urls: string[] = [];
const RAW = [
  { region: 'IDF', pays: 'FR', population: 10 },
  { region: 'BRE', pays: 'FR', population: 5 },
  { region: 'BAV', pays: 'DE', population: 7 },
];
/** Clause `where` reellement envoyee, telle que l'API la lirait. */
const whereOf = (url: string) => new URL(url).searchParams.get('where') ?? '';

globalThis.fetch = vi.fn(async (u: RequestInfo | URL) => {
  const url = String(u);
  urls.push(url);
  const where = whereOf(url);
  const m = /pays = "([A-Z]+)"/.exec(where);
  const rows = m ? RAW.filter((r) => r.pays === m[1]) : RAW;
  return {
    ok: true,
    status: 200,
    json: async () => ({ total_count: rows.length, results: rows }),
  } as unknown as Response;
}) as unknown as typeof fetch;

import { DsfrDataSource } from '@/components/dsfr-data-source.js';
import { DsfrDataQuery } from '@/components/dsfr-data-query.js';
import { DsfrDataKpi } from '@/components/dsfr-data-kpi.js';
import { getDataCache, clearDataCache, clearDataMeta, isDataIdle } from '@/utils/data-bridge.js';

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

function source(opts: { requireWhere?: boolean } = {}): DsfrDataSource {
  seq += 1;
  const src = new DsfrDataSource();
  src.id = `wo-src-${seq}`;
  src.setAttribute('api-type', 'opendatasoft');
  src.setAttribute('base-url', 'https://ods.example');
  src.setAttribute('dataset-id', 'jeu');
  if (opts.requireWhere) src.requireWhere = true;
  ids.push(src.id);
  return src;
}
function whereQuery(sourceId: string, where = 'pays:eq:FR'): DsfrDataQuery {
  const q = new DsfrDataQuery();
  q.id = `wo-q-${seq}`;
  q.source = sourceId;
  q.where = where;
  ids.push(q.id);
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

describe('#856 — un where seul est délégué', () => {
  it('seule lectrice : la clause part au serveur, traduite en ODSQL', async () => {
    const src = source();
    const q = whereQuery(src.id);
    mount(src, q);
    await until(() => hasRows(q.id));

    expect(urls.every((u) => whereOf(u) === 'pays = "FR"')).toBe(true);
    expect(getDataCache(q.id)).toEqual(RAW.filter((r) => r.pays === 'FR'));
  });

  it('chaîne partagée : la clause reste dans le navigateur (#765)', async () => {
    const src = source();
    const q = whereQuery(src.id);
    const kpi = new DsfrDataKpi();
    kpi.source = src.id;
    kpi.setAttribute('source', src.id);
    kpi.value = 'count';
    mount(src, kpi, q);
    await until(() => hasRows(q.id));

    // Le KPI voisin compte les TROIS lignes : la source n'a pas été filtrée
    // pour le compte de la query.
    expect(urls.some((u) => whereOf(u) !== '')).toBe(false);
    expect(getDataCache(src.id)).toEqual(RAW);
    expect(getDataCache(q.id)).toEqual(RAW.filter((r) => r.pays === 'FR'));
  });

  it('un lecteur tardif fait libérer la clause déléguée', async () => {
    const src = source();
    const q = whereQuery(src.id);
    mount(src, q);
    await until(() => hasRows(q.id));
    expect(whereOf(urls[urls.length - 1])).toBe('pays = "FR"');

    const kpi = new DsfrDataKpi();
    kpi.source = src.id;
    kpi.setAttribute('source', src.id);
    kpi.value = 'count';
    mount(kpi);

    await until(() => whereOf(urls[urls.length - 1]) === '');
    expect(getDataCache(src.id)).toEqual(RAW);
    expect(getDataCache(q.id)).toEqual(RAW.filter((r) => r.pays === 'FR'));
  });

  it('une clause intraduisible ne délègue rien et le chiffre reste juste', async () => {
    const src = source();
    const q = whereQuery(src.id, 'pays:inconnu:FR');
    mount(src, q);
    await until(() => urls.length > 0);
    await new Promise((r) => setTimeout(r, 0));

    expect(urls.some((u) => whereOf(u) !== '')).toBe(false);
  });
});

describe('#854 — require-where est levé par la délégation', () => {
  it('la source attend, puis part filtrée : aucune requête nue', async () => {
    const src = source({ requireWhere: true });
    const q = whereQuery(src.id);
    mount(src, q);
    await until(() => hasRows(q.id));

    expect(urls.length).toBeGreaterThan(0);
    expect(urls.every((u) => whereOf(u) === 'pays = "FR"')).toBe(true);
    expect(isDataIdle(src.id)).toBe(false);
    expect(getDataCache(q.id)).toEqual(RAW.filter((r) => r.pays === 'FR'));
  });

  it('sans clause à déléguer, l’attente tient toujours (#690)', async () => {
    const src = source({ requireWhere: true });
    const q = whereQuery(src.id, '');
    mount(src, q);
    await until(() => isDataIdle(src.id));

    expect(urls).toEqual([]);
  });
});
