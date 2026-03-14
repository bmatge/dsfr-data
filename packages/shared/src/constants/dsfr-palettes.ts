/**
 * DSFR (Design System de l'Etat) color palettes for charts
 */

/** Default categorical colors from DSFR */
export const DSFR_COLORS = [
  '#000091', '#6A6AF4', '#009081', '#C9191E', '#FF9940',
  '#A558A0', '#417DC4', '#716043', '#18753C', '#3A3A3A'
] as const;

/** Primary color per palette type */
export const PALETTE_PRIMARY_COLOR: Record<string, string> = {
  'default': '#000091',
  'categorical': '#000091',
  'sequentialAscending': '#000091',
  'sequentialDescending': '#6A6AF4',
  'divergentAscending': '#000091',
  'divergentDescending': '#C9191E',
  'neutral': '#3A3A3A'
};

/** Color sets per palette type */
export const PALETTE_COLORS: Record<string, readonly string[]> = {
  'default': ['#000091', '#6A6AF4', '#9A9AFF', '#CACAFB', '#E5E5F4'],
  'categorical': ['#000091', '#6A6AF4', '#009081', '#C9191E', '#FF9940', '#A558A0', '#417DC4', '#716043', '#18753C', '#3A3A3A'],
  'sequentialAscending': ['#E5E5F4', '#CACAFB', '#9A9AFF', '#6A6AF4', '#000091'],
  'sequentialDescending': ['#000091', '#6A6AF4', '#9A9AFF', '#CACAFB', '#E5E5F4'],
  'divergentAscending': ['#000091', '#6A6AF4', '#F5F5F5', '#FF9940', '#C9191E'],
  'divergentDescending': ['#C9191E', '#FF9940', '#F5F5F5', '#6A6AF4', '#000091'],
  'neutral': ['#161616', '#3A3A3A', '#666666', '#929292', '#CECECE']
};

export type PaletteType = keyof typeof PALETTE_COLORS;
