---
'dsfr-data': patch
---

Constats : deux nouvelles règles génériques de gravité `info`, qui ne comptent pas dans les alertes du rail (#1066). `pipeline/delegation-client` signale une étape qui demande `group-by` ou `aggregate` alors que le serveur n'a fait ni l'un ni l'autre. Un query qui ne fait que filtrer ne la déclenche pas. `pipeline/emissions-repetees` signale une étape qui émet au-delà du seuil du diagnostic texte, et sa preuve ne cite que le compte de la trace. Le volet Diagnostic ne calcule plus ces deux notes lui-même : ses cartes d'étape ne rendent plus que des constats.
