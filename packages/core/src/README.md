# src/

Code source de la bibliothèque de Web Components dsfr-data (Lit).

## Structure

```
src/
  index.ts              # Point d'entrée tout-en-un (tous les composants + exports utilitaires)
  index-core.ts         # Entrée du bundle core (tout sauf cartes)
  index-map.ts          # Entrée du bundle map (famille carto Leaflet)
  components/           # Les 23 Web Components
  adapters/             # Adaptateurs de sources de données (api-type)
  utils/                # Utilitaires de traitement de données
```

## Composants (`components/`)

| Composant | Rôle |
|-----------|------|
| `dsfr-data-source` | Connecteur de données (URL brute, adapter `api-type`, données inline) |
| `dsfr-data-query` | Filtrage, regroupement, agrégation, tri (transformateur pur) |
| `dsfr-data-join` | Jointure de deux sources sur clé(s) pivot |
| `dsfr-data-unpivot` | Bascule wide → long/tidy (melt) |
| `dsfr-data-pivot` | Repli long → wide (tableau croisé, symétrique d'unpivot) |
| `dsfr-data-normalize` | Nettoyage (conversion, renommage, trim, flatten, `compute`) |
| `dsfr-data-context` | Orchestrateur de filtres transverses multi-sources |
| `dsfr-data-context-filter` | Un filtre du contexte (lié à un contrôle d'UI natif) |
| `dsfr-data-context-tags` | Tags DSFR supprimables des filtres actifs |
| `dsfr-data-context-value` | Valeur courante d'un filtre, dans un titre ou une phrase |
| `dsfr-data-facets` | Filtres à facettes interactifs |
| `dsfr-data-search` | Recherche plein texte |
| `dsfr-data-chart` | Graphique DSFR Chart (bar, line, pie, radar, gauge, scatter, bar-line, map, map-reg, map-aca, map-monde) |
| `dsfr-data-kpi` | Indicateur chiffré clé (KPI) |
| `dsfr-data-kpi-group` | Grille responsive de KPIs (seul composant en Shadow DOM avec slot) |
| `dsfr-data-list` | Tableau avec tri, filtres, pagination et export |
| `dsfr-data-display` | Template HTML répétitif (`{{champ}}`) |
| `dsfr-data-podium` | Classement top N à barres proportionnelles |
| `dsfr-data-a11y` | Compagnon d'accessibilité (tableau, CSV, description) |
| `dsfr-data-beacon` | Cible de télémétrie déclarative |
| `dsfr-data-map` | Conteneur carte interactive Leaflet |
| `dsfr-data-map-layer` | Couche de données (marker, geoshape, circle, heatmap) |
| `dsfr-data-map-popup` | Compagnon d'affichage au clic (popup, modale, panneau) |
| `dsfr-data-map-inset` | Encart territorial (DROM, Corse, zoom local) |
| `dsfr-data-map-legend` | Légende d'une couche (classes de `fill-field`, paires de `color-map`) |
| `dsfr-data-map-timeline` | Contrôles de lecture temporelle |

## Adaptateurs (`adapters/`)

| Adaptateur | Source |
|------------|--------|
| `generic-adapter` | API REST générique |
| `opendatasoft-adapter` | OpenDataSoft (ODSQL, facettes, géo serveur) |
| `tabular-adapter` | Tabular API (data.gouv.fr) |
| `grist-adapter` | Grist (mode Records + fallback SQL) |
| `insee-adapter` | INSEE Melodi |
| `adapter-registry` | Registre `getAdapter()` / `registerAdapter()` (types custom) |
| `api-adapter` | Interfaces `ApiAdapter`, `AdapterCapabilities`, `AdapterParams` |

## Utilitaires (`utils/`)

| Fichier | Rôle |
|---------|------|
| `aggregates.ts` | Parse des agrégats de query/adapters (`field:fn[:alias]`, alias `field__fn`) |
| `aggregations.ts` | Expressions KPI (`champ:fn`, `count`, littéraux) |
| `beacon.ts` | Télémétrie fire-and-forget (pixel) |
| `cache-provider.ts` | Hook de cache externe (`window.DSFR_DATA_CACHE_PROVIDER`) |
| `chart-radial-scale.ts` | Bornes dures des axes radar |
| `chart-reference-lines.ts` | Overlay SVG de repères (`reference-lines`) |
| `chart-targets.ts` | Cibles/objectifs (`targets`) |
| `config-error.ts` | `reportConfigError` (erreurs de configuration) |
| `data-bridge.ts` | Bus d'événements entre composants (`DATA_EVENTS`) |
| `formatters.ts` | Formatage (nombres, pourcentages, euros, compact, dates) |
| `geo-value.ts` | Parse mémoïsé des géométries en chaine JSON (`geo-field`) |
| `json-path.ts` | Acces par chemin (`getByPath`, clés unsafe bloquées) |
| `kpi-lines.ts` | Lignes secondaires de KPI (`KpiLineSpec`) |
| `pagination-controller.ts` | Pagination partagée list/display |
| `source-element.ts` | Interface commune des éléments source |
| `source-subscriber.ts` | Mixin d'abonnement pour les composants d'affichage |
| `status-templates.ts` | Templates partagés loading/erreur |
| `template-expression.ts` | Placeholders `{{champ}}` partagés display/map-popup |
| `territories.ts` | Presets d'encarts territoriaux (`TERRITORY_PRESETS`, `TERRITORY_GROUPS`) |
| `transformer-mixin.ts` | Mixin de cycle de vie des 6 transformateurs |
| `where.ts` | Dialectes WHERE (odsql, colon), échappement, tri |

## Build

```bash
npm run build    # Génère dist/dsfr-data.{esm,umd}.js (tout-en-un)
                 #   + dist/dsfr-data.{core,map}.{esm,umd}.js
```
