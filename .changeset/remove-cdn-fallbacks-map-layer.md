---
'dsfr-data': patch
---

Suppression des fallbacks CDN jsdelivr injectés au runtime par `dsfr-data-map-layer` pour leaflet.markercluster et leaflet.heat (#292). Les plugins sont chargés exclusivement via les chunks `import()` du build (publiés sur npm depuis #318), et leurs symboles résolus sur `window.L` ou sur l'export du module Leaflet bundlé. Compatible CSP `script-src` strict et cohérent avec `sovereign-only`. Un test-garde interdit toute URL CDN dans `packages/core/src/`.
