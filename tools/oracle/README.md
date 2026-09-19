# Vérification des données — trois voix, deux régimes

Plusieurs implémentations doivent donner le même chiffre **au même instant** (ADR-122, amendée
par l'epic #886).

D'un côté la bibliothèque rend un balisage `dsfr-data-*` et l'on lit ce qu'elle **affiche**.
De l'autre, `tools/oracle` repart des lignes **brutes** et recalcule en tableaux nus. Un écart à
la précision affichée est un échec. Depuis l'epic #886, une **troisième voix** recalcule encore :
en régime déterministe, un oracle en **Python standard** (`tools/oracle-py/`) dont les attendus
sont versionnés ; en régime vivant, **le serveur Opendatasoft lui-même** (`select` + `group_by`
écrits à la main). Et le dispositif sait désormais exiger un **silence** ou un **mot** de la
bibliothèque, tenir des **invariants** face aux lignes brutes, rejouer chaque **piège** payé par
le banc sur un jeu canari, et trancher une **nuit rouge** — bibliothèque ou donnée — en gelant
l'échec en contrôle figé.

Le plan de ce document : la doctrine · les deux modes · l'arborescence · ce qu'on observe · les
silences · la troisième voix · les invariants · le canari · le recoupement serveur · le verdict
d'une nuit rouge et le gel · les gestes et l'horloge · ajouter un contrôle · prouver une
mutation · un contrôle que la bibliothèque ne passe pas · le rapport.

**Indépendance** : `tools/oracle` et `tests/verif-donnees` n'importent rien de `packages/`, de
`@dsfr-data/*` ni de l'alias `@/`. Le test-garde `tests/oracle/guard.test.ts` parcourt tout le
graphe d'imports atteignable depuis les deux dossiers — un fichier neuf y entre sans avoir rien à
déclarer. Si la lib et l'oracle se trompent, ce n'est pas de la même façon.

État du dépôt : **216 contrôles déterministes** et **32 contrôles vivants**, répartis en onze
domaines, pour 500 observations et **26 invariants**. Un contrôle et cinq invariants sont en
attente (voir « Un contrôle que la bibliothèque ne passe pas »). Les contrôles vivants rejouent
**16 reproductions** du banc d'essai ; avec le canari, **36 constats** de son registre sont
cités. Une troisième voix, en Python standard, recalcule 337 des attentes déterministes
(« La troisième voix ») ; en mode vivant, **25 observations** sont recoupées par le serveur
Opendatasoft lui-même (« Le recoupement serveur »).

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

## La troisième voix

Le garde d'imports garantit que l'oracle n'emprunte rien à la bibliothèque ; il
ne garantit pas qu'il ne **pense pas comme elle**. Mêmes auteurs, même
langage, mêmes idiomes : une dérive dans le même sens serait invisible au
rapport. D'où une troisième voix (#880), dans un autre langage et sans aucun
outil commun : `tools/oracle-py/oracle.py`, **Python standard** — `json`,
`fractions`, `decimal`, `unicodedata`, rien d'autre. Jamais pandas, et c'est
une raison de fond : `sum` d'une colonne toute-NaN y vaut 0, `groupby` y
supprime le groupe null, `mean` y saute les NaN — exactement la famille de
comportements que la doctrine #301 interdit. Un oracle qu'il faudrait corriger
partout ne vérifierait plus rien.

Les deux oracles se rencontrent par un **fichier**, jamais par un appel :

```bash
npm run verif:manifests   # projette les contrôles déterministes en out/manifests.json
npm run verif:attendus    # …puis python3 tools/oracle-py/oracle.py
                          #   → tests/verif-donnees/attendus.json, VERSIONNÉ
```

`attendus.json` porte une entrée par observation : `valeur` (pour un KPI,
arrondie `ROUND_HALF_UP` à `decimals`), `brut` (avant arrondi), ou la raison
pour laquelle la voix ne couvre pas l'attente. Il est **committé** : un
attendu qui change se voit dans le diff d'une PR, relu, au lieu d'être
silencieusement recalculé — c'est ce que le régime déterministe permet, et
ce que le régime vivant interdit (ADR-122, amendée par le lot 8). Le job
`attendus` de `verif-donnees.yml` le régénère et refuse un diff non committé.

**Le fichier gardé ne porte que des chiffres.** Son en-tête se limite à
`source`, `conventions` et `couverture` : aucune métadonnée d'environnement.
La version exacte de l'interpréteur est écrite — mais dans
`tools/oracle/out/attendus-provenance.json`, ignoré par git, affiché par le
job juste avant le `git diff`. Tant qu'elle vivait dans l'en-tête, le garde-fou
comparait l'environnement en même temps que les valeurs et rougissait sur la
seule ligne d'en-tête dès que le runner n'avait pas le Python de l'auteur
(3.12.3 contre 3.11.5, **toutes les valeurs égales**) ; le workflow épingle
désormais `python-version: '3.11'`, et `oracle.py` refuse un interpréteur
antérieur plutôt que de recalculer sous d'autres conventions. Un test de
conformité qui devient instable est un test qu'on abandonne : la zone gardée
est tenue à ce qu'elle doit détecter, la dérive des valeurs.

Trois rencontres :

| Où | Quoi |
|---|---|
| `tests/oracle/attendus.test.ts` (Vitest, quelques secondes, sans navigateur) | pour chaque entrée couverte, l'oracle TS recalcule depuis les mêmes jeux et doit tomber **au même endroit à six décimales et au même arrondi**. Un écart est un constat à arbitrer — doc muette, convention, défaut de l'un des deux —, jamais à adoucir. Le test écrit l'écart maximal mesuré. |
| `e2e/verif-donnees.spec.ts`, mode déterministe | quand une entrée couvre l'observation, la page est comparée à Python **par la même fonction** que contre TS : le `Constat` porte `python` et `ecartPython`, le rapport dit combien d'observations ont **trois voix**. Deux écarts sur la même observation, ou aucun. Fichier absent : deux voix, et le rapport le dit. |
| `tests/oracle/oracle-py.test.ts` | le garde de la voix : aucun sous-processus, aucun `node`, rien de `packages/`, rien hors de la stdlib. Un oracle qui rappellerait l'autre serait un écho. |

**Couverture** (au 2026-09-19) : 293 attentes sur 369, soit **90 % des
attentes numériques** ; les 76 restantes sont nommées avec leur raison —
`derive` (21 : la grammaire d'expressions ADR-105 est une seconde réécriture,
hors v1), `urls` (31) et `diagnostic` (1) qui ne sont pas des chiffres,
`legend` (5), `attr` (10), `class` (5), `dots` (1), `csv` (1). À la rencontre :
**2 035 comparaisons, écart maximal 0**.

**Conventions écrites** (l'en-tête d'`oracle.py` les porte aussi) :

- *Nombres* : nombre JSON (jamais un booléen) ou chaîne qui, blancs retirés et
  première virgule changée en point, se lit comme un décimal ; `Infinity`,
  `NaN`, `1_000` ne sont pas des nombres. Tout calcul en `Fraction`
  (exact, décimaux lus en `Decimal`), arrondi final `ROUND_HALF_UP`.
- *Absence* : `null` et chaîne vide (blancs compris) ; `isnull-strict` ne
  voit que `null`. *Égalité* : deux absents sont égaux, un absent n'égale
  rien, numérique si les deux côtés le sont, sinon en chaîne.
- *Ordre* : numérique si les deux côtés le sont ; sinon en texte sur une clé
  de collation indépendante de la locale — `NFD` sans marques combinantes puis
  `casefold`, départagée par la forme NFD à casse inversée. C'est une
  approximation de la collation ICU de `localeCompare` ; une divergence sur une
  paire donnée serait un constat, et il n'y en a aucune sur le corpus.
- *Chaîne d'une valeur* (clés de groupe, de jointure, de pivot) : la forme
  que `String(v)` donnerait en JavaScript.

**Les deux hypothèses de l'issue, éprouvées.** (1) `roundTo` de l'oracle TS
utilise `Math.round`, qui arrondit −2,5 à −2 quand `ROUND_HALF_UP` dit −3 :
la comparaison des valeurs **arrondies** de `attendus.test.ts` verrait le cas,
et **aucune observation du corpus ne tombe sur une demi-unité négative** — la
mutation `Math.round → Math.trunc` prouve que la comparaison mord (deux
constats : « arrondi TS 17768.68, Python 17768.69 », « 331448, Python
331449 »). (2) Les sommes de flottants : la voix Python somme en `Fraction`,
exact ; l'écart maximal mesuré contre les sommes binaires de TS est **0** sur
les 2 035 comparaisons — aucune ne tombe à la limite de tolérance.

**Quand TS et Python divergent** : ne pas toucher à la tolérance. Lire la
doc de l'attribut ; si elle tranche, corriger l'oracle qui la contredit ; si
elle ne dit rien, ÉNONCER la convention (README, en-tête d'`oracle.py`) et la
tenir des deux côtés ; si les deux tiennent la doc et divergent quand même,
c'est la bibliothèque qui a deux comportements, et c'est une issue.

## Les deux modes

| | déterministe (défaut) | vivant (`VERIF_MODE=live`) |
|---|---|---|
| Alimentation | fixtures du dépôt, servies par `page.route` | vraies API, retéléchargées |
| Attendu | recalculé dans le run, depuis les **mêmes** lignes — ET, pour les observations que la troisième voix couvre, `tests/verif-donnees/attendus.json`, figé et versionné | `out/expected.json`, produit juste avant |
| Déclenchement | chaque PR, **bloquant** (`.github/workflows/verif-donnees.yml`) | nuit / à la demande / label `oracle`, jamais bloquant (`.github/workflows/oracle.yml`) |
| Réseau | aucun (toute sortie inattendue fait échouer) | requis |

```bash
npm run verif            # déterministe — ce qu'il faut lancer en local
npm run verif:live       # vivant : verif:expected puis le spec en VERIF_MODE=live
npm run verif:expected   # seulement l'attendu vivant (tools/oracle/out/expected.json)
```

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

**Avant tout run** : `npm run build:shared && npm run build:app-ui`. Le serveur de dev est démarré
par Playwright (`webServer` de `e2e/playwright.config.ts`) et sert la lib depuis
`packages/core/src`, mais `@dsfr-data/shared` se résout par les `exports` du package, c'est-à-dire
`packages/shared/dist` (ARCHITECTURE.md §12). Un `dist/` périmé fait mentir le contrôle, et l'écart
désigne alors le mauvais coupable.

**Plusieurs worktrees en parallèle** : `e2e/playwright.config.ts` a `reuseExistingServer: true` sur
le port 5173. Si un autre checkout y sert déjà le dev server, `npm run verif` éprouve SES sources —
et les preuves de mutation passent au vert à tort. Vérifier `lsof -i :5173` avant de lancer, sinon
démarrer son propre serveur sur un port libre et jouer le spec avec une copie temporaire de la
configuration Playwright.

## L'arborescence

```
tests/verif-donnees/     LES CONTRÔLES, par domaine
  index.ts                 la liste des manifestes
  query.ts                 le CALCUL : filtre, group-by, tri, jointure, limite
  adaptateurs.ts           les CHEMINS D'ENTRÉE (ODS, Tabular, INSEE Melodi, Grist, JSON générique)
  transformations.ts       les opérateurs et les agrégations (where, aggregate, normalize,
                             compute, pivot, unpivot, join, concat)
  contexte.ts              contexte, facettes, recherche, synchro d'URL — joués AU CLAVIER
                             ET À LA SOURIS
  canari.ts                LE CANARI : un contrôle par piège payé par le banc, chacun citant
                             le registre (constats) — la première chose à rejouer
  gel.ts · gel/            les contrôles GELÉS : les échecs vivants au verdict bibliothèque,
                             copiés depuis out/gel/, rouges sans réseau jusqu'au correctif
  delegation.ts            l'invariant de délégation : mêmes chiffres, serveur ou client
  export-studio.ts         les tableaux de bord produits par l'export du Studio
  affichages.ts            le RENDU : formats fr-FR, seuils, classes de choroplèthe,
                             pagination, export CSV, résumé de carte
  banc.ts                  contrôles VIVANTS de cas venus du banc open-data-viz, hors
                             reprise de balisage d'une page
  banc-adaptateurs.ts      contrôles VIVANTS, un par adaptateur public
  banc-pages.ts            contrôles VIVANTS repris des PAGES du banc, un ou plusieurs par
                             reproduction, chacun citant les constats du registre qu'il rejoue
                             (champs `page` et `constats` du Check)

  jeux/                        LES LIGNES : un jeu = un fichier JSON (tableau d'objets, une
                               ligne par enregistrement), lu par les fixtures, par l'oracle,
                               par le banc et par tout autre langage ; jeux/README.md dit
                               pour quoi chaque jeu a été taillé (#879)
  fixtures.ts                  le faux serveur commun (ODS, Tabular, tableau nu) sur les
                               jeux partagés (territoires, mesures, regions)
  fixtures-adaptateurs.ts      les faux serveurs du domaine `adaptateurs` (Melodi, Grist, JSON)
  fixtures-transformations.ts  les jeux servis en `data` inline (aucun faux serveur)
  fixtures-contexte.ts         le faux serveur ODS du domaine `contexte`
  fixtures-delegation.ts       les balisages du lot délégation (paires avec / sans server-side)
  fixtures-export-studio.ts    les documents exportés — SEUL fichier autorisé à importer la lib
  fixtures-affichages.ts       le faux serveur du domaine `affichages`
  fixtures-canari.ts           le faux serveur du canari — tableau nu, export et /records ODS
                               sur canari.json, canari-ref.json (doublon de clé) et
                               canari-volume.json (1 001 lignes, graine 42)

tools/oracle/            LE MOTEUR
  manifest.ts              la grammaire (types seuls) : Feed, Step, Expect, Check
  compute.ts               le recalcul en tableaux nus
  expression.ts            l'évaluation des colonnes calculées, RÉÉCRITE à part
                             (seconde implémentation de la grammaire ADR-105)
  observe.ts               les lecteurs d'observation, exécutés DANS la page
  expected.ts              l'attendu d'un contrôle, depuis ses lignes brutes
  stabilite.ts             attendre qu'une observation ne bouge plus (pas de sommeil fixe)
  compare.ts               observé contre attendu → un Constat
  raw.ts                   les deux alimentations, et le cache de téléchargement par run
  report.ts                le rapport (out/report.json + out/report.txt)
  banc.ts                  le MÊME rapport rangé par page reproduite et par constat du
                             registre du banc (out/banc.md)
  run.ts                   `verif:expected` — l'attendu du mode vivant
  manifests.ts             `verif:manifests` — la projection des contrôles déterministes en
                             out/manifests.json, pour la troisième voix (racine de composition)
  troisieme-voix.ts        lit tests/verif-donnees/attendus.json et rend chaque entrée sous la
                             forme d'un Attendu, pour que comparer() mette la page en regard de
                             l'oracle Python comme de l'oracle TS
  invariants.ts            les INVARIANTS (#881) : la référence depuis les lignes brutes,
                             l'évaluation sur ce que la page montre
  crosscheck.ts            le RECOUPEMENT SERVEUR (#883) : validation des clauses, URL d'export
                             agrégé, quota par portail, accord et verdict à trois chiffres
  fraicheur.ts             le VERDICT D'UNE NUIT ROUGE (#884) : empreinte du jeu, date de
                             traitement du portail, bibliothèque / donnée / indéterminé
  gel.ts                   le GEL d'un échec : un contrôle vivant devient un contrôle figé,
                             sans clé, servi par le faux serveur gel.verif.invalid

tools/oracle-py/         LA TROISIÈME VOIX (Python standard, aucune dépendance)
  oracle.py                lit out/manifests.json et jeux/*.json, recalcule en Fraction,
                             écrit tests/verif-donnees/attendus.json (versionné) et
                             out/attendus-provenance.json (la version de l'interpréteur,
                             HORS de la zone gardée par `git diff --exit-code`)

tests/verif-donnees/attendus.json   LES ATTENDUS FIGÉS de la troisième voix — une entrée par
                             observation, committés, régénérés par `npm run verif:attendus`

tests/oracle/            LES TESTS DU MOTEUR (Vitest)
  guard.test.ts            l'indépendance, sur tout le graphe d'imports
  compute.test.ts · expression.test.ts · transformations.test.ts   le recalcul
  observe.test.ts          le contrat des lecteurs, sur un DOM minimal
  jeux.test.ts             les jeux JSON : chacun lu par un contrôle, chaque feed venu d'un jeu,
                             territoires.json égal au jeu du harnais
  attendus.test.ts         LA RENCONTRE TS ↔ Python : chaque valeur couverte au même endroit à
                             six décimales et au même arrondi, sans navigateur
  oracle-py.test.ts        le garde de la troisième voix : ni sous-processus, ni node, ni
                             packages/, rien hors de la stdlib
  invariants.test.ts       les six sortes d'invariants, tenues et violées en tableaux nus
  canari-ops.test.ts       les deux opérations venues du canari : explode et eq-strict
  crosscheck.test.ts       le recoupement serveur : ce que le serveur ne sait pas dire (refusé
                             sur tous les manifestes), l'URL écrite à la main, le quota qui coupe,
                             l'accord par clé, les cinq verdicts
  report.test.ts           le résumé du rapport : verdicts comptés, serveur muet compté à part
  fraicheur.test.ts        l'empreinte, la date lue une fois par jeu (jamais inventée), les verdicts
  gel.test.ts              le gel : réécriture du balisage, secrets retirés, faux serveur, relecture
  banc.test.ts             le rendu de out/banc.md, sur des fiches données à la main
  compare-urls.test.ts · compare-diagnostics.test.ts · raw.test.ts · stabilite.test.ts

e2e/verif-donnees.spec.ts  le seul spec : charge les manifestes, rend, observe, compare,
                             et passe au moteur les fiches dont `tools/oracle/banc.ts` a
                             besoin pour rendre out/banc.md (le moteur
                             n'importe JAMAIS les manifestes — garde d'indépendance)
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
| `lireDiagnostics` | ce que la bibliothèque a DIT — le marqueur `data-dsfr-config-error` d'un élément et le journal de ses `console.warn` / `console.error` — ou tu (voir « Les silences ») |

`lireUrls` et `lireDiagnostics` sont les deux seuls qui ne portent pas sur un chiffre : deux balisages peuvent
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

## Les silences

Une seule journée du banc d'essai (18/09, `viz/barometre-france-num-v2`) a
produit trois chiffres faux de la même famille — **faux, plausibles, et sans
aucune erreur** : un `sources="a,b"` lu comme un seul id qui ne désigne rien
(les sommes portaient sur toutes les régions cumulées), une source qui devait
suivre un contexte et n'y était pas déclarée (« 5 724 % »), une soustraction
sur une cellule absente classée « −85,2 points ». Aucun test unitaire ne les
voit (chaque unité marche), aucun e2e (la page se rend), et jusqu'ici aucun
contrôle de l'oracle ne savait **exiger qu'il y ait eu un mot**.

C'est ce que fait l'`Expect` `diagnostic` (#878), lu par `lireDiagnostics` :

```ts
{ kind: 'diagnostic', id: 'ctx', expect: 'warning', contains: 's-etab,s-budg' }
{ kind: 'diagnostic', id: 'ctx', expect: 'silence' }
```

Deux canaux sont lus dans la page. Le **marqueur** `data-dsfr-config-error`
que `reportConfigError` pose sur l'élément fautif (`config-error`), et le
**journal** des `console.warn` / `console.error` — tenu par la page de fixture
AVANT le chargement de la bibliothèque, exactement comme le journal des URL,
parce que les validations partent dès le `connectedCallback`. Le lecteur ne
retient que les messages qui nomment la bibliothèque (`dsfr-data-…`) : un
avertissement de Lit ou un 404 de tuile n'est pas un diagnostic. `warning`
exige au moins un message (portant `contains` s'il est donné) ; `silence`
exige les deux absences, restreintes au fragment s'il y en a un — un
avertissement légitime sur un autre sujet ne rompt pas le silence attendu.

Comme les URL, l'attendu n'est pas recalculé depuis les lignes : c'est le
contrôle qui l'énonce. Un silence **constaté** compte pour deux comparaisons
(les deux canaux ont été lus), jamais zéro : le spec refuse un constat vide,
et un silence est précisément ce qu'il faut pouvoir constater. Le diagnostic
se place **en dernier** dans `expects`, après les chiffres qu'il qualifie :
quand ceux-ci ont fini de bouger, la page a eu le temps de parler.

Ce que les trois cas ont donné :

| Cas du 18/09 | Contrôle | Verdict |
|---|---|---|
| `sources` à virgule | `contexte/ctx-sources-separateur-virgule` | **défaut**, en attente : k-pop lib 38 350 / oracle 13 550, k-montant 14 000 / 5 000, et aucun mot. Le témoin `ctx-sources-separateur-espace` (même balisage, écrit juste) est vert et silencieux. |
| soustraction sur `null` | `transformations/pivot-normalize-soustraction-sur-null` | **vert** : le pivot émet `null`, `compute` le propage, la question non reposée est hors du top 3 et sa cellule est vide. **Le −85,2 venait de la page, pas de la bibliothèque** — la mutation `null → 0` dans `numberish` (`shared/utils/compute.ts`) reproduit exactement le chiffre du banc (« ligne 4 (teletravail) / delta : lib −85.2, oracle — »). |
| source hors contexte | `banc-pages/barometre-v2-source-suit-son-contexte` (vivant) | **vert** : 28,3 % en Bretagne, et 30 215 % dès que `det-prof` sort du `sources` du contexte `profil`. Erreur d'auteur que la bibliothèque ne peut pas deviner : ce que le dispositif garde, c'est le chiffre de la page réelle, et la mutation se fait par le balisage. |

## Les invariants

Un contrôle par valeur ne garde que ce qu'on a pensé à recalculer. Un
**invariant** (#881) garde une propriété qui doit tenir quel que soit le jeu :
la somme d'une colonne ne change pas en traversant une jointure gauche sur clé
unique ; un pivot puis un dépliage rendent le compte de lignes de départ ; un
groupe `null` est visible ou exclu, jamais fondu dans un autre ; une part est
dans `[0 ; 100]` ; une cellule absente en amont ne devient pas une valeur en
aval ; un jeu tronqué par `max-records` le **dit**. Les trois chiffres faux du
18/09 violaient chacun un invariant sans qu'aucun contrôle par valeur n'ait
été écrit pour eux.

**Un invariant se pose sur les lignes brutes, jamais sur l'attendu.** Sa
référence est calculée depuis les lignes brutes du contrôle
(`referenceInvariant`, `tools/oracle/invariants.ts`) — la somme brute d'une
colonne, le nombre de lignes brutes, les absents — et vit dans
`ExpectedCheck.invariants` (quelques nombres, donc `out/expected.json` en mode
vivant ne gonfle pas). L'évaluation porte sur ce que la page **montre**
(`evaluerInvariants`) : les lignes du cache pour `rows`, les cellules relues
pour `list`, les points pour `chart`, les valeurs pour `facets`, la valeur
affichée pour un KPI. Un invariant évalué contre l'attendu recalculé ne dirait
rien de plus que la valeur.

```ts
{ kind: 'rows', id: 'j-left', key: […], columns: ['valeur', 'poids'], pipeline: […],
  invariants: [{ kind: 'count-preserved' }, { kind: 'sum-preserved', field: 'valeur' }] }
```

| Invariant | Ce qu'il tient | Posé sur |
|---|---|---|
| `sum-preserved` (`field`, `from?`) | somme émise = somme brute, sur un ou plusieurs jeux | `jointure-left`, `concat-schemas-identiques`, `pivot-unpivot-aller-retour` |
| `count-preserved` (`from?`) | autant de lignes émises que de lignes brutes | les mêmes |
| `count-equals` (`n`) | exactement `n` lignes | `jointure-inner` (3 paires) |
| `null-group` (`field`, `expect`, `count?`) | `visible` : une ligne à clé vide existe et son compte vaut les lignes brutes sans valeur ; `excluded` : aucune, et la somme des comptes vaut les lignes brutes AVEC valeur — clé `''` d'un client, `null` d'un serveur (PG-015) | `groupby-groupe-null-visible`, `qualite-tourisme-group-by-null-exclu` (vivant) |
| `bounded` (`field?`, `min?`, `max?`) | toute valeur numérique — ou la valeur d'un KPI — dans les bornes ; rien à borner est un échec | `format-pourcentage-et-unite`, `personnels-colleges-part-ponderee` (vivant) |
| `null-stays-null` (`field`, `rawField?`, `key?`) | aucune absence en amont devenue valeur en aval, ligne à ligne par clé, ou par compte | `compute-arithmetique-absence-et-division-par-zero` |
| `not-truncated` | autant de lignes reçues que de lignes brutes — OU un diagnostic (lecteur de silences) ; sur un KPI, c'est sa valeur qui compte | `ods-plafond-max-records`, `ods-plafond-sans-compteur` (**en attente**), `plan-de-relance-plafond-max-records` (vivant, **en attente**) |

Le rapport compte les invariants **à part** des valeurs (« invariants : 12
tenus, 0 violé, 1 en attente ») ; une ligne d'invariant s'écrit
`<clé d'attente>#<kind>[:champ]`, avec `lib` (ce que la page montre) et
`brut` (ce que les lignes brutes disent). Un invariant en attente (`skip`
sur l'invariant, avec les deux chiffres) est évalué et rendu `ATT.`, jamais
bloquant. La troisième voix connaît les invariants aussi : `oracle.py` écrit
leur référence et dit si son **propre** recalcul les tient (`tenu`), et
`attendus.test.ts` exige que les références soient les mêmes des deux côtés —
un invariant que l'oracle viole lui-même est mal posé.

**Ce que `not-truncated` a appris** (AM-002, mesuré le 2026-09-19) — la
prémisse « `max-records` tronque en silence » se découpe en trois cas :

| Cas | La bibliothèque dit-elle quelque chose ? | Contrôle |
|---|---|---|
| mode `/records`, un KPI `count` en aval | **oui** — « `value="count"` sur "s-cap" compte 120 lignes reçues, mais l'amont en détient 137 » (#659, `meta.total`) | `ods-plafond-max-records` : tenu par le diagnostic |
| mode `/records`, sans KPI `count` (somme, graphique) | **non** — la source charge un tronçon sans un mot | `ods-plafond-sans-compteur` : **en attente**, 120 lignes sur 137 |
| `fetch-mode="export"`, même avec un KPI `count` | **non** — l'export ne porte pas de total, `meta.total` est absent, le KPI ne peut rien dire | `plan-de-relance-plafond-max-records` (vivant) : **en attente**, 1 000 lignes sur 3 080 |

Deux invariants en attente, une seule demande : un mot de la **source** quand
`max-records` borne un jeu qui le dépasse, export compris. Issue à ouvrir par
la supervision.

## Le canari

Le registre du banc porte une famille de pièges qui se ressemblent tous : une
valeur qui **a l'air** d'une autre. `null` et `0`, `'01'` et `1`, un libellé
en NFC et en NFD, une clé qui apparaît deux fois à droite, un champ
multivalué, un jeu de 1 001 lignes derrière un plafond de 1 000. Le canari
(#882) est **un jeu de quarante lignes écrites à la main** — `jeux/canari.json`,
chaque ligne décrite dans `jeux/README.md` —, une table de droite à doublon,
un jeu de volume engendré à graine, et **treize contrôles** dans
`tests/verif-donnees/canari.ts`, un par piège, chacun citant le registre
(`constats`) et nommant le contrôle existant qui couvrait déjà le cas plutôt
que de le dupliquer. C'est la première chose qu'un contributeur rejoue.

| Piège | Contrôle | Ce qu'il tient |
|---|---|---|
| `null` ≠ `0` ≠ `''` | `canari-absence-nest-pas-zero` | somme et moyenne sur les seuls nombres ; un quotient dont l'opérande est absent reste absent (`null-stays-null`) |
| décimale française | `canari-decimale-fr` | `'1 234,5'` vaut 1 234,5, en somme comme ligne à ligne |
| zéro de tête | `canari-zero-de-tete-jointure`, `canari-zero-de-tete-contexte` | `'01'` n'est pas `'1'` en jointure ; un contexte émet `code = "1"` et le serveur compare la **forme** du code (`eq-strict`) |
| clés de types différents | `canari-cles-types-differents` | `1` et `'1'` s'apparient — quinze couples, ni plus ni moins |
| groupe null | `canari-groupe-null-client`, `canari-groupe-null-serveur` | visible sous `''` chez le client, sous `null` chez le serveur, compté, jamais fondu |
| accents et formes Unicode | `canari-accents-nfc-nfd` | NFC et NFD font DEUX groupes (aucune normalisation n'est promise) ; la recherche replie tout et trouve les trois |
| doublon de clé | `canari-jointure-doublon` | 42 lignes pour 40, somme gonflée de 20 : `count-preserved` et `sum-preserved` **violés par les données**, rendus en attente |
| champ multivalué | `canari-multivalue` | la facette éclate (eau 16, air 13, sol 10 — étape `explode` de l'oracle), le regroupement client compte les combinaisons |
| plafond | `canari-plafond-export` | mille lignes sur 1 001, et aucun mot : `not-truncated` en attente (AM-002) |
| dates partielles | `canari-date-partielle` | un filtre d'ordre compare en texte : « 2024 » ≤ « 2024-03 » < « 2025 » |
| `distinct` | `canari-distinct` | ni les vides ni les doublons ; `'1'` et `1` sont une modalité, `'01'` une autre |

Ce que le canari a **appris en s'écrivant** — trois faux pas d'auteur, tous
silencieux, tous sans erreur console : un KPI `champ:count` compte **tous** les
enregistrements (la doc le dit ; « renseigné » s'écrit `where="champ:isnotnull"`,
qui ne voit que `null`, une chaîne vide étant une valeur) ; les clauses d'un
`where` se séparent par une **virgule**, et un `AND` devient la fin de la valeur
(deux dates de 2025 passaient un `date:lt:2025 AND …`) ; le faux serveur ODS
compare la forme texte d'un code, comme le portail. La troisième voix couvre
**les trente attentes** du canari : aucun `derive`, le quotient passe par
`ratio`.

## Le recoupement serveur

Une vérité gratuite que personne n'utilisait : **le serveur Opendatasoft sait
agréger**. Pour tout calcul qu'une page fait côté client sur une source ODS —
un compte, une somme, une moyenne, par groupe ou globale, sous une clause —
le portail produit le même chiffre (`/exports/json?select=sum(x) as v&group_by=k
&where=…`) par une implémentation **tierce** : un autre éditeur, un autre
langage, les mêmes lignes. C'est l'indépendance la plus forte qu'on puisse
avoir, et elle coûte une requête. Le domaine `delegation` vérifie déjà
« mêmes chiffres, serveur ou client », mais contre un faux serveur de notre
main ; le recoupement (#883) le fait contre le vrai, en mode **vivant** seulement.

```ts
{ kind: 'kpi', id: 'k-etp', agg: 'sum', field: 'etp_total',
  crosscheck: { select: 'sum(etp_total) as v' } }
{ kind: 'rows', id: 'q-secteur', key: 'secteur', columns: ['ips_moyen', 'nb'], pipeline: […],
  crosscheck: { select: 'avg(ips) as ips_moyen, count(uai) as nb', groupBy: 'secteur' } }
```

Les clauses s'écrivent **à la main** (`Crosscheck`, `manifest.ts`), jamais
traduites par l'adaptateur — les alias et le backquotage sont précisément ce
que le banc a payé (PG-014, PG-027, BUG-010). Le `where` est celui de la source
brute, sauf clause écrite ; un KPI qui filtre lui-même doit l'écrire. Un KPI
se recoupe par **un** agrégat aliasé `v` ; des lignes par un agrégat par
colonne, aliasé de son nom, et un `group_by` qui devient la clé — comparées
**par clé**, le serveur ne rendant pas ses groupes dans l'ordre de la page.

**Ce que le serveur ne sait pas dire**, refusé par `validerCrosscheck` et
éprouvé sur tous les manifestes (`tests/oracle/crosscheck.test.ts`) :
`count(distinct)` (approximatif dès quelques centaines de valeurs, PG-026),
`total_count` d'une requête agrégée (LIM-002), les fonctions de date et le
fuseau dans ce qu'il calcule (FP-003, AM-064 — dans un `where`, elles filtrent
l'export et l'agrégat de la même façon, côté serveur des deux fois), et tout
ce qui vient d'une jointure, d'un pivot ou d'un `compute` : le serveur ne
connaît qu'un jeu. Le groupe `null` : ODS le rend, le client rend `''` — une
comparaison par clé les distingue, et c'est un « recoupement à qualifier ».

**Le verdict à trois chiffres**, énoncé par `verdictRecoupement` et rendu tel
quel au rapport et dans `out/banc.md` :

| oracle = serveur | lib = oracle | lib = serveur | Verdict |
|---|---|---|---|
| oui | oui | — | juste, **trois voix** |
| oui | non | non | **bibliothèque** |
| non | oui | non | recoupement à qualifier (sémantique ODS : null, fuseau, arrondi) — jamais un échec de la lib |
| non | non | oui | **oracle** — c'est le recalcul qui se trompe seul |
| non | non | non | donnée en mouvement entre les deux téléchargements, ou clause fausse : rejouer (lot 7) |

**Quota.** `x-ratelimit-remaining` est lu sur chaque réponse ; sous 500
requêtes restantes sur un portail, le recoupement s'arrête **pour ce portail**
et le rapport le dit (« quota : … — recoupement arrêté »). `data.sports.gouv.fr`
plafonne à 5 000 requêtes par jour et par IP en anonyme ; un recoupement ajoute
une requête par observation recoupée, en cache par URL pour le run. Jamais de
clé d'API dans le dépôt : les jeux qui en exigent une restent hors
recoupement. Le décompte par portail est écrit sur la sortie de
`verif:expected` et dans `expected.json` (`recoupement`).

Posé sur **25 observations** de `banc.ts` et `banc-pages.ts` — comptes, sommes,
moyennes, un minimum, un maximum, et un regroupement par secteur ; Qualité
Tourisme, plan de relance, comptabilité générale (le KPI filtré écrit sa
clause), BOFiP, Baromètre v2, personnels des collèges, Euroscol, TNE,
assistants de langues, IPS des écoles, contrôle technique, Tourisme &
Handicap, fédérations sportives, IPS des collèges.

## Le verdict d'une nuit rouge, et le gel

Le point qui fait vivre ou mourir un dispositif de ce genre : **que fait-on
d'une nuit rouge ?** Le mode vivant tient l'ADR-122 — les deux côtés lisent
la même API « au même instant » —, mais « au même instant » vaut quelques
minutes (`verif:expected` puis le spec), et un jeu mis à jour entre les deux
donne un écart qui n'est ni un bug ni une donnée fausse. Un contrôle vivant
qu'il faut interpréter le matin est un contrôle qu'on finit par ignorer.

**L'empreinte** (#884, `tools/oracle/fraicheur.ts`). Au calcul de l'attendu,
`verif:expected` note pour chaque contrôle vivant le nombre de lignes brutes,
un SHA-256 de leur forme JSON et la date de traitement que le portail publie
(`metas.default.data_processed` de `/api/explore/v2.1/catalog/datasets/{id}`)
— `ExpectedCheck.fingerprint`. Sur un **écart**, le spec relit cette date
(une requête, en cache par jeu) et tranche :

| Verdict | Quand | Ce que fait le spec |
|---|---|---|
| **bibliothèque** | la date n'a pas bougé | l'échec est **gelé** : `tools/oracle/out/gel/<id>-gel.json`, un contrôle déterministe prêt à committer |
| **donnée, rejoué** | la date a bougé entre l'attendu et l'observation | le contrôle est **rejoué une fois**, dans le même run, sur un attendu recalculé depuis les lignes retéléchargées ; seul le second passage est rendu |
| **indéterminé** | pas de date d'un côté ou de l'autre (Tabular, Melodi, un export sans catalogue) | l'écart reste, le verdict le dit — jamais une date inventée |

Le rapport texte **commence** par le décompte des verdicts (« Verdicts de la
nuit — 1 × « bibliothèque », … »), chaque constat porte `nuit : …`, et
`out/banc.md` l'ajoute à sa colonne Verdict.

**Le gel** (`tools/oracle/gel.ts`). Le fichier gelé porte les lignes brutes
téléchargées (en fixtures), le balisage — chaque `base-url` réécrite vers
`https://gel.verif.invalid/<id>`, les attributs `api-key-ref` et `headers`
**retirés** : un gel n'emporte jamais une clé —, les attentes (sans
`crosscheck`, qui n'a pas de sens hors ligne), la page et les constats du
banc, et une `provenance` (contrôle d'origine, date, écarts, réserves). Le
copier sous `tests/verif-donnees/gel/` suffit : le domaine `gel` le charge
(`tests/verif-donnees/gel.ts`), le faux serveur `repondreGel` sert l'export,
`/records` et `/facets` depuis ses lignes avec les répondeurs ODS du harnais,
et le contrôle tourne sur chaque PR, sans réseau, rouge jusqu'au correctif,
vert ensuite. Le matin, la question n'est plus « est-ce la lib ? » mais « ce
contrôle figé est-il rouge sur `main` ? ». Une clause que le faux serveur ne
sait pas lire (`year(…)`, `in (…)`, `search(…)`) est nommée dans
`provenance.reserves` : le gel est écrit quand même, et dit ce qu'il ne
saura pas rejouer.

**Le bruit.** `--retries=1` reste sur `oracle.yml` ; un contrôle qui a
échoué puis réussi au retry est compté à part (« instable », `Constat.instable`,
jamais fondu dans le vert). Trois instabilités sur le même contrôle en un
mois ouvrent une issue sur le contrôle lui-même.

**Pour éprouver le verdict « donnée » sans attendre qu'un portail republie** :
`VERIF_SIMULER_DONNEE=<id>` fait lire, après l'observation, une date
différente pour ce contrôle — le rejeu se voit au rapport.

### La règle de vie

Une nuit rouge est traitée **sous 24 h**, et n'a que deux sorties :

1. **gelée** — verdict bibliothèque : le fichier de `out/gel/` est copié sous
   `tests/verif-donnees/gel/`, committé, et une issue `verif-donnees` est
   ouverte ; le contrôle figé est rouge sur `main` jusqu'au correctif ;
2. **requalifiée** — verdict donnée (rejoué vert), clause de manifeste
   périmée, jeu supprimé ou déplacé : le contrôle vivant est mis à jour, ou
   mis en `skip` avec sa raison et ses deux chiffres.

**Jamais un troisième état.** Un contrôle vivant rouge depuis plus d'une
semaine est un défaut du dispositif, pas du portail.

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

**Une pagination fausse ne se voit jamais sur la page 1** : le contrôle ouvre donc la page de
fixture sur `?page=2` (`Check.query` + `url-sync`), un lien profond étant un chemin d'affichage à
part entière.

## Ajouter un contrôle

1. Choisir le domaine : `tests/verif-donnees/banc-pages.ts` si le contrôle reprend le balisage
   d'une reproduction du banc — il porte alors `page` et `constats` —, `banc.ts` ou
   `banc-adaptateurs.ts` si le cas vit contre une vraie API sans venir d'une page du banc, sinon
   le fichier du domaine déterministe concerné. Ou créer un fichier et l'ajouter à `index.ts`.
2. Écrire le `Check` : `mode`, `origin` (d'où vient le cas, quelle issue le motive), `feed`,
   `markup`, `expects`. Les clauses d'un contrôle vivant s'écrivent **à la main** dans le
   manifeste, jamais traduites par la lib — clause ODSQL d'une `RawSource`, URL complète et
   chemins d'extraction d'une `RawUrlSource` (voir « Les deux modes » ci-dessus). Les lignes
   d'un contrôle déterministe vivent dans `tests/verif-donnees/jeux/<nom>.json` — jamais en
   littéral dans un manifeste ni une fixture (`tests/oracle/jeux.test.ts` le refuse) — et
   `jeux/README.md` dit pour quoi le jeu est taillé.
3. Si le calcul attendu demande une opération que `compute.ts` ne sait pas faire, l'ajouter là —
   en tableaux nus, sans rien emprunter à la lib — et l'éprouver dans `tests/oracle/compute.test.ts`.
4. `npm run verif`, puis **prouver la mutation** (ci-dessous). Un contrôle qui ne peut pas échouer
   ne garde rien.

## Prouver une mutation

Un contrôle vert ne dit rien tant qu'on ne l'a pas vu rouge sur le défaut qu'il garde.

```bash
# 1. injecter le défaut dans la lib
#    (exemples éprouvés pour chaque domaine, voir le tableau plus bas)
# 2. rejouer le seul contrôle visé
npx playwright test --config e2e/playwright.config.ts e2e/verif-donnees.spec.ts \
  --project=chromium -g "<id du contrôle>"
# 3. retirer le défaut
git checkout -- <fichier>
```

Un défaut posé dans `packages/shared/src` demande un **`npm run build:shared`** avant de rejouer :
la page charge `packages/shared/dist`, pas `src`.

### Mutations éprouvées, par domaine

Chaque ligne a été constatée en échec, puis le défaut retiré.

| Domaine | Mutation injectée | Contrôle(s) qui tombent | Ce que dit l'échec |
|---|---|---|---|
| query | `readersOf()` rend `[]` (`dsfr-data-query.ts`) | `source-partagee-765` | KPI affiché 7, recalculé 137 — exactement #765 |
| query | `computeEquals` réduit à `looseEquals` (`shared/utils/compute.ts`) | `compute-vide-nest-pas-zero` | 6 au lieu de 3 : la chaîne vide est comptée comme un zéro |
| query | `buildKey` réduit à `String(row[f] ?? '')` (`shared/utils/join.ts`) | `jointure-cles-vides` | 9 lignes appariées au lieu de 7 : deux clés vides s'apparient |
| adaptateurs | `break` après la première page (`opendatasoft-adapter.ts`) | `ods-records-pagination` | affiché 100, recalculé 137 — écart −37 |
| adaptateurs | `max-records` ignoré, plafond fixe à 1 000 (`opendatasoft-adapter.ts`) | `ods-plafond-max-records` | affiché 137, recalculé 120 — écart 17 |
| transformations | `gte` réduit à `gt` (`dsfr-data-query.ts`) | `where-gt-gte` | KPI à 4 au lieu de 5 : la borne elle-même tombe du filtre |
| transformations | repli lexicographique retiré de `_compareForRange` (`dsfr-data-query.ts`) | `where-paire-mixte-nombre-et-texte` | KPI à 5 au lieu de 9 : les « NC » disparaissent du filtre au lieu d'être rangés en texte |
| transformations | `countDistinct` compte la chaîne vide (`core/utils/aggregations.ts`) | `agregat-distinct-exclut-les-vides` | 2 modalités au lieu de 1 : une absence devient une modalité |
| transformations | `a / b` rend l'infini au lieu de `null` (`shared/utils/compute.ts`) | `compute-arithmetique-absence-et-division-par-zero` | « valeur » affiché là où l'oracle dit « sans valeur » |
| transformations | `toBoolean` ignoré dans `_applyFold` (`dsfr-data-normalize.ts`) | `normalize-fold` | « moteur+visuel » affiché pour une ligne qui n'a que l'un des deux |
| transformations | `last` rend la première observation (`shared/utils/pivot.ts`) | `pivot-first-et-last` | cellule à 12 au lieu de 8 : `first` et `last` se confondent |
| transformations | `buildKey` retire les zéros de tête (`shared/utils/join.ts`) | `jointure-ecart-de-graphie-792` | 3 lignes appariées au lieu de 2 : « 1 » apparie « 01 » |
| transformations | les agrégats de fenêtre appliqués APRÈS `limit` (`dsfr-data-query.ts`, déplacer le bloc « 3 bis » sous le `slice`) | `agregat-part-du-total-avant-limit` (`agregat-part-du-total-926` reste vert) | part de la zone « sud » : lib 50,197 %, oracle 38,873 % — le top 2 se redistribue à 100 %, et les deux chiffres sont plausibles (#926) |
| transformations | `received` empilé à l'envers (`dsfr-data-concat.ts`) | `concat-schemas-identiques` | premier montant à 15 au lieu de 10 : l'ordre d'empilement n'est pas tenu |
| contexte | whereKey réduit à `this._uid` (`dsfr-data-context.ts`) | `ctx-deux-filtres-and` | 8 au lieu de 3 : deux filtres partagent une clé, le dernier gagne (ADR-031) |
| contexte | `localIsoDate` → `isoDate` dans `current-month` (`dsfr-data-context-filter.ts`) | `ctx-current-month` | 5 au lieu de 4 : à 00 h 30 à Paris le 1er juin, l'UTC filtre encore mai |
| contexte | `dayAfter` sans `+1` (`dsfr-data-context-filter.ts`) | `ctx-lt-day-after` | 8 au lieu de 9 : le jour choisi n'est plus inclus |
| contexte | `_fieldMissingOn` rend `false` (`dsfr-data-context.ts`) | `ctx-champ-absent-805` | 0 au lieu de 4 : la source sans la colonne est vidée au lieu d'être exclue |
| contexte | `_syncUrl` n'écrit que le premier filtre (`dsfr-data-context.ts`) | `ctx-url-deux-navigations` | 8 au lieu de 3 : l'URL ne rejoue pas tout le filtre |
| contexte | `_getDataFilteredExcluding` rend `_rawData` (`dsfr-data-facets.ts`) | `facettes-croisees` | l'ordre et les compteurs de la seconde facette ne suivent plus la sélection |
| contexte | `rowWeight` rend `1` (`components/facets/facets-client.ts` — ex-`_rowWeight` de `dsfr-data-facets.ts`, #838) | `facettes-poids` | compteur 8 au lieu de 339 : un nombre de lignes sous un libellé de somme |
| contexte | `isDisjunctive` privé de `disjunctive` (`dsfr-data-facets.ts`) | `facettes-disjonctives` | 7 au lieu de 15 : la seconde valeur remplace la première |
| contexte | `_urlReadableFields` rend toutes les colonnes (`dsfr-data-facets.ts`) | `facettes-url-params-bornes` | 2 au lieu de 7 : un paramètre d'URL étranger devient un filtre (#773) |
| contexte | relance directe rétablie sans condition dans `_afterSelectionChange` (`dsfr-data-facets.ts`, retirer `if (!this._sourceRefetchedByContext())`) | `tests/context-facets-search.test.ts` › `#840 — un seul appel /facets par clic` (vitest, pas un contrôle du filet : ce que compte la mutation est un nombre de requêtes, pas un chiffre affiché) | 2 appels `/facets` par clic au lieu de 1 — le premier annulé par `_facetsAbort`, donc invisible, mais payé |
| contexte | `_normalize` sans `stripAccents` (`dsfr-data-search.ts`) | `recherche-accents`, `recherche-compte` | 0 au lieu de 1 : « sete » ne trouve plus « Sète » ; et « 0 résultats » au lieu de 10 |
| contexte | un `console.warn` ajouté dans `_validate()` (`dsfr-data-context.ts`), nommant la valeur reçue de `sources` | `ctx-sources-separateur-espace` tombe sur `diagnostic:ctx:silence` (« la bibliothèque a parlé : [warn] dsfr-data-context[ctx]: … sources reçu « s-etab s-budg » ») ; et sur `ctx-sources-separateur-virgule` rejoué hors `skip`, `diagnostic:ctx:warning « s-etab,s-budg »` PASSE pendant que les deux KPI restent rouges — le lecteur de silences éprouvé dans les deux sens | un silence attendu tombe dès que la bibliothèque parle ; un mot attendu passe dès qu'elle le dit |
| transformations | `numberish` rend `0` pour `null` / `undefined` (`shared/utils/compute.ts`) | `pivot-normalize-soustraction-sur-null` | « ligne 4 (teletravail) / delta : lib −85.2, oracle — », puis « teletravail » en tête du top 3 et « mesuré » affiché pour une question non reposée : le chiffre du banc, reproduit à l'identique |
| delegation | `readersOf()` rend `[]` (`dsfr-data-query.ts`) | `source-partagee-ne-delegue-pas` | KPI affiché 0, recalculé 127 684 000 ; 7 groupes au lieu de 8 |
| delegation | `_onInstanceRegistered` sort sans renégocier (`dsfr-data-query.ts`) | au moins 5 : `query-tardive-renegociation`, `lecteur-tardif-renegociation`, `relais-normalize-devrait-deleguer`, `query/source-partagee-765`, `delegation/source-partagee-ne-delegue-pas` | la seconde query rend 1 ligne au lieu de 7 et le KPI 8 au lieu de 137 ; le lecteur tardif compte 8 groupes ; la délégation ne franchit plus le relais ; et sur une page pourtant STATIQUE, `kpi:k-partage` lib 8 / oracle 137 — les lecteurs écrits dans le document s'inscrivent après la première négociation de la query, c'est leur inscription qui la corrige (#836, #853, #855) |
| delegation | le bloc « `where` seul » de `_negotiateServerSide` neutralisé (`dsfr-data-query.ts`) | `where-seul-devrait-etre-delegue`, `require-where-filtre-par-delegation` | 0 URL sur 2 portent `where=` ; la source `require-where` n'affiche jamais rien, 30 s de scrutation (#856, #854) |
| delegation | `maxRecords` ignoré dans `fetchAll` (`opendatasoft-adapter.ts`) | `plafond-max-records-et-meta-total` | 137 lignes chargées au lieu de 50, somme 127 684 000 au lieu de 48 775 000 |
| export-studio | `dedicatedSourcePlan()` rend une Map vide (`shared/dashboard/export-html.ts`) | les 5 contrôles de source dédiée | plus aucun `group_by` ni `select` au serveur ; le KPI n'affiche plus rien |
| affichages | `map-summary-field` ignoré, retour à `_valueFieldKey()` (`dsfr-data-chart.ts`) | `carte-resume-champ-de-calcul-929` | lib 43,57, oracle 43,07 : le résumé repasse sur la colonne d'affichage arrondie, et le chiffre reste plausible (#929) |
| affichages | `toNumber` décale chaque nombre d'une unité (`shared/utils/number-parser.ts`) | 28 contrôles du domaine | mutation large : tout ce qui affiche un nombre recalculé tombe |
| affichages | `formatNumberFr` ignore `decimals` (`shared/utils/formatters.ts`) | `liste-decimales-des-cellules` | « 43,25 » ne vérifie plus `^-?\d+,\d{3}$` |
| affichages | `formatPercentage` cesse de poser `%` (`shared/utils/formatters.ts`) | `format-pourcentage-et-unite`, `kpi-evolution-en-pourcentage`, `kpi-tendance`, `kpi-lignes-secondaires` | « 41,0 » au lieu de « 41,0 % » : le chiffre est juste, la forme ne l'est pas |
| affichages | `formatCompact` perd `notation: 'compact'` | `format-compact` | affiché 15 909 531, recalculé 15,9 — écart 15 909 515 |
| affichages | `formatDate` rend la chaîne ISO | `format-date` | affiché « 2026-12-15 », recalculé « 15/12/2026 » |
| affichages | `evolution` divise par la dernière valeur | `kpi-evolution-en-pourcentage` | affiché 28,6 %, recalculé 40 |
| affichages | `countDistinct` rend `size + 1` | `kpi-distinct-et-count-filtre` | affiché 5, recalculé 4 |
| affichages | `last` lit la première ligne | `kpi-premiere-et-derniere-ligne` | affiché 120, recalculé 168 |
| affichages | `evaluateParsed` ignore `rowFilter` | `kpi-filtre-entre-accolades-776` | affiché 100,00 %, recalculé 23,46 (#776) |
| affichages | `meta:total` rend les lignes reçues | `kpi-meta-total-contre-count` | affiché 20, recalculé 137 — #659 |
| affichages | `getColorBySeuil` teste le seuil orange avant le vert | `kpi-seuils-de-couleur` | classe « --warning » alors que 41,02 appelle « --success » |
| affichages | `_getColor` ignore `color-token` | `kpi-couleur-forcee` | classe « --success » alors que la couleur est forcée |
| affichages | `_processTidyData` décale l'index de série | `graphique-series-field-format-long` | série 0, point 0 (Janvier) : graphique 310, oracle 120 |
| affichages | `_applyColorMap` ne repeint plus la légende (`dsfr-data-chart.ts`) | `graphique-color-map-pastilles-databox` | aucune pastille ne porte de couleur déclarée — #813 |
| affichages | `attrs['x-min']` (ou `horizontal`) n'est plus relayé | `graphique-bornes-des-axes`, `graphique-barres-horizontales-empilees` | l'attribut manque sur l'élément rendu |
| affichages | `_computeMapSummary` ignore `map-summary-weight` (`dsfr-data-chart.ts`) | `carte-resume-pondere-763` (le non pondéré reste vert) | résumé 41,02 au lieu de 43,07 — exactement #763 |
| affichages | `classifyValues` discrétise toujours en intervalles égaux (`shared/constants/dsfr-palettes.ts`) | `carte-classes-quantiles`, `carte-agregat-par-territoire` | première borne 27,5 au lieu de 26,5 |
| affichages | `equalIntervalBreaks` divise par `steps - 1` | `carte-classes-intervalles-egaux` | 4 entrées de légende, 5 classes recalculées |
| affichages | `parseManualBreaks` perd la première borne | `carte-bornes-manuelles` | 3 entrées de légende, 4 classes recalculées |
| affichages | `_getPaginatedData` repart de la ligne 0 (`dsfr-data-list.ts`) | `liste-page-deux` | la page 2 rend les lignes de la page 1 : « Vichy » au lieu de « Nancy » |
| affichages | le tri de `dsfr-data-list` rend toujours 0 | `liste-tri-numerique`, `liste-tri-croissant` | ligne 0 : affiché « Arles », recalculé « Vichy » |
| affichages | `localeCompare` remplacé par une comparaison de codes | `liste-tri-texte-accentue` | ligne 2 : affiché « Ussel », recalculé « Écully » |
| affichages | `parseColumns` ignore `columns-auto` | `liste-colonnes-auto` | ligne 0 / pop : affiché « », recalculé 4 187 254 |
| affichages | `buildCsv` met la clé en en-tête au lieu du libellé | `liste-export-csv` | ligne 0, cellule 0 : « zone » exportée, « Zone » recalculée |
| banc-pages | troncature retirée de `_fetchViaExport` (`opendatasoft-adapter.ts`) | `plan-de-relance-plafond-max-records` | 1 001 projets chargés au lieu de 1 000 : `max-records` ne borne plus rien |
| banc-pages | `meta:total` rend `items.length` (`core/utils/aggregations.ts`) | `bofip-total-publie-par-la-source-serveur` | 10 au lieu de 9 148 : le compteur annonce la page, pas le jeu |
| banc-pages | `_rowWeight` rend `1` (`dsfr-data-facets.ts`) | `ips-ecoles-facettes-ponderees` | l'ordre des départements change (Dordogne en tête au lieu de la Gironde) : une facette sur source pré-agrégée recompte des lignes, pas des écoles |
| banc-pages | `_parseOriginLabels` altère le libellé (`dsfr-data-concat.ts`) | `portrait-federation-union-de-deux-sources` | clé « OLYMPIQUES » empilée là où le manifeste déclare « Olympiques » |
| banc-pages | `buildKey` distingue nombre et chaîne (`shared/utils/join.ts`) | `barometre-jointure-couverture` | 0 question appariée au lieu de 119 : `code_unifie` est un nombre à gauche, une chaîne à droite (#792) |
| banc-pages | `diff` calculé à l'envers (`dsfr-data-query.ts`) | `tne-audiences-ecart-mensuel` | écart de −3 539 là où l'oracle lit +3 539 |
| banc-pages | mutation PAR LE BALISAGE : `bfnv2Markup('det-nat')` à la place de `'det-prof'` — la source de profil sort du `sources` du contexte `profil` (`tests/verif-donnees/banc-pages.ts`) | `barometre-v2-source-suit-son-contexte` (vivant) | « affiché 30 215,0 % (30215), recalculé 28.3 » : la part cumule toutes les régions, tous les secteurs, toutes les tailles — le « 5 724 % » du 18/09, sans un mot |
| troisième voix | `Math.round` → `Math.trunc` dans `roundTo` (`tools/oracle/compute.ts`) — un défaut de l'ORACLE TS, pas de la lib | `tests/oracle/attendus.test.ts` (Vitest, sans navigateur) | « arrondi TS 17768.68, Python 17768.69 (brut 17768.69) — convention d'arrondi » et « 331448, Python 331449 (brut 331448.5625) » : la rencontre voit un oracle qui se trompe seul |
| troisième voix | `distinct` compte la chaîne vide (`tools/oracle-py/oracle.py`) — un défaut de l'oracle PYTHON | `attendus.test.ts` | « agregat-distinct-exclut-les-vides/rows:q-dist ligne 1/modalites : écart 1 » — dans l'autre sens aussi |
| troisième voix | `gte` réduit à `gt` (`dsfr-data-query.ts`) — un défaut de la LIB | `where-gt-gte` au spec | **deux écarts sur la même observation** : « lib 4, oracle 5, écart −1, python 5, écart −1 — Python : affiché 4, recalculé 5 » |
| invariants | `buildKey` rend une constante (`shared/utils/join.ts`) — toute clé apparie toute clé | `jointure-inner#count-equals`, `jointure-left#count-preserved`, `jointure-left#sum-preserved:valeur` | 30 lignes au lieu de 3 et de 6 ; somme émise **1 050**, brute 210 : la somme gonflée d'une relation 1-N |
| invariants | une cellule sans observation émise à `0` au lieu de `null` (`shared/utils/pivot.ts`, `emitted[…] = 0`) | `pivot-unpivot-aller-retour#count-preserved` | 12 lignes émises, 10 brutes — « une cellule absente remplie par un zéro en ferait douze » |
| invariants | `numberish` rend `0` pour `null` (`shared/utils/compute.ts`) | `compute-arithmetique-…#null-stays-null:ecart`, `…:produit` | « « ecart » porte une valeur là où l'amont n'en avait pas : c4 → −4 », « produit … c4 → 0 » |
| invariants | le regroupement saute la clé vide (`dsfr-data-query.ts`, `if (key === '') continue`) | `groupby-groupe-null-visible#null-group:statut` | « aucun groupe vide » alors que 3 lignes brutes n'ont pas de valeur — le groupe null a disparu |
| invariants | `_warnPartialCount` muet (`dsfr-data-kpi.ts`) | `ods-plafond-max-records#not-truncated` | « 120 lignes, aucun diagnostic » sur 137 brutes — troncature silencieuse |
| invariants | `formatPercentage` ne divise plus par 100 (`shared/utils/formatters.ts`) | `format-pourcentage-et-unite#bounded` | « 4 102,1 % » : 1 valeur hors [0 ; 100] |
| canari | `numberish` rend `0` pour `null` (`shared/utils/compute.ts`) | `canari-absence-nest-pas-zero` | « 3 absent(s) devenu(s) valeur » sur 6 en amont |
| canari | `toNumber` garde les espaces de milliers (`shared/utils/number-parser.ts`) | `canari-decimale-fr` | somme 539,25 au lieu de 1 772,75, max 100 au lieu de 1 234,5 : « 1 234,5 » n'est plus un nombre |
| canari | `buildKey` retire les zéros de tête (`shared/utils/join.ts`) | `canari-zero-de-tete-jointure` | 50 lignes au lieu de 42 : « 01 » et « 010 » apparient « 1 » |
| canari | la jointure ne garde que le premier appariement (`shared/utils/join.ts`) | `canari-jointure-doublon#count-equals` | 40 lignes au lieu de 42 : le doublon disparaît en silence |
| canari | le regroupement saute la clé vide (`dsfr-data-query.ts`) | `canari-groupe-null-client` | 6 groupes au lieu de 7, « aucun groupe vide » |
| canari | l'adaptateur jette les lignes à valeur nulle (`opendatasoft-adapter.ts`, `_fetchViaExport`) | `canari-groupe-null-serveur` | 6 groupes au lieu de 7, « aucun groupe vide » |
| canari | `facetValuesOf` stringifie le tableau, « a,b » — l'ancien comportement d'avant #421 (`facets/facets-client.ts`) | `canari-multivalue` | 5 valeurs de facette au lieu de 3 |
| canari | `looseEquals` ne regarde plus dans le tableau — l'ancien comportement d'avant #953, `if (false && Array.isArray(a) …)` dans `packages/shared/src/query/filter-translator.ts` (puis `npm run build:shared`) | `canari-multivalue-where` | `tags:eq:eau` affiche 7 au lieu de 16, `neq` 33 au lieu de 24, `in` 11 au lieu de 21, et les deux écritures du KPI retombent à 7 |
| canari | `_compareForRange` sans repli lexicographique (`dsfr-data-query.ts`) | `canari-date-partielle` | 4 lignes au lieu de 32 : seules les dates réduites à l'année, numériques, survivent au filtre |
| canari | `countDistinct` compte la chaîne vide (`core/utils/aggregations.ts`) | `canari-distinct` | 28 codes au lieu de 27 |
| canari | `_normalize` sans `stripAccents` (`dsfr-data-search.ts`) | `canari-accents-nfc-nfd` | « 0 lignes » au lieu de 3 : « elancourt » ne trouve plus aucune des trois formes ; le regroupement, lui, ne normalise rien et n'a rien à muter |
| canari | (par construction) `fetch-mode="export" max-records="1000"` sur 1 001 lignes | `canari-plafond-export#not-truncated` | « 1000 lignes, aucun diagnostic » — en attente, AM-002 |
| recoupement | `sum` de l'ORACLE rend un de trop (`tools/oracle/compute.ts`, `aggregate`) — un défaut du recalcul, pas de la lib | `personnels-colleges-part-ponderee` / `kpi:k-etp`, `tne-personnels-formes-unpivot` / `kpi:k-tne-participants` (vivants) | « lib 289 592, oracle 289 593, serveur 289 592 — verdict : oracle ≠ serveur, lib = serveur : le recalcul se trompe seul » : c'est le **serveur** qui désigne l'oracle, la page n'y est pour rien |
| recoupement | `x-ratelimit-remaining` simulé sous le seuil (`tests/oracle/crosscheck.test.ts`) | `fetchAggregate` | le portail est coupé pour le run (`QuotaError`, « recoupement arrêté pour ce portail »), un autre portail ne l'est pas ; le résumé compte « n sans réponse du serveur » |
| nuit rouge | `meta:total` rend `items.length` (`core/utils/aggregations.ts`) sur le contrôle VIVANT `bofip-total-publie-par-la-source-serveur` | verdict **bibliothèque** | « Verdicts de la nuit — 1 × « bibliothèque » » ; « lib 10, oracle 9 148, serveur 9 148 » ; le gel `out/gel/bofip-total-publie-par-la-source-serveur-gel.json` est écrit — copié sous `tests/verif-donnees/gel/`, il est **rouge en `npm run verif` sans réseau** (« affiché 10, recalculé 9148 », aucune requête sortie du faux réseau) et **vert** une fois la mutation retirée |
| nuit rouge | `VERIF_SIMULER_DONNEE=bofip-total-publie-par-la-source-serveur` (date de traitement différente à la relecture), même mutation | verdict **donnée, rejoué** | « Verdicts de la nuit — 1 × « donnée, rejoué » » : le contrôle a été rejoué sur un attendu recalculé, et seul le second passage est rendu |

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

**En attente à ce jour** — un contrôle et deux invariants :

| Contrôle ou invariant en attente | Domaine | Défaut ou amélioration |
|---|---|---|
| `ctx-sources-separateur-virgule` | contexte | **défaut** (#878, cas 1) : `sources="s-etab,s-budg"` est accepté sans un mot — `_validate()` ne vérifie que la non-vacuité, `sourceIds` découpe sur les espaces, la commande part vers un id que personne n'écoute. Mesuré : k-pop lib 38 350 / oracle 13 550, k-montant 14 000 / 5 000, aucun marqueur, aucun message. Piste : étendre l'utilitaire de #772 à `sources`. Issue à ouvrir par la supervision. |
| `ods-plafond-sans-compteur#not-truncated` | adaptateurs | **défaut** (AM-002, #881) : `max-records="120"` sur 137 lignes, sans KPI `count` en aval — 120 lignes émises, aucun diagnostic. Seul un KPI `count` avertit (mode `/records`). |
| `plan-de-relance-plafond-max-records#not-truncated` | banc-pages (vivant) | **défaut** (AM-002, #881) : `fetch-mode="export" max-records="1000"` sur 3 080 projets — 1 000 lignes, aucun diagnostic ; en export, `meta.total` est absent et même le KPI `count` se tait. Une seule demande pour les deux : un mot de la **source**. |
| `canari-plafond-export#not-truncated` | canari | **défaut** (AM-002, #882) : le même, sur 1 001 lignes engendrées — 1 000 reçues, aucun diagnostic. À noter : `_fetchViaExport` porte un avertissement `truncated = rows.length > cap`, qui ne peut jamais partir puisque l'export est demandé avec `limit = cap` exactement. |
| `canari-jointure-doublon#count-preserved`, `#sum-preserved:montant` | canari | **violés par les données**, pas par la bibliothèque (PG-001) : 42 lignes pour 40, somme +20 — rendus en attente pour être LUS, c'est le point du canari. Aucune issue à ouvrir. |

**Ce que la catégorie a rapporté.** Les sept premiers contrôles mis en attente ont tous eu une
issue ouverte à leur nom, et tous sont depuis repassés au vert — c'est le rendement de la
vérification, et la raison pour laquelle un `skip` n'est pas un contrôle perdu :

| Contrôle mis en attente | Domaine | Issue |
|---|---|---|
| `tabular-groupe-somme-serveur`, `tabular-filtre-limite-serveur` | delegation | [#852](https://github.com/bmatge/dsfr-data/issues/852) — `buildServerSideUrl` ignore `group-by` et `aggregate` délégués |
| `lecteur-tardif-renegociation` | delegation | [#853](https://github.com/bmatge/dsfr-data/issues/853) — un lecteur non-query ajouté après l'initialisation ne conteste pas la délégation (#765, forme tardive) |
| `require-where-filtre-par-delegation` | delegation | [#854](https://github.com/bmatge/dsfr-data/issues/854) — `require-where` ne libère jamais l'attente sur un `where` seul, contrairement à sa doc |
| `relais-normalize-devrait-deleguer` | delegation | [#855](https://github.com/bmatge/dsfr-data/issues/855) — la délégation ne franchit pas `dsfr-data-normalize` : overlay posé, jamais appliqué |
| `where-seul-devrait-etre-delegue` | delegation | [#856](https://github.com/bmatge/dsfr-data/issues/856) — **amélioration**, non promise par la doc : déléguer un `where` seul |
| `qualite-tourisme-group-by-delegue-garde-son-alias` | banc-pages | [#859](https://github.com/bmatge/dsfr-data/issues/859) — sur une source ODS à `select` explicite, l'adaptateur garde le `select` et perd les colonnes d'`aggregate` (KPI à 0) |

Six issues, dont cinq défauts et une amélioration : aucune n'aurait été vue par un test unitaire,
puisque chacune porte sur ce que la page **affiche** au bout d'une chaîne, pas sur une fonction.

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
