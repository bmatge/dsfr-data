---
'dsfr-data': patch
---

Beacons de télémétrie complétés sur la famille carte (#293) : `dsfr-data-map-layer` envoie son type de couche (marker, geoshape, circle, heatmap) et `dsfr-data-map-popup` est désormais visible du monitoring. Convention de sous-type documentée dans `beacon.ts` (variante fonctionnelle uniquement) : `dsfr-data-map` n'envoie plus son preset de tuiles, `dsfr-data-map-timeline` omet le sous-type au lieu de passer une chaîne vide.
