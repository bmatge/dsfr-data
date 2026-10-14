---
'dsfr-data': patch
---

**Pagination : boutons de bord focalisables · Studio IA : un seul filtre · recherche de `dsfr-data-list` sans accents (#1285, #1305).**

**Pagination (`dsfr-data-list`, `dsfr-data-display`).** À la première et à la dernière page, les boutons de bord (« Première page », « Page précédente », « Page suivante », « Dernière page ») ne sont plus `disabled` : ils restent focalisables, portent `aria-disabled="true"`, gardent l'apparence inactive du DSFR et ignorent clic et Entrée. Arrivé sur la dernière page par « Page suivante » au clavier, le focus reste sur le bouton au lieu de retomber en tête de page. Pagination cliente et serveur.

Ce qui change pour une page existante : en page 1 et en dernière page, les boutons de bord perdent l'attribut `disabled` et prennent `aria-disabled="true"` ; ils restent dans l'ordre de tabulation. Une feuille de style ou un script qui ciblait `.fr-pagination__link:disabled` doit lire `[aria-disabled="true"]`. Pendant un relevé (`stale-if-error`), les numéros de page déjà marqués `aria-disabled` prennent eux aussi la couleur inactive.

**Studio IA.** Ses outils (`count_where`, diagnostic d'un graphique avant création) comptaient par leur propre écriture du `where`. Ils utilisent maintenant le filtre de la bibliothèque, champs lus par chemin pointé comme `dsfr-data-query` : une valeur nulle ou un champ absent ne « contient » plus rien, `notcontains` garde les valeurs absentes, une valeur encodée (`a%2Cb`) est décodée, `a|b:contains:x` est un OU entre champs, et `lieu.ville` lit l'objet imbriqué. Sur un jeu de 8 lignes, le Studio annonçait 1 · 1 · 7 · 0 · 0 · 0 lignes là où la page générée en montre 0 · 0 · 8 · 1 · 2 · 3 ; il annonce désormais les mêmes chiffres que la page.

Ce qui change pour une page existante : rien — aucune page publiée ne change. Seuls les comptes que le Studio annonce pendant la génération (et donc les filtres qu'il juge « à zéro ligne ») sont corrigés.

**Recherche intégrée de `dsfr-data-list` (attribut `search`).** Elle ignorait la casse mais respectait les accents : « beziers » ne trouvait pas « Béziers ». Elle est désormais la recherche tolérante de `dsfr-data-search` : sous-chaîne dans tous les champs de la ligne (hors champs techniques `_…`), casse et accents ignorés ; une valeur absente ne contient rien.

Ce qui change pour une page existante : une liste trouve plus de lignes quand le terme est tapé sans accent (ou avec un accent que la donnée n'a pas). Un terme fait de blancs ne filtre plus rien, et « null » ne retrouve plus une ligne à valeur nulle.
