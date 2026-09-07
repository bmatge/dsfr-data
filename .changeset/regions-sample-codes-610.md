---
'dsfr-data': patch
---

Le jeu d'exemple « Regions de France » porte desormais des codes REGION
INSEE (`code_region`) au lieu du departement chef-lieu de chaque region
(#610). Un jeu regional decrit par des codes departementaux etait incoherent,
et une carte departementale n'en aurait colorie que 13 departements isoles.
