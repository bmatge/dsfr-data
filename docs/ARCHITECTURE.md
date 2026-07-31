# Architecture -- dsfr-data

> Carte de navigation du repo ([ADR-053] du vault) : index des couplages **non-évidents** + le *pourquoi*.
> Le `CLAUDE.md` à la racine ne garde que l'opérationnel (commandes, conventions, do/don't) et pointe ici.
> Sections clés : §0 Pipeline de composants, §4 Proxy (3 dimensions), §8 Beacon, §11 Pièges de build,
> **§12 Couplages non-évidents ⚠️** (le cœur — à lire avant toute modif transverse).
>
> [ADR-053]: ~/Documents/Obsidian/30-Knowledge/ADR/ADR-053-carte-architecture-repo-et-feature-vault.md

## 0. Pipeline de composants data

> Architecture détaillée déplacée depuis `CLAUDE.md`. Code source : `packages/core/src/components/`.

### Pipeline recommandé

```
dsfr-data-source  ──[fetch via adapter]──[paginate]──[cache]──► donnees brutes
     │                                                         │
     │ adapters (ODS, Tabular, Grist, INSEE, Generic)          ▼
     │                                               dsfr-data-unpivot (optionnel, sources "wide")
     │                                                         │
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
     ▼
  dsfr-data-chart / dsfr-data-list / dsfr-data-kpi / dsfr-data-kpi-group /
  dsfr-data-display / dsfr-data-podium
         │
         └──► dsfr-data-a11y (companion accessibilite : tableau, CSV, description)

  Tier d'orchestration OPT-IN (#224, ADR-031) — dashboard a filtre commun :

  UI natives (select, input...) ──► dsfr-data-context ──┬──► commandes where (whereKey stable/filtre)
       │                                │                ├──► dsfr-data-source (A)
       └── dsfr-data-context-filter ────┘                ├──► dsfr-data-source (B)
           (eq, in, lt, gte, between,                    └──► dsfr-data-source (C)
            month-of, year-of, lt-day-after,
            last-n-days, current-year)
  dsfr-data-context-tags (recap supprimable des filtres actifs)

  Pipeline multi-sources (jointure) :

  dsfr-data-source (A) ──┐
                         ├──► dsfr-data-join ──► dsfr-data-query ──► dsfr-data-chart
  dsfr-data-source (B) ──┘

  Pipeline carte interactive (multi-couches, multi-sources) :

  dsfr-data-source (A) ──► dsfr-data-map-layer (type="geoshape") ──┐
  dsfr-data-source (B) ──► dsfr-data-map-layer (type="marker")  ──┼──► dsfr-data-map
  dsfr-data-source (C) ──► dsfr-data-map-layer (type="heatmap") ──┘     │
                                                                         ├──► dsfr-data-map-popup (affichage au clic :
                                                                         │      popup / modale / panneau lateral)
                                                                         ├──► dsfr-data-map-inset (encarts DROM/Corse,
                                                                         │      clonage des couches de l'hote)
                                                                         ├──► dsfr-data-map-timeline (lecture temporelle
                                                                         │      des couches [time-field])
                                                                         └──► dsfr-data-a11y
```

### Règles

- **dsfr-data-source** est le seul composant qui fait du fetch HTTP. Il supporte `api-type` pour ODS, Tabular, Grist, INSEE Melodi et Generic.
- **dsfr-data-query** est un pur transformateur (filter, group-by, aggregate, sort). Jamais de requete HTTP.
- **dsfr-data-join** est un pur transformateur multi-sources : il joint deux sources sur une cle pivot (inner, left, right, full). Aucun fetch HTTP.
- **dsfr-data-unpivot** est un pur transformateur. Il bascule un tableau "wide" (temps dans les noms de colonnes, ex. `c2023_01`) en "long/tidy" (une observation par ligne) via `id-cols` + `value-cols`/`value-cols-pattern` + `var-name`/`var-format`/`value-name`. Inverse exact d'un pivot, aucun fetch HTTP. La valeur reste brute (typage delegue a `numeric-auto`).
- **dsfr-data-normalize** sait fabriquer des colonnes calculees via `compute` (ligne a ligne, en dernier) : arithmetique `+ - * /`, concatenation texte (`+` avec litteraux quotes), parentheses. Ex. `compute="pct = valeur * 100; groupe = Indicateurs + ' / ' + Sous_theme"`. Evaluateur sur (pas d'`eval`). Hors perimetre : conditions, fonctions, calculs sur valeurs agregees.
- **dsfr-data-chart** gere le multi-series de deux facons : format LARGE (`value-fields` / `value-field-2`, une colonne par serie) ou format LONG/tidy (`series-field`, une colonne-cle dont les valeurs distinctes deviennent les series). `series-field` est le consommateur naturel de `dsfr-data-unpivot`. Les deux alimentent `y`/`name` multi-series de `@gouvfr/dsfr-chart`.
- Les commandes (page, where, orderBy) remontent vers dsfr-data-source via `dsfr-data-source-command`.
- dsfr-data-facets et dsfr-data-search delegent la construction des WHERE clauses aux adapters.
- **Deux mixins de cycle de vie** (#280/#281) : les 6 transformateurs (query, join, unpivot, normalize, facets, search) etendent `TransformerMixin` (`packages/core/src/utils/transformer-mixin.ts`) — abonnement amont, etats `isLoading()`/`getError()`, re-emission aval avec meta posee AVANT le dispatch, relais de commandes, validation de config via hooks (`transformerSources`, `beforeTransformerSubscribe`, `onTransformerData`, `transformMeta`, `transformerReinitProps`/`transformerReprocessProps`). Les composants d'affichage utilisent `SourceSubscriberMixin`. **Jamais de `subscribeToSource` manuel dans un composant** (test-garde statique). Init UNIQUE au montage : connectedCallback initialise, le premier `willUpdate` est consomme sans re-init.
- Le where de dsfr-data-query est **colon-only** (l'ODSQL reste reserve au where de dsfr-data-source) ; en delegation serveur il est traduit au dialecte de l'adapter (#275). `transform`/`server-side`/`page-size`/`refresh` n'existent plus sur query (#277/#279) — le relais de commandes est toujours actif, le reste se configure sur la source.
- Les erreurs de configuration passent par `reportConfigError` (console.error + attribut `data-dsfr-config-error`) sur TOUS les composants, source comprise (#283). Les composants d'affichage rendent erreur/loading via les templates partages `utils/status-templates.ts` (#284).
- **dsfr-data-context** (opt-in, #224/ADR-031) orchestre des filtres transverses multi-sources : il ecoute des UI natives via ses enfants `dsfr-data-context-filter` et diffuse des commandes `where` a N sources nommees (un `whereKey` stable par filtre -> AND par le merge multi-emetteurs ; jamais « le dernier gagne »). Clause construite en colon puis traduite au `whereFormat` de chaque adapter. `url-sync` (defaut OFF) serialise les filtres dans l'URL (l'intention, pas les dates resolues). Sans contexte, chaque source reste autonome.
- **dsfr-data-map** est le conteneur carte Leaflet. Il ne consomme pas de donnees ; ce sont les **dsfr-data-map-layer** enfants qui utilisent `SourceSubscriberMixin`.
- **dsfr-data-map-layer** projete les donnees sur la carte (marker, geoshape, circle, heatmap). Chaque layer a sa propre source → multi-source naturel.
- Le viewport-driven fetch (`bbox`) envoie des commandes `dsfr-data-source-command` avec `whereKey: "map-bbox"` pour le merge avec les autres filtres.
- **dsfr-data-map-popup** (popup/modale/panneau lateral au clic, template `{{champ}}` toujours echappe), **dsfr-data-map-inset** (encarts territoriaux DROM/Corse — clone les couches directes de la carte hote, ADR-094) et **dsfr-data-map-timeline** (controles de lecture des couches `time-field`) completent la famille carto — tous enfants de `dsfr-data-map`, bundle `map`.
- **dsfr-data-world-map** est **deprecie** (epic #402, warn au connect) au profit de `<dsfr-data-chart type="map-monde">` (API cartes unifiee DSFR Chart 2.1.x : `level="dep|reg|aca|monde"`, comme `map-reg`/`map-aca`). Retrait prevu au prochain major.

### Pattern HTML

```html
<!-- Source (fetch) → Query (transform) → Chart (display) -->
<dsfr-data-source id="src" api-type="opendatasoft"
  dataset-id="mon-dataset" base-url="https://data.economie.gouv.fr">
</dsfr-data-source>
<dsfr-data-query id="data" source="src"
  group-by="region" aggregate="population:sum:total" order-by="total:desc">
</dsfr-data-query>
<dsfr-data-chart id="mon-graph" source="data" type="bar"
  label-field="region" value-field="total">
</dsfr-data-chart>
<dsfr-data-a11y for="mon-graph" source="data" table download></dsfr-data-a11y>
```

Pour les cas sans transformation (datalist, display), `dsfr-data-query` peut etre omis (source → list directement).

### Adapters et ProviderConfig

- **Adapters** (`packages/core/src/adapters/`) : construisent les URLs, parsent les reponses, gerent la pagination. Un adapter par API (ODS, Tabular, Grist, INSEE, Generic).
- **ProviderConfig** (`packages/shared/src/providers/`) : configuration declarative par provider (pagination, response parsing, query syntax, code generation).
- **Registre** (`packages/core/src/adapters/adapter-registry.ts`) : `getAdapter(apiType)` retourne l'adapter pour un type donne.
- Ajouter un nouveau provider (CKAN...) = 1 ProviderConfig + 1 Adapter, zero modification dans les composants.

#### Capacités des adapters

| Capacite | OpenDataSoft | Tabular | Grist | INSEE (Melodi) | Generic |
|----------|:---:|:---:|:---:|:---:|:---:|
| serverFetch | oui | oui | oui | oui | non |
| serverFacets | oui | non | oui | non | non |
| serverSearch | oui | non | non | non | non |
| serverGroupBy | oui | oui | oui | non | non |
| serverOrderBy | oui | oui | oui | non | non |
| serverGeo | oui | non | non | non | non |
| whereFormat | odsql | colon | colon | colon | colon |
| plafond fetchAll (#286) | 1 000 (10×100), relevable via `max-records` (#233) | 25 000 (500×50) | illimite (1 requete) | 100 000 (100×1000) | n/a |

**Formats WHERE** :
- **ODSQL** (OpenDataSoft) : SQL-like — `population > 5000 AND status = 'active'`, clauses jointes par ` AND `.
- **Colon** (Tabular, Grist, INSEE, Generic) : `field:operator:value, field2:operator:value2`. Les caracteres structurels (`,` `:` `|`) dans une VALEUR sont percent-encodes (`escapeColonValue`/`unescapeColonValue` dans `packages/core/src/utils/where.ts`, #271) ; tous les parseurs colon decodent apres decoupage.

#### Attributs dsfr-data-source

dsfr-data-source fonctionne en deux modes :

- **Mode URL (fetch direct)** : `url`, `method`, `headers`, `params`, `refresh`, `transform`, `paginate`, `page-size`, `cache-ttl`, `data` (inline JSON).
- **Mode adapter** (api-type != generic ou base-url fourni) : `api-type`, `base-url`, `dataset-id`, `resource`, `where`, `select`, `group-by`, `aggregate`, `order-by`, `server-side`, `page-size`, `limit`, `max-records` (#233 — plafond du fetchAll, 0 = defaut adapter ; a relever en connaissance de cause : requetes en boucle, memoire).

**`cache-ttl` et le hook de cache (#307)** : la lib publiee n'appelle aucune API applicative. `cache-ttl` n'a d'effet que si la page hote enregistre un provider via `window.DSFR_DATA_CACHE_PROVIDER = { get(key), put(key, data, ttl) }` AVANT le chargement des composants (sans provider : no-op, embed anonyme). La cle inclut un hash du fingerprint de la requete (URL/params/where/page) — deux requetes differentes ne partagent jamais une entree. Les apps du repo enregistrent le provider `/api/cache` (mode DB) via `registerServerCacheProvider()` de `@dsfr-data/shared`, appele par `@dsfr-data/app-ui`.

#### Grist : mode Records vs SQL

L'adapter Grist choisit automatiquement entre :
- **Mode Records** (GET /records) : fetch simple, filter equality/IN (`?filter={"col":["v"]}`), sort (`?sort=-col`), pagination (`?limit=N&offset=M`).
- **Mode SQL** (POST /sql) : group-by, aggregation, LIKE search, facettes DISTINCT via SQL parametre.

Le mode SQL est un fallback automatique, active seulement quand les capacites de l'endpoint Records sont insuffisantes (group-by, aggregate, operateurs avances). Si le endpoint SQL est indisponible sur l'instance Grist, l'adapter revient au mode Records + client-side. La disponibilite SQL est cachee par hostname (`Map<string, boolean>`). L'adapter expose aussi `fetchColumns()` et `fetchTables()` pour l'introspection du schema.

### Package shared (@dsfr-data/shared)

**Frontiere lib/app (#319)** : `packages/core/src` ne doit importer que l'entree lib-safe `@dsfr-data/shared/lib` (utils purs, palettes, providers, proxy). Le barrel racine `@dsfr-data/shared` re-exporte en plus les modules app-side (auth/, storage/, ui/, tour/) reserves aux apps — une regle ESLint `no-restricted-imports` l'interdit dans core (plus aucune exception depuis #306/#307 : le chrome applicatif vit dans `packages/app-ui`, le cache serveur passe par le hook `window.DSFR_DATA_CACHE_PROVIDER`). **Tout nouvel export lib-safe doit etre ajoute aux DEUX barrels** (`src/lib.ts` et `src/index.ts`).

Utilitaires partages : `escapeHtml()` · `buildCsv()`/`CSV_BOM` (quoting RFC 4180, BOM UTF-8, neutralisation des formules tableur) · `formatKPIValue()`/`formatDateShort()` · `toNumber()`/`looksLikeNumber()` · `isValidDeptCode()` · `DSFR_COLORS`/`PALETTE_COLORS` · `getProxyConfig()`/`getProxiedUrl()` · `loadFromStorage()`/`saveToStorage()`/`STORAGE_KEYS` · `openModal()`/`closeModal()` · `toastWarning()`/`toastSuccess()` · `appHref()`/`navigateTo()` · `ProviderConfig`/`getProviderConfig()` · `detectProvider()`.

### Skills builder-IA (alignement composants)

Le builder-IA (`apps/builder-ia/`) injecte des blocs de connaissances ("skills") dans le prompt de l'IA selon le contexte. Les skills sont definis dans `apps/builder-ia/src/skills.ts`.

**Règle** : quand on ajoute/modifie un attribut, un type de graphique, un operateur de filtre ou une fonction d'agregation dans un composant `dsfr-data-*`, il faut mettre a jour le skill correspondant dans `skills.ts`. Les tests d'alignement `tests/apps/builder-ia/skills.test.ts` verifient automatiquement (introspection Lit `elementProperties`) que chaque attribut HTML est documente, que tous les types/operateurs/agregations sont couverts, et que chaque composant data a un skill. **Un attribut ajoute sans maj du skill fait echouer le test** (voir §12).

---

## 1. Vue d'ensemble

dsfr-data est un monorepo TypeScript gere par npm workspaces. Il fournit une bibliotheque de Web Components de dataviz conformes au DSFR (Design System de l'Etat) ainsi que onze applications web autonomes pour la creation, la gestion et la visualisation de graphiques.

Le monorepo se decompose en quatre niveaux :

- **Bibliotheque principale** (`packages/core/`) -- Web Components Lit enregistres globalement, publiee sur npm sous le nom `dsfr-data`
- **Package partage** (`packages/shared/`) -- Utilitaires communs a la lib et aux apps (entree lib-safe `@dsfr-data/shared/lib`)
- **Chrome applicatif** (`packages/app-ui/`) -- Composants `app-*` (header, footer, layouts) partages par les apps, hors lib npm
- **Applications** (`apps/*/`) -- Onze apps TypeScript independantes buildees avec Vite

Toutes les dependances internes sont resolues via les workspaces npm declares dans le `package.json` racine :

```json
{
  "workspaces": ["packages/*", "apps/*"]
}
```

---

## 2. Structure du monorepo

```
/
  packages/
    core/                       Bibliotheque `dsfr-data` (publiee sur npm)
      src/
        index.ts                Entree tout-en-un ; index-core.ts / index-map.ts /
                                index-world-map.ts pour les bundles partiels
        components/             Les 24 Web Components dsfr-data-* (source, query, join,
                                unpivot, normalize, context/-filter/-tags, facets, search,
                                chart, kpi, kpi-group, list, display, podium, a11y, beacon,
                                map, map-layer, map-popup, map-inset, map-timeline,
                                world-map [deprecie])
        adapters/               Adapters api-type (generic, opendatasoft, tabular, grist,
                                insee) + adapter-registry
        utils/                  data-bridge, mixins (transformer, source-subscriber),
                                where, aggregations/aggregates, formatters, json-path,
                                geo-value, territories, kpi-lines, beacon, etc.
      dist/                     Build output de la lib (ESM + UMD + skills.json)

    shared/                     @dsfr-data/shared -- utilitaires communs
      src/
        lib.ts                  Barrel lib-safe (seule entree autorisee depuis core, #319)
        index.ts                Barrel complet (ajoute auth/, storage/, ui/, tour/ -- apps)
        api/                    proxy-config (3 dimensions d'URL), proxy
        constants/              Palettes DSFR (PALETTE_COLORS, CHOROPLETH_SCALES)
        providers/              ProviderConfig declaratifs par API
        utils/                  escapeHtml, buildCsv, formatters, number-parser...

    app-ui/                     @dsfr-data/app-ui -- chrome applicatif (#306)
      src/                      app-header, app-footer, app-sidemenu, layouts,
                                auth-modal... (composants app-*, hors lib npm)

  apps/                         Onze applications web (workspaces npm)
    admin/                      @dsfr-data/app-admin -- Administration (mode serveur)
    builder/                    @dsfr-data/app-builder -- Generateur visuel de graphiques
    builder-carto/              @dsfr-data/app-builder-carto -- Generateur de cartes Leaflet
    builder-ia/                 @dsfr-data/app-builder-ia -- Generateur IA (Albert)
    dashboard/                  @dsfr-data/app-dashboard -- Editeur de tableaux de bord
    favorites/                  @dsfr-data/app-favorites -- Gestion des favoris
    grist-widgets/              @dsfr-data/app-grist-widgets -- Widgets embarquables Grist
    monitoring/                 @dsfr-data/app-monitoring -- Suivi des widgets deployes
    pipeline-helper/            @dsfr-data/app-pipeline-helper -- Editeur visuel de pipelines
    playground/                 @dsfr-data/app-playground -- Editeur de code interactif
    sources/                    @dsfr-data/app-sources -- Gestionnaire de sources de donnees

  server/                       Backend Express (API, auth JWT, MariaDB) -- mode serveur
  mcp-server/                   Serveur MCP (hors workspace npm, cf. §10.5)
  tests/                        Tests Vitest (+ tests/builder-e2e Playwright)
  e2e/                          Tests E2E Playwright
  scripts/                      Scripts de build et monitoring
    build-lib.ts                Build des 4 bundles de la lib
    build-app.js                Assemblage de app-dist/ pour Tauri/Docker
    parse-beacon-logs.sh        Parsing des beacon logs nginx -> JSON
    docker-entrypoint.sh        Entrypoint Docker (parse periodique + nginx)
  src-tauri/                    Application desktop Tauri
  specs/                        Specifications des composants (HTML interactif)
  guide/                        Guide utilisateur et exemples
  docker/                       Dockerfiles, nginx.conf, scripts legacy deploy*.sh
  compose.yml + deploy.sh       Deploiement canonique VibeLab (cf. §10.6)
  app-dist/                     Sortie assemblee pour Tauri/Docker
```

Chaque application dans `apps/` est un workspace npm independant avec sa propre configuration Vite et TypeScript. Toutes dependent de `@dsfr-data/shared` pour les utilitaires communs :

```json
{
  "dependencies": {
    "@dsfr-data/shared": "*"
  }
}
```

---

## 3. Flux de donnees

En **mode statique**, les applications communiquent entre elles via le stockage navigateur (`localStorage` et `sessionStorage`) : il n'y a pas de backend partage, les donnees persistent entierement cote client. En **mode serveur** (opt-in, cf. §10), un backend Express + MariaDB persiste sources, connexions, favoris, dashboards et comptes utilisateurs — les flux ci-dessous decrivent le mode statique.

### 3.1 Sources et connexions

```
Sources app
    |
    |-- saveToStorage(STORAGE_KEYS.SOURCES, ...)
    |-- saveToStorage(STORAGE_KEYS.CONNECTIONS, ...)
    v
localStorage
    |
    |-- loadFromStorage(STORAGE_KEYS.SOURCES, ...)
    v
Builder / Builder-IA
```

L'application Sources permet de configurer et tester des connexions a des APIs externes (Grist, ODS, tabular-api). Les sources configurees sont stockees dans `localStorage` sous les cles `dsfr-data-sources` et `dsfr-data-connections`, puis consommees par les builders.

### 3.2 Generation de code

```
Builder / Builder-IA
    |
    |-- sessionStorage (code genere)
    v
Playground
```

Lorsqu'un utilisateur exporte du code depuis un builder, celui-ci est place dans `sessionStorage` puis lu par le Playground pour edition et execution.

### 3.3 Favoris

```
Builder / Builder-IA
    |
    |-- saveToStorage(STORAGE_KEYS.FAVORITES, ...)
    v
localStorage
    |
    |-- loadFromStorage(STORAGE_KEYS.FAVORITES, ...)
    v
Favorites
```

Les graphiques enregistres comme favoris sont serialises dans `localStorage` sous la cle `dsfr-data-favorites`.

### 3.4 Monitoring des widgets deployes

```
Sites tiers (gouv.fr, codepen, etc.)
    |
    |-- sendWidgetBeacon('dsfr-data-chart', 'bar')   (fetch no-cors)
    v
<proxy-domain>/beacon                                 (nginx return 204, log beacon.log)
    |
    |-- parse-beacon-logs.sh (cron 5min ou trigger /api/refresh-monitoring)
    v
monitoring-data.json                                  (JSON agrege)
    |
    |-- fetch depuis l'app monitoring
    v
apps/monitoring/                                      (tableau de bord DSFR)
```

Les beacon logs sont persistes via un volume Docker (`beacon-logs:/var/log/nginx`) et restaures au redemarrage du conteneur.

### 3.5 Communication intra-composants

A l'interieur d'une meme page, les Web Components communiquent par un bus d'evenements custom (`data-bridge.ts`). Le composant `<dsfr-data-source>` emet des `CustomEvent` lorsque des donnees sont chargees. Les composants consommateurs (`<dsfr-data-chart>`, `<dsfr-data-kpi>`, `<dsfr-data-query>`, `<dsfr-data-normalize>`, `<dsfr-data-facets>`, `<dsfr-data-list>`) s'y abonnent via le mixin `SourceSubscriberMixin`.

```
<dsfr-data-source src="...">          Charge les donnees, emet DATA_EVENTS.LOADED
    |
    |-- CustomEvent sur document
    v
<dsfr-data-normalize source="...">    Ecoute via SourceSubscriberMixin, re-emet apres nettoyage
<dsfr-data-query source="...">        Ecoute via SourceSubscriberMixin, re-emet apres filtrage
<dsfr-data-facets source="...">       Ecoute via SourceSubscriberMixin, re-emet apres facettes
<dsfr-data-chart source="...">   Ecoute via SourceSubscriberMixin
<dsfr-data-kpi source="...">          Ecoute via SourceSubscriberMixin
<dsfr-data-list source="...">     Ecoute via SourceSubscriberMixin
```

---

## 4. Architecture proxy

Les APIs externes (Grist, Albert, tabular-api) n'autorisent pas les requetes cross-origin depuis le navigateur. Un proxy est necessaire. Le systeme supporte trois modes de **détection runtime** (dev / prod / Tauri), determines automatiquement par `getProxyConfig()` dans `packages/shared/src/api/proxy-config.ts`.

> ⚠️ Ne pas confondre les **3 modes runtime** (ci-dessous) avec les **3 dimensions d'URL** au build
> (app / embed / beacon), décrites en §4.4 et §12. Feature vault transverse :
> `~/Documents/Obsidian/30-Knowledge/Features/proxy-cors-3-dimensions.md` (ADR-026, ADR-036, ADR-030).

### 4.1 Mode developpement (Vite proxy)

En local (`localhost:5173`), le serveur Vite agit comme proxy inverse. Les routes sont definies dans `vite.config.ts` :

| Route locale          | Cible                                  |
|-----------------------|----------------------------------------|
| `/grist-proxy/*`      | `https://docs.getgrist.com/*`          |
| `/grist-gouv-proxy/*` | `https://grist.numerique.gouv.fr/*`    |
| `/albert-proxy/*`     | `https://albert.api.etalab.gouv.fr/*`  |
| `/tabular-proxy/*`    | `https://tabular-api.data.gouv.fr/*`   |
| `/api-proxy/*`        | URL dynamique (header `X-Target-URL`)  |

`getProxyConfig()` retourne `baseUrl: ''` (URLs relatives) dans ce mode.

### 4.2 Mode production (proxy externe)

En production, les requetes sont dirigees vers le proxy nginx dont l'URL est configurable via la variable d'environnement `VITE_PROXY_URL` (build time). **[REQUISE au build]** — cette variable n'a pas de valeur par defaut dans la lib. Elle est injectee automatiquement par les scripts `deploy.sh` / `deploy-server.sh` a partir de `APP_DOMAIN`. Pour un build local hors scripts, la definir explicitement ou passer `DSFR_DATA_DEV_BUILD=1`.

`PROXY_BASE_URL` (dans `packages/shared/src/api/proxy-config.ts`) lit `VITE_PROXY_URL` au build time et sert de source de verite unique pour l'URL du proxy. `getProxyConfig()` retourne `baseUrl: PROXY_BASE_URL`.

> **Contrainte technique** : l'acces a `import.meta.env.VITE_*` doit rester **direct** dans le code source (pas d'indirection type `const _meta = import.meta as any`). Vite effectue une substitution statique des variables `import.meta.env.*` a la compilation — toute indirection empeche cette substitution et laisse la variable non resolue en production. Ce comportement a ete a l'origine d'un bug latent corrige par la PR #172 (epic #168).

### 4.3 Mode Tauri (application desktop)

Detecte par la presence de `window.__TAURI__`. Le mode Tauri utilise toujours le proxy externe (valeur de `PROXY_BASE_URL`) car l'application desktop n'a pas de serveur local.

### Recapitulatif

```
                    Dev (Vite)              Production               Tauri
Grist           /grist-proxy/...      <proxy>/grist-proxy/...             idem prod
Albert          /albert-proxy/...     <proxy>/albert-proxy/...            idem prod
Tabular         /tabular-proxy/...    <proxy>/tabular-proxy/...           idem prod
Detection       localhost:5173        (defaut)                            window.__TAURI__
baseUrl         '' (relatif)          VITE_PROXY_URL [REQUISE]            PROXY_BASE_URL
```

### 4.4 Les 3 dimensions d'URL (app · embed · beacon)

Au-delà des 3 modes runtime, l'URL de proxy existe en **3 dimensions distinctes au build**, parce que le même code de lib tourne dans 3 contextes : l'app, un widget embarqué sur un site tiers, et la télémétrie. Cascade de fallback (aucune régression sans changement `.env` explicite, #180) — `packages/shared/src/api/proxy-config.ts:74-94` :

```
PROXY_BASE_URL        = VITE_PROXY_URL                              // app runtime
PROXY_BASE_URL_EMBED  = VITE_PROXY_URL_EMBED || PROXY_BASE_URL      // code généré pour sites tiers
BEACON_BASE_URL       = VITE_BEACON_URL || PROXY_BASE_URL_EMBED     // télémétrie
```

**`getProxyConfig()` est repositionné sur `PROXY_BASE_URL_EMBED`** (`proxy-config.ts:133`, `:246`) : les adapters de `packages/core` tournent dans le bundle lib, chargé indifféremment dans l'app OU sur un site tiers → côté lib, c'est la dimension embed qui fait foi. Voir §12 pour le piège associé.

**Override runtime** (côté site déployeur, avant chargement des composants) :
- `window.DSFR_DATA_PROXY` : `'https://mon-proxy.fr'`, `{ baseUrl, endpoints }`, ou `false` pour forcer le mode `direct`.
- **Défaut sans configuration** (bundle npm/CDN sur un site tiers) : mode `direct` — les URLs externes sont fetchées telles quelles, aucun trafic ne transite par un domaine tiers.

**`VITE_LIB_URL`** (`proxy-config.ts:107-110`, `LIB_URL`) : source du JS dans le code généré — `"jsdelivr"` (défaut, `cdn.jsdelivr.net/npm/dsfr-data@0/dist`), `"unpkg"`, `"self"` (`${PROXY_BASE_URL}/dist`), ou URL custom.

`APP_DOMAIN` dans `.env` configure Traefik (compose) et les scripts de déploiement. Voir `.env.example`.

---

## 5. Build system

### 5.1 Commandes principales

| Commande              | Description                                            |
|-----------------------|--------------------------------------------------------|
| `npm run build`       | Compile TypeScript + Vite lib mode (ESM + UMD)         |
| `npm run build:shared`| Compile `packages/shared/` via `tsc`                   |
| `npm run build:apps`  | Build app-ui puis les 11 apps sequentiellement via workspaces npm |
| `npm run build:all`   | Enchaine shared, bibliotheque, puis apps               |
| `npm run build:app`   | Assemble `app-dist/` pour Tauri (voir 5.3)             |

### 5.2 Build de la bibliotheque

Le script `scripts/build-lib.ts` produit quatre bundles via Vite en mode `lib` :

| Bundle | Contenu | gzip (ESM) | gzip (UMD) |
|--------|---------|---|---|
| `dsfr-data.core.{esm,umd}.js` | Tous les composants sauf `dsfr-data-world-map` et `dsfr-data-map*` (inclut `dsfr-data-join`) | ~70 Ko | ~63 Ko |
| `dsfr-data.map.{esm,umd}.js` | `dsfr-data-map` + `map-layer` + `map-popup` + `map-inset` + `map-timeline` (Leaflet charge dynamiquement : chunks separes en ESM, inline en UMD) | ~35 Ko | ~85 Ko |
| `dsfr-data.world-map.{esm,umd}.js` | `dsfr-data-world-map` (d3-geo, topojson) — **deprecie** (#402), remplace par `<dsfr-data-chart type="map-monde">` | ~30 Ko | ~27 Ko |
| `dsfr-data.{esm,umd}.js` | Tout-en-un | ~107 Ko | ~150 Ko |

Le TopoJSON (`dist/data/world-countries-110m.json`) est charge par `fetch` a l'execution au lieu d'etre inline en base64.

La source du JS dans le code genere est configurable via `VITE_LIB_URL` :
- Non defini / `"jsdelivr"` → `https://cdn.jsdelivr.net/npm/dsfr-data@0/dist` (defaut)
- `"unpkg"` → `https://unpkg.com/dsfr-data@0/dist`
- `"self"` → self-hosted (`${PROXY_BASE_URL}/dist`)
- URL custom → utilisee telle quelle

### 5.3 Build des apps

Chaque application dans `apps/` possede son propre `vite.config.ts`. Le build produit un dossier `apps/{app}/dist/` contenant du HTML/JS/CSS statique.

L'ordre de build dans `build:apps` est : app-ui (chrome applicatif, en premier), puis favorites, playground, sources, builder-ia, builder, builder-carto, dashboard, monitoring, admin, pipeline-helper, grist-widgets.

### 5.4 Assemblage pour Tauri (`scripts/build-app.js`)

Le script `build-app.js` assemble le dossier `app-dist/` qui sert de frontendDist a Tauri :

```
app-dist/
  index.html              Page d'accueil (hub)
  favicon.ico + favicon/  Favicons DSFR Marianne
  dist/                   Bibliotheque dsfr-data (ESM + UMD, depuis packages/core/dist/)
    app-ui.esm.js         Chrome applicatif (depuis packages/app-ui/dist/, hors lib npm)
  specs/                  Specifications des composants
  guide/                  Guide utilisateur et exemples
  apps/                   Builds des apps : favorites, playground, sources, builder-ia,
                          builder, builder-carto, dashboard, monitoring, admin,
                          pipeline-helper (grist-widgets n'est pas copie dans app-dist/)
  favoris.html            Redirection -> apps/favorites/index.html
  builder.html            Redirection -> apps/builder/index.html
  builderIA.html          Redirection -> apps/builder-ia/index.html
  playground.html         Redirection -> apps/playground/index.html
  sources.html            Redirection -> apps/sources/index.html
  dashboard.html          Redirection -> apps/dashboard/index.html
  monitoring.html         Redirection -> apps/monitoring/index.html
```

Les fichiers de redirection (`favoris.html`, `builder.html`, etc.) assurent la retrocompatibilite avec les anciennes URLs.

---

## 6. Tauri -- Application desktop

L'application desktop est construite avec Tauri v2 (Rust + WebView).

### Configuration (`src-tauri/tauri.conf.json`)

| Parametre           | Valeur                        |
|---------------------|-------------------------------|
| productName         | Charts Builder DSFR           |
| identifier          | fr.gouv.charts-builder        |
| frontendDist        | `../app-dist`                 |
| devUrl              | `http://localhost:5173`       |
| Taille fenetre      | 1400x900 (min 1024x700)      |
| Cibles de bundle    | dmg, app, nsis, msi           |

### Flux de build

```
npm run tauri:build
    |
    +--> npm run build:app       Assemble app-dist/
    +--> tauri build             Compile le binaire natif
```

En developpement (`npm run tauri:dev`), Tauri pointe vers le serveur Vite local (`localhost:5173`).

### Detection runtime

Le code frontend detecte l'environnement Tauri via :

```typescript
export function isTauriMode(): boolean {
  return typeof window !== 'undefined' && '__TAURI__' in window;
}
```

Cela permet de basculer automatiquement vers le proxy externe pour les appels API.

### Zoom par défaut

L'app desktop applique un zoom de 80% au démarrage via `window.set_zoom(0.8)` dans `src-tauri/src/lib.rs` (hook `setup`, côté Rust). Cela affiche plus de contenu sans modifier le CSS des composants.

---

## 7. Tests

Les tests utilisent Vitest avec l'environnement jsdom. La configuration se trouve dans `vitest.config.ts`.

### Structure

```
tests/
  aggregations.test.ts         Tests des fonctions d'aggregation
  chart-data.test.ts           Tests du traitement des donnees graphiques
  data-bridge.test.ts          Tests du bus d'evenements
  formatters.test.ts           Tests du formatage (src/utils)
  json-path.test.ts            Tests de l'acces par chemin JSON
  dsfr-data-source.test.ts          Tests du composant dsfr-data-source
  dsfr-data-query.test.ts           Tests du composant dsfr-data-query
  dsfr-data-normalize.test.ts       Tests du composant dsfr-data-normalize
  dsfr-data-facets.test.ts          Tests du composant dsfr-data-facets
  dsfr-data-list.test.ts        Tests du composant dsfr-data-list
  integration.test.ts          Tests d'integration inter-composants
  source-subscriber.test.ts    Tests du mixin SourceSubscriber
  shared/                      Tests du package @dsfr-data/shared
    dept-codes.test.ts
    dsfr-palettes.test.ts
    escape-html.test.ts
    formatters.test.ts
    local-storage.test.ts
    modal.test.ts
    navigation.test.ts
    number-parser.test.ts
    proxy-config.test.ts
    toast.test.ts
  apps/                        Tests des applications
    builder/
    builder-ia/
    dashboard/
    favorites/
    playground/
    sources/
```

### Commandes

| Commande                | Description                                    |
|-------------------------|------------------------------------------------|
| `npm run test`          | Vitest en mode watch                           |
| `npm run test:run`      | Execution unique                               |
| `npm run test:coverage` | Couverture de code (provider v8, format text+html) |
| `npm run test:e2e`      | Tests E2E Playwright                               |

### Configuration notable

- Les dependances `lit` et `@lit` sont inlinees par le serveur de test pour eviter les problemes de resolution ESM dans jsdom.
- La couverture inclut tous les fichiers `src/**/*.ts` sauf `src/index.ts` et `src/components/layout/**`.

### 7.1 Tests exhaustifs du Builder (Playwright E2E)

> Procédure déplacée depuis `CLAUDE.md`. Tests dans `tests/builder-e2e/`.

Vérifient la génération de code pour toutes les combinaisons source × type de graphique × mode (embedded/dynamic/dynamic+facettes).

**Pré-requis** : le serveur de dev principal doit tourner (port 5173) car les sources API (ODS, Tabular) ont besoin du proxy Vite. Playwright doit être installé.

```bash
npm run dev   # terminal séparé
npx playwright test --config tests/builder-e2e/playwright.config.ts
```

- **110 tests** : 4 sources (locale, ODS, Tabular, Grist) × 11 types de graphique × modes.
- Résultats : `tests/builder-e2e/RESULTS.md` · screenshots par combinaison : `tests/builder-e2e/screenshots/`.
- Sources de test : locale (embarquées), ODS et Tabular (APIs distantes via proxy), Grist (embarquées, pas de proxy en dev).

### 7.2 Validation des paramètres Builder (Playwright E2E)

Valident que tous les paramètres du builder génèrent le code attendu avec des données de test connues. Pré-requis : `npm run dev` actif (port 5173).

```bash
cd tests/builder-e2e
npx playwright test quick-audit.spec.ts      # validation des paramètres
npx playwright test simple-test.spec.ts      # éléments UI de base
npx playwright test inspect-builder.spec.ts --headed   # diagnostic structure
```

Couverture : agrégations (SUM, AVG, MIN, MAX, COUNT), types (bar, horizontalBar, pie, kpi), palettes, tri asc/desc, mode avancé (filtres/conditions).

**Données de test** (`field: population`) : `[Ile-de-France 12000, Provence 5000, Bretagne 3000, Normandie 3300]` → SUM=23300, AVG=5825, MIN=3000, MAX=12000, COUNT=4.

**Exposition du state** : le builder expose son state globalement via `(window as any).__BUILDER_STATE__ = state` dans `apps/builder/src/main.ts`, ce qui permet aux tests d'injecter des données et de vérifier les calculs d'agrégation. Doc : `tests/builder-e2e/README.md`, `tests/builder-e2e/TESTING_MATRIX.md`.

---

## 8. Beacon de tracking

> Déplacé depuis `CLAUDE.md`. Code : `packages/core/src/utils/beacon.ts`.

Les beacons sont **désactivés par défaut** (opt-in). Pour les activer : `window.DSFR_DATA_BEACON = true` avant le chargement des composants, **ou** un élément déclaratif `<dsfr-data-beacon url="...">` dans la page (#345).

Quand actif, chaque composant `dsfr-data-*` envoie un beacon fire-and-forget à l'initialisation (`connectedCallback`) via `sendWidgetBeacon()`. Le beacon transmet le nom du composant, le type de graphique et l'origine de la page (`window.location.origin` via le paramètre `r=`) au proxy nginx qui les enregistre dans `beacon.log`. `scripts/parse-beacon-logs.sh` (cron 5 min ou trigger `/api/refresh-monitoring`) transforme ces logs en `monitoring-data.json` consommé par l'app monitoring.

- **`<dsfr-data-beacon url="...">` (#345)** — cible télémétrie **déclarative** (pendant de `proxy-url`). Sa présence vaut opt-in ET fournit l'URL de collecte. **Précédence de l'URL** : élément `url` > `window.DSFR_DATA_BEACON_URL` (#340) > URL bakée au build (`BEACON_BASE_URL`). **Kill switch** : `window.DSFR_DATA_BEACON = false` neutralise même un élément présent. L'élément est invisible, n'émet aucun beacon lui-même, vit dans le bundle **core**, et est consulté en **lookup paresseux** au moment de l'envoi (#156) → son ordre dans le DOM est indifférent (micro-defer `DOMContentLoaded`/microtask).
- Le paramètre `r=` envoie `window.location.origin` (plus fiable que le header HTTP Referer). Les parsers (sh et js) préfèrent `$arg_r` et tombent en fallback sur `$http_referer` pour les anciens logs.
- Déduplication par `Set` en mémoire (1 beacon par composant+type par page). Skip en dev (localhost/127.0.0.1) et sur le domaine du proxy.
- Utilise un **pixel de tracking** (`new Image().src`) au lieu de `fetch()` : les requêtes image sont régies par `img-src` (CSP), quasi-toujours permissif, contrairement à `connect-src` qui bloque souvent les appels `fetch` cross-origin.

---

## 9. Build — pièges esbuild & DSFR Chart

> Déplacé depuis `CLAUDE.md`.

### 9.1 esbuild keepNames (obligatoire)

`vite.config.ts` contient `esbuild: { keepNames: true }`. **Obligatoire** : sans elle, esbuild supprime les méthodes privées non-décorées des prototypes de classes Lit lors de la minification (ex. `_processMapData`, `_createChartElement`), ce qui casse les composants en production. Overhead négligeable (~2 Ko).

### 9.2 DSFR Chart — attributs différés (deferred)

Les composants DSFR Chart (`map-chart`, `map-chart-reg`) sont des Web Components Vue qui écrasent certains attributs (`value`, `date`) avec leurs valeurs par défaut lors du montage Vue. `dsfr-data-chart` utilise un `setTimeout(500ms)` pour ré-appliquer ces attributs après le montage Vue (voir `_createChartElement` dans `packages/core/src/components/dsfr-data-chart.ts`). Pour un nouveau composant DSFR Chart au même comportement, ajouter les attributs concernés dans l'objet `deferred` de `_getTypeSpecificAttributes()`.

---

## 10. Serveur, base de données & déploiement

> Déplacé depuis `CLAUDE.md`. Voir aussi `docs/DEPLOYMENT.md`.

### 10.1 Communication inter-apps (sessionStorage)

Les builders et favoris envoient du code au playground via `sessionStorage` : (1) l'app source stocke `sessionStorage.setItem('playground-code', code)`, (2) navigue vers le playground avec `?from=builder` (ou `builder-ia`, `favorites`), (3) le playground lit `from`, charge le code et le supprime. `from` ∈ { `builder`, `builder-ia`, `favorites` }.

### 10.2 MariaDB

Le serveur Express utilise **MariaDB 11** via `mysql2/promise` (pool de connexions). Conteneur défini dans `docker-compose.db.yml` (healthcheck), données dans le volume `mariadb-data`.

- **Variables d'env** (générées par `deploy-server.sh`) : `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_ROOT_PASSWORD`, `ENCRYPTION_KEY` (AES-256-GCM, 64 hex).
- **Schéma** : `server/src/db/schema-mariadb.sql` (exécuté au démarrage, idempotent). **Helpers** : `server/src/db/database.ts` (`query()`, `queryOne()`, `execute()`, `transaction()`).
- **Migration SQLite → MariaDB** : `docker cp <container>:/app/server/data/dsfr-data.db ./dsfr-data.db` puis `DB_PASSWORD=xxx ENCRYPTION_KEY=xxx npx tsx scripts/migrate-sqlite-to-mariadb.ts --sqlite ./dsfr-data.db`.

### 10.3 Chiffrement des clés API

Les clés dans `connections.api_key_encrypted` sont chiffrées en AES-256-GCM (`server/src/utils/crypto.ts`), format `base64(iv):base64(authTag):base64(ciphertext)`. Sans `ENCRYPTION_KEY` : stockage en clair (compat).

### 10.4 Mots de passe utilisateur

- **Changement** (connecté) : `PUT /api/auth/me` `{ currentPassword, password }` (exige le mdp actuel) ; révoque toutes les autres sessions. UI : `<password-change-modal>`. Client : `changePassword()` dans `auth-service.ts`.
- **Oubli/reset** : `POST /api/auth/forgot-password` (token SHA-256 1h, ne révèle jamais l'existence du compte) → `POST /api/auth/reset-password` (valide, met à jour, révoque les sessions, connecte). Colonnes `reset_token_hash`/`reset_token_expires` (migration v5). Email : `sendPasswordResetEmail()` dans `mailer.ts` (lien `/?reset-password=TOKEN`). UI : lien dans la modale de login, détection auto du paramètre URL dans `app-header.ts`. Client : `forgotPassword()`/`resetPassword()`. Rate limit : 10 / 15 min / IP ; throttle 1 token / 5 min / email.

### 10.5 mcp-server

`mcp-server/` est **hors workspace npm** (pas dans `workspaces` du root). Il a son propre `package-lock.json` et `node_modules`. SDK en `1.29.0` (le pin 1.12.1 pour zod v4 ne s'applique plus). Dans `Dockerfile.db`, son build fait `npm ci && npm run build` depuis son répertoire.

### 10.6 Déploiement VibeLab (production miweb.run)

Mode canonique. Le repo expose à la **racine** : `compose.yml` (stack mode DB `web` + `mariadb`, agnostique : réseau `proxy` externe, labels Traefik en `${APP_NAME}`/`${DOMAIN}`, aucun domaine/hébergeur en dur) et `deploy.sh` (génère secrets/`.env` une seule fois, dérive `VITE_PROXY_URL`/`APP_URL`/`SMTP_FROM` du `DOMAIN`, build + up sous `-p ${APP_NAME}`).

```bash
ssh vps "spawn up chartsbuilder git@github.com:bmatge/dsfr-data.git --dns api --mail real --keep"
# → https://chartsbuilder.miweb.run (cert dédié DKIM, mail réel signé)
```

DB **vierge** : le premier compte inscrit reçoit le rôle admin. Les secrets (`ENCRYPTION_KEY`, `JWT_SECRET`, `DB_*`) vivent dans `/opt/apps/chartsbuilder/.env` sur le VPS — à sauvegarder hors serveur, **ne JAMAIS les régénérer en place**.

### 10.7 Déploiement legacy (ancien VPS, dual-mode)

Le repo s'appelle `dsfr-data` mais le projet Docker historique s'appelle `datasource-charts-webcomponents`. Le `.env` doit contenir `COMPOSE_PROJECT_NAME=datasource-charts-webcomponents` pour réutiliser les volumes existants. Déploiement : `./docker/deploy-server.sh` (ou `./docker/deploy.sh` en mode statique).

**Self-hosting** (domaine arbitraire, reverse externe) : procédure complète dans `docs/DEPLOYMENT.md` §"Configuration self-hosted" (3 scénarios + contrat exhaustif des chemins `/grist-proxy/`, `/tabular-proxy/`, `/albert-proxy/`, etc.). Chaque bloc `location /*-proxy/` dans `docker/nginx.conf` et `nginx-db.conf` est annoté `DESACTIVABLE`.

---

## 11. Notes importantes

- Les fichiers `.js` dans `packages/core/src/` sont des artefacts de build — **ne pas les modifier**.
- Toujours lancer `npm run build` après modification des composants.
- Docker : `docker compose up -d --build` (volume `beacon-logs` pour persister le monitoring entre redémarrages).
- APIs externes : Grist (docs.getgrist.com, grist.numerique.gouv.fr), Albert (albert.api.etalab.gouv.fr), ODS (`*.opendatasoft.com`), Tabular (tabular-api.data.gouv.fr), INSEE Melodi (api.insee.fr/melodi).

---

## 12. Couplages non-évidents ⚠️

> **Le cœur de cette carte** ([ADR-053]). Ce qu'on oublie en touchant le code et qui casse à distance.
> Liens `chemin:ligne` sans code copié — vérifier la source si un numéro a glissé.

- **Piège `import.meta.env` (substitution statique Vite)** — `packages/shared/src/api/proxy-config.ts:74` (et `:84`, `:94`, `:107`, `:149`). Vite substitue `import.meta.env.VITE_*` par **string-matching** à la compilation. Toute indirection (`const m = import.meta as any; m.env.VITE_PROXY_URL`) **casse le match silencieusement** → le bundle embarque l'ancienne valeur en dur (l'URL d'une ancienne instance a fui pendant des mois ; corrigé par PR #172, epic #168). **Toujours** accès direct `import.meta.env.VITE_*`. Cf. ADR-026.

- **Cascade proxy 3 dimensions** — `proxy-config.ts:74-94`. `BEACON_BASE_URL = VITE_BEACON_URL || (PROXY_BASE_URL_EMBED = VITE_PROXY_URL_EMBED || (PROXY_BASE_URL = VITE_PROXY_URL))`. Aucune régression sans changement `.env` explicite (#180). Si tu modifies une variable, vérifie l'effet en cascade sur les deux dimensions en aval.

- **`getProxyConfig()` repositionné sur la dimension EMBED** — `proxy-config.ts:133` et `:246` utilisent `PROXY_BASE_URL_EMBED`, **pas** `PROXY_BASE_URL` runtime. Raison : les adapters de `packages/core` tournent dans le bundle lib, chargé **indifféremment** dans l'app OU sur un site tiers → côté lib c'est l'embed qui fait foi. Modifier ça sans comprendre fait pointer les widgets tiers vers le mauvais proxy.

- **Skills builder-IA validés par introspection Lit** — `apps/builder-ia/src/skills.ts` ⇒ couvert par `tests/apps/builder-ia/skills.test.ts`. Le test introspecte les `elementProperties` Lit de chaque composant `dsfr-data-*` : **tout attribut HTML ajouté à un composant DOIT être documenté dans son skill**, sinon le test casse. Idem pour tout nouveau type de graphique, opérateur de filtre ou fonction d'agrégation.

- **`@customElement` enregistre les tags par side-effect (issue #177)** — l'import d'un fichier décoré `@customElement('app-…')` (chrome interne, `packages/app-ui/src/*.ts`) enregistre le tag dès l'évaluation du module. Conséquence : les `app-*` peuvent embarquer dans le bundle npm public **même sans export** si la chaîne d'imports les atteint. Surveiller l'arbre d'imports du point d'entrée lib (`packages/core/src/index.ts`) et la frontière lib/app (#319) ; valider en grepant les bundles produits.

- **Modales DSFR — `data-fr-opened` ne suffit pas** — `packages/app-ui/src/auth-modal.ts:278-282` : il faut forcer `style="display:flex;opacity:1;visibility:visible"` inline en plus de `data-fr-opened="true"`, sinon la modale reste invisible (CSS DSFR). Reproduire ce pattern pour toute nouvelle modale (`password-change-modal.ts`, `share-dialog.ts`, etc.).

- **`check:accents` matchait dans le CHANGELOG généré** — `scripts/check-french-accents.sh` (pré-filtre `git grep`, exclusions ligne 109 ex. `grist.numerique.gouv.fr`). Garde-fou CI : le script peut produire des faux positifs sur du contenu généré (CHANGELOG, sous-repos). Si un nouveau fichier généré contient des mots ciblés, ajouter une exclusion plutôt que de désactiver le check.

- **Validation empirique post-build (anti-fuite d'URL)** — après **tout** changement touchant proxy/URL/dimensions/beacon : `grep` les bundles produits dans `packages/core/dist/` pour vérifier qu'**aucune URL ne fuit dans la mauvaise dimension** (ex. une URL embed dans le bundle runtime, ou l'inverse). C'est le seul moyen fiable d'attraper une régression de substitution Vite (cf. premier point). Décommission d'un ancien domaine (#353) : vérifier qu'aucun bundle/`.env` ne le référence avant de couper.

---

## 13. Liens

- ADR transverses : `~/Documents/Obsidian/30-Knowledge/ADR/` (ADR-026 import.meta.env, ADR-031 dsfr-data-context, ADR-036 proxy injectable, ADR-053 carte d'architecture).
- Feature vault (cross-repo) : `~/Documents/Obsidian/30-Knowledge/Features/proxy-cors-3-dimensions.md`.
- Fiche projet : `~/Documents/Obsidian/10-Projects/dsfr-data.md`.
- Déploiement / self-hosting : `docs/DEPLOYMENT.md`.
