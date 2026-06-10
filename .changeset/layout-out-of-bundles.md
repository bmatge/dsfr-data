---
'dsfr-data': patch
---

Le chrome applicatif sort de la lib npm publiée (#306). `components/layout/` (auth-modal, password-change-modal, share-dialog avec leurs fetch `/api/auth`/`/api/shares`, app-header branché sur les services d'auth) vivait dans `packages/core` et était exporté par les entries → le bundle publié contenait 16× `/api/auth` et la modale de connexion complète. Il déménage dans le package workspace **privé** `@dsfr-data/app-ui` (bundle séparé `app-ui.esm.js` chargé par les apps, le hub et le guide — jamais publié sur npm). Les exports publics `AppHeader`/`AppFooter`/`AppLayoutBuilder`/`AppLayoutDemo` sont retirés des entries. Vérifié : zéro `/api/auth`, `auth-modal` ou `/api/shares` dans `dsfr-data.esm.js` et `dsfr-data.core.esm.js` reconstruits ; `npm pack` ne contient aucun code d'auth. L'incohérence d'exports (6 composants dans layout/index.ts, 4 réexportés) disparaît avec les exports.
