---
'dsfr-data': patch
---

Cohérence mode URL / mode adapter de `dsfr-data-source` (#288) : les commandes where/orderBy/groupBy/aggregate reçues en mode URL sont **refusées explicitement** (warn unique pointant vers `api-type`) au lieu d'être stockées puis perdues — un refetch partait à URL identique, filtre silencieusement perdu ; les commandes `page` restent servies (pagination querystring), et une commande refusée ré-émet le cache (contrat « une commande produit toujours une émission », #276). Watch-list complétée : changer `page-size`, `server-side`, `headers`, `method` ou `use-proxy` déclenche enfin un refetch (comme `api-key-ref`). Le piège `api-type="generic"` + `base-url` est signalé proprement (`validate()` explique le bon geste au lieu de laisser `fetchAll` jeter une unhandled rejection). `isLoading()` ne ment plus pendant un abort de fetch concurrent (jeton de génération : seul le fetch courant éteint le loading).
