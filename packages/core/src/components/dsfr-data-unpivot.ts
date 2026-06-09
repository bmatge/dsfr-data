import { LitElement, html } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { performUnpivot } from '@dsfr-data/shared/lib';
import type { UnpivotOptions } from '@dsfr-data/shared/lib';
import { sendWidgetBeacon } from '../utils/beacon.js';
import {
  dispatchDataLoaded,
  dispatchDataError,
  dispatchDataLoading,
  clearDataCache,
  subscribeToSource,
  getDataCache,
  subscribeToSourceCommands,
  dispatchSourceCommand,
} from '../utils/data-bridge.js';
import { reportConfigError, clearConfigError } from '../utils/config-error.js';

type Row = Record<string, unknown>;

/**
 * <dsfr-data-unpivot> — Bascule un tableau "wide" en "long/tidy"
 *
 * Transformateur pur (frère de dsfr-data-query / dsfr-data-join, aucun fetch HTTP).
 * Un tableau wide encode une dimension (souvent le temps) dans les NOMS de colonnes
 * (`c2023_01`, `c2023_02`, …). Ce composant les bascule en lignes pour que le pipeline
 * dsfr-data (qui suppose un format tidy : une observation par ligne) puisse les consommer.
 *
 * C'est l'inverse exact d'un pivot. La valeur est laissée brute — le typage est délégué
 * à dsfr-data-normalize (`numeric-auto`) en aval.
 *
 * @example
 * <dsfr-data-source id="grist_wide" api-type="grist"
 *   base-url="https://grist.numerique.gouv.fr" doc-id="…" table="Plan_Elec">
 * </dsfr-data-source>
 * <dsfr-data-unpivot id="tidy" source="grist_wide"
 *   id-cols="Indicateurs, Sous_theme"
 *   value-cols-pattern="c{YYYY}_{MM}"
 *   var-name="mois" var-format="{YYYY}-{MM}"
 *   value-name="valeur">
 * </dsfr-data-unpivot>
 * <dsfr-data-normalize id="prep" source="tidy" numeric-auto></dsfr-data-normalize>
 * <dsfr-data-chart source="prep" type="line" label-field="mois" value-field="valeur">
 * </dsfr-data-chart>
 */
@customElement('dsfr-data-unpivot')
export class DsfrDataUnpivot extends LitElement {
  /** ID de la source de données à écouter */
  @property({ type: String })
  source = '';

  /** Colonnes conservées telles quelles sur chaque ligne. Ex: "Indicateurs, Sous_theme" */
  @property({ type: String, attribute: 'id-cols' })
  idCols = '';

  /** Liste explicite des colonnes à déplier (virgule-séparée). Exclusif avec value-cols-pattern. */
  @property({ type: String, attribute: 'value-cols' })
  valueCols = '';

  /**
   * Motif des colonnes à déplier, avec placeholders `{TOKEN}`.
   * Tokens date à largeur fixe : YYYY (4 chiffres), YY/MM/DD/HH (2), Q (1).
   * Ex: "c{YYYY}_{MM}" matche `c2023_01`.
   */
  @property({ type: String, attribute: 'value-cols-pattern' })
  valueColsPattern = '';

  /** Nom de la nouvelle colonne "variable" (clé dépliée). Défaut: "variable". */
  @property({ type: String, attribute: 'var-name' })
  varName = '';

  /** Reformatage de la clé via les tokens du motif. Ex: "{YYYY}-{MM}" → `2023-01`. */
  @property({ type: String, attribute: 'var-format' })
  varFormat = '';

  /** Nom de la nouvelle colonne "valeur". Défaut: "value". */
  @property({ type: String, attribute: 'value-name' })
  valueName = '';

  /** Ne pas émettre de ligne quand la cellule dépliée est vide/null. */
  @property({ type: Boolean, attribute: 'drop-empty' })
  dropEmpty = false;

  @state()
  private _data: Row[] = [];

  private _unsubscribe: (() => void) | null = null;
  private _unsubscribeCommands: (() => void) | null = null;

  protected createRenderRoot(): HTMLElement | DocumentFragment {
    return this;
  }

  render() {
    return html``;
  }

  connectedCallback() {
    super.connectedCallback();
    sendWidgetBeacon('dsfr-data-unpivot');
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
    super.updated(changedProperties);

    // Source identity changed → re-subscribe
    if (changedProperties.has('source')) {
      this._initialize();
      return;
    }

    // Unpivot parameters changed → re-compute with existing data
    const paramAttrs = [
      'idCols',
      'valueCols',
      'valueColsPattern',
      'varName',
      'varFormat',
      'valueName',
      'dropEmpty',
    ];
    if (paramAttrs.some((attr) => changedProperties.has(attr))) {
      const cachedData = this.source ? getDataCache(this.source) : undefined;
      if (cachedData !== undefined) {
        this._processData(cachedData);
      }
    }
  }

  // --- Public API ---

  getData(): Row[] {
    return this._data;
  }

  // --- Initialization ---

  private _initialize() {
    this._cleanup();

    if (!this.id) {
      reportConfigError(
        this,
        'dsfr-data-unpivot',
        'attribut "id" requis pour identifier la sortie'
      );
      return;
    }
    if (!this.source) {
      reportConfigError(this, 'dsfr-data-unpivot', 'attribut "source" requis');
      return;
    }

    clearConfigError(this);

    // Cache check before subscribing (avoid race if source already emitted)
    const cachedData = getDataCache(this.source);
    if (cachedData !== undefined) {
      this._processData(cachedData);
    }

    this._unsubscribe = subscribeToSource(this.source, {
      onLoaded: (data: unknown) => this._processData(data),
      onLoading: () => dispatchDataLoading(this.id),
      onError: (error: Error) => dispatchDataError(this.id, error),
    });

    // Relay downstream commands (page, where, orderBy) to the upstream source.
    this._unsubscribeCommands = subscribeToSourceCommands(this.id, (cmd) => {
      dispatchSourceCommand(this.source, cmd);
    });
  }

  private _buildOptions(): UnpivotOptions {
    const splitList = (s: string): string[] =>
      s
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean);

    return {
      idCols: splitList(this.idCols),
      valueCols: this.valueCols ? splitList(this.valueCols) : undefined,
      valueColsPattern: this.valueColsPattern || undefined,
      varName: this.varName || undefined,
      varFormat: this.varFormat || undefined,
      valueName: this.valueName || undefined,
      dropEmpty: this.dropEmpty,
    };
  }

  private _processData(rawData: unknown) {
    try {
      dispatchDataLoading(this.id);
      const rows = Array.isArray(rawData) ? (rawData as Row[]) : [rawData as Row];
      this._data = performUnpivot(rows, this._buildOptions());
      dispatchDataLoaded(this.id, this._data);
    } catch (error) {
      dispatchDataError(this.id, error as Error);
      console.error(`dsfr-data-unpivot[${this.id}]: Erreur de dépivotage`, error);
    }
  }

  private _cleanup() {
    if (this._unsubscribe) {
      this._unsubscribe();
      this._unsubscribe = null;
    }
    if (this._unsubscribeCommands) {
      this._unsubscribeCommands();
      this._unsubscribeCommands = null;
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'dsfr-data-unpivot': DsfrDataUnpivot;
  }
}
