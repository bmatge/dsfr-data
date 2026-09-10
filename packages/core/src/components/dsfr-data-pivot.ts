import { LitElement, html } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import {
  performPivot,
  parsePivotLabels,
  isPivotAggregate,
  PivotError,
  PIVOT_AGGREGATES,
  PIVOT_DEFAULT_MAX_COLUMNS,
} from '@dsfr-data/shared/lib';
import type { PivotOptions, PivotStats, PivotAggregate } from '@dsfr-data/shared/lib';
import { sendWidgetBeacon } from '../utils/beacon.js';
import { getDataCache, type PaginationMeta } from '../utils/data-bridge.js';
import { TransformerMixin } from '../utils/transformer-mixin.js';
import { reportConfigError, clearConfigError } from '../utils/config-error.js';
import type { SourceElement } from '../utils/source-element.js';

type Row = Record<string, unknown>;

/**
 * <dsfr-data-pivot> — Replie un tableau « long » en tableau « wide » (tableau croisé)
 *
 * Transformateur pur (frère de dsfr-data-query / dsfr-data-join / dsfr-data-unpivot,
 * aucun fetch HTTP), symétrique exact de dsfr-data-unpivot (#255). Une ligne par
 * valeur distincte de `row`, une colonne par valeur distincte de `column`, et dans
 * chaque cellule l'agrégat (`aggregate`, `sum` par défaut) des valeurs de `value`.
 *
 * Une cellule sans observation vaut `null`, jamais 0 (#301). Toutes les lignes
 * émises portent toutes les colonnes générées : un `dsfr-data-list` en aval sans
 * attribut `columns` dérive ses colonnes des données — elles suivent donc une
 * facette ou un filtre posé en amont (#640).
 *
 * Le schéma de sortie dépend des données. Pour des noms de colonnes sûrs dans un
 * `compute` (`annee_2023 - annee_2022`), utiliser `column-format="annee_{value}"`.
 * Au-delà de `max-columns` valeurs distinctes (50 par défaut), c'est une erreur de
 * configuration (`data-dsfr-config-error`) et non un tableau de 10 000 colonnes.
 *
 * @example
 * <dsfr-data-source id="long" data='[
 *   {"commune":"Lyon","annee":2022,"montant":10},
 *   {"commune":"Lyon","annee":2023,"montant":12},
 *   {"commune":"Nice","annee":2022,"montant":7}
 * ]'></dsfr-data-source>
 * <dsfr-data-pivot id="wide" source="long"
 *   row="commune" column="annee" value="montant" aggregate="sum"
 *   column-format="annee_{value}">
 * </dsfr-data-pivot>
 * <dsfr-data-normalize id="ecart" source="wide"
 *   compute="ecart = annee_2023 - annee_2022">
 * </dsfr-data-normalize>
 * <dsfr-data-list source="ecart"></dsfr-data-list>
 */
@customElement('dsfr-data-pivot')
export class DsfrDataPivot extends TransformerMixin(LitElement) {
  /** ID de la source de données à écouter (format long : une observation par ligne). */
  @property({ type: String })
  source = '';

  /**
   * Champs formant l'identité de ligne, virgule-séparés : une ligne émise par
   * combinaison distincte. Ex : `"commune"` ou `"etab, dep"`.
   */
  @property({ type: String })
  row = '';

  /** Champ dont chaque valeur distincte devient une colonne. Ex : `"annee"`. */
  @property({ type: String })
  column = '';

  /** Champ dont les valeurs remplissent les cellules. Ex : `"montant"`. */
  @property({ type: String })
  value = '';

  /**
   * Réduction quand plusieurs lignes tombent dans la même cellule :
   * `sum` (défaut), `count`, `avg`, `min`, `max`, `first`, `last`.
   * Une cellule sans valeur numérique reste `null` (pas de 0 silencieux).
   */
  @property({ type: String })
  aggregate = 'sum';

  /**
   * Ordre des colonnes générées : vide = ordre d'apparition dans les données,
   * `asc` / `desc` = tri des valeurs (numérique si elles le sont toutes).
   */
  @property({ type: String, attribute: 'column-order' })
  columnOrder = '';

  /**
   * Gabarit des noms de colonnes générées, `{value}` = valeur brute.
   * Ex : `"annee_{value}"` donne `annee_2023` — un identifiant utilisable dans
   * `compute`. Défaut : la valeur brute (`2023`).
   */
  @property({ type: String, attribute: 'column-format' })
  columnFormat = '';

  /**
   * Libellés des colonnes générées, par valeur brute : `"2022:Année 2022 | 2023:Année 2023"`.
   * Une valeur libellée prend son libellé pour nom de colonne (prime sur column-format).
   * Un `:` ou `|` littéral s'échappe en `%3A` / `%7C`.
   */
  @property({ type: String })
  labels = '';

  /**
   * Plafond de colonnes générées (défaut 50). Au-delà, erreur de configuration
   * explicite : un pivot sur un champ à 10 000 valeurs distinctes est une erreur
   * de page, pas un tableau.
   */
  @property({ type: Number, attribute: 'max-columns' })
  maxColumns = PIVOT_DEFAULT_MAX_COLUMNS;

  @state()
  private _data: Row[] = [];

  /** Statistiques du dernier pivot (meta + trace, #604). */
  private _lastStats: PivotStats | null = null;

  /** Erreur de configuration détectée avant traitement (agrégat inconnu…). */
  private _configError: string | null = null;

  protected createRenderRoot(): HTMLElement | DocumentFragment {
    return this;
  }

  render() {
    return html``;
  }

  connectedCallback() {
    super.connectedCallback();
    sendWidgetBeacon('dsfr-data-pivot');
  }

  // --- Délégation amont (SourceElement, #274) ---

  /**
   * Retourne l'adapter de la source amont (délégation transparente), pour que
   * facets / search en aval atteignent l'adapter à travers ce transformateur.
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

  /** Retourne le where effectif de la source amont (délégation transparente). */
  public getEffectiveWhere(excludeKey?: string): string {
    if (this.source) {
      const sourceEl = document.getElementById(this.source);
      if (sourceEl && 'getEffectiveWhere' in sourceEl) {
        return (sourceEl as unknown as SourceElement).getEffectiveWhere(excludeKey);
      }
    }
    return '';
  }

  /** Retourne les paramètres adapter résolus de la source amont (délégation, #274). */
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
   * Le pivot fabrique ses colonnes à partir des données : le schéma aval ne
   * correspond jamais à celui de la source qui fetch (#394). Une query en aval
   * ne doit donc jamais déléguer ses opérations au serveur à travers lui.
   */
  public transformsSchema(): boolean {
    return true;
  }

  getData(): Row[] {
    return this._data;
  }

  /** Statistiques du dernier pivot (colonnes générées, cellules vides), ou null avant le premier. */
  public getPivotStats(): PivotStats | null {
    if (!this._lastStats) return null;
    return {
      ...this._lastStats,
      rowFields: [...this._lastStats.rowFields],
      columnNames: [...this._lastStats.columnNames],
    };
  }

  // --- Hooks TransformerMixin (#280) ---

  protected transformerName(): string {
    return 'dsfr-data-pivot';
  }

  /**
   * Validation de la configuration avant abonnement (#649) : l'erreur est
   * signalée ici (console + `data-dsfr-config-error`) et rendue en erreur aval
   * au traitement — jamais un tableau plausible en silence.
   */
  protected beforeTransformerSubscribe(): void {
    this._configError = this._validateConfig();
    if (this._configError) {
      reportConfigError(this, `dsfr-data-pivot[${this.id}]`, this._configError);
    }
  }

  protected onTransformerData(data: unknown): void {
    this._processData(data);
  }

  /**
   * Meta amont propagée avec `total` invalidé (#282, le pivot change le nombre
   * de lignes) et enrichie des statistiques du pivot (#604).
   */
  protected transformMeta(meta: PaginationMeta): PaginationMeta {
    const out: PaginationMeta = { ...meta, total: undefined };
    if (this._lastStats) out.pivot = this._lastStats;
    return out;
  }

  /** Sans meta amont (source inline), le pivot publie quand même ses statistiques. */
  protected transformerOwnMeta(): PaginationMeta | null {
    if (!this._lastStats) return null;
    return { page: 1, pageSize: 0, serverSide: false, pivot: this._lastStats };
  }

  /** Paramètres de pivot → retraitement des données en cache (#281). */
  protected transformerReprocessProps(): string[] {
    return [
      'row',
      'column',
      'value',
      'aggregate',
      'columnOrder',
      'columnFormat',
      'labels',
      'maxColumns',
    ];
  }

  protected onTransformerReprocess(): void {
    this._configError = this._validateConfig();
    if (this._configError) {
      reportConfigError(this, `dsfr-data-pivot[${this.id}]`, this._configError);
    } else {
      clearConfigError(this);
    }
    const cachedData = this.source ? getDataCache(this.source) : undefined;
    if (cachedData !== undefined) {
      this._processData(cachedData);
    }
  }

  // --- Interne ---

  private _validateConfig(): string | null {
    if (!this.row.trim()) return 'attribut "row" requis (champs formant l\'identité de ligne)';
    if (!this.column.trim()) {
      return 'attribut "column" requis (champ dont les valeurs deviennent des colonnes)';
    }
    if (!this.value.trim()) return 'attribut "value" requis (champ qui remplit les cellules)';
    const fn = this.aggregate.trim() || 'sum';
    if (!isPivotAggregate(fn)) {
      return (
        `aggregate="${this.aggregate}" : fonction d'agrégat "${fn}" inconnue — ` +
        `fonctions acceptées : ${PIVOT_AGGREGATES.join(', ')}`
      );
    }
    const order = this.columnOrder.trim();
    if (order && order !== 'asc' && order !== 'desc') {
      return `column-order="${this.columnOrder}" : valeurs acceptées : asc, desc (vide = ordre d'apparition)`;
    }
    if (!Number.isFinite(this.maxColumns) || this.maxColumns < 1) {
      return `max-columns="${String(this.maxColumns)}" : entier positif attendu`;
    }
    return null;
  }

  private _buildOptions(): PivotOptions {
    const order = this.columnOrder.trim();
    return {
      rowFields: this.row
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean),
      columnField: this.column.trim(),
      valueField: this.value.trim(),
      aggregate: (this.aggregate.trim() || 'sum') as PivotAggregate,
      columnOrder: order === 'asc' || order === 'desc' ? order : undefined,
      columnFormat: this.columnFormat || undefined,
      labels: this.labels ? parsePivotLabels(this.labels) : undefined,
      maxColumns: this.maxColumns,
    };
  }

  private _processData(rawData: unknown) {
    if (this._configError) {
      this.emitTransformerError(new Error(this._configError));
      return;
    }
    try {
      this.emitTransformerLoading();
      const rows = Array.isArray(rawData) ? (rawData as Row[]) : [rawData as Row];
      const { rows: pivoted, stats } = performPivot(rows, this._buildOptions());
      this._lastStats = stats;
      this._data = pivoted;
      // Un plafond dépassé sur un lot précédent peut être levé par un filtre amont.
      clearConfigError(this);
      this.emitTransformedData(this._data);
    } catch (error) {
      // Plafond de colonnes ou collision de noms : erreur de configuration
      // explicite (console + data-dsfr-config-error), jamais un tableau.
      if (error instanceof PivotError) {
        reportConfigError(this, `dsfr-data-pivot[${this.id}]`, error.message);
      } else {
        console.error(`dsfr-data-pivot[${this.id}]: Erreur de pivot`, error);
      }
      this._lastStats = null;
      this.emitTransformerError(error as Error);
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'dsfr-data-pivot': DsfrDataPivot;
  }
}
