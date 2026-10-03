---
'dsfr-data': patch
---

Adaptateur Tabular : les trois pertes silencieuses qui restaient après la 0.43.0 sont corrigées (#1233, suite de #1202). Résout le constat PG-033 du banc d'essai pour les chargements groupés et tronqués, et le constat PG-034 du banc d'essai pour un `where` posé sur la source — en chargement complet ; ce qui reste est dit plus bas.

- **Chargement groupé trié (PG-033).** Une source `group-by` + `aggregate` + `order-by` triée sur une colonne de regroupement non unique perdait des groupes dès la deuxième page, sans avertissement : 1 818 groupes rendus, 1 805 distincts. Les groupes sont désormais relus sans tri et triés par l'adaptateur, comme les lignes brutes depuis la 0.43.0 : 1 818 distincts, pour une requête de plus (11 au lieu de 10). L'ordre est alors celui du pipeline (vides, nombres, puis textes), le même que celui d'une `dsfr-data-query`.
- **Chargement tronqué trié (PG-033).** Quand `max-records` ou `limit` coupe le chargement, le jeu ne peut pas être relu : le tri reste au serveur, complété d'une clé de départage qui le rend total — l'identifiant de ligne `__id`, ou les autres colonnes du `group-by`. 600 lignes rendues, 600 distinctes (550 avant), les 600 premières du tri, pour une requête de plus (4 au lieu de 3). L'API Tabular ignore un second `__sort` ; la clé de départage passe dans la valeur du premier (`Code_region__sort=asc,"__id".asc`), forme que l'API accepte sans la documenter. Si elle la refuse un jour, le tri du serveur est gardé tel quel, un avertissement le dit en console, et le volet Diagnostic affiche le constat « tri serveur instable d'une page à l'autre ».
- **`in` / `notin` à parenthèse posé sur la source (PG-034).** La clause ne part plus au serveur, qui écartait la valeur sans erreur (101 lignes au lieu de 202) : la source charge les lignes que gardent ses autres clauses et la calcule elle-même, comme une `dsfr-data-query`. Le prix est le chargement complet : 10 requêtes au lieu d'une pour 1 818 lignes dont 202 gardées. Une liste sans parenthèse ni virgule part au serveur comme avant.

Un chargement d'une seule page garde le tri du serveur, sans requête de plus ; un `limit` que la première page couvre ne déclenche plus l'avertissement de troncature de la 0.43.0.

Ce qui reste :

- **Pagination serveur (`server-side`).** Aucun de ces garde-fous n'y joue. Un tri sur une clé non unique y reste instable d'une page à l'autre, et un `in` / `notin` à parenthèse y part toujours au serveur : le résultat est incomplet, avec un avertissement console et, désormais, le constat « valeur d'un filtre in écartée par le serveur » dans le volet Diagnostic.
- **`group-by` et `in` à parenthèse sur la même source.** Le regroupement n'est plus délégué : la source rend les lignes filtrées, brutes, et c'est une `dsfr-data-query` en aval qui regroupe (avertissement console). Sans query en aval, les lignes restent brutes.
- Le défaut d'origine est celui de l'API Tabular (pagination par décalage sur un tri non total, parseur de liste de `__in`) : à signaler à data.gouv.fr.
