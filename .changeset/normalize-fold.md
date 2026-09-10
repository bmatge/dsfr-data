---
"dsfr-data": minor
---

`dsfr-data-normalize` : nouvel attribut `fold="motif_*:cible"` qui replie des colonnes booléennes parallèles (une colonne Oui/Non par modalité : `handicap_moteur`, `handicap_visuel`…) en un seul champ tableau contenant les noms des colonnes vraies (Oui/Non, 1/0, true/false, X/vide), filtrable par une seule facette ; `fold-drop` retire les colonnes d'origine. Le repli s'exécute après `rename`, dont les libellés servent d'étiquettes. Nouvel utilitaire partagé `toBoolean` (#677).
