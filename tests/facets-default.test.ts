import { describe, it, expect, vi, afterEach } from 'vitest';

/**
 * #932 (AM-084) — `default` : une facette porte une valeur par defaut.
 *
 * Sans selection, une facette n'emet rien — le bon comportement quand
 * l'absence de filtre veut dire « tout ». Elle ne l'est plus quand
 * l'agregat national est une LIGNE du jeu (« Toutes regions ») a cote
 * d'une ligne par region : la somme porte alors sur le cumul, sans
 * avertissement.
 */

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

import { DsfrDataFacets } from '@/components/dsfr-data-facets.js';
import { clearDataCache, dispatchDataLoaded, getDataCache } from '@/utils/data-bridge.js';

interface FacetsInternals {
  _activeSelections: Record<string, Set<string>>;
}

const ROWS = [
  { region: 'Toutes regions', score: 100 },
  { region: 'Bretagne', score: 40 },
  { region: 'Normandie', score: 60 },
];

let seq = 0;
const mounted: DsfrDataFacets[] = [];

async function renderFacets(
  attrs: { default?: string; display?: string; urlParams?: boolean } = {}
): Promise<DsfrDataFacets> {
  const sourceId = `df-src-${++seq}`;
  clearDataCache(sourceId);
  const facets = new DsfrDataFacets();
  facets.id = `df-facets-${seq}`;
  facets.source = sourceId;
  facets.fields = 'region';
  if (attrs.default !== undefined) facets.setAttribute('default', attrs.default);
  if (attrs.display) facets.display = attrs.display;
  if (attrs.urlParams) facets.setAttribute('url-params', '');
  document.body.appendChild(facets);
  mounted.push(facets);
  dispatchDataLoaded(sourceId, ROWS);
  await facets.updateComplete;
  return facets;
}

function selectionsOf(facets: DsfrDataFacets): string[] {
  const sel = (facets as unknown as FacetsInternals)._activeSelections;
  return [...(sel.region ?? [])];
}

afterEach(() => {
  for (const f of mounted.splice(0)) f.remove();
  window.history.replaceState({}, '', '/');
});

describe('#932 — AC : default="champ:valeur" pre-selectionne au montage', () => {
  it('sans default, aucune selection n’est emise (comportement historique)', async () => {
    const facets = await renderFacets();
    expect(selectionsOf(facets)).toEqual([]);
    expect((getDataCache(facets.id) as unknown[] | undefined)?.length).toBe(3);
  });

  it('default="region:Toutes regions" selectionne cette valeur et filtre les donnees', async () => {
    const facets = await renderFacets({ default: 'region:Toutes regions' });
    expect(selectionsOf(facets)).toEqual(['Toutes regions']);
    const emitted = getDataCache(facets.id) as Record<string, unknown>[] | undefined;
    expect(emitted?.length).toBe(1);
    expect(emitted?.[0].region).toBe('Toutes regions');
  });

  it('la case de la valeur par defaut est rendue cochee', async () => {
    const facets = await renderFacets({ default: 'region:Toutes regions' });
    const checked = Array.from(
      facets.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')
    ).filter((i) => i.checked);
    expect(checked.length).toBe(1);
    expect(facets.querySelector(`label[for="${checked[0].id}"]`)?.textContent).toContain(
      'Toutes regions'
    );
  });
});

describe('#932 — AC : l’URL l’emporte sur la valeur par defaut', () => {
  it('?region=Bretagne prime sur default="region:Toutes regions"', async () => {
    window.history.replaceState({}, '', '/?region=Bretagne');
    const facets = await renderFacets({ default: 'region:Toutes regions', urlParams: true });
    expect(selectionsOf(facets)).toEqual(['Bretagne']);
  });
});

describe('#932 — AC : la remise a zero revient a la valeur par defaut', () => {
  it('le bouton « Reinitialiser les filtres » restaure le defaut', async () => {
    const facets = await renderFacets({ default: 'region:Toutes regions' });
    const inputs = Array.from(facets.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'));
    const bretagne = inputs.find((i) =>
      facets.querySelector(`label[for="${i.id}"]`)?.textContent?.includes('Bretagne')
    )!;
    bretagne.click();
    await facets.updateComplete;
    expect(selectionsOf(facets)).toEqual(['Bretagne']);

    const reset = facets.querySelector<HTMLButtonElement>('.dsfr-data-facets__header button')!;
    reset.click();
    await facets.updateComplete;
    expect(selectionsOf(facets)).toEqual(['Toutes regions']);
  });

  it('decocher la derniere valeur revient au defaut, jamais a l’absence de filtre', async () => {
    const facets = await renderFacets({ default: 'region:Toutes regions' });
    const checked = Array.from(
      facets.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')
    ).find((i) => i.checked)!;
    checked.click();
    await facets.updateComplete;
    expect(selectionsOf(facets)).toEqual(['Toutes regions']);
  });

  it('en mode select, l’option « Tous » n’est plus offerte pour un champ a defaut', async () => {
    const facets = await renderFacets({
      default: 'region:Toutes regions',
      display: 'region:select',
    });
    const options = Array.from(facets.querySelectorAll<HTMLOptionElement>('option'));
    expect(options.some((o) => o.value === '')).toBe(false);
    expect(options.find((o) => o.selected)?.value).toBe('Toutes regions');
  });
});
