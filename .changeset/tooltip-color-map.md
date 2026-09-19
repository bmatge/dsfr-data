---
'dsfr-data': patch
---

`dsfr-data-chart` : les pastilles de l'infobulle suivent `color-map` (#968).

`color-map` recolorait les barres et la légende, mais pas les pastilles de
l'infobulle, restées à la palette `categorical` par défaut. Comme l'infobulle
de DSFR Chart **ne nomme pas les séries**, la couleur est le seul lien entre
une ligne et la série qu'elle décrit : une pastille fausse appariait la
mauvaise valeur à la mauvaise série. Contrairement à #813 / #815 (la légende),
le défaut ne demandait pas `databox` : il se produisait sur un graphique nu.

Cause commune des trois surfaces : DSFR Chart tient une seule source de vérité
pour les couleurs de série, `colorParse`, dont dérivent le canvas, la légende
et l'infobulle. `color-map` n'écrivait que sur les datasets de l'instance
Chart.js — une copie — et la légende avait été rattrapée en peignant son DOM
(#815). La correction reporte désormais les couleurs dans `colorParse`
lui-même, en respectant sa forme (un tableau par point pour `bar` et `pie`, un
scalaire pour `line`, `radar` et `scatter`, `colorBarParse` pour `bar-line`).

Reste vrai : `color-map` s'applique après le rendu, l'infobulle est peinte par
DSFR Chart et son gabarit ne nomme toujours pas les séries ; `color-map` reste
sans effet sur les types carte (`selected-palette`). Si le modèle interne
devenait inatteignable, un avertissement console le dit désormais au lieu
d'une infobulle silencieusement fausse.
