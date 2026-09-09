---
"dsfr-data": patch
---

`dsfr-data-chart` : nouvel attribut `empty-label` (défaut « Non renseigné ») pour libeller les catégories vides (`null`, `undefined`, `""`) — la légende d'un pie n'affiche plus « Série N » pour un groupe sans valeur. Le libellé par défaut des labels manquants passe de `N/A` à « Non renseigné » ; le `group-by` client de `dsfr-data-query` conserve `null` (et non `""`) comme valeur de groupe, pour qu'un `where="champ:isnotnull"` aval l'exclue (#647).
