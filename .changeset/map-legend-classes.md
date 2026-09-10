---
"dsfr-data": minor
---

Nouveau compagnon `<dsfr-data-map-legend for="id-couche" label="…">` : légende DSFR rendue sous la carte (pastilles décoratives + texte) pour une couche catégorielle (`color-map` + repli `color`) ou une choroplèthe, dont les classes deviennent paramétrables sur `dsfr-data-map-layer` avec `classes="5"`, `method="quantile|equal|manual"` et `breaks="10,50,100"` (défaut inchangé : quantiles, autant de classes que de couleurs). La couche expose `getLegendEntries()` et émet `dsfr-data-map-layer-render` à chaque rendu (#685).
