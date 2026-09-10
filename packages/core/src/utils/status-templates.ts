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

/** Libellé par défaut de l'état d'attente d'un filtre (#690) */
export const IDLE_MESSAGE_DEFAULT = 'Choisissez un filtre pour afficher les données';

/**
 * Bloc « en attente d'un filtre » (#690) — état `idle` d'un afficheur dont
 * l'amont porte `require-where` et n'a encore reçu aucun filtre.
 *
 * Trois différences volontaires avec les autres états :
 * - il n'est NI un chargement (rien n'est parti) NI un « aucune donnée »
 *   (aucune requête n'a été faite) : le confondre avec l'un des deux
 *   apprendrait à l'utilisateur que la page est cassée ;
 * - pas de région live : c'est l'état INITIAL de la page, l'annoncer au
 *   lecteur d'écran au chargement serait du bruit — le message est lu dans
 *   le flux comme n'importe quel texte ;
 * - pas d'`aria-busy` : rien n'est en cours.
 */
export function renderSourceIdle(
  componentClass: string,
  message: string = IDLE_MESSAGE_DEFAULT
): TemplateResult {
  return html`
    <div class="${componentClass}__idle dsfr-data-status--idle">
      <span class="fr-icon-filter-line" aria-hidden="true"></span>
      ${message || IDLE_MESSAGE_DEFAULT}
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

/**
 * Bloc d'erreur de CONFIGURATION (#649) : attribut invalide (fonction
 * d'agrégat inconnue…) — visible dans la page, pas seulement en console,
 * pour qu'une faute de frappe ne se traduise jamais par un rendu vide.
 */
export function renderConfigError(componentClass: string, message: string): TemplateResult {
  return html`
    <div
      class="${componentClass}__error dsfr-data-status--error dsfr-data-status--config-error"
      role="alert"
      aria-live="assertive"
    >
      <span class="fr-icon-error-line" aria-hidden="true"></span>
      Erreur de configuration : ${message}
    </div>
  `;
}
