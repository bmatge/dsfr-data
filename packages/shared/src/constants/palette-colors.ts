/**
 * Palettes categorielles et sequentielles a 5 tons du DSFR — celles des
 * graphiques (`dsfr-data-chart`, previews du builder).
 *
 * ⚠️ HOMONYMIE VOULUE, ET DANGEREUSE : `constants/choropleth-scales.ts`
 * exporte `CHOROPLETH_SCALES`, dont les cles portent les MEMES noms
 * (`sequentialAscending`, `sequentialDescending`, `divergentAscending`,
 * `divergentDescending`, `neutral`) avec des rampes a 9 tons differentes.
 * Les deux jeux de noms sont publics : ce sont les valeurs de l'attribut
 * `selected-palette`, la meme cle designant la rampe a 5 tons sur un
 * graphique et la rampe a 9 tons sur une carte ou un podium. C'est pour
 * rendre cette homonymie visible A L'IMPORT que les deux constantes vivent
 * dans deux fichiers dont le chemin dit lequel on lit (#969) : un
 * `grep sequentialDescending` a repondu juste et faux trois fois en une
 * journee quand elles cohabitaient dans `dsfr-palettes.ts`.
 *
 * Qui lit quoi : `dsfr-data-chart` et les previews -> ce fichier ;
 * `dsfr-data-map-layer` et `dsfr-data-podium` -> `choropleth-scales.ts`.
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
