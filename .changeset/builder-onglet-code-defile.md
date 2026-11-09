---
'dsfr-data': patch
---

Builder : les onglets Code et Données défilent à nouveau. En mode `fullscreen`, la colonne de droite gardait `align-self: flex-start` hérité du mode page tout en perdant sa `max-height` : elle prenait la hauteur de son contenu et le `body` en `overflow: hidden` coupait le code généré au-delà de la fenêtre. La colonne est désormais étirée à la hauteur du conteneur (`align-self: stretch`), et le panneau de l'onglet défile chez lui.
