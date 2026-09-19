---
'dsfr-data': minor
---

`dsfr-data-facets` : une valeur par défaut par champ (`default`)

Sans sélection, une facette n'émet aucun filtre. C'est le bon comportement
quand l'absence de filtre veut dire « tout ». Ça ne l'est plus quand l'agrégat
national est une LIGNE du jeu : sur un jeu qui publie `region = "Toutes
régions"` à côté d'une ligne par région, l'absence de filtre cumule la France
entière ET chaque région — un total qui ne veut rien dire, affiché sans
avertissement. La facette n'avait aucun moyen de dire « ce filtre porte
toujours une valeur ». `dsfr-data-context-filter` a `default`, mais il pilote
un élément d'UI par son `id`, que la facette ne fournit pas.

Voie native nouvelle : `default="region:Toutes régions | secteur:Tous secteurs"`,
à la grammaire des autres attributs par champ. La valeur est posée au montage,
APRÈS la lecture de l'URL (`url-params`, ou l'URL du contexte en mode
`context`), qui l'emporte, et elle est émise comme une sélection normale —
tags, URL et cascade suivent. Un champ ainsi nommé ne redevient jamais vide :
la remise à zéro (bouton, tag retiré, dernière case décochée) revient au
défaut, et les options « Tous » de `select` et `radio-inline` ne sont plus
rendues pour ce champ, faute de pouvoir mener ailleurs qu'au défaut.

Strictement additif : sans `default`, rien ne change.
