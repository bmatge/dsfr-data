---
'dsfr-data': patch
---

Studio IA : corrige les trois écarts de la mesure de base du banc de pertinence (#1123).
`inspect_data` signale désormais les colonnes numériques constantes pour chaque valeur d'une
colonne entité (« Nombre total d'actions est constant pour chaque Ville »), calcul borné et
déterministe, et la consigne du prompt s'appuie sur ce signal ; un bloc `datalist` n'exige plus
`valueField` (schéma des outils, validation et vocabulaire alignés, `valueField` requis seulement
pour trier ou agréger un tableau) ; une réponse finale écrite en JSON (`{"message": …}`, l'argument
de `finish`) est lue comme un `finish` et l'usager n'en voit que le message.
