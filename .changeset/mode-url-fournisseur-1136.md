---
'dsfr-data': patch
---

Mode URL de `dsfr-data-source` : le fournisseur est détecté une seule fois depuis l'URL (#1136), et l'aplatissement des enregistrements imbriqués suit la stratégie déclarée par sa `ProviderConfig` (`flattenProviderRecords`), la même que le chemin connexion — `flattenGristEnvelope`, qui reconnaissait l'enveloppe Grist à sa forme, est supprimé. La convention de l'attribut `paginate` (`page`/`page_size`, `data` et `meta.{page,page_size,total}`) est déclarée dans `GENERIC_CONFIG.pagination` au lieu d'être codée dans le composant. Changements visibles : une URL Grist (`/api/docs/…/tables/…`) est reconnue à son chemin, donc aussi derrière un proxy, et livre toujours ses colonnes sans l'`id` technique de Grist ; une URL Melodi (`melodi/data/…`) livre ses observations à plat (`GEO`, `OBS_VALUE`…), comme `api-type="insee"` ; une réponse d'une autre URL dont les lignes seraient `{ id, fields }` n'est plus dépliée.
