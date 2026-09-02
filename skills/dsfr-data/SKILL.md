---
name: dsfr-data
description: Génère et corrige du HTML/JS qui utilise les Web Components dataviz dsfr-data (<dsfr-data-source>, query, normalize, facets, search, chart, kpi, list, map, context…). À charger dès qu'il est question de dsfr-data, de DSFR Chart, d'un graphique / carte / tableau / KPI conforme DSFR alimenté par une API (OpenDataSoft, data.gouv, Grist, INSEE Melodi) ou d'un pipeline source → transformation → affichage.
---

# dsfr-data — skill Claude Code

Bibliothèque de Web Components de dataviz conformes au DSFR (Design System de l'État), version
0.18.0. Cette skill est **générée** par `npm run build:skills` depuis les skills du builder-IA
(`apps/builder-ia/src/skills.ts` + référence extraite du code) : ne pas l'éditer à la main.

## Principe : un pipeline d'éléments HTML reliés par `id` / `source`

```html
<dsfr-data-source id="src" api-type="opendatasoft"
  base-url="https://data.economie.gouv.fr" dataset-id="mon-dataset"></dsfr-data-source>
<dsfr-data-query id="q" source="src" group-by="region" aggregate="population:sum"></dsfr-data-query>
<dsfr-data-chart source="q" type="bar" label-field="region" value-field="population__sum"></dsfr-data-chart>
```

- Une **source** charge les données (API ou données inline), les **transformateurs** (query,
  normalize, join, unpivot, facets, search, context) consomment un `source` et ré-émettent sous
  leur propre `id`, les **afficheurs** (chart, kpi, list, display, map, podium) sont des feuilles.
- Les alias d'agrégation suivent la convention `champ__fonction` (`population__sum`).
- Chargement : `<script type="module" src=".../dsfr-data.esm.js">` + CSS DSFR et DSFR Chart
  (voir la référence `compositionPatterns`).
- Dans les exemples, `https://VOTRE_INSTANCE/dist` désigne l'URL de la bibliothèque (CDN
  `https://cdn.jsdelivr.net/npm/dsfr-data@0/dist` ou `/dist` de votre instance) et les chemins
  `/…-proxy/` sont relatifs à votre instance Charts builder.

## Méthode

1. Identifier le besoin (quelle source, quelle transformation, quel affichage).
2. **Lire la référence** du ou des composants concernés dans `references/` avant d'écrire :
   attributs, événements, slots et pièges y sont exhaustifs et générés depuis le code.
3. Vérifier les cas d'erreur listés dans `troubleshooting` quand un rendu reste vide.

## Références

### Pipeline de données (source → transformation → affichage)

| Référence | Quand la lire | Déclencheurs |
|---|---|---|
| [dsfr-data-source](references/dsfr-data-source.md) | Composant de connexion aux données (API REST) | source, charger, connecter, rafraichir, url, api |
| [dsfr-data-query](references/dsfr-data-query.md) | Filtrage, agrégation et tri declaratif des données | filtre, filtrer, grouper, agréger, trier, transformer |
| [dsfr-data-normalize](references/dsfr-data-normalize.md) | Nettoyage et normalisation des données avant traitement | normaliser, nettoyer, renommer, convertir, normalize, clean |
| [dsfr-data-join](references/dsfr-data-join.md) | Jointure multi-sources autour d'une clé pivot | join, jointure, croiser, fusionner, enrichir, merge |
| [dsfr-data-unpivot](references/dsfr-data-unpivot.md) | Bascule un tableau "wide" (temps dans les noms de colonnes) en "long/tidy" | unpivot, depivot, melt, wide, tableur, colonnes en lignes |

### Interaction et filtres

| Référence | Quand la lire | Déclencheurs |
|---|---|---|
| [dsfr-data-facets](references/dsfr-data-facets.md) | Filtres a facettes interactifs pour exploration de données | facette, facets, filtre interactif, catégorie, refinement, exploration |
| [dsfr-data-search](references/dsfr-data-search.md) | Recherche textuelle avec champ DSFR, filtre les données en amont | recherche, search, chercher, filtrer texte, barre de recherche, full-text |
| [dsfr-data-context](references/dsfr-data-context.md) | Filtres transverses multi-sources (dashboard a filtre commun) | context, contexte, filtre commun, filtre partage, filtre transverse, dashboard filtre |
| [dsfr-data-context-filter](references/dsfr-data-context-filter.md) | Un filtre d'un dsfr-data-context (ecoute un element d'UI) | context-filter, filtre contexte, filtre ui, apply-to |
| [dsfr-data-context-tags](references/dsfr-data-context-tags.md) | Tags DSFR recapitulant les filtres actifs d'un contexte (supprimables) | context-tags, tags filtres, filtres actifs, recap filtres, retirer filtre |

### Affichage

| Référence | Quand la lire | Déclencheurs |
|---|---|---|
| [dsfr-data-chart](references/dsfr-data-chart.md) | Wrapper DSFR Chart connecte aux sources de données | graphique, chart, visualisation, barres, camembert, ligne |
| [dsfr-data-kpi](references/dsfr-data-kpi.md) | Composant KPI avec agrégation, seuils et tendances | kpi, indicateur, chiffre, valeur, tendance, seuil |
| [dsfr-data-kpi-group](references/dsfr-data-kpi-group.md) | Conteneur grille responsive pour grouper plusieurs KPIs | grouper, grille, kpi-group, plusieurs kpi, groupe, dashboard kpi |
| [dsfr-data-list](references/dsfr-data-list.md) | Tableau de données avec recherche, filtres, tri, pagination et export CSV/HTML | tableau, table, liste, colonnes, pagination, exporter |
| [dsfr-data-display](references/dsfr-data-display.md) | Affichage dynamique de données via template HTML (cartes, tuiles, listes) | cartes, carte, tuiles, tuile, cards, tiles |
| [dsfr-data-podium](references/dsfr-data-podium.md) | Classement visuel (top N) avec rang, barres proportionnelles et couleurs | podium, classement, ranking, top, palmares, top 5 |
| [dsfr-data-map](references/dsfr-data-map.md) | Carte interactive Leaflet multi-couches avec POI, geoshape, cercles, clustering et chargement par viewport | carte, map, leaflet, poi, marker, geoshape |
| [dsfr-data-a11y](references/dsfr-data-a11y.md) | Composant accessibilité unifie : tableau de données, téléchargement CSV et description textuelle | raw-data, télécharger, download, csv, accessibilité, a11y |
| [dsfr-data-beacon](references/dsfr-data-beacon.md) | Cible telemetrie declarative (opt-in visible et retirable dans le HTML) | beacon, telemetrie, télémétrie, tracking, statistiques usage, collecte |

### APIs et requêtes

| Référence | Quand la lire | Déclencheurs |
|---|---|---|
| [Providers API](references/api-providers.md) | Fournisseurs de données supportes et leurs capacites | provider, fournisseur, opendatasoft, tabular, data.gouv, grist |
| [ODSQL (OpenDataSoft Query Language)](references/odsql.md) | Syntaxe de requêtes pour les APIs OpenDataSoft | odsql, opendatasoft |
| [Versions API OpenDataSoft](references/ods-api-versions.md) | Differences entre v1, v2 et v2.1 | version, v1, v2, v2.1, migration |

### Guides transverses

| Référence | Quand la lire | Déclencheurs |
|---|---|---|
| [Patterns de composition](references/composition-patterns.md) | Assembler source, query et visualisations en dashboards | dashboard, tableau de bord, assembler, combiner, pipeline, plusieurs |
| [Types de graphiques](references/chart-types.md) | Quand utiliser quel type de graphique | quel graphique, quel type, quel chart, recommand |
| [Couleurs DSFR](references/dsfr-colors.md) | Palette officielle du Design System de l'État | couleur, color, palette, style |
| [Composants DSFR Chart natifs](references/dsfr-chart-native.md) | Attributs detailles des composants line-chart, bar-chart, pie-chart, etc. | dsfr, natif, officiel, accessibilité, rgaa, bar-chart |
| [Troubleshooting](references/troubleshooting.md) | Pieges courants et erreurs frequentes | erreur, bug, marche pas, probleme, vide, affiche pas |

### Assistant IA (actions JSON du builder-IA)

| Référence | Quand la lire | Déclencheurs |
|---|---|---|
| [Action createChart](references/create-chart-action.md) | Specification de l'action JSON pour créer un graphique dans le builder-IA | createchart, créer un graphique, aperçu, preview |
| [Action reloadData](references/reload-data-action.md) | Recharger les données de la source avec des parametres ODSQL | recharger, reloaddata, nouveaux parametres, refiltrer |

## Règles transverses

- Ne pas inventer d'attribut : s'en tenir à la table « Attributs » de la référence du composant.
- Un composant qui consomme des données porte toujours `source="<id amont>"`.
- Mode dynamique (données rechargées depuis l'API) ou embarqué (données inline) : ne pas mélanger
  les deux sur une même source.
- Accessibilité : coupler un graphique à `<dsfr-data-a11y>` (tableau + export) quand la page est
  publique.
