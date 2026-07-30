---
'dsfr-data': minor
---

dsfr-data-map : nouveaux fonds de carte et correction d'ign-topo (#429)

- Nouveaux presets `tiles` sans clé API : `carto-positron` et `carto-dark` (CARTO, fonds sobres idéaux pour la dataviz), `opentopomap` (carte topographique communautaire) et `osm-standard` (tuiles OpenStreetMap.org), chacun avec l'attribution requise.
- `ign-topo` est déprécié : la couche Géoplateforme `GEOGRAPHICALGRIDSYSTEMS.MAPS.BDUNI.J1` rendait un fond quasi vide et les couches topographiques SCAN exigent une clé API. Le preset redirige désormais vers `ign-plan` avec un `console.warn` explicite — les pages existantes ne cassent pas.
- La frontière `sovereign-only` reste inchangée (presets IGN uniquement, fallback `ign-plan`) ; les nouveaux presets y sont refusés avec avertissement.
