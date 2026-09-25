---
'dsfr-data': patch
---

Les clés réservées de l'attribut `params` sont déclarées par chaque adaptateur (#1137, suite de #726) : `reservedParamKeys` sur `ApiAdapter`, où une entrée `*suffixe` réserve toute clé qui se termine ainsi. Opendatasoft garde ses sept clés (`select`, `where`, `group_by`, `order_by`, `limit`, `offset`, `facet`) ; Tabular déclare `page`, `page_size`, `columns`, `or` et ses suffixes de colonne (`champ__sort`, `champ__exact`…). `params='{"page_size":1}'` sur une source Tabular est donc refusé avec une erreur de configuration. Changement visible : une clé Opendatasoft (`where`…) n'est plus réservée sur les autres adaptateurs, qui ne transmettent d'ailleurs pas `params`, et un adaptateur tiers sans déclaration ne réserve rien.
