---
"dsfr-data": minor
---

`dsfr-data-map` : quand la carte porte un encart ultramarin (`insets="drom"`…) sans `max-bounds`, `fit-bounds` se cale par défaut sur la métropole (`41,-5.5,51.5,10`) — les DROM ne dézooment plus la vue, le déplacement reste libre. Nouvel attribut `fit-zone="latSW,lonSW,latNE,lonNE"` pour surcharger la zone de fit (`none` la désactive) (#687).
