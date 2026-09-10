---
"dsfr-data": minor
---

Attribut `where` sur `dsfr-data-kpi` : `value="montant:sum" where="categorie:eq:Actif"` calcule la somme filtrée sans query intermédiaire. Dialecte colon de `dsfr-data-query` (12 opérateurs, clauses multiples), appliqué à `value`, `trend` et `lines`. Côté client seulement : le filtre porte sur les lignes reçues et n'est jamais délégué au serveur (#674).
