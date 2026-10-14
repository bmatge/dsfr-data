---
'dsfr-data': patch
---

**Pagination serveur : la pagination reste en place et garde le focus pendant le chargement d'une page (#1305).**

En pagination serveur (`dsfr-data-list`, `dsfr-data-display`), un changement de page remplaçait tout le corps du composant par le sablier, pagination comprise. Le bouton cliqué quittait la page et le focus clavier était perdu à chaque page : un usager au clavier ou au lecteur d'écran devait revenir en haut du composant pour passer à la page suivante.

Pendant le chargement d'une page demandée par la pagination, seules les lignes (ou les fiches) cèdent la place à « Chargement de la page 4… ». Le compte de résultats et la pagination restent, à la même hauteur ; le bouton cliqué garde le focus, et Entrée de nouveau affiche la page d'après. La page demandée est annoncée par la région live que l'afficheur avait déjà (« Page 4 sur 10 »). Même comportement avec `url-sync`. Une page refusée garde son rendu de #1288 (« La page 4 n'a pas pu être chargée. Vous consultez toujours la page 3. »), et un relevé `stale-if-error` le sien.

Ce qui change pour une page existante : le sablier d'un changement de page se pose sur les lignes au lieu de remplacer tout le bloc. Le premier chargement, un rafraîchissement, un tri ou un filtre gardent le sablier seul, comme avant. Le tableau de la liste est désormais enveloppé dans un `div.dsfr-data-list__rows` (et la grille des fiches dans `div.dsfr-data-display__rows`).
