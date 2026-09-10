---
"dsfr-data": minor
---

`cell-class` sur `dsfr-data-list` : une colonne calculée par le `compute` de `dsfr-data-normalize` (`when taux >= 50 then 'seuil-ok' else 'seuil-bas'`) devient la classe CSS d'une cellule, de quoi signaler une valeur hors seuil dans un tableau. Une seule mécanique au lieu d'un second jeu de seuils, et l'information reste lisible en texte quand la colonne de classe n'est pas affichée (#740).
