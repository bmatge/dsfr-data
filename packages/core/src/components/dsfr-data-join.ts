import { LitElement, html } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { sendWidgetBeacon } from '../utils/beacon.js';
import {
  dispatchDataLoaded,
  dispatchDataError,
  dispatchDataLoading,
  clearDataCache,
  subscribeToSource,
  getDataCache,
} from '../utils/data-bridge.js';
import { performJoin } from '@dsfr-data/shared';
import type { JoinType } from '@dsfr-data/shared';

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
export class DsfrDataJoin extends LitElement {
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
  private _loading = false;

  @state()
  private _error: Error | null = null;

  @state()
  private _data: Row[] = [];

  private _leftData: Row[] | null = null;
  private _rightData: Row[] | null = null;
  private _unsubscribeLeft: (() => void) | null = null;
  private _unsubscribeRight: (() => void) | null = null;

  protected createRenderRoot(): HTMLElement | DocumentFragment {
    return this;
  }

  render() {
    return html``;
  }

  connectedCallback() {
    super.connectedCallback();
    sendWidgetBeacon('dsfr-data-join');
    // Initialization is handled in updated() to avoid double-init with Lit lifecycle.
    // Lit's first update fires as a microtask right after connectedCallback,
    // and that updated() call will trigger _initialize() when it sees left/right/on
    // in changedProperties. This prevents the double-subscribe + reset bug
    // that can cause the join to miss source data.
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._cleanup();
    if (this.id) {
      clearDataCache(this.id);
    }
  }

  willUpdate(changedProperties: Map<string, unknown>) {
    super.willUpdate(changedProperties);

    // Source identity changed → full re-subscribe
    const sourceChanged =
      changedProperties.has('left') ||
      changedProperties.has('right') ||
      changedProperties.has('on');
    if (sourceChanged) {
      this._initialize();
      return;
    }

    // Only join parameters changed (type, prefix) → re-compute with existing data
    const paramChanged =
      changedProperties.has('type') ||
      changedProperties.has('prefixLeft') ||
      changedProperties.has('prefixRight');
    if (paramChanged && this._leftData !== null && this._rightData !== null) {
      this._tryJoin();
    }
  }

  // --- Public API ---

  getData(): Row[] {
    return this._data;
  }

  isLoading(): boolean {
    return this._loading;
  }

  getError(): Error | null {
    return this._error;
  }

  // --- Initialization ---

  private _initialize() {
    this._cleanup();

    if (!this.left || !this.right || !this.on) {
      return;
    }

    this._leftData = null;
    this._rightData = null;
    this._loading = true;
    dispatchDataLoading(this.id);

    this._subscribeToSource('left');
    this._subscribeToSource('right');
  }

  private _subscribeToSource(side: 'left' | 'right') {
    const sourceId = side === 'left' ? this.left : this.right;

    // Check cache first
    const cachedData = getDataCache(sourceId);
    if (cachedData !== undefined) {
      const rows = this._toRows(cachedData);
      if (side === 'left') {
        this._leftData = rows;
      } else {
        this._rightData = rows;
      }
      this._tryJoin();
    }

    const unsubscribe = subscribeToSource(sourceId, {
      onLoaded: (data: unknown) => {
        const rows = this._toRows(data);
        if (side === 'left') {
          this._leftData = rows;
        } else {
          this._rightData = rows;
        }
        this._tryJoin();
      },
      onLoading: () => {
        this._loading = true;
        dispatchDataLoading(this.id);
      },
      onError: (error: Error) => {
        this._error = error;
        this._loading = false;
        dispatchDataError(this.id, error);
      },
    });

    if (side === 'left') {
      this._unsubscribeLeft = unsubscribe;
    } else {
      this._unsubscribeRight = unsubscribe;
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
      this._error = null;
      this._loading = false;
      dispatchDataLoaded(this.id, this._data);
    } catch (error) {
      this._error = error as Error;
      this._loading = false;
      dispatchDataError(this.id, this._error);
      console.error(`dsfr-data-join[${this.id}]: Erreur de jointure`, error);
    }
  }

  // --- Cleanup ---

  private _cleanup() {
    if (this._unsubscribeLeft) {
      this._unsubscribeLeft();
      this._unsubscribeLeft = null;
    }
    if (this._unsubscribeRight) {
      this._unsubscribeRight();
      this._unsubscribeRight = null;
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'dsfr-data-join': DsfrDataJoin;
  }
}
