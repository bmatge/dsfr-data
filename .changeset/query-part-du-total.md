---
'dsfr-data': minor
---

`dsfr-data-query` : la part du total (`share`, `share_percent`) — résout le constat AM-078 du banc d'essai

Une répartition — « part des licences par typologie de communes », « part par
tranche d'âge », « part par statut » : l'une des trois formes les plus courantes
d'un tableau de bord — n'avait aucune voie native. Aucun agrégat ne produisait
le total à côté des lignes groupées, `compute` ne voit que la ligne courante, et
le ratio de `dsfr-data-kpi` (#673) rend UN nombre, pas une colonne : un
GRAPHIQUE de parts restait hors d'atteinte. Le chemin qui marchait coûtait, par
répartition, une seconde source sans `group-by`, deux clés constantes
(`compute="k = 1"`), un `dsfr-data-join on="k"` et une division — quatre
composants et une requête de plus, payés trois fois sur la même page.

Deux fonctions d'agrégat nouvelles :

- `aggregate="lics:sum, lics__sum:share"` rend `lics__sum__share`, la valeur de
  la ligne divisée par la somme de la colonne sur les lignes de sortie — une
  **fraction** (0,334), celle que `dsfr-data-kpi format="pourcentage"` met à
  l'échelle comme un ratio ;
- `share_percent` rend la même part **en points de pourcentage** (33,4), la
  forme qu'attend un axe de graphique : une fraction dessinée sous un axe
  intitulé « % » y afficherait 0,33.

**Le dénominateur, qui est tout le sujet.** C'est la somme de la colonne sur les
lignes de sortie, **avant `limit`**. Donc une part est toujours une part de
l'ensemble **filtré** : `where`, facettes, recherche et `dsfr-data-context`
déplacent le total, et c'est presque toujours ce qu'on veut — mais le même
graphique montre 33,4 % sans filtre et 16,3 % sur une région, les deux justes,
et la page doit le dire. Avec `limit`, les parts **ne somment pas à 100 %** : un
top 10 montre la part de chaque ligne dans le tout, pas dans le top 10 ;
l'inverse ferait d'une troncature d'affichage une redéfinition silencieuse du
total. Et si la source est tronquée (`max-records`, pagination), le dénominateur
l'est aussi, sans que rien ne le montre : les parts somment quand même à 100 %.

Comme les agrégats cumulés, ce sont des fonctions de **fenêtre** : calcul
toujours côté client, jamais délégué à l'API, et un `group-by` qui porte une
part redescend entièrement côté client — relever `max-records` avant de poser
l'attribut sur un jeu volumineux. À la différence des cumuls, l'ordre des lignes
est indifférent : pas d'`order-by` requis, pas d'avertissement.

Total nul, ou valeur non numérique : `null`, jamais l'infini ni un zéro de
complaisance ; une valeur non numérique ne compte pas non plus au dénominateur.

Le calcul est tenu par deux contrôles de l'oracle (`agregat-part-du-total-926`,
`agregat-part-du-total-avant-limit`), recalculés par les trois voix, avec la
mutation qui les fait rougir.

Strictement additif : sans `share` ni `share_percent`, rien ne change.
