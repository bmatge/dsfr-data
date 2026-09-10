---
"dsfr-data": minor
---

`dsfr-data-facets server-facets` sans `fields` : découverte au premier cycle des facettes déclarées par le jeu de données (OpenDataSoft : champs annotés « facet » des métadonnées, avec leur libellé ; Grist : colonnes Choice/ChoiceList), mémorisée et invalidée au changement de `dataset-id`, puis cascade normale (#680). Sur une facette ODS de type date, la sélection d'une année émet un intervalle `champ >= date'2022-01-01' AND champ < date'2023-01-01'` au lieu de l'égalité `champ = "2022"` que l'API refuse (400 `IncompatibleTypesInComparisonFilter`, #676) ; nouvelle méthode optionnelle `discoverFacets` et option `dateFields` de `buildFacetWhere` sur les adaptateurs.
