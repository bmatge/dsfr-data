/**
 * Code generation functions.
 * Contains all code generation paths: local data, dynamic Grist,
 * dynamic API, and standard API-fetched data.
 */

import {
  escapeHtml,
  singleQuoteAttr,
  appendQuery,
  jsonAttr,
  jsonLiteral,
  jsStringLiteral,
  formatKPIValue,
  toNumber,
  isValidDeptCode,
  normalizeDeptCode,
  toastWarning,
  toastError,
  CDN_URLS,
  DSFR_TAG_MAP,
  filterToOdsql,
  applyLocalFilter,
  detectProvider,
  extractResourceIds,
  getProvider,
} from '@dsfr-data/shared';
import {
  advancedAggregates,
  colonAggregate,
  extraTraced,
  seriesNames,
} from './series-aggregates.js';
import {
  state,
  tracedExtraSeries,
  LIB_RENDERED_TYPES,
  PODIUM_PLACES_DEFAUT,
  type DataRecord,
  PROXY_BASE_URL_EMBED,
  LIB_URL,
} from '../state.js';
import { renderPreview } from './preview.js';
import { updateAccessibleTable } from './accessible-table.js';

/** Dernier code généré, tel qu'affiché dans le panneau « Code ». */
let lastGeneratedCode = '';

/**
 * Dernier code généré (source de vérité hors DOM). À préférer à la lecture
 * de `#generated-code` quand le code est transmis à une autre app qui le
 * réinterprète en HTML (Pipeline) — CodeQL js/xss-through-dom.
 */
export function getLastGeneratedCode(): string {
  return lastGeneratedCode;
}

/** Write the generated code to the code panel AND render it in the preview iframe. */
function displayGeneratedCode(code: string): void {
  // Prepend sample data comment if using example data
  const finalCode = state.isSampleData
    ? `<!-- Données d'exemple \u2014 remplacez par votre source de données -->\n${code}`
    : code;
  lastGeneratedCode = finalCode;
  const codeEl = document.getElementById('generated-code');
  if (codeEl) codeEl.textContent = finalCode;
  renderPreview(code);
}

const ODS_PAGE_SIZE = 100;
const ODS_MAX_PAGES = 10;

/**
 * Resolve the field name to use in `order-by` for dsfr-data-query.
 * - sortOrder === 'none' → returns null (caller should skip the attribute)
 * - sortField empty or === valueField → defaults to `defaultValueField` (the
 *   aggregated alias, ex: "population__sum")
 * - otherwise → returns sortField as-is (ex: labelField for alphabetical sort)
 */
function resolveSortField(defaultValueField: string): string | null {
  if (state.sortOrder === 'none') return null;
  if (!state.sortField || state.sortField === state.valueField) {
    return defaultValueField;
  }
  return state.sortField;
}

/**
 * Build the `sort="..."` attribute for dsfr-data-list.
 * Defaults to labelField; user-chosen sortField overrides. Empty string when
 * sortOrder === 'none' (preserve source order).
 */
function buildDatalistTriAttr(): string {
  if (state.sortOrder === 'none') return '';
  const field = state.sortField || state.labelField;
  if (!field) return '';
  // `sort` et non `tri` : l'alias francais est @deprecated depuis #300
  // (packages/core/src/components/dsfr-data-list.ts:73). Du code fraichement
  // genere ne doit pas naitre deprecie.
  return `\n    sort="${escapeHtml(field)}:${escapeHtml(state.sortOrder)}"`;
}

/** Generate DataBox attributes for dsfr-data-chart (dynamic mode) */
function generateDataboxAttrs(): string {
  if (!state.databoxEnabled) return '';
  const attrs: string[] = ['\n    databox'];
  if (state.databoxTitle) attrs.push(`databox-title="${escapeHtml(state.databoxTitle)}"`);
  if (state.databoxSource) attrs.push(`databox-source="${escapeHtml(state.databoxSource)}"`);
  if (state.databoxDate) attrs.push(`databox-date="${escapeHtml(state.databoxDate)}"`);
  if (state.databoxDownload) attrs.push('databox-download');
  if (state.databoxScreenshot) attrs.push('databox-screenshot');
  if (state.databoxFullscreen) attrs.push('databox-fullscreen');
  if (state.databoxTrend) attrs.push(`databox-trend="${escapeHtml(state.databoxTrend)}"`);
  return attrs.join('\n    ');
}

/** Generate optional dsfr-data-a11y element for accessible data companion */
function generateA11yElement(sourceId: string, chartId: string): string {
  if (!state.a11yEnabled) return '';
  const attrs: string[] = [`for="${chartId}"`, `source="${sourceId}"`];
  if (state.a11yTable) attrs.push('table');
  if (state.a11yDownload) attrs.push('download');
  if (state.a11yDescription) attrs.push(`description="${escapeHtml(state.a11yDescription)}"`);
  return `\n  <dsfr-data-a11y ${attrs.join(' ')}></dsfr-data-a11y>`;
}

/** Generate a11y block for embedded code (inline data via dsfr-data-source) */
function generateEmbeddedA11y(chartId: string): string {
  if (!state.a11yEnabled) return '';
  const dataJson = jsonAttr(state.data);
  const attrs: string[] = [`for="${chartId}"`, `source="a11y-data"`];
  if (state.a11yTable) attrs.push('table');
  if (state.a11yDownload) attrs.push('download');
  if (state.a11yDescription) attrs.push(`description="${escapeHtml(state.a11yDescription)}"`);
  return (
    `\n  <dsfr-data-source id="a11y-data" data='${dataJson}'></dsfr-data-source>` +
    `\n  <dsfr-data-a11y ${attrs.join(' ')}></dsfr-data-a11y>`
  );
}

/** dsfr-data dependency line for embedded code when a11y is enabled */
function a11yDep(): string {
  if (!state.a11yEnabled && !state.databoxEnabled) return '';
  return `\n<script src="${LIB_URL}/dsfr-data.core.umd.js"></script>`;
}

/** Wrap an embedded chart element with DataBox markup (open + close tags) */
function wrapWithDatabox(chartHtml: string, chartId: string): string {
  if (!state.databoxEnabled) return chartHtml;
  const dbId = `databox-${chartId}`;
  // DataBox attributes — name, source, date are required
  // (DSFR Chart 2.1.0 renamed `title` to `name`)
  const dbAttrs: string[] = [`id="${dbId}"`];
  dbAttrs.push(`name="${escapeHtml(state.databoxTitle || ' ')}"`);
  dbAttrs.push(`source="${escapeHtml(state.databoxSource || ' ')}"`);
  dbAttrs.push(`date="${escapeHtml(state.databoxDate || new Date().toISOString().split('T')[0])}"`);
  if (state.databoxDownload) dbAttrs.push('download');
  if (state.databoxScreenshot) dbAttrs.push('screenshot');
  if (state.databoxFullscreen) dbAttrs.push('fullscreen');
  if (state.databoxTrend) dbAttrs.push(`trend="${escapeHtml(state.databoxTrend)}"`);
  dbAttrs.push('segmented-control');

  // Add databox-id, databox-type, databox-source on the chart element
  const chartWithDbAttrs = chartHtml.replace(
    /(<\w[\w-]*)(\s)/,
    `$1 databox-id="${dbId}" databox-type="chart" databox-source="default"$2`
  );

  // DataBox and chart must be SIBLINGS (not parent-child).
  // DataBox uses Vue Teleport: it creates container divs, then chart teleports into them.
  // A hidden table stub lets DataBox create the table container for segmented control.
  return `<data-box ${dbAttrs.join('\n    ')}></data-box>\n  ${chartWithDbAttrs}\n  <div databox-id="${dbId}" databox-type="table" databox-source="default" style="display:none"></div>`;
}

/**
 * Fetch all results from an ODS API URL, handling pagination automatically.
 * ODS APIs cap at 100 records per request. When the URL requests more,
 * this function uses offset-based pagination to accumulate all results.
 */
async function fetchOdsResults(baseUrl: string): Promise<Record<string, unknown>[]> {
  const url = new URL(baseUrl);
  const requestedLimit = parseInt(url.searchParams.get('limit') || '0', 10);

  // limit <= 0 means "fetch all" with auto-pagination
  // limit <= 100 means single page (no pagination needed)
  if (requestedLimit > 0 && requestedLimit <= ODS_PAGE_SIZE) {
    const response = await fetch(baseUrl);
    const json = await response.json();
    return json.results || [];
  }

  const effectiveLimit = requestedLimit > 0 ? requestedLimit : ODS_MAX_PAGES * ODS_PAGE_SIZE;
  let allResults: Record<string, unknown>[] = [];
  let offset = 0;
  let totalCount = -1;

  for (let page = 0; page < ODS_MAX_PAGES; page++) {
    const remaining = effectiveLimit - allResults.length;
    if (remaining <= 0) break;

    const pageUrl = new URL(baseUrl);
    pageUrl.searchParams.set('limit', String(Math.min(ODS_PAGE_SIZE, remaining)));
    pageUrl.searchParams.set('offset', String(offset));

    const response = await fetch(pageUrl.toString());
    const json = await response.json();
    const pageResults = (json.results || []) as Record<string, unknown>[];
    allResults = allResults.concat(pageResults);

    if (typeof json.total_count === 'number') totalCount = json.total_count;

    if (pageResults.length < ODS_PAGE_SIZE) break;
    if (totalCount >= 0 && allResults.length >= totalCount) break;
    offset += pageResults.length;
  }

  // Verify total_count coherence
  if (totalCount >= 0 && allResults.length < totalCount && allResults.length < effectiveLimit) {
    console.warn(
      `fetchOdsResults: pagination incomplete - ${allResults.length}/${totalCount} resultats`
    );
  }

  return allResults;
}

// DSFR_TAG_MAP imported from @dsfr-data/shared

/** Build DSFR Chart specific attributes from builder state */
function dsfrChartAttrs(): string {
  const extra: string[] = [];
  if (state.chartType === 'horizontalBar') extra.push('horizontal');
  if (state.chartType === 'pie') extra.push('fill');
  if (state.chartType === 'doughnut') {
    /* no fill = donut */
  }
  return extra.map((a) => `\n    ${a}`).join('');
}

/**
 * Palette émise pour le type courant. Une carte veut un dégradé ; un camembert
 * ou un anneau ne se colore par part qu'avec `categorical` (#1174) — toute
 * autre palette donne un disque d'une seule couleur avec DSFR Chart 2.1.1.
 * Le formulaire verrouille déjà ce choix (`applyPiePalette`) ; ceci garantit
 * le code exporté quand l'état vient d'ailleurs (favori, instantané déposé).
 */
export function effectivePalette(): string {
  if (state.chartType === 'map') {
    return state.palette.includes('sequential') || state.palette.includes('divergent')
      ? state.palette
      : 'sequentialAscending';
  }
  if (state.chartType === 'pie' || state.chartType === 'doughnut') return 'categorical';
  // Un podium se colore par rang : `dsfr-data-podium` ne lit que les échelles
  // (dégradés, bicolores) et retombe sur son défaut pour toute autre palette.
  if (state.chartType === 'podium') {
    return state.palette.includes('sequential') || state.palette.includes('divergent')
      ? state.palette
      : 'sequentialDescending';
  }
  return state.palette;
}

/** `champ:Libellé` (alias inline, #668), ou le champ seul si le libellé ne s'y prête pas. */
function aliased(path: string, label: string): string {
  const l = label.trim();
  if (!l || l === path || l.includes(':') || path.includes(':')) return path;
  return `${path}:${l}`;
}

/** Colonnes lues par le composant d'affichage, telles que produites en amont. */
interface VisualSpec {
  source: string;
  labelField: string;
  valueField: string;
  valueField2: string;
  extraValueFields: string[];
  /** Attribut `code-field` déjà mis en forme (cartes), ou chaîne vide. */
  codeFieldAttr: string;
}

/**
 * Le composant d'affichage et son compagnon accessible, pour tout code qui
 * passe par la bibliothèque : chargement dynamique (Grist, API) et données
 * intégrées des formes de #1204. Un seul endroit décide de la balise
 * (`dsfr-data-podium` ou `dsfr-data-chart`) et de ses attributs.
 */
function visualElement(v: VisualSpec): string {
  if (state.chartType === 'podium') {
    return `
  <!-- Podium : les premières valeurs, classées (tri décroissant par le composant) -->
  <dsfr-data-podium
    id="chart"
    source="${v.source}"
    label-field="${v.labelField}"
    value-field="${v.valueField}"
    max-items="${podiumPlaces()}"
    selected-palette="${effectivePalette()}">
  </dsfr-data-podium>${generateA11yElement(v.source, 'chart')}`;
  }

  let extraFieldsAttr = '';
  let nameAttr = `name="${escapeHtml(state.title || state.valueField)}"`;
  if (state.chartType === 'bar-line') {
    // Deux mesures, deux axes : la seconde va dans `value-field-2`, et `name`
    // nomme les barres puis la ligne. En requête avancée, la seconde colonne
    // est le deuxième agrégat écrit : le libellé du formulaire ne la décrit pas.
    const second = v.extraValueFields[0] || v.valueField2;
    if (second) {
      const fromForm = advancedAggregates().length === 0;
      extraFieldsAttr = `\n    value-field-2="${fromForm ? aliased(second, state.lineFieldLabel) : second}"`;
    }
    nameAttr = `name='${jsonAttr(seriesNames().slice(0, 2))}'`;
  } else if (v.extraValueFields.length > 0) {
    extraFieldsAttr = `\n    value-fields="${v.extraValueFields.join(',')}"`;
    // Build séries names from labels
    nameAttr = `name='${jsonAttr(seriesNames())}'`;
  } else if (v.valueField2) {
    extraFieldsAttr = `\n    value-field-2="${v.valueField2}"`;
  }

  return `
  <!-- Graphique DSFR (se met à jour automatiquement) -->
  <dsfr-data-chart
    id="chart"
    source="${v.source}"
    type="${state.chartType === 'horizontalBar' ? 'bar' : state.chartType === 'doughnut' ? 'pie' : state.chartType}"${dsfrChartAttrs()}${v.codeFieldAttr}
    label-field="${v.labelField}"
    value-field="${valueFieldAttr(v.valueField)}"${extraFieldsAttr}
    ${nameAttr}
    selected-palette="${effectivePalette()}"${generateDataboxAttrs()}>
  </dsfr-data-chart>${generateA11yElement(v.source, 'chart')}`;
}

/** Nombre de places du podium : entier entre 1 et 20, sinon le défaut de la bibliothèque. */
export function podiumPlaces(): number {
  const n = Math.round(Number(state.podiumMaxItems));
  return Number.isFinite(n) && n >= 1 && n <= 20 ? n : PODIUM_PLACES_DEFAUT;
}

/**
 * Valeur de `value-field` du graphique exporté : le chemin, suivi de l'alias
 * inline `:Libellé` quand un nom de série est saisi (« Nom affiché »). La
 * légende le montrait déjà via `name` ; le tableau du cadre officiel et le
 * CSV lisent l'alias (#1179). Un libellé qui contient `:` est laissé de côté
 * (c'est le séparateur de la grammaire).
 */
export function valueFieldAttr(path: string): string {
  const label = state.valueFieldLabel.trim();
  if (!label || label === path || label.includes(':') || path.includes(':')) return path;
  return `${path}:${label}`;
}

/**
 * Inline JS helper for ODS pagination in generated code.
 * Handles offset-based pagination (ODS API max 100 records/request).
 */
const ODS_FETCH_HELPER = `// Pagination ODS (max 100 par requête)
async function fetchAllODS(apiUrl) {
  var allResults = [], offset = 0, url = new URL(apiUrl);
  var limit = parseInt(url.searchParams.get('limit') || '100');
  for (var p = 0; p < 10; p++) {
    var rem = limit - allResults.length;
    if (rem <= 0) break;
    var u = new URL(apiUrl);
    u.searchParams.set('limit', String(Math.min(100, rem)));
    u.searchParams.set('offset', String(offset));
    var r = await fetch(u.toString());
    var j = await r.json();
    var d = j.results || [];
    allResults = allResults.concat(d);
    if (d.length < 100 || (j.total_count && allResults.length >= j.total_count)) break;
    offset += d.length;
  }
  return allResults;
}`;

/**
 * DSFR Chart Vue components map-chart and map-chart-reg overwrite `value`
 * and `date` attributes with defaults during Vue mount. This inline script
 * re-applies all attributes after 500ms to work around that.
 * Only needed for map-chart / map-chart-reg — other chart types (bar, line,
 * pie, radar, scatter) do NOT overwrite their attributes.
 */
const DEFERRED_TAGS = new Set(['map-chart', 'map-chart-reg']);

function dsfrDeferredScript(tagName: string): string {
  if (!DEFERRED_TAGS.has(tagName)) return '';
  return `
<script>
(function(){var c=document.querySelector('${tagName}');if(!c)return;var s={};[].forEach.call(c.attributes,function(a){s[a.name]=a.value});customElements.whenDefined('${tagName}').then(function(){setTimeout(function(){Object.keys(s).forEach(function(k){c.setAttribute(k,s[k])})},500)})})();
</script>`;
}

// filterToOdsql and applyLocalFilter imported from @dsfr-data/shared

/**
 * Generate optional middleware elements (dsfr-data-normalize, dsfr-data-facets)
 * to insert between dsfr-data-source and dsfr-data-query/dsfr-data-chart.
 * Returns the generated HTML and the final source ID for downstream components.
 */
/**
 * Options pour le mode de fonctionnement des facettes.
 * - serverFacets: mode serveur ODS (fetch depuis /facets API)
 * - staticValues: valeurs pre-calculees avec WHERE en colon syntax (Tabular/Grist)
 */
export interface FacetsMode {
  serverFacets?: boolean;
  staticValues?: Record<string, string[]>;
  /** Prefix to prepend to field names (e.g. "fields." for Grist without flatten) */
  fieldPrefix?: string;
}

/**
 * Generate a <dsfr-data-facets> element if facets are enabled and configured.
 * Returns the generated HTML and the new source ID for downstream components,
 * or empty string/unchanged sourceId if facets are not enabled.
 */
export function generateFacetsElement(
  sourceId: string,
  mode?: FacetsMode
): { element: string; finalSourceId: string } {
  const activeFields = state.facetsConfig.fields.filter((f) => f.field);
  if (!state.facetsConfig.enabled || activeFields.length === 0) {
    return { element: '', finalSourceId: sourceId };
  }

  const facetsId = 'faceted-data';
  const attrs: string[] = [`source="${sourceId}"`];
  const pfx = mode?.fieldPrefix || '';

  attrs.push(`fields="${activeFields.map((f) => pfx + f.field).join(', ')}"`);

  const labelsWithCustom = activeFields.filter((f) => f.label && f.label !== f.field);
  if (labelsWithCustom.length > 0) {
    attrs.push(
      `labels="${escapeHtml(labelsWithCustom.map((f) => `${pfx}${f.field}:${f.label}`).join(' | '))}"`
    );
  }

  const nonDefaultDisplay = activeFields.filter((f) => f.display !== 'checkbox');
  if (nonDefaultDisplay.length > 0) {
    attrs.push(
      `display="${nonDefaultDisplay.map((f) => `${pfx}${f.field}:${f.display}`).join(' | ')}"`
    );
  }

  const disjunctiveFields = activeFields.filter((f) => f.disjunctive);
  if (disjunctiveFields.length > 0) {
    attrs.push(`disjunctive="${disjunctiveFields.map((f) => pfx + f.field).join(', ')}"`);
  }

  const searchableFields = activeFields.filter((f) => f.searchable);
  if (searchableFields.length > 0) {
    attrs.push(`searchable="${searchableFields.map((f) => pfx + f.field).join(', ')}"`);
  }

  if (state.facetsConfig.maxValues !== 6) {
    attrs.push(`max-values="${state.facetsConfig.maxValues}"`);
  }
  if (state.facetsConfig.sort !== 'count') {
    attrs.push(`sort="${state.facetsConfig.sort}"`);
  }
  if (state.facetsConfig.hideEmpty) {
    attrs.push('hide-empty');
  }

  // Mode server-facets (ODS)
  if (mode?.serverFacets) {
    attrs.push('server-facets');
  }

  // Partage par l'adresse (#714) : un seul reglage produit les deux sens de
  // la synchronisation — `url-params` relit l'adresse au chargement,
  // `url-sync` l'ecrit a chaque changement de filtre.
  if (state.urlSync) {
    attrs.push('url-params');
    attrs.push('url-sync');
    // Champs prefixes (Grist non aplati) : sans correspondance explicite,
    // l'adresse porterait `?fields.region=…`. `url-param-map` la garde
    // lisible ; il doit couvrir TOUS les champs, car des qu'il est renseigne
    // les parametres non mappes sont ignores (dsfr-data-facets).
    if (pfx) {
      attrs.push(
        `url-param-map="${escapeHtml(
          activeFields.map((f) => `${f.field}:${pfx}${f.field}`).join(' | ')
        )}"`
      );
    }
  }

  // Mode static-values (Tabular/Grist) : valeurs pre-calculees
  if (mode?.staticValues) {
    const json = JSON.stringify(mode.staticValues);
    attrs.push(`static-values='${json}'`);
  }

  const element = `
  <!-- Filtres à facettes -->
  <dsfr-data-facets
    id="${facetsId}"
    ${attrs.join('\n    ')}>
  </dsfr-data-facets>`;

  return { element, finalSourceId: facetsId };
}

/**
 * Pre-compute unique values for facet fields from loaded data.
 * Used to generate static-values for non-ODS sources.
 */
export function computeStaticFacetValues(): Record<string, string[]> | null {
  const activeFields = state.facetsConfig.fields.filter((f) => f.field);
  if (!state.facetsConfig.enabled || activeFields.length === 0) return null;
  if (!state.localData || state.localData.length === 0) return null;

  const result: Record<string, string[]> = {};
  for (const fieldConfig of activeFields) {
    const field = fieldConfig.field;
    const uniqueValues = new Set<string>();
    for (const row of state.localData) {
      const val = row[field];
      if (val !== null && val !== undefined && val !== '') {
        uniqueValues.add(String(val));
      }
    }
    if (uniqueValues.size > 0 && uniqueValues.size <= 200) {
      result[field] = [...uniqueValues].sort();
    }
  }
  return Object.keys(result).length > 0 ? result : null;
}

/** Attributs de `dsfr-data-normalize` tels que réglés dans « Nettoyage des données ». */
function normalizeAttrs(sourceId: string): string[] {
  const attrs: string[] = [`source="${sourceId}"`];
  if (state.normalizeConfig.trim) attrs.push('trim');
  if (state.normalizeConfig.numericAuto) attrs.push('numeric-auto');
  if (state.normalizeConfig.numeric)
    attrs.push(`numeric="${escapeHtml(state.normalizeConfig.numeric)}"`);
  if (state.normalizeConfig.rename)
    attrs.push(`rename="${escapeHtml(state.normalizeConfig.rename)}"`);
  if (state.normalizeConfig.stripHtml) attrs.push('strip-html');
  if (state.normalizeConfig.replace)
    attrs.push(`replace="${escapeHtml(state.normalizeConfig.replace)}"`);
  if (state.normalizeConfig.lowercaseKeys) attrs.push('lowercase-keys');
  if (state.normalizeConfig.flatten)
    attrs.push(`flatten="${escapeHtml(state.normalizeConfig.flatten)}"`);
  return attrs;
}

function normalizeElement(sourceId: string, comment: string): string {
  return `
  <!-- ${comment} -->
  <dsfr-data-normalize
    id="normalized-data"
    ${normalizeAttrs(sourceId).join('\n    ')}>
  </dsfr-data-normalize>`;
}

/**
 * Nom d'une colonne APRÈS le nettoyage : `rename` (`ancien:Nouveau | …`), puis
 * `lowercase-keys` — l'ordre de `dsfr-data-normalize`. Sert à remapper
 * `label-field`, `value-field` et les colonnes d'un tableau quand le
 * nettoyage s'applique au résultat agrégé (#1169).
 */
export function cleanedFieldName(field: string): string {
  if (!state.normalizeConfig.enabled || !field) return field;
  let name = field;
  for (const pair of (state.normalizeConfig.rename || '').split('|')) {
    const i = pair.indexOf(':');
    if (i <= 0) continue;
    if (pair.slice(0, i).trim() === name) {
      name = pair.slice(i + 1).trim();
      break;
    }
  }
  return state.normalizeConfig.lowercaseKeys ? name.toLowerCase() : name;
}

/**
 * Nettoyage APRÈS agrégation (#1169) — OpenDataSoft et Tabular en mode
 * dynamique. Le regroupement y est calculé par le serveur sur TOUT le jeu ;
 * le nettoyer avant obligerait à rapatrier les lignes brutes et à agréger dans
 * le navigateur, sur les seules lignes chargées. `dsfr-data-normalize` lit
 * donc la sortie de la query : il nettoie les libellés de groupe et les
 * valeurs agrégées, et son renommage porte sur les colonnes du résultat.
 * Conséquence assumée : deux libellés qui ne diffèrent que par une espace
 * restent deux groupes.
 */
export function generatePostAggregationNormalize(sourceId: string): {
  element: string;
  finalSourceId: string;
} {
  if (!state.normalizeConfig.enabled) return { element: '', finalSourceId: sourceId };
  return {
    element: normalizeElement(sourceId, 'Nettoyage du résultat agrégé par le serveur'),
    finalSourceId: 'normalized-data',
  };
}

export function generateMiddlewareElements(
  sourceId: string,
  facetsMode?: FacetsMode
): { elements: string; finalSourceId: string } {
  let currentSourceId = sourceId;
  let elements = '';

  // dsfr-data-normalize
  if (state.normalizeConfig.enabled) {
    elements += normalizeElement(currentSourceId, 'Nettoyage des données');
    currentSourceId = 'normalized-data';
  }

  // dsfr-data-facets
  const facets = generateFacetsElement(currentSourceId, facetsMode);
  if (facets.element) {
    elements += facets.element;
    currentSourceId = facets.finalSourceId;
  }

  return { elements, finalSourceId: currentSourceId };
}

/**
 * Build the colonnes attribute for dsfr-data-list.
 * Uses custom column config if available, otherwise auto-detects from fields.
 */
function buildColonnesAttr(): string {
  // Use custom columns if configured
  const visibleCols = state.datalistColumns.filter((c) => c.visible);
  if (visibleCols.length > 0) {
    return visibleCols.map((c) => `${c.field}:${c.label}`).join(', ');
  }
  // Fallback: auto-detect from fields or raw data
  const fields =
    state.fields.length > 0
      ? state.fields.map((f) => f.name)
      : state.localData && state.localData.length > 0
        ? Object.keys(state.localData[0])
        : [];
  return fields.map((f) => `${f}:${f}`).join(', ');
}

/**
 * Attribut `select` d'une source Tabular de tableau (#985) : les colonnes que
 * la page lit — colonnes visibles de la liste, champs des facettes, champ de
 * tri —, que l'adaptateur traduit en `columns=` (l'API ne rend alors que ces
 * colonnes : 366 892 → 22 383 octets pour 200 bornes IRVE a trois colonnes,
 * mesure du 2026-09-22).
 *
 * Vide — toutes les colonnes — quand la liste n'a pas de colonnes choisies
 * (elle les affiche toutes) ou quand un nom n'est pas une colonne detectee :
 * une colonne inconnue fait repondre 400 a l'API.
 */
export function buildTabularDatalistSelectAttr(): string {
  const visibleCols = state.datalistColumns.filter((c) => c.visible);
  if (visibleCols.length === 0) return '';
  const known = new Set(state.fields.map((f) => f.name));
  const facetFields = state.facetsConfig.enabled
    ? state.facetsConfig.fields.map((f) => f.field)
    : [];
  const sortField = state.sortOrder === 'none' ? '' : state.sortField || state.labelField;
  const fields = [
    ...new Set(
      [...visibleCols.map((c) => c.field), ...facetFields, sortField]
        .map((f) => (f ?? '').trim())
        .filter(Boolean)
    ),
  ];
  if (fields.length === 0) return '';
  if (known.size === 0 || fields.some((f) => !known.has(f) || f.includes(','))) return '';
  return `\n    select="${escapeHtml(fields.join(', '))}"`;
}

/**
 * Attributs optionnels de la datalist (`search`, `filters`, `export`).
 *
 * `paginationServeur` n'est pas un detail : la recherche et les filtres de
 * `dsfr-data-list` sont LOCAUX. En pagination serveur ils n'opereraient que
 * sur la page chargee — compteurs faux, options de filtre partielles — donc
 * le composant les desactive et journalise un avertissement dans la page de
 * l'utilisateur (#304, `dsfr-data-list.ts:448` et `:502`). Les emettre, c'est
 * promettre deux controles qui n'apparaitront pas et salir sa console.
 */
function buildDatalistAttrs(paginationServeur = false): string {
  let attrs = '';
  if (state.datalistRecherche && !paginationServeur) attrs += '\n    search';
  const exportFormats: string[] = [];
  if (state.datalistExportCsv) exportFormats.push('csv');
  if (state.datalistExportHtml) exportFormats.push('html');
  if (exportFormats.length > 0) attrs += `\n    export="${exportFormats.join(',')}"`;

  const filtrables = state.datalistColumns
    .filter((c) => c.visible && c.filtrable)
    .map((c) => c.field);
  if (state.datalistFiltres && filtrables.length > 0 && !paginationServeur) {
    attrs += `\n    filters="${filtrables.join(',')}"`;
  }
  // Partage par l'adresse (#714) : le numero de page suit l'adresse, dans les
  // deux sens. `url-page-param` n'est emis que s'il s'ecarte du defaut.
  if (state.urlSync) {
    attrs += '\n    url-sync';
    if (state.urlPageParam && state.urlPageParam !== 'page') {
      attrs += `\n    url-page-param="${escapeHtml(state.urlPageParam)}"`;
    }
  }
  return attrs;
}

/**
 * Rappel, dans le code livre, de ce qui remplace la recherche et les filtres
 * locaux quand la pagination est serveur.
 */
function noteRechercheServeur(): string {
  if (!state.datalistRecherche && !state.datalistFiltres) return '';
  return `
  <!-- Pagination serveur : la recherche et les filtres de dsfr-data-list sont
       locaux, ils n'opéreraient que sur la page chargée (#304). Pour porter
       ces contrôles sur TOUT le jeu, insérer en amont de la liste un
       dsfr-data-search server-search et/ou un dsfr-data-facets server-facets. -->`;
}

/**
 * Main orchestrator: reads form state, validates, routes to correct code gen path.
 */
export async function generateChart(): Promise<void> {
  // Get current values from form
  const labelField = document.getElementById('label-field') as HTMLSelectElement | null;
  const valueField = document.getElementById('value-field') as HTMLSelectElement | null;
  const codeField = document.getElementById('code-field') as HTMLSelectElement | null;
  const aggregation = document.getElementById('aggregation') as HTMLSelectElement | null;
  const sortOrder = document.getElementById('sort-order') as HTMLSelectElement | null;
  const sortField = document.getElementById('sort-field') as HTMLSelectElement | null;

  if (labelField) state.labelField = labelField.value;
  if (valueField) state.valueField = valueField.value;
  // Sync valueField2 from extraSeries for backward compat
  state.valueField2 = state.extraSeries.length > 0 ? state.extraSeries[0].field : '';
  state.codeField = codeField?.value || '';
  const lineField = document.getElementById('line-field') as HTMLSelectElement | null;
  if (lineField) state.lineField = lineField.value;
  if (aggregation) state.aggregation = aggregation.value as typeof state.aggregation;
  if (sortOrder) state.sortOrder = sortOrder.value as typeof state.sortOrder;
  if (sortField) state.sortField = sortField.value;

  const isKPI = state.chartType === 'kpi';
  const isGauge = state.chartType === 'gauge';
  const isDatalist = state.chartType === 'datalist';
  const isMap = state.chartType === 'map';
  const isSingleValue = isKPI || isGauge;

  // Validation: datalist only needs labelField, KPI/Gauge need valueField, charts need both
  if (isDatalist && !state.labelField) {
    toastWarning(
      'Il manque la s\u00e9lection des colonnes. Ouvrez la section "Configuration des donn\u00e9es" pour choisir le champ principal du tableau.'
    );
    return;
  }
  if (!isSingleValue && !isDatalist && (!state.labelField || !state.valueField)) {
    const missing =
      !state.labelField && !state.valueField
        ? "les champs pour l'axe X (cat\u00e9gories) et l'axe Y (valeurs num\u00e9riques)"
        : !state.labelField
          ? "le champ pour l'axe X (ex\u00a0: r\u00e9gion, ann\u00e9e)"
          : "le champ pour l'axe Y (ex\u00a0: population, budget)";
    toastWarning(`Il manque ${missing}. Ouvrez la section "Configuration des donn\u00e9es".`);
    return;
  }
  if (state.chartType === 'bar-line' && !state.lineField) {
    toastWarning(
      'Il manque le champ de la ligne. Un graphique « barres + ligne » trace deux mesures : choisissez la seconde dans "Configuration des données".'
    );
    return;
  }
  if (isSingleValue && !state.valueField && state.aggregation !== 'count') {
    toastWarning(
      'Il manque le champ num\u00e9rique \u00e0 mesurer. S\u00e9lectionnez un champ dans "Axe Y / Valeurs" (ex\u00a0: population, budget).'
    );
    return;
  }

  // Datalist: route to local data path (no aggregation needed)
  if (isDatalist) {
    if (state.sourceType === 'saved' && state.localData && state.localData.length > 0) {
      generateChartFromLocalData();
    } else {
      // For API sources, use raw data — limit=200 to fetch all records
      const params = new URLSearchParams({ limit: '200' });
      if (state.advancedMode && state.queryFilter) {
        const odsql = filterToOdsql(state.queryFilter);
        if (odsql) params.set('where', odsql);
      }
      const apiUrl = appendQuery(state.apiUrl, String(params));
      try {
        state.data = await fetchOdsResults(apiUrl);
        state.localData = state.data as Record<string, unknown>[];
        generateCode(apiUrl);
      } catch (error) {
        toastError('Erreur lors du chargement des donn\u00e9es : ' + (error as Error).message);
      }
    }
    return;
  }

  // Check if using local data
  // For ODS API sources, prefer server-side aggregation (more accurate
  // than client-side aggregation on the limited local data sample).
  // Non-ODS APIs (Tabular, Generic) use client-side aggregation because
  // fetchOdsResults() only handles ODS response format (json.results).
  const isOdsApiSource =
    state.savedSource?.type === 'api' &&
    state.apiUrl &&
    detectProvider(state.apiUrl).id === 'opendatasoft';
  if (
    state.sourceType === 'saved' &&
    state.localData &&
    state.localData.length > 0 &&
    !isOdsApiSource
  ) {
    generateChartFromLocalData();
    return;
  }

  // Build API URL with aggregation
  const valueExpression =
    state.aggregation === 'count'
      ? 'count(*) as value'
      : `${state.aggregation}(${state.valueField}) as value`;

  // Handle extra séries if defined
  const activeExtraSeries = tracedExtraSeries(state);
  let extraValueExpressions = '';
  activeExtraSeries.forEach((s, i) => {
    extraValueExpressions += `, ${state.aggregation}(${s.field}) as value${i + 2}`;
  });

  let params: URLSearchParams;
  if (isSingleValue) {
    // KPI/Gauge: just get the single aggregated value, no group_by
    params = new URLSearchParams({
      select: valueExpression,
      limit: '1',
    });
  } else if (isMap) {
    // Map: group by code field — limit=200 to fetch all departments (API default is 10)
    params = new URLSearchParams({
      select: `${state.codeField}, ${valueExpression}`,
      group_by: state.codeField,
      limit: '200',
    });
  } else {
    // Chart: group by label field — limit=200 to fetch all catégories.
    // Requête avancée (#1170) : l'onglet Données montrait la requête du
    // FORMULAIRE, pas celle du code exporté. Même regroupement et mêmes
    // agrégats que l'export, sous les noms que lit l'aperçu (value, value2…).
    const advanced = advancedAggregates();
    const groupBy =
      state.advancedMode && state.queryGroupBy ? state.queryGroupBy : state.labelField;
    const aggSelect =
      advanced.length > 0
        ? advanced.map((a, i) => `${a.func}(${a.field}) as value${i === 0 ? '' : i + 1}`).join(', ')
        : `${valueExpression}${extraValueExpressions}`;
    const baseParams: Record<string, string> = {
      select: `${groupBy}, ${aggSelect}`,
      group_by: groupBy,
      limit: '200',
    };
    // Skip order_by when sortOrder is 'none' (preserve source order)
    if (state.sortOrder !== 'none') {
      const odsSortField =
        state.sortField && state.sortField !== state.valueField ? state.sortField : 'value';
      baseParams.order_by = `${odsSortField} ${state.sortOrder}`;
    }
    params = new URLSearchParams(baseParams);
  }

  // Apply advanced mode filter to API request
  if (state.advancedMode && state.queryFilter) {
    const odsql = filterToOdsql(state.queryFilter);
    if (odsql) params.set('where', odsql);
  }

  const apiUrl = appendQuery(state.apiUrl, String(params));

  try {
    state.data = await fetchOdsResults(apiUrl);
    // Regroupement avancé sur un autre champ que l'axe : l'aperçu lit l'axe.
    const advancedGroup = state.advancedMode && state.queryGroupBy;
    if (advancedGroup && advancedGroup !== state.labelField && !isSingleValue && !isMap) {
      state.data = state.data.map((d) => ({ ...d, [state.labelField]: d[advancedGroup] }));
    }

    // Update raw data view
    const rawDataEl = document.getElementById('raw-data');
    if (rawDataEl) rawDataEl.textContent = JSON.stringify(state.data, null, 2);

    // Generate code: dynamic mode uses dsfr-data-source components, embedded uses inline JS
    if (state.generationMode === 'dynamic' && state.savedSource?.type === 'api') {
      generateDynamicCodeForApi();
    } else {
      generateCode(apiUrl);
    }

    // Update accessible table (only for charts)
    if (!isKPI) {
      updateAccessibleTable();
    }
  } catch (error) {
    console.error(error);
    toastError('Erreur lors du chargement des donn\u00e9es : ' + (error as Error).message);
  }
}

/**
 * Aggregate local data client-side, render, and generate code.
 */
export function generateChartFromLocalData(): void {
  // Datalist: skip aggregation, use raw data
  if (state.chartType === 'datalist') {
    let filteredLocal = state.localData || [];
    if (state.advancedMode && state.queryFilter) {
      filteredLocal = applyLocalFilter(
        filteredLocal as Record<string, unknown>[],
        state.queryFilter
      );
    }
    state.data = filteredLocal as DataRecord[];

    const rawDataEl = document.getElementById('raw-data');
    if (rawDataEl) rawDataEl.textContent = JSON.stringify(state.data, null, 2);

    if (state.generationMode === 'dynamic') {
      if (state.savedSource?.type === 'grist') {
        generateDynamicCode();
      } else if (state.savedSource?.type === 'api') {
        generateDynamicCodeForApi();
      } else {
        generateCodeForLocalData();
      }
    } else {
      generateCodeForLocalData();
    }
    return;
  }

  // Aggregate local data
  const aggregated: Record<string, { values: number[]; extraValues: number[][]; count: number }> =
    {};

  // For maps, aggregate by codeField; for other charts, by labelField
  const isMap = state.chartType === 'map';
  const groupField = isMap ? state.codeField : state.labelField;
  const activeExtraSeries = tracedExtraSeries(state);

  // Apply advanced mode filter to local data
  let filteredLocal = state.localData || [];
  if (state.advancedMode && state.queryFilter) {
    filteredLocal = applyLocalFilter(filteredLocal as Record<string, unknown>[], state.queryFilter);
  }

  if (filteredLocal) {
    filteredLocal.forEach((record) => {
      const rawGroupKey = record[groupField] as string | number | null;
      // For maps, skip records with invalid codes
      if (isMap && (rawGroupKey === null || rawGroupKey === undefined || rawGroupKey === '')) {
        return; // Skip this record
      }
      const groupKey = String(rawGroupKey || 'N/A');
      const value = toNumber(record[state.valueField]);

      if (!aggregated[groupKey]) {
        aggregated[groupKey] = {
          values: [],
          extraValues: activeExtraSeries.map(() => []),
          count: 0,
        };
      }
      aggregated[groupKey].values.push(value);
      activeExtraSeries.forEach((s, i) => {
        aggregated[groupKey].extraValues[i].push(toNumber(record[s.field]));
      });
      aggregated[groupKey].count++;
    });
  }

  // Apply aggregation function
  function applyAgg(vals: number[], count: number): number {
    switch (state.aggregation) {
      case 'sum':
        return vals.reduce((a, b) => a + b, 0);
      case 'count':
        return count;
      case 'min':
        return Math.min(...vals);
      case 'max':
        return Math.max(...vals);
      case 'avg':
      default:
        return vals.reduce((a, b) => a + b, 0) / vals.length;
    }
  }

  const results = Object.entries(aggregated).map(([groupKey, data]) => {
    const value = applyAgg(data.values, data.count);
    const result: Record<string, unknown> = { value };

    // For maps, include codeField; for others, include labelField
    if (isMap) {
      result[state.codeField] = groupKey;
    } else {
      result[state.labelField] = groupKey;
    }

    // Extra séries
    activeExtraSeries.forEach((_, i) => {
      if (data.extraValues[i].length > 0) {
        result[`value${i + 2}`] = applyAgg(data.extraValues[i], data.count);
      }
    });

    return result;
  });

  // Sort (skip entirely when sortOrder === 'none' to preserve source order)
  if (state.sortOrder !== 'none') {
    const sortKey =
      state.sortField && state.sortField !== state.valueField ? state.sortField : 'value';
    const dir = state.sortOrder === 'desc' ? -1 : 1;
    results.sort((a, b) => {
      const va = a[sortKey];
      const vb = b[sortKey];
      const na = Number(va);
      const nb = Number(vb);
      if (!isNaN(na) && !isNaN(nb)) return (na - nb) * dir;
      return String(va ?? '').localeCompare(String(vb ?? '')) * dir;
    });
  }

  state.data = results;

  // Update raw data view
  const rawDataEl = document.getElementById('raw-data');
  if (rawDataEl) rawDataEl.textContent = JSON.stringify(state.data, null, 2);

  // Generate code based on mode
  if (state.generationMode === 'dynamic') {
    if (state.savedSource?.type === 'grist') {
      generateDynamicCode();
    } else if (state.savedSource?.type === 'api') {
      generateDynamicCodeForApi();
    } else {
      generateCodeForLocalData();
    }
  } else {
    generateCodeForLocalData();
  }

  // Update accessible table
  updateAccessibleTable();
}

/** Le type courant passe-t-il par la bibliothèque même en données intégrées ? (#1204) */
export function usesLibEmbedded(): boolean {
  return LIB_RENDERED_TYPES.includes(state.chartType);
}

/**
 * Données intégrées, rendues par la bibliothèque (#1204) : les lignes agrégées
 * sont écrites dans `<dsfr-data-source data='…'>`, et le composant
 * (`dsfr-data-podium`, `dsfr-data-chart type="bar-line"`…) les lit comme il
 * lirait une source distante. Même balisage que le chargement dynamique : la
 * forme ne dépend plus du mode de génération.
 */
export function generateEmbeddedLibCode(): void {
  const traced = tracedExtraSeries(state);
  const round = (v: unknown): number => Math.round((Number(v) || 0) * 100) / 100;
  const rows = state.data.map((d) => {
    const row: Record<string, unknown> = { ...d, value: round(d.value) };
    traced.forEach((_, i) => {
      row[`value${i + 2}`] = round(d[`value${i + 2}`]);
    });
    return row;
  });
  const isPodium = state.chartType === 'podium';
  const objet = isPodium ? 'Podium' : 'Graphique';
  const chartDeps = isPodium ? '' : `\n<link rel="stylesheet" href="${CDN_URLS.dsfrChartCss}">`;
  const chartJs = isPodium ? '' : `\n<script type="module" src="${CDN_URLS.dsfrChartJs}"></script>`;

  const code = `<!-- ${objet} généré avec dsfr-data Builder -->
<!-- Doc des composants : ${PROXY_BASE_URL_EMBED}/specs/ -->
<!-- Source : ${escapeHtml(state.savedSource?.name || 'Données locales')} (données intégrées) -->

<!-- Dépendances CSS (DSFR) -->
<link rel="stylesheet" href="${CDN_URLS.dsfrCss}">
<link rel="stylesheet" href="${CDN_URLS.dsfrUtilityCss}">${chartDeps}

<!-- Dépendances JS -->${chartJs}
<script src="${LIB_URL}/dsfr-data.core.umd.js"></script>

<div class="fr-container fr-my-4w">
  ${state.title ? `<h2>${escapeHtml(state.title)}</h2>` : ''}
  ${state.subtitle ? `<p class="fr-text--sm fr-text--light">${escapeHtml(state.subtitle)}</p>` : ''}

  <!-- Données intégrées (déjà regroupées et agrégées) -->
  <dsfr-data-source id="chart-data" data='${jsonAttr(rows)}'></dsfr-data-source>
${visualElement({
  source: 'chart-data',
  labelField: state.labelField,
  valueField: 'value',
  valueField2: '',
  extraValueFields: traced.map((_, i) => `value${i + 2}`),
  codeFieldAttr: '',
}).replace(/^\n/, '')}
</div>`;
  displayGeneratedCode(code);
}

/**
 * Generate embedded HTML+JS code for local data.
 */
export function generateCodeForLocalData(): void {
  // Formes rendues par la bibliothèque dans tous les modes (#1204)
  if (usesLibEmbedded()) {
    generateEmbeddedLibCode();
    return;
  }

  // Handle KPI type
  if (state.chartType === 'kpi') {
    const value = state.data[0]?.value || 0;
    const variantSelect = document.getElementById('kpi-variant') as HTMLSelectElement | null;
    const unitInput = document.getElementById('kpi-unit') as HTMLInputElement | null;
    const variant = variantSelect?.value || '';
    const unit = unitInput?.value || '';

    const code = `<!-- KPI g\u00e9n\u00e9r\u00e9 avec dsfr-data Builder -->
<!-- Source : ${state.savedSource?.name || 'Donn\u00e9es locales'} -->

<!-- D\u00e9pendances CSS (DSFR) -->
<link rel="stylesheet" href="${CDN_URLS.dsfrCss}">
<link rel="stylesheet" href="${CDN_URLS.dsfrUtilityCss}">

<style>
.kpi-card {
  background: var(--background-default-grey);
  border-left: 4px solid var(--border-default-grey);
  padding: 1.5rem 2rem;
  text-align: center;
  border-radius: 4px;
}
.kpi-card--info { border-left-color: #0063CB; }
.kpi-card--success { border-left-color: #18753C; }
.kpi-card--warning { border-left-color: #D64D00; }
.kpi-card--error { border-left-color: #C9191E; }
.kpi-value { display: block; font-size: 2.5rem; font-weight: 700; color: var(--text-title-grey); }
.kpi-label { display: block; font-size: 0.875rem; color: var(--text-mention-grey); margin-top: 0.5rem; }
</style>

<div class="fr-container fr-my-4w">
  <div class="kpi-card${variant ? ' kpi-card--' + variant : ''}">
    <span class="kpi-value">${formatKPIValue(value, unit)}</span>
    <span class="kpi-label">${escapeHtml(state.title)}</span>
  </div>
</div>`;
    displayGeneratedCode(code);
    return;
  }

  // Handle Gauge type (local data)
  if (state.chartType === 'gauge') {
    const value = Math.round(state.data[0]?.value || 0);
    const code = `<!-- Jauge g\u00e9n\u00e9r\u00e9e avec dsfr-data Builder -->
<!-- Source : ${state.savedSource?.name || 'Donn\u00e9es locales'} -->

<!-- D\u00e9pendances (DSFR Chart) -->
<link rel="stylesheet" href="${CDN_URLS.dsfrCss}">
<link rel="stylesheet" href="${CDN_URLS.dsfrChartCss}">
<script type="module" src="${CDN_URLS.dsfrChartJs}"></script>

<div class="fr-container fr-my-4w">
  <h2>${escapeHtml(state.title)}</h2>
  ${state.subtitle ? `<p class="fr-text--sm fr-text--light">${escapeHtml(state.subtitle)}</p>` : ''}
  <gauge-chart percent="${value}" init="0" target="100"></gauge-chart>
</div>`;
    displayGeneratedCode(code);
    return;
  }

  // Handle Datalist type (local data)
  if (state.chartType === 'datalist') {
    const colonnes = buildColonnesAttr();
    const triAttr = buildDatalistTriAttr();
    const code = `<!-- Tableau généré avec dsfr-data Builder -->
<!-- Doc des composants : ${PROXY_BASE_URL_EMBED}/specs/ -->
<!-- Source : ${state.savedSource?.name || 'Données locales'} -->

<!-- Dépendances CSS (DSFR) -->
<link rel="stylesheet" href="${CDN_URLS.dsfrCss}">
<link rel="stylesheet" href="${CDN_URLS.dsfrUtilityCss}">

<!-- Dépendances JS -->
<script src="${LIB_URL}/dsfr-data.core.umd.js"></script>

<div class="fr-container fr-my-4w">
  ${state.title ? `<h2>${escapeHtml(state.title)}</h2>` : ''}
  ${state.subtitle ? `<p class="fr-text--sm fr-text--light">${escapeHtml(state.subtitle)}</p>` : ''}

  <dsfr-data-list
    id="my-table"
    columns="${colonnes}"${buildDatalistAttrs()}${triAttr}
    pagination="10">
  </dsfr-data-list>${generateEmbeddedA11y('my-table')}
</div>

<script>
// Données integrees
const data = ${jsonLiteral(state.localData?.slice(0, 500) || [])};

// Injecter les données dans le composant
const datalist = document.getElementById('my-table');
datalist.onSourceData(data);
</script>`;
    displayGeneratedCode(code);
    return;
  }

  // Handle Scatter type (local data)
  if (state.chartType === 'scatter') {
    const xValues = state.data.map((d) => (d[state.labelField] as number) || 0);
    const yValues = state.data.map((d) => (d.value as number) || 0);
    const code = `<!-- Nuage de points généré avec dsfr-data Builder -->
<!-- Doc des composants : ${PROXY_BASE_URL_EMBED}/specs/ -->
<!-- Source : ${state.savedSource?.name || 'Données locales'} -->

<link rel="stylesheet" href="${CDN_URLS.dsfrCss}">
<link rel="stylesheet" href="${CDN_URLS.dsfrChartCss}">
<script type="module" src="${CDN_URLS.dsfrChartJs}"></script>${a11yDep()}

<div class="fr-container fr-my-4w">
  <h2>${escapeHtml(state.title)}</h2>

  ${wrapWithDatabox(
    `<scatter-chart id="chart"
    x='${jsonAttr([xValues])}'
    y='${jsonAttr([yValues])}'
    name='${jsonAttr([`${state.labelField} vs ${state.valueField}`])}'
    selected-palette="${state.palette}">
  </scatter-chart>`,
    'chart'
  )}${generateEmbeddedA11y('chart')}
</div>${dsfrDeferredScript('scatter-chart')}`;
    displayGeneratedCode(code);
    return;
  }

  // Handle Map type (local data)
  if (state.chartType === 'map') {
    // For choropleth maps, use sequential or divergent palette for gradient
    const mapPalette =
      state.palette.includes('sequential') || state.palette.includes('divergent')
        ? state.palette
        : 'sequentialAscending';

    // Transform data to DSFR format: {"code": value, ...}
    const mapData: Record<string, number> = {};
    let totalValue = 0;
    let count = 0;

    state.data.forEach((d) => {
      const rawCode = (d[state.codeField] ?? d.code ?? '') as string | number;
      let code = String(rawCode).trim();
      code = normalizeDeptCode(code);
      const value = (d.value as number) || 0;
      if (isValidDeptCode(code) && !isNaN(value)) {
        mapData[code] = Math.round(value * 100) / 100;
        totalValue += value;
        count++;
      }
    });

    const avgValue = count > 0 ? Math.round((totalValue / count) * 100) / 100 : 0;
    const today = new Date().toISOString().split('T')[0];

    const mapCode = `<!-- Carte g\u00e9n\u00e9r\u00e9e avec dsfr-data Builder -->
<!-- Source : ${state.savedSource?.name || 'Donn\u00e9es locales'} -->
<!-- Palette: ${mapPalette} -->

<!-- D\u00e9pendances CSS (DSFR) -->
<link rel="stylesheet" href="${CDN_URLS.dsfrCss}">
<link rel="stylesheet" href="${CDN_URLS.dsfrUtilityCss}">
<link rel="stylesheet" href="${CDN_URLS.dsfrChartCss}">
<script type="module" src="${CDN_URLS.dsfrChartJs}"></script>${a11yDep()}

<div class="fr-container fr-my-4w">
  <h2>${escapeHtml(state.title)}</h2>
  ${state.subtitle ? `<p class="fr-text--sm fr-text--light">${escapeHtml(state.subtitle)}</p>` : ''}
  ${wrapWithDatabox(
    `<map-chart id="chart"
    data='${jsonAttr(mapData)}'
    name="${escapeHtml(state.title || 'Donn\u00e9es')}"
    date="${today}"
    value="${avgValue}"
    selected-palette="${mapPalette}"
  ></map-chart>`,
    'chart'
  )}${generateEmbeddedA11y('chart')}
</div>${dsfrDeferredScript('map-chart')}`;
    displayGeneratedCode(mapCode);
    return;
  }

  // Build DSFR Chart element for static embed
  const labels = state.data.map((d) => (d[state.labelField] as string) || 'N/A');
  const values = state.data.map((d) => Math.round(((d.value as number) || 0) * 100) / 100);

  const activeExtraSeries = tracedExtraSeries(state);
  const allSeriesValues: number[][] = [values];
  const allSeriesNames: string[] = [state.valueFieldLabel || state.valueField];

  activeExtraSeries.forEach((s, i) => {
    allSeriesValues.push(
      state.data.map((d) => Math.round(((d[`value${i + 2}`] as number) || 0) * 100) / 100)
    );
    allSeriesNames.push(s.label || s.field);
  });

  const dsfrTag = DSFR_TAG_MAP[state.chartType] || 'bar-chart';
  const x = JSON.stringify([labels]);
  const y = allSeriesValues.length > 1 ? JSON.stringify(allSeriesValues) : JSON.stringify([values]);
  // Un camembert nomme ses parts, pas sa série : avec un seul nom, DSFR Chart
  // complétait la légende en « Série 2 … Série N » (#1174).
  const isPie = state.chartType === 'pie' || state.chartType === 'doughnut';
  const seriesNames = JSON.stringify(isPie ? labels : allSeriesNames);

  // Build extra attributes
  const extraAttrs: string[] = [];
  if (state.chartType === 'horizontalBar') extraAttrs.push('horizontal');
  if (state.chartType === 'pie') extraAttrs.push('fill');
  const extraStr = extraAttrs.map((a) => `\n    ${a}`).join('');

  const code = `<!-- Graphique généré avec dsfr-data Builder -->
<!-- Doc des composants : ${PROXY_BASE_URL_EMBED}/specs/ -->
<!-- Source : ${state.savedSource?.name || 'Données locales'} -->

<!-- Dépendances (DSFR + DSFR Chart) -->
<link rel="stylesheet" href="${CDN_URLS.dsfrCss}">
<link rel="stylesheet" href="${CDN_URLS.dsfrUtilityCss}">
<link rel="stylesheet" href="${CDN_URLS.dsfrChartCss}">
<script type="module" src="${CDN_URLS.dsfrChartJs}"></script>${a11yDep()}

<div class="fr-container fr-my-4w">
  <h2>${escapeHtml(state.title)}</h2>
  ${state.subtitle ? `<p class="fr-text--sm fr-text--light">${escapeHtml(state.subtitle)}</p>` : ''}

  ${wrapWithDatabox(
    `<${dsfrTag} id="chart"
    x='${singleQuoteAttr(x)}'
    y='${singleQuoteAttr(y)}'
    name='${singleQuoteAttr(seriesNames)}'
    selected-palette="${effectivePalette()}"${extraStr}>
  </${dsfrTag}>`,
    'chart'
  )}${generateEmbeddedA11y('chart')}
</div>${dsfrDeferredScript(dsfrTag)}`;

  displayGeneratedCode(code);
}

/**
 * Generate <dsfr-data-source> + <dsfr-data-query> for ODS sources.
 * Uses server-side aggregation (ODSQL) with automatic pagination.
 */
export function generateOdsQueryCode(
  odsInfo: { baseUrl: string; datasetId: string },
  labelFieldPath: string,
  valueFieldPath: string
): {
  queryElement: string;
  chartSource: string;
  labelField: string;
  valueField: string;
  valueField2: string;
  extraValueFields: string[];
} {
  // --- dsfr-data-source attributes (fetch + server-side processing) ---
  const srcAttrs: string[] = [];
  srcAttrs.push('api-type="opendatasoft"');
  srcAttrs.push(`base-url="${odsInfo.baseUrl}"`);
  srcAttrs.push(`dataset-id="${odsInfo.datasetId}"`);

  // Group by
  const groupByField =
    state.advancedMode && state.queryGroupBy ? state.queryGroupBy : labelFieldPath;
  if (groupByField) {
    srcAttrs.push(`group-by="${groupByField}"`);
  }

  // Build ODSQL select clause with aggregation
  let resultValueField: string;
  let resultValueField2 = '';
  const selectParts: string[] = [];
  if (groupByField) selectParts.push(groupByField);

  const activeExtraSeries = tracedExtraSeries(state);
  const extraValueFields: string[] = [];

  const advanced = advancedAggregates();
  if (advanced.length > 0) {
    // Requête avancée (#1170) : chaque agrégat est sélectionné ET tracé.
    for (const a of advanced) selectParts.push(`${a.func}(${a.field}) as ${a.alias}`);
    resultValueField = advanced[0].alias;
    extraValueFields.push(...extraTraced(advanced));
    if (extraValueFields.length > 0) resultValueField2 = extraValueFields[0];
  } else {
    // Standard mode: use form aggregation
    if (state.aggregation === 'count') {
      selectParts.push('count(*) as count');
      resultValueField = 'count';
    } else {
      const alias = `${valueFieldPath}__${state.aggregation}`;
      selectParts.push(`${state.aggregation}(${valueFieldPath}) as ${alias}`);
      resultValueField = alias;

      // Add extra séries aggregations
      activeExtraSeries.forEach((s) => {
        const aliasN = `${s.field}__${state.aggregation}`;
        selectParts.push(`${state.aggregation}(${s.field}) as ${aliasN}`);
        extraValueFields.push(aliasN);
      });
      if (extraValueFields.length > 0) resultValueField2 = extraValueFields[0];
    }
  }
  srcAttrs.push(`select="${escapeHtml(selectParts.join(', '))}"`);

  // Where / filter (static clause on source)
  if (state.advancedMode && state.queryFilter) {
    const odsql = filterToOdsql(state.queryFilter);
    if (odsql) srcAttrs.push(`where="${escapeHtml(odsql)}"`);
  }

  // --- dsfr-data-query attributes (client-side post-processing) ---
  const qAttrs: string[] = [];
  qAttrs.push('source="chart-src"');
  const odsSortField = resolveSortField(resultValueField);
  if (odsSortField) {
    qAttrs.push(`order-by="${escapeHtml(odsSortField)}:${escapeHtml(state.sortOrder)}"`);
  }

  const queryElement = `
  <!-- Source ODS avec agrégation serveur et pagination automatique -->
  <dsfr-data-source
    id="chart-src"
    ${srcAttrs.join('\n    ')}>
  </dsfr-data-source>
  <dsfr-data-query
    id="query-data"
    ${qAttrs.join('\n    ')}>
  </dsfr-data-query>`;

  return {
    queryElement,
    chartSource: 'query-data',
    labelField: groupByField,
    valueField: resultValueField,
    valueField2: resultValueField2,
    extraValueFields,
  };
}

/**
 * Generate <dsfr-data-source> + <dsfr-data-query> for Tabular API sources.
 * Source handles pagination (up to 50K records), query handles client-side aggregation.
 */
export function generateTabularQueryCode(
  tabularInfo: { baseUrl: string; resourceId: string },
  labelFieldPath: string,
  valueFieldPath: string
): {
  queryElement: string;
  chartSource: string;
  labelField: string;
  valueField: string;
  valueField2: string;
  extraValueFields: string[];
} {
  // --- dsfr-data-source attributes (fetch + auto-pagination) ---
  const srcAttrs: string[] = [];
  srcAttrs.push('api-type="tabular"');
  srcAttrs.push(`base-url="${tabularInfo.baseUrl}"`);
  srcAttrs.push(`resource="${tabularInfo.resourceId}"`);

  // --- dsfr-data-query attributes (client-side aggregation) ---
  const qAttrs: string[] = [];
  qAttrs.push('source="chart-src"');

  // Group by
  const groupByField =
    state.advancedMode && state.queryGroupBy ? state.queryGroupBy : labelFieldPath;
  if (groupByField) {
    qAttrs.push(`group-by="${groupByField}"`);
  }

  // Aggregation (colon syntax for client-side processing)
  let resultValueField: string;
  let resultValueField2 = '';
  let aggregateExpr: string;

  const activeExtraSeries = tracedExtraSeries(state);
  const extraValueFields: string[] = [];

  const advanced = advancedAggregates();
  if (advanced.length > 0) {
    // Requête avancée (#1170) : chaque agrégat est tracé, alias compris.
    aggregateExpr = advanced.map(colonAggregate).join(', ');
    resultValueField = advanced[0].alias;
    extraValueFields.push(...extraTraced(advanced));
    if (extraValueFields.length > 0) resultValueField2 = extraValueFields[0];
  } else {
    aggregateExpr = `${valueFieldPath}:${state.aggregation}`;
    resultValueField = `${valueFieldPath}__${state.aggregation}`;

    activeExtraSeries.forEach((s) => {
      const info = state.fields.find((f) => f.name === s.field);
      const path = info?.fullPath || s.field;
      aggregateExpr += `, ${path}:${state.aggregation}`;
      extraValueFields.push(`${path}__${state.aggregation}`);
    });
    if (extraValueFields.length > 0) resultValueField2 = extraValueFields[0];
  }
  qAttrs.push(`aggregate="${escapeHtml(aggregateExpr)}"`);

  // Filter (colon syntax)
  if (state.advancedMode && state.queryFilter) {
    qAttrs.push(`filter="${escapeHtml(state.queryFilter)}"`);
  }

  // Order by
  const tabularSortField = resolveSortField(resultValueField);
  if (tabularSortField) {
    qAttrs.push(`order-by="${escapeHtml(tabularSortField)}:${escapeHtml(state.sortOrder)}"`);
  }

  const queryElement = `
  <!-- Source Tabular avec pagination automatique -->
  <dsfr-data-source
    id="chart-src"
    ${srcAttrs.join('\n    ')}>
  </dsfr-data-source>
  <!-- Agrégation client-side -->
  <dsfr-data-query
    id="query-data"
    ${qAttrs.join('\n    ')}>
  </dsfr-data-query>`;

  return {
    queryElement,
    chartSource: 'query-data',
    labelField: groupByField,
    valueField: resultValueField,
    valueField2: resultValueField2,
    extraValueFields,
  };
}

/**
 * Generate dsfr-data-query HTML for dynamic mode.
 * Always generates a <dsfr-data-query> to handle aggregation, sorting and filtering.
 * Returns { queryElement, chartSource, labelField, valueField }.
 */
export function generateDsfrDataQueryCode(
  sourceId: string,
  labelFieldPath: string,
  valueFieldPath: string
): {
  queryElement: string;
  chartSource: string;
  labelField: string;
  valueField: string;
  valueField2: string;
  extraValueFields: string[];
} {
  const attrs: string[] = [];
  attrs.push(`source="${sourceId}"`);

  // Group by: advanced custom field or default labelField
  const groupByField =
    state.advancedMode && state.queryGroupBy ? state.queryGroupBy : labelFieldPath;
  if (groupByField) {
    attrs.push(`group-by="${groupByField}"`);
  }

  // Filters (advanced mode only)
  if (state.advancedMode && state.queryFilter) {
    attrs.push(`filter="${escapeHtml(state.queryFilter)}"`);
  }

  // Aggregations: advanced custom or default from form
  let aggregateExpr: string;
  let sortField: string;
  let resultValueField: string;
  let resultValueField2 = '';

  const activeExtraSeries = tracedExtraSeries(state);
  const extraValueFields: string[] = [];

  const advanced = advancedAggregates();
  if (advanced.length > 0) {
    // Requête avancée (#1170) : chaque agrégat est tracé, alias compris.
    aggregateExpr = advanced.map(colonAggregate).join(', ');
    sortField = advanced[0].alias;
    resultValueField = sortField;
    extraValueFields.push(...extraTraced(advanced));
    if (extraValueFields.length > 0) resultValueField2 = extraValueFields[0];
  } else {
    aggregateExpr = `${valueFieldPath}:${state.aggregation}`;
    // Add extra séries aggregations
    activeExtraSeries.forEach((s) => {
      const info = state.fields.find((f) => f.name === s.field);
      const path = info?.fullPath || s.field;
      aggregateExpr += `, ${path}:${state.aggregation}`;
      extraValueFields.push(`${path}__${state.aggregation}`);
    });
    if (extraValueFields.length > 0) resultValueField2 = extraValueFields[0];
    sortField = `${valueFieldPath}__${state.aggregation}`;
    resultValueField = sortField;
  }
  attrs.push(`aggregate="${escapeHtml(aggregateExpr)}"`);

  // Sort
  const dynSortField = resolveSortField(sortField);
  if (dynSortField) {
    attrs.push(`order-by="${escapeHtml(dynSortField)}:${escapeHtml(state.sortOrder)}"`);
  }

  const comment = state.advancedMode
    ? '<!-- Requête avancée (filtrage et agrégation) -->'
    : '<!-- Agrégation et tri des données -->';

  const queryElement = `
  ${comment}
  <dsfr-data-query
    id="query-data"
    ${attrs.join('\n    ')}>
  </dsfr-data-query>`;

  return {
    queryElement,
    chartSource: 'query-data',
    labelField: groupByField,
    valueField: resultValueField,
    valueField2: resultValueField2,
    extraValueFields,
  };
}

/**
 * Generate code using dsfr-data-source + dsfr-data-chart for Grist sources.
 */
export function generateDynamicCode(): void {
  const source = state.savedSource;
  if (!source || source.type !== 'grist') return;

  // URL Grist reelle + proxy-url declaratif (#340) : on n'inline plus l'URL
  // proxifiee complete (domaine opaque). L'integrateur voit l'URL Grist source
  // et un proxy-url qu'il peut remplacer par son propre domaine de proxy.
  const gristProvider = getProvider('grist');
  let realUrl = source.apiUrl || '';
  let gristHost = 'Grist';
  let knownHost = false;

  for (const host of gristProvider.knownHosts) {
    if (source.apiUrl?.includes(host.hostname)) {
      realUrl = `https://${host.hostname}/api/docs/${source.documentId}/tables/${source.tableId}/records`;
      gristHost = host.hostname;
      knownHost = true;
      break;
    }
  }

  // Hote gouv/SaaS (pas de CORS navigateur) -> emettre proxy-url si un domaine
  // de proxy est bake. Instances self-hosted (CORS ouvert) : pas de proxy-url.
  const proxyAttr =
    knownHost && PROXY_BASE_URL_EMBED ? `\n    proxy-url="${PROXY_BASE_URL_EMBED}"` : '';
  const proxyComment = proxyAttr
    ? `  <!-- proxy-url : domaine du proxy CORS (${gristHost} ne supporte pas le CORS navigateur).\n       À REMPLACER par votre propre domaine de proxy en production. -->\n`
    : '';

  // Get field info for labels
  const labelFieldInfo = state.fields.find((f) => f.name === state.labelField);
  const valueFieldInfo = state.fields.find((f) => f.name === state.valueField);

  // After normalize flatten, data has flat field names (not nested fields.X)
  const isFlattened = state.normalizeConfig.enabled && !!state.normalizeConfig.flatten;
  const labelFieldPath = isFlattened
    ? state.labelField
    : labelFieldInfo?.fullPath || `fields.${state.labelField}`;
  const valueFieldPath = isFlattened
    ? state.valueField
    : valueFieldInfo?.fullPath || `fields.${state.valueField}`;

  const refreshAttr = state.refreshInterval > 0 ? `\n    refresh="${state.refreshInterval}"` : '';

  // Grist data has {fields: {X: ...}} structure — prefix facet field paths when not flattened
  const gristFacetsMode: FacetsMode | undefined = isFlattened
    ? undefined
    : { fieldPrefix: 'fields.' };

  // Handle KPI type (no DSFR Chart equivalent, fallback to embedded)
  if (state.chartType === 'kpi') {
    generateCodeForLocalData();
    return;
  }

  // Handle Datalist type (Grist dynamic)
  if (state.chartType === 'datalist') {
    const colonnes = buildColonnesAttr();
    const triAttr = buildDatalistTriAttr();
    const { elements: middlewareHtml, finalSourceId: datalistSource } = generateMiddlewareElements(
      'table-data',
      gristFacetsMode
    );
    const code = `<!-- Tableau dynamique généré avec dsfr-data Builder -->
<!-- Doc des composants : ${PROXY_BASE_URL_EMBED}/specs/ -->
<!-- Source : ${escapeHtml(source.name)} (chargement dynamique depuis ${gristHost}) -->

<!-- Dépendances CSS (DSFR) -->
<link rel="stylesheet" href="${CDN_URLS.dsfrCss}">
<link rel="stylesheet" href="${CDN_URLS.dsfrUtilityCss}">

<!-- Dépendances JS -->
<script src="${LIB_URL}/dsfr-data.core.umd.js"></script>

<div class="fr-container fr-my-4w">
  ${state.title ? `<h2>${escapeHtml(state.title)}</h2>` : ''}
  ${state.subtitle ? `<p class="fr-text--sm fr-text--light">${escapeHtml(state.subtitle)}</p>` : ''}

${proxyComment}  <dsfr-data-source
    id="table-data"
    url="${realUrl}"${proxyAttr}
    transform="records"${refreshAttr}>
  </dsfr-data-source>
${middlewareHtml}
  <dsfr-data-list
    id="my-datalist"
    source="${datalistSource}"
    columns="${colonnes}"${buildDatalistAttrs()}${triAttr}
    pagination="10">
  </dsfr-data-list>${generateA11yElement(datalistSource, 'my-datalist')}
</div>`;
    displayGeneratedCode(code);
    return;
  }

  // Middleware (normalize, facets) between source and query
  const { elements: middlewareHtml, finalSourceId: querySourceId } = generateMiddlewareElements(
    'chart-data',
    gristFacetsMode
  );

  // For maps, group by codeField (not labelField)
  const isMap = state.chartType === 'map';
  const groupByPath =
    isMap && state.codeField
      ? isFlattened
        ? state.codeField
        : `fields.${state.codeField}`
      : labelFieldPath;

  // Generate dsfr-data-query for aggregation, sorting, filtering
  const {
    queryElement,
    chartSource,
    labelField: queryLabelField,
    valueField: queryValueField,
    valueField2: queryValueField2,
    extraValueFields: queryExtraVFs,
  } = generateDsfrDataQueryCode(querySourceId, groupByPath, valueFieldPath);

  // Map-specific attributes
  const codeFieldAttr = isMap && state.codeField ? `\n    code-field="${state.codeField}"` : '';

  const code = `<!-- Graphique dynamique généré avec dsfr-data Builder -->
<!-- Doc des composants : ${PROXY_BASE_URL_EMBED}/specs/ -->
<!-- Source : ${escapeHtml(source.name)} (chargement dynamique depuis ${gristHost}) -->
${state.advancedMode ? '<!-- Mode avancé activé : filtrage et agrégation via dsfr-data-query -->' : ''}

<!-- Dépendances CSS (DSFR) -->
<link rel="stylesheet" href="${CDN_URLS.dsfrCss}">
<link rel="stylesheet" href="${CDN_URLS.dsfrUtilityCss}">
<link rel="stylesheet" href="${CDN_URLS.dsfrChartCss}">

<!-- Dépendances JS -->
<script type="module" src="${CDN_URLS.dsfrChartJs}"></script>
<script src="${LIB_URL}/dsfr-data.core.umd.js"></script>

<div class="fr-container fr-my-4w">
  ${state.title ? `<h2>${escapeHtml(state.title)}</h2>` : ''}
  ${state.subtitle ? `<p class="fr-text--sm fr-text--light">${escapeHtml(state.subtitle)}</p>` : ''}

  <!-- Source de données (via proxy CORS si proxy-url défini) -->
${proxyComment}  <dsfr-data-source
    id="chart-data"
    url="${realUrl}"${proxyAttr}
    transform="records"${refreshAttr}>
  </dsfr-data-source>
${middlewareHtml}${queryElement}${visualElement({
    source: chartSource,
    labelField: queryLabelField,
    valueField: queryValueField,
    valueField2: queryValueField2,
    extraValueFields: queryExtraVFs,
    codeFieldAttr,
  })}
</div>`;

  displayGeneratedCode(code);
}

/**
 * Generate code using dsfr-data-source + dsfr-data-chart for API sources.
 */
export function generateDynamicCodeForApi(): void {
  const source = state.savedSource;
  if (!source || source.type !== 'api') return;

  // Detect provider and extract resource IDs using centralized infrastructure
  const provider = source.apiUrl ? detectProvider(source.apiUrl) : getProvider('generic');
  const resourceIds = source.apiUrl ? extractResourceIds(source.apiUrl, provider) : null;
  const apiBaseUrl = source.apiUrl ? new URL(source.apiUrl).origin : '';

  // Get field paths — after normalize flatten, data has flat field names
  const labelFieldInfo = state.fields.find((f) => f.name === state.labelField);
  const valueFieldInfo = state.fields.find((f) => f.name === state.valueField);

  const isFlattened = state.normalizeConfig.enabled && !!state.normalizeConfig.flatten;
  const labelFieldPath = isFlattened
    ? state.labelField
    : labelFieldInfo?.fullPath || state.labelField;
  const valueFieldPath = isFlattened
    ? state.valueField
    : valueFieldInfo?.fullPath || state.valueField;

  const refreshAttr = state.refreshInterval > 0 ? `\n    refresh="${state.refreshInterval}"` : '';

  // Handle data path transform
  const transformAttr = source.dataPath ? `\n    transform="${source.dataPath}"` : '';

  // Handle KPI type: use dsfr-data-source + dsfr-data-kpi for ODS/Tabular, fallback to embedded otherwise
  if (state.chartType === 'kpi') {
    if (provider.id === 'opendatasoft' && resourceIds?.datasetId) {
      const selectExpr =
        state.aggregation === 'count'
          ? 'count(*) as value'
          : `${state.aggregation}(${valueFieldPath}) as value`;
      const whereAttr =
        state.advancedMode && state.queryFilter
          ? `\n    where="${escapeHtml(filterToOdsql(state.queryFilter))}"`
          : '';
      const unitInput = document.getElementById('kpi-unit') as HTMLInputElement | null;
      const unit = unitInput?.value || '';
      const formatAttr =
        unit === '%'
          ? ' format="pourcentage"'
          : unit === '\u20ac' || unit === 'EUR'
            ? ' format="euro"'
            : unit
              ? ' format="nombre"'
              : '';
      const code = `<!-- KPI dynamique généré avec dsfr-data Builder -->
<!-- Doc des composants : ${PROXY_BASE_URL_EMBED}/specs/ -->
<!-- Source : ${escapeHtml(source.name)} (agrégation serveur) -->

<!-- Dépendances CSS (DSFR) -->
<link rel="stylesheet" href="${CDN_URLS.dsfrCss}">
<link rel="stylesheet" href="${CDN_URLS.dsfrUtilityCss}">

<!-- Dépendances JS -->
<script src="${LIB_URL}/dsfr-data.core.umd.js"></script>

<div class="fr-container fr-my-4w">
  <dsfr-data-source
    id="kpi-src"
    api-type="opendatasoft"
    base-url="${apiBaseUrl}"
    dataset-id="${resourceIds.datasetId}"
    select="${escapeHtml(selectExpr)}"${whereAttr}${refreshAttr}>
  </dsfr-data-source>
  <dsfr-data-kpi
    source="kpi-src"
    value="value"
    label="${escapeHtml(state.title)}"${formatAttr}>
  </dsfr-data-kpi>
</div>`;
      displayGeneratedCode(code);
      return;
    }
    // Non-ODS: fallback to embedded code with current data
    generateCodeForLocalData();
    return;
  }

  // Handle Datalist type (API dynamic)
  if (state.chartType === 'datalist') {
    const colonnes = buildColonnesAttr();
    const triAttr = buildDatalistTriAttr();

    if (provider.id === 'opendatasoft' && resourceIds?.datasetId) {
      const whereAttr =
        state.advancedMode && state.queryFilter
          ? `\n    where="${escapeHtml(filterToOdsql(state.queryFilter))}"`
          : '';
      // Facettes serveur ODS (fetch depuis l'API /facets)
      const facets = generateFacetsElement('table-query', { serverFacets: true });
      const datalistSource = facets.element ? facets.finalSourceId : 'table-query';
      const code = `<!-- Tableau dynamique généré avec dsfr-data Builder -->
<!-- Doc des composants : ${PROXY_BASE_URL_EMBED}/specs/ -->
<!-- Source : ${escapeHtml(source.name)} (pagination serveur : une page à la fois) -->

<!-- Dépendances CSS (DSFR) -->
<link rel="stylesheet" href="${CDN_URLS.dsfrCss}">
<link rel="stylesheet" href="${CDN_URLS.dsfrUtilityCss}">

<!-- Dépendances JS -->
<script src="${LIB_URL}/dsfr-data.core.umd.js"></script>

<div class="fr-container fr-my-4w">
  ${state.title ? `<h2>${escapeHtml(state.title)}</h2>` : ''}
  ${state.subtitle ? `<p class="fr-text--sm fr-text--light">${escapeHtml(state.subtitle)}</p>` : ''}

  <dsfr-data-source
    id="table-data"
    api-type="opendatasoft"
    base-url="${apiBaseUrl}"
    dataset-id="${resourceIds!.datasetId}"${whereAttr}
    server-side
    page-size="20">
  </dsfr-data-source>
  <dsfr-data-query
    id="table-query"
    source="table-data">
  </dsfr-data-query>
${facets.element}${noteRechercheServeur()}
  <dsfr-data-list
    id="my-datalist"
    source="${datalistSource}"
    columns="${colonnes}"${buildDatalistAttrs(true)}${triAttr}
    server-sort
    pagination="20">
  </dsfr-data-list>${generateA11yElement(datalistSource, 'my-datalist')}
</div>`;
      displayGeneratedCode(code);
      return;
    }

    if (provider.id === 'tabular' && resourceIds?.resourceId) {
      const filterAttr =
        state.advancedMode && state.queryFilter
          ? `\n    where="${escapeHtml(state.queryFilter)}"`
          : '';
      // Facettes pre-calculees (Tabular ne supporte pas les facettes serveur)
      const staticVals = computeStaticFacetValues();
      const facets = generateFacetsElement(
        'table-query',
        staticVals ? { staticValues: staticVals } : undefined
      );
      const datalistSource = facets.element ? facets.finalSourceId : 'table-query';
      const code = `<!-- Tableau dynamique généré avec dsfr-data Builder -->
<!-- Doc des composants : ${PROXY_BASE_URL_EMBED}/specs/ -->
<!-- Source : ${escapeHtml(source.name)} (pagination serveur : une page à la fois) -->

<!-- Dépendances CSS (DSFR) -->
<link rel="stylesheet" href="${CDN_URLS.dsfrCss}">
<link rel="stylesheet" href="${CDN_URLS.dsfrUtilityCss}">

<!-- Dépendances JS -->
<script src="${LIB_URL}/dsfr-data.core.umd.js"></script>

<div class="fr-container fr-my-4w">
  ${state.title ? `<h2>${escapeHtml(state.title)}</h2>` : ''}
  ${state.subtitle ? `<p class="fr-text--sm fr-text--light">${escapeHtml(state.subtitle)}</p>` : ''}

  <dsfr-data-source
    id="table-data"
    api-type="tabular"
    base-url="${apiBaseUrl}"
    resource="${resourceIds!.resourceId}"${filterAttr}${buildTabularDatalistSelectAttr()}
    server-side
    page-size="20">
  </dsfr-data-source>
  <dsfr-data-query
    id="table-query"
    source="table-data">
  </dsfr-data-query>
${facets.element}${noteRechercheServeur()}
  <dsfr-data-list
    id="my-datalist"
    source="${datalistSource}"
    columns="${colonnes}"${buildDatalistAttrs(true)}${triAttr}
    server-sort
    pagination="20">
  </dsfr-data-list>${generateA11yElement(datalistSource, 'my-datalist')}
</div>`;
      displayGeneratedCode(code);
      return;
    }

    // Generic API: use dsfr-data-source (no automatic pagination)
    const { elements: middlewareHtml, finalSourceId: datalistSource } =
      generateMiddlewareElements('table-data');
    const code = `<!-- Tableau dynamique généré avec dsfr-data Builder -->
<!-- Doc des composants : ${PROXY_BASE_URL_EMBED}/specs/ -->
<!-- Source : ${escapeHtml(source.name)} (chargement dynamique) -->

<!-- Dépendances CSS (DSFR) -->
<link rel="stylesheet" href="${CDN_URLS.dsfrCss}">
<link rel="stylesheet" href="${CDN_URLS.dsfrUtilityCss}">

<!-- Dépendances JS -->
<script src="${LIB_URL}/dsfr-data.core.umd.js"></script>

<div class="fr-container fr-my-4w">
  ${state.title ? `<h2>${escapeHtml(state.title)}</h2>` : ''}
  ${state.subtitle ? `<p class="fr-text--sm fr-text--light">${escapeHtml(state.subtitle)}</p>` : ''}

  <dsfr-data-source
    id="table-data"
    url="${source.apiUrl}"${transformAttr}${refreshAttr}>
  </dsfr-data-source>
${middlewareHtml}
  <dsfr-data-list
    id="my-datalist"
    source="${datalistSource}"
    columns="${colonnes}"${buildDatalistAttrs()}${triAttr}
    pagination="10">
  </dsfr-data-list>${generateA11yElement(datalistSource, 'my-datalist')}
</div>`;
    displayGeneratedCode(code);
    return;
  }

  // For maps, group by codeField (not labelField)
  const isMap = state.chartType === 'map';
  const groupByPath = isMap && state.codeField ? state.codeField : labelFieldPath;

  let queryElement: string;
  let chartSource: string;
  let queryLabelField: string;
  let queryValueField: string;
  let queryValueField2: string;
  let queryExtraVFs: string[];
  let sourceElement: string;
  let middlewareHtml = '';
  let facetsHtml = '';

  if (provider.id === 'opendatasoft' && resourceIds?.datasetId) {
    const odsInfo = { baseUrl: apiBaseUrl, datasetId: resourceIds.datasetId };
    const result = generateOdsQueryCode(odsInfo, groupByPath, valueFieldPath);
    queryElement = result.queryElement;
    chartSource = result.chartSource;
    queryLabelField = result.labelField;
    queryValueField = result.valueField;
    queryValueField2 = result.valueField2 || '';
    queryExtraVFs = result.extraValueFields;
    sourceElement = '';
    // Facettes SERVEUR (#1171) : placées après l'agrégation, elles ne
    // voyaient que le champ d'axe. En `server-facets`, leurs valeurs viennent
    // de l'API et le filtre remonte en `where` jusqu'à la source, qui
    // réagrège : tout champ du jeu est facettable.
    const facets = generateFacetsElement(chartSource, { serverFacets: true });
    if (facets.element) {
      facetsHtml = facets.element;
      chartSource = facets.finalSourceId;
    }
  } else if (provider.id === 'tabular' && resourceIds?.resourceId) {
    const tabularInfo = { baseUrl: apiBaseUrl, resourceId: resourceIds.resourceId };
    const result = generateTabularQueryCode(tabularInfo, groupByPath, valueFieldPath);
    queryElement = result.queryElement;
    chartSource = result.chartSource;
    queryLabelField = result.labelField;
    queryValueField = result.valueField;
    queryValueField2 = result.valueField2 || '';
    queryExtraVFs = result.extraValueFields;
    sourceElement = '';
    // Tabular n'a pas de facettes serveur : valeurs précalculées sur les
    // lignes chargées, filtre relayé en `where` jusqu'à la source (#1171),
    // comme pour le tableau.
    const staticVals = computeStaticFacetValues();
    const facets = generateFacetsElement(
      chartSource,
      staticVals ? { staticValues: staticVals } : undefined
    );
    if (facets.element) {
      facetsHtml = facets.element;
      chartSource = facets.finalSourceId;
    }
  } else {
    const mw = generateMiddlewareElements('chart-data');
    middlewareHtml = mw.elements;
    const result = generateDsfrDataQueryCode(mw.finalSourceId, groupByPath, valueFieldPath);
    queryElement = result.queryElement;
    chartSource = result.chartSource;
    queryLabelField = result.labelField;
    queryValueField = result.valueField;
    queryValueField2 = result.valueField2 || '';
    queryExtraVFs = result.extraValueFields;
    sourceElement = `
  <!-- Source de données API -->
  <dsfr-data-source
    id="chart-data"
    url="${source.apiUrl}"${transformAttr}${refreshAttr}>
  </dsfr-data-source>`;
  }

  // Nettoyage après agrégation (#1169) : la section « Nettoyage des données »
  // était sans effet pour OpenDataSoft et Tabular. Le normalize lit la
  // sortie de la query (ou des facettes) ; le graphique lit le normalize, sous
  // les noms de colonnes qu'il produit.
  if (!sourceElement) {
    const cleaning = generatePostAggregationNormalize(chartSource);
    if (cleaning.element) {
      facetsHtml += cleaning.element;
      chartSource = cleaning.finalSourceId;
      queryLabelField = cleanedFieldName(queryLabelField);
      queryValueField = cleanedFieldName(queryValueField);
      queryValueField2 = cleanedFieldName(queryValueField2);
      queryExtraVFs = queryExtraVFs.map(cleanedFieldName);
    }
  }

  // Map-specific attributes
  const codeFieldAttr = isMap && state.codeField ? `\n    code-field="${state.codeField}"` : '';

  const code = `<!-- Graphique dynamique généré avec dsfr-data Builder -->
<!-- Doc des composants : ${PROXY_BASE_URL_EMBED}/specs/ -->
<!-- Source : ${escapeHtml(source.name)} (chargement dynamique) -->
${state.advancedMode ? '<!-- Mode avancé activé : filtrage et agrégation via dsfr-data-query -->' : ''}

<!-- Dépendances CSS (DSFR) -->
<link rel="stylesheet" href="${CDN_URLS.dsfrCss}">
<link rel="stylesheet" href="${CDN_URLS.dsfrUtilityCss}">
<link rel="stylesheet" href="${CDN_URLS.dsfrChartCss}">

<!-- Dépendances JS -->
<script type="module" src="${CDN_URLS.dsfrChartJs}"></script>
<script src="${LIB_URL}/dsfr-data.core.umd.js"></script>

<div class="fr-container fr-my-4w">
  ${state.title ? `<h2>${escapeHtml(state.title)}</h2>` : ''}
  ${state.subtitle ? `<p class="fr-text--sm fr-text--light">${escapeHtml(state.subtitle)}</p>` : ''}
${sourceElement}${middlewareHtml}${queryElement}${facetsHtml}${visualElement({
    source: chartSource,
    labelField: queryLabelField,
    valueField: queryValueField,
    valueField2: queryValueField2,
    extraValueFields: queryExtraVFs,
    codeFieldAttr,
  })}
</div>`;

  displayGeneratedCode(code);
}

/**
 * Generate HTML+JS code for API-fetched data.
 */
export function generateCode(apiUrl: string): void {
  // Formes rendues par la bibliothèque dans tous les modes (#1204) : les
  // lignes agrégées, déjà chargées pour l'aperçu, sont intégrées telles quelles.
  if (usesLibEmbedded()) {
    generateEmbeddedLibCode();
    return;
  }

  // Handle KPI type
  if (state.chartType === 'kpi') {
    const variantSelect = document.getElementById('kpi-variant') as HTMLSelectElement | null;
    const unitInput = document.getElementById('kpi-unit') as HTMLInputElement | null;
    const variant = variantSelect?.value || '';
    const unit = unitInput?.value || '';

    const code = `<!-- KPI g\u00e9n\u00e9r\u00e9 avec dsfr-data Builder -->

<!-- D\u00e9pendances CSS (DSFR) -->
<link rel="stylesheet" href="${CDN_URLS.dsfrCss}">
<link rel="stylesheet" href="${CDN_URLS.dsfrUtilityCss}">

<style>
.kpi-card {
  background: var(--background-default-grey);
  border-left: 4px solid var(--border-default-grey);
  padding: 1.5rem 2rem;
  text-align: center;
  border-radius: 4px;
}
.kpi-card--info { border-left-color: #0063CB; }
.kpi-card--success { border-left-color: #18753C; }
.kpi-card--warning { border-left-color: #D64D00; }
.kpi-card--error { border-left-color: #C9191E; }
.kpi-value { display: block; font-size: 2.5rem; font-weight: 700; color: var(--text-title-grey); }
.kpi-label { display: block; font-size: 0.875rem; color: var(--text-mention-grey); margin-top: 0.5rem; }
</style>

<div class="fr-container fr-my-4w">
  <div class="kpi-card${variant ? ' kpi-card--' + variant : ''}" id="kpi-container">
    <span class="kpi-value" id="kpi-value">\u2014</span>
    <span class="kpi-label">${escapeHtml(state.title)}</span>
  </div>
</div>

<script>
// URL de l'API avec agr\u00e9gation
const API_URL = ${jsStringLiteral(apiUrl)};

function formatKPIValue(value, unit) {
  const num = Math.round(value * 100) / 100;
  if (unit === '\u20ac' || unit === 'EUR') {
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(num);
  } else if (unit === '%') {
    return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(num) + ' %';
  } else {
    const formatted = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(num);
    return unit ? formatted + ' ' + unit : formatted;
  }
}

async function loadKPI() {
  const response = await fetch(API_URL);
  const json = await response.json();
  const data = json.results || [];
  const value = data[0]?.value || 0;
  document.getElementById('kpi-value').textContent = formatKPIValue(value, '${unit}');
}

loadKPI();
</script>`;
    displayGeneratedCode(code);
    return;
  }

  // Handle Gauge type
  if (state.chartType === 'gauge') {
    const code = `<!-- Jauge g\u00e9n\u00e9r\u00e9e avec dsfr-data Builder -->

<!-- D\u00e9pendances CSS (DSFR) -->
<link rel="stylesheet" href="${CDN_URLS.dsfrCss}">
<link rel="stylesheet" href="${CDN_URLS.dsfrUtilityCss}">
<link rel="stylesheet" href="${CDN_URLS.dsfrChartCss}">
<script type="module" src="${CDN_URLS.dsfrChartJs}"></script>

<div class="fr-container fr-my-4w">
  <h2>${escapeHtml(state.title)}</h2>
  ${state.subtitle ? `<p class="fr-text--sm fr-text--light">${escapeHtml(state.subtitle)}</p>` : ''}
  <div id="gauge-container"></div>
</div>

<script type="module">
const API_URL = ${jsStringLiteral(apiUrl)};

async function loadGauge() {
  const response = await fetch(API_URL);
  const json = await response.json();
  const value = Math.round(json.results?.[0]?.value || 0);

  document.getElementById('gauge-container').innerHTML = \`
    <gauge-chart percent="\${value}" init="0" target="100"></gauge-chart>
  \`;
}

loadGauge();
</script>`;
    displayGeneratedCode(code);
    return;
  }

  // Handle Datalist type (API fetch)
  if (state.chartType === 'datalist') {
    const colonnes = buildColonnesAttr();
    const triAttr = buildDatalistTriAttr();
    const code = `<!-- Tableau généré avec dsfr-data Builder -->
<!-- Doc des composants : ${PROXY_BASE_URL_EMBED}/specs/ -->

<!-- Dépendances CSS (DSFR) -->
<link rel="stylesheet" href="${CDN_URLS.dsfrCss}">
<link rel="stylesheet" href="${CDN_URLS.dsfrUtilityCss}">

<!-- Dépendances JS -->
<script src="${LIB_URL}/dsfr-data.core.umd.js"></script>

<div class="fr-container fr-my-4w">
  ${state.title ? `<h2>${escapeHtml(state.title)}</h2>` : ''}
  ${state.subtitle ? `<p class="fr-text--sm fr-text--light">${escapeHtml(state.subtitle)}</p>` : ''}

  <dsfr-data-list
    id="my-table"
    columns="${colonnes}"${buildDatalistAttrs()}${triAttr}
    pagination="10">
  </dsfr-data-list>${generateEmbeddedA11y('my-table')}
</div>

<script>
const API_URL = ${jsStringLiteral(apiUrl)};

${ODS_FETCH_HELPER}

async function loadTable() {
  const data = await fetchAllODS(API_URL);
  document.getElementById('my-table').onSourceData(data);
}

loadTable();
</script>`;
    displayGeneratedCode(code);
    return;
  }

  // Handle Scatter type
  if (state.chartType === 'scatter') {
    const code = `<!-- Nuage de points généré avec dsfr-data Builder -->
<!-- Doc des composants : ${PROXY_BASE_URL_EMBED}/specs/ -->

<!-- Dépendances (DSFR + DSFR Chart) -->
<link rel="stylesheet" href="${CDN_URLS.dsfrCss}">
<link rel="stylesheet" href="${CDN_URLS.dsfrUtilityCss}">
<link rel="stylesheet" href="${CDN_URLS.dsfrChartCss}">
<script type="module" src="${CDN_URLS.dsfrChartJs}"></script>${a11yDep()}

<div class="fr-container fr-my-4w">
  <h2>${escapeHtml(state.title)}</h2>
  ${state.subtitle ? `<p class="fr-text--sm fr-text--light">${escapeHtml(state.subtitle)}</p>` : ''}
  <div id="scatter-container"></div>${generateEmbeddedA11y('scatter-container')}
</div>

<script type="module">
const API_URL = ${jsStringLiteral(apiUrl)};

${ODS_FETCH_HELPER}

async function loadChart() {
  const data = await fetchAllODS(API_URL);

  const xValues = data.map(d => d[${jsStringLiteral(state.labelField)}] || 0);
  const yValues = data.map(d => d.value || 0);

  var el = document.createElement('scatter-chart');
  el.setAttribute('x', JSON.stringify([xValues]));
  el.setAttribute('y', JSON.stringify([yValues]));
  el.setAttribute('name', ${jsStringLiteral(JSON.stringify([`${state.labelField} vs ${state.valueField}`]))});
  el.setAttribute('selected-palette', '${state.palette}');
  document.getElementById('scatter-container').appendChild(el);
}

loadChart();
</script>`;
    displayGeneratedCode(code);
    return;
  }

  // Handle Map type
  if (state.chartType === 'map') {
    // For choropleth maps, use sequential or divergent palette for gradient
    const mapPalette =
      state.palette.includes('sequential') || state.palette.includes('divergent')
        ? state.palette
        : 'sequentialAscending';

    const code = `<!-- Carte g\u00e9n\u00e9r\u00e9e avec dsfr-data Builder -->
<!-- Palette: ${mapPalette} -->

<!-- D\u00e9pendances CSS (DSFR) -->
<link rel="stylesheet" href="${CDN_URLS.dsfrCss}">
<link rel="stylesheet" href="${CDN_URLS.dsfrUtilityCss}">
<link rel="stylesheet" href="${CDN_URLS.dsfrChartCss}">
<script type="module" src="${CDN_URLS.dsfrChartJs}"></script>${a11yDep()}

<div class="fr-container fr-my-4w">
  <h2>${escapeHtml(state.title)}</h2>
  ${state.subtitle ? `<p class="fr-text--sm fr-text--light">${escapeHtml(state.subtitle)}</p>` : ''}
  <div id="map-container"></div>${generateEmbeddedA11y('map-container')}
</div>

<script type="module">
const API_URL = ${jsStringLiteral(apiUrl)};

${ODS_FETCH_HELPER}

// Valide un code de d\u00e9partement fran\u00e7ais
function isValidDeptCode(code) {
  if (!code || typeof code !== 'string') return false;
  if (['N/A', 'null', 'undefined', '00', ''].includes(code)) return false;
  if (code === '2A' || code === '2B') return true;
  if (/^97[1-6]$/.test(code)) return true;
  if (/^(0[1-9]|[1-8]\\d|9[0-5])$/.test(code)) return true;
  return false;
}

async function loadMap() {
  const records = await fetchAllODS(API_URL);

  // Transformer les donn\u00e9es en format carte: {"code": valeur, ...}
  const mapData = {};
  records.forEach(d => {
    let code = String(d[${jsStringLiteral(state.codeField)}] || '').trim();
    // Copie deliberee de normalizeDeptCode : ce bloc s'execute dans la page
    // de l'utilisateur, il ne peut rien importer du monorepo (#610).
    if (/^\\d+$/.test(code) && code.length < 3) {
      code = code.padStart(2, '0');
    }
    // Zero de tete en trop : 059, 02A, 0971 (#766).
    var padded = /^0(\\d{2}|2[AB]|97\\d)$/i.exec(code);
    if (padded && isValidDeptCode(padded[1].toUpperCase())) {
      code = padded[1].toUpperCase();
    }
    const value = d.value || 0;
    if (isValidDeptCode(code)) {
      mapData[code] = Math.round(value * 100) / 100;
    }
  });

  var el = document.createElement('map-chart');
  el.setAttribute('data', JSON.stringify(mapData));
  el.setAttribute('name', '${escapeHtml(state.title)}');
  el.setAttribute('selected-palette', '${mapPalette}');
  // Compute national average
  var vals = Object.values(mapData);
  var avg = vals.length ? Math.round(vals.reduce(function(a,b){return a+b},0) / vals.length * 100) / 100 : 0;
  el.setAttribute('value', String(avg));
  el.setAttribute('date', new Date().toISOString().split('T')[0]);
  document.getElementById('map-container').appendChild(el);
}

loadMap();
</script>`;
    displayGeneratedCode(code);
    return;
  }

  // Build DSFR Chart type and extra attributes
  const activeExtraSeriesCode = tracedExtraSeries(state);
  const dsfrTag = DSFR_TAG_MAP[state.chartType] || 'bar-chart';

  const extraAttrs: string[] = [];
  if (state.chartType === 'horizontalBar') extraAttrs.push('horizontal');
  if (state.chartType === 'pie') extraAttrs.push('fill');

  const seriesNames =
    activeExtraSeriesCode.length > 0
      ? JSON.stringify([
          state.valueFieldLabel || state.valueField,
          ...activeExtraSeriesCode.map((s) => s.label || s.field),
        ])
      : JSON.stringify([state.valueFieldLabel || state.valueField]);

  // Generate extra séries extraction code
  const extraSeriesExtractCode = activeExtraSeriesCode
    .map(
      (_, i) =>
        `\n  const values${i + 2} = data.map(d => Math.round((d.value${i + 2} || 0) * 100) / 100);`
    )
    .join('');
  const allValuesArrayCode =
    activeExtraSeriesCode.length > 0
      ? `JSON.stringify([values, ${activeExtraSeriesCode.map((_, i) => `values${i + 2}`).join(', ')}])`
      : 'JSON.stringify([values])';

  const code = `<!-- Graphique généré avec dsfr-data Builder -->
<!-- Doc des composants : ${PROXY_BASE_URL_EMBED}/specs/ -->

<!-- Dépendances (DSFR + DSFR Chart) -->
<link rel="stylesheet" href="${CDN_URLS.dsfrCss}">
<link rel="stylesheet" href="${CDN_URLS.dsfrUtilityCss}">
<link rel="stylesheet" href="${CDN_URLS.dsfrChartCss}">
<script type="module" src="${CDN_URLS.dsfrChartJs}"></script>${a11yDep()}

<div class="fr-container fr-my-4w">
  <h2>${escapeHtml(state.title)}</h2>
  ${state.subtitle ? `<p class="fr-text--sm fr-text--light">${escapeHtml(state.subtitle)}</p>` : ''}
  <div id="chart-container"></div>${generateEmbeddedA11y('chart-container')}
</div>

<script type="module">
// URL de l'API avec agrégation
const API_URL = ${jsStringLiteral(apiUrl)};

${ODS_FETCH_HELPER}

async function loadChart() {
  const data = await fetchAllODS(API_URL);

  const labels = data.map(d => d[${jsStringLiteral(state.labelField)}] || 'N/A');
  const values = data.map(d => Math.round((d.value || 0) * 100) / 100);${extraSeriesExtractCode}

  const y = ${allValuesArrayCode};

  var el = document.createElement('${dsfrTag}');
  el.setAttribute('x', JSON.stringify([labels]));
  el.setAttribute('y', y);
  el.setAttribute('name', ${state.chartType === 'pie' || state.chartType === 'doughnut' ? 'JSON.stringify(labels)' : jsStringLiteral(seriesNames)});
  el.setAttribute('selected-palette', '${effectivePalette()}');${
    state.chartType === 'horizontalBar'
      ? `
  el.setAttribute('horizontal', '');`
      : ''
  }${
    state.chartType === 'pie'
      ? `
  el.setAttribute('fill', '');`
      : ''
  }
  document.getElementById('chart-container').appendChild(el);
}

loadChart();
</script>`;

  displayGeneratedCode(code);
}
