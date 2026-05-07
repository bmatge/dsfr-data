# Changelog

Toutes les modifications notables de ce projet sont documentees dans ce fichier.

Le format est base sur [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/)
et ce projet adhere au [Semantic Versioning](https://semver.org/lang/fr/).

## [Unreleased]

### Ajouts
- Partage public d'un favori via lien anonyme dans `apps/favorites/` (sources publiques uniquement — proxy serveur pour les sources privees suivra) ([#148](https://github.com/bmatge/dsfr-data/issues/148), [#151](https://github.com/bmatge/dsfr-data/pull/151), suite [#152](https://github.com/bmatge/dsfr-data/issues/152))
- Builder : defaut d'agregation intelligent (suggere `sum`/`avg`/`count` selon le nom du champ valeur) + badge informatif quand les donnees sont deja pre-agregees

### Corrections
- Hotfix prod 500 sur `POST /api/shares` (`favoriteNeedsPrivateProxy` durci contre les `builder_state_json` JSON `null`)
- Favoris du builder-carto non sauvegardes : `initAuth()` manquant + noms de champs serveur desalignes + clic silencieux sans code ([#149](https://github.com/bmatge/dsfr-data/issues/149), [#150](https://github.com/bmatge/dsfr-data/pull/150))
- Builder : defaut de tri passe a "Ordre source"
- Builder : section "Configuration des donnees" n'etait plus cropee en mode avance (plafond `max-height` bumpe)
- Filtre des IDs de tour cote `/api/tour-state` (remote-property-injection)

### Securite
- Rate limiter dedie sur `/api/public/share/*` (60 req/min/IP), headers durcis (`X-Robots-Tag: noindex`, `credentials: 'omit'` cote client)

> Le detail des releases publiees du package npm `dsfr-data` se trouve dans [`packages/core/CHANGELOG.md`](packages/core/CHANGELOG.md) (genere par Changesets). Les sections ci-dessous resument les changements visibles utilisateur regroupes par release.

## [0.7.1] - 2026-04-20

### Corrections
- **Alignement DSFR sur toutes les apps** : ajout du `<app-footer>` manquant dans `builder`, `builder-ia`, `sources` et `pipeline-helper`. Ajout de `dsfr.module.min.js` dans `sources` et `pipeline-helper` (requis pour le menu mobile et les modales). Ajout du style `view-transition` dans `pipeline-helper` et `builder-carto`. Toutes les pages partagent desormais la meme shell DSFR.
- **Dark mode OS** : remplacement de `data-fr-theme` (inoperant en DSFR 1.14) par `data-fr-scheme="system"` sur l'ensemble des pages. Le JS DSFR calcule maintenant le theme automatiquement selon `prefers-color-scheme` de l'OS.

## [0.7.0] - 2026-04-19

### Ajouts
- **Visites guidees v2 (product tour)** : nouveau schema d'etat `{ disabled?, tours: { [id]: { at, version } } }` avec migration auto depuis l'ancien format. Versioning par tour (`TourConfig.version`) — bumper la version re-propose le tour aux utilisateurs qui l'avaient deja complete.
- **Lien « Ne plus afficher les visites guidees »** dans chaque popover, avec switch reversible depuis la page Guide.
- **Page /guide** : tableau du statut par tour (Joue / Non joue, switch par tour, bouton Lancer / Relancer) + switch global de desactivation.
- **Synchronisation serveur** du state des tours via `GET/PUT /api/tour-state` (migration DB v6, colonne `users.tour_state JSON`). Sync entre appareils pour les utilisateurs connectes, fallback localStorage en mode anonyme.
- **Registre `TOURS_REGISTRY`** exporte depuis `@dsfr-data/shared` pour lister les tours depuis des UIs tierces.

### Corrections
- **Modales DSFR 1.14** : ajout de `data-fr-opened="true"` + style inline `opacity:1;visibility:visible` sur les `<dialog>` (`auth-modal`, `password-change-modal`, `share-dialog`). Le CSS DSFR forcait `opacity:0;visibility:hidden` malgre les classes `fr-modal--opened`.
- **Politique cache nginx** : les bundles `/dist/*` et le HTML passent en `no-cache, must-revalidate` (revalidation systematique via ETag). Resout le bug ou un correctif live n'etait pas servi aux visiteurs deja venus a cause de l'ancien cache `1y`. Autres assets : `max-age=86400` (1 jour).
- **app-header mobile** : le bouton « Connexion » apparait desormais dans le menu mobile. La duplication `tools-links → menu-links` etait faite par DSFR avant la resolution de `isDbMode()` (fetch async) — la liste est maintenant rendue dans les deux conteneurs via Lit.
- **Renommage menu de navigation** : `Creer graphique` → `Creer un graphique`, `Creer carte` → `Creer une carte`, `Tableau de bord` → `Creer un tableau`, `Editeur HTML` → `Playground`, `Flux de donnees` → `Pipeline`. Reordonnancement pour regrouper les trois outils de creation.
- **Clear au logout** de la cle `dsfr-data-tours` pour eviter les fuites d'etat entre comptes sur poste partage.

## [0.6.1] - 2026-04-19

### Corrections
- **app-sidemenu (page guide)** : resserrage de `280px` a `220px` + autorisation des libelles longs sur deux lignes (`white-space: normal`, `word-break: break-word`). Le contenu principal gagne en largeur sans tronquer les titres.

## [0.6.0] - 2026-04-19

### Ajouts
- **dsfr-data-map : argumentaire souverainete** ([#27](https://github.com/bmatge/dsfr-data/issues/27), partiel). Nouvel attribut booleen `sovereign-only` qui restreint `tiles` aux seuls presets IGN (`ign-plan`, `ign-ortho`, `ign-topo`, `ign-cadastre`). Tout autre preset est refuse et remplace par `ign-plan` avec avertissement console.
- Renommage du preset `osm` en `osm-fr` (serveurs OpenStreetMap France, loi 1901 hebergee en France — distincte de l'OpenStreetMap Foundation). L'alias `osm` reste accepte.
- Export d'une fonction pure `resolveTilePreset(requested, sovereignOnly)` pour les tests et outils tiers.

## [0.5.1] - 2026-04-19

### Securite
- **Durcissement XSS et sanitization** (triage baseline securite, code-scanning CodeQL + Semgrep) :
  - **ODS adapter** : echappement ODSQL safe sur les backslashes (`\\` → `\\\\`) avant les doubles quotes — evite qu'un `\"` utilisateur soit traite comme un quote deja echappe.
  - **dsfr-data-search** : meme fix sur l'echappement du terme de recherche envoye via server-search.
  - **dsfr-data-normalize** : `stripHtml` boucle jusqu'a stabilisation pour couvrir les patterns imbriques type `<a<b>c>`.
  - **Preview template (cdn-versions)** : strip des balises `<script ... dsfr-data ...>` via regex lineaire (non-polynomial) et boucle.
  - **Modal `confirmDialog`** : message insere via `textContent`, plus d'interpolation `innerHTML`.
  - **Product tour** : titre/description des steps inseres via `textContent`.
- **Prototype pollution** corrigee dans les helpers de traversee JSON ([#57](https://github.com/bmatge/dsfr-data/issues/57)) : `getByPath`, `setByPath` et la resolution de champ dotted de `dsfr-data-facets` rejettent les cles `__proto__`, `constructor` et `prototype`.

### Corrections
- Nettoyage mecanique des warnings ESLint ([#45](https://github.com/bmatge/dsfr-data/issues/45)) : `<\/script>` → `</script>` dans les code generators (meme chaine produite a l'execution, source plus propre), `@ts-ignore` → `@ts-expect-error` sur les imports Vite `?inline` de `dsfr-data-map`, `console.info` → `console.warn` sur les fallbacks SQL endpoint de l'adapter Grist.

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
