/**
 * Templates partagés des états loading/erreur des composants d'affichage (#284).
 *
 * Avant : quatre comportements pour la même erreur — list/chart affichaient
 * error.message, display un texte générique sans message, kpi/podium un
 * libellé sans message ni role. Même UX partout désormais :
 * - erreur de SOURCE (#1203) : bloc neutre, message du barème pour l'usager,
 *   code et adresse repliés dans « Détails techniques », role="status" ;
 * - erreur de CONFIGURATION (#649) : role="alert", message de l'intégrateur ;
 * - loading : aria-live="polite" + aria-busy, icône, libellé personnalisable.
 *
 * La classe par composant (`dsfr-data-kpi__error`…) est conservée pour ne
 * pas casser les styles existants ; une classe commune
 * (`dsfr-data-status--*`) permet un theming global.
 */
import { html, nothing, type TemplateResult } from 'lit';
import {
  getDataErrorState,
  isSourceCoveredByBanner,
  requestSourceRetry,
  type DataErrorState,
} from './data-bridge.js';
import {
  SOURCE_PAGE_LABEL,
  describeSourceCause,
  describeSourceError,
  formatErrorTime,
  sourcePageFor,
  type SourceErrorDescription,
} from './source-errors.js';

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

/**
 * Styles du bloc d'erreur de source, posés EN LIGNE (#1203).
 *
 * Les composants rendent en light DOM et chacun colore sa classe `__error` en
 * rouge — ce que l'erreur de configuration doit garder. Le style en ligne
 * l'emporte sans toucher à ces règles : le bloc reste neutre, garde la place
 * que la classe du composant lui réserve, et la page ne « saute » pas.
 */
const SOURCE_ERROR_STYLE =
  'color: var(--text-default-grey, #3a3a3a);' +
  'background: var(--background-alt-grey, #f6f6f6);' +
  'border: 0; border-radius: 0.25rem; padding: 1rem;' +
  'display: flex; flex-direction: column; align-items: center; justify-content: center;' +
  'gap: 0.5rem; text-align: center; font-size: 0.875rem; font-weight: 400;';
const SOURCE_ERROR_TEXT_STYLE = 'margin: 0; color: var(--text-default-grey, #3a3a3a);';
const SOURCE_ERROR_DETAILS_STYLE =
  'font-size: 0.75rem; color: var(--text-mention-grey, #666); text-align: left; max-width: 100%;';
/** Cible tactile de 44 px minimum (RGAA / WCAG 2.5.5). */
export const RETRY_BUTTON_STYLE = 'min-height: 2.75rem; min-width: 2.75rem;';

/** Libellé de l'action de relance (lexique `docs/ux/actions.md`). */
export const RETRY_LABEL = 'Réessayer';

/**
 * Ce qu'un bloc sait de la panne de sa source (#1203, #1222) — la même
 * lecture pour le gabarit complet et pour la forme compacte du KPI : les deux
 * ne peuvent pas diverger sur la cause, le bouton ou le lien.
 */
export interface SourceErrorView {
  desc: SourceErrorDescription;
  state: DataErrorState | undefined;
  /** Source qui a réellement échoué (au bout de la chaîne). */
  originId: string | undefined;
  /** Un bandeau `dsfr-data-source-status` dit déjà cette panne. */
  covered: boolean;
  /** « Réessayer » dans le bloc : un essai a un sens, et aucun bandeau ne le porte. */
  showRetry: boolean;
  /** Phrase de l'intégrateur (`error-message`). */
  userMessage: string | undefined;
  /**
   * Page publique des données à proposer DANS LE BLOC (#1222) : données
   * introuvables seulement, `source-page` posé, et aucun bandeau — qui porte
   * alors le lien, comme il porte « Réessayer ».
   */
  sourcePage: string | undefined;
  /** Message technique de l'`Error`. */
  technical: string | undefined;
}

/** Lit l'état d'erreur d'un bloc — voir `SourceErrorView`. */
export function resolveSourceError(error: Error | null, sourceId?: string): SourceErrorView {
  const state = sourceId ? getDataErrorState(sourceId) : undefined;
  const online = typeof navigator === 'undefined' || navigator.onLine !== false;
  const desc = state
    ? describeSourceCause(state.cause, state.error)
    : describeSourceError(error, online);
  const originId = state?.originId ?? sourceId;
  const covered = originId ? isSourceCoveredByBanner(originId) : false;
  return {
    desc,
    state,
    originId,
    covered,
    showRetry: Boolean(sourceId) && desc.retry && !covered,
    userMessage: state?.userMessage,
    sourcePage: covered ? undefined : sourcePageFor(desc.cause, state?.sourcePage),
    technical: (state?.error ?? error)?.message,
  };
}

/**
 * Lien vers la page publique des données (#1222). `rel="noopener"` : la page
 * ouverte n'a aucune prise sur celle-ci. Pas de `target` : l'usager choisit
 * lui-même d'ouvrir un onglet. L'adresse a déjà passé `safeSourcePage`.
 */
export function renderSourcePageLink(sourcePage: string): TemplateResult {
  return html`<a
    class="fr-link fr-link--sm dsfr-data-status__source-page"
    href=${sourcePage}
    rel="noopener"
    >${SOURCE_PAGE_LABEL}</a
  >`;
}

/** Lignes de « Détails techniques », communes au bloc complet et à la forme compacte. */
export function renderSourceErrorDetailItems(view: SourceErrorView): TemplateResult {
  const { desc, state, originId, technical } = view;
  return html`
    ${desc.status !== undefined ? html`<li>Code HTTP : ${desc.status}</li>` : nothing}
    ${technical ? html`<li>Message : ${technical}</li>` : nothing}
    ${originId ? html`<li>Source : ${originId}</li>` : nothing}
    ${
      state?.attemptedUrl
        ? html`<li style="overflow-wrap: anywhere;">Adresse appelée : ${state.attemptedUrl}</li>`
        : nothing
    }
    ${state ? html`<li>Heure : ${formatErrorTime(state.at)}</li>` : nothing}
    <li>${desc.hint}</li>
  `;
}

/**
 * Bloc d'erreur de SOURCE (#1203) : ce que l'usager peut comprendre, ce que
 * l'intégrateur peut déplier.
 *
 * - neutre, sans rouge : une panne du producteur n'est pas une faute de
 *   l'usager, ni un bug de la page ;
 * - `role="status"` (poli) et non plus `role="alert"` : huit blocs en panne
 *   n'interrompent plus huit fois le lecteur d'écran. Quand un bandeau
 *   `dsfr-data-source-status` dit déjà la panne de cette source, le bloc
 *   n'est plus une région live du tout — la panne est annoncée UNE fois ;
 * - « Réessayer » dans le bloc seulement s'il n'y a pas de bandeau pour sa
 *   source, et seulement quand réessayer a un sens (pas sur un 404).
 *
 * @param sourceId attribut `source` du composant : donne l'état d'erreur
 *   enregistré par le bus (origine de la panne, adresse, heure). Sans lui, le
 *   bloc classe l'`Error` seule et ne propose pas de relance.
 */
export function renderSourceError(
  componentClass: string,
  error: Error | null,
  sourceId?: string
): TemplateResult {
  const view = resolveSourceError(error, sourceId);
  const { desc, covered, showRetry, userMessage, sourcePage } = view;

  return html`
    <div
      class="${componentClass}__error dsfr-data-status--error dsfr-data-status--source-error"
      role=${covered ? nothing : 'status'}
      data-cause=${desc.cause}
      style=${SOURCE_ERROR_STYLE}
    >
      <span class="fr-icon-information-line" aria-hidden="true"></span>
      ${
        userMessage
          ? html`<p class="dsfr-data-status__title" style=${SOURCE_ERROR_TEXT_STYLE}>
              ${userMessage}
            </p>`
          : html`<p class="dsfr-data-status__title" style=${SOURCE_ERROR_TEXT_STYLE}>
                <strong>${desc.title}</strong>
              </p>
              ${
                desc.detail
                  ? html`<p class="dsfr-data-status__detail" style=${SOURCE_ERROR_TEXT_STYLE}>
                      ${desc.detail}
                    </p>`
                  : nothing
              }`
      }
      ${
        showRetry
          ? html`<button
              type="button"
              class="fr-btn fr-btn--secondary dsfr-data-status__retry"
              style=${RETRY_BUTTON_STYLE}
              @click=${() => requestSourceRetry(sourceId as string)}
            >
              ${RETRY_LABEL}
            </button>`
          : nothing
      }
      ${
        sourcePage
          ? html`<p class="dsfr-data-status__link" style=${SOURCE_ERROR_TEXT_STYLE}>
              ${renderSourcePageLink(sourcePage)}
            </p>`
          : nothing
      }
      <details class="dsfr-data-status__details" style=${SOURCE_ERROR_DETAILS_STYLE}>
        <summary>Détails techniques</summary>
        <ul class="dsfr-data-status__details-list" style="margin: 0.25rem 0 0; padding-left: 1rem;">
          ${renderSourceErrorDetailItems(view)}
        </ul>
      </details>
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
