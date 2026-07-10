/**
 * Cibles / objectifs futurs pour dsfr-data-chart (#377) — logique PURE et testable.
 *
 * Représente un objectif lointain (« Cible 2030 : 26 % ») sur une courbe :
 * trajectoire extrapolée en pointillés depuis le dernier point réel jusqu'à un
 * losange posé à l'échéance, zone future grisée, étiquette, tooltip et légende.
 * `@gouvfr/dsfr-chart` (Chart.js bundlé dans un canvas) ne sait tracer ni série
 * pointillée ni marqueur losange : on décalque l'overlay SVG de #341
 * (`chart-reference-lines.ts`, non modifié — import de types seulement).
 *
 * Aucune dépendance Lit / DOM-bridge : réutilisable et testable hors composant.
 */

import { DEFAULT_REF_COLOR, type ChartLike } from './chart-reference-lines.js';
import { formatNumber, formatDecimal } from './formatters.js';

// --- Types --------------------------------------------------------------------

/** Une cible déclarée dans l'attribut `targets` (JSON). */
export interface ChartTarget {
  /** Échéance sur l'axe X (ex. `2030` ou `"2030"`). Peut être au-delà des données. */
  x: string | number;
  /** Valeur visée à l'échéance. */
  value: number;
  /** Série concernée : nom de dataset (`datasets[].label`) ou index. Défaut : 0. */
  series?: string | number;
  /** Libellé affiché en pastille et en titre de tooltip (ex. `"Cible 2030 : 26 %"`). */
  label?: string;
  /** Couleur CSS. Défaut : couleur de la série, sinon rouge DSFR. */
  color?: string;
}

/** Sous-ensemble structurel d'un dataset Chart.js. */
export interface ChartDatasetLike {
  label?: string;
  borderColor?: unknown;
  data?: unknown[];
  /** Id de l'échelle Y du dataset (bar-line : `y` pour les barres, `yLine` pour la ligne). */
  yAxisID?: unknown;
}

/** ChartLike enrichi des datasets (nécessaire pour résoudre les séries). */
export interface ChartWithDatasetsLike extends ChartLike {
  data?: { labels?: unknown[]; datasets?: ChartDatasetLike[] };
}

/** Géométrie (pixels canvas) d'un losange de cible et de sa trajectoire. */
export interface TargetMarkerGeometry {
  /** Position du losange (échéance, valeur cible). */
  x: number;
  y: number;
  /** Départ de la trajectoire pointillée = dernier point réel de la série (null si introuvable). */
  fromX: number | null;
  fromY: number | null;
  color: string;
  label?: string;
  /** Position de la pastille (anti-collision verticale par échéance). */
  labelX: number;
  labelY: number;
  /** Échéance brute (pour `data-target-x` et le regroupement tooltip). */
  targetX: string | number;
  /** Nom de la série résolue (datasets[].label, sinon `Série N+1`). */
  seriesName: string;
  /** Index du dataset résolu (pour choisir l'unité en bar-line). */
  seriesIndex: number;
  /** Valeur cible brute (pour le tooltip). */
  value: number;
}

/** Frontière réalisé / projeté + bornes de la zone future. */
export interface TargetsBoundaryGeometry {
  /** Pixel X du dernier point réel (toutes séries confondues). */
  x: number;
  top: number;
  bottom: number;
  /** Bord droit de la zone traçable (fin de la bande grisée). */
  right: number;
}

/** Sortie de {@link computeTargetGeometries}. */
export interface TargetsLayout {
  markers: TargetMarkerGeometry[];
  boundary: TargetsBoundaryGeometry | null;
}

// --- Types de graphiques supportés ---------------------------------------------

const TARGETS_TYPES = new Set(['line', 'bar-line']);

/** Les cibles supposent une trajectoire : line et bar-line uniquement. */
export function isTargetsChartType(type: string): boolean {
  return TARGETS_TYPES.has(type);
}

// --- Parsing / validation -------------------------------------------------------

export interface ParseTargetsResult {
  targets: ChartTarget[];
  error: string | null;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

/**
 * Parse et valide l'attribut JSON `targets`. Même contrat que
 * `parseReferenceLines` : vide → ok ; JSON cassé / pas un tableau / aucun item
 * valide → `error` renseigné ; items invalides ignorés silencieusement.
 */
export function parseTargets(json: string): ParseTargetsResult {
  const raw = (json || '').trim();
  if (!raw) return { targets: [], error: null };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { targets: [], error: 'targets : JSON invalide' };
  }
  if (!Array.isArray(parsed)) {
    return { targets: [], error: 'targets : un tableau JSON est attendu' };
  }

  const targets: ChartTarget[] = [];
  for (const item of parsed) {
    if (!isPlainObject(item)) continue;
    const x = item.x;
    const validX =
      (typeof x === 'number' && Number.isFinite(x)) || (typeof x === 'string' && x.length > 0);
    const value = item.value;
    if (!validX || typeof value !== 'number' || !Number.isFinite(value)) continue;

    const target: ChartTarget = { x: x as string | number, value };
    if (typeof item.series === 'string' || typeof item.series === 'number') {
      target.series = item.series;
    }
    if (typeof item.label === 'string') target.label = item.label;
    if (typeof item.color === 'string' && item.color.trim()) target.color = item.color.trim();
    targets.push(target);
  }

  if (targets.length === 0) {
    return { targets: [], error: 'targets : aucune cible valide (x et value numérique requis)' };
  }
  return { targets, error: null };
}

// --- Extension d'axe -------------------------------------------------------------

/**
 * Reproduit l'heuristique du natif `@gouvfr/dsfr-chart` qui bascule l'axe X en
 * échelle linéaire quand le premier label est numérique
 * (`parseFloat(labels[0]) == labels[0]`). Exposé pour tests/documentation : sur
 * axe catégoriel, l'écart 2025→2030 vaut UN cran (non proportionnel).
 */
export function isNativeLinearAxis(labels: unknown[]): boolean {
  if (!Array.isArray(labels) || labels.length === 0) return false;
  const first = labels[0];
  // eslint-disable-next-line eqeqeq -- décalque volontaire de l'heuristique native (==)
  return parseFloat(String(first)) == (first as never);
}

/**
 * Étend les labels avec les échéances absentes et padde chaque série avec
 * `null` (Chart.js coupe la ligne, pas d'entrée de légende parasite, le
 * tooltip natif ignore les points null). PUR : ne mute ni `labels` ni `series`.
 *
 * Les échéances ajoutées sont dédupliquées (comparaison `String(x)`), triées
 * numériquement si toutes numériques, sinon laissées en ordre de déclaration.
 */
export function padSeriesForTargets(
  labels: unknown[],
  series: number[][],
  targetXs: Array<string | number>
): { labels: unknown[]; series: Array<Array<number | null>>; added: Array<string | number> } {
  const existing = new Set(labels.map((l) => String(l)));
  const added: Array<string | number> = [];
  for (const x of targetXs) {
    const key = String(x);
    if (existing.has(key)) continue;
    existing.add(key);
    added.push(x);
  }
  if (added.length > 1 && added.every((x) => Number.isFinite(Number(x)))) {
    added.sort((a, b) => Number(a) - Number(b));
  }

  const paddedSeries: Array<Array<number | null>> = series.map((s) => [
    ...s,
    ...added.map(() => null),
  ]);
  return { labels: [...labels, ...added], series: paddedSeries, added };
}

// --- Calcul des géométries --------------------------------------------------------

/**
 * Copie durcie de `pixelForX` (chart-reference-lines.ts) : résout d'abord par
 * label (échelle catégorielle : Chart.js attend l'index), avec repli
 * `Number(value)` sur échelle linéaire quand le label est introuvable.
 */
function pixelForTargetX(chart: ChartLike, value: string | number): number {
  const scale = chart.scales?.x;
  if (!scale?.getPixelForValue) return NaN;
  if (Array.isArray(chart.data?.labels)) {
    const idx = chart.data!.labels!.findIndex((l) => String(l) === String(value));
    if (idx >= 0) return scale.getPixelForValue(value, idx);
  }
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? scale.getPixelForValue(n) : NaN;
}

const LABEL_HEIGHT = 18;
const LABEL_PAD_X = 6;
const CHAR_WIDTH = 7; // estimation (pas de mesure de texte en logique pure)
const LABEL_GAP = 2;
/** Décalage vertical de la pastille au-dessus du losange. */
const LABEL_OFFSET_Y = 16;

/** Dernier index dont la valeur est non-null / non-undefined. */
function lastNonNullIndex(data: unknown[] | undefined): number {
  if (!Array.isArray(data)) return -1;
  for (let i = data.length - 1; i >= 0; i--) {
    if (data[i] !== null && data[i] !== undefined) return i;
  }
  return -1;
}

function resolveDataset(
  datasets: ChartDatasetLike[],
  series: string | number | undefined,
  seriesNames: string[]
): { dataset: ChartDatasetLike; index: number } | null {
  if (typeof series === 'string') {
    // Les datasets de @gouvfr/dsfr-chart n'ont pas de `label` : on résout
    // aussi via les noms de séries connus du composant (même ordre).
    let idx = datasets.findIndex((d) => d.label === series);
    if (idx < 0) idx = seriesNames.indexOf(series);
    return idx >= 0 && datasets[idx] ? { dataset: datasets[idx], index: idx } : null;
  }
  const idx = typeof series === 'number' ? series : 0;
  return datasets[idx] ? { dataset: datasets[idx], index: idx } : null;
}

/**
 * Échelle Y du dataset : bar-line utilise des échelles séparées (`y` pour les
 * barres, `yLine` pour la ligne) reliées par `yAxisID`. Repli sur `y`.
 */
function yScaleForDataset(chart: ChartWithDatasetsLike, dataset: ChartDatasetLike) {
  const id = typeof dataset.yAxisID === 'string' ? dataset.yAxisID : '';
  return (id && chart.scales?.[id]) || chart.scales?.y;
}

/**
 * Calcule la géométrie (pixels canvas) des losanges, trajectoires et de la
 * frontière réalisé/projeté. Les cibles non résolubles (série introuvable,
 * pixel NaN ou hors `chartArea`) sont ignorées. `seriesNames` (optionnel)
 * fournit les noms de séries connus du composant, dans l'ordre des datasets —
 * les datasets de `@gouvfr/dsfr-chart` n'exposent pas de `label`.
 */
export function computeTargetGeometries(
  chart: ChartWithDatasetsLike,
  targets: ChartTarget[],
  seriesNames: string[] = []
): TargetsLayout {
  const area = chart.chartArea;
  if (!area) return { markers: [], boundary: null };
  const datasets = chart.data?.datasets ?? [];
  const labels = chart.data?.labels ?? [];

  const markers: TargetMarkerGeometry[] = [];

  for (const target of targets) {
    const resolved = resolveDataset(datasets, target.series, seriesNames);
    if (!resolved) continue;
    const { dataset, index } = resolved;
    const yScale = yScaleForDataset(chart, dataset);

    const px = pixelForTargetX(chart, target.x);
    const py = yScale?.getPixelForValue ? yScale.getPixelForValue(target.value) : NaN;
    if (!Number.isFinite(px) || !Number.isFinite(py)) continue;
    if (px < area.left - 0.5 || px > area.right + 0.5) continue;
    if (py < area.top - 0.5 || py > area.bottom + 0.5) continue;

    // Départ de la trajectoire : dernier point réel de la série
    let fromX: number | null = null;
    let fromY: number | null = null;
    const lastIdx = lastNonNullIndex(dataset.data);
    if (lastIdx >= 0 && lastIdx < labels.length) {
      const fx = pixelForTargetX(chart, labels[lastIdx] as string | number);
      const fy = yScale?.getPixelForValue ? yScale.getPixelForValue(dataset.data![lastIdx]) : NaN;
      if (Number.isFinite(fx) && Number.isFinite(fy)) {
        fromX = fx;
        fromY = fy;
      }
    }

    const seriesColor =
      typeof dataset.borderColor === 'string' && dataset.borderColor.trim()
        ? dataset.borderColor
        : '';
    markers.push({
      x: px,
      y: py,
      fromX,
      fromY,
      color: target.color || seriesColor || DEFAULT_REF_COLOR,
      label: target.label,
      labelX: px,
      labelY: py - LABEL_OFFSET_Y,
      targetX: target.x,
      seriesName: dataset.label || seriesNames[index] || `Série ${index + 1}`,
      seriesIndex: index,
      value: target.value,
    });
  }

  // Anti-collision verticale des pastilles, par échéance : les étiquettes d'une
  // même échéance sont empilées vers le haut sans se chevaucher.
  const byX = new Map<string, TargetMarkerGeometry[]>();
  for (const m of markers) {
    const key = String(m.targetX);
    if (!byX.has(key)) byX.set(key, []);
    byX.get(key)!.push(m);
  }
  for (const group of byX.values()) {
    const sorted = [...group].sort((a, b) => b.y - a.y); // du plus bas au plus haut
    let ceiling = Infinity;
    for (const m of sorted) {
      let ly = m.y - LABEL_OFFSET_Y;
      if (ly + LABEL_HEIGHT > ceiling) ly = ceiling - LABEL_HEIGHT - LABEL_GAP;
      m.labelY = ly;
      ceiling = ly;
    }
  }

  // Frontière réalisé/projeté : pixel du plus grand index où AU MOINS un
  // dataset a une valeur réelle.
  let boundary: TargetsBoundaryGeometry | null = null;
  let maxIdx = -1;
  for (const d of datasets) {
    maxIdx = Math.max(maxIdx, lastNonNullIndex(d.data));
  }
  if (maxIdx >= 0 && maxIdx < labels.length) {
    const bx = pixelForTargetX(chart, labels[maxIdx] as string | number);
    if (Number.isFinite(bx)) {
      boundary = { x: bx, top: area.top, bottom: area.bottom, right: area.right };
    }
  }

  return { markers, boundary };
}

// --- Génération de l'overlay SVG ---------------------------------------------------

const SVG_NS = 'http://www.w3.org/2000/svg';
/** Demi-diagonale du losange (losange de 12px). */
const MARKER_HALF = 6;
/** Gris de la zone future et de la frontière. */
const FUTURE_ZONE_COLOR = '#666666';

function pastilleWidth(label: string): number {
  return label.length * CHAR_WIDTH + LABEL_PAD_X * 2;
}

/**
 * Construit l'overlay SVG des cibles : zone future grisée, frontière
 * réalisé/projeté, trajectoires pointillées, losanges et pastilles.
 * SVG racine `aria-hidden` + `pointer-events:none` ; seuls les losanges
 * (`.dsfr-data-chart__target-marker`) captent le pointeur (tooltip, étape C).
 * L'info est relayée dans l'aria-label du wrapper via {@link targetsAriaSummary}.
 */
export function buildTargetsOverlaySvg(
  layout: TargetsLayout,
  width: number,
  height: number,
  options: { zone: boolean } = { zone: true }
): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'dsfr-data-chart__targets');
  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(height));
  svg.setAttribute('aria-hidden', 'true');
  svg.style.position = 'absolute';
  svg.style.pointerEvents = 'none';
  svg.style.overflow = 'visible';

  const { markers, boundary } = layout;

  // 1. Zone future grisée (du dernier point réel au bord droit)
  if (options.zone && boundary && boundary.right > boundary.x) {
    const rect = document.createElementNS(SVG_NS, 'rect');
    rect.setAttribute('class', 'dsfr-data-chart__targets-zone');
    rect.setAttribute('x', String(boundary.x));
    rect.setAttribute('y', String(boundary.top));
    rect.setAttribute('width', String(boundary.right - boundary.x));
    rect.setAttribute('height', String(boundary.bottom - boundary.top));
    rect.setAttribute('fill', FUTURE_ZONE_COLOR);
    rect.setAttribute('opacity', '0.08');
    svg.appendChild(rect);
  }

  // 2. Frontière verticale pointillée réalisé/projeté
  if (options.zone && boundary) {
    const line = document.createElementNS(SVG_NS, 'line');
    line.setAttribute('class', 'dsfr-data-chart__targets-boundary');
    line.setAttribute('x1', String(boundary.x));
    line.setAttribute('y1', String(boundary.top));
    line.setAttribute('x2', String(boundary.x));
    line.setAttribute('y2', String(boundary.bottom));
    line.setAttribute('stroke', FUTURE_ZONE_COLOR);
    line.setAttribute('stroke-width', '1');
    line.setAttribute('stroke-dasharray', '4,4');
    svg.appendChild(line);
  }

  // 3. Trajectoires pointillées (dernier point réel → losange)
  for (const m of markers) {
    if (m.fromX === null || m.fromY === null) continue;
    const line = document.createElementNS(SVG_NS, 'line');
    line.setAttribute('class', 'dsfr-data-chart__target-path');
    line.setAttribute('x1', String(m.fromX));
    line.setAttribute('y1', String(m.fromY));
    line.setAttribute('x2', String(m.x));
    line.setAttribute('y2', String(m.y));
    line.setAttribute('stroke', m.color);
    line.setAttribute('stroke-width', '2');
    line.setAttribute('stroke-dasharray', '5,4');
    svg.appendChild(line);
  }

  // 4. Losanges (seuls éléments interactifs : pointer-events:auto)
  for (const m of markers) {
    const polygon = document.createElementNS(SVG_NS, 'polygon');
    polygon.setAttribute('class', 'dsfr-data-chart__target-marker');
    polygon.setAttribute(
      'points',
      `${m.x},${m.y - MARKER_HALF} ${m.x + MARKER_HALF},${m.y} ${m.x},${m.y + MARKER_HALF} ${m.x - MARKER_HALF},${m.y}`
    );
    polygon.setAttribute('fill', '#ffffff');
    polygon.setAttribute('stroke', m.color);
    polygon.setAttribute('stroke-width', '2');
    polygon.setAttribute('data-target-x', String(m.targetX));
    polygon.style.pointerEvents = 'auto';
    svg.appendChild(polygon);
  }

  // 5. Pastilles
  for (const m of markers) {
    if (!m.label) continue;
    const w = pastilleWidth(m.label);
    const rectX = Math.max(0, Math.min(m.labelX - w / 2, width - w));
    const rectY = m.labelY - LABEL_HEIGHT / 2;

    const group = document.createElementNS(SVG_NS, 'g');
    group.setAttribute('class', 'dsfr-data-chart__target-label');

    const rect = document.createElementNS(SVG_NS, 'rect');
    rect.setAttribute('x', String(rectX));
    rect.setAttribute('y', String(rectY));
    rect.setAttribute('width', String(w));
    rect.setAttribute('height', String(LABEL_HEIGHT));
    rect.setAttribute('rx', '2');
    rect.setAttribute('fill', m.color);
    group.appendChild(rect);

    const text = document.createElementNS(SVG_NS, 'text');
    text.setAttribute('x', String(rectX + w / 2));
    text.setAttribute('y', String(rectY + LABEL_HEIGHT / 2));
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('dominant-baseline', 'central');
    text.setAttribute('fill', '#ffffff');
    text.setAttribute('font-size', '12');
    text.textContent = m.label;
    group.appendChild(text);

    svg.appendChild(group);
  }

  return svg;
}

// --- Tooltip / légende (builders purs) ----------------------------------------------

/** Une ligne du tooltip cible (une série à l'échéance survolée). */
export interface TargetTooltipLine {
  color: string;
  name: string;
  /** Valeur déjà formatée (via {@link formatTargetValue}). */
  value: string;
}

/**
 * Construit le tooltip DSFR d'une échéance (style décalqué de
 * dsfr-data-world-map). `aria-hidden` : l'info est déjà dans l'aria-label.
 * Le positionnement est fait par l'appelant (composant).
 */
export function buildTargetTooltip(title: string, lines: TargetTooltipLine[]): HTMLDivElement {
  const tooltip = document.createElement('div');
  tooltip.className = 'dsfr-data-chart__target-tooltip';
  tooltip.setAttribute('aria-hidden', 'true');
  tooltip.style.cssText =
    'position: absolute; pointer-events: none; z-index: 10;' +
    'background: var(--background-default-grey, #fff);' +
    'color: var(--text-default-grey, #161616);' +
    'border: 1px solid var(--border-default-grey, #ddd);' +
    'border-radius: 4px; padding: 4px 8px; font-size: 0.8125rem;' +
    'box-shadow: 0 2px 6px rgba(0,0,0,0.15); white-space: nowrap;';

  const strong = document.createElement('strong');
  strong.textContent = title;
  tooltip.appendChild(strong);

  for (const line of lines) {
    const row = document.createElement('div');
    row.style.cssText = 'display: flex; align-items: center; gap: 6px; margin-top: 2px;';
    const swatch = document.createElement('span');
    swatch.style.cssText =
      `display: inline-block; width: 10px; height: 10px; border-radius: 2px;` +
      `background: ${line.color}; flex: none;`;
    row.appendChild(swatch);
    const text = document.createElement('span');
    text.textContent = `${line.name} : ${line.value}`;
    row.appendChild(text);
    tooltip.appendChild(row);
  }

  return tooltip;
}

export const DEFAULT_TARGETS_LEGEND_HISTORICAL = 'Données historiques';
export const DEFAULT_TARGETS_LEGEND_PROJECTED = 'Trajectoire, cible extrapolée';

/**
 * Construit la légende réalisé/projeté affichée sous le graphe.
 * `aria-hidden` : l'info est relayée par l'aria-label du wrapper.
 */
export function buildTargetsLegend(labels: [string, string]): HTMLDivElement {
  const legend = document.createElement('div');
  legend.className = 'dsfr-data-chart__targets-legend';
  legend.setAttribute('aria-hidden', 'true');
  legend.style.cssText =
    'display: flex; gap: 1.5rem; justify-content: center; flex-wrap: wrap;' +
    'margin-top: 0.25rem; font-size: 0.75rem; color: var(--text-mention-grey, #666);';

  const entries: Array<{ dashed: boolean; label: string }> = [
    { dashed: false, label: labels[0] },
    { dashed: true, label: labels[1] },
  ];
  for (const entry of entries) {
    const item = document.createElement('span');
    item.style.cssText = 'display: inline-flex; align-items: center; gap: 6px;';
    const sample = document.createElement('span');
    sample.style.cssText =
      'display: inline-block; width: 24px; border-top: 2px ' +
      `${entry.dashed ? 'dashed' : 'solid'} currentColor;`;
    item.appendChild(sample);
    const text = document.createElement('span');
    text.textContent = entry.label;
    item.appendChild(text);
    legend.appendChild(item);
  }

  return legend;
}

/**
 * Interprète l'attribut `targets-legend` :
 * - `""` → légende affichée avec les libellés par défaut ;
 * - `"off"` → masquée ;
 * - `'["hist","proj"]'` → libellés personnalisés (repli sur les défauts si invalide).
 */
export function parseTargetsLegend(attr: string): { show: boolean; labels: [string, string] } {
  const defaults: [string, string] = [
    DEFAULT_TARGETS_LEGEND_HISTORICAL,
    DEFAULT_TARGETS_LEGEND_PROJECTED,
  ];
  const raw = (attr || '').trim();
  if (!raw) return { show: true, labels: defaults };
  if (raw === 'off') return { show: false, labels: defaults };
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed) && typeof parsed[0] === 'string' && typeof parsed[1] === 'string') {
      return { show: true, labels: [parsed[0], parsed[1]] };
    }
  } catch {
    /* repli sur les défauts */
  }
  return { show: true, labels: defaults };
}

/**
 * Formate une valeur de cible pour le tooltip : entier → format nombre
 * (`37849` → `37 849`), sinon décimal (`26.5` → `26,5`), unité collée par
 * espace insécable.
 */
export function formatTargetValue(value: number, unit?: string): string {
  const formatted = Number.isInteger(value) ? formatNumber(value) : formatDecimal(value);
  const trimmed = unit?.trim();
  return trimmed ? `${formatted}\u00a0${trimmed}` : formatted;
}

/**
 * Résumé textuel des cibles, injecté dans l'aria-label du wrapper pour que les
 * lecteurs d'écran connaissent les objectifs (overlay SVG aria-hidden).
 */
export function targetsAriaSummary(targets: ChartTarget[]): string {
  const parts = targets.map((t) => (t.label ? `Cible : ${t.label}` : `Cible ${t.x} : ${t.value}`));
  return parts.join('. ');
}
