import { LitElement, html } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { performUnpivot } from '@dsfr-data/shared/lib';
import type { UnpivotOptions } from '@dsfr-data/shared/lib';
import { sendWidgetBeacon } from '../utils/beacon.js';
import { getDataCache, type PaginationMeta } from '../utils/data-bridge.js';
import { TransformerMixin } from '../utils/transformer-mixin.js';
import type { SourceElement } from '../utils/source-element.js';

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
export class DsfrDataUnpivot extends TransformerMixin(LitElement) {
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

  protected createRenderRoot(): HTMLElement | DocumentFragment {
    return this;
  }

  render() {
    return html``;
  }

  connectedCallback() {
    super.connectedCallback();
    sendWidgetBeacon('dsfr-data-unpivot');
  }

  // --- Public API ---

  // --- Delegation amont (SourceElement, #274) ---

  /**
   * Retourne l'adapter de la source amont (delegation transparente).
   * Permet aux composants en aval (dsfr-data-facets, dsfr-data-search)
   * d'atteindre l'adapter a travers ce transformateur.
   */
  public getAdapter(): import('../adapters/api-adapter.js').ApiAdapter | null {
    if (this.source) {
      const sourceEl = document.getElementById(this.source);
      if (sourceEl && 'getAdapter' in sourceEl) {
        return (sourceEl as unknown as SourceElement).getAdapter();
      }
    }
    return null;
  }

  /** Retourne le where effectif de la source amont (delegation transparente). */
  public getEffectiveWhere(excludeKey?: string): string {
    if (this.source) {
      const sourceEl = document.getElementById(this.source);
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
    if (this.source) {
      const sourceEl = document.getElementById(this.source);
      if (sourceEl && 'getAdapterParams' in sourceEl) {
        return (sourceEl as unknown as SourceElement).getAdapterParams?.() ?? null;
      }
    }
    return null;
  }

  /**
   * L'unpivot crée toujours des colonnes (var-name/value-name) et supprime
   * les colonnes dépliées : le schéma aval ne correspond jamais au schéma
   * de la source qui fetch (#394). Une query en aval ne doit donc jamais
   * déléguer ses opérations (order-by…) au serveur à travers ce composant.
   */
  public transformsSchema(): boolean {
    return true;
  }

  getData(): Row[] {
    return this._data;
  }

  // --- Hooks TransformerMixin (#280) ---

  protected transformerName(): string {
    return 'dsfr-data-unpivot';
  }

  protected onTransformerData(data: unknown): void {
    this._processData(data);
  }

  /**
   * Meta amont propagee avec `total` invalide (#282) : l'unpivot change le
   * nombre de lignes, mais needsClientProcessing/serverSide doivent suivre
   * — un query aval d'un unpivot sur fallback Grist sautait son traitement
   * client sur des donnees brutes.
   */
  protected transformMeta(meta: PaginationMeta): PaginationMeta {
    return { ...meta, total: undefined };
  }

  /** Parametres d'unpivot → retraitement des donnees en cache (#281) */
  protected transformerReprocessProps(): string[] {
    return [
      'idCols',
      'valueCols',
      'valueColsPattern',
      'varName',
      'varFormat',
      'valueName',
      'dropEmpty',
    ];
  }

  protected onTransformerReprocess(): void {
    const cachedData = this.source ? getDataCache(this.source) : undefined;
    if (cachedData !== undefined) {
      this._processData(cachedData);
    }
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
      this.emitTransformerLoading();
      const rows = Array.isArray(rawData) ? (rawData as Row[]) : [rawData as Row];
      this._data = performUnpivot(rows, this._buildOptions());
      this.emitTransformedData(this._data);
    } catch (error) {
      this.emitTransformerError(error as Error);
      console.error(`dsfr-data-unpivot[${this.id}]: Erreur de dépivotage`, error);
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'dsfr-data-unpivot': DsfrDataUnpivot;
  }
}
