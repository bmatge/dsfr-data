/**
 * Réglages propres aux formes ajoutées par #1204 : la seconde mesure du
 * « barres + ligne » et le nombre de places du podium.
 *
 * Les listes de champs se remplissent à l'évènement `builder:fields-updated`
 * (émis par `populateFieldSelects`), pour ne pas alourdir `sources-fields.ts`.
 */

import { state, PODIUM_PLACES_DEFAUT } from '../state.js';
import { buildSeriesFieldOptions } from '../sources-fields.js';
import { updatePreviewSteps } from './help-tooltips.js';

/** Listes de champs de ce module : identifiant du `<select>` et clé d'état. */
const SELECTS = [{ id: 'line-field', cle: 'lineField' }] as const;

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
  for (const { id, cle } of SELECTS) {
    const select = document.getElementById(id) as HTMLSelectElement | null;
    if (!select) continue;
    select.innerHTML = buildSeriesFieldOptions();
    if (champConnu(state[cle])) select.value = state[cle];
    else state[cle] = '';
  }
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
}

function ecouterChamp(id: string, cle: CleChamp): void {
  const select = document.getElementById(id) as HTMLSelectElement | null;
  if (!select) return;
  select.addEventListener('change', () => {
    state[cle] = select.value;
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

  document.addEventListener('builder:fields-updated', refreshFormesSelects);
}
