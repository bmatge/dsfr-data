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

type Row = Record<string, unknown>;

export type JoinType = 'inner' | 'left' | 'right' | 'full';

interface JoinKey {
  left: string;
  right: string;
}

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
    this._initialize();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._cleanup();
    if (this.id) {
      clearDataCache(this.id);
    }
  }

  updated(changedProperties: Map<string, unknown>) {
    const joinProps = ['left', 'right', 'on', 'type', 'prefixLeft', 'prefixRight'];
    if (joinProps.some(prop => changedProperties.has(prop))) {
      this._initialize();
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
      }
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
      const keys = this._parseKeys();
      const result = this._performJoin(this._leftData, this._rightData, keys);
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

  /**
   * Parse l'attribut `on` en tableau de JoinKey.
   * Formats supportés :
   * - "code_dept" → [{ left: "code_dept", right: "code_dept" }]
   * - "dept_code=code" → [{ left: "dept_code", right: "code" }]
   * - "annee,code_region" → [{ left: "annee", right: "annee" }, { left: "code_region", right: "code_region" }]
   */
  _parseKeys(): JoinKey[] {
    return this.on.split(',').map(part => {
      const trimmed = part.trim();
      const eqIndex = trimmed.indexOf('=');
      if (eqIndex > 0) {
        return {
          left: trimmed.substring(0, eqIndex).trim(),
          right: trimmed.substring(eqIndex + 1).trim(),
        };
      }
      return { left: trimmed, right: trimmed };
    });
  }

  /**
   * Construit la clé composite pour l'indexation.
   */
  private _buildKey(row: Row, fields: string[]): string {
    return fields.map(f => String(row[f] ?? '')).join('|');
  }

  /**
   * Détecte les champs en collision entre left et right (hors clés de jointure).
   */
  private _detectCollisions(leftRow: Row | null, rightRow: Row | null, joinKeyFields: Set<string>): Set<string> {
    if (!leftRow || !rightRow) return new Set();
    const leftFields = new Set(Object.keys(leftRow));
    const collisions = new Set<string>();
    for (const field of Object.keys(rightRow)) {
      if (leftFields.has(field) && !joinKeyFields.has(field)) {
        collisions.add(field);
      }
    }
    return collisions;
  }

  /**
   * Fusionne une ligne gauche et une ligne droite.
   * Les clés de jointure ne sont pas dupliquées.
   * Les champs en collision reçoivent les préfixes configurés.
   */
  _mergeRow(
    leftRow: Row | null,
    rightRow: Row | null,
    keys: JoinKey[],
    collisions: Set<string>
  ): Row {
    const result: Row = {};

    // Ajouter les champs gauche
    if (leftRow) {
      for (const [field, value] of Object.entries(leftRow)) {
        const key = collisions.has(field) && this.prefixLeft
          ? `${this.prefixLeft}${field}` : field;
        result[key] = value;
      }
    }

    // Ajouter les champs droite
    const rightKeyFields = new Set(keys.map(k => k.right));
    if (rightRow) {
      for (const [field, value] of Object.entries(rightRow)) {
        // Ne pas dupliquer les clés de jointure
        if (rightKeyFields.has(field)) {
          // Si la ligne gauche est null, on ajoute la clé depuis la droite
          const leftKeyField = keys.find(k => k.right === field)!.left;
          if (!leftRow) {
            result[leftKeyField] = value;
          }
          continue;
        }
        const key = collisions.has(field)
          ? `${this.prefixRight}${field}` : field;
        result[key] = value;
      }
    }

    // Pour un left join sans correspondance droite,
    // ajouter les champs droite manquants comme null
    // (on ne connaît pas les champs droite sans au moins une ligne de référence)

    return result;
  }

  /**
   * Effectue la jointure selon le type configuré. Algorithme O(n+m) via Map.
   */
  _performJoin(leftData: Row[], rightData: Row[], keys: JoinKey[]): Row[] {
    const leftKeyFields = keys.map(k => k.left);
    const rightKeyFields = keys.map(k => k.right);
    const joinKeyFieldSet = new Set([...leftKeyFields, ...rightKeyFields]);

    // Détecter les collisions une seule fois
    const collisions = this._detectCollisions(
      leftData[0] ?? null,
      rightData[0] ?? null,
      joinKeyFieldSet
    );

    // Indexer la source droite par clé
    const rightIndex = new Map<string, Row[]>();
    for (const row of rightData) {
      const k = this._buildKey(row, rightKeyFields);
      if (!rightIndex.has(k)) rightIndex.set(k, []);
      rightIndex.get(k)!.push(row);
    }

    const result: Row[] = [];
    const joinType = this.type;

    if (joinType === 'inner' || joinType === 'left') {
      // Parcourir la gauche, chercher les correspondances droite
      for (const leftRow of leftData) {
        const k = this._buildKey(leftRow, leftKeyFields);
        const matches = rightIndex.get(k);
        if (matches) {
          for (const rightRow of matches) {
            result.push(this._mergeRow(leftRow, rightRow, keys, collisions));
          }
        } else if (joinType === 'left') {
          result.push(this._mergeRow(leftRow, null, keys, collisions));
        }
      }
    } else if (joinType === 'right') {
      // Indexer la gauche, parcourir la droite
      const leftIndex = new Map<string, Row[]>();
      for (const row of leftData) {
        const k = this._buildKey(row, leftKeyFields);
        if (!leftIndex.has(k)) leftIndex.set(k, []);
        leftIndex.get(k)!.push(row);
      }
      for (const rightRow of rightData) {
        const k = this._buildKey(rightRow, rightKeyFields);
        const matches = leftIndex.get(k);
        if (matches) {
          for (const leftRow of matches) {
            result.push(this._mergeRow(leftRow, rightRow, keys, collisions));
          }
        } else {
          result.push(this._mergeRow(null, rightRow, keys, collisions));
        }
      }
    } else if (joinType === 'full') {
      // Full outer join
      const matchedRightKeys = new Set<string>();
      for (const leftRow of leftData) {
        const k = this._buildKey(leftRow, leftKeyFields);
        const matches = rightIndex.get(k);
        if (matches) {
          matchedRightKeys.add(k);
          for (const rightRow of matches) {
            result.push(this._mergeRow(leftRow, rightRow, keys, collisions));
          }
        } else {
          result.push(this._mergeRow(leftRow, null, keys, collisions));
        }
      }
      // Lignes droite sans correspondance gauche
      for (const rightRow of rightData) {
        const k = this._buildKey(rightRow, rightKeyFields);
        if (!matchedRightKeys.has(k)) {
          result.push(this._mergeRow(null, rightRow, keys, collisions));
        }
      }
    }

    return result;
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
