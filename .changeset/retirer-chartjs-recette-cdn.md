---
"dsfr-data": patch
---

Retrait de Chart.js de la recette CDN (#656) : `@gouvfr/dsfr-chart` l'embarque déjà dans `DSFRChart.js`, le script séparé (~200 Ko par page) ne servait à rien. `CDN_URLS.chartJs` disparaît du package partagé ; le template d'aperçu, le guide IA, les générateurs de code et les pages des apps ne l'injectent plus.
