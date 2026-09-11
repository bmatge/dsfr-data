---
'dsfr-data': patch
---

feat(core) : l'avertissement de séparateur couvre `sort`, `rename` et `fold`

La 0.26.0 signalait une virgule posée à la place de la barre verticale sur `display` et `labels`
des facettes. Trois autres attributs multi-entrées restaient muets : un attribut écrit avec le
mauvais séparateur est lu comme une seule entrée, et la page n'applique que la première règle.

- `sort` de `dsfr-data-facets`, qui prend la barre verticale ;
- `rename` (barre) et `fold` (virgule) de `dsfr-data-normalize` : deux séparateurs opposés sur la
  même balise, le piège exact décrit par le banc.

L'avertissement nomme l'attribut, le séparateur attendu et la forme attendue, une fois par instance
et par valeur reçue. Une virgule à l'intérieur d'un nouveau nom de `rename` (« Département, région »)
ne déclenche rien. `cols` attend l'échelle responsive (#789), qui en change la grammaire.

Résout le constat PG-022 du banc d'essai (#772).
