---
'dsfr-data': patch
---

Carte : une couche `geoshape` sans `geo-field` trace ses formes (#1053). La colonne géométrique est détectée seule : la première colonne `geo_shape`, `geometry` ou `geom` qui porte du GeoJSON, objet ou chaîne sérialisée. Les exemples de la documentation (fond administratif en `transform="features"`, choroplèthe sans `geo-field`) affichaient une carte vide, parce que le rendu ne lisait que `geo-field` alors que le calcul d'emprise devinait déjà sa colonne. Un jeu Opendatasoft porte `geo_point_2d` et `geo_shape` : c'est la forme qui est tracée. L'avertissement des lignes ignorées nomme la colonne détectée. Si aucune colonne ne convient, la couche le dit en console au lieu de rester vide sans un mot. La règle de lint `carte/geoshape-sans-geo-field` passe d'erreur à avertissement.
