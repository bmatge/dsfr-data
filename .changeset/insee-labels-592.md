---
'dsfr-data': minor
---

Libelles INSEE Melodi resolus automatiquement (#592, volet B) : les jeux Melodi
arrivaient en codes SDMX bruts (`AGE: "Y65T74"`, `GEO: "2025-DEP-01"`, `SEX: "M"`),
inexploitables comme etiquettes d'axe. Les libelles officiels sont desormais charges
depuis `/melodi/range/{idDataset}` et appliques aux valeurs — « De 65 a 74 ans »,
« Ain », « Homme » — par les **deux** chemins d'import (composant et connexion API),
qui produisent donc les memes colonnes. Le code d'origine est conserve dans une colonne
`<DIMENSION>_CODE` pour les filtres, jointures et URL partagees, qui veulent une valeur
stable. Les noms de colonnes restent les codes de dimension : ce sont des identifiants
references par les configurations de graphiques enregistrees. Un appel par jeu, mis en
cache en memoire ; libelles indisponibles = codes conserves, jamais d'erreur bloquante.
