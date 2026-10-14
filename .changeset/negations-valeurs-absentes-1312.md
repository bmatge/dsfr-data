---
'dsfr-data': patch
---

Négations et valeurs absentes : une négation n'est plus confiée au serveur que s'il fait aux valeurs absentes (`null`, champ manquant) le sort que leur fait le navigateur — `neq` les écarte, `notin` et `notcontains` les gardent (#1312, règle de l'ADR-159).

Ce qui change pour une page existante :

- **Tabular, `neq`** : la clause part en `__differs` **et** `__isnotnull`. `__differs` seul est un `IS DISTINCT FROM` qui gardait les lignes dont la valeur est absente : sur les élus municipaux, `neq:Corse` rendait 34 467 lignes au lieu de 139. Une page Tabular qui filtre par `neq` (sur la source ou derrière `server-side`) perd ces lignes et rend enfin le chiffre du navigateur. En plusieurs champs (`a|b:neq:x`), un `and(…)` par champ.
- **Tabular, `notin`** : calculé dans le navigateur, jamais confié à l'API, dont le `not.in` écartait les valeurs absentes (139 lignes au lieu de 34 467 pour `notin:Corse`). La page retrouve ces lignes ; la source charge celles des autres clauses, sous `max-records`, et derrière `server-side`, un agrégat posé sur la source ou `server-facets`, c'est une **erreur de configuration** qui le dit (pour paginer au serveur, écrire la liste des valeurs gardées avec `in`).
- **Tabular, `isnull` / `isnotnull`** : écrits sans valeur (`champ:isnull`), ils n'étaient pas transmis à l'API ; sur le `where` d'une source, la clause n'était appliquée nulle part. Ils partent désormais en `champ__isnull=`.
- **Grist, `notin`** : part en `(champ IS NULL OR champ NOT IN (…))` — `NOT IN` seul écartait les valeurs absentes (89 lignes sur 101 au lieu de 101). Toujours confié à Grist, `server-side` compris.
- **Opendatasoft et INSEE** : inchangés (le `!=` et le `NOT … in` d'Opendatasoft ont déjà le sort du navigateur, remesuré).

Le tableau « Qui calcule chaque clause » (guide, spec de `dsfr-data-query`, `docs/ARCHITECTURE.md`) a désormais une ligne `neq` et une ligne `notin`.
