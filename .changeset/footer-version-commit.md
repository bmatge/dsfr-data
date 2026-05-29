---
"dsfr-data": patch
---

feat(footer): affiche la version et le commit de build dans `<app-footer>`

Le footer affiche désormais une ligne discrète « Composants dsfr-data vX.Y.Z · <commit> » (le commit renvoie vers GitHub). Version et hash sont injectés au build de la lib (`scripts/build-lib.ts`, via `define` esbuild) ; le commit est dérivé de `git rev-parse` et surchargeable via `DSFR_DATA_COMMIT` pour les builds Docker sans `.git`.
