---
'dsfr-data': patch
---

Deduplication du stockage local des sources (#592, volet A) : `SELECTED_SOURCE` ne
persiste plus que le **pointeur** vers la source (descripteur sans les lignes), au lieu
d'une seconde copie integrale des donnees deja presentes dans `SOURCES`. Un jeu de 2,7 Mo
consommait ainsi ~5,4 Mo d'un quota localStorage d'environ 5 Mo, et l'ecriture etait
refusee au-dela (toast « Espace de stockage plein », rendu visible par #586). Nouveaux
helpers partages `toSourcePointer()` / `resolveSelectedSource()` : les lignes sont
rebranchees depuis `SOURCES` a la lecture, avec repli sur l'ancien format pour les
entrees deja ecrites. `saveAsFavorite()` lit desormais l'etat memoire plutot que
localStorage.
