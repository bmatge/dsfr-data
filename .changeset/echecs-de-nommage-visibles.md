---
"dsfr-data": minor
---

Les échecs de nommage se voient. Un attribut qui désigne un champ absent des données (`label-field`, `value-field`, `geo-field`, `fill-field`, le `value` d'un KPI, les clés d'un `on` de jointure…) est désormais nommé dans la trace et dans le volet Diagnostic, avec la liste des champs qui existent — et « présent mais vide » est distingué d'« absent du schéma ». Un chemin imbriqué (`fields.nom`) ne déclenche aucun faux positif. En parallèle, un attribut inconnu de la version de la bibliothèque réellement chargée n'est plus ignoré en silence : il est marqué sur la balise, remonté dans le volet, et signalé une fois en console en développement (#727).
