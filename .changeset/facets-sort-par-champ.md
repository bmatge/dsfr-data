---
"dsfr-data": minor
---

`dsfr-data-facets` : l'attribut `sort` accepte un tri par champ, avec la grammaire à barre verticale déjà utilisée par `labels`, `display` et `cols` — `sort="annee:alpha:asc | categorie:count:desc"`. Une facette d'années se range alphabétiquement pendant qu'une facette de catégories reste rangée par fréquence, sans dupliquer le composant ; l'entrée `*` change le tri par défaut et les formes globales historiques restent valides (#741).
