/**
 * SourceSubscriberMixin - Pattern réutilisable pour l'abonnement aux sources de données
 *
 * Factorise la logique d'abonnement/cache/désabonnement commune à
 * dsfr-data-kpi, dsfr-data-list, dsfr-data-chart.
 */
import type { LitElement } from 'lit';
import {
  subscribeToSource,
  getDataCache,
  getDataErrorState,
  isDataIdle,
  isDataStale,
  STATUS_COVERAGE_EVENT,
} from './data-bridge.js';
import { readStaleReading, type StaleReading } from './stale-reading.js';
import { checkUnknownAttributes } from './unknown-attributes.js';
import { registerDsfrDataInstance, unregisterDsfrDataInstance } from './instance-registry.js';

// Pattern Lit mixin canonique : le constructor doit être callable avec
// n'importe quels args pour permettre le chaînage `class extends mixin(Parent)`.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- any[] est le pattern canonique des mixins Lit
type Constructor<T = object> = new (...args: any[]) => T;

export interface SourceSubscriberInterface {
  source: string;
  _sourceLoading: boolean;
  _sourceData: unknown;
  _sourceError: Error | null;
  /** L'amont attend un filtre (`require-where`, #690) — état « idle ». */
  _sourceIdle: boolean;
  /**
   * Le dernier relevé de la source en panne, quand il est à AFFICHER (#1288) :
   * `stale-if-error` posé sur la source d'origine, cause passagère, même
   * requête, relevé encore dans sa durée. `null` sinon — y compris tant que la
   * source fonctionne. Vaut pendant un nouvel essai : le bloc garde ses
   * chiffres, il ne repasse pas par le sablier.
   */
  _sourceStale: StaleReading | null;
  onSourceData(data: unknown): void;
  onSourceError?(error: Error): void;
  onSourceReset?(): void;
  onSourceStale?(reading: StaleReading | null): void;
}

/** Plus long délai qu'un `setTimeout` accepte sans déborder (2^31 - 1 ms). */
const MAX_TIMER_DELAY = 2_147_483_647;

/**
 * Mixin qui ajoute la logique d'abonnement à une source de données.
 *
 * Le composant hôte doit :
 * - déclarer `@property({ type: String }) source = ''`
 * - implémenter `onSourceData(data)` pour réagir aux nouvelles données
 */
export function SourceSubscriberMixin<T extends Constructor<LitElement>>(superClass: T) {
  class SourceSubscriberElement extends superClass {
    _sourceLoading = false;
    _sourceData: unknown = null;
    _sourceError: Error | null = null;
    /**
     * L'amont attend un filtre (#690). Purement un ÉTAT DE RENDU : il n'y a
     * ni données périmées ni erreur à montrer, et surtout pas un « aucune
     * donnée » qui laisserait croire que la requête a été faite pour rien.
     */
    _sourceIdle = false;
    /** Relevé à afficher pendant la panne (#1288) — voir l'interface. */
    _sourceStale: StaleReading | null = null;

    private _unsubscribeSource: (() => void) | null = null;
    /** Échéance du relevé affiché (#1288) : le bloc bascule seul au message de panne. */
    private _staleTimer: ReturnType<typeof setTimeout> | null = null;

    /**
     * Hook appelé quand de nouvelles données arrivent.
     * À surcharger dans le composant hôte.
     */
    onSourceData(_data: unknown): void {
      // default: no-op
    }

    /**
     * Hook appelé quand une erreur survient.
     * À surcharger pour gérer les erreurs (ex: revert pagination).
     */
    onSourceError(_error: Error): void {
      // default: no-op
    }

    /**
     * Hook appelé à chaque (re)souscription, APRÈS la purge des états du
     * mixin et AVANT la lecture du cache (#284). À surcharger pour purger
     * l'état dérivé de l'hôte (lignes, valeurs calculées…) — changer de
     * `source` ne doit pas laisser l'affichage précédent.
     */
    onSourceReset(): void {
      // default: no-op
    }

    /**
     * Hook du dernier relevé (#1288). Appelé avec le relevé quand il devient
     * affichable — après `onSourceError`, ou à l'abonnement d'un bloc monté
     * pendant la panne — et avec `null` quand il ÉCHOIT (durée dépassée) sans
     * qu'aucun événement de la source ne l'ait levé.
     *
     * À surcharger par un hôte qui garde sa copie des lignes : il la reprend
     * du relevé (`reading.data`), puis la lâche à l'échéance. `_sourceStale`
     * est déjà à jour quand le hook est appelé. Un échec qui REFUSE le relevé
     * (autre requête, cause durable) ne passe pas par ici : `onSourceError`
     * l'a déjà traité.
     */
    onSourceStale(_reading: StaleReading | null): void {
      // default: no-op
    }

    /**
     * Premier willUpdate (cycle de montage Lit) déjà consommé (#281).
     * Au montage, `source` figure dans changedProperties : sans ce flag,
     * l'abonnement de connectedCallback était immédiatement doublé
     * (double lecture du cache, double onSourceData).
     */
    private _subscriberMountCycleDone = false;

    connectedCallback() {
      super.connectedCallback();
      // Un attribut inconnu du bundle chargé est ignoré en silence (#727) :
      // seul ce point du cycle voit à la fois la classe réellement
      // enregistrée et le balisage écrit par l'intégrateur.
      checkUnknownAttributes(this);
      this._subscribeToSource();
      // Registre des instances (#836), APRÈS l'abonnement : un afficheur EST
      // un lecteur de la chaîne, et c'est son inscription qui conteste une
      // délégation posée par une query montée avant lui (#853) — il doit
      // alors être en mesure de recevoir les lignes rebrutes.
      registerDsfrDataInstance(this);
      document.addEventListener(STATUS_COVERAGE_EVENT, this._onStatusCoverage);
    }

    /**
     * Un bandeau de source est apparu ou parti (#1203) : un bloc en erreur se
     * redessine pour retirer — ou reprendre — son propre « Réessayer ».
     */
    private _onStatusCoverage = (): void => {
      if (this._sourceError || this._sourceStale) this.requestUpdate();
    };

    /**
     * Arme l'échéance du relevé affiché (#1288). Le bloc se relit aussi au
     * changement de jour : « aujourd’hui à 14 h 32 » devient « le 13 octobre à
     * 14 h 32 » sans attendre un geste.
     */
    private _armStaleTimer(): void {
      this._clearStaleTimer();
      const reading = this._sourceStale;
      if (!reading) return;
      const now = Date.now();
      const midnight = new Date(now);
      midnight.setHours(24, 0, 0, 0);
      // +1 ms : à l'instant exact de l'échéance, le relevé vaut encore.
      const next = Math.min(reading.expiresAt + 1, midnight.getTime());
      const delay = Math.min(Math.max(next - now, 0), MAX_TIMER_DELAY);
      this._staleTimer = setTimeout(() => {
        this._staleTimer = null;
        this._refreshStale();
      }, delay);
    }

    private _clearStaleTimer(): void {
      if (this._staleTimer !== null) {
        clearTimeout(this._staleTimer);
        this._staleTimer = null;
      }
    }

    /** Relit le relevé à l'échéance (ou à minuit) et prévient l'hôte s'il a échu. */
    private _refreshStale(): void {
      if (!this._sourceStale) return;
      const source = (this as unknown as SourceSubscriberInterface).source;
      this._sourceStale = source ? readStaleReading(source) : null;
      if (this._sourceStale) this._armStaleTimer();
      else this.onSourceStale(null);
      this.requestUpdate();
    }

    /** Plus de relevé : la source a livré, attend un filtre, ou l'abonnement change. */
    private _dropStale(): void {
      this._clearStaleTimer();
      this._sourceStale = null;
    }

    disconnectedCallback() {
      super.disconnectedCallback();
      document.removeEventListener(STATUS_COVERAGE_EVENT, this._onStatusCoverage);
      unregisterDsfrDataInstance(this);
      this._clearStaleTimer();
      this._cleanupSubscription();
    }

    willUpdate(changedProperties: Map<string, unknown>) {
      super.willUpdate(changedProperties);
      // Cycle de montage : déjà abonné via connectedCallback (#281)
      if (!this._subscriberMountCycleDone) {
        this._subscriberMountCycleDone = true;
        return;
      }
      if (changedProperties.has('source')) {
        this._subscribeToSource();
      }
    }

    private _subscribeToSource() {
      this._cleanupSubscription();

      // Purge des états : changer de source (y compris vers une source sans
      // cache) ne doit pas laisser un affichage périmé sans indicateur (#284)
      this._sourceData = null;
      this._sourceError = null;
      this._sourceLoading = false;
      this._sourceIdle = false;
      this._dropStale();
      this.onSourceReset();
      this.requestUpdate();

      const source = (this as unknown as SourceSubscriberInterface).source;
      if (!source) return;

      // L'amont peut être entré en attente AVANT ce montage (#690) :
      // l'événement est passé, le cache est vide — le registre fait foi.
      this._sourceIdle = isDataIdle(source);

      // Récupère les données en cache
      const cachedData = getDataCache(source);
      if (cachedData !== undefined) {
        this._sourceData = cachedData;
        this.onSourceData(cachedData);
      }

      // La source peut être tombée en panne AVANT ce montage (#1222) :
      // l'événement est passé. Ses lignes ne sont plus au cache (#1272, elles
      // sont gardées périmées, hors de `getDataCache`) : sans ce relevé, le
      // bloc monté après coup resterait vide au lieu de dire la panne.
      const failed = getDataErrorState(source);
      if (failed) this._sourceError = failed.error;
      // Ni erreur ni lignes courantes, mais des lignes périmées (#1272) : un
      // nouvel essai est en vol — `dsfr-data-loading` a effacé l'erreur et il
      // est déjà passé. Le bloc monté à cet instant est en chargement.
      else if (isDataStale(source)) this._sourceLoading = true;

      // Bloc monté PENDANT la panne (#1288) : le relevé se lit au registre,
      // comme l'erreur. Rien si l'intégrateur ne l'a pas demandé.
      if (failed || this._sourceLoading) {
        this._sourceStale = readStaleReading(source);
        if (this._sourceStale) {
          this._armStaleTimer();
          this.onSourceStale(this._sourceStale);
        }
      }

      this._unsubscribeSource = subscribeToSource(source, {
        onLoaded: (data) => {
          this._sourceData = data;
          this._sourceLoading = false;
          this._sourceError = null;
          this._sourceIdle = false;
          this._dropStale();
          this.onSourceData(data);
          this.requestUpdate();
        },
        onLoading: () => {
          this._sourceLoading = true;
          this._sourceIdle = false;
          // Un relevé affiché se relit ici aussi (#1288) : l'étape lue a pu
          // refuser un nouveau calcul pendant l'essai — ce qu'elle garde ne
          // répond plus à ce qu'on lui demande.
          this._refreshStale();
          this.requestUpdate();
        },
        onError: (error) => {
          this._sourceError = error;
          this._sourceLoading = false;
          this._sourceIdle = false;
          // Le relevé se juge AVANT le hook d'erreur (#1288) : l'hôte y lit
          // déjà s'il garde ses chiffres. Rejugé à chaque échec — la cause ou
          // la requête ont pu changer depuis le précédent.
          this._clearStaleTimer();
          this._sourceStale = readStaleReading(source);
          this.onSourceError(error);
          if (this._sourceStale) {
            this._armStaleTimer();
            this.onSourceStale(this._sourceStale);
          }
          this.requestUpdate();
        },
        // Retour en attente (#690) : l'état dérivé de l'hôte est purgé par
        // onSourceReset — sinon un graphique garderait les lignes du filtre
        // qu'on vient de retirer, sous un message « choisissez un filtre ».
        onIdle: () => {
          this._sourceIdle = true;
          this._sourceLoading = false;
          this._sourceError = null;
          this._sourceData = null;
          this._dropStale();
          this.onSourceReset();
          this.requestUpdate();
        },
      });
    }

    private _cleanupSubscription() {
      if (this._unsubscribeSource) {
        this._unsubscribeSource();
        this._unsubscribeSource = null;
      }
    }
  }

  return SourceSubscriberElement as unknown as Constructor<SourceSubscriberInterface> & T;
}
