---
"dsfr-data": patch
---

URL de synchronisation (`url-sync` de `dsfr-data-context`, `dsfr-data-facets`, `dsfr-data-search`) construite avec l'API `URL` : sur une page servie sous `//chemin`, `replaceState` levait `SecurityError` et la synchro d'URL cessait en silence (#683).
