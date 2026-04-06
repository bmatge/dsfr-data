# CLAUDE.md - Configuration du projet dsfr-data

## Contexte du projet

Bibliotheque de Web Components de dataviz pour sites gouvernementaux francais.
Composants Lit conformes DSFR (Design System de l'Etat).
Architecture monorepo avec npm workspaces.

## Architecture

```
/
├── index.html               # Hub (page d'accueil)
├── apps/                    # Applications TypeScript
│   ├── builder/             # Generateur visuel de graphiques
│   ├── builder-ia/          # Generateur IA avec Albert
│   ├── dashboard/           # Editeur visuel de tableaux de bord (grille par ligne, preview, save/delete)
│   ├── sources/             # Gestionnaire de sources de donnees
│   ├── playground/          # Environnement de code interactif
│   ├── favorites/           # Gestion des favoris
│   └── monitoring/          # Monitoring et logs
├── packages/
│   └── shared/              # Utilitaires partages (@dsfr-data/shared)
├── src/                     # Composants web dsfr-data (Lit)
│   ├── adapters/            # Adapters API (ODS, Tabular, Grist, Generic)
│   └── components/          # Composants Lit (dsfr-data-source, dsfr-data-query, ...)
├── dist/                    # Build output (ESM + UMD)
├── specs/                   # Specifications des composants
├── guide/                   # Guide utilisateur et exemples
├── tests/                   # Tests Vitest + Playwright E2E
├── e2e/                     # Tests E2E Playwright
├── src-tauri/               # App desktop Tauri
├── scripts/                 # Scripts de build
└── app-dist/                # Build output pour Tauri (genere)
```

## Commandes disponibles

```bash
npm run dev           # Serveur de dev Vite (port 5173)
npm run build         # Build bibliotheque TypeScript + Vite
npm run build:shared  # Build du package shared
npm run build:apps    # Build de toutes les apps
npm run build:all     # Build complet (shared + lib + apps)
npm run build:app     # Assembler app-dist/ pour Tauri
npm run test          # Tests Vitest en watch mode
npm run test:run      # Tests une seule fois
npm run test:coverage # Tests avec couverture
npm run preview       # Preview du build
npm run tauri:dev     # Dev Tauri (app desktop)
npm run tauri:build   # Build Tauri production (build:all + build:app + tauri build)
```

### Dev d'une app individuelle

```bash
npm run dev --workspace=@dsfr-data/app-builder
npm run dev --workspace=@dsfr-data/app-builder-ia
npm run dev --workspace=@dsfr-data/app-dashboard
npm run dev --workspace=@dsfr-data/app-sources
npm run dev --workspace=@dsfr-data/app-playground
npm run dev --workspace=@dsfr-data/app-favorites
npm run dev --workspace=@dsfr-data/app-monitoring
```

## Architecture des composants data

### Pipeline recommande

```
dsfr-data-source  ──[fetch via adapter]──[paginate]──[cache]──► donnees brutes
     │                                                         │
     │ adapters (ODS, Tabular, Grist, Generic)                 ▼
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
  dsfr-data-chart / dsfr-data-list / dsfr-data-kpi / dsfr-data-display
         │
         └──► dsfr-data-a11y (companion accessibilite : tableau, CSV, description)

  Pipeline multi-sources (jointure) :

  dsfr-data-source (A) ──┐
                         ├──► dsfr-data-join ──► dsfr-data-query ──► dsfr-data-chart
  dsfr-data-source (B) ──┘

  Pipeline carte interactive (multi-couches, multi-sources) :

  dsfr-data-source (A) ──► dsfr-data-map-layer (type="geoshape") ──┐
  dsfr-data-source (B) ──► dsfr-data-map-layer (type="marker")  ──┼──► dsfr-data-map
  dsfr-data-source (C) ──► dsfr-data-map-layer (type="heatmap") ──┘     │
                                                                         └──► dsfr-data-a11y
```

**Regles** :
- **dsfr-data-source** est le seul composant qui fait du fetch HTTP. Il supporte `api-type` pour ODS, Tabular, Grist et Generic.
- **dsfr-data-query** est un pur transformateur de donnees (filter, group-by, aggregate, sort). Il ne fait jamais de requete HTTP.
- **dsfr-data-join** est un pur transformateur multi-sources. Il joint deux sources sur une cle pivot (inner, left, right, full). Il ne fait aucun fetch HTTP.
- Les commandes (page, where, orderBy) remontent vers dsfr-data-source via `dsfr-data-source-command`.
- dsfr-data-facets et dsfr-data-search delegent la construction des WHERE clauses aux adapters.
- **dsfr-data-map** est le conteneur carte Leaflet. Il ne consomme pas de donnees. Ce sont les **dsfr-data-map-layer** enfants qui utilisent `SourceSubscriberMixin`.
- **dsfr-data-map-layer** projete les donnees sur la carte (marker, geoshape, circle, heatmap). Chaque layer a sa propre source → multi-source naturel.
- Le viewport-driven fetch (`bbox`) envoie des commandes `dsfr-data-source-command` avec `whereKey: "map-bbox"` pour le merge avec les autres filtres.

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
<!-- Optionnel : accessibilite du graphique -->
<dsfr-data-a11y for="mon-graph" source="data" table download></dsfr-data-a11y>
```

Pour les cas sans transformation (datalist, display), dsfr-data-query peut etre omis :

```html
<dsfr-data-source id="src" api-type="tabular"
  resource="..." server-side page-size="20">
</dsfr-data-source>
<dsfr-data-list source="src" colonnes="..." pagination="20">
</dsfr-data-list>
```

### Adapters et ProviderConfig

- **Adapters** (`src/adapters/`) : construisent les URLs, parsent les reponses, gerent la pagination. Chaque API a son adapter (ODS, Tabular, Grist, Generic).
- **ProviderConfig** (`packages/shared/src/providers/`) : configuration declarative par provider (pagination, response parsing, query syntax, code generation).
- **Registre** (`src/adapters/adapter-registry.ts`) : `getAdapter(apiType)` retourne l'adapter pour un type donne.
- Ajouter un nouveau provider (CKAN...) = 1 ProviderConfig + 1 Adapter, zero modification dans les composants.

### Capacites des adapters

| Capacite | OpenDataSoft | Tabular | Grist | INSEE (Melodi) | Generic |
|----------|:---:|:---:|:---:|:---:|:---:|
| serverFetch | oui | oui | oui | oui | non |
| serverFacets | oui | non | oui | non | non |
| serverSearch | oui | non | non | non | non |
| serverGroupBy | oui | oui | oui | non | non |
| serverOrderBy | oui | oui | oui | non | non |
| serverGeo | oui | non | non | non | non |
| whereFormat | odsql | colon | colon | colon | odsql |

**Formats WHERE** :
- **ODSQL** (OpenDataSoft) : syntaxe SQL-like — `population > 5000 AND status = 'active'`
- **Colon** (Tabular, Grist) : syntaxe structuree — `field:operator:value, field2:operator:value2`

### Attributs dsfr-data-source

dsfr-data-source fonctionne en deux modes :

**Mode URL (fetch direct)** : `url`, `method`, `headers`, `params`, `refresh`, `transform`, `paginate`, `page-size`, `cache-ttl`, `data` (inline JSON)

**Mode adapter** (api-type != generic ou base-url fourni) : `api-type`, `base-url`, `dataset-id`, `resource`, `where`, `select`, `group-by`, `aggregate`, `order-by`, `server-side`, `page-size`, `limit`

### Grist : mode Records vs SQL

L'adapter Grist choisit automatiquement entre deux modes :
- **Mode Records** (GET /records) : pour fetch simple, filter equality/IN (`?filter={"col":["v"]}`), sort (`?sort=-col`), pagination (`?limit=N&offset=M`)
- **Mode SQL** (POST /sql) : pour group-by, aggregation, LIKE search, facettes DISTINCT via SQL parametre

Le mode SQL est un fallback automatique — il est active seulement quand les capacites de l'endpoint Records sont insuffisantes (group-by, aggregate, operateurs avances comme contains/gt/lt). Si le endpoint SQL n'est pas disponible sur l'instance Grist, l'adapter revient au mode Records + client-side. La disponibilite SQL est cachee par hostname (`Map<string, boolean>`).

L'adapter expose aussi `fetchColumns()` et `fetchTables()` pour l'introspection du schema Grist.

## Conventions de code

- TypeScript strict mode
- Composants Lit (LitElement, html, css)
- Nommage : `dsfr-data-*` pour les composants publics, `app-*` pour les layouts
- Tests : fichiers `*.test.ts` dans `/tests/`
- Pas d'emoji dans le code sauf demande explicite
- Imports partages via `@dsfr-data/shared`

## Package shared (@dsfr-data/shared)

Utilitaires partages entre toutes les apps :
- `escapeHtml()` - Echappement HTML
- `formatKPIValue()`, `formatDateShort()` - Formatage
- `toNumber()`, `looksLikeNumber()` - Parsing numerique
- `isValidDeptCode()` - Validation codes departementaux
- `DSFR_COLORS`, `PALETTE_COLORS` - Palettes DSFR
- `getProxyConfig()`, `getProxiedUrl()` - Configuration proxy
- `loadFromStorage()`, `saveToStorage()`, `STORAGE_KEYS` - localStorage
- `openModal()`, `closeModal()` - Modales DSFR
- `toastWarning()`, `toastSuccess()` - Notifications toast DSFR
- `appHref()`, `navigateTo()` - Navigation inter-apps
- `ProviderConfig`, `getProviderConfig()` - Configuration declarative des providers API
- `detectProvider()` - Detection automatique du type de provider depuis une URL

## Skills builder-IA (alignement composants)

Le builder-IA (`apps/builder-ia/`) utilise un systeme de skills : des blocs de connaissances injectes dans le prompt de l'IA selon le contexte. Les skills sont definis dans `apps/builder-ia/src/skills.ts`.

**Regle importante** : quand on ajoute/modifie un attribut, un type de graphique, un operateur de filtre ou une fonction d'agregation dans un composant `dsfr-data-*`, il faut mettre a jour le skill correspondant dans `skills.ts`.

Les tests d'alignement dans `tests/apps/builder-ia/skills.test.ts` verifient automatiquement que :
- Chaque attribut HTML d'un composant est documente dans son skill (via introspection Lit `elementProperties`)
- Tous les types de graphiques, operateurs de filtre et fonctions d'agregation sont couverts
- Chaque composant data a un skill correspondant

Si un attribut est ajoute a un composant sans maj du skill, le test echouera.

**Note** : dsfr-data-source a deux modes (voir "Attributs dsfr-data-source" ci-dessus). dsfr-data-query est un pur transformateur et ne fait aucun fetch HTTP.

## Deploiement serveur (VPS)

Le repo s'appelle `dsfr-data` mais le projet Docker s'appelle `datasource-charts-webcomponents` (ancien nom).
Le `.env` doit contenir `COMPOSE_PROJECT_NAME=datasource-charts-webcomponents` pour que Docker reuse les volumes existants.

```bash
# Premier deploiement depuis le nouveau repo
cp ~/datasource-charts-webcomponents/.env .env
echo "COMPOSE_PROJECT_NAME=datasource-charts-webcomponents" >> .env

# Deploiement (arrete les conteneurs, git pull, build, redemarre)
./deploy-server.sh
```

### Base de donnees MariaDB

Le serveur Express utilise **MariaDB 11** via `mysql2/promise` (requetes async, pool de connexions).
Le conteneur MariaDB est defini dans `docker-compose.db.yml` avec healthcheck.
Les donnees sont persistees dans le volume Docker `mariadb-data`.

**Variables d'environnement** (generees automatiquement par `deploy-server.sh`) :
- `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_ROOT_PASSWORD`
- `ENCRYPTION_KEY` — cle AES-256-GCM pour chiffrer les `api_key_encrypted` (64 hex chars)

**Schema** : `server/src/db/schema-mariadb.sql` (execute au demarrage, idempotent via `CREATE TABLE IF NOT EXISTS`).
**Helpers DB** : `server/src/db/database.ts` exporte `query()`, `queryOne()`, `execute()`, `transaction()`.

### Migration SQLite → MariaDB

Pour migrer les donnees d'une installation SQLite existante :

```bash
# 1. Copier le fichier SQLite depuis le volume Docker
docker cp <container>:/app/server/data/dsfr-data.db ./dsfr-data.db

# 2. Lancer le script de migration
DB_PASSWORD=xxx ENCRYPTION_KEY=xxx npx tsx scripts/migrate-sqlite-to-mariadb.ts --sqlite ./dsfr-data.db
```

### Chiffrement des cles API

Les cles API dans `connections.api_key_encrypted` sont chiffrees en AES-256-GCM (`server/src/utils/crypto.ts`).
Format : `base64(iv):base64(authTag):base64(ciphertext)`.
Si `ENCRYPTION_KEY` n'est pas defini, les cles sont stockees en clair (compatibilite).

### Gestion des mots de passe utilisateur

**Changement de mot de passe** (utilisateur connecte) :
- `PUT /api/auth/me` avec `{ currentPassword, password }` — exige le mot de passe actuel
- Apres changement, toutes les autres sessions sont revoquees (la session courante est recreee)
- UI : bouton "Mot de passe" dans le header (composant `<password-change-modal>`)
- Client : `changePassword(currentPassword, newPassword)` dans `auth-service.ts`

**Mot de passe oublie** (reset par email) :
- `POST /api/auth/forgot-password` — genere un token SHA-256 (1h), envoie un email, ne revele jamais si le compte existe
- `POST /api/auth/reset-password` — valide le token, met a jour le password, revoque toutes les sessions, connecte l'utilisateur
- Colonnes DB : `reset_token_hash` et `reset_token_expires` sur `users` (migration v5)
- Email : `sendPasswordResetEmail()` dans `mailer.ts`, lien vers `/?reset-password=TOKEN`
- UI : lien "Mot de passe oublie ?" dans la modale de login, detection automatique du parametre URL `?reset-password=TOKEN` dans `app-header.ts`
- Client : `forgotPassword(email)` et `resetPassword(token, password)` dans `auth-service.ts`
- Rate limiting : meme limiter que login/register (10 tentatives / 15 min / IP)
- Throttle : 1 token de reset toutes les 5 minutes par email

### mcp-server

Le `mcp-server/` est un package **hors workspace npm** (pas dans `workspaces` du root `package.json`).
Il a son propre `package-lock.json` et son propre `node_modules`.
Le SDK est pinner a `1.12.1` (versions superieures utilisent zod v4 qui cause des erreurs TypeScript).
Dans `Dockerfile.db`, le build mcp-server fait `npm ci && npm run build` depuis son repertoire.

## Versioning et Releases

Le projet utilise [Changesets](https://github.com/changesets/changesets) pour le versioning semantique et la generation du CHANGELOG.

### Semantic Versioning (semver)

- **patch** (0.4.x) : corrections de bugs, fixes CSS, typos
- **minor** (0.x.0) : nouvelles fonctionnalites, nouveaux composants, nouveaux adapters
- **major** (x.0.0) : breaking changes (attributs renommes/supprimes, changement d'API)

### Workflow de release

**1. Pendant le developpement** — creer un changeset pour chaque modification notable :
```bash
npx changeset
# → Selectionner dsfr-data
# → Choisir major/minor/patch
# → Decrire le changement (1-2 phrases, en francais)
```
Le fichier `.changeset/xxx.md` est commite avec le code.

**2. A la release** — generer la version et publier :
```bash
npm run version-packages    # Bumpe package.json + CHANGELOG.md + sync Tauri
git add .
git commit -m "chore: release v$(node -p \"require('./package.json').version\")"
git tag "v$(node -p \"require('./package.json').version\")"
git push && git push --tags
```

**3. Automatiquement** — les workflows GitHub se declenchent sur le tag `v*` :
- `npm-publish.yml` → publie sur npm
- `release.yml` → build Tauri (macOS ARM+x86, Linux, Windows) + GitHub Release
- `publish-repos.yml` → publie les sous-repos (grist, proxy, mcp)

### Synchronisation des versions

La version de reference est dans `package.json` (root). Le script `sync-versions` synchronise :
- `src-tauri/tauri.conf.json`
- `src-tauri/Cargo.toml`

Il est execute automatiquement par `npm run version-packages`.

### CI : verification des changesets

Sur les PRs, le workflow CI verifie si un changeset est present quand `src/` ou `packages/shared/` sont modifies. Un warning est emis si le changeset est manquant.

### Workflow de fin de session Claude Code

A la fin de chaque session de developpement avec Claude Code, suivre ce workflow :

1. **Verifier les modifications** : `git diff --stat` pour voir tous les fichiers modifies
2. **Creer un changeset si necessaire** : si `src/` ou `packages/shared/` ont ete modifies, lancer `npx changeset`
3. **Commit** : avec un message conventional commit (`feat:`, `fix:`, `refactor:`, etc.)
4. **Rappel** : ne pas oublier de pousser le changeset avec le code

Les changesets s'accumulent jusqu'a la prochaine release. Chaque release consomme tous les changesets en attente et genere une entree unique dans le CHANGELOG.

## APIs externes utilisees

- Grist : docs.getgrist.com, grist.numerique.gouv.fr
- Albert IA : albert.api.etalab.gouv.fr
- OpenDataSoft : *.opendatasoft.com
- Tabular API : tabular-api.data.gouv.fr
- INSEE Melodi : api.insee.fr/melodi (catalogue-donnees.insee.fr)

## Proxy et URLs

- Dev : Vite proxy (configure dans vite.config.ts de chaque app)
- Production : proxy nginx, domaine configurable via `VITE_PROXY_URL` (defaut : `chartsbuilder.matge.com`)
- Tauri : proxy distant via detection `window.__TAURI__`
- `PROXY_BASE_URL` dans `packages/shared/src/api/proxy-config.ts` lit `VITE_PROXY_URL` au build time (source de verite unique)
- `LIB_URL` dans `packages/shared/src/api/proxy-config.ts` lit `VITE_LIB_URL` au build time (URL du JS dans le code genere)
  - Non defini → `${PROXY_BASE_URL}/dist` (self-hosted)
  - `"unpkg"` → `https://unpkg.com/dsfr-data/dist`
  - `"jsdelivr"` → `https://cdn.jsdelivr.net/npm/dsfr-data/dist`
- `APP_DOMAIN` dans `.env` configure Traefik (docker-compose.yml) et les scripts de deploiement
- Voir `.env.example` pour toutes les variables

## Bundles de la bibliotheque

Le build (`scripts/build-lib.ts`) produit 4 bundles dans `dist/` :

| Bundle | Contenu | Taille gzip |
|--------|---------|-------------|
| `dsfr-data.core.{esm,umd}.js` | Tous composants sauf `dsfr-data-world-map` et `dsfr-data-map` | ~52 Ko |
| `dsfr-data.world-map.{esm,umd}.js` | `dsfr-data-world-map` (d3-geo, topojson) | ~30 Ko |
| `dsfr-data.map.{esm,umd}.js` | `dsfr-data-map` + `dsfr-data-map-layer` (Leaflet charge dynamiquement) | ~15 Ko |
| `dsfr-data.{esm,umd}.js` | Tout-en-un | ~80 Ko |

Le code genere par les builders et le playground utilise le **core** bundle par defaut.
Le TopoJSON (`dist/data/world-countries-110m.json`) est charge par fetch a l'execution.
Leaflet (~40 Ko gzip) et leaflet.markercluster (~5 Ko) sont charges dynamiquement via `import()` — pas inclus dans les bundles.
Publication npm : `npm publish` via workflow GitHub Actions sur tag `v*`.

## Beacon de tracking

Chaque composant `dsfr-data-*` envoie un beacon fire-and-forget a l'initialisation (`connectedCallback`) via `sendWidgetBeacon()` dans `src/utils/beacon.ts`. Le beacon transmet le nom du composant, le type de graphique et l'origine de la page (`window.location.origin` via le parametre `r=`) au proxy nginx qui les enregistre dans `beacon.log`. Un script periodique (`scripts/parse-beacon-logs.sh`) transforme ces logs en `monitoring-data.json` consomme par l'app monitoring.

- Le parametre `r=` envoie `window.location.origin` pour identifier le site deployeur (plus fiable que le header HTTP Referer qui depend du Referrer-Policy du site)
- Les parsers (sh et js) preferent `$arg_r` et tombent en fallback sur `$http_referer` pour compatibilite avec les anciens logs
- Deduplication par `Set` en memoire (1 beacon par composant+type par page)
- Skip en dev (localhost/127.0.0.1)
- Utilise un pixel de tracking (`new Image().src`) au lieu de `fetch()` : les requetes image sont regies par `img-src` (CSP) qui est quasi-toujours permissif, contrairement a `connect-src` qui bloque souvent les appels `fetch` cross-origin

## Build : esbuild keepNames

Le `vite.config.ts` contient `esbuild: { keepNames: true }`. Cette option est **obligatoire** :
sans elle, esbuild supprime les methodes privees non-decorees des prototypes de classes Lit
lors de la minification (ex: `_processMapData`, `_createChartElement`), ce qui casse le
fonctionnement des composants en production. Overhead negligeable (~2 Ko).

## DSFR Chart : attributs differes (deferred)

Les composants DSFR Chart (`map-chart`, `map-chart-reg`) sont des Web Components Vue qui
ecrasent certains attributs (`value`, `date`) avec leurs valeurs par defaut lors du montage Vue.
`dsfr-data-chart` utilise un mecanisme de `setTimeout(500ms)` pour re-appliquer ces attributs
apres le montage Vue (voir `_createChartElement` dans `src/components/dsfr-data-chart.ts`).

Si un nouveau composant DSFR Chart presente le meme comportement, ajouter les attributs
concernes dans l'objet `deferred` retourne par `_getTypeSpecificAttributes()`.

## Tauri : zoom par defaut

L'app desktop Tauri applique un zoom de 80% au demarrage via `window.set_zoom(0.8)` dans
`src-tauri/src/lib.rs`. Cela permet d'afficher plus de contenu dans la fenetre sans
modifier le CSS des composants. Le zoom est applique cote Rust dans le hook `setup`.

## Communication inter-apps (sessionStorage)

Les builders et les favoris envoient du code au playground via `sessionStorage` :
1. L'app source stocke le code dans `sessionStorage.setItem('playground-code', code)`
2. Elle navigue vers le playground avec un parametre `?from=builder` (ou `builder-ia`, `favorites`)
3. Le playground lit le parametre `from`, charge le code depuis sessionStorage, et le supprime

Le parametre `from` doit etre l'un de : `builder`, `builder-ia`, `favorites`.

## Tests exhaustifs du Builder (Playwright E2E)

Tests dans `tests/builder-e2e/` : verifient la generation de code pour toutes les
combinaisons source x type de graphique x mode (embedded/dynamic/dynamic+facettes).

**Pre-requis** : le serveur de dev principal doit tourner (port 5173) car les sources
API (ODS, Tabular) ont besoin du proxy Vite. Playwright doit etre installe.

```bash
# 1. Lancer le serveur de dev (dans un terminal separe)
npm run dev

# 2. Lancer les tests exhaustifs du builder
npx playwright test --config tests/builder-e2e/playwright.config.ts
```

- **110 tests** : 4 sources (locale, ODS, Tabular, Grist) x 11 types de graphique x modes
- Resultats ecrits dans `tests/builder-e2e/RESULTS.md`
- Screenshots par combinaison dans `tests/builder-e2e/screenshots/`
- Sources de test : locale (donnees embarquees), ODS et Tabular (APIs distantes via proxy),
  Grist (donnees embarquees, pas de proxy en dev)

## Tests de validation des parametres Builder (Playwright E2E)

Tests dans `tests/builder-e2e/` : valident que tous les parametres du builder fonctionnent correctement et generent le code attendu avec des donnees de test connues.

**Pre-requis** : le serveur de dev doit tourner (port 5173) pour acceder au builder.

```bash
# 1. Lancer le serveur de dev (dans un terminal separe)
npm run dev

# 2. Lancer les tests de validation des parametres
cd tests/builder-e2e
npx playwright test quick-audit.spec.ts

# 3. Tests de base (elements UI)
npx playwright test simple-test.spec.ts

# 4. Inspection de la structure (diagnostic)
npx playwright test inspect-builder.spec.ts --headed
```

### Tests de validation critiques

**11/12 tests passent** (91.7% de reussite) :

- **Fonctions d'agregation** (5/5) : SUM, AVG, MIN, MAX, COUNT
- **Types de graphiques** (4/4) : bar, horizontalBar, pie, kpi
- **Palettes** : Application correcte des couleurs
- **Tri** : Ordre ascendant et descendant
- **Mode avance** : Filtres et conditions

### Donnees de test et valeurs attendues

Les tests utilisent un dataset de test avec valeurs connues pour verification :

```typescript
const TEST_DATA = [
  { region: 'Ile-de-France', population: 12000, budget: 500, code: '75' },
  { region: 'Provence', population: 5000, budget: 200, code: '13' },
  { region: 'Bretagne', population: 3000, budget: 150, code: '35' },
  { region: 'Normandie', population: 3300, budget: 180, code: '14' }
];
```

**Valeurs attendues** (field: population) :
- SUM = 23300
- AVG = 5825
- MIN = 3000
- MAX = 12000
- COUNT = 4 (nombre de regions)

### Exposition du state pour les tests

Pour permettre aux tests de verifier les calculs, le state du builder est expose globalement dans `apps/builder/src/main.ts` :

```typescript
// Expose state for E2E tests
(window as any).__BUILDER_STATE__ = state;
```

Cette exposition permet aux tests de :
- Injecter des donnees de test directement dans le state
- Verifier que les agregations calculent les valeurs correctes
- Comparer les resultats avec les valeurs attendues
- Valider la coherence entre donnees source et resultats affiches

### Documentation

- `tests/builder-e2e/README.md` : Guide d'utilisation des tests
- `tests/builder-e2e/TESTING_MATRIX.md` : Matrice complete des parametres a tester

## Notes importantes

- Les fichiers `.js` dans `/src/` sont des artefacts de build, ne pas les modifier
- Toujours lancer `npm run build` apres modification des composants
- Docker : `docker compose up -d --build` (utilise un volume `beacon-logs` pour persister les donnees de monitoring entre redemarrages)
