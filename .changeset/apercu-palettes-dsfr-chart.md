---
'dsfr-data': patch
---

L'aperçu des palettes du Builder (pastilles sous le sélecteur de palette) montre désormais les couleurs que DSFR Chart applique vraiment au graphique. Il affichait jusqu'ici des teintes qui ne correspondaient pas au rendu, notamment pour « Couleurs distinctes par catégorie » : dix couleurs contrastées annoncées, alors que le graphique en utilise huit, surtout bleues et violettes. Un test relit désormais le paquet `@gouvfr/dsfr-chart` installé et échoue si ses couleurs changent. Le podium et les cartes, qui dessinent eux-mêmes, gardent leur palette contrastée. Pour plus de contraste sur un graphique (courbes multiples notamment), fixer les couleurs par série avec `color-map`.
