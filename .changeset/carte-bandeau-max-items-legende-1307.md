---
'dsfr-data': patch
---

**Carte : le bandeau « N affichés sur M » reste sur la carte quand une légende est posée dessous (#1307).**

Le bandeau d'une couche tronquée (`max-items`) était ancré à 10 px du bas de l'hôte de la carte. Une légende (ou des encarts) posée sous la carte allonge l'hôte : le bandeau se posait sur la légende, hors de la carte. La ligne d'état de panne avait le même défaut, corrigé en 0.50.0 (#1288) ; le bandeau ne l'était pas.

`dsfr-data-map` place désormais tout le mobilier du bas de carte d'une seule mesure (`placeOverlays()`) : les bandeaux des couches au bas du volet Leaflet, empilés, puis la ligne d'état au-dessus d'eux. La mesure est rejouée quand la légende apparaît ou change de hauteur, et quand un bandeau part. Mesuré dans un navigateur à 1280 et à 375 px (`e2e/map-bandeau-max-items.spec.ts`, job `e2e-layout`).

Ce qui change pour une page existante : sur une carte avec légende ou encarts dessous, le bandeau remonte dans la carte. Sans légende, rien ne bouge.
