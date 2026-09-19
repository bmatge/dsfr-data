import { parsePipePairs } from './facets-attributes.js';
import { facetValuesOf, resolveFacetValue } from './facets-client.js';
import type { FacetRow, FacetValue } from './facets-types.js';

/**
 * Libellés de VALEUR des facettes (#928, AM-081).
 *
 * `labels` nomme les CHAMPS ; rien ne nommait leurs valeurs. Une facette
 * posée sur un champ de code affichait donc « 29 », « 56 », « 101 » là où le
 * lecteur attend « Finistère », « Morbihan », « Fédération française
 * d'athlétisme » — et le libellé se trouve presque toujours dans la MÊME
 * ligne, à côté du code. Les pages retombaient alors sur un `<select>`
 * généré hors ligne, dont la liste se périme au premier ajout.
 *
 * Deux grammaires, distinguées par la première lettre :
 *
 * - champ compagnon, séparateur `|` comme `labels` et `display` :
 *   `value-labels="dep_code:dep_nom | code_fede_ref:federation"` ;
 * - table statique en JSON, quand aucun champ compagnon n'existe :
 *   `value-labels='{"dep_code":{"29":"Finistère","56":"Morbihan"}}'`.
 *   La forme JSON accepte aussi un nom de champ (`{"dep_code":"dep_nom"}`).
 *
 * Module PUR : pas de DOM, pas de `console`. Les avertissements remontent
 * par rappel, que le composant dédoublonne par attribut et par valeur (#731).
 */

/** Source du libellé d'une valeur : un champ compagnon, ou une table figée. */
export type ValueLabelSpec =
  { kind: 'field'; labelField: string } | { kind: 'table'; table: Map<string, string> };

/** Carte vide partagée : une facette sans `value-labels` n'alloue rien. */
export const NO_VALUE_LABELS: ReadonlyMap<string, ValueLabelSpec> = new Map();

/** Table vide partagée (même raison). */
export const NO_LABEL_TABLE: ReadonlyMap<string, string> = new Map();

/**
 * Découpe `value-labels` en une source de libellé par champ. Un JSON
 * invalide est signalé et l'attribut entier est ignoré : la facette continue
 * d'afficher ses codes, ce qu'elle faisait avant l'attribut.
 */
export function parseValueLabels(
  raw: string,
  warnInvalid: (message: string) => void
): Map<string, ValueLabelSpec> {
  const specs = new Map<string, ValueLabelSpec>();
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return specs;

  if (trimmed.startsWith('{')) {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
      warnInvalid(
        'JSON invalide. Formes acceptées : value-labels="champ:champ_libelle" ' +
          '(champ compagnon) ou value-labels=\'{"champ":{"code":"libelle"}}\' (table statique).'
      );
      return specs;
    }
    for (const [field, spec] of Object.entries(parsed)) {
      if (typeof spec === 'string' && spec.trim()) {
        specs.set(field, { kind: 'field', labelField: spec.trim() });
      } else if (spec && typeof spec === 'object' && !Array.isArray(spec)) {
        const table = new Map<string, string>();
        for (const [value, label] of Object.entries(spec as Record<string, unknown>)) {
          if (label !== null && label !== undefined && String(label) !== '') {
            table.set(value, String(label));
          }
        }
        if (table.size > 0) specs.set(field, { kind: 'table', table });
      } else {
        warnInvalid(
          `entrée "${field}" ignorée : une entrée vaut un nom de champ ` +
            '("champ_libelle") ou une table {"code":"libelle"}.'
        );
      }
    }
    return specs;
  }

  for (const [field, labelField] of parsePipePairs(trimmed)) {
    if (labelField) specs.set(field, { kind: 'field', labelField });
  }
  return specs;
}

/**
 * Table `valeur -> libellé` lue dans un champ compagnon des MÊMES lignes.
 *
 * Le premier libellé non vide rencontré l'emporte : un référentiel qui
 * orthographie deux fois le même code reste lisible, et le libellé n'est
 * jamais moyenné. Sur une cellule multi-valeurs (ChoiceList), valeurs et
 * libellés ne sont appariés que s'ils sont en même nombre — sinon la ligne
 * est ignorée plutôt que d'apparier au hasard.
 */
export function collectCompanionLabels(
  rows: readonly FacetRow[],
  field: string,
  labelField: string
): Map<string, string> {
  const table = new Map<string, string>();
  if (!labelField) return table;
  for (const row of rows) {
    const values = facetValuesOf(resolveFacetValue(row, field));
    if (values.length === 0) continue;
    const labels = facetValuesOf(resolveFacetValue(row, labelField));
    if (labels.length === 0) continue;
    if (labels.length === values.length) {
      values.forEach((value, i) => {
        if (!table.has(value)) table.set(value, labels[i]);
      });
    } else if (labels.length === 1) {
      for (const value of values) if (!table.has(value)) table.set(value, labels[0]);
    }
  }
  return table;
}

/**
 * Copie des valeurs portant leur libellé. Une table vide rend le tableau
 * REÇU, sans copie : sans `value-labels`, rien ne change.
 */
export function labelFacetValues(
  values: FacetValue[],
  table: ReadonlyMap<string, string>
): FacetValue[] {
  if (table.size === 0) return values;
  return values.map((fv) => {
    const label = table.get(fv.value);
    return label && label !== fv.value ? { ...fv, label } : fv;
  });
}

/** Texte affiché d'une valeur : son libellé s'il en a un, sa valeur sinon. */
export function facetValueText(fv: FacetValue): string {
  return fv.label ?? fv.value;
}
