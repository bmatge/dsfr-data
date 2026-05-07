/**
 * Smart helpers around the "Agregation" select.
 *
 * Two responsibilities :
 *  1. Propose a sensible default depending on the value field (and its name)
 *     instead of always defaulting to "avg".
 *  2. Detect when the loaded sample has 1 row per labelField — in that case
 *     the aggregation is neutralized (sum/avg/min/max all return the same
 *     single value) and we display a discreet badge to inform the user.
 *
 * The badge does NOT disable the select : on paginated APIs the local sample
 * may not reflect the true uniqueness of the full dataset, and the user can
 * always override.
 */

import { state, type AggregationType } from '../state.js';

/**
 * Strip diacritics + lowercase. Used for fuzzy name matching.
 */
function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

/**
 * Heuristic name patterns that strongly suggest a "summable" quantity
 * (totals, counts, populations, amounts, volumes...).
 */
const SUM_HINTS = [
  'montant',
  'total',
  'somme',
  'nombre',
  'nb_',
  '_nb',
  'count',
  'population',
  'effectif',
  'quantite',
  'volume',
  'chiffre_affaire',
  'chiffre-affaire',
  'ca_',
  '_ca',
  'depense',
  'recette',
  'budget',
  'aide',
  'subvention',
];

/**
 * Heuristic name patterns that strongly suggest an "averageable" measurement
 * (rates, percentages, scores, prices per unit...).
 */
const AVG_HINTS = [
  'taux',
  'pourcentage',
  'percent',
  'ratio',
  'moyenne',
  'score',
  'note',
  'rating',
  'temperature',
  'prix',
  'tarif',
];

/**
 * Suggest a default aggregation based on current state :
 *   - no valueField              → 'count' (the only agg that doesn't need one)
 *   - valueField name in SUM_HINTS → 'sum'
 *   - valueField name in AVG_HINTS → 'avg'
 *   - otherwise                  → 'sum' (safer default than avg : sum of a
 *                                  single pre-aggregated row equals that row,
 *                                  while avg of N raw rows is rarely what users want)
 */
export function suggestAggregationDefault(): AggregationType {
  if (!state.valueField) return 'count';

  const field = state.fields.find((f) => f.name === state.valueField);
  const candidate = normalize(field?.displayName || field?.name || state.valueField);

  if (SUM_HINTS.some((hint) => candidate.includes(hint))) return 'sum';
  if (AVG_HINTS.some((hint) => candidate.includes(hint))) return 'avg';
  return 'sum';
}

/**
 * Returns true when the loaded sample contains exactly 1 row per labelField
 * value (i.e. data is already pre-aggregated). Returns false when we cannot
 * tell (no data, no labelField, server-side paginated source...).
 */
export function isLabelFieldUniqueInSample(): boolean {
  if (!state.localData || state.localData.length === 0) return false;
  if (!state.labelField) return false;
  if (state.localData.length < 2) return false;

  const seen = new Set<unknown>();
  for (const row of state.localData) {
    const key = row[state.labelField];
    if (seen.has(key)) return false;
    seen.add(key);
  }
  return true;
}

/**
 * Apply the smart default to state + DOM, unless the user has already touched
 * the select. Idempotent : safe to call from multiple event hooks.
 */
export function applyAggregationDefault(): void {
  if (state.aggregationUserModified) return;
  const next = suggestAggregationDefault();
  state.aggregation = next;
  const aggSelect = document.getElementById('aggregation') as HTMLSelectElement | null;
  if (aggSelect) aggSelect.value = next;
}

/**
 * Show or hide the "donnees deja groupees" badge next to the aggregation label.
 */
export function updateAggregationBadge(): void {
  const badge = document.getElementById('aggregation-badge') as HTMLElement | null;
  if (!badge) return;

  const unique = isLabelFieldUniqueInSample();
  if (unique) {
    badge.hidden = false;
    badge.textContent = 'Donnees deja groupees (1 ligne par categorie)';
    badge.title =
      "Detecte sur l'echantillon charge : chaque valeur de '" +
      state.labelField +
      "' n'apparait qu'une fois. L'agregation n'a pas d'effet visible (sauf 'count' qui renverra 1).";
  } else {
    badge.hidden = true;
    badge.textContent = '';
    badge.removeAttribute('title');
  }
}

/**
 * Reset the "user modified" flag — called when a new source is loaded so
 * the smart default kicks in again on a fresh dataset.
 */
export function resetAggregationUserModified(): void {
  state.aggregationUserModified = false;
}
