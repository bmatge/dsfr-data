import { LitElement, html, nothing, type TemplateResult } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { sendWidgetBeacon } from '../utils/beacon.js';
import { checkUnknownAttributes } from '../utils/unknown-attributes.js';
import {
  DATA_EVENTS,
  dispatchSourceCommand,
  getDataErrorState,
  listDataErrorStates,
  registerStatusBanner,
  type DataErrorState,
} from '../utils/data-bridge.js';
import {
  describeSourceCause,
  formatErrorTime,
  sourcePageFor,
  type SourceErrorDescription,
} from '../utils/source-errors.js';
import { RETRY_LABEL, renderSourcePageLink } from '../utils/status-templates.js';

/** Une panne affichée : l'état d'erreur de la source d'origine, et sa relance en cours. */
interface Outage {
  state: DataErrorState;
  retrying: boolean;
}

const TITLE_TEMPORARY = 'Une partie des chiffres de cette page est momentanément indisponible';
const TITLE_PERMANENT = 'Une partie des chiffres de cette page ne peut pas être affichée';
const REST_OF_PAGE =
  'Les blocs concernés s’afficheront dès son retour ; le reste de la page est à jour.';

/** Titre du bandeau pour une cause : passager, hors connexion, ou durable. */
function bannerTitle(desc: SourceErrorDescription): string {
  if (desc.cause === 'hors-connexion') return desc.title;
  return desc.retry ? TITLE_TEMPORARY : TITLE_PERMANENT;
}

/** Phrase du bandeau : celle de l'intégrateur, sinon celle du barème. */
function bannerText(desc: SourceErrorDescription, userMessage?: string): string {
  if (userMessage) return userMessage;
  switch (desc.cause) {
    case 'service-indisponible':
    case 'reponse-bloquee':
      return `${desc.detail} ${REST_OF_PAGE}`;
    case 'hors-connexion':
      return desc.detail;
    case 'acces-restreint':
      return `${desc.title}.`;
    default:
      return `${desc.title}. ${desc.detail}`;
  }
}

/**
 * <dsfr-data-source-status> - Dire une panne de données UNE fois, en tête de page
 *
 * Sans lui, chaque bloc branché sur une source en panne dit la panne à sa place et porte son
 * propre « Réessayer » : huit blocs, huit messages. Avec lui, la panne est dite une fois par
 * source, ici, avec le seul bouton « Réessayer » ; les blocs concernés gardent leur place et un
 * message court, sans bouton ni annonce répétée. Les blocs d'une AUTRE source ne sont pas touchés.
 *
 * Composant d'ÉTAT, à poser là où le message doit se lire (en général en haut du contenu). Il
 * n'affiche rien tant qu'aucune source n'est en panne.
 *
 * - `source="id"` : ne suit que cette source (et les étapes branchées dessus) ;
 * - sans `source` : suit toutes les sources de la page, un message par source en panne.
 *
 * La phrase lue par l'usager vient du barème de la bibliothèque (service indisponible, hors
 * connexion, service très sollicité, données introuvables, accès restreint, page mal réglée) ou de
 * l'attribut `error-message` de la source. Le code HTTP, l'adresse appelée et l'heure restent
 * repliés dans « Détails techniques ».
 *
 * « Réessayer » relance la source à l'identique. Il n'apparaît que lorsque réessayer a un sens :
 * pas sur des données introuvables (404), un accès restreint (401, 403) ni une page mal réglée.
 * Hors connexion, la source se relance d'elle-même au retour du réseau ; sur un service très
 * sollicité (429), jamais automatiquement.
 *
 * Sur des données introuvables (404, 410), le bandeau propose le lien « Consulter la page de ces
 * données » quand la source porte `source-page` ; sans cet attribut, aucun lien.
 *
 * Un `dsfr-data-kpi` en panne garde une forme compacte : « — » à la place du chiffre, son libellé,
 * et une phrase courte. Avec le bandeau, la tuile ne porte ni bouton, ni lien, ni détail technique.
 *
 * Accessibilité : le bandeau est une région `role="status"` (annonce polie, non interruptive),
 * présente dès le montage pour que la panne y soit annoncée quand elle survient. Les blocs
 * couverts cessent d'être des régions live : la panne n'est annoncée qu'une fois. Le bouton fait
 * au moins 44 px de haut et reste en place, donc garde le focus, pendant le nouvel essai.
 *
 * @summary Bandeau d'état d'une source : la panne dite une fois, avec « Réessayer »
 *
 * @example
 * <dsfr-data-source-status source="src"></dsfr-data-source-status>
 * <dsfr-data-source id="src" api-type="opendatasoft" base-url="https://data.economie.gouv.fr"
 *   dataset-id="prix-carburants" error-message="Les prix sont en cours de mise à jour.">
 * </dsfr-data-source>
 * <dsfr-data-kpi source="src" valeur="count" label="Stations"></dsfr-data-kpi>
 *
 * @fires dsfr-data-source-command - `{ sourceId, reload: true }` sur `document` — « Réessayer » a
 *   été activé : la source d'origine de la panne recharge à l'identique.
 */
@customElement('dsfr-data-source-status')
export class DsfrDataSourceStatus extends LitElement {
  /**
   * Id de la source à suivre. Vide : toutes les sources de la page, un message par source en
   * panne. Une étape intermédiaire (`dsfr-data-query`…) branchée sur la source est suivie avec
   * elle : c'est la source qui charge qui est relancée.
   */
  @property({ type: String })
  source = '';

  /** Pannes affichées, par id de la source d'origine. */
  private _outages = new Map<string, Outage>();
  private _releaseBanner: (() => void) | null = null;
  private _registeredFor: string | null = null;

  // Light DOM pour hériter des styles DSFR
  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    checkUnknownAttributes(this);
    sendWidgetBeacon('dsfr-data-source-status');
    this._follow();
    document.addEventListener(DATA_EVENTS.ERROR, this._onError);
    document.addEventListener(DATA_EVENTS.LOADING, this._onLoading);
    document.addEventListener(DATA_EVENTS.LOADED, this._onSettled);
    document.addEventListener(DATA_EVENTS.IDLE, this._onSettled);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener(DATA_EVENTS.ERROR, this._onError);
    document.removeEventListener(DATA_EVENTS.LOADING, this._onLoading);
    document.removeEventListener(DATA_EVENTS.LOADED, this._onSettled);
    document.removeEventListener(DATA_EVENTS.IDLE, this._onSettled);
    this._releaseBanner?.();
    this._releaseBanner = null;
    this._registeredFor = null;
    this._outages.clear();
  }

  willUpdate(changedProperties: Map<string, unknown>) {
    super.willUpdate(changedProperties);
    if (changedProperties.has('source') && this._registeredFor !== this.source) this._follow();
  }

  /**
   * Déclare au bus les sources que ce bandeau couvre — leurs blocs n'ont plus
   * à dire la panne — puis relit les pannes déjà là : une panne peut précéder
   * le montage du bandeau, le registre fait foi.
   */
  private _follow() {
    this._releaseBanner?.();
    this._registeredFor = this.source;
    this._releaseBanner = registerStatusBanner(this.source || undefined);
    this._outages.clear();
    for (const [id] of listDataErrorStates()) this._noteError(id);
    this.requestUpdate();
  }

  private _follows(originId: string, stepId: string): boolean {
    return !this.source || this.source === originId || this.source === stepId;
  }

  private _noteError(stepId: string) {
    const state = getDataErrorState(stepId);
    if (!state || !this._follows(state.originId, stepId)) return;
    this._outages.set(state.originId, { state, retrying: false });
    this.requestUpdate();
  }

  private _eventSourceId(e: Event): string {
    return (e as CustomEvent<{ sourceId: string }>).detail?.sourceId ?? '';
  }

  private _onError = (e: Event): void => {
    this._noteError(this._eventSourceId(e));
  };

  /** La source d'origine recharge : le message reste, le bouton attend — le focus n'est pas perdu. */
  private _onLoading = (e: Event): void => {
    const outage = this._outages.get(this._eventSourceId(e));
    if (!outage) return;
    outage.retrying = true;
    this.requestUpdate();
  };

  /** La source d'origine a livré (ou attend un filtre) : la panne est finie. */
  private _onSettled = (e: Event): void => {
    if (this._outages.delete(this._eventSourceId(e))) this.requestUpdate();
  };

  private _retry(originId: string) {
    dispatchSourceCommand(originId, this.id ? { reload: true, origin: this.id } : { reload: true });
  }

  private _renderOutage(originId: string, outage: Outage): TemplateResult {
    const { state, retrying } = outage;
    const desc = describeSourceCause(state.cause, state.error);
    const sourcePage = sourcePageFor(desc.cause, state.sourcePage);
    return html`
      <div
        class="fr-alert fr-alert--info fr-mb-2w dsfr-data-source-status__alert"
        data-source=${originId}
        data-cause=${desc.cause}
      >
        <h3 class="fr-alert__title">${bannerTitle(desc)}</h3>
        <p class="dsfr-data-source-status__text">${bannerText(desc, state.userMessage)}</p>
        ${
          sourcePage
            ? html`<p class="dsfr-data-source-status__link fr-mt-1w">
                ${renderSourcePageLink(sourcePage)}
              </p>`
            : nothing
        }
        ${
          desc.retry
            ? html`<button
                type="button"
                class="fr-btn fr-btn--secondary fr-mt-1w dsfr-data-source-status__retry"
                style="min-height: 2.75rem; min-width: 2.75rem;"
                aria-disabled=${retrying ? 'true' : 'false'}
                @click=${() => {
                  if (!retrying) this._retry(originId);
                }}
              >
                ${retrying ? 'Nouvel essai en cours…' : RETRY_LABEL}
              </button>`
            : nothing
        }
        <details class="dsfr-data-source-status__details fr-mt-1w" style="font-size: 0.75rem;">
          <summary>Détails techniques</summary>
          <ul style="margin: 0.25rem 0 0; padding-left: 1rem;">
            ${desc.status !== undefined ? html`<li>Code HTTP : ${desc.status}</li>` : nothing}
            <li>Message : ${state.error.message}</li>
            <li>Source : ${originId}</li>
            ${
              state.attemptedUrl
                ? html`<li style="overflow-wrap: anywhere;">
                    Adresse appelée : ${state.attemptedUrl}
                  </li>`
                : nothing
            }
            <li>Heure : ${formatErrorTime(state.at)}</li>
            <li>${desc.hint}</li>
          </ul>
        </details>
      </div>
    `;
  }

  render() {
    // La région live existe AVANT la panne : un lecteur d'écran n'annonce que
    // ce qui change dans une région déjà présente.
    return html`
      <div class="dsfr-data-source-status" role="status">
        ${[...this._outages.entries()].map(([id, outage]) => this._renderOutage(id, outage))}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'dsfr-data-source-status': DsfrDataSourceStatus;
  }
}
