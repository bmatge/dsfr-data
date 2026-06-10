---
'dsfr-data': patch
---

`dsfr-data-map-layer` : fini les marqueurs dupliqués quand deux rendus se chevauchent (#295) — `_renderLayer` async était appelé sans await depuis `onSourceData`, `setTimelineFrame` et le fallback bbox ; deux appels concurrents pendant le `await import(...)` (cluster/heatmap) franchissaient chacun `clearLayers()` puis ajoutaient chacun tous les items. Un jeton de génération abandonne le rendu obsolète après chaque await. `setTimelineFrame` passe désormais les items de la frame en paramètre au lieu d'échanger temporairement `this._data` autour d'un appel non awaité (ça ne tenait que parce que la lecture était dans la portion synchrone).
