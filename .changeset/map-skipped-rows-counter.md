---
"dsfr-data": patch
---

Cartes : les lignes sans position exploitable ne disparaissent plus en silence. `dsfr-data-map-layer` (marqueurs, cercles, heatmap — comme le geoshape depuis #482) et les cartes `map*` de `dsfr-data-chart` comptent les lignes écartées, émettent un seul `console.warn` par cycle et exposent `getSkippedCount()` ; le volet Diagnostic affiche « N lignes ignorées (code géographique absent ou invalide) ». Au passage, une latitude/longitude nulle ou vide est ignorée au lieu d'être dessinée en (0, 0) (#648).
