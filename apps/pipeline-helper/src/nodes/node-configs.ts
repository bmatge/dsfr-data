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
      name: 'api-key-ref',
      label: 'Cle API (ref)',
      type: 'text',
      placeholder: 'ma-cle-grist',
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
    // aggregate is handled by AggregateControl, not a simple attribute
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

export const OUTPUT_CONFIG: PipelineNodeConfig = {
  label: 'Sortie',
  component: '__output__',
  category: 'display',
  icon: 'ri-check-double-line',
  description: 'Donnees recues en bout de chaine',
  attributes: [],
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

/** All node configs indexed by type key */
export const NODE_CONFIGS: Record<string, PipelineNodeConfig> = {
  source: SOURCE_CONFIG,
  normalize: NORMALIZE_CONFIG,
  query: QUERY_CONFIG,
  join: JOIN_CONFIG,
  search: SEARCH_CONFIG,
  facets: FACETS_CONFIG,
  output: OUTPUT_CONFIG,
  a11y: A11Y_CONFIG,
};
