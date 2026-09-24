---
'dsfr-data': patch
---

Garde-fou de neutralité fournisseur des composants (#1134) : un test statique refuse désormais toute grammaire, tout endpoint ou tout nom de fournisseur d'API dans `components/` et `utils/` hors des exceptions déclarées (chacune avec son issue), et ESLint interdit aux composants d'importer un adaptateur concret. Le dialecte de filtre ne se teste plus que dans `utils/where.ts` (`toWhereDialect`, `escapeWhereValue`), et toute méthode optionnelle d'un adaptateur est appelée en `?.`, vérifié statiquement, pour qu'un adaptateur tiers enregistré par `registerAdapter` puisse ne pas les implémenter. Le message de repli local de `dsfr-data-search` ne nomme plus de fournisseur.
