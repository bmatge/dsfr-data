# dsfr-data-query

> Filtrage, agrégation et tri declaratif des données
>
> Déclencheurs : filtre, filtrer, grouper, agréger, trier, transformer, query, requête, top, moyenne, somme, compter, seulement, uniquement, plus de, moins de, departement, region, dans le, pour le

## <dsfr-data-query> - Transformation de données

Composant invisible qui transforme les données recues d'une source (dsfr-data-source
ou dsfr-data-normalize). Filtre, groupe, agrégé et trie de facon declarative.
Ne fait aucun fetch HTTP — les données transitent via le data-bridge.
Peut s'enchainer : un dsfr-data-query peut etre la source d'un autre dsfr-data-query.

### Pattern recommande : source -> query -> chart
```html
<!-- 1. dsfr-data-source récupéré les données -->
<dsfr-data-source id="src" api-type="opendatasoft"
  base-url="https://data.opendatasoft.com" dataset-id="mon-dataset"
  select="sum(population) as total, region" group-by="region">
</dsfr-data-source>
<!-- 2. dsfr-data-query transforme (tri, limite) -->
<dsfr-data-query id="data" source="src" order-by="total:desc" limit="10"></dsfr-data-query>
<!-- 3. dsfr-data-chart affiche -->
<dsfr-data-chart source="data" type="bar" label-field="region" value-field="total"></dsfr-data-chart>
```

### Format des données
Entree : tableau d'objets plats (fourni par dsfr-data-source ou un autre dsfr-data-query).
Sortie : tableau d'objets plats, transforme selon les attributs.
Apres agrégation, les champs sont nommes automatiquement : `champ__fonction`
(ex: `population__sum`, `prix__avg`).

### Attributs
| Attribut | Type | Défaut | Requis | Description |
|----------|------|--------|--------|-------------|
| id | String | - | oui | Identifiant unique |
| source | String | `""` | oui | ID de la dsfr-data-source ou dsfr-data-query parente |
| where | String | `""` | non | Filtres (voir syntaxe ci-dessous) |
| filter | String | `""` | non | Alias de where (compatibilite) |
| group-by | String | `""` | non | Champs de groupement (separes par virgule) |
| explode | String | `""` | non | Champs multivalués (tableaux) à éclater avant le regroupement (#736). Doivent figurer dans `group-by`. Force le regroupement côté client. |
| aggregate | String | `""` | non | Agrégations : `"champ:fonction"` ou `"champ:fonction:alias"` |
| share-by | String | `""` | non | Partition de `share` / `share_percent` (AM-110) : champs, séparés par virgule, AU SEIN DESQUELS la part est calculée (`share-by="annee, question"` → les parts de chaque couple somment à 100 %). Avec un `group-by`, chaque champ doit y figurer. Sans l'attribut, la part reste celle du total. Jamais délégué. |
| order-by | String | `""` | non | Tri : `"champ:asc"` ou `"champ:desc"`. **Omettre cet attribut preserve l'ordre source** (ordre de premiere apparition apres group-by) — utile pour les mois en lettres, jours de la semaine, ou toute série déjà ordonnee en amont. |
| limit | Number | `0` | non | Limite de resultats (0 = illimite) |
| require-where | Boolean | `false` | non | N'émettre aucune ligne tant qu'aucun filtre n'est posé (#690) : l'état `idle` descend jusqu'aux afficheurs. Compte comme filtre le `where`/`filter` de cette requête, ou toute clause reçue par commande. |

> dsfr-data-query est un pur transformateur de données. Utilisez dsfr-data-source pour le fetch HTTP.
> Le where de query est colon-only : la syntaxe ODSQL ne s'utilise que sur le where de dsfr-data-source.
> Les attributs `transform`, `server-side` et `page-size` n'existent PAS sur dsfr-data-query
> (transform et page-size se configurent sur dsfr-data-source).

### Relais de commandes (automatique)
dsfr-data-query transfere TOUJOURS les commandes des composants en aval vers la
source amont (dsfr-data-source) — aucun attribut a poser. Utile pour les gros
datasets avec une source `server-side`.

Les composants en aval pointent sur le dsfr-data-query :
- `dsfr-data-list` envoie `{ page }` pour la pagination
- `dsfr-data-search server-search` envoie `{ where }` pour la recherche
- `dsfr-data-list server-sort` envoie `{ orderBy }` pour le tri

### Operateurs de filtre
Format : `"champ:operateur:valeur"`
Multiples filtres separes par virgule (logique ET) :
`where="population:gte:10000, region:in:IDF|OCC"`

| Operateur | Description | Exemple |
|-----------|-------------|---------|
| eq | Egal | `"status:eq:active"` |
| neq | Different (une valeur absente n'est ni egale ni differente : ecartee) | `"type:neq:brouillon"` |
| gt | Strictement superieur | `"prix:gt:100"` |
| gte | Superieur ou egal | `"population:gte:10000"` |
| lt | Strictement inferieur | `"score:lt:50"` |
| lte | Inferieur ou egal | `"age:lte:30"` |
| contains | Contient : SOUS-CHAINE, n'importe ou dans la valeur (casse ignoree, accents respectes) | `"nom:contains:paris"` |
| notcontains | Ne contient pas (meme sous-chaine ; garde les valeurs absentes) | `"email:notcontains:spam"` |
| in | Dans la liste (separateur \|) | `"region:in:IDF\|OCC\|BRE"` |
| notin | Pas dans la liste (garde les valeurs absentes) | `"status:notin:archive\|supprime"` |
| isnull | Valeur absente (null ou champ manquant ; une chaine vide est une valeur) | `"email:isnull"` |
| isnotnull | N'est pas vide | `"telephone:isnotnull"` |

**`contains` / `notcontains` sont une SOUS-CHAINE, partout (#1285)** : `nom:contains:tation`
trouve « alimentation », quel que soit le fournisseur. C'est la bibliotheque qui dit ce que le
filtre retient, pas le serveur.

⚠️ **Sur une source Opendatasoft, `contains` / `notcontains` sont calcules dans le navigateur**,
jamais par le portail : son `like` compare des MOTS, pas une sous-chaine (`like "%aliment%"`
rend 0 ligne pour 14 366 « alimentation », mesure ; il ne trouve qu'un mot entier, ou un debut de
mot avec `like "alim*"`). Consequences a connaitre AVANT de generer :
- les autres clauses du meme filtre (`eq`, `in`, comparaisons) partent toujours au portail ; la
  source charge tout ce qu'elles laissent passer, dans la limite de `max-records` (1 000 par
  defaut ; au-dela la troncature est signalee) — pour un grand jeu, poser `fetch-mode="export"` et
  `max-records` a la taille du jeu, ou resserrer le filtre par une egalite ;
- `group-by` n'est plus delegue quand le filtre porte un `contains` (il est calcule dans le
  navigateur, sur les lignes filtrees) ;
- derriere une source `server-side` (une page), ou a cote de `dsfr-data-facets server-facets`,
  c'est une ERREUR DE CONFIGURATION (`data-dsfr-config-error`), qui dit quoi ecrire : retirer
  `server-side` / `server-facets`, remplacer la clause par une egalite (`eq`, `in`) quand la
  valeur est connue, ou, pour une saisie du visiteur, `dsfr-data-search` — en `server-search` ou
  en mode `context` (recherche du portail, par debut de mot : une recherche n'est pas un filtre
  `contains`, elle est confiee au moteur du portail et reste compatible avec `server-side` et
  `server-facets`).
Ne JAMAIS ecrire `champ like "%x%"` dans le `where` ODSQL d'une source pour « contient » : le
portail n'y lit pas une sous-chaine.

**Tabular et Grist (#1285, lot 2)** : `contains` reste confie a leur `LIKE` SQL, et chaque
caractere de la valeur y vaut pour lui-meme — `%`, `_` et `\` sont echappes par la bibliotheque
(`nom:contains:50%` trouve « 50% », pas « 500 »). Deux clauses y sont calculees DANS LE NAVIGATEUR,
avec les memes consequences que sur Opendatasoft (`max-records`, erreur de configuration derriere
`server-side` ou `server-facets`) :
- `notcontains`, sur les deux : le `NOT LIKE` du serveur ecarterait les lignes dont la valeur est
  ABSENTE, que le filtre garde ;
- sur Tabular, un `contains` dont la valeur porte `*` : l'API le lit comme un joker.
Cela vaut aussi pour le `where` ecrit sur une source Tabular ou Grist. Pour paginer au serveur un
tableau filtre par « ne contient pas », ecrire plutot la liste des valeurs gardees (`in`).

**Negations et valeurs absentes (#1312)** : `neq` ECARTE une valeur absente (null, champ
manquant), `notin` et `notcontains` la GARDENT ; une chaine vide est une valeur. Une negation
n'est confiee au serveur que s'il fait le meme sort aux absents. Sur Tabular, `notin` est donc
calcule dans le navigateur (le `not.in` de l'API ecarte les absents) — memes consequences que
`notcontains`, erreur de configuration derriere `server-side` : pour paginer au serveur, ecrire la
liste des valeurs gardees (`in`). `neq` y part en `__differs` + `__isnotnull`, et sur Grist
`notin` part en `(champ IS NULL OR champ NOT IN (…))`.

**Qui calcule chaque clause de texte, par fournisseur** (ADR-159 ; meme tableau que
docs/ARCHITECTURE.md, tenu par un test). « serveur » : l'API calcule, avec sa casse et ses accents ;
« navigateur » : la source calcule (sous-chaine, casse ignoree, accents respectes) sur les lignes que
le reste du filtre laisse passer, sous `max-records`, et `server-side`, un agregat pose sur la
source ou `server-facets` voisin deviennent une ERREUR DE CONFIGURATION.

| Clause ou usage | Opendatasoft | Tabular | Grist |
|---|---|---|---|
| `contains` (`champ:contains:aliment`) | navigateur : le `like` du portail compare des mots | serveur : `ilike`, `\` `%` `_` échappés | serveur : `LIKE ? ESCAPE '\'`, `\` `%` `_` échappés |
| `contains`, valeur à étoile (`champ:contains:a*b`) | navigateur | navigateur : l'API lit `*` comme un joker | serveur |
| `notcontains` (`champ:notcontains:aliment`) | navigateur | navigateur : `NOT ILIKE` écarte les valeurs absentes | navigateur : `NOT LIKE` écarte les valeurs absentes |
| `neq` (`champ:neq:archive`) | serveur : `!=` écarte les valeurs absentes, comme le navigateur | serveur : `__differs` et `__isnotnull` (`__differs` seul garde les valeurs absentes) | serveur : `!=` écarte les valeurs absentes, comme le navigateur |
| `notin` (`champ:notin:archive`) | serveur : `NOT … in (…)` garde les valeurs absentes, comme le navigateur | navigateur : `not.in` écarte les valeurs absentes | serveur : `(champ IS NULL OR champ NOT IN (…))` garde les valeurs absentes |
| `gt` `gte` `lt` `lte` | serveur | serveur | serveur : `(champ != '' AND champ < ?)` écarte une case Text vide, que SQLite range avant tout texte (#1321) |
| `eq` `in` `isnull` `isnotnull` | serveur | serveur | serveur |
| casse, clause confiée | sans objet | ignorée | ignorée pour les lettres ASCII seulement (`É` n'est pas `é`) |
| accents, clause confiée | sans objet | respectés | respectés |
| recherche de `dsfr-data-search` en mode `context` | serveur : `search(champ, "q")`, début de mot, casse et accents ignorés | serveur : `champ:contains:q`, sous-chaîne, accents respectés ; terme à étoile : navigateur | serveur : `champ:contains:q`, sous-chaîne, casse ASCII ignorée, accents respectés |

**Champs multiples — un OU entre champs (#1026)** : `"nom|commune:contains:martin"` applique le
MÊME opérateur et la MÊME valeur à plusieurs champs ; la ligne passe dès qu'UN champ satisfait la
clause. Les clauses entre elles restent en ET : `where="nom|commune:contains:martin, dept:eq:75"`.
`|` sépare les champs AVANT le premier `:`, les valeurs d'un `in` APRÈS le second. C'est le seul
OU de la grammaire (pas de clause `or(...)` générale). Traduction serveur : Tabular
`or=(nom__contains.martin,commune__contains.martin)` (une seule clause multi-champs par requête,
valeur sans `,` `.` `(` `)` `"` `&`, pas de `in`/`notin`), Opendatasoft et Grist
`(… OR …)` (sauf `contains` / `notcontains` sur Opendatasoft, calcules dans le navigateur,
#1285) ; INSEE et les sources sans adaptateur filtrent dans le navigateur.

**Champs tableau (#953, ex-#842)** : `eq` / `neq` / `in` / `notin` regardent DANS le tableau.
`tags:eq:urgent` retient une ligne dont `tags` vaut `["urgent","social"]`, exactement comme
`value="count:tags:urgent"` de dsfr-data-kpi la compte, et comme le portail la retient quand la
clause lui est déléguée. La règle exacte côté client :

```
eq(valeur, v) = (valeur est un tableau ET un de ses éléments vaut v)
                OU String(valeur) === String(v)
```

Le second terme est un repli textuel que le portail n'a pas (`["a","b"]` matche `"a,b"` en local,
le portail rend 0) : il est gardé pour que `eq` / `in` ne puissent que gagner des correspondances.
`neq` / `notin` en sont la négation, donc eux en perdent — le portail fait pareil (son `!=` est la
négation stricte de son `=`, valeurs nulles exclues des deux côtés).

Mesuré le 2026-09-19 sur deux portails et deux endpoints — `keyword` du catalogue de
data.economie.gouv.fr, `themes_attendus` de `retours-formulaire-votre-avis-copie` sur
data.education.gouv.fr (176 lignes, 21 nulles) : `= "Elèves"` → 124, `!= "Elèves"` → 31,
`in ("Elèves","Finances")` → 130, et le rendu texte complet du tableau → 0. Opendatasoft lit `=`
sur un champ multivalué comme un « contient ». C'est sur cette sémantique que le client est aligné,
et le chiffre ne dépend donc plus de l'endroit où la clause est évaluée.

⚠️ Ne PAS proposer `tags:contains:urgent` comme équivalent de `eq` : il cherche une sous-chaîne dans
`String(tableau)`, donc « non-urgent » y matche « urgent », et la recherche traverse la virgule
entre deux éléments. `explode` éclate un multivalué avant un `group-by`, ce n'est pas un filtre ;
une `dsfr-data-facets` sur le champ éclate et filtre correctement (#421) quand le filtre revient à
l'utilisateur. Le booléen dérivé par `compute`
(`dsfr-data-normalize compute="a_urgent = when contains(tags,'urgent') then 1 else 0"` puis
`where="a_urgent:eq:1"`) reste valide — utile quand on veut aussi REGROUPER par cette distinction,
le filtre portant alors sur un scalaire — mais il n'est plus NÉCESSAIRE pour filtrer un champ
tableau.

Pendant une version mineure, un avertissement de transition nomme en console le champ et la valeur
des lignes qui se mettent à compter, dédupliqué par couple champ/valeur.

**Catégories vides et parité ods-chart** : un group-by sur un champ partiellement
renseigné produit un groupe `null` (jamais `""`), que dsfr-data-chart libelle
« Non renseigné » (attribut `empty-label`). Rien n'est masqué par défaut. Pour
EXCLURE ces lignes comme le fait ods-chart, filtrer explicitement en amont :
`where="champ:isnotnull"` sur dsfr-data-query, ou `where="champ is not null"`
(ODSQL) sur dsfr-data-source.

### Champs multivalués (explode)
Une cellule tableau (`besoins: ["audit", "formation"]`, ChoiceList Grist, facette
multi-valeurs ODS) est ramenée en chaîne pour la clé de groupe : la COMBINAISON
« audit,formation » devient une modalité, alors que `dsfr-data-facets` éclate le même
champ et compte « audit » et « formation » séparément. Les deux composants branchés sur
le même champ donnaient donc des chiffres différents (#736).

`explode="besoins"` éclate le champ avant le regroupement : une ligne portant N valeurs
compte dans N groupes, et les modalités sont exactement celles de la facette du même champ.
Les éléments vides sont ignorés et une cellule sans aucune valeur (tableau vide, `null`)
ne produit AUCUNE ligne — pas de groupe « non renseigné », comme la facette n'a pas de
modalité vide.

Le compte est par ÉLÉMENT : une cellule qui répète un élément (`["Patrimoine", "Patrimoine"]`)
produit deux lignes, donc `count` 2 pour une seule ligne d'origine. C'est le seul écart avec
la facette du même champ, dont le compteur annonce des LIGNES (une ligne compte une fois par
valeur distincte). Sur un champ où le doublon est possible, `count` ne se lit pas « nombre de
lignes portant la valeur » : compter les identifiants distincts (`aggregate="id:distinct"`).

Le défaut reste l'ancien comportement (des chiffres publiés s'appuient dessus). Chaque
champ listé doit figurer dans `group-by` (sinon `data-dsfr-config-error` et champ ignoré),
et l'éclatement force le regroupement **côté client** : aucune API ne sait éclater un champ
multivalué. Sur un gros jeu, surveiller `max-records` (chiffre partiel silencieux). Sur une source
en `server-side`, qui ne livre qu'une page, la requête passe en erreur de configuration (#1242) :
retirer `server-side` de la source.

```html
<dsfr-data-query id="par-besoin" source="orgs"
  group-by="besoins" explode="besoins" aggregate="id:count"
  order-by="id__count:desc">
</dsfr-data-query>
```

### Fonctions d'agrégation
Format : `"champ:fonction"` ou `"champ:fonction:alias"`
Nommage automatique sans alias : `champ__fonction` (ex: `population__sum`)

| Fonction | Description | Exemple |
|----------|-------------|---------|
| count | Nombre d'elements | `"id:count"` |
| sum | Somme | `"montant:sum"` |
| avg | Moyenne | `"prix:avg"` |
| min | Minimum | `"temperature:min"` |
| max | Maximum | `"score:max"` |
| distinct | Nombre de valeurs distinctes (alias `count-distinct`) — null et chaîne vide exclus, `75` et `"75"` comptent pour une seule valeur | `"commune:distinct"` → colonne `commune__distinct` |
| running_sum | **Cumul** : une ligne par ligne de sortie, chacune portant la somme des précédentes (#738) | `"montant:running_sum"` → colonne `montant__running_sum` |
| diff | **Écart avec la ligne précédente**, inverse du cumul (#775) : retrouve le flux d'une série publiée déjà cumulée. Première ligne `null` | `"cumul:diff"` → colonne `cumul__diff` |
| share | **Part du total** (#926) : valeur de la ligne / somme de la colonne sur les lignes de sortie. FRACTION (0,334) | `"lics__sum:share"` → colonne `lics__sum__share` |
| share_percent | La même part **en points de pourcentage** (33,4), pour un axe de graphique | `"lics__sum:share_percent"` → colonne `lics__sum__share_percent` |

**Une absence n'est pas un zéro** (#301, #1198) : un groupe sans AUCUNE valeur numérique
rend `null` pour `sum`, `avg`, `min` et `max` (pas 0) ; `count` compte les lignes et
reste un nombre. Un afficheur rend `null` comme une absence (cellule vide, barre absente,
courbe interrompue), jamais comme un 0.

Délégation de `distinct` : ODS `count(distinct champ)`, Grist SQL `COUNT(DISTINCT champ)` ;
**Tabular ne le délègue pas** (calcul client sur les lignes reçues, warn console si l'API en
détient davantage — chiffre partiel derrière un `max-records` ou un `limit`).

### Cumul (running_sum, #738)
`running_sum` n'est pas une réduction de groupe mais une transformation **ordonnée** :
elle s'applique APRÈS `order-by`, sur les lignes de sortie, et garde une ligne par ligne
(elle ne replie donc jamais le jeu en une valeur unique comme les autres agrégats sans
`group-by`). Elle peut cumuler une colonne produite par le regroupement :

```html
<!-- Ventes mensuelles, puis cumul depuis janvier -->
<dsfr-data-query id="cumul" source="ventes"
  group-by="mois"
  aggregate="montant:sum, montant__sum:running_sum"
  order-by="mois:asc">
</dsfr-data-query>
<!-- colonnes : mois, montant__sum, montant__sum__running_sum -->
```

- **Sans `order-by`, le résultat n'a pas de sens** : le cumul suit l'ordre des lignes reçues,
  qui n'est pas un contrat. Un avertissement console le signale (pas une erreur : une source
  déjà triée en amont est légitime).
- **Jamais délégué au serveur** : aucune API du pipeline ne le traduit. Un `group-by` qui
  porte un cumul redescend donc entièrement côté client, sur les seules lignes rapatriées —
  surveiller `max-records` et `limit`.
- Le cumul n'existe pas sur `dsfr-data-kpi` (qui rend une valeur, pas une série) ni dans
  `compute` de `dsfr-data-normalize` (par ligne, sans inter-lignes — ADR-105).

### Écart avec la ligne précédente (diff, #775)
`diff` est l'inverse de `running_sum`, avec les mêmes règles (après `order-by`, jamais
délégué, avertissement sans `order-by`). Cas type : un compteur publié **déjà cumulé**
(vaccinations, inscriptions depuis l'ouverture), dont on veut le flux mensuel :

```html
<dsfr-data-query id="flux" source="compteur"
  aggregate="total_cumule:diff" order-by="date:asc">
</dsfr-data-query>
<!-- colonne ajoutée : total_cumule__diff -->
```

- **La première ligne vaut `null`, jamais 0** : un incrément inconnu n'est pas un incrément nul
  (le graphique la laisse vide, un `sum` aval l'exclut).
- Une valeur non numérique rend `null` pour sa ligne **et pour la suivante**, qui n'a pas de
  précédente connue : l'écart n'enjambe jamais un trou.

### Part du total (share / share_percent, #926)
Une **répartition** — « part des licences par typologie de communes » — se posait jusqu'ici en
deux sources, deux clés constantes (`compute="k = 1"`), un `dsfr-data-join on="k"` et une
division. `share` la donne en un attribut :

```html
<dsfr-data-query id="repartition" source="licences"
  group-by="typologie"
  aggregate="lics:sum, lics__sum:share_percent:part">
</dsfr-data-query>
<!-- colonnes : typologie, lics__sum, part (33,4 · 36,0 · 19,7 · 10,9) -->
```

- `share` rend une **fraction** (0,334), `share_percent` la même part **en points de
  pourcentage** (33,4). Sur un axe de graphique, prendre `share_percent` : une fraction
  dessinée sous un axe intitulé « % » y afficherait 0,33. Sur un `dsfr-data-kpi`
  `format="pourcentage"`, prendre `share` — le KPI met la fraction à l'échelle, comme le
  ratio de #673.
- **Le dénominateur est le total des lignes de SORTIE, avant `limit`.** Donc : une part est
  toujours une part de l'**ensemble filtré** (`where`, facettes, recherche, contexte
  déplacent le total — 33,4 % sans filtre, 16,3 % en Bretagne, et les deux sont justes ; le
  dire en page) ; et avec `limit`, **les parts ne somment pas à 100 %**, un top 10 montrant
  la part de chaque ligne dans le tout et non dans le top 10.
- **Trier sur la part** : `order-by="part:desc"` (ou `lics__sum__share_percent:desc` sans
  alias) trie les lignes de sortie sur la colonne calculée, avant `limit`. Ce tri-là reste
  toujours côté client : aucun serveur ne connaît la colonne. Même règle pour un cumul ou un
  écart (`montant__running_sum`, `cumul__diff`).
- **Une part suppose une partition** : chaque unité comptée une fois. Après `explode`, une
  ligne multivaluée compte dans N groupes et les parts dépassent 100 % — écrire alors « part
  des licences portant ce label », pas « répartition ».
- **Part AU SEIN D'UN GROUPE : `share-by`** (AM-110). « Part de chaque réponse parmi les
  répondants d'une question, une année donnée » : sans partition, la part se rapporte à toutes
  les lignes de sortie, les deux années et toutes les questions confondues. Poser
  `share-by="annee, question"` — le dénominateur devient la somme des lignes qui portent la
  même année ET la même question, et les parts de chaque couple somment à 100 % :

  ```html
  <dsfr-data-query id="parts" source="enquete"
    group-by="annee, question, reponse"
    aggregate="n:sum, n__sum:share_percent:part"
    share-by="annee, question">
  </dsfr-data-query>
  ```

  Ne PAS reconstruire la part par un second `group-by`, un `dsfr-data-join` et un
  `compute`. Règles : avec un `group-by`, chaque champ de `share-by` doit y figurer
  (sinon erreur de configuration, et la requête passe en erreur plutôt que d'émettre la part
  du total général) ; une valeur absente forme sa propre partition ; le dénominateur reste
  pris avant `limit` ; `share-by` s'applique à toutes les parts de `aggregate`, pas aux
  cumuls ; sans part dans `aggregate`, il est signalé et sans effet.
- Total nul ou valeur non numérique : `null`, jamais l'infini ni un zéro de complaisance.
- **Jamais délégué**, comme les cumuls : un `group-by` qui porte une part redescend
  entièrement côté client — relever `max-records` avant, sinon le dénominateur est tronqué
  sans que rien ne le montre (les parts somment quand même à 100 %).
- L'ordre des lignes est indifférent : pas d'`order-by` requis, pas d'avertissement.

Toute autre fonction (`somme`, `moyenne`, `median`…) est une **erreur de configuration**
visible (console + `data-dsfr-config-error`, composants aval en erreur) — jamais un 0 silencieux.
`count-if` est refusé : filtrer avec `where` puis `champ:count` (sur le KPI :
`value="count:champ:valeur"`).

### Exemples
```html
<!-- Filtrer et trier -->
<dsfr-data-query id="filtered" source="raw-data"
  where="population:gt:5000"
  order-by="nom:asc"
  limit="10">
</dsfr-data-query>

<!-- Grouper et agréger -->
<dsfr-data-query id="stats" source="communes"
  group-by="region"
  aggregate="population:sum, population:count"
  order-by="population__sum:desc"
  limit="10">
</dsfr-data-query>

<!-- ODS : source + query + chart -->
<dsfr-data-source id="src" api-type="opendatasoft"
  dataset-id="mon-dataset"
  base-url="https://data.opendatasoft.com"
  select="sum(population) as total, region"
  where="population > 5000"
  group-by="region">
</dsfr-data-source>
<dsfr-data-query id="ods" source="src"
  order-by="total:desc" limit="15">
</dsfr-data-query>

<!-- Tabular : source + query + chart -->
<dsfr-data-source id="src" api-type="tabular"
  resource="RESOURCE_ID">
</dsfr-data-source>
<dsfr-data-query id="tab" source="src"
  group-by="departement"
  aggregate="population:sum"
  order-by="population__sum:desc">
</dsfr-data-query>

<!-- Grist : source + normalize + query -->
<dsfr-data-source id="src" api-type="grist"
  base-url="/grist-gouv-proxy/api/docs/DOC_ID/tables/TABLE/records"
  headers='{"Authorization":"Bearer API_KEY"}'>
</dsfr-data-source>
<dsfr-data-normalize id="flat" source="src" flatten="fields"></dsfr-data-normalize>
<dsfr-data-query id="data" source="flat"
  group-by="region" aggregate="population:sum"
  order-by="population__sum:desc">
</dsfr-data-query>

<!-- Chainabilite : un query comme source d'un autre -->
<dsfr-data-query id="actifs" source="raw" where="status:eq:active"></dsfr-data-query>
<dsfr-data-query id="top5" source="actifs" group-by="region" aggregate="montant:sum" order-by="montant__sum:desc" limit="5"></dsfr-data-query>

<!-- Server-side : recherche + pagination serveur ODS
     (server-side et page-size se posent sur la SOURCE ; le query relaie
      automatiquement les commandes page/where/orderBy) -->
<dsfr-data-source id="src" api-type="opendatasoft"
  dataset-id="rappelconso"
  base-url="https://data.economie.gouv.fr/api"
  server-side page-size="20">
</dsfr-data-source>
<dsfr-data-query id="q" source="src"></dsfr-data-query>
<dsfr-data-search id="s" source="q" server-search count></dsfr-data-search>
<dsfr-data-display source="q" pagination="20">
  <template><p>{{nom}}</p></template>
</dsfr-data-display>
```

### Référence `<dsfr-data-query>` (générée depuis le code)

**Rôle pipeline** : transformateur (`TransformerMixin`) — consomme `source`, ré-émet sous son propre `id`, relaie les commandes vers l’amont.

**Attributs**

| Attribut | Type | Défaut | Description |
|---|---|---|---|
| `aggregate` | `string` | `""` (vide) | Agrégations pour mode generic/tabular Format: "field:function, field2:function" Ex: "population:sum, count:count" Une absence n'est pas un zéro (#1198) : un groupe sans aucune valeur numérique rend `null` pour `sum`, `avg`, `min` et `max` ; `count` reste le nombre de lignes. `running_sum` (#738) n'est pas une réduction de groupe mais un CUMUL : il produit une ligne par ligne de sortie, chacune portant la somme des précédentes, calculée APRÈS `order-by`. Sans `order-by`, l'ordre des lignes reçues fait foi et le résultat n'a en général pas de sens : un avertissement console le signale. Le cumul reste toujours côté client. Ex. `group-by="mois" aggregate="montant:sum, montant__sum:running_sum"` avec `order-by="mois:asc"`. `diff` (#775) en est l'inverse : l'écart de chaque ligne avec la précédente, pour retrouver le flux d'une série publiée déjà cumulée (`aggregate="cumul:diff"` → colonne `cumul__diff`). Mêmes règles : après `order-by`, jamais délégué, avertissement sans `order-by`. La première ligne vaut `null`, jamais 0 — un incrément inconnu n'est pas un incrément nul ; une valeur non numérique donne `null` pour elle et pour la suivante. ## `share` et `share_percent` — la part du total (#926) `champ:share` rend, pour chaque ligne de sortie, **la valeur de la ligne divisée par la somme de cette colonne sur toutes les lignes de sortie** — une répartition, sans seconde source ni jointure. Ex. `group-by="typologie" aggregate="lics:sum, lics__sum:share"` produit `lics__sum__share` (0,334 pour 33,4 %). `share_percent` rend la même part **en points de pourcentage** (33,4), la forme qu'attend un axe de graphique : une fraction dessinée sur un axe intitulé « % » y afficherait 0,33. Réserver `share` à ce qui sera formaté (`dsfr-data-kpi format="pourcentage"`, qui met une fraction à l'échelle, comme le ratio de #673). Pour une part **au sein d'un groupe** (la part de chaque réponse parmi les répondants d'une année), poser en plus `share-by` : le dénominateur devient la somme de la colonne sur les lignes qui partagent les mêmes valeurs de ces champs. **Le dénominateur, et ce qu'il signifie.** C'est la somme de la colonne sur les lignes de sortie **avant `limit`** — pas sur le jeu entier. Trois conséquences, qui sont le piège de cette fonction bien plus que sa syntaxe : - une part est toujours une part **de l'ensemble filtré** : `where`, facettes, recherche et `dsfr-data-context` déplacent le dénominateur. C'est presque toujours ce qu'on veut (« part des licences de cette région »), mais il faut le dire en page : le même graphique montre 33,4 % sans filtre et 16,3 % en Bretagne, et les deux sont justes ; - avec `limit`, les parts affichées **ne somment pas à 100 %** : un top 10 montre la part de chaque ligne dans le TOUT, pas dans le top 10. C'est volontaire — l'inverse ferait d'une troncature d'affichage une redéfinition silencieuse du total ; - si la source est tronquée (`max-records`, pagination), le dénominateur l'est aussi. Un total faux ne se voit pas : les parts somment quand même à 100 %. **Ce qu'une part suppose.** Que les lignes soient une partition — chaque unité comptée une fois et une seule. Après `explode`, une ligne multivaluée compte dans N groupes : les parts somment alors à plus de 100 %, et il faut écrire au lecteur « part des licences portant ce label », pas « répartition ». Une colonne qui mêle des signes opposés n'a pas de part : la somme peut s'annuler. **Règles de calcul.** Total nul, absent ou non numérique : la part vaut `null`, jamais l'infini ni un zéro de complaisance. Une valeur non numérique donne `null` pour sa ligne et ne compte pas au dénominateur (même règle que `sum`, #301). Comme les cumulées : calcul toujours côté client, jamais délégué — et, comme elles, **demander une part empêche la délégation serveur du regroupement** : la query regroupe alors sur les lignes chargées, donc relever `max-records` avant de poser l'attribut sur un jeu volumineux. L'ordre des lignes, lui, est indifférent : pas d'`order-by` requis, pas d'avertissement. ## Jamais sur une seule page (#1242) Un agrégat calculé côté client — part, cumul, agrégat sans `group-by` (jamais délégué), ou regroupement que la source n'a pas pu prendre — porte sur les lignes reçues. Derrière une source en pagination serveur (`server-side`), la requête n'en reçoit qu'une page : elle passe en **erreur de configuration** et n'émet aucun chiffre. Le message nomme la source et dit la correction : retirer `server-side` (le jeu est chargé en entier, dans la limite de `max-records`) ; ou, si le jeu dépasse ce plafond ou si un tableau paginé lit la même source, donner à la requête sa propre source sans `server-side`, qui porte le regroupement délégable (`group-by="region" aggregate="population:sum"` sur la source, puis `aggregate="population__sum:share_percent"` ici, sur les groupes). Derrière une source en mode URL avec `paginate`, qu'aucun attribut ne fait charger en entier, le calcul a lieu sur la page reçue : un avertissement en console et le volet Diagnostic le disent. |
| `explode` | `string` | `""` (vide) | Champs multivalués à éclater avant le regroupement (séparés par virgule). Sans cet attribut, une cellule tableau est ramenée en chaîne pour la clé de groupe : `["a", "b"]` devient la modalité `"a,b"`, une COMBINAISON comptée comme une valeur — là où `dsfr-data-facets` éclate le même champ (#421). Les deux composants branchés sur le même champ donnaient donc des chiffres différents, sans rien signaler (#736). Avec `explode="tags"`, chaque élément de la cellule produit sa propre ligne : les modalités du regroupement sont exactement celles de la facette du même champ, et une ligne portant N valeurs compte dans N groupes (les agrégats la comptent donc N fois). **Le compte est par ÉLÉMENT, pas par valeur distincte.** Une cellule qui répète un élément, `["Patrimoine", "Patrimoine"]`, produit DEUX lignes « Patrimoine » : `count` vaut 2 pour cette seule ligne d'origine, et `sum` ajoute deux fois sa mesure. C'est voulu — un éclatement rend ce que la cellule contient — et c'est le SEUL écart avec la facette du même champ, qui compte une ligne une fois par valeur distincte (son compteur annonce des lignes, #1227). Sur un champ où le doublon est possible (tableaux recollés, saisie libre), `count` ne se lit donc pas « nombre de lignes portant la valeur » : dédoublonner la cellule en amont, ou compter les identifiants distincts (`aggregate="id:distinct"`). Règles, alignées sur les facettes : les éléments vides sont ignorés, et une cellule sans aucune valeur (tableau vide, `null`, chaîne vide) ne produit AUCUNE ligne — pas de groupe « non renseigné », comme la facette n'a pas de modalité vide. Une cellule scalaire est inchangée. Chaque champ listé doit figurer dans `group-by` (sinon erreur de configuration et champ ignoré : éclater un champ hors regroupement dupliquerait les lignes et gonflerait les sommes). L'éclatement force le regroupement CÔTÉ CLIENT : aucune API du pipeline ne sait éclater un champ multivalué, déléguer produirait à nouveau des combinaisons. Sur une source volumineuse, penser au plafond de lignes rapatriées ; sur une source en pagination serveur (`server-side`), qui ne livre qu'une page, la requête passe en erreur de configuration (#1242) — retirer `server-side` de la source. Par défaut vide : le comportement historique est conservé. |
| `filter` | `string` | `""` (vide) | Alias pour where (compatibilite) |
| `group-by` | `string` | `""` (vide) | Champs de regroupement (séparés par virgule). Ordre d'application : le filtre (`where` de la query, de la source ou d'un `dsfr-data-context`) passe AVANT le regroupement — c'est aussi l'ordre ODSQL quand le regroupement est délégué au serveur. Un filtre ne peut donc pas viser un alias d'agrégat (`montant__sum`) : la colonne n'existe pas encore, l'API répond 400. Pour filtrer un résultat agrégé, poser une seconde `dsfr-data-query` en aval avec son propre `where`. Délégation au serveur seulement si la query est la SEULE lectrice de sa source (#765) : la source n'a qu'un regroupement, servi à tous ses abonnés. Source partagée (un KPI, un autre graphique…) : calcul côté client sur les lignes chargées, avec un avertissement. Pour garder l'agrégation serveur, donner à la query sa propre `dsfr-data-source`. Un regroupement resté côté client ne se calcule pas sur une source en pagination serveur (`server-side`), qui ne livre qu'une page : la requête passe en erreur de configuration (#1242). Retirer `server-side` de la source, ou donner à la requête sa propre source sans `server-side`. |
| `limit` | `number` | `0` | Limite de résultats |
| `order-by` | `string` | `""` (vide) | Tri des résultats Format: "field:direction" ou "field__function:direction" Ex: "total_pop:desc" ou "population__sum:desc" Une clé peut nommer une colonne de FENÊTRE produite par `aggregate` — une part (`n__share_percent`), un cumul (`montant__running_sum`), un écart (`cumul__diff`), ou leur alias (#1244). Le tri porte alors sur les lignes de sortie : il est appliqué ici, après le calcul de la colonne et avant `limit` (« les cinq plus grandes parts »), et n'est jamais délégué au serveur, qui ne connaît pas cette colonne. Les autres clés du même `order-by` gardent leur rôle : ce sont elles qui ordonnent les lignes AVANT un cumul. Un cumul trié sur sa seule colonne est donc calculé dans l'ordre des lignes reçues — un avertissement console le signale. |
| `require-where` | `boolean` | `false` | N'émettre aucune ligne tant qu'aucun filtre n'est posé (#690). Pendant de `require-where` sur `dsfr-data-source`, pour les pages d'exploration : la requête reste en attente, émet `dsfr-data-idle`, et les afficheurs en aval rendent « choisissez un filtre » au lieu du jeu entier. Ce qui compte comme filtre : le `where` (ou `filter`) de CETTE requête — sur un query, c'est la surface de filtrage que la page pilote — et toute clause `where` non vide reçue par commande (facettes, recherche, `dsfr-data-context`). Tout retirer fait repasser la requête en attente. |
| `share-by` | `string` | `""` (vide) | Partition de `share` et `share_percent` (AM-110) : champs, séparés par virgule, **au sein desquels** la part est calculée. Sans cet attribut, une part rapporte chaque ligne au total de TOUTES les lignes de sortie. Avec `share-by="annee, question"`, elle la rapporte au total des lignes qui portent la même année ET la même question : les parts de chaque couple (année, question) somment à 100 %, sans second regroupement, ni jointure, ni `compute`. Ex. `group-by="annee, question, reponse" aggregate="n:sum, n__sum:share_percent" share-by="annee, question"`. Le nom suit `group-by` et `order-by` : un attribut qui dit PAR QUOI. Il s'applique à toutes les parts de `aggregate`, et à elles seules — les cumulées (`running_sum`, `diff`) ne sont pas partitionnées. Règles : - avec un `group-by` (ou un agrégat global), chaque champ listé doit figurer dans `group-by` : après le regroupement, les lignes de sortie ne portent plus les autres colonnes, et la part retomberait en silence sur le total général. C'est une erreur de configuration, et la requête passe en erreur au lieu d'émettre un chiffre plausible. Sans regroupement, tout champ des lignes convient ; - `share-by` sans aucune part dans `aggregate` est signalé (erreur de configuration) et reste sans effet ; - une valeur absente (null, chaîne vide) forme sa propre partition, comme elle forme son propre groupe ; - le reste est inchangé : dénominateur pris AVANT `limit` (un top N par groupe ne somme pas à 100 %), valeur non numérique → `null` et hors dénominateur, total de partition nul → `null` ; - jamais délégué : comme toute part, il garde le regroupement CÔTÉ CLIENT, sur les lignes chargées, quel que soit l'adaptateur (Opendatasoft, Tabular, Grist). Sur un jeu volumineux, relever `max-records` — un dénominateur tronqué ne se voit pas. Sur une source en `server-side`, qui ne charge qu'une page, la requête passe en erreur de configuration (#1242) : retirer `server-side`, ou porter le regroupement sur une source sans `server-side` et garder ici la part. Par défaut vide : une part reste une part du total. |
| `source` | `string` | `""` (vide) | ID de la source de données (dsfr-data-source ou dsfr-data-normalize) |
| `where` | `string` | `""` (vide) | Clause WHERE / Filtres — syntaxe colon UNIQUEMENT : "champ:opérateur:valeur, champ2:opérateur:valeur2" (opérateurs : eq, neq, gt, gte, lt, lte, contains, notcontains, in, notin, isnull, isnotnull — multi-valeurs séparées par \|). La syntaxe ODSQL n'est PAS supportee ici (elle l'est sur le `where` de dsfr-data-source) : une clause non parsable est signalee via reportConfigError (#277). **La clause part au serveur** dès lors que l'amont a un adaptateur qui sait la traduire et que cette requête est seule lectrice de sa chaîne (#856) — avec ou sans `group-by`. Elle est traduite au dialecte de l'adaptateur (#275) et posée en overlay clé par émetteur (ADR-031) : elle se fusionne avec les clauses des facettes, de la recherche et du contexte au lieu de les écraser, et elle lève l'attente d'un `require-where` posé sur la source (#854). Elle reste calculée dans le navigateur quand la chaîne est partagée (#765), quand un transformateur amont renomme des colonnes (#394), quand une clause est intraduisible, ou avec `explode` (#736). `contains` ET `notcontains` SONT UNE SOUS-CHAÎNE, PARTOUT (#1285, ADR-159) : `champ:contains:tation` retient les lignes dont la valeur porte « tation » n'importe où, casse ignorée, accents respectés — « tation » trouve « alimentation », « ecole » ne trouve pas « École ». C'est la bibliothèque qui dit ce que le filtre retient, pas le serveur. Un portail Opendatasoft ne sait pas chercher une sous-chaîne : son `like` compare des MOTS (`like "%aliment%"` rend 0 ligne pour 14 366 « alimentation », mesuré le 2026-10-12 ; il ne trouve qu'un mot entier, ou un début de mot avec `like "alim*"`). Sur Opendatasoft, ces deux opérateurs ne sont donc JAMAIS confiés au portail : ils sont calculés dans le navigateur, sur les lignes que le reste du filtre a laissées passer — les autres clauses (`eq`, `in`, comparaisons…) partent comme avant. Ce que cela coûte : la source charge toutes ces lignes au lieu des seules lignes retenues, dans la limite de `max-records` (au-delà, la troncature est signalée et le filtre ne porte que sur les lignes lues — `fetch-mode="export"` et un `max-records` relevé pour un grand jeu). Le regroupement suit la clause : `group-by` n'est alors plus délégué (le serveur regrouperait des lignes non filtrées), il est calculé ici. Quand cette requête est seule lectrice de sa chaîne, elle confie la clause à la source, qui la calcule sur le jeu chargé — et la REFUSE si elle est en `server-side`, où elle ne reçoit qu'une page : erreur de configuration, posée sur la source, qui nomme la clause et la correction (retirer `server-side` ; pour une saisie du visiteur, `dsfr-data-search server-search`). Sur une chaîne partagée rien n'est délégué, ni cette clause ni les autres : le filtre porte sur les lignes reçues, comme pour tout opérateur (#765). Tabular et Grist gardent leur délégation de `contains` (sous-chaîne sur ces deux API) : `%`, `_` et `\\` de la valeur y sont échappés, chaque caractère vaut pour lui-même (#1285, lot 2). Sur ces deux API, `notcontains` est calculé dans le navigateur, comme sur Opendatasoft (leur `NOT LIKE` écarterait les valeurs absentes, que le filtre garde) ; sur Tabular, un `contains` dont la valeur porte `*` aussi (l'API le lit comme un joker). LISTE À PARENTHÈSE OU À VIRGULE (#1233) : `champ:in:a\|b (c)` part au serveur comme toute liste — l'adaptateur Tabular écrit entre guillemets la valeur que l'API écarterait nue, et calcule la clause lui-même si l'API refuse cette forme (détail : `where` de dsfr-data-source). CHAMPS MULTIPLES (#1026) : `nom\|commune:contains:martin` applique le MÊME opérateur et la MÊME valeur à plusieurs champs, reliés par un OU — la ligne passe dès qu'un des champs satisfait la clause ; les clauses entre elles restent en ET. Délégué en `or=(…)` sur Tabular (une seule clause multi-champs par requête, valeur sans `,` `.` `(` `)` `"` `&`, ni `in` / `notin`), en `(… OR …)` sur Opendatasoft et Grist (SQL) — sauf `contains` / `notcontains` sur Opendatasoft, calculés dans le navigateur (`nom\|commune:contains:martin`, #1285) ; INSEE et les sources sans adaptateur le calculent dans le navigateur. CHAMP TABLEAU (#953, ex-#842) : `eq` / `neq` / `in` / `notin` regardent DANS le tableau. `tags: ['urgent','social']` matche `tags:eq:urgent`, comme le compte déjà `value="count:tags:urgent"` de dsfr-data-kpi, et comme le retient le portail quand la clause lui est déléguée. C'est ce qui a été mesuré le 2026-09-19 sur deux portails et deux endpoints — `keyword` du catalogue de data.economie.gouv.fr, `themes_attendus` de `retours-formulaire-votre-avis-copie` sur data.education.gouv.fr : `where=champ = "x"` trouve la ligne sur n'importe quel ÉLÉMENT, et jamais sur le rendu texte complet du tableau. La règle exacte, côté client : eq(valeur, v) = (valeur est un tableau et un élément vaut v) OU String(valeur) === String(v) Le second terme est un repli que le portail n'a pas (`['a','b']` matche `'a,b'` en local, le portail rend 0) : il est gardé pour que `eq` / `in` ne puissent que GAGNER des correspondances, jamais en perdre. `neq` / `notin` en sont la négation, donc eux en perdent — et le portail fait pareil. VALEURS ABSENTES (#958) : une ligne dont le champ est nul ne satisfait **ni `eq` ni `neq`** — la logique SQL à trois valeurs qu'applique Opendatasoft. Mesuré le 2026-09-20 sur `themes_attendus` de `retours-formulaire-votre-avis-copie` (176 lignes dont 21 nulles) : `= "Elèves"` -> 124, `!= "Elèves"` -> **31** (= 155 renseignées − 124), et non 52. `eq` les excluait déjà ; `neq` les gardait, d'où le même `champ:neq:valeur` rendant 31 lignes délégué et 52 au client. Pour retrouver les lignes absentes, les nommer : `champ:isnull`. ⚠️ `notin` et `notcontains` gardent, eux, les valeurs absentes — et c'est aligné aussi : ODSQL n'a pas d'infixe `not in`, donc `notin` se délègue en `NOT champ in (…)`, une négation booléenne qui garde les nulles (mesuré : 52). Seul `!=` est à trois valeurs. `notcontains` n'est plus délégué à Opendatasoft (#1285) ; calculé dans le navigateur, il garde les valeurs absentes partout. Les serveurs SQL sont jugés sur ce même sort des absents (#1312) : Tabular reçoit `neq` en `__differs` + `__isnotnull` (`__differs` seul les garde : 34 467 élus au lieu de 139, mesuré) et calcule `notin` dans le navigateur (`not.in` les écarte : 139 au lieu de 34 467) ; Grist reçoit `notin` en `(champ IS NULL OR champ NOT IN (…))`. ⚠️ `tags:contains:urgent` n'est toujours PAS un équivalent d'`eq` : il cherche une sous-chaîne dans `String(tableau)`, donc « non-urgent » y matche « urgent », et la recherche traverse la virgule entre deux éléments. Pour éclater un multivalué avant un `group-by`, c'est `explode` (#736). Le booléen dérivé en amont (`dsfr-data-normalize compute="a_urgent = when contains(tags,'urgent') then 1 else 0"` puis `where="a_urgent:eq:1"`) reste valide — le filtre final porte sur un scalaire, donc regroupable et délégable — mais il n'est plus NÉCESSAIRE pour obtenir le même compte des deux côtés. Pendant une version mineure, un avertissement de transition nomme le champ et la valeur des lignes qui se mettent à compter (dédupliqué par couple champ/valeur, jamais par ligne). |


**Méthodes publiques**

| Méthode | Retour | Description |
|---|---|---|
| `getAdapter()` | `import('../adapters/api-adapter.js').ApiAdapter \| null` | Retourne l'adapter courant (delegue a la source amont) |
| `getAdapterParams()` | `import('../adapters/api-adapter.js').AdapterParams \| null` | Retourne les paramètres adapter resolus de la source amont (délégation transparente, headers api-key-ref inclus — #274). |
| `getData()` | `unknown[]` | Retourne les données actuelles (isLoading() et getError() sont fournis par TransformerMixin, #280). Vide pendant une panne de l'amont (#1272) : le dernier résultat calculé n'est plus rendu comme s'il était à jour. Il reste lisible, daté, par `getLastKnownData()`. |
| `getDelegation()` | `{ groupBy: boolean; aggregate: boolean; orderBy: boolean; where: boolean; }` | Quelles opérations ont été effectivement déléguées au serveur, et lesquelles tournent côté client (#603). C'est l'information de diagnostic la plus coûteuse à deviner de l'extérieur : un `group-by` non délégué s'exécute sur les seules lignes rapatriées, ce qui produit des totaux justes en apparence et faux en réalité. Elle était déjà calculée par `_negotiateServerSide()` mais restait privée. Copie défensive : l'appelant ne doit pas pouvoir muter l'état interne. |
| `getEffectiveWhere(excludeKey?: string)` | `string` | Retourne le where effectif complet (statique + dynamique). Delegue a la source amont si disponible. |
| `reload()` | `void` | Force le rechargement des données. Semantique de pur transformateur (#279) : delegue le refetch a la source amont — meme contrat que dsfr-data-source.reload(). L'emission qui suit redescend naturellement le pipeline jusqu'ici (une chaîne query → query → source propage le reload jusqu'a la source). Repli : si l'amont n'expose pas reload() (normalize/unpivot/join avant EPIC C #262), retraite le cache courant (ancien comportement). |
| `transformsSchema()` | `boolean` | Cette query change-t-elle le schéma de ses lignes (#1199, BUG-036) ? Oui si elle regroupe, agrège ou éclate : ses lignes de sortie ne portent plus les colonnes de la source. Sinon, la réponse de sa propre source — une query de simple filtre est transparente. Une query en aval interroge son amont pour savoir si elle peut déléguer (`_delegationTarget`) ; `dsfr-data-normalize` relaie la question à SA source. Faute de cette méthode, la remontée s'arrêtait sur une query : `normalize(rename) → query → normalize(valeurs) → query` jugeait la dernière délégable, et l'API recevait des noms renommés (Tabular : `?d__groupby`, toute la source en échec). |


**Événements** (émis sur `document` : ecouter via `document.addEventListener`, filtrer sur `detail.sourceId`)

| Événement | Payload | Direction | Quand |
|---|---|---|---|
| `dsfr-data-loaded` | `{ sourceId, data }` | écoute | Nouvelles données publiées par la source désignée par `source`. |
| `dsfr-data-error` | `{ sourceId, error }` | écoute | Erreur amont. |
| `dsfr-data-loading` | `{ sourceId }` | écoute | Chargement amont démarré. |
| `dsfr-data-loaded` | `{ sourceId, data }` | émis | Données transformées, ré-émises sous l’`id` de CE composant (c’est cet `id` que l’aval met dans son `source`). |
| `dsfr-data-error` | `{ sourceId, error }` | émis | Erreur amont ou de transformation, sous l’`id` de ce composant. |
| `dsfr-data-loading` | `{ sourceId }` | émis | Chargement amont relayé vers l’aval. |
| `dsfr-data-source-command` | `{ sourceId, page?, where?, whereKey?, orderBy?, groupBy?, aggregate? }` | émis | Commande de pagination / filtre / tri envoyée à la source AMONT — soit originée par ce composant, soit relayée depuis l’aval. |
| `dsfr-data-idle` | — | émis | `{ sourceId, reason }` sur `document` — la requête attend un filtre (`require-where` posé, aucun filtre reçu) : elle n'émet aucune ligne, et les afficheurs en aval rendent « choisissez un filtre » (#690). Relayé tel quel quand c'est l'amont qui attend. |
| `dsfr-data-source-command` | — | émis | `{ sourceId, groupBy?, aggregate?, orderBy?, where?, whereKey?, origin }` sur `document` — délégation server-side negociee avec la source amont, et liberation des overlays quand elle retombe cote client. `origin` porte l'id de ce composant (#603). |


**Slots** — aucun (le composant rend son propre contenu).

**Variables CSS publiques** — aucune (styler via les variables du DSFR sur le conteneur parent).
