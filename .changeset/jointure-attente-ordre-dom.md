---
'dsfr-data': patch
---

**Une jointure dont une entrée est en `require-where` ne reste plus sur « Chargement… » selon l'ordre des balises (#897).** `TransformerMixin` relayait chaque événement amont tel quel : avec une seule entrée, l'état du dernier événement est bien l'état du nœud ; avec deux, les relais s'écrasaient. Quand le `dsfr-data-loading` de l'entrée ordinaire arrivait après le `dsfr-data-idle` de l'entrée `require-where`, l'aval restait sur un chargement que rien ne venait lever — la jointure n'émet rien tant que ses deux entrées ne sont pas là. La seule différence entre la page qui marchait et la page qui bloquait était l'ordre des deux `dsfr-data-source` dans le DOM, sans message ni erreur console.

Un transformateur multi-entrées **dérive** désormais son état de **toutes** ses entrées : erreur d'abord, puis attente (une entrée qui attend un filtre ne livrera rien, donc le résultat ne se fera pas), puis chargement tant qu'aucune n'attend. Une entrée chargée qui ne suffit pas à produire le résultat ne laisse plus l'aval sur un chargement sans fin. Les transformateurs à une seule entrée (query, normalize, unpivot, facets, search) sont inchangés par construction.

Le contournement en page — déclarer les entrées pleines avant la source `require-where`, et ne mettre aucun transformateur entre elles et la jointure — n'a plus lieu d'être.
