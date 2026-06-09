/**
 * TransformerMixin — pattern unifié des transformateurs du pipeline (#280).
 *
 * Les six composants-tuyaux (query, join, unpivot, normalize, facets, search)
 * recodaient abonnement + cache initial + cleanup à la main, avec des
 * divergences réelles : query ne réinitialisait jamais son erreur après un
 * succès, normalize/unpivot n'avaient ni état erreur ni loading, facets et
 * search fuyaient leur abonnement quand `source` était vidé au runtime
 * (early-return avant cleanup).
 *
 * Le mixin couvre :
 * - l'abonnement aux sources amont (multi-sources pour join) avec lecture du
 *   cache initial (hook de veto pour query, #276) ;
 * - la re-souscription via `reinitTransformer()` — cleanup TOUJOURS en
 *   premier, même si la nouvelle config est invalide ;
 * - les états loading/error avec les contrats publics `isLoading()` /
 *   `getError()` identiques partout ; l'erreur est remise à null à chaque
 *   succès ;
 * - la ré-émission aval : meta de pagination posée AVANT `dispatchDataLoaded`
 *   (#282 — `document.dispatchEvent` est synchrone, l'aval lirait sinon la
 *   meta du batch précédent) ;
 * - le relais des commandes aval (page, where, orderBy) vers l'amont
 *   (cible relue à chaque commande — join relaie vers sa source gauche) ;
 * - la validation de configuration via `reportConfigError`.
 *
 * L'hôte garde sa logique métier dans les hooks `onTransformerData`,
 * `beforeTransformerSubscribe` et `transformMeta`.
 *
 * Distinct de `SourceSubscriberMixin` (réservé aux composants d'AFFICHAGE,
 * feuilles du pipeline) : un transformateur ré-émet sous son propre id et
 * relaie des commandes, un afficheur consomme.
 */
import type { LitElement } from 'lit';
import {
  subscribeToSource,
  getDataCache,
  getDataMeta,
  setDataMeta,
  dispatchDataLoaded,
  dispatchDataError,
  dispatchDataLoading,
  dispatchSourceCommand,
  subscribeToSourceCommands,
  clearDataCache,
  clearDataMeta,
  type PaginationMeta,
} from './data-bridge.js';
import { reportConfigError, clearConfigError } from './config-error.js';

// Pattern Lit mixin canonique : le constructor doit être callable avec
// n'importe quels args pour permettre le chaînage `class extends mixin(Parent)`.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- any[] est le pattern canonique des mixins Lit
type Constructor<T = object> = new (...args: any[]) => T;

export interface TransformerInterface {
  isLoading(): boolean;
  getError(): Error | null;
  reinitTransformer(): void;
  emitTransformedData(data: unknown): void;
  emitTransformerError(error: Error): void;
  emitTransformerLoading(): void;
}

export function TransformerMixin<T extends Constructor<LitElement>>(superClass: T) {
  class TransformerElement extends superClass {
    /** État de chargement (contrat public via isLoading()) */
    _transformerLoading = false;

    /** Dernière erreur amont/traitement (contrat public via getError()) */
    _transformerError: Error | null = null;

    /** Désabonnements des sources amont (1 par source, join en a 2) */
    _transformerUnsubs: Array<() => void> = [];

    /** Désabonnement du relais de commandes */
    _transformerUnsubCommands: (() => void) | null = null;

    /**
     * Premier willUpdate (cycle de montage Lit) déjà consommé (#281).
     * Au montage, TOUTES les props posées figurent dans changedProperties :
     * sans ce flag, l'init de connectedCallback était immédiatement suivie
     * d'une re-init (double abonnement, double lecture du cache, double
     * émission, double négociation serveur).
     */
    protected _transformerMountCycleDone = false;

    // --- Hooks à surcharger par l'hôte ---

    /** Nom du composant pour les messages d'erreur (défaut : tag name) */
    protected transformerName(): string {
      return this.tagName ? this.tagName.toLowerCase() : 'dsfr-data-transformer';
    }

    /** IDs des sources amont à écouter (join : [left, right]) */
    protected transformerSources(): string[] {
      const source = (this as unknown as { source?: string }).source;
      return source ? [source] : [];
    }

    /**
     * Cible du relais de commandes aval → amont (join : la source gauche).
     * Relue à CHAQUE commande (pas capturée à l'abonnement). null = pas de relais.
     */
    protected transformerCommandTarget(): string | null {
      return (this as unknown as { source?: string }).source || null;
    }

    /** Message d'erreur de configuration bloquante, ou null si valide */
    protected validateTransformerConfig(): string | null {
      if (!this.id) return 'attribut "id" requis pour identifier la sortie';
      if (this.transformerSources().length === 0) return 'attribut "source" requis';
      return null;
    }

    /** Appelé après validation, avant abonnement (query : négociation serveur) */
    protected beforeTransformerSubscribe(): void {
      // défaut : no-op
    }

    /**
     * Props dont le changement déclenche une re-souscription complète
     * (reinitTransformer). Query y ajoute ses props de requête, join déclare
     * [left, right, on].
     */
    protected transformerReinitProps(): string[] {
      return ['source'];
    }

    /**
     * Props dont le changement déclenche un retraitement local
     * (onTransformerReprocess) SANS re-souscription — paramètres de
     * transformation (colonnes d'unpivot, règles de normalize, type de
     * join…).
     */
    protected transformerReprocessProps(): string[] {
      return [];
    }

    /** Retraitement local quand une reprocess-prop change (hors montage) */
    protected onTransformerReprocess(): void {
      // défaut : no-op
    }

    /**
     * Autorise la lecture du cache à l'abonnement. Query refuse entre une
     * commande envoyée et l'émission suivante — cache périmé (#276).
     */
    protected shouldReadInitialCache(_sourceId: string): boolean {
      return true;
    }

    /**
     * Traitement des données amont — l'hôte transforme puis appelle
     * emitTransformedData(). sourceIndex = position dans transformerSources()
     * (join : 0 = left, 1 = right).
     */
    protected onTransformerData(_data: unknown, _sourceId: string, _sourceIndex: number): void {
      // à implémenter par l'hôte
    }

    /**
     * Transformation de la meta amont avant pass-through (#282).
     * Défaut : pass-through tel quel. Retourner null = pas de meta aval.
     * Les transformateurs qui changent le nombre de lignes (unpivot, join)
     * doivent invalider `total`.
     */
    protected transformMeta(meta: PaginationMeta): PaginationMeta | null {
      return meta;
    }

    // --- Contrats publics (identiques sur les 6 transformateurs, #280) ---

    public isLoading(): boolean {
      return this._transformerLoading;
    }

    public getError(): Error | null {
      return this._transformerError;
    }

    // --- Orchestration ---

    /**
     * (Re)branche le transformateur : cleanup, validation, hook
     * pré-abonnement, lecture des caches, abonnements, relais de commandes.
     */
    public reinitTransformer(): void {
      // Cleanup TOUJOURS en premier — une config devenue invalide (source
      // vidée au runtime) ne doit pas laisser l'ancien abonnement vivant
      // (fuite historique de facets/search).
      this._cleanup();

      const error = this.validateTransformerConfig();
      if (error) {
        const name = this.transformerName();
        reportConfigError(this, this.id ? `${name}[${this.id}]` : name, error);
        return;
      }
      clearConfigError(this);

      this.beforeTransformerSubscribe();

      this.transformerSources().forEach((sourceId, index) => {
        // Lecture du cache avant abonnement (évite la race si la source a
        // déjà émis), sauf veto de l'hôte
        if (this.shouldReadInitialCache(sourceId)) {
          const cached = getDataCache(sourceId);
          if (cached !== undefined) {
            this.onTransformerData(cached, sourceId, index);
          }
        }

        this._transformerUnsubs.push(
          subscribeToSource(sourceId, {
            onLoaded: (data: unknown) => {
              this._transformerLoading = false;
              // Une émission réussie efface l'erreur précédente — query ne
              // le faisait jamais (#280)
              this._transformerError = null;
              this.onTransformerData(data, sourceId, index);
              this.requestUpdate();
            },
            onLoading: () => this.emitTransformerLoading(),
            onError: (err: Error) => this.emitTransformerError(err),
          })
        );
      });

      if (this.id && this.transformerCommandTarget()) {
        this._transformerUnsubCommands = subscribeToSourceCommands(this.id, (cmd) => {
          const target = this.transformerCommandTarget();
          if (target) dispatchSourceCommand(target, cmd);
        });
      }
    }

    /**
     * Émission aval : meta posée AVANT le dispatch (#282), états remis à
     * plat. La meta amont (première source) passe par transformMeta().
     */
    public emitTransformedData(data: unknown): void {
      if (!this.id) return;
      this._transformerLoading = false;
      this._transformerError = null;

      const primary = this.transformerSources()[0];
      const upstreamMeta = primary ? getDataMeta(primary) : undefined;
      if (upstreamMeta) {
        const meta = this.transformMeta(upstreamMeta);
        if (meta) setDataMeta(this.id, meta);
      }

      dispatchDataLoaded(this.id, data);
      this.requestUpdate();
    }

    /** Erreur amont ou de traitement : état + propagation aval */
    public emitTransformerError(error: Error): void {
      this._transformerError = error;
      this._transformerLoading = false;
      if (this.id) dispatchDataError(this.id, error);
      this.requestUpdate();
    }

    /** Chargement : état + propagation aval */
    public emitTransformerLoading(): void {
      this._transformerLoading = true;
      if (this.id) dispatchDataLoading(this.id);
      this.requestUpdate();
    }

    /**
     * Init unique au montage (#281) : connectedCallback est le SEUL point
     * d'init — le premier willUpdate est consommé sans re-init. Gère aussi
     * le re-attach DOM (Lit ne re-déclenche pas willUpdate à la reconnexion,
     * un transformateur déplacé restait mort).
     */
    connectedCallback() {
      super.connectedCallback();
      this.reinitTransformer();
    }

    willUpdate(changedProperties: Map<PropertyKey, unknown>) {
      super.willUpdate(changedProperties);

      // Cycle de montage : l'init a déjà eu lieu dans connectedCallback (#281)
      if (!this._transformerMountCycleDone) {
        this._transformerMountCycleDone = true;
        return;
      }

      if (this.transformerReinitProps().some((p) => changedProperties.has(p))) {
        this.reinitTransformer();
        return;
      }

      if (this.transformerReprocessProps().some((p) => changedProperties.has(p))) {
        this.onTransformerReprocess();
      }
    }

    disconnectedCallback() {
      super.disconnectedCallback();
      this._cleanup();
      if (this.id) {
        clearDataCache(this.id);
        clearDataMeta(this.id);
      }
    }

    /** Désabonne tout (sources + commandes). Surchargeable pour teardown additionnel. */
    protected _cleanup(): void {
      for (const unsub of this._transformerUnsubs) unsub();
      this._transformerUnsubs = [];
      if (this._transformerUnsubCommands) {
        this._transformerUnsubCommands();
        this._transformerUnsubCommands = null;
      }
    }
  }

  return TransformerElement as unknown as Constructor<TransformerInterface> & T;
}
