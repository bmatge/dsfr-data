---
'dsfr-data': patch
---

Palettes uniques via `@dsfr-data/shared` (#302) : `CHOROPLETH_SCALES` (les échelles 9 pas historiques de core, blue-france 975 → main-525), `quantileBreaks()` et `getColorForValue()` deviennent la source unique consommée par podium, map-layer et world-map — les trois copies locales sont supprimées. La `categorical` du podium était **différente** de `PALETTE_COLORS` (même attribut `selected-palette` que chart, couleurs différentes : un dashboard mêlant chart et podium n'était pas cohérent) ; map-layer et world-map bucketaient en sens **opposés** (`value <= break` vs `v >= break`) — une même valeur posée sur un break était colorée différemment selon la carte. Convention unique : bornes supérieures inclusives. map-layer gagne au passage la palette `categorical` qui lui manquait.
