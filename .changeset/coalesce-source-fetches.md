---
'dsfr-data': patch
---

fix(source): coalesce concurrent fetches pour éviter les aborts quand plusieurs `dsfr-data-query` délèguent server-side à la même source.

Avant : chaque commande entrante déclenchait un refetch immédiat qui abortait le précédent. Sur un pipeline avec 3 queries partageant une source Grist, on observait 3 `NS_BINDING_ABORTED` consécutifs dans la console (puis 1 fetch final qui aboutissait). Le pire cas : si les queries délèguent des overlays conflictuels (ex : groupBy vs orderBy sur une colonne non groupée), l'ordre d'arrivée décidait des données visibles.

Maintenant : `_scheduleFetch()` diffère le fetch au prochain macrotask via `setTimeout(0)`. Tous les `willUpdate` et commandes de délégation arrivant dans la même passe synchrone coalescent en un seul fetch avec la combinaison finale des overlays.
