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

Le projet beneficiait d'un TypeScript strict et d'une couverture de test honorable (78 fichiers, 2817 tests), mais plusieurs piliers qualite etaient absents : pas d'ESLint, pas de Prettier, pas de lint en CI, pas de seuils de couverture.

**Cet audit a mis en place** : ESLint + Prettier, CI renforcee (typecheck + lint + format + coverage + npm audit), seuils de couverture (85/80%), pre-commit hooks (Husky + lint-staged), et corrige 6 findings de securite (XSS, JWT, email injection, beacon flooding, monitoring expose, cles API en clair). Le MCP server a ete refactore et teste (25 tests). 7 exports morts nettoyes dans shared.

**Etat post-audit** : 79 fichiers de test (2842 tests), 0 erreur ESLint, 0 vulnerabilite npm, 91% couverture. Il reste 8 actions de priorite moyenne/basse (tests supplementaires, Dependabot, bundle monitoring).

---

## 2. Etat des lieux

| Aspect | Avant audit | Apres audit |
|--------|------------|-------------|
| TypeScript strict | Oui | Oui |
| ESLint / Prettier | **Aucun** | **Installe et configure** |
| Pre-commit hooks | **Aucun** | **Husky + lint-staged** |
| CI | Build + tests seulement | **typecheck + lint + format + coverage + audit** |
| Coverage | Collectee, aucun seuil | **Seuils 85/80% configures** |
| Tests unitaires | 78 fichiers (2817 tests) | **79 fichiers (2842 tests)** |
| E2E | Playwright builder (110 combinaisons) | Inchange |
| Securite server | 5 findings medium | **2 restants** |
| Vulnerabilites npm | 3 (2 high, 1 moderate) | **0** |

---

## 3. Axe 1 — Composants

**Perimetre** : `src/components/`, `src/adapters/`, `src/utils/`

### 3.1 Tests manquants

> A faire (priorite moyenne)

- [ ] `dsfr-data-world-map` — couverture existante (88.6%) mais pas de test dedie
- [ ] `dsfr-data-map-layer` — couverture partielle (81.7%) mais pas de test dedie
- [ ] `dsfr-data-kpi-group` — couverture 100% via tests indirects

### 3.2 Complexite

Fichiers > 700 LOC a auditer pour extractions possibles :

| Fichier | LOC | Action |
|---------|-----|--------|
| `dsfr-data-facets.ts` | 1361 | Chercher des extractions |
| `dsfr-data-map-layer.ts` | 1063 | Chercher des extractions |
| `dsfr-data-query.ts` | 782 | Evaluer |
| `dsfr-data-source.ts` | 697 | Evaluer |

### 3.3 Audit `any` explicites

> Fait — voir [9.1 Resultats](#91-audit-any-explicites)

- [x] Recenser tous les `any` dans `src/` → **67 occurrences dans 13 fichiers**
- [x] Typer les cas critiques → interface `SourceElement` creee, **21 `as any` elimines**

### 3.4 Dead code

> Fait — voir [9.4 Resultats](#94-dead-code)

- [x] Verifier les exports inutilises dans `src/utils/` → **5 interfaces mortes**
- [x] Verifier les methodes privees non appelees → **0 methode morte**

### 3.5 Accessibilite

> Non audite (hors perimetre de cet audit code)

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

> Fait — voir [9.2 Resultats](#92-audit-securite-front-unsafehtml)

- [x] Audit des usages `unsafeHTML` / `innerHTML` → **10 findings, 2 actionnables**
- [x] XSS dans dsfr-data-chart a11y → **corrige** (escapeHtml)
- [x] Triple-accolade `{{{field}}}` dans dsfr-data-display → **by design** (documente)

### 4.3 Code duplique entre builders

> Non audite (priorite basse)

- [ ] Comparer `builder` et `builder-ia` : code gen, state management
- [ ] Identifier les candidats a factoriser dans `shared`

### 4.4 Bundle size

> Fait — voir [9.5 Resultats](#95-bundle-sizes)

- [x] Mesurer la taille de chaque app buildee → **576 Ko — 752 Ko**
- [x] Identifier les dependances lourdes eventuelles → **RAS**

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

> Fait — voir [9.3 Resultats](#93-audit-securite-server-owasp)

- [x] Injection SQL → **toutes parametrees, 0 injection**
- [x] Rate limiting → **beacon rate-limite (60/min/IP), auth rate-limite**
- [x] Error handling → **aucune stack trace leakee**
- [x] CORS → **strict (single origin)**
- [x] JWT algorithm pince → **corrige** (`algorithms: ['HS256']`)
- [x] Email HTML injection → **corrige** (escapeHtml sur displayName)
- [x] Monitoring authentifie → **corrige** (requireAuth sur GET /data)
- [x] Cles API masquees → **corrige** (affichage last 4 chars en list)

**Findings medium restants** :
- [ ] Tokens legacy bypass revocation (`sessions.ts:48`) — migration a planifier
- [ ] Validation inputs incomplete (displayName longueur, group role en app layer)

### 5.3 Auth

> Audite — voir [9.3 Resultats](#93-audit-securite-server-owasp)

- [x] JWT : expiration 7j, secret env, algorithm pince
- [x] Sessions : revocation via table, check a chaque requete
- [x] Mots de passe : bcrypt 10 rounds, validation complexite (8+ chars, maj/min/chiffre)

---

## 6. Axe 4 — MCP server et Skills

**Perimetre** : `mcp-server/`, `apps/builder-ia/src/skills.ts`

### 6.1 MCP server

> Fait — 25 tests ajoutes dans `tests/mcp/skills.test.ts`

- [x] Refactoring : extraction `cli.ts` et `skills.ts` pour testabilite
- [x] Tests unitaires : parsing d'arguments CLI (getArg, hasFlag) — **5 tests**
- [x] Tests unitaires : matchSkills (keyword matching) — **7 tests**
- [x] Tests unitaires : getWidgetSkillIds (selection skills par chart type) — **10 tests**
- [ ] Tests integration : transport stdio et HTTP (necessite mock du SDK)
- [ ] Securite HTTP : CORS trop permissif (`*`), pas d'authentification

### 6.2 Skills

- [ ] Etendre le test d'alignement aux composants map (dsfr-data-map, dsfr-data-map-layer)
- [ ] Tester que `generate_widget_code` produit du HTML valide

---

## 7. Axe 5 — CI/CD

### 7.1 Linting

> **Fait**

- [x] ESLint flat config (`eslint.config.js`, `@typescript-eslint`, `eslint-plugin-lit`)
- [x] Prettier (`.prettierrc`, `.prettierignore`)
- [x] Scripts `lint`, `lint:fix`, `format`, `format:check`, `typecheck`
- [x] Etape lint + format + typecheck dans `ci.yml`
- [x] 0 erreur ESLint, 242 warnings (principalement `any` et `no-console`)

### 7.2 Type-check isole

> **Fait**

- [x] `tsc --noEmit` en CI comme etape separee

### 7.3 Seuils de couverture

> **Fait**

- [x] Thresholds vitest : 85% statements/functions/lines, 80% branches
- [x] CI execute `test:coverage` qui echoue si seuils non atteints

### 7.4 Pre-commit hooks

> **Fait**

- [x] Installer Husky + lint-staged
- [x] Configurer : lint (ESLint --fix sur .ts) + format (Prettier sur ts/js/json/md/html/css) sur fichiers stages

### 7.5 Securite des dependances

> Partiellement fait

- [x] `npm audit fix` — 0 vulnerabilite
- [x] `npm audit --audit-level=high` en CI (etape "Security audit")
- [ ] Evaluer Dependabot ou Renovate

### 7.6 Bundle size monitoring

> A faire (priorite basse)

- [ ] Ajouter `size-limit` ou equivalent pour detecter les regressions de taille

---

## 8. Axe 6 — Transversal

### 8.1 Audit `any`

> Fait — voir [9.1 Resultats](#91-audit-any-explicites)

- [x] Grep global → **152 occurrences dans 40 fichiers**
- [x] Interface `SourceElement` partagee (`src/utils/source-element.ts`) — 21 `as any` elimines
- [ ] Typer les Leaflet types dans `dsfr-data-map-layer`

### 8.2 Dependances

> Fait

- [x] `npm audit` → **0 vulnerabilite** (apres fix)
- [ ] Verifier les versions pinnees vs ranges

### 8.3 Documentation

> Non audite

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
- ~~Definir une interface `SourceElement` partagee~~ → **Fait** (`src/utils/source-element.ts`, 21 casts elimines)
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

**7 exports morts supprimes, 0 methode publique morte sur les composants.**

**Supprimes** (7) :
- ~~`resetAllTours()`~~ — supprime (jamais appele)
- ~~`migrateStorageKeys()`~~ — supprime (jamais appele)
- ~~`getCorsProxyIfNeeded()`~~, ~~`getExternalProxyUrl()`~~ — supprimes (jamais importes)
- ~~`normalizeChartType()`~~, ~~`isValidChartType()`~~ — supprimes (jamais importes)
- ~~`CDN_VERSIONS`~~ — export retire (utilise en interne par `CDN_URLS`)

**Conserves (faux positifs)** :
- `markTourComplete()`, `shouldShowTour()` — usage interne + API publique npm
- 13 types (`AuthState`, `LoginRequest`, etc.) — API publique npm intentionnelle
- 5 interfaces `src/utils/` — usage interne au module

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

### Hardening server
- [x] **Rate-limit beacon** : 60 req/min/IP sur `POST /api/monitoring/beacon`
- [x] **Auth monitoring data** : `requireAuth` sur `GET /api/monitoring/data`
- [x] **Masquage cles API** : affichage des 4 derniers caracteres seulement dans les listes de connections

### Tests MCP server
- [x] Refactoring : extraction `cli.ts` et `skills.ts` pour testabilite
- [x] **25 tests unitaires** : matchSkills, getWidgetSkillIds, getArg, hasFlag

### Pre-commit hooks et CI
- [x] **Husky + lint-staged** : ESLint --fix sur .ts, Prettier sur ts/js/json/md/html/css
- [x] **npm audit en CI** : `npm audit --audit-level=high` comme etape CI
- [x] **Nettoyage dead code shared** : suppression de 7 exports morts (resetAllTours, migrateStorageKeys, getCorsProxyIfNeeded, getExternalProxyUrl, normalizeChartType, isValidChartType, CDN_VERSIONS)
- [x] **Fix build shared** : correction erreur TS `Error({ cause })` incompatible ES2021

### Verification
- [x] 79/79 tests passent (2842 tests), `tsc --noEmit` OK, 0 erreur ESLint, 0 vulnerabilite npm

---

## 11. Bilan des actions

### Fait durant cet audit

| # | Action | Statut |
|---|--------|--------|
| 1 | ESLint + Prettier + CI lint + typecheck | **Fait** |
| 2 | Seuils de couverture vitest (85/80%) | **Fait** |
| 3 | Fix securite : XSS chart a11y, JWT algorithm, email injection | **Fait** |
| 4 | Fix securite : rate-limit beacon, auth monitoring, masquage cles API | **Fait** |
| 5 | `npm audit fix` (0 vulnerabilite) | **Fait** |
| 6 | Tests MCP server (25 tests, refactoring cli.ts + skills.ts) | **Fait** |
| 7 | Reformatage Prettier (162 fichiers) | **Fait** |
| 8 | Correction de 15 erreurs ESLint | **Fait** |
| 9 | Pre-commit hooks (Husky + lint-staged) | **Fait** |
| 10 | `npm audit --audit-level=high` en CI | **Fait** |
| 11 | Nettoyage dead code shared (7 exports morts supprimes) | **Fait** |
| 12 | Fix build shared (Error cause ES2021) | **Fait** |
| 13 | Interface `SourceElement` partagee (21 `as any` elimines dans 6 fichiers) | **Fait** |

### Reste a faire

| # | Action | Priorite | Effort |
|---|--------|----------|--------|
| 1 | Tokens legacy bypass revocation (migration sessions) | Moyenne | Moyen |
| ~~2~~ | ~~Pre-commit hooks (Husky + lint-staged)~~ | **Fait** | — |
| ~~3~~ | ~~Interface `SourceElement` partagee~~ | **Fait** (21 casts elimines) | — |
| 4 | Tests integration MCP (transport stdio/HTTP) | Moyenne | Moyen |
| 5 | Tests dedies composants map (world-map, map-layer) | Moyenne | Moyen |
| 6 | Tests apps sous-testees (admin, monitoring, favorites) | Moyenne | Moyen |
| ~~7~~ | ~~`npm audit` en CI~~ + Dependabot | **Audit fait** / Dependabot a faire | — |
| ~~8~~ | ~~Nettoyage dead code shared~~ | **Fait** | — |
| 9 | Bundle size monitoring (`size-limit`) | Basse | Faible |
| 10 | Refacto code duplique builders | Basse | Fort |
| 11 | Mise a jour specs/guide | Basse | Moyen |
| 12 | Audit accessibilite ARIA | Basse | Moyen |
