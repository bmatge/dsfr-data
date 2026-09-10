---
"dsfr-data": minor
---

Agrégat `evolution` sur `dsfr-data-kpi` : `value="recettes:evolution" format="pourcentage"` = (dernière − première) / première, calculé sur la source dans son ordre courant (poser un `order-by` chronologique en amont) ; rendu naturel dans `trend` et `lines`. « — » si moins de deux valeurs ou première = 0. `lag` (valeur de la ligne précédente) est différé : la différence entre deux séries passe par un pivot long → large (`dsfr-data-pivot`, #255) puis `compute` (#675).
