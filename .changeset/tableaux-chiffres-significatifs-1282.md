---
'dsfr-data': patch
---

Tableaux équivalents : un petit ratio ne s'affiche plus « 0 » (#1282, suite de #1260).

Le tableau de la DataBox de `dsfr-data-chart`, celui de `dsfr-data-a11y` et les cellules de
`dsfr-data-list` arrondissaient tout nombre à deux décimales : un ratio de 0,00123 s'y lisait « 0 »
(et −0,00123, « -0 ») alors que le graphique traçait bien la valeur. La version accessible du
graphique annonçait zéro pour une valeur qui ne l'est pas.

Désormais, sans attribut `decimals`, une valeur **non nulle inférieure à 0,01 en valeur absolue**
garde ses deux premiers chiffres significatifs, écrits en entier : 0,00123 → « 0,0012 »,
−0,00123 → « -0,0012 », 0,005 → « 0,005 », 1e-12 → « 0,000000000001 » (jamais de notation
scientifique). Zéro s'écrit « 0 », y compris `-0`.

**Seules les valeurs inférieures à 0,01 en valeur absolue changent d'affichage.** À partir de 0,01,
rien ne bouge : « 0,01 », « 2,27 », « 1 234 567,89 ». Ne changent pas non plus : les valeurs passées
au graphique, les chaînes (codes INSEE, SIREN), l'attribut `decimals` (posé, il est tenu tel quel :
`decimals="2"` rend toujours « 0,00 »), et les fichiers exportés — le CSV de `dsfr-data-a11y` et les
exports de `dsfr-data-list` portaient déjà la valeur brute (`0.00123`), pas l'arrondi d'affichage.
