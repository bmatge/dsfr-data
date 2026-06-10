---
'dsfr-data': patch
---

`dsfr-data-map` : init unique et jamais posthume (#298) — un verrou empêche deux initialisations concurrentes (reconnexion DOM d'un dashboard qui réordonne les widgets, ou IntersectionObserver pendant l'`await loadLeaflet()` en vol : double skip-link, deux instances `L.map`), et un élément déconnecté pendant l'await abandonne son init au lieu de créer une carte sur un élément détaché jamais `remove()` (fuite du listener resize window posé par Leaflet). Ids ARIA par compteur (deux cartes créées dans la même milliseconde partageaient le même id `Date.now()`).
