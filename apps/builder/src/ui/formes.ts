/**
 * Réglages ajoutés par #1204 : la seconde mesure du « barres + ligne », le
 * nombre de places du podium, le champ des séries (format long) et
 * l'empilement des barres.
 *
 * Les listes de champs se remplissent à l'évènement `builder:fields-updated`
 * (émis par `populateFieldSelects`), pour ne pas alourdir `sources-fields.ts`.
 */

import { state, PODIUM_PLACES_DEFAUT, activeSeriesField, supportsMultiSeries } from '../state.js';
import { buildSeriesFieldOptions } from '../sources-fields.js';
import { updatePreviewSteps } from './help-tooltips.js';

/** Listes de champs de ce module : identifiant du `<select>` et clé d'état. */
const SELECTS = [
  { id: 'line-field', cle: 'lineField', vide: '' },
  { id: 'series-field', cle: 'seriesField', vide: '— Aucun (une colonne par série) —' },
] as const;

type CleChamp = (typeof SELECTS)[number]['cle'];

function champConnu(nom: string): boolean {
  return !!nom && state.fields.some((f) => f.name === nom);
}

/**
 * Remplit les listes de champs. Un champ déjà choisi et toujours présent dans
 * la source est conservé ; un champ devenu étranger (changement de source) est
 * vidé, comme le fait `populateFieldSelects` pour les champs principaux (#1176).
 */
export function refreshFormesSelects(): void {
  for (const { id, cle, vide } of SELECTS) {
    const select = document.getElementById(id) as HTMLSelectElement | null;
    if (!select) continue;
    select.innerHTML = buildSeriesFieldOptions();
    // Une liste facultative dit ce que vaut « rien » au lieu de « Sélectionner ».
    if (vide && select.options[0]) select.options[0].textContent = vide;
    if (champConnu(state[cle])) select.value = state[cle];
    else state[cle] = '';
  }
  syncSeriesExclusivity();
}

/**
 * Format long et « Ajouter une série » s'excluent : les séries viennent d'un
 * champ OU de colonnes. Quand un champ de séries est choisi, le groupe des
 * séries supplémentaires se masque (elles restent en mémoire : vider le champ
 * les fait revenir).
 */
export function syncSeriesExclusivity(): void {
  const groupe = document.getElementById('extra-series-group') as HTMLElement | null;
  if (!groupe) return;
  const visible = supportsMultiSeries(state.chartType) && !activeSeriesField(state);
  groupe.style.display = visible ? 'block' : 'none';
}

/** Reporte l'état dans les contrôles (configuration rouverte : favori, retour d'une autre app). */
export function syncFormesControls(): void {
  for (const { id, cle } of SELECTS) {
    const select = document.getElementById(id) as HTMLSelectElement | null;
    if (select) select.value = state[cle] || '';
  }
  const lineLabel = document.getElementById('line-field-label') as HTMLInputElement | null;
  if (lineLabel) lineLabel.value = state.lineFieldLabel || '';
  const places = document.getElementById('podium-max-items') as HTMLInputElement | null;
  if (places) places.value = String(state.podiumMaxItems || PODIUM_PLACES_DEFAUT);
  const stacked = document.getElementById('stacked-toggle') as HTMLInputElement | null;
  if (stacked) stacked.checked = !!state.stacked;
  syncSeriesExclusivity();
}

function ecouterChamp(id: string, cle: CleChamp): void {
  const select = document.getElementById(id) as HTMLSelectElement | null;
  if (!select) return;
  select.addEventListener('change', () => {
    state[cle] = select.value;
    syncSeriesExclusivity();
    // Les étapes de l'aperçu et le résumé de section lisent l'état (#1175).
    updatePreviewSteps();
  });
}

export function setupFormesListeners(): void {
  for (const { id, cle } of SELECTS) ecouterChamp(id, cle);

  const lineLabel = document.getElementById('line-field-label') as HTMLInputElement | null;
  lineLabel?.addEventListener('input', () => {
    state.lineFieldLabel = lineLabel.value;
  });

  const places = document.getElementById('podium-max-items') as HTMLInputElement | null;
  places?.addEventListener('input', () => {
    const n = parseInt(places.value, 10);
    state.podiumMaxItems = Number.isFinite(n) ? n : PODIUM_PLACES_DEFAUT;
  });

  const stacked = document.getElementById('stacked-toggle') as HTMLInputElement | null;
  stacked?.addEventListener('change', () => {
    state.stacked = stacked.checked;
  });

  document.addEventListener('builder:fields-updated', refreshFormesSelects);
}
