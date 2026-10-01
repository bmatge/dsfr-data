---
'dsfr-data': patch
---

Délégation à travers la chaîne (#1199) :

- `dsfr-data-query` ne délègue plus son `group-by` à une source qui porte déjà son regroupement (`group-by`, `aggregate` ou agrégat dans `select`), même derrière un `dsfr-data-normalize` : elle regroupe les groupes côté client au lieu de remplacer celui de la source. Résout le constat BUG-026 du banc d'essai.
- `dsfr-data-query` implémente `transformsSchema()` (vrai si elle regroupe, agrège ou éclate, sinon la réponse de sa source) : une query en aval ne délègue plus sous des noms renommés en amont. Résout le constat BUG-036 du banc d'essai.
- Un `where` de query sur un alias fabriqué par la source (`count(*) as n`) reste côté client, et l'adaptateur Opendatasoft ne condamne plus l'export du jeu sur un 400 dû à la clause (seulement sur un 404). Résout le constat BUG-027 du banc d'essai.
