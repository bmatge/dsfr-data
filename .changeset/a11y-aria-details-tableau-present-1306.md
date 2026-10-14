---
'dsfr-data': patch
---

**`dsfr-data-a11y` : `aria-details` ne désigne plus un tableau absent (#1306).**

Le composant posait `aria-details` sur sa cible (graphique, carte) vers son tableau équivalent dès le branchement, alors que ce tableau n'est pas dans la page pendant le premier chargement ni pendant une panne de source (#1288). Un lecteur d'écran recevait une référence vers un identifiant qui n'existait pas.

`aria-details` est désormais posé quand le tableau est affiché, retiré pendant le chargement et la panne, remis au retour des données. Pendant un dernier relevé `stale-if-error`, le tableau gardé reste désigné ; à l'échéance du relevé, la référence part avec lui. Un `aria-details` posé par l'intégrateur vers un autre élément n'est jamais retiré.

Ce qui change pour une page existante : la cible ne porte `aria-details` qu'une fois les données arrivées. Rien d'autre.
