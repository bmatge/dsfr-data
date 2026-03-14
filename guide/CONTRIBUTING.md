# Contribuer a dsfr-data

## Prerequis

- Node.js >= 20
- npm >= 9

## Installation

```bash
git clone https://github.com/bmatge/dsfr-data.git
cd dsfr-data
npm install
```

## Developpement

### Bibliotheque de composants

```bash
npm run dev          # Serveur de dev (port 5173)
npm run build        # Build lib (ESM + UMD)
```

### Apps individuelles

Chaque app peut etre developpee independamment :

```bash
npm run dev --workspace=@dsfr-data/app-builder
npm run dev --workspace=@dsfr-data/app-builder-ia
npm run dev --workspace=@dsfr-data/app-dashboard
npm run dev --workspace=@dsfr-data/app-sources
npm run dev --workspace=@dsfr-data/app-playground
npm run dev --workspace=@dsfr-data/app-favorites
npm run dev --workspace=@dsfr-data/app-monitoring
```

### MCP server

Le serveur MCP (Model Context Protocol) expose les skills dsfr-data aux outils IA :

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
  formatters.test.ts           Formatage (src/utils)
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

## Proxy et variables d'environnement

En dev, les proxys CORS sont geres par Vite (`vite.config.ts`). Aucune configuration requise.

En production, ils sont geres par nginx (`nginx.conf`). Le domaine est configurable :

```bash
# Copier le fichier d'exemple et adapter
cp .env.example .env
```

| Variable | Description | Defaut |
|----------|-------------|--------|
| `APP_DOMAIN` | Domaine de production (Traefik) | `chartsbuilder.matge.com` |
| `VITE_PROXY_URL` | URL du proxy CORS (build time) | `https://${APP_DOMAIN}` |
| `JWT_SECRET` | Cle JWT (mode serveur) | Auto-genere |

`VITE_PROXY_URL` est la variable cle : elle determine l'URL du proxy, du fichier JS de la librairie, et du beacon de tracking. Elle est injectee au build time par Vite dans `PROXY_BASE_URL` (`packages/shared/src/api/proxy-config.ts`).

## Release

La release est declenchee par un tag git :

```bash
git tag v0.2.0
git push origin v0.2.0
```

Le workflow `.github/workflows/release.yml` build automatiquement sur macOS (ARM + x86), Linux (deb + AppImage) et Windows (NSIS + MSI).
