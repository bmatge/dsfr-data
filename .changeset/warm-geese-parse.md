---
'dsfr-data': minor
---

`dsfr-data-map-layer` : `geo-field` accepte désormais les géométries GeoJSON sérialisées en chaîne (colonnes Text Grist, CSV/Tabular) — parse JSON mémoïsé appliqué à la résolution de géométrie (geoshape, coordonnées Point, filtrage bbox client et auto-détection `geo_shape`/`geometry`) (#426).

`dsfr-data-map-popup` : les templates supportent les mêmes expressions que `dsfr-data-display` — `{{champ:number}}` (format fr-FR), `{{champ|défaut}}`, chemins imbriqués — via un résolveur partagé ; les valeurs restent systématiquement échappées.
