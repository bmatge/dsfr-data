# dsfr-data

## 0.7.0

### Minor Changes

- [`192ce2d`](https://github.com/bmatge/dsfr-data/commit/192ce2d1b211b8f061e60901c33cf23ad236240e) Thanks [@bmatge](https://github.com/bmatge)! - **Visites guidées (product tour)** : fiabilisation de la persistance et contrôle global.
  - Nouveau schéma de state `{ disabled?, tours: { [id]: { at, version } } }` avec migration automatique depuis l'ancien format plat `{ [id]: ISO }` et les anciennes clés `dsfr-data-tour-*`.
  - Support du versioning par tour (`TourConfig.version`) : bumper la version d'un tour le re-propose aux utilisateurs qui avaient déjà complété une version antérieure.
  - Nouveau lien **« Ne plus afficher les visites guidées »** dans chaque popover, qui désactive tous les tours. L'état est réversible depuis la page Guide.
  - Page **/guide** : la section « Visites guidées » expose désormais un tableau du statut par tour (badge Joué / Non joué, switch par tour, bouton Lancer / Relancer) et un switch global « Désactiver toutes les visites guidées ».
  - **Synchronisation serveur** du state via un nouvel endpoint `GET/PUT /api/tour-state` (migration DB v6, colonne `users.tour_state JSON`). Le state est synchronisé entre appareils pour les utilisateurs connectés, avec fallback localStorage en mode anonyme.
  - **Clear au logout** de la clé `dsfr-data-tours` pour ne pas fuiter l'état d'un compte à l'autre sur un poste partagé.
  - Nouveau registre `TOURS_REGISTRY` exporté depuis `@dsfr-data/shared` pour lister les tours depuis des UIs tierces (ex. page Guide).

### Patch Changes

- [`70d9910`](https://github.com/bmatge/dsfr-data/commit/70d9910d29216c005b749372db22b78d05539499) Thanks [@bmatge](https://github.com/bmatge)! - **fix(modals)** : ajout de `opacity:1;visibility:visible` en style inline sur les `<dialog>` des modales `auth-modal`, `password-change-modal` et `share-dialog`. Le correctif précédent (`data-fr-opened="true"`) ne suffisait plus : le CSS DSFR 1.14 continue de forcer `opacity:0;visibility:hidden` malgré l'attribut. Le style inline gagne sur la cascade et restaure l'affichage.

  **fix(nginx)** : refonte de la politique de cache. Les bundles `/dist/*.js` de la lib dsfr-data ont des noms stables (non-hashés) ; un cache `public, immutable, 1y` servait donc du code périmé aux visiteurs déjà venus tant que leur navigateur ne ré-interrogeait pas le serveur — c'est exactement ce qui masquait le correctif modale en prod. Nouvelle politique :
  - `/dist/*` : `no-cache, must-revalidate` (revalidation systématique via ETag, pas de re-téléchargement si inchangé).
  - Pages HTML : `no-cache, must-revalidate`.
  - Autres assets (JS/CSS hashés des apps Vite, images, polices) : `max-age=86400` (1 jour).

  Applicable aux deux variantes d'image : `nginx.conf` (lib seule) et `nginx-db.conf` (app complète).

- [`f30ac20`](https://github.com/bmatge/dsfr-data/commit/f30ac20507670ae121b5c9834d759fd4efa1de94) Thanks [@bmatge](https://github.com/bmatge)! - **fix(modals)** : ajout de `data-fr-opened="true"` sur les `<dialog>` DSFR des modales `auth-modal`, `password-change-modal` et `share-dialog`.

  Sans cet attribut, le CSS DSFR 1.14 applique `opacity: 0; visibility: hidden` même si les classes `fr-modal fr-modal--opened` sont présentes — la modale est rendue dans le DOM (height non nulle) mais reste invisible à l'écran. En prod, le clic sur « Connexion » semblait ne rien faire. Le handler `@click` était bien bindé et la modale bien rendue ; seule sa visibilité était annulée par la CSS du design system.

- [`cac1b1a`](https://github.com/bmatge/dsfr-data/commit/cac1b1ae5265f1376222dc243258e66ebb8ccb6e) Thanks [@bmatge](https://github.com/bmatge)! - **app-header** : renommage et réordonnancement des entrées de navigation. `Créer graphique` → `Créer un graphique`, `Créer carte` → `Créer une carte`, `Tableau de bord` → `Créer un tableau` (aligne avec les autres verbes d'action du menu), `Editeur HTML` → `Playground`, `Flux de données` → `Pipeline`. L'entrée `Créer un tableau` est déplacée juste après `Créer une carte` pour regrouper les trois outils de création.

- [#130](https://github.com/bmatge/dsfr-data/pull/130) [`3528c72`](https://github.com/bmatge/dsfr-data/commit/3528c7264109c8c4254cd494a40b4e8270627095) Thanks [@bmatge](https://github.com/bmatge)! - Fix : le bouton Connexion apparait desormais dans le menu mobile. La duplication des tools-links vers menu-links etait faite par DSFR avant la resolution de `isDbMode()` (fetch async sur `/api/auth/me`), donc le bouton ajoute apres n'etait jamais clone. On rend maintenant la liste dans les deux conteneurs via Lit, ce qui reste reactif aux changements d'etat auth.

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
