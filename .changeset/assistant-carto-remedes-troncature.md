---
'dsfr-data': patch
---

Diagnostic de la Carte (#1021, lot 2) : quand la source d'une couche coupe le jeu (`meta.truncated`, cas ordinaire d'un gros jeu depuis que le builder aligne `limit` sur `max-items`), le nouveau constat `carte/jeu-tronque` remplace « données tronquées » et propose trois remèdes au choix, chacun avec son repère : composer par échelle (l'encart du panneau Couches), filtrer en amont, relever le plafond. Un constat peut désormais porter des `remedes` (`{ libelle, repere }`) ; le panneau de l'assistant les rend en boutons, un « Me montrer » par remède.
