---
"dsfr-data": minor
---

Ratio de deux agrégats sur `dsfr-data-kpi` : `value="count:statut:ouvert / count" format="pourcentage"` affiche la part correcte, chaque côté étant une expression de la grammaire actuelle (`count`, `montant:sum`, `champ:distinct`, `meta:total`…). Division par zéro rendue « — », jamais Infinity. `count:champ:valeur` accepte un champ tableau (un élément égal suffit). `count-if` est refusé sur `dsfr-data-query` (filtrer avec `where`, puis compter) (#673).
