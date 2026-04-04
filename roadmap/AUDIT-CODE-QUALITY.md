# Audit qualite code — dsfr-data

**Date** : 2026-04-04
**Perimetre** : Composants, webapps, server, MCP/skills, CI/CD, transversal.

---

## Table des matieres

1. [Synthese executive](#1-synthese-executive)
2. [Etat des lieux](#2-etat-des-lieux)
3. [Axe 1 — Composants](#3-axe-1--composants)
4. [Axe 2 — Webapps](#4-axe-2--webapps)
5. [Axe 3 — Server](#5-axe-3--server)
6. [Axe 4 — MCP server et Skills](#6-axe-4--mcp-server-et-skills)
7. [Axe 5 — CI/CD](#7-axe-5--cicd)
8. [Axe 6 — Transversal](#8-axe-6--transversal)
9. [Resultats](#9-resultats)
10. [Priorites et plan d'action](#10-priorites-et-plan-daction)

---

## 1. Synthese executive

Le projet beneficie d'un TypeScript strict et d'une couverture de test honorable (90 fichiers de test, E2E Playwright sur le builder). Cependant, plusieurs piliers qualite sont absents : pas d'ESLint, pas de Prettier, pas de pre-commit hooks, pas de seuils de couverture, pas de lint en CI. L'audit vise a identifier les lacunes concretes et a les combler.

---

## 2. Etat des lieux

| Aspect | Aujourd'hui |
|--------|------------|
| TypeScript strict | Oui (strict + noUnusedLocals/Parameters) |
| ESLint / Prettier | **Aucun** |
| Pre-commit hooks | **Aucun** |
| CI | Build + tests, **pas de lint ni type-check isole** |
| Coverage | Collectee (v8), **aucun seuil minimum** |
| Tests unitaires | 90 fichiers, bonne couverture adapteurs/shared |
| E2E | Playwright builder (110 combinaisons) |

---

## 3. Axe 1 — Composants

**Perimetre** : `src/components/`, `src/adapters/`, `src/utils/`

### 3.1 Tests manquants

- [ ] `dsfr-data-world-map` — 0 test
- [ ] `dsfr-data-map-layer` — 0 test (1063 LOC)
- [ ] `dsfr-data-kpi-group` — 0 test

### 3.2 Complexite

Fichiers > 700 LOC a auditer pour extractions possibles :

| Fichier | LOC | Action |
|---------|-----|--------|
| `dsfr-data-facets.ts` | 1361 | Chercher des extractions |
| `dsfr-data-map-layer.ts` | 1063 | Chercher des extractions |
| `dsfr-data-query.ts` | 782 | Evaluer |
| `dsfr-data-source.ts` | 697 | Evaluer |

### 3.3 Audit `any` explicites

- [ ] Recenser tous les `any` dans `src/`
- [ ] Typer les cas critiques (interfaces publiques, retours de fonctions)

### 3.4 Dead code

- [ ] Verifier les exports inutilises dans `src/utils/`
- [ ] Verifier les methodes privees non appelees

### 3.5 Accessibilite

- [ ] Verifier les ARIA attrs sur les composants visuels (chart, list, kpi, map)

---

## 4. Axe 2 — Webapps

**Perimetre** : `apps/`

### 4.1 Apps sous-testees

| App | Fichiers | Tests | Action |
|-----|----------|-------|--------|
| `builder-carto` | 3 | ~0 | Ajouter tests de base |
| `admin` | 2 | 0 | Ajouter tests de base |
| `monitoring` | 2 | 0 | Ajouter tests de base |
| `grist-widgets` | 5 | 0 | Ajouter tests de base |
| `favorites` | 3 | 0 | Ajouter tests de base |

### 4.2 Securite front

- [ ] Audit des usages `unsafeHTML` / `innerHTML` dans les templates Lit
- [ ] Verifier l'echappement des donnees utilisateur dans les rendus

### 4.3 Code duplique entre builders

- [ ] Comparer `builder` et `builder-ia` : code gen, state management
- [ ] Identifier les candidats a factoriser dans `shared`

### 4.4 Bundle size

- [ ] Mesurer la taille de chaque app buildee
- [ ] Identifier les dependances lourdes eventuelles

---

## 5. Axe 3 — Server

**Perimetre** : `server/src/`

### 5.1 Routes non testees

| Route | LOC | Tests |
|-------|-----|-------|
| `groups.ts` | 277 | Non |
| `shares.ts` | 166 | Non |
| `connections.ts` | 269 | Non |
| `monitoring.ts` | 134 | Non |

### 5.2 Securite OWASP

- [ ] Injection SQL : verifier que toutes les requetes sont parametrees
- [ ] Rate limiting : couverture exhaustive de toutes les routes sensibles
- [ ] Validation des inputs : toutes les routes valident-elles les corps de requete ?
- [ ] Error handling : aucune stack trace ne doit fuiter en production
- [ ] CORS : configuration correcte

### 5.3 Auth

- [ ] Expiration/rotation des JWT
- [ ] Revocation des sessions
- [ ] Hashage des mots de passe (bcrypt, iterations)

---

## 6. Axe 4 — MCP server et Skills

**Perimetre** : `mcp-server/`, `apps/builder-ia/src/skills.ts`

### 6.1 MCP server (0 test actuellement)

- [ ] Tests unitaires : parsing d'arguments CLI
- [ ] Tests unitaires : dispatch des tools (list_skills, get_skill, get_relevant_skills, generate_widget_code)
- [ ] Tests : transport stdio et HTTP
- [ ] Securite HTTP : CORS, authentification, rate limiting

### 6.2 Skills

- [ ] Etendre le test d'alignement aux composants map (dsfr-data-map, dsfr-data-map-layer)
- [ ] Tester que `generate_widget_code` produit du HTML valide

---

## 7. Axe 5 — CI/CD

### 7.1 Linting (absent)

- [ ] Installer et configurer ESLint (`eslint.config.js` flat config, `@typescript-eslint`, `eslint-plugin-lit`)
- [ ] Installer et configurer Prettier (`.prettierrc`)
- [ ] Ajouter scripts `lint` et `format:check` dans `package.json`
- [ ] Ajouter etape lint + format dans `ci.yml`

### 7.2 Type-check isole

- [ ] Ajouter `tsc --noEmit` comme etape CI separee (ne pas dependre du build)

### 7.3 Seuils de couverture

- [ ] Configurer `vitest` avec thresholds (ex: branches 70%, lines 75%)
- [ ] Faire echouer la CI si les seuils ne sont pas atteints

### 7.4 Pre-commit hooks

- [ ] Installer Husky + lint-staged
- [ ] Configurer : lint + format sur fichiers stages

### 7.5 Securite des dependances

- [ ] Ajouter `npm audit` en CI
- [ ] Evaluer Dependabot ou Renovate

### 7.6 Bundle size monitoring

- [ ] Ajouter `size-limit` ou equivalent pour detecter les regressions de taille

---

## 8. Axe 6 — Transversal

### 8.1 Audit `any`

- [ ] Grep global des `any` explicites dans tout le projet
- [ ] Prioriser le typage des interfaces publiques

### 8.2 Dependances

- [ ] `npm audit` — vulnerabilites connues
- [ ] Verifier les versions pinnees vs ranges

### 8.3 Documentation

- [ ] Les 30 specs HTML sont-elles a jour avec les composants actuels ?
- [ ] Les exemples du guide fonctionnent-ils encore ?

---

## 9. Resultats

### 9.1 Audit `any` explicites

**152 occurrences dans 40 fichiers** (hors tests).

| Repertoire | Fichiers | Count |
|------------|------:|------:|
| `src/` | 13 | 67 |
| `apps/` | 24 | 79 |
| `server/src/` | 1 | 4 |
| `packages/shared/src/` | 2 | 2 |

**Top fichiers** :
1. `src/components/dsfr-data-map-layer.ts` — 27 (types Leaflet manquants)
2. `src/components/dsfr-data-facets.ts` — 10 (casts `as any` cross-composants)
3. `apps/builder-carto/src/main.ts` — 10
4. `apps/sources/src/main.ts` — 9 (`window as any`)
5. `apps/pipeline-helper/src/editor.ts` — 8 (compat Rete.js)

**Recommandations** :
- Definir une interface `SourceElement` partagee (eliminerait ~25 casts)
- Exploiter `@types/leaflet` deja installe pour typer `dsfr-data-map-layer`
- Typer les methodes publiques `getAdapter()` qui leakent `any`

### 9.2 Audit securite front (unsafeHTML)

**10 findings, 2 actionnables. Aucun `eval`, `new Function`, `document.write` ou `unsafeHTML`.**

| Severite | Count | Details |
|----------|------:|---------|
| Medium | 2 | Donnees API non-echappees dans le DOM |
| Low | 2 | Preview builder, iframe srcdoc |
| Safe | 6 | Contenu statique ou correctement echappe |

**Findings actionnables** :
1. **`src/components/dsfr-data-chart.ts:510-514`** (Medium) — Valeurs API rendues dans le tableau a11y via `innerHTML` sans `escapeHtml()`. Les valeurs d'APIs externes (ODS, Tabular, Grist) pourraient contenir du HTML malveillant.
2. **`src/components/dsfr-data-display.ts:168-172`** (Medium, by design) — Syntaxe triple-accolade `{{{field}}}` injecte volontairement du HTML non-echappe. Risque si utilise avec des donnees non fiables.

### 9.3 Audit securite server (OWASP)

**13 findings, 0 critique, 5 medium.**

**Points positifs** : Toutes les requetes SQL sont parametrees (aucune injection). Aucune stack trace leakee. Helmet applique. CORS strict. bcrypt pour les mots de passe.

**Findings medium** :
1. **JWT algorithme non pince** (`server/src/middleware/auth.ts`) — `jwt.verify()` sans `{ algorithms: ['HS256'] }` → confusion d'algorithme theorique
2. **Tokens legacy bypass revocation** (`server/src/utils/sessions.ts`) — `if (!session) return true` laisse passer les tokens pre-v3
3. **Monitoring non authentifie** (`server/src/routes/monitoring.ts`) — `GET /api/monitoring/data` expose les URLs de deploiement sans auth
4. **Pas de rate limit sur beacon** (`server/src/routes/monitoring.ts`) — `POST` non-authentifie pourrait flooder la table
5. **HTML injection dans emails** (`server/src/utils/mailer.ts`) — `displayName` interpole dans le HTML sans echappement
6. **Cles API en clair dans les reponses** (`server/src/routes/connections.ts`) — cles API dechiffrees renvoyees entierement sur chaque list/get

### 9.4 Dead code

**27 exports morts identifies, 0 methode publique morte sur les composants.**

**Fonctions/constantes mortes dans `@dsfr-data/shared`** (9) :
- `resetAllTours()`, `migrateStorageKeys()` — jamais appelees nulle part
- `getCorsProxyIfNeeded()`, `getExternalProxyUrl()` — jamais importees
- `normalizeChartType()`, `isValidChartType()` — usage interne uniquement
- `CDN_VERSIONS` — seul `CDN_URLS` est utilise
- `markTourComplete()`, `shouldShowTour()` — usage interne a shared seulement

**Types morts dans `@dsfr-data/shared`** (13) :
`AuthState`, `LoginRequest`, `RegisterRequest`, `ShareTarget`, `ShareInfo`, `ExportBundle`, `ImportResult`, `JoinKey`, `JoinOptions`, `PaletteType`, `ProxyConfig`, `SampleDataset`, `TourStep` — jamais importes hors du package shared.
*Note : certains peuvent etre volontairement exportes comme API publique npm.*

**Interfaces mortes dans `src/utils/`** (5) :
- `DataLoadedEvent`, `DataErrorEvent`, `DataLoadingEvent`, `SourceCommandEvent` (data-bridge.ts) — usage interne seulement
- `SourceSubscriberInterface` (source-subscriber.ts) — usage interne seulement

### 9.5 Bundle sizes

**Bibliotheque (dist/)** :

| Bundle | ESM | UMD |
|--------|----:|----:|
| `dsfr-data.core` | 340 Ko | 252 Ko |
| `dsfr-data.map` | 152 Ko | 312 Ko |
| `dsfr-data.world-map` | 140 Ko | 88 Ko |
| `dsfr-data` (tout-en-un) | 484 Ko | 572 Ko |

**Apps (buildees)** : 576 Ko — 752 Ko chacune (builder-ia la plus lourde).

### 9.6 Dependances vulnerables

**3 vulnerabilites** (`npm audit`) :

| Package | Severite | Fix |
|---------|----------|-----|
| `brace-expansion` 2.0.0-2.0.2 | Moderate | `npm audit fix` |
| `path-to-regexp` <0.1.13 | High | `npm audit fix` |
| `picomatch` <=2.3.1 | High | `npm audit fix` |

Toutes fixables via `npm audit fix`.

### 9.7 Couverture actuelle

| Metrique | Valeur | Seuil configure |
|----------|-------:|----------------:|
| Statements | 90.9% | 85% |
| Branches | 88.0% | 80% |
| Functions | 93.7% | 85% |
| Lines | 90.9% | 85% |

### 9.8 ESLint (apres mise en place)

**0 erreur, 242 warnings** (132 `no-explicit-any`, 88 `no-useless-escape`, 19 `no-console`, 3 `ban-ts-comment`).

---

## 10. Actions realisees durant cet audit

### Outillage qualite
- [x] Installation ESLint (`eslint.config.js` flat config, `@typescript-eslint`, `eslint-plugin-lit`)
- [x] Installation Prettier (`.prettierrc`, `.prettierignore`)
- [x] Scripts `lint`, `lint:fix`, `format`, `format:check`, `typecheck` dans `package.json`
- [x] CI mise a jour : typecheck + lint + format + coverage (`.github/workflows/ci.yml`)
- [x] Seuils de couverture vitest (85% statements/functions/lines, 80% branches)
- [x] Correction de 15 erreurs ESLint (imports inutilises, assignments inutiles, etc.)
- [x] Reformatage Prettier de 162 fichiers

### Corrections de securite
- [x] **XSS dans dsfr-data-chart a11y** : ajout `escapeHtml()` sur les valeurs et headers du tableau accessible (`dsfr-data-chart.ts`)
- [x] **JWT algorithm confusion** : ajout `{ algorithms: ['HS256'] }` sur `jwt.verify()` (`server/src/middleware/auth.ts`)
- [x] **HTML injection dans emails** : echappement de `displayName` dans le template HTML (`server/src/utils/mailer.ts`)
- [x] **Dependances vulnerables** : `npm audit fix` — 0 vulnerabilite restante (brace-expansion, path-to-regexp, picomatch)

### Verification
- [x] 78/78 tests passent, `tsc --noEmit` OK, 0 erreur ESLint, 0 vulnerabilite npm

---

## 11. Priorites restantes

| # | Action | Priorite | Effort | Statut |
|---|--------|----------|--------|--------|
| 1 | ~~ESLint + Prettier + CI lint~~ | ~~Haute~~ | ~~Moyen~~ | **Fait** |
| 2 | ~~Type-check `tsc --noEmit` en CI~~ | ~~Haute~~ | ~~Faible~~ | **Fait** |
| 3 | ~~Seuils de couverture vitest~~ | ~~Haute~~ | ~~Faible~~ | **Fait** |
| 4 | ~~Corriger findings securite (JWT, email escape, XSS chart)~~ | ~~Haute~~ | ~~Faible~~ | **Fait** |
| 5 | ~~`npm audit fix`~~ | ~~Moyenne~~ | ~~Faible~~ | **Fait** |
| 6 | Rate-limit sur endpoint beacon + auth sur monitoring data | Haute | Faible |
| 7 | Masquer les cles API dans les reponses connections (afficher seulement les 4 derniers chars) | Haute | Faible |
| 8 | Tests MCP server | Haute | Moyen |
| 9 | Tests composants manquants (world-map, map-layer, kpi-group) | Haute | Moyen |
| 10 | Pre-commit hooks (Husky) | Moyenne | Faible |
| 11 | Interface `SourceElement` partagee (eliminer ~25 `as any`) | Moyenne | Moyen |
| 12 | Tests apps sous-testees | Moyenne | Moyen |
| 13 | Bundle size monitoring | Basse | Faible |
| 14 | Refacto code duplique builders | Basse | Fort |
| 15 | Mise a jour specs/guide | Basse | Moyen |
