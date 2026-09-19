/**
 * Echelles choroplethes a 9 pas et leur discretisation — celles des cartes
 * et du podium.
 *
 * ⚠️ HOMONYMIE VOULUE, ET DANGEREUSE : `constants/palette-colors.ts` exporte
 * `PALETTE_COLORS`, dont les cles portent les MEMES noms
 * (`sequentialAscending`, `sequentialDescending`, `divergentAscending`,
 * `divergentDescending`, `neutral`) avec des rampes a 5 tons differentes.
 * Les deux jeux de noms sont publics : ce sont les valeurs de l'attribut
 * `selected-palette`. C'est pour rendre cette homonymie visible A L'IMPORT
 * que les deux constantes vivent dans deux fichiers dont le chemin dit
 * lequel on lit (#969) : un `grep sequentialDescending` a repondu juste et
 * faux trois fois en une journee quand elles cohabitaient dans
 * `dsfr-palettes.ts`.
 *
 * Qui lit quoi : `dsfr-data-map-layer` et `dsfr-data-podium` -> ce fichier ;
 * `dsfr-data-chart` et les previews -> `palette-colors.ts`.
 */
import { PALETTE_COLORS } from './palette-colors.js';

/**
 * Echelles choroplethes 9 pas (#302) — SOURCE UNIQUE pour dsfr-data-podium
 * et dsfr-data-map-layer (historiquement aussi dsfr-data-world-map, retire
 * en #402). Les composants
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

/**
 * Breaks a intervalles egaux : l'etendue [min, max] est decoupee en `steps`
 * classes de meme largeur. Retourne `steps - 1` bornes SUPERIEURES inclusives
 * (meme convention que `quantileBreaks`). Vide si aucune valeur (#685).
 */
export function equalIntervalBreaks(values: number[], steps: number): number[] {
  if (values.length === 0 || steps < 2) return [];
  let min = Infinity;
  let max = -Infinity;
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const width = (max - min) / steps;
  const breaks: number[] = [];
  for (let i = 1; i < steps; i++) breaks.push(min + width * i);
  return breaks;
}

/**
 * Bornes manuelles `"10,50,100"` -> `[10, 50, 100]` : triees, dedoublonnees,
 * les entrees non numeriques sont ignorees (#685).
 */
export function parseManualBreaks(spec: string): number[] {
  const parsed = spec
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s !== '')
    .map(Number)
    .filter((n) => Number.isFinite(n));
  return [...new Set(parsed)].sort((a, b) => a - b);
}

/**
 * Sous-echantillonne une echelle a `n` couleurs reparties uniformement, les
 * deux extremites conservees : 5 classes sur une echelle de 9 prennent les
 * pas 1, 3, 5, 7, 9. `n` superieur ou egal a la taille de l'echelle : echelle
 * inchangee (#685).
 */
export function samplePalette(palette: readonly string[], n: number): readonly string[] {
  if (n < 1 || n >= palette.length) return palette;
  if (n === 1) return [palette[palette.length - 1]];
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    out.push(palette[Math.round((i * (palette.length - 1)) / (n - 1))]);
  }
  return out;
}

/** Methode de discretisation d'une choroplethe (#685). */
export type ClassificationMethod = 'quantile' | 'equal' | 'manual';

export interface ClassificationOptions {
  /** `quantile` (défaut), `equal` ou `manual`. */
  method?: string;
  /** Nombre de classes ; `0` ou absent = taille de l'echelle. */
  classes?: number;
  /** Bornes manuelles (`"10,50,100"` ou tableau) — implique `manual`. */
  breaks?: string | number[];
}

/**
 * Discretise des valeurs en classes et aligne l'echelle dessus : retourne
 * `breaks` (bornes superieures inclusives) et une `palette` de
 * `breaks.length + 1` couleurs, sous-echantillonnee depuis `scale`.
 *
 * - `breaks` renseigne (ou `method="manual"`) : bornes telles quelles, le
 *   nombre de classes en decoule ;
 * - sinon `classes` classes (plafonne a la taille de l'echelle, défaut = la
 *   taille de l'echelle : comportement historique quantiles/9) selon
 *   `method` (`quantile` par défaut, `equal`).
 * - aucune valeur exploitable : `breaks` vide (pas de choroplethe).
 */
export function classifyValues(
  values: number[],
  scale: readonly string[],
  options: ClassificationOptions = {}
): { breaks: number[]; palette: readonly string[] } {
  const manual =
    typeof options.breaks === 'string'
      ? parseManualBreaks(options.breaks)
      : Array.isArray(options.breaks)
        ? [...options.breaks].filter((n) => Number.isFinite(n)).sort((a, b) => a - b)
        : [];
  if (manual.length > 0 || options.method === 'manual') {
    if (manual.length === 0) return { breaks: [], palette: scale };
    return { breaks: manual, palette: samplePalette(scale, manual.length + 1) };
  }
  if (values.length === 0) return { breaks: [], palette: scale };
  const requested = options.classes && options.classes > 0 ? Math.floor(options.classes) : 0;
  const steps = requested > 0 ? Math.min(Math.max(requested, 1), scale.length) : scale.length;
  const palette = samplePalette(scale, steps);
  const breaks =
    options.method === 'equal' ? equalIntervalBreaks(values, steps) : quantileBreaks(values, steps);
  return { breaks, palette };
}

/** Entree de legende : une pastille et son libelle (#685). */
export interface LegendEntry {
  color: string;
  label: string;
  /** Borne inferieure de la classe (choroplethe), si connue. */
  from?: number;
  /** Borne superieure inclusive de la classe (choroplethe), si connue. */
  to?: number;
}

const LEGEND_NUMBER_FORMAT = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });

/** Nombre au format fr-FR pour une legende (2 decimales max). */
export function formatLegendNumber(value: number): string {
  return LEGEND_NUMBER_FORMAT.format(value);
}

/**
 * Entrees de legende d'une choroplethe : une par classe, dans l'ordre de
 * l'echelle, avec bornes chiffrees fr-FR. Les bornes sont des maxima
 * inclusifs : la classe 0 va jusqu'a `breaks[0]`, la classe i couvre
 * `]breaks[i-1], breaks[i]]`, la derniere est au-dela de la derniere borne.
 * `extent` (min/max des donnees) precise les extremites (« De 12 à 40 »
 * plutôt que « Jusqu'à 40 »). Une classe vide (deux bornes egales, quantiles
 * sur peu de valeurs distinctes) est omise (#685).
 */
export function choroplethLegendEntries(
  breaks: number[],
  palette: readonly string[],
  extent?: { min: number; max: number }
): LegendEntry[] {
  if (breaks.length === 0) return [];
  const fmt = formatLegendNumber;
  const color = (i: number) => palette[Math.min(i, palette.length - 1)];
  const entries: LegendEntry[] = [];
  const count = breaks.length + 1;
  for (let i = 0; i < count; i++) {
    const from = i === 0 ? extent?.min : breaks[i - 1];
    const to = i === count - 1 ? extent?.max : breaks[i];
    if (i > 0 && from !== undefined && to !== undefined && from >= to) continue;
    let label: string;
    if (from === undefined && to !== undefined) label = `Jusqu'à ${fmt(to)}`;
    else if (to === undefined && from !== undefined) label = `Plus de ${fmt(from)}`;
    else if (from !== undefined && to !== undefined)
      label = from === to ? fmt(to) : `De ${fmt(from)} à ${fmt(to)}`;
    else label = '';
    entries.push({ color: color(i), label, from, to });
  }
  return entries;
}
