---
'dsfr-data': patch
---

`dsfr-data-query` : l'`order-by` (et le group-by/where) n'est plus délégué en
tri serveur quand la chaîne entre la query et la source qui fetch contient un
transformateur qui crée ou renomme des colonnes — `dsfr-data-unpivot`
(toujours) ou `dsfr-data-normalize` avec `rename`/`compute`/`flatten`/
`lowercase-keys`. Les opérations de la query s'expriment dans le schéma
POST-transformation : les pousser au serveur envoyait des noms de colonnes
inconnus de l'API (Grist Records : `?sort=annee` → 500 `unknown key`) et
mettait la source partagée en erreur pour tous ses abonnés. Le tri s'exécute
désormais côté client, sur les données transformées (#394). Nouveau hook
optionnel `transformsSchema()` sur le contrat `SourceElement`.
