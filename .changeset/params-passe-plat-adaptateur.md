---
"dsfr-data": minor
---

L'attribut `params` de `<dsfr-data-source>` vit désormais en mode adaptateur : ses paires sont ajoutées à l'URL construite par l'adaptateur Opendatasoft, en chargement paginé comme en `fetch-mode="export"` et en `server-side`. Une page qui a besoin de `params='{"timezone":"Europe/Paris"}'` peut donc quitter le mode URL. Les clés que la bibliothèque construit elle-même (`select`, `where`, `group_by`, `order_by`, `limit`, `offset`, `facet`) sont réservées : elles sont refusées avec une erreur de configuration au lieu d'écraser une clause en silence (#726).
