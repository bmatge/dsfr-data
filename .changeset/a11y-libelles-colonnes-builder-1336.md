---
'dsfr-data': patch
---

Builder : le tableau accessible d'un graphique porte les libellés saisis, pas les noms techniques des colonnes agrégées (#1336).

- **Le code produit nomme les colonnes du compagnon accessible** : `label-field="region:Région"` et `value-field="value:Budget voté,value2:Taux d'exécution"`, une colonne par série tracée, dans l'ordre de la légende. Sans ces attributs, `dsfr-data-a11y` lisait toutes les colonnes des lignes reçues dans leur ordre d'apparition : le tableau et le CSV annonçaient « value », « region », « value2 » là où la légende dit « Budget voté » et « Taux d'exécution », et la colonne de libellé n'était même pas la première — c'est elle, et elle seule, que vise `empty-label`. Le tableau du cadre officiel avait reçu ses libellés en #1179 ; son compagnon accessible, non.
- **Sans libellé saisi, l'en-tête porte le nom du champ** (`budget`), jamais l'alias de l'agrégat (`value`).
- **Carte** : la colonne de libellé est le champ géographique, sans le libellé de l'axe, qui ne le décrit pas. **Format long** (`series-field`) : le tableau pivote comme le graphique sépare ses séries.
- Un `:` ou une `,` dans un libellé est échappé (`%3A` / `%2C`) : c'est la ponctuation de la grammaire des alias, pas du texte.
- Les **tableaux de données** (`dsfr-data-list`) gardent leurs colonnes brutes : leurs lignes ne sont pas agrégées, toutes leurs colonnes se lisent.
