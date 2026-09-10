---
"dsfr-data": patch
---

`replace` et `replace-fields` de `dsfr-data-normalize` agissent enfin sur une colonne numérique ou booléenne : la comparaison porte sur la forme chaîne de la valeur, à égalité stricte, si bien que `replace-fields="annee:2024:2024-2025"` fonctionne — auparavant l'attribut était ignoré en silence (#730).
