---
'dsfr-data': minor
---

Champs tableau : l'égalité côté client regarde enfin DANS le tableau, comme le portail

Sur un champ multivalué (étiquettes ODS, ChoiceList Grist, colonne repliée par `fold`),
`where="tags:eq:urgent"` ne retenait pas une ligne dont `tags` vaut `["urgent","social"]`,
alors que `value="count:tags:urgent"` de `dsfr-data-kpi` la comptait. Ce n'était pas une
sémantique : `looseEquals` faisait `String(a) === String(b)`, donc `Array.prototype.toString`.
Une ligne à UNE étiquette matchait, une ligne à deux ne matchait pas — le filtre avait l'air
de marcher sur une partie du jeu.

Et le portail, lui, faisait déjà « contient ». Mesuré le 2026-09-19 sur deux portails et deux
endpoints :

```
data.economie.gouv.fr, catalogue, champ keyword (tableau)
  where=keyword = "budgets annexes"  -> total_count = 1   (2e element)
  where=keyword = "LFI 2011,budgets annexes,finances publiques,loi de finances initiale" -> 0

data.education.gouv.fr, retours-formulaire-votre-avis-copie, champ themes_attendus
  176 lignes, dont 21 nulles
  where=themes_attendus = "Elèves"                -> 124
  where=themes_attendus != "Elèves"               ->  31   (= 155 non nulles - 124)
  where=themes_attendus in ("Elèves","Finances")  -> 130   (= l'union du OU)
```

Dès qu'une clause était déléguée — et ce n'est pas la balise qui porte le `where` qui en
décide, mais le mode de la source, un transformateur amont, le partage de la chaîne —
le même attribut comptait autre chose. Ajouter un second graphique à une page pouvait
basculer l'évaluation du serveur vers le client et changer un chiffre affiché, sans un
message.

## Ce qui change

L'égalité client est alignée sur celle du serveur, **le repli textuel gardé en OU** :

```
eq(valeur, v) = (valeur est un tableau ET un de ses éléments vaut v)
                OU String(valeur) === String(v)      <- l'existant, inchangé
```

- **`eq`, `in`, le `=` de `compute`, le filtre entre accolades du KPI GAGNENT des lignes** :
  celles dont la valeur cherchée est un élément parmi d'autres. Ce sont exactement les pages
  qui sous-comptaient par rapport au portail. Mesuré au navigateur sur le jeu Éducation
  ci-dessus : le même `where`, évalué côté client, affichait **58** là où la clause déléguée
  affichait **124** ; les deux affichent désormais **124**.
- **`neq` et `notin` en PERDENT**, étant la négation des précédents : `tags:neq:urgent` ne
  garde plus une ligne `["urgent","social"]`. C'est la seule perte, et elle est assumée parce
  que le portail fait pareil — son `!=` est la négation stricte de son `=`, valeurs nulles
  exclues des deux côtés (155 − 124 = 31, mesuré).
- **Le repli textuel reste** : `["a","b"]` matche encore `"a,b"` côté client, là où le portail
  rend 0. Il est gardé pour que `eq` / `in` ne puissent que gagner des correspondances.
- **`count:champ:valeur` et `count{champ:eq:valeur}` rendent enfin le même chiffre.**
  `looseEqualsOrContains` a disparu : il n'y a plus qu'une égalité dans le dépôt.
- **`where="champ:contains:v"` est inchangé** — il reste une recherche de sous-chaîne dans le
  rendu texte du tableau, donc « non-urgent » y matche toujours « urgent ». Pour filtrer un
  champ tableau, c'est `eq` qu'il faut écrire.

Pendant cette mineure, un **avertissement de transition** nomme en console le champ et la
valeur des lignes qui se mettent à compter, et dit que le compte s'aligne sur ce que renvoie
le portail. Il est dédupliqué par couple (champ, valeur) et plafonné : sur le jeu Éducation où
66 lignes basculent, **un seul message** est émis.

Le contournement recommandé jusqu'ici — dériver un booléen par
`dsfr-data-normalize compute="a_urgent = when contains(tags,'urgent') then 1 else 0"` puis
`where="a_urgent:eq:1"` — **reste valide**, et garde un intérêt propre (le filtre porte alors
sur un scalaire, regroupable et délégable). Il n'est simplement plus *nécessaire*.

Closes #953, closes #842.
