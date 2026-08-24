---
'dsfr-data': minor
---

Retrait de `dsfr-data-world-map` (déprécié depuis la v0.13, epic #402) : utiliser `<dsfr-data-chart type="map-monde">` (API cartes unifiée DSFR Chart 2.1). L'export `dsfr-data/world-map` et les bundles `dsfr-data.world-map.{esm,umd}.js` disparaissent, ainsi que les dépendances d3-geo / topojson-client / world-atlas et l'asset `dist/data/world-countries-110m.json`. La conversion ISO a3/num → a2 (`toIsoA2`) et les échelles `CHOROPLETH_SCALES` sont conservées. Changement cassant assumé en phase 0.x (pré-1.0), publié en minor.
