---
"dsfr-data": minor
---

Nouveau composant `dsfr-data-pivot`, symétrique de `dsfr-data-unpivot` : replie un tableau « long » en tableau croisé « wide » (`row`, `column`, `value`, `aggregate` = `sum` par défaut, `column-order`, `column-format`, `labels`, `max-columns`), cellules vides à `null`, statistiques (colonnes générées, cellules vides) dans la trace du Diagnostic. `dsfr-data-list` sans `columns` dérive désormais ses colonnes des données, et `columns-auto` complète une liste de colonnes figées avec celles des données (#255, #640).
