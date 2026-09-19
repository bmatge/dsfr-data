---
'dsfr-data': minor
---

**`dsfr-data-a11y` : `series-field` pivote le tableau équivalent d'un graphique multi-séries** ([#930](https://github.com/bmatge/dsfr-data/issues/930), AM-082). `dsfr-data-concat` ([#807](https://github.com/bmatge/dsfr-data/issues/807)) rend une légende nourrie par la donnée : empiler trois séries, poser `origin-field`, et `dsfr-data-chart series-field` trace trois courbes nommées par le jeu. Le tableau équivalent, lui, ne connaissait que `label-field` et `value-field` : il rendait une ligne par couple (libellé, série) **sans aucune colonne disant de quelle série venait la valeur** — six lignes « 2022 | 100 », « 2022 | 100 », « 2023 | 104 »… où le graphique montre trois points par courbe. Le gain de légende se payait d'un tableau illisible, c'est-à-dire de l'alternative accessible elle-même.

`series-field` sur `dsfr-data-a11y` **pivote** : une ligne par valeur de `label-field`, une colonne par valeur distincte du champ de série (dans leur ordre d'apparition, le même que celui des séries du graphique). La cellule de libellé devient un **`<th scope="row">`** — dans un tableau croisé, une valeur sans en-tête de ligne n'a plus qu'une moitié de ses coordonnées pour un lecteur d'écran. Le résumé lu annonce « N lignes, M séries » au lieu du compte du format long, et le **CSV téléchargé suit la même structure** que le tableau affiché.

Garde-fous : l'attribut exige `label-field` **et** `value-field` — sans eux on ne sait pas quelle colonne porte la mesure, et le manque est **nommé** (`data-dsfr-config-error` + console) avec repli sur le tableau à plat, jamais un pivot silencieusement faux. Un couple (libellé, série) absent des données laisse une cellule **vide** : le graphique y trace 0, le tableau ne l'affirme pas.

**Strictement additif** : absent, le rendu est celui d'avant, y compris les `<td>` du tableau à plat. La valeur n'est volontairement **pas** reprise du graphique visé par `for`, qui aurait changé la forme du tableau de pages déjà en ligne.
