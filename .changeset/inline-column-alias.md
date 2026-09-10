---
"dsfr-data": minor
---

Alias inline `col:Libellé` sur `value-cols` de `dsfr-data-unpivot` (`value-cols="gazole_prix:Gazole, sp95_prix:SP95"`) et sur `value-field`, `value-field-2` et `value-fields` de `dsfr-data-chart` (`value-field="Panier_moyen:Panier moyen"`) : la légende et la colonne dépliée affichent le libellé à la place du nom technique. Un `name` explicite prime sur l'alias ; un `:` littéral s'échappe en `%3A` (#668).
