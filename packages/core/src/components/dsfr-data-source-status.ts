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
import { RETRY_LABEL, RETRYING_LABEL, renderSourcePageLink } from '../utils/status-templates.js';
import { readStaleReading, type StaleReading } from '../utils/stale-reading.js';

/** Une panne affichée : l'état d'erreur de la source d'origine, et sa relance en cours. */
interface Outage {
  state: DataErrorState;
  retrying: boolean;
}

const TITLE_TEMPORARY = 'Une partie des chiffres de cette page est momentanément indisponible';
const TITLE_PERMANENT = 'Une partie des chiffres de cette page ne peut pas être affichée';
const REST_OF_PAGE =
  'Les blocs concernés s’afficheront dès son retour ; le reste de la page est à jour.';

/**
 * Dernier relevé affiché (#1288, `stale-if-error`) : les blocs ne sont pas
 * vides, ils montrent des chiffres datés. Le bandeau ne promet donc plus
 * qu'ils « s'afficheront dès son retour » — il dit qu'ils n'ont pas été
 * actualisés, et où lire leur heure. La date elle-même est dite par chaque
 * bloc : deux sources peuvent ne pas avoir été relevées au même moment.
 */
const TITLE_STALE = 'Une partie des chiffres de cette page n’a pas pu être actualisée';
const STALE_KEPT = 'Les derniers chiffres reçus restent affichés, avec l’heure de leur relevé';

/** Titre du bandeau pour une cause : passager, hors connexion, ou durable. */
function bannerTitle(desc: SourceErrorDescription, stale: boolean): string {
  if (desc.cause === 'hors-connexion') return desc.title;
  if (stale) return TITLE_STALE;
  return desc.retry ? TITLE_TEMPORARY : TITLE_PERMANENT;
}

/** Phrase du bandeau quand les blocs gardent leur dernier relevé (#1288). */
function bannerStaleText(desc: SourceErrorDescription): string {
  switch (desc.cause) {
    case 'hors-connexion':
      return `${STALE_KEPT} ; ils seront actualisés quand la connexion reviendra.`;
    case 'service-sollicite':
      return `${desc.title}. ${STALE_KEPT}. ${desc.detail}`;
    default:
      return `${desc.detail} ${STALE_KEPT} ; le reste de la page est à jour.`;
  }
}

/** Phrase du bandeau : celle de l'intégrateur, sinon celle du barème. */
function bannerText(desc: SourceErrorDescription, userMessage?: string, stale = false): string {
  if (userMessage) return userMessage;
  if (stale) return bannerStaleText(desc);
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
 * Quand la source porte `stale-if-error` et que la panne est passagère, les blocs gardent leur
 * dernier relevé, daté : le bandeau dit alors « Une partie des chiffres de cette page n'a pas pu
 * être actualisée », et renvoie à l'heure écrite sur chaque bloc. Passé la durée donnée, il
 * reprend de lui-même son texte ordinaire.
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
  /** Échéance du plus proche relevé affiché (#1288) : le texte du bandeau en dépend. */
  private _staleTimer: ReturnType<typeof setTimeout> | null = null;

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
    this._clearStaleTimer();
  }

  private _clearStaleTimer() {
    if (this._staleTimer !== null) {
      clearTimeout(this._staleTimer);
      this._staleTimer = null;
    }
  }

  /**
   * Le relevé de la source d'origine, s'il est affichable (#1288) — la même
   * règle que les blocs (`judgeStaleReading`). Le bandeau lit l'ORIGINE : un
   * bloc branché sur une jointure peut dater d'un autre moment, et c'est lui
   * qui l'écrit.
   */
  private _readings(): Map<string, StaleReading> {
    const readings = new Map<string, StaleReading>();
    for (const originId of this._outages.keys()) {
      const reading = readStaleReading(originId);
      if (reading) readings.set(originId, reading);
    }
    return readings;
  }

  /** Arme le retour au texte ordinaire à l'échéance du relevé le plus proche. */
  private _armStaleTimer(readings: Map<string, StaleReading>) {
    this._clearStaleTimer();
    let next = Infinity;
    for (const reading of readings.values()) next = Math.min(next, reading.expiresAt + 1);
    if (!Number.isFinite(next)) return;
    const delay = Math.min(Math.max(next - Date.now(), 0), 2_147_483_647);
    this._staleTimer = setTimeout(() => {
      this._staleTimer = null;
      this.requestUpdate();
    }, delay);
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

  private _renderOutage(originId: string, outage: Outage, stale: boolean): TemplateResult {
    const { state, retrying } = outage;
    const desc = describeSourceCause(state.cause, state.error);
    const sourcePage = sourcePageFor(desc.cause, state.sourcePage);
    return html`
      <div
        class="fr-alert fr-alert--info fr-mb-2w dsfr-data-source-status__alert"
        data-source=${originId}
        data-cause=${desc.cause}
        data-stale=${stale ? 'true' : nothing}
      >
        <h3 class="fr-alert__title">${bannerTitle(desc, stale)}</h3>
        <p class="dsfr-data-source-status__text">${bannerText(desc, state.userMessage, stale)}</p>
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
                ${retrying ? RETRYING_LABEL : RETRY_LABEL}
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
    const readings = this._readings();
    this._armStaleTimer(readings);
    return html`
      <div class="dsfr-data-source-status" role="status">
        ${[...this._outages.entries()].map(([id, outage]) =>
          this._renderOutage(id, outage, readings.has(id))
        )}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'dsfr-data-source-status': DsfrDataSourceStatus;
  }
}
