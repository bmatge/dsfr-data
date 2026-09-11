---
'dsfr-data': patch
---

fix(map-popup) : le volet latéral ne déborde plus de la carte sur écran étroit

La largeur demandée par l'attribut `width` était appliquée telle quelle, sans borne. Or le volet
est ancré à droite dans le conteneur de la carte, qui est en `overflow: hidden` : une largeur
supérieure à celle de la carte ne débordait pas vers la droite, elle sortait par la **gauche** et
se faisait rogner — les débuts de lignes disparaissaient (titre, libellés, valeurs), sans même que
la page défile horizontalement pour le signaler.

C'était le cas nominal sur téléphone : à 393 px de viewport, gouttières DSFR comprises, la carte
fait 361 px, quand les exemples de la documentation proposent `width="400px"` (specs) et
`width="380px"` (guide builder-IA) — soit 39 px et 19 px rognés.

La largeur est désormais bornée à celle de la carte (`max-width: 100%` sur le volet) : sur un
écran étroit le panneau l'occupe entièrement au lieu d'être coupé, et `width` continue de faire
foi tant qu'elle tient dans la carte. Le mode `modal` était déjà responsive (`90vw`, plafonné à
640 px) ; le mode `panel-*` était le seul à ne pas l'être.
