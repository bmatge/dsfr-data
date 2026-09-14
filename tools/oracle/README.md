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
  contexte.ts              contrôles déterministes joués AU CLAVIER ET À LA SOURIS
                             (contexte, facettes, recherche, synchro d'URL)
  fixtures.ts              les lignes servies à la page ET données à l'oracle
  fixtures-contexte.ts     les lignes et le faux serveur ODS du domaine `contexte`
  index.ts                 la liste des manifestes

tools/oracle/            LE MOTEUR
  manifest.ts              la grammaire (types seuls) : Feed, Step, Expect, Check
  compute.ts               le recalcul en tableaux nus
  observe.ts               les lecteurs d'observation, exécutés DANS la page
  expected.ts              l'attendu d'un contrôle, depuis ses lignes brutes
  stabilite.ts             attendre qu'une observation ne bouge plus (pas de sommeil fixe)
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
| `lireFacettes` | les valeurs et compteurs affichés par `dsfr-data-facets`, dans leur ordre de rendu |
| `lireTexte` | un texte affiché (`dsfr-data-context-value`, tag de `dsfr-data-context-tags`, compteur de `dsfr-data-search`), avec le nombre qu'on y lit |

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
