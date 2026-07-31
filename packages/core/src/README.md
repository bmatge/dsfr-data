# src/

Code source de la bibliotheque de Web Components dsfr-data (Lit).

## Structure

```
src/
  index.ts              # Point d'entree tout-en-un (tous les composants + exports utilitaires)
  index-core.ts         # Entree du bundle core (tout sauf cartes)
  index-map.ts          # Entree du bundle map (famille carto Leaflet)
  index-world-map.ts    # Entree du bundle world-map (deprecie)
  components/           # Les 24 Web Components
  adapters/             # Adaptateurs de sources de donnees (api-type)
  utils/                # Utilitaires de traitement de donnees
```

## Composants (`components/`)

| Composant | Role |
|-----------|------|
| `dsfr-data-source` | Connecteur de donnees (URL brute, adapter `api-type`, donnees inline) |
| `dsfr-data-query` | Filtrage, regroupement, agregation, tri (transformateur pur) |
| `dsfr-data-join` | Jointure de deux sources sur cle(s) pivot |
| `dsfr-data-unpivot` | Bascule wide → long/tidy (melt) |
| `dsfr-data-normalize` | Nettoyage (conversion, renommage, trim, flatten, `compute`) |
| `dsfr-data-context` | Orchestrateur de filtres transverses multi-sources |
| `dsfr-data-context-filter` | Un filtre du contexte (lie a un controle d'UI natif) |
| `dsfr-data-context-tags` | Tags DSFR supprimables des filtres actifs |
| `dsfr-data-facets` | Filtres a facettes interactifs |
| `dsfr-data-search` | Recherche plein texte |
| `dsfr-data-chart` | Graphique DSFR Chart (bar, line, pie, radar, gauge, scatter, bar-line, map, map-reg, map-aca, map-monde) |
| `dsfr-data-kpi` | Indicateur chiffre cle (KPI) |
| `dsfr-data-kpi-group` | Grille responsive de KPIs (seul composant en Shadow DOM avec slot) |
| `dsfr-data-list` | Tableau avec tri, filtres, pagination et export |
| `dsfr-data-display` | Template HTML repetitif (`{{champ}}`) |
| `dsfr-data-podium` | Classement top N a barres proportionnelles |
| `dsfr-data-a11y` | Compagnon d'accessibilite (tableau, CSV, description) |
| `dsfr-data-beacon` | Cible de telemetrie declarative |
| `dsfr-data-map` | Conteneur carte interactive Leaflet |
| `dsfr-data-map-layer` | Couche de donnees (marker, geoshape, circle, heatmap) |
| `dsfr-data-map-popup` | Compagnon d'affichage au clic (popup, modale, panneau) |
| `dsfr-data-map-inset` | Encart territorial (DROM, Corse, zoom local) |
| `dsfr-data-map-timeline` | Controles de lecture temporelle |
| `dsfr-data-world-map` | Carte du monde choroplethe SVG — **deprecie** (→ `dsfr-data-chart type="map-monde"`) |

## Adaptateurs (`adapters/`)

| Adaptateur | Source |
|------------|--------|
| `generic-adapter` | API REST generique |
| `opendatasoft-adapter` | OpenDataSoft (ODSQL, facettes, geo serveur) |
| `tabular-adapter` | Tabular API (data.gouv.fr) |
| `grist-adapter` | Grist (mode Records + fallback SQL) |
| `insee-adapter` | INSEE Melodi |
| `adapter-registry` | Registre `getAdapter()` / `registerAdapter()` (types custom) |
| `api-adapter` | Interfaces `ApiAdapter`, `AdapterCapabilities`, `AdapterParams` |

## Utilitaires (`utils/`)

| Fichier | Role |
|---------|------|
| `aggregates.ts` | Parse des agregats de query/adapters (`field:fn[:alias]`, alias `field__fn`) |
| `aggregations.ts` | Expressions KPI (`champ:fn`, `count`, litteraux) |
| `beacon.ts` | Telemetrie fire-and-forget (pixel) |
| `cache-provider.ts` | Hook de cache externe (`window.DSFR_DATA_CACHE_PROVIDER`) |
| `chart-radial-scale.ts` | Bornes dures des axes radar |
| `chart-reference-lines.ts` | Overlay SVG de reperes (`reference-lines`) |
| `chart-targets.ts` | Cibles/objectifs (`targets`) |
| `config-error.ts` | `reportConfigError` (erreurs de configuration) |
| `data-bridge.ts` | Bus d'evenements entre composants (`DATA_EVENTS`) |
| `formatters.ts` | Formatage (nombres, pourcentages, euros, compact, dates) |
| `geo-value.ts` | Parse memoise des geometries en chaine JSON (`geo-field`) |
| `json-path.ts` | Acces par chemin (`getByPath`, cles unsafe bloquees) |
| `kpi-lines.ts` | Lignes secondaires de KPI (`KpiLineSpec`) |
| `pagination-controller.ts` | Pagination partagee list/display |
| `source-element.ts` | Interface commune des elements source |
| `source-subscriber.ts` | Mixin d'abonnement pour les composants d'affichage |
| `status-templates.ts` | Templates partages loading/erreur |
| `template-expression.ts` | Placeholders `{{champ}}` partages display/map-popup |
| `territories.ts` | Presets d'encarts territoriaux (`TERRITORY_PRESETS`, `TERRITORY_GROUPS`) |
| `transformer-mixin.ts` | Mixin de cycle de vie des 6 transformateurs |
| `where.ts` | Dialectes WHERE (odsql, colon), echappement, tri |

## Build

```bash
npm run build    # Genere dist/dsfr-data.{esm,umd}.js (tout-en-un)
                 #   + dist/dsfr-data.{core,map,world-map}.{esm,umd}.js
```
