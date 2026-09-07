---
'dsfr-data': patch
---

Tabular : les attributs `use-proxy` et `proxy-url` sont de nouveau pris en compte.

L'adapter arbitrait le proxy dans sa résolution de base URL, qui rendait `base-url` en priorité et
court-circuitait toute réécriture. Le Builder émettant toujours un `base-url`, le proxy était en
pratique systématiquement ignoré sur ce provider — sans le moindre avertissement.

L'URL cible est désormais construite puis passée à `getProxiedUrl` au moment du fetch, comme dans les
adapters Grist, INSEE et OpenDataSoft.

Changement de routage à connaître : un widget Tabular déployé avec un proxy configuré
(`proxy-url`, `window.DSFR_DATA_PROXY` ou `VITE_PROXY_URL`) passe maintenant réellement par ce proxy,
là où il appelait l'API en direct. Les instances self-hosted déclarées via `base-url` sur un autre
hôte que `tabular-api.data.gouv.fr` restent en appel direct, inchangées.
