import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * #690 — `require-where` : ne rien charger tant qu'aucun filtre n'est posé.
 *
 * Constat d'origine (banc d'essai open-data-viz, AM-035) : une page
 * d'exploration interrogeait l'API dès le montage et rapatriait 19 388 lignes
 * que personne ne regardait, faute d'un moyen de bloquer le chargement. Mettre
 * l'attribut sur les afficheurs n'aurait rien changé : la requête part de la
 * source, c'est donc là que la garde doit vivre.
 *
 * AC : sans filtre, aucune requête réseau et un message rendu ; le premier
 * filtre déclenche le chargement ; retirer le dernier filtre repasse en
 * attente (jamais de requête « tout » implicite).
 */

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

import { DsfrDataSource } from '@/components/dsfr-data-source.js';
import { DsfrDataQuery } from '@/components/dsfr-data-query.js';
import { DsfrDataChart } from '@/components/dsfr-data-chart.js';
import { DsfrDataList } from '@/components/dsfr-data-list.js';
import { DsfrDataKpi } from '@/components/dsfr-data-kpi.js';
import { DsfrDataDisplay } from '@/components/dsfr-data-display.js';
import {
  clearDataCache,
  clearDataMeta,
  dispatchDataLoaded,
  dispatchSourceCommand,
  getDataCache,
  isDataIdle,
  DATA_EVENTS,
} from '@/utils/data-bridge.js';
import { DataflowRecorder } from '@dsfr-data/shared';

const SRC = 'rw-src';
const QRY = 'rw-query';

/** Laisse passer le macrotask du `_scheduleFetch` de la source. */
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

/** Réponse ODS minimale — deux lignes, total connu. */
function odsResponse(rows: Array<Record<string, unknown>>) {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: { get: () => 'application/json' },
    json: async () => ({ total_count: rows.length, results: rows }),
  };
}

const ROWS = [
  { region: 'Bretagne', total: 3 },
  { region: 'Normandie', total: 5 },
];

/** Source ODS montée dans le document, prête à répondre. */
function mountSource(requireWhere: boolean): DsfrDataSource {
  const source = new DsfrDataSource();
  source.id = SRC;
  source.apiType = 'opendatasoft';
  source.baseUrl = 'https://data.example.gouv.fr';
  source.datasetId = 'jeu-test';
  source.requireWhere = requireWhere;
  document.body.appendChild(source);
  return source;
}

type Display = HTMLElement & { source: string; updateComplete: Promise<boolean> };

function mountDisplay(build: () => HTMLElement, sourceId: string): Display {
  const el = build() as Display;
  el.source = sourceId;
  document.body.appendChild(el);
  return el;
}

describe('#690 — require-where sur dsfr-data-source', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue(odsResponse(ROWS));
    clearDataCache(SRC);
    clearDataMeta(SRC);
  });

  afterEach(() => {
    document.body.innerHTML = '';
    clearDataCache(SRC);
    clearDataMeta(SRC);
  });

  it('AC : sans filtre, aucune requête réseau — et un événement dsfr-data-idle', async () => {
    const idle = vi.fn();
    document.addEventListener(DATA_EVENTS.IDLE, idle);

    const source = mountSource(true);
    await source.updateComplete;
    await tick();

    expect(mockFetch).not.toHaveBeenCalled();
    expect(idle).toHaveBeenCalled();
    expect(isDataIdle(SRC)).toBe(true);
    document.removeEventListener(DATA_EVENTS.IDLE, idle);
  });

  it('sans l’attribut, la même source charge tout au montage (témoin)', async () => {
    const source = mountSource(false);
    await source.updateComplete;
    await tick();

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(isDataIdle(SRC)).toBe(false);
  });

  it('le where STATIQUE ne lève pas l’attente — seul un filtre reçu compte', async () => {
    const source = mountSource(true);
    source.where = 'region = "Bretagne"';
    await source.updateComplete;
    await tick();

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('AC : le premier filtre déclenche le chargement, les données sont publiées', async () => {
    const source = mountSource(true);
    await source.updateComplete;
    await tick();
    expect(mockFetch).not.toHaveBeenCalled();

    dispatchSourceCommand(SRC, { where: 'region = "Bretagne"', whereKey: 'facettes' });
    await tick();
    await tick();

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(getDataCache(SRC)).toEqual(ROWS);
    expect(isDataIdle(SRC)).toBe(false);
  });

  it('retirer le dernier filtre repasse en attente, sans requête « tout »', async () => {
    const source = mountSource(true);
    await source.updateComplete;
    await tick();

    dispatchSourceCommand(SRC, { where: 'region = "Bretagne"', whereKey: 'facettes' });
    await tick();
    await tick();
    expect(mockFetch).toHaveBeenCalledTimes(1);

    dispatchSourceCommand(SRC, { where: '', whereKey: 'facettes' });
    await tick();
    await tick();

    // Aucune requête supplémentaire, et le cache est purgé : un afficheur
    // monté après coup ne doit pas retrouver les lignes du filtre retiré.
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(isDataIdle(SRC)).toBe(true);
    expect(getDataCache(SRC)).toBeUndefined();
  });

  it('prévient une fois quand require-where est posé en mode URL (sans issue)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const source = new DsfrDataSource();
    source.id = SRC;
    source.url = 'https://api.example.gouv.fr/jeu';
    source.requireWhere = true;
    document.body.appendChild(source);
    await source.updateComplete;
    await tick();

    expect(mockFetch).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('require-where'));
    warn.mockRestore();
  });
});

describe('#690 — rendu idle des afficheurs', () => {
  const CASES: Array<[string, () => HTMLElement]> = [
    ['dsfr-data-chart', () => new DsfrDataChart()],
    ['dsfr-data-list', () => new DsfrDataList()],
    ['dsfr-data-kpi', () => new DsfrDataKpi()],
    ['dsfr-data-display', () => new DsfrDataDisplay()],
  ];

  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue(odsResponse(ROWS));
    clearDataCache(SRC);
    clearDataMeta(SRC);
  });

  afterEach(() => {
    document.body.innerHTML = '';
    clearDataCache(SRC);
    clearDataMeta(SRC);
  });

  for (const [tag, build] of CASES) {
    it(`${tag} : rend l’état idle, distinct de « aucune donnée » et du chargement`, async () => {
      const source = mountSource(true);
      const el = mountDisplay(build, SRC);
      await source.updateComplete;
      await tick();
      await el.updateComplete;

      const idle = el.querySelector(`.${tag}__idle`);
      expect(idle, `${tag} doit rendre .${tag}__idle`).not.toBeNull();
      expect(idle!.textContent).toContain('Choisissez un filtre');
      expect(idle!.classList.contains('dsfr-data-status--idle')).toBe(true);
      // Pas de région live : c'est l'état initial de la page, pas une nouvelle.
      expect(idle!.getAttribute('aria-live')).toBeNull();
      expect(idle!.getAttribute('role')).toBeNull();
      expect(idle!.getAttribute('aria-busy')).toBeNull();
      // Ni chargement, ni erreur en même temps.
      expect(el.querySelector(`.${tag}__loading`)).toBeNull();
      expect(el.querySelector(`.${tag}__error`)).toBeNull();
    });

    it(`${tag} : idle-message personnalisé rendu`, async () => {
      const source = mountSource(true);
      const el = mountDisplay(build, SRC) as Display & { idleMessage: string };
      el.idleMessage = 'Sélectionnez une commune';
      await source.updateComplete;
      await tick();
      await el.updateComplete;

      expect(el.querySelector(`.${tag}__idle`)!.textContent).toContain('Sélectionnez une commune');
    });

    it(`${tag} : un afficheur monté APRÈS l’entrée en attente rend quand même idle`, async () => {
      const source = mountSource(true);
      await source.updateComplete;
      await tick();

      const el = mountDisplay(build, SRC);
      await el.updateComplete;

      expect(el.querySelector(`.${tag}__idle`)).not.toBeNull();
    });
  }

  it('le premier filtre remplace l’état idle par les données', async () => {
    const source = mountSource(true);
    const chart = mountDisplay(() => new DsfrDataChart(), SRC) as Display & {
      labelField: string;
      valueField: string;
    };
    chart.labelField = 'region';
    chart.valueField = 'total';
    await source.updateComplete;
    await tick();
    await chart.updateComplete;
    expect(chart.querySelector('.dsfr-data-chart__idle')).not.toBeNull();

    dispatchSourceCommand(SRC, { where: 'region = "Bretagne"', whereKey: 'facettes' });
    await tick();
    await tick();
    await chart.updateComplete;

    expect(chart.querySelector('.dsfr-data-chart__idle')).toBeNull();
    expect(chart.querySelector('.dsfr-data-chart__empty')).toBeNull();
  });
});

describe('#690 — require-where sur dsfr-data-query (sans réseau)', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    clearDataCache(SRC);
    clearDataCache(QRY);
    clearDataMeta(SRC);
    clearDataMeta(QRY);
  });

  afterEach(() => {
    document.body.innerHTML = '';
    clearDataCache(SRC);
    clearDataCache(QRY);
  });

  it('sans filtre : aucune émission de lignes, un état idle sous son propre id', async () => {
    const query = new DsfrDataQuery();
    query.id = QRY;
    query.source = SRC;
    query.requireWhere = true;
    document.body.appendChild(query);
    await query.updateComplete;

    // La source amont émet : la requête reste muette.
    dispatchDataLoaded(SRC, ROWS);
    await query.updateComplete;

    expect(getDataCache(QRY)).toBeUndefined();
    expect(isDataIdle(QRY)).toBe(true);
    expect(query.getData()).toEqual([]);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('un where posé sur la requête lève l’attente et les lignes sont émises', async () => {
    const query = new DsfrDataQuery();
    query.id = QRY;
    query.source = SRC;
    query.requireWhere = true;
    document.body.appendChild(query);
    await query.updateComplete;

    dispatchDataLoaded(SRC, ROWS);
    await query.updateComplete;
    expect(isDataIdle(QRY)).toBe(true);

    query.where = 'total:gte:4';
    await query.updateComplete;

    expect(isDataIdle(QRY)).toBe(false);
    expect(getDataCache(QRY)).toEqual([{ region: 'Normandie', total: 5 }]);
  });

  it('l’attente de la requête descend jusqu’à l’afficheur', async () => {
    const query = new DsfrDataQuery();
    query.id = QRY;
    query.source = SRC;
    query.requireWhere = true;
    document.body.appendChild(query);
    const list = mountDisplay(() => new DsfrDataList(), QRY);
    await query.updateComplete;

    dispatchDataLoaded(SRC, ROWS);
    await query.updateComplete;
    await list.updateComplete;

    expect(list.querySelector('.dsfr-data-list__idle')).not.toBeNull();
  });

  it('une commande where relayée par la requête lève aussi l’attente', async () => {
    const query = new DsfrDataQuery();
    query.id = QRY;
    query.source = SRC;
    query.requireWhere = true;
    document.body.appendChild(query);
    await query.updateComplete;

    dispatchDataLoaded(SRC, ROWS);
    await query.updateComplete;
    expect(isDataIdle(QRY)).toBe(true);

    dispatchSourceCommand(QRY, { where: 'region:eq:Bretagne', whereKey: 'contexte' });
    await query.updateComplete;

    expect(isDataIdle(QRY)).toBe(false);
    expect(getDataCache(QRY)).toEqual(ROWS);
  });
});

describe('#690 — l’attente est lisible dans la trace Diagnostic', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue(odsResponse(ROWS));
    clearDataCache(SRC);
    clearDataMeta(SRC);
  });

  afterEach(() => {
    document.body.innerHTML = '';
    clearDataCache(SRC);
  });

  it('le nœud passe en statut « waiting », distinct de l’absence d’observation', async () => {
    const recorder = new DataflowRecorder({ root: document.body });
    recorder.start();

    const source = mountSource(true);
    mountDisplay(() => new DsfrDataChart(), SRC);
    await source.updateComplete;
    await tick();

    const trace = recorder.snapshot();
    expect(trace.states[SRC].status).toBe('waiting');
    expect(trace.events.some((e) => e.kind === 'waiting' && e.node === SRC)).toBe(true);

    recorder.stop();
  });
});
