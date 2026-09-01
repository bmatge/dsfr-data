/**
 * Export HTML d'un dashboard multi-blocs (#515).
 *
 * Promu ici depuis apps/dashboard/src/code-generator.ts et etendu : l'export
 * emet desormais les `<dsfr-data-source>` du dashboard, traduit les widgets
 * `fromBuilder` (ChartConfig complete) en pipeline declaratif
 * `dsfr-data-query` + composant d'affichage, et rend les blocs de filtres
 * partages en selects DSFR + `dsfr-data-context`.
 *
 * Principe : la page generee est AUTONOME (DSFR + lib via CDN) et VIVANTE —
 * les donnees sont soit refetchees (source API), soit embarquees (attribut
 * `data` inline). C'est aussi elle qui sert d'apercu (iframe srcdoc) dans le
 * studio : l'apercu EST l'export.
 */

import { escapeHtml } from '../utils/escape-html.js';
import { CDN_URLS } from '../templates/cdn-versions.js';
import { LIB_URL } from '../api/proxy-config.js';
import type {
  DashboardData,
  DashboardSource,
  DashboardFilterSpec,
  Widget,
  BuilderChartWidgetConfig,
  FiltersWidgetConfig,
} from './model.js';
import { getRowColumns, isFavoriteChart, isBuilderChart } from './model.js';

/** Alias d'une colonne agregee par dsfr-data-query (convention pipeline #269). */
function aggregatedAlias(field: string, fn: string): string {
  return `${field}__${fn}`;
}

/** Valeur d'attribut HTML entre guillemets simples (JSON inline). */
function singleQuoteAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/'/g, '&#039;').replace(/</g, '&lt;');
}

/**
 * Emet la balise `<dsfr-data-source>` d'une source du dashboard.
 *
 * La source est un objet `Source` unifie (ou un sous-ensemble) : donnees
 * chargees embarquees en priorite (fonctionne partout, y compris Grist sans
 * exposer de cle), sinon connexion API declarative.
 */
export function generateSourceHTML(source: DashboardSource, indent = '    '): string {
  const id = escapeHtml(source.id);
  const data = source.data;
  if (Array.isArray(data) && data.length > 0) {
    return `${indent}<dsfr-data-source id="${id}" data='${singleQuoteAttr(JSON.stringify(data))}'></dsfr-data-source>\n`;
  }

  const apiUrl = typeof source.apiUrl === 'string' ? source.apiUrl : '';
  const provider = typeof source.provider === 'string' ? source.provider : '';
  const resourceIds = (source.resourceIds ?? {}) as Record<string, unknown>;
  const dataPath = typeof source.dataPath === 'string' ? source.dataPath : '';

  if (provider === 'opendatasoft' && typeof resourceIds.datasetId === 'string') {
    let baseUrl: string;
    try {
      baseUrl = new URL(apiUrl).origin;
    } catch {
      baseUrl = apiUrl;
    }
    return (
      `${indent}<dsfr-data-source id="${id}" api-type="opendatasoft"\n` +
      `${indent}  base-url="${escapeHtml(baseUrl)}"\n` +
      `${indent}  dataset-id="${escapeHtml(resourceIds.datasetId)}"></dsfr-data-source>\n`
    );
  }
  if (provider === 'tabular' && typeof resourceIds.resourceId === 'string') {
    return (
      `${indent}<dsfr-data-source id="${id}" api-type="tabular"\n` +
      `${indent}  resource="${escapeHtml(resourceIds.resourceId)}"></dsfr-data-source>\n`
    );
  }
  if (apiUrl) {
    const transform = dataPath ? `\n${indent}  transform="${escapeHtml(dataPath)}"` : '';
    return `${indent}<dsfr-data-source id="${id}" url="${escapeHtml(apiUrl)}"${transform}></dsfr-data-source>\n`;
  }
  return `${indent}<!-- Source « ${escapeHtml(source.name)} » (${id}) : pas de donnees embarquees ni d'URL exportable -->\n`;
}

/** Ids des sources pilotees par un bloc de filtres (toutes par defaut). */
function filterTargetIds(config: FiltersWidgetConfig, dashboard: DashboardData): string[] {
  if (config.sourceIds && config.sourceIds.length > 0) return config.sourceIds;
  return dashboard.sources.map((s) => s.id);
}

function generateFilterControl(
  widgetId: string,
  spec: DashboardFilterSpec,
  indent: string
): string {
  const uiId = `flt-${widgetId}-${spec.field}`.replace(/[^a-zA-Z0-9_-]/g, '-');
  const label = escapeHtml(spec.label || spec.field);
  const multiple = spec.operator === 'in' ? ' multiple' : '';
  const options = (spec.options ?? [])
    .map((o) => `${indent}    <option value="${escapeHtml(o)}">${escapeHtml(o)}</option>`)
    .join('\n');
  return (
    `${indent}<div class="fr-select-group fr-col-12 fr-col-md-4">\n` +
    `${indent}  <label class="fr-label" for="${uiId}">${label}</label>\n` +
    `${indent}  <select class="fr-select" id="${uiId}"${multiple}>\n` +
    `${indent}    <option value="">Toutes</option>\n` +
    (options ? options + '\n' : '') +
    `${indent}  </select>\n` +
    `${indent}</div>\n`
  );
}

/** Bloc de filtres partages : selects DSFR + contexte + tags des filtres actifs. */
function generateFiltersHTML(
  widget: Widget & { type: 'filters' },
  dashboard: DashboardData,
  indent: string
): string {
  const config = widget.config;
  if (config.filters.length === 0) return '';
  const ctxId = `ctx-${widget.id}`;
  const targets = filterTargetIds(config, dashboard).map(escapeHtml).join(' ');

  const controls = config.filters.map((f) => generateFilterControl(widget.id, f, indent + '  '));
  const filters = config.filters
    .map((f) => {
      const uiId = `flt-${widget.id}-${f.field}`.replace(/[^a-zA-Z0-9_-]/g, '-');
      const label = f.label ? ` label="${escapeHtml(f.label)}"` : '';
      return (
        `${indent}  <dsfr-data-context-filter field="${escapeHtml(f.field)}"` +
        ` operator="${f.operator ?? 'eq'}" ui="${uiId}"${label}></dsfr-data-context-filter>`
      );
    })
    .join('\n');

  return (
    `${indent}<div class="fr-grid-row fr-grid-row--gutters">\n` +
    controls.join('') +
    `${indent}</div>\n` +
    `${indent}<dsfr-data-context id="${ctxId}" sources="${targets}">\n` +
    filters +
    `\n${indent}</dsfr-data-context>\n` +
    `${indent}<dsfr-data-context-tags for="${ctxId}"></dsfr-data-context-tags>\n`
  );
}

/** Mapping variant builder-IA -> token de couleur dsfr-data-kpi. */
const VARIANT_TO_COLOR_TOKEN: Record<string, string> = {
  info: 'bleu',
  success: 'vert',
  warning: 'orange',
  error: 'rouge',
};

/**
 * Widget `fromBuilder` : traduit la ChartConfig complete du builder-IA en
 * pipeline declaratif. Un `dsfr-data-query` n'est emis que s'il apporte
 * quelque chose (where / aggregation / tri / limite) ; sinon le composant
 * d'affichage consomme la source directement.
 */
function generateBuilderChartHTML(
  widget: Widget,
  config: BuilderChartWidgetConfig,
  dashboard: DashboardData,
  indent: string
): string {
  const c = config.chart;
  const sourceId = config.sourceId || dashboard.sources[0]?.id || '';
  if (!sourceId) {
    return `${indent}<!-- Widget « ${escapeHtml(widget.title)} » : aucune source associee -->\n`;
  }

  // Le KPI agrege lui-meme via sa grammaire value="champ:fn" : la query ne
  // sert qu'au filtre/limite.
  const isKpi = c.type === 'kpi';
  const aggregation = !isKpi && c.aggregation && c.labelField ? c.aggregation : undefined;
  const valueOut = aggregation ? aggregatedAlias(c.valueField, aggregation) : c.valueField;
  const needsQuery = Boolean(c.where || aggregation || c.limit || c.sortOrder);
  const queryId = `q-${widget.id}`;
  const dataId = needsQuery ? queryId : sourceId;

  let html = '';
  if (needsQuery) {
    const attrs: string[] = [`source="${escapeHtml(sourceId)}"`];
    if (c.where) attrs.push(`where="${escapeHtml(c.where)}"`);
    if (aggregation) {
      attrs.push(`group-by="${escapeHtml(c.labelField ?? '')}"`);
      attrs.push(`aggregate="${escapeHtml(c.valueField)}:${aggregation}"`);
    }
    if (c.sortOrder) attrs.push(`order-by="${escapeHtml(valueOut)}:${c.sortOrder}"`);
    if (c.limit) attrs.push(`limit="${c.limit}"`);
    html += `${indent}<dsfr-data-query id="${queryId}" ${attrs.join(' ')}></dsfr-data-query>\n`;
  }

  const src = `source="${escapeHtml(dataId)}"`;

  switch (c.type) {
    case 'kpi': {
      const value = `${c.valueField}:${c.aggregation ?? 'sum'}`;
      const attrs = [
        src,
        `value="${escapeHtml(value)}"`,
        `label="${escapeHtml(c.title || widget.title)}"`,
      ];
      if (c.unit) attrs.push(`unit="${escapeHtml(c.unit)}"`);
      if (c.variant && VARIANT_TO_COLOR_TOKEN[c.variant]) {
        attrs.push(`color-token="${VARIANT_TO_COLOR_TOKEN[c.variant]}"`);
      }
      return html + `${indent}<dsfr-data-kpi ${attrs.join(' ')}></dsfr-data-kpi>\n`;
    }

    case 'datalist': {
      const attrs = [src];
      if (c.colonnes) attrs.push(`columns="${escapeHtml(c.colonnes)}"`);
      attrs.push('search');
      attrs.push(`pagination="${c.pagination ?? 10}"`);
      return html + `${indent}<dsfr-data-list ${attrs.join(' ')}></dsfr-data-list>\n`;
    }

    case 'podium': {
      const attrs = [src];
      if (c.labelField) attrs.push(`label-field="${escapeHtml(c.labelField)}"`);
      attrs.push(`value-field="${escapeHtml(valueOut)}"`);
      if (c.unit) attrs.push(`value-unit="${escapeHtml(c.unit)}"`);
      if (c.limit) attrs.push(`max-items="${c.limit}"`);
      return html + `${indent}<dsfr-data-podium ${attrs.join(' ')}></dsfr-data-podium>\n`;
    }

    default: {
      // Tous les autres types sont portes par <dsfr-data-chart>. Deux
      // adaptations de vocabulaire : horizontalBar et doughnut n'existent
      // pas cote composant (bar horizontal, pie non rempli).
      const type = c.type === 'horizontalBar' ? 'bar' : c.type === 'doughnut' ? 'pie' : c.type;
      const attrs = [src, `type="${type}"`];
      if (c.type === 'horizontalBar') attrs.push('horizontal');
      if (c.type === 'pie') attrs.push('fill');
      if (c.labelField) attrs.push(`label-field="${escapeHtml(c.labelField)}"`);
      attrs.push(`value-field="${escapeHtml(valueOut)}"`);
      if (c.valueField2) attrs.push(`value-field-2="${escapeHtml(c.valueField2)}"`);
      if (c.valueFields?.length)
        attrs.push(`value-fields="${escapeHtml(c.valueFields.join(','))}"`);
      if (c.codeField) attrs.push(`code-field="${escapeHtml(c.codeField)}"`);
      if (c.palette) attrs.push(`selected-palette="${escapeHtml(c.palette)}"`);
      if (c.unit) attrs.push(`unit-tooltip="${escapeHtml(c.unit)}"`);
      return html + `${indent}<dsfr-data-chart ${attrs.join(' ')}></dsfr-data-chart>\n`;
    }
  }
}

export function generateWidgetHTML(widget: Widget, dashboard: DashboardData): string {
  const indent = '        ';

  switch (widget.type) {
    case 'kpi': {
      const cfg = widget.config;
      const iconAttr = cfg.icon ? ` icon="${escapeHtml(cfg.icon)}"` : '';
      const sourceAttr = cfg.sourceId ? `\n${indent}  source="${escapeHtml(cfg.sourceId)}"` : '';
      return `${indent}<dsfr-data-kpi${sourceAttr}
${indent}  value="${escapeHtml(cfg.value)}"
${indent}  label="${escapeHtml(cfg.label || widget.title)}"
${indent}  format="${cfg.format}"${iconAttr}>
${indent}</dsfr-data-kpi>\n`;
    }

    case 'chart': {
      const cfg = widget.config;
      // Un favori porte le HTML deja genere par le builder : on le recopie tel
      // quel plutot que de reconstruire une balise a partir de rien.
      if (isFavoriteChart(cfg)) {
        if (!cfg.code) return '';
        return `${indent}<!-- Graphique: ${escapeHtml(widget.title)} -->\n${indent}${cfg.code.split('\n').join('\n' + indent)}\n`;
      }
      if (isBuilderChart(cfg)) {
        const title = widget.title
          ? `${indent}<h3 class="fr-h6">${escapeHtml(widget.title)}</h3>\n`
          : '';
        return title + generateBuilderChartHTML(widget, cfg, dashboard, indent);
      }
      const sourceAttr = cfg.sourceId ? `\n${indent}  source="${escapeHtml(cfg.sourceId)}"` : '';
      return `${indent}<dsfr-data-chart${sourceAttr}
${indent}  type="${cfg.type}"
${indent}  label-field="${escapeHtml(cfg.labelField)}"
${indent}  value-field="${escapeHtml(cfg.valueField)}"
${indent}  selected-palette="${cfg.palette}">
${indent}</dsfr-data-chart>\n`;
    }

    case 'table': {
      const cfg = widget.config;
      if (cfg.sourceId) {
        const cols = cfg.columns.length ? ` columns="${escapeHtml(cfg.columns.join(','))}"` : '';
        const search = cfg.searchable ? ' search' : '';
        return `${indent}<dsfr-data-list source="${escapeHtml(cfg.sourceId)}"${cols}${search} pagination="10">
${indent}</dsfr-data-list>\n`;
      }
      // Forme historique (sans source) conservee pour les dashboards existants.
      const cols = cfg.columns.length ? ` columns='${JSON.stringify(cfg.columns)}'` : '';
      const searchable = cfg.searchable ? ' searchable' : '';
      const sortable = cfg.sortable ? ' sortable' : '';
      return `${indent}<dsfr-data-list${cols}${searchable}${sortable}>
${indent}</dsfr-data-list>\n`;
    }

    case 'text':
      if (widget.config.style === 'callout') {
        return `${indent}<div class="fr-callout">
${indent}  <p class="fr-callout__text">${widget.config.content}</p>
${indent}</div>\n`;
      } else if (widget.config.style === 'title') {
        return `${indent}<h2>${widget.config.content}</h2>\n`;
      }
      return `${indent}<p>${widget.config.content}</p>\n`;

    case 'filters':
      return generateFiltersHTML(widget, dashboard, indent);
  }
}

/** Contenu du conteneur (titre, chapo, sources, lignes de widgets) — sans le squelette de page. */
export function generateDashboardBodyHTML(dashboard: DashboardData): string {
  const widgetsByRow: Record<number, Widget[]> = {};
  dashboard.widgets.forEach((w) => {
    if (!widgetsByRow[w.position.row]) {
      widgetsByRow[w.position.row] = [];
    }
    widgetsByRow[w.position.row].push(w);
  });

  let widgetsHTML = '';
  Object.keys(widgetsByRow)
    .sort((a, b) => Number(a) - Number(b))
    .forEach((rowKey) => {
      const rowIdx = Number(rowKey);
      const widgets = widgetsByRow[rowIdx];

      // Per-row column class
      const columns = getRowColumns(dashboard, rowIdx);
      const colSize = Math.floor(12 / columns);
      const colClass = colSize === 12 ? 'fr-col-12' : `fr-col-12 fr-col-md-${colSize}`;

      widgetsHTML += `    <div class="fr-grid-row ${dashboard.layout.gap}">\n`;

      widgets.forEach((widget) => {
        // Un bloc de filtres occupe toute la largeur de sa ligne.
        const cls = widget.type === 'filters' ? 'fr-col-12' : colClass;
        widgetsHTML += `      <div class="${cls}">\n`;
        widgetsHTML += generateWidgetHTML(widget, dashboard);
        widgetsHTML += `      </div>\n`;
      });

      widgetsHTML += `    </div>\n`;
    });

  const description = dashboard.description
    ? `    <p class="fr-text--lead">${escapeHtml(dashboard.description)}</p>\n`
    : '';

  const usedSourceIds = collectUsedSourceIds(dashboard);
  const sourcesHTML = dashboard.sources
    .filter((s) => usedSourceIds.has(s.id))
    .map((s) => generateSourceHTML(s))
    .join('');

  return (
    `    <h1>${escapeHtml(dashboard.name)}</h1>\n` +
    description +
    (sourcesHTML ? '\n' + sourcesHTML : '') +
    '\n' +
    widgetsHTML
  );
}

/** Ids de sources effectivement references par au moins un widget. */
function collectUsedSourceIds(dashboard: DashboardData): Set<string> {
  const ids = new Set<string>();
  for (const w of dashboard.widgets) {
    if (w.type === 'filters') {
      for (const id of filterTargetIds(w.config, dashboard)) ids.add(id);
      continue;
    }
    if (w.type === 'text') continue;
    if (w.type === 'chart') {
      const cfg = w.config;
      if (isFavoriteChart(cfg)) continue;
      if (isBuilderChart(cfg)) {
        ids.add(cfg.sourceId || dashboard.sources[0]?.id || '');
        continue;
      }
      if (cfg.sourceId) ids.add(cfg.sourceId);
      continue;
    }
    if (w.config.sourceId) ids.add(w.config.sourceId);
  }
  ids.delete('');
  return ids;
}

/** Le bundle core suffit sauf si un widget rend une carte (composants Leaflet). */
function requiresMapBundle(dashboard: DashboardData): boolean {
  return dashboard.widgets.some(
    (w) =>
      w.type === 'chart' &&
      isBuilderChart(w.config) &&
      ['map', 'map-reg', 'map-aca', 'map-monde'].includes(w.config.chart.type)
  );
}

/** Page DSFR complete et autonome. */
export function generateDashboardHTML(dashboard: DashboardData): string {
  const bundle = requiresMapBundle(dashboard) ? 'dsfr-data.esm.js' : 'dsfr-data.core.esm.js';
  return `<!DOCTYPE html>
<html lang="fr" data-fr-theme>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(dashboard.name)} - dsfr-data</title>

  <!-- DSFR -->
  <link rel="stylesheet" href="${CDN_URLS.dsfrCss}">
  <link rel="stylesheet" href="${CDN_URLS.dsfrUtilityCss}">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/remixicon@4.2.0/fonts/remixicon.css">

  <!-- DSFR Chart -->
  <link rel="stylesheet" href="${CDN_URLS.dsfrChartCss}">
  <script type="module" src="${CDN_URLS.dsfrChartJs}"></script>

  <!-- dsfr-data -->
  <script type="module" src="${LIB_URL}/${bundle}"></script>
</head>
<body>
  <div class="fr-container fr-my-4w">
${generateDashboardBodyHTML(dashboard)}  </div>

  <script type="module" src="${CDN_URLS.dsfrModuleJs}"></script>
</body>
</html>`;
}
