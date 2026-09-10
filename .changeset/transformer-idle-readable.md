---
"dsfr-data": minor
---

Les transformateurs du pipeline (search, facets, normalize, query, join, pivot, unpivot, podium) savent enfin rendre l'attente d'un filtre : `TransformerMixin` expose `isIdle()` en plus de propager l'événement. `dsfr-data-search` s'en sert — son compteur cède la place à `idle-message` tant que l'amont `require-where` n'a rien reçu, au lieu d'annoncer « 0 résultats », et il affiche désormais un séparateur de milliers (« 12 345 résultats ») (#728).
