---
'dsfr-data': patch
---

Graphique, tableau équivalent et podium : retours du banc d'essai (#1230).

- **`color-map` recolore aussi les points** — résout le constat BUG-033 du banc d'essai. Sur une courbe, `color-map` changeait la couleur du trait et de la légende, et laissait les points à la palette par défaut. Deux causes, corrigées ensemble : les couleurs de point (`pointBackgroundColor`, `pointBorderColor` et leurs variantes de survol) n'étaient pas posées, et le redessin en mode direct de Chart.js laissait en place les options que les points d'une même série partagent. Le correctif vaut pour les quatre types qui dessinent des points : `line`, `radar`, `scatter` et la courbe d'un `bar-line` — dont les **barres**, pour la même raison, restaient elles aussi à la palette. Sur un `radar`, l'aire d'une série recolorée garde désormais sa transparence au lieu de devenir opaque et de masquer les autres séries (couleurs écrites en hexadécimal).
