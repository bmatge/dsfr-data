---
'dsfr-data': minor
---

Bloc carte Leaflet multi-couches dans le modèle de document partagé (#531) : widget `map` (`MapLayerSpec` marker/circle/heatmap/geoshape, multi-sources), export déterministe en `<dsfr-data-map>` + `<dsfr-data-map-layer>` (fit-bounds, encarts DROM, popup/tooltip, bascule automatique sur le bundle complet), et action `add_blocks`/`update_block` correspondante dans le Studio IA avec validation observe→corrige des couches (champs de coordonnées vérifiés contre les données). Le LLM n'écrit toujours jamais de HTML.
