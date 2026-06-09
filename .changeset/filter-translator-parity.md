---
'dsfr-data': patch
---

`filter-translator` aligné sur la couche WHERE partagée (#315) : `filterToOdsql` échappe les guillemets et antislashes (le code généré par les builders était invalide/injectable avec une valeur à guillemet), n'encadre plus de guillemets les littéraux numériques des comparaisons `gt/gte/lt/lte` (ODS comparait des strings), supporte `isnull`/`isnotnull` (rejetés par le garde de segments) et décode les valeurs percent-encodées. `applyLocalFilter` supporte `in`/`notin` (le même filtre retournait toutes les lignes en local, silencieusement) avec la sémantique lâche d'`eq`, et avertit en console sur un opérateur inconnu. Helpers `escapeColonValue`/`unescapeColonValue` mutualisés dans `@dsfr-data/shared` (ré-exportés par la lib).
