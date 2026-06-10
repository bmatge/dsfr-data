---
'dsfr-data': patch
---

Parsing numérique unifié sur `toNumber` (#301) : une valeur `"1 234,5"` (fréquente sur les CSV data.gouv via Tabular) devenait silencieusement 0 dans chart/podium (`Number()`), 1 dans display/formatters (`parseFloat`) et n'était correcte qu'après un `normalize numeric-auto` intercalé — chart, podium, query, aggregations et les formatters parsent désormais les décimales françaises nativement. `toNumber` lui-même est corrigé sur les séparateurs multiples (`'1,234,567'` → 1 234 567, `'1.234.567'` → 1 234 567 ; `replace(',', '.')` ne remplaçait que la première virgule). Politique NaN unique : les non-numériques sont **exclus des agrégats** (jamais convertis en 0 — `avg` ne divise plus par les lignes N/A), `min`/`max` sans valeur numérique retournent null au lieu d'Infinity, et `normalize numeric` adopte la sémantique stricte de `numeric-auto` (`"N/A"` → null, fini les sommes faussées).
