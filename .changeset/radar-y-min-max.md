---
'dsfr-data': minor
---

`<dsfr-data-chart type="radar">` : support des attributs `y-min` / `y-max` pour borner l'échelle radiale (issue maturity-model#9). Sans borne, `scales.r` de Chart.js s'auto-ajuste au min/max des données — le minimum se retrouve au centre du radar, ce qui est trompeur. Les bornes sont relayées à l'API upstream `scale-min`/`scale-max` de `<radar-chart>` (suggestedMin/Max, baseline déclarative), puis affinées post-montage sur l'instance Chart.js : bornes dures `scales.r.min`/`max`, et `ticks.stepSize: 1` (anneaux de grille entiers) quand les deux bornes sont entières avec une amplitude de 1 à 10. Comportement inchangé sans `y-min`/`y-max` et pour les autres types.
