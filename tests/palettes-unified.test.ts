import { describe, it, expect, vi } from 'vitest';

/**
 * Tests traversants #302 (EPIC G) — palettes uniques via @dsfr-data/shared.
 *
 * Bugs d'origine : podium codait en dur une palette categorical DIFFÉRENTE
 * de PALETTE_COLORS (même attribut selected-palette que chart, couleurs
 * différentes) ; CHOROPLETH_PALETTES copié-collé entre map-layer et
 * world-map (le commentaire « shared with dsfr-data-world-map » était faux)
 * avec des fonctions de bucketing OPPOSÉES (value <= break vs v >= break) —
 * une même valeur posée sur un break était colorée différemment selon le
 * composant.
 */

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

import {
  CHOROPLETH_SCALES,
  PALETTE_COLORS,
  quantileBreaks,
  getColorForValue,
} from '@dsfr-data/shared/lib';
import { DsfrDataPodium } from '@/components/dsfr-data-podium.js';
import { DsfrDataWorldMap } from '@/components/dsfr-data-world-map.js';

describe('#302 — AC : même selected-palette = mêmes couleurs partout', () => {
  it('la categorical du podium est celle de PALETTE_COLORS (comme chart)', () => {
    const podium = new DsfrDataPodium();
    podium.selectedPalette = 'categorical';
    (podium as any)._data = PALETTE_COLORS.categorical.map((_, i) => ({
      nom: `i${i}`,
      population: 100 - i,
    }));
    podium.maxItems = 20;
    (podium as any).valueField = 'population';
    (podium as any).labelField = 'nom';

    const items = (podium as any)._processItems();
    items.forEach((item: { color: string }, i: number) => {
      expect(item.color, `couleur ${i}`).toBe(PALETTE_COLORS.categorical[i]);
    });
  });

  it('la world-map résout ses palettes depuis CHOROPLETH_SCALES', () => {
    const wm = new DsfrDataWorldMap();
    wm.selectedPalette = 'divergentAscending';
    expect((wm as any)._getChoroplethPalette()).toBe(CHOROPLETH_SCALES.divergentAscending);
  });

  it('les échelles partagées sont les 9 pas historiques de core (975 → main-525)', () => {
    expect(CHOROPLETH_SCALES.sequentialAscending).toHaveLength(9);
    expect(CHOROPLETH_SCALES.sequentialAscending[0]).toBe('#F5F5FE');
    expect(CHOROPLETH_SCALES.sequentialAscending[8]).toBe('#000091');
    expect(CHOROPLETH_SCALES.categorical).toBe(PALETTE_COLORS.categorical);
  });
});

describe('#302 — AC : même valeur sur un break = même bucket (convention unique)', () => {
  it('getColorForValue : borne supérieure inclusive (value <= break)', () => {
    const palette = ['a', 'b', 'c'];
    const breaks = [10, 20];
    expect(getColorForValue(10, breaks, palette)).toBe('a'); // SUR le break → bucket bas
    expect(getColorForValue(10.1, breaks, palette)).toBe('b');
    expect(getColorForValue(20, breaks, palette)).toBe('b');
    expect(getColorForValue(25, breaks, palette)).toBe('c');
  });

  it('la world-map utilise désormais la même convention que map-layer', () => {
    const wm = new DsfrDataWorldMap();
    wm.selectedPalette = 'sequentialAscending';
    const values = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    const scale = (wm as any)._getColorScale(values);

    const breaks = quantileBreaks(values, 9);
    // Une valeur posée exactement sur le premier break :
    const onBreak = breaks[0];
    expect(scale(onBreak)).toBe(
      getColorForValue(onBreak, breaks, CHOROPLETH_SCALES.sequentialAscending)
    );
  });

  it('quantileBreaks : steps - 1 bornes, croissantes', () => {
    const breaks = quantileBreaks([5, 1, 9, 3, 7], 3);
    expect(breaks).toHaveLength(2);
    expect(breaks[0]).toBeLessThanOrEqual(breaks[1]);
  });
});
