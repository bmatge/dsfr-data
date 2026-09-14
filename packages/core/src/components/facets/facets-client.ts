import { isUnsafeKey, toNumber } from '@dsfr-data/shared/lib';
import type { FacetGroup, FacetRow, FacetSelections, FacetValue } from './facets-types.js';

/**
 * Facettes CLIENT (#838) : comptage, filtrage croise et detection des champs,
 * calcules sur les lignes recues. Tout est pur — aucune lecture du DOM,
 * aucun `console.warn` — pour que l'oracle de la verification des donnees
 * (ADR-122) et les tests unitaires puissent les eprouver isolement.
 *
 * Le composant garde les methodes du meme nom, qui delèguent ici : les
 * mutations du banc de preuve (`_rowWeight`, `_getDataFilteredExcluding`)
 * restent posables au meme endroit.
 */

/** Resolve a possibly dotted field path on a row (e.g. "fields.Region") */
export function resolveFacetValue(row: FacetRow, field: string): unknown {
  if (!field.includes('.')) return row[field];
  const parts = field.split('.');
  let current: unknown = row;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') return undefined;
    if (isUnsafeKey(part)) return undefined;
    // nosemgrep: javascript.lang.security.audit.prototype-pollution.prototype-pollution-loop.prototype-pollution-loop
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

/**
 * Valeurs de facette d'une cellule (#421) : une cellule tableau (champ
 * multi-valeurs, ex. ChoiceList Grist) fournit chaque élément ; une cellule
 * scalaire fournit sa valeur. Les éléments vides sont ignorés. L'ancien
 * `String(val)` stringifiait le tableau (« a,b ») : la valeur ne matchait
 * jamais une selection et polluait les groupes de facettes.
 */
export function facetValuesOf(val: unknown): string[] {
  if (val === null || val === undefined || val === '') return [];
  if (Array.isArray(val)) {
    return val.filter((v) => v !== null && v !== undefined && v !== '').map((v) => String(v));
  }
  return [String(val)];
}

/** La cellule matche-t-elle la selection ? Intersection pour les tableaux (#421). */
export function matchesSelection(val: unknown, selected: Set<string>): boolean {
  return facetValuesOf(val).some((v) => selected.has(v));
}

/** Auto-detect categorical fields: string type, 2-50 unique values, not all unique (ID-like) */
export function autoDetectFacetFields(rows: FacetRow[]): string[] {
  if (rows.length === 0) return [];

  const candidates: string[] = [];
  const sampleRow = rows[0];

  for (const key of Object.keys(sampleRow)) {
    const uniqueValues = new Set<string>();
    let allStrings = true;

    for (const row of rows) {
      const val = row[key];
      if (val === null || val === undefined || val === '') continue;
      // Champ multi-valeurs (tableau de chaines, ex. ChoiceList Grist) :
      // chaque element est une valeur de facette candidate (#421)
      const cellValues = Array.isArray(val) ? val : [val];
      if (cellValues.some((v) => typeof v !== 'string')) {
        allStrings = false;
        break;
      }
      for (const v of cellValues) uniqueValues.add(v as string);
      if (uniqueValues.size > 50) break;
    }

    if (!allStrings) continue;
    if (uniqueValues.size <= 1 || uniqueValues.size > 50) continue;
    // Exclude ID-like fields (all values unique)
    if (uniqueValues.size === rows.length) continue;

    candidates.push(key);
  }

  return candidates;
}

/**
 * Poids d'une ligne : 1 par défaut, la valeur de `weight-field` sinon
 * (#739). Une cellule non numérique pese zero — la somme reste lisible,
 * et un champ entierement absent est signale par l'appelant.
 */
export function rowWeight(row: FacetRow, weightField: string): number {
  if (!weightField) return 1;
  const parsed = toNumber(resolveFacetValue(row, weightField), true);
  return parsed ?? 0;
}

/**
 * Lignes retenues par les selections actives, celle de `excludeField`
 * exceptee. Sans champ a exclure, c'est le filtrage courant de la facette ;
 * avec, c'est le filtrage CROISE qui donne les compteurs dynamiques.
 */
export function filterRowsBySelections(
  rows: FacetRow[],
  selections: FacetSelections,
  excludeField?: string
): FacetRow[] {
  const activeFields = Object.keys(selections).filter(
    (f) => f !== excludeField && selections[f].size > 0
  );

  if (activeFields.length === 0) return rows;

  return rows.filter((row) =>
    activeFields.every((field) =>
      // Intersection pour les cellules tableau (#421)
      matchesSelection(resolveFacetValue(row, field), selections[field])
    )
  );
}

/**
 * Valeurs et compteurs d'un champ, sur les lignes deja filtrees par les
 * AUTRES facettes. `weightedRows` compte les lignes de poids non nul : zero
 * sur un jeu non vide signale un `weight-field` introuvable (#739), que
 * l'appelant rapporte une fois par champ.
 *
 * Les sommes flottantes accumulent des artefacts (0.1 + 0.2) : arrondi a
 * 6 decimales, largement au-dela de ce qu'un compteur affiche.
 */
export function countFacetValues(
  rows: FacetRow[],
  field: string,
  weightField: string
): { values: FacetValue[]; weightedRows: number } {
  let weightedRows = 0;
  const counts = new Map<string, number>();
  for (const row of rows) {
    const weight = rowWeight(row, weightField);
    if (weight !== 0) weightedRows++;
    // Cellule tableau : chaque element compte dans son groupe (#421)
    for (const strVal of facetValuesOf(resolveFacetValue(row, field))) {
      counts.set(strVal, (counts.get(strVal) ?? 0) + weight);
    }
  }

  const values: FacetValue[] = [];
  for (const [value, count] of counts) {
    values.push({ value, count: weightField ? Math.round(count * 1e6) / 1e6 : count });
  }
  return { values, weightedRows };
}

/**
 * Reinjecte les selections orphelines dans les groupes (#310) : après un
 * refetch, une valeur selectionnee disparue des données restait dans les
 * selections — la checkbox n'etait plus rendue mais le filtre restait actif
 * (résultats vides inexplicables). Elle est rendue cochee, marquee
 * indisponible, donc desactivable.
 */
export function appendOrphanSelections(
  groups: FacetGroup[],
  selections: FacetSelections,
  labelMap: Map<string, string>
): FacetGroup[] {
  const byField = new Map(groups.map((g) => [g.field, g]));
  for (const [field, selected] of Object.entries(selections)) {
    if (selected.size === 0) continue;
    let group = byField.get(field);
    if (!group) {
      // Groupe entier disparu (ex: 0 resultat) : le recreer pour garder
      // les selections desactivables
      group = { field, label: labelMap.get(field) ?? field, values: [] };
      groups.push(group);
      byField.set(field, group);
    }
    const known = new Set(group.values.map((v) => v.value));
    for (const value of selected) {
      if (!known.has(value)) {
        group.values.push({ value, count: 0, missing: true });
      }
    }
  }
  return groups;
}
