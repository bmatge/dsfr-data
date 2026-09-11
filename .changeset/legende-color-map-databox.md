---
'dsfr-data': patch
---

fix(chart) : avec `databox`, la légende suit enfin `color-map`

Avec `databox`, `color-map` recolorait le graphique mais pas sa légende : les pastilles gardaient
la palette par défaut et contredisaient les barres ou les parts, sans le moindre message (un
camembert annonçait « Féminin » en bleu ciel pour une part saumon). La cause : DSFR Chart rend
alors canvas et légende dans `data-box`, et les pastilles étaient cherchées dans un élément de
graphique resté vide. Elles sont désormais cherchées dans le composant entier. Le cas sans
`databox` ne change pas.

Quand le nombre de pastilles ne correspond pas au nombre de couleurs, un avertissement le dit, au
lieu d'une sortie silencieuse : une légende qui ne suit pas `color-map` ment sur les couleurs.

Résout le constat BUG-016 du banc d'essai (#813).
