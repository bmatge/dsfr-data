---
'dsfr-data': patch
---

`dsfr-data-search` et `dsfr-data-join` relaient désormais les commandes aval (`page`, `where`, `orderBy`) vers leur source amont, comme query/normalize/unpivot (#272). Un `dsfr-data-list` paginé derrière un search ne perdait plus silencieusement sa pagination ; join relaie vers la source gauche (porteuse des lignes principales), la droite étant traitée comme table de référence — comportement documenté.
