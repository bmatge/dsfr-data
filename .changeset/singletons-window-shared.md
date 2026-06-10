---
'dsfr-data': patch
---

Singletons auth/sync partagés via `window` (#320) : les apps chargent les composants par bundles pré-compilés (`dsfr-data.esm.js`, `app-ui.esm.js`) ET importent `@dsfr-data/shared` aliasé sur `src` — deux copies compilées d'`auth-service` et `sync-queue` coexistaient à l'exécution : double `checkAuth` au démarrage, caches CSRF séparés, **indicateur de sync du header aveugle** (il écoutait la copie bundle quand les syncs réels passaient par la copie app), et `persistQueue()` d'une copie pouvait **écraser la file de l'autre** sous la même clé localStorage (perte d'écritures). L'état mutable des deux modules vit désormais dans un objet partagé `window.__dsfrDataAuthShared`/`__dsfrDataSyncShared` (même pattern que le data-bridge) : une seule vérité quelle que soit la copie.
