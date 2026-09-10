---
"dsfr-data": minor
---

`dsfr-data-facets` : nouvel attribut `weight-field` — le compteur d'une facette affiche la somme d'un champ numérique au lieu du nombre de lignes (`weight-field="effectif"` annonce des effectifs, pas des relevés), et le tri `count` porte sur cette somme. L'attribut est client uniquement : en mode `server-facets`, où la somme n'existe pas dans la réponse `/facets`, les compteurs sont masqués et le composant le dit (erreur de configuration et avertissement DSFR) plutôt que d'afficher un nombre de lignes sous un libellé de somme (#739).
