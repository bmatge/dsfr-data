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
 *
 * STRATEGIE DE CHARGEMENT (ADR-109, #717) : par defaut le document charge le
 * jeu puis pagine dans le navigateur. `server-side` / `server-sort` ne sont
 * emis que pour une source dont l'UNIQUE consommateur est une liste paginee
 * — voir `serverPaginatedSources()` pour le critere et ce qu'il protege.
 */

import { escapeHtml, jsonAttr } from '../utils/escape-html.js';
import { CDN_URLS } from '../templates/cdn-versions.js';
import { LIB_URL } from '../api/proxy-config.js';
import type {
  DashboardData,
  DashboardSource,
  DashboardFilterSpec,
  Widget,
  BuilderChartWidgetConfig,
  FiltersWidgetConfig,
  MapLayerSpec,
  MapWidgetConfig,
} from './model.js';
import type { ChartConfig } from './chart-config.js';
import { getRowColumns, isFavoriteChart, isBuilderChart } from './model.js';
import { earlyBufferScript } from '../debug/early-buffer.js';

/** Alias d'une colonne agregee par dsfr-data-query (convention pipeline #269). */
function aggregatedAlias(field: string, fn: string): string {
  return `${field}__${fn}`;
}

/** Taille de page par defaut d'une liste, cote widget comme cote source. */
const DEFAULT_PAGE_SIZE = 10;

/** Options d'emission d'une balise de source. */
export interface SourceEmitOptions {
  /**
   * Pagination serveur (ADR-109) : la source ne charge qu'une page a la fois
   * au lieu de rapatrier tout le jeu. Reserve par `serverPaginatedSources()`
   * aux sources a adaptateur dont l'UNIQUE consommateur est une liste paginee.
   *
   * A ne jamais combiner avec `fetch-mode="export"` (#689, ADR-106), qui vise
   * exactement le cas inverse : le composant ignore alors l'export et pose un
   * attribut de diagnostic. L'export n'emet pas `fetch-mode` ; si un jour il
   * le fait, les deux devront rester exclusifs.
   */
  serverSide?: boolean;
  /** Taille de page demandee, quand `serverSide` est actif. */
  pageSize?: number;
}

/** Attributs de pagination serveur, ou chaine vide. */
function serverPaginationAttrs(options: SourceEmitOptions, indent: string): string {
  if (!options.serverSide) return '';
  const pageSize = options.pageSize && options.pageSize > 0 ? options.pageSize : DEFAULT_PAGE_SIZE;
  return `\n${indent}  server-side page-size="${pageSize}"`;
}

/**
 * Emet la balise `<dsfr-data-source>` d'une source du dashboard.
 *
 * La source est un objet `Source` unifie (ou un sous-ensemble) : donnees
 * chargees embarquees en priorite (fonctionne partout, y compris Grist sans
 * exposer de cle), sinon connexion API declarative.
 */
export function generateSourceHTML(
  source: DashboardSource,
  indent = '    ',
  options: SourceEmitOptions = {}
): string {
  const id = escapeHtml(source.id);
  const data = source.data;
  if (Array.isArray(data) && data.length > 0) {
    return `${indent}<dsfr-data-source id="${id}" data='${jsonAttr(data)}'></dsfr-data-source>\n`;
  }

  const apiUrl = typeof source.apiUrl === 'string' ? source.apiUrl : '';
  const provider = typeof source.provider === 'string' ? source.provider : '';
  const resourceIds = (source.resourceIds ?? {}) as Record<string, unknown>;
  const dataPath = typeof source.dataPath === 'string' ? source.dataPath : '';
  const serverAttrs = serverPaginationAttrs(options, indent);

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
      `${indent}  dataset-id="${escapeHtml(resourceIds.datasetId)}"${serverAttrs}></dsfr-data-source>\n`
    );
  }
  if (provider === 'tabular' && typeof resourceIds.resourceId === 'string') {
    return (
      `${indent}<dsfr-data-source id="${id}" api-type="tabular"\n` +
      `${indent}  resource="${escapeHtml(resourceIds.resourceId)}"${serverAttrs}></dsfr-data-source>\n`
    );
  }
  if (apiUrl) {
    const transform = dataPath ? `\n${indent}  transform="${escapeHtml(dataPath)}"` : '';
    return `${indent}<dsfr-data-source id="${id}" url="${escapeHtml(apiUrl)}"${transform}></dsfr-data-source>\n`;
  }
  return `${indent}<!-- Source « ${escapeHtml(source.name)} » (${id}) : pas de donnees embarquees ni d'URL exportable -->\n`;
}

/**
 * Une source ne sait paginer cote serveur que si elle parle a un adaptateur :
 * les donnees embarquees sont deja la, et le mode `url=` d'une API quelconque
 * ne sait pas serialiser une page (voir dsfr-data-source, mode URL).
 *
 * Le predicat suit exactement les branches de `generateSourceHTML` qui posent
 * un `api-type` : si l'une change, celui-ci doit changer avec elle.
 */
function supportsServerPagination(source: DashboardSource): boolean {
  if (Array.isArray(source.data) && source.data.length > 0) return false;
  const provider = typeof source.provider === 'string' ? source.provider : '';
  const resourceIds = (source.resourceIds ?? {}) as Record<string, unknown>;
  if (provider === 'opendatasoft') return typeof resourceIds.datasetId === 'string';
  if (provider === 'tabular') return typeof resourceIds.resourceId === 'string';
  return false;
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
 * Champs du `group-by` d'un widget agrege.
 *
 * Le champ de CODE geographique en fait partie des qu'il differe de
 * l'etiquette (#625). Sans lui, la carte demandait `code-field="code_dept"`
 * sur des lignes agregees qui ne portaient plus que `region` et
 * `population__sum` : toutes les lignes etaient ecartees faute de code, et la
 * carte se rendait VIDE — sans erreur, avec un HTML parfaitement bien forme.
 * C'est le defaut de classe « podium vide » (#617), version cartographique,
 * que seule une recette de RENDU pouvait voir.
 *
 * Le code d'un territoire etant fonctionnellement determine par son nom, le
 * grouper en plus ne change pas les groupes ; et quand ce n'est pas le cas,
 * les separer est de toute facon la seule lecture defendable — on ne peut pas
 * colorier une carte sur une colonne qu'on a jetee.
 */
function groupByFields(c: ChartConfig): string[] {
  const fields = [c.labelField ?? ''];
  if (c.codeField && c.codeField !== c.labelField) fields.push(c.codeField);
  return fields.filter(Boolean);
}

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
  indent: string,
  serverPaginated: Map<string, number>
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
      attrs.push(`group-by="${escapeHtml(groupByFields(c).join(','))}"`);
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
      // En pagination serveur, le tri part au serveur (`server-sort`) et la
      // recherche locale n'a plus lieu d'etre : elle ne verrait que la page
      // chargee, avec des compteurs faux — le composant la desactive avec un
      // avertissement (#304). Meme forme que le generateur de l'Assistant IA.
      if (serverPaginated.has(sourceId)) attrs.push('server-sort');
      else attrs.push('search');
      attrs.push(`pagination="${c.pagination ?? DEFAULT_PAGE_SIZE}"`);
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

/** Attributs d'une couche selon son type (vocabulaire dsfr-data-map-layer). */
function mapLayerAttrs(layer: MapLayerSpec): string[] {
  const attrs = [`source="${escapeHtml(layer.sourceId)}"`, `type="${layer.type}"`];
  if (layer.type === 'geoshape') {
    if (layer.geoField) attrs.push(`geo-field="${escapeHtml(layer.geoField)}"`);
    if (layer.valueField) attrs.push(`fill-field="${escapeHtml(layer.valueField)}"`);
  } else {
    if (layer.latField) attrs.push(`lat-field="${escapeHtml(layer.latField)}"`);
    if (layer.lonField) attrs.push(`lon-field="${escapeHtml(layer.lonField)}"`);
    if (layer.type === 'circle' && layer.valueField) {
      attrs.push(`radius-field="${escapeHtml(layer.valueField)}"`);
    }
    if (layer.type === 'heatmap' && layer.valueField) {
      attrs.push(`heat-field="${escapeHtml(layer.valueField)}"`);
    }
  }
  if (layer.colorField) attrs.push(`color-field="${escapeHtml(layer.colorField)}"`);
  if (layer.selectedPalette) attrs.push(`selected-palette="${escapeHtml(layer.selectedPalette)}"`);
  if (layer.popupFields) attrs.push(`popup-fields="${escapeHtml(layer.popupFields)}"`);
  if (layer.tooltipField) attrs.push(`tooltip-field="${escapeHtml(layer.tooltipField)}"`);
  return attrs;
}

/** Bloc carte Leaflet multi-couches (#531) : dsfr-data-map + une balise par couche. */
function generateMapHTML(
  widget: Widget & { type: 'map' },
  config: MapWidgetConfig,
  indent: string
): string {
  if (config.layers.length === 0) {
    return `${indent}<!-- Carte « ${escapeHtml(widget.title)} » : aucune couche configuree -->\n`;
  }
  const attrs = [
    `id="map-${escapeHtml(widget.id)}"`,
    `height="${escapeHtml(config.height ?? '500px')}"`,
  ];
  // fit-bounds par defaut : la carte cadre les donnees sans configuration.
  if (config.fitBounds !== false) attrs.push('fit-bounds');
  if (config.insets) attrs.push(`insets="${escapeHtml(config.insets)}"`);
  if (config.center) attrs.push(`center="${escapeHtml(config.center)}"`);
  if (config.zoom !== undefined) attrs.push(`zoom="${config.zoom}"`);

  const layers = config.layers
    .map((l) => {
      const label = l.label ? `${indent}  <!-- ${escapeHtml(l.label)} -->\n` : '';
      return `${label}${indent}  <dsfr-data-map-layer ${mapLayerAttrs(l).join(' ')}></dsfr-data-map-layer>`;
    })
    .join('\n');

  const title = widget.title ? `${indent}<h3 class="fr-h6">${escapeHtml(widget.title)}</h3>\n` : '';
  return `${title}${indent}<dsfr-data-map ${attrs.join(' ')}>\n${layers}\n${indent}</dsfr-data-map>\n`;
}

export function generateWidgetHTML(
  widget: Widget,
  dashboard: DashboardData,
  serverPaginated: Map<string, number> = serverPaginatedSources(dashboard)
): string {
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
        return title + generateBuilderChartHTML(widget, cfg, dashboard, indent, serverPaginated);
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
        // Voir le cas `datalist` : en pagination serveur, tri delegue et pas
        // de recherche locale.
        const serverPaged = serverPaginated.has(cfg.sourceId);
        const search = cfg.searchable && !serverPaged ? ' search' : '';
        const serverSort = serverPaged ? ' server-sort' : '';
        return `${indent}<dsfr-data-list source="${escapeHtml(cfg.sourceId)}"${cols}${search}${serverSort} pagination="${DEFAULT_PAGE_SIZE}">
${indent}</dsfr-data-list>\n`;
      }
      // Forme historique (sans source) conservee pour les dashboards existants.
      const cols = cfg.columns.length ? ` columns='${jsonAttr(cfg.columns)}'` : '';
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

    case 'map':
      return generateMapHTML(widget, widget.config, indent);
  }
}

/** Contenu du conteneur (titre, chapo, sources, lignes de widgets) — sans le squelette de page. */
export function generateDashboardBodyHTML(dashboard: DashboardData): string {
  // Calcule UNE FOIS, puis servi aux sources comme aux widgets : les deux
  // faces de la regle doivent decrire le meme document (une source
  // `server-side` sans `server-sort` en face trierait la page seule).
  const serverPaginated = serverPaginatedSources(dashboard);
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
        widgetsHTML += generateWidgetHTML(widget, dashboard, serverPaginated);
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
    .map((s) =>
      generateSourceHTML(s, '    ', {
        serverSide: serverPaginated.has(s.id),
        pageSize: serverPaginated.get(s.id),
      })
    )
    .join('');

  return (
    `    <h1>${escapeHtml(dashboard.name)}</h1>\n` +
    description +
    (sourcesHTML ? '\n' + sourcesHTML : '') +
    '\n' +
    widgetsHTML
  );
}

/**
 * Ce qu'un widget attend de sa source, du point de vue du CHARGEMENT.
 *
 * - `liste-paginee` : une `dsfr-data-list` qui n'affiche qu'une page a la
 *   fois, sans agregation ni limite — la seule forme qui se contente d'une
 *   page rapatriee du serveur.
 * - `jeu-entier` : tout le reste (graphique, KPI, carte, podium, liste
 *   agregee). Une agregation calculee sur dix lignes est FAUSSE, et elle est
 *   fausse en silence.
 * - `contexte` : un bloc de filtres partages, dont le filtrage est client
 *   (`dsfr-data-context`) et suppose donc le jeu entier.
 */
type ConsumerNeed = 'liste-paginee' | 'jeu-entier' | 'contexte';

interface SourceConsumer {
  need: ConsumerNeed;
  /** Taille de page demandee, pour un consommateur `liste-paginee`. */
  pageSize: number;
}

/**
 * Graphe des consommateurs : id de source -> ce que chaque widget en attend.
 *
 * C'est ce graphe qui rend la regle d'ADR-109 LOCALE : l'export sait deja,
 * au moment d'emettre une balise de source, combien de widgets la lisent et
 * ce qu'ils en font.
 */
function collectSourceConsumers(dashboard: DashboardData): Map<string, SourceConsumer[]> {
  const graph = new Map<string, SourceConsumer[]>();
  const add = (id: string | undefined, consumer: SourceConsumer): void => {
    if (!id) return;
    const existing = graph.get(id);
    if (existing) existing.push(consumer);
    else graph.set(id, [consumer]);
  };
  const jeuEntier: SourceConsumer = { need: 'jeu-entier', pageSize: 0 };

  for (const w of dashboard.widgets) {
    if (w.type === 'text') continue;
    if (w.type === 'filters') {
      for (const id of filterTargetIds(w.config, dashboard)) {
        add(id, { need: 'contexte', pageSize: 0 });
      }
      continue;
    }
    if (w.type === 'map') {
      for (const layer of w.config.layers) add(layer.sourceId, jeuEntier);
      continue;
    }
    if (w.type === 'chart') {
      const cfg = w.config;
      if (isFavoriteChart(cfg)) continue;
      if (isBuilderChart(cfg)) {
        const id = cfg.sourceId || dashboard.sources[0]?.id || '';
        add(id, builderChartConsumer(cfg.chart));
        continue;
      }
      add(cfg.sourceId, jeuEntier);
      continue;
    }
    if (w.type === 'table') {
      // La forme sans source ne branche aucune balise vivante.
      if (w.config.sourceId) {
        add(w.config.sourceId, { need: 'liste-paginee', pageSize: DEFAULT_PAGE_SIZE });
      }
      continue;
    }
    add(w.config.sourceId, jeuEntier);
  }
  graph.delete('');
  return graph;
}

/**
 * Une `datalist` de l'assistant ne se contente d'une page que si elle affiche
 * les lignes telles quelles. Avec une agregation, elle lit des groupes — et
 * un `group-by` pagine cote serveur rend un total de pages faux (ODS annonce
 * la taille de page, pas le nombre de groupes, #641). Avec une limite, elle
 * affiche un palmares, pas un tableau qu'on feuillette.
 */
function builderChartConsumer(c: ChartConfig): SourceConsumer {
  const paginable = c.type === 'datalist' && !c.aggregation && !c.limit;
  return paginable
    ? { need: 'liste-paginee', pageSize: c.pagination ?? DEFAULT_PAGE_SIZE }
    : { need: 'jeu-entier', pageSize: 0 };
}

/**
 * Sources que le document peut paginer cote serveur, avec leur taille de page
 * (ADR-109, #717).
 *
 * Le critere est volontairement etroit : **une source, un seul consommateur,
 * et ce consommateur est une liste paginee**. Une source n'etant emise qu'UNE
 * FOIS et partagee par tous les widgets, poser `server-side` sur une source
 * partagee ne ferait plus parvenir qu'une page de dix lignes au graphique ou
 * au KPI d'a cote : une agregation fausse, sans la moindre erreur. Le cas de
 * la source partagee garde donc sa reponse existante, `fetch-mode="export"`
 * (#689, ADR-106) : une requete au lieu de trente, et le jeu entier.
 */
function serverPaginatedSources(dashboard: DashboardData): Map<string, number> {
  const paginated = new Map<string, number>();
  const graph = collectSourceConsumers(dashboard);
  const byId = new Map(dashboard.sources.map((s) => [s.id, s]));
  for (const [id, consumers] of graph) {
    if (consumers.length !== 1) continue;
    const only = consumers[0];
    if (only.need !== 'liste-paginee') continue;
    const source = byId.get(id);
    if (!source || !supportsServerPagination(source)) continue;
    paginated.set(id, only.pageSize);
  }
  return paginated;
}

/** Ids de sources effectivement references par au moins un widget. */
function collectUsedSourceIds(dashboard: DashboardData): Set<string> {
  return new Set(collectSourceConsumers(dashboard).keys());
}

/** Le bundle core suffit sauf si un widget rend une carte (composants Leaflet). */
function requiresMapBundle(dashboard: DashboardData): boolean {
  return dashboard.widgets.some(
    (w) =>
      w.type === 'map' ||
      (w.type === 'chart' &&
        isBuilderChart(w.config) &&
        ['map', 'map-reg', 'map-aca', 'map-monde'].includes(w.config.chart.type))
  );
}

/** Page DSFR complete et autonome. */
export interface DashboardHTMLOptions {
  /**
   * Injecte le tampon d'evenements du volet Diagnostic (#605).
   *
   * Sans lui, un observateur exterieur arrive systematiquement trop tard : le
   * bus emet pendant le parsing, bien avant le `load` de l'iframe. La trace
   * est alors reconstituee depuis le cache — sans chronologie, et SANS LES
   * ERREURS, qui ne laissent aucune trace en cache. Un echec rapide (404,
   * CORS, configuration) redevient invisible.
   *
   * Le tampon est inerte tant que personne ne le vide : l'aperçu exporte par
   * l'utilisateur ne le porte jamais.
   */
  debug?: boolean;
}

export function generateDashboardHTML(
  dashboard: DashboardData,
  options: DashboardHTMLOptions = {}
): string {
  const bundle = requiresMapBundle(dashboard) ? 'dsfr-data.esm.js' : 'dsfr-data.core.esm.js';
  // EN TETE du head, avant la moindre feuille ou le moindre module.
  const earlyBuffer = options.debug ? `\n  ${earlyBufferScript()}` : '';
  return `<!DOCTYPE html>
<html lang="fr" data-fr-theme>
<head>
  <meta charset="UTF-8">${earlyBuffer}
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
