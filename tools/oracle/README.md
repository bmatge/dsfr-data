# Vérification des données — oracle indépendant

Deux implémentations doivent donner le même chiffre **au même instant** (ADR-122).

D'un côté la bibliothèque rend un balisage `dsfr-data-*` et l'on lit ce qu'elle **affiche**.
De l'autre, `tools/oracle` repart des lignes **brutes** et recalcule en tableaux nus. Un écart à
la précision affichée est un échec.

**Indépendance** : `tools/oracle` et `tests/verif-donnees` n'importent rien de `packages/`, de
`@dsfr-data/*` ni de l'alias `@/`. Le test-garde `tests/oracle/guard.test.ts` parcourt tout le
graphe d'imports atteignable depuis les deux dossiers — un fichier neuf y entre sans avoir rien à
déclarer. Si la lib et l'oracle se trompent, ce n'est pas de la même façon.

## Doctrine : l'oracle tient le contrat ÉCRIT

Indépendant ne veut pas dire arbitraire. Là où la bibliothèque **documente** un
comportement — JSDoc d'un attribut, guide des skills, en-tête d'un utilitaire de
`shared` — l'oracle suit le contrat documenté, et recalcule ce qui est
**promis**. Il ne s'en écarte que sur ce que la documentation ne dit pas, ou sur
ce qui la contredit : un écart entre le code et sa doc est un défaut, et c'est
exactement ce qu'un contrôle doit faire tomber.

Un oracle qui « corrigerait » au passage un comportement qu'il juge discutable
ne vérifierait plus rien : il mesurerait l'écart entre la bibliothèque et l'avis
de son auteur, pas entre deux implémentations du même contrat. Le débat sur le
comportement lui-même se tranche dans la bibliothèque (une issue, une ADR), pas
dans `tools/oracle`.

Trois applications, qui se lisent dans le code :

| Contrat documenté | Où l'oracle le tient |
|---|---|
| Véracité d'une condition : `false`, `null`, `undefined`, `''`, `0` et `NaN` sont faux, tout le reste est vrai | `vrai()` — `expression.ts` (`when`, `and`, `or`, `not`) |
| Comparaison d'ordre : numérique quand les DEUX côtés le sont (décimales françaises comprises), lexicographique sinon ; `null`, `undefined` et `''` ne matchent jamais | `compare()` — `compute.ts`, et `ordre()` — `expression.ts` |
| Égalité : lâche entre un nombre et une chaîne numérique, mais une cellule VIDE n'égale jamais un nombre | `egal()` — `compute.ts` |

La comparaison d'ordre est le cas parlant : sur une paire mixte, « NC » face à
100, le repli lexicographique range « NC » **après** « 100 ». C'est discutable,
et c'est écrit ; le contrôle `where-paire-mixte-nombre-et-texte` le tient pour
vrai, et tomberait si la bibliothèque cessait de le faire sans changer sa doc.

Corollaire, pour ce que la bibliothèque **refuse** : une erreur de configuration
(collision de colonnes d'un pivot, schémas divergents d'un empilement) n'émet
aucune ligne. L'oracle **lève** dans ces cas au lieu de recalculer un tableau
plausible — sinon il fabriquerait un attendu que la page ne montrera jamais.

**Et là où la documentation ne dit rien, c'est l'oracle qui ÉNONCE — et la
mutation qui garde.** La discrétisation par **quantiles** en est le cas net : la
bibliothèque ne la documente que par « effectifs égaux par classe », ce qui ne
dit pas quelle valeur tombe sur la borne. L'oracle écrit donc la convention en
toutes lettres (`quantileBreaks`, `compute.ts`) — sur la suite triée de `n`
valeurs, la borne supérieure de la classe `i` est la valeur d'indice
`⌊i·n / classes⌋`, bornée au dernier rang — et `carte-classes-quantiles` la
tient : remplacer les quantiles par des intervalles égaux fait tomber le
contrôle sur la première borne (27,5 au lieu de 26,5). Une convention énoncée
d'un seul côté et éprouvée en échec vaut mieux qu'une convention implicite des
deux côtés, qui ne prouverait rien.

## Les deux modes

| | déterministe (défaut) | vivant (`VERIF_MODE=live`) |
|---|---|---|
| Alimentation | fixtures du dépôt, servies par `page.route` | vraies API, retéléchargées |
| Attendu | recalculé dans le run, depuis les **mêmes** lignes | `out/expected.json`, produit juste avant |
| Déclenchement | chaque PR, **bloquant** (`verif-donnees.yml`) | nuit / à la demande / label `oracle`, jamais bloquant (`oracle.yml`) |
| Réseau | aucun (toute sortie inattendue fait échouer) | requis |

Une alimentation vivante prend **deux formes**, selon l'API visée. `RawSource`
(`baseUrl`, `dataset`, `where`) appelle l'export JSON d'un portail Opendatasoft.
`RawUrlSource` appelle une **URL quelconque, écrite à la main dans le
manifeste** : `url` porte la première page et ses clauses, `rowsPath` nomme le
chemin pointé du tableau de lignes dans l'enveloppe (`data` pour Tabular,
`observations` pour INSEE Melodi ; absent, la réponse est le tableau),
`nextPath` celui de l'URL de page suivante (`links.next`, `paging.next` —
résolue contre la page courante si elle est relative), et `maxPages` borne le
nombre de pages suivies (50 par défaut) pour qu'une pagination qui boucle
s'arrête au lieu de pendre. C'est la seule façon d'écrire un contrôle vivant
sur une API dont l'enveloppe n'est pas celle d'Opendatasoft ; l'oracle
n'emprunte toujours rien à l'adaptateur correspondant.

```ts
// Tabular : filtre délégué à la main, pages suivies par links.next
feed: { kind: 'raw', source: {
  url: 'https://tabular-api.data.gouv.fr/api/resources/<id>/data/?DEP__exact=09&page_size=100',
  rowsPath: 'data',
  nextPath: 'links.next',
} }
```

Un contrôle vivant peut nommer **plusieurs jeux bruts** : `source` porte le jeu
principal (`main`), `sources` les autres, un par nom. C'est ce qu'exigent les
deux opérations du pipeline qui mettent deux jeux en regard — la jointure et
l'empilement — et qui, sans cela, resteraient hors du mode vivant.

```ts
feed: { kind: 'raw', source: REPONSES, sources: { corr: CORRESPONDANCE } },
// puis, dans un expect : pipeline: [{ op: 'join', right: 'corr', on: 'code', type: 'left' }]
```

Les téléchargements sont **mis en cache par URL pour la durée du run**
(`raw.ts`) : une page du banc porte plusieurs constats, donc plusieurs
contrôles, et le même export ne part qu'une fois. Deux clauses différentes
restent deux URL, donc deux téléchargements ; la mémoire ne survit pas au
processus, rien n'est figé.

```bash
npm run verif            # déterministe — ce qu'il faut lancer en local
npm run verif:live       # vivant : verif:expected puis le spec en VERIF_MODE=live
npm run verif:expected   # seulement l'attendu vivant (tools/oracle/out/expected.json)
```

Le serveur de dev est démarré par Playwright (`webServer` de `e2e/playwright.config.ts`). Comme
pour les specs de mise en page, **`npm run build:shared && npm run build:app-ui` d'abord** : la lib
est servie depuis `packages/core/src`, mais `@dsfr-data/shared` se résout par les `exports` du
package, c'est-à-dire `packages/shared/dist` (ARCHITECTURE.md §12). Un `dist/` périmé fait mentir
le contrôle, et l'écart désigne alors le mauvais coupable.

## L'arborescence

```
tests/verif-donnees/     LES CONTRÔLES, par domaine
  banc.ts                  contrôles vivants (reproductions du banc open-data-viz)
  query.ts                 contrôles déterministes (calcul : filtre, group-by, tri, jointure…)
  transformations.ts       contrôles déterministes des opérateurs et des agrégations
                             (where, aggregate, normalize, compute, pivot, unpivot, join, concat)
  contexte.ts              contrôles déterministes joués AU CLAVIER ET À LA SOURIS
                             (contexte, facettes, recherche, synchro d'URL)
  adaptateurs.ts           contrôles déterministes des CHEMINS D'ENTRÉE (ODS, Tabular,
                             INSEE Melodi, Grist, JSON générique)
  affichages.ts            contrôles déterministes du RENDU (formats fr-FR, seuils,
                             classes de choroplèthe, pagination, export CSV, résumé de carte)
  delegation.ts            l'invariant de délégation : mêmes chiffres, serveur ou client
  export-studio.ts         les tableaux de bord produits par l'export du Studio
  banc-adaptateurs.ts      contrôles vivants, un par adaptateur public
  banc-pages.ts            contrôles vivants repris des PAGES du banc, un ou plusieurs par
                             reproduction, chacun citant les constats du registre qu'il rejoue
  fixtures.ts              les lignes servies à la page ET données à l'oracle
  fixtures-contexte.ts         les lignes et le faux serveur ODS du domaine `contexte`
  fixtures-adaptateurs.ts      les lignes plates et les faux serveurs du domaine `adaptateurs`
  fixtures-transformations.ts  idem, servies en `data` inline (aucun faux serveur)
  fixtures-affichages.ts       les jeux du domaine `affichages` (communes, série, libellés, long)
  fixtures-delegation.ts       les balisages du lot délégation (paires avec / sans server-side)
  fixtures-export-studio.ts    les documents exportés — SEUL fichier autorisé à importer la lib
  index.ts                 la liste des manifestes

tools/oracle/            LE MOTEUR
  manifest.ts              la grammaire (types seuls) : Feed, Step, Expect, Check
  compute.ts               le recalcul en tableaux nus
  expression.ts            l'évaluation des colonnes calculées, RÉÉCRITE à part
                             (seconde implémentation de la grammaire ADR-105)
  observe.ts               les lecteurs d'observation, exécutés DANS la page
  expected.ts              l'attendu d'un contrôle, depuis ses lignes brutes
  stabilite.ts             attendre qu'une observation ne bouge plus (pas de sommeil fixe)
  compare.ts               observé contre attendu → un Constat
  raw.ts                   les deux alimentations
  report.ts                le rapport (out/report.json + out/report.txt)
  banc.ts                  le MÊME rapport rangé par page reproduite et par constat du
                             registre du banc (out/banc.md)
  run.ts                   `verif:expected` — l'attendu du mode vivant

e2e/verif-donnees.spec.ts  le seul spec : charge les manifestes, rend, observe, compare
e2e/verif-donnees/         les pages de fixture générées (gitignoré)
```

## Ce qu'on observe

Jamais l'état interne qui a servi à produire un chiffre : ce que la page **montre**.

| Lecteur | Ce qu'il lit |
|---|---|
| `lireKpi` | le texte fr-FR de `.dsfr-data-kpi__value`, unité ou suffixe compris |
| `lireCache` | les lignes émises par un id (query, normalize, join, pivot, concat) |
| `lireGraphique` | les attributs `x` / `y` / `name` de l'élément DSFR Chart **rendu**, pas le cache amont |
| `lireLegende` | les entrées de `getLegendEntries()` d'une `dsfr-data-map-layer` |
| `lireListe` | les lignes du tableau rendu par `dsfr-data-list` |
| `lireFacettes` | les valeurs et compteurs affichés par `dsfr-data-facets`, dans leur ordre de rendu |
| `lireTexte` | un texte affiché (`dsfr-data-context-value`, tag de `dsfr-data-context-tags`, compteur de `dsfr-data-search`), avec le nombre qu'on y lit |
| `lireTextes` | le texte de chaque élément d'un sélecteur (lignes d'un KPI, tendance, valeurs d'un podium, cellules d'un `dsfr-data-display`) |
| `lireClasses` | les classes d'un élément — l'habillage que les seuils d'un KPI décident |
| `lireAttribut` | un attribut de l'élément DSFR Chart rendu (résumé d'une carte, bornes d'axes) ; **jamais** l'hôte, qui porte l'attribut écrit par la page |
| `lirePastilles` | la couleur des `span.legend_dot` d'un graphique (`color-map`, #813) |
| `lireExportCsv` | le contenu du fichier produit par le bouton d'export — le téléchargement est intercepté, puis rendu tel qu'il était |
| `lireUrls` | les URL d'API réellement appelées, décodées, dans l'ordre |

`lireUrls` est le seul qui ne porte pas sur un chiffre : deux balisages peuvent
montrer les mêmes chiffres en demandant au serveur des choses opposées, et
qu'une `dsfr-data-query` délègue ou non son `group_by` ne se voit que là. Son
`expect` énonce un verdict (`none` · `some` · `all` · `last` · `notLast`) sur la
présence d'un fragment, éventuellement restreint aux URL qui en portent un autre
(`among`) ; le journal est tenu par la page, qui enveloppe `fetch` avant le
chargement de la bibliothèque. Un contrôle d'URL se place **en dernier** dans
`expects` : les observations sont lues dans l'ordre, et les chiffres qu'il
explique doivent être arrivés.

Chaque lecteur est une fonction **autonome** : Playwright la sérialise pour l'exécuter dans la
page. Une référence à un symbole de module marcherait sous Vitest et tomberait en `undefined is
not a function` dans le navigateur — d'où la lecture d'un nombre fr-FR réécrite dans chaque
lecteur. Leur contrat est fixé sur un DOM minimal par `tests/oracle/observe.test.ts`.

## Les gestes et l'horloge

Certains chiffres n'existent qu'APRÈS un geste : un filtre de contexte, une
case de facette cochée, un terme saisi. Un `Check` peut donc porter :

```ts
clock: { now: '2026-06-01T00:30:00+02:00', timezone: 'Europe/Paris' },
actions: [
  { kind: 'select', selector: '#ui-region', value: 'Occitanie' },
  { kind: 'fill',   selector: '#r-lib input', value: 'ecole' },
  { kind: 'click',  selector: '#f-region label:has-text("Bretagne")' },
  { kind: 'goto' },   // recharge l'URL que la synchro d'URL vient d'écrire
],
```

`actions` est joué par Playwright juste après la navigation, avant toute
observation ; `selector` est un sélecteur Playwright. `goto` sans valeur
RECHARGE l'URL courante : c'est le contrôle en deux navigations — filtrer,
puis revenir par l'URL produite et retrouver exactement les mêmes chiffres.

Après les gestes, chaque observation est lue en DEUX temps (`stabilite.ts`) :
d'abord « y a-t-il quelque chose à lire ? », puis « est-ce que ça a fini de
bouger ? » — deux lectures identiques espacées de 150 ms, bornées à 10 s.
Aucun sommeil fixe : un filtre client ne touche pas au réseau, `networkidle`
est donc immédiat, et le rendu Lit qui suit le geste est asynchrone. Lire
trop tôt, c'est lire la valeur d'AVANT le geste — et comparer cette
valeur-là, c'est être vert ou rouge au hasard de la machine.

`clock` fixe l'instant (`page.clock.setFixedTime`) ET le fuseau du navigateur
(`timezoneId` du contexte). Sans elle, un contrôle sur `today`,
`current-month`, `current-year` ou `last-n-days` serait vert 364 jours sur 365
— et rouge le jour où la borne compte. Les bornes attendues s'écrivent alors
EN CLAIR dans le `pipeline` : ce qu'il faut montrer à cet instant-là.

## Ajouter un contrôle

1. Choisir le domaine (`tests/verif-donnees/banc.ts` si le cas vit contre une vraie API,
   `banc-pages.ts` s'il reprend le balisage d'une reproduction du banc — il porte alors
   `page` et `constats` —, `query.ts` s'il se joue sur des fixtures) — ou créer un fichier et
   l'ajouter à `index.ts`.
2. Écrire le `Check` : `mode`, `origin` (d'où vient le cas, quelle issue le motive), `feed`,
   `markup`, `expects`. Les clauses d'un contrôle vivant s'écrivent **à la main** dans le
   manifeste, jamais traduites par la lib — clause ODSQL d'une `RawSource`, URL complète et
   chemins d'extraction d'une `RawUrlSource` (voir « Les deux modes » ci-dessus).
3. Si le calcul attendu demande une opération que `compute.ts` ne sait pas faire, l'ajouter là —
   en tableaux nus, sans rien emprunter à la lib — et l'éprouver dans `tests/oracle/compute.test.ts`.
4. `npm run verif`, puis **prouver la mutation** (ci-dessous). Un contrôle qui ne peut pas échouer
   ne garde rien.

## Prouver une mutation

Un contrôle vert ne dit rien tant qu'on ne l'a pas vu rouge sur le défaut qu'il garde.

```bash
# 1. injecter le défaut dans la lib
#    (exemples éprouvés pour ce socle, voir plus bas)
# 2. rejouer le seul contrôle visé
npx playwright test --config e2e/playwright.config.ts e2e/verif-donnees.spec.ts \
  --project=chromium -g "<id du contrôle>"
# 3. retirer le défaut
git checkout -- <fichier>
```

Un défaut posé dans `packages/shared/src` demande un **`npm run build:shared`** avant de rejouer :
la page charge `packages/shared/dist`, pas `src`.

Mutations éprouvées sur ce socle :

| Mutation | Contrôle qui tombe | Ce qu'il dit |
|---|---|---|
| `readersOf()` rend `[]` (`dsfr-data-query.ts`) | `source-partagee-765` | KPI affiché 7, recalculé 137 — exactement #765 |
| `computeEquals` réduit à `looseEquals` (`shared/utils/compute.ts`) | `compute-vide-nest-pas-zero` | 6 au lieu de 3 : la chaîne vide est comptée comme un zéro |
| `buildKey` réduit à `String(row[f] ?? '')` (`shared/utils/join.ts`) | `jointure-cles-vides` | 9 lignes appariées au lieu de 7 : deux clés vides s'apparient |
| whereKey réduit à `this._uid` (`dsfr-data-context.ts`) | `ctx-deux-filtres-and` | 8 au lieu de 3 : deux filtres partagent une clé, le dernier gagne (ADR-031) |
| `localIsoDate` → `isoDate` dans `current-month` (`dsfr-data-context-filter.ts`) | `ctx-current-month` | 5 au lieu de 4 : à 00 h 30 à Paris le 1er juin, l'UTC filtre encore mai |
| `dayAfter` sans `+1` (`dsfr-data-context-filter.ts`) | `ctx-lt-day-after` | 8 au lieu de 9 : le jour choisi n'est plus inclus |
| `_fieldMissingOn` rend `false` (`dsfr-data-context.ts`) | `ctx-champ-absent-805` | 0 au lieu de 4 : la source sans la colonne est vidée au lieu d'être exclue |
| `_syncUrl` n'écrit que le premier filtre (`dsfr-data-context.ts`) | `ctx-url-deux-navigations` | 8 au lieu de 3 : l'URL ne rejoue pas tout le filtre |
| `_getDataFilteredExcluding` rend `_rawData` (`dsfr-data-facets.ts`) | `facettes-croisees` | l'ordre et les compteurs de la seconde facette ne suivent plus la sélection |
| `_rowWeight` rend `1` (`dsfr-data-facets.ts`) | `facettes-poids` | compteur 8 au lieu de 339 : un nombre de lignes sous un libellé de somme |
| `isDisjunctive` privé de `disjunctive` (`dsfr-data-facets.ts`) | `facettes-disjonctives` | 7 au lieu de 15 : la seconde valeur remplace la première |
| `_urlReadableFields` rend toutes les colonnes (`dsfr-data-facets.ts`) | `facettes-url-params-bornes` | 2 au lieu de 7 : un paramètre d'URL étranger devient un filtre (#773) |
| `_normalize` sans `stripAccents` (`dsfr-data-search.ts`) | `recherche-accents` | 0 au lieu de 1 : « sete » ne trouve plus « Sète » |
| `formatPercentage` cesse de poser `%` (`shared/utils/formatters.ts`) | `format-pourcentage-et-unite` | « 41,0 » au lieu de « 41,0 % » : le chiffre est juste, la forme ne l'est pas |
| `_computeMapSummary` ignore `map-summary-weight` (`dsfr-data-chart.ts`) | `carte-resume-pondere-763` | résumé 41,02 au lieu de 43,07 — exactement #763 |
| `classifyValues` discrétise toujours en intervalles égaux (`shared/constants/dsfr-palettes.ts`) | `carte-classes-quantiles` | première borne 27,5 au lieu de 26,5 |
| `_getPaginatedData` repart de la ligne 0 (`dsfr-data-list.ts`) | `liste-page-deux` | la page 2 rend les lignes de la page 1 |
| `toNumber` décale chaque nombre d'une unité (`shared/utils/number-parser.ts`) | 28 contrôles du lot affichages | mutation large : tout ce qui affiche un nombre recalculé tombe |
| `readersOf()` rend `[]` (`dsfr-data-query.ts`) | `source-partagee-ne-delegue-pas` | KPI affiché 0, recalculé 127 684 000 ; 7 groupes au lieu de 8 |
| `_onInstanceRegistered` sort sans renégocier (`dsfr-data-query.ts`) | `query-tardive-renegociation`, `lecteur-tardif-renegociation`, `relais-normalize-devrait-deleguer` | la seconde query rend 1 ligne au lieu de 7, le KPI 8 au lieu de 137 ; le lecteur tardif compte 8 groupes ; la délégation ne franchit plus le relais |
| le bloc « `where` seul » de `_negotiateServerSide` neutralisé (`dsfr-data-query.ts`) | `where-seul-devrait-etre-delegue`, `require-where-filtre-par-delegation` | 0 URL sur 2 portent `where=` ; la source `require-where` n'affiche jamais rien (30 s de scrutation) |
| `dedicatedSourcePlan()` rend une Map vide (`shared/dashboard/export-html.ts`) | 5 contrôles d'`export-studio` | plus aucun `group_by` ni `select` au serveur ; le KPI n'affiche plus rien |
| `maxRecords` ignoré dans `fetchAll` (`opendatasoft-adapter.ts`) | `plafond-max-records-et-meta-total` | 137 lignes chargées au lieu de 50, somme 127 684 000 au lieu de 48 775 000 |
| `gte` réduit à `gt` (`dsfr-data-query.ts`) | `where-gt-gte` | KPI à 4 au lieu de 5 : la borne elle-même tombe du filtre |
| `countDistinct` compte la chaîne vide (`core/utils/aggregations.ts`) | `agregat-distinct-exclut-les-vides` | 2 modalités au lieu de 1 : une absence devient une modalité |
| `a / b` rend l'infini au lieu de `null` (`shared/utils/compute.ts`) | `compute-arithmetique-absence-et-division-par-zero` | « valeur » affiché là où l'oracle dit « sans valeur » |
| `toBoolean` ignoré dans `_applyFold` (`dsfr-data-normalize.ts`) | `normalize-fold` | « moteur+visuel » affiché pour une ligne qui n'a que l'un des deux |
| `last` rend la première observation (`shared/utils/pivot.ts`) | `pivot-first-et-last` | cellule à 12 au lieu de 8 : `first` et `last` se confondent |
| `buildKey` retire les zéros de tête (`shared/utils/join.ts`) | `jointure-ecart-de-graphie-792` | 3 lignes appariées au lieu de 2 : « 1 » apparie « 01 » |
| `received` empilé à l'envers (`dsfr-data-concat.ts`) | `concat-schemas-identiques` | premier montant à 15 au lieu de 10 : l'ordre d'empilement n'est pas tenu |
| repli lexicographique retiré de `_compareForRange` (`dsfr-data-query.ts`) | `where-paire-mixte-nombre-et-texte` | KPI à 5 au lieu de 9 : les « NC » disparaissent du filtre au lieu d'être rangés en texte |
| troncature retirée de `_fetchViaExport` (`opendatasoft-adapter.ts`) | `plan-de-relance-plafond-max-records` | 1 001 projets chargés au lieu de 1 000 : `max-records` ne borne plus rien |
| `meta:total` rend `items.length` (`core/utils/aggregations.ts`) | `bofip-total-publie-par-la-source-serveur` | 10 au lieu de 9 148 : le compteur annonce la page, pas le jeu |
| `_rowWeight` rend `1` (`dsfr-data-facets.ts`) | `ips-ecoles-facettes-ponderees` | l'ordre des départements change (Dordogne en tête au lieu de la Gironde) : une facette sur source pré-agrégée recompte des lignes, pas des écoles |
| `_parseOriginLabels` altère le libellé (`dsfr-data-concat.ts`) | `portrait-federation-union-de-deux-sources` | clé « OLYMPIQUES » empilée là où le manifeste déclare « Olympiques » |
| `buildKey` distingue nombre et chaîne (`shared/utils/join.ts`) | `barometre-jointure-couverture` | 0 question appariée au lieu de 119 : `code_unifie` est un nombre à gauche, une chaîne à droite (#792) |
| `diff` calculé à l'envers (`dsfr-data-query.ts`) | `tne-audiences-ecart-mensuel` | écart de −3 539 là où l'oracle lit +3 539 |

## Un contrôle que la bibliothèque ne passe pas

Un contrôle légitime que la bibliothèque ne passe pas ne se supprime pas et ne
s'adoucit pas : les deux reviennent à écrire dans le dépôt qu'il n'y avait rien
à voir. Il se met en attente, en nommant ce qu'il attend et les deux chiffres —
`Check.skip` porte la raison, le spec la rend par `test.skip`.

La raison doit dire LEQUEL des deux cas c'est, parce qu'ils n'appellent pas la
même suite :

- un **défaut** — le comportement contredit ce que la documentation promet ;
  il s'ouvre en issue, et le contrôle reverdit quand il est corrigé ;
- une **amélioration attendue** — la documentation ne promet rien, le chiffre
  affiché est juste, et le contrôle est écrit pour que le jour où la capacité
  arrive, elle arrive juste.

Un rapport de vérification qui listerait comme défaut ce que la doc ne promet
pas coûte exactement ce que #746 a mesuré. Dans les deux cas, la supervision
ouvre ce qu'il faut ouvrir : le lot qui trouve ne corrige pas.

**Une pagination fausse ne se voit jamais sur la page 1** : le contrôle ouvre donc la page de
fixture sur `?page=2` (`Check.query` + `url-sync`), un lien profond étant un chemin d'affichage à
part entière.

**Plusieurs worktrees en parallèle** : `e2e/playwright.config.ts` a `reuseExistingServer: true` sur
le port 5173. Si un autre checkout y sert déjà le dev server, `npm run verif` éprouve SES sources —
et les preuves de mutation passent au vert à tort. Vérifier `lsof -i :5173` avant de lancer, sinon
démarrer son propre serveur sur un port libre et jouer le spec avec une copie temporaire de la
configuration Playwright.

## Le rapport

En fin de run, `tools/oracle/out/report.json`, `out/report.txt` et `out/banc.md` (ci-dessous) : par observation, la valeur
**lib**, la valeur **oracle**, l'écart, le nombre de lignes brutes, le mode — et le nombre de
valeurs comparées, parce qu'un contrôle vert qui n'a rien comparé ne garde rien. Le résumé texte
est aussi écrit sur la sortie standard, et les deux fichiers partent en artefact CI en cas d'échec.

### `out/banc.md` — la vue du banc d'essai

Le même run rend un **troisième** fichier, rangé non par contrôle mais par
**page reproduite** et par **constat du registre** (`AM-0XX`, `BUG-0XX`,
`PG-0XX`). Le banc open-data-viz ne connaît ni nos domaines ni nos identifiants
de contrôle : il connaît ses pages et ses constats, et sans une vue dans ses
termes, la seule façon pour lui de savoir si une de ses demandes tient encore
serait de relire le code des contrôles.

Un contrôle y entre dès qu'il porte `page` (la reproduction dont il reprend le
balisage) ; `constats` liste les identifiants qu'il rejoue. Le fichier donne,
par page, une ligne par observation — chiffre lib, chiffre oracle, verdict —
puis les contrôles **en attente** avec leur raison, puis un index par
identifiant de registre. C'est le seul endroit qui relie un constat à un chiffre
mesuré : le changeset dit « résout AM-0XX », `banc.md` dit à quel écart, sur
quelle page, à quelle date.

Playwright **redémarre le worker après un échec** : le worker suivant n'a plus en mémoire les
constats de son prédécesseur, précisément ceux qui portent l'échec. Le rapport se fusionne donc d'un
worker à l'autre, en ne retenant que les constats du même run — c'est à quoi sert le `VERIF_RUN=$$`
des scripts npm. Lancé à la main sans cette variable (`npx playwright test … -g "<contrôle>"`, comme
pour une preuve de mutation), le fichier ne porte que ce que le dernier worker a vu ; le résumé sur
la sortie standard, lui, est complet dans les deux cas.
