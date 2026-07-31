# Contribuer a dsfr-data

## Prerequis

- Node.js >= 24
- npm >= 9

## Installation

```bash
git clone https://github.com/bmatge/dsfr-data.git
cd dsfr-data
npm install
```

## Structure du monorepo

Le projet est organise en workspaces npm :

```
packages/core/       Bibliotheque de Web Components, publiee sur npm sous le nom `dsfr-data`
packages/shared/     Utilitaires partages (`@dsfr-data/shared`)
packages/app-ui/     Chrome applicatif (`@dsfr-data/app-ui` : header, footer, layouts) — builde en premier par `build:apps`
apps/                Les 11 applications web (admin, builder, builder-carto, builder-ia,
                     dashboard, favorites, grist-widgets, monitoring, pipeline-helper,
                     playground, sources)
server/              Backend Express (API, auth, MariaDB)
mcp-server/          Serveur MCP (hors workspace, installation separee)
```

- **`packages/core/`** contient les composants Lit (`dsfr-data-source`, `dsfr-data-chart`, etc.) et les adapters API. C'est le code publie sur npm.
- **`packages/shared/`** contient les utilitaires communs (proxy, palettes, formatage, storage, navigation). Depuis core, seule l'entree lib-safe `@dsfr-data/shared/lib` est autorisee (#319).
- **`packages/app-ui/`** contient les composants `app-*` du chrome applicatif, partages par les apps et exclus de la lib npm.
- **`apps/`** contient les applications front-end, chacune avec son propre `package.json` et `vite.config.ts`.
- **`server/`** contient le backend Express avec MariaDB, l'authentification et les API.
- **`mcp-server/`** est un package independant (pas dans `workspaces` du `package.json` racine). Il a son propre `package-lock.json` et `node_modules`.

## Developpement

### Travailler sur les composants (`packages/core/`)

Les composants web (`dsfr-data-source`, `dsfr-data-chart`, etc.) et les adapters API sont dans `packages/core/src/`.

```bash
npm run dev          # Serveur de dev (port 5173)
npm run build        # Build lib (ESM + UMD)
npm run test:run     # Lancer les tests unitaires
```

### Travailler sur les apps (`apps/`)

Chaque app peut etre developpee independamment :

```bash
npm run dev --workspace=@dsfr-data/app-builder
npm run dev --workspace=@dsfr-data/app-builder-carto
npm run dev --workspace=@dsfr-data/app-builder-ia
npm run dev --workspace=@dsfr-data/app-dashboard
npm run dev --workspace=@dsfr-data/app-sources
npm run dev --workspace=@dsfr-data/app-playground
npm run dev --workspace=@dsfr-data/app-favorites
npm run dev --workspace=@dsfr-data/app-monitoring
npm run dev --workspace=@dsfr-data/app-pipeline-helper
npm run dev --workspace=@dsfr-data/app-grist-widgets
npm run dev --workspace=@dsfr-data/app-admin
```

### Travailler sur le MCP server

Le serveur MCP est hors workspace npm. Il a son propre `node_modules` et `package-lock.json`.

```bash
cd mcp-server
npm ci && npm run build
node dist/index.js              # mode stdio (Claude Desktop, Claude Code)
node dist/index.js --http       # mode HTTP (Claude.ai, port 3001)
node dist/index.js --url https://mon-domaine.gouv.fr  # URL custom
```

### Package shared

```bash
npm run build:shared
```

### Build complet

```bash
npm run build:all    # shared + lib + toutes les apps
```

## Tests

### Tests unitaires (Vitest)

```bash
npm run test         # Watch mode
npm run test:run     # Execution unique
npm run test:coverage
```

### Tests E2E (Playwright)

```bash
npm run test:e2e
```

### Structure des tests

```
tests/
  dsfr-data-source.test.ts          Composant dsfr-data-source
  dsfr-data-query.test.ts           Composant dsfr-data-query
  dsfr-data-normalize.test.ts       Composant dsfr-data-normalize
  dsfr-data-facets.test.ts          Composant dsfr-data-facets
  dsfr-data-list.test.ts        Composant dsfr-data-list
  aggregations.test.ts         Fonctions d'agregation
  chart-data.test.ts           Traitement des donnees graphiques
  data-bridge.test.ts          Bus d'evenements inter-composants
  formatters.test.ts           Formatage (packages/core/src/utils)
  json-path.test.ts            Acces par chemin JSON
  integration.test.ts          Tests d'integration inter-composants
  source-subscriber.test.ts    Mixin SourceSubscriber
  shared/                      Tests @dsfr-data/shared
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
e2e/                           Tests E2E Playwright
```

### Alignement des skills (Builder IA)

Le builder IA utilise un systeme de skills (blocs de connaissances injectes dans le prompt). Les tests dans `tests/apps/builder-ia/skills.test.ts` verifient automatiquement que :

- Chaque attribut HTML d'un composant est documente dans son skill (via introspection Lit)
- Tous les types de graphiques, operateurs de filtre et fonctions d'agregation sont couverts

Quand on ajoute ou modifie un attribut dans un composant `dsfr-data-*`, il faut mettre a jour le skill correspondant dans `apps/builder-ia/src/skills.ts`.

## Conventions

### TypeScript

- Mode strict active
- Pas de `any` sauf cas justifie
- Types explicites pour les signatures de fonctions publiques

### Nommage

- Composants web : prefixe `dsfr-data-` (public) ou `app-` (layout interne)
- Fichiers : kebab-case (`chart-renderer.ts`)
- Interfaces/types : PascalCase (`ChartConfig`, `AppState`)
- Fonctions : camelCase (`renderChart`, `loadSavedSources`)

### Structure des apps

Chaque app dans `apps/` suit la meme structure :

```
apps/{name}/
  index.html          # Point d'entree HTML
  package.json         # Dependances (@dsfr-data/shared)
  tsconfig.json        # Herite de tsconfig.base.json
  vite.config.ts       # Config Vite avec alias @dsfr-data/shared
  src/
    main.ts            # Point d'entree JS
    state.ts           # Etat de l'app
    styles/            # CSS
    ui/                # Modules UI (optionnel)
```

### Imports partages

Utiliser les imports depuis `@dsfr-data/shared` pour le code partage :

```typescript
import { escapeHtml, formatKPIValue, DSFR_COLORS } from '@dsfr-data/shared';
import { loadFromStorage, saveToStorage, STORAGE_KEYS } from '@dsfr-data/shared';
import { getProxiedUrl, isViteDevMode } from '@dsfr-data/shared';
import { toastSuccess, toastWarning } from '@dsfr-data/shared';
import { appHref, navigateTo } from '@dsfr-data/shared';
```

### Tests

- Fichiers de test : `*.test.ts`
- Environnement : jsdom (via Vitest)
- Reinitialiser le DOM dans `beforeEach`
- Nettoyer localStorage/sessionStorage dans `afterEach`

## Docker

```bash
docker compose up -d --build
```

Le conteneur utilise un volume `beacon-logs` pour persister les donnees de monitoring entre redemarrages.

Pour un build local sans `.env` complet (hors des scripts `deploy.sh` / `deploy-server.sh`), utiliser le bypass :

```bash
DSFR_DATA_DEV_BUILD=1 npm run build:all
```

Voir [docs/DEPLOYMENT.md](DEPLOYMENT.md) pour la configuration complete (variables requises, scripts de deploiement, checklist securite).

## Proxy et variables d'environnement

En dev, les proxys CORS sont geres par Vite (`vite.config.ts`). Aucune configuration requise.

En production, ils sont geres par nginx (`nginx.conf`). Le domaine est configurable :

```bash
# Copier le fichier d'exemple et adapter
cp .env.example .env
```

| Variable | Description | Defaut |
|----------|-------------|--------|
| `APP_DOMAIN` | Domaine de production (Traefik). A remplacer par votre domaine — l'instance publique de reference est `chartsbuilder.miweb.run`. | votre domaine |
| `VITE_PROXY_URL` | URL du proxy CORS injectee dans les bundles a la compilation. Generee automatiquement par les scripts `deploy.sh` / `deploy-server.sh` depuis `APP_DOMAIN`. **[REQUISE au build]** — pas de valeur par defaut dans la lib. | aucune |
| `VITE_LIB_URL` | URL du JS de la lib dans le code genere : `jsdelivr`, `unpkg`, `self`, ou URL custom | `jsdelivr` |
| `JWT_SECRET` | Cle JWT (mode serveur) | Auto-genere |

`VITE_PROXY_URL` est injectee au build time par Vite dans `PROXY_BASE_URL` (`packages/shared/src/api/proxy-config.ts`), qui sert de source de verite unique pour l'URL du proxy et le beacon de tracking.

`VITE_LIB_URL` est une variable distincte qui controle l'URL du JS de la bibliotheque dans le code genere par les builders (valeur `"self"` pour un self-hosting complet).

## Changesets

Quand vous modifiez du code dans `packages/core/` ou `packages/shared/`, lancez `npx changeset` avant de committer :

```bash
npx changeset
```

Le CLI vous demande :
1. Quels packages sont affectes (`dsfr-data`, `@dsfr-data/shared`, ou les deux)
2. Le type de changement selon semver :
   - **patch** : correction de bug, refactoring interne
   - **minor** : nouvel attribut, nouveau composant, nouvelle fonctionnalite
   - **major** : changement d'API incompatible (renommage d'attribut, suppression)
3. Un resume du changement

Un fichier `.changeset/*.md` est genere. Committez-le avec votre code.

Lors de la release, les changesets sont consommes automatiquement pour mettre a jour les versions dans `package.json` et generer le `CHANGELOG.md`.

## Release

Le flux de release s'appuie sur Changesets (voir la section precedente) et comporte une etape manuelle :

1. **Pendant le developpement** : chaque modification notable de `packages/core/` ou `packages/shared/` est accompagnee d'un fichier `.changeset/*.md` commite avec le code.
2. **Preparation** : `npm run version-packages` consomme les changesets — bump des `package.json`, generation du `CHANGELOG.md`, synchronisation des versions Tauri (`src-tauri/tauri.conf.json` + `Cargo.toml`). Alternativement, le bot Changesets maintient une PR de release qui fait la meme chose.
3. **Publication npm** : le merge de la PR de release (workflow `changeset-release.yml`) publie le package `dsfr-data` sur npm et pousse le tag `vX.Y.Z`.
4. **Release Tauri — dispatch manuel** : le tag pousse par le bot (via `GITHUB_TOKEN`) **ne declenche pas** `release.yml`. Il faut le lancer a la main :

   ```bash
   gh workflow run release.yml -f version=vX.Y.Z
   ```

   Le workflow build les binaires desktop sur macOS (ARM + x86), Linux (deb + AppImage) et Windows (NSIS + MSI) et cree la GitHub Release.
5. **Synchronisation du miroir** : les merges effectues cote GitHub (PR de release incluse) ne se propagent pas automatiquement au miroir `mef-snum-miweb/dsfr-data`. Apres la release :

   ```bash
   git fetch origin && git push origin refs/remotes/origin/main:refs/heads/main
   git push origin --tags
   ```

Le detail (multi-push URLs, limites du miroir) est documente dans le `CLAUDE.md` racine, section Versioning.
