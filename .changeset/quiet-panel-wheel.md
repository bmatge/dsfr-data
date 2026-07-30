---
'dsfr-data': patch
---

`dsfr-data-map-popup` : la molette sur le volet latéral scrolle le volet au lieu de zoomer la carte (isolation des événements wheel/dblclick/mousedown/touch du panel, ancré dans le conteneur Leaflet depuis la 0.14.0). La sélection de texte dans le volet ne déclenche plus un déplacement de la carte.
