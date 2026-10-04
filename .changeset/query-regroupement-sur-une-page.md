---
'dsfr-data': patch
---

`dsfr-data-query` ne calcule plus un regroupement sur une seule page d'une source en pagination serveur (#1242).

Quand une `dsfr-data-source` est en `server-side`, elle ne livre qu'une page. Une `dsfr-data-query` en aval qui gardait son regroupement côté client — part (`share`, `share_percent`), cumul (`running_sum`, `diff`), `explode`, agrégat sans `group-by`, fonction que l'adaptateur ne traduit pas, transformateur amont qui change les colonnes, source lue par d'autres composants, source déjà regroupée — agrégeait cette seule page, sans un mot. Mesuré sur 137 lignes en pages de 40, à l'identique sur Opendatasoft, Tabular et Grist : une part de 15,03 % au lieu de 14,62 %, une somme de 39 220 000 au lieu de 127 684 000.

**Ce qui change pour une page existante.** Une page dont le montage est fautif affiche désormais une **erreur de configuration** à la place du chiffre partiel : la requête porte `data-dsfr-config-error`, les blocs en aval (graphique, KPI, tableau) passent en état d'erreur, et la console le dit. C'est le cas même quand le jeu tenait par chance dans une page et que le chiffre était juste : le montage est jugé, pas le nombre de lignes. Le message nomme la source, les attributs en cause et la correction :

- retirer `server-side` de la source : elle charge alors le jeu entier, dans la limite de `max-records` (à relever si le jeu est plus long) ;
- si le jeu dépasse ce plafond, ou si un tableau paginé lit la même source : donner à la requête sa propre source sans `server-side`, qui porte le regroupement délégable (`group-by`, `aggregate`) ; la part ou le cumul se calcule alors sur la requête, à partir des groupes.

**Ce qui ne change pas.** Un tableau ou une liste paginés au serveur sans regroupement, et une requête qui délègue réellement son regroupement à la source.

**Mode URL avec `paginate`.** Aucun attribut ne fait charger le jeu entier à une source en mode URL (sans `paginate`, c'est la page par défaut de l'API qui revient). La requête garde donc son comportement — calcul sur la page reçue — mais le dit : avertissement en console, et réserve « regroupement calculé sur une seule page » au volet Diagnostic.

**Volet Diagnostic.** Les réserves (`meta.caveats`) décrivent désormais chaque étape : un transformateur ne relaie toujours pas celles de sa source, mais peut poser les siennes.

Non couvert : un `dsfr-data-kpi` ou un `dsfr-data-chart` branché directement sur une source paginée agrège toujours la page reçue.
