---
'dsfr-data': minor
---

Une absence n'est pas un zéro (#1198, règle #301 étendue) — **changement de comportement** :

- `dsfr-data-query` : un groupe sans AUCUNE valeur numérique rend `null` pour `sum`, `avg`, `min` et `max` (au lieu de 0). `count` reste le nombre de lignes. Le 0 d'avant entrait dans les classements, les moyennes et les totaux. Résout le constat BUG-028 du banc d'essai.
- `dsfr-data-chart` : une cellule sans observation vaut `null`, au format long (`series-field`, plus de remplissage à 0) comme au format large (lecture stricte des valeurs). La courbe s'interrompt et la barre est absente, au lieu d'une chute à zéro qui n'a pas eu lieu. Résout le constat BUG-029 du banc d'essai (et AM-089, réuni).

Pour retrouver l'ancien rendu, remplacer explicitement l'absence (`dsfr-data-normalize`, `compute` avec `coalesce(x, 0)`).
