import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * #931 (AM-083) — `lazy` sur `dsfr-data-source` : différer la première
 * requête jusqu'à la visibilité d'un consommateur.
 *
 * Une page à onglets déclare ses sources pour tous les panneaux ; cinq sur
 * six sont fermés à l'arrivée, mais toutes les sources partent au
 * chargement. Le portrait de territoire du portail Sports émet 56 requêtes
 * d'API pour un premier onglet qui en consomme une vingtaine.
 *
 * `IntersectionObserver` n'existe pas dans happy-dom : chaque test qui en a
 * besoin l'installe lui-même, et le dernier bloc vérifie précisément ce qui
 * se passe quand il est absent (la source part tout de suite).
 */

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

import { DsfrDataSource } from '@/components/dsfr-data-source.js';
import '@/components/dsfr-data-chart.js';
import '@/components/dsfr-data-query.js';
import { clearDataCache, clearDataMeta, DATA_EVENTS } from '@/utils/data-bridge.js';

/** Observateur de test : on déclenche l'intersection à la main. */
class FakeIntersectionObserver {
  static instances: FakeIntersectionObserver[] = [];
  readonly observed = new Set<Element>();
  constructor(
    private readonly callback: (entries: { target: Element; isIntersecting: boolean }[]) => void,
    readonly options?: unknown
  ) {
    FakeIntersectionObserver.instances.push(this);
  }
  observe(el: Element) {
    this.observed.add(el);
  }
  unobserve(el: Element) {
    this.observed.delete(el);
  }
  disconnect() {
    this.observed.clear();
  }
  /** Fait entrer un élément observé dans le viewport. */
  trigger(el: Element) {
    this.callback([{ target: el, isIntersecting: true }]);
  }
  /** Tous les éléments observés par tous les observateurs vivants. */
  static allObserved(): Element[] {
    return FakeIntersectionObserver.instances.flatMap((o) => [...o.observed]);
  }
  static triggerAll() {
    for (const o of FakeIntersectionObserver.instances) {
      for (const el of [...o.observed]) o.trigger(el);
    }
  }
  static reset() {
    FakeIntersectionObserver.instances = [];
  }
}

function installObserver(): void {
  FakeIntersectionObserver.reset();
  (globalThis as any).IntersectionObserver = FakeIntersectionObserver;
}

function removeObserver(): void {
  delete (globalThis as any).IntersectionObserver;
}

const mounted: Element[] = [];
const ids: string[] = [];

function mount<T extends Element>(el: T): T {
  document.body.appendChild(el);
  mounted.push(el);
  return el;
}

function makeSource(id: string): DsfrDataSource {
  const source = new DsfrDataSource();
  source.id = id;
  source.url = `https://api.example.test/${id}`;
  ids.push(id);
  return source;
}

/** Un tour de boucle : les microtâches en attente, puis une macrotâche. */
const tour = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

/**
 * Laisse passer le `setTimeout(…, 0)` de coalescing de `_scheduleFetch`.
 *
 * Ce timer est programmé depuis une MICROTÂCHE (le cycle de mise à jour de
 * Lit, après `mount`) : il naît donc après tout timer que le test pose
 * synchroniquement. Le premier tour laisse passer les microtâches — le timer
 * de la lib existe alors —, le second, programmé après lui avec le même
 * délai, passe après lui (ordre d'insertion). Aucune durée réelle en jeu.
 *
 * L'ancien `setTimeout(r, 5)` pariait que la lib aurait programmé son timer
 * moins de 4 ms après celui du test : sous charge (suite complète, CI), un
 * fil désordonnancé perdait la course, le test lisait l'état d'AVANT la
 * requête, et le timer orphelin tombait dans le test suivant (#1119).
 */
const settle = async (): Promise<void> => {
  await tour();
  await tour();
};

beforeEach(() => {
  mockFetch.mockReset();
  mockFetch.mockResolvedValue({
    ok: true,
    status: 200,
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => [{ nom: 'Aube' }],
    text: async () => '[{"nom":"Aube"}]',
  });
});

afterEach(() => {
  for (const el of mounted.splice(0)) el.remove();
  for (const id of ids.splice(0)) {
    clearDataCache(id);
    clearDataMeta(id);
  }
  removeObserver();
  FakeIntersectionObserver.reset();
});

describe('#931 — lazy sur dsfr-data-source', () => {
  it('sans l’attribut, la source part au chargement, comme aujourd’hui', async () => {
    installObserver();
    const source = makeSource('lz-nonlazy');
    mount(source);
    const chart = mount(document.createElement('dsfr-data-chart'));
    chart.setAttribute('source', 'lz-nonlazy');
    await settle();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('avec lazy, aucune requête avant la visibilité d’un consommateur', async () => {
    installObserver();
    const source = makeSource('lz-differee');
    source.lazy = true;
    mount(source);
    const chart = mount(document.createElement('dsfr-data-chart'));
    chart.setAttribute('source', 'lz-differee');
    await settle();

    expect(mockFetch).not.toHaveBeenCalled();
    // C'est bien le CONSOMMATEUR qui est observé, pas la source (déclarée en
    // haut de page, elle serait visible d'emblée).
    expect(FakeIntersectionObserver.allObserved()).toContain(chart);
  });

  it('la requête part à la première visibilité, et une seule fois', async () => {
    installObserver();
    const source = makeSource('lz-visible');
    source.lazy = true;
    mount(source);
    const chart = mount(document.createElement('dsfr-data-chart'));
    chart.setAttribute('source', 'lz-visible');
    await settle();
    expect(mockFetch).not.toHaveBeenCalled();

    FakeIntersectionObserver.triggerAll();
    await settle();
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Une seconde entrée dans le viewport ne recharge pas.
    FakeIntersectionObserver.triggerAll();
    await settle();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('le consommateur est suivi à travers les transformateurs', async () => {
    installObserver();
    const source = makeSource('lz-chaine');
    source.lazy = true;
    mount(source);
    const query = mount(document.createElement('dsfr-data-query'));
    query.id = 'lz-chaine-q';
    query.setAttribute('source', 'lz-chaine');
    const chart = mount(document.createElement('dsfr-data-chart'));
    chart.setAttribute('source', 'lz-chaine-q');
    await settle();

    // Le `query` est un tuyau : il n'a pas de boîte à regarder. C'est la
    // feuille au bout de la chaîne qui dit si quelqu'un regarde.
    const observed = FakeIntersectionObserver.allObserved();
    expect(observed).toContain(chart);
    expect(observed).not.toContain(query);
  });

  it('émet dsfr-data-idle tant que la source attend d’être regardée', async () => {
    installObserver();
    const reasons: string[] = [];
    const listener = (e: Event) =>
      reasons.push((e as CustomEvent<{ sourceId: string; reason: string }>).detail.reason);
    document.addEventListener(DATA_EVENTS.IDLE, listener);

    const source = makeSource('lz-idle');
    source.lazy = true;
    mount(source);
    const chart = mount(document.createElement('dsfr-data-chart'));
    chart.setAttribute('source', 'lz-idle');
    await settle();
    document.removeEventListener(DATA_EVENTS.IDLE, listener);

    expect(reasons).toContain('lazy');
  });

  it('lazy-target observe l’élément désigné, pas les consommateurs', async () => {
    installObserver();
    const panneau = mount(document.createElement('div'));
    panneau.id = 'lz-panneau';
    const source = makeSource('lz-cible');
    source.lazy = true;
    source.lazyTarget = '#lz-panneau';
    mount(source);
    const chart = mount(document.createElement('dsfr-data-chart'));
    chart.setAttribute('source', 'lz-cible');
    await settle();

    const observed = FakeIntersectionObserver.allObserved();
    expect(observed).toContain(panneau);
    expect(observed).not.toContain(chart);
    expect(mockFetch).not.toHaveBeenCalled();

    FakeIntersectionObserver.triggerAll();
    await settle();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('les deux conditions se cumulent avec require-where', async () => {
    installObserver();
    const source = makeSource('lz-cumul');
    source.url = '';
    source.apiType = 'opendatasoft';
    source.baseUrl = 'https://data.example.test';
    source.datasetId = 'jeu';
    source.lazy = true;
    source.requireWhere = true;
    mount(source);
    const chart = mount(document.createElement('dsfr-data-chart'));
    chart.setAttribute('source', 'lz-cumul');
    await settle();
    expect(mockFetch).not.toHaveBeenCalled();

    // Visible, mais toujours sans filtre : require-where tient la porte.
    FakeIntersectionObserver.triggerAll();
    await settle();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('sans IntersectionObserver, la source part immédiatement', async () => {
    removeObserver();
    const source = makeSource('lz-degrade');
    source.lazy = true;
    mount(source);
    const chart = mount(document.createElement('dsfr-data-chart'));
    chart.setAttribute('source', 'lz-degrade');
    await settle();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('sans aucun consommateur dans la page, la source part immédiatement', async () => {
    installObserver();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const source = makeSource('lz-orpheline');
    source.lazy = true;
    mount(source);
    await settle();
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('lz-orpheline'));
    warn.mockRestore();
  });
});
