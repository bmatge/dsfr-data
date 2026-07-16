---
'dsfr-data': patch
---

Alignement DSFR Chart 2.1.x (correctifs) : la DataBox pose désormais `name` (renommage upstream de `title` en 2.1.0 — les titres de DataBox étaient invisibles en preview/prod) tout en conservant `title` pour les hôtes 2.0.x ; les types `map` et `map-reg` routent vers `<map-chart level="dep|reg">` (API cartes unifiée), ce qui corrige la limitation connue de la carte régionale nationale (`<map-chart-reg>` sans `region`).
