---
'dsfr-data': patch
---

`dsfr-data-map-popup` durci (#296) : le listener Escape posé sur `document` est retiré quel que soit le chemin de fermeture (bouton, overlay, Escape — il s'empilait pour toujours hors fermeture clavier) ; la suppression animée du panneau (200 ms) est annulée par une réouverture rapide (le panneau frais était supprimé avec son contenu) ; **l'exemple documenté fonctionne** — un popup enfant de la carte sans `for` matche toutes les couches (le layer exigeait un `for` truthy, contredisant `matchesLayer()` et la docstring) ; vrai focus trap dans la modale (Tab/Shift+Tab bouclent) et focus rendu au déclencheur à la fermeture (RGAA).
