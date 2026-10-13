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
  filtersDisabledBy,
  formatErrorTime,
  sourcePageFor,
  unavailablePhrase,
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

/** Dernière lecture du registre, par erreur puis par étape lue (#1288). */
const keptViews = new WeakMap<Error, Map<string, SourceErrorView>>();

/**
 * `resolveSourceError`, tenu PENDANT UN NOUVEL ESSAI (#1288).
 *
 * `dsfr-data-loading` efface l'erreur du registre : un bloc qui garde son
 * rendu de panne pendant l'essai (tableau équivalent, filtres, carte — ils
 * n'ont pas de sablier) relirait une erreur sans registre, donc sans la
 * phrase de l'intégrateur (`error-message`), sans l'origine, et classée de
 * nouveau avec le réseau du moment : une panne « hors connexion » devenait
 * « momentanément indisponible » le temps de l'essai, et le texte clignotait.
 * Tant que le registre ne dit rien de neuf pour CETTE erreur, la dernière
 * lecture fait foi ; seule la couverture par un bandeau est relue.
 */
export function resolveSourceErrorKept(error: Error, sourceId?: string): SourceErrorView {
  const key = sourceId ?? '';
  const kept = keptViews.get(error)?.get(key);
  if (kept && !(sourceId && getDataErrorState(sourceId))) {
    const covered = kept.originId ? isSourceCoveredByBanner(kept.originId) : false;
    return {
      ...kept,
      covered,
      showRetry: Boolean(sourceId) && kept.desc.retry && !covered,
      sourcePage: covered ? undefined : sourcePageFor(kept.desc.cause, kept.state?.sourcePage),
    };
  }
  const view = resolveSourceError(error, sourceId);
  let byStep = keptViews.get(error);
  if (!byStep) {
    byStep = new Map();
    keptViews.set(error, byStep);
  }
  byStep.set(key, view);
  return view;
}

/** Bouton « Réessayer » d'un bloc (#1203) — relance la source d'origine. */
export function renderRetryButton(sourceId: string, small = false): TemplateResult {
  return html`<button
    type="button"
    class=${
      small
        ? 'fr-btn fr-btn--secondary fr-btn--sm dsfr-data-status__retry'
        : 'fr-btn fr-btn--secondary dsfr-data-status__retry'
    }
    style=${RETRY_BUTTON_STYLE}
    @click=${() => requestSourceRetry(sourceId)}
  >
    ${RETRY_LABEL}
  </button>`;
}

/**
 * Phrase d'un changement de page refusé en pagination serveur (#1288) : la
 * page demandée n'est pas arrivée, la page affichée est toujours la précédente.
 * Les deux numéros sont ceux de la liste, pas une formule.
 */
export function pageLoadErrorText(failedPage: number, currentPage: number): string {
  return `La page ${failedPage} n’a pas pu être chargée. Vous consultez toujours la page ${currentPage}.`;
}

const PAGE_ERROR_STYLE =
  'color: var(--text-default-grey, #3a3a3a);' +
  'background: var(--background-alt-grey, #f6f6f6);' +
  'border-radius: 0.25rem; padding: 0.5rem 1rem; margin: 0 0 1rem;' +
  'display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem 1rem;' +
  'font-size: 0.875rem;';

/**
 * Encart « la page N n'a pas pu être chargée » (#1288), posé au-dessus d'une
 * liste ou de fiches en pagination serveur qui gardent la page précédente.
 *
 * Ce n'est pas l'encart de panne : les lignes à l'écran sont bien celles de
 * la page affichée, c'est le GESTE qui a échoué. Pas de région live ici — la
 * liste l'annonce par sa propre région, celle qui venait de dire « Page 4 »,
 * avec ou sans bandeau. « Réessayer » suit la règle commune (aucun bandeau
 * pour cette source, et une cause où réessayer a un sens) ; `error-message`
 * s'ajoute à la phrase, il ne la remplace pas.
 */
export function renderPageLoadError(
  componentClass: string,
  pages: { failed: number; current: number },
  error: Error,
  sourceId?: string
): TemplateResult {
  const view = resolveSourceErrorKept(error, sourceId);
  return html`
    <div
      class="${componentClass}__page-error dsfr-data-status--page-error"
      data-cause=${view.desc.cause}
      style=${PAGE_ERROR_STYLE}
    >
      <span class="fr-icon-information-line fr-icon--sm" aria-hidden="true"></span>
      <p class="dsfr-data-status__title" style="margin: 0; flex: 1 1 16rem; font-size: inherit;">
        ${pageLoadErrorText(pages.failed, pages.current)}
        ${view.userMessage ? html` ${view.userMessage}` : nothing}
      </p>
      ${view.showRetry ? renderRetryButton(sourceId as string, true) : nothing}
    </div>
  `;
}

/** Ce qu'un filtre (facettes, recherche) dit quand sa source est en panne (#1288). */
export interface FiltersUnavailableView {
  view: SourceErrorView;
  /** « Filtres momentanément indisponibles. », ou la phrase de la cause. */
  text: string;
}

/**
 * Les filtres de cette source sont-ils désactivés, et que disent-ils (#1288) ?
 * `null` : pas de panne, ou une panne qui ne les désactive pas
 * (`filtersDisabledBy`). `error-message` de la source suit la phrase.
 */
export function resolveFiltersUnavailable(
  error: Error | null,
  sourceId?: string
): FiltersUnavailableView | null {
  if (!error) return null;
  const view = resolveSourceErrorKept(error, sourceId);
  if (!filtersDisabledBy(view.desc.cause)) return null;
  const phrase = unavailablePhrase('Filtres', view.desc);
  return { view, text: view.userMessage ? `${phrase} ${view.userMessage}` : phrase };
}

/**
 * Phrase posée à côté de filtres désactivés (#1288). Pas de région live : la
 * panne est annoncée par le bandeau ou par les blocs que ces filtres
 * alimentent ; la phrase est la RAISON des contrôles désactivés, qui la
 * désignent par `aria-describedby`.
 */
export function renderFiltersUnavailable(id: string, unavailable: FiltersUnavailableView) {
  return html`
    <p
      class="fr-text--sm dsfr-data-filters-unavailable"
      id=${id}
      data-cause=${unavailable.view.desc.cause}
      style="margin: 0.25rem 0 0.5rem; color: var(--text-default-grey, #3a3a3a);"
    >
      <span class="fr-icon-information-line fr-icon--sm" aria-hidden="true"></span>
      ${unavailable.text}
    </p>
  `;
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
      ${showRetry ? renderRetryButton(sourceId as string) : nothing}
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
