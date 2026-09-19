---
'dsfr-data': minor
---

`neq` : une valeur ABSENTE ne satisfait ni `=` ni `!=` — des comptes vont BAISSER

**Si un compte de votre page a baissé sans que son balisage ait bougé, c'est ici.** Un filtre
`champ:neq:valeur` (ou un `!=` de `compute`) ne retient plus les lignes dont le champ est nul.
Sur le jeu qui a servi à mesurer — `retours-formulaire-votre-avis-copie` de
data.education.gouv.fr, champ `themes_attendus`, **176 lignes dont 21 nulles** — un
`where="themes_attendus:neq:Elèves"` évalué dans le navigateur affichait **52**, il affiche
désormais **31**. Vingt et une lignes en moins, et c'est voulu : **31 est ce que le portail
répond depuis toujours à la même clause.** Pour retrouver les lignes perdues, les nommer :
`champ:isnull`.

La proportion dépend entièrement du taux de valeurs absentes du champ filtré : 21 sur 176 ici,
davantage sur un jeu plus lacunaire. Pendant cette mineure, un **avertissement de transition**
le dit en console, nomme le champ et **compte** les lignes concernées — un message par champ,
jamais par ligne (mesuré sur le jeu ci-dessus : **un seul message**, « 21 ligne(s) »).

## Ce qui a été mesuré

Opendatasoft applique la **logique SQL à trois valeurs** : sur une ligne dont le champ est nul,
`=` comme `!=` valent « inconnu », et l'inconnu ne retient pas la ligne (2026-09-20) :

```
data.education.gouv.fr, retours-formulaire-votre-avis-copie, champ themes_attendus
  176 lignes, dont 21 nulles et 155 renseignées
  where=themes_attendus is null      ->  21
  where=themes_attendus = "Elèves"   -> 124
  where=themes_attendus != "Elèves"  ->  31   = 155 - 124, les nulles EXCLUES
                                              et non 52 = 176 - 124
  where=themes_attendus != "zzz"     -> 155   (et non 176)
```

`eq` excluait déjà les nulles côté client ; `neq`, écrit `!looseEquals(…)`, les gardait. Le même
`champ:neq:valeur` rendait donc **31 lignes s'il partait au serveur et 52 s'il était évalué au
client** — et ce qui en décidait n'était pas la balise qui porte le `where`, mais le mode de la
source, un transformateur amont ou le partage de la chaîne. C'est la dernière divergence connue
entre les deux chemins, et c'est la suite directe de #953, sur l'autre moitié de l'opérateur.

Vérifié au navigateur sur le jeu réel, le même `where` deux fois (délégué / client) :

| | délégué au portail | évalué au client |
|---|---|---|
| avant | 31 | **52** |
| après | 31 | **31** |

## Ce qui ne change PAS, et pourquoi ce n'est pas une inconséquence

`notin` et `notcontains` continuent de garder les valeurs absentes. **Le serveur a deux écritures
de la négation, et elles n'ont pas le même sens** — mesuré le même jour, même jeu :

```
themes_attendus != "Elèves"          ->  31   trois valeurs, nulles EXCLUES
NOT themes_attendus = "Elèves"       ->  52   complément de la clause, nulles GARDÉES
not(themes_attendus = "Elèves")      ->  52
NOT themes_attendus in ("Elèves")    ->  52
NOT themes_attendus like "%Elèves%"  ->  52
themes_attendus not in (…)                  ODSQL syntax exception
themes_attendus not like "%…%"              ODSQL syntax exception
```

ODSQL n'ayant pas d'infixe `not in` / `not like`, `notin` et `notcontains` ne peuvent se déléguer
qu'en `NOT …`, qui garde les nulles. Le client les gardait déjà : il est donc **déjà aligné**, et
les « corriger par symétrie » aurait rouvert la divergence que cette version ferme. Seul `!=`
est à trois valeurs, et c'est écrit dans le JSDoc de `where` comme en tête de `filterToOdsql`.

## Périmètre exact

- `where="champ:neq:v"` de `dsfr-data-query`, de `dsfr-data-source` et du filtre entre accolades
  du KPI (`looseNotEquals`, une seule fonction pour les trois chemins) ;
- `when champ != 'v'` de `compute` — l'en-tête de `compute.ts` promet depuis #671 que
  `when f != 'x'` et `where="f:neq:x"` gardent les mêmes lignes, et c'est la raison de l'inclure ;
- inchangés : `eq`, `in`, `contains`, `notin`, `notcontains`, `isnull` / `isnotnull`, les
  comparaisons d'ordre (qui excluaient déjà les absents), et la **chaîne vide**, qui reste une
  valeur et passe toujours un `neq`.

Un contrôle de l'oracle tient les deux chemins sur le canari (`canari-neq-nuls-exclus` et sa
variante déléguée) : `eq` 7 + `neq` 27 = 34 lignes renseignées sur 40, `notin` 33, `isnull` 6, le
même 27 délégué et client, et les trois voix (bibliothèque, oracle TS, oracle Python) d'accord.
Éprouvé en échec : sans le correctif, la variante client affiche 33 contre 27 aux deux oracles —
exactement les six lignes sans région — pendant que la variante déléguée reste à 27.

Closes [#958](https://github.com/bmatge/dsfr-data/issues/958).
