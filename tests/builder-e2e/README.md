# Tests de validation du Builder

Ce dossier contient une suite complète de tests E2E Playwright pour vérifier que **tous les paramètres** du builder dsfr-data fonctionnent correctement et génèrent le code attendu.

## 📁 Fichiers

### Tests principaux
- **`quick-audit.spec.ts`** : Tests critiques de validation (11/12 passent) - agrégations, graphiques, palettes, tri
- **`simple-test.spec.ts`** : Tests de base des éléments UI (7/8 passent)
- **`inspect-builder.spec.ts`** : Outil de diagnostic de la structure du builder
- **`comprehensive-test.spec.ts`** : Tests exhaustifs de toutes les combinaisons (~100 tests)
- **`aggregation-consistency.spec.ts`** : Tests de cohérence des données (source vs rendu)
- **`builder-ia-recette.spec.ts`** : Recette des 16 types de l'Assistant IA (#615) — le code
  généré est produit **et rend**, sur source locale (variante embarquée). Depuis #609 l'aperçu
  EST l'export : ce spec est donc la seule vérification qu'un type ne rend pas dans le vide.
  La forme du code des variantes API est vérifiée hors ligne, en CI, par
  `tests/apps/builder-ia/code-generator-recette.test.ts` ; leur **rendu** l'est par
  `export-html-api-recette.spec.ts` ci-dessous (#625).
- **`export-html-api-recette.spec.ts`** : Recette des **16 types × 3 variantes API** par
  interception de route (#625, arbitrage ADR-106). Écrite contre l'**export HTML partagé**
  (`packages/shared/src/dashboard/export-html.ts`), qui sert le Studio *et* l'Assistant IA —
  pas contre l'Assistant seul, voué au décommissionnement (ADR-099 §4).
  Voir « Recette des variantes API » plus bas.
- **`layout-diagnostic-recette.spec.ts`** : Recette de clôture de l'epic #614 — sur les 5 apps
  (Builder, Assistant IA, Playground, Studio, Carto) : pas de défilement horizontal, mode de
  hauteur déclaré, fin de document bordant le rail, et volet Diagnostic qui **reçoit réellement
  le clic** (balayage sur toute la largeur — une sonde centrale passait à côté de #612).

### Utilitaires
- **`data-consistency-checker.ts`** : Fonctions de calcul et vérification de cohérence
- **`api-fixtures.ts`** : Les quatre faux serveurs de la recette des variantes API (ODS
  `records` / `exports/json` / `facets`, Tabular, API générique) — **sans Playwright**, donc
  éprouvés hors ligne par `api-fixtures.test.ts` (21 tests, en CI avec vitest).
- **`api-harness.ts`** : Le harnais `page.route()` : sert la page, les actifs CDN et les trois
  API, refuse tout le reste.

### Documentation
- **`README.md`** : Ce fichier - guide d'utilisation
- **`RESULTAT_TESTS.md`** : Résultats détaillés des tests (5/5 agrégations validées)
- **`QUICK_START.md`** : Démarrage rapide et troubleshooting
- **`FIX_TESTS.md`** : Guide de résolution des problèmes
- **`SYNTHESE.md`** : Synthèse et vue d'ensemble
- **`TESTING_MATRIX.md`** : Matrice complète des paramètres à tester

### Configuration
- **`playwright.config.ts`** : Configuration Playwright

## 🚀 Lancement rapide

### Pré-requis

```bash
# 1. Serveur de dev doit tourner (port 5173)
npm run dev

# 2. Playwright doit être installé
npx playwright install
```

> `export-html-api-recette.spec.ts` est la **seule exception** : elle ne demande aucun serveur
> (elle sert sa page par `page.route()`), mais elle demande `npm run build`. Voir ci-dessous.

### Lancer les tests critiques (recommandé)

```bash
# Aller dans le dossier des tests
cd tests/builder-e2e

# Tests critiques - 12 tests de validation (11/12 passent)
npx playwright test quick-audit.spec.ts

# Tests de base - éléments UI (7/8 passent)
npx playwright test simple-test.spec.ts

# Inspection de la structure - diagnostic
npx playwright test inspect-builder.spec.ts --headed
```

### Lancer tous les tests

```bash
# Depuis la racine du projet
npx playwright test --config tests/builder-e2e/playwright.config.ts

# Ou depuis tests/builder-e2e/
cd tests/builder-e2e
npx playwright test
```

### Lancer des tests spécifiques

```bash
# Seulement les tests d'agrégation
npx playwright test quick-audit.spec.ts -g "calcul correct"

# Seulement un type de graphique
npx playwright test quick-audit.spec.ts -g "HorizontalBar"

# Seulement les palettes
npx playwright test quick-audit.spec.ts -g "Palette"

# Test du tri
npx playwright test quick-audit.spec.ts -g "Tri"
```

### Mode interactif (debug)

```bash
# Lancer avec l'UI Playwright pour voir les tests en direct
npx playwright test quick-audit.spec.ts --ui

# Lancer avec le navigateur visible
npx playwright test quick-audit.spec.ts --headed

# Lancer avec le debugger
npx playwright test quick-audit.spec.ts --debug
```

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

## 📊 Couverture des tests

### ✅ Tests critiques validés (quick-audit.spec.ts)

**Résultat : 11/12 tests passent (91.7%)**

| Test | Statut | Description |
|------|--------|-------------|
| **SUM** | ✅ | Calcul de somme correct (valeur attendue: 23300) |
| **AVG** | ✅ | Calcul de moyenne correct (valeur attendue: 5825) |
| **MIN** | ✅ | Calcul de minimum correct (valeur attendue: 3000) |
| **MAX** | ✅ | Calcul de maximum correct (valeur attendue: 12000) |
| **COUNT** | ✅ | Comptage correct (valeur attendue: 4) |
| **HorizontalBar** | ✅ | Attribut `horizontal` présent dans le code |
| **Pie** | ✅ | Attribut `fill` présent dans le code |
| **KPI** | ✅ | Type kpi génère le bon composant |
| **Tri DESC** | ✅ | Attribut `order-by` avec `:desc` |
| **Filtre avancé** | ✅ | Mode avancé activable |
| **Palette** | ✅ | Attribut `chart-palette` appliqué |
| **Série 2** | ❌ | value-field-2 non visible (nécessite source chargée) |

### ✅ Tests de base validés (simple-test.spec.ts)

**Résultat : 7/8 tests passent**

- Page builder charge correctement ✅
- Sélection des champs disponibles ✅
- Fonctions d'agrégation disponibles ✅
- Types de graphiques disponibles ✅
- Palettes de couleurs disponibles ✅
- Bouton générer cliquable ✅
- Zone de code généré existe ✅
- Preview canvas existe (test basique) ⚠️

### 📋 Paramètres testés par les tests exhaustifs (comprehensive-test.spec.ts)

| Catégorie | Paramètres testés | Nombre |
|-----------|-------------------|--------|
| **Agrégations** | avg, sum, count, min, max | 5 |
| **Types de graphiques** | bar, horizontalBar, line, pie, doughnut, radar, scatter, gauge, kpi, map, datalist | 11 |
| **Palettes** | default, categorical, sequential (2), divergent (2), neutral | 7 |
| **Tri** | asc, desc | 2 |
| **Séries** | simple, double | 2 |
| **Mode avancé** | filtres, group-by, aggregate | 3 |

**Total : ~100 combinaisons à tester**

### ⚠️ Paramètres à valider manuellement

- [ ] KPI : variants (info, success, warning, error) et unités
- [ ] Map : attributs deferred (value, date)
- [ ] Datalist : colonnes configurables, recherche, export
- [ ] Normalization (dsfr-data-normalize) : flatten, trim, rename
- [ ] Facettes (dsfr-data-facets)
- [ ] Mode de génération (embedded vs dynamic)
- [ ] Refresh interval
- [ ] Raw data toggle

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

**Pour le champ `population` (testé dans quick-audit.spec.ts) :**

| Agrégation | Valeur attendue | Résultat test | Statut |
|------------|-----------------|---------------|--------|
| **SUM** | 23300 | 23300 | ✅ PASSE |
| **AVG** | 5825 | 5825 | ✅ PASSE |
| **MIN** | 3000 | 3000 | ✅ PASSE |
| **MAX** | 12000 | 12000 | ✅ PASSE |
| **COUNT** | 4 | 4 | ✅ PASSE |

**Pour le champ `budget` (valeurs de référence) :**

| Agrégation | Valeur attendue |
|------------|-----------------|
| **SUM** | 1030 |
| **AVG** | 257.5 |
| **MIN** | 150 |
| **MAX** | 500 |
| **COUNT** | 4 |

### Exposition du state pour les tests (REQUIS)

Les tests nécessitent que le state du builder soit exposé globalement. Cette modification a été apportée dans `apps/builder/src/main.ts` :

```typescript
// Expose state for E2E tests
(window as any).__BUILDER_STATE__ = state;
```

**Pourquoi c'est nécessaire ?**
- Permet aux tests d'injecter des données de test directement dans le state
- Permet de vérifier que les agrégations calculent les bonnes valeurs
- Permet de comparer les résultats affichés avec les valeurs attendues

**Note** : Cette exposition n'est utilisée QUE par les tests E2E et n'affecte pas le fonctionnement normal du builder.

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

## 🎯 Checklist avant release

Avant chaque release, vérifier :

### Tests automatisés
- [ ] Tous les tests d'agrégation passent
- [ ] Tous les types de graphiques se génèrent
- [ ] Toutes les palettes s'appliquent
- [ ] Les tris fonctionnent (asc, desc)
- [ ] Les filtres avancés marchent

### Tests manuels critiques
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

- Les tests sont parallélisés par défaut (Playwright)
- Pour accélérer, utiliser `--workers=4` (nombre de CPUs)
- Pour debug, utiliser `--workers=1`

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
- [Tests E2E existants](./builder-e2e-test.spec.ts)

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
