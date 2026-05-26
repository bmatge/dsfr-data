---
'dsfr-data': patch
---

build(docker): propage `VITE_PROXY_URL` et `VITE_LIB_URL` au build Docker via `ARG`/`ENV` (Dockerfile + Dockerfile.db) et `build.args` (docker-compose.yml + docker-compose.db.yml).

Avant : ces variables étaient documentées dans `.env.example` mais n'arrivaient jamais jusqu'au build Vite à l'intérieur du conteneur. Pire, l'accès via indirection (`const _meta = import.meta as any; _meta.env?.VITE_PROXY_URL`) dans `packages/shared/src/api/proxy-config.ts` empêchait Vite de faire la substitution statique même en build local — les bundles retombaient systématiquement sur le fallback `https://chartsbuilder.matge.com`.

Maintenant : `import.meta.env.VITE_PROXY_URL` est accédé directement (déclaration de type globale locale, sans coupler `@dsfr-data/shared` à Vite). Un `.env` avec `VITE_PROXY_URL=https://exemple.fr` produit un bundle où le domaine de référence est remplacé. Si la variable est absente, le fallback historique est préservé (la transformation en fail-fast est planifiée pour une future PR de l'epic #168).

Premier pas concret de l'epic #168 — rendre dsfr-data self-hostable (PR-1 du plan de découpage).
