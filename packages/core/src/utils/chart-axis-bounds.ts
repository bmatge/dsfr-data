/**
 * Bornes d'axe de dsfr-data-chart (`x-min`, `x-max`, `y-min`, `y-max`) — logique
 * PURE et testable (#1273).
 *
 * Avant : les quatre attributs étaient relayés tels quels à DSFR Chart, qui les
 * pose en `suggestedMin` / `suggestedMax` sur l'échelle Chart.js du MÊME NOM.
 * Mesuré dans un navigateur (DSFR Chart 2.1.1), cela donnait trois défauts :
 *
 * 1. sur un axe d'ÉTIQUETTES (échelle `category`), la borne n'est pas un
 *    libellé connu : Chart.js l'ajoute à la liste, et l'axe gagne une
 *    catégorie fantôme (« 5 », « 40 ») — `x-*` sur des barres, une courbe à
 *    étiquettes texte ou un barres + ligne, `y-*` sur des barres horizontales ;
 * 2. `<bar-line-chart>` ne lit ni `y-min` ni `y-max` (il attend `y-bar-*` et
 *    `y-line-*`) : la borne était ignorée sans un mot ;
 * 3. une borne « suggérée » n'est qu'une invitation à ÉLARGIR, arrondie à la
 *    graduation voisine : `y-min="5"` rendait un axe partant de 0, `y-max="37"`
 *    un axe montant à 40.
 *
 * Règle appliquée ici — pour chaque couple attribut × type, la borne AGIT ou
 * elle est SIGNALÉE, jamais ignorée en silence, jamais posée à contresens :
 *
 * - `y-min` / `y-max` bornent l'axe des VALEURS, où qu'il soit dessiné : l'axe
 *   vertical d'une courbe, d'un nuage ou de barres, l'axe HORIZONTAL de barres
 *   horizontales, l'axe des barres (à gauche) d'un barres + ligne, l'échelle
 *   radiale d'un radar (celle-ci reste traitée par `chart-radial-scale.ts`) ;
 * - `x-min` / `x-max` bornent l'axe horizontal quand il porte des NOMBRES :
 *   nuage ou courbe dont les étiquettes sont numériques (années, mesures), et
 *   barres horizontales, où l'axe horizontal est celui des valeurs ;
 * - une borne qui agit est posée EXACTEMENT (borne dure Chart.js, sur
 *   l'instance, après le rendu — même mécanisme que l'échelle radiale) ;
 * - une borne ne masque jamais une donnée : un minimum au-dessus de la plus
 *   petite valeur, un maximum en dessous de la plus grande sont ignorés et
 *   signalés. Des barres partent de zéro : un minimum positif y est ignoré et
 *   signalé (tronquer l'axe d'un graphique en barres fausse la comparaison des
 *   longueurs) ;
 * - sur un axe d'étiquettes, ou un type sans axe, l'attribut n'est plus relayé
 *   (plus de catégorie fantôme) et il est signalé, avec l'attribut qui agit à
 *   sa place quand il existe.
 *
 * Aucune dépendance Lit / DOM : réutilisable et testable hors composant.
 */

import { maxOf, minOf } from '@dsfr-data/shared/lib';

export type AxisBoundAttr = 'x-min' | 'x-max' | 'y-min' | 'y-max';

export interface AxisBoundsInput {
  /** `type` de dsfr-data-chart. */
  type: string;
  horizontal: boolean;
  stacked: boolean;
  xMin: string;
  xMax: string;
  yMin: string;
  yMax: string;
  /** Étiquettes telles que transmises à DSFR Chart. */
  labels: unknown[];
  /** Séries telles que transmises à DSFR Chart, dans l'ordre des datasets. */
  series: Array<Array<number | null>>;
}

/** Borne dure à poser sur une échelle Chart.js. */
export interface AxisScaleBounds {
  min?: number;
  max?: number;
}

export interface AxisBoundsWarning {
  attr: AxisBoundAttr;
  /** Motif, stable d'un jeu de données à l'autre : clé de l'avertissement unique. */
  code: string;
  /** Texte complet, sans le préfixe `dsfr-data-chart[id]`. */
  message: string;
}

export interface AxisBoundsPlan {
  /**
   * Attributs relayés à l'élément DSFR Chart : la base DÉCLARATIVE (bornes
   * suggérées), qui survit aux recréations du graphique par le watcher Vue.
   */
  attrs: Record<string, string>;
  /** Bornes dures par identifiant d'échelle Chart.js (`x`, `y`). */
  scales: Record<string, AxisScaleBounds>;
  warnings: AxisBoundsWarning[];
}

/** Types sans axe : aucune des quatre bornes n'y a de sens. */
const TYPES_SANS_AXE = new Set(['pie', 'gauge', 'map', 'map-reg', 'map-aca', 'map-monde']);

interface Lue {
  attr: AxisBoundAttr;
  /** Valeur écrite par la page, sans ses espaces. */
  raw: string;
  value: number;
}

/** Un axe borné : l'échelle Chart.js visée et l'étendue des données qu'il porte. */
interface Axe {
  /** Identifiant de l'échelle Chart.js. */
  scale: string;
  /** Noms des attributs DSFR Chart qui portent la base déclarative. */
  attrMin: string;
  attrMax: string;
  /** Plus petite et plus grande valeur portées (zéro compris pour des barres). */
  lo: number | null;
  hi: number | null;
  /** Axe de BARRES : il part de zéro. */
  barres: boolean;
}

/** Même test que DSFR Chart (`xAxisType`) : la première étiquette décide. */
export function isNumericLabelAxis(labels: unknown[]): boolean {
  if (!labels.length) return false;
  const first = labels[0];
  if (first === null || first === undefined || first === '') return false;
  // Volontairement l'égalité lâche du composant Vue : `parseFloat("2020") == "2020"`.
  // eslint-disable-next-line eqeqeq
  return parseFloat(String(first)) == (first as number);
}

function finis(values: Array<number | null>): number[] {
  return values.filter((v): v is number => v !== null && Number.isFinite(v));
}

/** Étendue d'un jeu de séries ; `null` des deux côtés quand il n'y a aucune valeur. */
function etendue(
  series: Array<Array<number | null>>,
  options: { empile: boolean; barres: boolean }
): { lo: number | null; hi: number | null } {
  let values: number[];
  if (options.empile && series.length > 1) {
    // Barres empilées : ce que l'axe porte, c'est le CUMUL par étiquette — les
    // positifs d'un côté de zéro, les négatifs de l'autre.
    const longueur = maxOf(series.map((s) => s.length));
    values = [];
    for (let i = 0; i < longueur; i++) {
      let positifs = 0;
      let negatifs = 0;
      for (const serie of series) {
        const v = serie[i];
        if (v === null || v === undefined || !Number.isFinite(v)) continue;
        if (v >= 0) positifs += v;
        else negatifs += v;
      }
      values.push(positifs, negatifs);
    }
  } else {
    values = finis(series.flat());
  }
  if (options.barres) values.push(0);
  if (!values.length) return { lo: null, hi: null };
  return { lo: minOf(values), hi: maxOf(values) };
}

function nombre(n: number): string {
  return String(Math.round(n * 1e6) / 1e6);
}

/**
 * Décide, pour un graphique, ce que deviennent ses quatre bornes : attributs
 * relayés, bornes dures à poser après le rendu, avertissements.
 */
export function planAxisBounds(input: AxisBoundsInput): AxisBoundsPlan {
  const plan: AxisBoundsPlan = { attrs: {}, scales: {}, warnings: [] };
  const { type } = input;

  const lues = new Map<AxisBoundAttr, Lue>();
  const ecrites: AxisBoundAttr[] = [];
  const brutes: Array<[AxisBoundAttr, string]> = [
    ['x-min', input.xMin],
    ['x-max', input.xMax],
    ['y-min', input.yMin],
    ['y-max', input.yMax],
  ];
  const signaler = (attr: AxisBoundAttr, code: string, message: string) => {
    plan.warnings.push({ attr, code, message });
  };

  for (const [attr, brut] of brutes) {
    const raw = (brut || '').trim();
    if (!raw) continue;
    ecrites.push(attr);
    const value = Number(raw);
    if (!Number.isFinite(value)) {
      signaler(attr, 'non-numerique', `${attr}="${raw}" n'est pas un nombre : borne ignorée`);
      continue;
    }
    lues.set(attr, { attr, raw, value });
  }
  if (!ecrites.length) return plan;

  const sansEffet = (attrs: AxisBoundAttr[], code: string, raison: string) => {
    for (const attr of attrs) {
      if (!lues.has(attr)) continue;
      signaler(attr, code, `${attr} est sans effet sur type="${type}" : ${raison}`);
      lues.delete(attr);
    }
  };

  if (TYPES_SANS_AXE.has(type)) {
    sansEffet(['x-min', 'x-max', 'y-min', 'y-max'], 'sans-axe', `ce type n'a pas d'axe`);
    return plan;
  }

  if (type === 'radar') {
    // `y-min` / `y-max` → échelle radiale, par chart-radial-scale.ts.
    sansEffet(
      ['x-min', 'x-max'],
      'radar',
      `un radar n'a qu'une échelle radiale, que bornent y-min / y-max`
    );
    return plan;
  }

  const axes: Array<{ axe: Axe; min?: Lue; max?: Lue }> = [];

  if (type === 'bar' && input.horizontal) {
    // Barres horizontales : l'axe des valeurs est l'axe HORIZONTAL (échelle
    // `x`). `x-*` le borne au sens littéral, `y-*` au sens « axe des valeurs » ;
    // les deux écrits, `x-*` l'emporte.
    const choisir = (x: AxisBoundAttr, y: AxisBoundAttr): Lue | undefined => {
      const lx = lues.get(x);
      const ly = lues.get(y);
      if (lx && ly && lx.value !== ly.value) {
        signaler(
          y,
          'doublon-horizontal',
          `${y}="${ly.raw}" est ignoré sur des barres horizontales : ${x}="${lx.raw}" borne déjà l'axe des valeurs`
        );
      }
      return lx ?? ly;
    };
    axes.push({
      axe: {
        scale: 'x',
        attrMin: 'x-min',
        attrMax: 'x-max',
        barres: true,
        ...etendue(input.series, { empile: input.stacked, barres: true }),
      },
      min: choisir('x-min', 'y-min'),
      max: choisir('x-max', 'y-max'),
    });
  } else {
    const barres = type === 'bar' || type === 'bar-line';
    const series = type === 'bar-line' ? input.series.slice(0, 1) : input.series;
    axes.push({
      axe: {
        scale: 'y',
        attrMin: type === 'bar-line' ? 'y-bar-min' : 'y-min',
        attrMax: type === 'bar-line' ? 'y-bar-max' : 'y-max',
        barres,
        ...etendue(series, { empile: type === 'bar' && input.stacked, barres }),
      },
      min: lues.get('y-min'),
      max: lues.get('y-max'),
    });

    const numerique = (type === 'line' || type === 'scatter') && isNumericLabelAxis(input.labels);
    if ((type === 'line' || type === 'scatter') && !input.labels.length) {
      // Pas encore de données : on ne sait pas ce que l'axe horizontal portera.
      // Rien n'est relayé ni signalé avant de le savoir.
    } else if (numerique) {
      const xs = finis(input.labels.map((l) => Number(l)));
      axes.push({
        axe: {
          scale: 'x',
          attrMin: 'x-min',
          attrMax: 'x-max',
          barres: false,
          lo: xs.length ? minOf(xs) : null,
          hi: xs.length ? maxOf(xs) : null,
        },
        min: lues.get('x-min'),
        max: lues.get('x-max'),
      });
    } else if (type === 'line' || type === 'scatter') {
      sansEffet(
        ['x-min', 'x-max'],
        'etiquettes-texte',
        `l'axe horizontal porte des étiquettes non numériques — il ne se borne que sur des étiquettes numériques (années, mesures)`
      );
    } else {
      sansEffet(
        ['x-min', 'x-max'],
        'axe-etiquettes',
        `l'axe horizontal porte des étiquettes, pas des valeurs — y-min / y-max bornent l'axe des valeurs`
      );
    }
  }

  for (const { axe, min, max } of axes) {
    let lmin = min;
    let lmax = max;

    if (lmin && axe.barres && lmin.value > 0) {
      signaler(
        lmin.attr,
        'barres-depuis-zero',
        `${lmin.attr}="${lmin.raw}" est ignoré sur type="${type}" : des barres partent de zéro (seul un minimum négatif ou nul agit)`
      );
      lmin = undefined;
    } else if (lmin && axe.lo !== null && lmin.value > axe.lo) {
      signaler(
        lmin.attr,
        'masque-des-donnees',
        `${lmin.attr}="${lmin.raw}" est ignoré : la plus petite valeur portée par l'axe est ${nombre(axe.lo)}, la borne masquerait des données`
      );
      lmin = undefined;
    }

    if (lmax && axe.barres && lmax.value < 0) {
      signaler(
        lmax.attr,
        'barres-depuis-zero',
        `${lmax.attr}="${lmax.raw}" est ignoré sur type="${type}" : des barres partent de zéro (seul un maximum positif ou nul agit)`
      );
      lmax = undefined;
    } else if (lmax && axe.hi !== null && lmax.value < axe.hi) {
      signaler(
        lmax.attr,
        'masque-des-donnees',
        `${lmax.attr}="${lmax.raw}" est ignoré : la plus grande valeur portée par l'axe est ${nombre(axe.hi)}, la borne masquerait des données`
      );
      lmax = undefined;
    }

    if (lmin && lmax && lmin.value >= lmax.value) {
      signaler(
        lmin.attr,
        'bornes-inversees',
        `${lmin.attr}="${lmin.raw}" n'est pas inférieur à ${lmax.attr}="${lmax.raw}" : bornes ignorées`
      );
      lmin = undefined;
      lmax = undefined;
    }

    const bornes: AxisScaleBounds = {};
    if (lmin) {
      bornes.min = lmin.value;
      plan.attrs[axe.attrMin] = lmin.raw;
    }
    if (lmax) {
      bornes.max = lmax.value;
      plan.attrs[axe.attrMax] = lmax.raw;
    }
    if (lmin || lmax) plan.scales[axe.scale] = bornes;
  }

  return plan;
}

// --- Application sur l'instance Chart.js (duck-typing) ------------------------

export interface AxisScaleOptionsLike {
  min?: number;
  max?: number;
}
export interface AxisChartLike {
  options?: {
    scales?: Record<string, AxisScaleOptionsLike | undefined>;
    transitions?: Record<string, unknown>;
  };
  scales?: Record<string, { type?: string } | undefined>;
  update?: (mode?: string) => void;
}

/**
 * Pose les bornes dures sur `options.scales[id]` de l'instance Chart.js et
 * redessine si quelque chose a changé.
 *
 * - `pending` : une échelle visée est introuvable (instance pas prête) ;
 * - `changed` : au moins une borne posée, le graphique est redessiné ;
 * - `unchanged` : tout était déjà en place.
 *
 * Garde-fou : une échelle qui se révèle être un axe d'ÉTIQUETTES (`category`)
 * n'est jamais bornée — une borne numérique y deviendrait un rang d'étiquette
 * et masquerait des catégories.
 */
export function applyAxisBounds(
  chart: AxisChartLike,
  scales: Record<string, AxisScaleBounds>
): 'pending' | 'changed' | 'unchanged' {
  const options = chart.options?.scales;
  if (!options) return 'pending';
  let changed = false;
  for (const [id, bornes] of Object.entries(scales)) {
    const scale = options[id];
    if (!scale) return 'pending';
    if (chart.scales?.[id]?.type === 'category') continue;
    if (bornes.min !== undefined && scale.min !== bornes.min) {
      scale.min = bornes.min;
      changed = true;
    }
    if (bornes.max !== undefined && scale.max !== bornes.max) {
      scale.max = bornes.max;
      changed = true;
    }
  }
  if (changed) redessiner(chart);
  return changed ? 'changed' : 'unchanged';
}

/** Nom de la transition Chart.js posée par `redessiner`. */
const AXIS_BOUNDS_TRANSITION = 'dsfrDataAxisBounds';

/**
 * Redessine après un changement d'échelle.
 *
 * `update('none')` ne suffit PAS : la borne est posée dès que l'instance est
 * prête, donc PENDANT l'animation d'entrée du graphique. Un mode direct écrit
 * la nouvelle géométrie sans arrêter les animations en vol, qui finissent leur
 * course vers les positions de l'ANCIENNE échelle : mesuré sur un barres +
 * ligne, l'axe disait -10..37 et les barres flottaient au-dessus de zéro,
 * dessinées pour 0..40. Une transition déclarée de durée nulle remplace les
 * animations en cours — même mécanisme, et même raison de fond, que
 * `refreshSeriesColors` de color-map.ts (#1230). Sans `options.transitions`
 * atteignable, repli sur `update('none')`.
 */
function redessiner(chart: AxisChartLike): void {
  const transitions = chart.options?.transitions;
  if (!transitions || typeof transitions !== 'object') {
    chart.update?.('none');
    return;
  }
  if (!transitions[AXIS_BOUNDS_TRANSITION]) {
    transitions[AXIS_BOUNDS_TRANSITION] = { animation: { duration: 0 } };
  }
  chart.update?.(AXIS_BOUNDS_TRANSITION);
}
