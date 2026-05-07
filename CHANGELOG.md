# Changelog

Toutes les modifications notables de ce projet sont documentees dans ce fichier.

Le format est base sur [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/)
et ce projet adhere au [Semantic Versioning](https://semver.org/lang/fr/).

## [Unreleased]

### Ajouts
- **Partage public d'un favori via lien anonyme** ([#148](https://github.com/bmatge/dsfr-data/issues/148), [#151](https://github.com/bmatge/dsfr-data/pull/151)) — bouton "Partager" dans `apps/favorites/`, page publique anonyme `public-view.html` (iframe sandbox + meta `noindex`), routes `POST /api/shares` etendue (`target_type='public'`) et `GET /api/public/share/:token` (anonyme, rate-limite 60 req/min/IP). Migration v7 : ENUM gagne `'public'`, colonnes `expires_at` + `revoked_at`, drop de la cle unique `uq_share`. Couvre les sources publiques uniquement — les sources privees (clef API chiffree) sont refusees avec code `PRIVATE_SOURCE_NOT_SUPPORTED` en attendant le proxy serveur ([#152](https://github.com/bmatge/dsfr-data/issues/152)).
- **Defaut d'agregation intelligent + badge "donnees groupees"** dans le Builder — suggestion contextuelle (`count` sans valueField, `sum` pour les noms type "montant"/"population"/"nombre"/"effectif", `avg` pour "taux"/"pourcentage"/"score") avec re-calcul a chaque chargement de source, et detection d'unicite du `labelField` qui affiche un badge informatif quand les donnees sont deja pre-agregees.

### Corrections
- **Hotfix prod 500 sur `POST /api/shares`** — `favoriteNeedsPrivateProxy()` plantait sur `state.savedSource` quand `builder_state_json` valait JSON `null` (mysql2 retourne les colonnes JSON comme string brute). Fonction durcie pour tous les cas observables (SQL NULL, JSON literal `null`, savedSource manquant/null/array, apiKey blanc).
- **Favoris du builder-carto non sauvegardes** ([#149](https://github.com/bmatge/dsfr-data/issues/149), [#150](https://github.com/bmatge/dsfr-data/pull/150)) — trois bugs lies au flow "sauvegarder un favori" : `initAuth()` manquant (le save-hook n'etait jamais enregistre, le favori etait wipe par le prefetch d'une autre app), noms de champs desalignes avec le serveur (`source` → `sourceApp`, `builderState` → `builderStateJson` qui finissaient en NULL en DB), clic silencieux sans code (ajout d'un `toastWarning` aligne sur le builder normal).
- **Defaut "Ordre source" pour le tri** dans le Builder — l'ancien defaut `desc` etait surprenant pour les series temporelles ou les categories naturellement ordonnees (mois, jours de la semaine).
- **Section "Configuration des donnees" cropee en mode avance** — `max-height: 1000px` etait trop bas pour la section etendue, l'input "Agregations multiples" etait clippe par `overflow:hidden`. Plafond bumpe a 5000px.
- **Filtre des IDs de tour** ([6a90cf0](https://github.com/bmatge/dsfr-data/commit/6a90cf0)) — protection contre une remote-property-injection sur `/api/tour-state`.

### Securite
- Nouveau rate limiter dedie `publicShareRateLimiter` (60 req/min/IP) sur les routes `/api/public/share/*` — un lien fuite ne peut pas servir d'oracle d'aspiration de donnees.
- Page publique : `X-Robots-Tag: noindex, nofollow`, `Cache-Control: private, max-age=30`, `credentials: 'omit'` cote client pour eviter toute fuite de cookie d'auth.

## [0.5.0] - 2026-04-06

### Structure
- Restructuration monorepo : `src/` deplace dans `packages/core/` (workspace npm)
- `dsfr-data` est desormais un workspace versionnable par Changesets
- Pipeline de release consolidee (suppression du workflow npm-publish redondant)
- 33 fichiers de test migres vers l'alias `@/` (plus de chemins relatifs fragiles)

### Securite
- MCP SDK upgrade 1.12.1 → 1.29.0 (3 vulns high resolues)
- Suppression du `server/package-lock.json` orphelin (fausse alerte Dependabot)

### Documentation
- CLAUDE.md et CONTRIBUTING.md mis a jour pour la nouvelle structure
- Section "Structure du monorepo" ajoutee dans CONTRIBUTING.md
- Section Changesets ajoutee dans CONTRIBUTING.md

## [0.4.1] - 2026-04-06

### Securite
- Tokens legacy sans session record rejetes (fin du bypass de revocation)
- JWT algorithm pince a HS256
- XSS corrige dans le tableau a11y de dsfr-data-chart (escapeHtml)
- HTML injection corrigee dans les emails (escapeHtml sur displayName)
- Rate-limit beacon (60 req/min/IP), monitoring authentifie
- Masquage des cles API (4 derniers caracteres uniquement)
- Dependabot configure (npm + GitHub Actions, weekly)
- npm audit en CI (--audit-level=high)

### Qualite
- ESLint + Prettier installes et configures (0 erreur, 242 warnings)
- Pre-commit hooks Husky + lint-staged (ESLint --fix + Prettier)
- Interface SourceElement partagee : 21 `as any` casts elimines dans 6 composants
- Nettoyage de 7 exports morts dans @dsfr-data/shared
- Seuils de couverture vitest (85/80%)
- CI renforcee : typecheck + lint + format + coverage + audit
- 25 tests MCP server (refactoring cli.ts + skills.ts)
- Infrastructure Changesets pour le versioning semantique

### Corrections
- Fix build shared (Error cause incompatible ES2021)
- Fix lint eslint-disable placement dans filter-translator
- Fix CI : build shared avant typecheck

## [0.4.0] - 2026-04-06

Version initiale avec gestion formelle des releases.

### Ajouts
- Pipeline Helper : editeur visuel de pipelines dsfr-data
- Monitoring : agregation par type de composant, recherche, purge admin
- Authentification : changement de mot de passe, mot de passe oublie (reset par email)
- Attribut `api-key-ref` sur dsfr-data-source pour les cles API cote client
- Menu "Mon espace" regroupant les actions utilisateur
- Adapter INSEE Melodi

### Corrections
- Securite : rate-limit beacon, monitoring auth, masquage des cles API
- Pipeline ODS server-side (facets, search, pagination)
- Delegation getAdapter/getEffectiveWhere dans les composants intermediaires
- Beacon : skip origines non-HTTP, remplacement 204 par empty_gif
- Tests E2E : correction des tests flaky, couverture manquante, a11y

### Qualite
- ESLint + Prettier + Husky pre-commit hooks
- CI : npm audit, typecheck, lint, format check, tests avec couverture
- Interface SourceElement, elimination de 21 `as any` casts
- Tokens legacy sans session rejetes
