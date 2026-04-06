# Changelog

Toutes les modifications notables de ce projet sont documentees dans ce fichier.

Le format est base sur [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/)
et ce projet adhere au [Semantic Versioning](https://semver.org/lang/fr/).

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
