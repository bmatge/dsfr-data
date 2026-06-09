---
'dsfr-data': patch
---

Sécurité export/import localStorage (#316) : l'export JSON ne contient plus aucun secret — `apiKey` retiré des **sources** (tokens Grist) comme des connexions, et en-têtes sensibles (`Authorization`, `Apikey`, `X-API-Key`, cookies…) expurgés des deux. À l'import, validation structurelle renforcée : clés dangereuses (`__proto__`, `constructor`, `prototype`) retirées récursivement (anti prototype-pollution), champs optionnels typés (un champ au mauvais type est retiré), taille du `code` des favoris bornée.
