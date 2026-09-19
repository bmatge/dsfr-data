---
'dsfr-data': patch
---

Champs tableau : l'asymétrie entre `count:champ:valeur` et `where` est documentée, pas étendue

Un champ multivalué arrive dans la page comme un tableau (`tags: ["urgent","social"]`).
Une seule grammaire sait regarder DEDANS : la valeur de filtre d'un `count` de
`dsfr-data-kpi` (`value="count:tags:urgent"`, #673). Le dialecte colon de `where` —
sur la source, sur `dsfr-data-query`, sur le `where` du KPI, et jusque dans le filtre
entre accolades du KPI lui-même (`count{tags:eq:urgent}`) — compare la valeur du champ
telle quelle, comme `=` / `!=` de `compute`. Sur le même jeu, deux écritures voisines
rendent donc deux chiffres différents.

Étendre la variante « contient » à `where` et `compute` a été écarté : une page qui
comptait zéro ligne sur un champ tableau en compterait soudain, sans un mot. C'est
la documentation qui manquait, et elle manquait d'autant plus que la panne n'est pas
franche : par repli sur le texte, une ligne à UNE seule étiquette (`["urgent"]`) matche
bien `tags:eq:urgent`, une ligne à deux ne matche pas. Le filtre a l'air de marcher sur
une partie du jeu.

Le JSDoc de `where` (`dsfr-data-query`, `dsfr-data-kpi`), celui de `value` du KPI et
celui de `compute` (`dsfr-data-normalize`) disent désormais sur quoi porte la variante
tableau et sur quoi elle ne porte pas — et nomment la voie de remplacement, qui existe :
`compute="a_urgent = when contains(tags,'urgent') then 1 else 0"` puis
`where="a_urgent:eq:1"`. Il n'y a PAS d'opérateur `where` qui parcourt un tableau, et
`tags:contains:urgent` n'en est pas un (il cherche une sous-chaîne dans le rendu texte
du tableau : « non-urgent » y matche « urgent »). `docs/USER-GUIDE.md` et la skill
`dsfr-data` portent la même chose, et `tests/shared/array-equality-perimeter.test.ts`
fixe le périmètre exact pour que le prochain changement de sémantique soit délibéré.

Aucun changement de comportement : documentation, commentaires et tests.
