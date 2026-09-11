---
'dsfr-data': minor
---

feat(join) : une jointure qui perd des lignes à la graphie près le dit, clés orphelines à l'appui

Le taux d'appariement de `dsfr-data-join` était publié depuis la 0.22 dans le volet Diagnostic,
mais l'alerte ne partait que sous 50 %. Or le cas dangereux est la jointure **presque** pleine. Le
banc d'essai l'a mesuré : une source publie ses départements en `1`…`9`, l'autre en `01`…`09`, la
jointure `inner` apparie 98 lignes sur 101, et le ratio calculé en aval reste plausible, faux de
1,5 %.

- Les statistiques de jointure citent désormais **quelques clés orphelines** de chaque côté. C'est
  l'exemple `1` face à `01` qui fait trouver la cause, pas le pourcentage.
- Elles détectent l'**écart de graphie** : des clés orphelines qui ne diffèrent que par des zéros
  de tête ou des espaces. Le volet Diagnostic alerte alors quel que soit le taux, et nomme la cause.
- Un **avertissement console** part quand une jointure `inner` retire des lignes, et, sur `left`,
  `right` ou `full`, quand l'écart est un écart de graphie. Une ligne sans correspondance y est
  souvent légitime, le taux suffit alors.

La jointure elle-même ne normalise rien : `1` et `01` ne s'apparient toujours pas, harmoniser les
clés reste un choix de l'auteur. Le guide du motif « agréger, joindre, diviser » le dit.

Suit le commentaire du banc d'essai sur AM-075 (#792).
