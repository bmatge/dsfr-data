import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * #731 — une grammaire fausse de `display` ou `labels` était ignorée en
 * silence : `_parseDisplayModes()` faisait `continue` sur une entrée sans
 * `:` et écartait un mode inconnu sans rien dire.
 *
 * Conséquence mesurée sur le banc d'essai : `display="a:select, b:select"`
 * rend ZÉRO liste déroulante sur une page qui a l'air juste — `display` et
 * `labels` séparent leurs entrées par `|`, là où `fields`, `split` et `round`
 * prennent la virgule.
 *
 * Un avertissement console, une seule fois par instance.
 */

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

import { DsfrDataFacets } from '@/components/dsfr-data-facets.js';
import { clearDataCache, dispatchDataLoaded } from '@/utils/data-bridge.js';

const ROWS = [
  { statut: 'actif', region: 'IDF' },
  { statut: 'clos', region: 'BRE' },
];

let seq = 0;
const mounted: DsfrDataFacets[] = [];
/** Collecteur des appels a console.warn (spy pose dans beforeEach). */
const warn = vi.fn<(...args: unknown[]) => void>();

async function mountFacets(configure: (el: DsfrDataFacets) => void): Promise<DsfrDataFacets> {
  const sourceId = `gw-src-${++seq}`;
  clearDataCache(sourceId);
  const facets = new DsfrDataFacets();
  facets.id = `gw-facets-${seq}`;
  facets.source = sourceId;
  facets.fields = 'statut, region';
  configure(facets);
  document.body.appendChild(facets);
  mounted.push(facets);
  dispatchDataLoaded(sourceId, ROWS);
  await facets.updateComplete;
  return facets;
}

/** Messages d'avertissement émis, tous arguments concaténés. */
function warnings(): string[] {
  return warn.mock.calls.map((args) => args.map(String).join(' '));
}

beforeEach(() => {
  warn.mockClear();
  vi.spyOn(console, 'warn').mockImplementation(warn);
});

afterEach(() => {
  for (const f of mounted.splice(0)) f.remove();
  vi.restoreAllMocks();
});

describe('#731 — mauvais séparateur signalé', () => {
  it('AC : display="a:select, b:select" avertit en nommant le séparateur attendu', async () => {
    await mountFacets((el) => (el.display = 'statut:select, region:select'));

    const messages = warnings();
    expect(messages.length).toBeGreaterThan(0);
    const message = messages.join('\n');
    expect(message).toContain('"display"');
    expect(message).toContain('statut:select, region:select');
    expect(message).toContain('barre');
    expect(message).toContain('champ:valeur | champ2:valeur2');
  });

  it('AC : une seule fois par instance, pas à chaque rendu', async () => {
    const facets = await mountFacets((el) => (el.display = 'statut:select, region:select'));

    const first = warnings().length;
    expect(first).toBe(1);

    facets.requestUpdate();
    await facets.updateComplete;
    facets.requestUpdate();
    await facets.updateComplete;

    expect(warnings().length).toBe(first);
  });

  it('labels mal séparé est signalé aussi', async () => {
    await mountFacets((el) => (el.labels = 'statut:Statut, region:Région'));

    const message = warnings().join('\n');
    expect(message).toContain('"labels"');
    expect(message).toContain('barre');
  });

  it('une virgule DANS un libellé ne déclenche rien (faux positif évité)', async () => {
    await mountFacets((el) => (el.labels = 'statut:Statut, en clair'));
    expect(warnings()).toHaveLength(0);
  });

  it('une grammaire correcte ne déclenche rien', async () => {
    await mountFacets((el) => {
      el.display = 'statut:select | region:radio-inline';
      el.labels = 'statut:Statut | region:Région';
    });
    expect(warnings()).toHaveLength(0);
  });
});

describe('#731 — mode d’affichage inconnu signalé', () => {
  it('AC : un mode inconnu est signalé, en nommant le champ et les modes acceptés', async () => {
    await mountFacets((el) => (el.display = 'statut:dropdown'));

    const message = warnings().join('\n');
    expect(message).toContain('"display"');
    expect(message).toContain('dropdown');
    expect(message).toContain('statut');
    expect(message).toContain('checkbox');
    expect(message).toContain('radio-inline');
  });

  it('un mode inconnu n’empêche pas les modes valides voisins', async () => {
    const facets = await mountFacets(
      (el) => (el.display = 'statut:dropdown | region:radio-inline')
    );

    const modes = facets._parseDisplayModes();
    expect(modes.get('region')).toBe('radio-inline');
    expect(modes.has('statut')).toBe(false);
    expect(warnings().join('\n')).toContain('dropdown');
  });

  it('une seule fois par instance malgré les rendus successifs', async () => {
    const facets = await mountFacets((el) => (el.display = 'statut:dropdown'));

    expect(warnings()).toHaveLength(1);
    facets.requestUpdate();
    await facets.updateComplete;
    expect(warnings()).toHaveLength(1);
  });
});
