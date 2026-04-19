---
'dsfr-data': minor
---

**dsfr-data-map** : renforcement de l'argumentaire de souveraineté numérique.

- Nouvel attribut booléen `sovereign-only` qui restreint `tiles` aux seuls presets IGN (`ign-plan`, `ign-ortho`, `ign-topo`, `ign-cadastre`). Tout autre preset ou URL custom est refusé avec un avertissement console et remplacé par `ign-plan`.
- Renommage du preset `osm` en `osm-fr` pour expliciter qu'il s'agit des serveurs de l'association OpenStreetMap France (loi 1901, hébergée en France), distincte de l'OpenStreetMap Foundation. L'alias `osm` reste accepté.
- Export d'une fonction pure `resolveTilePreset(requested, sovereignOnly)` pour les tests et outils tiers.

Ferme partiellement [#27](https://github.com/bmatge/dsfr-data/issues/27) (points 2 et 3).
