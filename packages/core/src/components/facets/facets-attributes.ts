import { parseScale, scaleToClasses, type Scale } from '../../utils/grid-layout.js';
import { FACET_DISPLAY_MODES, type FacetDisplayMode } from './facets-types.js';

/**
 * Grammaires d'attributs de `<dsfr-data-facets>` (#838) : `labels`,
 * `display`, `cols`, `span`, `per-row`. Toutes séparent leurs entrées par une
 * barre verticale, là où `fields` prend la virgule.
 *
 * Pur : les avertissements passent par des rappels, que le composant
 * dédoublonne par attribut et par valeur reçue (#731).
 */

/** Paires `cle:valeur` séparées par `|`, la première `:` faisant la coupe. */
export function parsePipePairs(raw: string): Array<[string, string]> {
  const pairs: Array<[string, string]> = [];
  for (const pair of raw.split('|')) {
    const colonIndex = pair.indexOf(':');
    if (colonIndex === -1) continue;
    const key = pair.substring(0, colonIndex).trim();
    const value = pair.substring(colonIndex + 1).trim();
    if (key) pairs.push([key, value]);
  }
  return pairs;
}

/** Libellés custom : `"field:Label | field2:Label 2"`. */
export function parseFacetLabels(raw: string): Map<string, string> {
  return new Map(parsePipePairs(raw));
}

/**
 * Mode d'affichage par champ. Un mode inconnu est signalé (#731) et le champ
 * reste en `checkbox` : jusqu'ici il était ignoré sans un mot, et
 * `display="a:select, b:select"` rendait zéro liste déroulante sur une page
 * qui avait l'air juste.
 */
export function parseDisplayModes(
  raw: string,
  warnUnknown: (message: string) => void
): Map<string, FacetDisplayMode> {
  const map = new Map<string, FacetDisplayMode>();
  for (const [key, value] of parsePipePairs(raw)) {
    if (FACET_DISPLAY_MODES.has(value)) {
      map.set(key, value as FacetDisplayMode);
    } else {
      warnUnknown(
        `mode d'affichage inconnu pour le champ "${key}" : "${value}". Modes acceptés : ` +
          `${[...FACET_DISPLAY_MODES].join(', ')}. Le champ reste en "checkbox".`
      );
    }
  }
  return map;
}

/** Largeur globale, ou carte par champ, de l'ancien `cols` (#790). */
export type FacetWidths =
  { global: number } | { map: Map<string, number>; fallback: number } | null;

/** Grammaire commune de `cols` et `span` : global ou carte par champ. */
export function parseWidths(raw: string): FacetWidths {
  if (!raw) return null;
  const trimmed = String(raw).trim();
  // Single number = global
  if (/^\d+$/.test(trimmed)) {
    return { global: parseInt(trimmed, 10) };
  }
  // Per-field: "field:4 | field2:6"
  const map = new Map<string, number>();
  for (const [key, rawValue] of parsePipePairs(trimmed)) {
    const val = parseInt(rawValue, 10);
    if (!isNaN(val)) map.set(key, val);
  }
  return map.size > 0 ? { map, fallback: 6 } : null;
}

/**
 * `span` lu en échelles (#789) : global (`"12 md:3"`) ou par facette
 * (`"annee:12 md:3 | type:12 md:6"`). Dans un segment, une clé qui n'est
 * pas un point de rupture est un nom de champ : `annee:3` reste la largeur
 * 3 de la facette « annee », exactement comme avec `cols`.
 */
export function parseSpanScales(raw: string): {
  global: Scale | null;
  byField: Map<string, Scale>;
  error: string | null;
} {
  const byField = new Map<string, Scale>();
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) return { global: null, byField, error: null };
  const segments = trimmed
    .split('|')
    .map((seg) => seg.trim())
    .filter(Boolean);
  let global: Scale | null = null;
  for (const segment of segments) {
    const first = segment.split(/\s+/)[0];
    const colon = first.indexOf(':');
    const key = colon === -1 ? '' : first.slice(0, colon);
    const isField = colon !== -1 && !['sm', 'md', 'lg', 'xl'].includes(key);
    const scaleText = isField ? segment.slice(key.length + 1).trim() : segment;
    const parsed = parseScale(scaleText, 'span');
    if (parsed.error) {
      return {
        global: null,
        byField,
        error: parsed.error.replace(/^span="[^"]*"/, `span="${trimmed}"`),
      };
    }
    if (!parsed.scale) continue;
    if (isField) byField.set(key.trim(), parsed.scale);
    else global = parsed.scale;
  }
  return { global, byField, error: null };
}

/**
 * Échelle d'une facette (#790, #789) : `span` global, sinon `span` de la
 * facette, sinon `per-row`, sinon — carte `span` sans entrée pour ce champ
 * et sans `per-row` — la moitié de ligne historique. `null` : ni `span` ni
 * `per-row` (ancien `cols`, ou grille automatique).
 */
export function scaleForField(
  field: string,
  spans: ReturnType<typeof parseSpanScales>,
  perRow: Scale | null
): Scale | null {
  if (spans.error) return perRow;
  if (spans.global) return spans.global;
  const named = spans.byField.get(field);
  if (named) return named;
  if (perRow) return perRow;
  if (spans.byField.size > 0)
    return { base: 12, steps: [{ bp: 'md', width: 6 }], mobileExplicit: false };
  return null;
}

/**
 * Classe de colonne DSFR d'un champ. Pleine largeur sous 768 px, largeur
 * demandée au point de rupture `md` (#788) — comme `dsfr-data-display`.
 * `.fr-col-N` est définie HORS de toute media query dans le DSFR : la
 * classe nue valait 25 % à 320 px comme à 1440 px, soit 76 px par facette
 * sur téléphone (mesuré dans Chromium, DSFR 1.14.4).
 */
export function colClassFor(field: string, scale: Scale | null, cols: FacetWidths): string {
  if (scale) return scaleToClasses(scale);
  // Ancien `cols` (#790) : grammaire et rendu historiques, sans échelle.
  if (!cols) return '';
  const width = 'global' in cols ? cols.global : (cols.map.get(field) ?? cols.fallback);
  return Number(width) >= 12 ? 'fr-col-12' : `fr-col-12 fr-col-md-${width}`;
}
