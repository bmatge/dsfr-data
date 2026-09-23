---
'dsfr-data': patch
---

page_size 200 : quatre fois moins de requêtes Tabular (#1019). L'adaptateur Tabular demandait des pages de 50 lignes alors que l'API en sert jusqu'à 200 (mesuré : `page_size=201` répond 400). Le chargement complet passe à 125 pages de 200 : 25 000 lignes en 125 requêtes au lieu de 500, plafond et chiffres inchangés. En pagination serveur, un `page-size` supérieur à 200 est désormais ramené à 200 avec un avertissement unique en console, au lieu de provoquer une erreur 400 sans en-tête CORS, illisible dans le navigateur.
