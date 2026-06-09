---
'dsfr-data': minor
---

Proxy CORS injectable au runtime et défaut souverain (#319) : plus aucun domaine personnel codé en dur dans les bundles. Sans configuration, les composants sont en mode `direct` (les URLs externes sont fetchées telles quelles). Le site déployeur peut fournir son proxy via `window.DSFR_DATA_PROXY` (string, objet `{ baseUrl, endpoints }`, ou `false`). `isViteDevMode()` ne se déclenche plus que dans le dev de ce repo (`import.meta.env.DEV`) — un intégrateur tiers en dev local n'est plus traité comme notre dev server. Nouvelle frontière lib/app : `packages/core` n'importe plus que `@dsfr-data/shared/lib` (règle ESLint), les modules app-side (auth, storage, ui) restent hors de la surface lib.
