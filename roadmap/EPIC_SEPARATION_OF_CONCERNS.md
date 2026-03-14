# EPIC: Separation of Concerns — dsfr-data-source / dsfr-data-query

## Objectif

Clarifier les responsabilites de chaque composant pour que :
1. **dsfr-data-source** soit le seul composant qui parle au reseau (fetch, pagination, retry, cache)
2. **dsfr-data-query** soit un pur transformateur de donnees (filter, group-by, aggregate, sort)
3. L'ajout d'un nouveau provider (CKAN, INSEE Melodi...) ne necessite **aucune modification** dans les composants
4. Les composants middleware (dsfr-data-facets, dsfr-data-search) utilisent la config provider au lieu de hardcoder des syntaxes

## Etat des lieux

### Problemes actuels

| Composant | Probleme |
|---|---|
| **dsfr-data-query** | Fait du fetch HTTP (3 strategies), de la pagination (auto + server-side), ET du requetage. ~200 lignes de code "source" |
| **dsfr-data-source** | Sous-utilise. Pagination hardcodee `page`/`page_size` (biais Tabular). Ne connait pas les adapters |
| **dsfr-data-facets** | 2 builders WHERE dupliques : `_buildColonFacetWhere()` (colon) et `_buildFacetWhereExcluding()` (ODSQL) |
| **dsfr-data-search** | Template de recherche hardcode `search("{q}")` specifique ODS |
| **Adapters** | Vivent dans `src/adapters/` mais sont importes uniquement par dsfr-data-query. Un contributeur doit comprendre dsfr-data-query pour ajouter un provider |

### Architecture actuelle (ce qui ne va pas)

```
dsfr-data-source  ──[fetch basique]──► donnees brutes
                                      │
dsfr-data-query   ──[fetch via adapter]──► donnees brutes ──[transform]──► donnees finales
                   ▲
                   │ adapters (ODS, Tabular, Grist, Generic)
```

dsfr-data-query bypasse dsfr-data-source et fait son propre fetch. Les deux composants ecoutent `dsfr-data-source-command` independamment.

### Architecture cible

```
dsfr-data-source  ──[fetch via adapter]──[paginate]──[cache]──► donnees brutes
     │                                                         │
     │ adapters (ODS, Tabular, Grist, Generic, CKAN...)        │
     │                                                         ▼
     │                                               dsfr-data-normalize (optionnel)
     │                                                         │
     │                                                         ▼
     │                                               dsfr-data-query [transform seulement]
     │                                               filter, group-by, aggregate, sort
     │                                                         │
     │                                    ┌────────────────────┤
     │                                    ▼                    ▼
     │                              dsfr-data-facets          dsfr-data-search
     │                                    │                    │
     │◄── commandes (page, where, orderBy)┘                    │
     │◄── commandes (where) ───────────────────────────────────┘
     │
     ▼
  dsfr-data-chart / dsfr-data-list / dsfr-data-kpi
```

**Regle** : seul dsfr-data-source fait du fetch. Les commandes remontent vers lui via `dsfr-data-source-command`. dsfr-data-query ne fait jamais de requete HTTP.

---

## Contrainte de retrocompatibilite

Le HTML deploye chez les utilisateurs utilise `<dsfr-data-query api-type="opendatasoft" ...>` en mode autonome (sans dsfr-data-source). Ce pattern **doit continuer a fonctionner** pendant une periode de transition.

Strategie : dsfr-data-query garde son mode fetch autonome en interne mais marque comme `@deprecated`. Les builders generent le nouveau pattern. L'ancien fonctionne toujours.

---

## ETAPE 1 : Construire les nouvelles bases (sans casser l'existant) ✅ COMPLETE

> Principe : ajouter des capacites, exporter des utilitaires, enrichir les interfaces.
> **Aucun composant existant n'est modifie dans cette etape.**

### 1.1 Enrichir l'interface ApiAdapter

**Fichier** : `src/adapters/api-adapter.ts`

Ajouter a l'interface `ApiAdapter` :

```typescript
/** Construit un WHERE clause a partir de selections de facettes */
buildFacetWhere?(selections: Map<string, Set<string>>, excludeField?: string): string;

/** Retourne le template de recherche full-text pour ce provider */
getDefaultSearchTemplate?(): string | null;  // existe deja, s'assurer qu'il est implemente

/** Retourne la config provider associee */
getProviderConfig?(): ProviderConfig;
```

**Tests** : `tests/adapters/api-adapter.test.ts`
- Verifier que chaque adapter implemente les nouvelles methodes optionnelles

### 1.2 Implementer buildFacetWhere dans chaque adapter

**Fichiers** :
- `src/adapters/opendatasoft-adapter.ts` : syntaxe ODSQL (`field = "value"`, `field IN ("a", "b")`, separateur ` AND `)
- `src/adapters/tabular-adapter.ts` : syntaxe colon (`field:eq:value`, `field:in:a|b`, separateur `, `)
- `src/adapters/grist-adapter.ts` : syntaxe colon (meme que tabular)
- `src/adapters/generic-adapter.ts` : syntaxe colon (fallback)

La logique est extraite de `dsfr-data-facets.ts` lignes 328-340 (`_buildColonFacetWhere`) et lignes 535-554 (`_buildFacetWhereExcluding`).

**Tests** : `tests/adapters/facet-where.test.ts` (nouveau)
- ODS: `buildFacetWhere(Map{region: Set{"IDF"}})` → `region = "IDF"`
- ODS: multi-valeurs → `region IN ("IDF", "OCC")`
- ODS: multi-champs → `region = "IDF" AND dept = "75"`
- ODS: exclude field → omet le champ exclu
- Tabular: meme tests avec syntaxe colon
- Echappement des guillemets dans les valeurs

### 1.3 Implementer getDefaultSearchTemplate dans chaque adapter

**Fichiers** :
- `src/adapters/opendatasoft-adapter.ts` : retourne `'search("{q}")'` (existe deja, verifier)
- `src/adapters/tabular-adapter.ts` : retourne `null`
- `src/adapters/grist-adapter.ts` : retourne `null`
- `src/adapters/generic-adapter.ts` : retourne `null`

**Tests** : `tests/adapters/api-adapter.test.ts`
- Verifier la valeur retournee par chaque adapter

### 1.4 Creer un utilitaire partage de pagination

**Fichier** : `src/utils/pagination.ts` (nouveau)

```typescript
import type { ProviderConfig } from '@dsfr-data/shared';

export interface PaginationState {
  currentPage: number;
  totalCount: number;
  hasMore: boolean;
}

/**
 * Construit les parametres de pagination pour une URL selon le type de provider.
 * Lit ProviderConfig.pagination pour determiner offset vs page vs cursor.
 */
export function buildPaginationParams(
  config: ProviderConfig,
  page: number,
  pageSize: number
): Record<string, string> {
  const { type, params } = config.pagination;

  if (type === 'offset') {
    const offset = (page - 1) * pageSize;
    return {
      [params.offset || 'offset']: String(offset),
      [params.limit || 'limit']: String(pageSize),
    };
  }

  if (type === 'page') {
    return {
      [params.page || 'page']: String(page),
      [params.pageSize || 'page_size']: String(pageSize),
    };
  }

  // type === 'none' ou 'cursor'
  return {};
}

/**
 * Extrait les metadonnees de pagination d'une reponse JSON
 * selon la config provider.
 */
export function extractPaginationMeta(
  json: unknown,
  config: ProviderConfig
): PaginationMeta | null {
  // Utilise config.pagination.serverMeta ou config.response.totalCountPath
}
```

**Tests** : `tests/utils/pagination.test.ts` (nouveau)
- ODS offset: page=3, pageSize=100 → `{ offset: "200", limit: "100" }`
- Tabular page: page=3, pageSize=100 → `{ page: "3", page_size: "100" }`
- Grist none: retourne `{}`
- extractPaginationMeta avec chaque format de reponse

### 1.5 Creer un utilitaire partage de response parsing

**Fichier** : `src/utils/response-parser.ts` (nouveau)

```typescript
import type { ProviderConfig } from '@dsfr-data/shared';
import { getByPath } from './json-path.js';

/**
 * Extrait les donnees d'une reponse JSON selon la config provider.
 * Gere dataPath, nestedDataKey, requiresFlatten.
 */
export function extractData(json: unknown, config: ProviderConfig): unknown[] {
  let data = config.response.dataPath
    ? getByPath(json, config.response.dataPath)
    : json;

  if (!Array.isArray(data)) data = [data];

  // Flatten nested structures (ex: Grist records[].fields)
  if (config.response.requiresFlatten && config.response.nestedDataKey) {
    data = data.map((r: Record<string, unknown>) => {
      const nested = r[config.response.nestedDataKey!] as Record<string, unknown>;
      return nested ? { ...nested } : r;
    });
  }

  return data;
}

/**
 * Extrait le total count d'une reponse JSON.
 */
export function extractTotalCount(json: unknown, config: ProviderConfig): number | null {
  if (!config.response.totalCountPath) return null;
  const count = getByPath(json, config.response.totalCountPath);
  return typeof count === 'number' ? count : null;
}
```

**Tests** : `tests/utils/response-parser.test.ts` (nouveau)
- ODS: `{ results: [...], total_count: 42 }` → extraire results + count
- Tabular: `{ data: [...], meta: { total: 100 } }` → extraire data + count
- Grist: `{ records: [{ id: 1, fields: { col: "val" } }] }` → extraire + flatten
- Generic: tableau brut → retourner tel quel

### 1.6 Enrichir ProviderConfig pour la recherche

**Fichier** : `packages/shared/src/providers/provider-config.ts`

Ajouter dans la section `query` :

```typescript
query: {
  whereFormat: 'odsql' | 'colon';
  whereSeparator: string;
  aggregationSyntax: string;
  /** Template de recherche full-text. Ex: 'search("{q}")' pour ODS. null si pas de recherche serveur. */
  searchTemplate?: string | null;
  /** Mapping des operateurs generiques vers la syntaxe du provider */
  operatorMapping?: Record<string, string>;
};
```

Mettre a jour chaque config provider :
- `opendatasoft.ts` : `searchTemplate: 'search("{q}")'`
- `tabular.ts` : `searchTemplate: null`
- `grist.ts` : `searchTemplate: null`
- `generic.ts` : `searchTemplate: null`

Ajouter `operatorMapping` dans `tabular.ts` :
```typescript
operatorMapping: {
  eq: 'exact', neq: 'differs', gt: 'strictly_greater', gte: 'greater',
  lt: 'strictly_less', lte: 'less', contains: 'contains', notcontains: 'notcontains',
  in: 'in', notin: 'notin', isnull: 'isnull', isnotnull: 'isnotnull',
}
```

**Tests** : `tests/shared/providers/provider-config.test.ts`
- Verifier que chaque provider a les nouveaux champs
- Verifier la coherence searchTemplate ↔ capabilities.serverSearch

### 1.7 Deplacer le registre d'adapters vers un module autonome

**Fichier** : `src/adapters/adapter-registry.ts` (nouveau, extrait de `api-adapter.ts`)

```typescript
import type { ApiAdapter } from './api-adapter.js';
import { GenericAdapter } from './generic-adapter.js';
import { OpenDataSoftAdapter } from './opendatasoft-adapter.js';
import { TabularAdapter } from './tabular-adapter.js';
import { GristAdapter } from './grist-adapter.js';

const ADAPTER_REGISTRY = new Map<string, ApiAdapter>([
  ['generic', new GenericAdapter()],
  ['opendatasoft', new OpenDataSoftAdapter()],
  ['tabular', new TabularAdapter()],
  ['grist', new GristAdapter()],
]);

export function getAdapter(apiType: string): ApiAdapter { ... }
export function registerAdapter(adapter: ApiAdapter): void { ... }
```

`api-adapter.ts` re-exporte pour backward compat :
```typescript
export { getAdapter, registerAdapter } from './adapter-registry.js';
```

Cela permet a dsfr-data-source d'importer le registre sans dependre de dsfr-data-query.

**Tests** : Les tests existants `tests/adapters/api-adapter.test.ts` doivent continuer a passer sans modification.

### 1.8 Ajouter `api-type` et les attributs adapter a dsfr-data-source (nouveau mode)

**Fichier** : `src/components/dsfr-data-source.ts`

Ajouter les proprietes necessaires pour le mode "adapter-driven" :

```typescript
/** Type d'API — active le mode adapter si != 'generic' */
@property({ type: String, attribute: 'api-type' })
apiType: ApiType = 'generic';

/** URL de base de l'API (pour ODS, Tabular) */
@property({ type: String, attribute: 'base-url' })
baseUrl = '';

/** ID du dataset (pour ODS, Tabular) */
@property({ type: String, attribute: 'dataset-id' })
datasetId = '';

/** ID de la ressource (pour Tabular) */
@property({ type: String })
resource = '';

/** Clause WHERE statique */
@property({ type: String })
where = '';

/** Clause SELECT (pour ODS) */
@property({ type: String })
select = '';

/** Group-by (pour les APIs qui le supportent) */
@property({ type: String, attribute: 'group-by' })
groupBy = '';

/** Agregation (pour les APIs qui le supportent) */
@property({ type: String })
aggregate = '';

/** Order-by */
@property({ type: String, attribute: 'order-by' })
orderBy = '';

/** Mode pagination serveur (datalist, tableaux) */
@property({ type: Boolean, attribute: 'server-side' })
serverSide = false;

/** Taille de page pour la pagination serveur */
@property({ type: Number, attribute: 'page-size' })  // existe deja
pageSize = 20;

/** Limite du nombre de resultats */
@property({ type: Number })
limit = 0;

/** Headers HTTP supplementaires (JSON string) */
@property({ type: String })  // existe deja
headers = '';
```

**Comportement** :
- Si `apiType === 'generic'` (defaut) : comportement actuel inchange (fetch URL brute)
- Si `apiType !== 'generic'` : utilise l'adapter via `getAdapter(apiType)` pour construire l'URL, paginer, parser la reponse
- Ecoute `dsfr-data-source-command` pour `page`, `where`, `orderBy` (overlay server-side)
- Utilise `buildPaginationParams()` et `extractData()` des nouveaux utilitaires
- Expose `getAdapter()` et `getEffectiveWhere()` pour que dsfr-data-facets/search puissent acceder a l'adapter

**Tests** : `tests/components/dsfr-data-source-adapter.test.ts` (nouveau)
- Mode generic : comportement identique a l'actuel
- Mode ODS : construit l'URL avec offset/limit, parse results + total_count
- Mode Tabular : construit l'URL avec page/page_size, auto-pagine via links.next
- Mode Grist : fetch unique, flatten records[].fields
- Commandes : where/orderBy/page modifient le prochain fetch
- getEffectiveWhere() retourne le merge static + dynamic

### 1.9 Mettre a jour les ProviderConfig.codeGen

**Fichier** : Chaque provider config dans `packages/shared/src/providers/`

Mettre a jour `codeGen` pour que les builders generent le nouveau pattern :

```typescript
// opendatasoft.ts
codeGen: {
  usesDsfrDataSource: true,   // CHANGE: true (avant: false)
  usesDsfrDataQuery: true,    // inchange, pour les transformations client
  ...
}
```

**Attention** : Ce changement affectera les builders (code-generator.ts) dans l'etape 2. Pour l'etape 1, on ajoute un nouveau champ sans modifier l'ancien :

```typescript
codeGen: {
  usesDsfrDataSource: false,  // legacy : inchange
  usesDsfrDataQuery: true,    // legacy : inchange
  /** Nouveau pattern (etape 2) */
  v2: {
    usesDsfrDataSource: true,
    usesDsfrDataQuery: true,
    sourceApiType: 'opendatasoft',
  },
  ...
}
```

### 1.10 Tests d'integration etape 1

**Fichier** : `tests/integration/source-adapter.test.ts` (nouveau)

Tests bout-en-bout (mock fetch) :
- `<dsfr-data-source api-type="opendatasoft" ...>` → emet les bonnes donnees
- `<dsfr-data-source api-type="tabular" ...>` → auto-pagination multi-pages
- `<dsfr-data-source api-type="grist" ...>` → flatten records[].fields
- `<dsfr-data-source api-type="opendatasoft" ...>` + commande `{ where: 'search("Paris")' }` → re-fetch avec WHERE
- `<dsfr-data-source api-type="tabular" ...>` + commande `{ page: 3 }` → fetch page 3

### Verification etape 1

```bash
npm run test:run    # Tous les tests existants passent + nouveaux tests
npm run build:all   # Tout compile
```

**Critere de completion** : aucun test existant ne casse, aucun composant existant ne change de comportement, les nouveaux utilitaires et le nouveau mode de dsfr-data-source fonctionnent.

---

## ETAPE 2 : Nettoyer le legacy et normaliser les composants ✅ COMPLETE

> Principe : migrer les composants vers les nouvelles bases, supprimer le code duplique.
> A la fin de cette etape, dsfr-data-query ne fait plus aucun fetch HTTP.

### 2.1 Migrer dsfr-data-query : supprimer tout le code fetch

**Fichier** : `src/components/dsfr-data-query.ts`

**Supprimer** (~200 lignes) :
- `_fetchFromApi()` (lignes ~637-673)
- `_fetchAllDelegated()` (lignes ~678-695)
- `_fetchServerSideDelegated()` (lignes ~700-732)
- `_fetchSinglePage()` (lignes ~737-766)
- `_setupServerSideListener()` (lignes ~809-856) — la partie pagination/where/orderBy
- `_getAdapterParams()` (lignes ~784-800)
- Import de `getAdapter` et des types adapter

**Modifier** `_initialize()` :
- Si `apiType !== 'generic'` ET pas de `source` : afficher un warning de deprecation dans la console, puis creer en interne un `<dsfr-data-source>` shadow avec les memes attributs (backward compat)
- Si `source` est defini : s'abonner a la source (comportement actuel du mode generic)
- Dans tous les cas, appliquer les transformations client-side sur les donnees recues

**Conserver** :
- `_processClientSide()` — filter, group-by, aggregate, sort, limit
- `_applyFilters()`, `_parseFilters()`, `_matchesFilter()`
- `_applyGroupByAndAggregate()`, `_parseAggregates()`, `_computeAggregate()`
- `_applySort()`
- `getEffectiveWhere()` — pour que dsfr-data-facets puisse lire le WHERE merge
- L'ecoute de `dsfr-data-source-command` pour le re-dispatch vers la source upstream

**Backward compat** : Si l'utilisateur ecrit `<dsfr-data-query api-type="opendatasoft" base-url="..." dataset-id="...">` sans dsfr-data-source, le composant cree un dsfr-data-source interne invisible et lui delegue le fetch. Warning console : "dsfr-data-query mode autonome est deprecie, utilisez dsfr-data-source + dsfr-data-query."

**Tests** : Mettre a jour `tests/apps/builder/code-generator.test.ts` et `tests/components/dsfr-data-query.test.ts`
- Tous les tests existants doivent passer (backward compat)
- Nouveaux tests : dsfr-data-query recoit les donnees d'un dsfr-data-source externe

### 2.2 Migrer dsfr-data-facets : utiliser adapter.buildFacetWhere()

**Fichier** : `src/components/dsfr-data-facets.ts`

**Supprimer** :
- `_buildColonFacetWhere()` (lignes ~328-340)
- `_buildFacetWhereExcluding()` (lignes ~535-554)

**Remplacer par** :
```typescript
private _buildFacetWhere(excludeField?: string): string {
  const sourceEl = document.getElementById(this.source);
  const adapter = (sourceEl as any)?.getAdapter?.();
  if (adapter?.buildFacetWhere) {
    return adapter.buildFacetWhere(this._activeSelections, excludeField);
  }
  // Fallback : colon syntax par defaut
  return this._buildColonFacetWhereFallback(excludeField);
}
```

**Tests** : Mettre a jour `tests/components/dsfr-data-facets.test.ts`
- Verifier que les WHERE sont generes via l'adapter
- Verifier le fallback colon si pas d'adapter

### 2.3 Migrer dsfr-data-search : lire le searchTemplate depuis le provider

**Fichier** : `src/components/dsfr-data-search.ts`

**Modifier** :
- Le `searchTemplate` par defaut passe de `'search("{q}")'` a `''` (vide)
- A l'initialisation, si `searchTemplate` est vide et `serverSearch` est true :
  ```typescript
  const sourceEl = document.getElementById(this.source);
  const adapter = (sourceEl as any)?.getAdapter?.();
  if (adapter?.getDefaultSearchTemplate) {
    this.searchTemplate = adapter.getDefaultSearchTemplate() || '';
  }
  ```
- Si `searchTemplate` est explicitement defini par l'utilisateur, ne pas le surcharger

**Tests** : Mettre a jour `tests/components/dsfr-data-search.test.ts`
- Verifier que le template est lu depuis l'adapter
- Verifier qu'un template explicite n'est pas surcharge

### 2.4 Migrer les builders vers le nouveau pattern

**Fichiers** :
- `apps/builder/src/ui/code-generator.ts`
- `apps/builder-ia/src/ui/code-generator.ts`
- `apps/dashboard/src/ui/code-generator.ts`

**Pattern genere (avant)** :
```html
<dsfr-data-query id="data" api-type="opendatasoft" base-url="..." dataset-id="..." ...></dsfr-data-query>
<dsfr-data-chart source="data" ...></dsfr-data-chart>
```

**Pattern genere (apres)** :
```html
<dsfr-data-source id="src" api-type="opendatasoft" base-url="..." dataset-id="..." ...></dsfr-data-source>
<dsfr-data-query id="data" source="src" group-by="..." aggregate="..." ...></dsfr-data-query>
<dsfr-data-chart source="data" ...></dsfr-data-chart>
```

Quand dsfr-data-query n'a aucune transformation (pas de filter/group-by/aggregate/sort), on peut l'omettre :
```html
<dsfr-data-source id="src" api-type="opendatasoft" ...></dsfr-data-source>
<dsfr-data-chart source="src" ...></dsfr-data-chart>
```

#### Simplification du code generator : unifier les 3 chemins en 1

Aujourd'hui le code generator a 3 fonctions distinctes pour generer la partie fetch+query
selon le provider. Apres l'epic, le pattern est le meme pour tous : `source + query`.
Cela permet de **supprimer** les fonctions specifiques et de factoriser.

**Supprimer** (~160 lignes) :
- `generateOdsQueryCode()` (~90 lignes) -- genere `<dsfr-data-query api-type="opendatasoft" ...>`
- `generateTabularQueryCode()` (~70 lignes) -- genere `<dsfr-data-query api-type="tabular" ...>`

**Creer** (~40 lignes) :
- `generateSourceElement(provider, resourceIds, options)` -- genere le `<dsfr-data-source>` avec
  les attributs adaptes au provider (api-type, base-url, dataset-id, resource, where, select,
  order-by, server-side, page-size). Utilise `ProviderConfig.codeGen` pour determiner les
  attributs pertinents.

**Reutiliser** (inchange) :
- `generateDsfrDataQueryCode(sourceId, labelFieldPath, valueFieldPath)` -- genere le `<dsfr-data-query>`
  avec les transformations client (group-by, aggregate, filter, order-by). Cette fonction
  existe deja et fait exactement ce qu'il faut : elle prend un `sourceId` et genere un
  `<dsfr-data-query source="...">`.

**Simplifier** :
- `generateDynamicCodeForApi()` : supprimer le branchement if/else ODS/Tabular/generic.
  Le flux devient lineaire : `generateSourceElement()` + `generateDsfrDataQueryCode()` pour
  tous les providers.

**Bilan** :
```
Avant (3 chemins, ~230 lignes) :
  ODS       -> generateOdsQueryCode()      ~90 lignes
  Tabular   -> generateTabularQueryCode()  ~70 lignes
  Grist/Gen -> generateDsfrDataQueryCode()     ~70 lignes

Apres (1 chemin + 1 helper, ~110 lignes) :
  Tous      -> generateSourceElement()     ~40 lignes (nouveau)
            +  generateDsfrDataQueryCode()     ~70 lignes (existant, inchange)
```

Resultat net : **~120 lignes en moins** dans le code generator.

**Tests** : Mettre a jour les tests existants des code generators + tests d'alignement

### 2.5 Migrer les skills builder-IA

**Fichier** : `apps/builder-ia/src/skills.ts`

Mettre a jour les skills `dsfrDataSource`, `dsfrDataQuery` et `apiProviders` pour refleter :
- dsfr-data-source a maintenant `api-type`, `base-url`, `dataset-id`, `resource`, `where`, `select`, `group-by`, `aggregate`, `order-by`
- dsfr-data-query n'a plus `api-type`, `base-url`, `dataset-id`, `resource` (deprecated)
- Le pattern recommande est `source → query → chart`

**Tests** : `tests/apps/builder-ia/skills.test.ts` doit etre mis a jour

### 2.6 Migrer le MCP server

**Fichier** : `mcp-server/src/index.ts`

Mettre a jour la spec de generation de code pour utiliser le nouveau pattern source + query.

### 2.7 Mettre a jour le guide et les exemples

**Fichiers** :
- `guide/*.html` — exemples avec le nouveau pattern
- `apps/playground/src/main.ts` — exemples par defaut

### 2.8 Nettoyer le code mort

- Supprimer `codeGen.v2` des ProviderConfig (remplacer par les valeurs finales)
- Supprimer les re-exports de backward compat dans `api-adapter.ts` si plus utilises
- Supprimer le type `ApiType` de `dsfr-data-query.ts` (le deplacer vers `dsfr-data-source.ts` ou `api-adapter.ts`)
- Deprecation warnings dans dsfr-data-query si `api-type` est utilise directement

### Verification etape 2

```bash
npm run test:run      # Tous les tests passent
npm run build:all     # Tout compile
npm run test:coverage # Couverture stable ou en hausse
```

**Critere de completion** :
- dsfr-data-query ne contient plus aucun `fetch()` ni import d'adapter
- dsfr-data-facets n'a plus de WHERE builder inline
- dsfr-data-search lit le template depuis l'adapter
- Les builders generent le nouveau pattern `source → query → chart`
- L'ancien pattern `<dsfr-data-query api-type="...">` fonctionne toujours (deprecated)
- Tous les tests passent

---

## Matrice des modifications par fichier

| Fichier | Etape 1 | Etape 2 |
|---|---|---|
| `src/adapters/api-adapter.ts` | Interface enrichie | Re-exports cleanup |
| `src/adapters/adapter-registry.ts` | **Nouveau** | — |
| `src/adapters/opendatasoft-adapter.ts` | +buildFacetWhere | — |
| `src/adapters/tabular-adapter.ts` | +buildFacetWhere | — |
| `src/adapters/grist-adapter.ts` | +buildFacetWhere | — |
| `src/adapters/generic-adapter.ts` | +buildFacetWhere | — |
| `src/utils/pagination.ts` | **Nouveau** | — |
| `src/utils/response-parser.ts` | **Nouveau** | — |
| `src/components/dsfr-data-source.ts` | +api-type, +adapter mode | — |
| `src/components/dsfr-data-query.ts` | — | Supprimer fetch, mode compat |
| `src/components/dsfr-data-facets.ts` | — | Utiliser adapter.buildFacetWhere |
| `src/components/dsfr-data-search.ts` | — | Lire searchTemplate depuis adapter |
| `packages/shared/src/providers/*.ts` | +searchTemplate, +operatorMapping, +codeGen.v2 | Cleanup v2 |
| `apps/builder/src/ui/code-generator.ts` | — | Supprimer generateOds/TabularQueryCode, creer generateSourceElement (~120 lignes en moins) |
| `apps/builder-ia/src/ui/code-generator.ts` | — | Idem builder (meme refactoring) |
| `apps/builder-ia/src/skills.ts` | — | Mise a jour skills |
| `apps/dashboard/src/ui/code-generator.ts` | — | Nouveau pattern |
| `mcp-server/src/index.ts` | — | Mise a jour |
| `guide/*.html` | — | Nouveaux exemples |
| `tests/apps/playground/examples.test.ts` | — | Mise a jour des 41 exemples |
| `e2e/*.spec.ts` | — | Verifier backward compat |
| `CLAUDE.md` | — | Architecture section mise a jour |
| `src/utils/beacon.ts` | +api-type dans beacon | — |
| `apps/sources/src/` | — | Pas de modif (futur Phase 3) |

---

## Elements stables (pas de modification)

Ces fichiers/modules ne sont **pas** touches par cet epic :

| Element | Raison |
|---|---|
| `src/utils/source-subscriber.ts` (mixin) | Les composants downstream (dsfr-data-chart, dsfr-data-list, dsfr-data-kpi) souscrivent via ce mixin. Il ecoute `dsfr-data-loaded` qui est emis identiquement par dsfr-data-source et dsfr-data-query. Aucun changement necessaire. |
| `src/utils/data-bridge.ts` | L'interface `SourceCommandEvent` (page, where, whereKey, orderBy) est deja complete pour les besoins de dsfr-data-source enrichi. Pas de nouveau champ necessaire. |
| `vite.config.ts` (proxy) | Les regles proxy (`/grist-proxy`, `/tabular-proxy`, etc.) sont utilisees de maniere identique par dsfr-data-source et dsfr-data-query. Aucun changement. |
| `index.html` (hub) | Page d'accueil marketing, ne reference pas de pattern technique. |
| `apps/sources/` | L'app Sources gere les connexions API independamment. Pas dans le scope de cet epic. Opportunite future (Phase 3) : detecter le provider via `detectProvider()` pour guider l'utilisateur. |

---

## Details supplementaires etape 1

### 1.8.1 Beacon dsfr-data-source avec api-type

**Fichier** : `src/utils/beacon.ts`

Quand `dsfr-data-source` est en mode adapter (`apiType !== 'generic'`), le beacon doit inclure le type de provider :

```typescript
sendWidgetBeacon('dsfr-data-source', this.apiType); // ex: 'opendatasoft'
```

Cela permet au monitoring de savoir quels providers sont deployes en production.

---

## Details supplementaires etape 2

### 2.4.1 Algorithme de generation de code (builders)

Quand le code generator genere pour une source API :

**1. Emettre `<dsfr-data-source>`** avec :
- `id`, `api-type`, `base-url`, `dataset-id`, `resource`, `headers`
- `where` : uniquement les clauses WHERE statiques (pas les facettes dynamiques)
- `select` : (ODS seulement)
- `server-side` + `page-size` : si pagination serveur active (datalist, tableaux)

**2. Emettre `<dsfr-data-query>`** SEULEMENT si une transformation client est necessaire :
- `group-by`, `aggregate` : si le provider ne supporte pas l'aggregation serveur (Tabular, Grist, Generic)
- `filter` : si filtre client-side
- `order-by` : si tri client-side (providers sans serverOrderBy)
- `limit` : si limitation client

**3. Omettre `<dsfr-data-query>`** quand :
- Le provider gere tout server-side (ODS avec select/group-by/order-by) ET
- Pas de facettes NI recherche en aval

**Exemples concrets** :

```html
<!-- ODS sans transformation client : source → chart -->
<dsfr-data-source id="src" api-type="opendatasoft" base-url="..." dataset-id="..."
  select="sum(population) as total, region" group-by="region" order-by="total:desc">
</dsfr-data-source>
<dsfr-data-chart source="src" type="bar" ...></dsfr-data-chart>

<!-- Tabular avec aggregation client : source → query → chart -->
<dsfr-data-source id="src" api-type="tabular" base-url="..." resource="..."></dsfr-data-source>
<dsfr-data-query id="data" source="src" group-by="region" aggregate="population:sum" order-by="population__sum:desc"></dsfr-data-query>
<dsfr-data-chart source="data" type="bar" ...></dsfr-data-chart>

<!-- Datalist pagine : source (server-side) → datalist -->
<dsfr-data-source id="src" api-type="tabular" base-url="..." resource="..." server-side page-size="50"></dsfr-data-source>
<dsfr-data-list source="src" ...></dsfr-data-list>

<!-- Generic (CSV) : source → chart (pas de query) -->
<dsfr-data-source id="src" url="https://example.com/data.json" transform="data"></dsfr-data-source>
<dsfr-data-chart source="src" type="bar" ...></dsfr-data-chart>
```

### 2.5.1 Contenu detaille des skills mis a jour

**Skill `dsfrDataSource` (enrichi)** :
```
Attributs :
  api-type     : Type de provider (opendatasoft, tabular, grist, generic)
  base-url     : URL de base de l'API
  dataset-id   : ID du dataset (ODS, Tabular)
  resource     : ID de la ressource (Tabular)
  url          : URL brute (mode generic, comme avant)
  transform    : Chemin JSON pour extraire les donnees (mode generic)
  where        : Clause WHERE statique
  select       : Clause SELECT (ODS seulement)
  group-by     : Group-by serveur (si supporte par le provider)
  aggregate    : Aggregation serveur (si supporte par le provider)
  order-by     : Tri serveur (si supporte par le provider)
  server-side  : Active la pagination serveur (pour datalist/tableaux)
  page-size    : Taille de page serveur
  refresh      : Intervalle de rafraichissement (secondes)
  headers      : Headers HTTP supplementaires (JSON)

Pattern recommande :
  <dsfr-data-source id="src" api-type="opendatasoft" base-url="..." dataset-id="...">
  </dsfr-data-source>
  <dsfr-data-query id="data" source="src" group-by="..." aggregate="..."></dsfr-data-query>
  <dsfr-data-chart source="data" type="bar" ...></dsfr-data-chart>
```

**Skill `dsfrDataQuery` (simplifie)** :
```
@deprecated : api-type, base-url, dataset-id, resource
  → Utiliser dsfr-data-source a la place pour le fetch.
  → dsfr-data-query ne fait que transformer les donnees.

Attributs conserves :
  source, group-by, aggregate, filter, order-by, limit, where
```

### 2.7.1 Checklist des fichiers guide

| Fichier | Action Phase 2 |
|---|---|
| `guide/guide-exemples-source.html` | Ajouter section "dsfr-data-source avec api-type" |
| `guide/guide-exemples-query.html` | Marquer [DEPRECIE] les exemples avec `api-type`, ajouter pattern source+query |
| `guide/guide-exemples-facets.html` | Migrer vers source → query → facets |
| `guide/guide-exemples-search.html` | Migrer recherche serveur vers source + search |
| `guide/guide-exemples-display.html` | Migrer vers source → datalist |
| `guide/guide-exemples-normalize.html` | Deja correct (source → normalize), verifier |
| `guide/guide-exemples-avances.html` | Refactorer le pipeline multi-zone |
| `guide/USER-GUIDE.md` | Mettre a jour la section architecture |

### 2.7.2 Strategie exemples playground

**Etat actuel** : 41 exemples dans `apps/playground/src/examples/examples-data.ts`
- ~60% utilisent deja `dsfr-data-source` (pattern correct)
- ~40% utilisent `<dsfr-data-query api-type="...">` (pattern a migrer)

**Phase 2** :
- Migrer tous les `query-*` exemples vers le pattern source + query
- Ajouter des exemples "nouveau pattern" pour chaque provider (ODS, Tabular, Grist)
- Conserver les exemples anciens marques "[LEGACY]" pour reference
- Mettre a jour `tests/apps/playground/examples.test.ts` en consequence

### 2.9 Mettre a jour CLAUDE.md

**Fichier** : `CLAUDE.md`

Mettre a jour la section "Architecture" pour refleter :
- `dsfr-data-source` est le composant de fetch (supporte `api-type` pour ODS, Tabular, Grist)
- `dsfr-data-query` est un pur transformateur (ne fait plus de fetch HTTP)
- Les adapters sont dans `src/adapters/`, importes par dsfr-data-source
- ProviderConfig dans `packages/shared/src/providers/`

Ajouter une note dans la section "Skills builder-IA" :
- dsfr-data-source a de nouveaux attributs (api-type, base-url, etc.)
- dsfr-data-query api-type est deprecie

---

## Strategie de tests

### Tests unitaires (Vitest)

| Quand | Quoi | Fichier |
|---|---|---|
| Etape 1 | Utilitaires pagination | `tests/utils/pagination.test.ts` (nouveau) |
| Etape 1 | Utilitaires response-parser | `tests/utils/response-parser.test.ts` (nouveau) |
| Etape 1 | Adapter buildFacetWhere | `tests/adapters/facet-where.test.ts` (nouveau) |
| Etape 1 | dsfr-data-source mode adapter | `tests/components/dsfr-data-source-adapter.test.ts` (nouveau) |
| Etape 1 | Integration source+adapter | `tests/integration/source-adapter.test.ts` (nouveau) |
| Etape 2 | dsfr-data-query sans fetch | `tests/components/dsfr-data-query.test.ts` (mis a jour) |
| Etape 2 | dsfr-data-facets avec adapter | `tests/components/dsfr-data-facets.test.ts` (mis a jour) |
| Etape 2 | dsfr-data-search template adapter | `tests/components/dsfr-data-search.test.ts` (mis a jour) |
| Etape 2 | Code generators (3 builders) | `tests/apps/builder/code-generator.test.ts` (mis a jour) |
| Etape 2 | Skills alignement | `tests/apps/builder-ia/skills.test.ts` (mis a jour) |
| Etape 2 | Exemples playground | `tests/apps/playground/examples.test.ts` (mis a jour) |

### Tests E2E (Playwright)

| Quand | Quoi |
|---|---|
| Etape 1 | Les tests E2E existants passent sans modification |
| Etape 2 | `e2e/grist-widgets.spec.ts` : verifier backward compat `<dsfr-data-query api-type="grist">` |
| Etape 2 | Nouveau : tester le pattern `<dsfr-data-source api-type="...">` en E2E |

### Commandes de verification

```bash
# Etape 1
npm run test:run        # Tous les tests unitaires
npm run build:all       # Build complet

# Etape 2
npm run test:run        # Tous les tests unitaires (mis a jour)
npm run build:all       # Build complet
npx playwright test     # Tests E2E
```

---

## Test du nouveau provider (CKAN)

Apres cet epic, ajouter CKAN necessite :

1. `packages/shared/src/providers/ckan.ts` — ProviderConfig declaratif
2. `src/adapters/ckan-adapter.ts` — buildUrl, fetchAll, fetchPage, buildFacetWhere
3. `registerProvider(CKAN_CONFIG)` dans `providers/index.ts`
4. `registerAdapter(new CkanAdapter())` dans `adapter-registry.ts`
5. **Zero modification** dans dsfr-data-source, dsfr-data-query, dsfr-data-facets, dsfr-data-search, les builders

---

## Opportunites futures (Phase 3+)

- **Apps/Sources** : integrer `detectProvider()` dans l'UI de connexion pour guider l'utilisateur
- **Beacon api-type** : dashboard monitoring par provider
- **Cursor-based pagination** : ajouter le support dans `buildPaginationParams()` quand un provider le necessite
- **Supprimer le mode autonome de dsfr-data-query** : une fois que tout le code deploye a ete migre

---

## Verification finale

En fin d'epic, avant qu'il ne soit considere comme 'done', assure toi d'avoir relu tout l'epic et double-checke que :
- [x] dsfr-data-source est le seul composant qui fait du fetch HTTP
- [x] dsfr-data-query ne contient aucun `fetch()` ni import d'adapter
- [x] dsfr-data-facets utilise `adapter.buildFacetWhere()` au lieu de builders inline
- [x] dsfr-data-search lit `searchTemplate` depuis l'adapter
- [x] L'ancien pattern `<dsfr-data-query api-type="...">` fonctionne (deprecated, warning console)
- [x] Les builders generent le nouveau pattern
- [x] Tous les tests unitaires passent (`npm run test:run`)
- [ ] Tous les tests E2E passent (`npx playwright test`)
- [x] Toutes les apps buildent (`npm run build:all`)
- [x] Le guide contient des exemples a jour
- [x] CLAUDE.md est a jour
- [x] Les skills builder-IA sont a jour
- [x] Les exemples playground sont migres (15 exemples, 228 tests code generator)
