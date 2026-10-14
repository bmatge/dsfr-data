import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Compte des abonnements : le module est enveloppé pour TOUS ses importeurs
// (un espion sur l'espace de noms ne verrait pas les appels internes).
const subs = vi.hoisted(() => ({
  opened: new Map<string, number>(),
  live: new Map<string, number>(),
}));
vi.mock('@/utils/data-bridge.js', async (importOriginal) => {
  const orig = await importOriginal<typeof import('@/utils/data-bridge.js')>();
  return {
    ...orig,
    subscribeToSource: (id: string, cbs: Parameters<typeof orig.subscribeToSource>[1]) => {
      subs.opened.set(id, (subs.opened.get(id) ?? 0) + 1);
      subs.live.set(id, (subs.live.get(id) ?? 0) + 1);
      const unsub = orig.subscribeToSource(id, cbs);
      let done = false;
      return () => {
        if (!done) subs.live.set(id, (subs.live.get(id) ?? 0) - 1);
        done = true;
        unsub();
      };
    },
  };
});

/**
 * #1314 — un `source` modifié entre la connexion et le premier rendu.
 *
 * L'init unique au montage (#281) abonne dans `connectedCallback` et consomme
 * le premier `willUpdate` sans rien relire. Un élément créé par script, inséré,
 * puis dont on change `source` dans la même tâche restait donc abonné à la
 * source de l'INSERTION : le premier `willUpdate` portait bien `source`, mais
 * il était sauté. Le contrat : changer `source` à n'importe quel moment
 * réabonne, sans doubler l'abonnement quand rien n'a changé.
 */

// Imports à effet : les classes ne servent qu'en type, l'enregistrement compte.
import '@/components/dsfr-data-kpi.js';
import '@/components/dsfr-data-chart.js';
import '@/components/dsfr-data-query.js';
import '@/components/dsfr-data-join.js';
import type { DsfrDataKpi } from '@/components/dsfr-data-kpi.js';
import type { DsfrDataChart } from '@/components/dsfr-data-chart.js';
import type { DsfrDataQuery } from '@/components/dsfr-data-query.js';
import type { DsfrDataJoin } from '@/components/dsfr-data-join.js';
import {
  clearDataCache,
  clearDataMeta,
  dispatchDataLoaded,
  subscribeToSource,
} from '@/utils/data-bridge.js';

const A = 'spr-a';
const B = 'spr-b';
const ROWS_A = [{ montant: 10 }, { montant: 20 }];
const ROWS_B = [{ montant: 100 }, { montant: 200 }, { montant: 300 }];

interface ChartInternals {
  _data: unknown[];
}

const kpiText = (el: Element) => el.querySelector('.dsfr-data-kpi__value')?.textContent?.trim();

function newKpi(source: string): DsfrDataKpi {
  const el = document.createElement('dsfr-data-kpi') as DsfrDataKpi;
  el.source = source;
  el.value = 'montant:sum';
  return el;
}

/** Abonnements par id : ouverts au total, et encore vivants. */
function spySubscriptions() {
  subs.opened.clear();
  subs.live.clear();
  return {
    to: (id: string) => subs.opened.get(id) ?? 0,
    live: (id: string) => subs.live.get(id) ?? 0,
  };
}

function countEmissions(id: string) {
  const counter = { count: 0, last: null as unknown };
  const unsub = subscribeToSource(id, {
    onLoaded: (d) => {
      counter.count++;
      counter.last = d;
    },
  });
  return { counter, unsub };
}

beforeEach(() => {
  for (const id of [A, B, 'spr-q', 'spr-j', 'spr-r', 'spr-absente']) {
    clearDataCache(id);
    clearDataMeta(id);
  }
  dispatchDataLoaded(A, ROWS_A);
  dispatchDataLoaded(B, ROWS_B);
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('#1314 — KPI : source changée avant le premier rendu', () => {
  it('affiche la nouvelle source (deux sources au cache)', async () => {
    const el = newKpi(A);
    const onData = vi.spyOn(el as unknown as { onSourceData(d: unknown): void }, 'onSourceData');
    const render = vi.spyOn(el as unknown as { render(): unknown }, 'render');
    document.body.appendChild(el);
    el.source = B;
    await el.updateComplete;

    expect(kpiText(el)).toBe('600');
    // Un rendu, pas deux : le réabonnement a lieu dans le cycle déjà prévu.
    expect(render).toHaveBeenCalledTimes(1);
    // Lecture du cache de A à la connexion, puis de B au réabonnement.
    expect(onData.mock.calls.map((c) => c[0])).toEqual([ROWS_A, ROWS_B]);

    // Plus abonné à A : une émission de A ne touche plus le KPI.
    dispatchDataLoaded(A, [{ montant: 1 }]);
    await el.updateComplete;
    expect(kpiText(el)).toBe('600');
    dispatchDataLoaded(B, [{ montant: 7 }]);
    await el.updateComplete;
    expect(kpiText(el)).toBe('7');
  });

  it('un abonnement par source, celui de A refermé', async () => {
    const abos = spySubscriptions();
    const el = newKpi(A);
    document.body.appendChild(el);
    el.source = B;
    await el.updateComplete;
    expect(abos.to(A)).toBe(1);
    expect(abos.to(B)).toBe(1);
    expect(abos.live(A)).toBe(0);
    expect(abos.live(B)).toBe(1);
  });

  it('sans changement : un seul abonnement, un seul onSourceData (#281 tenu)', async () => {
    const abos = spySubscriptions();
    const el = newKpi(A);
    const onData = vi.spyOn(el as unknown as { onSourceData(d: unknown): void }, 'onSourceData');
    document.body.appendChild(el);
    await el.updateComplete;
    expect(abos.to(A)).toBe(1);
    expect(onData).toHaveBeenCalledTimes(1);
    expect(kpiText(el)).toBe('30');
  });

  it('aller-retour avant le premier rendu (A → B → A) : rien à refaire', async () => {
    const abos = spySubscriptions();
    const el = newKpi(A);
    document.body.appendChild(el);
    el.source = B;
    el.source = A;
    await el.updateComplete;
    expect(abos.to(A)).toBe(1);
    expect(abos.to(B)).toBe(0);
    expect(kpiText(el)).toBe('30');
  });

  it('changement après le premier rendu : toujours suivi, retour compris', async () => {
    const el = newKpi(A);
    document.body.appendChild(el);
    await el.updateComplete;
    expect(kpiText(el)).toBe('30');
    el.source = B;
    await el.updateComplete;
    expect(kpiText(el)).toBe('600');
    el.source = A;
    await el.updateComplete;
    expect(kpiText(el)).toBe('30');
  });

  it('nouvelle source pas encore chargée : rien de l’ancienne, puis ses lignes quand elle émet', async () => {
    const el = newKpi(A);
    document.body.appendChild(el);
    el.source = 'spr-absente';
    await el.updateComplete;
    expect(kpiText(el)).not.toBe('30');
    dispatchDataLoaded('spr-absente', [{ montant: 5 }, { montant: 6 }]);
    await el.updateComplete;
    expect(kpiText(el)).toBe('11');
  });

  it('source inexistante à l’insertion, puis une source au cache', async () => {
    const el = newKpi('spr-absente');
    document.body.appendChild(el);
    el.source = B;
    await el.updateComplete;
    expect(kpiText(el)).toBe('600');
  });

  it('balisage analysé, attribut changé avant le premier rendu', async () => {
    const host = document.createElement('div');
    host.innerHTML = `<dsfr-data-kpi source="${A}" value="montant:sum"></dsfr-data-kpi>`;
    document.body.appendChild(host);
    const el = host.querySelector('dsfr-data-kpi') as DsfrDataKpi;
    el.setAttribute('source', B);
    await el.updateComplete;
    expect(kpiText(el)).toBe('600');
  });

  it('déconnecté puis reconnecté avant le premier rendu avec une autre source', async () => {
    const abos = spySubscriptions();
    const el = newKpi(A);
    document.body.appendChild(el);
    el.remove();
    el.source = B;
    document.body.appendChild(el);
    await el.updateComplete;
    expect(kpiText(el)).toBe('600');
    // La reconnexion abonne à B ; le premier willUpdate n'en refait pas un.
    expect(abos.to(B)).toBe(1);
  });
});

describe('#1314 — chart : source changée avant le premier rendu', () => {
  it('garde les lignes de la nouvelle source, un seul rendu', async () => {
    const el = document.createElement('dsfr-data-chart') as DsfrDataChart;
    el.source = A;
    el.type = 'bar';
    el.labelField = 'montant';
    el.valueField = 'montant';
    const render = vi.spyOn(el as unknown as { render(): unknown }, 'render');
    document.body.appendChild(el);
    el.source = B;
    await el.updateComplete;
    expect((el as unknown as ChartInternals)._data).toEqual(ROWS_B);
    expect(render).toHaveBeenCalledTimes(1);
  });
});

describe('#1314 — query (TransformerMixin) : source changée avant le premier rendu', () => {
  function newQuery(source: string): DsfrDataQuery {
    const el = document.createElement('dsfr-data-query') as DsfrDataQuery;
    el.id = 'spr-q';
    el.source = source;
    el.aggregate = 'montant:sum:total';
    return el;
  }

  it('calcule sur la nouvelle source, et l’aval finit sur son résultat', async () => {
    const { counter, unsub } = countEmissions('spr-q');
    const abos = spySubscriptions();
    const el = newQuery(A);
    document.body.appendChild(el);
    el.source = B;
    await el.updateComplete;

    expect(el.getData()).toEqual([{ total: 600 }]);
    expect(counter.last).toEqual([{ total: 600 }]);
    // La connexion a déjà calculé sur A (cache lu) : cette émission ne se
    // reprend pas. Le réabonnement en ajoute UNE, celle de B — pas davantage.
    expect(counter.count).toBe(2);
    expect(abos.to(A)).toBe(1);
    expect(abos.to(B)).toBe(1);
    expect(abos.live(A)).toBe(0);
    expect(abos.live(B)).toBe(1);

    dispatchDataLoaded(A, [{ montant: 1 }]);
    expect(el.getData()).toEqual([{ total: 600 }]);
    unsub();
  });

  it('sans changement : une seule émission (#281 tenu)', async () => {
    const { counter, unsub } = countEmissions('spr-q');
    const el = newQuery(A);
    document.body.appendChild(el);
    await el.updateComplete;
    expect(counter.count).toBe(1);
    expect(el.getData()).toEqual([{ total: 30 }]);
    unsub();
  });

  it('une prop de requête changée avant le premier rendu est appliquée', async () => {
    const el = newQuery(B);
    document.body.appendChild(el);
    el.where = 'montant:gte:200';
    await el.updateComplete;
    expect(el.getData()).toEqual([{ total: 500 }]);
  });

  it('changement après le premier rendu, puis retour', async () => {
    const el = newQuery(A);
    document.body.appendChild(el);
    await el.updateComplete;
    el.source = B;
    await el.updateComplete;
    expect(el.getData()).toEqual([{ total: 600 }]);
    el.source = A;
    await el.updateComplete;
    expect(el.getData()).toEqual([{ total: 30 }]);
  });

  it('KPI derrière la query, tous deux construits par script, source de la query changée', async () => {
    const q = newQuery(A);
    const kpi = newKpi('spr-q');
    kpi.value = 'total';
    document.body.append(q, kpi);
    q.source = B;
    await q.updateComplete;
    await kpi.updateComplete;
    expect(kpiText(kpi)).toBe('600');
  });
});

describe('#1314 — join (TransformerMixin) : props changées avant le premier rendu', () => {
  const RIGHT = [{ montant: 100, libelle: 'cent' }];

  function newJoin(): DsfrDataJoin {
    dispatchDataLoaded('spr-r', RIGHT);
    const el = document.createElement('dsfr-data-join') as DsfrDataJoin;
    el.id = 'spr-j';
    el.left = B;
    el.right = 'spr-r';
    el.on = 'montant';
    return el;
  }

  it('prop de retraitement (`type`) : recalcul sur les lignes déjà reçues, sans réabonnement', async () => {
    const abos = spySubscriptions();
    const el = newJoin();
    document.body.appendChild(el);
    expect(el.getData()).toHaveLength(3);
    el.type = 'inner';
    await el.updateComplete;
    expect(el.getData()).toEqual([{ montant: 100, libelle: 'cent' }]);
    expect(abos.to(B)).toBe(1);
  });

  it('prop de branchement (`left`) : réabonnement à la nouvelle entrée', async () => {
    const abos = spySubscriptions();
    const el = newJoin();
    document.body.appendChild(el);
    el.left = A;
    await el.updateComplete;
    expect(el.getData()).toHaveLength(2);
    expect(abos.live(B)).toBe(0);
    expect(abos.live(A)).toBe(1);
  });
});
