---
"dsfr-data": minor
---

Agrégat `distinct` (alias `count-distinct`) dans la grammaire commune : `value="nom_departement:distinct"` sur `dsfr-data-kpi`, `aggregate="commune:distinct"` sur `dsfr-data-query` (colonne `commune__distinct`). Null et chaîne vide exclus. Délégué à OpenDataSoft (`count(distinct x)`) et Grist SQL (`COUNT(DISTINCT x)`), calculé côté client sur les lignes reçues pour Tabular, avec un avertissement si l'API en détient davantage (#672).
