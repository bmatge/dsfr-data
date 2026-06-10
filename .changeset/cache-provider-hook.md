---
'dsfr-data': patch
---

Le cache serveur sort de la lib (#307) : `dsfr-data-source` n'appelle plus `/api/cache` (logique du mode DB dans le composant central de la lib publiée) — le cache passe par un **hook** `window.DSFR_DATA_CACHE_PROVIDER = { get(key), put(key, data, ttl) }` enregistré par la page hôte. La **clé inclut un hash du fingerprint de la requête** (URL/params/where effectif/page/orderBy…) : l'ancienne clé réduite à l'id pouvait resservir la page 3 filtrée d'hier pour une requête page 1 sans filtre. Sans provider, `cache-ttl` est un no-op (embed anonyme) — sémantique documentée. Les apps du repo conservent le fallback offline : `registerServerCacheProvider()` (shared, app-side) est branché par `@dsfr-data/app-ui`. L'import app-side `isAuthenticated` disparaît de core (exception ESLint levée — la frontière #319 n'a plus aucune exception).
