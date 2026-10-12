/**
 * Section « Cadre officiel DSFR » du volet (#1263) : les contrôles, leurs
 * écouteurs, la liste des champs de dates et l'éditeur des actions du menu.
 *
 * Ce que chaque réglage fait, la traduction en attributs et la lecture
 * défensive d'un état déposé vivent dans `../cadre.ts` (module pur).
 *
 * Divulgation progressive : cadre désactivé, seule la case est visible. Cadre
 * activé, l'essentiel (titre, source, date — saisie ou lue dans les données —,
 * tendance, téléchargement, capture) ; l'infobulle, la fenêtre d'information
 * et les actions du menu restent repliées, et se déplient d'elles-mêmes quand
 * un état rouvert en porte.
 */

import { escapeHtml } from '@dsfr-data/shared';
import { state, type ChartType } from '../state.js';
import {
  CADRE_KEYS,
  actionsValue,
  cadreApplies,
  latestIsoDate,
  normalizeCadre,
  type CadreSettings,
} from '../cadre.js';
import { syncA11yWithDatabox } from './ui-helpers.js';

type CleTexte =
  | 'databoxTitle'
  | 'databoxSource'
  | 'databoxDate'
  | 'databoxTrend'
  | 'databoxTooltipTitle'
  | 'databoxTooltipContent'
  | 'databoxModalTitle'
  | 'databoxModalContent';

const CHAMPS_TEXTE: readonly { id: string; cle: CleTexte }[] = [
  { id: 'databox-title', cle: 'databoxTitle' },
  { id: 'databox-source', cle: 'databoxSource' },
  { id: 'databox-date', cle: 'databoxDate' },
  { id: 'databox-trend', cle: 'databoxTrend' },
  { id: 'databox-tooltip-title', cle: 'databoxTooltipTitle' },
  { id: 'databox-tooltip-content', cle: 'databoxTooltipContent' },
  { id: 'databox-modal-title', cle: 'databoxModalTitle' },
  { id: 'databox-modal-content', cle: 'databoxModalContent' },
];

const CASES: readonly { id: string; cle: 'databoxDownload' | 'databoxScreenshot' }[] = [
  { id: 'databox-download', cle: 'databoxDownload' },
  { id: 'databox-screenshot', cle: 'databoxScreenshot' },
];

function el<T extends HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

// ---------------------------------------------------------------------------
// Date lue dans les données
// ---------------------------------------------------------------------------

/** Le champ contient-il au moins une date ISO, sur les lignes chargées ? */
export function fieldHasIsoDates(name: string): boolean {
  if (!name) return false;
  const lignes = (state.localData ?? []).slice(0, 500);
  const valeurs: unknown[] = lignes.map((l) => l[name]);
  valeurs.push(state.fields.find((f) => f.name === name)?.sample);
  return latestIsoDate(valeurs) !== null;
}

/**
 * Remplit la liste « Date lue dans les données » depuis les champs de la
 * source, comme les autres sélecteurs de champ. Un champ choisi et toujours
 * présent est conservé ; un champ devenu étranger à la source est oublié.
 */
export function populateDateFieldSelect(): void {
  const select = el<HTMLSelectElement>('databox-date-field');
  if (!select) return;
  select.innerHTML = '<option value="">— Aucun —</option>';
  for (const champ of state.fields) {
    const option = document.createElement('option');
    option.value = champ.name;
    option.textContent = `${champ.displayName || champ.name} (${champ.type})`;
    select.appendChild(option);
  }
  const connu = state.fields.some((f) => f.name === state.databoxDateField);
  // Sans champ chargé (favori rouvert avant sa source), le choix est gardé tel quel.
  if (!connu && state.fields.length > 0) state.databoxDateField = '';
  if (!connu && state.databoxDateField) {
    const option = document.createElement('option');
    option.value = state.databoxDateField;
    option.textContent = state.databoxDateField;
    select.appendChild(option);
  }
  select.value = state.databoxDateField;
  updateDateFieldNote();
}

/**
 * Dit ce que la date lue dans les données va donner : rien tant qu'une date
 * est saisie (elle prime), rien non plus si le champ ne porte pas de dates ISO.
 */
function updateDateFieldNote(): void {
  const note = el('databox-date-field-note');
  if (!note) return;
  let message = '';
  if (state.databoxDateField) {
    if (state.databoxDate.trim()) {
      message = 'La date saisie ci-dessus est affichée à la place : effacez-la pour lire ce champ.';
    } else if (state.fields.length > 0 && !fieldHasIsoDates(state.databoxDateField)) {
      message =
        'Ce champ ne semble pas contenir de dates au format AAAA-MM-JJ : aucune date ne sera affichée.';
    }
  }
  note.textContent = message;
  note.hidden = message === '';
}

// ---------------------------------------------------------------------------
// Actions du menu
// ---------------------------------------------------------------------------

const BOUTON_SUPPRIMER = 'fr-btn fr-btn--sm fr-btn--tertiary-no-outline lecture-row__remove';

/** Une ligne par action : son libellé, et le bouton qui la supprime. */
function renderActions(): void {
  const container = el('databox-actions-container');
  if (!container) return;
  container.innerHTML = state.databoxActions
    .map(
      (libelle, i) => `
    <div class="lecture-row" data-index="${i}">
      <div class="fr-input-group fr-input-group--sm">
        <label class="fr-label" for="databox-action-${i}">Libellé de l’action</label>
        <input class="fr-input fr-input--sm" type="text" id="databox-action-${i}" data-repere="builder.cadre.actions.libelle" data-attribut="dsfr-data-chart:databox-actions" data-repere-libelle="Libellé d’une action du cadre" value="${escapeHtml(libelle)}" placeholder="Ex : Voir la méthode">
      </div>
      <button type="button" class="${BOUTON_SUPPRIMER}" data-action="remove" title="Supprimer cette action" aria-label="Supprimer cette action" data-repere="builder.cadre.actions.supprimer" data-repere-libelle="Supprimer une action du cadre">
        <i class="ri-delete-bin-line" aria-hidden="true"></i>
      </button>
    </div>`
    )
    .join('');
}

function brancherActions(): void {
  const container = el('databox-actions-container');
  if (!container) return;

  el('add-databox-action-btn')?.addEventListener('click', () => {
    state.databoxActions.push('');
    renderActions();
    // Le focus va au champ de la ligne ajoutée.
    const lignes = container.querySelectorAll<HTMLElement>('.lecture-row');
    lignes[lignes.length - 1]?.querySelector<HTMLElement>('input')?.focus();
  });

  // Saisie : l'état suit, la ligne n'est pas re-rendue (le focus reste en place).
  container.addEventListener('input', (e) => {
    const cible = e.target as HTMLInputElement;
    const index = Number(cible.closest<HTMLElement>('.lecture-row')?.dataset.index);
    if (Number.isInteger(index) && index < state.databoxActions.length) {
      state.databoxActions[index] = cible.value;
    }
  });

  container.addEventListener('click', (e) => {
    const bouton = (e.target as HTMLElement).closest<HTMLElement>('[data-action="remove"]');
    if (!bouton) return;
    const index = Number(bouton.closest<HTMLElement>('.lecture-row')?.dataset.index);
    if (Number.isInteger(index)) state.databoxActions.splice(index, 1);
    renderActions();
    el('add-databox-action-btn')?.focus();
  });
}

// ---------------------------------------------------------------------------
// Visibilité
// ---------------------------------------------------------------------------

/** La section n'existe que pour les types rendus par `dsfr-data-chart`. */
export function updateCadreVisibility(type: ChartType): void {
  const section = el('section-databox');
  if (section) section.style.display = cadreApplies(type) ? '' : 'none';
}

/** Les réglages du cadre n'apparaissent que cadre activé. */
function updateOptionsVisibility(): void {
  const options = el('databox-options');
  if (options) options.style.display = state.databoxEnabled ? 'block' : 'none';
}

// ---------------------------------------------------------------------------
// État ↔ contrôles
// ---------------------------------------------------------------------------

/** Reporte l'état dans les contrôles (favori rouvert, retour d'une autre app). */
export function syncCadreControls(): void {
  const activer = el<HTMLInputElement>('databox-toggle');
  if (activer) activer.checked = state.databoxEnabled;
  for (const { id, cle } of CHAMPS_TEXTE) {
    const input = el<HTMLInputElement | HTMLTextAreaElement>(id);
    if (input) input.value = state[cle];
  }
  for (const { id, cle } of CASES) {
    const box = el<HTMLInputElement>(id);
    if (box) box.checked = state[cle];
  }
  populateDateFieldSelect();
  renderActions();
  updateOptionsVisibility();
  syncA11yWithDatabox(state.databoxEnabled);
  // Un réglage rouvert se montre : la divulgation qui le porte est dépliée.
  const information = el<HTMLDetailsElement>('databox-info-details');
  if (
    information &&
    (state.databoxTooltipTitle ||
      state.databoxTooltipContent ||
      state.databoxModalTitle ||
      state.databoxModalContent)
  ) {
    information.open = true;
  }
  const actions = el<HTMLDetailsElement>('databox-actions-details');
  if (actions && actionsValue(state.databoxActions).length > 0) actions.open = true;
}

/**
 * Après la relecture d'un état déposé : les réglages du cadre sont remis en
 * forme. `depose` est l'instantané relu ; une clé qu'il ne porte pas (favori
 * enregistré avant #1263, qui n'en portait aucune) revient à sa valeur par
 * défaut, au lieu de garder celle de la session en cours.
 */
export function restoreCadre(depose: Record<string, unknown>): void {
  const propre = normalizeCadre(depose);
  const cible = state as unknown as Record<string, unknown>;
  for (const cle of CADRE_KEYS) cible[cle] = propre[cle as keyof CadreSettings];
}

export function setupCadreListeners(): void {
  const activer = el<HTMLInputElement>('databox-toggle');
  activer?.addEventListener('change', () => {
    state.databoxEnabled = activer.checked;
    updateOptionsVisibility();
    syncA11yWithDatabox();
  });
  for (const { id, cle } of CHAMPS_TEXTE) {
    const input = el<HTMLInputElement | HTMLTextAreaElement>(id);
    input?.addEventListener('input', () => {
      state[cle] = input.value;
      if (cle === 'databoxDate') updateDateFieldNote();
    });
  }
  for (const { id, cle } of CASES) {
    const box = el<HTMLInputElement>(id);
    box?.addEventListener('change', () => {
      state[cle] = box.checked;
    });
  }
  const champDate = el<HTMLSelectElement>('databox-date-field');
  champDate?.addEventListener('change', () => {
    state.databoxDateField = champDate.value;
    updateDateFieldNote();
  });
  // La liste suit les champs de la source (même évènement que le builder de filtres).
  document.addEventListener('builder:fields-updated', populateDateFieldSelect);
  brancherActions();
  syncCadreControls();
}
