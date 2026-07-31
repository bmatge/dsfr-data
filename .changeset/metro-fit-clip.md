---
'dsfr-data': patch
---

`dsfr-data-map` : combiné à `max-bounds`, `fit-bounds` clippe désormais l'emprise des données à la zone d'intérêt avant d'ajuster la vue — un jeu incluant des territoires lointains (DROM) ne dézoome plus la carte au monde entier, et des données filtrées entièrement hors zone laissent la vue en place (les encarts s'en chargent). `dsfr-data-map-layer` libère ses bounds quand un filtre amont le vide (l'ancienne emprise ne fausse plus les ajustements suivants). Résultat : `fit-bounds max-bounds="…"` + `dsfr-data-facets` = zoom automatique sur la région sélectionnée.
