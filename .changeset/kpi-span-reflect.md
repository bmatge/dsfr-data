---
"dsfr-data": patch
---

Corrige une régression de la 0.29.0 : dans un `dsfr-data-kpi-group`, tous les KPI
retombaient en `grid-column: auto` au-dessus de 768 px, soit une colonne sur douze
chacun (douze par ligne, ~70 px de large). `per-row` comme `cols` (historique)
étaient touchés ; le rendu mobile, lui, restait correct.

La propriété `span` de `dsfr-data-kpi` (#790) était reflétée avec une valeur
initiale vide : chaque KPI portait donc `span=""`, ce qui désactivait la règle de
largeur par défaut du groupe (`::slotted(*:not([col]):not([span]))`). Elle n'a plus
de valeur par défaut, comme `col`. (#822)
