---
'dsfr-data': patch
---

Mode SQL Grist durci (#287) : le WHERE n'est plus fusionné en double (`effectiveWhere` de la source contient déjà le where statique — le re-merger produisait `WHERE X AND X` avec args doublés) ; les identifiants vides sont gardés (`group-by="region,"` ou une clause where sans champ ne jettent plus `Empty SQL identifier`) ; le cache de disponibilité SQL passe du hostname (permanent) à l'endpoint **host + document** avec **TTL** (2 min en échec, 30 min en succès) — un 403 ponctuel sur un document ne condamne plus tous les documents du host, définitivement. La sonde (timeout 2 s) est liée au signal du composant, et un abort du composant n'empoisonne plus le cache.
