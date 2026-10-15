---
'dsfr-data': patch
---

Grist : une comparaison d'ordre (`gt`, `gte`, `lt`, `lte`) confiée au serveur rend enfin les lignes du navigateur sur une colonne Text à cases vides (#1321). Une case vide y vaut `''`, que SQLite range avant tout texte : `champ:lt:B` la retenait (21 lignes au lieu de 8, mesuré sur grist.numerique.gouv.fr), alors que le navigateur écarte une valeur vide de toute comparaison. La clause part désormais en `(champ != '' AND champ < ?)`, mesurée identique au navigateur ; elle reste confiée à Grist, `server-side` et regroupement compris. Colonnes Numeric (vide = `null`) et Ref (vide = `0`) : inchangées, elles rendaient déjà le même chiffre.
