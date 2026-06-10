---
'dsfr-data': patch
---

Le beacon ne référence plus d'API applicative (#308) : la branche `window.__gwDbMode` qui POSTait sur `/api/monitoring/beacon` avec `credentials: 'include'` (logique du mode DB dans l'utilitaire de la lib, nommage `__gw*` hérité de l'ancien nom du projet) est remplacée par le hook `window.DSFR_DATA_BEACON_TRANSPORT` — s'il retourne `true` le beacon est pris en charge, sinon (absent, false, exception) le **pixel opt-in reste le transport par défaut**. Les apps du repo branchent le transport API via `registerDbBeaconTransport()` (shared, app-side), enregistré par `@dsfr-data/app-ui`. Vérifié sur bundle : zéro `__gwDbMode`/`/api/monitoring`.
