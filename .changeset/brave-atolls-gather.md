---
'dsfr-data': minor
---

Nouveau composant `dsfr-data-map-inset` : encarts territoriaux (DROM, COM, Corse...) pour `dsfr-data-map`. Chaque encart rend une mini-carte verrouillée qui réutilise automatiquement les couches ET le popup de la carte hôte — un clic dans l'encart ouvre le volet/la modale de la carte principale (template unique). 12 territoires prédéfinis (`territory="guadeloupe"`, `"nouvelle-caledonie"`...) surchargeables par `center`/`zoom`/`label`, et raccourci `insets="drom"` / `insets="drom,corse"` sur `dsfr-data-map` qui génère les encarts.

`dsfr-data-map` : nouvel attribut `locked` (carte sans aucune interaction — encarts, vignettes). La hauteur fixe s'applique désormais au conteneur Leaflet plutôt qu'au host (le host s'étend pour accueillir les compagnons hors-carte) et le panel de `dsfr-data-map-popup` s'ancre sur ce conteneur — rendu identique pour les pages existantes.
