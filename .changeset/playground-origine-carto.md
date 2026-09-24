---
'dsfr-data': patch
---

« Ouvrir dans le Playground » depuis la Carte ouvre bien le code de la carte : le Playground n'acceptait pas cette origine et s'ouvrait sur son contenu par défaut, sans un mot. Les origines acceptées forment une seule liste gardée par un test ; une origine inconnue est désormais signalée ; `builder-carto` rejoint les identifiants d'app partagés (`appHref`, `navigateTo`).
