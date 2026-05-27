# src/

Code source de la bibliotheque de Web Components dsfr-data (Lit).

## Structure

```
src/
  index.ts              # Point d'entree, exporte tous les composants
  components/           # Les 9 Web Components
  adapters/             # Adaptateurs de sources de données
  utils/                # Utilitaires de traitement de données
```

## Composants (`components/`)

| Composant | Role |
|-----------|------|
| `dsfr-data-source` | Chargement de données depuis une API REST |
| `dsfr-data-normalize` | Nettoyage des données (conversion, renommage de colonnes) |
| `dsfr-data-query` | Filtrage, regroupement et agrégation |
| `dsfr-data-facets` | Interface de filtres interactifs |
| `dsfr-data-search` | Recherche plein texte |
| `dsfr-data-list` | Tableau avec pagination et export |
| `dsfr-data-chart` | Graphique DSFR (bar, line, pie, radar, map, gauge, scatter) |
| `dsfr-data-kpi` | Indicateur chiffre clé (KPI) |
| `dsfr-data-display` | Template HTML libre |

## Adaptateurs (`adapters/`)

| Adaptateur | Source |
|------------|--------|
| `generic-adapter` | API REST generique |
| `opendatasoft-adapter` | OpenDataSoft |
| `tabular-adapter` | Tabular API (data.gouv.fr) |
| `grist-adapter` | Grist |
| `api-adapter` | Factory de selection automatique |

## Utilitaires (`utils/`)

| Fichier | Role |
|---------|------|
| `aggregations.ts` | Fonctions d'agrégation (sum, avg, min, max, count...) |
| `data-bridge.ts` | Bus d'événements entre composants |
| `chart-data.ts` | Transformation des données pour les graphiques |
| `json-path.ts` | Implementation de selecteur JSONPath |
| `formatters.ts` | Formatage (nombres, dates, devises) |
| `beacon.ts` | Tracking analytics (pixel fire-and-forget) |
| `source-subscriber.ts` | Mixin pour s'abonner aux changements de données |

## Build

```bash
npm run build    # Généré dist/dsfr-data.{core,world-map,full}.{esm,umd}.js
```
