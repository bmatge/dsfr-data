---
'dsfr-data': patch
---

Alias d'agrégat unifié sur tout le pipeline (#269) : `aggregate="population:sum"` produit désormais la colonne `population__sum` partout — client-side (`dsfr-data-query`), ODS, Tabular et Grist (SQL comme fallback Records). L'adapter Grist générait `sum_population`, ce qui cassait silencieusement le `value-field` d'un chart au changement de provider ou à la bascule SQL ↔ Records. Les 3 implémentations de `parseAggregates` sont factorisées (`packages/core/src/utils/aggregates.ts`), les segments malformés (`a:sum,`) sont ignorés au lieu de produire un agrégat invalide. Migration : si vous dépendiez de l'alias Grist `sum_population`, utilisez l'alias explicite `aggregate="population:sum:sum_population"`.
