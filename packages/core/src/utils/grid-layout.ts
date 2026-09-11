/**
 * Colonnage des composants en grille (#790).
 *
 * `cols` désignait deux grandeurs opposées selon le composant : une LARGEUR
 * sur la grille de 12 dans `dsfr-data-facets` (`cols="4"` → 3 facettes par
 * ligne), un NOMBRE d'éléments par ligne dans `dsfr-data-display` et
 * `dsfr-data-kpi-group` (`cols="4"` → 4 éléments par ligne). Deux noms sans
 * ambiguïté les remplacent, et `cols` garde son sens actuel sur chaque
 * composant, sans échéance :
 *
 * - `per-row` : nombre d'éléments par ligne ;
 * - `span` : largeur sur la grille de 12 colonnes.
 *
 * Les deux sont des chaînes : l'échelle responsive (#789, `per-row="1 md:3"`)
 * s'y ajoutera sans changer le type de la propriété.
 */

import { reportConfigError, clearConfigError } from './config-error.js';

/** Diviseurs de 12 : les seuls nombres d'éléments par ligne qui remplissent la grille. */
const DIVISORS_OF_12 = [1, 2, 3, 4, 6, 12];

export interface PerRow {
  /** Nombre d'éléments par ligne, ou null (absent ou invalide). */
  value: number | null;
  /** Message d'erreur de configuration, ou null. */
  error: string | null;
}

/**
 * Lit `per-row`. Vide : pas de valeur, pas d'erreur. Un nombre qui ne divise
 * pas 12 est refusé plutôt qu'arrondi : `per-row="5"` donnerait en silence
 * six éléments par ligne (12 / 5 arrondi à 2 colonnes chacun).
 */
export function parsePerRow(raw: unknown, max: number): PerRow {
  const text = raw === null || raw === undefined ? '' : String(raw).trim();
  if (!text) return { value: null, error: null };
  const n = Number(text);
  const allowed = DIVISORS_OF_12.filter((d) => d <= max);
  if (!Number.isInteger(n) || !allowed.includes(n)) {
    return {
      value: null,
      error:
        `per-row="${text}" : attendu un nombre d'éléments par ligne qui divise la grille ` +
        `de 12 colonnes — ${allowed.join(', ')}`,
    };
  }
  return { value: n, error: null };
}

/** Largeur sur 12 d'un élément quand il y en a `perRow` par ligne. */
export function spanForPerRow(perRow: number): number {
  return 12 / perRow;
}

/**
 * Lit une largeur `span` (1 à 12). Vide : null sans erreur. Hors plage ou
 * non entière : erreur nommée.
 */
export function parseSpan(raw: unknown): { value: number | null; error: string | null } {
  const text = raw === null || raw === undefined ? '' : String(raw).trim();
  if (!text) return { value: null, error: null };
  const n = Number(text);
  if (!Number.isInteger(n) || n < 1 || n > 12) {
    return {
      value: null,
      error: `span="${text}" : attendu une largeur entière de 1 à 12 colonnes`,
    };
  }
  return { value: n, error: null };
}

/**
 * Message de conflit quand l'ancien attribut et le nouveau sont posés
 * ensemble : le nouveau l'emporte, et on le dit.
 */
export function legacyConflictMessage(legacy: string, modern: string): string {
  return (
    `${legacy} et ${modern} sont posés ensemble : ${modern} l'emporte, ${legacy} est ignoré. ` +
    `Retirer ${legacy} (${modern} a le même rôle, sans ambiguïté de sens, #790).`
  );
}

/**
 * Pose ou lève l'erreur de colonnage d'un composant, sans toucher à une autre
 * erreur de configuration : on ne lève que le message qu'on a soi-même posé,
 * et on ne repose pas un message déjà affiché (une console.error par état).
 * Rend le message courant, à conserver par le composant.
 */
export function syncLayoutError(
  el: HTMLElement,
  component: string,
  message: string | null,
  previous: string | null
): string | null {
  const shown = el.getAttribute('data-dsfr-config-error');
  if (message) {
    if (shown !== message) reportConfigError(el, component, message);
    return message;
  }
  if (previous && shown === previous) clearConfigError(el);
  return null;
}

// --- Échelle responsive (#789) -------------------------------------------

/**
 * Points de rupture du DSFR, dans l'ordre (mobile-first) : les classes
 * `fr-col-{bp}-N` s'appliquent à partir de ces largeurs.
 */
export const BREAKPOINTS = { sm: '36em', md: '48em', lg: '62em', xl: '78em' } as const;
export type Breakpoint = keyof typeof BREAKPOINTS;
const BREAKPOINT_ORDER: readonly Breakpoint[] = ['sm', 'md', 'lg', 'xl'];

/**
 * Échelle de largeurs sur 12 : `base` sous le premier point de rupture, puis
 * un palier par point de rupture. `mobileExplicit` : l'auteur a fixé la
 * disposition mobile (terme de base ou palier `sm`) ; sinon c'est la valeur
 * nue historique, pleine largeur sous 768 px.
 */
export interface Scale {
  base: number;
  steps: Array<{ bp: Breakpoint; width: number }>;
  mobileExplicit: boolean;
}

function isBreakpoint(key: string): key is Breakpoint {
  return (BREAKPOINT_ORDER as readonly string[]).includes(key);
}

/**
 * Lit une échelle mobile-first (#789), séparée par des espaces :
 * - `"3"`, valeur nue : sens historique inchangé — pleine largeur sous 768 px,
 *   la valeur à partir de `md` ;
 * - `"1 md:3 lg:4"` : le premier terme vaut sous le premier palier, chaque
 *   `bp:valeur` à partir de son point de rupture (sm 576, md 768, lg 992,
 *   xl 1248 px) ;
 * - `"md:3 lg:4"` : sans terme de base, pleine largeur en dessous.
 *
 * `kind` : `per-row` compte des éléments par ligne (diviseurs de 12, jusqu'à
 * `max`), `span` donne une largeur (1 à 12). Les valeurs sont rendues en
 * LARGEURS sur 12 dans les deux cas. Un point de rupture inconnu, un terme
 * de base mal placé ou une valeur hors grille donnent une erreur nommée.
 */
export function parseScale(
  raw: unknown,
  kind: 'per-row' | 'span',
  max = 12
): { scale: Scale | null; error: string | null } {
  const text = raw === null || raw === undefined ? '' : String(raw).trim();
  if (!text) return { scale: null, error: null };
  const attr = kind === 'per-row' ? 'per-row' : 'span';
  const toWidth = (value: string): { width: number | null; error: string | null } => {
    if (kind === 'per-row') {
      const parsed = parsePerRow(value, max);
      if (parsed.error)
        return {
          width: null,
          error: parsed.error.replace(/^per-row="[^"]*"/, `per-row="${text}"`),
        };
      return { width: parsed.value === null ? null : spanForPerRow(parsed.value), error: null };
    }
    const parsed = parseSpan(value);
    if (parsed.error)
      return { width: null, error: parsed.error.replace(/^span="[^"]*"/, `span="${text}"`) };
    return { width: parsed.value, error: null };
  };

  const tokens = text.split(/\s+/);
  if (tokens.length === 1 && !tokens[0].includes(':')) {
    const w = toWidth(tokens[0]);
    if (w.error || w.width === null) return { scale: null, error: w.error };
    return {
      scale: { base: 12, steps: [{ bp: 'md', width: w.width }], mobileExplicit: false },
      error: null,
    };
  }

  let base = 12;
  let mobileExplicit = false;
  const steps = new Map<Breakpoint, number>();
  for (const [i, token] of tokens.entries()) {
    const colon = token.indexOf(':');
    if (colon === -1) {
      if (i !== 0) {
        return {
          scale: null,
          error: `${attr}="${text}" : « ${token} » sans point de rupture — seul le premier terme peut être nu (ex. "1 md:3 lg:4")`,
        };
      }
      const w = toWidth(token);
      if (w.error || w.width === null) return { scale: null, error: w.error };
      base = w.width;
      mobileExplicit = true;
      continue;
    }
    const bp = token.slice(0, colon);
    if (!isBreakpoint(bp)) {
      return {
        scale: null,
        error: `${attr}="${text}" : point de rupture inconnu « ${bp} » — points de rupture DSFR : ${BREAKPOINT_ORDER.join(', ')}`,
      };
    }
    const w = toWidth(token.slice(colon + 1));
    if (w.error || w.width === null) return { scale: null, error: w.error };
    steps.set(bp, w.width);
    if (bp === 'sm') mobileExplicit = true;
  }
  const ordered = BREAKPOINT_ORDER.filter((bp) => steps.has(bp)).map((bp) => ({
    bp,
    width: steps.get(bp)!,
  }));
  return { scale: { base, steps: ordered, mobileExplicit }, error: null };
}

/**
 * Classes de colonne DSFR d'une échelle : `fr-col-{base}` puis
 * `fr-col-{bp}-{largeur}`. Un palier qui ne change rien au précédent est
 * omis ; une valeur nue donne exactement les classes historiques
 * (`fr-col-12 fr-col-md-4`).
 */
export function scaleToClasses(scale: Scale): string {
  const classes = [`fr-col-${scale.base}`];
  let current = scale.base;
  for (const step of scale.steps) {
    if (step.width === current) continue;
    classes.push(`fr-col-${step.bp}-${step.width}`);
    current = step.width;
  }
  return classes.join(' ');
}
