# dsfr-data

## 0.6.1

### Patch Changes

- [#127](https://github.com/bmatge/dsfr-data/pull/127) [`52c54f9`](https://github.com/bmatge/dsfr-data/commit/52c54f9371653d3d93b330f91179433f9bb29351) Thanks [@bmatge](https://github.com/bmatge)! - **app-sidemenu** : resserrage du menu latéral du guide de `280px` à `220px`. Les libellés longs (entrées sur deux lignes) sont désormais autorisés via `white-space: normal` + `word-break: break-word` sur `.fr-sidemenu__link` et `.fr-sidemenu__btn`. Le contenu principal gagne en largeur sans tronquer les titres.

## 0.6.0

### Minor Changes

- [#122](https://github.com/bmatge/dsfr-data/pull/122) [`bf2aab5`](https://github.com/bmatge/dsfr-data/commit/bf2aab569feed4c9fdf54a386535f9f0e0a34e5a) Thanks [@bmatge](https://github.com/bmatge)! - **dsfr-data-map** : renforcement de l'argumentaire de souveraineté numérique.
  - Nouvel attribut booléen `sovereign-only` qui restreint `tiles` aux seuls presets IGN (`ign-plan`, `ign-ortho`, `ign-topo`, `ign-cadastre`). Tout autre preset ou URL custom est refusé avec un avertissement console et remplacé par `ign-plan`.
  - Renommage du preset `osm` en `osm-fr` pour expliciter qu'il s'agit des serveurs de l'association OpenStreetMap France (loi 1901, hébergée en France), distincte de l'OpenStreetMap Foundation. L'alias `osm` reste accepté.
  - Export d'une fonction pure `resolveTilePreset(requested, sovereignOnly)` pour les tests et outils tiers.

  Ferme partiellement [#27](https://github.com/bmatge/dsfr-data/issues/27) (points 2 et 3).

## 0.5.1

### Patch Changes

- [#98](https://github.com/bmatge/dsfr-data/pull/98) [`3c6b558`](https://github.com/bmatge/dsfr-data/commit/3c6b5586f13bac92a39b2c54bdb1f79362b30677) Thanks [@bmatge](https://github.com/bmatge)! - Nettoyage mécanique des warnings ESLint (issue [#45](https://github.com/bmatge/dsfr-data/issues/45)) dans les packages publiés :
  - **`<\/script>` → `</script>`** dans `cdn-versions.ts` et les code generators (les deux produisent la même chaîne à l'exécution ; seul le source est plus propre).
  - **`@ts-ignore` → `@ts-expect-error`** sur les imports Vite `?inline` de `dsfr-data-map` et `dsfr-data-map-layer` (plus sûr : échoue si l'erreur type disparaît).
  - **`grist-adapter.ts`** : `console.info` → `console.warn` sur les 2 logs de fallback SQL endpoint (visibles dans la console navigateur).

  Aucun changement de comportement.

- [#70](https://github.com/bmatge/dsfr-data/pull/70) [`aff0232`](https://github.com/bmatge/dsfr-data/commit/aff02325849e3fb437918ec0ec665034f4a24f2f) Thanks [@bmatge](https://github.com/bmatge)! - Corrige une vulnérabilité de prototype pollution dans les helpers de traversée JSON : `getByPath`, `setByPath` et la résolution de champ dotted de `dsfr-data-facets` rejettent désormais les clés `__proto__`, `constructor` et `prototype` (retournent `undefined` ou no-op). Détecté par Semgrep SAST ([#57](https://github.com/bmatge/dsfr-data/issues/57)).

- [#97](https://github.com/bmatge/dsfr-data/pull/97) [`bf5eef4`](https://github.com/bmatge/dsfr-data/commit/bf5eef412a5dcbadfe79e035c07c3bc9c27c7f96) Thanks [@bmatge](https://github.com/bmatge)! - Durcissement XSS et sanitization dans les composants et adapters (triage baseline sécurité, code-scanning CodeQL + Semgrep) :
  - **ODS adapter** : échappement ODSQL désormais safe sur les backslashes (`\\` → `\\\\`) avant les doubles quotes, pour éviter qu'un `\"` utilisateur soit traité comme un quote déjà échappé.
  - **dsfr-data-search** : même fix sur l'échappement du terme de recherche envoyé via server-search.
  - **dsfr-data-normalize** : `stripHtml` boucle désormais jusqu'à stabilisation pour couvrir les patterns imbriqués type `<a<b>c>`.
  - **Preview template (`cdn-versions`)** : le strip des balises `<script ... dsfr-data ...>` utilise un regex linéaire (non-polynomial) et boucle jusqu'à stabilisation.
  - **Modal (`confirmDialog`)** : le message est désormais inséré via `textContent`, plus d'interpolation `innerHTML`.
  - **Product tour** : titre/description des steps insérés via `textContent`.

## 0.5.0

### Minor Changes

- Restructuration monorepo : la librairie de composants est desormais dans `packages/core/`, ce qui permet un versioning propre via Changesets. Le MCP SDK est mis a jour de 1.12.1 a 1.29.0, resolvant 3 vulnerabilites de securite.
