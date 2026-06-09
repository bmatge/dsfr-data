---
'dsfr-data': patch
---

Contrat unique pour les métadonnées de pagination (#270) : la pagination serveur de `dsfr-data-list`/`dsfr-data-display` s'active désormais sur le flag explicite `serverSide` de la meta (et plus jamais sur `total > 0`) — un fetchAll ne déclenche plus de pagination serveur avec `Infinity` pages. `totalCount` inconnu vaut `undefined` (jamais `-1`) : la pagination serveur Grist Records fonctionne enfin en cas nominal, avec « page suivante » proposée tant que la page est pleine et total exact à la dernière page. `needsClientProcessing` harmonisé sur tous les adapters (true ssi des transformations demandées n'ont pas été appliquées) : le fallback Grist « SQL indisponible » signale correctement les group-by/aggregate en attente, INSEE `fetchPage` est aligné sur les autres adapters.
