/**
 * Menu structure for the guide pages.
 * Used by <app-sidemenu section="guide">.
 * Edit this file to add/remove/rename guide menu entries.
 */
(window.__APP_MENUS__ = window.__APP_MENUS__ || {}).guide = [
  {
    title: "Guide",
    items: [
      { id: "overview", label: "Vue d'ensemble", href: "guide.html" },
      {
        id: "parcours", label: "Parcours utilisateur",
        children: [
          { id: "parcours-a", label: "Donnees locales", href: "guide-parcours.html#parcours-a" },
          { id: "parcours-b", label: "Graphique Grist", href: "guide-parcours.html#parcours-b" },
          { id: "parcours-c", label: "Builder IA", href: "guide-parcours.html#parcours-c" },
          { id: "parcours-d", label: "Playground", href: "guide-parcours.html#parcours-d" },
          { id: "parcours-e", label: "Tableau de bord", href: "guide-parcours.html#parcours-e" },
          { id: "parcours-f", label: "API REST externe", href: "guide-parcours.html#parcours-f" },
          { id: "parcours-g", label: "Monitoring", href: "guide-parcours.html#parcours-g" }
        ]
      },
      {
        id: "guide-composants", label: "Guide par composant",
        children: [
          { id: "exemples-source", label: "dsfr-data-source", href: "guide-exemples-source.html" },
          { id: "exemples-normalize", label: "dsfr-data-normalize", href: "guide-exemples-normalize.html" },
          { id: "exemples-query", label: "dsfr-data-query", href: "guide-exemples-query.html" },
          { id: "exemples-search", label: "dsfr-data-search", href: "guide-exemples-search.html" },
          { id: "exemples-facets", label: "dsfr-data-facets", href: "guide-exemples-facets.html" },
          { id: "exemples-display", label: "dsfr-data-display", href: "guide-exemples-display.html" },
          { id: "exemples-chart-a11y", label: "dsfr-data-a11y", href: "guide-exemples-chart-a11y.html" }
        ]
      },
      {
        id: "exemples-avances", label: "Exemples avances",
        children: [
          { id: "world-map", label: "Dashboard Huwise", href: "guide-exemples-world-map.html" },
          { id: "exemple-ods", label: "Recherche Huwise", href: "guide-exemple-ODS.html" },
          { id: "insee-erfs", label: "Dashboard INSEE", href: "guide-exemples-insee-erfs.html" },
          { id: "maires", label: "Dashboard Tabular (data.gouv)", href: "guide-exemples-maires.html" },
          { id: "ghibli", label: "Dashboard generic (ghibli)", href: "guide-exemples-ghibli.html" }
        ]
      },
      { id: "grist-widgets", label: "Widgets Grist", href: "guide-grist-widgets.html" }
    ]
  }
];
