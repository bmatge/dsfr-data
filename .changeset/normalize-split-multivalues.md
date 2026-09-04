---
'dsfr-data': minor
---

Attribut `split` sur `<dsfr-data-normalize>` : champs multivalues -> tableaux

- Les colonnes multivaluees livrees sous forme de chaine avec separateur (`group_concat` SQL
  Grist, CSV « a|b|c ») etaient vues par `<dsfr-data-facets>` comme une valeur unique : la
  facette affichait des boutons combines « Sortie du fioul|Planification de la sortie du gaz ».
- `split="Axes:|, Operateurs:|, Cibles:;"` decoupe ces champs en vrais tableaux (elements
  trimes, vides ecartes, chaine vide = tableau vide), comme une ChoiceList Grist. Separateur par
  defaut : la virgule (`split="Tags"`). S'applique apres `replace` et avant `numeric`/`rename`.
- Aucun changement dans `dsfr-data-facets`, qui traite deja les cellules tableau (#421) :
  une valeur par element, filtrage par intersection, modes select/multiselect.
