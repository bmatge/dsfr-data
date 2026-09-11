import { describe, it, expect, vi, afterEach } from 'vitest';

/**
 * #777 — dsfr-data-concat : empiler les lignes de sources de même schéma.
 *
 * Aucun composant ne savait le faire : dsfr-data-join juxtapose des colonnes.
 * Le banc d'essai empilait quatre séries au prix de quatre pivots, trois
 * jointures et un dépliage (28 pivots sur une page).
 */

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

import { DsfrDataConcat } from '@/components/dsfr-data-concat.js';
import {
  clearDataCache,
  clearDataMeta,
  dispatchDataLoaded,
  dispatchSourceCommand,
  getDataCache,
  getDataMeta,
  setDataMeta,
  subscribeToSourceCommands,
} from '@/utils/data-bridge.js';
import { DataflowRecorder, lintMarkup } from '@dsfr-data/shared';

const V2023 = [
  { mois: '01', montant: 10 },
  { mois: '02', montant: 20 },
];
const V2024 = [
  { mois: '01', montant: 15 },
  { mois: '02', montant: 25 },
];

let seq = 0;
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

function mount(configure: (el: DsfrDataConcat, a: string, b: string) => void) {
  seq += 1;
  const a = `cc-a-${seq}`;
  const b = `cc-b-${seq}`;
  const el = new DsfrDataConcat();
  el.id = `cc-out-${seq}`;
  el.sources = `${a}, ${b}`;
  configure(el, a, b);
  ids.push(a, b, el.id);
  document.body.appendChild(el);
  mounted.push(el);
  return { el, a, b };
}

describe('#777 — empilement', () => {
  it('AC : deux sources de même schéma s’empilent, dans l’ordre de sources', () => {
    const { el, a, b } = mount(() => {});
    dispatchDataLoaded(b, V2024);
    expect(getDataCache(el.id)).toBeUndefined(); // attend toutes les sources
    dispatchDataLoaded(a, V2023);

    expect(el.getData()).toEqual([...V2023, ...V2024]);
    expect(getDataCache(el.id)).toEqual([...V2023, ...V2024]);
  });

  it('AC : une colonne d’origine est disponible, id de la source par défaut', () => {
    const { el, a, b } = mount((c) => (c.originField = 'serie'));
    dispatchDataLoaded(a, V2023);
    dispatchDataLoaded(b, V2024);
    expect(el.getData().map((r) => r.serie)).toEqual([a, a, b, b]);
    // Les lignes source ne sont pas mutées
    expect(V2023.every((r) => !('serie' in r))).toBe(true);
  });

  it('origin-labels donne un libellé par source', () => {
    const { el, a, b } = mount((c, a1, b1) => {
      c.originField = 'millesime';
      c.originLabels = `${a1}:2023 | ${b1}:2024`;
    });
    dispatchDataLoaded(a, V2023);
    dispatchDataLoaded(b, V2024);
    expect(el.getData().map((r) => r.millesime)).toEqual(['2023', '2023', '2024', '2024']);
  });

  it('une source vide n’impose pas son schéma et ne contribue rien', () => {
    const { el, a, b } = mount(() => {});
    dispatchDataLoaded(a, []);
    dispatchDataLoaded(b, V2024);
    expect(el.getData()).toEqual(V2024);
  });

  it('une réémission d’une source recalcule l’empilement', () => {
    const { el, a, b } = mount(() => {});
    dispatchDataLoaded(a, V2023);
    dispatchDataLoaded(b, V2024);
    dispatchDataLoaded(a, [{ mois: '03', montant: 30 }]);
    expect(el.getData()).toEqual([{ mois: '03', montant: 30 }, ...V2024]);
  });
});

describe('#777 — jamais de perte silencieuse', () => {
  it('AC : un schéma divergent produit une erreur nommée, rien n’est émis', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { el, a, b } = mount(() => {});
    dispatchDataLoaded(a, V2023);
    dispatchDataLoaded(b, [{ mois: '01', total: 15 }]);

    const marker = el.getAttribute('data-dsfr-config-error') ?? '';
    expect(marker).toContain(`"${b}" sans "montant" et avec en plus "total"`);
    expect(el.getData()).toEqual([]);
    expect(el.getError()?.message).toContain('schémas divergents');
    expect(error).toHaveBeenCalledTimes(1);
  });

  it('l’erreur se lève quand les schémas redeviennent compatibles', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { el, a, b } = mount(() => {});
    dispatchDataLoaded(a, V2023);
    dispatchDataLoaded(b, [{ mois: '01' }]);
    dispatchDataLoaded(b, V2024);
    expect(el.hasAttribute('data-dsfr-config-error')).toBe(false);
    expect(el.getData()).toHaveLength(4);
  });

  it('origin-field qui écraserait une colonne est refusé', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { el, a, b } = mount((c) => (c.originField = 'montant'));
    dispatchDataLoaded(a, V2023);
    dispatchDataLoaded(b, V2024);
    expect(el.getAttribute('data-dsfr-config-error')).toContain('origin-field="montant"');
    expect(el.getData()).toEqual([]);
  });

  it('configuration : au moins deux sources, sans doublon', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const one = new DsfrDataConcat();
    one.id = 'cc-one';
    one.sources = 'x';
    document.body.appendChild(one);
    mounted.push(one);
    expect(one.getAttribute('data-dsfr-config-error')).toContain('au moins deux');

    const dup = new DsfrDataConcat();
    dup.id = 'cc-dup';
    dup.sources = 'x, x';
    document.body.appendChild(dup);
    mounted.push(dup);
    expect(dup.getAttribute('data-dsfr-config-error')).toContain('citée deux fois');
  });
});

describe('#777 — meta et commandes', () => {
  it('total invalidé, troncature d’UNE source propagée', () => {
    const { el, a, b } = mount(() => {});
    setDataMeta(a, { page: 1, pageSize: 0, serverSide: false, total: 2 });
    setDataMeta(b, { page: 1, pageSize: 0, serverSide: false, total: 5000, truncated: true });
    dispatchDataLoaded(a, V2023);
    dispatchDataLoaded(b, V2024);
    const meta = getDataMeta(el.id);
    expect(meta?.total).toBeUndefined();
    expect(meta?.truncated).toBe(true);
  });

  it('aucune commande aval n’est relayée aux sources', () => {
    const { el, a, b } = mount(() => {});
    const received: unknown[] = [];
    const offA = subscribeToSourceCommands(a, (c) => received.push(c));
    const offB = subscribeToSourceCommands(b, (c) => received.push(c));
    dispatchSourceCommand(el.id, { where: 'mois:eq:01', whereKey: 'k' });
    expect(received).toEqual([]);
    offA();
    offB();
  });
});

describe('#777 — volet Diagnostic et lint', () => {
  it('le graphe lit les amonts de sources', () => {
    const host = document.createElement('div');
    host.innerHTML = `<dsfr-data-concat id="cc-graph" sources="p, q"></dsfr-data-concat>`;
    document.body.appendChild(host);
    mounted.push(host);
    const trace = new DataflowRecorder({ root: document.body }).snapshot();
    const node = trace.graph.nodes.find((n) => n.id === 'cc-graph');
    expect(node?.role).toBe('transform');
    expect(node?.upstream).toEqual(['p', 'q']);
  });

  it('le lint signale une source inexistante', () => {
    const findings = lintMarkup(
      `<dsfr-data-source id="p"></dsfr-data-source>
       <dsfr-data-concat id="cc" sources="p, fantome"></dsfr-data-concat>`,
      {
        'dsfr-data-source': { attributes: ['id'] },
        'dsfr-data-concat': { attributes: ['sources', 'origin-field', 'origin-labels'] },
      }
    );
    expect(findings.some((f) => f.message.includes('"fantome"'))).toBe(true);
  });
});
