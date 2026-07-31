# dsfr-data

Web Components de dataviz (Lit) pour les sites gouvernementaux français, conformes au [Système de design de l'État (DSFR)](https://www.systeme-de-design.gouv.fr/). Connectez vos sources de données ouvertes (OpenDataSoft, Tabular API data.gouv.fr, Grist, INSEE Melodi, toute API REST), composez votre pipeline en balises `<dsfr-data-*>` déclaratives — sans écrire de JavaScript — et le rendu graphique est délégué à [DSFR Chart](https://github.com/GouvernementFR/dsfr-chart), la bibliothèque officielle de datavisualisation de l'État.

- **Spécifications interactives des composants** : <https://chartsbuilder.miweb.run/specs/>
- **Guide utilisateur et exemples exécutables** : <https://chartsbuilder.miweb.run/guide/>
- **Code source** : <https://github.com/bmatge/dsfr-data>

## Installation

### npm

```bash
npm install dsfr-data
```

```js
import 'dsfr-data';            // tout-en-un
// ou, plus léger :
import 'dsfr-data/core';       // sans les cartes
```

### CDN (sans build)

Prérequis : la page doit charger le DSFR et DSFR Chart. Épingler une version exacte avec SRI est recommandé en production :

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@gouvfr/dsfr@1.14.4/dist/dsfr.min.css"
  integrity="sha384-atVZ+aK6VI0nWyTEhKgze5InDJ+SWRRqa0BCZ2MTNyoOcBiHj1c3dGPdi6ML65B3" crossorigin="anonymous">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@gouvfr/dsfr-chart@2.1.1/dist/DSFRChart/DSFRChart.css">
<script type="module" src="https://cdn.jsdelivr.net/npm/@gouvfr/dsfr-chart@2.1.1/dist/DSFRChart/DSFRChart.js"></script>

<script src="https://cdn.jsdelivr.net/npm/dsfr-data@0.16.0/dist/dsfr-data.umd.js"
  integrity="sha384-+RCFFr7FQXu3msIvQnzT3LpnEX4ivmVtIVVKxCgrVsVkGh24Lc7lvwZU/0zceVph" crossorigin="anonymous"></script>
```

Pour suivre les mises à jour sans re-pinner, la version flottante `dsfr-data@0` fonctionne aussi (sans attribut `integrity` dans ce cas).

## Démarrage rapide

Un graphique en barres agrégé depuis une API OpenDataSoft, en trois balises :

```html
<dsfr-data-source id="src" api-type="opendatasoft"
  base-url="https://data.economie.gouv.fr" dataset-id="industrie-du-futur" limit="100">
</dsfr-data-source>

<dsfr-data-query id="q" source="src"
  group-by="nom_region" aggregate="nombre_beneficiaires:sum:total" order-by="total:desc">
</dsfr-data-query>

<dsfr-data-chart source="q" type="bar"
  label-field="nom_region" value-field="total"
  databox databox-title="Bénéficiaires par région">
</dsfr-data-chart>
```

## Composants

### Données (sources et transformateurs)

| Composant | Rôle |
|---|---|
| `<dsfr-data-source>` | Connecteur de données : fetch (URL brute, adapter `api-type`, données inline), normalisation, diffusion |
| `<dsfr-data-query>` | Transformateur : filtre (`where` colon), group-by, agrégation, tri, limite — délégation serveur automatique |
| `<dsfr-data-join>` | Jointure de deux sources sur clé(s) pivot (inner, left, right, full) |
| `<dsfr-data-unpivot>` | Bascule un tableau « wide » en « long/tidy » (melt) |
| `<dsfr-data-normalize>` | Nettoyage : conversion numérique, renommage, trim, flatten, colonnes calculées `compute` |
| `<dsfr-data-context>` | Orchestrateur de filtres transverses multi-sources |
| `<dsfr-data-context-filter>` | Un filtre du contexte, lié à un contrôle d'UI natif existant |
| `<dsfr-data-context-tags>` | Tags DSFR supprimables récapitulant les filtres actifs |
| `<dsfr-data-facets>` | Filtres à facettes (checkbox, select, radio — client, serveur ou valeurs statiques) |
| `<dsfr-data-search>` | Recherche textuelle (champ DSFR, surlignage, mode serveur) |

### Affichage

| Composant | Rôle |
|---|---|
| `<dsfr-data-chart>` | Graphiques DSFR Chart : bar, line, pie, radar, gauge, scatter, bar-line, cartes `map`/`map-reg`/`map-aca`/`map-monde` |
| `<dsfr-data-kpi>` | Indicateur chiffré (expressions `champ:fn`, littéral `value="=…"`, formats dont `compact`, seuils de couleur) |
| `<dsfr-data-kpi-group>` | Grille responsive de KPIs |
| `<dsfr-data-list>` | Tableau filtrable, triable, paginable, exportable CSV |
| `<dsfr-data-display>` | Rendu par template HTML répétitif (`{{champ}}`) |
| `<dsfr-data-podium>` | Classement top N à barres proportionnelles |
| `<dsfr-data-a11y>` | Compagnon d'accessibilité : tableau de données, export CSV, transcription |
| `<dsfr-data-beacon>` | Cible de télémétrie déclarative (opt-in) |

### Cartographie Leaflet (bundle `map`)

| Composant | Rôle |
|---|---|
| `<dsfr-data-map>` | Conteneur carte interactive (fonds IGN/OSM, encarts, fit-bounds, accessibilité intégrée) |
| `<dsfr-data-map-layer>` | Couche de données : markers, geoshape, circle, heatmap (choroplèthe, clustering, bbox, timeline) |
| `<dsfr-data-map-popup>` | Affichage au clic : popup, modale ou panneau latéral, avec template |
| `<dsfr-data-map-inset>` | Encart territorial (DROM, Corse, zoom local) |
| `<dsfr-data-map-timeline>` | Contrôles de lecture temporelle des couches |

### Déprécié

| Composant | Rôle |
|---|---|
| `<dsfr-data-world-map>` | Carte du monde choroplèthe SVG — **déprécié**, remplacé par `<dsfr-data-chart type="map-monde">` ; retrait prévu au prochain major |

## Bundles

Quatre bundles sont publiés dans `dist/`, chacun en ESM et UMD :

- `dsfr-data.core.{esm,umd}.js` — tous les composants sauf les cartes ;
- `dsfr-data.map.{esm,umd}.js` — la famille carto Leaflet (Leaflet chargé dynamiquement) ;
- `dsfr-data.world-map.{esm,umd}.js` — le composant déprécié `dsfr-data-world-map` ;
- `dsfr-data.{esm,umd}.js` — tout-en-un.

## Documentation

La référence exhaustive de chaque composant (attributs, valeurs, défauts, exemples interactifs) est publiée sur <https://chartsbuilder.miweb.run/specs/>. Le guide utilisateur (parcours pas à pas, exemples live) est sur <https://chartsbuilder.miweb.run/guide/>. Le dépôt GitHub <https://github.com/bmatge/dsfr-data> contient en outre les guides d'architecture, de contribution et de déploiement self-hosted.

## Licence

[Licence MIT](LICENSE) — comme le [DSFR](https://github.com/GouvernementFR/dsfr) et [DSFR Chart](https://github.com/GouvernementFR/dsfr-chart).
