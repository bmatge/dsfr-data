# tests/builder-e2e — trois specs bloquantes, quatre specs archivées, deux outils

> **Trois specs tournent en CI sur chaque PR** (`.github/workflows/builder-e2e.yml`, #869) :
> `export-html-api-recette` (61 cas, vert depuis #866), `builder-ia-recette` et
> `layout-diagnostic-recette` (43 cas). **104 cas**, 27 s, aucune API tierce. C'est
> exactement ce que Playwright ramasse par défaut dans ce dossier depuis #868.
>
> **Quatre specs historiques du Builder ont été ARCHIVÉES** (#868, 2026-09-19) : elles portent
> l'extension `.archive.ts`, sortent du `testMatch`, et se relancent avec
> `BUILDER_E2E_ARCHIVES=1`. Leur contenu n'est pas effacé — voir « Ce qui n'est plus ramassé »
> ci-dessous pour ce qu'on perd et comment y revenir.
>
> **Deux outils** (`*.tool.ts`, #867) n'assertent rien et sont hors `testMatch` eux aussi ;
> ils se relancent avec `BUILDER_E2E_OUTILS=1`.
>
> Les garde-fous qui BLOQUENT une PR par ailleurs : `vitest` (unitaires), `e2e-layout.yml`
> (mise en page mesurée), `verif-donnees.yml` (tout chiffre affiché recalculé par un oracle).
>
> L'état ci-dessous est **mesuré**, pas déclaré. Les pourcentages d'une version encore
> antérieure de ce fichier (« 11/12 passent », « 7/8 passent ») dataient d'avant plusieurs
> refontes de l'UI du Builder et ne valaient plus rien.

## État réel, fichier par fichier

Comptes de cas relevés le **2026-09-19** avec
`npx playwright test --config tests/builder-e2e/playwright.config.ts --list` (le `--list` ne
lance rien : le chiffre ne dépend ni du serveur de dev ni de l'état de l'UI). Les colonnes
« résultat » viennent des relevés d'exécution datés en regard.

### Ramassés par défaut — la couverture réelle du dossier

| Spec | Serveur de dev | Cas | Résultat mesuré | Ce qu'il faut en penser |
|---|---|---|---|---|
| `export-html-api-recette.spec.ts` | **non** (tout par `page.route()`) | 61 | **61 vert** (2026-09-19, #866) | Le plus solide du dossier : déterministe, sans réseau, 11 s. Demande `npm run build` avant. |
| `builder-ia-recette.spec.ts` | oui | 16 | **vert** (2026-09-14, #844) | Avec `layout-diagnostic-recette`, 43 cas en 16 s, sans réseau tiers. |
| `layout-diagnostic-recette.spec.ts` | oui | 27 | **vert** (2026-09-14, #844) | Idem. |
| | | **104** | | C'est le total que Playwright ramasse, et le total que la CI exécute. |

### Archivés — hors `testMatch` depuis #868 (2026-09-19)

| Spec archivé | Serveur de dev | Cas | Dernier résultat mesuré | Pourquoi archivé |
|---|---|---|---|---|
| `quick-audit.archive.ts` | oui | 12 | **10 vert / 2 rouge** (2026-09-14, #844) | Dérive de sélecteurs : « Filtre avancé » et « Série 2 » ne trouvent plus leur contrôle. |
| `simple-test.archive.ts` | oui | 9 | **6 vert / 2 rouge** (2026-09-14, #844) | Idem (« Bouton générer », « Zone de code généré »). |
| `aggregation-consistency.archive.ts` | oui | 14 | **0 vert / 15 rouge** (2026-09-14, #844) | Entièrement rouge. Le harnais pilote le Builder par ses `id` HTML ; l'UI a bougé, le harnais non. |
| `comprehensive-test.archive.ts` | oui | 37 | **0 vert / 37 rouge** (2026-09-14, #844) | Même harnais, mêmes causes. Run très long : chaque cas va au bout de son délai avant d'expirer. |
| | | **72** | **56 rouges** | |

> ⚠️ Les comptes de cas de la colonne « Cas » (relevé du 2026-09-19 par `--list`) et les comptes
> de résultats du relevé du 2026-09-14 ne coïncident pas partout : `--list` compte 14 cas dans
> `aggregation-consistency` là où le relevé d'exécution en notait 15, et 9 dans `simple-test` là
> où il en notait 8. L'écart n'a pas été rejoué — un relevé d'exécution honnête demande un arbre
> construit (`npm run build:shared && npm run build && npm run build:app-ui`), faute de quoi on
> mesure son propre environnement et pas les specs. Le chiffre qui engage l'archivage, lui, est
> celui de `--list`, et il est exact : **72 cas sortent du ramassage, 104 restent**.

### Outils — hors `testMatch` depuis #867, et ce ne sont pas des tests

| Outil | Serveur de dev | Cas | Ce que c'est |
|---|---|---|---|
| `inspect-builder.tool.ts` | oui | 1 | Un inspecteur qui imprime la structure du Builder. Le lancer `--headed`. |
| `builder-exhaustive.tool.ts` | oui | 110 | Un **générateur de rapport** (`RESULTS.md` + `screenshots/`, ignorés par git). Il passe toujours au vert, même quand il journalise `code=false` — autrement dit quand le Builder n'a rien généré. Compter ses 110 « tests » comme de la couverture est une illusion. |

**Pourquoi les archivés sont rouges, en une phrase** : ils conduisent le Builder par ses
identifiants HTML et par des `waitForTimeout` fixes ; chaque refonte de l'UI les décale, et rien
en CI ne le signalait. Les remettre au vert est un travail à part entière — ce n'est pas une
question de fixtures à rafraîchir.

## Ce qui n'est plus ramassé, et comment y revenir

**Le chiffre** (relevé du 2026-09-19) : le dossier collectait **176 cas** dans 7 fichiers ; il en
collecte **104** dans 3 fichiers. **72 cas sont sortis**, dont **56 étaient rouges** et 16 verts.
Aucun de ces 176 cas ne tournait en CI hors des 104 : l'archivage ne retire donc **rien** de ce
qui bloquait une PR, et le nombre de cas exécutés par `builder-e2e.yml` est inchangé.

```bash
# Ce que Playwright ramasse par defaut : 104 cas, 3 fichiers
npx playwright test --config tests/builder-e2e/playwright.config.ts --list

# Avec les archives : 176 cas, 7 fichiers
BUILDER_E2E_ARCHIVES=1 npx playwright test --config tests/builder-e2e/playwright.config.ts --list

# Avec les outils : 215 cas, 5 fichiers
BUILDER_E2E_OUTILS=1 npx playwright test --config tests/builder-e2e/playwright.config.ts --list
```

**Ce que les 72 cas archivés couvraient** — c'est une intention, pas un état vert (le détail des
paramètres visés est plus bas, « Paramètres visés par les specs archivés ») :

| Spec archivé | Ce qu'il couvrait |
|---|---|
| `comprehensive-test` (37) | La matrice du Builder : 5 agrégations × 11 types, palettes, tri, séries simples/doubles, mode avancé (filtres, group-by, aggregate). |
| `aggregation-consistency` (14) | La cohérence chiffrée : chaque agrégation du Builder recalculée depuis les données source par `data-consistency-checker.ts`. |
| `quick-audit` (12) | Un sous-ensemble rapide de la même matrice (sum/avg/min/max/count, horizontalBar, filtre avancé, série 2). |
| `simple-test` (9) | Les fondamentaux de l'UI du Builder : la page charge, les contrôles existent, le bouton générer est cliquable, le code apparaît. |

**Ce que cette couverture a de redondant** : le recalcul indépendant de tout chiffre affiché est
assuré en CI par `verif-donnees.yml` (oracle), la forme du code généré par
`tests/apps/builder-ia/code-generator-recette.test.ts` (hors ligne, vitest), et le fait qu'un type
rende réellement par `builder-ia-recette.spec.ts` (16 types) et `export-html-api-recette.spec.ts`
(16 types × 3 variantes API). **Ce qui n'est couvert nulle part ailleurs** : le pilotage de l'UI
du Builder elle-même — cliquer ses contrôles et vérifier que le code généré change en
conséquence. C'est cela, et seulement cela, que l'archivage laisse à la recette manuelle.

**Pour relancer un spec archivé** (il faut un arbre construit, sinon on mesure son propre
environnement et pas le spec) :

```bash
npm run build:shared && npm run build && npm run build:app-ui
BUILDER_E2E_ARCHIVES=1 npx playwright test \
  --config tests/builder-e2e/playwright.config.ts quick-audit.archive.ts --headed
```

Les fichiers archivés restent **typés** par `npm run typecheck:tests` (`tsconfig.tests.json`
inclut `tests/**/*.ts`) : un renommage dans le Builder qui casserait leur compilation se verra
toujours en CI. Ils gardent aussi leur adresse en dur `http://localhost:5173` — rien de leur
contenu n'a été touché par l'archivage.

**Ce qui est câblé en CI** (#869, sur le modèle d'`e2e-layout.yml`) : `builder-ia-recette` +
`layout-diagnostic-recette` (43 cas, 16 s, verts et sans réseau) et `export-html-api-recette`
(61 cas, vert depuis #866).

**Les trois rouges d'`export-html-api-recette`, requalifiés (#866)** : ce n'était ni le faux
serveur ni le parseur ODSQL strict des fixtures, mais une **attente périmée**. Le document
`pagePartagee()` n'avait que deux blocs — une liste paginée et un KPI — et depuis #810 un KPI
Opendatasoft reçoit **toujours** sa source dédiée à agrégat serveur. La liste restait donc seule
lectrice de la source de base, et l'export y posait `server-side` à bon droit : la source
n'était plus partagée. Le document porte maintenant un troisième bloc — un graphique **non
agrégé**, qu'aucune règle de dédicace ne peut lui prendre — et c'est lui qui tient le partage
sur les trois variantes. Leçon générale : « partagée » se compte **après** `dedicatedSourcePlan`.

## Fichiers

### Specs
- **`export-html-api-recette.spec.ts`** : recette des **16 types × 3 variantes API** de l'export
  HTML partagé, par interception de route (#625, ADR-106). Voir « Recette des variantes API ».
- **`builder-ia-recette.spec.ts`** : recette des 16 types de l'Assistant IA (#615) — le code
  généré est produit **et rend**, sur source locale. Depuis #609 l'aperçu EST l'export : ce spec
  est la seule vérification qu'un type ne rend pas dans le vide. La forme du code des variantes
  API est vérifiée hors ligne, en CI, par `tests/apps/builder-ia/code-generator-recette.test.ts`.
- **`layout-diagnostic-recette.spec.ts`** : recette de clôture de l'epic #614 — sur les 5 apps
  (Builder, Assistant IA, Playground, Studio, Carto) : pas de défilement horizontal, mode de
  hauteur déclaré, fin de document bordant le rail, et volet Diagnostic qui **reçoit réellement
  le clic**.
### Specs archivés (extension `.archive.ts`, hors `testMatch`)

Les specs historiques du Builder (agrégations, types, palettes, tri, filtres). Ils **assertent**,
contrairement aux outils ci-dessous — c'est pour cela qu'ils sont archivés et non supprimés : leur
contenu reste la trace de ce qui était couvert. 72 cas, 56 rouges (voir « Ce qui n'est plus
ramassé »). Pour les relancer, `BUILDER_E2E_ARCHIVES=1`.

- **`comprehensive-test.archive.ts`** (37 cas) : la matrice du Builder.
- **`aggregation-consistency.archive.ts`** (14 cas) : la cohérence chiffrée des agrégations.
- **`quick-audit.archive.ts`** (12 cas) : un sous-ensemble rapide de la matrice.
- **`simple-test.archive.ts`** (9 cas) : les fondamentaux de l'UI du Builder.

### Outils (sans assertion, extension `.tool.ts`, hors `testMatch`)

Ils passent toujours au vert — ils n'assertent rien. Les compter comme de la couverture était
une illusion (#867) : ils portent donc `.tool.ts` et Playwright ne les ramasse plus. Pour les
lancer, poser `BUILDER_E2E_OUTILS=1` :

```bash
BUILDER_E2E_OUTILS=1 npx playwright test \
  --config tests/builder-e2e/playwright.config.ts builder-exhaustive --headed
```

- **`inspect-builder.tool.ts`** : imprime la structure du Builder.
- **`builder-exhaustive.tool.ts`** : génère `RESULTS.md` et `screenshots/` pour 4 sources ×
  11 types × modes.

### Utilitaires
- **`data-consistency-checker.ts`** : fonctions de calcul et vérification de cohérence.
- **`api-fixtures.ts`** : les quatre faux serveurs de la recette des variantes API (ODS
  `records` / `exports/json` / `facets`, Tabular, API générique) — **sans Playwright**, donc
  éprouvés hors ligne par `api-fixtures.test.ts` (en CI avec vitest).
- **`api-harness.ts`** : le harnais `page.route()` : sert la page, les actifs CDN et les trois
  API, refuse tout le reste.

### Documentation et configuration
- **`README.md`** : ce fichier.
- **`TESTING_MATRIX.md`** : matrice des paramètres à tester.
- **`playwright.config.ts`** : configuration Playwright. `testMatch` y est restreint à
  `*.spec.ts` — sans quoi Playwright ramasse `api-fixtures.test.ts`, qui relève de vitest, et
  plante avant le premier test ; les outils `*.tool.ts` (#867) et les specs archivés
  `*.archive.ts` (#868) en sont exclus sauf `BUILDER_E2E_OUTILS=1` / `BUILDER_E2E_ARCHIVES=1`.
  `webServer` y démarre `npm run dev` au besoin et **réutilise** celui qui tourne déjà.

## Lancement

```bash
# 1. Playwright
npx playwright install chromium

# 2. Un spec, depuis la racine du dépôt. Le serveur de dev (port 5173) est démarré par
#    Playwright lui-même ; un `npm run dev` déjà lancé est réutilisé.
npx playwright test --config tests/builder-e2e/playwright.config.ts builder-ia-recette.spec.ts

# export-html-api-recette est le seul à ne demander aucun serveur, mais il demande
# `npm run build` (le bundle packages/core/dist est servi à la place du CDN) :
npm run build
npx playwright test --config tests/builder-e2e/playwright.config.ts export-html-api-recette.spec.ts

# Debug
BUILDER_E2E_ARCHIVES=1 npx playwright test --config tests/builder-e2e/playwright.config.ts quick-audit.archive.ts --headed
BUILDER_E2E_ARCHIVES=1 npx playwright test --config tests/builder-e2e/playwright.config.ts quick-audit.archive.ts --ui
```

Lancer le dossier **avec les archives** (`BUILDER_E2E_ARCHIVES=1`) prend plus d'une heure (elles
enchaînent les délais d'attente fixes puis expirent) et finit rouge : préférer un spec à la fois.
Sans le drapeau, les 104 cas ramassés passent en une trentaine de secondes.


## 🌐 Recette des variantes API (#625, ADR-106)

`export-html-api-recette.spec.ts` rend les **16 types × 3 variantes API** de l'export HTML
partagé. C'est la moitié que ni `builder-ia-recette.spec.ts` (source locale) ni
`code-generator-recette.test.ts` (forme du code, hors ligne) ne pouvaient couvrir : les deux
défauts les plus coûteux trouvés jusqu'ici (podium vide #617, datalist pilotée par script)
produisaient un code parfaitement bien formé. Ce spec en a trouvé un troisième de la même
famille — une carte agrégée dont le champ de code ne survivait pas au `group-by`.

```bash
npm run build        # une fois : le bundle packages/core/dist est servi à la place du CDN
npx playwright test --config tests/builder-e2e/playwright.config.ts export-html-api-recette

# La partie hors ligne (les faux serveurs eux-mêmes) tourne en CI avec vitest :
npx vitest run tests/builder-e2e/api-fixtures.test.ts
```

### Ce que le harnais garantit

| Point | Comment |
|-------|---------|
| **Aucun réseau réel** | Une route `**/*` unique sert la page, les actifs et les trois API ; tout hôte non prévu est refusé **et journalisé**. Chaque test assertionne `journal.inattendues === []`. |
| **Aucun serveur** | La page est servie par `page.route()` sur un hôte `.invalid` (TLD réservé, RFC 2606) — pas de `npm run dev`, pas de port. |
| **Enveloppes réelles** | ODS `{ total_count, results }` paginé par `offset`/`limit` (100/page), Tabular `{ data, links, meta }` paginé par `page`, API générique en tableau nu. Plus `/exports/json` (mode `export`, #689) et `/facets`. |
| **Fidélité aux travers de l'API** | Sur un `group_by`, le faux ODS renvoie un `total_count` égal à la taille de page — le mensonge du vrai ODS (#641). La recette prouve ainsi que l'adaptateur a raison de l'ignorer. |
| **Jeu piégeux** | 137 lignes (> `ODS_PAGE_SIZE`, sinon la 2ᵉ requête n'existerait pas), étiquettes à apostrophe (« Val-d'Oise ») et esperluette, et le nom de colonne `Nombre d'habitants`. |

### Ce que chaque cas vérifie

- le composant d'affichage **a reçu des lignes** (`_sourceData`), et rend des pixels ;
- une carte **n'écarte aucune ligne** faute de code géographique (le « podium vide » cartographique) ;
- **aucune erreur console** hors `favicon` — la liste de tolérance est plus courte que celle de
  la recette locale : rien ne venant du réseau, un `net::ERR_` signalerait une fuite du harnais ;
- ODS demande bien sa **seconde page avec `offset=100`**, Tabular enchaîne via `links.next` ;
- en pagination serveur, la **page 2 est demandée et affichée**, et le **tri délégué émet sa
  commande** `dsfr-data-source-command` avec `orderBy`, qui repart en `order_by` dans l'URL ;
- sur une **source partagée**, le KPI totalise bien les 137 lignes — pas une page de dix.

### Deux documents, deux stratégies de chargement (ADR-109, #717)

L'export émet `server-side` / `server-sort` **seulement** quand une source n'a qu'un consommateur
et que ce consommateur est une liste paginée. Les deux documents du harnais matérialisent les deux
branches, et il faut prendre le bon :

| Fabrique | Document | Ce que la page fait |
|---|---|---|
| `pagePour(config, variante)` | un seul bloc | une `datalist` non agrégée y est seule sur sa source : sur ODS et Tabular, la page **pagine côté serveur** (`fetchPage`, commande `page`, tri délégué). |
| `pagePartagee(variante)` | une liste **et** un KPI sur la **même** source | source partagée : **jamais** `server-side`, la page **charge tout** puis pagine dans le navigateur (`fetchAll`, `offset=100`, `links.next`). |

Une source n'étant émise qu'une fois, poser `server-side` sur une source partagée ne ferait plus
parvenir qu'une page de dix lignes au KPI d'à côté : un total **faux, sans erreur**. C'est ce que
la règle interdit par construction, et ce que le cas « une source partagée garde ses chiffres »
verrouille sur un rendu.

### Mode `fetch-mode="export"` (#689)

Le faux serveur `/exports/json` sert un tableau nu et respecte `limit` (= plafond + 1). Le test de
rendu est posé sur `pagePartagee()`, et pas par hasard : `fetch-mode` et `server-side` s'excluent
par construction, et la source partagée est justement celle qu'ADR-109 laisse en chargement
complet — donc la seule où l'export a un sens.

## Paramètres visés par les specs archivés

Ce que `comprehensive-test.archive.ts` et `quick-audit.archive.ts` cherchent à couvrir. C'est une
**intention**, pas un état — et depuis #868 ces specs ne sont plus ramassés : voir « Ce qui n'est
plus ramassé » pour ce que cela retire.

| Catégorie | Paramètres visés |
|-----------|------------------|
| Agrégations | avg, sum, count, min, max |
| Types de graphiques | bar, horizontalBar, line, pie, doughnut, radar, scatter, gauge, kpi, map, datalist |
| Palettes | default, categorical, sequential, divergent, neutral |
| Tri | asc, desc |
| Séries | simple, double |
| Mode avancé | filtres, group-by, aggregate |

### Jamais couvert, ni ici ni ailleurs dans ce dossier

- KPI : variants (info, success, warning, error) et unités
- Map : attributs deferred (value, date)
- Datalist : colonnes configurables, recherche, export
- `dsfr-data-normalize` : flatten, trim, rename
- `dsfr-data-facets`
- Mode de génération (embedded vs dynamic), intervalle de rafraîchissement, bascule données brutes


## 🧪 Tests de cohérence des données

Les tests vérifient que les valeurs calculées par les fonctions d'agrégation correspondent exactement aux données source.

### Dataset de test

Les tests utilisent un dataset avec valeurs connues pour permettre la vérification automatique :

```json
[
  { "region": "Ile-de-France", "population": 12000, "budget": 500, "code": "75" },
  { "region": "Provence", "population": 5000, "budget": 200, "code": "13" },
  { "region": "Bretagne", "population": 3000, "budget": 150, "code": "35" },
  { "region": "Normandie", "population": 3300, "budget": 180, "code": "14" }
]
```

### Valeurs attendues et résultats

**Pour le champ `population` (attendu de `quick-audit.archive.ts`) :**

| Agrégation | Valeur attendue |
|------------|-----------------|
| **SUM** | 23300 |
| **AVG** | 5825 |
| **MIN** | 3000 |
| **MAX** | 12000 |
| **COUNT** | 4 |

Ces valeurs sont l'ATTENDU du spec, pas un résultat constaté : l'ancienne colonne « ✅ PASSE »
laissait croire à un relevé. Pour ce qui passe aujourd'hui, voir le tableau en tête de fichier.

**Pour le champ `budget` (valeurs de référence) :**

| Agrégation | Valeur attendue |
|------------|-----------------|
| **SUM** | 1030 |
| **AVG** | 257.5 |
| **MIN** | 150 |
| **MAX** | 500 |
| **COUNT** | 4 |

### Exposition du state pour les tests

Les specs archivés injectent leurs données dans le state du Builder, exposé globalement.
**Vérifié le 2026-09-14 : l'exposition est bien en place**, dans `apps/builder/src/main.ts`
(près de la ligne 59, depuis #115) :

```typescript
// Expose state for E2E tests
(window as Window & { __BUILDER_STATE__?: typeof state }).__BUILDER_STATE__ = state;
```

Ce n'est donc PAS la cause des échecs du tableau en tête de fichier : l'objet est bien là et les
specs le lisent. Ce qui a bougé, ce sont les identifiants HTML des contrôles qu'ils pilotent
ensuite.

Cette exposition n'est utilisée que par ces specs et n'affecte pas le fonctionnement du Builder.

### Exemple d'utilisation

```typescript
import { verifyConsistency, PRESET_DATASETS } from './data-consistency-checker';

const dataset = {
  ...PRESET_DATASETS.regions,
  aggregation: 'sum',
};

const result = await verifyConsistency(page, dataset);

if (!result.passed) {
  console.error(formatConsistencyReport(result));
}
```

## 📝 Ajouter de nouveaux tests

### 1. Tester un nouveau paramètre

```typescript
test('Mon nouveau paramètre - fonctionne correctement', async ({ page }) => {
  await page.goto('http://localhost:5173/apps/builder/');
  await loadLocalData(page, TEST_DATA);

  // Configurer le paramètre
  await page.selectOption('#mon-parametre', 'ma-valeur');

  // Générer
  await page.click('#generate-btn');
  await page.waitForTimeout(500);

  // Vérifier le code généré
  const hasParameter = await checkGeneratedCode(page, 'mon-parametre="ma-valeur"');
  expect(hasParameter).toBeTruthy();

  // Vérifier le preview
  const emptyState = await page.locator('#empty-state').isVisible();
  expect(emptyState).toBeFalsy();
});
```

### 2. Tester une nouvelle fonction d'agrégation

```typescript
test('Agrégation MEDIAN - calcul correct', async ({ page }) => {
  const dataset: TestDataset = {
    data: TEST_DATA,
    groupByField: 'region',
    valueField: 'population',
    aggregation: 'median', // Nouvelle fonction
  };

  await loadDatasetIntoBuilder(page, dataset);
  await page.selectOption('#aggregation', 'median');
  await page.click('#generate-btn');

  // Vérifier la cohérence
  const result = await verifyConsistency(page, dataset);
  expect(result.passed).toBeTruthy();
});
```

## 🐛 Détecter les bugs

### Bugs fréquents

1. **Agrégations incorrectes**
   - `min` / `max` retournent 0
   - `avg` n'arrondit pas correctement
   - `count` compte les valeurs au lieu des lignes

2. **Attributs manquants**
   - `horizontal` manquant pour horizontalBar
   - `fill` manquant pour pie
   - `value` et `date` non appliqués pour map (deferred)

3. **Filtres non fonctionnels**
   - Opérateurs `contains`, `in`, `isnull` ne marchent pas
   - Filtres multiples non combinés

### Comment investiguer

```bash
# Lancer le test en mode headed pour voir ce qui se passe
BUILDER_E2E_ARCHIVES=1 npx playwright test --config tests/builder-e2e/playwright.config.ts comprehensive-test.archive.ts --headed -g "AVG"

# Lancer avec le debugger
BUILDER_E2E_ARCHIVES=1 npx playwright test --config tests/builder-e2e/playwright.config.ts comprehensive-test.archive.ts --debug -g "AVG"

# Voir les traces
npx playwright show-trace trace.zip
```

## 📊 Rapport de couverture

Pour générer un rapport complet :

```bash
# Lancer tous les tests avec rapport HTML
npx playwright test --config tests/builder-e2e/playwright.config.ts --reporter=html

# Ouvrir le rapport
npx playwright show-report
```

## 🎯 Checklist de recette manuelle

Rien de ce dossier n'est un garde-fou de release : les garde-fous bloquants sont `vitest`,
`e2e-layout.yml` et `verif-donnees.yml`. Ce qui suit est une liste de points à regarder de ses
propres yeux quand on ouvre le Builder.

### À vérifier à la main
- [ ] KPI : variants et unités
- [ ] Map : attributs deferred (value, date)
- [ ] Datalist : colonnes configurables
- [ ] Mode avancé : agrégations multiples
- [ ] Normalization : flatten + rename

### Vérification visuelle
- [ ] Preview affiche le bon type de graphique
- [ ] Couleurs correspondent aux palettes
- [ ] Code généré est bien formaté
- [ ] Pas d'erreurs console

## 💡 Conseils

### Performance

- `playwright.config.ts` impose `workers: 1` (tableau de résultats partagé par
  `builder-exhaustive.tool.ts`) : les specs de ce dossier ne sont PAS parallélisés.
- Les 104 cas ramassés passent en une trentaine de secondes ; c'est avec
  `BUILDER_E2E_ARCHIVES=1` que le dossier dépasse l'heure.

### Stabilité

- Les `waitForTimeout(500)` permettent au builder de calculer
- Pour des tests plus stables, augmenter à 1000ms
- En prod CI/CD, ajouter `--retries=2`

### Debugging

```typescript
// Afficher l'état du builder
await page.evaluate(() => {
  console.log((window as any).__BUILDER_STATE__);
});

// Prendre un screenshot
await page.screenshot({ path: 'debug.png', fullPage: true });

// Pause pour inspecter
await page.pause();
```

## 📚 Ressources

- [Documentation Playwright](https://playwright.dev/)
- [CLAUDE.md - Architecture du projet](../../CLAUDE.md)
- [TESTING_MATRIX.md - Matrice complète](./TESTING_MATRIX.md)
- [e2e-layout.yml — le modèle de workflow déterministe](../../.github/workflows/e2e-layout.yml)

## 🤝 Contribuer

Pour ajouter de nouveaux tests :

1. Consulter `TESTING_MATRIX.md` pour identifier les paramètres non couverts
2. NE PAS ajouter de test dans un `*.archive.ts` : ils ne sont plus ramassés. Un nouveau
   garde-fou va dans un `*.spec.ts` déterministe (voir `layout-diagnostic-recette.spec.ts` pour
   le motif : sélecteurs stables, aucune attente fixe)
3. Si test de cohérence, utiliser `data-consistency-checker.ts`
4. Mettre à jour cette documentation
5. Vérifier que tous les tests passent

```bash
# Avant commit
npm run test:run
npx playwright test --config tests/builder-e2e/playwright.config.ts
```
