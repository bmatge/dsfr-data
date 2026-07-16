---
'dsfr-data': minor
---

Nouveaux types de cartes `map-aca` (académies, clés = noms en majuscules) et `map-monde` (mondiale, clés ISO 3166-1 — les codes alpha-3 et numériques sont convertis automatiquement en alpha-2 via `toIsoA2`) sur `dsfr-data-chart`, apportés par l'API cartes unifiée `<map-chart level>` de DSFR Chart 2.1. `dsfr-data-world-map` est déprécié au profit de `type="map-monde"` (warn console ; retrait prévu à la prochaine version majeure, #402).
