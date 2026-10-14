---
'dsfr-data': patch
---

Filtre `contains` / `notcontains` sur Tabular et Grist : la même sous-chaîne que dans le navigateur (#1285, ADR-159, lot 2).

- **`contains` reste confié à l'API, jokers échappés.** Tabular (`ilike`) et Grist (`LIKE`) lisaient `%` et `_` de la valeur comme des jokers : `nom:contains:50%` retenait « 500 », `code:contains:a_b` retenait « axb ». La valeur part désormais échappée ; sur Grist, la clause s'écrit `LIKE ? ESCAPE '\'`, sans quoi SQLite n'échappe rien. Mesuré le 2026-10-14 : `LIBELLE__contains=Sain_` rendait 25 communes de l'Ariège, `Sain\_` en rend 0 ; sur Grist, `'%Co_se%'` rendait les deux départements corses.
- **Sur Tabular, un `contains` dont la valeur porte `*` est calculé dans le navigateur** : l'API lit `*` comme un joker, et aucune écriture ne le garde tel quel.
- **`notcontains` est calculé dans le navigateur** sur Tabular et sur Grist, comme sur Opendatasoft depuis la 0.51.0 : leur `NOT LIKE` écartait les lignes dont la valeur est absente, que le filtre garde. Mesuré sur les élus municipaux : 498 lignes rendues par l'API là où le navigateur en garde 34 826.
- **Le `where` écrit sur une source Tabular ou Grist suit la même règle** que celui d'une `dsfr-data-query` : un `notcontains` y est calculé par la source.
- **Derrière `server-side` (ou à côté de `dsfr-data-facets server-facets` sur Grist), un `notcontains` devient une erreur de configuration** qui nomme la clause et dit de retirer `server-side`. Le Builder et l'export du tableau de bord ne posent plus `server-side` sur un tableau Tabular filtré par « ne contient pas ».
- La recherche (`dsfr-data-search` en `server-search` ou en mode `context`) partage la clause de `contains` sur Tabular et Grist : elle profite du même échappement ; sur Tabular, un terme qui porte `*` est cherché dans le navigateur.
