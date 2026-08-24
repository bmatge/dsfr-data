---
'dsfr-data': minor
---

`dsfr-data-facets` : support des champs multi-valeurs (tableaux / ChoiceList
Grist) en filtrage client (#421). Une cellule tableau est désormais traitée
par intersection avec la sélection (au lieu d'être stringifiée « a,b » et de
ne jamais matcher), chaque élément compte dans son groupe de facettes (y
compris les comptes croisés), et l'auto-détection retient les champs tableaux
de chaînes.
