# tests/builder-e2e — OUTIL DE RECETTE MANUELLE

> **Cette suite ne tourne dans AUCUN workflow CI, et ce n'est pas un oubli : elle n'est pas
> verte.** Elle se lance à la main, avec `npm run dev` à côté, quand on veut inspecter le
> Builder ou l'Assistant IA dans un vrai navigateur. Les garde-fous qui BLOQUENT une PR sont
> ailleurs : `vitest` (unitaires), `e2e-layout.yml` (mise en page mesurée),
> `verif-donnees.yml` (tout chiffre affiché recalculé par un oracle).
>
> L'état ci-dessous est **mesuré**, pas déclaré (relevé du 2026-09-14, #844). Les pourcentages
> de l'ancienne version de ce fichier (« 11/12 passent », « 7/8 passent ») dataient d'avant
> plusieurs refontes de l'UI du Builder et ne valaient plus rien.

## État réel, spec par spec

Relevé sur un serveur de dev local, `npx playwright test --config tests/builder-e2e/playwright.config.ts <spec>`.

| Spec | Serveur de dev | Résultat mesuré | Ce qu'il faut en penser |
|---|---|---|---|
| `export-html-api-recette.spec.ts` | **non** (tout par `page.route()`) | **58 vert / 3 rouge** | Le plus solide du dossier : déterministe, sans réseau, 30 s. Les 3 rouges portent tous sur ODS (2ᵉ page `offset=100`, KPI sur source partagée, `fetch-mode="export"`) et **pré-existent** — ils tombent à l'identique sur `main`. Demande `npm run build` avant. |
| `builder-ia-recette.spec.ts` | oui | **vert** | Avec `layout-diagnostic-recette`, 43 cas en 16 s, sans réseau tiers. |
| `layout-diagnostic-recette.spec.ts` | oui | **vert** | Idem. |
| `quick-audit.spec.ts` | oui | **10 vert / 2 rouge** | Dérive de sélecteurs : « Filtre avancé » et « Série 2 » ne trouvent plus leur contrôle. |
| `simple-test.spec.ts` | oui | **6 vert / 2 rouge** | Idem (« Bouton générer », « Zone de code généré »). |
| `aggregation-consistency.spec.ts` | oui | **0 vert / 15 rouge** | Entièrement rouge. Le harnais pilote le Builder par ses `id` HTML ; l'UI a bougé, le harnais non. |
| `comprehensive-test.spec.ts` | oui | **0 vert / 37 rouge** | Même harnais, mêmes causes. Run très long : chaque cas va au bout de son délai avant d'expirer. |
| `inspect-builder.spec.ts` | oui | **aucune assertion** | Ce n'est pas un test : c'est un inspecteur qui imprime la structure du Builder. Le lancer `--headed`. |
| `builder-exhaustive.spec.ts` | oui | **aucune assertion** (110 cas) | Ce n'est pas un test non plus : c'est un **générateur de rapport** (`RESULTS.md` + `screenshots/`, tous deux ignorés par git). Il passe toujours au vert, même quand il journalise `code=false` — autrement dit quand le Builder n'a rien généré. Compter ses 110 « tests » comme de la couverture est une illusion. |

**Pourquoi c'est rouge, en une phrase** : les specs les plus anciens conduisent le Builder par
ses identifiants HTML et par des `waitForTimeout` fixes ; chaque refonte de l'UI les décale, et
rien en CI ne le signalait. Les remettre au vert est un travail à part entière — ce n'est pas
une question de fixtures à rafraîchir.

**Ce qui pourrait être câblé en CI plus tard** : `builder-ia-recette` + `layout-diagnostic-recette`
(43 cas, 16 s, verts et sans réseau) et `export-html-api-recette` une fois ses 3 rouges traités.
Le modèle de workflow existe : `.github/workflows/e2e-layout.yml`.

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
- **`quick-audit.spec.ts`**, **`simple-test.spec.ts`**, **`comprehensive-test.spec.ts`**,
  **`aggregation-consistency.spec.ts`** : les specs historiques du Builder (agrégations, types,
  palettes, tri, filtres). Partiellement à entièrement rouges — voir le tableau ci-dessus.

### Outils (sans assertion)
- **`inspect-builder.spec.ts`** : imprime la structure du Builder.
- **`builder-exhaustive.spec.ts`** : génère `RESULTS.md` et `screenshots/` pour 4 sources ×
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
  plante avant le premier test.

## Lancement

```bash
# 1. Serveur de dev (port 5173) — requis par tous les specs SAUF export-html-api-recette
npm run dev

# 2. Playwright
npx playwright install chromium

# 3. Un spec, depuis la racine du dépôt
npx playwright test --config tests/builder-e2e/playwright.config.ts builder-ia-recette.spec.ts

# export-html-api-recette est le seul à ne demander aucun serveur, mais il demande
# `npm run build` (le bundle packages/core/dist est servi à la place du CDN) :
npm run build
npx playwright test --config tests/builder-e2e/playwright.config.ts export-html-api-recette.spec.ts

# Debug
npx playwright test --config tests/builder-e2e/playwright.config.ts quick-audit.spec.ts --headed
npx playwright test --config tests/builder-e2e/playwright.config.ts quick-audit.spec.ts --ui
```

Lancer **tout** le dossier prend plus d'une heure (les specs historiques enchaînent les délais
d'attente fixes puis expirent) et finit rouge : préférer un spec à la fois.


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

## Paramètres visés par les specs historiques

Ce que `comprehensive-test.spec.ts` et `quick-audit.spec.ts` cherchent à couvrir. C'est une
**intention**, pas un état : voir le tableau « État réel, spec par spec » en tête de fichier pour
ce qui passe aujourd'hui.

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

**Pour le champ `population` (attendu de `quick-audit.spec.ts`) :**

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

Les specs historiques injectent leurs données dans le state du Builder, exposé globalement.
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
npx playwright test tests/builder-e2e/comprehensive-test.spec.ts --headed -g "AVG"

# Lancer avec le debugger
npx playwright test tests/builder-e2e/comprehensive-test.spec.ts --debug -g "AVG"

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
  `builder-exhaustive.spec.ts`) : les specs de ce dossier ne sont PAS parallélisés.
- Lancer un spec à la fois ; le dossier entier dépasse l'heure.

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
2. Ajouter les tests dans `comprehensive-test.spec.ts`
3. Si test de cohérence, utiliser `data-consistency-checker.ts`
4. Mettre à jour cette documentation
5. Vérifier que tous les tests passent

```bash
# Avant commit
npm run test:run
npx playwright test --config tests/builder-e2e/playwright.config.ts
```
