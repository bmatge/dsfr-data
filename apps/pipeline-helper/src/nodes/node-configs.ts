import { PipelineNodeConfig } from './base-node.js';

export const SOURCE_CONFIG: PipelineNodeConfig = {
  label: 'Source',
  component: 'dsfr-data-source',
  category: 'source',
  icon: 'ri-database-2-line',
  description: 'Recupere les donnees depuis une API ou un fichier',
  attributes: [
    {
      name: 'api-type',
      label: 'Type API',
      type: 'select',
      options: [
        { value: 'opendatasoft', label: 'OpenDataSoft' },
        { value: 'tabular', label: 'Tabular (data.gouv)' },
        { value: 'grist', label: 'Grist' },
        { value: 'generic', label: 'Generic (URL)' },
        { value: 'insee', label: 'INSEE Melodi' },
      ],
      default: 'opendatasoft',
    },
    {
      name: 'base-url',
      label: 'URL de base',
      type: 'text',
      placeholder: 'https://data.economie.gouv.fr',
    },
    {
      name: 'dataset-id',
      label: 'Dataset ID',
      type: 'text',
      placeholder: 'mon-dataset',
    },
    {
      name: 'server-side',
      label: 'Pagination serveur',
      type: 'boolean',
      default: '',
    },
    {
      name: 'page-size',
      label: 'Page size',
      type: 'number',
      placeholder: '20',
    },
  ],
};

export const QUERY_CONFIG: PipelineNodeConfig = {
  label: 'Query',
  component: 'dsfr-data-query',
  category: 'transform',
  icon: 'ri-filter-3-line',
  description: 'Transforme les donnees : filtre, groupe, agrege, trie',
  attributes: [
    {
      name: 'group-by',
      label: 'Group By',
      type: 'text',
      placeholder: 'region',
    },
    {
      name: 'aggregate',
      label: 'Aggregate',
      type: 'text',
      placeholder: 'population:sum:total',
    },
    {
      name: 'order-by',
      label: 'Order By',
      type: 'text',
      placeholder: 'total:desc',
    },
    {
      name: 'filter',
      label: 'Filter',
      type: 'text',
      placeholder: 'status = "active"',
    },
  ],
};

export const SEARCH_CONFIG: PipelineNodeConfig = {
  label: 'Search',
  component: 'dsfr-data-search',
  category: 'interact',
  icon: 'ri-search-line',
  description: 'Barre de recherche textuelle',
  attributes: [
    {
      name: 'placeholder',
      label: 'Placeholder',
      type: 'text',
      placeholder: 'Rechercher...',
    },
    {
      name: 'fields',
      label: 'Champs',
      type: 'text',
      placeholder: 'nom,description',
    },
  ],
};

export const FACETS_CONFIG: PipelineNodeConfig = {
  label: 'Facets',
  component: 'dsfr-data-facets',
  category: 'interact',
  icon: 'ri-list-check-2',
  description: 'Filtres a facettes interactifs',
  attributes: [
    {
      name: 'fields',
      label: 'Champs',
      type: 'text',
      placeholder: 'categorie,region',
    },
    {
      name: 'type',
      label: 'Type',
      type: 'select',
      options: [
        { value: 'checkbox', label: 'Checkbox' },
        { value: 'radio', label: 'Radio' },
        { value: 'select', label: 'Select' },
      ],
      default: 'checkbox',
    },
  ],
};

export const CHART_CONFIG: PipelineNodeConfig = {
  label: 'Chart',
  component: 'dsfr-data-chart',
  category: 'display',
  icon: 'ri-bar-chart-box-line',
  description: 'Graphique (bar, line, pie, radar, etc.)',
  attributes: [
    {
      name: 'type',
      label: 'Type',
      type: 'select',
      options: [
        { value: 'bar', label: 'Barres' },
        { value: 'horizontalBar', label: 'Barres horizontales' },
        { value: 'line', label: 'Ligne' },
        { value: 'pie', label: 'Camembert' },
        { value: 'doughnut', label: 'Donut' },
        { value: 'radar', label: 'Radar' },
        { value: 'scatter', label: 'Nuage de points' },
        { value: 'map', label: 'Carte departements' },
        { value: 'map-reg', label: 'Carte regions' },
        { value: 'worldMap', label: 'Carte monde' },
      ],
      default: 'bar',
    },
    {
      name: 'label-field',
      label: 'Champ label',
      type: 'text',
      placeholder: 'region',
    },
    {
      name: 'value-field',
      label: 'Champ valeur',
      type: 'text',
      placeholder: 'total',
    },
    {
      name: 'title',
      label: 'Titre',
      type: 'text',
      placeholder: 'Mon graphique',
    },
  ],
};

export const LIST_CONFIG: PipelineNodeConfig = {
  label: 'List',
  component: 'dsfr-data-list',
  category: 'display',
  icon: 'ri-table-line',
  description: 'Liste / tableau de donnees avec pagination',
  attributes: [
    {
      name: 'colonnes',
      label: 'Colonnes',
      type: 'text',
      placeholder: 'nom,email,ville',
    },
    {
      name: 'pagination',
      label: 'Pagination',
      type: 'number',
      placeholder: '20',
    },
  ],
};

export const KPI_CONFIG: PipelineNodeConfig = {
  label: 'KPI',
  component: 'dsfr-data-kpi',
  category: 'display',
  icon: 'ri-dashboard-3-line',
  description: 'Indicateur chiffre cle',
  attributes: [
    {
      name: 'value-field',
      label: 'Champ valeur',
      type: 'text',
      placeholder: 'total',
    },
    {
      name: 'label',
      label: 'Label',
      type: 'text',
      placeholder: 'Total population',
    },
    {
      name: 'description',
      label: 'Description',
      type: 'text',
      placeholder: 'Source : INSEE',
    },
  ],
};

export const A11Y_CONFIG: PipelineNodeConfig = {
  label: 'A11y',
  component: 'dsfr-data-a11y',
  category: 'a11y',
  icon: 'ri-accessibility-line',
  description: 'Accessibilite : tableau, CSV, description',
  attributes: [
    {
      name: 'table',
      label: 'Tableau',
      type: 'boolean',
      default: 'true',
    },
    {
      name: 'download',
      label: 'Telechargement CSV',
      type: 'boolean',
      default: 'true',
    },
  ],
};

export const NORMALIZE_CONFIG: PipelineNodeConfig = {
  label: 'Normalize',
  component: 'dsfr-data-normalize',
  category: 'transform',
  icon: 'ri-edit-2-line',
  description: 'Nettoie et normalise les donnees (types, renommage, trim...)',
  attributes: [
    {
      name: 'numeric',
      label: 'Champs numeriques',
      type: 'text',
      placeholder: 'population, surface',
    },
    {
      name: 'numeric-auto',
      label: 'Detection auto numerique',
      type: 'boolean',
    },
    {
      name: 'rename',
      label: 'Renommage',
      type: 'text',
      placeholder: 'ancien:nouveau | ancien2:nouveau2',
    },
    {
      name: 'flatten',
      label: 'Aplatir sous-objet',
      type: 'text',
      placeholder: 'data.attributes',
    },
    {
      name: 'trim',
      label: 'Trim espaces',
      type: 'boolean',
    },
    {
      name: 'strip-html',
      label: 'Supprimer HTML',
      type: 'boolean',
    },
    {
      name: 'round',
      label: 'Arrondir',
      type: 'text',
      placeholder: 'population:0, score:2',
    },
    {
      name: 'lowercase-keys',
      label: 'Cles en minuscules',
      type: 'boolean',
    },
  ],
};

export const JOIN_CONFIG: PipelineNodeConfig = {
  label: 'Join',
  component: 'dsfr-data-join',
  category: 'transform',
  icon: 'ri-git-merge-line',
  description: 'Joint deux sources de donnees sur une cle pivot',
  attributes: [
    {
      name: 'on',
      label: 'Cle de jointure',
      type: 'text',
      placeholder: 'code_dept ou left_key=right_key',
    },
    {
      name: 'type',
      label: 'Type de jointure',
      type: 'select',
      options: [
        { value: 'inner', label: 'Inner' },
        { value: 'left', label: 'Left' },
        { value: 'right', label: 'Right' },
        { value: 'full', label: 'Full' },
      ],
      default: 'left',
    },
    {
      name: 'prefix-left',
      label: 'Prefixe gauche',
      type: 'text',
      placeholder: '',
    },
    {
      name: 'prefix-right',
      label: 'Prefixe droite',
      type: 'text',
      placeholder: 'right_',
    },
  ],
};

export const DISPLAY_CONFIG: PipelineNodeConfig = {
  label: 'Display',
  component: 'dsfr-data-display',
  category: 'display',
  icon: 'ri-article-line',
  description: 'Affichage libre avec template HTML',
  attributes: [
    {
      name: 'template',
      label: 'Template',
      type: 'text',
      placeholder: '<p>{{nom}} - {{valeur}}</p>',
    },
  ],
};

export const PODIUM_CONFIG: PipelineNodeConfig = {
  label: 'Podium',
  component: 'dsfr-data-podium',
  category: 'display',
  icon: 'ri-trophy-line',
  description: 'Affichage podium (top 3)',
  attributes: [
    {
      name: 'label-field',
      label: 'Champ label',
      type: 'text',
      placeholder: 'nom',
    },
    {
      name: 'value-field',
      label: 'Champ valeur',
      type: 'text',
      placeholder: 'score',
    },
  ],
};

/** All node configs indexed by type key */
export const NODE_CONFIGS: Record<string, PipelineNodeConfig> = {
  source: SOURCE_CONFIG,
  normalize: NORMALIZE_CONFIG,
  query: QUERY_CONFIG,
  join: JOIN_CONFIG,
  search: SEARCH_CONFIG,
  facets: FACETS_CONFIG,
  chart: CHART_CONFIG,
  list: LIST_CONFIG,
  kpi: KPI_CONFIG,
  display: DISPLAY_CONFIG,
  podium: PODIUM_CONFIG,
  a11y: A11Y_CONFIG,
};
