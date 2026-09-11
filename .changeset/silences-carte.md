---
'dsfr-data': minor
---

feat(map) : trois silences de la carte deviennent des signaux, et les cercles savent faire une choroplèthe

- **`fill-field` sur une couche de cercles** (#768). `fill-field`, `classes`, `method`, `breaks` et
  `selected-palette` étaient ignorés sans un mot sur `type="circle"` : les cercles restaient de la
  couleur de couche. Ils sont désormais colorés par classes, et la légende de couche décrit ces
  classes. Posé avec `color-field`, `fill-field` donne le remplissage et `color-field` le contour,
  comme sur une couche `geoshape`.
- **Une couche dont tous les points sont confondus** (#770). Une colonne de géolocalisation
  constante ou mal jointe donnait 43 479 coordonnées valides identiques : rien n'était ignoré, la
  couche se déclarait complète et la carte montrait un point. Au plus deux positions distinctes
  pour au moins dix points par position, la couche le signale en console et dans le volet
  Diagnostic (`getStackedPositions()`). Le seuil laisse passer les adresses partagées.
- **Une légende dont le `for` désigne autre chose qu'une couche** (#771). Le `for` de
  `dsfr-data-a11y` désigne la carte, celui de la légende la couche : la confusion rendait une
  légende masquée, sans message. Un avertissement nomme l'élément trouvé et les couches disponibles.
  Le repli par `source` reste inchangé.

Résout les constats AM-066, AM-069 et PG-024 du banc d'essai (#768, #770, #771).
