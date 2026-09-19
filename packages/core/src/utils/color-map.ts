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
}

/** Sous-ensemble structurel d'une instance Chart.js recolorable. */
export interface ColorableChart {
  data?: { labels?: unknown[]; datasets?: ColorableDataset[] };
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
      dataset.backgroundColor = color;
      dataset.borderColor = color;
      dataset.hoverBackgroundColor = color;
      dataset.hoverBorderColor = color;
    });
    chart.update?.('none');
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
