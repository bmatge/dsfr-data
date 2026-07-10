---
'dsfr-data': minor
---

`dsfr-data-chart` : cibles / objectifs futurs sur les courbes (`targets`, #377).
Trois nouveaux attributs pour les types `line` et `bar-line` : `targets` (JSON —
échéance, valeur, série, libellé, couleur), `targets-zone` (bande future grisée +
frontière réalisé/projeté, `"off"` pour désactiver) et `targets-legend` (légende
« Données historiques / Trajectoire, cible extrapolée », masquable ou
personnalisable). L'axe X est étendu automatiquement quand l'échéance dépasse
les données (séries paddées à `null` : trait plein jusqu'au dernier point réel,
trajectoire pointillée vers un losange à l'échéance), les bornes Y s'élargissent
si nécessaire, un tooltip DSFR groupé par échéance s'affiche au survol des
losanges et les cibles sont annoncées dans l'aria-label. Le pipeline d'overlay
de `reference-lines` (#341) est généralisé (un seul rAF/ResizeObserver/cleanup
pour les deux familles) sans modifier `chart-reference-lines.ts`.
