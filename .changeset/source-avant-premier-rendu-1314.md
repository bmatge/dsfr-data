---
'dsfr-data': patch
---

Un composant créé par script, inséré, puis dont `source` change avant son premier rendu, suit maintenant la nouvelle source (#1314). Avant, il restait abonné à la source de l'insertion : un KPI, un graphique, une liste ou une carte affichaient les chiffres de l'ancienne source, et une `dsfr-data-query`, une jointure ou un autre transformateur calculaient dessus. Pour les transformateurs, la même correction vaut pour toutes les props de requête ou de calcul (`where`, `aggregate`, `type` d'une jointure…) changées à ce moment-là. `dsfr-data-repeat` applique aussi le changement de `scopes` fait avant son premier rendu. Les pages écrites en HTML ne changent pas, ni un changement de `source` après le premier rendu. Le nombre d'abonnements et de rendus au montage reste le même.
