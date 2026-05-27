# dsfr-data

## 0.7.2

### Patch Changes

- [`f7cf020`](https://github.com/bmatge/dsfr-data/commit/f7cf0204332bc3214f58c8912ae37ff032b5ac11) Thanks [@bmatge](https://github.com/bmatge)! - fix(source): coalesce concurrent fetches pour éviter les aborts quand plusieurs `dsfr-data-query` délèguent server-side à la même source.

  Avant : chaque commande entrante déclenchait un refetch immédiat qui abortait le précédent. Sur un pipeline avec 3 queries partageant une source Grist, on observait 3 `NS_BINDING_ABORTED` consécutifs dans la console (puis 1 fetch final qui aboutissait). Le pire cas : si les queries délèguent des overlays conflictuels (ex : groupBy vs orderBy sur une colonne non groupée), l'ordre d'arrivée décidait des données visibles.

  Maintenant : `_scheduleFetch()` diffère le fetch au prochain macrotask via `setTimeout(0)`. Tous les `willUpdate` et commandes de délégation arrivant dans la même passe synchrone coalescent en un seul fetch avec la combinaison finale des overlays.

- [#219](https://github.com/bmatge/dsfr-data/pull/219) [`97bc49b`](https://github.com/bmatge/dsfr-data/commit/97bc49b21cf3662b535406279c99d52d1a7121a9) Thanks [@bmatge](https://github.com/bmatge)! - docs(builder): ajouter URL de la doc des composants dans le commentaire d'en-tête du code généré (closes [#209](https://github.com/bmatge/dsfr-data/issues/209), T-8 du rapport d'audit UX 2026-05-26).

  Toutes les 13 chaînes de templates HTML du `code-generator.ts` (variantes par type/mode : Graphique / Tableau / KPI / Nuage de points + embedded / dynamique) gagnent une seconde ligne de commentaire juste sous l'entête « généré avec dsfr-data Builder » :

  ```html
  <!-- Graphique généré avec dsfr-data Builder -->
  <!-- Doc des composants : ${PROXY_BASE_URL_EMBED}/specs/ -->
  ```

  L'URL est dérivée de `PROXY_BASE_URL_EMBED` (déjà exporté depuis `@dsfr-data/shared`) au moment de la génération du code — pas hardcodée — pour rester self-hostable conformément à l'épic [#168](https://github.com/bmatge/dsfr-data/issues/168) et l'ADR-026 (« accès direct `import.meta.env`, pas de valeur en dur »). Sur le déploiement de référence : `https://chartsbuilder.matge.com/specs/`. Sur une instance self-hostée : l'URL du domaine embed configuré via `VITE_PROXY_URL_EMBED`.

  Pour Sami (P2 data analyst) qui copie le code dans son site, c'est un point d'entrée immédiat vers la doc des attributs des composants dsfr-data utilisés. Avant, il devait chercher à la main.

  Ferme l'EPIC [#188](https://github.com/bmatge/dsfr-data/issues/188) (l'autre sous-issue [#208](https://github.com/bmatge/dsfr-data/issues/208) — refactor mapping `<dsfr-data-chart>` — a été closed `not planned` lors du nettoyage backlog UX 2026-05-27).

- [#162](https://github.com/bmatge/dsfr-data/pull/162) [`57b9841`](https://github.com/bmatge/dsfr-data/commit/57b9841ee8e92b8f9c46639d64a08aa38c4c3e74) Thanks [@bmatge](https://github.com/bmatge)! - Rend visible l'erreur de configuration `id` manquant (et `source`/`left`/`right`/`on` selon le composant) sur les composants pipeline (`dsfr-data-facets`, `dsfr-data-query`, `dsfr-data-normalize`, `dsfr-data-search`, `dsfr-data-join`).

  Auparavant un `console.warn` silencieux laissait le développeur sans aucun signal visible quand un de ces attributs était oublié — le composant ne rendait simplement rien.

  Désormais :
  - `console.error` (croix rouge en DevTools) au lieu de `console.warn`
  - attribut `data-dsfr-config-error="<cause>"` posé sur l'élément (visible immédiatement dans l'inspecteur)
  - composants visuels (`dsfr-data-facets`, `dsfr-data-search`) : alerte DSFR `fr-alert--warning` rendue à la place du contenu attendu

  `dsfr-data-join` gagne au passage un check explicite de `id`/`left`/`right`/`on` (auparavant `return` silencieux).

- [#163](https://github.com/bmatge/dsfr-data/pull/163) [`78c1d15`](https://github.com/bmatge/dsfr-data/commit/78c1d15b2ecf6cc8721cf156a81435cacf785135) Thanks [@bmatge](https://github.com/bmatge)! - Inclut `dsfr-data-join` dans le bundle `dsfr-data.core.{esm,umd}.js`.

  Auparavant le composant n'était disponible que via le bundle complet `dsfr-data.umd.js`. Tous les autres composants pipeline (transformateurs purs : `dsfr-data-normalize`, `dsfr-data-query`...) étaient déjà dans `core` — `dsfr-data-join` était la seule exception, ce qui transformait silencieusement les `<dsfr-data-join>` en `HTMLUnknownElement` quand le code généré par le builder (qui charge `core.umd.js` par défaut) tentait de l'utiliser. Aucune erreur, aucun warning, juste un pipeline qui ne produit rien.

  Surcoût : ~3 KB (raw) / ~1 KB (gzip) sur le bundle core.

- [#215](https://github.com/bmatge/dsfr-data/pull/215) [`f849166`](https://github.com/bmatge/dsfr-data/commit/f849166daf9e69169398ae4d5213f6e993de05c3) Thanks [@bmatge](https://github.com/bmatge)! - feat(sources): édition des sources manuelles (closes [#186](https://github.com/bmatge/dsfr-data/issues/186), EPIC [#186](https://github.com/bmatge/dsfr-data/issues/186) complet, audit UX 2026-05-26 §M-S-3).

  Avant : une fois une source manuelle créée (via Tableau / Coller JSON / Importer CSV), impossible de l'éditer. Une typo dans une cellule obligeait à supprimer la source et tout recommencer. Le CSS `.edit-source-btn` existait déjà dans `apps/sources/src/styles/sources.css` mais aucun code TypeScript ne le créait.

  Après : bouton crayon à gauche du bouton poubelle sur chaque source manuelle (sources API/Grist/jointures ne sont pas éditables ici car dérivées d'un état externe). Au clic, la modale « Nouvelle source manuelle » s'ouvre en mode édition :
  - Titre : « Modifier la source » (au lieu de « Nouvelle source manuelle »)
  - Bouton : « Enregistrer les modifications » (au lieu de « Sauvegarder »)
  - Champ Nom pré-rempli
  - Mode Tableau forcé + grille pré-remplie avec les données existantes (la vue tableau est la plus générale, l'utilisateur peut switch vers JSON/CSV s'il veut tout remplacer en collant un nouveau payload)
  - À la validation : **mise à jour en place** (même `id`), ce qui préserve les références existantes depuis les favoris, dashboards et l'état builder
  - À l'annulation : aucune modification

  Nouveaux exports :
  - `loadTableData(data)` dans `apps/sources/src/editors/table-editor.ts` — pré-remplit le table editor avec un tableau de records (union des clés pour les colonnes, lignes ordonnées comme à la sauvegarde). Réutilisable pour de futurs flows d'édition.
  - `editSource(id)` dans `apps/sources/src/connections/connection-manager.ts` — ouvre la modale en mode édition (no-op si la source n'est pas de type `manual`).

  `state.editingSourceId: string | null` ajouté au state pour le suivi du mode édition (pattern identique à `editingConnectionId` déjà en place).

  Toasts : `« Source X mise à jour. »` après update, `« Source X ajoutée. »` après création (avant, aucun feedback explicite, cf. T-3 audit UX).

- [#174](https://github.com/bmatge/dsfr-data/pull/174) [`5150f99`](https://github.com/bmatge/dsfr-data/commit/5150f996bd504752a89bb86532e286536567052e) Thanks [@bmatge](https://github.com/bmatge)! - build: fail-fast sur les variables d'environnement requises au lieu de fallback silencieux vers le domaine de référence (closes [#168](https://github.com/bmatge/dsfr-data/issues/168) P1 step 3-4, PR-3 du plan de découpage).

  **Nouveau script `scripts/validate-build-env.ts`** exécuté en `prebuild:all` (via `validate:build-env`). Échoue avec un message clair si `VITE_PROXY_URL` manque. Bypass explicite via `DSFR_DATA_DEV_BUILD=1` pour les builds dev/test sans `.env`.

  **Fail-fast runtime côté Express** (`server/src/utils/mailer.ts`) : plus de fallback vers `https://chartsbuilder.matge.com` si `APP_URL` manque — l'envoi d'email throw à la première utilisation avec un message indiquant la résolution. Évite d'envoyer un email avec un lien pointant vers la mauvaise instance.

  **MCP server** (`mcp-server/src/index.ts`) : ajout de la variable d'environnement `DSFR_DATA_BASE_URL` comme alternative à `--url`. Le default `chartsbuilder.matge.com` est conservé (renommé `DEFAULT_PUBLIC_INSTANCE`) — exception assumée car le MCP est un tool public utilisé pour la découverte (`npx dsfr-data-mcp`).

  **Préservation du déploiement de référence** : les scripts `docker/deploy.sh` et `docker/deploy-server.sh` génèrent automatiquement `VITE_PROXY_URL` et `APP_URL` à partir de `APP_DOMAIN` si absents du `.env`. Le déploiement de référence continue de fonctionner sans intervention manuelle.

  **Workflows CI adaptés** : `release.yml` (Tauri) utilise `DSFR_DATA_DEV_BUILD=1`, `docker-scan.yml` (Trivy) passe `--build-arg VITE_PROXY_URL=https://example.test`, `dast.yml` ajoute les vars au `.env` généré.

  `.env.example` restructuré : marquage explicite `[REQUISE]` / `[optionnelle]` / `[serveur]` et section `APP_URL` ajoutée.

- [#170](https://github.com/bmatge/dsfr-data/pull/170) [`b407c37`](https://github.com/bmatge/dsfr-data/commit/b407c37ddfad12b54e1eb89af3f265913701408b) Thanks [@bmatge](https://github.com/bmatge)! - fix(map-popup): `<dsfr-data-map-popup>` trouve maintenant son `<template>` enfant même quand le script de la lib est chargé dans `<head>` sans `defer`.

  Avant : le lookup `querySelector('template')` était fait dans `connectedCallback()`, qui est appelé par le parser HTML avant que les enfants du composant ne soient parsés. Résultat : `_templateEl` restait `null`, et le composant retombait silencieusement sur l'affichage en tableau auto (`_buildAutoTable`) sans warning. Closes [#156](https://github.com/bmatge/dsfr-data/issues/156).

  Maintenant : le lookup est différé au premier appel de `hasTemplate()` ou `_renderTemplate()` (typiquement au clic sur un marker), moment où le `<template>` enfant est garanti présent. Le résultat est ensuite mis en cache.

- [#176](https://github.com/bmatge/dsfr-data/pull/176) [`e2d6d30`](https://github.com/bmatge/dsfr-data/commit/e2d6d30c0e608d3c3d8c4a35d5284fdea6f97ed0) Thanks [@bmatge](https://github.com/bmatge)! - fix(app-sidemenu): la contrainte `flex: 0 0 220px` était posée sur le `<nav class="guide-sidemenu">` interne au lieu du host `<app-sidemenu>`, qui est en réalité l'enfant direct du flex container `.guide-layout`. Résultat : la largeur n'était pas contrainte et les libellés longs (« Élections des chambres d'agriculture 2025 — Résultats », etc.) restaient sur une seule ligne, élargissant le menu latéral au-delà de la spec DSFR.

  Maintenant : les règles flex / sticky / overflow sont posées sur `app-sidemenu` directement (light DOM, donc sélecteur de tag valide), les libellés wrappent sur 2 lignes dans une colonne de 220px.

- [#173](https://github.com/bmatge/dsfr-data/pull/173) [`87642b4`](https://github.com/bmatge/dsfr-data/commit/87642b4459a531fd5a95aadb166383e7c78a6795) Thanks [@bmatge](https://github.com/bmatge)! - build(docker): permet `docker compose build` derrière un proxy d'entreprise (`HTTP_PROXY`, `HTTPS_PROXY`, `NO_PROXY` passés au builder) et élargit la CSP nginx aux domaines réellement utilisés en self-hosted.

  **Proxy build-time** (P2) : `ARG`/`ENV` `HTTP_PROXY` + `HTTPS_PROXY` + `NO_PROXY` ajoutés au stage builder des deux Dockerfiles, propagés via `build.args` dans les deux docker-compose. Build-time strict (pas d'ENV runtime — pas de pollution de l'image finale). Le runtime côté Node sera traité dans PR-4 de l'epic.

  **CSP self-hostable** (P5) : `docker/security-headers.conf` autorisait `cdn.jsdelivr.net` + `*.opendatasoft.com` + 5 APIs IA, mais bloquait toutes les tuiles cartes (IGN, OSM-FR) et tous les portails open data gouvernementaux non-ODS (`data.economie.gouv.fr`, `tabular-api.data.gouv.fr`, `api.insee.fr`, etc.). Ajout ciblé : `data.geopf.fr` + `*.tile.openstreetmap.fr` dans `img-src`, wildcard `*.gouv.fr` dans `connect-src`, `unpkg.com` (alt CDN pour `VITE_LIB_URL`) dans script/style/font-src. Renforcement durcissement : `frame-ancestors 'none'`, `base-uri 'self'`, `form-action 'self'`.

  PR-2 de l'epic [#168](https://github.com/bmatge/dsfr-data/issues/168) (rendre dsfr-data self-hostable).

- [#214](https://github.com/bmatge/dsfr-data/pull/214) [`e21151a`](https://github.com/bmatge/dsfr-data/commit/e21151afcaea6a845c6564fc2275d8fab511e688) Thanks [@bmatge](https://github.com/bmatge)! - fix(ui): restaurer les accents français manquants sur ~1200 chaînes UI (closes [#192](https://github.com/bmatge/dsfr-data/issues/192), audit UX 2026-05-26 §T-1).

  Avant : labels, hints, tooltips, validations, messages d'erreur écrits sans accents partout (« donnees », « categorie », « agreger », « Genere », « Apercu », « Telechargement », « Cle », « ecran », « previsualiser », …). Pour un produit qui se présente conforme DSFR / République Française, ça donnait une impression d'amateurisme contradictoire avec le ton institutionnel attendu.

  Après : 1217 remplacements sur 103 fichiers d'`apps/` + `packages/` (`.ts`, `.html`, `.css`, `.md`), via une passe scriptée appliquant 80+ patterns (mots français sans ambiguïté avec l'anglais ou les identifiants). Les tests qui hardcodaient les anciennes chaînes ont été mis à jour en parallèle (102 remplacements sur 30 fichiers de `tests/`).

  **Hors scope** (volontairement) :
  - Les mots ambigus avec l'anglais (`selection`/`generation`/`definition`/`present`/`detail`) restent non touchés — chaque occurrence demande un jugement contextuel (les commentaires de code en anglais ne doivent pas être accentués).
  - `series`/`Series` exclu pour la même raison + collision avec les identifiants HTML (`extra-series-container`).
  - Les accents grammaticaux ponctuels (`a` → `à`, `ou` → `où`, `la` → `là`) — dépendent de la position dans la phrase.

  **Garde-fou anti-régression** : nouveau script [`scripts/check-french-accents.sh`](scripts/check-french-accents.sh) exécuté par `npm run check:accents` et câblé dans le job CI principal (`.github/workflows/ci.yml`, juste après `check:sri`). Liste blanche de 80+ patterns qui, s'ils réapparaissent en source UI, font échouer la CI avec un message actionnable. Tests `/tests/` exclus du check (chaînes mock).

- [#178](https://github.com/bmatge/dsfr-data/pull/178) [`d684a2f`](https://github.com/bmatge/dsfr-data/commit/d684a2f23e20bf5012caa63e107c99149e275706) Thanks [@bmatge](https://github.com/bmatge)! - build: honore `HTTP_PROXY`/`HTTPS_PROXY`/`NO_PROXY` au runtime côté Node (closes [#168](https://github.com/bmatge/dsfr-data/issues/168) P3, PR-4 du plan de découpage).

  Les services Node embarqués dans le conteneur (`scripts/ia-default-server.js` qui proxifie l'API Albert, et `mcp-server` qui télécharge `skills.json` au démarrage) acheminent désormais leurs appels HTTP sortants via le proxy d'entreprise quand `HTTP_PROXY` ou `HTTPS_PROXY` est défini au niveau du service docker-compose. `NO_PROXY` est honoré (hostnames Docker internes comme `mariadb` ou `mailserver` peuvent y être listés).

  **Implémentation** : `undici.EnvHttpProxyAgent` installé comme dispatcher global au démarrage, **uniquement** si une variable proxy est présente. Sans variable, aucun dispatcher n'est touché — comportement strictement inchangé. Le module `undici` (zéro dépendance runtime) est ajouté aux Dockerfiles via `COPY --from=builder /app/node_modules/undici`.

  **Refactor `ia-default-server.js`** : passage de `http.request`/`https.request` à `undici.request` pour bénéficier du dispatcher global. Le streaming de la réponse vers le client reste identique (`upstream.body.pipe(res)`).

  **docker-compose** : les variables `HTTP_PROXY`/`HTTPS_PROXY`/`NO_PROXY` étaient déjà propagées au `build.args` depuis PR-2 ; elles sont maintenant également exposées dans `environment:` pour le runtime du conteneur.

  `.env.example` et `docs/DEPLOYMENT.md` mis à jour pour refléter la portée build + runtime.

- [#179](https://github.com/bmatge/dsfr-data/pull/179) [`23176ef`](https://github.com/bmatge/dsfr-data/commit/23176ef94aeb5cf2b309db26040ab415a8dc186a) Thanks [@bmatge](https://github.com/bmatge)! - docs(self-hosted): section dédiée + annotations DÉSACTIVABLE sur les routes nginx (closes [#168](https://github.com/bmatge/dsfr-data/issues/168) P4+P6, PR-5 du plan de découpage).

  Clôt l'épic [#168 (self-hostable)](https://github.com/bmatge/dsfr-data/issues/168) avec deux livrables :

  **`docs/DEPLOYMENT.md` — section "Configuration self-hosted"** couvrant les 3 scénarios :
  - A. Déploiement de référence (Traefik intégré, rien à configurer au-delà de `APP_DOMAIN`).
  - B. Derrière un proxy d'entreprise (`HTTP_PROXY`/`HTTPS_PROXY`/`NO_PROXY` build + runtime — résumé des PR-2 et PR-4).
  - C. Reverse externe gérant les routes `/*-proxy/` (commenter les blocs concernés + déclarer le chemin équivalent dans le reverse externe).

  Le **contrat exhaustif des chemins de proxying** (`/grist-gouv-proxy/`, `/grist-proxy/`, `/albert-proxy/`, `/ia-proxy`, `/ia-server-config`, `/ia-proxy-default`, `/insee-proxy/`, `/tabular-proxy/`, `/cors-proxy`) est fourni sous forme de tableau : cible upstream, méthodes acceptées, politique de cache, headers CORS attendus, particularités (strip Origin/Referer, paires obligatoires…).

  **Annotations dans `docker/nginx.conf` + `docker/nginx-db.conf`** : chaque bloc `location /*-proxy/` reçoit un commentaire `DÉSACTIVABLE` (3-4 lignes) avec la cible upstream et un renvoi vers la section du contrat dans `docs/DEPLOYMENT.md`.

  **Références ajoutées** depuis `README.md` (paragraphe "Déployer la webapp") et `CLAUDE.md` (section "Déploiement serveur") vers la nouvelle section.

- [#181](https://github.com/bmatge/dsfr-data/pull/181) [`89a2951`](https://github.com/bmatge/dsfr-data/commit/89a2951aa283f802dfb73ddc319f1680a7d63c0e) Thanks [@bmatge](https://github.com/bmatge)! - build: séparation `PROXY_BASE_URL` (runtime app) / `PROXY_BASE_URL_EMBED` (code généré) / `BEACON_BASE_URL` (télémétrie) — closes [#180](https://github.com/bmatge/dsfr-data/issues/180).

  **Note sur la classification semver** (relue en fin de session 2026-05-27) : initialement classé `minor` au prétexte de « nouveaux exports », ce changement n'ajoute en réalité aucun symbole à l'API publique du package npm `dsfr-data` (publié depuis `packages/core/`). Les nouvelles exports `PROXY_BASE_URL_EMBED` / `BEACON_BASE_URL` vivent uniquement dans `@dsfr-data/shared` qui est un **package interne** (workspace npm, jamais publié). Du point de vue d'un consumer npm de `dsfr-data`, ce changement est purement infrastructurel (les URL de proxy bakées dans le bundle restent fonctionnelles ; aucune signature publique modifiée). Reclassement en `patch` justifié.

  Permet aux opérateurs self-hostés de découpler le domaine où l'app tourne (potentiellement interne / privé) du domaine inliné dans les widgets générés (qui doit être public et stable pour fonctionner sur des sites tiers). Et optionnellement un troisième domaine pour la collecte télémétrie.

  **Cascade de fallback** (aucune régression sans changement explicite côté `.env`) :

  ```
  BEACON_BASE_URL = VITE_BEACON_URL || PROXY_BASE_URL_EMBED || PROXY_BASE_URL
  PROXY_BASE_URL_EMBED = VITE_PROXY_URL_EMBED || PROXY_BASE_URL
  PROXY_BASE_URL = VITE_PROXY_URL || 'https://chartsbuilder.matge.com'
  ```

  **Répartition par usage** :
  - `PROXY_BASE_URL` (runtime) : `apps/grist-widgets`, `apps/monitoring`, `apps/sources`
  - `PROXY_BASE_URL_EMBED` (embed) : code généré par `apps/builder`, `apps/builder-ia`, `apps/builder-carto` ET adapters de `packages/core` (via `getProxyConfig()` — les adapters tournent dans le bundle lib chargé sur des sites tiers)
  - `BEACON_BASE_URL` (télémétrie) : URL bakée dans le bundle lib `packages/core/dist/dsfr-data.*.js`

  **Validation empirique** : avec `VITE_PROXY_URL=https://app.test VITE_PROXY_URL_EMBED=https://cdn.test VITE_BEACON_URL=https://analytics.test`, les bundles produits respectent la séparation (vérifié par grep — `cdn.test` dans le code embed, `app.test` uniquement dans les apps runtime, `analytics.test` dans le bundle lib pour le beacon).

  **Documentation** : nouveau Scénario D dans `docs/DEPLOYMENT.md` §"Configuration self-hosted" — "app interne + widgets publics" avec la cascade et un protocole de validation reproductible.

  **Infra** : Dockerfiles + docker-compose propagent les 3 variables au build. Tests : 2946/2946 ✅.

- [#212](https://github.com/bmatge/dsfr-data/pull/212) [`d92ee5d`](https://github.com/bmatge/dsfr-data/commit/d92ee5d6a842dd67d23a2f63f9f5d33a6759cc18) Thanks [@bmatge](https://github.com/bmatge)! - fix(ux): feedback systémique sur les 3 actions critiques de l'audit UX 2026-05-26 (EPIC [#182](https://github.com/bmatge/dsfr-data/issues/182), issues [#189](https://github.com/bmatge/dsfr-data/issues/189) / [#190](https://github.com/bmatge/dsfr-data/issues/190) / [#191](https://github.com/bmatge/dsfr-data/issues/191)).
  - **[#189](https://github.com/bmatge/dsfr-data/issues/189) — Sources / test de connexion API silencieux** : `saveConnection()` catche désormais les erreurs HTTP, affiche un `toastError` actionnable (« Connexion impossible : Ressource introuvable. Vérifiez l'URL de la source. ») via le helper `httpErrorMessage()` existant, et affiche un `toastSuccess` au succès (« Connexion « X » ajoutée. »). Les inner functions `saveGristConnection`/`saveApiConnection` retournent désormais `boolean` pour distinguer validation-failed (warning déjà affiché) de success.
  - **[#190](https://github.com/bmatge/dsfr-data/issues/190) — Sources / pagination automatique 100 pages sans stop** : `loadApiData()` ne charge plus que **1 page par défaut**. Si l'API expose une pagination (`links.next`, `meta`, `next_page`), une **bannière** apparaît au-dessus de l'aperçu avec 2 boutons : « Charger 5 pages de plus » (cap soft `SOFT_MAX_PAGES`) et « Tout charger » (cap dur `HARD_MAX_PAGES = 100`). Pendant le chargement additionnel, la bannière affiche un **bouton « Stop »** qui annule via `AbortController`. Si l'utilisateur interrompt, les données chargées jusque-là sont préservées et il peut reprendre. Le code est restructuré en helpers (`runFetchLoop`, `extractDataFromPage`, `detectNextUrl`, `commitLoadedData`) pour la lisibilité.
  - **[#191](https://github.com/bmatge/dsfr-data/issues/191) — Builder / bouton Favoris silencieux** : remplacement du `prompt()` natif (modale système moche que les utilisateurs prenaient pour un alert) par le nouveau `promptDialog()` DSFR du package `@dsfr-data/shared`. Ajout d'un `toastSuccess` au save (« Graphique « X » ajouté à vos favoris. »). **Idempotence** : si le code généré est déjà en favoris, `toastInfo` (« Ce graphique est déjà dans vos favoris (« Y »). ») au lieu de créer un doublon — résout le bug du « 3 clics = 3 doublons ». L'**icône étoile** passe de contour (`ri-star-line`) à pleine (`ri-star-fill`) quand le code courant est en favoris, et se met à jour automatiquement après chaque `generateChart()` via la nouvelle fonction `syncFavoriteIcon()`.

  **Nouveau export public dans `@dsfr-data/shared`** : `promptDialog(message, defaultValue?, options?)` — équivalent DSFR de `window.prompt()`, retourne `Promise<string | null>` (null si annulé). Réutilise les styles CSS existants de `confirmDialog()`. Supporte Enter pour valider, Escape pour annuler, click-outside pour annuler.

- [#217](https://github.com/bmatge/dsfr-data/pull/217) [`32ec226`](https://github.com/bmatge/dsfr-data/commit/32ec226821fb98fb93708f4b1030be697e7a3763) Thanks [@bmatge](https://github.com/bmatge)! - fix(ux): polish batch — 6 quick wins de la salve 2 du rapport d'audit UX 2026-05-26.

  Petits ajustements indépendants extraits de la salve 2 du plan (mineurs + suggestions reportés après les 3 EPIC structurants déjà livrés). Pas d'issues GitHub dédiées — cf. plan `~/.claude/plans/je-veux-que-tu-vectorized-raven.md`.
  - **S-H-3** : badge header `Beta 0.7.0` (orange `fr-badge--warning`, anxiogène) → **`Aperçu 0.7.0`** (bleu `fr-badge--info`) avec tooltip explicatif « Outil en évolution, vos exports restent stables ». Pour Marie (P1), le label « BETA » sur un site officiel suggère « instable / pas pour la prod ». « Aperçu » est neutre.
  - **m-S-1** : tour Sources step 3 — « Sélectionnez une connexion pour parcourir ses tables… » (théorique au 1er accès) → **« Une fois une connexion ajoutée, vous pourrez parcourir ses tables… »** (cohérent quand zéro connexion).
  - **m-S-2** : bouton « Rafraîchir » désormais masqué quand la source courante est de type `manual` ou `join` (pas de données distantes à rafraîchir). Réaffiché automatiquement quand l'utilisateur sélectionne une connexion API/Grist.
  - **m-S-3** : couleurs des badges « API / Grist / Manuel / Jointure » alignées sur la palette DSFR officielle (`#000091` Bleu France / `#18753C` Vert émeraude / `#A558A0` Violet macaron / `#B34000` Orange terre-battue, toutes définies dans `packages/shared/src/constants/dsfr-palettes.ts`). Le violet custom `#9333ea` qui faisait l'objet du finding est remplacé ; les 3 autres sont aussi alignés pour la cohérence.
  - **m-B-1** : tour Builder step 1 — retire la mention « cliquez sur une des cartes d'exemple » qui n'existent pas dans l'UI. Nouveau wording : « Commencez ici : choisissez une source de données existante dans la liste déroulante. Pas encore de source ? Créez-en une depuis l'app Sources. »
  - **m-B-5** : `CHART_TYPE_LABELS.bar = 'Barres verticales'` → **`'Barres'`** pour aligner avec le libellé du bouton de la grille (« Barres »). Plus de divergence entre le bouton sélectionné et le résumé de la section quand collapsée.

  **m-B-4 vérifié sans changement** : le feedback « Copié ! » sur le bouton « Copier le code » existe déjà (`apps/builder/src/ui/ui-helpers.ts:174-180`, swap d'innerHTML 2 secondes). L'audit suspectait son absence — c'était en fait déjà implémenté.

- [#218](https://github.com/bmatge/dsfr-data/pull/218) [`c76f310`](https://github.com/bmatge/dsfr-data/commit/c76f310088bc96ad357e9046f8c1c4a87ed8852b) Thanks [@bmatge](https://github.com/bmatge)! - fix(ux): polish batch 3 — m-B-6 + T-5 + T-6 (salve 2 de l'audit UX 2026-05-26).

  3 quick wins indépendants centrés sur le Builder, prolongeant les patches polish déjà livrés ([#217](https://github.com/bmatge/dsfr-data/issues/217) batch 2). Pas d'issues GitHub dédiées (salve 2 reportée sans décomposition dans le plan `~/.claude/plans/je-veux-que-tu-vectorized-raven.md`).

  **§m-B-6 — Warning carte départementale quand la source ne contient pas de codes INSEE**

  Quand l'utilisateur choisit le type « Carte départementale » sur une source qui contient des noms (« Île-de-France »…) mais pas de codes département, le select Code département reste vide silencieusement et la carte ne s'affiche pas. Nouvelle détection : `findDeptCodeField()` parcourt les 50 premières lignes des champs string/number et valide via `isValidDeptCode()` (existant dans `@dsfr-data/shared`) ; si au moins 80% des valeurs non-vides d'une colonne sont des codes valides, on la considère candidate. Sinon, affichage d'un encadré jaune « Aucun code département détecté — Convertissez vos noms en codes ou choisissez un autre type de graphique ». Re-évalué quand : (1) le type de graphique change vers/depuis « map », (2) une source est chargée et `populateFieldSelects()` est appelée.

  **§T-5 — Aperçus visuels des palettes de couleurs**

  Sous le select `#chart-palette`, nouveau strip de swatches qui affiche les 5 couleurs de la palette sélectionnée. Mis à jour à l'ouverture du Builder + à chaque changement de palette + à l'auto-swap vers `sequentialAscending` quand le type passe en `map`. Utilise `PALETTE_COLORS` déjà exporté depuis `@dsfr-data/shared`. CSS minimal (~10 lignes : flex row de spans avec background-color).

  **§T-6 — Valeurs par défaut intelligentes : pré-sélection auto du seul candidat**

  `populateFieldSelects()` faisait déjà la pré-sélection par mot-clé (« nom » / « region » / « departement » / « label » pour les étiquettes ; « prix » / « score » / « valeur » / « value » pour les valeurs numériques). Nouveau fallback : si aucun mot-clé ne matche, mais qu'il n'y a **qu'un seul candidat** du bon type (string pour étiquettes, number pour valeurs), on le pré-sélectionne quand même. Économise un clic sur les datasets simples sans ambiguïté (ex : `{region, population}` → les 2 champs auto-remplis même si « population » ne contient pas de mot-clé). Test ajouté : `tests/apps/builder/sources-fields.test.ts:auto-selection T-6`. Test existant adapté pour refléter le nouveau contrat (« no auto-select » nécessite désormais 2+ candidats non-matchants).

  **Nouveaux exports dans `apps/builder/src/ui/ui-helpers.ts`** : `renderPaletteSwatches(paletteKey?)`, `findDeptCodeField()`, `updateMapCodeFieldWarning()`.

- [#213](https://github.com/bmatge/dsfr-data/pull/213) [`aa78d14`](https://github.com/bmatge/dsfr-data/commit/aa78d14544d583efef9b75623b4a73f9ccb2d864) Thanks [@bmatge](https://github.com/bmatge)! - fix(ux): wording naturel du Builder (EPIC [#183](https://github.com/bmatge/dsfr-data/issues/183), batch 1) — couvre les 3 issues Majeur ciblant les libellés du panneau de configuration.
  - **[#195](https://github.com/bmatge/dsfr-data/issues/195)** — Section « Habillage DataBox » → **« Cadre officiel DSFR »** (et toggle « Activer la DataBox DSFR » → **« Encadrer le graphique (titre, source, téléchargement) »**). Le nom interne `DataBox` ne fuite plus dans le label. L'aide tooltip explique déjà la chose, label maintenant cohérent.
  - **[#196](https://github.com/bmatge/dsfr-data/issues/196)** — Libellés de palettes plus parlants pour P1 : `Categorielle` → **« Couleurs distinctes par catégorie »**, `Sequentielle ↑` → **« Dégradé clair → foncé »**, `Divergente ↑` → **« Bicolore (centre clair) »**, etc. **Fix d'un leak** : le résumé de la section Apparence (visible quand collapsée) affichait la clé interne brute (`sequentialAscending`) — désormais passé par le nouveau `PALETTE_DISPLAY_NAMES[key]`. Tooltip d'aide `chart-palette` réécrit pour expliquer chaque famille de palettes en termes d'usage (« comparer des catégories indépendantes », « valeurs ordonnées », « écarts par rapport à une référence »).
  - **[#197](https://github.com/bmatge/dsfr-data/issues/197)** — Labels d'axes harmonisés sur le ton naturel déjà utilisé ailleurs dans la même section (« Si plusieurs lignes par catégorie, agréger par » est exemplaire) : `Axe X / Categories` → **« Étiquettes (axe horizontal) »**, `Axe Y / Valeurs (Serie 1)` → **« Valeur à mesurer (Série 1) »**. Messages de validation `getCompleteness()` alignés (« le champ Étiquettes », « le champ Valeur à mesurer ») pour qu'un user qui voit « Il manque : le champ X » retrouve le même libellé à l'écran.

  **Nouveau export public dans `@dsfr-data/shared`** : `PALETTE_DISPLAY_NAMES: Record<string, string>` — mapping clé interne → libellé utilisateur (cf. `packages/shared/src/constants/dsfr-palettes.ts`). À utiliser partout où le nom de palette apparaît dans l'UI rendue.

- [#216](https://github.com/bmatge/dsfr-data/pull/216) [`25c43df`](https://github.com/bmatge/dsfr-data/commit/25c43df567425af17bb7a6d8ef704ba83c21fc15) Thanks [@bmatge](https://github.com/bmatge)! - fix(ux): wording naturel des modales Sources (closes [#193](https://github.com/bmatge/dsfr-data/issues/193) + [#194](https://github.com/bmatge/dsfr-data/issues/194), EPIC [#183](https://github.com/bmatge/dsfr-data/issues/183) complet, audit UX 2026-05-26 §M-S-1 + §M-S-4).

  Dernier batch de l'EPIC [#183](https://github.com/bmatge/dsfr-data/issues/183) « wording, jargon & accents ». Couvre les 2 modales de l'app Sources qui restaient les plus chargées en jargon technique.

  **[#193](https://github.com/bmatge/dsfr-data/issues/193) — Modale Nouvelle connexion API**

  Renommages des 4 labels + hints :
  - `URL de l'API` (hint « endpoint JSON ») → **`URL des données`** (hint « Adresse complète d'une page qui renvoie des données au format JSON »)
  - `Méthode HTTP` + ajout d'un hint pédagogique (« Choisir GET sauf cas spécifique »)
  - `En-têtes (optionnel)` + hint avec JSON brut `Bearer xxx` → **`Authentification (optionnel)`** + hint accessible (« Si l'API demande un jeton ou une clé pour autoriser l'accès, ajoutez-le ici »)
  - `Chemin vers les données (optionnel)` (hint « Chemin JSON ») → **`Emplacement des données (optionnel)`** (hint « Si les données ne sont pas à la racine, indiquer où aller les chercher »)

  **Remplacement du textarea JSON brut par un éditeur clé/valeur** pour l'authentification : 2 inputs côte-à-côte (nom + valeur) + bouton « + Ajouter un en-tête » + bouton supprimer par ligne. Le textarea `#api-headers` est conservé en hidden pour rester la source de vérité JSON consommée par `saveApiConnection()` — synchronisé automatiquement à chaque modification de l'éditeur. Édition d'une connexion existante : les en-têtes JSON sont parsés et pré-remplis dans l'éditeur via `populateApiHeadersFromJson()`.

  Nouveaux exports dans `connection-manager.ts` : `addApiHeaderRow(name?, value?)`, `populateApiHeadersFromJson(jsonStr)`, `clearApiHeadersEditor()`.

  **[#194](https://github.com/bmatge/dsfr-data/issues/194) — Modale Joindre deux sources**

  Renommages des 5 labels + descriptions :
  - `Source gauche (principale)` → **`Source A (principale)`** + hint plus naturel
  - `Source droite` → **`Source B (complémentaire)`**
  - `Clé de jointure` (hint cryptique « champ_gauche=champ_droite ») → **`Colonne commune aux deux sources`** + hint accessible (« Le champ qui permet de relier les deux sources. Si les noms diffèrent : champ_A=champ_B »)
  - Les 4 types de jointure (`Left/Inner/Right/Full` avec parenthèses techniques) → descriptions en langage naturel :
    - Left → « Garder toutes les lignes de A, compléter avec B si possible (recommandé) »
    - Inner → « Garder uniquement les lignes présentes dans A et dans B »
    - Right → « Garder toutes les lignes de B, compléter avec A si possible »
    - Full → « Garder toutes les lignes des deux sources (union) »
  - `Préfixe des champs droite (en cas de collision)` → **`Préfixe pour les champs de B en cas de doublon`** + hint avec exemple concret

  Les `value` des options du select restent `left`/`inner`/`right`/`full` (aucun changement de logique côté `performJoin` dans `@dsfr-data/shared`).

  L'affichage « Champs gauche » / « Champs droite » dans le bloc d'info devient « Champs source A » / « Champs source B » pour rester cohérent.

  **EPIC [#183](https://github.com/bmatge/dsfr-data/issues/183) entièrement livré** après cette PR (6/6 sous-issues : [#192](https://github.com/bmatge/dsfr-data/issues/192) accents, [#193](https://github.com/bmatge/dsfr-data/issues/193) API wording, [#194](https://github.com/bmatge/dsfr-data/issues/194) jointures, [#195](https://github.com/bmatge/dsfr-data/issues/195) DataBox, [#196](https://github.com/bmatge/dsfr-data/issues/196) palettes, [#197](https://github.com/bmatge/dsfr-data/issues/197) axes).

- [#172](https://github.com/bmatge/dsfr-data/pull/172) [`e023667`](https://github.com/bmatge/dsfr-data/commit/e0236672951156dce40af326dd9224ca9a0c815f) Thanks [@bmatge](https://github.com/bmatge)! - build(docker): propage `VITE_PROXY_URL` et `VITE_LIB_URL` au build Docker via `ARG`/`ENV` (Dockerfile + Dockerfile.db) et `build.args` (docker-compose.yml + docker-compose.db.yml).

  Avant : ces variables étaient documentées dans `.env.example` mais n'arrivaient jamais jusqu'au build Vite à l'intérieur du conteneur. Pire, l'accès via indirection (`const _meta = import.meta as any; _meta.env?.VITE_PROXY_URL`) dans `packages/shared/src/api/proxy-config.ts` empêchait Vite de faire la substitution statique même en build local — les bundles retombaient systématiquement sur le fallback `https://chartsbuilder.matge.com`.

  Maintenant : `import.meta.env.VITE_PROXY_URL` est accédé directement (déclaration de type globale locale, sans coupler `@dsfr-data/shared` à Vite). Un `.env` avec `VITE_PROXY_URL=https://exemple.fr` produit un bundle où le domaine de référence est remplacé. Si la variable est absente, le fallback historique est préservé (la transformation en fail-fast est planifiée pour une future PR de l'epic [#168](https://github.com/bmatge/dsfr-data/issues/168)).

  Premier pas concret de l'epic [#168](https://github.com/bmatge/dsfr-data/issues/168) — rendre dsfr-data self-hostable (PR-1 du plan de découpage).

## 0.7.1

### Patch Changes

- **Apps** : alignement du template DSFR sur toutes les pages de la webapp. Le footer `<app-footer>` manquait dans `builder`, `builder-ia`, `sources` et `pipeline-helper`. Le module `dsfr.module.min.js` (requis pour le menu mobile de `<app-header>` et les modales DSFR) manquait dans `sources` et `pipeline-helper`. Le style de pré-chargement `view-transition` manquait dans `pipeline-helper` et `builder-carto`. Toutes les pages partagent maintenant la même shell DSFR, sauf `grist-widgets` (exclusion légitime : widget embarqué dans Grist).
- **Dark mode OS** : remplacement de `data-fr-theme` (attribut sans valeur, inopérant en DSFR 1.14) par `data-fr-scheme="system"` sur l'ensemble des pages HTML (apps, guide, specs, exemples). Le JS DSFR calcule désormais `data-fr-theme` automatiquement selon `prefers-color-scheme` de l'OS, activant le support natif light/dark partout.

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
