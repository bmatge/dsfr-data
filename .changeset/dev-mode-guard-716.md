---
"dsfr-data": patch
---

Les bundles publiés ne se croient plus sur le serveur de développement du dépôt : la garde
`import.meta.env.DEV` d'`isViteDevMode()` était pliée à la compilation, si bien qu'une page servie
sur `http://localhost:<port>` chez un intégrateur voyait ses appels Tabular, Grist et INSEE réécrits
vers des chemins `/…-proxy/` relatifs qui n'existent pas chez lui. Les appels partent désormais en
direct. Pour servir volontairement un bundle construit derrière ses propres routes de proxy, poser
`window.DSFR_DATA_PROXY = { baseUrl: '' }` avant le chargement de la bibliothèque (#716).
