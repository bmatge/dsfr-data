/**
 * Partage par l'adresse de la page (#714) — un seul réglage d'interface pour
 * toute la famille `url-sync` de la bibliothèque :
 *
 * - `dsfr-data-facets` : `url-sync` (écrit les filtres dans l'adresse) et
 *   `url-params` (les relit au chargement) ;
 * - `dsfr-data-list` : `url-sync` (numéro de page) et `url-page-param` quand
 *   l'intégrateur choisit un autre nom de paramètre ;
 * - `url-param-map` est déduit par le générateur quand les champs de facette
 *   portent un préfixe (Grist non aplati), pour garder une adresse lisible.
 *
 * La section n'a de sens que si la vue produite porte l'un des deux
 * composants : un tableau, ou des facettes en mode dynamique.
 */

import { state } from '../state.js';

/** Vrai quand le code généré peut porter `url-sync` (tableau ou facettes). */
export function isUrlSyncApplicable(): boolean {
  return (
    state.chartType === 'datalist' ||
    (state.generationMode === 'dynamic' && state.facetsConfig.enabled)
  );
}

/**
 * Affiche ou masque la section « Partage par l'adresse » selon le type de
 * rendu et l'état des facettes. Quand elle cesse de s'appliquer, le réglage
 * est remis à zéro (même contrat que updateMiddlewareSections).
 */
export function updateUrlSyncSection(): void {
  const section = document.getElementById('section-url-sync');
  const applicable = isUrlSyncApplicable();
  if (section) section.style.display = applicable ? 'block' : 'none';

  if (!applicable) {
    state.urlSync = false;
    const toggle = document.getElementById('url-sync-enabled') as HTMLInputElement | null;
    if (toggle) toggle.checked = false;
    const options = document.getElementById('url-sync-options') as HTMLElement | null;
    if (options) options.style.display = 'none';
  }
}

/** Reflète l'état courant sur les contrôles (restauration d'un favori). */
export function syncUrlSyncControls(): void {
  const toggle = document.getElementById('url-sync-enabled') as HTMLInputElement | null;
  if (toggle) toggle.checked = state.urlSync;
  const options = document.getElementById('url-sync-options') as HTMLElement | null;
  if (options) options.style.display = state.urlSync ? 'block' : 'none';
  const pageParam = document.getElementById('url-page-param') as HTMLInputElement | null;
  if (pageParam) pageParam.value = state.urlPageParam || 'page';
}

/** Écouteurs du réglage de partage par l'adresse. */
export function setupUrlSyncListeners(): void {
  const toggle = document.getElementById('url-sync-enabled') as HTMLInputElement | null;
  const options = document.getElementById('url-sync-options') as HTMLElement | null;

  if (toggle) {
    toggle.addEventListener('change', () => {
      state.urlSync = toggle.checked;
      if (options) options.style.display = toggle.checked ? 'block' : 'none';
    });
  }

  const pageParamEl = document.getElementById('url-page-param') as HTMLInputElement | null;
  if (pageParamEl) {
    pageParamEl.addEventListener('input', () => {
      state.urlPageParam = pageParamEl.value.trim() || 'page';
    });
  }
}
