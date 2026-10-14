---
'dsfr-data': patch
---

**`contains` et `notcontains` ne sont plus confiés à un portail Opendatasoft : ils retiennent enfin toutes les lignes qui portent la sous-chaîne (#1285, ADR-159, lot 1).**

Le défaut. Un filtre `champ:contains:aliment` posé sur une source `api-type="opendatasoft"` partait au portail en `champ like "%aliment%"`. Or le `like` d'Opendatasoft compare des **mots**, et `%` n'y est pas un joker : mesuré le 2026-10-12 sur `rappelconso-v2-gtin-trie` (data.economie.gouv.fr), cette clause rend **0 ligne là où 14 366 valent « alimentation »**, HTTP 200, sans un message (`like "alimentation"` → 14 366, `like "alim*"` → 15 632, `like "*tation"` → 0). Le même filtre trouvait ses lignes sur un fichier CSV et zéro sur un portail. Le résultat n'était juste que si la valeur cherchée était un mot entier.

Ce qui change, sur Opendatasoft seulement :

- `contains` / `notcontains` — dans le `where` ou le `filter` d'une `dsfr-data-query`, dans un `dsfr-data-context-filter operator="contains"`, dans une recherche `dsfr-data-search context="…"` — sont **calculés dans le navigateur**, par la source, sur les lignes chargées. Sous-chaîne, casse ignorée, accents respectés : le même résultat que sur toute autre source. Les autres clauses du même filtre (`eq`, `in`, comparaisons…) partent au portail comme avant.
- **Le coût** : la source télécharge toutes les lignes que laissent passer les autres clauses, au lieu des seules lignes retenues, dans la limite de `max-records` (1 000 par défaut ; au-delà, la troncature est signalée comme d'habitude). Pour un grand jeu : `fetch-mode="export"` et `max-records` à la taille du jeu, ou une égalité de plus dans le filtre. Le `group-by` de la même requête n'est plus délégué : il est calculé dans le navigateur, sur les lignes filtrées.
- **Erreur de configuration lisible** (`data-dsfr-config-error` + console) là où ce calcul n'a pas le jeu entier, au lieu d'un résultat partiel : source en `server-side` ; `group-by`, `aggregate` ou `select` calculé posés sur la source ; `dsfr-data-facets server-facets` à côté (ses compteurs ignoreraient la clause). Le message nomme la clause et dit quoi écrire : retirer `server-side` / `server-facets`, une égalité quand la valeur est connue, ou `dsfr-data-search server-search` pour une saisie du visiteur.
- Le `where` écrit en ODSQL sur une `dsfr-data-source` n'est pas touché : il part tel quel.

Exports : le Builder, le Studio et le Tableau de bord n’écrivent plus de `like "%…%"`. Avec un filtre « contient » sur Opendatasoft, le code généré charge le jeu (`fetch-mode="export"`) et filtre dans une `dsfr-data-query` ; un tableau n'y est plus paginé au serveur, un KPI n'y est plus agrégé par le serveur. Aucun plafond de lignes n'est écrit dans le code généré : c'est `max-records` qui s'applique.

Hors de ce lot : Tabular et Grist gardent `contains` délégué (lot 2), `dsfr-data-search` en mode `context` émet toujours un filtre `contains` (lot 3). Aucun nouvel opérateur.

L'issue #1285 ne cite aucun identifiant du registre du banc d'essai (constat trouvé en reprenant les exemples du guide).
