---
'dsfr-data': patch
---

`reload()` de `dsfr-data-query` adopte la sémantique de pur transformateur (#279) : il délègue le refetch à la source amont (même contrat que `dsfr-data-source.reload()`, une chaîne query→query→source propage jusqu'à la source) au lieu de relire le cache — l'émission qui suit redescend naturellement le pipeline. Repli sur le retraitement du cache si l'amont n'expose pas `reload()` (normalize/unpivot/join, en attendant le mixin #262). L'attribut `refresh` est retiré de query (le rafraîchissement périodique appartient à la source, qui refetche pendant que le pipeline suit) avec un `console.warn` de migration.
