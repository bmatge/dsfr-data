---
"dsfr-data": minor
---

`dsfr-data-join` publie le taux d'appariement dans sa meta (`join: { leftMatched, leftTotal, rightMatched, rightTotal }`, aussi via `getJoinStats()`) ; le volet Diagnostic et `formatTrace()` rendent « 237 / 1 065 lignes gauche appariées (22 %) » avec alerte sous 50 %. `performJoinWithStats` est exporté de `@dsfr-data/shared` ; les clés sont comparées en chaîne, sans trim (`201` = `"201"`, `"0201"` ≠ `"201"`), documenté dans le guide (#660).
