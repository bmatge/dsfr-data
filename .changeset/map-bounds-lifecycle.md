---
'dsfr-data': patch
---

`dsfr-data-map` : les bounds des layers sont stockés par layer avec remplacement à chaque rendu (#294) — l'ancien `push` cumulait les bounds historiques : croissance mémoire indéfinie (chaque refresh, frame de timeline ou pan en bbox client ajoutait une entrée) et fit-bounds incapable de rétrécir la vue quand les données diminuaient. La combinaison part désormais d'une copie (`extend` de Leaflet mute en place — la première entrée stockée était corrompue), et un layer retiré du DOM libère ses bounds.
