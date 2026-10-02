---
'dsfr-data': patch
---

Adaptateur Tabular : deux pertes de lignes silencieuses de l'API ne passent plus (#1202).

- Un chargement paginé trié sur un champ non unique perdait ou doublait des lignes aux limites de page (pagination par offset, une seule clé de tri). Quand tout le jeu tient sous `max-records`, l'adaptateur le relit sans tri et trie lui-même ; tronqué, il garde le tri serveur et l'avertit. Résout le constat PG-033 du banc d'essai.
- Un `in`/`notin` dont une valeur porte une parenthèse ou une virgule n'est plus délégué (l'API écartait la valeur avec un HTTP 200) : la query filtre côté client ; un `where` posé sur la source avertit une fois. Résout le constat PG-034 du banc d'essai.
