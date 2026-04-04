import { LitElement, html } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { SourceSubscriberMixin } from '../utils/source-subscriber.js';
import { getByPath } from '../utils/json-path.js';
import { sendWidgetBeacon } from '../utils/beacon.js';
import { escapeHtml } from '@dsfr-data/shared';
import { isValidDeptCode } from '@dsfr-data/shared';

type DSFRChartType =
  | 'line'
  | 'bar'
  | 'pie'
  | 'radar'
  | 'gauge'
  | 'scatter'
  | 'bar-line'
  | 'map'
  | 'map-reg';

let databoxAutoId = 0;

/** Maps chart type -> DSFR custom element tag name */
const CHART_TAG_MAP: Record<string, string> = {
  line: 'line-chart',
  bar: 'bar-chart',
  pie: 'pie-chart',
  radar: 'radar-chart',
  scatter: 'scatter-chart',
  gauge: 'gauge-chart',
  'bar-line': 'bar-line-chart',
  map: 'map-chart',
  'map-reg': 'map-chart-reg',
};

/**
 * <dsfr-data-chart> - Wrapper pour les composants DSFR Chart connecté à dsfr-data-source
 *
 * Ce composant utilise les graphiques officiels DSFR Chart et les connecte
 * au système de data-bridge pour une alimentation dynamique des données.
 *
 * @example
 * <dsfr-data-chart
 *   source="stats"
 *   type="bar"
 *   label-field="categorie"
 *   value-field="valeur"
 *   unit-tooltip="%"
 *   selected-palette="categorical">
 * </dsfr-data-chart>
 */
@customElement('dsfr-data-chart')
export class DsfrDataChart extends SourceSubscriberMixin(LitElement) {
  @property({ type: String })
  source = '';

  /** Type de graphique DSFR */
  @property({ type: String })
  type: DSFRChartType = 'bar';

  /** Chemin vers le champ label */
  @property({ type: String, attribute: 'label-field' })
  labelField = '';

  /** Chemin vers le champ code departement/region (map/map-reg, prioritaire sur label-field) */
  @property({ type: String, attribute: 'code-field' })
  codeField = '';

  /** Chemin vers le champ valeur */
  @property({ type: String, attribute: 'value-field' })
  valueField = '';

  /** Chemin vers un second champ de valeur (pour bar-line: y-bar) */
  @property({ type: String, attribute: 'value-field-2' })
  valueField2 = '';

  /** Champs de valeur supplementaires, separes par des virgules (ex: 'budget,score') */
  @property({ type: String, attribute: 'value-fields' })
  valueFields = '';

  /** Noms des séries (ex: '["Série 1", "Série 2"]') */
  @property({ type: String })
  name = '';

  /** Palette de couleurs */
  @property({ type: String, attribute: 'selected-palette' })
  selectedPalette = 'categorical';

  /** Unité à afficher dans les tooltips */
  @property({ type: String, attribute: 'unit-tooltip' })
  unitTooltip = '';

  /** Unité pour les barres (bar-line uniquement) */
  @property({ type: String, attribute: 'unit-tooltip-bar' })
  unitTooltipBar = '';

  /** Affichage horizontal (bar chart uniquement) */
  @property({ type: Boolean })
  horizontal = false;

  /** Barres empilées (bar chart uniquement) */
  @property({ type: Boolean })
  stacked = false;

  /** Remplir le graphique (pie chart: true = plein, false = donut) */
  @property({ type: Boolean })
  fill = false;

  /** Index des éléments à mettre en avant (ex: "[0, 2]") */
  @property({ type: String, attribute: 'highlight-index' })
  highlightIndex = '';

  @property({ type: String, attribute: 'x-min' })
  xMin = '';

  @property({ type: String, attribute: 'x-max' })
  xMax = '';

  @property({ type: String, attribute: 'y-min' })
  yMin = '';

  @property({ type: String, attribute: 'y-max' })
  yMax = '';

  /** Valeur pour la jauge (gauge chart uniquement) */
  @property({ type: Number, attribute: 'gauge-value' })
  gaugeValue: number | null = null;

  /** ID du département/région à mettre en avant (map chart) */
  @property({ type: String, attribute: 'map-highlight' })
  mapHighlight = '';

  /** Envelopper le chart dans une DataBox DSFR native */
  @property({ type: Boolean })
  databox = false;

  /** Titre affiché dans l'en-tête DataBox */
  @property({ type: String, attribute: 'databox-title' })
  databoxTitle = '';

  /** Mention de la source (ex: "INSEE, 2024") */
  @property({ type: String, attribute: 'databox-source' })
  databoxSource = '';

  /** Date de la donnée (ex: "Mars 2024") */
  @property({ type: String, attribute: 'databox-date' })
  databoxDate = '';

  /** Bouton téléchargement CSV dans DataBox */
  @property({ type: Boolean, attribute: 'databox-download' })
  databoxDownload = false;

  /** Bouton screenshot PNG */
  @property({ type: Boolean, attribute: 'databox-screenshot' })
  databoxScreenshot = false;

  /** Bouton plein écran */
  @property({ type: Boolean, attribute: 'databox-fullscreen' })
  databoxFullscreen = false;

  /** Badge tendance (ex: "+5.2", "-3.1") */
  @property({ type: String, attribute: 'databox-trend' })
  databoxTrend = '';

  /** Titre du tooltip info DataBox */
  @property({ type: String, attribute: 'databox-tooltip-title' })
  databoxTooltipTitle = '';

  /** Contenu du tooltip info DataBox */
  @property({ type: String, attribute: 'databox-tooltip-content' })
  databoxTooltipContent = '';

  /** Titre de la modale DataBox */
  @property({ type: String, attribute: 'databox-modal-title' })
  databoxModalTitle = '';

  /** Contenu de la modale DataBox */
  @property({ type: String, attribute: 'databox-modal-content' })
  databoxModalContent = '';

  /** Source par defaut dans le selecteur multi-source DataBox */
  @property({ type: String, attribute: 'databox-default-source' })
  databoxDefaultSource = '';

  /** Actions personnalisees DataBox (JSON array, ex: '["Source officielle","Pole emploi"]') */
  @property({ type: String, attribute: 'databox-actions' })
  databoxActions = '';

  @state()
  private _data: unknown[] = [];

  // Light DOM pour les styles DSFR
  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    sendWidgetBeacon('dsfr-data-chart', this.type);
  }

  onSourceData(data: unknown): void {
    this._data = Array.isArray(data) ? data : [];
    if (this.databox) {
      this._injectDataboxTable();
    }
  }

  // --- Data processing ---

  /** Parse all value field names (value-field, value-field-2, value-fields) */
  private _getAllValueFields(): string[] {
    const fields = [this.valueField];
    if (this.valueFields) {
      fields.push(
        ...this.valueFields
          .split(',')
          .map((f) => f.trim())
          .filter(Boolean)
      );
    } else if (this.valueField2) {
      fields.push(this.valueField2);
    }
    return fields;
  }

  private _processData(): {
    x: string;
    y: string;
    y2?: string;
    yMulti?: string;
    labels: string[];
    values: number[];
    values2: number[];
  } {
    if (!this._data || this._data.length === 0) {
      return { x: '[[]]', y: '[[]]', labels: [], values: [], values2: [] };
    }

    const allFields = this._getAllValueFields();
    const labels: string[] = [];
    const allSeries: number[][] = allFields.map(() => []);

    for (const record of this._data) {
      labels.push(String(getByPath(record, this.labelField) ?? 'N/A'));
      for (let i = 0; i < allFields.length; i++) {
        allSeries[i].push(Number(getByPath(record, allFields[i])) || 0);
      }
    }

    const values = allSeries[0] || [];
    const values2 = allSeries[1] || [];
    const hasMulti = allFields.length > 1;

    return {
      x: JSON.stringify([labels]),
      y: JSON.stringify([values]),
      y2: hasMulti ? JSON.stringify([values2]) : undefined,
      // Combined y with all series for multi-series charts (bar, line, radar)
      yMulti: hasMulti ? JSON.stringify(allSeries) : undefined,
      labels,
      values,
      values2,
    };
  }

  private _processMapData(): string {
    if (!this._data || this._data.length === 0) return '{}';

    const field = this.codeField || this.labelField;
    const mapData: Record<string, number> = {};
    for (const record of this._data) {
      let code = String(getByPath(record, field) ?? '').trim();
      // Pad numeric codes to 2 digits (e.g. "1" -> "01")
      if (/^\d+$/.test(code) && code.length < 3) {
        code = code.padStart(2, '0');
      }
      const value = Number(getByPath(record, this.valueField)) || 0;
      if (this.type === 'map' ? isValidDeptCode(code) : code !== '') {
        mapData[code] = Math.round(value * 100) / 100;
      }
    }
    return JSON.stringify(mapData);
  }

  // --- Attribute builders ---

  private _getCommonAttributes(): Record<string, string> {
    const attrs: Record<string, string> = {};

    if (this.selectedPalette) attrs['selected-palette'] = this.selectedPalette;
    if (this.unitTooltip) attrs['unit-tooltip'] = this.unitTooltip;
    if (this.xMin) attrs['x-min'] = this.xMin;
    if (this.xMax) attrs['x-max'] = this.xMax;
    if (this.yMin) attrs['y-min'] = this.yMin;
    if (this.yMax) attrs['y-max'] = this.yMax;

    if (this.name) {
      // DSFR Chart attend un tableau JSON pour name (ex: '["Série 1"]')
      // Si l'utilisateur passe une string simple, on l'enveloppe automatiquement
      const trimmed = this.name.trim();
      const isMap = this.type === 'map' || this.type === 'map-reg';
      attrs['name'] = isMap
        ? trimmed
        : trimmed.startsWith('[')
          ? trimmed
          : JSON.stringify([trimmed]);
    } else if (this.valueField) {
      const isMap = this.type === 'map' || this.type === 'map-reg';
      if (isMap) {
        attrs['name'] = this.valueField;
      } else {
        const allFields = this._getAllValueFields();
        attrs['name'] = JSON.stringify(allFields);
      }
    }

    return attrs;
  }

  private _getTypeSpecificAttributes(): {
    attrs: Record<string, string>;
    deferred: Record<string, string>;
  } {
    const { x, y, yMulti, labels, values, values2 } = this._processData();
    const attrs: Record<string, string> = {};
    const deferred: Record<string, string> = {};

    switch (this.type) {
      case 'gauge': {
        const gaugeVal =
          this.gaugeValue ??
          (this._data.length > 0 ? Number(getByPath(this._data[0], this.valueField)) || 0 : 0);
        attrs['percent'] = String(Math.round(gaugeVal));
        attrs['init'] = '0';
        attrs['target'] = '100';
        break;
      }
      case 'pie':
        attrs['x'] = x;
        attrs['y'] = y;
        // For pie charts, DSFR Chart expects one name per slice (category),
        // not one per series. Use labels as legend entries.
        if (!this.name && labels.length > 0) {
          attrs['name'] = JSON.stringify(labels);
        }
        break;
      case 'bar-line': {
        // DSFR BarLineChart expects flat arrays (not double-wrapped [[values]])
        // unlike BarChart which uses xparse[0] to unwrap.
        attrs['x'] = JSON.stringify(labels);
        attrs['y-bar'] = JSON.stringify(values);
        attrs['y-line'] = JSON.stringify(values2.length ? values2 : values);
        // BarLineChart uses name-bar/name-line (not name)
        if (this.name) {
          try {
            const trimmed = this.name.trim();
            const names: string[] = trimmed.startsWith('[') ? JSON.parse(trimmed) : [trimmed];
            if (names[0]) attrs['name-bar'] = names[0];
            if (names[1]) attrs['name-line'] = names[1];
          } catch {
            /* ignore parse errors */
          }
        }
        // BarLineChart uses unit-tooltip-bar / unit-tooltip-line (not unit-tooltip)
        if (this.unitTooltipBar) attrs['unit-tooltip-bar'] = this.unitTooltipBar;
        if (this.unitTooltip) attrs['unit-tooltip-line'] = this.unitTooltip;
        break;
      }
      case 'map':
      case 'map-reg': {
        // All map attributes go in `deferred` because the DSFR Chart Vue component
        // overwrites props set before mount with their default values.
        // Deferred attrs are applied via setTimeout(500ms) after Vue has mounted,
        // triggering the $props watcher which calls createChart() with correct data.
        deferred['data'] = this._processMapData();
        if (this._data.length > 0) {
          let total = 0;
          let count = 0;
          for (const record of this._data) {
            const v = Number(getByPath(record, this.valueField));
            if (!isNaN(v)) {
              total += v;
              count++;
            }
          }
          if (count > 0) {
            const avg = Math.round((total / count) * 100) / 100;
            deferred['value'] = String(avg);
          }
        }
        deferred['date'] = new Date().toISOString().split('T')[0];
        break;
      }
      default:
        attrs['x'] = x;
        // For bar/line/radar with a second series, combine both into y
        attrs['y'] = yMulti || y;
        break;
    }

    if (this.type === 'bar') {
      if (this.horizontal) attrs['horizontal'] = 'true';
      if (this.stacked) attrs['stacked'] = 'true';
      if (this.highlightIndex) attrs['highlight-index'] = this.highlightIndex;
    }
    if (this.type === 'pie' && this.fill) {
      attrs['fill'] = 'true';
    }
    if ((this.type === 'map' || this.type === 'map-reg') && this.mapHighlight) {
      attrs['highlight'] = this.mapHighlight;
    }

    return { attrs, deferred };
  }

  /**
   * Crée un élément DSFR Chart via DOM API (pas d'innerHTML)
   */
  private _getAriaLabel(): string {
    const typeLabels: Record<string, string> = {
      bar: 'barres',
      line: 'lignes',
      pie: 'camembert',
      radar: 'radar',
      gauge: 'jauge',
      scatter: 'nuage de points',
      'bar-line': 'barres et lignes',
      map: 'carte departements',
      'map-reg': 'carte regions',
    };
    const typeName = typeLabels[this.type] || this.type;
    const count = this._data.length;
    return `Graphique ${typeName}, ${count} valeurs`;
  }

  private _createRawChartElement(
    tagName: string,
    attributes: Record<string, string>,
    deferred: Record<string, string> = {}
  ) {
    const el = document.createElement(tagName);
    for (const [key, value] of Object.entries(attributes)) {
      if (value !== undefined && value !== '') {
        el.setAttribute(key, value);
      }
    }

    // DSFR Chart components are Vue-based web components that overwrite certain
    // attributes (value, date) with default prop values on mount.
    // We re-apply deferred attributes after Vue has mounted.
    if (Object.keys(deferred).length > 0) {
      setTimeout(() => {
        for (const [key, value] of Object.entries(deferred)) {
          el.setAttribute(key, value);
        }
      }, 500);
    }

    return el;
  }

  private _createChartElement(
    tagName: string,
    attributes: Record<string, string>,
    deferred: Record<string, string> = {}
  ) {
    const el = this._createRawChartElement(tagName, attributes, deferred);

    const wrapper = document.createElement('div');
    wrapper.className = 'dsfr-data-chart__wrapper';
    wrapper.setAttribute('role', 'img');
    wrapper.setAttribute('aria-label', this._getAriaLabel());
    wrapper.appendChild(el);
    return wrapper;
  }

  /** Creates a DataBox + chart as siblings in a wrapper div.
   *  DSFR DataBox discovers its chart via nextElementSibling or databox-id,
   *  so the chart must be a SIBLING of <data-box>, not a child. */
  private _createDataboxElement(
    tagName: string,
    attributes: Record<string, string>,
    deferred: Record<string, string> = {}
  ) {
    const databoxId = `databox-${this.id || `auto-${++databoxAutoId}`}`;

    // Set databox-id/type/source on chart so DataBox can find it.
    // databox-source must be explicit — DataBox querySelector uses it
    // and won't match elements that merely default to the value.
    const sourceName = 'default';
    attributes['databox-id'] = databoxId;
    attributes['databox-type'] = 'chart';
    attributes['databox-source'] = sourceName;

    // Create the DataBox element
    const databoxEl = document.createElement('data-box');
    databoxEl.id = databoxId;
    // segmented-control is needed even without a table element: DataBox only
    // creates the Teleport target containers when segmented-control is set.
    // Without it, the chart's Vue <Teleport> has no target and renders outside.
    databoxEl.setAttribute('segmented-control', '');
    // title, source, date are REQUIRED props for DataBox — always set them.
    databoxEl.setAttribute('title', this.databoxTitle || ' ');
    databoxEl.setAttribute('source', this.databoxSource || ' ');
    databoxEl.setAttribute('date', this.databoxDate || new Date().toISOString().split('T')[0]);
    if (this.databoxDownload) databoxEl.setAttribute('download', '');
    if (this.databoxScreenshot) databoxEl.setAttribute('screenshot', '');
    if (this.databoxFullscreen) databoxEl.setAttribute('fullscreen', '');
    if (this.databoxTrend) databoxEl.setAttribute('trend', this.databoxTrend);
    if (this.databoxTooltipTitle) databoxEl.setAttribute('tooltip-title', this.databoxTooltipTitle);
    if (this.databoxTooltipContent)
      databoxEl.setAttribute('tooltip-content', this.databoxTooltipContent);
    if (this.databoxModalTitle) databoxEl.setAttribute('modal-title', this.databoxModalTitle);
    if (this.databoxModalContent) databoxEl.setAttribute('modal-content', this.databoxModalContent);
    if (this.databoxDefaultSource)
      databoxEl.setAttribute('default-source', this.databoxDefaultSource);
    if (this.databoxActions) databoxEl.setAttribute('actions', this.databoxActions);

    // Create chart element
    const chartEl = this._createRawChartElement(tagName, attributes, deferred);

    // Hidden stub so DataBox's querySelectorAll finds a databox-type="table"
    // element and creates the table container div. Without this, DataBox
    // doesn't create #databoxId-table-default and there's nowhere to inject
    // our HTML table. The actual table content is injected by _injectDataboxTable().
    const tableStub = document.createElement('div');
    tableStub.setAttribute('databox-id', databoxId);
    tableStub.setAttribute('databox-type', 'table');
    tableStub.setAttribute('databox-source', sourceName);
    tableStub.style.display = 'none';

    // DataBox MUST be first in DOM order: its Vue template creates container
    // divs (e.g. #databoxId-chart-default), then DSFR Chart components use
    // Vue <Teleport> to render INTO those containers.
    const wrapper = document.createElement('div');
    wrapper.className = 'dsfr-data-chart__databox-wrapper';
    wrapper.appendChild(databoxEl);
    wrapper.appendChild(chartEl);
    wrapper.appendChild(tableStub);

    return wrapper;
  }

  /** Inject an HTML table into DataBox's table container (async, after Vue render).
   *  Same approach as dsfr-data-a11y: build an HTML table from the current data. */
  private _injectDataboxTable() {
    if (!this._data || this._data.length === 0) return;
    // Wait for DataBox Vue to render and create the table container
    setTimeout(() => {
      const wrapper = this.querySelector('.dsfr-data-chart__databox-wrapper');
      if (!wrapper) return;
      const databoxEl = wrapper.querySelector('data-box');
      if (!databoxEl) return;
      const databoxId = databoxEl.id;
      const containerId = `${databoxId}-table-default`;
      const container = document.getElementById(containerId);
      if (!container) return;

      // Build table from data (like dsfr-data-a11y)
      const columns = [this.labelField, this.valueField].filter(Boolean);
      if (columns.length === 0) return;
      const rows = this._data.slice(0, 100);

      const headerCells = columns.map((c) => `<th scope="col">${escapeHtml(String(c))}</th>`).join('');
      const bodyRows = rows
        .map((row) => {
          const cells = columns
            .map((col) => {
              const val = getByPath(row, col);
              return `<td>${escapeHtml(String(val ?? ''))}</td>`;
            })
            .join('');
          return `<tr>${cells}</tr>`;
        })
        .join('');

      container.innerHTML = `
        <div class="fr-table fr-m-2w">
          <table>
            <thead><tr>${headerCells}</tr></thead>
            <tbody>${bodyRows}</tbody>
          </table>
        </div>`;
    }, 500);
  }

  private _renderChart() {
    const tagName = CHART_TAG_MAP[this.type];
    if (!tagName) {
      return html`<p class="fr-text--sm fr-text--error">
        Type de graphique non supporté: ${this.type}
      </p>`;
    }

    const { attrs: typeAttrs, deferred } = this._getTypeSpecificAttributes();
    const allAttrs = {
      ...this._getCommonAttributes(),
      ...typeAttrs,
    };

    // BarLineChart uses name-bar/name-line and unit-tooltip-bar/unit-tooltip-line
    // instead of the generic name/unit-tooltip attributes
    if (this.type === 'bar-line') {
      delete allAttrs['name'];
      delete allAttrs['unit-tooltip'];
    }

    // Replace previous chart/databox wrapper if any
    const prevWrapper =
      this.querySelector('.dsfr-data-chart__wrapper') ||
      this.querySelector('.dsfr-data-chart__databox-wrapper');
    if (prevWrapper) prevWrapper.remove();

    if (this.databox) {
      const databoxEl = this._createDataboxElement(tagName, allAttrs, deferred);
      return html`${databoxEl}`;
    }
    const wrapper = this._createChartElement(tagName, allAttrs, deferred);
    return html`${wrapper}`;
  }

  render() {
    if (this._sourceLoading) {
      return html`
        <div class="dsfr-data-chart__loading" aria-live="polite">
          <span class="fr-icon-loader-4-line" aria-hidden="true"></span>
          Chargement du graphique...
        </div>
        <style>
          .dsfr-data-chart__loading {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 0.5rem;
            padding: 2rem;
            color: var(--text-mention-grey, #666);
            font-size: 0.875rem;
          }
        </style>
      `;
    }

    if (this._sourceError) {
      return html`
        <div class="dsfr-data-chart__error" aria-live="assertive">
          <span class="fr-icon-error-line" aria-hidden="true"></span>
          Erreur de chargement: ${this._sourceError.message}
        </div>
        <style>
          .dsfr-data-chart__error {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            padding: 1rem;
            color: var(--text-default-error, #ce0500);
            background: var(--background-alt-red-marianne, #ffe5e5);
            border-radius: 4px;
          }
        </style>
      `;
    }

    if (!this._data || this._data.length === 0) {
      return html`
        <div class="dsfr-data-chart__empty" aria-live="polite">
          <span class="fr-icon-information-line" aria-hidden="true"></span>
          Aucune donnée disponible
        </div>
        <style>
          .dsfr-data-chart__empty {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            padding: 1rem;
            color: var(--text-mention-grey, #666);
            background: var(--background-alt-grey, #f5f5f5);
            border-radius: 4px;
          }
        </style>
      `;
    }

    return this._renderChart();
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'dsfr-data-chart': DsfrDataChart;
  }
}
