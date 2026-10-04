---
'dsfr-data': patch
---

Studio IA et volet Diagnostic : un code département, un code postal ou un libellé terminé par un nombre n'est plus annoncé comme une date (#1224).

Le type d'un champ était lu sur une seule valeur, par `Date.parse` — qui, sous V8, lit « 75 », « 01004 » et « Zone 12 » comme des dates. Le modèle du Studio recevait donc un champ géographique présenté comme temporel, ce qui l'orientait vers une courbe au lieu d'une carte ou d'un classement.

Un champ est désormais une date quand **toutes** ses valeurs renseignées, sur les 100 premières lignes, ont la forme ISO (`AAAA-MM-JJ`, heure facultative) : c'est la forme que le reste de la bibliothèque traite en date (minimum et maximum d'une agrégation, pivot), reconnue par la même fonction. Une année seule écrite en chaîne (« 2024 ») et une date française (« 03/01/2024 », « 4 décembre 1837 ») sont du texte ; un nombre reste numérique.
