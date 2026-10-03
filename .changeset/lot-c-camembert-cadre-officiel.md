---
'dsfr-data': patch
---

`dsfr-data-chart` :

- Camembert : un `name` en chaîne simple est un nom de série, pas celui d'une part. Enveloppé en `["Bénéficiaires"]`, il ne nommait que la première part et DSFR Chart complétait la légende en « Série 2 … Série 18 ». La légende porte désormais les libellés des parts ; seul un tableau JSON écrit à la main (une entrée par part) est conservé ([#1174](https://github.com/bmatge/dsfr-data/issues/1174)).
- Tableau du cadre officiel (`databox`) : l'en-tête d'une colonne de valeur est ce que la légende affiche — l'alias inline `champ:Libellé` s'il est écrit, sinon le nom de série de `name`, sinon le chemin — et chaque champ de valeur (`value-field-2`, `value-fields`) a sa colonne. Le tableau disait `nombre_beneficiaires__sum` quand la légende disait « Bénéficiaires » ([#1179](https://github.com/bmatge/dsfr-data/issues/1179)).
- `databox-fullscreen` : la description dit ce que fait DSFR Chart 2.1.1 — le bouton n'apparaît qu'avec `databox-modal-title`, et il ouvre cette modale ; le graphique n'est pas agrandi.
