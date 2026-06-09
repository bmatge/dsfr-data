import { LitElement, html } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { sendWidgetBeacon } from '../utils/beacon.js';
import { performJoin } from '@dsfr-data/shared/lib';
import type { JoinType } from '@dsfr-data/shared/lib';
import { TransformerMixin } from '../utils/transformer-mixin.js';
import type { PaginationMeta } from '../utils/data-bridge.js';
import type { SourceElement } from '../utils/source-element.js';

type Row = Record<string, unknown>;

export type { JoinType };

/**
 * <dsfr-data-join> — Jointure multi-sources autour d'une clé pivot
 *
 * Souscrit à deux sources (via le data-bridge), attend que chacune ait
 * produit ses données, les joint en mémoire sur une ou plusieurs clés pivot,
 * puis émet un événement `dsfr-data-loaded` avec le jeu de données fusionné.
 *
 * Ne fait aucun fetch HTTP — c'est un pur transformateur de données.
 *
 * @example
 * <dsfr-data-source id="pop" api-type="opendatasoft"
 *   dataset-id="population-dept" base-url="https://data.economie.gouv.fr">
 * </dsfr-data-source>
 * <dsfr-data-source id="budget" api-type="tabular"
 *   resource="abc123-budget-dept">
 * </dsfr-data-source>
 * <dsfr-data-join id="enriched"
 *   left="pop" right="budget"
 *   on="code_dept" type="left"
 *   prefix-right="budget_">
 * </dsfr-data-join>
 * <dsfr-data-chart source="enriched" type="bar"
 *   label-field="nom_dept" value-field="budget_montant">
 * </dsfr-data-chart>
 */
@customElement('dsfr-data-join')
export class DsfrDataJoin extends TransformerMixin(LitElement) {
  /**
   * ID de la source gauche (source principale)
   */
  @property({ type: String })
  left = '';

  /**
   * ID de la source droite
   */
  @property({ type: String })
  right = '';

  /**
   * Clé(s) de jointure.
   * - Clé commune : on="code_dept"
   * - Clé différente : on="dept_code=code" (gauche=droite)
   * - Multi-clé : on="annee,code_region"
   */
  @property({ type: String })
  on = '';

  /**
   * Type de jointure : inner | left | right | full
   */
  @property({ type: String })
  type: JoinType = 'left';

  /**
   * Préfixe pour les champs de la source gauche en cas de collision
   */
  @property({ type: String, attribute: 'prefix-left' })
  prefixLeft = '';

  /**
   * Préfixe pour les champs de la source droite en cas de collision
   */
  @property({ type: String, attribute: 'prefix-right' })
  prefixRight = 'right_';

  @state()
  private _data: Row[] = [];

  private _leftData: Row[] | null = null;
  private _rightData: Row[] | null = null;

  protected createRenderRoot(): HTMLElement | DocumentFragment {
    return this;
  }

  render() {
    return html``;
  }

  connectedCallback() {
    super.connectedCallback();
    sendWidgetBeacon('dsfr-data-join');
    // L'init unique au montage est geree par TransformerMixin (#281) — un
    // join sans attributs signale enfin sa config manquante (avant : si
    // left/right/on etaient tous vides, _initialize n'etait jamais appele,
    // echec 100 % silencieux).
  }

  // --- Public API ---

  // --- Delegation amont (SourceElement, #274) ---

  /**
   * Retourne l'adapter de la source GAUCHE (delegation transparente).
   * Coherent avec le relais des commandes (#272) : la gauche porte les lignes.
   * Permet aux composants en aval (dsfr-data-facets, dsfr-data-search)
   * d'atteindre l'adapter a travers ce transformateur.
   */
  public getAdapter(): import('../adapters/api-adapter.js').ApiAdapter | null {
    if (this.left) {
      const sourceEl = document.getElementById(this.left);
      if (sourceEl && 'getAdapter' in sourceEl) {
        return (sourceEl as unknown as SourceElement).getAdapter();
      }
    }
    return null;
  }

  /** Retourne le where effectif de la source amont (delegation transparente). */
  public getEffectiveWhere(excludeKey?: string): string {
    if (this.left) {
      const sourceEl = document.getElementById(this.left);
      if (sourceEl && 'getEffectiveWhere' in sourceEl) {
        return (sourceEl as unknown as SourceElement).getEffectiveWhere(excludeKey);
      }
    }
    return '';
  }

  /**
   * Retourne les parametres adapter resolus de la source amont
   * (delegation transparente, headers api-key-ref inclus — #274).
   */
  public getAdapterParams(): import('../adapters/api-adapter.js').AdapterParams | null {
    if (this.left) {
      const sourceEl = document.getElementById(this.left);
      if (sourceEl && 'getAdapterParams' in sourceEl) {
        return (sourceEl as unknown as SourceElement).getAdapterParams?.() ?? null;
      }
    }
    return null;
  }

  getData(): Row[] {
    return this._data;
  }

  // --- Hooks TransformerMixin (#280) ---

  protected transformerName(): string {
    return 'dsfr-data-join';
  }

  /** Deux sources amont : index 0 = left, index 1 = right */
  protected transformerSources(): string[] {
    return [this.left, this.right];
  }

  /**
   * Relaye les commandes aval (page, where, orderBy) vers la source GAUCHE,
   * porteuse des lignes principales du join — la droite est traitee comme
   * table de reference et n'est pas filtree/paginee (#272). Sans relais,
   * un dsfr-data-list pagine derriere un join perdait ses commandes.
   */
  protected transformerCommandTarget(): string | null {
    return this.left || null;
  }

  protected validateTransformerConfig(): string | null {
    if (!this.id) return 'attribut "id" requis pour identifier la sortie';
    if (!this.left || !this.right || !this.on) {
      const missing = [!this.left && 'left', !this.right && 'right', !this.on && 'on']
        .filter(Boolean)
        .join(', ');
      return `attribut(s) requis manquant(s) : ${missing}`;
    }
    return null;
  }

  protected beforeTransformerSubscribe(): void {
    this._leftData = null;
    this._rightData = null;
    this.emitTransformerLoading();
  }

  protected onTransformerData(data: unknown, _sourceId: string, sourceIndex: number): void {
    const rows = this._toRows(data);
    if (sourceIndex === 0) {
      this._leftData = rows;
    } else {
      this._rightData = rows;
    }
    this._tryJoin();
  }

  /**
   * Meta de la source GAUCHE propagee avec `total` invalide (#282) — la
   * gauche porte les lignes (coherent avec le relais de commandes #272),
   * et le join change le nombre de lignes.
   */
  protected transformMeta(meta: PaginationMeta): PaginationMeta {
    return { ...meta, total: undefined };
  }

  /** Changement d'identite des sources → re-souscription complete (#281) */
  protected transformerReinitProps(): string[] {
    return ['left', 'right', 'on'];
  }

  /** Parametres de jointure → recalcul avec les donnees deja recues (#281) */
  protected transformerReprocessProps(): string[] {
    return ['type', 'prefixLeft', 'prefixRight'];
  }

  protected onTransformerReprocess(): void {
    if (this._leftData !== null && this._rightData !== null) {
      this._tryJoin();
    }
  }

  private _toRows(data: unknown): Row[] {
    if (Array.isArray(data)) return data as Row[];
    if (data && typeof data === 'object') return [data as Row];
    return [];
  }

  // --- Join logic ---

  private _tryJoin() {
    if (this._leftData === null || this._rightData === null) {
      return; // Attendre les deux sources
    }

    try {
      const result = performJoin(this._leftData, this._rightData, {
        on: this.on,
        type: this.type,
        prefixLeft: this.prefixLeft,
        prefixRight: this.prefixRight,
      });
      this._data = result;
      this.emitTransformedData(this._data);
    } catch (error) {
      this.emitTransformerError(error as Error);
      console.error(`dsfr-data-join[${this.id}]: Erreur de jointure`, error);
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'dsfr-data-join': DsfrDataJoin;
  }
}
