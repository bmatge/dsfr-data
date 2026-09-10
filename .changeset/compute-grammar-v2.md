---
"dsfr-data": minor
---

`compute` de `dsfr-data-normalize` — grammaire v2 (ADR-105) : fonctions en liste blanche (`year month day round abs floor ceil lower upper trim len concat replace coalesce is_null is_empty join contains`), conditions `when … then … else` (`else` obligatoire), comparaisons `= != < <= > >=` avec la même égalité lâche que `where`, `and or not`, littéraux `null true false`. Fonction inconnue, arité fausse ou `when` sans `else` : erreur de configuration nommée (console + `data-dsfr-config-error`), jamais une colonne vide. Les colonnes calculées apparaissent dans la trace du volet Diagnostic avec un exemple de valeur (#671).
