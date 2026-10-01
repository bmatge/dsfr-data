---
'dsfr-data': patch
---

Tableau de bord exporté : deux favoris du Builder dans un même tableau de bord ne partagent plus leurs identifiants. Les ids du code d'un favori (`chart-src`, `query-data`, `chart`…) et les attributs qui les désignent (`source`, `for`, `left`/`right`, `sources`, `context`, ARIA, sélecteurs de script) reçoivent le suffixe du widget : le second graphique s'abonnait à la requête du premier et se rendait vide (#1161).

Détection d'une URL INSEE Melodi : les filtres de dimension de la chaîne de requête (`GEO`, `TIME_PERIOD`…) sont conservés, seule la pagination est retirée — la connexion visait le jeu entier (#1163).
