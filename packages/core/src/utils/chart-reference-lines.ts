/**
 * Lignes de référence pour dsfr-data-chart (#341) — logique PURE et testable.
 *
 * Trace une ligne verticale (à une catégorie/date) ou horizontale (à un seuil)
 * sur un graphique cartésien, avec un libellé en pastille. `@gouvfr/dsfr-chart`
 * rend dans un `<canvas>` (Chart.js) et n'expose aucune prop d'annotation : on
 * dessine un overlay SVG par-dessus, positionné depuis l'instance Chart.js.
 *
 * Aucune dépendance Lit / DOM-bridge : réutilisable et testable hors composant.
 */

/** Rouge DSFR par défaut (error-active-red-marianne). */
export const DEFAULT_REF_COLOR = '#c9191e';

/** Une ligne de référence déclarée dans l'attribut `reference-lines` (JSON). */
export interface ReferenceLine {
  /** `"x"` → ligne verticale ; `"y"` → ligne horizontale. */
  axis: 'x' | 'y';
  /** Valeur ciblée : libellé de catégorie / date (x) ou seuil numérique (y). */
  value: string | number;
  /** Libellé affiché en pastille (optionnel). */
  label?: string;
  /** Couleur CSS de la ligne et de la pastille. Défaut : rouge DSFR. */
  color?: string;
  /** Ligne pointillée. Défaut : true. */
  dash?: boolean;
  /** Ancrage du libellé le long de la ligne. Défaut : `"start"`. */
  position?: 'start' | 'end';
}

// --- Sous-ensemble structurel (duck-typing) d'une instance Chart.js -----------

export interface ChartScaleLike {
  getPixelForValue?: (value: unknown, index?: number) => number;
}
export interface ChartAreaLike {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
}
export interface ChartLike {
  canvas?: HTMLCanvasElement | null;
  chartArea?: ChartAreaLike;
  scales?: Record<string, ChartScaleLike | undefined>;
  data?: { labels?: unknown[] };
}

// --- Types de graphiques supportés -------------------------------------------

const CARTESIAN_TYPES = new Set(['line', 'bar', 'bar-line', 'scatter']);

/** Les lignes de référence ne valent que pour les graphiques cartésiens. */
export function isCartesianChartType(type: string): boolean {
  return CARTESIAN_TYPES.has(type);
}

// --- Parsing / validation ----------------------------------------------------

export interface ParseResult {
  lines: ReferenceLine[];
  error: string | null;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

/**
 * Parse et valide l'attribut JSON `reference-lines`.
 * - vide → `{ lines: [], error: null }`
 * - JSON invalide / pas un tableau → `error` renseigné, `lines: []`
 * - items invalides → ignorés ; si AUCUN item valide dans un tableau non vide,
 *   `error` renseigné.
 */
export function parseReferenceLines(json: string): ParseResult {
  const raw = (json || '').trim();
  if (!raw) return { lines: [], error: null };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { lines: [], error: 'reference-lines : JSON invalide' };
  }
  if (!Array.isArray(parsed)) {
    return { lines: [], error: 'reference-lines : un tableau JSON est attendu' };
  }

  const lines: ReferenceLine[] = [];
  for (const item of parsed) {
    if (!isPlainObject(item)) continue;
    const axis = item.axis;
    if (axis !== 'x' && axis !== 'y') continue;
    const value = item.value;
    const validValue =
      (typeof value === 'number' && Number.isFinite(value)) ||
      (typeof value === 'string' && value.length > 0);
    if (!validValue) continue;

    const line: ReferenceLine = { axis, value: value as string | number };
    if (typeof item.label === 'string') line.label = item.label;
    if (typeof item.color === 'string' && item.color.trim()) line.color = item.color.trim();
    if (typeof item.dash === 'boolean') line.dash = item.dash;
    if (item.position === 'start' || item.position === 'end') line.position = item.position;
    lines.push(line);
  }

  if (lines.length === 0) {
    return {
      lines: [],
      error: 'reference-lines : aucune ligne valide (axis "x"/"y" + value requis)',
    };
  }
  return { lines, error: null };
}

// --- Récupération de l'instance Chart.js -------------------------------------

function looksLikeChart(v: unknown, canvas: HTMLCanvasElement | null): v is ChartLike {
  if (!v || typeof v !== 'object') return false;
  const c = v as ChartLike;
  return c.canvas === canvas && !!c.scales && !!c.chartArea;
}

function deref(v: unknown): unknown {
  return v && typeof v === 'object' && (v as { __v_isRef?: boolean }).__v_isRef
    ? (v as { value: unknown }).value
    : v;
}

/**
 * Récupère l'instance Chart.js d'un custom element `@gouvfr/dsfr-chart`.
 *
 * La lib bundle sa propre copie de Chart.js (donc `window.Chart.getChart` ne la
 * connaît pas) et n'expose aucune API publique. Le GATE de faisabilité (#341) a
 * montré que l'instance vit dans les internes Vue, accessible en ACCÈS DIRECT
 * via `el._instance.proxy.chart` (et `ctx.chart`) — l'énumération des clés est
 * vide en build Vue production, donc on cible des noms candidats validés par
 * duck-typing plutôt que de scanner. Dégradation gracieuse → `null`.
 */
export function resolveChartInstance(
  chartEl: Element | null | undefined,
  canvas: HTMLCanvasElement | null
): ChartLike | null {
  if (!chartEl || !canvas) return null;

  // 1. window.Chart.getChart (inoffensif ; KO car Chart.js est bundlé)
  const win =
    typeof window !== 'undefined'
      ? (window as { Chart?: { getChart?: (c: HTMLCanvasElement) => unknown } })
      : undefined;
  try {
    const viaGlobal = win?.Chart?.getChart?.(canvas);
    if (looksLikeChart(viaGlobal, canvas)) return viaGlobal;
  } catch {
    /* ignore */
  }

  // 2. Internes Vue — accès DIRECT aux noms candidats (pas d'énumération)
  const inst = (chartEl as { _instance?: Record<string, Record<string, unknown> | undefined> })
    ._instance;
  if (inst) {
    const candidates: unknown[] = [
      inst.proxy?.chart,
      inst.ctx?.chart,
      inst.setupState?.chart,
      inst.exposed?.chart,
      inst.proxy?.myChart,
      inst.proxy?.chartInstance,
    ];
    for (const c of candidates) {
      const resolved = deref(c);
      if (looksLikeChart(resolved, canvas)) return resolved;
    }
  }

  return null;
}

// --- Calcul des coordonnées --------------------------------------------------

export interface LineGeometry {
  axis: 'x' | 'y';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  dash: boolean;
  label?: string;
  labelX: number;
  labelY: number;
  textAnchor: 'start' | 'middle' | 'end';
}

function pixelForX(chart: ChartLike, value: string | number): number {
  const scale = chart.scales?.x;
  if (!scale?.getPixelForValue) return NaN;
  // Échelle catégorielle : Chart.js attend l'INDEX de la catégorie. On le
  // retrouve dans data.labels puis on passe (value, index).
  if (typeof value === 'string' && Array.isArray(chart.data?.labels)) {
    const idx = chart.data!.labels!.findIndex((l) => String(l) === value);
    return idx >= 0 ? scale.getPixelForValue(value, idx) : NaN;
  }
  return scale.getPixelForValue(value);
}

/**
 * Calcule la géométrie (en pixels canvas) de chaque ligne de référence.
 * Les lignes hors zone traçable ou non résolubles (NaN) sont ignorées.
 */
export function computeReferenceGeometries(
  chart: ChartLike,
  lines: ReferenceLine[]
): LineGeometry[] {
  const area = chart.chartArea;
  if (!area) return [];
  const out: LineGeometry[] = [];

  for (const line of lines) {
    const color = line.color || DEFAULT_REF_COLOR;
    const dash = line.dash !== false;

    if (line.axis === 'x') {
      const px = pixelForX(chart, line.value);
      if (!Number.isFinite(px) || px < area.left - 0.5 || px > area.right + 0.5) continue;
      const atEnd = line.position === 'end';
      out.push({
        axis: 'x',
        x1: px,
        y1: area.top,
        x2: px,
        y2: area.bottom,
        color,
        dash,
        label: line.label,
        labelX: px,
        labelY: atEnd ? area.bottom : area.top,
        textAnchor: 'middle',
      });
    } else {
      const scale = chart.scales?.y;
      if (!scale?.getPixelForValue) continue;
      const py = scale.getPixelForValue(line.value);
      if (!Number.isFinite(py) || py < area.top - 0.5 || py > area.bottom + 0.5) continue;
      const atStart = line.position === 'start';
      out.push({
        axis: 'y',
        x1: area.left,
        y1: py,
        x2: area.right,
        y2: py,
        color,
        dash,
        label: line.label,
        labelX: atStart ? area.left : area.right,
        labelY: py,
        textAnchor: atStart ? 'start' : 'end',
      });
    }
  }

  return out;
}

// --- Génération de l'overlay SVG ---------------------------------------------

const SVG_NS = 'http://www.w3.org/2000/svg';
const LABEL_HEIGHT = 18;
const LABEL_PAD_X = 6;
const CHAR_WIDTH = 7; // estimation (pas de mesure de texte en logique pure)

/** Largeur estimée d'une pastille pour `label`. */
function pastilleWidth(label: string): number {
  return label.length * CHAR_WIDTH + LABEL_PAD_X * 2;
}

/**
 * Construit l'overlay SVG (lignes + pastilles) à superposer au canvas.
 * `aria-hidden` + `pointer-events:none` : purement décoratif, l'info est
 * relayée dans l'aria-label du wrapper via {@link referenceLinesAriaSummary}.
 */
export function buildReferenceOverlaySvg(
  geometries: LineGeometry[],
  width: number,
  height: number
): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'dsfr-data-chart__reflines');
  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(height));
  svg.setAttribute('aria-hidden', 'true');
  svg.style.position = 'absolute';
  svg.style.pointerEvents = 'none';
  svg.style.overflow = 'visible';

  for (const g of geometries) {
    const line = document.createElementNS(SVG_NS, 'line');
    line.setAttribute('x1', String(g.x1));
    line.setAttribute('y1', String(g.y1));
    line.setAttribute('x2', String(g.x2));
    line.setAttribute('y2', String(g.y2));
    line.setAttribute('stroke', g.color);
    line.setAttribute('stroke-width', '2');
    if (g.dash) line.setAttribute('stroke-dasharray', '5,4');
    svg.appendChild(line);

    if (!g.label) continue;

    const w = pastilleWidth(g.label);
    // Position de la pastille : décalée pour ne pas chevaucher la ligne.
    let rectX: number;
    let rectY: number;
    let textX: number;
    if (g.axis === 'x') {
      rectX = Math.max(0, Math.min(g.labelX - w / 2, width - w));
      // au-dessus (start) ou en dessous (end) de la zone
      rectY =
        g.textAnchor === 'middle' && g.labelY === g.y1 ? g.labelY - LABEL_HEIGHT - 2 : g.labelY + 2;
      textX = rectX + w / 2;
    } else {
      // y : ancré à droite (end) ou à gauche (start)
      rectX = g.textAnchor === 'start' ? g.labelX + 2 : Math.max(0, g.labelX - w - 2);
      rectY = g.labelY - LABEL_HEIGHT / 2;
      textX = rectX + w / 2;
    }

    const group = document.createElementNS(SVG_NS, 'g');
    group.setAttribute('class', 'dsfr-data-chart__refline-label');

    const rect = document.createElementNS(SVG_NS, 'rect');
    rect.setAttribute('x', String(rectX));
    rect.setAttribute('y', String(rectY));
    rect.setAttribute('width', String(w));
    rect.setAttribute('height', String(LABEL_HEIGHT));
    rect.setAttribute('rx', '2');
    rect.setAttribute('fill', g.color);
    group.appendChild(rect);

    const text = document.createElementNS(SVG_NS, 'text');
    text.setAttribute('x', String(textX));
    text.setAttribute('y', String(rectY + LABEL_HEIGHT / 2));
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('dominant-baseline', 'central');
    text.setAttribute('fill', '#ffffff');
    text.setAttribute('font-size', '12');
    text.textContent = g.label;
    group.appendChild(text);

    svg.appendChild(group);
  }

  return svg;
}

/**
 * Résumé textuel des repères, injecté dans l'aria-label du wrapper pour que les
 * lecteurs d'écran connaissent les lignes de référence (overlay SVG aria-hidden).
 */
export function referenceLinesAriaSummary(lines: ReferenceLine[]): string {
  const parts = lines.map((l) => {
    const what = l.label ? `${l.label} ` : '';
    return `Repere : ${what}a ${l.value}`.replace('  ', ' ');
  });
  return parts.join('. ');
}
