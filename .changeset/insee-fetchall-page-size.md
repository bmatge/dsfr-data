---
'dsfr-data': patch
---

`fetchAll` INSEE Melodi pagine enfin par pages de 1000 (#286) : il consommait `params.pageSize` (défaut 20 venant de la source) au lieu de la taille optimale du provider — plafond réel de 2000 records (au lieu des 100 000 documentés) et 50× plus de requêtes. 10 000 lignes = 10 requêtes désormais, comme ODS et Tabular qui ignorent correctement `pageSize` en fetchAll (il ne concerne que la pagination serveur). Plafonds de sécurité corrigés et documentés dans le tableau des capacités : ODS 1 000, Tabular 25 000 (le commentaire disait 50K à tort), Grist illimité (1 requête), INSEE 100 000.
