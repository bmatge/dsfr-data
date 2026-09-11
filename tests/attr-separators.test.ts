import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * #772 — l'avertissement de séparateur (#731) étendu aux autres attributs
 * multi-entrées.
 *
 * Il était typé `'display' | 'labels'` et réécrit à la main dans les
 * facettes. Restaient muets : `sort` des facettes (barre), et sur
 * `dsfr-data-normalize` deux séparateurs OPPOSÉS sur la même balise —
 * `rename` (barre) et `fold` (virgule). `cols` est laissé à l'échelle
 * responsive (#789), qui en changera la grammaire.
 */

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

import { hasSuspectSeparator } from '@/utils/attr-separators.js';
import { DsfrDataFacets } from '@/components/dsfr-data-facets.js';
import { DsfrDataNormalize } from '@/components/dsfr-data-normalize.js';
import { clearDataCache, dispatchDataLoaded } from '@/utils/data-bridge.js';

const warn = vi.fn<(...args: unknown[]) => void>();
const mounted: Element[] = [];
let seq = 0;

beforeEach(() => {
  warn.mockClear();
  vi.spyOn(console, 'warn').mockImplementation(warn);
});

afterEach(() => {
  for (const el of mounted.splice(0)) el.remove();
  vi.restoreAllMocks();
});

const messages = () => warn.mock.calls.map((args) => args.map(String).join(' '));

describe('#772 — détection', () => {
  it('barre attendue : une virgule sans barre est suspecte', () => {
    expect(hasSuspectSeparator('a:alpha, b:count', '|')).toBe(true);
    expect(hasSuspectSeparator('a:alpha | b:count', '|')).toBe(false);
    expect(hasSuspectSeparator('count', '|')).toBe(false);
  });

  it('virgule attendue : une barre est suspecte', () => {
    expect(hasSuspectSeparator('a_*:a | b_*:b', ',')).toBe(true);
    expect(hasSuspectSeparator('a_*:a, b_*:b', ',')).toBe(false);
  });

  it('valeurs humaines : une virgule dans un libellé n’est pas suspecte', () => {
    expect(hasSuspectSeparator('dep:Département, région', '|', true)).toBe(false);
    expect(hasSuspectSeparator('dep:Département, reg:Région', '|', true)).toBe(true);
  });
});

async function facetsWithSort(sort: string): Promise<DsfrDataFacets> {
  const src = `sep-src-${++seq}`;
  clearDataCache(src);
  const facets = new DsfrDataFacets();
  facets.id = `sep-facets-${seq}`;
  facets.source = src;
  facets.fields = 'statut, region';
  facets.sort = sort;
  document.body.appendChild(facets);
  mounted.push(facets);
  dispatchDataLoaded(src, [
    { statut: 'a', region: 'x' },
    { statut: 'b', region: 'y' },
  ]);
  await facets.updateComplete;
  return facets;
}

describe('#772 — sort des facettes', () => {
  it('une virgule au lieu de la barre est signalée, une seule fois par valeur', async () => {
    const facets = await facetsWithSort('statut:alpha, region:count:desc');
    facets.requestUpdate();
    await facets.updateComplete;

    const found = messages().filter((m) => m.includes('"sort"'));
    expect(found).toHaveLength(1);
    expect(found[0]).toContain('barre verticale');
    expect(found[0]).toContain('champ:alpha | champ2:count:desc');
  });

  it('un tri bien écrit ne dit rien', async () => {
    await facetsWithSort('statut:alpha | region:count:desc');
    expect(messages().filter((m) => m.includes('"sort"'))).toHaveLength(0);
  });
});

function normalizeWith(configure: (el: DsfrDataNormalize) => void): DsfrDataNormalize {
  const src = `sep-norm-src-${++seq}`;
  clearDataCache(src);
  const normalize = new DsfrDataNormalize();
  normalize.id = `sep-norm-${seq}`;
  normalize.source = src;
  configure(normalize);
  document.body.appendChild(normalize);
  mounted.push(normalize);
  dispatchDataLoaded(src, [{ a: 1, handicap_moteur: 'Oui', b: 2 }]);
  return normalize;
}

describe('#772 — rename et fold, deux séparateurs opposés sur la même balise', () => {
  it('rename écrit à la virgule est signalé', () => {
    normalizeWith((el) => (el.rename = 'a:Alpha, b:Beta'));
    const found = messages().filter((m) => m.includes('"rename"'));
    expect(found).toHaveLength(1);
    expect(found[0]).toContain('barre verticale');
  });

  it('rename : une virgule dans le nouveau nom ne déclenche rien', () => {
    normalizeWith((el) => (el.rename = 'a:Département, région'));
    expect(messages().filter((m) => m.includes('"rename"'))).toHaveLength(0);
  });

  it('fold écrit à la barre est signalé', () => {
    normalizeWith((el) => (el.fold = 'handicap_*:handicaps | b:autres'));
    const found = messages().filter((m) => m.includes('"fold"'));
    expect(found).toHaveLength(1);
    expect(found[0]).toContain('la virgule');
  });

  it('les deux bien écrits ne disent rien', () => {
    normalizeWith((el) => {
      el.rename = 'a:Alpha | b:Beta';
      el.fold = 'handicap_*:handicaps, b:autres';
    });
    expect(messages().filter((m) => m.includes('"rename"') || m.includes('"fold"'))).toHaveLength(
      0
    );
  });

  it('une seule fois par instance et par valeur, même re-émise', () => {
    const normalize = normalizeWith((el) => (el.fold = 'handicap_*:h | b:c'));
    dispatchDataLoaded(normalize.source, [{ a: 1 }]);
    expect(messages().filter((m) => m.includes('"fold"'))).toHaveLength(1);
  });
});
