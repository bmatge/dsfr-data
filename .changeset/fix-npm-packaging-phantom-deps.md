---
'dsfr-data': patch
---

Packaging npm réparé (#318) : `npm install dsfr-data` échouait en E404 car `@dsfr-data/shared` (package privé, déjà bundlé dans `dist/`) était déclaré en dépendance runtime. Toutes les dépendances passent en `devDependencies` (les bundles sont autonomes, aucun import nu). Les chunks Leaflet (`leaflet-src-*.js`, `leaflet.markercluster-src-*.js`, `leaflet-heat-*.js`) sont désormais publiés — ils étaient absents du tarball alors que les bundles map et tout-en-un les importent dynamiquement. Champ `sideEffects` déclaré sur `dsfr-data` et `@dsfr-data/shared` pour un tree-shaking correct.
