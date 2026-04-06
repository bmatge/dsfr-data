# Changelog

Toutes les modifications notables de ce projet sont documentees dans ce fichier.

Le format est base sur [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/)
et ce projet adhere au [Semantic Versioning](https://semver.org/lang/fr/).

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
