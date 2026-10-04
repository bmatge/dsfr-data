---
'dsfr-data': patch
---

Adaptateur Tabular : un `in` / `notin` dont une valeur porte une parenthèse ou une virgule est de nouveau délégué, la valeur entre guillemets (#1233). Complète la résolution du constat PG-034 du banc d'essai.

Depuis la 0.45.0, une telle clause n'était plus envoyée à l'API, qui écarte sans erreur une valeur écrite nue : elle était calculée côté client, au prix du jeu entier (10 requêtes au lieu d'une pour 1 818 lignes dont 202 gardées) ; et en pagination serveur (`server-side`), où ce calcul n'est pas possible, elle partait quand même et le résultat était incomplet.

L'API lit la même valeur quand elle est écrite entre guillemets (mesuré le 2026-10-04 : `indicateur__in=Homicides,"Usage de stupéfiants (AFD)"` rend 202 lignes en une requête, `__notin="…"` 1 717, une valeur à virgule citée est lue d'un seul tenant). La clause part donc ainsi :

- sur la source comme sur une `dsfr-data-query`, qui la délègue de nouveau ;
- en chargement complet comme en pagination serveur — où le résultat est désormais complet ;
- un `group-by` posé à côté reste délégué, dans la même requête ;
- seules les valeurs qui en ont besoin sont citées (parenthèse, virgule, guillemet) : une liste ordinaire part comme avant.

Cette forme n'est écrite dans aucune documentation de l'API. Si l'API la refuse, l'adaptateur se replie et le volet Diagnostic le signale (réserve « liste in entre guillemets refusée ») : en chargement complet, la clause est calculée côté client comme en 0.45.0, et le résultat reste juste ; en pagination serveur, la liste repart sans guillemets, avec l'avertissement console et la réserve « valeur écartée par le serveur ».

**Ce qui reste.** Si l'API refuse la forme, la pagination serveur rend de nouveau un résultat incomplet, et il n'existe pas de correction côté bibliothèque. Si l'API venait à ignorer les guillemets sans erreur, rien ne le signalerait dans la page : seul le contrôle de nuit contre l'API réelle le verrait. Le tri d'une pagination serveur sur une clé non unique reste instable d'une page à l'autre (PG-033).
