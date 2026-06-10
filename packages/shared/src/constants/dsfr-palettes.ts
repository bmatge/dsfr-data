/**
 * DSFR (Design System de l'État) color palettes for charts
 */

/** Default categorical colors from DSFR */
export const DSFR_COLORS = [
  '#000091',
  '#6A6AF4',
  '#009081',
  '#C9191E',
  '#FF9940',
  '#A558A0',
  '#417DC4',
  '#716043',
  '#18753C',
  '#3A3A3A',
] as const;

/** Primary color per palette type */
export const PALETTE_PRIMARY_COLOR: Record<string, string> = {
  default: '#000091',
  categorical: '#000091',
  sequentialAscending: '#000091',
  sequentialDescending: '#6A6AF4',
  divergentAscending: '#000091',
  divergentDescending: '#C9191E',
  neutral: '#3A3A3A',
};

/** Color sets per palette type */
// satisfies au lieu de l'annotation Record<string, ...> qui resolvait
// PaletteType (keyof) en string (#322)
export const PALETTE_COLORS = {
  default: ['#000091', '#6A6AF4', '#9A9AFF', '#CACAFB', '#E5E5F4'],
  categorical: [
    '#000091',
    '#6A6AF4',
    '#009081',
    '#C9191E',
    '#FF9940',
    '#A558A0',
    '#417DC4',
    '#716043',
    '#18753C',
    '#3A3A3A',
  ],
  sequentialAscending: ['#E5E5F4', '#CACAFB', '#9A9AFF', '#6A6AF4', '#000091'],
  sequentialDescending: ['#000091', '#6A6AF4', '#9A9AFF', '#CACAFB', '#E5E5F4'],
  divergentAscending: ['#000091', '#6A6AF4', '#F5F5F5', '#FF9940', '#C9191E'],
  divergentDescending: ['#C9191E', '#FF9940', '#F5F5F5', '#6A6AF4', '#000091'],
  neutral: ['#161616', '#3A3A3A', '#666666', '#929292', '#CECECE'],
} satisfies Record<string, readonly string[]>;

/**
 * Human-friendly display names per palette key.
 * Used wherever the palette appears in user-visible UI (section summaries, badges, etc.)
 * so the raw internal key (e.g. `sequentialAscending`) never leaks.
 * Stay in sync with the `<option>` labels in `apps/builder/index.html` palette select.
 */
export const PALETTE_DISPLAY_NAMES: Record<string, string> = {
  default: 'Bleu France',
  categorical: 'Couleurs distinctes par catégorie',
  sequentialAscending: 'Dégradé clair → foncé',
  sequentialDescending: 'Dégradé foncé → clair',
  divergentAscending: 'Bicolore (centre clair)',
  divergentDescending: 'Bicolore (centre foncé)',
  neutral: 'Tons neutres (gris)',
};

export type PaletteType = keyof typeof PALETTE_COLORS;

/**
 * Echelles choroplethes 9 pas (#302) — SOURCE UNIQUE pour dsfr-data-podium,
 * dsfr-data-map-layer et dsfr-data-world-map. Les trois composants
 * embarquaient chacun leur copie avec des divergences reelles : categorical
 * absente de map-layer, categorical du podium differente de PALETTE_COLORS
 * (meme attribut selected-palette, couleurs differentes que chart), et
 * surtout des fonctions de bucketing OPPOSEES (value <= break vs >= break).
 *
 * Echelles construites sur les tokens DSFR blue-france (975 -> main-525)
 * pour les sequentielles, blue-france + rouge Marianne pour les divergentes,
 * grey pour la neutre. `categorical` = PALETTE_COLORS.categorical (la meme
 * que les previews chart).
 */
export const CHOROPLETH_SCALES: Record<string, readonly string[]> = {
  sequentialAscending: [
    '#F5F5FE',
    '#E3E3FD',
    '#C1C1FB',
    '#A1A1F8',
    '#8585F6',
    '#6A6AF4',
    '#4747E5',
    '#2323B4',
    '#000091',
  ],
  sequentialDescending: [
    '#000091',
    '#2323B4',
    '#4747E5',
    '#6A6AF4',
    '#8585F6',
    '#A1A1F8',
    '#C1C1FB',
    '#E3E3FD',
    '#F5F5FE',
  ],
  divergentAscending: [
    '#000091',
    '#4747E5',
    '#8585F6',
    '#C1C1FB',
    '#F5F5F5',
    '#FCC0B4',
    '#F58050',
    '#E3541C',
    '#C9191E',
  ],
  divergentDescending: [
    '#C9191E',
    '#E3541C',
    '#F58050',
    '#FCC0B4',
    '#F5F5F5',
    '#C1C1FB',
    '#8585F6',
    '#4747E5',
    '#000091',
  ],
  neutral: [
    '#F6F6F6',
    '#E5E5E5',
    '#CECECE',
    '#B5B5B5',
    '#929292',
    '#777777',
    '#666666',
    '#3A3A3A',
    '#161616',
  ],
  categorical: PALETTE_COLORS.categorical,
};

/**
 * Breaks par quantiles : chaque couleur couvre ~le meme nombre d'elements.
 * Retourne `steps - 1` bornes SUPERIEURES inclusives.
 */
export function quantileBreaks(values: number[], steps: number): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  const breaks: number[] = [];
  for (let i = 1; i < steps; i++) {
    const idx = Math.floor((i / steps) * sorted.length);
    breaks.push(sorted[Math.min(idx, sorted.length - 1)]);
  }
  return breaks;
}

/**
 * Couleur d'une valeur dans une echelle : les breaks sont des bornes
 * SUPERIEURES inclusives (`value <= break` -> bucket). Convention UNIQUE
 * (#302) : map-layer et world-map bucketaient en sens opposes, une meme
 * valeur posee sur un break etait coloree differemment selon le composant.
 */
export function getColorForValue(
  value: number,
  breaks: number[],
  palette: readonly string[]
): string {
  for (let i = 0; i < breaks.length; i++) {
    if (value <= breaks[i]) return palette[i];
  }
  return palette[palette.length - 1];
}
