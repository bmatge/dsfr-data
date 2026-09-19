---
'dsfr-data': patch
---

**Avec `databox`, `reference-lines` et `targets` sont de nouveau visibles (#903).** Les overlays étaient bien construits, aux bonnes dimensions, sans un message — et peints SOUS la carte de la DataBox. Sous `databox`, DSFR Chart téléporte le canvas dans `div.fr-card.databox` (`position: relative`, `z-index: 500`, fond blanc opaque) tandis que les SVG restaient à côté de `data-box`, dans `.dsfr-data-chart__databox-wrapper` : deux positionnés du même contexte d'empilement, celui à 500 gagne. `elementFromPoint` au milieu de la ligne de référence renvoyait le canvas. Même famille que #813 (`color-map` recolorait le graphique mais pas sa légende) : la DataBox déplace le canvas, et ce qui vise le canvas doit le suivre.

Les overlays sont désormais posés dans le **premier ancêtre positionné du canvas** — la carte quand il y a une DataBox, le wrapper sinon —, donc dans son contexte d'empilement, donc peints après lui. Plutôt qu'une course au `z-index` : un overlay à 501 passerait aussi au-dessus de la modale et du plein écran de la DataBox, qui vivent dans la carte. Sans `databox`, rien ne change.
