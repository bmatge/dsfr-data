---
'dsfr-data': patch
---

Meta de pagination cohérente dans tout le pipeline (#282) : `dsfr-data-normalize` publiait sa meta APRÈS `dispatchDataLoaded` — `document.dispatchEvent` étant synchrone, l'aval lisait la meta du batch précédent (un `dsfr-data-query` aval d'un normalize sur fallback Grist sautait son traitement client sur des données brutes). La meta est désormais posée avant le dispatch (porté par `emitTransformedData` du mixin #280) — AC pipeline `source(grist fallback) → normalize → query` testé. `dsfr-data-unpivot` et `dsfr-data-join` propagent enfin la meta (`needsClientProcessing`/`serverSide`/`pageSize` suivent, `total` invalidé puisqu'ils changent le nombre de lignes ; join propage la meta de sa source gauche, cohérent avec le relais de commandes #272).
