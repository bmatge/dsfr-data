---
'dsfr-data': minor
---

Modèle de document multi-blocs partagé et export vivant (#515, étape 1) : le modèle du dashboard (`DashboardData`/`Widget`) et la `ChartConfig` du builder-IA sont promus dans `@dsfr-data/shared`, étendus d'un widget graphique `fromBuilder` (ChartConfig complète), d'un widget `filters` (filtres partagés) et d'un `sourceId` par widget. Le nouvel export partagé génère une page DSFR autonome et vivante : balises `dsfr-data-source` (données embarquées ou connexion API), pipelines `dsfr-data-query` (where/agrégation/tri, alias `field__fn`), et filtres partagés en selects DSFR + `dsfr-data-context`/`-tags`.
