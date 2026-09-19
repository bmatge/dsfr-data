---
'dsfr-data': minor
---

**`dsfr-data-a11y` : `empty-label` nomme le groupe non renseigné dans le tableau équivalent** ([#933](https://github.com/bmatge/dsfr-data/issues/933), AM-085). Depuis [#647](https://github.com/bmatge/dsfr-data/issues/647), `empty-label` sur `dsfr-data-chart` nomme la catégorie vide (`null`, `undefined`, `""`) sur l'axe et dans la légende. Le tableau équivalent qui double ce graphique, lui, rendait une cellule de libellé **vide** : la barre « Non renseigné | 3 » devenait la ligne « | 3 ». Un lecteur d'écran entendait donc une valeur sans son nom, là où l'œil voyait les deux — sur des jeux publics où le groupe non renseigné est souvent la modalité la plus nombreuse.

`empty-label` existe maintenant aussi sur `dsfr-data-a11y`. Posé, il remplit la cellule de la **colonne de libellé** (`label-field` s'il est défini, sinon la première colonne rendue) quand la valeur est vide, et le **CSV téléchargé porte le même libellé** que le tableau affiché. Les colonnes de valeur ne sont jamais touchées : une mesure absente reste une cellule vide, on n'invente pas une mesure.

**Strictement additif** : absent, le rendu est celui d'avant, cellule vide comprise. La valeur n'est volontairement **pas** reprise du graphique visé par `for` — la reprendre aurait changé le tableau de pages déjà en ligne ; l'écrire sur les deux balises est le prix d'un zéro risque de régression.
