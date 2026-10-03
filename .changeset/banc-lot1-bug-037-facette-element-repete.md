---
'dsfr-data': patch
---

`dsfr-data-facets` : un élément répété dans une cellule tableau ne compte plus deux fois — résout le constat BUG-037 du banc d'essai (#1227).

Avec `["Patrimoine", "Patrimoine"]` et `["Patrimoine"]`, la facette annonçait « Patrimoine 3 » pour deux lignes, et la sélection en rendait deux. Une ligne compte désormais **une fois par valeur distincte** : le compteur est le nombre de lignes que la sélection rendra. Sous `weight-field`, le poids d'une ligne n'est plus doublé par un élément répété. Les facettes serveur (`server-facets`) ne sont pas concernées : leurs comptes viennent de l'API.

`explode` de `dsfr-data-query` **garde son compte par élément** (une cellule qui répète un élément produit autant de lignes) : c'est un éclatement, pas un compteur de lignes. Son JSDoc et le guide l'écrivent désormais, avec la parade (`aggregate="id:distinct"`).
