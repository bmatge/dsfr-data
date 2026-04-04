# EPIC: Exploitation complete de l'API Grist

## Contexte

L'analyse de la [spec API Grist](https://support.getgrist.com/api/) revele des capacites
server-side significatives qui ne sont pas exploitees par l'adapter actuel. Aujourd'hui,
l'adapter Grist est le plus basique : il fait un seul `GET /records` sans aucun query
parameter, et delegue 100% du traitement (filter, sort, group-by, aggregate) au client.

Or l'API Grist offre :
- **Filtrage server-side** : `?filter={"col":["val1","val2"]}` (endpoint Records)
- **Tri server-side** : `?sort=col,-col2:naturalSort` (endpoint Records)
- **Pagination** : `?limit=N&offset=M` (endpoint Records)
- **SQL complet** : `GET/POST /api/docs/{docId}/sql` (SQLite natif : GROUP BY, agregate, LIKE, JOIN, DISTINCT)
- **Introspection colonnes** : `GET /api/docs/{docId}/tables/{tableId}/columns`
- **Liste des tables** : `GET /api/docs/{docId}/tables`

## Objectif

Faire passer Grist du statut de provider "tout client-side" a un provider aussi capable
qu'ODS (server-side filter, sort, pagination, aggregation, facettes, recherche), en ne
modifiant que **2 fichiers** :

| Fichier | Role |
|---|---|
| `src/adapters/grist-adapter.ts` | Logique : construction d'URL, parsing reponses, gestion pagination |
| `packages/shared/src/providers/grist.ts` | Config declarative : capacites, pagination, query format |

**Les composants ne changent pas.** `dsfr-data-source`, `dsfr-data-query`, `dsfr-data-facets`, `dsfr-data-search`
lisent les capacites depuis l'adapter/provider et s'adaptent automatiquement.

## Fichiers modifies (2 fichiers adapter/provider + 1 type a etendre)

| Fichier | Role | Lignes avant | Lignes apres |
|---|---|---|---|
| `src/adapters/grist-adapter.ts` | Logique adapter | 122 | ~440 |
| `packages/shared/src/providers/grist.ts` | Config declarative | 69 | ~100 |
| `packages/shared/src/providers/provider-config.ts` | **Interface** : ajouter `'sql'` dans `aggregationSyntax` union | 129 | ~130 |

## Contraintes d'interface existantes

Les interfaces `ApiAdapter`, `AdapterParams`, `ServerSideOverlay`, `FetchResult` et
`ProviderConfig` sont deja definies et utilisees par les composants. L'adapter Grist
**doit respecter ces contrats** exactement. Voici les points d'attention :

| Interface | Champ | Contrainte |
|---|---|---|
| `FetchResult` | Pas de `hasMore` | Seuls `data`, `totalCount`, `needsClientProcessing`, `rawJson` existent. Le `totalCount` doit etre un nombre (utiliser -1 si inconnu). |
| `ServerSideOverlay` | Pas de `pageSize` | Seuls `page`, `effectiveWhere`, `orderBy`. Le `pageSize` vient de `AdapterParams.pageSize`. |
| `ServerSideOverlay` | `effectiveWhere` | Le champ s'appelle `effectiveWhere`, **pas** `where`. |
| `ApiAdapter` | `fetchFacets?()` | Signature existante : `(params: Pick<AdapterParams, 'baseUrl'\|'datasetId'\|'headers'>, fields: string[], where: string, signal?) → Promise<FacetResult[]>`. Ne pas inventer `fetchFacetValues()`. |
| `FacetResult` | `{ field, values: Array<{ value, count }> }` | L'adapter doit retourner ce format. |
| `ProviderConfig.query` | `aggregationSyntax` | Type union actuel : `'odsql-select' \| 'colon-attr' \| 'client-only'`. **Doit etre etendu** avec `'sql'` dans `provider-config.ts`. |
| `dsfr-data-search` | `searchTemplate` | Ne remplace que `{q}`, pas `{searchField}`. Le template Grist doit etre un WHERE complet avec `{q}` seulement. |

## Decisions d'arbitrage

| Decision | Choix | Raison |
|---|---|---|
| Noms de colonnes avec espaces/accents | **Double-quotes SQL** (`"Ma Colonne"`) | Standard SQLite, supporte tous les noms Grist. `_escapeIdentifier` echappera via guillemets doubles au lieu de rejeter. |
| `serverSearch` capability | **false** | Grist n'a pas de full-text natif. L'utilisateur active la recherche manuellement via `search-template="nom:contains:{q}"`. Plus honnete sur les capacites reelles. |
| Cache SQL availability | **Map par hostname** | `Map<string, boolean>` au lieu d'un boolean simple. Chaque instance Grist (gouv.fr, getgrist.com, self-hosted) est testee independamment. |

## Contraintes techniques

- **Retrocompatibilite** : le pattern actuel (`dsfr-data-source` + `dsfr-data-query` tout client-side) doit continuer a fonctionner
- **Timeout SQL** : le defaut Grist est 1000ms, non modifiable par le client. Les requetes complexes doivent rester simples
- **Instances heterogenes** : `grist.numerique.gouv.fr` et `docs.getgrist.com` peuvent avoir des politiques differentes sur le endpoint SQL
- **Proxy** : toutes les requetes Grist passent par un proxy CORS, les nouveaux endpoints doivent etre proxies aussi

---

## Etat des lieux

### Adapter actuel (`grist-adapter.ts` - 122 lignes)

```typescript
capabilities: {
  serverFetch: true,
  serverFacets: false,
  serverSearch: false,
  serverGroupBy: false,
  serverOrderBy: false,
  whereFormat: 'colon',
}
```

- `buildUrl()` : retourne `baseUrl` tel quel, sans aucun query parameter
- `fetchAll()` : GET unique, parse `records[].fields`, flatten, retourne `needsClientProcessing: true`
- `fetchPage()` : identique a `fetchAll()` (pas de pagination)
- `buildFacetWhere()` : syntaxe colon (`field:eq:value`) — utilisee pour le client-side uniquement
- `getDefaultSearchTemplate()` : retourne `null`

### Provider config actuel (`grist.ts` - 69 lignes)

```typescript
pagination: { type: 'none' }
capabilities: { tout a false sauf serverFetch }
query: { aggregationSyntax: 'client-only', searchTemplate: null }
facets: { defaultMode: 'client' }
```

---

## Architecture cible

Deux modes de fonctionnement coexistent, selectionnes automatiquement selon le contexte :

### Mode Records (defaut) — filter + sort + pagination

Pour les cas simples (datalist, affichage pagine, filtre par valeurs exactes) :

```
GET /api/docs/{docId}/tables/{tableId}/records
  ?filter={"region":["Bretagne","Normandie"]}
  &sort=-population
  &limit=20
  &offset=40
```

### Mode SQL — aggregation, recherche LIKE, facettes DISTINCT

Pour les cas avances (graphiques avec GROUP BY, recherche texte, facettes dynamiques) :

```
POST /api/docs/{docId}/sql
{
  "sql": "SELECT region, SUM(population) as total FROM Table1 WHERE nom LIKE ? GROUP BY region ORDER BY total DESC LIMIT 20",
  "args": ["%Paris%"],
  "timeout": 500
}
```

### Diagramme de decision dans l'adapter

```
                   ┌─ needsGroupBy OR needsAggregate OR needsLikeSearch?
                   │
              ┌────┴────┐
              │  OUI    │  NON
              ▼         ▼
         Mode SQL    Mode Records
         (POST /sql)  (GET /records + filter/sort/limit/offset)
```

L'adapter choisit automatiquement le mode en fonction des attributs demandes
par `dsfr-data-source` (via `ServerSideOverlay`).

---

## ETAPE 1 : Mode Records enrichi (filter + sort + limit/offset)

> Quick win : exploiter les query params de l'endpoint Records existant.
> Pas de nouvel endpoint, changement minimal.

### 1.1 Enrichir `buildUrl()` et `buildServerSideUrl()`

**Fichier** : `src/adapters/grist-adapter.ts`

Transformer `buildUrl()` pour construire l'URL avec les query params disponibles :

```typescript
buildUrl(params: AdapterParams): string {
  const url = new URL(params.baseUrl);

  // Filter server-side : convertir le where colon en JSON Grist
  if (params.where) {
    const gristFilter = this._colonWhereToGristFilter(params.where);
    if (gristFilter) {
      url.searchParams.set('filter', JSON.stringify(gristFilter));
    }
  }

  // Sort server-side
  if (params.orderBy) {
    url.searchParams.set('sort', this._orderByToGristSort(params.orderBy));
  }

  // Limit (sans pagination)
  if (params.limit) {
    url.searchParams.set('limit', String(params.limit));
  }

  return url.toString();
}

buildServerSideUrl(params: AdapterParams, overlay: ServerSideOverlay): string {
  const url = new URL(params.baseUrl);

  // Merge static where + dynamic where (facets, search)
  // NOTE: overlay.effectiveWhere (pas .where) — c'est le contrat de ServerSideOverlay
  const mergedWhere = overlay.effectiveWhere || params.where;
  if (mergedWhere) {
    const gristFilter = this._colonWhereToGristFilter(mergedWhere);
    if (gristFilter) {
      url.searchParams.set('filter', JSON.stringify(gristFilter));
    }
  }

  // Sort
  const sort = overlay.orderBy || params.orderBy;
  if (sort) {
    url.searchParams.set('sort', this._orderByToGristSort(sort));
  }

  // Pagination — pageSize vient de AdapterParams (pas de overlay)
  if (overlay.page && params.pageSize) {
    url.searchParams.set('limit', String(params.pageSize));
    url.searchParams.set('offset', String((overlay.page - 1) * params.pageSize));
  }

  return url.toString();
}
```

### 1.2 Conversion WHERE colon → JSON Grist filter

**Fichier** : `src/adapters/grist-adapter.ts`

L'API Grist utilise un format JSON pour le filtre : `{"col": ["val1", "val2"]}`.
C'est un subset de la syntaxe colon (uniquement egalite / IN) :

```typescript
/**
 * Convertit une clause WHERE colon-syntax en objet filtre Grist.
 *
 * Supporte :
 *   field:eq:value     → { field: ["value"] }
 *   field:in:v1|v2|v3  → { field: ["v1", "v2", "v3"] }
 *
 * Les operateurs non supportes (gt, lt, contains...) sont ignores
 * silencieusement (ils seront geres en mode SQL, etape 2).
 *
 * @returns objet filtre Grist, ou null si aucun filtre applicable
 */
private _colonWhereToGristFilter(where: string): Record<string, string[]> | null {
  const filter: Record<string, string[]> = {};
  const parts = where.split(',').map(p => p.trim()).filter(Boolean);

  for (const part of parts) {
    const [field, op, ...rest] = part.split(':');
    const value = rest.join(':'); // re-joindre si la valeur contenait des ':'

    if (op === 'eq') {
      filter[field] = [value];
    } else if (op === 'in') {
      filter[field] = value.split('|');
    }
    // Autres operateurs : ignores (fallback client-side)
  }

  return Object.keys(filter).length > 0 ? filter : null;
}
```

### 1.3 Conversion orderBy → sort Grist

**Fichier** : `src/adapters/grist-adapter.ts`

```typescript
/**
 * Convertit une clause order-by colon-syntax en parametre sort Grist.
 *
 * Syntaxe source (dsfr-data-source) : "population:desc, nom:asc"
 * Syntaxe cible (Grist API)    : "-population,nom"
 *
 * Options Grist supportees : naturalSort, choiceOrder, emptyFirst
 * (ajoutees apres ':' dans le parametre sort Grist)
 */
private _orderByToGristSort(orderBy: string): string {
  return orderBy.split(',').map(part => {
    const [field, dir] = part.trim().split(':');
    return dir === 'desc' ? `-${field}` : field;
  }).join(',');
}
```

### 1.4 Pagination avec totalCount

**Fichier** : `src/adapters/grist-adapter.ts`

L'API Grist ne retourne pas de `totalCount` dans la reponse Records.
Deux strategies :

**Strategie A (recommandee)** : Heuristique basee sur la taille de la reponse

```typescript
async fetchPage(params: AdapterParams, overlay: ServerSideOverlay, signal: AbortSignal): Promise<FetchResult> {
  const url = this.buildServerSideUrl(params, overlay);
  const response = await fetch(url, buildFetchOptions(params, signal));
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);

  const json = await response.json();
  const records: unknown[] = json.records || [];
  const data = this._flattenRecords(records);

  // NOTE: FetchResult n'a PAS de champ hasMore. On utilise totalCount.
  // pageSize vient de params (pas de overlay — ServerSideOverlay n'a pas pageSize).
  const pageSize = params.pageSize || data.length;
  // Heuristique : si data < pageSize, on est sur la derniere page
  // Si data === pageSize, on ne connait pas le total → retourner -1
  const isLastPage = data.length < pageSize;
  const estimatedTotal = isLastPage
    ? ((overlay.page || 1) - 1) * pageSize + data.length
    : -1; // -1 = inconnu, le composant affichera "page X" sans total

  return {
    data,
    totalCount: estimatedTotal,
    needsClientProcessing: false, // les donnees sont deja filtrees/triees server-side
  };
}
```

**Strategie B (optionnelle, si totalCount est necessaire)** : Requete SQL COUNT

```typescript
// Optionnel : fetch totalCount via SQL si necessaire pour l'affichage pagination
private async _fetchTotalCount(params: AdapterParams, where?: string, signal?: AbortSignal): Promise<number> {
  const sqlUrl = this._getSqlEndpointUrl(params);
  const table = this._getTableId(params);
  let sql = `SELECT COUNT(*) as total FROM ${table}`;
  const args: (string | number)[] = [];

  if (where) {
    const { clause, params: sqlArgs } = this._whereToSqlClause(where);
    sql += ` WHERE ${clause}`;
    args.push(...sqlArgs);
  }

  const response = await fetch(sqlUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...buildFetchOptions(params).headers as Record<string, string> },
    body: JSON.stringify({ sql, args, timeout: 500 }),
    signal,
  });

  const json = await response.json();
  return json.records?.[0]?.[0] ?? 0;
}
```

### 1.5 Extraire la logique de flatten en methode privee

**Fichier** : `src/adapters/grist-adapter.ts`

```typescript
/** Aplatir records[].fields en objets plats */
private _flattenRecords(records: unknown[]): Record<string, unknown>[] {
  return records.map((r: unknown) => {
    const rec = r as Record<string, unknown>;
    const fields = rec.fields as Record<string, unknown> | undefined;
    return fields ? { ...fields } : rec;
  });
}
```

### 1.6 Mettre a jour les capabilities

**Fichier** : `src/adapters/grist-adapter.ts`

```typescript
readonly capabilities: AdapterCapabilities = {
  serverFetch: true,
  serverFacets: false,     // Passe a true en etape 2 (SQL DISTINCT)
  serverSearch: false,     // Passe a true en etape 2 (SQL LIKE)
  serverGroupBy: false,    // Passe a true en etape 2 (SQL GROUP BY)
  serverOrderBy: true,     // NOUVEAU : sort server-side via ?sort=
  whereFormat: 'colon',    // Inchange (la conversion colon→JSON est interne)
};
```

### 1.7 Mettre a jour le provider config

**Fichier** : `packages/shared/src/providers/grist.ts`

```typescript
export const GRIST_CONFIG: ProviderConfig = {
  // ... (id, displayName, urlPatterns, knownHosts inchanges)

  pagination: {
    type: 'offset',                    // CHANGE : 'none' → 'offset'
    pageSize: 100,                     // NOUVEAU : taille de page par defaut
    maxPages: 0,                       // 0 = pas de limite (Grist n'a pas de limite documentee)
    maxRecords: 0,                     // 0 = pas de limite
    params: {
      offset: 'offset',               // NOUVEAU
      limit: 'limit',                  // NOUVEAU
    },
    nextPagePath: null,
  },

  capabilities: {
    serverFetch: true,
    serverFacets: false,               // Passe a true en etape 2
    serverSearch: false,               // Passe a true en etape 2
    serverGroupBy: false,              // Passe a true en etape 2
    serverOrderBy: true,               // CHANGE : false → true
    serverAggregation: false,          // Passe a true en etape 2
  },

  query: {
    whereFormat: 'colon',              // Inchange (interface publique)
    whereSeparator: ', ',              // Inchange
    aggregationSyntax: 'client-only',  // Passe a 'sql' en etape 2
    searchTemplate: null,              // Passe a template SQL en etape 2
  },

  // ... (facets, resource, codeGen inchanges)
};
```

### 1.8 Mettre a jour `buildFacetWhere()`

**Fichier** : `src/adapters/grist-adapter.ts`

Le `buildFacetWhere()` actuel produit de la syntaxe colon (`field:eq:value`).
C'est correct : le composant `dsfr-data-facets` l'envoie en commande `where` a `dsfr-data-source`,
qui le passe a l'adapter via `buildServerSideUrl()`. L'adapter le convertit ensuite
en JSON Grist via `_colonWhereToGristFilter()`.

**Aucun changement necessaire** dans `buildFacetWhere()` pour l'etape 1.

### 1.9 Tests

**Fichier** : `tests/adapters/grist-adapter.test.ts` (nouveau ou enrichir l'existant)

```typescript
describe('GristAdapter - Etape 1 : Records enrichi', () => {

  describe('_colonWhereToGristFilter', () => {
    test('eq simple', () => {
      // 'region:eq:Bretagne' → { region: ['Bretagne'] }
    });
    test('in multiple', () => {
      // 'region:in:Bretagne|Normandie' → { region: ['Bretagne', 'Normandie'] }
    });
    test('multi-champs', () => {
      // 'region:eq:Bretagne, annee:eq:2023'
      // → { region: ['Bretagne'], annee: ['2023'] }
    });
    test('operateurs non supportes ignores', () => {
      // 'age:gt:18' → null (ignore, fallback client)
    });
    test('valeur avec deux-points', () => {
      // 'url:eq:https://example.com' → { url: ['https://example.com'] }
    });
  });

  describe('_orderByToGristSort', () => {
    test('asc simple', () => {
      // 'nom' → 'nom' ; 'nom:asc' → 'nom'
    });
    test('desc', () => {
      // 'population:desc' → '-population'
    });
    test('multi-colonnes', () => {
      // 'region:asc, population:desc' → 'region,-population'
    });
  });

  describe('buildUrl', () => {
    test('sans params : URL inchangee', () => {
      // baseUrl seul → pas de query params
    });
    test('avec where eq', () => {
      // where='region:eq:Bretagne'
      // → ?filter=%7B%22region%22%3A%5B%22Bretagne%22%5D%7D
    });
    test('avec orderBy', () => {
      // orderBy='population:desc' → ?sort=-population
    });
    test('avec limit', () => {
      // limit=20 → ?limit=20
    });
    test('combine filter + sort + limit', () => {
      // les 3 ensemble
    });
  });

  describe('buildServerSideUrl', () => {
    test('pagination offset', () => {
      // page=3, pageSize=20 → ?limit=20&offset=40
    });
    test('merge where statique + overlay', () => {
      // params.where + overlay.effectiveWhere combines
    });
  });

  describe('fetchPage', () => {
    test('retourne needsClientProcessing=false quand filter+sort server', () => {});
    test('hasMore=true quand data.length === pageSize', () => {});
    test('hasMore=false quand data.length < pageSize', () => {});
  });
});
```

### 1.10 Critere de validation etape 1

- [x] `buildUrl()` ajoute `?filter=`, `?sort=`, `?limit=` quand les params sont presents
- [x] `buildServerSideUrl()` gere `?offset=` pour la pagination
- [x] `capabilities.serverOrderBy` passe a `true`
- [x] `pagination.type` passe a `'offset'`
- [ ] Tous les tests existants passent (retrocompat : sans params, comportement identique)
- [ ] Nouveaux tests couvrent les conversions colon→JSON et orderBy→sort
- [ ] `npm run test:run` passe
- [ ] `npm run build` passe

---

## ETAPE 2 : Mode SQL (aggregation, recherche, facettes server-side)

> Le game-changer : exploiter l'endpoint SQL pour donner a Grist les memes
> capacites server-side qu'ODS.

### 2.1 Detection du mode SQL

**Fichier** : `src/adapters/grist-adapter.ts`

L'adapter doit decider automatiquement s'il utilise l'endpoint Records ou SQL :

```typescript
/**
 * Determine si la requete necessite le mode SQL.
 *
 * Le mode SQL est active quand :
 * - group-by ou aggregate sont demandes (pas disponibles sur /records)
 * - un operateur WHERE non supporte par /records est utilise (gt, lt, contains...)
 * - une recherche LIKE est demandee
 *
 * Sinon, on reste sur /records (plus simple, pas de timeout SQL).
 */
private _needsSqlMode(params: AdapterParams, overlay?: ServerSideOverlay): boolean {
  // Group-by ou aggregate → SQL obligatoire
  if (params.groupBy || params.aggregate) return true;

  // Recherche LIKE
  if (overlay?.effectiveWhere?.includes('LIKE')) return true;

  // WHERE avec operateurs non supportes par le filtre JSON
  const where = this._mergeWhere(params.where, overlay?.effectiveWhere);
  if (where && this._hasAdvancedOperators(where)) return true;

  return false;
}

private _hasAdvancedOperators(where: string): boolean {
  const advancedOps = ['gt', 'gte', 'lt', 'lte', 'contains', 'notcontains'];
  return where.split(',').some(part => {
    const [, op] = part.trim().split(':');
    return advancedOps.includes(op);
  });
}
```

### 2.2 Endpoint SQL : construction de requetes

**Fichier** : `src/adapters/grist-adapter.ts`

```typescript
/**
 * Construit et execute une requete SQL parametree.
 *
 * SECURITE : toutes les valeurs sont passees via `args` (requetes parametrees).
 * Seuls les noms de colonnes et de tables sont injectes directement — ils sont
 * valides contre un pattern strict [a-zA-Z0-9_].
 */
private async _fetchSql(
  params: AdapterParams,
  overlay: ServerSideOverlay | undefined,
  signal: AbortSignal
): Promise<FetchResult> {
  const table = this._getTableId(params);
  const { select, groupBy, where, orderBy, limit, offset, args } =
    this._buildSqlQuery(params, overlay);

  const sql = [
    `SELECT ${select}`,
    `FROM ${this._escapeIdentifier(table)}`,
    where ? `WHERE ${where}` : '',
    groupBy ? `GROUP BY ${groupBy}` : '',
    orderBy ? `ORDER BY ${orderBy}` : '',
    limit ? `LIMIT ${limit}` : '',
    offset ? `OFFSET ${offset}` : '',
  ].filter(Boolean).join(' ');

  const sqlUrl = this._getSqlEndpointUrl(params);
  const response = await fetch(sqlUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(params.headers || {}),
    },
    body: JSON.stringify({ sql, args, timeout: 800 }),
    signal,
  });

  if (!response.ok) {
    // Fallback : si le endpoint SQL n'est pas disponible, revenir au mode Records
    if (response.status === 404 || response.status === 403) {
      console.warn('[dsfr-data] Grist SQL endpoint not available, falling back to client-side processing');
      return this.fetchAll(params, signal);
    }
    throw new Error(`Grist SQL HTTP ${response.status}: ${response.statusText}`);
  }

  const json = await response.json();
  // Le endpoint SQL retourne { records: [[col1, col2], ...], columns: ["col1", "col2"] }
  const data = this._sqlResultToObjects(json);

  return {
    data,
    totalCount: data.length,
    needsClientProcessing: false,
  };
}
```

### 2.3 Construction de la requete SQL

**Fichier** : `src/adapters/grist-adapter.ts`

```typescript
interface SqlQuery {
  select: string;
  groupBy: string;
  where: string;
  orderBy: string;
  limit: string;
  offset: string;
  args: (string | number)[];
}

private _buildSqlQuery(params: AdapterParams, overlay?: ServerSideOverlay): SqlQuery {
  const args: (string | number)[] = [];
  let select = '*';
  let groupBy = '';
  let where = '';
  let orderBy = '';
  let limit = '';
  let offset = '';

  // SELECT + GROUP BY + AGGREGATE
  if (params.groupBy) {
    const groupFields = params.groupBy.split(',').map(f => this._escapeIdentifier(f.trim()));
    groupBy = groupFields.join(', ');

    if (params.aggregate) {
      // Format aggregate : "field:func:alias, field2:func2:alias2"
      const aggParts = this._parseAggregates(params.aggregate);
      const selectParts = [...groupFields, ...aggParts.map(a => `${a.func}(${this._escapeIdentifier(a.field)}) as ${this._escapeIdentifier(a.alias)}`)];
      select = selectParts.join(', ');
    } else {
      select = groupFields.join(', ') + ', COUNT(*) as count';
    }
  }

  // WHERE (merge static + overlay)
  const mergedWhere = this._mergeWhere(params.where, overlay?.effectiveWhere);
  if (mergedWhere) {
    const result = this._colonWhereToSql(mergedWhere, args);
    where = result;
  }

  // ORDER BY
  const sort = overlay?.orderBy || params.orderBy;
  if (sort) {
    orderBy = sort.split(',').map(part => {
      const [field, dir] = part.trim().split(':');
      return `${this._escapeIdentifier(field)} ${dir === 'desc' ? 'DESC' : 'ASC'}`;
    }).join(', ');
  }

  // LIMIT / OFFSET (pageSize vient de params, page vient de overlay)
  if (overlay?.page && params.pageSize) {
    limit = String(params.pageSize);
    if (overlay.page > 1) {
      offset = String((overlay.page - 1) * params.pageSize);
    }
  } else if (params.limit) {
    limit = String(params.limit);
  }

  return { select, groupBy, where, orderBy, limit, offset, args };
}
```

### 2.4 Conversion WHERE colon → SQL parametre

**Fichier** : `src/adapters/grist-adapter.ts`

```typescript
/**
 * Convertit une clause WHERE colon-syntax en SQL parametre.
 *
 * Tous les operateurs sont supportes, contrairement a _colonWhereToGristFilter()
 * qui ne supporte que eq/in.
 *
 * @returns clause SQL avec placeholders '?'
 * @param args tableau mutable — les valeurs sont ajoutees au fur et a mesure
 */
private _colonWhereToSql(where: string, args: (string | number)[]): string {
  const clauses: string[] = [];
  const parts = where.split(',').map(p => p.trim()).filter(Boolean);

  for (const part of parts) {
    const [field, op, ...rest] = part.split(':');
    const value = rest.join(':');
    const col = this._escapeIdentifier(field);

    switch (op) {
      case 'eq':
        clauses.push(`${col} = ?`);
        args.push(value);
        break;
      case 'neq':
        clauses.push(`${col} != ?`);
        args.push(value);
        break;
      case 'gt':
        clauses.push(`${col} > ?`);
        args.push(this._toNumberOrString(value));
        break;
      case 'gte':
        clauses.push(`${col} >= ?`);
        args.push(this._toNumberOrString(value));
        break;
      case 'lt':
        clauses.push(`${col} < ?`);
        args.push(this._toNumberOrString(value));
        break;
      case 'lte':
        clauses.push(`${col} <= ?`);
        args.push(this._toNumberOrString(value));
        break;
      case 'contains':
        clauses.push(`${col} LIKE ?`);
        args.push(`%${value}%`);
        break;
      case 'notcontains':
        clauses.push(`${col} NOT LIKE ?`);
        args.push(`%${value}%`);
        break;
      case 'in': {
        const vals = value.split('|');
        clauses.push(`${col} IN (${vals.map(() => '?').join(',')})`);
        args.push(...vals);
        break;
      }
      case 'notin': {
        const vals = value.split('|');
        clauses.push(`${col} NOT IN (${vals.map(() => '?').join(',')})`);
        args.push(...vals);
        break;
      }
      case 'isnull':
        clauses.push(`${col} IS NULL`);
        break;
      case 'isnotnull':
        clauses.push(`${col} IS NOT NULL`);
        break;
    }
  }

  return clauses.join(' AND ');
}
```

### 2.5 Parsing de la reponse SQL

**Fichier** : `src/adapters/grist-adapter.ts`

```typescript
/**
 * Convertit le format reponse SQL Grist en tableau d'objets.
 *
 * Format entree : { records: [[v1, v2], [v3, v4]], columns: ["col1", "col2"] }
 * Format sortie : [{ col1: v1, col2: v2 }, { col1: v3, col2: v4 }]
 */
private _sqlResultToObjects(json: { records: unknown[][]; columns: string[] }): Record<string, unknown>[] {
  const { records = [], columns = [] } = json;
  return records.map(row => {
    const obj: Record<string, unknown> = {};
    columns.forEach((col, i) => { obj[col] = row[i]; });
    return obj;
  });
}
```

### 2.6 URL du endpoint SQL

**Fichier** : `src/adapters/grist-adapter.ts`

```typescript
/**
 * Derive l'URL du endpoint SQL depuis le baseUrl Records.
 *
 * baseUrl : https://proxy/grist-proxy/api/docs/{docId}/tables/{tableId}/records
 * sqlUrl  : https://proxy/grist-proxy/api/docs/{docId}/sql
 */
private _getSqlEndpointUrl(params: AdapterParams): string {
  const url = params.baseUrl;
  const match = url.match(/\/api\/docs\/([^/]+)/);
  if (!match) throw new Error('Cannot derive SQL endpoint from Grist URL: ' + url);

  // Remplacer /tables/{tableId}/records par /sql
  return url.replace(/\/tables\/[^/]+\/records.*$/, '/sql');
}

/**
 * Extrait le nom de la table depuis le baseUrl.
 * Utilise pour les requetes SQL (FROM clause).
 */
private _getTableId(params: AdapterParams): string {
  const match = params.baseUrl.match(/\/tables\/([^/]+)/);
  if (!match) throw new Error('Cannot extract table ID from Grist URL: ' + params.baseUrl);
  return match[1];
}
```

### 2.7 Securite : echappement des identifiants SQL

**Fichier** : `src/adapters/grist-adapter.ts`

```typescript
/**
 * Echappe un identifiant SQL (nom de colonne ou de table) avec des guillemets doubles.
 * Standard SQLite : "Ma Colonne", "Departement", etc.
 * Grist autorise des noms avec espaces et accents, donc on ne rejette pas.
 *
 * Protection injection : les guillemets doubles dans le nom sont doubles-echappes
 * (standard SQL) et le resultat est toujours entre guillemets.
 */
private _escapeIdentifier(name: string): string {
  const clean = name.trim();
  if (!clean) throw new Error('Empty SQL identifier');
  // Double-escape les guillemets doubles existants, puis wrap
  return `"${clean.replace(/"/g, '""')}"`;
}

private _toNumberOrString(value: string): string | number {
  const num = Number(value);
  return !isNaN(num) && value.trim() !== '' ? num : value;
}
```

### 2.8 Recherche LIKE via searchTemplate

**Fichier** : `src/adapters/grist-adapter.ts`

**ATTENTION** : `dsfr-data-search` ne remplace que le placeholder `{q}` dans le template.
Il ne gere PAS `{searchField}`. Le template doit etre un WHERE complet avec `{q}` seulement.

Pour Grist, la recherche full-text n'existe pas nativement. Deux approches :

**Approche A (recommandee)** : L'utilisateur specifie le champ via l'attribut `search-template`

```html
<!-- L'utilisateur specifie le champ de recherche dans le HTML -->
<dsfr-data-search source="data" search-template="nom:contains:{q}"></dsfr-data-search>
```

L'adapter retourne `null` (pas de template par defaut) car Grist n'a pas de
recherche multi-champs :

```typescript
getDefaultSearchTemplate(): string | null {
  // Grist n'a pas de full-text search natif.
  // L'utilisateur doit specifier le champ via search-template="field:contains:{q}"
  // Le 'contains' sera traduit en SQL LIKE par _colonWhereToSql() en mode SQL.
  return null;
}
```

**Approche B (optionnelle, future)** : Recherche multi-champs via SQL OR

Si on veut un searchTemplate par defaut, il faudrait etendre `dsfr-data-search` pour
supporter un nouveau placeholder ou creer un mecanisme dans l'adapter qui traduit
`nom:contains:{q}` en `(col1 LIKE ? OR col2 LIKE ?)` pour toutes les colonnes Text.
Cela necessite `fetchColumns()` (etape 3) pour connaitre les colonnes de type Text.
**Hors scope de cet epic — a traiter en follow-up.**

### 2.9 Facettes server-side via SQL DISTINCT

**Fichier** : `src/adapters/grist-adapter.ts`

Pour supporter `dsfr-data-facets` en mode server, l'adapter doit implementer la methode
optionnelle `fetchFacets()` deja definie dans l'interface `ApiAdapter` :

```typescript
// Signature existante dans api-adapter.ts (ne pas modifier) :
// fetchFacets?(
//   params: Pick<AdapterParams, 'baseUrl' | 'datasetId' | 'headers'>,
//   fields: string[],
//   where: string,
//   signal?: AbortSignal
// ): Promise<FacetResult[]>;
//
// FacetResult = { field: string; values: Array<{ value: string; count: number }> }

async fetchFacets(
  params: Pick<AdapterParams, 'baseUrl' | 'datasetId' | 'headers'>,
  fields: string[],
  where: string,
  signal?: AbortSignal
): Promise<FacetResult[]> {
  const results: FacetResult[] = [];

  for (const field of fields) {
    const table = this._getTableId(params as AdapterParams);
    const col = this._escapeIdentifier(field);
    const args: (string | number)[] = [];

    let sql = `SELECT ${col}, COUNT(*) as cnt FROM ${this._escapeIdentifier(table)}`;
    if (where) {
      sql += ` WHERE ${this._colonWhereToSql(where, args)}`;
    }
    sql += ` GROUP BY ${col} ORDER BY cnt DESC LIMIT 200`;

    const sqlUrl = this._getSqlEndpointUrl(params as AdapterParams);
    try {
      const response = await fetch(sqlUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(params.headers || {}) },
        body: JSON.stringify({ sql, args, timeout: 500 }),
        signal,
      });

      if (!response.ok) continue; // Skip ce champ en cas d'erreur

      const json = await response.json();
      const rows = json.records || [];
      results.push({
        field,
        values: rows.map((row: unknown[]) => ({
          value: String(row[0] ?? ''),
          count: Number(row[1]) || 0,
        })).filter((v: { value: string }) => v.value !== ''),
      });
    } catch {
      // Fallback silencieux par champ
      continue;
    }
  }

  return results;
}
```

**Note** : Cette methode retourne `FacetResult[]` (valeur + count), pas juste les
valeurs distinctes. Le `GROUP BY` + `COUNT(*)` est plus utile que `SELECT DISTINCT`
car il permet a `dsfr-data-facets` d'afficher les comptages par valeur.

### 2.10 Orchestration fetchAll / fetchPage avec mode SQL

**Fichier** : `src/adapters/grist-adapter.ts`

```typescript
async fetchAll(params: AdapterParams, signal: AbortSignal): Promise<FetchResult> {
  if (this._needsSqlMode(params)) {
    return this._fetchSql(params, undefined, signal);
  }

  // Mode Records (existant, enrichi en etape 1)
  const url = this.buildUrl(params);
  const response = await fetch(url, buildFetchOptions(params, signal));
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);

  const json = await response.json();
  const data = this._flattenRecords(json.records || []);

  return {
    data,
    totalCount: data.length,
    needsClientProcessing: !params.where && !params.orderBy, // server-side si filter/sort
  };
}

async fetchPage(params: AdapterParams, overlay: ServerSideOverlay, signal: AbortSignal): Promise<FetchResult> {
  if (this._needsSqlMode(params, overlay)) {
    return this._fetchSql(params, overlay, signal);
  }

  // Mode Records pagine (etape 1)
  const url = this.buildServerSideUrl(params, overlay);
  const response = await fetch(url, buildFetchOptions(params, signal));
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);

  const json = await response.json();
  const data = this._flattenRecords(json.records || []);
  const pageSize = params.pageSize || data.length;
  const isLastPage = data.length < pageSize;

  return {
    data,
    // FetchResult n'a PAS de hasMore — utiliser totalCount (-1 = inconnu)
    totalCount: isLastPage ? ((overlay.page || 1) - 1) * pageSize + data.length : -1,
    needsClientProcessing: false,
  };
}
```

### 2.11 Mettre a jour les capabilities et le provider config

**Fichier** : `src/adapters/grist-adapter.ts`

```typescript
readonly capabilities: AdapterCapabilities = {
  serverFetch: true,
  serverFacets: true,      // CHANGE : via SQL GROUP BY + COUNT
  serverSearch: false,      // Reste false : pas de full-text natif Grist
                            // L'utilisateur specifie search-template="field:contains:{q}" en HTML
  serverGroupBy: true,      // CHANGE : via SQL GROUP BY
  serverOrderBy: true,      // Deja true depuis etape 1
  whereFormat: 'colon',
};
```

**Fichier** : `packages/shared/src/providers/grist.ts`

```typescript
capabilities: {
  serverFetch: true,
  serverFacets: true,          // CHANGE : via SQL GROUP BY + COUNT
  serverSearch: false,          // Reste false (pas de full-text natif)
  serverGroupBy: true,          // CHANGE : via SQL GROUP BY
  serverOrderBy: true,          // Deja true depuis etape 1
  serverAggregation: true,      // CHANGE
},

query: {
  whereFormat: 'colon',
  whereSeparator: ', ',
  aggregationSyntax: 'sql',    // CHANGE : 'client-only' → 'sql'
                               // NOTE : necessite d'ajouter 'sql' au type union dans provider-config.ts
                               //   aggregationSyntax: 'odsql-select' | 'colon-attr' | 'client-only' | 'sql';
  searchTemplate: null,        // Grist n'a pas de full-text search natif
                               // L'utilisateur specifie le champ : search-template="nom:contains:{q}"
},

facets: {
  defaultMode: 'server',       // CHANGE : 'client' → 'server'
},
```

### 2.12 Fallback gracieux si endpoint SQL indisponible

Certaines instances Grist peuvent ne pas exposer le endpoint SQL (anciennes
versions, restrictions admin). L'adapter doit fallback proprement :

```typescript
// Cache de detection SQL par hostname (l'adapter est un singleton dans le registre,
// mais chaque instance Grist peut avoir des capacites differentes)
private _sqlAvailableByHost = new Map<string, boolean>();

private async _checkSqlAvailability(params: AdapterParams): Promise<boolean> {
  const hostname = this._extractHostname(params.baseUrl);
  const cached = this._sqlAvailableByHost.get(hostname);
  if (cached !== undefined) return cached;

  try {
    const sqlUrl = this._getSqlEndpointUrl(params);
    const response = await fetch(sqlUrl + '?q=SELECT%201', {
      method: 'GET',
      headers: params.headers || {},
      signal: AbortSignal.timeout(2000),
    });
    this._sqlAvailableByHost.set(hostname, response.ok);
    if (!response.ok) {
      console.info(`[dsfr-data] Grist SQL endpoint not available on ${hostname} — using client-side processing`);
    }
    return response.ok;
  } catch {
    this._sqlAvailableByHost.set(hostname, false);
    console.info(`[dsfr-data] Grist SQL endpoint not available on ${hostname} — using client-side processing`);
    return false;
  }
}

private _extractHostname(url: string): string {
  try { return new URL(url).hostname; } catch { return url; }
}
```

Quand SQL n'est pas disponible, l'adapter retombe en mode Records + client-side
(comportement actuel). Les capabilities sont ajustees dynamiquement.

### 2.13 Tests

**Fichier** : `tests/adapters/grist-sql.test.ts` (nouveau)

```typescript
describe('GristAdapter - Etape 2 : Mode SQL', () => {

  describe('_needsSqlMode', () => {
    test('groupBy active SQL', () => {});
    test('aggregate active SQL', () => {});
    test('contains dans where active SQL', () => {});
    test('eq/in seuls restent en mode Records', () => {});
  });

  describe('_buildSqlQuery', () => {
    test('SELECT * sans group-by', () => {});
    test('GROUP BY + COUNT', () => {
      // groupBy='region' → SELECT region, COUNT(*) as count FROM T GROUP BY region
    });
    test('GROUP BY + aggregate sum', () => {
      // groupBy='region', aggregate='population:sum:total'
      // → SELECT region, SUM(population) as total FROM T GROUP BY region
    });
    test('GROUP BY + aggregate multiple', () => {
      // aggregate='pop:sum:total, pop:avg:moyenne'
    });
    test('WHERE eq parametre', () => {
      // where='region:eq:Bretagne'
      // → WHERE region = ?  args=['Bretagne']
    });
    test('WHERE contains → LIKE', () => {
      // where='nom:contains:Paris'
      // → WHERE nom LIKE ?  args=['%Paris%']
    });
    test('WHERE in → IN', () => {
      // where='region:in:IDF|OCC'
      // → WHERE region IN (?,?)  args=['IDF','OCC']
    });
    test('ORDER BY + LIMIT + OFFSET', () => {});
  });

  describe('_escapeIdentifier', () => {
    test('identifiant simple', () => {
      // 'region' → '"region"'
    });
    test('identifiant avec espaces', () => {
      // 'Ma Colonne' → '"Ma Colonne"'
    });
    test('identifiant avec accents', () => {
      // 'Departement' → '"Departement"'
    });
    test('identifiant avec guillemets doubles echappe', () => {
      // 'col"name' → '"col""name"'
    });
    test('identifiant vide rejete', () => {
      // '' → throw Error
    });
  });

  describe('_sqlResultToObjects', () => {
    test('conversion colonnes + lignes en objets', () => {
      // { columns: ['a','b'], records: [[1,2],[3,4]] }
      // → [{ a: 1, b: 2 }, { a: 3, b: 4 }]
    });
  });

  describe('_getSqlEndpointUrl', () => {
    test('derive /sql depuis /tables/.../records', () => {
      // 'https://proxy/api/docs/abc/tables/T1/records'
      // → 'https://proxy/api/docs/abc/sql'
    });
  });

  describe('fetchFacets', () => {
    test('retourne valeurs distinctes', () => {});
    test('avec filtre WHERE', () => {});
    test('fallback vide si SQL indisponible', () => {});
  });

  describe('fallback SQL indisponible', () => {
    test('_fetchSql fallback en fetchAll si 404', () => {});
    test('_fetchSql fallback en fetchAll si 403', () => {});
    test('capabilities ajustees dynamiquement', () => {});
  });
});
```

### 2.14 Critere de validation etape 2

- [ ] `_needsSqlMode()` detecte correctement les cas SQL vs Records
- [ ] Les requetes SQL sont toujours parametrees (zero injection possible)
- [ ] `_escapeIdentifier()` rejette tout identifiant suspect
- [ ] Fallback gracieux si endpoint SQL indisponible (retour client-side)
- [ ] Facettes server-side via SQL DISTINCT fonctionnelles
- [ ] Recherche LIKE via SQL fonctionnelle
- [ ] Group-by + aggregation via SQL fonctionnels
- [ ] Provider config declare toutes les capabilities a `true`
- [ ] `npm run test:run` passe
- [ ] `npm run build` passe

---

## ETAPE 3 : Introspection colonnes + enrichissements

> Exploiter les endpoints metadata pour ameliorer l'experience builder/sources.

### 3.1 Endpoint Columns : schema des colonnes

**Fichier** : `src/adapters/grist-adapter.ts`

```typescript
/**
 * Recupere les metadonnees des colonnes d'une table Grist.
 * Utile pour le builder (auto-detection des champs) et pour
 * generer automatiquement les facettes.
 *
 * GET /api/docs/{docId}/tables/{tableId}/columns
 */
async fetchColumns(
  params: AdapterParams,
  signal?: AbortSignal
): Promise<GristColumn[]> {
  const url = params.baseUrl.replace(/\/records.*$/, '/columns');
  const response = await fetch(url, buildFetchOptions(params, signal));
  if (!response.ok) return [];

  const json = await response.json();
  return (json.columns || []).map((col: any) => ({
    id: col.id,
    label: col.fields?.label || col.id,
    type: col.fields?.type || 'Any',
    isFormula: col.fields?.isFormula || false,
    formula: col.fields?.formula || '',
  }));
}

interface GristColumn {
  id: string;
  label: string;
  type: string;       // 'Text', 'Numeric', 'Int', 'Date', 'DateTime', 'Choice', 'ChoiceList', ...
  isFormula: boolean;
  formula: string;
}
```

### 3.2 Endpoint Tables : liste des tables

**Fichier** : `src/adapters/grist-adapter.ts`

```typescript
/**
 * Liste les tables d'un document Grist.
 * Utile pour l'app Sources (selection de table dans l'UI).
 *
 * GET /api/docs/{docId}/tables
 */
async fetchTables(
  params: AdapterParams,
  signal?: AbortSignal
): Promise<GristTable[]> {
  const url = params.baseUrl.replace(/\/tables\/[^/]+\/records.*$/, '/tables');
  const response = await fetch(url, buildFetchOptions(params, signal));
  if (!response.ok) return [];

  const json = await response.json();
  return (json.tables || []).map((t: any) => ({
    id: t.id,
    // Grist tables have an 'id' field which is the tableId
  }));
}

interface GristTable {
  id: string;
}
```

### 3.3 Ajout de `hidden` parameter

**Fichier** : `src/adapters/grist-adapter.ts`

Le parametre `?hidden=true` sur l'endpoint Records et Columns inclut les colonnes
cachees. Par defaut, on ne les inclut pas (comportement actuel).

```typescript
// Dans buildUrl(), optionnellement :
if (params.includeHidden) {
  url.searchParams.set('hidden', 'true');
}
```

### 3.4 Tests

```typescript
describe('GristAdapter - Etape 3 : Introspection', () => {
  describe('fetchColumns', () => {
    test('retourne les colonnes avec type et label', () => {});
    test('fallback tableau vide si erreur', () => {});
  });

  describe('fetchTables', () => {
    test('retourne la liste des tables', () => {});
    test('fallback tableau vide si erreur', () => {});
  });
});
```

### 3.5 Critere de validation etape 3

- [ ] `fetchColumns()` retourne les metadonnees des colonnes
- [ ] `fetchTables()` retourne la liste des tables
- [ ] `npm run test:run` passe
- [ ] `npm run build` passe

---

## ETAPE 4 : Configuration proxy et documentation

### 4.1 Mettre a jour le proxy Vite

**Fichier** : `vite.config.ts`

Le proxy doit supporter le endpoint SQL en plus de /records :

```typescript
// Le proxy actuel route /grist-gouv-proxy/* vers grist.numerique.gouv.fr/*
// Le endpoint SQL est sous /api/docs/{docId}/sql, qui est deja dans le meme chemin.
// → Aucun changement necessaire si le proxy est configure en wildcard /grist-gouv-proxy/**
```

Verifier que le proxy nginx en production (`chartsbuilder.matge.com`) route aussi
`/grist-gouv-proxy/api/docs/*/sql` et `/grist-gouv-proxy/api/docs/*/tables/*/columns`.

### 4.2 Mettre a jour la config provider pour le proxy

**Fichier** : `packages/shared/src/providers/grist.ts`

Le `apiPathTemplate` actuel ne couvre que `/records`. Ajouter les templates pour
les autres endpoints :

```typescript
resource: {
  idFields: ['documentId', 'tableId'],
  apiPathTemplate: '/api/docs/{documentId}/tables/{tableId}/records',
  sqlPathTemplate: '/api/docs/{documentId}/sql',          // NOUVEAU
  columnsPathTemplate: '/api/docs/{documentId}/tables/{tableId}/columns', // NOUVEAU
  tablesPathTemplate: '/api/docs/{documentId}/tables',    // NOUVEAU
  extractIds: (url: string) => {
    const m = url.match(GRIST_RE);
    return m ? { documentId: m[1], tableId: m[2] } : null;
  },
},
```

### 4.3 Mettre a jour CLAUDE.md

Ajouter dans la section "Architecture des composants data" :

```markdown
### Grist : mode Records vs SQL

L'adapter Grist choisit automatiquement entre deux modes :
- **Mode Records** (GET /records) : pour fetch simple, filter equality/IN, sort, pagination
- **Mode SQL** (POST /sql) : pour group-by, aggregation, LIKE search, facettes DISTINCT

Le mode SQL est un fallback automatique — il est active seulement quand les
capacites de l'endpoint Records sont insuffisantes. Si le endpoint SQL n'est pas
disponible sur l'instance Grist, l'adapter revient au mode Records + client-side.
```

### 4.4 Mettre a jour le skill apiProviders

**Fichier** : `apps/builder-ia/src/skills.ts`

Mettre a jour le tableau de capacites du skill `apiProviders` :

```
| Grist | grist | Auto (offset, max illimite) | Serveur (SQL) | Serveur (SQL DISTINCT) | Serveur (SQL LIKE) | Serveur |
```

### 4.5 Mettre a jour le guide

Ajouter un exemple Grist avec pagination server-side dans le guide :

```html
<!-- Grist avec pagination server-side -->
<dsfr-data-source id="src" api-type="grist"
  base-url="https://proxy/grist-gouv-proxy/api/docs/DOC/tables/TABLE/records"
  server-side page-size="20">
</dsfr-data-source>
<dsfr-data-list source="src" colonnes="nom,prenom,ville" pagination="20">
</dsfr-data-list>
```

---

## Tableau recapitulatif des modifications

### grist-adapter.ts (modifications par etape)

| Methode | Etape 1 | Etape 2 | Etape 3 |
|---|---|---|---|
| `capabilities` | serverOrderBy: true | +serverFacets, serverSearch, serverGroupBy | — |
| `buildUrl()` | +filter, sort, limit params | — | — |
| `buildServerSideUrl()` | +offset pagination | — | — |
| `fetchAll()` | — | Delegation SQL si needed | — |
| `fetchPage()` | Pagination offset | Delegation SQL si needed | — |
| `_colonWhereToGristFilter()` | **Nouveau** | — | — |
| `_orderByToGristSort()` | **Nouveau** | — | — |
| `_flattenRecords()` | Extraction methode | — | — |
| `_needsSqlMode()` | — | **Nouveau** | — |
| `_fetchSql()` | — | **Nouveau** | — |
| `_buildSqlQuery()` | — | **Nouveau** | — |
| `_colonWhereToSql()` | — | **Nouveau** | — |
| `_sqlResultToObjects()` | — | **Nouveau** | — |
| `_getSqlEndpointUrl()` | — | **Nouveau** | — |
| `_getTableId()` | — | **Nouveau** | — |
| `_escapeIdentifier()` | — | **Nouveau** | — |
| `_checkSqlAvailability()` | — | **Nouveau** (fallback) | — |
| `fetchFacets()` | — | **Nouveau** (SQL GROUP BY + COUNT) | — |
| `getDefaultSearchTemplate()` | — | Reste null (pas de full-text natif) | — |
| `fetchColumns()` | — | — | **Nouveau** |
| `fetchTables()` | — | — | **Nouveau** |
| `buildFacetWhere()` | Inchange | Inchange | Inchange |

### grist.ts provider config (modifications par etape)

| Propriete | Avant | Etape 1 | Etape 2 |
|---|---|---|---|
| `pagination.type` | `'none'` | `'offset'` | — |
| `pagination.pageSize` | `0` | `100` | — |
| `pagination.params` | `{}` | `{ offset, limit }` | — |
| `capabilities.serverOrderBy` | `false` | `true` | — |
| `capabilities.serverFacets` | `false` | — | `true` |
| `capabilities.serverSearch` | `false` | — | `false` (inchange, pas de full-text natif) |
| `capabilities.serverGroupBy` | `false` | — | `true` |
| `capabilities.serverAggregation` | `false` | — | `true` |
| `query.aggregationSyntax` | `'client-only'` | — | `'sql'` (ajouter au type union) |
| `query.searchTemplate` | `null` | — | `null` (reste null, l'utilisateur specifie via HTML) |
| `facets.defaultMode` | `'client'` | — | `'server'` |

---

## Risques et mitigations

| Risque | Impact | Mitigation |
|---|---|---|
| Timeout SQL 1000ms | Requetes GROUP BY sur grosses tables peuvent timeout | Timeout adapter a 800ms, limit 200 pour facettes, fallback client-side |
| Endpoint SQL indisponible | Anciennes versions Grist | Detection auto + fallback gracieux mode Records + client-side |
| Injection SQL via noms de colonnes | Securite | `_escapeIdentifier()` strict + requetes parametrees pour les valeurs |
| Noms de colonnes Grist avec caracteres speciaux | Grist autorise des noms comme "Ma Colonne" | `_escapeIdentifier()` rejettera ces noms — a surveiller, potentiellement utiliser des guillemets doubles SQL |
| Proxy ne route pas /sql | 404 en production | Verifier config nginx, le endpoint SQL est sous le meme prefixe /api/docs/ |
| `totalCount` absent en mode Records | Pagination sans total affiche | Heuristique hasMore + option COUNT SQL |

## Ordre d'execution recommande

```
Etape 1 (Records enrichi)     ← quick win, risque faible
    │
    ▼
Etape 2 (Mode SQL)            ← game-changer, risque moyen
    │
    ├──► Etape 3 (Introspection)    ← bonus, risque faible
    │
    └──► Etape 4 (Proxy + docs)     ← necessaire pour production
```

Les etapes 3 et 4 peuvent etre faites en parallele apres l'etape 2.

## Estimation de taille

| Etape | Lignes ajoutees (adapter) | Lignes modifiees (provider) | Tests |
|---|---|---|---|
| 1 | ~80 | ~10 | ~25 |
| 2 | ~200 | ~10 | ~40 |
| 3 | ~40 | ~5 | ~10 |
| 4 | ~0 (doc/config seulement) | ~5 | ~0 |
| **Total** | **~320** | **~30** | **~75** |

Le grist-adapter passera de ~120 lignes a ~440 lignes. Le provider config de ~69 a ~100 lignes.
En comparaison, l'ODS adapter fait ~280 lignes et le Tabular adapter ~350 lignes.

## Modification requise dans provider-config.ts

**Fichier** : `packages/shared/src/providers/provider-config.ts` (ligne 85)

Le type union `aggregationSyntax` doit etre etendu pour accepter `'sql'` :

```typescript
// Avant :
aggregationSyntax: 'odsql-select' | 'colon-attr' | 'client-only';

// Apres :
aggregationSyntax: 'odsql-select' | 'colon-attr' | 'client-only' | 'sql';
```

**Impact** : Le test `tests/shared/providers.test.ts` ligne 380 valide les valeurs
possibles. Il devra accepter `'sql'` :

```typescript
// Avant :
expect(['odsql-select', 'colon-attr', 'client-only']).toContain(config.query.aggregationSyntax);
// Apres :
expect(['odsql-select', 'colon-attr', 'client-only', 'sql']).toContain(config.query.aggregationSyntax);
```

---

## Tests existants a mettre a jour

Ces tests font des assertions sur les valeurs actuelles Grist et devront etre
mis a jour quand les capabilities changent :

| Fichier | Lignes | Assertions a changer |
|---|---|---|
| `tests/adapters/api-adapter.test.ts` | 74-82 | `serverOrderBy: false` → `true` (etape 1), `serverFacets/GroupBy: false` → `true` (etape 2), `serverSearch` reste `false` |
| `tests/adapters/api-adapter.test.ts` | 127-136 | `buildUrl returns base-url as-is` → doit tester les query params |
| `tests/adapters/api-adapter.test.ts` | 132-136 | `buildServerSideUrl returns same as buildUrl` → doit tester pagination |
| `tests/adapters/api-adapter.test.ts` | 148-150 | `Grist returns null` pour searchTemplate → reste null (ok) |
| `tests/shared/providers.test.ts` | 160-162 | `defaultMode: 'client'` → `'server'` (etape 2) |
| `tests/shared/providers.test.ts` | 380 | `aggregationSyntax` values → ajouter `'sql'` |
| `tests/adapters/facet-where.test.ts` | 84-88 | Inchange (buildFacetWhere colon syntax ne change pas) |
| `tests/components/dsfr-data-source-adapter.test.ts` | 127-145 | Inchange (params building ne change pas) |

### Tests E2E a surveiller (pas de modification, validation retrocompat)

| Fichier | Description |
|---|---|
| `tests/builder-e2e/builder-exhaustive.spec.ts` | ~33 tests Grist (11 chart types x 3 modes) — doivent passer tel quel |
| `e2e/grist-widgets.spec.ts` | Tests Grist widgets app — doivent passer tel quel |

---

## Verification finale

En fin d'epic, verifier que :
- [ ] `dsfr-data-source api-type="grist" server-side page-size="20"` pagine correctement
- [ ] `dsfr-data-facets source="..." server-facets` affiche les valeurs distinctes via SQL
- [ ] `dsfr-data-search source="..."` recherche via SQL LIKE
- [ ] `dsfr-data-query source="..." group-by="region" aggregate="pop:sum:total"` aggrege via SQL
- [ ] Le fallback client-side fonctionne si le endpoint SQL est indisponible
- [ ] Aucune injection SQL possible (tests de securite)
- [ ] Le proxy (Vite dev + nginx prod) route les endpoints /sql et /columns
- [ ] Tous les tests existants passent (retrocompatibilite)
- [ ] `npm run test:run` passe
- [ ] `npm run build` passe
- [ ] CLAUDE.md et skills mis a jour
