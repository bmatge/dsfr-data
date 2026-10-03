/**
 * Grammaire commune de `color-map` — carte et graphique (#732).
 *
 * Paires `modalité:#couleur` séparées par des virgules, une seule fois pour
 * `dsfr-data-map-layer` (couleur d'un élément selon `color-field`) et pour
 * `dsfr-data-chart` (couleur d'une série ou d'une part).
 *
 * Les séparateurs structurels présents dans une modalité sont percent-encodés
 * comme partout ailleurs dans la bibliothèque (#676, `escapeColonValue`) :
 * `%2C` pour la virgule, `%3A` pour le deux-points, `%25` pour le pourcent.
 * Le décodage a lieu APRÈS le découpage, sinon un libellé métier contenant
 * une virgule (« Commerce, transport ») casserait le reste du mapping.
 */
import { unescapeColonValue } from '@dsfr-data/shared/lib';

/**
 * Découpe `color-map` en table modalité vers couleur. Les paires
 * inexploitables (sans deux-points, modalité ou couleur vide) sont ignorées ;
 * une modalité répétée garde la dernière couleur déclarée.
 */
export function parseColorMap(raw: string): Map<string, string> {
  const map = new Map<string, string>();
  if (!raw) return map;
  for (const pair of raw.split(',')) {
    const sep = pair.lastIndexOf(':');
    if (sep <= 0) continue;
    const value = unescapeColonValue(pair.substring(0, sep).trim());
    const color = unescapeColonValue(pair.substring(sep + 1).trim());
    if (value && color) map.set(value, color);
  }
  return map;
}

/** Sous-ensemble structurel d'un dataset Chart.js dont la couleur est posable. */
export interface ColorableDataset {
  data?: unknown[];
  backgroundColor?: unknown;
  borderColor?: unknown;
  hoverBackgroundColor?: unknown;
  hoverBorderColor?: unknown;
  /** Points d'une courbe, d'un radar ou d'un nuage : posés à part par DSFR Chart. */
  pointBackgroundColor?: unknown;
  pointBorderColor?: unknown;
  pointHoverBackgroundColor?: unknown;
  pointHoverBorderColor?: unknown;
}

/** Sous-ensemble structurel d'une instance Chart.js recolorable. */
export interface ColorableChart {
  data?: { labels?: unknown[]; datasets?: ColorableDataset[] };
  /** Options Chart.js : seules les transitions nous intéressent (`refreshSeriesColors`). */
  options?: { transitions?: Record<string, unknown> };
  update?: (mode?: string) => void;
}

/** Ce qu'a produit `applyColorMap`, pour aligner la légende du graphique. */
export interface ColorMapApplication {
  /** Au moins une série ou une modalité a été recolorée. */
  applied: boolean;
  /**
   * Couleurs dans l'ordre des pastilles de légende concernées : par série
   * (une pastille par courbe ou par barre) ou par part (camembert). `undefined`
   * là où `color-map` ne dit rien — la couleur de la palette reste en place.
   */
  legendColors: (string | undefined)[];
}

/** Valeur de couleur d'un point : les couleurs Chart.js sont scalaires ou tableau. */
function colorAt(base: unknown, index: number): unknown {
  return Array.isArray(base) ? base[index] : base;
}

/** Propriétés de couleur des POINTS d'un jeu de données Chart.js. */
const POINT_COLOR_KEYS = [
  'pointBackgroundColor',
  'pointBorderColor',
  'pointHoverBackgroundColor',
  'pointHoverBorderColor',
] as const;

/**
 * Pose la couleur d'une série sur ses POINTS (BUG-033 du banc, #1230).
 *
 * DSFR Chart écrit les couleurs de point à part du trait — `pointBackgroundColor`,
 * `pointBorderColor` et leurs variantes de survol — sur les courbes, les radars,
 * les nuages de points et la courbe d'un `bar-line`. Tant que ces propriétés
 * existent, Chart.js les préfère à `backgroundColor` / `borderColor` : un trait
 * recoloré gardait donc ses points à la palette par défaut. On ne les pose que
 * là où le jeu de données les porte déjà : un jeu de barres n'en a pas, et sans
 * elles Chart.js retombe de lui-même sur la couleur du trait.
 */
function paintPoints(dataset: ColorableDataset, color: string): void {
  for (const key of POINT_COLOR_KEYS) {
    if (dataset[key] !== undefined) dataset[key] = color;
  }
}

/** Nom de la transition Chart.js posée par `refreshSeriesColors`. */
const COLOR_MAP_TRANSITION = 'dsfrDataColorMap';

/**
 * Redessine le graphique après un recoloriage par série (BUG-033, #1230).
 *
 * `update('none')` ne suffit PAS, et c'est la cause réelle du constat : quand
 * tous les éléments d'un jeu de données ont les mêmes options — les points
 * d'une courbe, les barres d'un `bar-line` — Chart.js les fait partager UN
 * objet d'options, gardé d'une mise à jour à l'autre, et ne le rafraîchit que
 * par ses animations. Les modes directs (`none`, `resize`) sautent cette étape :
 * le trait, qui a ses propres options, changeait de couleur, et les points
 * gardaient l'ancienne — même avec `pointBackgroundColor` correctement posé.
 *
 * On passe donc par une transition déclarée, de durée nulle : les options
 * partagées sont réécrites à l'image suivante, sans fondu visible. Une
 * transition nommée est le mécanisme documenté de Chart.js pour cela (un mode
 * passé à `update` se lit dans `options.transitions`). Sans `options`
 * atteignables, repli sur `update('none')`, le comportement d'avant.
 */
function refreshSeriesColors(chart: ColorableChart): void {
  const transitions = chart.options?.transitions;
  if (!transitions || typeof transitions !== 'object') {
    chart.update?.('none');
    return;
  }
  if (!transitions[COLOR_MAP_TRANSITION]) {
    transitions[COLOR_MAP_TRANSITION] = { animation: { duration: 0 } };
  }
  chart.update?.(COLOR_MAP_TRANSITION);
}

/** `#rgb` ou `#rrggbb` → `#rrggbb` ; `null` pour toute autre écriture de couleur. */
function toHex6(color: string): string | null {
  const hex = color.trim();
  if (/^#[0-9a-f]{6}$/i.test(hex)) return hex;
  if (/^#[0-9a-f]{3}$/i.test(hex)) {
    return `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
  }
  return null;
}

/**
 * Couleur de FOND d'une série recolorée, dans la forme qu'avait le fond.
 *
 * Le radar de DSFR Chart teinte l'aire de chaque série en TRANSPARENCE
 * (`#rrggbbaa`, alpha 0,3) pour que les séries se lisent l'une à travers
 * l'autre. Y poser la couleur pleine rendait l'aire opaque : la dernière série
 * dessinée masquait les autres. Quand le fond d'origine porte un canal alpha et
 * que la couleur demandée s'écrit en hexadécimal, le même alpha est reconduit ;
 * dans tous les autres cas la couleur est posée telle quelle, comme avant.
 */
function fillColor(previous: unknown, color: string): string {
  if (typeof previous !== 'string') return color;
  const alpha = /^#[0-9a-f]{6}([0-9a-f]{2})$/i.exec(previous.trim())?.[1];
  const hex = toHex6(color);
  return alpha && hex ? `${hex}${alpha}` : color;
}

/**
 * Applique `color-map` sur une instance Chart.js déjà rendue.
 *
 * `@gouvfr/dsfr-chart` n'expose aucune prise déclarative sur les couleurs de
 * série (`tmpColorParse` reste vide, seuls `selected-palette` et
 * `highlight-index` sont des props) : la couleur se pose donc sur l'instance,
 * comme les bornes dures de l'échelle radiale.
 *
 * Deux lectures, dans cet ordre : la modalité est un **nom de série** (une
 * couleur par jeu de données), sinon un **libellé de l'axe** (une couleur par
 * part de camembert ou par barre). Les modalités absentes gardent la couleur
 * de la palette DSFR.
 *
 * Par série, la couleur est posée sur TOUT ce que la série dessine : le trait,
 * le fond, leurs variantes de survol, et les points (`paintPoints`).
 */
export function applyColorMap(
  chart: ColorableChart,
  colorMap: Map<string, string>,
  seriesNames: readonly string[]
): ColorMapApplication {
  const datasets = chart.data?.datasets ?? [];
  if (!datasets.length || colorMap.size === 0) return { applied: false, legendColors: [] };

  const bySeries = datasets.map((_, i) => colorMap.get(seriesNames[i] ?? ''));
  if (bySeries.some((color) => !!color)) {
    datasets.forEach((dataset, i) => {
      const color = bySeries[i];
      if (!color) return;
      dataset.backgroundColor = fillColor(dataset.backgroundColor, color);
      dataset.borderColor = color;
      dataset.hoverBackgroundColor = color;
      dataset.hoverBorderColor = color;
      paintPoints(dataset, color);
    });
    refreshSeriesColors(chart);
    return { applied: true, legendColors: bySeries };
  }

  const labels = (chart.data?.labels ?? []).map((label) => String(label));
  if (!labels.some((label) => colorMap.has(label))) return { applied: false, legendColors: [] };

  for (const dataset of datasets) {
    const spread = (base: unknown) =>
      labels.map((label, j) => colorMap.get(label) ?? colorAt(base, j));
    const background = spread(dataset.backgroundColor);
    const border = spread(dataset.borderColor);
    dataset.backgroundColor = background;
    dataset.borderColor = border;
    dataset.hoverBackgroundColor = spread(dataset.hoverBackgroundColor);
    dataset.hoverBorderColor = spread(dataset.hoverBorderColor);
  }
  chart.update?.('none');
  return { applied: true, legendColors: labels.map((label) => colorMap.get(label)) };
}

// --- Modèle de couleurs de DSFR Chart : `colorParse` (#968) ------------------
//
// CAUSE COMMUNE de #813 (légende) et #968 (infobulle). Le composant Vue de
// `@gouvfr/dsfr-chart` tient UNE source de vérité pour les couleurs de série,
// `colorParse` (calculée par `loadColors()` depuis `selected-palette`), et
// TROIS surfaces en dérivent :
//
//   1. le CANVAS — `datasets[d].borderColor = colorParse[d]` à la création ;
//   2. la LÉGENDE — `legendColors = colorParse.map((c) => c[0])`, rendue une
//      fois par le gabarit Vue ;
//   3. l'INFOBULLE — lue PARESSEUSEMENT au survol, dans le `external` du
//      tooltip Chart.js : `data-color="${colorParse[datasetIndex][dataIndex]}"`.
//
// `applyColorMap` n'écrit que sur les datasets de l'instance Chart.js, c'est-à-
// dire sur la COPIE (1). La surface (2) a été rattrapée après coup en peignant
// le DOM (#815). La surface (3) ne peut pas l'être : son DOM n'existe pas avant
// le survol, et il est réécrit à chaque mouvement de souris depuis `colorParse`.
//
// D'où ce report dans le modèle lui-même, plutôt qu'un troisième rattrapage :
// toute surface qui relit `colorParse` après coup voit les couleurs de
// `color-map`. Le report SUIT LA FORME EXISTANTE, qui diffère selon le type —
// un tableau par point pour `bar-chart` et `pie-chart`, un scalaire pour
// `line-chart`, `radar-chart` et `scatter-chart` — parce que l'infobulle des
// premiers indexe `colorParse[d][i]` : un scalaire y serait indexé comme une
// chaîne et rendrait « # ».
//
// On mirroite `borderColor`, pas `backgroundColor` : c'est lui qui vaut
// `colorParse[d]` dans TOUS les types (le radar teinte son fond en alpha).

/** Sous-ensemble du modèle de couleurs du composant Vue de DSFR Chart. */
export interface ChartColorModel {
  colorParse?: unknown;
  colorHover?: unknown;
  /** `bar-line-chart` seulement : la série de barres a son propre couple. */
  colorBarParse?: unknown;
  colorBarHover?: unknown;
}

/** Reporte une couleur de dataset dans la forme qu'avait l'entrée du modèle. */
function mirrorEntry(previous: unknown, applied: unknown): unknown {
  if (Array.isArray(previous)) {
    return previous.map((old, j) => colorAt(applied, j) ?? old);
  }
  return colorAt(applied, 0) ?? previous;
}

/**
 * Reporte les couleurs appliquées aux datasets dans le `colorParse` du
 * composant Vue, pour que les surfaces lues paresseusement — l'infobulle —
 * ne contredisent plus le canvas et la légende (#968).
 *
 * Retourne `false` si le modèle est hors d'atteinte : l'appelant le signale,
 * parce qu'une infobulle qui garde la palette par défaut APPARIE LA MAUVAISE
 * VALEUR À LA MAUVAISE SÉRIE — l'infobulle de DSFR Chart ne nomme pas les
 * séries, la couleur en est le seul lien.
 */
export function syncChartColorModel(
  model: ChartColorModel | null | undefined,
  datasets: readonly ColorableDataset[]
): boolean {
  if (!model || !Array.isArray(model.colorParse)) return false;

  // `bar-line-chart` : dataset 0 = barres (colorBarParse), dataset 1 = courbe.
  if (Array.isArray(model.colorBarParse)) {
    const bar = datasets[0];
    const line = datasets[1];
    if (bar) {
      model.colorBarParse = [mirrorEntry((model.colorBarParse as unknown[])[0], bar.borderColor)];
      if (Array.isArray(model.colorBarHover)) {
        model.colorBarHover = [mirrorEntry(model.colorBarHover[0], bar.hoverBorderColor)];
      }
    }
    if (line) {
      model.colorParse = [mirrorEntry((model.colorParse as unknown[])[0], line.borderColor)];
      if (Array.isArray(model.colorHover)) {
        model.colorHover = [mirrorEntry(model.colorHover[0], line.hoverBorderColor)];
      }
    }
    return true;
  }

  const previous = model.colorParse as unknown[];
  model.colorParse = datasets.map((dataset, i) => mirrorEntry(previous[i], dataset.borderColor));
  if (Array.isArray(model.colorHover)) {
    const previousHover = model.colorHover;
    model.colorHover = datasets.map((dataset, i) =>
      mirrorEntry(previousHover[i], dataset.hoverBorderColor)
    );
  }
  return true;
}
