# Architecture -- dsfr-data

## 1. Vue d'ensemble

dsfr-data est un monorepo TypeScript gere par npm workspaces. Il fournit une bibliotheque de Web Components de dataviz conformes au DSFR (Design System de l'Etat) ainsi que sept applications web autonomes pour la creation, la gestion et la visualisation de graphiques.

Le monorepo se decompose en trois niveaux :

- **Bibliotheque principale** (`src/`) -- Web Components Lit enregistres globalement
- **Package partage** (`packages/shared/`) -- Utilitaires communs a toutes les apps
- **Applications** (`apps/*/`) -- Sept apps TypeScript independantes buildees avec Vite

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
  src/                          Bibliotheque de Web Components (point d'entree: src/index.ts)
    components/
      dsfr-data-source.ts            Chargement de donnees (Grist, ODS, tabular-api)
      dsfr-data-normalize.ts         Normalisation des donnees (numerique, renommage, trim)
      dsfr-data-query.ts             Filtrage et aggregation de donnees
      dsfr-data-facets.ts            Filtres a facettes interactifs
      dsfr-data-kpi.ts               Indicateur chiffre cle
      dsfr-data-list.ts          Liste de donnees
      dsfr-data-chart.ts        Graphique DSFR (@gouvfr/dsfr-chart)
      layout/
        app-header.ts           En-tete DSFR
        app-footer.ts           Pied de page DSFR
        app-layout-builder.ts   Mise en page pour les builders
        app-layout-demo.ts      Mise en page pour les demos
        app-preview-panel.ts    Panneau de previsualisation
    utils/
      data-bridge.ts            Bus d'evenements entre composants (CustomEvent)
      source-subscriber.ts      Mixin Lit pour l'abonnement aux sources
      chart-data.ts             Traitement des donnees pour les graphiques
      aggregations.ts           Fonctions d'aggregation (sum, avg, count, etc.)
      formatters.ts             Formatage des valeurs (nombres, dates, etc.)
      json-path.ts              Acces par chemin dans les objets JSON
      beacon.ts                 Beacon de tracking des widgets deployes
  dist/                         Build output (ESM + UMD)

  packages/
    shared/                     @dsfr-data/shared
      src/
        utils/
          escape-html.ts        Echappement HTML securise
          formatters.ts         formatKPIValue, formatDateShort
          number-parser.ts      toNumber, looksLikeNumber
          dept-codes.ts         Validation des codes departement
        constants/
          dsfr-palettes.ts      Palettes de couleurs DSFR (DSFR_COLORS, PALETTE_COLORS)
        api/
          proxy-config.ts       Configuration proxy selon l'environnement (dev/prod/Tauri)
          proxy.ts              getProxyUrl, getProxiedUrl, getExternalProxyUrl
        storage/
          local-storage.ts      loadFromStorage, saveToStorage, STORAGE_KEYS
        ui/
          modal.ts              openModal, closeModal, setupModalOverlayClose

  apps/
    favorites/                  @dsfr-data/app-favorites -- Gestion des favoris
    playground/                 @dsfr-data/app-playground -- Editeur de code interactif
    sources/                    @dsfr-data/app-sources -- Gestionnaire de sources de donnees
    builder-ia/                 @dsfr-data/app-builder-ia -- Generateur IA (Albert)
    builder/                    @dsfr-data/app-builder -- Generateur visuel de graphiques
    dashboard/                  @dsfr-data/app-dashboard -- Editeur visuel de tableaux de bord
    monitoring/                 @dsfr-data/app-monitoring -- Suivi des widgets deployes

  tests/                        Tests Vitest
  scripts/                      Scripts de build et monitoring
    build-app.js                Assemblage de app-dist/ pour Tauri/Docker
    parse-beacon-logs.sh        Parsing des beacon logs nginx -> JSON
    docker-entrypoint.sh        Entrypoint Docker (parse periodique + nginx)
  src-tauri/                    Application desktop Tauri
  specs/                        Specifications des composants
  guide/                        Guide utilisateur et exemples
  app-dist/                     Sortie assemblee pour Tauri
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

Les applications communiquent entre elles via le stockage navigateur (`localStorage` et `sessionStorage`). Il n'y a pas de backend partage : les donnees persistent entierement cote client.

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

Les APIs externes (Grist, Albert, tabular-api) n'autorisent pas les requetes cross-origin depuis le navigateur. Un proxy est necessaire. Le systeme supporte trois modes, determines automatiquement par `getProxyConfig()` dans `packages/shared/src/api/proxy-config.ts`.

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

En production, les requetes sont dirigees vers le proxy nginx dont l'URL est configurable via la variable d'environnement `VITE_PROXY_URL` (build time). Par defaut : `https://chartsbuilder.matge.com`.

`PROXY_BASE_URL` (dans `packages/shared/src/api/proxy-config.ts`) lit `VITE_PROXY_URL` au build time et sert de source de verite unique pour l'URL du proxy. `getProxyConfig()` retourne `baseUrl: PROXY_BASE_URL`.

### 4.3 Mode Tauri (application desktop)

Detecte par la presence de `window.__TAURI__`. Le mode Tauri utilise toujours le proxy externe (valeur de `PROXY_BASE_URL`) car l'application desktop n'a pas de serveur local.

### Recapitulatif

```
                    Dev (Vite)              Production               Tauri
Grist           /grist-proxy/...      <proxy>/grist-proxy/...             idem prod
Albert          /albert-proxy/...     <proxy>/albert-proxy/...            idem prod
Tabular         /tabular-proxy/...    <proxy>/tabular-proxy/...           idem prod
Detection       localhost:5173        (defaut)                            window.__TAURI__
baseUrl         '' (relatif)          VITE_PROXY_URL ou defaut            PROXY_BASE_URL
```

---

## 5. Build system

### 5.1 Commandes principales

| Commande              | Description                                            |
|-----------------------|--------------------------------------------------------|
| `npm run build`       | Compile TypeScript + Vite lib mode (ESM + UMD)         |
| `npm run build:shared`| Compile `packages/shared/` via `tsc`                   |
| `npm run build:apps`  | Build les 7 apps sequentiellement via workspaces npm   |
| `npm run build:all`   | Enchaine shared, bibliotheque, puis apps               |
| `npm run build:app`   | Assemble `app-dist/` pour Tauri (voir 5.3)             |

### 5.2 Build de la bibliotheque

Le script `scripts/build-lib.ts` produit trois bundles via Vite en mode `lib` :

| Bundle | Contenu | Taille (gzip) |
|--------|---------|---------------|
| `dsfr-data.core.{esm,umd}.js` | Tous les composants sauf `dsfr-data-world-map` | ~52 Ko |
| `dsfr-data.world-map.{esm,umd}.js` | `dsfr-data-world-map` (d3-geo, topojson) | ~30 Ko |
| `dsfr-data.{esm,umd}.js` | Tout-en-un (core + world-map) | ~70 Ko |

Le TopoJSON (`dist/data/world-countries-110m.json`) est charge par `fetch` a l'execution au lieu d'etre inline en base64.

La source du JS dans le code genere est configurable via `VITE_LIB_URL` :
- Non defini → self-hosted (`${PROXY_BASE_URL}/dist`)
- `"unpkg"` → `https://unpkg.com/dsfr-data/dist`
- `"jsdelivr"` → `https://cdn.jsdelivr.net/npm/dsfr-data/dist`
- URL custom → utilisee telle quelle

### 5.3 Build des apps

Chaque application dans `apps/` possede son propre `vite.config.ts`. Le build produit un dossier `apps/{app}/dist/` contenant du HTML/JS/CSS statique.

L'ordre de build dans `build:apps` est : favorites, playground, sources, builder-ia, builder, dashboard, monitoring.

### 5.4 Assemblage pour Tauri (`scripts/build-app.js`)

Le script `build-app.js` assemble le dossier `app-dist/` qui sert de frontendDist a Tauri :

```
app-dist/
  index.html              Page d'accueil (hub)
  dist/                   Bibliotheque dsfr-data (ESM + UMD)
  specs/                  Specifications des composants
  guide/                  Guide utilisateur et exemples
  apps/
    favorites/            Build de l'app favorites
    playground/           Build de l'app playground
    sources/              Build de l'app sources
    builder-ia/           Build de l'app builder-ia
    builder/              Build de l'app builder
    dashboard/            Build de l'app dashboard
    monitoring/           Build de l'app monitoring
  favoris.html            Redirection -> apps/favorites/index.html
  builder.html            Redirection -> apps/builder/index.html
  builderIA.html          Redirection -> apps/builder-ia/index.html
  playground.html         Redirection -> apps/playground/index.html
  sources.html            Redirection -> apps/sources/index.html
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
