/**
 * FICHIER GENERE — NE PAS EDITER A LA MAIN.
 *
 * Source : packages/core/custom-elements.json (lui-meme genere depuis le code).
 * Regeneration : npm run build:component-contract
 *
 * 28 balises, 376 attributs, 16 enumerations, 64 attributs-champs.
 */

export const COMPONENT_CONTRACT = {
  "dsfr-data-a11y": {
    "attributes": [
      "decimals",
      "description",
      "download",
      "empty-label",
      "filename",
      "for",
      "idle-message",
      "label",
      "label-field",
      "no-auto-aria",
      "series-field",
      "source",
      "table",
      "value-field"
    ],
    "fields": {
      "label-field": "nom",
      "series-field": "nom",
      "value-field": "liste"
    }
  },
  "dsfr-data-beacon": {
    "attributes": [
      "url"
    ]
  },
  "dsfr-data-chart": {
    "attributes": [
      "code-field",
      "color-map",
      "databox",
      "databox-actions",
      "databox-date",
      "databox-date-field",
      "databox-default-source",
      "databox-download",
      "databox-fullscreen",
      "databox-modal-content",
      "databox-modal-title",
      "databox-screenshot",
      "databox-source",
      "databox-title",
      "databox-tooltip-content",
      "databox-tooltip-title",
      "databox-trend",
      "empty-label",
      "fill",
      "gauge-value",
      "heading-level",
      "highlight-index",
      "horizontal",
      "idle-message",
      "label-field",
      "map-highlight",
      "map-summary",
      "map-summary-field",
      "map-summary-value",
      "map-summary-weight",
      "name",
      "reference-lines",
      "selected-palette",
      "series-field",
      "source",
      "stacked",
      "targets",
      "targets-legend",
      "targets-zone",
      "type",
      "unit-tooltip",
      "unit-tooltip-bar",
      "value-field",
      "value-field-2",
      "value-fields",
      "x-max",
      "x-min",
      "y-max",
      "y-min"
    ],
    "enums": {
      "type": [
        "line",
        "bar",
        "pie",
        "radar",
        "gauge",
        "scatter",
        "bar-line",
        "map",
        "map-reg",
        "map-aca",
        "map-monde"
      ]
    },
    "fields": {
      "code-field": "nom",
      "databox-date-field": "nom",
      "label-field": "nom",
      "map-summary-field": "nom",
      "series-field": "nom",
      "value-field": "liste-alias",
      "value-field-2": "liste-alias",
      "value-fields": "liste-alias"
    }
  },
  "dsfr-data-concat": {
    "attributes": [
      "origin-field",
      "origin-labels",
      "sources"
    ]
  },
  "dsfr-data-context": {
    "attributes": [
      "sources",
      "url-param-map",
      "url-sync"
    ]
  },
  "dsfr-data-context-filter": {
    "attributes": [
      "apply-to",
      "context",
      "default",
      "field",
      "label",
      "operator",
      "ui",
      "year-start-month"
    ],
    "enums": {
      "operator": [
        "eq",
        "in",
        "lt",
        "gte",
        "between",
        "contains",
        "month-of",
        "year-of",
        "lt-day-after",
        "last-n-days",
        "current-year",
        "current-month"
      ]
    }
  },
  "dsfr-data-context-tags": {
    "attributes": [
      "clear-all",
      "for"
    ]
  },
  "dsfr-data-context-value": {
    "attributes": [
      "fallback",
      "field",
      "for",
      "live",
      "template"
    ]
  },
  "dsfr-data-display": {
    "attributes": [
      "cols",
      "context",
      "count-label",
      "empty",
      "gap",
      "idle-message",
      "label",
      "pagination",
      "per-row",
      "refine-on-click",
      "source",
      "uid-field",
      "url-page-param",
      "url-sync"
    ],
    "fields": {
      "uid-field": "nom"
    }
  },
  "dsfr-data-facets": {
    "attributes": [
      "cols",
      "context",
      "default",
      "disjunctive",
      "display",
      "fields",
      "hide-counts",
      "hide-empty",
      "labels",
      "max-values",
      "no-reset",
      "per-row",
      "searchable",
      "server-facets",
      "sort",
      "source",
      "span",
      "static-values",
      "url-param-map",
      "url-params",
      "url-sync",
      "value-labels",
      "weight-field"
    ],
    "fields": {
      "disjunctive": "liste",
      "fields": "liste",
      "searchable": "liste",
      "weight-field": "nom"
    }
  },
  "dsfr-data-join": {
    "attributes": [
      "left",
      "on",
      "prefix-left",
      "prefix-right",
      "right",
      "type"
    ],
    "enums": {
      "type": [
        "inner",
        "left",
        "right",
        "full"
      ]
    },
    "fields": {
      "on": "paires"
    }
  },
  "dsfr-data-kpi": {
    "attributes": [
      "border",
      "col",
      "color-token",
      "decimals",
      "description",
      "format",
      "heading",
      "icon",
      "icon-position",
      "icon-size",
      "idle-message",
      "image",
      "image-alt",
      "image-position",
      "label",
      "lines",
      "orientation",
      "picto",
      "picto-base",
      "picto-field",
      "source",
      "span",
      "threshold-green",
      "threshold-orange",
      "tint",
      "trend",
      "unit",
      "value",
      "where"
    ],
    "deprecated": {
      "valeur": "alias français de `value` (#300)",
      "icone": "alias français de `icon` (#300)",
      "tendance": "alias français de `trend` (#300)",
      "seuil-vert": "alias français de `threshold-green` (#300)",
      "seuil-orange": "alias français de `threshold-orange` (#300)",
      "color": "alias de `color-token` (#367) — le nom `color` évoque l'attribut\nde présentation HTML déprécié (faux positif d'audit RGAA 10.1.2)",
      "couleur": "alias français de `color-token` (#300)"
    },
    "enums": {
      "color-token": [
        "",
        "vert",
        "orange",
        "rouge",
        "bleu",
        "green-tilleul-verveine",
        "green-bourgeon",
        "green-emeraude",
        "green-menthe",
        "green-archipel",
        "blue-ecume",
        "blue-cumulus",
        "purple-glycine",
        "pink-macaron",
        "pink-tuile",
        "yellow-tournesol",
        "yellow-moutarde",
        "orange-terre-battue",
        "brown-cafe-creme",
        "brown-caramel",
        "brown-opera",
        "beige-gris-galet"
      ],
      "format": [
        "nombre",
        "pourcentage",
        "euro",
        "decimal",
        "compact",
        "date"
      ]
    },
    "fields": {
      "picto-field": "nom",
      "tendance": "expression",
      "trend": "expression",
      "valeur": "expression",
      "value": "expression",
      "where": "clauses"
    }
  },
  "dsfr-data-kpi-group": {
    "attributes": [
      "cols",
      "gap",
      "orientation",
      "per-row"
    ],
    "enums": {
      "gap": [
        "sm",
        "md",
        "lg"
      ]
    }
  },
  "dsfr-data-list": {
    "attributes": [
      "caption",
      "cell-class",
      "columns",
      "columns-auto",
      "context",
      "count-label",
      "decimals",
      "export",
      "filters",
      "idle-message",
      "label",
      "pagination",
      "refine-on-click",
      "search",
      "server-sort",
      "sort",
      "source",
      "url-page-param",
      "url-sync"
    ],
    "deprecated": {
      "colonnes": "alias français de `columns` (#300)",
      "recherche": "alias français de `search` (#300)",
      "filtres": "alias français de `filters` (#300)",
      "tri": "alias français de `sort` (#300)",
      "server-tri": "alias français de `server-sort` (#300)"
    },
    "fields": {
      "colonnes": "liste-alias",
      "columns": "liste-alias",
      "filters": "liste",
      "filtres": "liste",
      "sort": "liste-alias",
      "tri": "liste-alias"
    }
  },
  "dsfr-data-map": {
    "attributes": [
      "center",
      "fit-bounds",
      "fit-max-zoom",
      "fit-zone",
      "fullscreen",
      "height",
      "insets",
      "locked",
      "max-bounds",
      "max-zoom",
      "min-zoom",
      "name",
      "no-controls",
      "sovereign-only",
      "tiles",
      "tiles-attribution",
      "tiles-style",
      "tiles-switcher",
      "zoom"
    ],
    "enums": {
      "tiles-style": [
        "",
        "muted",
        "grey"
      ]
    }
  },
  "dsfr-data-map-inset": {
    "attributes": [
      "center",
      "height",
      "label",
      "territory",
      "width",
      "zoom"
    ]
  },
  "dsfr-data-map-layer": {
    "attributes": [
      "bbox",
      "bbox-debounce",
      "bbox-field",
      "breaks",
      "classes",
      "cluster",
      "cluster-radius",
      "color",
      "color-field",
      "color-map",
      "context",
      "fill-field",
      "fill-opacity",
      "geo-field",
      "group-field",
      "heat-blur",
      "heat-field",
      "heat-radius",
      "label",
      "lat-field",
      "lon-field",
      "max-items",
      "max-zoom",
      "method",
      "min-zoom",
      "no-interactive",
      "popup-fields",
      "popup-template",
      "radius",
      "radius-field",
      "radius-max",
      "radius-min",
      "radius-unit",
      "refine-on-click",
      "selected-palette",
      "shape-class",
      "source",
      "time-bucket",
      "time-field",
      "time-mode",
      "tooltip-field",
      "type"
    ],
    "enums": {
      "method": [
        "quantile",
        "equal",
        "manual"
      ],
      "radius-unit": [
        "px",
        "m"
      ],
      "time-bucket": [
        "none",
        "hour",
        "day",
        "month",
        "year"
      ],
      "time-mode": [
        "snapshot",
        "cumulative"
      ],
      "type": [
        "marker",
        "geoshape",
        "circle",
        "heatmap"
      ]
    },
    "fields": {
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
    }
  },
  "dsfr-data-map-legend": {
    "attributes": [
      "for",
      "label"
    ]
  },
  "dsfr-data-map-popup": {
    "attributes": [
      "for",
      "mode",
      "title-field",
      "width"
    ],
    "enums": {
      "mode": [
        "popup",
        "modal",
        "panel-right",
        "panel-left"
      ]
    },
    "fields": {
      "title-field": "nom"
    }
  },
  "dsfr-data-map-timeline": {
    "attributes": [
      "for",
      "interval",
      "label",
      "speed"
    ]
  },
  "dsfr-data-normalize": {
    "attributes": [
      "compute",
      "flatten",
      "fold",
      "fold-drop",
      "lowercase-keys",
      "numeric",
      "numeric-auto",
      "rename",
      "replace",
      "replace-fields",
      "round",
      "source",
      "split",
      "strip-html",
      "trim"
    ],
    "fields": {
      "flatten": "chemin",
      "numeric": "liste",
      "rename": "pipe-alias",
      "replace-fields": "pipe-alias",
      "round": "liste-alias",
      "split": "liste-alias"
    }
  },
  "dsfr-data-pivot": {
    "attributes": [
      "aggregate",
      "column",
      "column-format",
      "column-order",
      "labels",
      "max-columns",
      "row",
      "source",
      "value"
    ],
    "fields": {
      "column": "nom",
      "row": "liste",
      "value": "nom"
    }
  },
  "dsfr-data-podium": {
    "attributes": [
      "bar",
      "bar-max",
      "bar-position",
      "border",
      "icon",
      "icon-field",
      "idle-message",
      "image-field",
      "image-shape",
      "label-field",
      "layout",
      "max-items",
      "no-sort",
      "orientation",
      "picto",
      "picto-base",
      "picto-field",
      "rank",
      "rounded",
      "selected-palette",
      "source",
      "square",
      "subtitle",
      "subtitle-field",
      "value-field",
      "value-unit"
    ],
    "fields": {
      "icon-field": "nom",
      "image-field": "nom",
      "label-field": "nom",
      "picto-field": "nom",
      "subtitle-field": "nom",
      "value-field": "nom"
    }
  },
  "dsfr-data-query": {
    "attributes": [
      "aggregate",
      "explode",
      "filter",
      "group-by",
      "limit",
      "order-by",
      "require-where",
      "source",
      "where"
    ],
    "fields": {
      "filter": "clauses",
      "group-by": "liste",
      "where": "clauses"
    }
  },
  "dsfr-data-repeat": {
    "attributes": [
      "empty",
      "key-field",
      "lazy",
      "per-row",
      "scopes",
      "source"
    ],
    "fields": {
      "key-field": "nom"
    }
  },
  "dsfr-data-search": {
    "attributes": [
      "context",
      "count",
      "count-label",
      "debounce",
      "fields",
      "highlight",
      "idle-message",
      "label",
      "min-length",
      "operator",
      "placeholder",
      "search-template",
      "server-search",
      "source",
      "sr-label",
      "url-search-param",
      "url-sync"
    ],
    "enums": {
      "operator": [
        "contains",
        "starts",
        "words"
      ]
    },
    "fields": {
      "fields": "liste"
    }
  },
  "dsfr-data-source": {
    "attributes": [
      "aggregate",
      "api-key-ref",
      "api-type",
      "base-url",
      "cache-ttl",
      "data",
      "dataset-id",
      "fetch-mode",
      "group-by",
      "headers",
      "lazy",
      "lazy-target",
      "limit",
      "max-records",
      "method",
      "order-by",
      "page-size",
      "paginate",
      "params",
      "proxy-url",
      "refresh",
      "require-where",
      "resource",
      "select",
      "server-side",
      "transform",
      "url",
      "use-proxy",
      "where"
    ],
    "enums": {
      "fetch-mode": [
        "records",
        "export"
      ],
      "method": [
        "GET",
        "POST"
      ]
    }
  },
  "dsfr-data-unpivot": {
    "attributes": [
      "drop-empty",
      "id-cols",
      "source",
      "value-cols",
      "value-cols-pattern",
      "value-name",
      "var-format",
      "var-name"
    ],
    "fields": {
      "id-cols": "liste",
      "value-cols": "liste-alias"
    }
  }
} as const;
