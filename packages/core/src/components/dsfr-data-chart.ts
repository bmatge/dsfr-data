import { LitElement, html } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { SourceSubscriberMixin } from '../utils/source-subscriber.js';
import { getByPath } from '../utils/json-path.js';
import { sendWidgetBeacon } from '../utils/beacon.js';
import { renderSourceLoading, renderSourceError } from '../utils/status-templates.js';
import { reportConfigError, clearConfigError } from '../utils/config-error.js';
import {
  parseReferenceLines,
  isCartesianChartType,
  resolveChartInstance,
  computeReferenceGeometries,
  buildReferenceOverlaySvg,
  referenceLinesAriaSummary,
  type ReferenceLine,
} from '../utils/chart-reference-lines.js';
import {
  parseTargets,
  isTargetsChartType,
  padSeriesForTargets,
  computeTargetGeometries,
  buildTargetsOverlaySvg,
  buildTargetTooltip,
  buildTargetsLegend,
  parseTargetsLegend,
  formatTargetValue,
  targetsAriaSummary,
  type ChartTarget,
  type ChartWithDatasetsLike,
  type TargetsLayout,
  type TargetMarkerGeometry,
} from '../utils/chart-targets.js';
import { escapeHtml, toNumber, isValidDeptCode } from '@dsfr-data/shared/lib';

type DSFRChartType =
  'line' | 'bar' | 'pie' | 'radar' | 'gauge' | 'scatter' | 'bar-line' | 'map' | 'map-reg';

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
 *   label-field="catégorie"
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

  /**
   * Champ "clé de série" pour des données au format long/tidy : ses valeurs
   * distinctes deviennent autant de series (mode multi-series sans colonnes multiples).
   * Ex: données {mois, groupe, valeur} avec series-field="groupe" → une série par groupe.
   * S'applique aux types multi-series (bar, line, radar). Prioritaire sur value-fields.
   */
  @property({ type: String, attribute: 'series-field' })
  seriesField = '';

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

  /** Source par défaut dans le selecteur multi-source DataBox */
  @property({ type: String, attribute: 'databox-default-source' })
  databoxDefaultSource = '';

  /** Actions personnalisees DataBox (JSON array, ex: '["Source officielle","Pole emploi"]') */
  @property({ type: String, attribute: 'databox-actions' })
  databoxActions = '';

  /**
   * Lignes de reference (overlay) au format JSON. Graphiques cartesiens
   * uniquement (line, bar, bar-line, scatter). Chaque item :
   * `{ axis: "x"|"y", value: string|number, label?, color?, dash?, position? }`.
   * `axis:"x"` → ligne verticale a une categorie/date ; `axis:"y"` → ligne
   * horizontale a un seuil. Ex : `reference-lines='[{"axis":"x","value":"2026-02",
   * "label":"Lancement","color":"#c9191e","dash":true}]'`.
   */
  @property({ type: String, attribute: 'reference-lines' })
  referenceLines = '';

  /**
   * Cibles / objectifs futurs (overlay) au format JSON. Types `line` et
   * `bar-line` uniquement. Chaque item : `{ x: string|number (échéance,
   * requis), value: number (requis), series?: string|number (nom de dataset ou
   * index, défaut 0), label?: string, color?: string }`. L'axe X est étendu
   * automatiquement si l'échéance est au-delà des données (séries paddées avec
   * null : trait plein jusqu'au dernier point réel, trajectoire pointillée vers
   * le losange). Ex : `targets='[{"x":2030,"value":26,"label":"Cible 2030 : 26 %"}]'`.
   */
  @property({ type: String })
  targets = '';

  /** Zone future grisée + frontière pointillée réalisé/projeté. `"off"` désactive. */
  @property({ type: String, attribute: 'targets-zone' })
  targetsZone = 'on';

  /**
   * Légende réalisé/projeté sous le graphe : `""` = libellés par défaut
   * (« Données historiques » / « Trajectoire, cible extrapolée »), `"off"` =
   * masquée, `'["a","b"]'` = libellés personnalisés.
   */
  @property({ type: String, attribute: 'targets-legend' })
  targetsLegend = '';

  @state()
  private _data: unknown[] = [];

  /** Timers differes en vol — annules au disconnect (#305) */
  private _pendingTimers = new Set<number>();

  /** Overlays (reference-lines #341 + targets #377) : poll rAF en cours (annule au disconnect) */
  private _overlayRaf: number | null = null;
  /** Overlays : observer de resize du canvas */
  private _overlayResize: ResizeObserver | null = null;
  /** Overlays : warn-once si l'instance Chart.js reste introuvable */
  private _overlayWarned = false;
  /** Tooltip cible en cours d'affichage (#377) */
  private _targetTooltipEl: HTMLDivElement | null = null;

  /** Attributs poses par la mise a jour incrementale (#305) */
  private _managedChartAttrs = new Set<string>();

  disconnectedCallback() {
    super.disconnectedCallback();
    // Annule les timers differes (#305) : ils s'empilaient a chaque
    // onSourceData et survivaient au composant
    for (const t of this._pendingTimers) clearTimeout(t);
    this._pendingTimers.clear();
    this._cleanupChartOverlays();
  }

  updated(changed: Map<string, unknown>) {
    super.updated(changed);
    // Redessine les overlays (lignes de reference #341, cibles #377) apres
    // chaque rendu. Chart.js rend de maniere asynchrone → le draw poll en rAF
    // jusqu'a ce que l'instance soit prete.
    this._refreshChartOverlays();
  }

  // Light DOM pour les styles DSFR
  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    sendWidgetBeacon('dsfr-data-chart', this.type);
  }

  onSourceReset(): void {
    this._data = [];
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
    // value-fields SANS value-field (#305) : l'ancien code incluait
    // toujours '' en tete -> getByPath(record, '') retournait l'objet
    // entier, premiere serie a zero + nom de serie vide dans la legende
    const fields: string[] = [];
    if (this.valueField) fields.push(this.valueField);
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
    // Sans aucun champ : comportement historique conserve (les chemins
    // lisent allSeries[0])
    return fields.length > 0 ? fields : [this.valueField];
  }

  /**
   * Series names, in render order.
   * - tidy mode (series-field) : distinct values of seriesField, in first-seen order
   * - wide mode : the value field names (value-field, value-field-2, value-fields)
   */
  private _getSeriesNames(): string[] {
    if (this.seriesField) {
      const seen = new Set<string>();
      const names: string[] = [];
      for (const record of this._data) {
        const s = String(getByPath(record, this.seriesField) ?? '');
        if (!seen.has(s)) {
          seen.add(s);
          names.push(s);
        }
      }
      return names;
    }
    return this._getAllValueFields();
  }

  /**
   * Build the series matrix for tidy/long data : pivots {labelField, seriesField, valueField}
   * into one aligned value array per distinct series. Missing (label, series) cells are 0.
   */
  private _processTidyData(): {
    x: string;
    y: string;
    y2?: string;
    yMulti?: string;
    labels: string[];
    values: number[];
    values2: number[];
    allSeries: number[][];
  } {
    const labels: string[] = [];
    const labelIndex = new Map<string, number>();
    for (const record of this._data) {
      const l = String(getByPath(record, this.labelField) ?? 'N/A');
      if (!labelIndex.has(l)) {
        labelIndex.set(l, labels.length);
        labels.push(l);
      }
    }

    const seriesNames = this._getSeriesNames();
    const seriesIndex = new Map(seriesNames.map((s, i) => [s, i]));
    const allSeries: number[][] = seriesNames.map(() => new Array(labels.length).fill(0));

    for (const record of this._data) {
      const l = String(getByPath(record, this.labelField) ?? 'N/A');
      const s = String(getByPath(record, this.seriesField) ?? '');
      const li = labelIndex.get(l);
      const si = seriesIndex.get(s);
      if (li !== undefined && si !== undefined) {
        allSeries[si][li] = toNumber(getByPath(record, this.valueField));
      }
    }

    const values = allSeries[0] || [];
    const values2 = allSeries[1] || [];
    const hasMulti = allSeries.length > 1;

    return {
      x: JSON.stringify([labels]),
      y: JSON.stringify([values]),
      y2: hasMulti ? JSON.stringify([values2]) : undefined,
      yMulti: hasMulti ? JSON.stringify(allSeries) : undefined,
      labels,
      values,
      values2,
      allSeries,
    };
  }

  private _processData(): {
    x: string;
    y: string;
    y2?: string;
    yMulti?: string;
    labels: string[];
    values: number[];
    values2: number[];
    allSeries: number[][];
  } {
    if (!this._data || this._data.length === 0) {
      return { x: '[[]]', y: '[[]]', labels: [], values: [], values2: [], allSeries: [] };
    }

    // Tidy/long mode : a single series-key column drives the series dimension.
    if (this.seriesField) {
      return this._processTidyData();
    }

    const allFields = this._getAllValueFields();
    const labels: string[] = [];
    const allSeries: number[][] = allFields.map(() => []);

    for (const record of this._data) {
      labels.push(String(getByPath(record, this.labelField) ?? 'N/A'));
      for (let i = 0; i < allFields.length; i++) {
        allSeries[i].push(toNumber(getByPath(record, allFields[i])));
      }
    }

    const values = allSeries[0] || [];
    const values2 = allSeries[1] || [];
    const hasMulti = allFields.length > 1;

    return {
      x: JSON.stringify([labels]),
      y: JSON.stringify([values]),
      y2: hasMulti ? JSON.stringify([values2]) : undefined,
      // Combined y with all séries for multi-séries charts (bar, line, radar)
      yMulti: hasMulti ? JSON.stringify(allSeries) : undefined,
      labels,
      values,
      values2,
      allSeries,
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
      const value = toNumber(getByPath(record, this.valueField));
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
        // Series names : distinct series-field values (tidy) or value field names (wide).
        attrs['name'] = JSON.stringify(this._getSeriesNames());
      }
    }

    return attrs;
  }

  /** Cibles actives : attribut non vide, parse valide, type supporté. */
  private _activeTargets(): ChartTarget[] {
    if (!this.targets.trim() || !isTargetsChartType(this.type)) return [];
    const { targets, error } = parseTargets(this.targets);
    return error ? [] : targets;
  }

  /**
   * Noms de séries à afficher, dans l'ordre des datasets : attribut `name`
   * (JSON ou simple) prioritaire, sinon noms dérivés des données. Les datasets
   * de `@gouvfr/dsfr-chart` n'exposent pas de `label`.
   */
  private _getDisplaySeriesNames(): string[] {
    if (this.name) {
      try {
        const trimmed = this.name.trim();
        const parsed: unknown = trimmed.startsWith('[') ? JSON.parse(trimmed) : [trimmed];
        if (Array.isArray(parsed)) return parsed.map(String);
      } catch {
        /* repli sur les noms dérivés des données */
      }
    }
    return this._getSeriesNames();
  }

  /** Index de dataset visé par une cible (nom de série ou index, défaut 0). */
  private _targetSeriesIndex(target: ChartTarget): number {
    if (typeof target.series === 'number') return target.series;
    if (typeof target.series === 'string') {
      let i = this._getDisplaySeriesNames().indexOf(target.series);
      if (i < 0) i = this._getSeriesNames().indexOf(target.series);
      return i >= 0 ? i : 0;
    }
    return 0;
  }

  private _getTypeSpecificAttributes(): {
    attrs: Record<string, string>;
    deferred: Record<string, string>;
  } {
    const { x, y, yMulti, labels, values, allSeries } = this._processData();
    const attrs: Record<string, string> = {};
    const deferred: Record<string, string> = {};

    // Extension de l'axe X pour les cibles au-delà des données (#377) : les
    // échéances absentes sont ajoutées aux labels, chaque série est paddée
    // avec null (Chart.js coupe la ligne ; c'est NOTRE segment pointillé qui
    // rejoint le losange, pas de point parasite dans légende/tooltip natifs).
    const activeTargets = this._activeTargets();
    let paddedLabels: unknown[] = labels;
    let paddedSeries: Array<Array<number | null>> = allSeries;
    if (activeTargets.length && this._data.length > 0) {
      const padded = padSeriesForTargets(
        labels,
        allSeries,
        activeTargets.map((t) => t.x)
      );
      paddedLabels = padded.labels;
      paddedSeries = padded.series;
    }

    switch (this.type) {
      case 'gauge': {
        const gaugeVal =
          this.gaugeValue ??
          (this._data.length > 0 ? toNumber(getByPath(this._data[0], this.valueField)) : 0);
        attrs['percent'] = String(Math.round(gaugeVal));
        attrs['init'] = '0';
        attrs['target'] = '100';
        break;
      }
      case 'pie':
        attrs['x'] = x;
        attrs['y'] = y;
        // For pie charts, DSFR Chart expects one name per slice (category),
        // not one per séries. Use labels as legend entries.
        if (!this.name && labels.length > 0) {
          attrs['name'] = JSON.stringify(labels);
        }
        break;
      case 'bar-line': {
        // DSFR BarLineChart expects flat arrays (not double-wrapped [[values]])
        // unlike BarChart which uses xparse[0] to unwrap.
        attrs['x'] = JSON.stringify(paddedLabels);
        attrs['y-bar'] = JSON.stringify(paddedSeries[0] ?? values);
        attrs['y-line'] = JSON.stringify(
          paddedSeries.length > 1 ? paddedSeries[1] : (paddedSeries[0] ?? values)
        );
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
            const v = toNumber(getByPath(record, this.valueField), true);
            if (v !== null) {
              total += v;
              count++;
            }
          }
          if (count > 0) {
            const avg = Math.round((total / count) * 100) / 100;
            deferred['value'] = String(avg);
          }
        }
        // Plus de new Date() (#305) : la date du JOUR etait presentee comme
        // date de la donnee sur les cartes — n'envoyer date que si fournie
        if (this.databoxDate) {
          deferred['date'] = this.databoxDate;
        }
        break;
      }
      default:
        if (activeTargets.length && this._data.length > 0) {
          // Re-sérialise depuis les tableaux paddés (mêmes valeurs sinon)
          attrs['x'] = JSON.stringify([paddedLabels]);
          attrs['y'] =
            paddedSeries.length > 1
              ? JSON.stringify(paddedSeries)
              : JSON.stringify([paddedSeries[0] ?? []]);
        } else {
          attrs['x'] = x;
          // For bar/line/radar with a second séries, combine both into y
          attrs['y'] = yMulti || y;
        }
        break;
    }

    // Bornes Y élargies automatiquement pour que le losange de cible reste
    // dans la zone traçable — seulement si l'utilisateur n'a pas fixé les
    // siennes (#377). Le bar-line a deux axes séparés (y-bar-* / y-line-*).
    if (activeTargets.length && this._data.length > 0) {
      const setBound = (
        attr: string,
        kind: 'max' | 'min',
        data: number[],
        targetVals: number[]
      ) => {
        const finite = data.filter((v) => Number.isFinite(v));
        if (!finite.length || !targetVals.length) return;
        if (kind === 'max') {
          const t = Math.max(...targetVals);
          if (t > Math.max(...finite)) attrs[attr] = String(t);
        } else {
          const t = Math.min(...targetVals);
          if (t < Math.min(...finite)) attrs[attr] = String(t);
        }
      };
      if (this.type === 'bar-line') {
        const barVals = allSeries[0] ?? [];
        const lineVals = allSeries.length > 1 ? allSeries[1] : (allSeries[0] ?? []);
        const barTargets = activeTargets
          .filter((t) => this._targetSeriesIndex(t) === 0)
          .map((t) => t.value);
        const lineTargets = activeTargets
          .filter((t) => this._targetSeriesIndex(t) !== 0)
          .map((t) => t.value);
        if (!this.yMax) {
          setBound('y-bar-max', 'max', barVals, barTargets);
          setBound('y-line-max', 'max', lineVals, lineTargets);
        }
        if (!this.yMin) {
          setBound('y-bar-min', 'min', barVals, barTargets);
          setBound('y-line-min', 'min', lineVals, lineTargets);
        }
      } else {
        const dataValues = allSeries.flat();
        const targetValues = activeTargets.map((t) => t.value);
        if (!this.yMax) setBound('y-max', 'max', dataValues, targetValues);
        if (!this.yMin) setBound('y-min', 'min', dataValues, targetValues);
      }
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
    let label = `Graphique ${typeName}, ${count} valeurs`;
    // Repères de référence relayés a l'aria-label (overlay SVG aria-hidden, #341)
    if (this.referenceLines && isCartesianChartType(this.type)) {
      const { lines } = parseReferenceLines(this.referenceLines);
      if (lines.length) label += `. ${referenceLinesAriaSummary(lines)}`;
    }
    // Cibles relayées a l'aria-label (overlay SVG aria-hidden, #377)
    if (this.targets && isTargetsChartType(this.type)) {
      const { targets } = parseTargets(this.targets);
      if (targets.length) label += `. ${targetsAriaSummary(targets)}`;
    }
    return label;
  }

  // --- Overlays SVG : lignes de reference (#341) + cibles (#377) --------------
  // Pipeline UNIQUE (un seul rAF-poll / ResizeObserver / cleanup) : chaque
  // famille valide est peinte independamment, les erreurs de config des deux
  // familles sont jointes par « ; ».

  /** Valide les configs et (re)programme le dessin des overlays. */
  private _refreshChartOverlays() {
    if (this._overlayRaf !== null) {
      cancelAnimationFrame(this._overlayRaf);
      this._overlayRaf = null;
    }

    const hasRefLines = !!this.referenceLines.trim();
    const hasTargets = !!this.targets.trim();
    if (!hasRefLines && !hasTargets) {
      this._cleanupChartOverlays();
      clearConfigError(this);
      return;
    }

    const errors: string[] = [];
    let lines: ReferenceLine[] = [];
    if (hasRefLines) {
      const parsed = parseReferenceLines(this.referenceLines);
      if (parsed.error) {
        errors.push(parsed.error);
      } else if (!isCartesianChartType(this.type)) {
        errors.push(
          `reference-lines : type "${this.type}" non supporté (cartésiens uniquement : line, bar, bar-line, scatter)`
        );
      } else {
        lines = parsed.lines;
      }
    }

    let targets: ChartTarget[] = [];
    if (hasTargets) {
      const parsed = parseTargets(this.targets);
      if (parsed.error) {
        errors.push(parsed.error);
      } else if (!isTargetsChartType(this.type)) {
        errors.push(`targets : type "${this.type}" non supporté (line et bar-line uniquement)`);
      } else {
        targets = parsed.targets;
      }
    }

    if (errors.length) {
      reportConfigError(this, 'dsfr-data-chart', errors.join(' ; '));
    } else {
      clearConfigError(this);
    }

    if (!lines.length && !targets.length) {
      this._removeChartOverlays();
      return;
    }
    this._scheduleOverlayDraw({ lines, targets }, 120);
  }

  /** Poll rAF jusqu'a ce que l'instance Chart.js soit prete (chartArea > 0). */
  private _scheduleOverlayDraw(
    overlays: { lines: ReferenceLine[]; targets: ChartTarget[] },
    framesLeft: number
  ) {
    if (typeof requestAnimationFrame === 'undefined') return;
    this._overlayRaf = requestAnimationFrame(() => {
      this._overlayRaf = null;
      if (!this.isConnected) return;
      if (this._paintChartOverlays(overlays)) {
        this._observeOverlayResize(overlays);
        return;
      }
      if (framesLeft > 0) {
        this._scheduleOverlayDraw(overlays, framesLeft - 1);
      } else if (!this._overlayWarned) {
        this._overlayWarned = true;
        console.warn(
          `dsfr-data-chart[${this.id}]: instance Chart.js introuvable, overlays (repères / cibles) non dessinés`
        );
      }
    });
  }

  /** Localise le chart rendu + son canvas + le conteneur positionne. */
  private _resolveOverlayHosts(): {
    container: HTMLElement;
    canvas: HTMLCanvasElement;
    chartEl: HTMLElement;
  } | null {
    const tag = CHART_TAG_MAP[this.type];
    if (!tag) return null;
    const container = (this.querySelector('.dsfr-data-chart__wrapper') ||
      this.querySelector('.dsfr-data-chart__databox-wrapper')) as HTMLElement | null;
    const chartEl = this.querySelector(tag) as HTMLElement | null;
    const canvas = (chartEl?.querySelector('canvas') ||
      this.querySelector('canvas')) as HTMLCanvasElement | null;
    if (!container || !chartEl || !canvas) return null;
    return { container, canvas, chartEl };
  }

  /** Dessine les overlays. Retourne false si l'instance Chart.js n'est pas prete. */
  private _paintChartOverlays(overlays: {
    lines: ReferenceLine[];
    targets: ChartTarget[];
  }): boolean {
    const hosts = this._resolveOverlayHosts();
    if (!hosts) return false;
    const { container, canvas, chartEl } = hosts;
    const chart = resolveChartInstance(chartEl, canvas);
    if (!chart || !chart.chartArea || chart.chartArea.width <= 0) return false;

    this._removeChartOverlays();

    const w = canvas.clientWidth || canvas.width || 0;
    const h = canvas.clientHeight || canvas.height || 0;

    // Aligner chaque overlay sur le canvas dans le conteneur positionne
    const cRect = canvas.getBoundingClientRect();
    const wRect = container.getBoundingClientRect();
    if (getComputedStyle(container).position === 'static') {
      container.style.position = 'relative';
    }
    const place = (svg: SVGSVGElement) => {
      svg.style.left = `${Math.round(cRect.left - wRect.left)}px`;
      svg.style.top = `${Math.round(cRect.top - wRect.top)}px`;
      container.appendChild(svg);
    };

    if (overlays.lines.length) {
      place(buildReferenceOverlaySvg(computeReferenceGeometries(chart, overlays.lines), w, h));
    }
    if (overlays.targets.length) {
      const layout = computeTargetGeometries(
        chart as ChartWithDatasetsLike,
        overlays.targets,
        this._getDisplaySeriesNames()
      );
      const svg = buildTargetsOverlaySvg(layout, w, h, { zone: this.targetsZone !== 'off' });
      place(svg);
      this._bindTargetMarkerEvents(svg, layout);
      this._renderTargetsLegend(layout);
    }
    return true;
  }

  /** Observe le resize du canvas pour recalculer les overlays (debounce rAF). */
  private _observeOverlayResize(overlays: { lines: ReferenceLine[]; targets: ChartTarget[] }) {
    if (typeof ResizeObserver === 'undefined') return;
    const hosts = this._resolveOverlayHosts();
    if (!hosts) return;
    this._overlayResize?.disconnect();
    let pending = false;
    this._overlayResize = new ResizeObserver(() => {
      if (pending) return;
      pending = true;
      requestAnimationFrame(() => {
        pending = false;
        if (this.isConnected) this._paintChartOverlays(overlays);
      });
    });
    this._overlayResize.observe(hosts.canvas);
  }

  private _removeChartOverlays() {
    this.querySelector('.dsfr-data-chart__reflines')?.remove();
    this.querySelector('.dsfr-data-chart__targets')?.remove();
    this.querySelector('.dsfr-data-chart__targets-legend')?.remove();
    this._hideTargetTooltip();
  }

  private _cleanupChartOverlays() {
    if (this._overlayRaf !== null) {
      cancelAnimationFrame(this._overlayRaf);
      this._overlayRaf = null;
    }
    this._overlayResize?.disconnect();
    this._overlayResize = null;
    this._removeChartOverlays();
  }

  // --- Cibles : interactivite (tooltip groupe par echeance, legende, #377) ----

  /** Branche le tooltip sur les losanges (seuls elements pointer-events:auto). */
  private _bindTargetMarkerEvents(svg: SVGSVGElement, layout: TargetsLayout) {
    const polygons = svg.querySelectorAll<SVGPolygonElement>('.dsfr-data-chart__target-marker');
    // buildTargetsOverlaySvg appose un polygon par marker, dans l'ordre du layout
    polygons.forEach((polygon, i) => {
      const marker = layout.markers[i];
      if (!marker) return;
      polygon.addEventListener('mouseenter', () => this._showTargetTooltip(marker, layout));
      polygon.addEventListener('mouseleave', () => this._hideTargetTooltip());
    });
  }

  /** Unite du tooltip selon la serie : bar-line → index 0 = barres. */
  private _targetUnitForSeries(seriesIndex: number): string {
    if (this.type === 'bar-line') {
      return seriesIndex === 0 ? this.unitTooltipBar : this.unitTooltip;
    }
    return this.unitTooltip;
  }

  /**
   * Affiche le tooltip DSFR d'une echeance : toutes les cibles de meme `x`,
   * une ligne par serie. Positionne a droite du losange, bascule a gauche si
   * depassement, clampe dans le conteneur.
   */
  private _showTargetTooltip(marker: TargetMarkerGeometry, layout: TargetsLayout) {
    this._hideTargetTooltip();
    const hosts = this._resolveOverlayHosts();
    if (!hosts) return;
    const { container } = hosts;

    const key = String(marker.targetX);
    const group = layout.markers.filter((m) => String(m.targetX) === key);
    if (!group.length) return;

    const distinctLabels = [...new Set(group.map((m) => m.label).filter(Boolean))];
    const title = distinctLabels.length === 1 ? (distinctLabels[0] as string) : `Cible ${key}`;
    const lines = group.map((m) => ({
      color: m.color,
      name: m.seriesName,
      value: formatTargetValue(m.value, this._targetUnitForSeries(m.seriesIndex)),
    }));

    const tooltip = buildTargetTooltip(title, lines);
    container.appendChild(tooltip);
    this._targetTooltipEl = tooltip;

    // Ancre = losange survole, dans le repere du conteneur (offset du SVG)
    const svg = this.querySelector('.dsfr-data-chart__targets') as SVGSVGElement | null;
    const svgLeft = svg ? parseFloat(svg.style.left) || 0 : 0;
    const svgTop = svg ? parseFloat(svg.style.top) || 0 : 0;
    const anchorX = svgLeft + marker.x;
    const anchorY = svgTop + marker.y;

    const tw = tooltip.offsetWidth;
    const th = tooltip.offsetHeight;
    const cw = container.clientWidth;
    const ch = container.clientHeight;
    let left = anchorX + 14;
    if (left + tw > cw) left = anchorX - tw - 14;
    left = Math.max(0, Math.min(left, Math.max(0, cw - tw)));
    let top = anchorY - th / 2;
    top = Math.max(0, Math.min(top, Math.max(0, ch - th)));
    tooltip.style.left = `${Math.round(left)}px`;
    tooltip.style.top = `${Math.round(top)}px`;
  }

  private _hideTargetTooltip() {
    this._targetTooltipEl?.remove();
    this._targetTooltipEl = null;
  }

  /**
   * (Re)construit la legende realise/projete sous le graphe. Reconstruite a
   * chaque paint : survit au watcher Vue `$props` deep qui reconstruit le chart.
   */
  private _renderTargetsLegend(layout: TargetsLayout) {
    this.querySelector('.dsfr-data-chart__targets-legend')?.remove();
    if (!layout.markers.length) return;
    const { show, labels } = parseTargetsLegend(this.targetsLegend);
    if (!show) return;
    const wrapper = (this.querySelector('.dsfr-data-chart__wrapper') ||
      this.querySelector('.dsfr-data-chart__databox-wrapper')) as HTMLElement | null;
    if (!wrapper) return;
    wrapper.appendChild(buildTargetsLegend(labels));
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
    this._scheduleDeferredAttrs(el, deferred);

    return el;
  }

  /**
   * Met a jour les attributs d'un element chart EXISTANT (#305) : pose les
   * nouveaux, retire ceux que nous gerions et qui ont disparu, re-applique
   * les differes. Vue (DSFR Chart) observe ses props — pas besoin de
   * remonter le composant.
   */
  private _applyChartAttributes(
    el: HTMLElement,
    attributes: Record<string, string>,
    deferred: Record<string, string>
  ) {
    const next = new Set(Object.keys(attributes).filter((k) => attributes[k] !== ''));
    for (const [key, value] of Object.entries(attributes)) {
      if (value !== undefined && value !== '' && el.getAttribute(key) !== value) {
        el.setAttribute(key, value);
      }
    }
    for (const key of this._managedChartAttrs) {
      if (!next.has(key) && !(key in deferred)) {
        el.removeAttribute(key);
      }
    }
    this._managedChartAttrs = next;
    this._scheduleDeferredAttrs(el, deferred);
  }

  /**
   * Re-applique les attributs differes apres le montage Vue — timer TRACKE
   * (#305) : les setTimeout(500) s'empilaient a chaque onSourceData sans
   * jamais etre annules au disconnect, et pouvaient cibler des elements
   * remplaces entre-temps (gardes isConnected).
   */
  private _scheduleDeferredAttrs(el: HTMLElement, deferred: Record<string, string>) {
    if (Object.keys(deferred).length === 0) return;
    const timer = window.setTimeout(() => {
      this._pendingTimers.delete(timer);
      if (!el.isConnected) return;
      for (const [key, value] of Object.entries(deferred)) {
        el.setAttribute(key, value);
      }
    }, 500);
    this._pendingTimers.add(timer);
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
    const timer = window.setTimeout(() => {
      this._pendingTimers.delete(timer);
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

      const headerCells = columns
        .map((c) => `<th scope="col">${escapeHtml(String(c))}</th>`)
        .join('');
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
    this._pendingTimers.add(timer);
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

    // Mise a jour INCREMENTALE (#305) : si l'element chart existe deja avec
    // le meme tag (type inchange) et hors databox, mettre a jour ses
    // attributs en place — l'ancien remount complet a chaque update
    // (donnees, refresh) repassait par tout le cycle Vue (perte d'etat
    // d'animation, remount periodique avec refresh sur la source)
    if (!this.databox) {
      const prevSimpleWrapper = this.querySelector('.dsfr-data-chart__wrapper');
      const existing = prevSimpleWrapper?.querySelector(tagName) as HTMLElement | null;
      if (prevSimpleWrapper && existing) {
        this._applyChartAttributes(existing, allAttrs, deferred);
        prevSimpleWrapper.setAttribute('aria-label', this._getAriaLabel());
        return html`${prevSimpleWrapper}`;
      }
    }

    // Replace previous chart/databox wrapper if any (changement de type,
    // bascule databox, ou premier rendu)
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
        ${renderSourceLoading('dsfr-data-chart', 'Chargement du graphique...')}
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
        ${renderSourceError('dsfr-data-chart', this._sourceError)}
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
