---
'dsfr-data': minor
---

Proxy CORS déclaratif par source via le nouvel attribut `proxy-url` sur
`dsfr-data-source` (#340).

- Nouvel attribut **`proxy-url`** : domaine du proxy CORS pour CETTE source,
  prioritaire sur `window.DSFR_DATA_PROXY` et la config build-time (le plus
  spécifique gagne). Sert à la fois la réécriture d'hôte connu (Grist
  gouv/SaaS, Tabular, INSEE) et le `use-proxy` générique. Vide = résolution
  proxy globale habituelle (rétrocompatible). Ex : `proxy-url="https://mon-proxy.fr"`.
- L'override est threadé jusqu'aux adapters (ODS, Grist, Tabular, INSEE) et aux
  facettes serveur ; `getProxyConfig()`, `getProxiedUrl()`,
  `buildProxiedRequest()`, `buildCorsProxyRequest()` et `getProxyUrl()`
  acceptent désormais un override optionnel (paramètres rétrocompatibles).
- Beacon : nouvel override runtime `window.DSFR_DATA_BEACON_URL` (string),
  prioritaire sur l'URL bakée au build et résolu à l'appel — un site hôte peut
  rediriger la collecte de télémétrie vers son propre domaine sans rebuild.
- La résolution proxy build-time (`VITE_PROXY_URL_EMBED`) est marquée
  `@deprecated` (conservée en fallback temporaire) au profit de `proxy-url` +
  `window.DSFR_DATA_PROXY`.
- Clarification : `use-proxy` n'a d'effet que si une base de proxy est
  configurée (`proxy-url`, `window.DSFR_DATA_PROXY` ou build) — no-op en embed
  nu sur un site tiers.
