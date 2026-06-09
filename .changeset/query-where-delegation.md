---
'dsfr-data': patch
---

`dsfr-data-query` transmet désormais son `where`/`filter` à la source lors de la délégation server-side du group-by (#275) : la clause colon est traduite au dialecte de l'adapter (ODSQL pour OpenDataSoft, pass-through colon sinon) et envoyée comme overlay `query-<id>`. Le filtre n'est plus jamais ré-appliqué client-side sur les lignes agrégées (où les champs bruts n'existent plus — toutes les lignes étaient éliminées). Un where intraduisible (syntaxe non-colon, opérateur inconnu) bloque toute la délégation : filtre et group-by restent alors client-side, dans cet ordre. `where` + `group-by` + `aggregate` donne maintenant le même résultat quel que soit le chemin (délégué ou client). Côté `dsfr-data-source`, les commandes `where` identiques sont dédoublonnées (pas de refetch superflu aux re-négociations).
