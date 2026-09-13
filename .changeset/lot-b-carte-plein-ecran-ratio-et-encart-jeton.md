---
'dsfr-data': patch
---

Carte : le plein écran tient face au redimensionnement, et un encart accepte un seul point de rupture.

- `dsfr-data-map` : avec `height="60%"` (l'exemple du guide), le `ResizeObserver` reposait largeur × ratio dès l'entrée en plein écran, ce qui annulait le correctif de #825 (volet de 1152 px sur un écran de 1080, encarts hors cadre). En plein écran, chaque redimensionnement de l'hôte (entrée, rotation, changement d'écran) recalcule désormais « écran moins la rangée d'encarts » ; à la sortie, le ratio reprend la main sur la largeur courante. Complète la résolution du constat AM-061 du banc d'essai.
- `dsfr-data-map-inset` : `width="md:20%"` (un seul jeton, sans espace) partait en style inline invalide et l'encart restait à 10rem sans erreur, alors que la grammaire le documente comme valide. Tout texte portant un point de rupture est une échelle.
- Premier test Playwright de mise en page pour la carte (`e2e/map-fullscreen.spec.ts`) : volet et cinq encarts mesurés dans l'écran après l'entrée en plein écran, sortie par le bouton, largeur d'encart à 20 % de la carte. Les tests unitaires ne voient pas la mise en page ; ceux-ci ont été passés au vert par #822 puis #825.
