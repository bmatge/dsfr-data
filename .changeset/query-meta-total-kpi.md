---
"dsfr-data": minor
---

`dsfr-data-query` publie dans sa meta `total` = nombre de lignes avant `limit` (et `truncated` quand `limit` a tranché) ; `dsfr-data-kpi value="count"` avertit en console quand l'amont détient plus de lignes que celles reçues, et `value="meta:total"` affiche le total de la meta (total serveur en `server-side`, lignes avant `limit` derrière un query) (#659).
