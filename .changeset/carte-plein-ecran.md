---
'dsfr-data': minor
---

feat(map) : un bouton de plein écran pour la carte

Une carte dense se lit mal dans une colonne de page. `<dsfr-data-map fullscreen>` ajoute, à droite
des boutons de zoom, un bouton « Plein écran » : la carte, avec ses couches, sa légende, ses encarts
et son sélecteur de fond, occupe tout l'écran, et en revient par le même bouton ou la touche Échap.

C'est un vrai bouton, atteint au clavier avant la carte. Son état passe par `aria-pressed` et par
son libellé, et chaque bascule est annoncée aux lecteurs d'écran. La carte recalcule sa taille à
l'entrée comme à la sortie, sans bande de tuiles grises, et la page est notifiée par l'événement
`dsfr-data-map-fullscreen-change`. Le bouton n'apparaît pas quand le navigateur ne sait pas mettre
un élément en plein écran (Safari sur iPhone), ni avec `locked` ou `no-controls`.

La capture d'image de la carte reste hors périmètre : tuiles d'origines croisées, légende hors du
canevas.

Résout le volet plein écran du constat AM-061 du banc d'essai (#780).
