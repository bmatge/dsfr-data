---
"dsfr-data": minor
---

Nouvel attribut `fetch-mode` sur `dsfr-data-source` : `fetch-mode="export"` charge un jeu Opendatasoft en une seule requête via l'endpoint d'export du portail, avec les mêmes clauses `select` / `where` / `group-by` / `order-by`, au lieu de le paginer par pages de 100. Défaut inchangé (`records`), repli automatique sur le chargement paginé si le portail n'expose pas d'export, et attribut ignoré avec `server-side` (#689).
