import { LitElement, html, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { sendWidgetBeacon } from '../utils/beacon.js';
import {
  dispatchDataLoaded,
  dispatchDataError,
  dispatchDataLoading,
  clearDataCache,
  subscribeToSource,
  getDataCache,
  dispatchSourceCommand,
  subscribeToSourceCommands,
  getDataMeta,
  setDataMeta,
} from '../utils/data-bridge.js';
import type { ApiAdapter } from '../adapters/api-adapter.js';
import type { SourceElement } from '../utils/source-element.js';

type FacetDisplayMode = 'checkbox' | 'select' | 'multiselect' | 'radio';

interface FacetValue {
  value: string;
  count: number;
}

interface FacetGroup {
  field: string;
  label: string;
  values: FacetValue[];
}

/**
 * <dsfr-data-facets> - Filtres a facettes interactifs
 *
 * Composant visuel intermediaire qui affiche des controles de filtre
 * bases sur les valeurs categoriques des donnees. Se place entre une
 * source/normalize/query et les composants de visualisation.
 *
 * Les donnees filtrees sont redistribuees automatiquement aux composants en aval.
 *
 * @example
 * <dsfr-data-source id="raw" url="https://api.example.com/data" transform="data"></dsfr-data-source>
 * <dsfr-data-normalize id="clean" source="raw" trim numeric-auto></dsfr-data-normalize>
 * <dsfr-data-facets id="filtered" source="clean" fields="region, type"></dsfr-data-facets>
 * <dsfr-data-chart source="filtered" type="bar" label-field="region" value-field="population"></dsfr-data-chart>
 */
@customElement('dsfr-data-facets')
export class DsfrDataFacets extends LitElement {
  /** ID de la source de donnees a ecouter */
  @property({ type: String })
  source = '';

  /** Champs a exposer comme facettes (virgule-separes). Vide = auto-detection */
  @property({ type: String })
  fields = '';

  /** Labels custom : "field:Label | field2:Label 2" */
  @property({ type: String })
  labels = '';

  /** Nb de valeurs visibles par facette avant "Voir plus" */
  @property({ type: Number, attribute: 'max-values' })
  maxValues = 6;

  /** Champs en mode multi-selection OU (virgule-separes) */
  @property({ type: String })
  disjunctive = '';

  /** Tri des valeurs : count, -count, alpha, -alpha */
  @property({ type: String })
  sort = 'count';

  /** Champs avec barre de recherche (virgule-separes) */
  @property({ type: String })
  searchable = '';

  /** Masquer les facettes avec une seule valeur */
  @property({ type: Boolean, attribute: 'hide-empty' })
  hideEmpty = false;

  /** Mode d'affichage par facette : "field:select | field2:multiselect". Defaut = checkbox */
  @property({ type: String })
  display = '';

  /** Active la lecture des parametres d'URL comme pre-selections de facettes */
  @property({ type: Boolean, attribute: 'url-params' })
  urlParams = false;

  /** Mapping URL param -> champ facette : "param:field | param2:field2". Si vide, correspondance directe */
  @property({ type: String, attribute: 'url-param-map' })
  urlParamMap = '';

  /** Synchronise l'URL quand l'utilisateur change les facettes (pushState) */
  @property({ type: Boolean, attribute: 'url-sync' })
  urlSync = false;

  /**
   * Active le mode facettes serveur ODS.
   * Fetch les valeurs de facettes depuis l'API ODS /facets au lieu de les calculer localement.
   * Requiert source pointant vers un dsfr-data-source avec api-type="opendatasoft" et server-side.
   * En mode server-facets, l'attribut fields est obligatoire (pas d'auto-detection).
   */
  @property({ type: Boolean, attribute: 'server-facets' })
  serverFacets = false;

  /**
   * Valeurs de facettes pre-calculees (JSON).
   * Format: {"field": ["val1", "val2"], "field2": ["a", "b"]}
   * Quand cet attribut est defini, les facettes utilisent ces valeurs sans les
   * calculer depuis les donnees. Les selections envoient des commandes WHERE
   * en colon syntax (compatible Tabular / generique) au dsfr-data-query en amont.
   * Attribut fields requis (pas d'auto-detection).
   */
  @property({ type: String, attribute: 'static-values' })
  staticValues = '';

  /** Masquer les compteurs a cote de chaque valeur de facette */
  @property({ type: Boolean, attribute: 'hide-counts' })
  hideCounts = false;

  /** Compteurs effectivement masques (force a true en mode static-values) */
  get _effectiveHideCounts(): boolean {
    return this.hideCounts || !!this.staticValues;
  }

  /** Colonnage DSFR des facettes : "6" (global) ou "field:4 | field2:6" (par facette) */
  @property({ type: String })
  cols = '';

  @state()
  private _rawData: Record<string, unknown>[] = [];

  @state()
  private _facetGroups: FacetGroup[] = [];

  @state()
  private _activeSelections: Record<string, Set<string>> = {};

  @state()
  private _expandedFacets: Set<string> = new Set();

  @state()
  private _searchQueries: Record<string, string> = {};

  @state()
  private _openMultiselectField: string | null = null;

  /** Message annonce par la live region (lecteurs d'ecran) */
  @state()
  private _liveAnnouncement = '';

  private _unsubscribe: (() => void) | null = null;
  private _unsubscribeCommands: (() => void) | null = null;
  private _popstateHandler: (() => void) | null = null;

  // --- Public API (delegation to upstream source) ---

  /**
   * Retourne l'adapter de la source amont (delegation transparente).
   * Permet aux composants en aval d'acceder a l'adapter
   * sans connaitre la structure du pipeline.
   */
  public getAdapter(): ApiAdapter | null {
    if (this.source) {
      const sourceEl = document.getElementById(this.source);
      if (sourceEl && 'getAdapter' in sourceEl) {
        return (sourceEl as unknown as SourceElement).getAdapter();
      }
    }
    return null;
  }

  /**
   * Retourne le where effectif de la source amont (delegation transparente).
   */
  public getEffectiveWhere(excludeKey?: string): string {
    if (this.source) {
      const sourceEl = document.getElementById(this.source);
      if (sourceEl && 'getEffectiveWhere' in sourceEl) {
        return (sourceEl as unknown as SourceElement).getEffectiveWhere(excludeKey);
      }
    }
    return '';
  }
  private _urlParamsApplied = false;

  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    sendWidgetBeacon('dsfr-data-facets');
    this._initialize();
    document.addEventListener('click', this._onClickOutsideMultiselect);
    if (this.urlSync) {
      this._popstateHandler = () => {
        this._applyUrlParams();
        this._buildFacetGroups();
        this._applyFilters();
      };
      window.addEventListener('popstate', this._popstateHandler);
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._setBackgroundInert(false);
    document.removeEventListener('click', this._onClickOutsideMultiselect);
    if (this._popstateHandler) {
      window.removeEventListener('popstate', this._popstateHandler);
      this._popstateHandler = null;
    }
    if (this._unsubscribe) {
      this._unsubscribe();
      this._unsubscribe = null;
    }
    if (this._unsubscribeCommands) {
      this._unsubscribeCommands();
      this._unsubscribeCommands = null;
    }
    if (this.id) {
      clearDataCache(this.id);
    }
  }

  willUpdate(changedProperties: Map<string, unknown>) {
    super.willUpdate(changedProperties);

    if (changedProperties.has('source')) {
      this._initialize();
      return;
    }

    if (changedProperties.has('serverFacets') || changedProperties.has('staticValues')) {
      this._initialize();
      return;
    }

    const facetAttrs = [
      'fields',
      'labels',
      'sort',
      'hideEmpty',
      'maxValues',
      'disjunctive',
      'searchable',
      'display',
      'cols',
    ];
    const hasFacetChange = facetAttrs.some((attr) => changedProperties.has(attr));
    if (hasFacetChange && this._rawData.length > 0) {
      if (this.serverFacets) {
        this._fetchServerFacets();
      } else if (this.staticValues) {
        this._buildStaticFacetGroups();
      } else {
        this._buildFacetGroups();
        this._applyFilters();
      }
    }
  }

  private _initialize() {
    if (!this.id) {
      console.warn('dsfr-data-facets: attribut "id" requis pour identifier la sortie');
      return;
    }

    if (!this.source) {
      console.warn('dsfr-data-facets: attribut "source" requis');
      return;
    }

    if (this._unsubscribe) {
      this._unsubscribe();
    }

    this._activeSelections = {};
    this._expandedFacets = new Set();
    this._searchQueries = {};

    // In server/static mode with URL params, read selections and send command
    // proactively BEFORE data arrives. This lets dsfr-data-query (which defers its
    // first fetch in server-side mode) include the facet filter in the initial request.
    const isServerMode = this.serverFacets || !!this.staticValues;
    if (isServerMode && this.urlParams && !this._urlParamsApplied) {
      this._applyUrlParams();
      this._urlParamsApplied = true;
      if (this._hasActiveSelections()) {
        this._dispatchFacetCommand();
      }
    }

    const cachedData = getDataCache(this.source);
    if (cachedData !== undefined) {
      this._onData(cachedData);
    }

    this._unsubscribe = subscribeToSource(this.source, {
      onLoaded: (data: unknown) => {
        this._onData(data);
      },
      onLoading: () => {
        dispatchDataLoading(this.id);
      },
      onError: (error: Error) => {
        dispatchDataError(this.id, error);
      },
    });

    // Forward downstream commands (page, orderBy) to upstream source
    if (this._unsubscribeCommands) {
      this._unsubscribeCommands();
    }
    this._unsubscribeCommands = subscribeToSourceCommands(this.id, (cmd) => {
      dispatchSourceCommand(this.source, cmd);
    });
  }

  private _onData(data: unknown) {
    this._rawData = Array.isArray(data) ? data : [];
    const isServerMode = this.serverFacets || !!this.staticValues;
    if (this.urlParams && !this._urlParamsApplied) {
      this._applyUrlParams();
      this._urlParamsApplied = true;
      // In server mode, send initial URL-selected facets as command
      if (isServerMode && this._hasActiveSelections()) {
        this._dispatchFacetCommand();
        return; // command will trigger a new data load
      }
    }
    if (this.serverFacets) {
      this._fetchServerFacets();
      // Re-emit data as-is (no local filtering), forwarding pagination metadata
      if (this.id) {
        const meta = getDataMeta(this.source);
        if (meta) setDataMeta(this.id, meta);
        dispatchDataLoaded(this.id, this._rawData);
      }
    } else if (this.staticValues) {
      this._buildStaticFacetGroups();
      // Re-emit data as-is (filtering happens server-side), forwarding pagination metadata
      if (this.id) {
        const meta = getDataMeta(this.source);
        if (meta) setDataMeta(this.id, meta);
        dispatchDataLoaded(this.id, this._rawData);
      }
    } else {
      this._buildFacetGroups();
      this._applyFilters();
    }
  }

  // --- Facet index building ---

  _buildFacetGroups() {
    const fields = this._getFields();
    const labelMap = this._parseLabels();

    this._facetGroups = fields
      .map((field) => {
        const values = this._computeFacetValues(field);
        return {
          field,
          label: labelMap.get(field) ?? field,
          values,
        };
      })
      .filter((group) => {
        if (this.hideEmpty && group.values.length <= 1) return false;
        return group.values.length > 0;
      });
  }

  /**
   * Build facet groups from static-values attribute (pre-computed values).
   * Values are displayed without counts (count=0, hidden via hideCounts).
   */
  _buildStaticFacetGroups() {
    if (!this.staticValues) return;
    try {
      const parsed = JSON.parse(this.staticValues) as Record<string, string[]>;
      const labelMap = this._parseLabels();
      const fields = this.fields ? _parseCSV(this.fields) : Object.keys(parsed);

      this._facetGroups = fields
        .filter((field) => parsed[field] && parsed[field].length > 0)
        .map((field) => ({
          field,
          label: labelMap.get(field) ?? field,
          values: parsed[field].map((v) => ({ value: v, count: 0 })),
        }))
        .filter((group) => !(this.hideEmpty && group.values.length <= 1));
    } catch {
      console.warn('dsfr-data-facets: static-values invalide (JSON attendu)');
    }
  }

  /**
   * Build facet WHERE clause, delegating to the upstream source's adapter.
   * Falls back to colon syntax if no adapter is available.
   */
  _buildFacetWhere(excludeField?: string): string {
    const rawEl = document.getElementById(this.source);
    const adapter: ApiAdapter | undefined =
      (rawEl as unknown as SourceElement)?.getAdapter?.() ?? undefined;
    if (adapter?.buildFacetWhere) {
      return adapter.buildFacetWhere(this._activeSelections, excludeField);
    }
    // Fallback: colon syntax (for client-side mode without adapter)
    const parts: string[] = [];
    for (const [field, values] of Object.entries(this._activeSelections)) {
      if (field === excludeField || values.size === 0) continue;
      if (values.size === 1) {
        parts.push(`${field}:eq:${[...values][0]}`);
      } else {
        parts.push(`${field}:in:${[...values].join('|')}`);
      }
    }
    return parts.join(', ');
  }

  /**
   * Walk upstream through the source chain to find the actual dsfr-data-source element
   * (the one with baseUrl/datasetId/headers). Intermediate components like dsfr-data-query
   * have a `source` property pointing to their upstream.
   */
  private _findUpstreamSource(): HTMLElement | null {
    let el: HTMLElement | null = document.getElementById(this.source);
    // Walk up while the element is an intermediary (has source but no datasetId)
    const maxDepth = 5; // safety limit
    for (let i = 0; i < maxDepth && el; i++) {
      if ('datasetId' in el || 'baseUrl' in el) return el;
      const upstream = (el as unknown as SourceElement).source;
      if (!upstream || typeof upstream !== 'string') break;
      el = document.getElementById(upstream);
    }
    return el;
  }

  /** Resolve a possibly dotted field path on a row (e.g. "fields.Region") */
  private _resolveValue(row: Record<string, unknown>, field: string): unknown {
    if (!field.includes('.')) return row[field];
    const parts = field.split('.');
    let current: unknown = row;
    for (const part of parts) {
      if (current === null || current === undefined || typeof current !== 'object')
        return undefined;
      current = (current as Record<string, unknown>)[part];
    }
    return current;
  }

  /** Get fields to use as facets — explicit or auto-detected */
  private _getFields(): string[] {
    if (this.fields) {
      return _parseCSV(this.fields);
    }
    return this._autoDetectFields();
  }

  /** Auto-detect categorical fields: string type, 2-50 unique values, not all unique (ID-like) */
  _autoDetectFields(): string[] {
    if (this._rawData.length === 0) return [];

    const candidates: string[] = [];
    const sampleRow = this._rawData[0];

    for (const key of Object.keys(sampleRow)) {
      const uniqueValues = new Set<string>();
      let allStrings = true;

      for (const row of this._rawData) {
        const val = row[key];
        if (val === null || val === undefined || val === '') continue;
        if (typeof val !== 'string') {
          allStrings = false;
          break;
        }
        uniqueValues.add(val);
        if (uniqueValues.size > 50) break;
      }

      if (!allStrings) continue;
      if (uniqueValues.size <= 1 || uniqueValues.size > 50) continue;
      // Exclude ID-like fields (all values unique)
      if (uniqueValues.size === this._rawData.length) continue;

      candidates.push(key);
    }

    return candidates;
  }

  /** Compute facet values with counts, applying cross-facet filtering for dynamic counts */
  _computeFacetValues(field: string): FacetValue[] {
    // For dynamic counts: filter data by all OTHER active facets (not this one)
    const dataForCounting = this._getDataFilteredExcluding(field);

    const counts = new Map<string, number>();
    for (const row of dataForCounting) {
      const val = this._resolveValue(row, field);
      if (val === null || val === undefined || val === '') continue;
      const strVal = String(val);
      counts.set(strVal, (counts.get(strVal) ?? 0) + 1);
    }

    const values: FacetValue[] = [];
    for (const [value, count] of counts) {
      values.push({ value, count });
    }

    return this._sortValues(values);
  }

  /** Filter data by all active selections EXCEPT the given field */
  private _getDataFilteredExcluding(excludeField: string): Record<string, unknown>[] {
    const activeFields = Object.keys(this._activeSelections).filter(
      (f) => f !== excludeField && this._activeSelections[f].size > 0
    );

    if (activeFields.length === 0) return this._rawData;

    return this._rawData.filter((row) => {
      return activeFields.every((field) => {
        const selected = this._activeSelections[field];
        const val = this._resolveValue(row, field);
        if (val === null || val === undefined) return false;
        return selected.has(String(val));
      });
    });
  }

  _sortValues(values: FacetValue[]): FacetValue[] {
    const sorted = [...values];
    switch (this.sort) {
      case 'count':
        sorted.sort((a, b) => b.count - a.count);
        break;
      case '-count':
        sorted.sort((a, b) => a.count - b.count);
        break;
      case 'alpha':
        sorted.sort((a, b) => a.value.localeCompare(b.value, 'fr'));
        break;
      case '-alpha':
        sorted.sort((a, b) => b.value.localeCompare(a.value, 'fr'));
        break;
      default:
        sorted.sort((a, b) => b.count - a.count);
    }
    return sorted;
  }

  // --- Server-facets ---

  /** Check if there are any active selections */
  private _hasActiveSelections(): boolean {
    return Object.keys(this._activeSelections).some((f) => this._activeSelections[f].size > 0);
  }

  /** Fetch facet values from server API with cross-facet counts */
  private async _fetchServerFacets() {
    const sourceEl = document.getElementById(this.source);
    if (!sourceEl) return;

    // Get adapter from the source element (dsfr-data-query delegates to dsfr-data-source)
    const adapter: ApiAdapter | undefined =
      (sourceEl as unknown as SourceElement).getAdapter?.() ?? undefined;
    if (!adapter?.capabilities.serverFacets || !adapter.fetchFacets) {
      // Adapter does not support server facets — fallback to client-side
      this._buildFacetGroups();
      this._applyFilters();
      return;
    }

    // Walk upstream to find the actual dsfr-data-source (which has baseUrl/datasetId/headers).
    // The immediate source may be a dsfr-data-query intermediary.
    const actualSourceEl = this._findUpstreamSource() || sourceEl;

    const baseUrl = actualSourceEl.getAttribute('base-url') || '';
    const datasetId = actualSourceEl.getAttribute('dataset-id') || '';
    if (!datasetId) return;

    // Parse headers from the actual source element (dsfr-data-source)
    let headers: Record<string, string> | undefined;
    const headersAttr = actualSourceEl.getAttribute('headers') || '';
    if (headersAttr) {
      try {
        headers = JSON.parse(headersAttr);
      } catch {
        /* ignore */
      }
    }

    const fields = _parseCSV(this.fields);
    if (fields.length === 0) return; // fields requis en mode server

    const labelMap = this._parseLabels();

    // Cross-facet: group fields by their effective where clause
    // Fields sharing the same where can be fetched in a single API call
    const whereToFields = new Map<string, string[]>();
    for (const field of fields) {
      const baseWhere = (sourceEl as unknown as SourceElement).getEffectiveWhere?.(this.id) || '';
      const otherFacetWhere = this._buildFacetWhere(field);
      const effectiveWhere = [baseWhere, otherFacetWhere].filter(Boolean).join(' AND ');
      if (!whereToFields.has(effectiveWhere)) whereToFields.set(effectiveWhere, []);
      whereToFields.get(effectiveWhere)!.push(field);
    }

    // Fetch each group via adapter
    const allGroups: FacetGroup[] = [];
    for (const [where, groupFields] of whereToFields) {
      try {
        const results = await adapter.fetchFacets(
          { baseUrl, datasetId, headers },
          groupFields,
          where
        );
        for (const result of results) {
          allGroups.push({
            field: result.field,
            label: labelMap.get(result.field) ?? result.field,
            values: this._sortValues(result.values),
          });
        }
      } catch {
        // Ignore fetch errors — facets will simply not appear
      }
    }

    // Order groups to match the fields attribute order
    this._facetGroups = fields
      .map((f) => allGroups.find((g) => g.field === f))
      .filter((g): g is FacetGroup => !!g)
      .filter((g) => !(this.hideEmpty && g.values.length <= 1));
  }

  /** Dispatch facet where command to upstream dsfr-data-query */
  private _dispatchFacetCommand() {
    const facetWhere = this._buildFacetWhere();
    dispatchSourceCommand(this.source, { where: facetWhere, whereKey: this.id });
  }

  // --- Filtering ---

  _applyFilters() {
    const activeFields = Object.keys(this._activeSelections).filter(
      (f) => this._activeSelections[f].size > 0
    );

    let filtered: Record<string, unknown>[];
    if (activeFields.length === 0) {
      filtered = this._rawData;
    } else {
      filtered = this._rawData.filter((row) => {
        return activeFields.every((field) => {
          const selected = this._activeSelections[field];
          const val = this._resolveValue(row, field);
          if (val === null || val === undefined) return false;
          return selected.has(String(val));
        });
      });
    }

    dispatchDataLoaded(this.id, filtered);
  }

  // --- Parsing helpers ---

  _parseLabels(): Map<string, string> {
    const map = new Map<string, string>();
    if (!this.labels) return map;

    const pairs = this.labels.split('|');
    for (const pair of pairs) {
      const colonIndex = pair.indexOf(':');
      if (colonIndex === -1) continue;
      const key = pair.substring(0, colonIndex).trim();
      const value = pair.substring(colonIndex + 1).trim();
      if (key) {
        map.set(key, value);
      }
    }
    return map;
  }

  /** Parse display attribute into per-field mode map */
  _parseDisplayModes(): Map<string, FacetDisplayMode> {
    const map = new Map<string, FacetDisplayMode>();
    if (!this.display) return map;

    const pairs = this.display.split('|');
    for (const pair of pairs) {
      const colonIndex = pair.indexOf(':');
      if (colonIndex === -1) continue;
      const key = pair.substring(0, colonIndex).trim();
      const value = pair.substring(colonIndex + 1).trim();
      if (
        key &&
        (value === 'checkbox' || value === 'select' || value === 'multiselect' || value === 'radio')
      ) {
        map.set(key, value);
      }
    }
    return map;
  }

  /** Get the display mode for a specific field */
  _getDisplayMode(field: string): FacetDisplayMode {
    return this._parseDisplayModes().get(field) ?? 'checkbox';
  }

  /** Parse cols attribute: returns global col size or per-field map */
  _parseCols(): { global: number } | { map: Map<string, number>; fallback: number } | null {
    if (!this.cols) return null;
    const trimmed = this.cols.trim();
    // Single number = global
    if (/^\d+$/.test(trimmed)) {
      return { global: parseInt(trimmed, 10) };
    }
    // Per-field: "field:4 | field2:6"
    const map = new Map<string, number>();
    const pairs = trimmed.split('|');
    for (const pair of pairs) {
      const colonIndex = pair.indexOf(':');
      if (colonIndex === -1) continue;
      const key = pair.substring(0, colonIndex).trim();
      const val = parseInt(pair.substring(colonIndex + 1).trim(), 10);
      if (key && !isNaN(val)) {
        map.set(key, val);
      }
    }
    return map.size > 0 ? { map, fallback: 6 } : null;
  }

  /** Get DSFR col class for a specific field */
  _getColClass(field: string): string {
    const cols = this._parseCols();
    if (!cols) return '';
    if ('global' in cols) return `fr-col-${cols.global}`;
    return `fr-col-${cols.map.get(field) ?? cols.fallback}`;
  }

  // --- User interaction ---

  private _toggleValue(field: string, value: string) {
    const selections = { ...this._activeSelections };
    const fieldSet = new Set(selections[field] ?? []);

    const displayMode = this._getDisplayMode(field);
    const disjunctiveFields = _parseCSV(this.disjunctive);
    // select/radio = always exclusive, multiselect = always disjunctive, checkbox = check attribute
    const isDisjunctive =
      displayMode === 'multiselect' ||
      (displayMode === 'checkbox' && disjunctiveFields.includes(field));

    const wasSelected = fieldSet.has(value);
    if (wasSelected) {
      fieldSet.delete(value);
    } else {
      if (!isDisjunctive) {
        fieldSet.clear();
      }
      fieldSet.add(value);
    }

    if (fieldSet.size === 0) {
      delete selections[field];
    } else {
      selections[field] = fieldSet;
    }

    this._activeSelections = selections;
    this._afterSelectionChange();

    // Announce selection change for all interactive modes
    if (displayMode === 'multiselect' || displayMode === 'radio' || displayMode === 'checkbox') {
      const action = wasSelected ? 'deselectionnee' : 'selectionnee';
      this._announce(
        `${value} ${action}, ${fieldSet.size} option${fieldSet.size > 1 ? 's' : ''} selectionnee${fieldSet.size > 1 ? 's' : ''}`
      );
    }
  }

  private _handleSelectChange(field: string, e: Event) {
    const select = e.target as HTMLSelectElement;
    const value = select.value;
    const selections = { ...this._activeSelections };

    if (!value) {
      delete selections[field];
    } else {
      selections[field] = new Set([value]);
    }

    this._activeSelections = selections;
    this._afterSelectionChange();
  }

  private _clearFieldSelections(field: string) {
    const selections = { ...this._activeSelections };
    delete selections[field];
    this._activeSelections = selections;
    this._afterSelectionChange();
    this._announce('Aucune option selectionnee');
  }

  private _selectAllValues(field: string) {
    const group = this._facetGroups.find((g) => g.field === field);
    if (!group) return;
    const selections = { ...this._activeSelections };
    selections[field] = new Set(group.values.map((v) => v.value));
    this._activeSelections = selections;
    this._afterSelectionChange();
    this._announce(`${group.values.length} options selectionnees`);
  }

  private _toggleMultiselectDropdown(field: string) {
    if (this._openMultiselectField === field) {
      this._openMultiselectField = null;
      this._setBackgroundInert(false);
    } else {
      this._openMultiselectField = field;
      this._setBackgroundInert(true);
      this.updateComplete.then(() => {
        const panel = this.querySelector(
          `[data-multiselect="${field}"] .dsfr-data-facets__multiselect-panel`
        );
        const firstFocusable = panel?.querySelector(
          'button, input, select, [tabindex]'
        ) as HTMLElement;
        firstFocusable?.focus();

        // Announce panel context to screen readers
        const group = this._facetGroups.find((g) => g.field === field);
        if (group) {
          const selected = this._activeSelections[field] ?? new Set();
          this._announce(
            `${group.label}, ${group.values.length} options disponibles, ${selected.size} selectionnee${selected.size > 1 ? 's' : ''}`
          );
        }
      });
    }
  }

  private _announce(message: string) {
    // Clear then set to ensure re-announcement of identical messages
    this._liveAnnouncement = '';
    requestAnimationFrame(() => {
      this._liveAnnouncement = message;
    });
  }

  /**
   * Set or remove the `inert` attribute on background content when a dialog opens/closes.
   * This confines NVDA's virtual cursor to the dialog, preventing it from reading
   * page content behind the panel (complements aria-modal="true").
   */
  private _setBackgroundInert(active: boolean) {
    const host = this.closest('dsfr-data-facets') ?? this;
    document.querySelectorAll('body > *').forEach((el) => {
      if (el.contains(host)) return; // skip our own ancestor
      if (active) {
        el.setAttribute('inert', '');
      } else {
        el.removeAttribute('inert');
      }
    });
  }

  private _handleMultiselectKeydown(field: string, e: KeyboardEvent) {
    if (e.key === 'Escape') {
      this._openMultiselectField = null;
      this._setBackgroundInert(false);
      const trigger = this.querySelector(
        `[data-multiselect="${field}"] .dsfr-data-facets__multiselect-trigger`
      ) as HTMLElement;
      trigger?.focus();
      return;
    }

    // Focus trap: Tab wraps within the dialog panel
    if (e.key === 'Tab') {
      const panel = this.querySelector(
        `[data-multiselect="${field}"] .dsfr-data-facets__multiselect-panel`
      );
      if (!panel) return;
      const focusables = [
        ...panel.querySelectorAll<HTMLElement>(
          'button:not([tabindex="-1"]), input, select, [tabindex]:not([tabindex="-1"])'
        ),
      ];
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
      return;
    }

    // Arrow key navigation between checkboxes/radios
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Home' || e.key === 'End') {
      const panel = this.querySelector(
        `[data-multiselect="${field}"] .dsfr-data-facets__multiselect-panel`
      );
      if (!panel) return;
      const inputs = [
        ...panel.querySelectorAll<HTMLInputElement>('input[type="checkbox"], input[type="radio"]'),
      ];
      if (inputs.length === 0) return;

      const currentIndex = inputs.indexOf(e.target as HTMLInputElement);
      if (currentIndex === -1 && e.key !== 'ArrowDown') return;

      e.preventDefault();
      let nextIndex: number;
      if (e.key === 'ArrowDown') {
        nextIndex = currentIndex === -1 ? 0 : Math.min(currentIndex + 1, inputs.length - 1);
      } else if (e.key === 'ArrowUp') {
        nextIndex = Math.max(currentIndex - 1, 0);
      } else if (e.key === 'Home') {
        nextIndex = 0;
      } else {
        nextIndex = inputs.length - 1;
      }
      inputs[nextIndex].focus();
    }
  }

  private _handleMultiselectFocusout(field: string, e: FocusEvent) {
    if (this._openMultiselectField !== field) return;
    const relatedTarget = e.relatedTarget as HTMLElement | null;
    if (!relatedTarget) return; // focus leaves document — let _onClickOutsideMultiselect handle it
    const wrapper = this.querySelector(`[data-multiselect="${field}"]`);
    if (wrapper?.contains(relatedTarget)) return; // focus stays inside wrapper
    this._openMultiselectField = null;
    this._setBackgroundInert(false);
  }

  private _onClickOutsideMultiselect = (e: MouseEvent) => {
    if (!this._openMultiselectField) return;
    const target = e.target as HTMLElement;
    const panel = this.querySelector(`[data-multiselect="${this._openMultiselectField}"]`);
    if (panel && !panel.contains(target)) {
      this._openMultiselectField = null;
      this._setBackgroundInert(false);
    }
  };

  private _toggleExpand(field: string) {
    const expanded = new Set(this._expandedFacets);
    if (expanded.has(field)) {
      expanded.delete(field);
    } else {
      expanded.add(field);
    }
    this._expandedFacets = expanded;
  }

  private _searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  private _handleSearch(field: string, e: Event) {
    const input = e.target as HTMLInputElement;
    this._searchQueries = { ...this._searchQueries, [field]: input.value };

    // Debounced announcement of filtered results count
    if (this._searchDebounceTimer) clearTimeout(this._searchDebounceTimer);
    this._searchDebounceTimer = setTimeout(() => {
      const group = this._facetGroups.find((g) => g.field === field);
      if (!group) return;
      const query = input.value.toLowerCase();
      const count = query
        ? group.values.filter((v) => v.value.toLowerCase().includes(query)).length
        : group.values.length;
      this._announce(
        count === 0
          ? 'Aucune option trouvee'
          : `${count} option${count > 1 ? 's' : ''} disponible${count > 1 ? 's' : ''}`
      );
    }, 300);
  }

  private _clearAll() {
    this._activeSelections = {};
    this._searchQueries = {};
    this._afterSelectionChange();
  }

  /** Common logic after any selection change — routes to client, server, or static mode */
  private _afterSelectionChange() {
    if (this.serverFacets || this.staticValues) {
      this._dispatchFacetCommand();
    } else {
      this._buildFacetGroups();
      this._applyFilters();
    }
    if (this.urlSync) this._syncUrl();
  }

  // --- URL params ---

  /** Parse url-param-map attribute into a map of URL param name -> facet field name */
  _parseUrlParamMap(): Map<string, string> {
    const map = new Map<string, string>();
    if (!this.urlParamMap) return map;

    const pairs = this.urlParamMap.split('|');
    for (const pair of pairs) {
      const colonIndex = pair.indexOf(':');
      if (colonIndex === -1) continue;
      const paramName = pair.substring(0, colonIndex).trim();
      const fieldName = pair.substring(colonIndex + 1).trim();
      if (paramName && fieldName) {
        map.set(paramName, fieldName);
      }
    }
    return map;
  }

  /** Read URL search params and apply as facet pre-selections */
  _applyUrlParams() {
    const params = new URLSearchParams(window.location.search);
    const paramMap = this._parseUrlParamMap();
    const selections: Record<string, Set<string>> = {};

    for (const [paramName, paramValue] of params.entries()) {
      // Determine the target field name
      const fieldName = paramMap.size > 0 ? (paramMap.get(paramName) ?? null) : paramName;

      if (!fieldName) continue;

      // Support comma-separated values in a single param: ?region=IDF,PACA
      const values = paramValue
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean);

      if (!selections[fieldName]) {
        selections[fieldName] = new Set();
      }
      for (const v of values) {
        selections[fieldName].add(v);
      }
    }

    if (Object.keys(selections).length > 0) {
      this._activeSelections = selections;
    }
  }

  /** Sync current facet selections back to URL (replaceState) */
  private _syncUrl() {
    const params = new URLSearchParams();
    const paramMap = this._parseUrlParamMap();
    // Build reverse map: field -> URL param name
    const reverseMap = new Map<string, string>();
    for (const [paramName, fieldName] of paramMap) {
      reverseMap.set(fieldName, paramName);
    }

    for (const [field, values] of Object.entries(this._activeSelections)) {
      if (values.size === 0) continue;
      const paramName = reverseMap.get(field) ?? field;
      params.set(paramName, [...values].join(','));
    }

    const search = params.toString();
    const newUrl = search
      ? `${window.location.pathname}?${search}${window.location.hash}`
      : `${window.location.pathname}${window.location.hash}`;
    window.history.replaceState(null, '', newUrl);
  }

  // --- Rendering ---

  render() {
    if (this._rawData.length === 0 || this._facetGroups.length === 0) {
      return nothing;
    }

    const hasActiveFilters = Object.keys(this._activeSelections).some(
      (f) => this._activeSelections[f].size > 0
    );

    const useDsfrGrid = !!this.cols;

    return html`
      <style>
        .dsfr-data-facets {
          margin-bottom: 1.5rem;
        }
        .dsfr-data-facets__header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 1rem;
        }
        .dsfr-data-facets__groups {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
          gap: 1.5rem;
        }
        .dsfr-data-facets__group {
          min-width: 0;
        }
        .dsfr-data-facets__count {
          font-weight: 400;
          font-size: 0.75rem;
          color: var(--text-mention-grey, #666);
          margin-left: 0.25rem;
        }
        .dsfr-data-facets .fr-radio-group .fr-label,
        .dsfr-data-facets .fr-checkbox-group .fr-label {
          flex-wrap: nowrap;
        }
        .dsfr-data-facets__multiselect {
          position: relative;
        }
        .dsfr-data-facets__multiselect-trigger {
          width: 100%;
          text-align: left;
          cursor: pointer;
          appearance: none;
        }
        .dsfr-data-facets__multiselect-trigger[aria-expanded='true']::after {
          transform: rotate(180deg);
        }
        .dsfr-data-facets__multiselect-panel {
          position: absolute;
          top: 100%;
          left: 0;
          right: 0;
          z-index: 1000;
          background: var(--background-default-grey, #fff);
          border: 1px solid var(--border-default-grey, #ddd);
          border-radius: 0 0 0.25rem 0.25rem;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
          max-height: 320px;
          overflow-y: auto;
          padding: 0.75rem;
        }
        .dsfr-data-facets__multiselect-panel .fr-search-bar {
          margin-bottom: 0.75rem;
        }
        .dsfr-data-facets__dropdown-fieldset {
          margin: 0;
          padding: 0;
          border: none;
        }
        .dsfr-data-facets__dropdown-fieldset .fr-fieldset__element {
          padding: 0;
        }
        .dsfr-data-facets__multiselect-toggle {
          width: 100%;
          margin-bottom: 0.75rem;
        }
        @media (max-width: 576px) {
          .dsfr-data-facets__groups {
            grid-template-columns: 1fr;
          }
        }
      </style>
      <div class="dsfr-data-facets">
        ${hasActiveFilters
          ? html`
              <div class="dsfr-data-facets__header">
                <button
                  class="fr-btn fr-btn--tertiary-no-outline fr-btn--sm fr-btn--icon-left fr-icon-close-circle-line"
                  type="button"
                  @click="${this._clearAll}"
                >
                  Reinitialiser les filtres
                </button>
              </div>
            `
          : nothing}
        ${useDsfrGrid
          ? html`
              <div class="fr-grid-row fr-grid-row--gutters">
                ${this._facetGroups.map(
                  (group) => html`
                    <div class="${this._getColClass(group.field)}">
                      ${this._renderFacetGroup(group)}
                    </div>
                  `
                )}
              </div>
            `
          : html`
              <div class="dsfr-data-facets__groups">
                ${this._facetGroups.map((group) => this._renderFacetGroup(group))}
              </div>
            `}
      </div>
    `;
  }

  private _renderFacetGroup(group: FacetGroup) {
    const mode = this._getDisplayMode(group.field);
    switch (mode) {
      case 'select':
        return this._renderSelectGroup(group);
      case 'multiselect':
        return this._renderMultiselectGroup(group);
      case 'radio':
        return this._renderRadioGroup(group);
      default:
        return this._renderCheckboxGroup(group);
    }
  }

  private _renderCheckboxGroup(group: FacetGroup) {
    const searchableFields = _parseCSV(this.searchable);
    const isSearchable = searchableFields.includes(group.field);
    const searchQuery = (this._searchQueries[group.field] ?? '').toLowerCase();
    const isExpanded = this._expandedFacets.has(group.field);
    const selected = this._activeSelections[group.field] ?? new Set();

    let displayValues = group.values;
    if (isSearchable && searchQuery) {
      displayValues = displayValues.filter((v) => v.value.toLowerCase().includes(searchQuery));
    }

    const visibleValues = isExpanded ? displayValues : displayValues.slice(0, this.maxValues);
    const hasMore = displayValues.length > this.maxValues;
    const uid = `facet-${this.id}-${group.field}`;

    return html`
      <fieldset class="fr-fieldset dsfr-data-facets__group" aria-labelledby="${uid}-legend">
        <legend class="fr-fieldset__legend fr-text--bold" id="${uid}-legend">${group.label}</legend>
        <div aria-live="polite" class="fr-sr-only">${this._liveAnnouncement}</div>
        ${isSearchable
          ? html`
              <div class="fr-fieldset__element">
                <div class="fr-input-group">
                  <input
                    class="fr-input fr-input--sm"
                    type="search"
                    placeholder="Rechercher..."
                    .value="${this._searchQueries[group.field] ?? ''}"
                    @input="${(e: Event) => this._handleSearch(group.field, e)}"
                    aria-label="Rechercher dans ${group.label}"
                  />
                </div>
              </div>
            `
          : nothing}
        ${visibleValues.map((fv) => {
          const checkId = `${uid}-${fv.value.replace(/[^a-zA-Z0-9]/g, '_')}`;
          const isChecked = selected.has(fv.value);
          return html`
            <div class="fr-fieldset__element">
              <div class="fr-checkbox-group fr-checkbox-group--sm">
                <input
                  type="checkbox"
                  id="${checkId}"
                  .checked="${isChecked}"
                  @change="${() => this._toggleValue(group.field, fv.value)}"
                />
                <label class="fr-label" for="${checkId}">
                  ${fv.value}${this._effectiveHideCounts
                    ? nothing
                    : html`<span class="dsfr-data-facets__count" aria-hidden="true"
                          >${fv.count}</span
                        ><span class="fr-sr-only"
                          >, ${fv.count} resultat${fv.count > 1 ? 's' : ''}</span
                        >`}
                </label>
              </div>
            </div>
          `;
        })}
        ${hasMore
          ? html`
              <div class="fr-fieldset__element">
                <button
                  class="fr-btn fr-btn--tertiary-no-outline fr-btn--sm"
                  type="button"
                  @click="${() => this._toggleExpand(group.field)}"
                >
                  ${isExpanded
                    ? 'Voir moins'
                    : `Voir plus (${displayValues.length - this.maxValues})`}
                </button>
              </div>
            `
          : nothing}
      </fieldset>
    `;
  }

  private _renderSelectGroup(group: FacetGroup) {
    const uid = `facet-${this.id}-${group.field}`;
    const selected = this._activeSelections[group.field];
    const selectedValue = selected ? ([...selected][0] ?? '') : '';

    return html`
      <div class="dsfr-data-facets__group fr-select-group" data-field="${group.field}">
        <label class="fr-label" for="${uid}-select">${group.label}</label>
        <select
          class="fr-select"
          id="${uid}-select"
          @change="${(e: Event) => this._handleSelectChange(group.field, e)}"
        >
          <option value="" ?selected="${!selectedValue}">Tous</option>
          ${group.values.map(
            (fv) => html`
              <option value="${fv.value}" ?selected="${fv.value === selectedValue}">
                ${this._effectiveHideCounts ? fv.value : `${fv.value} (${fv.count})`}
              </option>
            `
          )}
        </select>
      </div>
    `;
  }

  private _renderMultiselectGroup(group: FacetGroup) {
    const uid = `facet-${this.id}-${group.field}`;
    const selected = this._activeSelections[group.field] ?? new Set();
    const isOpen = this._openMultiselectField === group.field;
    const searchQuery = (this._searchQueries[group.field] ?? '').toLowerCase();

    let displayValues = group.values;
    if (searchQuery) {
      displayValues = displayValues.filter((v) => v.value.toLowerCase().includes(searchQuery));
    }

    const triggerLabel =
      selected.size > 0
        ? `${selected.size} option${selected.size > 1 ? 's' : ''} selectionnee${selected.size > 1 ? 's' : ''}`
        : 'Selectionnez des options';

    // Selected values description for screen readers
    const selectedDesc = selected.size > 0 ? [...selected].join(', ') : '';

    return html`
      <div
        class="fr-select-group dsfr-data-facets__group dsfr-data-facets__multiselect"
        data-multiselect="${group.field}"
        data-field="${group.field}"
        @keydown="${(e: KeyboardEvent) => this._handleMultiselectKeydown(group.field, e)}"
        @focusout="${(e: FocusEvent) => this._handleMultiselectFocusout(group.field, e)}"
      >
        <label class="fr-label" id="${uid}-legend">${group.label}</label>
        ${selectedDesc
          ? html`<span class="fr-sr-only" id="${uid}-desc">${selectedDesc}</span>`
          : nothing}
        <button
          class="fr-select dsfr-data-facets__multiselect-trigger"
          type="button"
          aria-expanded="${isOpen}"
          aria-controls="${uid}-panel"
          aria-labelledby="${uid}-legend"
          aria-haspopup="dialog"
          aria-describedby="${selectedDesc ? `${uid}-desc` : nothing}"
          @click="${(e: Event) => {
            e.stopPropagation();
            this._toggleMultiselectDropdown(group.field);
          }}"
        >
          ${triggerLabel}
        </button>
        ${isOpen
          ? html`
              <div
                class="dsfr-data-facets__multiselect-panel"
                id="${uid}-panel"
                role="dialog"
                aria-modal="true"
                aria-label="${group.label}"
                @click="${(e: Event) => e.stopPropagation()}"
              >
                <div aria-live="polite" class="fr-sr-only">${this._liveAnnouncement}</div>
                <button
                  class="fr-btn fr-btn--tertiary fr-btn--sm fr-btn--icon-left ${selected.size > 0
                    ? 'fr-icon-close-circle-line'
                    : 'fr-icon-check-line'} dsfr-data-facets__multiselect-toggle"
                  type="button"
                  aria-label="${selected.size > 0
                    ? `Tout deselectionner pour ${group.label}`
                    : `Tout selectionner pour ${group.label}`}"
                  @click="${() =>
                    selected.size > 0
                      ? this._clearFieldSelections(group.field)
                      : this._selectAllValues(group.field)}"
                >
                  ${selected.size > 0 ? 'Tout deselectionner' : 'Tout selectionner'}
                </button>
                <div class="fr-search-bar" role="search">
                  <label class="fr-label fr-sr-only" for="${uid}-search"
                    >Rechercher dans ${group.label}</label
                  >
                  <input
                    class="fr-input"
                    type="search"
                    id="${uid}-search"
                    placeholder="Rechercher..."
                    aria-describedby="${uid}-search-hint"
                    .value="${this._searchQueries[group.field] ?? ''}"
                    @input="${(e: Event) => this._handleSearch(group.field, e)}"
                  />
                  <span class="fr-sr-only" id="${uid}-search-hint"
                    >Les resultats se mettent a jour automatiquement</span
                  >
                  <button
                    class="fr-btn"
                    type="button"
                    title="Rechercher"
                    aria-hidden="true"
                    tabindex="-1"
                  >
                    Rechercher
                  </button>
                </div>
                <fieldset
                  class="fr-fieldset dsfr-data-facets__dropdown-fieldset"
                  aria-label="${group.label}"
                >
                  ${displayValues.map((fv) => {
                    const checkId = `${uid}-${fv.value.replace(/[^a-zA-Z0-9]/g, '_')}`;
                    const isChecked = selected.has(fv.value);
                    return html`
                      <div class="fr-fieldset__element">
                        <div class="fr-checkbox-group fr-checkbox-group--sm">
                          <input
                            type="checkbox"
                            id="${checkId}"
                            .checked="${isChecked}"
                            @change="${() => this._toggleValue(group.field, fv.value)}"
                          />
                          <label class="fr-label" for="${checkId}">
                            ${fv.value}${this._effectiveHideCounts
                              ? nothing
                              : html`<span class="dsfr-data-facets__count" aria-hidden="true"
                                    >${fv.count}</span
                                  ><span class="fr-sr-only"
                                    >, ${fv.count} resultat${fv.count > 1 ? 's' : ''}</span
                                  >`}
                          </label>
                        </div>
                      </div>
                    `;
                  })}
                </fieldset>
              </div>
            `
          : nothing}
      </div>
    `;
  }

  private _renderRadioGroup(group: FacetGroup) {
    const uid = `facet-${this.id}-${group.field}`;
    const selected = this._activeSelections[group.field] ?? new Set();
    const isOpen = this._openMultiselectField === group.field;
    const searchQuery = (this._searchQueries[group.field] ?? '').toLowerCase();

    let displayValues = group.values;
    if (searchQuery) {
      displayValues = displayValues.filter((v) => v.value.toLowerCase().includes(searchQuery));
    }

    const selectedValue = selected.size > 0 ? [...selected][0] : null;
    const triggerLabel = selectedValue ?? 'Selectionnez une option';

    return html`
      <div
        class="fr-select-group dsfr-data-facets__group dsfr-data-facets__multiselect"
        data-multiselect="${group.field}"
        data-field="${group.field}"
        @keydown="${(e: KeyboardEvent) => this._handleMultiselectKeydown(group.field, e)}"
        @focusout="${(e: FocusEvent) => this._handleMultiselectFocusout(group.field, e)}"
      >
        <label class="fr-label" id="${uid}-legend">${group.label}</label>
        <button
          class="fr-select dsfr-data-facets__multiselect-trigger"
          type="button"
          aria-expanded="${isOpen}"
          aria-controls="${uid}-panel"
          aria-labelledby="${uid}-legend"
          aria-haspopup="dialog"
          @click="${(e: Event) => {
            e.stopPropagation();
            this._toggleMultiselectDropdown(group.field);
          }}"
        >
          ${triggerLabel}
        </button>
        ${isOpen
          ? html`
              <div
                class="dsfr-data-facets__multiselect-panel"
                id="${uid}-panel"
                role="dialog"
                aria-modal="true"
                aria-label="${group.label}"
                @click="${(e: Event) => e.stopPropagation()}"
              >
                <div aria-live="polite" class="fr-sr-only">${this._liveAnnouncement}</div>
                ${selectedValue
                  ? html`
                      <button
                        class="fr-btn fr-btn--tertiary fr-btn--sm fr-btn--icon-left fr-icon-close-circle-line dsfr-data-facets__multiselect-toggle"
                        type="button"
                        aria-label="Reinitialiser ${group.label}"
                        @click="${() => this._clearFieldSelections(group.field)}"
                      >
                        Reinitialiser
                      </button>
                    `
                  : nothing}
                <div class="fr-search-bar" role="search">
                  <label class="fr-label fr-sr-only" for="${uid}-search"
                    >Rechercher dans ${group.label}</label
                  >
                  <input
                    class="fr-input"
                    type="search"
                    id="${uid}-search"
                    placeholder="Rechercher..."
                    aria-describedby="${uid}-search-hint"
                    .value="${this._searchQueries[group.field] ?? ''}"
                    @input="${(e: Event) => this._handleSearch(group.field, e)}"
                  />
                  <span class="fr-sr-only" id="${uid}-search-hint"
                    >Les resultats se mettent a jour automatiquement</span
                  >
                  <button
                    class="fr-btn"
                    type="button"
                    title="Rechercher"
                    aria-hidden="true"
                    tabindex="-1"
                  >
                    Rechercher
                  </button>
                </div>
                <fieldset
                  class="fr-fieldset dsfr-data-facets__dropdown-fieldset"
                  aria-label="${group.label}"
                >
                  ${displayValues.map((fv) => {
                    const radioId = `${uid}-${fv.value.replace(/[^a-zA-Z0-9]/g, '_')}`;
                    const isChecked = selected.has(fv.value);
                    return html`
                      <div class="fr-fieldset__element">
                        <div class="fr-radio-group fr-radio-group--sm">
                          <input
                            type="radio"
                            id="${radioId}"
                            name="${uid}-radio"
                            .checked="${isChecked}"
                            @change="${() => this._toggleValue(group.field, fv.value)}"
                          />
                          <label class="fr-label" for="${radioId}">
                            ${fv.value}${this._effectiveHideCounts
                              ? nothing
                              : html`<span class="dsfr-data-facets__count" aria-hidden="true"
                                    >${fv.count}</span
                                  ><span class="fr-sr-only"
                                    >, ${fv.count} resultat${fv.count > 1 ? 's' : ''}</span
                                  >`}
                          </label>
                        </div>
                      </div>
                    `;
                  })}
                </fieldset>
              </div>
            `
          : nothing}
      </div>
    `;
  }
}

/** Parse a comma-separated string into trimmed non-empty tokens */
export function _parseCSV(value: string): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

declare global {
  interface HTMLElementTagNameMap {
    'dsfr-data-facets': DsfrDataFacets;
  }
}
