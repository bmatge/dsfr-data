---
'dsfr-data': patch
---

Formatage unifié : la preview des builders rend exactement ce que rend le composant (#317). `formatKPIValue` (shared, previews) et les formatters de core (composants) divergeaient — euro à 2 décimales en preview contre 0 dans le composant, `%` en suffixe texte contre `style:'percent'`. La famille canonique (`formatValue`/`formatNumber`/`formatPercentage`/`formatCurrency`/`formatDecimal`/`formatDate`) vit désormais dans `@dsfr-data/shared` ; core la re-exporte (même implémentation, pas une copie) et `formatKPIValue` devient un wrapper déprécié qui mappe l'unité vers le format. Politique `%` documentée (la valeur EST le pourcentage : 5 → « 5 % ») ainsi que la tolérance volontairement différente entre `looksLikeNumber` (détection conservatrice pour numeric-auto) et `toNumber` (parseur tolérant).
