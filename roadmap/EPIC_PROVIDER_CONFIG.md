# Epic : Centralisation des configurations API (ProviderConfig)

## Contexte

L'audit `SOURCE_API_MANAGEMENT_AUDIT.md` a revele que la gestion des
specificites API (ODS, Tabular, Grist, generic REST) est dispersee dans ~25
fichiers avec des duplications, des incoherences et une logique provider
repartie dans ~18 branches `if/else` a travers 4 fonctions du code generator.

Le systeme d'adapters dans `dsfr-data-query` (`src/adapters/`) est bien concu et
doit servir de fondation. Mais cette architecture n'est pas partagee avec les
code generators (builder + builder-IA), les apps (sources, grist-widgets), ni
la definition des sources elle-meme.

## Objectifs

1. **Un seul endroit** pour definir les specificites d'un provider API
2. **Un seul type `Source`** partage entre toutes les apps
3. **Detection provider a la creation** de la source (pas a chaque generation)
4. **Code generators simplifies** qui lisent une config au lieu de brancher
5. **Ajout d'un nouveau provider** = 1 fichier de config + 1 adapter
6. **Zero regression** sur les 1534 tests existants

## Non-objectifs

- Changer l'interface utilisateur des apps
- Modifier le comportement runtime des composants dsfr-data-*
- Remplacement complet des adapters existants (on les enrichit)

---

## Surface de compatibilite

Le refactoring est **iso-fonctionnel** : aucun exemple existant ne doit casser.

### Playground (41 exemples)

| Categorie | Exemples | Providers | Composants cles |
|---|---|---|---|
| Direct (10) | bar, line, pie, radar, gauge, scatter, barline, map, kpi, datalist | ODS, Tabular | dsfr-data-source, dsfr-data-query, dsfr-data-chart, dsfr-data-kpi, dsfr-data-list |
| Server pagination (3) | paginate-datalist, paginate-display, paginate-kpi-global | Tabular | dsfr-data-source (paginate), dsfr-data-list, dsfr-data-display |
| Query (11) | query-bar, query-line, query-pie, query-radar, query-gauge, query-scatter, query-barline, query-map, query-kpi, query-datalist, query-tabular-pie | ODS, Tabular | dsfr-data-query (api-type="opendatasoft" + "tabular") |
| Normalize (4) | normalize-bar, normalize-pie, normalize-line, normalize-datalist | Tabular (LOVAC) | dsfr-data-normalize (trim, numeric-auto, rename) |
| Facets (3) | facets-datalist, facets-bar, facets-map | ODS, Tabular | dsfr-data-facets (multiselect, select, radio) |
| Display (3) | direct-display, query-display, normalize-display | ODS, Tabular | dsfr-data-display (template, cols, pagination) |
| Search/Advanced (7) | search-facets-display, search-kpi-chart, search-datalist, search-display, server-side-ods, server-side-tabular-tri, server-facets-display | ODS, Tabular | dsfr-data-search, dsfr-data-facets (server-facets) |

### Guide (8 pages HTML)

| Page | Composants | Providers |
|---|---|---|
| guide-exemples-source.html | dsfr-data-source, dsfr-data-chart, dsfr-data-kpi, dsfr-data-list | ODS, Tabular |
| guide-exemples-normalize.html | dsfr-data-normalize | ODS, Tabular |
| guide-exemples-query.html | dsfr-data-query (14 exemples dont server-side) | ODS, Tabular |
| guide-exemples-search.html | dsfr-data-search (client + server) | ODS, Tabular |
| guide-exemples-facets.html | dsfr-data-facets (client + server-facets) | ODS, Tabular |
| guide-exemples-display.html | dsfr-data-display | ODS, Tabular |
| guide-exemples-avances.html | Pipeline complet multizone | ODS (server-side) |

### Tests existants

- `tests/apps/playground/examples.test.ts` : valide les 41 exemples (presence, composants, structure HTML)
- `tests/apps/builder/code-generator.test.ts` : 232 tests du code generator
- `tests/apps/builder-ia/skills.test.ts` : alignement skills ↔ composants
- Total : **1534 tests** dans 63 fichiers

### Strategie de validation

Avant le refactoring Phase 3 (la plus risquee), generer des **snapshots HTML** pour
chaque combinaison provider x chart-type x middleware :

```
4 providers x 9 chart types x 2 (facets on/off) x 2 (normalize on/off) = ~144 snapshots
```

Ces snapshots deviennent des tests de non-regression : le HTML genere apres refactoring
doit etre identique caractere par caractere.

---

## Architecture cible

```
packages/shared/src/
  providers/
    provider-config.ts        # Interface ProviderConfig + registre
    opendatasoft.ts           # Config ODS
    tabular.ts                # Config Tabular
    grist.ts                  # Config Grist
    generic.ts                # Config Generic REST
    index.ts                  # Export public + detectProvider()
  types/
    source.ts                 # Interface Source unifiee
  api/
    proxy-config.ts           # Existant (inchange)
    proxy.ts                  # Simplifie : utilise le registre providers

src/adapters/
    api-adapter.ts            # Existant : enrichi avec ref a ProviderConfig
    opendatasoft-adapter.ts   # Existant : lit constantes depuis ProviderConfig
    tabular-adapter.ts        # Existant : lit constantes depuis ProviderConfig
    generic-adapter.ts        # Existant (inchange)
    grist-adapter.ts          # NOUVEAU : adapter Grist (actuellement absent)
```

---

## Phase 1 : ProviderConfig + Source unifiee (fondations)

### 1.1 Definir l'interface ProviderConfig

**Fichier :** `packages/shared/src/providers/provider-config.ts`

```typescript
export type ProviderId = 'opendatasoft' | 'tabular' | 'grist' | 'generic';

export interface ProviderConfig {
  // --- Identite ---
  id: ProviderId;
  displayName: string;
  /** Regex pour detecter ce provider a partir d'une URL API */
  urlPatterns: RegExp[];

  // --- Connexion / Proxy ---
  /** Hostname(s) connu(s) */
  knownHosts: Array<{ hostname: string; proxyEndpoint: string }>;
  /** URL cible par defaut (sans proxy) */
  defaultBaseUrl: string;
  /** Type d'authentification par defaut */
  defaultAuthType: 'bearer' | 'apikey-header' | 'query-param' | 'none';

  // --- Structure de reponse ---
  response: {
    /** Chemin JSON vers les donnees (ex: 'results', 'data', 'records') */
    dataPath: string;
    /** Chemin JSON vers le total (ex: 'total_count', 'meta.total') */
    totalCountPath: string | null;
    /** Les donnees sont wrappees sous un sous-objet ? (ex: 'fields' pour Grist) */
    nestedDataKey: string | null;
    /** Faut-il un dsfr-data-normalize flatten automatique ? */
    requiresFlatten: boolean;
  };

  // --- Pagination ---
  pagination: {
    type: 'offset' | 'page' | 'cursor' | 'none';
    pageSize: number;
    maxPages: number;
    maxRecords: number;
    params: {
      page?: string;       // 'page' pour Tabular
      pageSize?: string;   // 'page_size' pour Tabular
      offset?: string;     // 'offset' pour ODS
      limit?: string;      // 'limit' pour ODS
    };
    /** Chemin JSON vers l'URL de la page suivante */
    nextPagePath: string | null;
    /** Structure de meta pour la pagination serveur */
    serverMeta?: {
      pagePath: string;     // 'meta.page'
      pageSizePath: string; // 'meta.page_size'
      totalPath: string;    // 'meta.total'
    };
  };

  // --- Capacites serveur ---
  capabilities: {
    serverFetch: boolean;
    serverFacets: boolean;
    serverSearch: boolean;
    serverGroupBy: boolean;
    serverOrderBy: boolean;   // ODS: true, Tabular: true (server-tri), Grist/Generic: false
    serverAggregation: boolean;
  };

  // --- Requetes ---
  query: {
    /** Format de filtre : ODSQL SQL-like ou colon syntax champ:op:valeur */
    whereFormat: 'odsql' | 'colon';
    /** Separateur pour joindre les clauses WHERE */
    whereSeparator: string;
    /** Syntaxe d'agregation pour la generation de code */
    aggregationSyntax: 'odsql-select' | 'colon-attr' | 'client-only';
    /** Mapping des operateurs generiques vers la syntaxe native */
    operatorMapping?: Record<string, string>;
  };

  // --- Facettes ---
  facets: {
    /** Mode par defaut pour les facettes */
    defaultMode: 'server' | 'static' | 'client';
    /** Endpoint API dedie pour les facettes serveur */
    endpoint?: string;
  };

  // --- Identification de ressource ---
  resource: {
    /** Champ(s) d'identifiant dans l'URL API */
    idFields: string[];   // ['datasetId'] pour ODS, ['resourceId'] pour Tabular, ['documentId', 'tableId'] pour Grist
    /** Template d'URL API (avec placeholders {field}) */
    apiPathTemplate: string;
    /** Fonction d'extraction des IDs depuis une URL */
    extractIds: (url: string) => Record<string, string> | null;
  };

  // --- Code generation ---
  codeGen: {
    /** Le pipeline genere utilise dsfr-data-source ? */
    usesDsfrDataSource: boolean;
    /** Le pipeline genere utilise dsfr-data-query ? */
    usesDsfrDataQuery: boolean;
    /** Le pipeline genere utilise dsfr-data-normalize ? */
    usesDsfrDataNormalize: boolean;
    /** Valeur de api-type sur dsfr-data-query */
    queryApiType: string | null;
    /** Prefixe de champ pour les paths nested (ex: 'fields.' pour Grist sans flatten) */
    fieldPrefix: string;
    /** Dependencies CSS/JS necessaires */
    dependencies: {
      dsfr: boolean;
      dsfrChart: boolean;
      dsfrData: boolean;
    };
  };
}
```

### 1.2 Definir les 4 configs providers

**Fichier :** `packages/shared/src/providers/opendatasoft.ts`

```typescript
export const ODS_CONFIG: ProviderConfig = {
  id: 'opendatasoft',
  displayName: 'OpenDataSoft',
  urlPatterns: [
    /\/api\/explore\/v2\.1\/catalog\/datasets\/([^/]+)/,
  ],
  knownHosts: [
    // pas de host fixe : tout domaine ODS est valide
  ],
  defaultBaseUrl: 'https://data.opendatasoft.com',
  defaultAuthType: 'apikey-header',
  response: {
    dataPath: 'results',
    totalCountPath: 'total_count',
    nestedDataKey: null,
    requiresFlatten: false,
  },
  pagination: {
    type: 'offset',
    pageSize: 100,
    maxPages: 10,
    maxRecords: 1000,
    params: { offset: 'offset', limit: 'limit' },
    nextPagePath: null,
  },
  capabilities: {
    serverFetch: true,
    serverFacets: true,
    serverSearch: true,
    serverGroupBy: true,
    serverOrderBy: true,
    serverAggregation: true,
  },
  query: {
    whereFormat: 'odsql',
    whereSeparator: ' AND ',
    aggregationSyntax: 'odsql-select',
  },
  facets: {
    defaultMode: 'server',
    endpoint: '/facets',
  },
  resource: {
    idFields: ['datasetId'],
    apiPathTemplate: '/api/explore/v2.1/catalog/datasets/{datasetId}/records',
    extractIds: (url) => {
      const m = url.match(/\/api\/explore\/v2\.1\/catalog\/datasets\/([^/]+)/);
      return m ? { datasetId: m[1] } : null;
    },
  },
  codeGen: {
    usesDsfrDataSource: false,
    usesDsfrDataQuery: true,
    usesDsfrDataNormalize: false,
    queryApiType: 'opendatasoft',
    fieldPrefix: '',
    dependencies: { dsfr: true, dsfrChart: true, dsfrData: true },
  },
};
```

**Fichier :** `packages/shared/src/providers/tabular.ts`

Differences cles par rapport a ODS :
- `pagination.type: 'page'` (pas 'offset'), `pageSize: 100`, `maxPages: 500`, `maxRecords: 50000`
- `pagination.params: { page: 'page', pageSize: 'page_size' }`
- `pagination.nextPagePath: 'next'`, `pagination.serverMeta` present
- `response.dataPath: 'data'`, `response.totalCountPath: 'meta.total'`
- `capabilities.serverAggregation: false`, `capabilities.serverFacets: false`, `capabilities.serverOrderBy: true`
- `query.whereFormat: 'colon'`, `query.aggregationSyntax: 'colon-attr'`
- `facets.defaultMode: 'static'`
- `codeGen.queryApiType: 'tabular'`

**Fichier :** `packages/shared/src/providers/grist.ts`

Differences cles :
- `urlPatterns: [/\/api\/docs\/([^/]+)\/tables\/([^/]+)/]`
- `knownHosts: [{ hostname: 'grist.numerique.gouv.fr', proxyEndpoint: '/grist-gouv-proxy' }, { hostname: 'docs.getgrist.com', proxyEndpoint: '/grist-proxy' }]`
- `defaultAuthType: 'bearer'`
- `response.dataPath: 'records'`, `response.nestedDataKey: 'fields'`, `response.requiresFlatten: true`
- `pagination.type: 'none'` (l'API Grist n'a pas de pagination native)
- Toutes les capabilities serveur a `false`
- `query.aggregationSyntax: 'client-only'`
- `facets.defaultMode: 'client'`
- `codeGen.usesDsfrDataSource: true`, `codeGen.usesDsfrDataNormalize: true`, `codeGen.queryApiType: null` (ou `'grist'` apres Phase 5)
- `codeGen.fieldPrefix: 'fields.'`
- `resource.idFields: ['documentId', 'tableId']`

**Fichier :** `packages/shared/src/providers/generic.ts`

Config minimale par defaut :
- `urlPatterns: []` (fallback, matche tout ce que les autres n'ont pas matche)
- `pagination.type: 'none'`
- Toutes les capabilities serveur a `false`
- `codeGen.usesDsfrDataSource: true`, `codeGen.usesDsfrDataQuery: true`
- `query.aggregationSyntax: 'client-only'`
- `facets.defaultMode: 'client'`

### 1.3 Registre et detection

**Fichier :** `packages/shared/src/providers/index.ts`

```typescript
const PROVIDER_REGISTRY = new Map<ProviderId, ProviderConfig>();

export function registerProvider(config: ProviderConfig): void { ... }
export function getProvider(id: ProviderId): ProviderConfig { ... }
export function getAllProviders(): ProviderConfig[] { ... }

/**
 * Detecte le provider a partir d'une URL API.
 * Teste les urlPatterns de chaque provider enregistre.
 * Retourne 'generic' si aucun match.
 */
export function detectProvider(url: string): ProviderConfig { ... }

/**
 * Extrait les IDs de ressource depuis une URL pour un provider donne.
 * Ex: pour ODS, extrait { datasetId: 'mon-dataset' }.
 */
export function extractResourceIds(
  url: string,
  provider?: ProviderConfig
): Record<string, string> | null { ... }
```

### 1.4 Interface Source unifiee

**Fichier :** `packages/shared/src/types/source.ts`

```typescript
import type { ProviderId } from '../providers/provider-config.js';

export interface Source {
  id: string;
  name: string;

  // --- Type et provider ---
  /** Type de source haut-niveau */
  type: 'grist' | 'api' | 'manual';
  /** Provider detecte automatiquement (opendatasoft, tabular, grist, generic) */
  provider: ProviderId;

  // --- Connexion ---
  apiUrl?: string;
  method?: string;
  headers?: string | null;
  dataPath?: string;

  // --- Identification de ressource (extraits de l'URL) ---
  /** IDs extraits de l'URL par le provider (ex: { datasetId: 'xxx' }) */
  resourceIds?: Record<string, string>;

  // --- Grist specifique ---
  documentId?: string;
  tableId?: string;
  apiKey?: string | null;
  isPublic?: boolean;

  // --- Donnees chargees ---
  data?: Record<string, unknown>[];
  rawRecords?: Array<{ fields: Record<string, unknown> }>;
  recordCount?: number;

  // --- Connexion d'origine ---
  connectionId?: string;
}
```

**Changement cle :** le champ `provider: ProviderId` est calcule a la creation
de la source et persiste. Plus besoin de regex a chaque generation.

### 1.5 Migration des sources existantes (localStorage)

Les sources deja enregistrees dans `localStorage` n'ont pas de champ `provider`.
Il faut une migration transparente au chargement.

**Fichier :** `packages/shared/src/types/source.ts`

```typescript
/** Migre une source legacy vers le format unifie */
export function migrateSource(raw: Partial<Source>): Source {
  const source = { ...raw } as Source;
  if (!source.provider) {
    if (source.type === 'grist') {
      source.provider = 'grist';
    } else if (source.type === 'api' && source.apiUrl) {
      source.provider = detectProvider(source.apiUrl).id;
    } else {
      source.provider = 'generic';
    }
  }
  if (!source.resourceIds && source.apiUrl && source.provider !== 'generic') {
    source.resourceIds = extractResourceIds(source.apiUrl) ?? undefined;
  }
  return source;
}
```

Cette migration est appelee dans `loadFromStorage(STORAGE_KEYS.SOURCES)` dans
les 3 apps (sources, builder, builder-ia). Les sources sont re-sauvegardees
avec le champ `provider` des le premier chargement.

### 1.6 Fichiers impactes

| Fichier | Changement |
|---|---|
| `packages/shared/src/index.ts` | Exporter les nouveaux modules |
| `apps/sources/src/state.ts` | Remplacer `Source` par import shared, appeler `migrateSource` au load |
| `apps/builder/src/state.ts` | Remplacer `Source` par import shared, appeler `migrateSource` au load |
| `apps/builder-ia/src/state.ts` | Remplacer `Source` par import shared, appeler `migrateSource` au load |
| `apps/sources/src/connections/api-explorer.ts` | Ajouter `provider: detectProvider(url).id` |
| `apps/sources/src/connections/grist-explorer.ts` | Ajouter `provider: 'grist'` |
| `apps/grist-widgets/src/chart.ts` | Remplacer proxy URL hardcodee par `getProxiedUrl()` + `buildGristApiUrl()` |
| `apps/grist-widgets/src/datalist.ts` | Idem |

**Note :** `apps/dashboard/` et `apps/favorites/` n'utilisent pas Source ni provider-specific logic. Pas d'impact.

### 1.7 Alignement routes serveur (serialize/deserialize)

Le client envoie des objets `Source` a plat (`{apiUrl, method, headers, data, recordCount, ...}`)
via `ApiStorageAdapter.syncToApi()`. Le CRUD generique (`resource-crud.ts`) cherche
`req.body[col]` ou `req.body[camelCase(col)]` — mais les noms de champs client ne
correspondent ni aux colonnes DB (`config_json`, `data_json`, `record_count`) ni a leur
version camelCase (`configJson`, `dataJson`). Resultat : les champs sont perdus apres un
round-trip serveur, causant `URL constructor: undefined is not a valid URL` au rechargement.

La route `/api/migrate` fonctionne car elle utilise `extractConfig()` pour empaqueter les
champs plats dans `config_json`. Le CRUD generique ne fait pas ca.

**Fichier 1 : `server/src/routes/resource-crud.ts`**

Ajouter des hooks optionnels `serialize` et `deserialize` a `ResourceConfig` :

```typescript
interface ResourceConfig {
  // ... existant
  /** Transforme le body client en colonnes DB avant INSERT/UPDATE */
  serialize?: (body: Record<string, unknown>) => Record<string, unknown>;
  /** Transforme la row DB en objet client apres SELECT */
  deserialize?: (row: Record<string, unknown>) => Record<string, unknown>;
}
```

- POST/PUT : appliquer `serialize(req.body)` avant extraction des colonnes
- GET list/single + reponses POST/PUT : appliquer `deserialize(parsed)` apres `parseJsonColumns`

**Fichier 2 : `server/src/routes/sources.ts`**

```typescript
serialize(body) {
  // Si body a deja config_json, passer tel quel (retro-compat tests existants)
  // Sinon: extraire apiUrl/method/headers/dataPath/... dans config_json,
  //   data → data_json, recordCount → record_count
}
deserialize(row) {
  // Etaler config_json au top level (apiUrl, method, headers, dataPath, ...)
  //   data_json → data, record_count → recordCount
  // Supprimer config_json, data_json, record_count, owner_id
}
```

**Fichier 3 : `server/src/routes/connections.ts`**

```typescript
serialize(body) {
  // Extraire url/apiUrl/method/headers/dataPath/... dans config_json, apiKey → api_key_encrypted
}
deserialize(row) {
  // Etaler config_json, api_key_encrypted → apiKey
}
```

**Fichier 4 : `server/src/routes/favorites.ts`**

```typescript
serialize(body) {
  // chartType → chart_type, builderState → builder_state_json, source → source_app
}
deserialize(row) {
  // chart_type → chartType, builder_state_json → builderState, source_app → source
}
```

**Fichier 5 : `server/src/routes/dashboards.ts`**

```typescript
serialize(body) {
  // layout → layout_json, widgets → widgets_json
}
deserialize(row) {
  // layout_json → layout, widgets_json → widgets
}
```

**Tests :**
- Les 20 tests existants envoient `config_json` directement — les hooks serialize doivent
  etre transparents (pass-through si `config_json` est deja present)
- Nouveaux tests : POST avec body plat (comme le client envoie) → GET → verifier que les
  champs plats sont preserves apres le round-trip
- Test round-trip complet : POST plat → GET list → verifier apiUrl, method, data, recordCount

### 1.8 Tests

- Tests unitaires pour chaque ProviderConfig (URL matching, extractIds)
- Tests de non-regression : `detectProvider()` retourne le bon provider pour
  toutes les URLs existantes dans les exemples du playground
- Test d'alignement : chaque provider config couvre toutes les proprietes
- Tests `migrateSource()` : sources legacy sans `provider` sont migrees correctement

### 1.9 Critere de validation

- `npm run test:run` passe sans regression
- `npm run build:all` reussit
- Toutes les URLs d'exemple du playground sont detectees correctement
- Les 3 interfaces Source (sources, builder, builder-ia) sont remplacees par 1
- Les sources existantes en localStorage sont migrees au premier chargement

---

## Phase 2 : Deduplication proxy, constantes et nettoyage legacy

### 2.0 Nettoyage du code legacy

Avant de centraliser, supprimer le code mort et les duplications evidentes.

#### Code mort a supprimer

| Fichier | Code | Lignes | Raison |
|---|---|---|---|
| `builder/code-generator.ts` | `fetchOdsResults()` | ~45L | Duplique `OpenDataSoftAdapter.fetchAll()` ; remplace par adapter |
| `builder/code-generator.ts` | `ODS_FETCH_HELPER` (template JS inline) | ~20L | Pagination inline dans le code genere ; remplace par `dsfr-data-query` |
| `builder/code-generator.ts` | `parseOdsApiUrl()` | ~5L | Exportee mais jamais appelee dans le builder |
| `builder/code-generator.ts` | `ODS_PAGE_SIZE`, `ODS_MAX_PAGES` | 2L | Duplique les constantes de `opendatasoft-adapter.ts` |

#### Duplications a eliminer

| Duplication | Occurrences | Solution |
|---|---|---|
| `formatKPIValue()` inline dans le code genere | 3 copies (builder, builder-IA, + shared) | Supprimer les copies inline, la lib UMD exporte deja `formatKPIValue` |
| `DSFR_TAG_MAP` (chart type → tag name) | 1 copie builder, 0 copie builder-IA | Deplacer dans `@dsfr-data/shared` |
| Normalisation des types (`horizontalBar`→`bar`, `doughnut`→`pie`) | Builder uniquement | Centraliser avec `DSFR_TAG_MAP` |
| CSS KPI template | 2 copies (builder L~590-620, builder-IA L~187-201) | Extraire dans shared |

#### No-op code

| Fichier | Code | Action |
|---|---|---|
| `builder/code-generator.ts` L94 | `if (state.chartType === 'doughnut') { /* no fill = donut */ }` | Supprimer le no-op ou implementer la logique |

### 2.1 Eliminer les PROXY_BASE_URL dupliquees

Remplacer toutes les constantes locales par un import unique :

| Fichier | Actuel | Cible |
|---|---|---|
| `apps/builder/src/state.ts` L12 | `export const PROXY_BASE_URL = '...'` | `export { PROXY_BASE_URL } from '@dsfr-data/shared'` |
| `apps/builder-ia/src/ui/code-generator.ts` L9 | `const PROXY_BASE_URL = '...'` | `import { PROXY_BASE_URL } from '@dsfr-data/shared'` |
| `apps/sources/src/state.ts` L96 | `export const EXTERNAL_PROXY = '...'` | `import { PROXY_BASE_URL as EXTERNAL_PROXY } from '@dsfr-data/shared'` |
| `packages/shared/src/api/proxy.ts` L7 | `const EXTERNAL_PROXY = '...'` | Utiliser `DEFAULT_PROXY_CONFIG.baseUrl` (deja dans proxy-config.ts) |
| `src/utils/beacon.ts` L7 | `const BEACON_URL = '...beacon'` | `import { PROXY_BASE_URL } from '@dsfr-data/shared'` + concat |
| `apps/grist-widgets/src/chart.ts` L277 | URL inline | Import shared |
| `apps/grist-widgets/src/datalist.ts` L132 | URL inline | Import shared |
| `apps/monitoring/src/monitoring-data.ts` L27-28 | URLs inline | Import shared |

**Resultat :** 1 source de verite dans `proxy-config.ts`, 0 doublon.

### 2.2 Centraliser le hostname-to-proxy mapping

Enrichir `ProxyConfig` dans `proxy-config.ts` pour inclure les hostnames :

```typescript
export interface ProxyEndpoint {
  path: string;           // '/grist-proxy'
  targetHosts: string[];  // ['docs.getgrist.com']
}

export interface ProxyConfig {
  baseUrl: string;
  endpoints: Record<string, ProxyEndpoint>;
}
```

Puis `getProxiedUrl()` dans `proxy.ts` itere sur ce registre au lieu d'avoir
des `if (url.includes(...))` en dur. Les Vite configs importent les memes
hostnames pour construire leur `server.proxy`.

### 2.3 Centraliser la construction de headers Grist

**Fichier :** `packages/shared/src/api/grist.ts`

```typescript
export function buildGristHeaders(apiKey?: string | null): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
  return headers;
}

export function buildGristApiUrl(
  documentId: string,
  tableId: string,
  endpoint: string = 'records'
): string {
  return `/api/docs/${documentId}/tables/${tableId}/${endpoint}`;
}
```

Remplace les 9 occurrences manuelles dans `grist-explorer.ts` et
`connection-manager.ts`.

### 2.4 Eliminer les regexes de detection URL dupliquees

Les 3 variantes de regex ODS/Tabular (builder, builder-ia, chat.ts) sont
remplacees par `detectProvider()` et `extractResourceIds()` de Phase 1.

| Fichier | Supprimer | Remplacer par |
|---|---|---|
| `builder/code-generator.ts` L887-899 | `parseOdsApiUrl`, `parseTabularApiUrl` | `extractResourceIds(url, getProvider('opendatasoft'))` |
| `builder-ia/code-generator.ts` L12-15 | `ODS_URL_RE`, `TABULAR_URL_RE` | `import { detectProvider } from '@dsfr-data/shared'` |
| `builder-ia/chat.ts` L178-179 | regexes inline | `detectProvider(url).id === 'opendatasoft'` |

### 2.5 Eliminer la duplication ODS pagination dans le builder

Le builder a sa propre `fetchOdsResults()` (L27-72, ~45 lignes) qui duplique
exactement `OpenDataSoftAdapter.fetchAll()`. Il a aussi ses propres constantes
`ODS_PAGE_SIZE` et `ODS_MAX_PAGES`.

**Solution :** Supprimer `fetchOdsResults()` du builder. Dans `generateChart()`,
utiliser directement l'adapter ODS pour le fetch :

```typescript
import { getAdapter } from '../../src/adapters/api-adapter.js';
const adapter = getAdapter('opendatasoft');
const result = await adapter.fetchAll(params, signal);
```

Ou, si on veut eviter l'import depuis src/ vers apps/ : exporter les constantes
depuis le ProviderConfig ODS et les lire depuis shared.

### 2.6 Identifier la duplication whereToOdsql / filterToOdsql

Le builder-ia a `whereToOdsql()` (L76-100, 8 operateurs) et le builder a
`filterToOdsql()` (L147-167, 12 operateurs). La version builder est plus
complete.

**Note :** La centralisation effective est faite en **Phase 3.7** dans
`packages/shared/src/query/filter-translator.ts`. En Phase 2, on se contente
d'identifier la duplication. La suppression des copies locales se fait en
Phase 3 (builder) et Phase 4 (builder-IA).

### 2.7 Centraliser les versions CDN

Les URLs CDN DSFR et DSFR Chart sont hardcodees **20+ fois** dans les templates
des deux code generators et du dashboard. Un changement de version DSFR oblige
a modifier chaque occurrence manuellement.

**Fichier :** `packages/shared/src/templates/cdn-versions.ts`

```typescript
export const CDN_VERSIONS = {
  dsfr: '1.11.2',
  dsfrChart: '2.0.4',
  chartJs: '4.4.1',
} as const;

export const CDN_URLS = {
  dsfrCss: `https://cdn.jsdelivr.net/npm/@gouvfr/dsfr@${CDN_VERSIONS.dsfr}/dist/dsfr.min.css`,
  dsfrUtilityCss: `https://cdn.jsdelivr.net/npm/@gouvfr/dsfr@${CDN_VERSIONS.dsfr}/dist/utility/utility.min.css`,
  dsfrChartCss: `https://cdn.jsdelivr.net/npm/@gouvfr/dsfr-chart@${CDN_VERSIONS.dsfrChart}/dist/DSFRChart/DSFRChart.css`,
  dsfrChartJs: `https://cdn.jsdelivr.net/npm/@gouvfr/dsfr-chart@${CDN_VERSIONS.dsfrChart}/dist/DSFRChart/DSFRChart.js`,
  chartJs: `https://cdn.jsdelivr.net/npm/chart.js@${CDN_VERSIONS.chartJs}/dist/chart.umd.min.js`,
} as const;
```

Remplace les 20+ URLs hardcodees dans :
- `apps/builder/src/ui/code-generator.ts` (~8 occurrences)
- `apps/builder-ia/src/ui/code-generator.ts` (~9 occurrences)
- `apps/dashboard/src/code-generator.ts` (~3 occurrences)

### 2.8 Tests

- Grep exhaustif pour verifier qu'aucune URL proxy n'est definie en dur
- Tests que `getProxiedUrl()` fonctionne pour tous les hostnames connus
- Tests que `buildGristHeaders()` produit le bon format
- Tests que `CDN_URLS` produit les bonnes URLs pour chaque version

### 2.9 Critere de validation

- `grep -r 'chartsbuilder.matge.com'` ne retourne que `proxy-config.ts` + Vite configs (necessaire pour dev)
- `grep -r 'cdn.jsdelivr.net'` ne retourne que `cdn-versions.ts` (1 source de verite)
- `npm run test:run` passe sans regression
- `npm run build:all` reussit

---

## Phase 3 : Code generator refactoring (builder)

C'est la phase la plus importante et la plus risquee. Elle peut etre decoupee
en **sub-PRs** pour limiter le blast radius :

1. **PR 3a** : Ajouter `chart-types.ts` et `filter-translator.ts` dans shared (additions pures, 0 risque)
2. **PR 3b** : Remplacer les imports dans le builder (substitutions mecaniques)
3. **PR 3c** : Refactoring `generateDynamicPipeline()` (le coeur du changement)
4. **PR 3d** : Suppression du code mort desormais inutilise

### 3.1 Etat des lieux du builder code-generator

**Fichier :** `apps/builder/src/ui/code-generator.ts` (1861 lignes)

| Fonction | Lignes | Role | Provider-specific |
|---|---|---|---|
| `generateChart()` | 390-520 | Orchestrateur principal | Routage par source type |
| `generateChartFromLocalData()` | 525-650 | Aggregation locale | Routage `grist/api/manual` |
| `generateCodeForLocalData()` | 655-881 | Code embedded statique | KPI/gauge/datalist/scatter/map/chart |
| `generateDynamicCode()` | 1149-1288 | Dynamic Grist | 100% Grist |
| `generateDynamicCodeForApi()` | 1293-1542 | Dynamic API | Routage ODS/Tabular/Generic |
| `generateOdsQueryCode()` | 907-994 | dsfr-data-query ODS | 100% ODS |
| `generateTabularQueryCode()` | 1001-1066 | dsfr-data-query Tabular | 100% Tabular |
| `generateDsfrDataQueryCode()` | 1073-1144 | dsfr-data-query Generic | 100% Generic |
| `generateCode()` | 1547-1861 | Code embedded fetch API | KPI/gauge/datalist/scatter/map/chart |
| `generateMiddlewareElements()` | 313-350 | normalize + facets | Delegue via FacetsMode |
| `generateFacetsElement()` | 221-285 | facets standalone | FacetsMode branching |
| `computeStaticFacetValues()` | 291-311 | valeurs facettes | Pas de branching |

### 3.2 Architecture cible du code generator

Remplacer les 3 fonctions `generateDynamicCode()`, `generateDynamicCodeForApi()`
et `generateCode()` par une seule fonction `generateDynamicPipeline()` qui
compose le HTML a partir du ProviderConfig :

```typescript
function generateDynamicPipeline(provider: ProviderConfig): string {
  const parts: string[] = [];

  // 1. Dependencies
  parts.push(buildDependencies(provider.codeGen.dependencies));

  // 2. Source element (si le provider en a besoin)
  if (provider.codeGen.usesDsfrDataSource) {
    parts.push(buildDsfrDataSource(provider));
  }

  // 3. Normalize (si le provider le requiert)
  if (provider.codeGen.usesDsfrDataNormalize && state.normalizeConfig.enabled) {
    parts.push(buildDsfrDataNormalize());
  }

  // 4. Facets (mode determine par le provider)
  if (state.facetsConfig.enabled) {
    parts.push(buildFacets(provider));
  }

  // 5. Query (si le provider en a besoin)
  if (provider.codeGen.usesDsfrDataQuery) {
    parts.push(buildDsfrDataQuery(provider));
  }

  // 6. Visualization (chart, datalist, KPI...)
  parts.push(buildVisualization(provider));

  return parts.filter(Boolean).join('\n');
}
```

Chaque fonction `build*()` lit le `ProviderConfig` au lieu de brancher :

```typescript
function buildDsfrDataQuery(provider: ProviderConfig): string {
  const attrs: string[] = [`id="query-data"`];

  if (provider.codeGen.queryApiType) {
    attrs.push(`api-type="${provider.codeGen.queryApiType}"`);
  }

  const ids = state.savedSource?.resourceIds;
  if (ids) {
    if (ids.datasetId) attrs.push(`dataset-id="${ids.datasetId}"`);
    if (ids.resourceId) attrs.push(`resource="${ids.resourceId}"`);
  }

  // ... group-by, aggregate, order-by (identique pour tous les providers)
  // ... where/filter (format lu depuis provider.query.whereFormat)
}
```

### 3.3 Refactoring buildFacets avec ProviderConfig

```typescript
function buildFacets(provider: ProviderConfig): string {
  const mode = provider.facets.defaultMode;

  switch (mode) {
    case 'server':
      return generateFacetsElement(sourceId, { serverFacets: true });
    case 'static':
      const vals = computeStaticFacetValues();
      return generateFacetsElement(sourceId, vals ? { staticValues: vals } : undefined);
    case 'client':
      const prefix = provider.response.nestedDataKey && !isFlattened
        ? `${provider.response.nestedDataKey}.` : '';
      return generateFacetsElement(sourceId, prefix ? { fieldPrefix: prefix } : undefined);
  }
}
```

Plus de `if (odsInfoDl)` / `if (tabularInfoDl)` / `if (source.type === 'grist')`.

### 3.4 Refactoring de la resolution de chemins de champs

Centraliser la logique dispersee en une seule fonction :

```typescript
function resolveFieldPath(
  fieldName: string,
  provider: ProviderConfig,
  isFlattened: boolean
): string {
  if (isFlattened || !provider.response.nestedDataKey) {
    return fieldName;
  }
  return `${provider.response.nestedDataKey}.${fieldName}`;
}
```

Remplace les 3 variantes actuelles (Grist `fields.X`, API `fullPath`, local
direct).

### 3.5 Gestion du proxy Grist dans le code generator

Remplacer le bloc `if/else` sur `apiUrl.includes()` (L1160-1168) par :

```typescript
function buildProxiedUrl(source: Source, provider: ProviderConfig): string {
  for (const host of provider.knownHosts) {
    if (source.apiUrl?.includes(host.hostname)) {
      return `${PROXY_BASE_URL}${host.proxyEndpoint}${provider.resource.apiPathTemplate
        .replace('{documentId}', source.documentId || '')
        .replace('{tableId}', source.tableId || '')}`;
    }
  }
  return source.apiUrl || '';
}
```

### 3.6 Centraliser DSFR_TAG_MAP et normalisation des types

Le mapping type de graphique → tag DSFR est defini uniquement dans le builder
(L75-87). Il n'existe pas dans le builder-IA, ce qui cree des divergences.

**Fichier :** `packages/shared/src/charts/chart-types.ts`

```typescript
/** Mapping type utilisateur → tag DSFR Chart */
export const DSFR_TAG_MAP: Record<string, string> = {
  bar: 'bar-chart',
  horizontalBar: 'bar-chart',
  line: 'line-chart',
  pie: 'pie-chart',
  doughnut: 'pie-chart',
  radar: 'radar-chart',
  gauge: 'gauge-chart',
  scatter: 'scatter-chart',
  'bar-line': 'bar-line-chart',
  map: 'map-chart',
  'map-reg': 'map-chart-reg',
};

/** Types normalises (sans alias) */
export type DSFRChartType = 'bar' | 'line' | 'pie' | 'radar' | 'gauge' | 'scatter' | 'bar-line' | 'map' | 'map-reg';

/** Normalise un type utilisateur (horizontalBar → bar, doughnut → pie) */
export function normalizeChartType(type: string): DSFRChartType {
  const ALIASES: Record<string, DSFRChartType> = {
    horizontalBar: 'bar',
    doughnut: 'pie',
  };
  return (ALIASES[type] || type) as DSFRChartType;
}

/** Valide qu'un type est supporte */
export function isValidChartType(type: string): boolean {
  return type in DSFR_TAG_MAP;
}
```

Les deux builders importent depuis shared au lieu de definir leurs propres mappings.

### 3.7 Centraliser le traducteur de filtres

`filterToOdsql()` (builder, 12 operateurs) et `whereToOdsql()` (builder-IA, 8
operateurs) font la meme chose avec des noms differents et un support inegal.

**Fichier :** `packages/shared/src/query/filter-translator.ts`

```typescript
import type { FilterOperator } from '../../src/components/dsfr-data-query.js';

/** Traduit un filtre colon-syntax en clause ODSQL */
export function filterToOdsql(filter: string): string {
  // Version complete : 12 operateurs
  // eq, neq, gt, gte, lt, lte, contains, notcontains, in, notin, isnull, isnotnull
}

/** Traduit un operateur generique vers la syntaxe native d'un provider */
export function translateOperator(
  operator: FilterOperator,
  targetFormat: 'odsql' | 'colon' | 'tabular-api'
): string { ... }
```

Remplace :
- `filterToOdsql()` dans `builder/code-generator.ts` (12 ops)
- `whereToOdsql()` dans `builder-ia/code-generator.ts` (8 ops -- **corrige le gap de 4 operateurs manquants**)
- `_mapOperator()` dans `tabular-adapter.ts`

### 3.8 Fichiers modifies

| Fichier | Changement |
|---|---|
| `apps/builder/src/ui/code-generator.ts` | Refactoring majeur (voir 3.2-3.7) |
| `apps/builder/src/state.ts` | Import Source depuis shared, supprimer PROXY_BASE_URL local |
| `packages/shared/src/charts/chart-types.ts` | NOUVEAU : DSFR_TAG_MAP + normalizeChartType + isValidChartType |
| `packages/shared/src/query/filter-translator.ts` | NOUVEAU : filterToOdsql unifie (12 ops) + translateOperator |
| `packages/shared/src/index.ts` | Exporter les nouveaux modules |

### 3.9 Tests

- Tous les 232 tests existants de `code-generator.test.ts` doivent passer
- Ajouter des tests parametriques par provider :
  ```typescript
  for (const provider of getAllProviders()) {
    describe(`generateDynamicPipeline with ${provider.displayName}`, () => { ... });
  }
  ```
- Test d'alignement : chaque ProviderConfig produit un pipeline valide
- Tests `DSFR_TAG_MAP` : couvre tous les `DSFRChartType` du composant
- Tests `filterToOdsql` : 12 operateurs + cas limites (valeurs avec guillemets, champs avec points)
- Tests `normalizeChartType` : alias + types inconnus
- **Snapshots HTML** : 144 combinaisons (4 providers x 9 charts x facets x normalize)

### 3.10 Critere de validation

- 0 `if (odsInfo)` / `if (tabularInfo)` / `if (source.type === 'grist')` dans code-generator.ts
- `npm run test:run` passe sans regression
- `npm run build:all` reussit
- Le code HTML genere pour chaque combinaison (provider x chart-type) est identique a l'actuel (snapshots)
- `DSFR_TAG_MAP` et `filterToOdsql` ont chacun un seul point de definition dans shared
- Les 41 exemples du playground et les 8 pages du guide fonctionnent sans modification

---

## Phase 4 : Code generator refactoring (builder-IA)

### 4.1 Etat des lieux

**Fichier :** `apps/builder-ia/src/ui/code-generator.ts` (981 lignes)

Duplications avec le builder :
- `PROXY_BASE_URL` (L9) -- identique
- `ODS_URL_RE`, `TABULAR_URL_RE` (L12-15) -- variantes
- `whereToOdsql()` (L76-100) -- version simplifiee (8 ops au lieu de 12)
- Templates KPI CSS (L187-201) -- quasi-identiques
- Templates map transformation (L356-366) -- quasi-identiques
- Logique de routage ODS/Tabular/Generic (dans chaque fonction) -- dupliquee

Manques par rapport au builder :
- Pas de support `dsfr-data-normalize`
- Pas de support `dsfr-data-facets`
- Pas de gestion Grist dynamique
- Pas de `generateMiddlewareElements()`

### 4.2 Strategie : fusion des deux code generators (Option B retenue)

Un seul code generator dans `@dsfr-data/shared`, parametre par un
`CodeGenContext` qui encode les differences entre les deux builders :

```typescript
interface CodeGenContext {
  /** Source de donnees */
  source: Source;
  /** Provider detecte */
  provider: ProviderConfig;
  /** Configuration du graphique */
  chartConfig: ChartConfig;
  /** Donnees pre-chargees (mode local/embedded) */
  localData?: Record<string, unknown>[];
  /** Configuration normalize */
  normalizeConfig?: NormalizeConfig;
  /** Configuration facets */
  facetsConfig?: FacetsConfig;
  /** URL de base du proxy (pour le script dsfr-data) */
  proxyBaseUrl: string;
}
```

Le builder et le builder-IA construisent chacun un `CodeGenContext` depuis leur
state respectif, puis appellent le meme `generateCode(context)`.

**Avantages :** zero ecart fonctionnel entre les deux builders, maintenance
sur 1 seul fichier, les corrections (ex: 4 operateurs manquants) beneficient
automatiquement aux deux.

### 4.3 Pour l'option A : templates partages

**Fichier :** `packages/shared/src/templates/`

```
html-dependencies.ts   # buildDsfrDeps(), buildDsfrDataDep(), CDN_VERSIONS
html-kpi.ts            # buildKpiHtml(), KPI_CSS
html-chart.ts          # buildDsfrChartElement(), buildDsfrDataQueryElement()
html-datalist.ts       # buildDatalistElement()
html-map.ts            # buildMapTransformScript()
html-source.ts         # buildDsfrDataSourceElement()
```

Note : `filterToOdsql()` est deja centralise dans `packages/shared/src/query/filter-translator.ts`
(Phase 3.7). Les templates l'importent depuis shared, pas depuis ce dossier.

Les deux builders importent ces fonctions et les composent.

### 4.4 builder-IA : ajout middleware (normalize + facets)

Le builder-IA n'a actuellement aucun support pour `dsfr-data-normalize` ni `dsfr-data-facets`.
C'est un ecart fonctionnel, pas juste du code manquant : l'IA ne peut pas generer
de pipeline Grist complet (flatten necessaire) ni de facettes.

Une fois les templates factorises dans shared, ajouter le support est direct car
les fonctions `buildDsfrDataNormalize()` et `buildFacets()` existent deja.

**Ajouts concrets :**

| Fonction | Source | Cible builder-IA |
|---|---|---|
| `generateMiddlewareElements()` | template shared | Import + appel dans le pipeline |
| `generateFacetsElement()` | template shared | Import + appel dans le pipeline |
| `computeStaticFacetValues()` | template shared | Import pour facets Tabular/Grist |
| Support Grist dynamique | `generateDynamicCode()` du builder | Version simplifiee via `generateDynamicPipeline(provider)` |

### 4.5 builder-IA : correction des operateurs de filtre

Le builder-IA ne supporte que **8 operateurs** dans `whereToOdsql()` alors que le
builder en supporte **12** dans `filterToOdsql()`. C'est un bug fonctionnel.

**Operateurs manquants dans le builder-IA :**
- `notcontains` (ne contient pas)
- `notin` (pas dans la liste)
- `isnull` (est vide)
- `isnotnull` (n'est pas vide)

**Solution :** Le builder-IA importe `filterToOdsql` depuis `@dsfr-data/shared`
(centralise en Phase 3.7). Les 4 operateurs manquants sont automatiquement couverts.
La fonction locale `whereToOdsql()` est supprimee.

### 4.6 builder-IA : alignement DSFR_TAG_MAP

Le builder-IA n'utilise pas `DSFR_TAG_MAP` -- il construit les tags DSFR en dur
dans ses templates. Apres Phase 3.6, le builder-IA importe depuis shared :

```typescript
import { DSFR_TAG_MAP, normalizeChartType } from '@dsfr-data/shared';
const tag = DSFR_TAG_MAP[normalizeChartType(chartType)];
```

### 4.7 Tests

- Tests existants du builder-IA (skills.test.ts) doivent passer
- Tests que les templates shared produisent le meme HTML que les anciens templates inline
- Tests que le builder-IA genere correctement :
  - Un pipeline Grist avec normalize flatten
  - Des facettes pour source ODS (server-facets)
  - Des facettes pour source Tabular (static-values)
  - Les 12 operateurs de filtre (dont les 4 nouveaux)
- Tests d'alignement : les deux builders produisent le meme HTML pour les memes inputs

### 4.8 Critere de validation

- 0 duplication de templates HTML entre builder et builder-IA
- `filterToOdsql`, `DSFR_TAG_MAP`, `KPI_CSS` ont chacun un seul point de definition dans shared
- Le builder-IA genere des pipelines normalize + facets fonctionnels
- `npm run test:run` passe
- `npm run build:all` reussit

---

## Phase 5 : Adapter Grist + alignement dsfr-data-source

### 5.1 Creer un GristAdapter

Actuellement, Grist n'a pas d'adapter dans `src/adapters/`. Les donnees Grist
transitent par `dsfr-data-source` (generic fetch) + `dsfr-data-normalize` (flatten) +
`dsfr-data-query` (generic client-side).

Un `GristAdapter` permettrait d'utiliser `dsfr-data-query api-type="grist"` avec
pagination automatique et gestion native des `{fields: {...}}`.

**Fichier :** `src/adapters/grist-adapter.ts`

```typescript
export class GristAdapter implements ApiAdapter {
  readonly type = 'grist';
  readonly capabilities: AdapterCapabilities = {
    serverFetch: true,
    serverFacets: false,
    serverSearch: false,
    serverGroupBy: false,
    serverOrderBy: false,
    whereFormat: 'colon',
  };

  // fetchAll : GET /api/docs/{docId}/tables/{tableId}/records
  //   response: { records: [{ id, fields: {...} }] }
  //   auto-flatten des fields
  //   pas de pagination native dans l'API Grist
}
```

### 5.2 Aligner dsfr-data-source pagination

Actuellement `dsfr-data-source` hardcode `page` + `page_size` comme noms de
parametres URL (Tabular-specific). Avec le ProviderConfig, on peut lire
`provider.pagination.params` pour construire l'URL correctement.

Cependant, cela necessite que `dsfr-data-source` connaisse le provider. Deux
approches :

**Approche retenue : Ajouter un attribut `api-type` a `dsfr-data-source`** (comme `dsfr-data-query`)

Cela permet a `dsfr-data-source` de lire `ProviderConfig.pagination.params` pour
construire l'URL de pagination correctement au lieu de hardcoder les params
Tabular (`page`, `page_size`).

```typescript
// dsfr-data-source.ts - ajout
@property({ type: String, attribute: 'api-type' })
apiType: string = 'generic';
```

Quand `api-type` est specifie, `dsfr-data-source` lit le ProviderConfig correspondant
pour determiner les noms de parametres de pagination et la structure de reponse.

### 5.3 Tests

- Tests unitaires du GristAdapter (fetchAll, buildUrl, validate)
- Tests d'integration : `dsfr-data-query api-type="grist"` + dsfr-data-chart

### 5.4 Critere de validation

- Le GristAdapter est enregistre dans ADAPTER_REGISTRY
- Les tests d'alignement skills verifient que le skill dsfrDataQuery documente
  le nouveau api-type "grist"
- `npm run test:run` passe

---

## Phase 6 : Alignement skills, MCP et documentation

### 6.1 Nouveau skill : `apiProviders`

Ce skill centralise la documentation des 4 providers. Il sert de reference pour
l'IA et pour les utilisateurs du MCP.

```typescript
apiProviders: {
  id: 'apiProviders',
  name: 'Providers API',
  description: 'Configuration et capacites des providers API supportes',
  trigger: ['provider', 'ods', 'opendatasoft', 'tabular', 'grist', 'api', 'source api', 'type api'],
  content: `## Providers API supportes

### Tableau de capacites

| Provider | api-type | Pagination | Aggregation | Facettes | Recherche | Tri serveur |
|---|---|---|---|---|---|---|
| OpenDataSoft | opendatasoft | Auto (offset, max 1000) | Serveur (ODSQL) | Serveur | Serveur (ODSQL) | Serveur |
| Tabular | tabular | Auto (pages, max 50000) | Client-side | Statiques | Client-side | Serveur |
| Grist | grist | Non | Client-side | Client-side | Client-side | Non |
| Generic | generic (defaut) | Non | Client-side | Client-side | Client-side | Non |

### Detection automatique

Le provider est detecte automatiquement a partir de l'URL API :
- **ODS** : URL contient \`/api/explore/v2.1/catalog/datasets/\`
- **Tabular** : URL contient \`tabular-api.data.gouv.fr\`
- **Grist** : URL contient \`/api/docs/\` sur un domaine Grist connu
- **Generic** : Tout le reste

### Pipelines par provider

**ODS :**
dsfr-data-query api-type="opendatasoft" base-url="..." dataset-id="..."
  → [dsfr-data-facets server-facets] → dsfr-data-chart

**Tabular :**
dsfr-data-query api-type="tabular" base-url="..." resource="..."
  → [dsfr-data-facets static-values="..."] → dsfr-data-chart

**Grist :**
dsfr-data-source url="..." → dsfr-data-normalize flatten="fields"
  → [dsfr-data-facets] → dsfr-data-query → dsfr-data-chart

**Generic REST :**
dsfr-data-source url="..." [transform="..."]
  → [dsfr-data-facets] → dsfr-data-query → dsfr-data-chart

### Proxy

Les API Grist necessitent un proxy CORS :
- grist.numerique.gouv.fr → /grist-gouv-proxy
- docs.getgrist.com → /grist-proxy
Les API ODS et Tabular sont en acces direct (CORS actif).
`
}
```

### 6.2 Mettre a jour les 7 skills existants

L'audit revele que 7 skills doivent etre enrichis pour documenter les specificites
provider de maniere coherente.

| Skill | Modifications |
|---|---|
| **dsfrDataSource** | Documenter la limitation pagination (1 page sauf Tabular paginate). Mentionner que pour ODS/Tabular, preferer dsfr-data-query. Ajouter ref vers skill `apiProviders`. |
| **dsfrDataQuery** | Documenter les 3 api-type avec exemples complets (deja partiellement fait). Ajouter `api-type="grist"` si Phase 5 cree le GristAdapter. Documenter que la detection du provider est automatique dans le builder. |
| **dsfrDataNormalize** | Documenter quand `flatten` est necessaire par provider : Grist (`flatten="fields"`), ODS v1 (`flatten="fields"`), Airtable (`flatten="fields"`). Les API ODS v2.1 et Tabular ne necessitent PAS de flatten. |
| **dsfrDataFacets** | Documenter les 3 modes avec le provider correspondant : `server-facets` (ODS), `static-values` (Tabular/Grist), client-side (generic). Ajouter exemples par provider. |
| **dsfrDataSearch** | Documenter la disponibilite par provider : `server-search` pour ODS uniquement, `search-template` ODSQL par defaut. Client-side pour Tabular/Grist/generic. |
| **compositionPatterns** | **Ajout majeur** : documenter les 4 pipelines complets par provider (ODS, Tabular, Grist, Generic) avec exemples HTML copy-paste. Actuellement seuls 2 pipelines sur 4 sont documentes (generic + Grist/ODS v1). |
| **troubleshooting** | Ajouter les diagnostics provider-specifiques manquants : authentification Grist (Bearer token), rate limits Tabular, pagination ODS (max 100/requete), erreurs CORS par provider. |

### 6.3 Mettre a jour le skill compositionPatterns en detail

C'est le skill le plus impacte. Il doit montrer les 4 pipelines complets :

```markdown
## Pipeline OpenDataSoft (server-side)

\`\`\`html
<dsfr-data-query id="data"
  api-type="opendatasoft"
  base-url="https://data.economie.gouv.fr"
  dataset-id="prix-des-carburants-en-france-flux-instantane-v2"
  select="departement, avg(prix_valeur) as prix_moyen"
  group-by="departement"
  order-by="prix_moyen:desc"
  limit="20">
  <dsfr-data-facets source="data" fields="departement,region"
    server-facets display="multiselect"></dsfr-data-facets>
  <dsfr-data-chart source="data" type="bar"
    label-field="departement" value-field="prix_moyen"></dsfr-data-chart>
</dsfr-data-query>
\`\`\`

## Pipeline Tabular (multi-page)

\`\`\`html
<dsfr-data-query id="data"
  api-type="tabular"
  base-url="https://tabular-api.data.gouv.fr"
  resource="d3643e41-..."
  group-by="libelle_categorie_juridique"
  aggregate="count">
  <dsfr-data-facets source="data" fields="libelle_categorie_juridique"
    static-values='{"libelle_categorie_juridique":["Commune","Departement"]}'
    display="select"></dsfr-data-facets>
  <dsfr-data-chart source="data" type="pie"
    label-field="libelle_categorie_juridique" value-field="count"></dsfr-data-chart>
</dsfr-data-query>
\`\`\`

## Pipeline Grist (avec flatten)

\`\`\`html
<dsfr-data-source id="src"
  url="https://grist.numerique.gouv.fr/api/docs/DOC_ID/tables/TABLE/records"
  transform="records">
  <dsfr-data-normalize source="src" id="flat" flatten="fields">
    <dsfr-data-facets source="flat" fields="region,departement"
      display="multiselect"></dsfr-data-facets>
    <dsfr-data-query source="flat" id="data"
      group-by="region" aggregate="montant:sum">
      <dsfr-data-chart source="data" type="bar"
        label-field="region" value-field="montant"></dsfr-data-chart>
    </dsfr-data-query>
  </dsfr-data-normalize>
</dsfr-data-source>
\`\`\`

## Pipeline Generic REST

\`\`\`html
<dsfr-data-source id="src"
  url="https://api.example.com/data"
  transform="results">
  <dsfr-data-query source="src" id="data"
    group-by="categorie" aggregate="valeur:avg">
    <dsfr-data-chart source="data" type="line"
      label-field="categorie" value-field="valeur"></dsfr-data-chart>
  </dsfr-data-query>
</dsfr-data-source>
\`\`\`
```

### 6.4 Mettre a jour le MCP server

Le MCP server (`mcp-server/src/index.ts`, 326 lignes) expose 4 tools aux outils
IA externes. Les modifications sont mineures mais necessaires.

#### Architecture actuelle du MCP

```
mcp-server/src/index.ts (326 lignes)
  ├── 4 tools : list_skills, get_skill, get_relevant_skills, generate_widget_code
  ├── Skills loader : fetch depuis {baseUrl}/dist/skills.json ou fichier local
  ├── Transport : stdio (Claude Desktop/Code) ou HTTP (Claude.ai)
  └── Config : --url, --http, --port, --skills-file
```

#### Modifications des tools

| Tool | Modification |
|---|---|
| `list_skills` | Ajouter option `provider` pour filtrer les skills par provider. Si omis, retourne tous les skills. |
| `get_skill` | Inchange (retourne le skill par ID, le contenu inclut deja les infos provider). |
| `get_relevant_skills` | Inchange (le matching par trigger fonctionne deja, les nouveaux triggers du skill `apiProviders` seront automatiquement matchables). |
| `generate_widget_code` | Ajouter le skill `apiProviders` au bundle par defaut. Quand `chart_type` est specifie, inclure les infos provider pertinentes dans le contexte. |

#### Modifications du build

Le script `scripts/build-skills-json.ts` doit inclure le nouveau skill `apiProviders`
dans `dist/skills.json`. Aucune modification du script n'est necessaire car il exporte
deja tous les skills du registre SKILLS.

#### Nouveau parametre CLI (optionnel)

```bash
# Filtrer par provider (utile pour des deployments specialises)
node mcp-server/dist/index.js --provider opendatasoft
```

### 6.5 Tests

- Tests d'alignement existants (`skills.test.ts`) : ajouter le nouveau skill `apiProviders` dans la liste attendue (19 skills au lieu de 18)
- Test que `apiProviders` documente les 4 providers
- Test que `compositionPatterns` contient les 4 pipelines (ODS, Tabular, Grist, Generic)
- Test que `dsfrDataFacets` documente les 3 modes (server, static, client)
- Test que `troubleshooting` mentionne chaque provider
- Test que `dsfrDataQuery` documente les valeurs api-type ("opendatasoft", "tabular", et "grist" si Phase 5 faite)
- Verification que `dist/skills.json` contient le nouveau skill apres `npm run build`

### 6.6 Critere de validation

- Le skill `apiProviders` est ajoute et documente les 4 providers avec leurs capacites
- Le skill `compositionPatterns` inclut les 4 pipelines complets avec exemples HTML
- Les 7 skills existants sont enrichis avec les infos provider manquantes
- Le MCP `generate_widget_code` inclut `apiProviders` dans son bundle par defaut
- Les tests d'alignement passent (19 skills, couverture attributs, couverture providers)
- `npm run test:run` passe

---

## Resume des phases

| Phase | Scope | Fichiers | Risque | Effort |
|---|---|---|---|---|
| 1 | ProviderConfig + Source unifiee | ~12 fichiers shared + apps | Faible | Moyen |
| 2 | Deduplication proxy, constantes + nettoyage legacy | ~15 fichiers | Faible | Moyen |
| 3 | Refactoring code-generator builder + shared utils | 3 fichiers (code-gen + chart-types + filter-translator) + tests | **Eleve** | **Eleve** |
| 4 | Refactoring code-generator builder-IA + alignement | 1 fichier (981L) + templates shared + ajout normalize/facets | Moyen | Moyen |
| 5 | GristAdapter + alignement dsfr-data-source | 2-3 fichiers | Moyen | Moyen |
| 6 | Skills (1 nouveau + 7 enrichis) + MCP (4 tools) | skills.ts + mcp index.ts + tests | Faible | Moyen |

### Ordre d'execution recommande

```
Phase 1 ──→ Phase 2 ──→ Phase 3 ──→ Phase 4
                              ↓
                         Phase 5 ──→ Phase 6
```

Les phases 1 et 2 sont des prerequis non-cassants. La phase 3 est le coeur du
refactoring. Les phases 5 et 6 peuvent etre faites en parallele de la phase 4.

### Ce que cet epic apporte au-dela de la centralisation

| Amelioration | Phase | Impact |
|---|---|---|
| **Bug fix : 4 operateurs manquants builder-IA** | 4.5 | `notcontains`, `notin`, `isnull`, `isnotnull` fonctionnent dans l'IA |
| **Nouvelle capacite : normalize + facets dans builder-IA** | 4.4 | L'IA peut generer des pipelines Grist complets et des facettes |
| **Nouveau skill `apiProviders`** | 6.1 | L'IA connait les capacites de chaque provider |
| **4 pipelines documentes dans compositionPatterns** | 6.3 | L'IA genere le bon pipeline selon le provider |
| **Nettoyage : ~100 lignes de code mort supprimees** | 2.0 | Code generator plus lisible |
| **DSFR_TAG_MAP + normalizeChartType centralises** | 3.6 | Les deux builders partagent le meme mapping |
| **GristAdapter** | 5.1 | `dsfr-data-query api-type="grist"` possible (pipeline simplifie) |

### Surface de compatibilite garantie

- **41 exemples playground** : valides par `tests/apps/playground/examples.test.ts`
- **8 pages guide** : fonctionnelles sans modification
- **232 tests code generator** : passent sans regression
- **144 snapshots HTML** : generes avant Phase 3, identiques apres
- **1534+ tests** totaux : tous verts

### Metriques de succes

- **Avant :** ~35 proprietes provider-specifiques dispersees dans ~25 fichiers, 3 interfaces Source, 2 implementations filterToOdsql, 0 documentation provider dans les skills
- **Apres :** 4 fichiers ProviderConfig + 1 fichier Source + 1 filterToOdsql + 1 DSFR_TAG_MAP + skill `apiProviders` + 4 pipelines documentes
- **Reduction de code :** ~700 lignes estimees (deduplication templates + regexes + constantes + code mort)
- **Ajout d'un nouveau provider :** 1 fichier config + 1 adapter (~100L) au lieu de modifier ~10 fichiers
- **Tests :** 1534+ tests existants + ~50 nouveaux tests (providers, snapshots, alignement)

### Risques et mitigations

| Risque | Impact | Mitigation |
|---|---|---|
| Regression HTML genere | Eleve | Tests snapshot du code genere pour chaque combinaison provider x chart-type avant refactoring (144 snapshots) |
| Dependance circulaire shared ↔ src | Moyen | ProviderConfig est dans shared, adapters restent dans src/ |
| builder-IA state trop mince | Faible | Phase 1.4 enrichit le Source partage, Phase 4.4 ajoute normalize/facets |
| GristAdapter inutile | Faible | Phase 5 est optionnelle, Grist fonctionne deja via generic |
| Vite configs ne peuvent pas importer shared | Moyen | Les Vite configs gardent leurs targets en dur, mais documentees depuis le registre |
| Ecarts playground/guide post-refactoring | Eleve | Valides par les 41 tests examples existants + tests manuels sur les 8 pages guide |
| Skills desynchronises apres ajout provider | Moyen | Tests d'alignement skills.test.ts (introspection Lit) detectent automatiquement les ecarts |
| MCP skills.json obsolete | Faible | Le build genere skills.json automatiquement ; versionne avec le code |

## En fin d'epic, avant qu'il ne soit considéré comme "done"
Assure toi d'avoir relu tout l'epic et double-checké que tout à été réalisé à 100%, documentation et tests inclus
Si ce n'est pas le cas recomence et termine, et reboucle jusqu'à ce que tout ai été vérifié plusieurs fois. 
