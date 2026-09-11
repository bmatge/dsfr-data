---
'dsfr-data': minor
---

feat(core) : `per-row` et `span`, deux noms sans ambiguïté pour le colonnage, `cols` gardé tel quel

Le même attribut `cols` désignait deux grandeurs opposées. Sur `dsfr-data-facets`, c'est une
**largeur** sur la grille de 12 (`cols="4"` donne 3 facettes par ligne). Sur `dsfr-data-display` et
`dsfr-data-kpi-group`, c'est un **nombre** d'éléments par ligne (`cols="4"` donne 4 éléments).
Deux noms le disent désormais sans détour :

- **`per-row`**, le nombre d'éléments par ligne, sur `dsfr-data-display`, `dsfr-data-kpi-group` et,
  nouveauté, `dsfr-data-facets` ;
- **`span`**, la largeur sur la grille de 12 colonnes, sur `dsfr-data-facets` (global ou par
  facette, `span="annee:3 | type:6"`) et sur `dsfr-data-kpi` à l'intérieur d'un groupe.

**Aucune page ne change de rendu.** `cols` et `col` gardent leur sens sur chaque composant, sans
échéance. Posés avec leur remplaçant, ils cèdent la place et une erreur de configuration non
bloquante le signale. `per-row` n'accepte que les diviseurs de 12 : `per-row="5"` aurait donné
six éléments par ligne en silence. Sur les facettes, `per-row` et `span` se combinent : une facette
nommée dans `span` garde sa largeur, les autres se partagent la ligne. La documentation et les
fiches de skill utilisent les nouveaux noms.

Suite de #790 (ADR-112). Le colonnage responsive (#789) portera sur `per-row` et `span`.
