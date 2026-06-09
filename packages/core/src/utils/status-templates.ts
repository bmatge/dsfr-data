/**
 * Templates partagés des états loading/erreur des composants d'affichage (#284).
 *
 * Avant : quatre comportements pour la même erreur — list/chart affichaient
 * error.message, display un texte générique sans message, kpi/podium un
 * libellé sans message ni role. Même UX partout désormais :
 * - erreur : role="alert" + aria-live="assertive", icône, message inclus ;
 * - loading : aria-live="polite" + aria-busy, icône, libellé personnalisable.
 *
 * La classe par composant (`dsfr-data-kpi__error`…) est conservée pour ne
 * pas casser les styles existants ; une classe commune
 * (`dsfr-data-status--*`) permet un theming global.
 */
import { html, type TemplateResult } from 'lit';

/** Bloc de chargement commun (libellé personnalisable par composant) */
export function renderSourceLoading(
  componentClass: string,
  label = 'Chargement...'
): TemplateResult {
  return html`
    <div
      class="${componentClass}__loading dsfr-data-status--loading"
      aria-live="polite"
      aria-busy="true"
    >
      <span class="fr-icon-loader-4-line" aria-hidden="true"></span>
      ${label}
    </div>
  `;
}

/** Bloc d'erreur commun — message TOUJOURS affiché quand disponible (#284) */
export function renderSourceError(componentClass: string, error: Error | null): TemplateResult {
  const message = error?.message
    ? `Erreur de chargement: ${error.message}`
    : 'Erreur de chargement';
  return html`
    <div
      class="${componentClass}__error dsfr-data-status--error"
      role="alert"
      aria-live="assertive"
    >
      <span class="fr-icon-error-line" aria-hidden="true"></span>
      ${message}
    </div>
  `;
}
