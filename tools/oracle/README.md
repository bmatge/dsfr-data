# Vérification des données — oracle indépendant

Deux implémentations doivent donner le même chiffre **au même instant** (ADR-122).

D'un côté la bibliothèque rend un balisage `dsfr-data-*` et l'on lit ce qu'elle **affiche**.
De l'autre, `tools/oracle` repart des lignes **brutes** et recalcule en tableaux nus. Un écart à
la précision affichée est un échec.

**Indépendance** : `tools/oracle` et `tests/verif-donnees` n'importent rien de `packages/`, de
`@dsfr-data/*` ni de l'alias `@/`. Le test-garde `tests/oracle/guard.test.ts` parcourt tout le
graphe d'imports atteignable depuis les deux dossiers — un fichier neuf y entre sans avoir rien à
déclarer. Si la lib et l'oracle se trompent, ce n'est pas de la même façon.

## Les deux modes

| | déterministe (défaut) | vivant (`VERIF_MODE=live`) |
|---|---|---|
| Alimentation | fixtures du dépôt, servies par `page.route` | vraies API, retéléchargées |
| Attendu | recalculé dans le run, depuis les **mêmes** lignes | `out/expected.json`, produit juste avant |
| Déclenchement | chaque PR, **bloquant** (`verif-donnees.yml`) | nuit / à la demande / label `oracle`, jamais bloquant (`oracle.yml`) |
| Réseau | aucun (toute sortie inattendue fait échouer) | requis |

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
  delegation.ts            l'invariant de délégation : mêmes chiffres, serveur ou client
  export-studio.ts         les tableaux de bord produits par l'export du Studio
  fixtures.ts              les lignes servies à la page ET données à l'oracle
  fixtures-delegation.ts     les balisages du lot délégation (paires avec / sans server-side)
  fixtures-export-studio.ts  les documents exportés — SEUL fichier autorisé à importer la lib
  index.ts                 la liste des manifestes

tools/oracle/            LE MOTEUR
  manifest.ts              la grammaire (types seuls) : Feed, Step, Expect, Check
  compute.ts               le recalcul en tableaux nus
  observe.ts               les lecteurs d'observation, exécutés DANS la page
  expected.ts              l'attendu d'un contrôle, depuis ses lignes brutes
  compare.ts               observé contre attendu → un Constat
  raw.ts                   les deux alimentations
  report.ts                le rapport (out/report.json + out/report.txt)
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

## Ajouter un contrôle

1. Choisir le domaine (`tests/verif-donnees/banc.ts` si le cas vit contre une vraie API,
   `query.ts` s'il se joue sur des fixtures) — ou créer un fichier et l'ajouter à `index.ts`.
2. Écrire le `Check` : `mode`, `origin` (d'où vient le cas, quelle issue le motive), `feed`,
   `markup`, `expects`. Les clauses ODSQL d'un contrôle vivant s'écrivent **à la main** dans le
   manifeste, jamais traduites par la lib.
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
| `readersOf()` rend `[]` (`dsfr-data-query.ts`) | `source-partagee-ne-delegue-pas` | KPI affiché 0, recalculé 127 684 000 ; 7 groupes au lieu de 8 |
| `_onDelegationContested` sort sans renégocier (`dsfr-data-query.ts`) | `query-tardive-renegociation` | la seconde query rend 1 ligne au lieu de 7, le KPI 8 au lieu de 137 |
| `dedicatedSourcePlan()` rend une Map vide (`shared/dashboard/export-html.ts`) | 5 contrôles d'`export-studio` | plus aucun `group_by` ni `select` au serveur ; le KPI n'affiche plus rien |
| `maxRecords` ignoré dans `fetchAll` (`opendatasoft-adapter.ts`) | `plafond-max-records-et-meta-total` | 137 lignes chargées au lieu de 50, somme 127 684 000 au lieu de 48 775 000 |

## Un contrôle que la bibliothèque ne passe pas

Un contrôle légitime qui tombe sur un DÉFAUT de la lib ne se supprime pas et ne
s'adoucit pas : les deux reviennent à écrire dans le dépôt que le défaut
n'existe pas. Il se met en attente, en nommant ce qu'il attend et les deux
chiffres — `Check.skip` porte la raison, le spec la rend par `test.skip`, et la
liste des `skip` est celle des défauts connus. Ils sont ouverts en issue par la
supervision, pas corrigés dans le lot qui les trouve.

## Le rapport

En fin de run, `tools/oracle/out/report.json` et `out/report.txt` : par observation, la valeur
**lib**, la valeur **oracle**, l'écart, le nombre de lignes brutes, le mode — et le nombre de
valeurs comparées, parce qu'un contrôle vert qui n'a rien comparé ne garde rien. Le résumé texte
est aussi écrit sur la sortie standard, et les deux fichiers partent en artefact CI en cas d'échec.

Playwright **redémarre le worker après un échec** : le worker suivant n'a plus en mémoire les
constats de son prédécesseur, précisément ceux qui portent l'échec. Le rapport se fusionne donc d'un
worker à l'autre, en ne retenant que les constats du même run — c'est à quoi sert le `VERIF_RUN=$$`
des scripts npm. Lancé à la main sans cette variable (`npx playwright test … -g "<contrôle>"`, comme
pour une preuve de mutation), le fichier ne porte que ce que le dernier worker a vu ; le résumé sur
la sortie standard, lui, est complet dans les deux cas.
