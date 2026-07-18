/**
 * Bornes de l'échelle radiale pour dsfr-data-chart type="radar" — logique PURE
 * et testable (issue maturity-model#9).
 *
 * Sans borne, l'échelle radiale de Chart.js (`scales.r`) s'auto-ajuste au
 * min/max des données : le minimum se retrouve au CENTRE du radar, ce qui est
 * trompeur (un score 2,1/4 semble nul). Quand `y-min` / `y-max` sont fournis :
 *
 * 1. baseline déclarative : les props upstream `scale-min` / `scale-max` de
 *    `<radar-chart>` (`suggestedMin` / `suggestedMax`) — survivent aux
 *    recréations du chart par le watcher Vue `$props` ;
 * 2. affinage post-montage sur l'instance Chart.js (via
 *    {@link resolveChartInstance}) : bornes DURES `scales.r.min` / `max`, et
 *    `ticks.stepSize: 1` si les deux bornes sont entières avec une amplitude
 *    de 1 à 10 (anneaux de grille entiers).
 *
 * Aucune dépendance Lit / DOM-bridge : réutilisable et testable hors composant.
 */

/** Bornes calculées à appliquer à l'échelle radiale `scales.r`. */
export interface RadialScaleBounds {
  min?: number;
  max?: number;
  /** Pas des anneaux de grille (posé seulement si bornes entières, amplitude 1-10). */
  stepSize?: number;
}

/** Les bornes radiales ne valent que pour le type radar. */
export function isRadialChartType(type: string): boolean {
  return type === 'radar';
}

function parseBound(raw: string): number | null {
  const trimmed = (raw || '').trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

/**
 * Calcule les bornes radiales depuis les attributs `y-min` / `y-max` (strings).
 * - aucune borne valide → `null` (rien à appliquer, comportement inchangé)
 * - `stepSize: 1` seulement si les DEUX bornes sont entières et `0 < max - min <= 10`
 */
export function computeRadialScaleBounds(yMin: string, yMax: string): RadialScaleBounds | null {
  const min = parseBound(yMin);
  const max = parseBound(yMax);
  if (min === null && max === null) return null;

  const bounds: RadialScaleBounds = {};
  if (min !== null) bounds.min = min;
  if (max !== null) bounds.max = max;
  if (
    min !== null &&
    max !== null &&
    Number.isInteger(min) &&
    Number.isInteger(max) &&
    max - min > 0 &&
    max - min <= 10
  ) {
    bounds.stepSize = 1;
  }
  return bounds;
}

// --- Application sur l'instance Chart.js (duck-typing) ------------------------

export interface RadialScaleOptionsLike {
  min?: number;
  max?: number;
  ticks?: { stepSize?: number };
}
export interface RadialChartLike {
  options?: { scales?: Record<string, RadialScaleOptionsLike | undefined> };
  update?: (mode?: string) => void;
}

/**
 * Pose les bornes sur `options.scales.r` de l'instance Chart.js et redessine
 * (`update("none")`) si quelque chose a changé. Retourne `false` si l'échelle
 * radiale est introuvable (instance pas prête → re-tenter), `true` sinon.
 */
export function applyRadialScaleBounds(chart: RadialChartLike, bounds: RadialScaleBounds): boolean {
  const r = chart.options?.scales?.r;
  if (!r) return false;

  let changed = false;
  if (bounds.min !== undefined && r.min !== bounds.min) {
    r.min = bounds.min;
    changed = true;
  }
  if (bounds.max !== undefined && r.max !== bounds.max) {
    r.max = bounds.max;
    changed = true;
  }
  if (bounds.stepSize !== undefined) {
    if (!r.ticks) r.ticks = {};
    if (r.ticks.stepSize !== bounds.stepSize) {
      r.ticks.stepSize = bounds.stepSize;
      changed = true;
    }
  }
  if (changed) chart.update?.('none');
  return true;
}
