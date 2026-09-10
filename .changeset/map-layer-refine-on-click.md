---
"dsfr-data": minor
---

La carte comme filtre du contexte (#681, ADR-104) : `dsfr-data-map-layer` émet `dsfr-data-map-select` `{ record, layerId, selected }` au clic sur un marqueur, un cercle ou une forme ; avec `refine-on-click="champ"` et `context="id"`, la couche s'enregistre comme filtre `eq` du `dsfr-data-context` (les autres vues se filtrent, tag dans `context-tags`, URL portée par le contexte, second clic = retrait). Sans `context`, la clause part directement à `source` (whereKey `map-select-<id>`). Nouvel attribut `label` (libellé du tag).
