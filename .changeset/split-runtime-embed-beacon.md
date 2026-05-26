---
'dsfr-data': minor
---

build: séparation `PROXY_BASE_URL` (runtime app) / `PROXY_BASE_URL_EMBED` (code généré) / `BEACON_BASE_URL` (télémétrie) — closes #180.

Permet aux opérateurs self-hostés de découpler le domaine où l'app tourne (potentiellement interne / privé) du domaine inliné dans les widgets générés (qui doit être public et stable pour fonctionner sur des sites tiers). Et optionnellement un troisième domaine pour la collecte télémétrie.

**Cascade de fallback** (aucune régression sans changement explicite côté `.env`) :
```
BEACON_BASE_URL = VITE_BEACON_URL || PROXY_BASE_URL_EMBED || PROXY_BASE_URL
PROXY_BASE_URL_EMBED = VITE_PROXY_URL_EMBED || PROXY_BASE_URL
PROXY_BASE_URL = VITE_PROXY_URL || 'https://chartsbuilder.matge.com'
```

**Répartition par usage** :
- `PROXY_BASE_URL` (runtime) : `apps/grist-widgets`, `apps/monitoring`, `apps/sources`
- `PROXY_BASE_URL_EMBED` (embed) : code généré par `apps/builder`, `apps/builder-ia`, `apps/builder-carto` ET adapters de `packages/core` (via `getProxyConfig()` — les adapters tournent dans le bundle lib chargé sur des sites tiers)
- `BEACON_BASE_URL` (télémétrie) : URL bakée dans le bundle lib `packages/core/dist/dsfr-data.*.js`

**Validation empirique** : avec `VITE_PROXY_URL=https://app.test VITE_PROXY_URL_EMBED=https://cdn.test VITE_BEACON_URL=https://analytics.test`, les bundles produits respectent la séparation (vérifié par grep — `cdn.test` dans le code embed, `app.test` uniquement dans les apps runtime, `analytics.test` dans le bundle lib pour le beacon).

**Documentation** : nouveau Scénario D dans `docs/DEPLOYMENT.md` §"Configuration self-hosted" — "app interne + widgets publics" avec la cascade et un protocole de validation reproductible.

**Infra** : Dockerfiles + docker-compose propagent les 3 variables au build. Tests : 2946/2946 ✅.
