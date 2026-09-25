---
'dsfr-data': patch
---

La clause de zone visible d'une couche `bbox` est construite par l'adaptateur (#1149, partie neutralité de #1090) : méthode optionnelle `buildBboxWhere({ field } | { lat, lon }, bornes)` sur `ApiAdapter`. Opendatasoft y porte son `in_bbox(...)`, clause identique à celle qu'écrivait `dsfr-data-map-layer` ; Tabular, Grist, INSEE et le générique n'en ont pas et la couche garde son filtre dans le navigateur, comme avant. Un refus (`null`) produit le même repli. `serverGeo` est vrai si et seulement si l'adaptateur fournit la méthode ; un adaptateur tiers qui déclarait `serverGeo: true` sans la fournir reçoit désormais le filtre du navigateur au lieu d'une clause Opendatasoft qu'il ne comprenait pas. Les types `BboxTarget` et `BboxBounds` sont exportés.
