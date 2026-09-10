---
"dsfr-data": minor
---

Le paquet npm livre deux fonds administratifs GeoJSON simplifiés hors bundle, `dsfr-data/geo/regions.json` (18 régions) et `dsfr-data/geo/departements.json` (101 départements) — Contours administratifs Etalab, Licence Ouverte 2.0 — résolus par `import.meta.resolve('dsfr-data/geo/regions.json')` ou servis par un CDN, avec la recette `<dsfr-data-source url="…/geo/regions.json" transform="features">` + couche `geoshape no-interactive` (#688).
