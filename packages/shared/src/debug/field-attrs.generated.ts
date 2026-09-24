/**
 * FICHIER GENERE — NE PAS EDITER A LA MAIN.
 *
 * Attributs qui designent un champ des donnees, par balise, et la grammaire de
 * leur valeur (#1141). Source : le tag JSDoc `@champ <grammaire>` des
 * composants (packages/core/src/components), relu dans le manifeste.
 * Regeneration : npm run build:component-contract (inclus dans build:skills).
 */

export const CHAMPS_DES_COMPOSANTS = {
  "dsfr-data-a11y": {
    "label-field": "nom",
    "series-field": "nom",
    "value-field": "liste"
  },
  "dsfr-data-chart": {
    "code-field": "nom",
    "databox-date-field": "nom",
    "label-field": "nom",
    "map-summary-field": "nom",
    "series-field": "nom",
    "value-field": "liste-alias",
    "value-field-2": "liste-alias",
    "value-fields": "liste-alias"
  },
  "dsfr-data-display": {
    "uid-field": "nom"
  },
  "dsfr-data-facets": {
    "disjunctive": "liste",
    "fields": "liste",
    "searchable": "liste",
    "weight-field": "nom"
  },
  "dsfr-data-join": {
    "on": "paires"
  },
  "dsfr-data-kpi": {
    "picto-field": "nom",
    "tendance": "expression",
    "trend": "expression",
    "valeur": "expression",
    "value": "expression",
    "where": "clauses"
  },
  "dsfr-data-list": {
    "colonnes": "liste-alias",
    "columns": "liste-alias",
    "filters": "liste",
    "filtres": "liste",
    "sort": "liste-alias",
    "tri": "liste-alias"
  },
  "dsfr-data-map-layer": {
    "bbox-field": "nom",
    "color-field": "nom",
    "fill-field": "nom",
    "geo-field": "nom",
    "group-field": "nom",
    "heat-field": "nom",
    "lat-field": "nom",
    "lon-field": "nom",
    "popup-fields": "liste",
    "radius-field": "nom",
    "time-field": "nom",
    "tooltip-field": "nom"
  },
  "dsfr-data-map-popup": {
    "title-field": "nom"
  },
  "dsfr-data-normalize": {
    "flatten": "chemin",
    "numeric": "liste",
    "rename": "pipe-alias",
    "replace-fields": "pipe-alias",
    "round": "liste-alias",
    "split": "liste-alias"
  },
  "dsfr-data-pivot": {
    "column": "nom",
    "row": "liste",
    "value": "nom"
  },
  "dsfr-data-podium": {
    "icon-field": "nom",
    "image-field": "nom",
    "label-field": "nom",
    "picto-field": "nom",
    "subtitle-field": "nom",
    "value-field": "nom"
  },
  "dsfr-data-query": {
    "filter": "clauses",
    "group-by": "liste",
    "where": "clauses"
  },
  "dsfr-data-repeat": {
    "key-field": "nom"
  },
  "dsfr-data-search": {
    "fields": "liste"
  },
  "dsfr-data-unpivot": {
    "id-cols": "liste",
    "value-cols": "liste-alias"
  }
} as const;
