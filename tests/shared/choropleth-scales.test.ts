import { describe, it, expect } from 'vitest';

/**
 * Garde-fou de la separation des deux jeux de palettes (#969).
 *
 * `PALETTE_COLORS` (5 tons, graphiques) et `CHOROPLETH_SCALES` (9 pas, cartes
 * et podium) portent les MEMES noms de cles. Tant qu'elles vivaient dans le
 * meme fichier, un `grep sequentialDescending` repondait juste et faux : trois
 * tableaux de contraste errones en une journee. Elles sont desormais dans deux
 * fichiers dont le chemin dit lequel on lit — et ce test importe chacune par
 * SON chemin, pas par le barrel, pour que l'ambiguite ne puisse pas revenir
 * par une reexportation.
 *
 * Ce que le test fige :
 * 1. les valeurs des deux rampes homonymes, en clair (aucune ne doit bouger :
 *    ce sont des couleurs servies a l'ecran) ;
 * 2. le fait qu'elles different, cle par cle ;
 * 3. les noms de cles, qui sont le contrat PUBLIC de l'attribut
 *    `selected-palette` — les renommer casserait des pages existantes.
 */

import { DSFR_COLORS, PALETTE_COLORS } from '../../packages/shared/src/constants/palette-colors';
import { CHOROPLETH_SCALES } from '../../packages/shared/src/constants/choropleth-scales';

/** Les cinq noms que les deux constantes partagent. */
const HOMONYMES = [
  'sequentialAscending',
  'sequentialDescending',
  'divergentAscending',
  'divergentDescending',
  'neutral',
] as const;

describe('#969 — deux fichiers, deux rampes homonymes', () => {
  it('les cles publiques de selected-palette sont inchangees', () => {
    // Valeurs de l'attribut public `selected-palette` : deplacer les
    // constantes ne doit toucher AUCUN de ces noms.
    expect(Object.keys(PALETTE_COLORS).sort()).toEqual([
      'categorical',
      'default',
      'divergentAscending',
      'divergentDescending',
      'neutral',
      'sequentialAscending',
      'sequentialDescending',
    ]);
    expect(Object.keys(CHOROPLETH_SCALES).sort()).toEqual([
      'categorical',
      'divergentAscending',
      'divergentDescending',
      'neutral',
      'sequentialAscending',
      'sequentialDescending',
    ]);
  });

  it('PALETTE_COLORS : rampes de DSFR Chart (1, 4 ou 10 tons), pas 9', () => {
    // Les valeurs exactes sont figees contre le paquet DSFR Chart installe,
    // dans palette-colors.test.ts.
    for (const k of HOMONYMES) expect(PALETTE_COLORS[k].length, k).not.toBe(9);
  });

  it('CHOROPLETH_SCALES : 9 pas, valeurs figees en clair', () => {
    expect(CHOROPLETH_SCALES.sequentialAscending).toEqual([
      '#F5F5FE',
      '#E3E3FD',
      '#C1C1FB',
      '#A1A1F8',
      '#8585F6',
      '#6A6AF4',
      '#4747E5',
      '#2323B4',
      '#000091',
    ]);
    expect(CHOROPLETH_SCALES.sequentialDescending).toEqual([
      '#000091',
      '#2323B4',
      '#4747E5',
      '#6A6AF4',
      '#8585F6',
      '#A1A1F8',
      '#C1C1FB',
      '#E3E3FD',
      '#F5F5FE',
    ]);
    expect(CHOROPLETH_SCALES.divergentAscending).toEqual([
      '#000091',
      '#4747E5',
      '#8585F6',
      '#C1C1FB',
      '#F5F5F5',
      '#FCC0B4',
      '#F58050',
      '#E3541C',
      '#C9191E',
    ]);
    expect(CHOROPLETH_SCALES.divergentDescending).toEqual([
      '#C9191E',
      '#E3541C',
      '#F58050',
      '#FCC0B4',
      '#F5F5F5',
      '#C1C1FB',
      '#8585F6',
      '#4747E5',
      '#000091',
    ]);
    expect(CHOROPLETH_SCALES.neutral).toEqual([
      '#F6F6F6',
      '#E5E5E5',
      '#CECECE',
      '#B5B5B5',
      '#929292',
      '#777777',
      '#666666',
      '#3A3A3A',
      '#161616',
    ]);
    for (const k of HOMONYMES) expect(CHOROPLETH_SCALES[k]).toHaveLength(9);
  });

  it('aucune cle homonyme ne porte la meme rampe dans les deux fichiers', () => {
    for (const k of HOMONYMES) {
      expect(CHOROPLETH_SCALES[k], k).not.toEqual(PALETTE_COLORS[k]);
    }
  });

  it('categorical : le podium et les cartes gardent DSFR_COLORS, pas celle de DSFR Chart', () => {
    expect(CHOROPLETH_SCALES.categorical).toBe(DSFR_COLORS);
    expect(CHOROPLETH_SCALES.categorical).not.toEqual(PALETTE_COLORS.categorical);
  });
});
