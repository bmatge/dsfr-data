---
'dsfr-data': patch
---

Comparaison de texte : une seule écriture, une seule règle par serveur (#1285, ADR-159, lot 4).
Rangement sans changement de résultat.

- La comparaison du filtre `contains` / `notcontains` (sous-chaîne, casse ignorée, accents
  respectés) n'est plus écrite qu'à un endroit, `filterTextContains` de
  `shared/query/text-match.ts`, appelé par `applyLocalFilter`, `dsfr-data-query`, `contains()` de
  `compute` et les outils du Studio. La recherche tolérante (ex-`utils/search-match.ts`) y est
  rangée aussi. Un test-garde refuse toute nouvelle écriture de la sous-chaîne hors de ce module.
- Ce que chaque serveur calcule comme le navigateur est dit par une interface unique,
  `canServerExpress(fournisseur, clause)` / `splitFilterForServer` (`shared/query/server-clause.ts`),
  lue par les adaptateurs Opendatasoft, Tabular et Grist, par le dialecte ODSQL par défaut et par les
  exports du Builder et du tableau de bord.
- Le tableau « qui calcule chaque clause de texte, par fournisseur » a une source,
  `docs/ARCHITECTURE.md`, reprise à l'identique dans le guide et la spec de `dsfr-data-query` ; un
  test le compare à la règle du code et à ses deux copies.
