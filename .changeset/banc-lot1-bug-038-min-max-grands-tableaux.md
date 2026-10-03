---
'dsfr-data': patch
---

`min` et `max` ne dépassent plus la pile sur une colonne de plus de 125 000 valeurs — résout le constat BUG-038 du banc d'essai (#1228).

`Math.min(...values)` passe chaque valeur en argument d'appel : au-delà d'un seuil qui dépend du moteur (entre 120 000 et 125 000 dans un onglet Chromium), l'appel lève « RangeError: Maximum call stack size exceeded », et la page gardait son ancien résultat sans un mot. Le défaut restait entier sur les colonnes numériques (les colonnes de dates étaient passées par effet de bord de #1200).

L'étalement est remplacé par une boucle partout où un tableau de données était étalé en arguments :

- `min` / `max` de `dsfr-data-query` et de `dsfr-data-kpi` (`utils/aggregations.ts`) ;
- `aggregate="min"` / `"max"` de `dsfr-data-pivot` ;
- l'échelle de rayon (`radius-field`) et le cumul des pas de temps (`time-mode="cumulative"`) de `dsfr-data-map-layer` ;
- les bornes d'axe élargies pour une cible, dans `dsfr-data-chart` ;
- l'empilement de `dsfr-data-concat`, qui étalait les lignes d'une source entière ;
- la barre de référence de `dsfr-data-podium` ;
- les outils de données du Studio IA (`aggregateBy`, `inspectData`).

Un test-garde refuse désormais tout `Math.min(...)` / `Math.max(...)` non déclaré dans `packages/core/src` et `packages/shared/src`.
