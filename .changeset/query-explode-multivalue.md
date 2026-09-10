---
"dsfr-data": minor
---

`dsfr-data-query` accepte `explode="champ"` : un champ multivalué (tableau) est éclaté avant le regroupement, une ligne portant N valeurs compte dans N groupes. Les modalités d'un `group-by` deviennent alors exactement celles de la facette du même champ, là où la cellule était jusqu'ici comptée par combinaison (« audit,formation » comme une modalité). Sans l'attribut, le comportement est inchangé (#736).
