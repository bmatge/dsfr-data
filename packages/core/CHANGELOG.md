# dsfr-data

## 0.39.1

### Patch Changes

- [#1125](https://github.com/bmatge/dsfr-data/pull/1125) [`b65f7ef`](https://github.com/bmatge/dsfr-data/commit/b65f7ef327640f3672f415f65ef39338712b32dd) Thanks [@bmatge](https://github.com/bmatge)! - Studio IA : corrige les trois écarts de la mesure de base du banc de pertinence ([#1123](https://github.com/bmatge/dsfr-data/issues/1123)).
  `inspect_data` signale désormais les colonnes numériques constantes pour chaque valeur d'une
  colonne entité (« Nombre total d'actions est constant pour chaque Ville »), calcul borné et
  déterministe ; le signal figure aussi dans le contexte de données du prompt, et quand le modèle
  le tait après avoir posé des blocs, le Studio ajoute lui-même la note à sa réponse ; un bloc `datalist` n'exige plus
  `valueField` (schéma des outils, validation et vocabulaire alignés, `valueField` requis seulement
  pour trier ou agréger un tableau) ; une réponse finale écrite en JSON (`{"message": …}`, l'argument
  de `finish`) est lue comme un `finish` et l'usager n'en voit que le message.

- [#1127](https://github.com/bmatge/dsfr-data/pull/1127) [`1633a64`](https://github.com/bmatge/dsfr-data/commit/1633a64f8e19052212a8ae65b58db8ce3fbd59dd) Thanks [@bmatge](https://github.com/bmatge)! - Studio IA : le signal « total répété par entité » ([#1123](https://github.com/bmatge/dsfr-data/issues/1123)) n'annonce plus les coordonnées (latitude, longitude), constantes par lieu par nature — ni dans l'inspection des données, ni dans la note « À noter » hors carte.

## 0.39.0

### Minor Changes

- [#1114](https://github.com/bmatge/dsfr-data/pull/1114) [`95cf7da`](https://github.com/bmatge/dsfr-data/commit/95cf7da7ebcbb5f79c827b85008e7792a6ee0a7b) Thanks [@bmatge](https://github.com/bmatge)! - `dsfr-data-map-layer` : nouvel attribut `group-field` ([#1108](https://github.com/bmatge/dsfr-data/issues/1108)). Sur des données au format long (une ligne par couple ville × aide, coordonnées répétées), la couche trace un seul marqueur, cercle ou forme par valeur distincte du champ, et la popup, le volet ou la modale de `dsfr-data-map-popup` listent toutes les lignes du groupe : la valeur du groupe (ou `title-field`) en titre, puis un tableau des `popup-fields` avec une ligne par enregistrement, ou `popup-template` (ou le `<template>` du compagnon) appliqué à chaque ligne. Au plus 200 lignes, puis « … et N autres » ; tout est échappé. La position, `tooltip-field`, `color-field` et `radius-field` sont ceux du premier enregistrement positionné du groupe, et des coordonnées divergentes au sein d'un groupe sont signalées une fois en console. `max-items`, `getRenderedCount()` et le bandeau de troncature comptent des groupes ; `refine-on-click` filtre sur la valeur du groupe, et `dsfr-data-map-select` porte en plus `group` et `records`. L'attribut est compatible avec `cluster`, et sans effet sur `heatmap` (un avertissement le dit en console).

- [#1113](https://github.com/bmatge/dsfr-data/pull/1113) [`72a9da0`](https://github.com/bmatge/dsfr-data/commit/72a9da0405e44c49240f3250b259ce1ef3081d25) Thanks [@bmatge](https://github.com/bmatge)! - Studio IA et Tableau de bord : la carte d'un document sait afficher le clic dans un volet latéral ou une modale (`popupMode` : `popup`, `panel-right`, `panel-left`, `modal`, avec `popupTitleField`), poser un gabarit de popup (`popupTemplate`, « {nom} — {montant} € ») et regrouper les marqueurs proches (`cluster`, `clusterRadius`, couches marker seulement). L'export écrit un `<dsfr-data-map-popup for="…">` relié à la couche, avec un gabarit tiré des champs choisis ; le Tableau de bord conserve ces options. Le prompt du Studio tire désormais la liste des options de bloc du schéma de ses outils (les skills servent au sens des attributs, jamais à promettre une option), et un garde-fou bloquant (`npm run check:studio-couverture`) exige que chaque composant et attribut du manifeste soit écrit par le Studio ou exclu avec sa raison ([#1109](https://github.com/bmatge/dsfr-data/issues/1109)).

### Patch Changes

- [#1116](https://github.com/bmatge/dsfr-data/pull/1116) [`145de1b`](https://github.com/bmatge/dsfr-data/commit/145de1be2263b671434e22e4743fb336937854df) Thanks [@bmatge](https://github.com/bmatge)! - Studio IA et Tableau de bord : une couche de carte peut regrouper ses lignes par entité (`groupField`, écrit en `group-field` : un marqueur par ville, le clic liste toutes les lignes du groupe ; couches marker, circle et geoshape, refusé sur heatmap). Le gabarit de popup rédigé par l'assistant (`popupTemplate`) est désormais filtré à l'export : éléments script, iframe, object, embed, style et template, attributs `on*` et URL `javascript:`, `vbscript:` ou `data:` retirés, le reste inchangé ([#1109](https://github.com/bmatge/dsfr-data/issues/1109)).

## 0.38.1

### Patch Changes

- [#1106](https://github.com/bmatge/dsfr-data/pull/1106) [`9b41303`](https://github.com/bmatge/dsfr-data/commit/9b41303447850468a5521d559dd6892a272ef502) Thanks [@bmatge](https://github.com/bmatge)! - Assistant du Playground : « comment changer la limite de 15 ? » ou « où est la ligne pour changer la couleur ? » désigne et surligne la ou les lignes du code en cause, par une correspondance locale sur le code courant (balises, attributs, valeurs citées, synonymes français), sans appel au modèle. En secours, Albert reçoit un plan compact du code et peut citer un repère de code, montré seulement s'il désigne le code courant. Côté `mountAssistant` : options `correspondanceHorsRegistre`, `libelleHorsRegistre` et `reperesEnglobants` ; côté profil Albert : `contexte` ([#1105](https://github.com/bmatge/dsfr-data/issues/1105)).

## 0.38.0

### Minor Changes

- [#1101](https://github.com/bmatge/dsfr-data/pull/1101) [`32c0e32`](https://github.com/bmatge/dsfr-data/commit/32c0e32d034dc9aef96942b0eca433b5eaae4cf5) Thanks [@bmatge](https://github.com/bmatge)! - Skills IA : la skill métier `dataviz-metier` s'adresse par niveau et par référence ([#1035](https://github.com/bmatge/dsfr-data/issues/1035)). `get_skill("datavizMetier", niveau: "base" | "intermediaire" | "avance")` sert l'index puis les références du niveau, `get_skill("datavizMetier", reference: "choisir-la-forme")` une seule référence ; sans niveau, l'intermédiaire est servi et la réponse l'annonce, avec la façon de demander base ou avancé. Le vocabulaire des sections reste fermé (`guide`, `reference`, `exemples`, `pieges`). `list_skills` annonce niveaux et références, `get_relevant_skills` ne rend plus que l'index de la skill au lieu de ses quelque 1 400 lignes. Même adressage dans le Studio IA et l'assistant (client skills partagé) et dans le serveur MCP ; `skills.json` gagne `index`, `levels` et `references` pour cette skill, de façon additive.

- [#1103](https://github.com/bmatge/dsfr-data/pull/1103) [`9b03fe3`](https://github.com/bmatge/dsfr-data/commit/9b03fe3bce9fd66d2da21c636f589bc54877178b) Thanks [@bmatge](https://github.com/bmatge)! - `fetch-mode="export"` sur une source Tabular lit désormais l'export **Parquet** que data.gouv publie pour chaque ressource ([#1055](https://github.com/bmatge/dsfr-data/issues/1055), étude [#1022](https://github.com/bmatge/dsfr-data/issues/1022)) : le jeu entier en quelques requêtes par plages au lieu de pages de 200 (IRVE, 223 174 lignes : 0,66 s et 17 requêtes, contre 10,8 s et 125 requêtes pour 25 000 lignes en pagination), colonnes projetées depuis `select`, `max-records` qui borne les lignes lues. Les lignes ont la forme de l'API (entiers en nombres, dates en `AAAA-MM-JJ`, `__id`). Lignes brutes seulement : avec un `where`, `group-by`, `aggregate` ou `order-by` délégué, ou sans export pour la ressource, la source reste sur la pagination et le dit en console. Le lecteur (`hyparquet` + `fzstd`, MIT) est chargé à la demande : chunks séparés publiés dans `dist/`, que les bundles ESM et UMD importent tous deux (l’UMD par rapport à sa propre URL, sans CDN tiers) — jamais dans le bundle principal. Le mode par défaut ne change pas.

### Patch Changes

- [#1100](https://github.com/bmatge/dsfr-data/pull/1100) [`106ec46`](https://github.com/bmatge/dsfr-data/commit/106ec460221e4f9b26c4ad55d68ae10c62d06403) Thanks [@bmatge](https://github.com/bmatge)! - Diagnostic de la Carte ([#1021](https://github.com/bmatge/dsfr-data/issues/1021), lot 2) : quand la source d'une couche coupe le jeu (`meta.truncated`, cas ordinaire d'un gros jeu depuis que le builder aligne `limit` sur `max-items`), le nouveau constat `carte/jeu-tronque` remplace « données tronquées » et propose trois remèdes au choix, chacun avec son repère : composer par échelle (l'encart du panneau Couches), filtrer en amont, relever le plafond. Un constat peut désormais porter des `remedes` (`{ libelle, repere }`) ; le panneau de l'assistant les rend en boutons, un « Me montrer » par remède.

- [#1098](https://github.com/bmatge/dsfr-data/pull/1098) [`e9146bb`](https://github.com/bmatge/dsfr-data/commit/e9146bbd4982ee40927ff0d6d2150e1fe827037c) Thanks [@bmatge](https://github.com/bmatge)! - L'avertissement « comparée en TEXTE » d'un filtre de contexte ([#924](https://github.com/bmatge/dsfr-data/issues/924)) sort aussi quand le filtre est délégué à une source dont les lignes ne portent pas le champ ([#980](https://github.com/bmatge/dsfr-data/issues/980)) — résout le constat PG-030 du banc d'essai.
  
  Un KPI agrégé côté serveur (`select="sum(nb_missions) as m"`) filtré par région envoyait `reg = "01"` au portail, affichait « — » et ne disait rien : sa réponse ne ramène que `m`, le type de `reg` ne s'observait dans aucune ligne. Dans ce cas, et dans ce cas seulement, le type DÉCLARÉ par le jeu Opendatasoft (`/datasets/<id>`, lu une fois par jeu, après l'émission de la clause) décide. Le message et son vocabulaire sont inchangés, la preuve du type y devient `type « int » déclaré par le jeu`. La clause émise ne change pas ; une valeur sans zéro de tête (« 75 ») ne déclenche aucune requête ; le chemin client (lignes qui portent le champ) reste seul juge et ne lit jamais les métadonnées. Nouvelle méthode optionnelle d'adaptateur `describeFieldTypes`, implémentée par Opendatasoft.

- [#1086](https://github.com/bmatge/dsfr-data/pull/1086) [`3893d36`](https://github.com/bmatge/dsfr-data/commit/3893d36c59f5777a9cc46eea3369435e03f534aa) Thanks [@bmatge](https://github.com/bmatge)! - Chrome applicatif : l'en-tête se compacte au défilement (175 → 48 px, sélecteur d'app à la place des onglets), les apps de travail ont un pied de page d'une ligne, et le volet Diagnostic devient un onglet du panneau de l'assistant dans les cinq apps qui ont les deux (Builder, Carte, Tableau de bord, Pipeline, Playground) : plus de rail en bas d'écran, un seul compteur de constats. Le panneau de l'assistant passe son en-tête sur une ligne et range « Dire · Guider » sous le champ de saisie ; « Guider » devient le mode par défaut. Le menu « Plus d'actions » ne passe plus sous le panneau ouvert.

- [#1099](https://github.com/bmatge/dsfr-data/pull/1099) [`8cf4f2e`](https://github.com/bmatge/dsfr-data/commit/8cf4f2ee956a7b19a94b918691c2c10cd98ab477) Thanks [@bmatge](https://github.com/bmatge)! - Pipeline ouvert depuis le Builder ([#1095](https://github.com/bmatge/dsfr-data/issues/1095)) : il charge enfin le graphique transmis (il s'ouvrait sur l'exemple) et propose « Revenir au Builder », qui rouvre la configuration déposée au départ. Si le pipeline a été modifié entre-temps, le Builder avertit avant de reprendre sa configuration et permet de retourner au Pipeline sans rien perdre, comme au retour du Playground.

## 0.37.0

### Minor Changes

- [#1082](https://github.com/bmatge/dsfr-data/pull/1082) [`88597c7`](https://github.com/bmatge/dsfr-data/commit/88597c74096eb1e0e5ef45226da04e7346fed458) Thanks [@bmatge](https://github.com/bmatge)! - Le Studio IA remplace l'Assistant IA comme entrée usager ([#1081](https://github.com/bmatge/dsfr-data/issues/1081)). La navigation principale et l'accueil
  mènent au « Studio IA » ; `apps/builder-ia/` redirige vers lui en conservant requête et ancre, sauf avec
  `?ancien=1`, qui garde l'ancien Assistant joignable pour comparer. Le Studio reprend ce que l'Assistant
  offrait : configuration IA (URL, modèle, jeton, sonde des capacités) partagée avec les autres apps, jeux
  d'exemple et source ouverte depuis l'app Sources, « Voir les données », réponses en Markdown avec
  suggestions et raisonnement, ajout aux favoris, ouverture dans le Playground, export PNG/JPG, reclassement
  des skills par `/v1/rerank`. La sonde des capacités, le rerank et le rendu Markdown du chat passent dans
  `@dsfr-data/shared`. Le volet Diagnostic n'a plus qu'un libellé, « Demander à l'assistant » : dans le
  Studio, il pose le diagnostic dans la conversation sans l'envoyer.

## 0.36.0

### Minor Changes

- [#1031](https://github.com/bmatge/dsfr-data/pull/1031) [`93b2c1a`](https://github.com/bmatge/dsfr-data/commit/93b2c1a96665d8f8c5a2992813fa40e12ad09035) Thanks [@bmatge](https://github.com/bmatge)! - Le bandeau de `dsfr-data-map-layer` dit ce que la carte ne montre pas, avec les deux chiffres et le biais ([#1020](https://github.com/bmatge/dsfr-data/issues/1020)). La couche lit désormais la meta de sa source : quand la source n'a chargé qu'une partie du jeu (`limit`, `max-records`, plafond de pages), le bandeau apparaît même si `max-items` n'est pas dépassé, avec le total annoncé par l'API — « 1 000 premiers enregistrements affichés sur 34 826, dans l'ordre du fichier : la répartition affichée n'est pas représentative. » Aligner le `limit` de la source sur `max-items` devient donc sûr : il faisait disparaître le bandeau. Le bandeau porte `role="status"`, il est mis à jour sur place, passe à la ligne sur un écran étroit (320 px) et ne comporte aucun contrôle interactif ; l'événement `dsfr-data-map-layer-render` rapporte le total de la source. Le Builder Carto plafonne une nouvelle couche à 1 000 points et émet toujours `max-items` et le `limit` de la source avec la même valeur. La bibliothèque garde `max-items` = 5 000 par défaut.

- [#1063](https://github.com/bmatge/dsfr-data/pull/1063) [`1c5061a`](https://github.com/bmatge/dsfr-data/commit/1c5061a1a9335738a6a9f78fd02a2502368213d2) Thanks [@bmatge](https://github.com/bmatge)! - Volet Diagnostic : les constats s'affichent dans une pastille sur le rail, un onglet « Constats » et les cartes d'étape, avec un bouton « Me montrer » ([#1001](https://github.com/bmatge/dsfr-data/issues/1001)). `mountDiagnosticPanel` évalue les constats à chaque trace (option `constats: { contexte, regles }`, règles génériques par défaut), les expose par `constats()` et relaie « Me montrer » par `onMontrer(repere, constat)`. Le volet ne calcule plus lui-même ses marqueurs d'étape : une seule source, `evaluerConstats`.

- [#1072](https://github.com/bmatge/dsfr-data/pull/1072) [`3893235`](https://github.com/bmatge/dsfr-data/commit/3893235d31e1f1f72597c98767ba23a26976a9be) Thanks [@bmatge](https://github.com/bmatge)! - Analyse statique du balisage (`lintMarkup`, outil MCP `lint_markup`) : chaque constat porte désormais la ligne et la colonne de la balise concernée (`ligne`, `colonne`), l'attribut visé quand il y en a un (`attribut`), et un code de règle stable pour toutes les règles génériques (`balisage/attribut-inconnu`, `balisage/amont-absent`, `balisage/id-manquant`…). Le texte rendu au serveur MCP cite la ligne de chaque constat. Le Playground s'en sert pour surligner le code en cause ([#1009](https://github.com/bmatge/dsfr-data/issues/1009)).

- [#1041](https://github.com/bmatge/dsfr-data/pull/1041) [`6640cee`](https://github.com/bmatge/dsfr-data/commit/6640cee9e820570eaea058f68d1e6c870e08c2cc) Thanks [@bmatge](https://github.com/bmatge)! - L'analyse statique du balisage (`lintMarkup`, dans l'outil MCP `diagnose_widget_code`) couvre maintenant les cartes ([#995](https://github.com/bmatge/dsfr-data/issues/995)). Elle signale les pannes muettes visibles sans exécuter la page. Pour `dsfr-data-map-layer` : une couche placée hors de `<dsfr-data-map>`, un `lat-field` sans `lon-field` (et l'inverse), un `type="geoshape"` sans `geo-field` et un `max-items` qui n'est pas un nombre. Pour `dsfr-data-map-popup` : une popup hors de la carte, un `mode` inconnu et un `for` qui ne désigne aucune couche.
  
  Trois cas sont des avertissements, parce que la page peut quand même marcher :
  - une couche sans `lat-field`/`lon-field` ni `geo-field`, qui ne devine que `geo_point_2d`, `geopoint` et `geo_point` ;
  - un `max-items` nul ou négatif, qui désactive le plafond ;
  - une popup ou une infobulle sur une couche qui n'en branche pas (`geoshape` ou `circle` en `no-interactive`, `heatmap`).
  
  Chacun de ces constats porte un code de règle stable dans le nouveau champ optionnel `regle` de `LintFinding` (`carte/lat-sans-lon`, `carte/couche-hors-carte`, etc.). `lireBalises` rend désormais aussi, pour chaque balise, les balises `dsfr-data-*` ouvertes autour d'elle (`parents`).

- [#1062](https://github.com/bmatge/dsfr-data/pull/1062) [`644d15f`](https://github.com/bmatge/dsfr-data/commit/644d15fe399d2ce5afa99543de1a4c8251cab764) Thanks [@bmatge](https://github.com/bmatge)! - Outils de diagnostic partagés par les assistants ([#1010](https://github.com/bmatge/dsfr-data/issues/1010), ADR-143) : `run_and_trace`, `trace_pipeline` et `inspect_stage` quittent le studio pour `@dsfr-data/shared` (app-side), et un quatrième outil, `lister_constats`, rend au modèle les constats du diagnostic en texte français (id, gravité, cause, geste, preuve, repères). Sous « masquer les valeurs », la preuve de chaque constat est masquée. Le studio IA propose ce nouvel outil à son assistant.

- [#1070](https://github.com/bmatge/dsfr-data/pull/1070) [`d18e109`](https://github.com/bmatge/dsfr-data/commit/d18e109bfcf5f4a566e41b30b7435ccb6ae9fb29) Thanks [@bmatge](https://github.com/bmatge)! - Assistant contextuel ([#1011](https://github.com/bmatge/dsfr-data/issues/1011)) : `mountAssistant()` monte le panneau `app-assistant` dans une app. La correspondance sans modèle passe toujours en premier (`trouverRepere` puis `montrer()`). Le modèle, injecté par l'app via `repondre()`, ne sert qu'en secours quand rien ne correspond : le guidage fonctionne donc sans clé. Le panneau affiche aussi le résumé des constats avec « Me montrer » et la bascule « Dire » / « Guider », mémorisée dans `TourState`. Le bouton « Assistant » s'ajoute dans `app-action-bar`.

- [#1069](https://github.com/bmatge/dsfr-data/pull/1069) [`791bb2a`](https://github.com/bmatge/dsfr-data/commit/791bb2a4b35bdcc3073ddae4bd4e954e2e0fffcc) Thanks [@bmatge](https://github.com/bmatge)! - Recherche serveur multi-colonnes sur Tabular et grammaire du OU entre champs ([#1026](https://github.com/bmatge/dsfr-data/issues/1026)).
  
  - Nouvelle grammaire « champs multiples » dans le `where` colon : `nom|commune:contains:martin` applique le même opérateur et la même valeur à plusieurs champs, reliés par un OU ; les clauses restent en ET. C'est le seul OU de la grammaire, et il ne réserve aucun caractère de plus (`,` `:` `|`).
  - Tabular la traduit en `or=(nom__contains.martin,commune__contains.martin)` (mesuré sur l'API : 351 = 189 + 164 − 2, l'union vraie) ; Opendatasoft et Grist (SQL) en `(… OR …)` ; `dsfr-data-query` et le `where` de `dsfr-data-kpi` la filtrent en OU dans le navigateur. INSEE et generic la refusent explicitement (`supportsServerWhere`) et le filtre reste client.
  - `dsfr-data-search fields="nom,commune" server-search` filtre désormais côté serveur sur Tabular, sans gabarit : le gabarit par défaut est `{fields}:contains:{q}` (`{fields}` = les champs de `fields` séparés par `|`), et le compteur lit le `meta.total` de la réponse, juste sur tout le jeu. `contains` y est sensible aux accents : « ecole » ne trouve pas « École » côté serveur.
  - Un terme que `or=` ne sait pas transporter (`,` `.` `(` `)` `"` `&`, mesurés : 400 ou 0 sans erreur), une liste `in`/`notin` ou une seconde clause multi-champs ne partent pas au serveur : la query filtre dans le navigateur, la recherche retombe en local, et un avertissement le dit.

- [#1065](https://github.com/bmatge/dsfr-data/pull/1065) [`4cefdd9`](https://github.com/bmatge/dsfr-data/commit/4cefdd96ddde20d2d9c6aec0f3336df32c24e3b4) Thanks [@bmatge](https://github.com/bmatge)! - Diagnostic carto : quatorze règles `carte/…` (`REGLES_CARTO`, composées dans `REGLES_BUILDER_CARTO`) transforment les pannes silencieuses d'une couche `dsfr-data-map-layer` en constats qui désignent le contrôle du builder carto à reprendre : pas de champ de localisation, adresse ou code INSEE seuls, Lambert 93, latitude et longitude inversées, décimales à virgule, points en (0, 0) ou empilés, lignes ignorées, plus de lignes que `max-items`, volume ou latence excessifs, données chargées mais rien dessiné, aucune donnée. La trace porte désormais le compte d'éléments dessinés par une couche (`renderedCount`), le marquage des clones d'encart (`inset`) et les attributs `max-items`, `cluster` et `bbox`. Le moteur de constats gagne `tags` et `remplace` sur une règle : une règle d'app qui dit mieux une règle générique en retire les constats sur les nœuds qu'elle vise, et nulle part ailleurs. Dans le builder carto, la ligne de statut de l'aperçu est rendue depuis ces constats ([#1000](https://github.com/bmatge/dsfr-data/issues/1000)).

- [#1061](https://github.com/bmatge/dsfr-data/pull/1061) [`65cfda9`](https://github.com/bmatge/dsfr-data/commit/65cfda9aa3903f3e0535c0d57cb66ab113b97bcc) Thanks [@bmatge](https://github.com/bmatge)! - Assistant contextuel : correspondance sans modèle entre la phrase de l'usager et un repère d'interface ([#1012](https://github.com/bmatge/dsfr-data/issues/1012)). `trouverRepere()` projette le registre généré (libellé, synonymes, noms d'attributs composés, titres des fiches liées par `data-attribut`) et le passe au moteur `searchSkills()`, qui ne change pas. Le résultat vaut `trouve`, `ambigu` (2 ou 3 repères proposés) ou `aucun`. Les raisons de chaque correspondance sont exposées, et `formulerCorrespondance()` rend le chemin à suivre (« Éléments de la couche › Au clic sur un élément › Comportement au clic ») sans appel à Albert.

- [#1044](https://github.com/bmatge/dsfr-data/pull/1044) [`6fa031a`](https://github.com/bmatge/dsfr-data/commit/6fa031a0829be5a6165b8158cfb23dd030ce3991) Thanks [@bmatge](https://github.com/bmatge)! - Tabular : moins d'octets, sans changer un chiffre ([#985](https://github.com/bmatge/dsfr-data/issues/985)).
  
  - **`select` devient `columns=`** : sur une source `api-type="tabular"`, `select="nom, Code sexe"` ne charge que ces colonnes, en chargement complet comme en pagination serveur. Mesuré le 22 septembre 2026 : 366 892 → 22 383 octets pour 200 bornes IRVE à trois colonnes, 34 721 → 3 098 octets pour 50 élus à deux colonnes. Rien n'est ajouté d'office : une colonne lue en aval doit figurer dans la liste. Sans effet avec un `group-by` ou un `aggregate` (l'API refuse `columns` à côté d'un agrégateur) ; un `select` à expression (grammaire Opendatasoft) est ignoré avec un avertissement.
  - **Les noms de colonnes à espaces, accents et ponctuation se délèguent** (regroupement, agrégat, filtre, tri), percent-encodés : l'API les accepte. Le garde-fou qui les refusait ([#244](https://github.com/bmatge/dsfr-data/issues/244), [#289](https://github.com/bmatge/dsfr-data/issues/289)) faisait télécharger jusqu'à 25 000 lignes pour agréger dans le navigateur. Seuls `,` `:` `|`, séparateurs de la grammaire colon, restent non délégables.
  - **`fetchProfile()`** sur l'adaptateur Tabular : lit `/profile/` (format et type de chaque colonne, modalités fréquentes), mémorisé par ressource, annulable, jamais appelé pendant un chargement de données.
  - Le Builder Carto, le Builder (tableau) et l'Assistant IA (tableau) émettent `select` depuis les champs configurés d'une source Tabular, seulement quand chaque nom est une colonne détectée.

- [#1030](https://github.com/bmatge/dsfr-data/pull/1030) [`eebd71e`](https://github.com/bmatge/dsfr-data/commit/eebd71e0fe366652922518fd152e47ce516da481) Thanks [@bmatge](https://github.com/bmatge)! - `max-records` honoré par l'adaptateur Tabular ([#1027](https://github.com/bmatge/dsfr-data/issues/1027)), comme par Opendatasoft : 25 000 lignes par défaut (125 pages de 200), relevable explicitement par l'auteur — `max-records="40000"` charge par exemple les quelque 35 000 communes en 175 requêtes. Un `limit` plus petit reste prioritaire. Quand le plafond coupe le jeu, la source le signale (`truncated`, y compris sur un `group-by` dont l'API ne donne pas le total) et l'avertissement console cite `max-records` ; il se déclenche désormais aussi quand le plafond est atteint pile, cas où il restait muet.
  
  Corrige au passage la dernière page d'un chargement borné : réduite au reste (`page=3&page_size=50` pour `limit="450"`), elle relisait des lignes déjà reçues, l'API plaçant une page à `(page - 1) × page_size`. Les pages suivantes gardent la taille de 200 et le surplus est retranché.

- [#1072](https://github.com/bmatge/dsfr-data/pull/1072) [`3893235`](https://github.com/bmatge/dsfr-data/commit/3893235d31e1f1f72597c98767ba23a26976a9be) Thanks [@bmatge](https://github.com/bmatge)! - Visites guidées exprimées en repères ([#1013](https://github.com/bmatge/dsfr-data/issues/1013), ADR-143) : une étape désigne un repère du registre de l'app (`repere: 'carto.couches'`) plutôt qu'un sélecteur, et la visite demande à l'adaptateur de l'app de le révéler (section, panneau, modale) avant de l'afficher — `onBeforeShow` disparaît au profit de `reveler()`. `selector` reste un repli pour les apps sans registre. Les visites du builder et du builder carto sont migrées, et `check:reperes` refuse désormais une étape qui cite un repère absent du registre (règle 6).

### Patch Changes

- [#1076](https://github.com/bmatge/dsfr-data/pull/1076) [`870abe9`](https://github.com/bmatge/dsfr-data/commit/870abe9d9f743cdd57f826052fcb3f625e8b2921) Thanks [@bmatge](https://github.com/bmatge)! - Assistant contextuel dans toutes les apps d'édition ([#1017](https://github.com/bmatge/dsfr-data/issues/1017), [#1018](https://github.com/bmatge/dsfr-data/issues/1018)). `brancherAlbert(assistant, options)` résout le transport au montage et ne branche Albert que s'il est utilisable (clé ou jeton serveur, et tool-calling) ; sinon l'assistant reste en guidage local, sous-titre « Guidage dans l'interface ». `mountAssistant` gagne `brancherModele()` (brancher ou débrancher le modèle après le montage, sous-titre et pied suivent) et l'option `montrerHorsRegistre`, pour les repères que l'app montre elle-même (lignes de code du Playground). Dans `app-action-bar`, « Plus d'actions » reprend la pastille `data-count` d'une action repliée (le bouton « Assistant » sur un écran large) et la dit dans son `aria-label`.

- [#1074](https://github.com/bmatge/dsfr-data/pull/1074) [`208314a`](https://github.com/bmatge/dsfr-data/commit/208314a93003b5eb9b4e4dae1130cc1561f26ab5) Thanks [@bmatge](https://github.com/bmatge)! - Volet Diagnostic : `mountDiagnosticPanel` accepte `envoi: 'demander'`, qui affiche « Demander à l'assistant » ([#1016](https://github.com/bmatge/dsfr-data/issues/1016)). Ce bouton ouvre l'assistant contextuel de l'app sans la quitter et reste actif sans trace. Le défaut reste « Envoyer à l'assistant ». La nouvelle option `onConstats` reçoit chaque évaluation des constats, ce qui rafraîchit la pastille de l'assistant. `appHref` connaît aussi le Studio (`'studio'`). Le Studio pose un diagnostic transmis par « Construire pour moi » dans son champ, sans l'envoyer. Il accepte aussi une couche geoshape sans `geoField` : la bibliothèque détecte alors la colonne géométrique ([#1060](https://github.com/bmatge/dsfr-data/issues/1060)).

- [#1077](https://github.com/bmatge/dsfr-data/pull/1077) [`0d9287a`](https://github.com/bmatge/dsfr-data/commit/0d9287abd6dccad192b4cc9e7cc9b65cd97bae52) Thanks [@bmatge](https://github.com/bmatge)! - Assistant contextuel (ADR-143) : la surbrillance de « Me montrer » est rejouée quand l'app réécrit le panneau pendant la mise en évidence (panneaux de la carto re-rendus par `innerHTML` à la reprise de session ou à la fin de l'analyse des champs). Le focus ne suit qu'en mode « Guider », et seulement si l'usager ne l'a pas déplacé. Dans le builder, sans source enregistrée, le prérequis « source chargée » surligne l'état vide de la section Source (jeux d'exemple, lien vers l'app Sources) au lieu du sélecteur masqué, et annonce son chemin.

- [#1071](https://github.com/bmatge/dsfr-data/pull/1071) [`68f1715`](https://github.com/bmatge/dsfr-data/commit/68f171558c0e50d9e275eaa18c95499b277454a4) Thanks [@bmatge](https://github.com/bmatge)! - Assistant contextuel : le tour Albert en secours ([#1014](https://github.com/bmatge/dsfr-data/issues/1014), ADR-143). `creerRepondreIA()` (`@dsfr-data/shared`) rend la fonction `repondre` de `mountAssistant()` : le modèle n'est appelé que si la correspondance locale ne trouve rien de clair, en quatre tours au plus. Il désigne un réglage par l'outil `montrer(id)`, dont l'identifiant est pris dans une liste fermée tirée du registre des repères ; un identifiant hors liste est refusé sans nouvel appel. L'outil `planifier(etapes)` enchaîne plusieurs réglages : `suivrePlan()` montre chaque étape et passe à la suivante quand l'usager a agi dans l'interface, sans bouton « suivant ». Sans appel d'outils côté modèle, un seul appel en texte, relu par la correspondance locale. Les constats envoyés au modèle sont masqués (valeurs de données selon le réglage du diagnostic, jetons d'URL toujours). Le client des fiches skills publiées passe du Studio vers `@dsfr-data/shared`. Le builder IA passe sur la boucle et le transport communs ([#1015](https://github.com/bmatge/dsfr-data/issues/1015)) : `runAgentLoop` accepte un contrôle des outils terminaux (`validerTerminal`), et les appels Gemini et Anthropic passent par `postNatif`. Rien ne change dans la bibliothèque publiée.

- [#1079](https://github.com/bmatge/dsfr-data/pull/1079) [`667dd19`](https://github.com/bmatge/dsfr-data/commit/667dd1962b48f1e7fda35904a942084498e84af2) Thanks [@bmatge](https://github.com/bmatge)! - Assistant contextuel (ADR-143) : le volet s'ouvre désormais SOUS la barre d'actions sur ordinateur (`--app-action-bar-bas`, position mesurée et publiée par `app-action-bar`), si bien que « Exécuter » et les autres actions restent cliquables volet ouvert ; sur Sources, qui n'a pas de `app-action-bar`, `mountAssistant` publie la même variable depuis la rangée d'actions du bouton (« Nouvelle connexion » reste cliquable). Une languette « Assistant » collée au bord droit, à mi-hauteur, ouvre aussi le volet : masquée volet ouvert, elle porte la pastille des constats et reprend le focus à la réduction ; sur mobile, elle devient une pastille ronde en bas à droite, au-dessus de la barre d'actions fixe et du tiroir Diagnostic. À la réduction, le focus revient au déclencheur effectif (bouton de la barre, menu « Plus d'actions » s'il y est replié, ou languette).

- [#1037](https://github.com/bmatge/dsfr-data/pull/1037) [`8a5ce9a`](https://github.com/bmatge/dsfr-data/commit/8a5ce9ad4986db3be0d00703219c9c2d0acf428d) Thanks [@bmatge](https://github.com/bmatge)! - Refactor interne ([#1004](https://github.com/bmatge/dsfr-data/issues/1004)) : la boucle agentique du Studio passe dans `@dsfr-data/shared` (`runAgentLoop`), pour que les autres assistants s'en servent aussi (ADR-143). La boucle garde l'anti-doublon des lookups, les outils répétables, le plafond de tours et un dernier tour sans outils, où le modèle conclut en texte au lieu d'être coupé. Le Studio ne fait plus que composer ses outils (document, diagnostic, code) et ses budgets (8 tours, 12 en diagnostic). Rien ne change dans la bibliothèque publiée.

- [#1074](https://github.com/bmatge/dsfr-data/pull/1074) [`208314a`](https://github.com/bmatge/dsfr-data/commit/208314a93003b5eb9b4e4dae1130cc1561f26ab5) Thanks [@bmatge](https://github.com/bmatge)! - Constats : deux nouvelles règles génériques de gravité `info`, qui ne comptent pas dans les alertes du rail ([#1066](https://github.com/bmatge/dsfr-data/issues/1066)). `pipeline/delegation-client` signale une étape qui demande `group-by` ou `aggregate` alors que le serveur n'a fait ni l'un ni l'autre. Un query qui ne fait que filtrer ne la déclenche pas. `pipeline/emissions-repetees` signale une étape qui émet au-delà du seuil du diagnostic texte, et sa preuve ne cite que le compte de la trace. Le volet Diagnostic ne calcule plus ces deux notes lui-même : ses cartes d'étape ne rendent plus que des constats.

- [#1056](https://github.com/bmatge/dsfr-data/pull/1056) [`b5581d7`](https://github.com/bmatge/dsfr-data/commit/b5581d7229a326f63b75d1ebce71c0bf4f19af74) Thanks [@bmatge](https://github.com/bmatge)! - Carte : une couche `geoshape` sans `geo-field` trace ses formes ([#1053](https://github.com/bmatge/dsfr-data/issues/1053)). La colonne géométrique est détectée seule : la première colonne `geo_shape`, `geometry` ou `geom` qui porte du GeoJSON, objet ou chaîne sérialisée. Les exemples de la documentation (fond administratif en `transform="features"`, choroplèthe sans `geo-field`) affichaient une carte vide, parce que le rendu ne lisait que `geo-field` alors que le calcul d'emprise devinait déjà sa colonne. Un jeu Opendatasoft porte `geo_point_2d` et `geo_shape` : c'est la forme qui est tracée. L'avertissement des lignes ignorées nomme la colonne détectée. Si aucune colonne ne convient, la couche le dit en console au lieu de rester vide sans un mot. La règle de lint `carte/geoshape-sans-geo-field` passe d'erreur à avertissement.

- [#1042](https://github.com/bmatge/dsfr-data/pull/1042) [`6feadb4`](https://github.com/bmatge/dsfr-data/commit/6feadb45d2d67c6ab18eb7be7766c23bb34deae1) Thanks [@bmatge](https://github.com/bmatge)! - Diagnostic : journal réseau et console ([#994](https://github.com/bmatge/dsfr-data/issues/994)). Le texte de `formatTrace()`, donc le volet Diagnostic, « Copier le diagnostic » et l'assistant, gagne deux sections. « Réseau » donne l'URL réellement appelée après proxy, la méthode, le statut, la durée, le type, la taille et l'erreur ; un blocage CORS y apparaît en `TypeError: Failed to fetch`. « Console » reprend `console.warn/error`, les erreurs non rattrapées et les promesses rejetées. La capture est posée par le tampon précoce des iframes d'aperçu, seulement avec `debug: true` et jamais dans le code exporté, et pour la Carto et le Pipeline par `@dsfr-data/shared/debug/installer-journal`, importé en première ligne. L'enveloppe de `fetch` rend la même promesse et ne lit jamais le corps des réponses. Aucun en-tête de requête n'est conservé, et les jetons passés en paramètre d'URL sont masqués (`***`) au rendu ; sous `redactValues`, l'URL est réduite à l'hôte et au chemin. Les bundles publiés de la bibliothèque ne changent pas.

- [#1057](https://github.com/bmatge/dsfr-data/pull/1057) [`af9685f`](https://github.com/bmatge/dsfr-data/commit/af9685fe2dd1aea3d41d219e1e3e37f80361b7f9) Thanks [@bmatge](https://github.com/bmatge)! - `dsfr-data-kpi value="meta:total"` affiche « — » quand l'amont ne connaît pas son total, au lieu du nombre de lignes reçues ([#1046](https://github.com/bmatge/dsfr-data/issues/1046)). Depuis l'arrivée de `meta:total` (0.22.0, [#659](https://github.com/bmatge/dsfr-data/issues/659)), un total absent retombait sur le comptage des lignes reçues. Ce comptage est juste quand la source a tout livré, mais faux derrière une page serveur ou un lot tronqué. Sur une page agrégée Tabular, qui ne porte pas de `meta.total` ([#1033](https://github.com/bmatge/dsfr-data/issues/1033), pas encore publié), le KPI annonçait ainsi **40**, la taille de la page, pour 101 départements. La décision se lit désormais dans la meta publiée par la source : un total numérique est affiché tel quel ; un total absent sur une page serveur (`serverSide`) ou un lot tronqué (`truncated`) est inconnu (« — », et un ratio `… / meta:total` vaut « — ») ; sans meta, ou sur un lot complet, les lignes reçues restent le total. Même règle pour un export Opendatasoft (`fetch-mode="export"`) ou un `group_by` Opendatasoft arrêtés au plafond `max-records` : ils annonçaient le plafond comme total, ils affichent « — ». Aucun chiffre ne change pour Grist, Opendatasoft, INSEE ou generic là où le total était connu.

- [#1050](https://github.com/bmatge/dsfr-data/pull/1050) [`e05f262`](https://github.com/bmatge/dsfr-data/commit/e05f26273857f5cdeccfc7d919a40a71d40856f8) Thanks [@bmatge](https://github.com/bmatge)! - Diagnostic : moteur de constats ([#996](https://github.com/bmatge/dsfr-data/issues/996)). Une seule sortie pour tout ce que le volet Diagnostic,
  l'assistant contextuel et le studio signalent : `evaluerConstats(trace, contexte)` rend des
  `Constat` (`id`, `regle`, `gravite`, `titre`, `explication`, `action`, `reperes`, `preuve`,
  `etape`) à partir d'un registre de règles pures, composable par app
  (`[...REGLES_GENERIQUES, ...REGLES_CARTO]`). Premier lot générique : étape en échec, zéro ligne,
  afficheur inerte, données tronquées (en nommant `limit` ou `max-records`), jointure faible, champ
  introuvable, attribut inconnu, amont manquant, configuration invalide, lignes ignorées, points
  empilés, regroupement calculé dans le navigateur ; et, depuis le journal réseau et console, les
  réponses HTTP 4xx/5xx rattachées à leur étape, le blocage CORS déduit (proposition de
  `getProxiedUrl()`) et les erreurs de console qu'aucune étape ne revendique. Le compte d'alertes du
  rail replié (`summarizeTrace`) est désormais calculé depuis ces constats : il compte des constats,
  un par étape et par règle, et non plus des occurrences (plusieurs attributs inconnus sur une même
  étape font une alerte, un échec expliqué par le journal réseau une seule), et le regroupement
  calculé dans le navigateur y passe en simple information. Les bundles publiés
  de la bibliothèque ne changent pas.

- [#1039](https://github.com/bmatge/dsfr-data/pull/1039) [`86d7a34`](https://github.com/bmatge/dsfr-data/commit/86d7a3408049233b18ee5825b4053b5c2f7899d0) Thanks [@bmatge](https://github.com/bmatge)! - Les avertissements de troncature d'Opendatasoft nomment `dsfr-data-source` : pagination incomplète, plafond atteint sur un `group-by` et export JSON tronqué citent désormais « l'attribut max-records de dsfr-data-source », comme l'adaptateur Tabular ([#1027](https://github.com/bmatge/dsfr-data/issues/1027)). Les messages existaient mais ne nommaient aucun composant : un lecteur ne savait pas quel réglage relever, et la vérification des données les écartait. Résout le constat AM-002 du banc d'essai pour la part troncature silencieuse ([#1032](https://github.com/bmatge/dsfr-data/issues/1032)).

- [#1049](https://github.com/bmatge/dsfr-data/pull/1049) [`84b2ff9`](https://github.com/bmatge/dsfr-data/commit/84b2ff928f58d4d4efd4d6d6a9b3fdc86dce4a26) Thanks [@bmatge](https://github.com/bmatge)! - Révélation d'un repère d'interface ([#1003](https://github.com/bmatge/dsfr-data/issues/1003), ADR-143) : `@dsfr-data/shared` exporte `montrer(id, { registre, adaptateur, mode })`, côté app seulement. La fonction commence par vérifier les prérequis. S'il en manque un, elle montre le repère qui le lève, annonce le message du prérequis et rend la main. Sinon, l'adaptateur de l'app révèle le contrôle (il ouvre le panneau ou l'onglet et attend le rendu), puis `montrer()` le met en évidence. En mode « dire », le mode par défaut, le contrôle est surligné et son chemin est annoncé dans une région `aria-live="polite"` unique (« Éléments › Au clic sur un élément › Comportement au clic »), sans que le focus bouge. En mode « guider », la page défile jusqu'au contrôle et le focus s'y place. Le choix de l'usager est mémorisé dans `TourState.reperageMode`, que le serveur conserve désormais. Aucune animation sous `prefers-reduced-motion`. Les identifiants sont validés par la grammaire des repères avant de servir à construire un sélecteur. Aucun changement pour la bibliothèque publiée.

- [#1043](https://github.com/bmatge/dsfr-data/pull/1043) [`33f71b8`](https://github.com/bmatge/dsfr-data/commit/33f71b83d7b84d0614dd99acae9255eda61a24fa) Thanks [@bmatge](https://github.com/bmatge)! - Repères d'interface ([#997](https://github.com/bmatge/dsfr-data/issues/997), ADR-143) : `@dsfr-data/shared` exporte le contrat du registre généré, en types seuls et côté app (`Repere`, `RegistreReperes`, `ReperesConfig`, `Prerequis`, `PrerequisParId`). `npm run build:reperes` extrait les marques `data-repere`, `data-zone`, `data-attribut` et `data-prerequis` du balisage d'une app (HTML statique et gabarits TS) et écrit `apps/<app>/src/assistant/reperes.generated.ts`, enrichi des descriptions d'attributs du custom-elements manifest. `npm run check:reperes`, bloquant en CI, refuse un contrôle sans repère dans une zone de réglage, un attribut absent du manifeste, un prérequis sans règle, un registre périmé et un repère cité par un constat mais absent du registre. Premier échantillon réel : le bloc « Au clic sur un élément » du builder carto. Aucun changement pour la bibliothèque publiée.

- [#1072](https://github.com/bmatge/dsfr-data/pull/1072) [`3893235`](https://github.com/bmatge/dsfr-data/commit/3893235d31e1f1f72597c98767ba23a26976a9be) Thanks [@bmatge](https://github.com/bmatge)! - Repères d'interface : une app peut déclarer une source « données » (`ReperesConfig.donnees`, type `RepereDonnee`) pour les repères posés à l'exécution depuis une définition. Le pipeline s'en sert : chaque contrôle d'étape porte `pipeline.<type>.<attribut>`, calculé depuis `node-configs.ts`, et `check:reperes` le vérifie comme le balisage ([#1008](https://github.com/bmatge/dsfr-data/issues/1008)).

- [#1033](https://github.com/bmatge/dsfr-data/pull/1033) [`f793e81`](https://github.com/bmatge/dsfr-data/commit/f793e81ff0167d96296e4336ac2b60c78aaea169) Thanks [@bmatge](https://github.com/bmatge)! - Tabular : deux chiffres faux corrigés ([#1025](https://github.com/bmatge/dsfr-data/issues/1025)).
  
  - **Un `group-by` sans agrégat affichait des lignes répétées comme des groupes.** L'API Tabular ne regroupe pas sur `champ__groupby` seul : elle rend une ligne par ligne brute (`Code sexe__groupby` → F, M, M, F, M, api-tabular#119). La bibliothèque le lui déléguait pourtant, puis sautait son propre regroupement : une liste des 8 académies en affichait 137, et un KPI `count` derrière la query annonçait 137. Le défaut existe depuis la délégation du group-by à Tabular. Désormais un `group-by` sans agrégat n'est plus délégué : l'adaptateur rend les lignes brutes, la query regroupe (comme pour `distinct`), avec un avertissement en console.
  - **Une page agrégée masquait sa pagination.** Une réponse Tabular agrégée ne porte pas de `meta.total` ; en mode `server-side`, l'adaptateur le lisait comme un total de **0** : une liste `group-by` + `aggregate` n'affichait qu'une page (les 40 ou 50 premiers groupes, les autres inatteignables) et un KPI `meta:total` affichait 0. Un total absent est maintenant un total **inconnu** (`undefined`, contrat [#270](https://github.com/bmatge/dsfr-data/issues/270)) : la liste propose la page suivante tant que la page est pleine et affiche « Page N » sans total.

- [#1028](https://github.com/bmatge/dsfr-data/pull/1028) [`44d8217`](https://github.com/bmatge/dsfr-data/commit/44d8217933145e79c7f601708ea89e356de47009) Thanks [@bmatge](https://github.com/bmatge)! - page_size 200 : quatre fois moins de requêtes Tabular ([#1019](https://github.com/bmatge/dsfr-data/issues/1019)). L'adaptateur Tabular demandait des pages de 50 lignes alors que l'API en sert jusqu'à 200 (mesuré : `page_size=201` répond 400). Le chargement complet passe à 125 pages de 200 : 25 000 lignes en 125 requêtes au lieu de 500, plafond et chiffres inchangés. En pagination serveur, un `page-size` supérieur à 200 est désormais ramené à 200 avec un avertissement unique en console, au lieu de provoquer une erreur 400 sans en-tête CORS, illisible dans le navigateur.

- [#1052](https://github.com/bmatge/dsfr-data/pull/1052) [`3d887cc`](https://github.com/bmatge/dsfr-data/commit/3d887cc862ed352cca378b6ae7ff5a595a6bee80) Thanks [@bmatge](https://github.com/bmatge)! - Tabular : un regroupement trié sur son agrégat (« top 10 ») ne tombe plus en erreur ([#1045](https://github.com/bmatge/dsfr-data/issues/1045)).
  
  - **Le tri sur une colonne d'agrégat partait au serveur, qui le refuse.** `group-by="code_dept" aggregate="population:sum" order-by="population__sum:desc"` émettait `population__sum__sort=desc` : l'API Tabular répond 400 (42703 « column …population__sum does not exist », mesuré le 2026-09-23), sans en-tête CORS, donc vu comme une erreur réseau opaque. Le graphique, la liste ou le KPI restait vide. Le défaut existe depuis que la délégation du regroupement à Tabular fonctionne, c'est-à-dire depuis la **0.20.0** ([#596](https://github.com/bmatge/dsfr-data/issues/596), flags nus) : tout regroupement Tabular trié sur son agrégat échouait depuis cette version. Désormais seul un tri sur la colonne de **regroupement** part au serveur (l'API l'accepte). Un tri sur un agrégat est fait par l'adaptateur, sur **tous** les groupes : avec un `limit`, les groupes sont d'abord tous lus, puis triés, puis coupés. En pagination serveur (`server-side`), la page est découpée dans les groupes complets triés, gardés une minute pour les pages suivantes. Le nombre de groupes est alors connu et devient le total de la pagination. Trier la seule page reçue aurait donné un faux « top ». Si le plafond `max-records` coupe la lecture, le tri ne porte que sur les groupes lus : un avertissement le signale en console.
  - **Un tri sur un alias partait au serveur alors que le regroupement ne s'y faisait pas.** Exemple : `aggregate="code_dept:distinct:nb, population:sum:pop" order-by="pop:desc"`, où `distinct` n'est pas délégable. Tabular répondait `pop__sort` → 400. `dsfr-data-query` ne délègue plus le tri quand le regroupement ou l'agrégat reste calculé côté client : le tri porte sur des colonnes que seul le client produit.

- [#1038](https://github.com/bmatge/dsfr-data/pull/1038) [`83c6280`](https://github.com/bmatge/dsfr-data/commit/83c62807d4faf8c3166e8c2c48326945683f78f5) Thanks [@bmatge](https://github.com/bmatge)! - Transport IA commun au Studio et à l'Assistant IA ([#998](https://github.com/bmatge/dsfr-data/issues/998)) : `@dsfr-data/shared` porte désormais la seule implémentation des appels au modèle (`/ia-proxy-default` et `/ia-proxy`, nouvelle tentative sur 429 selon `Retry-After` plafonné à 10 s, sinon après 1 s, 2 s et 4 s, trois nouvelles tentatives au plus), la lecture des capacités Albert et un seul cache de `/ia-server-config`. `resolveTransport()` rend `{ mode, post, model, capacites }`. La clé de configuration `dsfr-data-ia-config` ne change pas. Dans l'Assistant IA, le délai maximal d'une requête passe de 30 s à 45 s sur tous les chemins. Les erreurs du Studio reprennent les messages HTTP en français de l'Assistant IA.

## 0.35.2

### Patch Changes

- [#987](https://github.com/bmatge/dsfr-data/pull/987) [`3f6af3c`](https://github.com/bmatge/dsfr-data/commit/3f6af3cffa6cf2ba771283ea298fa6b38cbaeb7d) Thanks [@bmatge](https://github.com/bmatge)! - Carte : le volet lateral d'un popup passe desormais AU-DESSUS du selecteur de fond de
  carte. Sur une carte portant a la fois `tiles-switcher` et un
  `<dsfr-data-map-popup mode="panel-right">` (ou `panel-left`), l'encart « Fond de carte »
  se dessinait par-dessus le volet ouvert, dont il masquait le titre et les premieres
  lignes.
  
  Les valeurs de `z-index` etaient pourtant deja dans le bon ordre — volet a 1001,
  selecteur a 1000. Elles ne se comparaient simplement pas : le selecteur est pose en
  FRERE du conteneur Leaflet (pour etre atteint au clavier avant la carte) quand le volet
  est pose DEDANS (pour ne pas recouvrir les encarts territoriaux), et un `z-index: 0` sur
  ce conteneur — auquel Leaflet ajoute `position: relative` — en faisait un contexte
  d'empilement qui scellait tout son sous-arbre sous le selecteur. Aucune valeur de
  descendant ne pouvait rattraper cela.
  
  La frontiere d'empilement remonte donc d'un cran, de ce conteneur vers l'hote
  `dsfr-data-map` (`isolation: isolate`). Effet de bord favorable : le mobilier flottant de
  la carte (selecteur de fond, bouton de plein ecran, bandeau max-items, tous a 1000) ne
  peut plus sortir de la carte pour recouvrir l'en-tete de la page qui l'accueille.
  
  Deux garde-fous, l'un structurel et l'autre mesure : `tests/map-empilement.test.ts`
  verifie qu'aucun `z-index` n'est declare sur le conteneur et que l'hote porte bien
  `isolation` — l'ordre des nombres seul etait deja juste et n'aurait rien vu ; et
  `e2e/layout-map.spec.ts` lit l'empilement reel dans un navigateur, par
  `elementFromPoint` au centre du selecteur.

## 0.35.1

### Patch Changes

- [#981](https://github.com/bmatge/dsfr-data/pull/981) [`ceb8e01`](https://github.com/bmatge/dsfr-data/commit/ceb8e0149b9bc0f8b065af9e7b625f8bc5055ba5) Thanks [@bmatge](https://github.com/bmatge)! - Nouvelle fiche de connaissance « Gabarits de page » (`pagePatterns`) : quatre familles de
  pages de donnees publiques — localisateur, tableau de bord, corpus, portrait — et huit
  gabarits, releves sur les pages reellement en ligne du banc d'essai open-data-viz.
  
  La fiche s'ouvre sur un arbre de decision (la question que pose la page determine la
  famille ; le nombre de leviers determine la variante) et tranche une regle jusque-la
  implicite : les filtres vont **en barre** jusqu'a quatre sans compteurs, **en colonne**
  au-dela ou des que les facettes affichent des compteurs, **en bandeau** quand le levier est
  unique. Quand le critere n'est pas decidable a l'ecriture, la fiche demande de **poser la
  question a l'usager** plutot que d'imposer un choix en silence.
  
  La fiche `dsfrLayout` est alignee sur cette regle (elle affirmait « les filtres se posent en
  haut », sans condition) et les trois fiches se renvoient desormais l'une a l'autre :
  `datavizMetier` (quelle forme) → `pagePatterns` (quelle page) → `dsfrLayout` (quelle
  grille).
  
  La fiche dit aussi ce que la bibliotheque ne fait pas, pour qu'aucune page generee ne le
  promette : `dsfr-data-chart` n'emet aucun evenement de clic, on ne filtre donc pas en
  cliquant une barre — le filtrage passe par les facettes, la recherche ou le contexte.

## 0.35.0

### Minor Changes

- [#977](https://github.com/bmatge/dsfr-data/pull/977) [`f99ea1b`](https://github.com/bmatge/dsfr-data/commit/f99ea1bdc31d8da5011d1dbbc07bad890a6b555a) Thanks [@bmatge](https://github.com/bmatge)! - `neq` : une valeur ABSENTE ne satisfait ni `=` ni `!=` — des comptes vont BAISSER
  
  **Si un compte de votre page a baissé sans que son balisage ait bougé, c'est ici.** Un filtre
  `champ:neq:valeur` (ou un `!=` de `compute`) ne retient plus les lignes dont le champ est nul.
  Sur le jeu qui a servi à mesurer — `retours-formulaire-votre-avis-copie` de
  data.education.gouv.fr, champ `themes_attendus`, **176 lignes dont 21 nulles** — un
  `where="themes_attendus:neq:Elèves"` évalué dans le navigateur affichait **52**, il affiche
  désormais **31**. Vingt et une lignes en moins, et c'est voulu : **31 est ce que le portail
  répond depuis toujours à la même clause.** Pour retrouver les lignes perdues, les nommer :
  `champ:isnull`.
  
  La proportion dépend entièrement du taux de valeurs absentes du champ filtré : 21 sur 176 ici,
  davantage sur un jeu plus lacunaire. Pendant cette mineure, un **avertissement de transition**
  le dit en console, nomme le champ et **compte** les lignes concernées — un message par champ,
  jamais par ligne (mesuré sur le jeu ci-dessus : **un seul message**, « 21 ligne(s) »).
  
  ## Ce qui a été mesuré
  
  Opendatasoft applique la **logique SQL à trois valeurs** : sur une ligne dont le champ est nul,
  `=` comme `!=` valent « inconnu », et l'inconnu ne retient pas la ligne (2026-09-20) :
  
  ```
  data.education.gouv.fr, retours-formulaire-votre-avis-copie, champ themes_attendus
    176 lignes, dont 21 nulles et 155 renseignées
    where=themes_attendus is null      ->  21
    where=themes_attendus = "Elèves"   -> 124
    where=themes_attendus != "Elèves"  ->  31   = 155 - 124, les nulles EXCLUES
                                                et non 52 = 176 - 124
    where=themes_attendus != "zzz"     -> 155   (et non 176)
  ```
  
  `eq` excluait déjà les nulles côté client ; `neq`, écrit `!looseEquals(…)`, les gardait. Le même
  `champ:neq:valeur` rendait donc **31 lignes s'il partait au serveur et 52 s'il était évalué au
  client** — et ce qui en décidait n'était pas la balise qui porte le `where`, mais le mode de la
  source, un transformateur amont ou le partage de la chaîne. C'est la dernière divergence connue
  entre les deux chemins, et c'est la suite directe de [#953](https://github.com/bmatge/dsfr-data/issues/953), sur l'autre moitié de l'opérateur.
  
  Vérifié au navigateur sur le jeu réel, le même `where` deux fois (délégué / client) :
  
  | | délégué au portail | évalué au client |
  |---|---|---|
  | avant | 31 | **52** |
  | après | 31 | **31** |
  
  ## Ce qui ne change PAS, et pourquoi ce n'est pas une inconséquence
  
  `notin` et `notcontains` continuent de garder les valeurs absentes. **Le serveur a deux écritures
  de la négation, et elles n'ont pas le même sens** — mesuré le même jour, même jeu :
  
  ```
  themes_attendus != "Elèves"          ->  31   trois valeurs, nulles EXCLUES
  NOT themes_attendus = "Elèves"       ->  52   complément de la clause, nulles GARDÉES
  not(themes_attendus = "Elèves")      ->  52
  NOT themes_attendus in ("Elèves")    ->  52
  NOT themes_attendus like "%Elèves%"  ->  52
  themes_attendus not in (…)                  ODSQL syntax exception
  themes_attendus not like "%…%"              ODSQL syntax exception
  ```
  
  ODSQL n'ayant pas d'infixe `not in` / `not like`, `notin` et `notcontains` ne peuvent se déléguer
  qu'en `NOT …`, qui garde les nulles. Le client les gardait déjà : il est donc **déjà aligné**, et
  les « corriger par symétrie » aurait rouvert la divergence que cette version ferme. Seul `!=`
  est à trois valeurs, et c'est écrit dans le JSDoc de `where` comme en tête de `filterToOdsql`.
  
  ## Périmètre exact
  
  - `where="champ:neq:v"` de `dsfr-data-query`, de `dsfr-data-source` et du filtre entre accolades
    du KPI (`looseNotEquals`, une seule fonction pour les trois chemins) ;
  - `when champ != 'v'` de `compute` — l'en-tête de `compute.ts` promet depuis [#671](https://github.com/bmatge/dsfr-data/issues/671) que
    `when f != 'x'` et `where="f:neq:x"` gardent les mêmes lignes, et c'est la raison de l'inclure ;
  - inchangés : `eq`, `in`, `contains`, `notin`, `notcontains`, `isnull` / `isnotnull`, les
    comparaisons d'ordre (qui excluaient déjà les absents), et la **chaîne vide**, qui reste une
    valeur et passe toujours un `neq`.
  
  Un contrôle de l'oracle tient les deux chemins sur le canari (`canari-neq-nuls-exclus` et sa
  variante déléguée) : `eq` 7 + `neq` 27 = 34 lignes renseignées sur 40, `notin` 33, `isnull` 6, le
  même 27 délégué et client, et les trois voix (bibliothèque, oracle TS, oracle Python) d'accord.
  Éprouvé en échec : sans le correctif, la variante client affiche 33 contre 27 aux deux oracles —
  exactement les six lignes sans région — pendant que la variante déléguée reste à 27.
  
  Closes [#958](https://github.com/bmatge/dsfr-data/issues/958).

### Patch Changes

- [#972](https://github.com/bmatge/dsfr-data/pull/972) [`84aa32e`](https://github.com/bmatge/dsfr-data/commit/84aa32e90811eaebc64b2e366bb64c7235134976) Thanks [@bmatge](https://github.com/bmatge)! - Les deux jeux de palettes vivent désormais dans deux fichiers, et l'un d'eux gagne
  un garde-fou. `packages/shared/src/constants/dsfr-palettes.ts` exportait
  `PALETTE_COLORS` (5 tons, les graphiques) et `CHOROPLETH_SCALES` (9 pas, les cartes
  et le podium) avec **les mêmes noms de clés** — `sequentialDescending` y désignait
  deux rampes Bleu France différentes, toutes deux plausibles. Un
  `grep sequentialDescending` répondait, la réponse était cohérente, et elle était
  fausse : trois tableaux de contraste erronés en une journée sur la pastille de rang
  du podium. Le fichier est scindé en `constants/palette-colors.ts` et
  `constants/choropleth-scales.ts` : le chemin d'import dit maintenant laquelle on
  lit. **Aucun ré-export depuis l'ancien chemin** — il recréerait exactement
  l'ambiguïté qu'on supprime.
  
  Rien ne bouge pour qui écrit du HTML : les noms de clés sont les valeurs de
  l'attribut public `selected-palette` et ils sont inchangés, la surface d'export de
  `@dsfr-data/shared` est identique (140 exports sur `lib`, 265 sur `index`), et les
  bundles construits sont octet pour octet les mêmes à deux lignes de commentaire de
  découpage près. `dsfr-data-map-layer`, qui lisait déjà la bonne constante mais
  n'avait aucun test pour le dire, en a un : `tests/map-layer-rampe-choroplethe.test.ts`
  fige en clair les couleurs posées sur les polygones pour les cinq palettes et
  vérifie qu'aucune ne vient de la rampe homonyme à 5 tons.

- [#973](https://github.com/bmatge/dsfr-data/pull/973) [`391f8d2`](https://github.com/bmatge/dsfr-data/commit/391f8d2dd3655f3b221be0b4517bad7de20e6d8c) Thanks [@bmatge](https://github.com/bmatge)! - `dsfr-data-chart` : les pastilles de l'infobulle suivent `color-map` ([#968](https://github.com/bmatge/dsfr-data/issues/968)).
  
  `color-map` recolorait les barres et la légende, mais pas les pastilles de
  l'infobulle, restées à la palette `categorical` par défaut. Comme l'infobulle
  de DSFR Chart **ne nomme pas les séries**, la couleur est le seul lien entre
  une ligne et la série qu'elle décrit : une pastille fausse appariait la
  mauvaise valeur à la mauvaise série. Contrairement à [#813](https://github.com/bmatge/dsfr-data/issues/813) / [#815](https://github.com/bmatge/dsfr-data/issues/815) (la légende),
  le défaut ne demandait pas `databox` : il se produisait sur un graphique nu.
  
  Cause commune des trois surfaces : DSFR Chart tient une seule source de vérité
  pour les couleurs de série, `colorParse`, dont dérivent le canvas, la légende
  et l'infobulle. `color-map` n'écrivait que sur les datasets de l'instance
  Chart.js — une copie — et la légende avait été rattrapée en peignant son DOM
  ([#815](https://github.com/bmatge/dsfr-data/issues/815)). La correction reporte désormais les couleurs dans `colorParse`
  lui-même, en respectant sa forme (un tableau par point pour `bar` et `pie`, un
  scalaire pour `line`, `radar` et `scatter`, `colorBarParse` pour `bar-line`).
  
  Reste vrai : `color-map` s'applique après le rendu, l'infobulle est peinte par
  DSFR Chart et son gabarit ne nomme toujours pas les séries ; `color-map` reste
  sans effet sur les types carte (`selected-palette`). Si le modèle interne
  devenait inatteignable, un avertissement console le dit désormais au lieu
  d'une infobulle silencieusement fausse.

- [#975](https://github.com/bmatge/dsfr-data/pull/975) [`a40e51f`](https://github.com/bmatge/dsfr-data/commit/a40e51f9800756aebcf6191cac157bc163b8d575) Thanks [@bmatge](https://github.com/bmatge)! - La visite guidee du playground visait `#example-select`, qui vient de passer
  dans le volet lateral des exemples — un panneau ferme, `inert` et hors ecran
  au chargement. La premiere etape montrait donc un element invisible.
  
  Elle vise desormais la bascule du volet et decrit ce qu'il apporte : les trois
  axes croises (source des donnees, pipeline de transformation, sortie affichee).
  Le decompte en dur (« plus de 30 exemples ») disparait au profit du compteur
  que le bouton affiche en direct : il ne peut plus se perimer.
  
  Une seconde etape ne montrait rien non plus, depuis plus longtemps : « Editeur
  de code » visait `#code-editor`, le textarea que CodeMirror masque pour rendre
  le sien a cote — donc un element de taille nulle. Elle vise `.CodeMirror`.
  
  `version` du tour passe a 2, ce que ce champ prevoit exactement — une visite
  deja vue est reproposee quand son contenu a change.

## 0.34.0

### Minor Changes

- [#967](https://github.com/bmatge/dsfr-data/pull/967) [`795146b`](https://github.com/bmatge/dsfr-data/commit/795146b5030d9ac581df7ae10c7839afe1be2736) Thanks [@bmatge](https://github.com/bmatge)! - `dsfr-data-kpi` et `dsfr-data-kpi-group` : évolutions d'affichage de la planche
  « kpi-evolutions » (tours 1 à 3). **Rien ne change côté données** — libellé, valeur,
  tendance, description, seuils et tokens sémantiques gardent leur calcul — et **rien ne
  change sans les nouveaux attributs** : le rendu par défaut est identique, byte à byte sur
  le balisage et règle par règle sur le CSS (`tests/kpi-rendu-retrocompat.test.ts`, référence
  capturée sur `main` avant le chantier).
  
  Nouveaux attributs de `dsfr-data-kpi` :
  
  - `icon-position="label|top|right"` (défaut `label`, le rendu historique) et
    `icon-size="sm|md"` — 1,5 rem et 2 rem. L'échelle s'arrête là : le DSFR ne documente
    pas d'icône au-delà de `fr-icon--lg` (2 rem) ; au-delà, c'est un pictogramme.
  - `picto="environment/leaf"` (ou `picto-field`) + `picto-base="/dsfr/artwork/pictograms/"` :
    pictogramme DSFR déclaratif, rendu en SVG `fr-artwork` à trois `<use>`. Le nom est
    contraint à `[a-z0-9-]` et `/`, l'adresse est écrite par l'intégrateur : `../` et
    `javascript:` sont exclus par construction. Les couleurs viennent des classes
    `fr-artwork-*` (mode sombre compris). ⚠️ Même origine que la page : `<use>` ne charge
    pas un SVG d'un autre domaine.
  - `image` + `image-alt` + `image-position="top|left|right"` : bandeau 16:9, colonne de
    10 rem ou vignette de 7,5 rem. URL passée par la liste blanche de schémas de
    `{{champ:url}}` ; refusée = rien, avec un avertissement.
  - `orientation="vertical"` : tuile à liseré haut, centrée quand elle porte un média.
  - `border="left|top|bottom|outline|left-short|none"` (défaut `left`).
  - `tint` (`950` par défaut, `975`, `925`) : fond teinté dans la couleur du token ; la
    valeur reste en gris titre, par contraste.
  - `color-token` étendu aux **17 couleurs illustratives DSFR** (`green-emeraude`,
    `blue-cumulus`, `purple-glycine`…) via `var(--border-plain-<nom>)` et
    `var(--background-contrast-<nom>)` — aucun hexadécimal, le mode sombre suit. Elles
    disent une CATÉGORIE ; l'ÉTAT reste aux quatre tokens sémantiques.
  
  `icon` est désormais sur liste blanche (`fr-icon-*`, `ri-*`) : une valeur hors motif est
  ignorée avec un avertissement qui la nomme, une fois par valeur.
  
  `dsfr-data-kpi-group orientation="vertical"` empile les KPI dans un cadre à liseré
  continu, avec un filet entre les items.

- [#966](https://github.com/bmatge/dsfr-data/pull/966) [`c66062c`](https://github.com/bmatge/dsfr-data/commit/c66062cc4439629868420c971aea6130d38597ca) Thanks [@bmatge](https://github.com/bmatge)! - **Le podium perd ses arrondis : `square` devient le rendu par défaut.** L'item passe de
  4 px à 0, la barre de 3 px à 0. C'est le seul changement de cette version qui modifie un
  rendu **sans qu'aucun attribut ait été posé** : toutes les pages qui affichent un
  `<dsfr-data-podium>` verront des angles droits. Le changement est minime et plus conforme
  au DSFR, et l'échappatoire est immédiate — `rounded` rétablit exactement les anciens
  arrondis. L'attribut `square` reste disponible pour écrire le défaut explicitement ; si
  `square` et `rounded` sont posés tous les deux, `square` l'emporte.
  
  Hors ce point, **rien ne change sans attribut** : un test de rétrocompatibilité
  (`tests/dsfr-data-podium-retrocompat.test.ts`) compare le DOM rendu sans attribut au DOM
  capturé sur `main` avant le changement, et vérifie que la seule différence dans les règles
  CSS déjà présentes porte sur `border-radius`, et que toutes les règles ajoutées sont
  portées par une classe neuve.
  
  Quatorze attributs de présentation sont ajoutés. Le classement, le tri, les ratios et
  `bar-max` sont inchangés : rien ne touche à la donnée.
  
  **Vignette** — `image-field` (+ `image-shape="square|circle"`) affiche une image de 40 px
  entre le rang et le libellé ; `icon-field` / `icon` posent une classe d'icône DSFR ou
  Remix ; `picto` / `picto-field` avec `picto-base` rendent un pictogramme DSFR au balisage
  `fr-artwork` standard (donc mode sombre gratuit). Les trois voies sont exclusives : si
  plusieurs sont posées, l'image l'emporte, puis le pictogramme, puis l'icône, et le cumul
  est signalé en console.
  
  Ce qui vient de la donnée est **contraint, jamais assaini après coup** : une classe
  d'icône doit répondre à `^(fr-icon|ri)-[a-z0-9-]+$` — la donnée ne pose qu'une classe CSS,
  jamais du balisage ; un nom de pictogramme est une suite de segments `[a-z0-9-]+` séparés
  par `/`, et l'URL se construit en le concaténant à `picto-base`, attribut de la balise donc
  écrit par l'intégrateur — ce découpage exclut mécaniquement `../` et `javascript:` sans
  dépendre d'un assainisseur ; une URL d'`image-field` passe par `sanitizeTemplateUrl`, la
  liste blanche de schémas du format `{{champ:url}}`. Dans les trois cas, une valeur refusée
  n'affiche rien et **avertit en console en nommant le champ et la valeur**, une fois par
  valeur refusée et non une fois par ligne.
  
  **Rang** — `rank="number|medal|none"`. En `medal`, le chiffre est posé dans une pastille
  de la couleur de l'item (24 px quand une vignette occupe déjà la place, 32 px sinon), et la
  couleur d'encre est choisie par **calcul de luminance relative WCAG** sur la couleur
  réellement servie. La rampe par défaut est `CHOROPLETH_SCALES.sequentialDescending`
  (9 tons) — **et non** `PALETTE_COLORS.sequentialDescending` (5 tons), qui porte le même nom
  dans le même fichier : recalculer sur la seconde donne un tableau plausible et faux.
  Ratios sur les cinq premiers tons, encre retenue en gras :
  
  | Rang | Couleur | vs blanc | vs gris de titre `[#161616](https://github.com/bmatge/dsfr-data/issues/161616)` |
  |---|---|---|---|
  | 1 | `#000091` | **14,91:1** | 1,21:1 |
  | 2 | `#2323B4` | **10,65:1** | 1,70:1 |
  | 3 | `#4747E5` | **6,36:1** | 2,84:1 |
  | 4 | `#6A6AF4` | 4,22:1 | **4,29:1** |
  | 5 | `#8585F6` | 3,14:1 | **5,76:1** |
  
  **Le point bas est le rang 4** : 4,29:1, sous AA texte normal (4,5:1), au-dessus de AA
  texte large (3:1) — aucune des deux encres n'atteint 4,5:1 sur `#6A6AF4`. Le chiffre reste
  `aria-hidden`, l'ordre étant porté par la position dans le `<ol>`. Ces cinq couples
  (couleur, encre) et ces ratios sont figés par un test, pour qu'un changement de palette
  casse la recette au lieu de faire mentir la documentation.
  
  Les deux encres sont deux tokens DSFR croisés sous `[data-fr-theme="dark"]`, pour rester
  identiques dans les deux thèmes — le fond de la pastille étant une couleur de palette qui,
  elle, ne change pas avec le thème. Aucun hexadécimal n'est écrit en dur.
  
  **Disposition** — `orientation="vertical"` rend une colonne par item ;
  `layout="podium"` rend l'estrade 2‑1‑3, le premier au centre. **L'inversion est purement
  visuelle** (`order` sur les éléments de grille) : le DOM reste dans l'ordre 1‑2‑3, donc un
  lecteur d'écran et la navigation clavier parcourent le classement dans l'ordre. Les items
  au‑delà du 3e passent en liste compacte sous l'estrade, dans le même `<ol>`.
  
  **Barre et liseré, trois axes séparés et combinables** — `bar="proportional|full|none"`
  dit *ce que porte* la barre, `bar-position="inline|between|top|bottom"` dit *où elle est*,
  `border="left|none"` pose un liseré purement décoratif. Ce ne sont pas les valeurs d'un
  même attribut : `bar="proportional" bar-position="top" border="left"` est une combinaison
  valide. `inline` est le rendu historique (6 px sous le libellé) ; `between` est
  l'agencement « graphique en barres horizontal » (libellé de 130 px, barre de 16 px, valeur) ;
  `top` et `bottom` posent un trait de 4 px en haut ou en bas de l'item.

### Patch Changes

- [#960](https://github.com/bmatge/dsfr-data/pull/960) [`76a7880`](https://github.com/bmatge/dsfr-data/commit/76a7880255ec20328c58172d31e93029e9621ba6) Thanks [@bmatge](https://github.com/bmatge)! - `dsfr-data-map-popup` : le corps du panneau et celui de la modale sont maintenant
  écrits dans un `<div>` créé à part, plutôt qu'interpolés dans le gabarit de chrome.
  La donnée n'a ainsi qu'un point d'entrée HTML, nommé et commentable — le rendu est
  identique. L'échappement, lui, n'a pas changé : il est désormais **prouvé** par
  `tests/map-popup-xss.test.ts` (quatre charges utiles sur les deux modes et les deux
  chemins de rendu, avec et sans `<template>` d'auteur), ce qui permet d'écarter en
  connaissance de cause les deux alertes CodeQL `js/html-constructed-from-input`.

## 0.33.0

### Minor Changes

- [#941](https://github.com/bmatge/dsfr-data/pull/941) [`800be59`](https://github.com/bmatge/dsfr-data/commit/800be59f9cef52c7e1293208a06395ba38692168) Thanks [@bmatge](https://github.com/bmatge)! - **`dsfr-data-a11y` : `empty-label` nomme le groupe non renseigné dans le tableau équivalent** ([#933](https://github.com/bmatge/dsfr-data/issues/933), AM-085). Depuis [#647](https://github.com/bmatge/dsfr-data/issues/647), `empty-label` sur `dsfr-data-chart` nomme la catégorie vide (`null`, `undefined`, `""`) sur l'axe et dans la légende. Le tableau équivalent qui double ce graphique, lui, rendait une cellule de libellé **vide** : la barre « Non renseigné | 3 » devenait la ligne « | 3 ». Un lecteur d'écran entendait donc une valeur sans son nom, là où l'œil voyait les deux — sur des jeux publics où le groupe non renseigné est souvent la modalité la plus nombreuse.
  
  `empty-label` existe maintenant aussi sur `dsfr-data-a11y`. Posé, il remplit la cellule de la **colonne de libellé** (`label-field` s'il est défini, sinon la première colonne rendue) quand la valeur est vide, et le **CSV téléchargé porte le même libellé** que le tableau affiché. Les colonnes de valeur ne sont jamais touchées : une mesure absente reste une cellule vide, on n'invente pas une mesure.
  
  **Strictement additif** : absent, le rendu est celui d'avant, cellule vide comprise. La valeur n'est volontairement **pas** reprise du graphique visé par `for` — la reprendre aurait changé le tableau de pages déjà en ligne ; l'écrire sur les deux balises est le prix d'un zéro risque de régression.

- [#941](https://github.com/bmatge/dsfr-data/pull/941) [`800be59`](https://github.com/bmatge/dsfr-data/commit/800be59f9cef52c7e1293208a06395ba38692168) Thanks [@bmatge](https://github.com/bmatge)! - **`dsfr-data-a11y` : `series-field` pivote le tableau équivalent d'un graphique multi-séries** ([#930](https://github.com/bmatge/dsfr-data/issues/930), AM-082). `dsfr-data-concat` ([#807](https://github.com/bmatge/dsfr-data/issues/807)) rend une légende nourrie par la donnée : empiler trois séries, poser `origin-field`, et `dsfr-data-chart series-field` trace trois courbes nommées par le jeu. Le tableau équivalent, lui, ne connaissait que `label-field` et `value-field` : il rendait une ligne par couple (libellé, série) **sans aucune colonne disant de quelle série venait la valeur** — six lignes « 2022 | 100 », « 2022 | 100 », « 2023 | 104 »… où le graphique montre trois points par courbe. Le gain de légende se payait d'un tableau illisible, c'est-à-dire de l'alternative accessible elle-même.
  
  `series-field` sur `dsfr-data-a11y` **pivote** : une ligne par valeur de `label-field`, une colonne par valeur distincte du champ de série (dans leur ordre d'apparition, le même que celui des séries du graphique). La cellule de libellé devient un **`<th scope="row">`** — dans un tableau croisé, une valeur sans en-tête de ligne n'a plus qu'une moitié de ses coordonnées pour un lecteur d'écran. Le résumé lu annonce « N lignes, M séries » au lieu du compte du format long, et le **CSV téléchargé suit la même structure** que le tableau affiché.
  
  Garde-fous : l'attribut exige `label-field` **et** `value-field` — sans eux on ne sait pas quelle colonne porte la mesure, et le manque est **nommé** (`data-dsfr-config-error` + console) avec repli sur le tableau à plat, jamais un pivot silencieusement faux. Un couple (libellé, série) absent des données laisse une cellule **vide** : le graphique y trace 0, le tableau ne l'affirme pas.
  
  **Strictement additif** : absent, le rendu est celui d'avant, y compris les `<td>` du tableau à plat. La valeur n'est volontairement **pas** reprise du graphique visé par `for`, qui aurait changé la forme du tableau de pages déjà en ligne.

- [#949](https://github.com/bmatge/dsfr-data/pull/949) [`34a5232`](https://github.com/bmatge/dsfr-data/commit/34a52325b045d9d64a46172c24870179d4f5eb0a) Thanks [@bmatge](https://github.com/bmatge)! - **`dsfr-data-chart` : `map-summary-field` calcule le résumé d'une carte sur une colonne, pendant que la carte en affiche une autre** ([#929](https://github.com/bmatge/dsfr-data/issues/929), PG-031).
  
  Le constat d'origine disait que le résumé pondéré « porte sur la colonne AFFICHÉE ». **La vérification l'a requalifié** : le composant arrondit bien au centième pour *dessiner* la carte, mais le résumé, lui, repart des **lignes source** — cet arrondi-là ne compte pas. Ce qui fausse le chiffre est en amont : `dsfr-data-normalize round="champ:1"`, le réflexe pour une infobulle lisible, **réécrit la colonne dans la donnée**. Le composant ne voit jamais la valeur brute, et Σ(valeur × effectif) / Σ(effectif) pondère des valeurs arrondies. Mesuré au navigateur sur les 101 départements d'une fédération de `data.sports.gouv.fr` : taux national exact **4,5368**, pondéré sur la valeur brute **4,5368**, pondéré sur `round(x, 1)` **4,5331**. L'écart reste plausible, donc invisible. Les deux attributs sont corrects séparément ; c'est leur composition qui ment.
  
  `map-summary-field` désigne la colonne **de calcul**. La page dérive une colonne d'affichage et laisse la brute intacte :
  
  ```html
  <dsfr-data-normalize id="n" source="licences"
    compute="lics_pop_aff = round(lics_pop, 1)"></dsfr-data-normalize>
  <dsfr-data-chart source="n" type="map" code-field="dep"
    value-field="lics_pop_aff" map-summary-weight="pop"
    map-summary-field="lics_pop"></dsfr-data-chart>
  ```
  
  Vaut pour les trois calculs (`sum`, `avg`, `weighted`) ; sans effet sous `map-summary-value` ou `map-summary="none"`. Un champ qu'aucune ligne dessinée ne porte en numérique est une **erreur de configuration nommée** : aucun résumé n'est affiché, jamais un repli silencieux sur la colonne affichée — qui serait exactement le chiffre faux que l'attribut existe pour éviter.
  
  **Strictement additif** : sans l'attribut, rien ne change, et aucun chiffre déjà publié ne bouge. Le JSDoc de `map-summary-weight` et de `map-summary` dit désormais sur quoi porte le calcul, arrondis amont compris — un piège de composition qui n'est écrit nulle part se repaie.

- [#947](https://github.com/bmatge/dsfr-data/pull/947) [`73d45eb`](https://github.com/bmatge/dsfr-data/commit/73d45ebd1fe6297f40754670a983faf82cd569fd) Thanks [@bmatge](https://github.com/bmatge)! - `dsfr-data-chart` : `map-summary`, le mode de synthèse du résumé d'une carte — résout le constat AM-079 du banc d'essai
  
  Le résumé affiché sous le titre d'une carte de **volumes** était une moyenne de
  volumes : « 3 074,06 en France » pour 310 480 licences, la moyenne arithmétique
  de 101 nombres de licenciés, un chiffre sans signification. [#763](https://github.com/bmatge/dsfr-data/issues/763) avait réglé les
  TAUX (`map-summary-weight`) et permis une valeur fournie (`map-summary-value`),
  mais celle-ci est un **littéral** : juste pour une fédération, fausse dès qu'on
  en change ou qu'on filtre une région — précisément le geste dont le banc a
  montré qu'il produit des chiffres faux.
  
  `map-summary` choisit désormais le mode, calculé sur les lignes dessinées :
  
  - `sum` — la **somme**, seule synthèse juste d'un volume, et elle **suit les
    filtres** ;
  - `weighted` — la moyenne pondérée Σ(valeur × effectif) / Σ(effectif), la
    synthèse juste d'un taux (exige `map-summary-weight`) ;
  - `avg` — la moyenne non pondérée, le calcul historique ;
  - `none` — aucun chiffre. Ce qui disparaît est la valeur : l'en-tête « …, en
    France » appartient à DSFR Chart et reste affiché.
  
  La première question d'une carte thématique est **volume ou taux**, et elle
  décide du mode : un volume s'additionne, un taux se pondère, et l'autre calcul
  est faux dans les deux sens. Une somme suppose en outre une **partition** —
  chaque territoire compté une fois. Deux lignes portant le même code
  géographique sont additionnées toutes les deux alors que la carte n'en dessine
  qu'une : un avertissement console le dit désormais, avec le nombre de lignes et
  le nombre de territoires dessinés, et renvoie à une agrégation en amont.
  
  Un mode inconnu, ou `weighted` sans `map-summary-weight`, est une **erreur de
  configuration** : aucun résumé n'est affiché plutôt qu'un chiffre de repli qui
  aurait l'air juste. Un mode posé à côté de `map-summary-value`, ou un
  `map-summary-weight` qu'un mode ignore, est signalé en console — l'intention
  contredite est dite, pas subie.
  
  Le résumé lit la colonne `value-field` telle qu'elle arrive, arrondis d'un
  `dsfr-data-normalize round="…"` en amont compris ; c'est marginal sur une somme,
  pas sur `weighted` (PG-031), et le JSDoc le dit.
  
  **Strictement additif** : sans `map-summary`, le résumé garde exactement son
  ordre historique — valeur fournie, sinon pondérée si un effectif est posé, sinon
  moyenne non pondérée. Aucun chiffre déjà publié ne change.

- [#939](https://github.com/bmatge/dsfr-data/pull/939) [`b6d1e32`](https://github.com/bmatge/dsfr-data/commit/b6d1e326e9aee87516ca045a08228d87144f6f66) Thanks [@bmatge](https://github.com/bmatge)! - **`count-label` sur `dsfr-data-display` et `dsfr-data-list`** ([#925](https://github.com/bmatge/dsfr-data/issues/925), AM-077). Les deux afficheurs comptaient « résultat », mot qui ne dit rien d'un annuaire d'établissements ni d'un palmarès de communes ; `dsfr-data-search` avait reçu le libellé paramétrable en 0.29 ([#779](https://github.com/bmatge/dsfr-data/issues/779)), pas ses deux voisins. Même grammaire que la recherche, et une seule implémentation pour les trois (`utils/count-label.ts`) : `count-label="établissement"` rend « 12 345 établissements », une forme seule prend un « s » au pluriel, et deux formes séparées par une **barre verticale** couvrent le pluriel irrégulier ou le mot invariable (`"cheval|chevaux"`, `"prix|prix"`). La virgule ne sépare pas les deux formes.
  
  Poser l'attribut fait aussi passer le nombre par le **formateur fr-FR** : « 1 234 » et non « 1234 ». C'est le seul moyen, aujourd'hui, d'obtenir sur `display` un compteur accentué et séparé — `count-label="résultat"` rend « 12 345 résultats ».
  
  **Rien ne change sans l'attribut** : `display` rend « 1234 resultats » et `list` « 1234 résultats » exactement comme avant, au caractère près (verrouillé par test). Corriger ces deux libellés par défaut toucherait le texte rendu de toute page qui utilise les composants — c'est le point résiduel de [#925](https://github.com/bmatge/dsfr-data/issues/925), laissé ouvert.
  
  `count-label` ne sait pas **taire** le compteur : une liste de résultats annonce ce qu'elle compte, et sa région live fait partie de son contrat (ADR-135, qui ferme `display` aux besoins structurels). Mettre en forme une ligne sans landmark ni compteur — une fiche, un nom dans une phrase — c'est `dsfr-data-repeat`.

- [#957](https://github.com/bmatge/dsfr-data/pull/957) [`7ff7f85`](https://github.com/bmatge/dsfr-data/commit/7ff7f8511904b5188e7f707879b3f6a2980322d6) Thanks [@bmatge](https://github.com/bmatge)! - Champs tableau : l'égalité côté client regarde enfin DANS le tableau, comme le portail
  
  Sur un champ multivalué (étiquettes ODS, ChoiceList Grist, colonne repliée par `fold`),
  `where="tags:eq:urgent"` ne retenait pas une ligne dont `tags` vaut `["urgent","social"]`,
  alors que `value="count:tags:urgent"` de `dsfr-data-kpi` la comptait. Ce n'était pas une
  sémantique : `looseEquals` faisait `String(a) === String(b)`, donc `Array.prototype.toString`.
  Une ligne à UNE étiquette matchait, une ligne à deux ne matchait pas — le filtre avait l'air
  de marcher sur une partie du jeu.
  
  Et le portail, lui, faisait déjà « contient ». Mesuré le 2026-09-19 sur deux portails et deux
  endpoints :
  
  ```
  data.economie.gouv.fr, catalogue, champ keyword (tableau)
    where=keyword = "budgets annexes"  -> total_count = 1   (2e element)
    where=keyword = "LFI 2011,budgets annexes,finances publiques,loi de finances initiale" -> 0
  
  data.education.gouv.fr, retours-formulaire-votre-avis-copie, champ themes_attendus
    176 lignes, dont 21 nulles
    where=themes_attendus = "Elèves"                -> 124
    where=themes_attendus != "Elèves"               ->  31   (= 155 non nulles - 124)
    where=themes_attendus in ("Elèves","Finances")  -> 130   (= l'union du OU)
  ```
  
  Dès qu'une clause était déléguée — et ce n'est pas la balise qui porte le `where` qui en
  décide, mais le mode de la source, un transformateur amont, le partage de la chaîne —
  le même attribut comptait autre chose. Ajouter un second graphique à une page pouvait
  basculer l'évaluation du serveur vers le client et changer un chiffre affiché, sans un
  message.
  
  ## Ce qui change
  
  L'égalité client est alignée sur celle du serveur, **le repli textuel gardé en OU** :
  
  ```
  eq(valeur, v) = (valeur est un tableau ET un de ses éléments vaut v)
                  OU String(valeur) === String(v)      <- l'existant, inchangé
  ```
  
  - **`eq`, `in`, le `=` de `compute`, le filtre entre accolades du KPI GAGNENT des lignes** :
    celles dont la valeur cherchée est un élément parmi d'autres. Ce sont exactement les pages
    qui sous-comptaient par rapport au portail. Mesuré au navigateur sur le jeu Éducation
    ci-dessus : le même `where`, évalué côté client, affichait **58** là où la clause déléguée
    affichait **124** ; les deux affichent désormais **124**.
  - **`neq` et `notin` en PERDENT**, étant la négation des précédents : `tags:neq:urgent` ne
    garde plus une ligne `["urgent","social"]`. C'est la seule perte, et elle est assumée parce
    que le portail fait pareil — son `!=` est la négation stricte de son `=`, valeurs nulles
    exclues des deux côtés (155 − 124 = 31, mesuré).
  - **Le repli textuel reste** : `["a","b"]` matche encore `"a,b"` côté client, là où le portail
    rend 0. Il est gardé pour que `eq` / `in` ne puissent que gagner des correspondances.
  - **`count:champ:valeur` et `count{champ:eq:valeur}` rendent enfin le même chiffre.**
    `looseEqualsOrContains` a disparu : il n'y a plus qu'une égalité dans le dépôt.
  - **`where="champ:contains:v"` est inchangé** — il reste une recherche de sous-chaîne dans le
    rendu texte du tableau, donc « non-urgent » y matche toujours « urgent ». Pour filtrer un
    champ tableau, c'est `eq` qu'il faut écrire.
  
  Pendant cette mineure, un **avertissement de transition** nomme en console le champ et la
  valeur des lignes qui se mettent à compter, et dit que le compte s'aligne sur ce que renvoie
  le portail. Il est dédupliqué par couple (champ, valeur) et plafonné : sur le jeu Éducation où
  66 lignes basculent, **un seul message** est émis.
  
  Le contournement recommandé jusqu'ici — dériver un booléen par
  `dsfr-data-normalize compute="a_urgent = when contains(tags,'urgent') then 1 else 0"` puis
  `where="a_urgent:eq:1"` — **reste valide**, et garde un intérêt propre (le filtre porte alors
  sur un scalaire, regroupable et délégable). Il n'est simplement plus *nécessaire*.
  
  Closes [#953](https://github.com/bmatge/dsfr-data/issues/953), closes [#842](https://github.com/bmatge/dsfr-data/issues/842).

- [#940](https://github.com/bmatge/dsfr-data/pull/940) [`97094e4`](https://github.com/bmatge/dsfr-data/commit/97094e49de031a0567f0c2fe2f7096111deecd37) Thanks [@bmatge](https://github.com/bmatge)! - `dsfr-data-facets` : un libellé pour les VALEURS d'une facette (`value-labels`)
  
  `labels` nomme les CHAMPS ; rien ne nommait ce qu'ils contiennent. Une facette
  posée sur un champ de code affichait donc « 29 », « 56 », « 101 » là où le
  lecteur attend « Finistère », « Morbihan », « Fédération française
  d'athlétisme » — alors que le libellé se trouve presque toujours dans la même
  ligne, juste à côté du code. Faute d'attribut, les pages retombaient sur un
  `<select>` dont les options étaient générées hors ligne (609 lignes d'`option`
  sur les portraits Sports), liste qui se périme au premier ajout au référentiel.
  
  Voie native nouvelle : `value-labels="dep_code:dep_nom"` lit le libellé dans un
  champ compagnon des mêmes lignes ; `value-labels='{"dep_code":{"29":"Finistère"}}'`
  accepte une table figée quand aucun champ compagnon n'existe. La valeur
  diffusée au contexte, à l'URL et au `where` reste le CODE ; le tri `alpha` et
  la recherche portent sur le libellé, et les tags de `dsfr-data-context-tags`
  affichent le libellé tout en retirant la bonne valeur.
  
  Au passage, une entrée de `labels` qui nomme une valeur au lieu d'un champ
  (`labels="22:Côtes-d'Armor"`) était lue comme un nom de champ et ignorée sans
  un mot : elle est désormais signalée en console, avec renvoi vers
  `value-labels`.
  
  Strictement additif : sans `value-labels`, rien ne change.

- [#940](https://github.com/bmatge/dsfr-data/pull/940) [`97094e4`](https://github.com/bmatge/dsfr-data/commit/97094e49de031a0567f0c2fe2f7096111deecd37) Thanks [@bmatge](https://github.com/bmatge)! - `dsfr-data-facets` : une valeur par défaut par champ (`default`)
  
  Sans sélection, une facette n'émet aucun filtre. C'est le bon comportement
  quand l'absence de filtre veut dire « tout ». Ça ne l'est plus quand l'agrégat
  national est une LIGNE du jeu : sur un jeu qui publie `region = "Toutes
  régions"` à côté d'une ligne par région, l'absence de filtre cumule la France
  entière ET chaque région — un total qui ne veut rien dire, affiché sans
  avertissement. La facette n'avait aucun moyen de dire « ce filtre porte
  toujours une valeur ». `dsfr-data-context-filter` a `default`, mais il pilote
  un élément d'UI par son `id`, que la facette ne fournit pas.
  
  Voie native nouvelle : `default="region:Toutes régions | secteur:Tous secteurs"`,
  à la grammaire des autres attributs par champ. La valeur est posée au montage,
  APRÈS la lecture de l'URL (`url-params`, ou l'URL du contexte en mode
  `context`), qui l'emporte, et elle est émise comme une sélection normale —
  tags, URL et cascade suivent. Un champ ainsi nommé ne redevient jamais vide :
  la remise à zéro (bouton, tag retiré, dernière case décochée) revient au
  défaut, et les options « Tous » de `select` et `radio-inline` ne sont plus
  rendues pour ce champ, faute de pouvoir mener ailleurs qu'au défaut.
  
  Strictement additif : sans `default`, rien ne change.

- [#946](https://github.com/bmatge/dsfr-data/pull/946) [`711d3fc`](https://github.com/bmatge/dsfr-data/commit/711d3fc30af7b04d8eb2bc745f94c6d460574930) Thanks [@bmatge](https://github.com/bmatge)! - `dsfr-data-query` : la part du total (`share`, `share_percent`) — résout le constat AM-078 du banc d'essai
  
  Une répartition — « part des licences par typologie de communes », « part par
  tranche d'âge », « part par statut » : l'une des trois formes les plus courantes
  d'un tableau de bord — n'avait aucune voie native. Aucun agrégat ne produisait
  le total à côté des lignes groupées, `compute` ne voit que la ligne courante, et
  le ratio de `dsfr-data-kpi` ([#673](https://github.com/bmatge/dsfr-data/issues/673)) rend UN nombre, pas une colonne : un
  GRAPHIQUE de parts restait hors d'atteinte. Le chemin qui marchait coûtait, par
  répartition, une seconde source sans `group-by`, deux clés constantes
  (`compute="k = 1"`), un `dsfr-data-join on="k"` et une division — quatre
  composants et une requête de plus, payés trois fois sur la même page.
  
  Deux fonctions d'agrégat nouvelles :
  
  - `aggregate="lics:sum, lics__sum:share"` rend `lics__sum__share`, la valeur de
    la ligne divisée par la somme de la colonne sur les lignes de sortie — une
    **fraction** (0,334), celle que `dsfr-data-kpi format="pourcentage"` met à
    l'échelle comme un ratio ;
  - `share_percent` rend la même part **en points de pourcentage** (33,4), la
    forme qu'attend un axe de graphique : une fraction dessinée sous un axe
    intitulé « % » y afficherait 0,33.
  
  **Le dénominateur, qui est tout le sujet.** C'est la somme de la colonne sur les
  lignes de sortie, **avant `limit`**. Donc une part est toujours une part de
  l'ensemble **filtré** : `where`, facettes, recherche et `dsfr-data-context`
  déplacent le total, et c'est presque toujours ce qu'on veut — mais le même
  graphique montre 33,4 % sans filtre et 16,3 % sur une région, les deux justes,
  et la page doit le dire. Avec `limit`, les parts **ne somment pas à 100 %** : un
  top 10 montre la part de chaque ligne dans le tout, pas dans le top 10 ;
  l'inverse ferait d'une troncature d'affichage une redéfinition silencieuse du
  total. Et si la source est tronquée (`max-records`, pagination), le dénominateur
  l'est aussi, sans que rien ne le montre : les parts somment quand même à 100 %.
  
  Comme les agrégats cumulés, ce sont des fonctions de **fenêtre** : calcul
  toujours côté client, jamais délégué à l'API, et un `group-by` qui porte une
  part redescend entièrement côté client — relever `max-records` avant de poser
  l'attribut sur un jeu volumineux. À la différence des cumuls, l'ordre des lignes
  est indifférent : pas d'`order-by` requis, pas d'avertissement.
  
  Total nul, ou valeur non numérique : `null`, jamais l'infini ni un zéro de
  complaisance ; une valeur non numérique ne compte pas non plus au dénominateur.
  
  Le calcul est tenu par deux contrôles de l'oracle (`agregat-part-du-total-926`,
  `agregat-part-du-total-avant-limit`), recalculés par les trois voix, avec la
  mutation qui les fait rougir.
  
  Strictement additif : sans `share` ni `share_percent`, rien ne change.

- [#945](https://github.com/bmatge/dsfr-data/pull/945) [`fcca8cc`](https://github.com/bmatge/dsfr-data/commit/fcca8cce9801448cebca1996b7c8fc6fde9f131f) Thanks [@bmatge](https://github.com/bmatge)! - **`lazy` sur `dsfr-data-source` : différer la première requête jusqu'à ce que quelqu'un regarde** ([#931](https://github.com/bmatge/dsfr-data/issues/931), AM-083). Une page à onglets déclare ses sources pour **tous** les panneaux ; cinq sur six sont fermés à l'arrivée, et pourtant toutes les requêtes partent au chargement. Sur un portail dont le quota anonyme est de 5 000 requêtes par jour et par IP, quelques dizaines de chargements suffisent à épuiser la journée. Avec `lazy`, la première requête attend qu'un consommateur de la source entre dans une marge de 200 px autour du viewport (`IntersectionObserver`, la même marge que `dsfr-data-map` et que le `lazy` de `dsfr-data-repeat`, [#891](https://github.com/bmatge/dsfr-data/issues/891) — même nom, même grammaire booléenne, pour la même raison).
  
  **Mesure** (fixture `e2e/source-lazy.html` : six onglets, huit sources chacun, 48 sources ; Chromium, le même document mesuré deux fois, l'attribut retiré à la volée pour la référence) : **48 requêtes au repos sans l'attribut, 6 avec**. 12 après ouverture d'un second onglet, 38 après avoir ouvert les six et défilé le dernier. Un panneau fermé est en `display:none` : il n'a pas de boîte, il n'intersecte jamais, et l'observateur se déclenche à l'ouverture de l'onglet.
  
  **Ce qui est observé** : les **feuilles** de la chaîne aval (chart, list, kpi, display, podium, a11y, repeat ; pour une couche de carte, la carte qui la porte), suivies à travers les transformateurs — un `dsfr-data-query` est un tuyau déclaré en haut de page, l'observer reviendrait à ne rien différer. **`lazy-target="<sélecteur CSS>"`** remplace cette détection quand elle ne peut pas voir le bon élément.
  
  **Opt-in strict** : sans l'attribut, rien ne change. Et **toutes les dégradations vont du côté « on charge »** : sans `IntersectionObserver`, ou si la page ne déclare aucun consommateur (ou si `lazy-target` ne désigne rien), la source part immédiatement **et le dit en console** — une source qui ne chargerait jamais serait pire que le trafic qu'on cherche à éviter.
  
  **Ce que `lazy` ne promet pas** : un `IntersectionObserver` n'est pas continu. Il échantillonne aux temps de rendu ; un défilement par crans rapides peut traverser un consommateur sans jamais le rapporter comme visible — la source reste alors en attente jusqu'au prochain passage. C'est le comportement du navigateur, pas un bug de la bibliothèque, et c'est écrit dans le guide.
  
  Se cumule avec `require-where` : les deux portes doivent s'ouvrir, et `require-where` est évalué **en premier** (c'est son message d'attente que l'utilisateur doit lire). Pendant l'attente, la source publie `dsfr-data-idle` avec `reason: 'lazy'`, et le **volet Diagnostic distingue les deux attentes** — « en attente d'un regard (lazy) » et « en attente d'un filtre (require-where) » : les confondre enverrait chercher un filtre là où il suffit de faire défiler.

### Patch Changes

- [#942](https://github.com/bmatge/dsfr-data/pull/942) [`5ce5389`](https://github.com/bmatge/dsfr-data/commit/5ce5389d7f0c631980567f1edc384ca5f827ac97) Thanks [@bmatge](https://github.com/bmatge)! - Deux contextes sur un même contrôle : la dépendance à l'ordre de déclaration se dit ([#923](https://github.com/bmatge/dsfr-data/issues/923))
  
  Un `dsfr-data-context-filter` lit la valeur de son contrôle **à son montage**, et
  le pré-remplissage depuis l'URL (ou depuis `default`) écrit `el.value` **sans
  émettre d'événement**. Quand deux contextes écoutent le même `<select>`, le filtre
  du contexte déclaré avant le contexte `url-sync` reste donc sur la valeur
  initiale : deux pages identiques à l'ordre près répondent deux choses différentes
  sur la même URL, avec le même affichage. C'est un chiffre faux, pas un inconfort.
  
  La console le dit désormais, une fois par situation : elle nomme le contrôle, le
  filtre qui vient d'être pré-rempli, celui qui a lu trop tôt et son contexte, puis
  le geste qui sort du piège — déclarer le contexte `url-sync` **en premier** dans
  le document. Le message ne sort que si le pré-remplissage a réellement changé la
  valeur du contrôle : deux filtres qui lisent la même valeur ne se contredisent pas.
  
  **Aucun comportement ne change** : émettre un `change` au pré-remplissage
  corrigerait le fond mais changerait l'ordre d'application de toutes les pages qui
  marchent. La dépendance est aussi documentée dans la fiche `url-sync`.

- [#942](https://github.com/bmatge/dsfr-data/pull/942) [`5ce5389`](https://github.com/bmatge/dsfr-data/commit/5ce5389d7f0c631980567f1edc384ca5f827ac97) Thanks [@bmatge](https://github.com/bmatge)! - Deux contextes `url-sync` qui partagent un nom de champ ne le font plus en silence ([#922](https://github.com/bmatge/dsfr-data/issues/922))
  
  Deux `dsfr-data-context url-sync` qui portent un filtre sur le **même champ**
  écrivent le **même paramètre d'URL** : le dernier écrase les autres, et l'URL ne
  garde qu'une valeur pour deux contextes. Rechargé, un comparateur de territoires
  compare donc un territoire avec lui-même. Rien ne le disait — la détection de
  conflit existante ([#773](https://github.com/bmatge/dsfr-data/issues/773)) ne couvrait qu'une facette autonome face à un contexte.
  
  La console le dit désormais, une fois par paramètre et par jeu de contextes :
  elle nomme le paramètre, tous les contextes qui l'écrivent, et le geste qui sort
  du piège — un seul contexte dans l'URL, ou `url-param-map` pour séparer les
  paramètres.
  
  **Aucun comportement ne change** : l'URL écrite et l'ordre d'application restent
  exactement ceux d'avant, pour ne casser aucun lien déjà partagé.

- [#951](https://github.com/bmatge/dsfr-data/pull/951) [`05eaf40`](https://github.com/bmatge/dsfr-data/commit/05eaf4063048b1ccc927e1fd83d489a3ad5b3b81) Thanks [@bmatge](https://github.com/bmatge)! - Champs tableau : l'asymétrie entre `count:champ:valeur` et `where` est documentée, pas étendue
  
  Un champ multivalué arrive dans la page comme un tableau (`tags: ["urgent","social"]`).
  Une seule grammaire sait regarder DEDANS : la valeur de filtre d'un `count` de
  `dsfr-data-kpi` (`value="count:tags:urgent"`, [#673](https://github.com/bmatge/dsfr-data/issues/673)). Le dialecte colon de `where` —
  sur la source, sur `dsfr-data-query`, sur le `where` du KPI, et jusque dans le filtre
  entre accolades du KPI lui-même (`count{tags:eq:urgent}`) — compare la valeur du champ
  telle quelle, comme `=` / `!=` de `compute`. Sur le même jeu, deux écritures voisines
  rendent donc deux chiffres différents.
  
  Étendre la variante « contient » à `where` et `compute` a été écarté : une page qui
  comptait zéro ligne sur un champ tableau en compterait soudain, sans un mot. C'est
  la documentation qui manquait, et elle manquait d'autant plus que la panne n'est pas
  franche : par repli sur le texte, une ligne à UNE seule étiquette (`["urgent"]`) matche
  bien `tags:eq:urgent`, une ligne à deux ne matche pas. Le filtre a l'air de marcher sur
  une partie du jeu.
  
  Le JSDoc de `where` (`dsfr-data-query`, `dsfr-data-kpi`), celui de `value` du KPI et
  celui de `compute` (`dsfr-data-normalize`) disent désormais sur quoi porte la variante
  tableau et sur quoi elle ne porte pas — et nomment la voie de remplacement, qui existe :
  `compute="a_urgent = when contains(tags,'urgent') then 1 else 0"` puis
  `where="a_urgent:eq:1"`. Il n'y a PAS d'opérateur `where` qui parcourt un tableau, et
  `tags:contains:urgent` n'en est pas un (il cherche une sous-chaîne dans le rendu texte
  du tableau : « non-urgent » y matche « urgent »). `docs/USER-GUIDE.md` et la skill
  `dsfr-data` portent la même chose, et `tests/shared/array-equality-perimeter.test.ts`
  fixe le périmètre exact pour que le prochain changement de sémantique soit délibéré.
  
  Aucun changement de comportement : documentation, commentaires et tests.
  
  > **Dépassé dans la même version.** L'arbitrage ci-dessus (« documenter plutôt
  > qu'étendre ») a été pris avant de savoir qu'Opendatasoft lit déjà `=` comme un
  > « contient » sur un champ multivalué. L'asymétrie n'était donc pas un contrat mais
  > une incohérence interne, et elle est levée dans cette même version — voir l'entrée
  > « l'égalité côté client regarde enfin DANS le tableau » ([#953](https://github.com/bmatge/dsfr-data/issues/953)). Ce qui reste vrai de
  > ce paragraphe : `tags:contains:urgent` n'est toujours pas un équivalent d'`eq`, et la
  > colonne dérivée par `compute` reste une écriture valide.

- [#948](https://github.com/bmatge/dsfr-data/pull/948) [`98e46c9`](https://github.com/bmatge/dsfr-data/commit/98e46c916dc4f7a5d88111db4d542547f2c473b6) Thanks [@bmatge](https://github.com/bmatge)! - Un filtre de contexte qui compare « 01 » à un champ entier ne le fait plus en silence ([#924](https://github.com/bmatge/dsfr-data/issues/924))
  
  Un `dsfr-data-context-filter` lit une valeur de formulaire — toujours du texte —
  et l'émet telle quelle : `reg = "01"`. Sur un champ que le jeu publie en
  **entier**, le portail compare en texte et ne rencontre jamais l'entier 1 :
  aucune ligne, aucun message, un KPI à « — ». Le `refine` du portail, lui,
  trouvait la ligne. Les codes métropolitains (« 75 ») passent, ce qui cache le
  défaut : seuls la Guadeloupe, la Martinique, la Guyane, La Réunion, Mayotte et
  les neuf premiers départements restent muets.
  
  La console le dit désormais, **une fois par champ et par source** : elle nomme
  le champ, la valeur émise, la source qui publie ce champ en nombre — avec un
  exemple pris dans ses lignes — et le geste qui sort du piège. Elle se tait
  quand la valeur survit à l'aller-retour texte ↔ nombre (« 75 »), quand le champ
  est publié en texte, quand la source n'a encore rien rendu et quand le champ y
  est hétérogène : un avertissement qui crie à tort serait pire que pas
  d'avertissement.
  
  **Aucun comportement ne change** : la clause émise est exactement celle
  d'avant. Émettre un littéral numérique ou basculer l'égalité sur `refine`
  corrigerait le fond, mais changerait la requête de pages qui fonctionnent
  aujourd'hui — les deux autres critères de [#924](https://github.com/bmatge/dsfr-data/issues/924) restent ouverts.

- [#954](https://github.com/bmatge/dsfr-data/pull/954) [`a1da844`](https://github.com/bmatge/dsfr-data/commit/a1da8449293f822bc38d85111f5d600ed78c8636) Thanks [@bmatge](https://github.com/bmatge)! - Champ tableau : dire que le serveur, lui, lit `=` comme un « contient » ([#953](https://github.com/bmatge/dsfr-data/issues/953))
  
  La documentation livrée par [#842](https://github.com/bmatge/dsfr-data/issues/842) portait la mention « non vérifié à ce jour » sur ce
  que fait Opendatasoft d'une égalité posée sur un champ multivalué. C'est mesuré, le
  2026-09-19, sur le catalogue de `data.economie.gouv.fr`, champ `keyword` :
  
  ```
  where=keyword = "budgets annexes"   -> HTTP 200, total_count = 1   (2e element)
  where=keyword = "LFI 2011"          -> HTTP 200, total_count = 1   (1er element)
  where=keyword = "inexistant-xyz"    -> HTTP 200, total_count = 0   (temoin)
  ```
  
  Le serveur trouve la ligne sur n'importe quel élément du tableau. Il y a donc trois
  comportements, pas deux : `['urgent']` matche des deux côtés, `['urgent','social']`
  matche au serveur seulement, `['a','b']` comparé à `'a,b'` matche au client seulement.
  
  Et ce qui décide de la délégation n'est pas écrit dans la balise qui porte le `where` :
  mode de la source, transformateur amont, partage de la source, `explode`. Ajouter un
  second graphique à une page peut donc changer un chiffre sans qu'on touche au filtre.
  
  Documentation seule, aucun changement de comportement : JSDoc de `where` sur
  `dsfr-data-query` et `dsfr-data-kpi`, section « Champs tableau » du guide, passages
  correspondants de la skill.
  
  > **Suite, dans la même version.** Les trois comportements décrits ci-dessus ne sont
  > plus que deux : le client a été aligné sur le serveur ([#953](https://github.com/bmatge/dsfr-data/issues/953)), en gardant le repli
  > textuel — `['urgent','social']` matche désormais des deux côtés, `['a','b']` vs
  > `'a,b'` reste un repli client que le portail n'a pas.

## 0.32.0

### Minor Changes

- [#934](https://github.com/bmatge/dsfr-data/pull/934) [`01d57fb`](https://github.com/bmatge/dsfr-data/commit/01d57fbc441c30d2624c5094e75e197761c808ad) Thanks [@bmatge](https://github.com/bmatge)! - **`dsfr-data-repeat` devient un émetteur : `scopes`** (ADR-135, [#887](https://github.com/bmatge/dsfr-data/issues/887), lot 2, [#891](https://github.com/bmatge/dsfr-data/issues/891)). `scopes="scores:code_unifie:q | effectifs:code_unifie:e"` partitionne une ou plusieurs sources **par champ** — une passe, une `Map` par champ — et émet **un id par ligne répétée** (`q-001`, `e-001`…), que le gabarit lit par `{{$scope.q}}` (ou `{{$scope}}` quand une seule entrée est déclarée). Plus une seule `dsfr-data-query` interpolée dans le gabarit, plus un seul id fabriqué à la main. Grammaire : `source:champ:alias`, entrées séparées par `|`, alias facultatif (à défaut, l'id de la source) ; `key-field` est requis, la clé de partition est celle de la ligne.
  
  Mesures sur la page témoin (Chromium, 119 lignes × un graphique) : le **refiltre** d'une ré-émission de la source scopée passe de **13,8 ms** (119 queries qui refiltrent chacune la source entière) à **2,3 ms** (une partition), les écouteurs `document` par type d'événement de **2,03** à **1,03 par ligne**, et **aucune instance n'est recréée**.
  
  Ce que `scopes` garantit : une clé sans lignes émet un **tableau vide** (la ligne existe, son graphique est vide, pas absent) ; les états `loading`, `error` et `idle` (`require-where`) de la source scopée sont **relayés** sur chaque id scopé, y compris pour une ligne qui vient de naître ; une ré-émission de la source scopée re-partitionne **sans toucher aux lignes** ; les ids scopés sont **purgés** du cache avec leur ligne et à la déconnexion. Meta relayée réduite au `total` du scope — `truncated` et `serverSide` ne se propagent pas derrière un id fabriqué. Aucune délégation serveur : la partition est cliente, même règle que N queries sur une source partagée.
  
  **`lazy`** (booléen) n'insère les composants `dsfr-data-*` d'une ligne qu'à son entrée dans une marge de 200 px autour du viewport (`IntersectionObserver`, la même que `dsfr-data-map`) : retenus hors du document, attributs déjà interpolés, ils ne s'abonnent à rien et ne dessinent rien avant. Les titres et les textes du gabarit, eux, sont rendus d'emblée — le plan de la page et sa hauteur ne dépendent pas du défilement. Mesure : **4 graphiques dessinés sur 119** au chargement, 119 après défilement complet. `lazy` ne réserve pas la hauteur à la place de l'auteur : donner une `min-height` au gabarit.
  
  **Volet Diagnostic** : un `StageNode` porte désormais `emits` (les ids qu'un nœud fabrique, lus sur `getScopedIds()`). Les ids scopés ne sont donc plus comptés « amonts introuvables » — une fausse panne par ligne — et `formatTrace()` rend une section « Ids scopés » qui les attribue à leur répéteur (`q-001 ← dsfr-data-repeat#questions`).
  
  Rien de silencieux : nombre de termes, terme vide, alias en double, source introuvable dans la page, champ absent des lignes de la source scopée — chaque cas pose une erreur de configuration qui **nomme l'entrée**.

### Patch Changes

- [#921](https://github.com/bmatge/dsfr-data/pull/921) [`76dd9f1`](https://github.com/bmatge/dsfr-data/commit/76dd9f1e2f7ee82b16662aaabea9ecaa69a9143b) Thanks [@bmatge](https://github.com/bmatge)! - **Le bouton d'accordéon de `dsfr-data-a11y` ne déborde plus de 16 px sur téléphone ([#898](https://github.com/bmatge/dsfr-data/issues/898)).** La classe DSFR `fr-accordion__btn` est écrite pour un `<button>`, dont le `box-sizing` par défaut est `border-box` ; le `<summary>` qui la porte est `content-box`. Il recevait donc `width: 100 %` **et** 16 px de padding de chaque côté : 390 px dans un conteneur de 358, et un `scrollWidth` de 406 px sur un viewport de 390 — **toute** page portant un `dsfr-data-a11y` défilait horizontalement sur téléphone (51 des 66 pages du banc d'essai, mesurées). Le composant pose désormais `box-sizing: border-box` sur son propre `summary`, règle bornée à son accordéon : elle ne touche pas ceux de la page hôte. Le contournement en CSS de page (`dsfr-data-a11y summary { box-sizing: border-box }`), qui visait le DOM interne d'un composant, n'a plus lieu d'être.

- [#919](https://github.com/bmatge/dsfr-data/pull/919) [`397d33c`](https://github.com/bmatge/dsfr-data/commit/397d33c45135bf76f7bfbb1cf9386576c366c5b2) Thanks [@bmatge](https://github.com/bmatge)! - **Une jointure dont une entrée est en `require-where` ne reste plus sur « Chargement… » selon l'ordre des balises ([#897](https://github.com/bmatge/dsfr-data/issues/897)).** `TransformerMixin` relayait chaque événement amont tel quel : avec une seule entrée, l'état du dernier événement est bien l'état du nœud ; avec deux, les relais s'écrasaient. Quand le `dsfr-data-loading` de l'entrée ordinaire arrivait après le `dsfr-data-idle` de l'entrée `require-where`, l'aval restait sur un chargement que rien ne venait lever — la jointure n'émet rien tant que ses deux entrées ne sont pas là. La seule différence entre la page qui marchait et la page qui bloquait était l'ordre des deux `dsfr-data-source` dans le DOM, sans message ni erreur console.
  
  Un transformateur multi-entrées **dérive** désormais son état de **toutes** ses entrées : erreur d'abord, puis attente (une entrée qui attend un filtre ne livrera rien, donc le résultat ne se fera pas), puis chargement tant qu'aucune n'attend. Une entrée chargée qui ne suffit pas à produire le résultat ne laisse plus l'aval sur un chargement sans fin. Les transformateurs à une seule entrée (query, normalize, unpivot, facets, search) sont inchangés par construction.
  
  Le contournement en page — déclarer les entrées pleines avant la source `require-where`, et ne mettre aucun transformateur entre elles et la jointure — n'a plus lieu d'être.

- [#917](https://github.com/bmatge/dsfr-data/pull/917) [`ab577d1`](https://github.com/bmatge/dsfr-data/commit/ab577d1ceaa4d6e5b9938791a7d71fd5ea667014) Thanks [@bmatge](https://github.com/bmatge)! - **Les bundles publiés n'embarquent plus Lit en mode développement ([#899](https://github.com/bmatge/dsfr-data/issues/899)).** `scripts/build-lib.ts` posait bien `mode: 'production'` et `process.env.NODE_ENV: '"production"'` dans `define` — mais l'un et l'autre réécrivent le **code produit**, ils ne choisissent pas la **condition d'export** par laquelle Vite résout une dépendance. Vite lit pour cela `process.env.NODE_ENV` du processus de build, que `vite-node` laisse à « development » : Lit publiant une condition `development`, les paquets npm embarquaient `lit-html/development`, `lit-element/development` et `reactive-element/development` (vérifié sur 0.30.0 et 0.31.0 : deux occurrences de « Lit is in dev mode » dans `dist/dsfr-data.esm.js`). Conséquence chez tous les intégrateurs, sur chaque page : les vérifications supplémentaires du mode dev de Lit à chaque mise à jour de propriété, et un avertissement « Lit is in dev mode » en console. La variable est désormais posée explicitement avant tout appel à `build()` — même correctif de forme que [#716](https://github.com/bmatge/dsfr-data/issues/716), une couche plus bas. Les bundles perdent au passage 14 à 15 Ko chacun.
  
  **Un garde-fou empêche la régression de revenir** (`tests/lib-dev-mode-guard.test.ts`, rejoué par la CI après le build, comme la garde de [#716](https://github.com/bmatge/dsfr-data/issues/716)) : les six bundles publiables sont grepés, aucun ne doit contenir « Lit is in dev mode » ni un chemin `*/development`. Les builds de développement (`DSFR_DATA_DEV_BUILD=1`) restent en mode dev, Lit compris.

- [#920](https://github.com/bmatge/dsfr-data/pull/920) [`a653909`](https://github.com/bmatge/dsfr-data/commit/a653909e14c648eefeadb55e2d0df92fd0bf4315) Thanks [@bmatge](https://github.com/bmatge)! - **Avec `databox`, `reference-lines` et `targets` sont de nouveau visibles ([#903](https://github.com/bmatge/dsfr-data/issues/903)).** Les overlays étaient bien construits, aux bonnes dimensions, sans un message — et peints SOUS la carte de la DataBox. Sous `databox`, DSFR Chart téléporte le canvas dans `div.fr-card.databox` (`position: relative`, `z-index: 500`, fond blanc opaque) tandis que les SVG restaient à côté de `data-box`, dans `.dsfr-data-chart__databox-wrapper` : deux positionnés du même contexte d'empilement, celui à 500 gagne. `elementFromPoint` au milieu de la ligne de référence renvoyait le canvas. Même famille que [#813](https://github.com/bmatge/dsfr-data/issues/813) (`color-map` recolorait le graphique mais pas sa légende) : la DataBox déplace le canvas, et ce qui vise le canvas doit le suivre.
  
  Les overlays sont désormais posés dans le **premier ancêtre positionné du canvas** — la carte quand il y a une DataBox, le wrapper sinon —, donc dans son contexte d'empilement, donc peints après lui. Plutôt qu'une course au `z-index` : un overlay à 501 passerait aussi au-dessus de la modale et du plein écran de la DataBox, qui vivent dans la carte. Sans `databox`, rien ne change.

## 0.31.0

### Minor Changes

- [#905](https://github.com/bmatge/dsfr-data/pull/905) [`2a38d80`](https://github.com/bmatge/dsfr-data/commit/2a38d809a4ebfb0cf0517e941e5761c542f6f75d) Thanks [@bmatge](https://github.com/bmatge)! - **Nouveau composant de structure `dsfr-data-repeat`** (ADR-135, [#887](https://github.com/bmatge/dsfr-data/issues/887), lot 1) : répéter des instances vivantes — une ligne de données, un pipeline. Pour chaque ligne de `source`, le `<template>` enfant est **cloné en DOM** et ses placeholders résolus nœud par nœud avec le moteur de gabarit partagé (`{{}}`, formats, `{{#if}}`, `{{#unless}}`, `{{#each}}` — aucune syntaxe nouvelle) ; les composants `dsfr-data-*` du gabarit sont rehaussés avec leurs attributs **déjà interpolés**.
  
  Ce que `repeat` promet, et que le motif « composants dans un gabarit de `display` » ne promet pas : **l'identité par clé** (`key-field` — une ligne dont la clé subsiste garde ses nœuds et ses instances, attributs mis à jour en place, jamais de déconnexion-recréation sous le même id : 119 graphiques ré-émis en ~110 ms sans un canvas détruit, contre ~4,7 s de recréation avec `display`), **l'imbrication** (un `<template>` intérieur n'est pas parcouru : un `display` ou un `repeat` dans le gabarit rend ses propres placeholders), **les attributs booléens conditionnels** (`data-if-horizontal="champ"` / `data-unless-…`), et un **rendu transparent** : aucun `role`, aucun `aria-live`, aucun compteur, aucune pagination. Attributs : `source`, `key-field`, `per-row` (échelle ADR-112), `empty` ; variables `{{$index}}`, `{{$key}}`, `{{$uid}}`. Règle d'usage : `display` quand la ligne est du contenu, `repeat` quand la ligne est un pipeline.
  
  Rien de silencieux : `source` absent, gabarit absent, `key-field` absent des lignes ou en double, `per-row` invalide, bloc `{{#if}}` coupé entre deux éléments frères → erreur de configuration nommée. `{{{brut}}}` n'a pas de sens dans un rendu par nœuds : rendu échappé, avec avertissement.
  
  `renderTemplate` gagne une option additive `escape: false` (sortie texte) ; le contrat de `display` et `map-popup` est inchangé.

### Patch Changes

- [#895](https://github.com/bmatge/dsfr-data/pull/895) [`f19df13`](https://github.com/bmatge/dsfr-data/commit/f19df13efc405f813dacfb3fcf316c005e9cf7fd) Thanks [@bmatge](https://github.com/bmatge)! - Deux défauts du motif « un composant par ligne » (gabarit de `dsfr-data-display` contenant des composants `dsfr-data-*`).
  
  **Le cache d'un `id` repris n'est plus purgé par l'instance qu'il remplace ([#893](https://github.com/bmatge/dsfr-data/issues/893)).** À la déconnexion d'un transformateur — et d'une `dsfr-data-source`, qui portait la même purge — le cache global n'est vidé que si plus aucun élément du document ne porte cet `id`. Dans un navigateur, réécrire un `innerHTML` connecte les nouvelles instances **avant** de déconnecter les anciennes (mesuré sous Chromium : `connected a`, `connected b`, `disconnected a` — happy-dom ordonne l'inverse) : chaque ré-émission de la source répétée vidait donc le cache que la nouvelle query homonyme venait de remplir, et un consommateur monté plus tard — un KPI par exemple — lisait du vide et affichait « — ». Un composant réellement retiré de la page purge toujours son cache.
  
  **Le gabarit est recapturé quand le bundle est chargé dans le `<head>` ([#894](https://github.com/bmatge/dsfr-data/issues/894)).** `connectedCallback` s'exécutait alors avant que le `<template>` enfant ne soit analysé : le gabarit était vide, et quand les données étaient déjà connues au montage (source `data` en ligne, cache déjà rempli) aucun rendu ultérieur ne venait le rattraper — la liste restait vide définitivement. Une seconde capture a lieu à la fin de l'analyse du document, sur le modèle de `dsfr-data-map-popup`.

- [#915](https://github.com/bmatge/dsfr-data/pull/915) [`570cb09`](https://github.com/bmatge/dsfr-data/commit/570cb093501de7c7ea4a06e0e146d2221f297b3d) Thanks [@bmatge](https://github.com/bmatge)! - **L'avertissement « source partagée » n'est plus ré-émis une fois par voisin ([#900](https://github.com/bmatge/dsfr-data/issues/900)).** Sur une page portant le motif « une query par ligne » — N `dsfr-data-query` sur une même source, gabarit de `dsfr-data-display` —, l'avertissement de [#765](https://github.com/bmatge/dsfr-data/issues/765) partait en O(N²) : sa déduplication comparait une signature `source|liste des lecteurs`, et cette liste s'allonge d'un élément à chaque lecteur qui s'inscrit, donc chaque query repartait pour un avertissement par voisin arrivé après elle. Mesuré en navigateur réel, bundle de production, 119 queries sur une source en ligne : **7 139 `console.warn` au premier rendu, 119 après** — un par query, ce que l'avertissement a toujours voulu dire. Il n'est ni supprimé ni conditionné à un seuil : la déduplication porte désormais sur la source, la liste des lecteurs restant un détail du message.
  
  **Une chaîne déjà reconnue partagée ne se renégocie plus à chaque lecteur ([#900](https://github.com/bmatge/dsfr-data/issues/900)).** L'arrivée d'un lecteur de plus sur une chaîne partagée, pour une query qui ne délègue déjà plus rien, ne peut changer aucune décision : le partage ne se défait pas, et il n'y a plus d'overlay à libérer. La renégociation relisait pourtant toute la chaîne et rediffusait `dsfr-data-delegation-contested` à tous les voisins, là encore en O(N²). Le maillon rehaussé après coup ([#855](https://github.com/bmatge/dsfr-data/issues/855)) et la query qui délègue encore un `where` continuent de renégocier.

## 0.30.0

### Minor Changes

- [#863](https://github.com/bmatge/dsfr-data/pull/863) [`6d0eb47`](https://github.com/bmatge/dsfr-data/commit/6d0eb47ed64a1dbde71ab896c6257d6b7219a291) Thanks [@bmatge](https://github.com/bmatge)! - Négociation de délégation : un registre d'instances, une contestation par tout lecteur, un relais franchi et un `where` seul délégué.
  
  - **[#836](https://github.com/bmatge/dsfr-data/issues/836)** — `readersOf()` faisait un `document.querySelectorAll('*')` par saut de chaîne, à chaque négociation et à chaque contestation : sur un tableau de bord de vingt requêtes et quelques milliers de nœuds, autant de balayages complets du DOM à l'initialisation. Un **registre d'instances** (`utils/instance-registry.ts`) le remplace : chaque composant qui s'abonne à une chaîne s'y inscrit à `connectedCallback` et s'en retire à `disconnectedCallback`, la lecture est en O(composants). Un élément `dsfr-data-*` qu'aucune définition ne rehausse n'est plus compté comme lecteur — il n'affiche rien et ne lit rien.
  
  - **[#853](https://github.com/bmatge/dsfr-data/issues/853)** — un KPI, une liste ou un graphique ajouté APRÈS l'initialisation ne contestait pas la délégation : `dsfr-data-delegation-contested` n'avait qu'un seul émetteur, une autre `dsfr-data-query` pendant sa propre négociation. L'overlay `group_by` restait posé et le nouveau venu comptait les GROUPES (mesuré : 8 au lieu de 137). Tout abonné qui s'inscrit sur une chaîne déjà déléguée la fait désormais renégocier. **Résout le constat BUG-009 (forme tardive) du banc d'essai open-data-viz.**
  
  - **[#855](https://github.com/bmatge/dsfr-data/issues/855)** — la délégation ne franchissait pas un `dsfr-data-normalize` : 0 URL sur 2 portaient `group_by`, le jeu entier était rapatrié puis regroupé dans le navigateur. La cause était l'ordre des `customElements.define` (`dsfr-data-query` est définie avant `dsfr-data-normalize`) : au moment où la query négociait, son amont était un `HTMLElement` nu, sans `getAdapter()`. Le signal du registre refait la négociation au rehaussement du maillon, avant le premier fetch : une seule requête part, déjà groupée.
  
  - **[#856](https://github.com/bmatge/dsfr-data/issues/856) / [#854](https://github.com/bmatge/dsfr-data/issues/854)** — une requête à `where` seul (sans `group-by`) délègue désormais sa clause quand elle est seule lectrice de sa chaîne : l'overlay est clé par émetteur (ADR-031) et se fusionne avec ceux des facettes, de la recherche et du contexte. C'est ce qui libère `require-where` comme sa documentation le promettait — une source `require-where` derrière une telle requête restait en attente pour toujours, page vide et sans message. JSDoc de `where` (plus de conditionnel) et de `require-where` mis à jour.
  
  Limite connue, hors périmètre de ces issues : la délégation ne revient pas quand la chaîne redevient exclusive (lecteur retiré de la page) — la requête reste côté client jusqu'à la prochaine renégociation.
  
  Les quatre contrôles de vérification correspondants (`lecteur-tardif-renegociation`, `relais-normalize-devrait-deleguer`, `where-seul-devrait-etre-delegue`, `require-where-filtre-par-delegation`) passent de `skip` à vert, avec leurs attendus inchangés.

### Patch Changes

- [#862](https://github.com/bmatge/dsfr-data/pull/862) [`4b9d71b`](https://github.com/bmatge/dsfr-data/commit/4b9d71b0fecc867d1763d02afa549ee1b894c9fa) Thanks [@bmatge](https://github.com/bmatge)! - Délégation du regroupement : la pagination serveur Tabular émet enfin ses agrégats, et le `select` ODS est composé depuis l'agrégat.
  
  Deux chemins rendaient un chiffre faux et plausible, sans erreur, parce que la query — voyant l'adaptateur se déclarer capable de regrouper côté serveur — marquait la délégation et sautait son calcul client.
  
  - **Tabular en `server-side` ([#852](https://github.com/bmatge/dsfr-data/issues/852))** : `buildServerSideUrl` n'émettait ni `champ__groupby` ni `champ__sum`, contrairement au chargement complet. La page rendait 40 lignes brutes comme s'il s'agissait des 8 groupes attendus, et la colonne d'agrégat, absente de la réponse, s'affichait « — » là où la somme valait 1 909 000. Les deux constructeurs d'URL partagent désormais le même émetteur : filtres, `champ__groupby`, `champ__fonction` et `champ__sort` partent dans les deux modes. Quand la délégation n'est pas possible (champ à espaces, `distinct`), la page revient en lignes brutes et le signale, au lieu de les faire passer pour des groupes.
  - **Opendatasoft, source à `select` explicite ([#859](https://github.com/bmatge/dsfr-data/issues/859))** : quand une `dsfr-data-query group-by` est seule lectrice d'une source qui déclare un `select`, ce `select` écrasait les colonnes d'agrégat — l'URL partait sans `count(nom_du_professionnel) as nb` et le KPI affichait 0 pour 3 458 et 224. Le `select` est maintenant composé depuis l'agrégat (colonnes d'agrégat + colonnes du `group-by`), dans `/records`, `/exports/json` et la pagination serveur. Si le `select` de la source définit par une expression aliasée (`year(date) as annee`) une colonne que le regroupement vise, la délégation est explicitement refusée : avertissement nommé en console, regroupement calculé côté client. Résout les constats BUG-009 et PG-015 du banc d'essai.
  
  Les deux défauts étaient trouvés par la vérification des données (ADR-122) ; leurs contrôles, jusqu'ici en `skip`, sont désormais mesurés.

- [#865](https://github.com/bmatge/dsfr-data/pull/865) [`880a8e1`](https://github.com/bmatge/dsfr-data/commit/880a8e164ecd830a60dd7a1147219df4bc25b935) Thanks [@bmatge](https://github.com/bmatge)! - Un seul tronc de liaison à un contexte, et un seul appel `/facets` par clic ([#837](https://github.com/bmatge/dsfr-data/issues/837), [#840](https://github.com/bmatge/dsfr-data/issues/840)).
  
  La résolution d'un `dsfr-data-context` par id — écouter sa connexion, différer la
  première liaison d'un tick, poser puis lever l'erreur de configuration, libérer à la
  déconnexion, refaire la liaison quand l'attribut change à chaud — était écrite trois
  fois (`dsfr-data-facets`, `dsfr-data-search`, le mixin de sélection des afficheurs),
  avec une variante dans `dsfr-data-context-value`. Elle vit désormais dans un seul
  mixin (`ContextBindingMixin`) ; chaque composant ne garde que ce qui lui est propre :
  un filtre unique pour la recherche et la sélection, un filtre par champ pour les
  facettes, aucun pour `context-value`. Effet visible : une facette dont le `context`
  est introuvable pose maintenant le même marqueur de configuration que la recherche,
  au lieu de rester muette. Même mouvement pour la construction de l'URL de page
  (`currentUrl` / `replaceUrl`, la leçon [#683](https://github.com/bmatge/dsfr-data/issues/683) en un seul endroit) et pour la délégation
  `getAdapter` / `getEffectiveWhere` / `getAdapterParams` vers l'amont, remontée dans
  `TransformerMixin`. Aucun attribut, aucun événement, aucun comportement de filtrage
  ne change.
  
  Facettes en mode `context` avec `server-facets` : chaque sélection déclenchait deux
  requêtes de facettes — une relance directe, puis celle du refetch provoqué par le
  contexte. La première était annulée en vol, donc invisible, mais payée à chaque clic.
  La relance directe n'a plus lieu que lorsque la source de la facette n'est pas une
  cible du contexte, c'est-à-dire quand rien d'autre ne la rafraîchirait.

- [#870](https://github.com/bmatge/dsfr-data/pull/870) [`81368da`](https://github.com/bmatge/dsfr-data/commit/81368da3b1c7dc9c671c8b934f9be6cb7b178701) Thanks [@bmatge](https://github.com/bmatge)! - Refactor interne, comportement inchangé ([#838](https://github.com/bmatge/dsfr-data/issues/838)) : les fonctions de plus de 150 lignes sont découpées en méthodes nommées — `_negotiateServerSide` de `dsfr-data-query`, `_fetchViaAdapter` de `dsfr-data-source`, `_getTypeSpecificAttributes` de `dsfr-data-chart`, et le `render()` de `dsfr-data-facets` et de `dsfr-data-list`. `dsfr-data-facets` passe de 2 736 à 2 177 lignes : ses blocs client (comptage, tri, filtrage), serveur (découverte, paramètres, fetch des facettes), statique (`static-values`), attributs et URL sortent dans `components/facets/`, testés unitairement — en fonctions pures, à l'exception de la détection des conflits d'URL (`facets-url.ts`), qui lit les `dsfr-data-context` du document. Aucun attribut, événement, rendu ni JSDoc public ne change ; la vérification des données passe à l'identique (191 contrôles).

- [#830](https://github.com/bmatge/dsfr-data/pull/830) [`fc54519`](https://github.com/bmatge/dsfr-data/commit/fc5451927040b0a0fa1a9d8ec4a7b88ba7b4fd4e) Thanks [@bmatge](https://github.com/bmatge)! - Carte : le plein écran tient face au redimensionnement, et un encart accepte un seul point de rupture.
  
  - `dsfr-data-map` : avec `height="60%"` (l'exemple du guide), le `ResizeObserver` reposait largeur × ratio dès l'entrée en plein écran, ce qui annulait le correctif de [#825](https://github.com/bmatge/dsfr-data/issues/825) (volet de 1152 px sur un écran de 1080, encarts hors cadre). En plein écran, chaque redimensionnement de l'hôte (entrée, rotation, changement d'écran) recalcule désormais « écran moins la rangée d'encarts » ; à la sortie, le ratio reprend la main sur la largeur courante. Complète la résolution du constat AM-061 du banc d'essai.
  - `dsfr-data-map-inset` : `width="md:20%"` (un seul jeton, sans espace) partait en style inline invalide et l'encart restait à 10rem sans erreur, alors que la grammaire le documente comme valide. Tout texte portant un point de rupture est une échelle.
  - Premier test Playwright de mise en page pour la carte (`e2e/map-fullscreen.spec.ts`) : volet et cinq encarts mesurés dans l'écran après l'entrée en plein écran, sortie par le bouton, largeur d'encart à 20 % de la carte. Les tests unitaires ne voient pas la mise en page ; ceux-ci ont été passés au vert par [#822](https://github.com/bmatge/dsfr-data/issues/822) puis [#825](https://github.com/bmatge/dsfr-data/issues/825).

- [#832](https://github.com/bmatge/dsfr-data/pull/832) [`173879d`](https://github.com/bmatge/dsfr-data/commit/173879dcf32b0f0aca8773c731a0bdeeea16bd90) Thanks [@bmatge](https://github.com/bmatge)! - Données : trois chiffres faux et plausibles corrigés (revue du 2026-09-13).
  
  - `compute` (`dsfr-data-normalize`) : une cellule vide n'égale plus un nombre — `when montant = 0 then 'Nul'` classait chaque montant non renseigné en zéro, là où `where="montant:eq:0"` ne le retenait pas. Et l'arithmétique `- * /` suit désormais la doctrine des fonctions numériques : opérande absent ou non numérique → `null` (`actif - passif` avec `passif` manquant rendait `actif`), division par zéro → `null` (jamais `Infinity`). `+` concatène toujours dès qu'un côté n'est pas numérique.
  - `dsfr-data-join` : une clé nulle ou vide n'apparie plus rien, pas même une autre clé vide (sémantique SQL) — une ligne sans code était jointe à toute ligne sans code de l'autre côté, et n'était jamais comptée orpheline dans le diagnostic de [#792](https://github.com/bmatge/dsfr-data/issues/792). Elle apparaît désormais dans l'échantillon d'orphelins sous « (clé vide) ».
  - `dsfr-data-context-filter` : `current-month`, `current-year` et `last-n-days` sont calculés sur le jour civil local, comme `default="today"` ([#682](https://github.com/bmatge/dsfr-data/issues/682)). Ils restaient en UTC : à 00:30 à Paris le 1er du mois, « mois en cours » filtrait le mois précédent.
  - Suite de tests épinglée sur le fuseau Europe/Paris pour que ces cas se prouvent aussi en CI.

- [#835](https://github.com/bmatge/dsfr-data/pull/835) [`a7ccc77`](https://github.com/bmatge/dsfr-data/commit/a7ccc77a76310d5201fdde81c06506b731d2c535) Thanks [@bmatge](https://github.com/bmatge)! - Hygiène interne (revue du 2026-09-13, lot F) : une seule définition de la forme « date ISO » dans `@dsfr-data/shared` (`isIsoDateString`, jusqu'ici recopiée dans les agrégations et le pivot), formatage des entiers du volet Diagnostic sans expression régulière à anticipation, et regex linéaires justifiées dans la carte et ses encarts. Aucun changement de comportement.

- [#846](https://github.com/bmatge/dsfr-data/pull/846) [`fae935a`](https://github.com/bmatge/dsfr-data/commit/fae935a2fb646a34f900a2168661c958c59742c4) Thanks [@bmatge](https://github.com/bmatge)! - Dette et petits défauts (revue du 2026-09-13, lot G) :
  
  - Opendatasoft : un `select` purement agrégé passe par `/records` en une ligne AVANT le chemin `fetch-mode="export"`, qui téléchargeait `cap + 1` copies de la même valeur et signalait une troncature à tort ; un 429 ou un 5xx sur l'export replie sur `/records` cette fois-ci sans condamner l'export pour la session (seul un 4xx est définitif).
  - `dsfr-data-pivot` : `count` ne compte plus les cellules vides, comme `sum` et `count-distinct`.
  - `dsfr-data-normalize` : une entrée `fold` malformée est signalée une fois par valeur de l'attribut (plus à chaque lot) et l'erreur de configuration s'efface quand l'attribut est corrigé.
  - `dsfr-data-facets` : un critère de tri inconnu (`sort="alpah"`) retombe toujours sur la fréquence, mais le dit une fois au lieu de se taire.
  - Codes département : `2a` / `2b` en minuscules sont ramenés à `2A` / `2B`, comme `02a` l'était déjà.
  - Une seule définition de l'égalité lâche (`looseEquals`, variante « tableau contient » `looseEqualsOrContains` pour les agrégations) et du retrait des accents (`stripAccents`) dans `@dsfr-data/shared`, au lieu de trois et quatre copies.
  - Guides : `<dsfr-data-context-tags for="…">` (et non `context`), `<dsfr-data-list columns="…">` (et non `fields`).

- [#864](https://github.com/bmatge/dsfr-data/pull/864) [`b692c31`](https://github.com/bmatge/dsfr-data/commit/b692c31daf9973c8e21e8436719d2111c1a9324c) Thanks [@bmatge](https://github.com/bmatge)! - Hygiène interne : les motifs à quantificateur imbriqué signalés « unsafe » par
  eslint-plugin-security sont réécrits en parcours linéaire, à comportement
  identique ([#843](https://github.com/bmatge/dsfr-data/issues/843)).
  
  - `opendatasoft-adapter` : la reconnaissance d'un littéral numérique nu et d'un
    chemin pointé (`table.champ`) passe par un découpage plutôt que par un motif
    imbriqué.
  - `dsfr-data-chart` : la détection d'une date ISO devient un test de préfixe
    `AAAA-MM-JJ` suivi d'un contrôle du séparateur d'heure.
  - `shared/utils/to-boolean` : la reconnaissance d'un nombre décimal simple lit
    la chaîne caractère par caractère.
  - `shared/providers/tabular` : le segment de langue optionnel du permalien
    data.gouv.fr s'écrit sans quantificateur imbriqué.
  
  Aucun changement d'API ni de rendu.

- [#861](https://github.com/bmatge/dsfr-data/pull/861) [`e4e0db3`](https://github.com/bmatge/dsfr-data/commit/e4e0db3273e9efd1c1a6bcb12d10e3685e18dc76) Thanks [@bmatge](https://github.com/bmatge)! - `parseExpression` : un parseur par grammaire ([#839](https://github.com/bmatge/dsfr-data/issues/839)). La fonction qui lit les
  expressions de `value` du KPI entrelaçait quatre grammaires — commune
  `champ:fn`, historique `fn:champ`, ratio ` / `, filtre entre accolades — en une
  seule suite de conditions. Elle est découpée en un tokenizer (coupe du
  séparateur de ratio hors des accolades) et un parseur par grammaire. Refactor
  interne : tout ce que la documentation promet rend exactement le même arbre,
  sous une table de référence de cinquante expressions et leurs pièges.
  
  Deux défauts de conception disparaissent au passage :
  
  - un filtre qui contient une barre oblique entourée d'espaces ne coupe plus le
    ratio — `a:sum{b:eq:x / y} / c:sum` se lisait « mal formé » ;
  - l'alias `count-distinct` n'est plus appliqué aux NOMS DE CHAMP, seulement aux
    fonctions — une colonne nommée `count-distinct` était renommée `distinct` et
    l'agrégat portait sur une colonne inexistante.

## 0.29.2

### Patch Changes

- [#826](https://github.com/bmatge/dsfr-data/pull/826) [`5e1caee`](https://github.com/bmatge/dsfr-data/commit/5e1caee9e04a51a32dff1be59517fea7da68cc54) Thanks [@bmatge](https://github.com/bmatge)! - Corrige `dsfr-data-map fullscreen` sur une carte qui porte des encarts : la carte
  principale tombait a 0 px et les encarts s'empilaient en colonne sur toute la hauteur
  de l'ecran. La regle de plein ecran mettait l'hote en `display: flex`, or les encarts
  sont des flottants ([#643](https://github.com/bmatge/dsfr-data/issues/643)) : dans un conteneur flex le float est ignore, chaque encart
  devenait un item empile, et la somme de leurs hauteurs ecrasait le volet principal.
  
  L'hote reste desormais en flux normal en plein ecran, et le volet principal recoit la
  hauteur de l'ecran moins celle de la rangee d'encarts, qui s'affiche en dessous comme
  au repos. Sans encart, rien ne change. Resout le constat AM-061 du banc d'essai. ([#825](https://github.com/bmatge/dsfr-data/issues/825))

## 0.29.1

### Patch Changes

- [#823](https://github.com/bmatge/dsfr-data/pull/823) [`9f0fdc4`](https://github.com/bmatge/dsfr-data/commit/9f0fdc494d211acf70830929d4f95119210748e8) Thanks [@bmatge](https://github.com/bmatge)! - Corrige une régression de la 0.29.0 : dans un `dsfr-data-kpi-group`, tous les KPI
  retombaient en `grid-column: auto` au-dessus de 768 px, soit une colonne sur douze
  chacun (douze par ligne, ~70 px de large). `per-row` comme `cols` (historique)
  étaient touchés ; le rendu mobile, lui, restait correct.
  
  La propriété `span` de `dsfr-data-kpi` ([#790](https://github.com/bmatge/dsfr-data/issues/790)) était reflétée avec une valeur
  initiale vide : chaque KPI portait donc `span=""`, ce qui désactivait la règle de
  largeur par défaut du groupe (`::slotted(*:not([col]):not([span]))`). Elle n'a plus
  de valeur par défaut, comme `col`. ([#822](https://github.com/bmatge/dsfr-data/issues/822))

## 0.29.0

### Minor Changes

- [#804](https://github.com/bmatge/dsfr-data/pull/804) [`1024256`](https://github.com/bmatge/dsfr-data/commit/1024256ba60b529c9f2bf4cf5c6ef6fea578b345) Thanks [@bmatge](https://github.com/bmatge)! - feat(map) : un bouton de plein écran pour la carte
  
  Une carte dense se lit mal dans une colonne de page. `<dsfr-data-map fullscreen>` ajoute, à droite
  des boutons de zoom, un bouton « Plein écran » : la carte, avec ses couches, sa légende, ses encarts
  et son sélecteur de fond, occupe tout l'écran, et en revient par le même bouton ou la touche Échap.
  
  C'est un vrai bouton, atteint au clavier avant la carte. Son état passe par `aria-pressed` et par
  son libellé, et chaque bascule est annoncée aux lecteurs d'écran. La carte recalcule sa taille à
  l'entrée comme à la sortie, sans bande de tuiles grises, et la page est notifiée par l'événement
  `dsfr-data-map-fullscreen-change`. Le bouton n'apparaît pas quand le navigateur ne sait pas mettre
  un élément en plein écran (Safari sur iPhone), ni avec `locked` ou `no-controls`.
  
  La capture d'image de la carte reste hors périmètre : tuiles d'origines croisées, légende hors du
  canevas.
  
  Résout le volet plein écran du constat AM-061 du banc d'essai ([#780](https://github.com/bmatge/dsfr-data/issues/780)).

- [#819](https://github.com/bmatge/dsfr-data/pull/819) [`d4ece75`](https://github.com/bmatge/dsfr-data/commit/d4ece75656804770c1381a461b0398a58c6c52d2) Thanks [@bmatge](https://github.com/bmatge)! - feat(core) : colonnage responsive, une échelle mobile-first sur `per-row` et `span`
  
  Le repli mobile était binaire et câblé : quatre KPI donnaient quatre colonnes au-dessus de 768 px
  et quatre lignes empilées en dessous, alors que sur téléphone 2 × 2 se lit mieux. `per-row` et
  `span` acceptent désormais une échelle mobile-first, en termes séparés par des espaces :
  
  ```html
  <dsfr-data-kpi-group per-row="2 md:4">…</dsfr-data-kpi-group>
  <dsfr-data-display source="d" per-row="1 sm:2 lg:3">…</dsfr-data-display>
  <dsfr-data-facets source="d" span="annee:12 md:3 | type:12 md:6"></dsfr-data-facets>
  ```
  
  Le premier terme vaut sous le premier point de rupture, puis chaque `bp:valeur` à partir du sien :
  `sm` (576 px), `md` (768), `lg` (992), `xl` (1248). Les points de rupture sont ceux du DSFR, rendus
  par ses classes `fr-col-{bp}-N` sur `display` et `facets`, et par des règles générées sur
  `kpi-group`. **Une valeur nue garde exactement son rendu actuel.** Sur les facettes, `|` sépare les
  facettes et l'espace sépare les paliers. Un point de rupture inconnu ou une valeur hors de la grille
  est une erreur de configuration nommée.
  
  `cols` et `col` ne prennent pas l'échelle et gardent leur sens (ADR-112). La largeur des encarts de
  carte suivra à part.
  
  Suite de [#789](https://github.com/bmatge/dsfr-data/issues/789).

- [#807](https://github.com/bmatge/dsfr-data/pull/807) [`6007c92`](https://github.com/bmatge/dsfr-data/commit/6007c92b84ee6b6e82e52d5f60c03cf83832c974) Thanks [@bmatge](https://github.com/bmatge)! - feat(core) : `dsfr-data-concat`, empiler des sources de même schéma
  
  Aucun composant ne savait mettre des lignes bout à bout : `dsfr-data-join` juxtapose des colonnes.
  Empiler quatre séries de même schéma demandait quatre pivots, trois jointures et un dépliage, et le
  banc d'essai en comptait 28 sur une seule page.
  
  ```html
  <dsfr-data-concat id="ventes" sources="v2023, v2024, v2025"
    origin-field="millesime" origin-labels="v2023:2023 | v2024:2024 | v2025:2025">
  </dsfr-data-concat>
  <dsfr-data-chart source="ventes" type="line"
    label-field="mois" value-field="montant" series-field="millesime">
  </dsfr-data-chart>
  ```
  
  - `sources` : les ids à empiler, dans l'ordre, au moins deux. L'émission attend que toutes aient
    répondu.
  - `origin-field` : une colonne qui dit de quelle source vient chaque ligne, l'id ou le libellé
    d'`origin-labels`. C'est le format long que `series-field` consomme directement.
  - Des **schémas divergents** sont une erreur de configuration qui liste, par source, les colonnes
    en trop et en moins, et rien n'est émis. Jamais de tableau aux colonnes vides muettes.
  - Aucune commande aval (page, filtre, tri) n'est relayée aux sources, faute de savoir à laquelle
    l'adresser : derrière un empilement, filtre et regroupement sont côté client. Le résultat est
    marqué tronqué au volet Diagnostic si une seule source l'est.
  
  Le composant est dans les bundles complet et core, dans le volet Diagnostic, le lint de balisage et
  une nouvelle fiche de skill.
  
  Résout le constat AM-074 du banc d'essai ([#777](https://github.com/bmatge/dsfr-data/issues/777)).

- [#821](https://github.com/bmatge/dsfr-data/pull/821) [`9242fe2`](https://github.com/bmatge/dsfr-data/commit/9242fe29a0ee0a60d962d50d771c0a57539d7c1c) Thanks [@bmatge](https://github.com/bmatge)! - feat(map-inset) : largeur responsive des encarts territoriaux
  
  `width` acceptait une seule longueur, posée en style inline, qui ne peut pas porter de media query.
  Cinq encarts à 20 % tenaient sur une ligne en bureau, pas sur téléphone. `width` accepte désormais
  la même échelle mobile-first que `per-row` et `span` :
  
  ```html
  <dsfr-data-map-inset territory="guadeloupe" width="50% md:20%"></dsfr-data-map-inset>
  ```
  
  Deux encarts par ligne sous 768 px, cinq au-delà : vérifié dans un navigateur, 200 px sur un écran
  de 400 px comme de 1 000 px. **Une valeur nue garde exactement son rendu actuel.** En échelle, une
  règle de page `dsfr-data-map-inset { width: … }` prime toujours, à toutes les largeurs. Un point de
  rupture inconnu ou une longueur illisible est une erreur de configuration nommée.
  
  Suite de [#789](https://github.com/bmatge/dsfr-data/issues/789) ([#818](https://github.com/bmatge/dsfr-data/issues/818)).

- [#800](https://github.com/bmatge/dsfr-data/pull/800) [`9190df1`](https://github.com/bmatge/dsfr-data/commit/9190df159828f7b169add6ca3e2bf278c5c56e32) Thanks [@bmatge](https://github.com/bmatge)! - feat(join) : une jointure qui perd des lignes à la graphie près le dit, clés orphelines à l'appui
  
  Le taux d'appariement de `dsfr-data-join` était publié depuis la 0.22 dans le volet Diagnostic,
  mais l'alerte ne partait que sous 50 %. Or le cas dangereux est la jointure **presque** pleine. Le
  banc d'essai l'a mesuré : une source publie ses départements en `1`…`9`, l'autre en `01`…`09`, la
  jointure `inner` apparie 98 lignes sur 101, et le ratio calculé en aval reste plausible, faux de
  1,5 %.
  
  - Les statistiques de jointure citent désormais **quelques clés orphelines** de chaque côté. C'est
    l'exemple `1` face à `01` qui fait trouver la cause, pas le pourcentage.
  - Elles détectent l'**écart de graphie** : des clés orphelines qui ne diffèrent que par des zéros
    de tête ou des espaces. Le volet Diagnostic alerte alors quel que soit le taux, et nomme la cause.
  - Un **avertissement console** part quand une jointure `inner` retire des lignes, et, sur `left`,
    `right` ou `full`, quand l'écart est un écart de graphie. Une ligne sans correspondance y est
    souvent légitime, le taux suffit alors.
  
  La jointure elle-même ne normalise rien : `1` et `01` ne s'apparient toujours pas, harmoniser les
  clés reste un choix de l'auteur. Le guide du motif « agréger, joindre, diviser » le dit.
  
  Suit le commentaire du banc d'essai sur AM-075 ([#792](https://github.com/bmatge/dsfr-data/issues/792)).

- [#797](https://github.com/bmatge/dsfr-data/pull/797) [`20ddcb2`](https://github.com/bmatge/dsfr-data/commit/20ddcb2d10f87e5e7f79e1a79e45a818f314e8a9) Thanks [@bmatge](https://github.com/bmatge)! - feat(kpi) : filtrer un côté du ratio entre accolades — une part de sommes devient exprimable
  
  Le ratio (0.24.0) exprimait une part de **comptages** avec `count:champ:valeur`, jamais une part
  de **sommes** : sur une source pré-agrégée, une ligne par école et par sexe avec un effectif, la
  part des filles n'avait pas d'écriture. Le `where` du KPI ne répond pas au besoin, puisqu'il filtre
  les deux côtés à la fois.
  
  Une expression accepte désormais un filtre de lignes entre accolades, dans le dialecte du `where` :
  
  ```html
  <dsfr-data-kpi source="effectifs" format="pourcentage"
    value="effectif:sum{sexe:eq:F} / effectif:sum" label="Part des filles">
  </dsfr-data-kpi>
  ```
  
  Le filtre ne vaut que pour son côté. Plusieurs clauses se séparent par des virgules
  (`{sexe:eq:F, secteur:eq:public}`), les douze opérateurs du `where` sont acceptés, et la forme
  marche aussi pour `count{…}`, `avg`, `min`, `max`, dans `value`, `trend` et `lines`. La grammaire
  colon existante est inchangée. Un filtre non reconnu, des accolades mal formées, un filtre sur
  `meta:total` ou sur un accès direct sont des erreurs de configuration nommées.
  
  Résout le constat AM-070 du banc d'essai ([#776](https://github.com/bmatge/dsfr-data/issues/776)).

- [#814](https://github.com/bmatge/dsfr-data/pull/814) [`7a8071e`](https://github.com/bmatge/dsfr-data/commit/7a8071e737db9c4a3c223288e8ed3d5b9e9e0933) Thanks [@bmatge](https://github.com/bmatge)! - feat(core) : `per-row` et `span`, deux noms sans ambiguïté pour le colonnage, `cols` gardé tel quel
  
  Le même attribut `cols` désignait deux grandeurs opposées. Sur `dsfr-data-facets`, c'est une
  **largeur** sur la grille de 12 (`cols="4"` donne 3 facettes par ligne). Sur `dsfr-data-display` et
  `dsfr-data-kpi-group`, c'est un **nombre** d'éléments par ligne (`cols="4"` donne 4 éléments).
  Deux noms le disent désormais sans détour :
  
  - **`per-row`**, le nombre d'éléments par ligne, sur `dsfr-data-display`, `dsfr-data-kpi-group` et,
    nouveauté, `dsfr-data-facets` ;
  - **`span`**, la largeur sur la grille de 12 colonnes, sur `dsfr-data-facets` (global ou par
    facette, `span="annee:3 | type:6"`) et sur `dsfr-data-kpi` à l'intérieur d'un groupe.
  
  **Aucune page ne change de rendu.** `cols` et `col` gardent leur sens sur chaque composant, sans
  échéance. Posés avec leur remplaçant, ils cèdent la place et une erreur de configuration non
  bloquante le signale. `per-row` n'accepte que les diviseurs de 12 : `per-row="5"` aurait donné
  six éléments par ligne en silence. Sur les facettes, `per-row` et `span` se combinent : une facette
  nommée dans `span` garde sa largeur, les autres se partagent la ligne. La documentation et les
  fiches de skill utilisent les nouveaux noms.
  
  Suite de [#790](https://github.com/bmatge/dsfr-data/issues/790) (ADR-112). Le colonnage responsive ([#789](https://github.com/bmatge/dsfr-data/issues/789)) portera sur `per-row` et `span`.

- [#795](https://github.com/bmatge/dsfr-data/pull/795) [`3037fcc`](https://github.com/bmatge/dsfr-data/commit/3037fcce24a274194dd7982d8369ae5ae1009059) Thanks [@bmatge](https://github.com/bmatge)! - feat(chart) : résumé des cartes pondéré (`map-summary-weight`) ou fourni par la page (`map-summary-value`)
  
  Une carte (`type="map"` et ses variantes) affiche sous son titre une valeur de synthèse. C'était la
  **moyenne non pondérée** des valeurs territoriales, calculée par `dsfr-data-chart` et non par DSFR
  Chart, qui se contente d'afficher ce qu'on lui passe. Pour un taux, ce n'est pas le taux national
  dès que les territoires ont des tailles différentes. Le banc d'essai l'a mesuré sur trois pages en
  production : 4,27 % affiché pour 5,6 % réel sur les collèges (−24 %), 14,96 % pour 19,3 % sur les
  lycées (−22 %), et −1,6 % seulement sur les écoles, là où le taux est homogène et le défaut
  invisible.
  
  - `map-summary-weight="nb_eleves"` rend la moyenne **pondérée** Σ(valeur × effectif) / Σ(effectif).
    Pondérer un taux par son dénominateur rend exactement le rapport des deux sommes.
  - `map-summary-value="5,6"` reprend une valeur nationale publiée par ailleurs, qui fait autorité.
    Elle prime sur la pondération.
  - Une valeur non numérique, ou un champ d'effectif absent de toutes les lignes, est une erreur de
    configuration, et aucun résumé n'est affiché plutôt qu'un chiffre faux.
  
  Le calcul par défaut reste la moyenne non pondérée, désormais documentée avec son piège. Il ne porte
  plus que sur les lignes **dessinées** : une ligne au code géographique invalide, ignorée par la
  carte, pesait encore dans son résumé.
  
  Résout le constat LIM-014 du banc d'essai ([#763](https://github.com/bmatge/dsfr-data/issues/763)).

- [#798](https://github.com/bmatge/dsfr-data/pull/798) [`4bb6660`](https://github.com/bmatge/dsfr-data/commit/4bb66609e2198527dc772d13e0c8e08041404523) Thanks [@bmatge](https://github.com/bmatge)! - feat(map) : trois silences de la carte deviennent des signaux, et les cercles savent faire une choroplèthe
  
  - **`fill-field` sur une couche de cercles** ([#768](https://github.com/bmatge/dsfr-data/issues/768)). `fill-field`, `classes`, `method`, `breaks` et
    `selected-palette` étaient ignorés sans un mot sur `type="circle"` : les cercles restaient de la
    couleur de couche. Ils sont désormais colorés par classes, et la légende de couche décrit ces
    classes. Posé avec `color-field`, `fill-field` donne le remplissage et `color-field` le contour,
    comme sur une couche `geoshape`.
  - **Une couche dont tous les points sont confondus** ([#770](https://github.com/bmatge/dsfr-data/issues/770)). Une colonne de géolocalisation
    constante ou mal jointe donnait 43 479 coordonnées valides identiques : rien n'était ignoré, la
    couche se déclarait complète et la carte montrait un point. Au plus deux positions distinctes
    pour au moins dix points par position, la couche le signale en console et dans le volet
    Diagnostic (`getStackedPositions()`). Le seuil laisse passer les adresses partagées.
  - **Une légende dont le `for` désigne autre chose qu'une couche** ([#771](https://github.com/bmatge/dsfr-data/issues/771)). Le `for` de
    `dsfr-data-a11y` désigne la carte, celui de la légende la couche : la confusion rendait une
    légende masquée, sans message. Un avertissement nomme l'élément trouvé et les couches disponibles.
    Le repli par `source` reste inchangé.
  
  Résout les constats AM-066, AM-069 et PG-024 du banc d'essai ([#768](https://github.com/bmatge/dsfr-data/issues/768), [#770](https://github.com/bmatge/dsfr-data/issues/770), [#771](https://github.com/bmatge/dsfr-data/issues/771)).

- [#799](https://github.com/bmatge/dsfr-data/pull/799) [`53d72b2`](https://github.com/bmatge/dsfr-data/commit/53d72b2e04982dce48189716df56b36818daa175) Thanks [@bmatge](https://github.com/bmatge)! - feat(query, normalize, templates) : l'écart avec la ligne précédente (`diff`), les champs multivalués nettoyés, et les gabarits imbriqués signalés
  
  - **`diff`, inverse de `running_sum`** ([#775](https://github.com/bmatge/dsfr-data/issues/775)). Les compteurs publiés déjà cumulés sont courants en
    open data institutionnel, et leur incrément est la seule question qui compte. `aggregate="cumul:diff"`
    ajoute la colonne `cumul__diff`, écart de chaque ligne avec la précédente, après `order-by`,
    jamais délégué, avec l'avertissement du cumul quand `order-by` manque. La première ligne vaut
    `null`, jamais 0 : un incrément inconnu n'est pas un incrément nul. Au passage, un agrégat cumulé
    peut porter sur la colonne produite par le précédent dans la même liste
    (`flux:running_sum, flux__running_sum:diff`).
  - **`replace` et `replace-fields` sur un champ tableau** ([#774](https://github.com/bmatge/dsfr-data/issues/774)). Un champ multivalué traversait
    intact, sans message, alors que ce sont justement les colonnes aux libellés hétérogènes. Il est
    désormais remplacé élément par élément, longueur conservée, sans dédoublonnage. Limite
    documentée : le remplacement s'exécute avant `split` et ne voit donc pas les tableaux qu'il
    fabrique.
  - **Un bloc de gabarit imbriqué est signalé** ([#769](https://github.com/bmatge/dsfr-data/issues/769)). L'imbrication reste non prise en charge,
    mais un `{{#each}}` placé dans un `{{#if}}` rendait un texte tronqué sans erreur, visible
    seulement en ouvrant l'infobulle. Un avertissement unique par gabarit nomme le composant et
    propose la forme à plat. Le rendu est inchangé.
  
  Résout les constats AM-068, AM-071 et AM-072 du banc d'essai ([#775](https://github.com/bmatge/dsfr-data/issues/775), [#774](https://github.com/bmatge/dsfr-data/issues/774), [#769](https://github.com/bmatge/dsfr-data/issues/769)).

### Patch Changes

- [#820](https://github.com/bmatge/dsfr-data/pull/820) [`2f46728`](https://github.com/bmatge/dsfr-data/commit/2f467280eea8000d9239ee563226199fd21f6d12) Thanks [@bmatge](https://github.com/bmatge)! - feat(context) : un filtre sur un champ absent de la source visée est nommé, au lieu d'un HTTP 400
  
  Une facette ou un filtre de contexte posé sur une colonne que la source ne porte pas, typiquement
  une colonne calculée en aval par un `compute`, était diffusé tel quel à l'API, qui répondait 400
  sans dire ni quel filtre ni quelle colonne. Le contexte vérifie désormais le champ contre les
  lignes des sources qu'il vise :
  
  - **absent de toutes les sources visées** : erreur de configuration nommée (champ, sources,
    contexte, piste de correction) sur l'élément du filtre, et rien n'est diffusé ;
  - **absent de certaines seulement** : ces sources sont exclues du filtre, avec un message console,
    et les autres sont filtrées normalement ;
  - **schéma inconnu** (source pas encore chargée, ou colonnes restreintes par `select` / `group-by`,
    qui ne prouvent pas l'absence côté API) : le filtre part comme avant, et l'API répond. Pas
    d'attente qui risquerait de figer la page.
  
  L'erreur se lève dès que le filtre est vidé.
  
  Suite du commentaire du banc d'essai sur BUG-013 ([#805](https://github.com/bmatge/dsfr-data/issues/805)).

- [#811](https://github.com/bmatge/dsfr-data/pull/811) [`69bf6d3`](https://github.com/bmatge/dsfr-data/commit/69bf6d38ea9773e7b8bc5f3fd5fec19f57e7d1dc) Thanks [@bmatge](https://github.com/bmatge)! - fix(query, export) : un regroupement délégué ne réécrit plus les données des autres widgets de la même source
  
  Une source ne porte qu'**un** regroupement serveur, et elle sert ses lignes à tous ses abonnés.
  Quand une `dsfr-data-query` lui déléguait son `group-by`, tous les composants branchés sur la même
  source recevaient les lignes agrégées. Mesuré en conditions réelles sur un tableau de bord exporté
  par le Studio (jeu plan-de-relance, bibliothèque 0.28.1) : une seule requête
  `group_by=type_entreprise`, un KPI « projets » à **11** (le nombre de groupes) au lieu de 3 080, et
  le graphique « par région » affichant les groupes du graphique « par type ». Depuis la 0.28.1, les
  sources Opendatasoft et Tabular de l'export sont déclaratives : tout tableau de bord qui combinait
  un graphique agrégé et un autre widget sur la même source était touché.
  
  - **Bibliothèque** : une query ne délègue son regroupement, son agrégat et son tri que si elle est
    la **seule** lectrice de sa source, y compris à travers un transformateur qui relaie. Sinon le
    calcul se fait côté client sur les lignes chargées, et un avertissement nomme la source, ses
    autres lecteurs et la voie à suivre : une source dédiée. Un lecteur ajouté après coup fait
    renégocier la query qui déléguait.
  - **Export du tableau de bord et du Studio** : un graphique agrégé sur une source Opendatasoft ou
    Tabular partagée reçoit sa **propre** `dsfr-data-source` (même jeu, id distinct), que les blocs
    de filtres visent aussi. Chaque graphique garde ainsi un agrégat calculé par le serveur, juste et
    complet, et les KPI gardent les lignes brutes.
  
  Les pages dont les queries passent par des facettes n'étaient pas touchées (vérifié sur les
  reproductions du banc d'essai) : les facettes n'exposent pas d'adaptateur, la délégation n'y a
  jamais lieu.
  
  Résout le constat BUG-009 du banc d'essai ([#765](https://github.com/bmatge/dsfr-data/issues/765)).

- [#791](https://github.com/bmatge/dsfr-data/pull/791) [`037fb32`](https://github.com/bmatge/dsfr-data/commit/037fb3262ae95f8e1ccc96025fb351f8feb669f3) Thanks [@bmatge](https://github.com/bmatge)! - fix(chart) : un code de département sur trois caractères ne vide plus la carte
  
  `normalizeDeptCode` savait **ajouter** un zéro de tête (`1` → `01`), jamais en **retirer** un. Un
  jeu qui publie ses départements sur trois caractères (`059`) ou son outre-mer sur quatre (`0971`)
  voyait chaque ligne comptée puis jetée : la carte se vidait. Le zéro de tête en trop est désormais
  retiré, `059` désigne le Nord, `02A` la Corse-du-Sud, `0971` la Guadeloupe.
  
  Le zéro n'est retiré que si le reste est un code valide : `000` ou `096` restent invalides et
  continuent d'être comptés dans les lignes ignorées, plutôt que de devenir un autre code faux. Les
  formes déjà valides sont inchangées. La même règle s'applique au code généré par le Builder et le
  Builder IA.
  
  Résout le constat BUG-014 du banc d'essai ([#766](https://github.com/bmatge/dsfr-data/issues/766)).

- [#801](https://github.com/bmatge/dsfr-data/pull/801) [`e24b628`](https://github.com/bmatge/dsfr-data/commit/e24b628ca1fc4cee48d66c76f576983525024d77) Thanks [@bmatge](https://github.com/bmatge)! - fix(facets) : le colonnage `cols` se replie enfin sur téléphone
  
  `cols` émettait une classe de colonne DSFR sans variante de point de rupture (`fr-col-3`). Or le
  DSFR définit `.fr-col-N` hors de toute media query : `cols="3"` valait 25 % de la ligne à 320 px
  comme à 1440 px, soit 76 px par facette sur téléphone, 60 px utiles pour un menu déroulant. Les
  facettes émettent désormais `fr-col-12 fr-col-md-N` : pleine largeur sous 768 px, largeur demandée
  au-dessus, comme `dsfr-data-display` et `dsfr-data-kpi-group`.
  
  Rien ne change au-dessus de 768 px, ni sans l'attribut `cols` (grille automatique, déjà repliable).
  Effet assumé : une page qui posait `cols="6"` pour obtenir deux facettes par ligne sur téléphone
  aussi en affiche désormais une par ligne sous 768 px, comme le prévoit la grille DSFR. Le palier
  intermédiaire relèvera de l'échelle responsive ([#789](https://github.com/bmatge/dsfr-data/issues/789)).

- [#806](https://github.com/bmatge/dsfr-data/pull/806) [`7ca1e0d`](https://github.com/bmatge/dsfr-data/commit/7ca1e0dc198b4967d64f7a440dfb0ce068c1d41e) Thanks [@bmatge](https://github.com/bmatge)! - fix(facets) : `url-params` ne lit plus que les facettes effectives, et signale un paramètre partagé avec un contexte
  
  Sans `url-param-map`, une facette autonome acceptait comme paramètre d'URL **toute colonne de ses
  données**. Sur une page qui portait aussi un `dsfr-data-context` à `url-sync`, `?annee=2023` était
  capté par la facette, même sans facette « année », et posait une sélection fantôme : KPI à 0,
  carte vide.
  
  - Seules les facettes **effectives** lisent l'URL : les champs de `fields`, sinon les facettes que
    le composant détecte lui-même. Le cas `fields` vide continue de fonctionner.
  - Un paramètre lu à la fois par une facette autonome et par un contexte à `url-sync` est une
    erreur de configuration, qui nomme le paramètre et le contexte, et propose `context="id"` ou
    `url-param-map`.
  - La documentation de `url-params` recommande `context="id"` dès qu'un contexte est présent, et
    celle de `context` précise que le mode contexte suppose des champs portés par la source visée :
    une colonne calculée en aval ne peut pas y passer.
  
  Le contexte expose `getUrlParamNames()`, la liste des paramètres qu'il porte.
  
  Résout le constat BUG-013 du banc d'essai ([#773](https://github.com/bmatge/dsfr-data/issues/773)).

- [#817](https://github.com/bmatge/dsfr-data/pull/817) [`f5a7242`](https://github.com/bmatge/dsfr-data/commit/f5a7242e9f803d41ad18328d4dec3d9dce6efe23) Thanks [@bmatge](https://github.com/bmatge)! - fix(join) : une jointure-filtre contre une source d'une ligne ne déclenche plus d'avertissement
  
  L'avertissement de jointure `inner` ajouté dans cette même version partait dès que des lignes
  étaient retirées. Or une jointure `inner` contre une source d'**une seule ligne** sert à filtrer
  sur une valeur calculée par l'API : « ne garder que la dernière année publiée », avec
  `select="max(year(annee)) as an"` d'un côté. Retirer les autres lignes est alors le but. Le banc
  d'essai recevait deux avertissements injustifiés par chargement, sur une page aux chiffres justes.
  
  Contre une source d'une ligne, ni avertissement console ni alerte au volet Diagnostic : la trace
  nomme la « jointure-filtre ». Un écart de graphie des clés (zéro de tête, espaces) reste signalé
  dans tous les cas. Le motif est décrit dans le guide de la jointure.
  
  Résout le constat AM-080 du banc d'essai ([#816](https://github.com/bmatge/dsfr-data/issues/816)).

- [#812](https://github.com/bmatge/dsfr-data/pull/812) [`abf0fb3`](https://github.com/bmatge/dsfr-data/commit/abf0fb3607bcde596bd995888db186c7b8db271d) Thanks [@bmatge](https://github.com/bmatge)! - fix(export, adapter-ods) : un KPI de tableau de bord fait calculer son chiffre par le serveur, sur tout le jeu
  
  Dans un tableau de bord exporté (Studio ou app Tableau de bord), un KPI lisait la source partagée,
  qui charge ses lignes par pages jusqu'au plafond `max-records` (1 000 par défaut). Il comptait ou
  sommait donc au plus 1 000 lignes. Mesuré dans un navigateur sur le jeu plan-de-relance : **1 000**
  projets au lieu de 3 080. Le défaut était masqué jusqu'ici par celui de [#765](https://github.com/bmatge/dsfr-data/issues/765).
  
  - **Opendatasoft** : un KPI (comptage, somme, moyenne, minimum, maximum) reçoit sa propre source,
    qui fait calculer l'agrégat par le serveur (`select="sum(montant) as montant__sum"`), avec son
    filtre propre traduit en ODSQL. Le chiffre porte sur le jeu entier et suit les filtres partagés
    du tableau de bord.
  - **Tabular** : un KPI de comptage lit le total annoncé par l'API (`meta:total`).
  - Une source partagée dont plus aucun widget ne lit les lignes n'est plus chargée pour rien.
  - **Adaptateur Opendatasoft** : un `select` fait uniquement d'agrégats, sans `group-by`, part en
    **une** requête d'une ligne. L'API répète la valeur agrégée sur chaque ligne du jeu, et la
    pagination courait jusqu'au plafond pour des copies. Quand le filtre ne garde aucune ligne, un
    comptage vaut 0 et non « — ».
  
  Vérifié en navigateur contre l'API réelle : KPI à 3 080, KPI filtré à 1 890 (identique à l'API),
  0 pour un filtre sans correspondance, en 4 requêtes au lieu de 12.

- [#793](https://github.com/bmatge/dsfr-data/pull/793) [`04688b3`](https://github.com/bmatge/dsfr-data/commit/04688b3dd599fb2898e896582580b16bb67464b9) Thanks [@bmatge](https://github.com/bmatge)! - fix(kpi) : `count:champ:valeur` n'est plus déclaré obsolète, et `sum:champ:valeur` ne ment plus
  
  Deux défauts du parseur d'expressions du KPI.
  
  **Un faux avertissement de dépréciation.** `count:champ:valeur` est la forme recommandée depuis le
  ratio (0.24.0), exemple canonique compris (`count:statut:ouvert / count`). Le parseur posait
  pourtant l'avertissement de la grammaire `fn:champ` ([#303](https://github.com/bmatge/dsfr-data/issues/303)) avant de traiter les trois parties :
  chaque page qui suivait la documentation se voyait dire que son écriture était obsolète. La forme
  filtrée est désormais traitée avant ; seule la grammaire à deux parties (`sum:population`) reste
  dépréciée. La valeur de filtre est lue en entier, deux-points compris (`count:heure:12:30`).
  
  **Un filtre ignoré en silence.** `sum:montant:ouvert` était accepté, mais seul `count` honore une
  valeur de filtre : le KPI affichait le total **non filtré**, plausible et faux. C'est désormais une
  erreur de configuration nommée, pour toutes les fonctions autres que `count`. Pour agréger un
  sous-ensemble, filtrer en amont par le `where` du KPI ou une `dsfr-data-query`.
  
  Résout le constat BUG-012 du banc d'essai ([#764](https://github.com/bmatge/dsfr-data/issues/764)).

- [#815](https://github.com/bmatge/dsfr-data/pull/815) [`19ec006`](https://github.com/bmatge/dsfr-data/commit/19ec006de3d9e62299caf2a5ce056d914cef87c4) Thanks [@bmatge](https://github.com/bmatge)! - fix(chart) : avec `databox`, la légende suit enfin `color-map`
  
  Avec `databox`, `color-map` recolorait le graphique mais pas sa légende : les pastilles gardaient
  la palette par défaut et contredisaient les barres ou les parts, sans le moindre message (un
  camembert annonçait « Féminin » en bleu ciel pour une part saumon). La cause : DSFR Chart rend
  alors canvas et légende dans `data-box`, et les pastilles étaient cherchées dans un élément de
  graphique resté vide. Elles sont désormais cherchées dans le composant entier. Le cas sans
  `databox` ne change pas.
  
  Quand le nombre de pastilles ne correspond pas au nombre de couleurs, un avertissement le dit, au
  lieu d'une sortie silencieuse : une légende qui ne suit pas `color-map` ment sur les couleurs.
  
  Résout le constat BUG-016 du banc d'essai ([#813](https://github.com/bmatge/dsfr-data/issues/813)).

- [#796](https://github.com/bmatge/dsfr-data/pull/796) [`f74965a`](https://github.com/bmatge/dsfr-data/commit/f74965a235b6b0df701e251efb3610c03928259c) Thanks [@bmatge](https://github.com/bmatge)! - fix(adapter-ods) : un découpeur ODSQL qui respecte les parenthèses, et un `select` enfin échappé
  
  Trois demandes du banc d'essai, une seule cause : `group-by` et `select` étaient traités comme des
  listes de noms de champs, avec la présence d'une parenthèse pour seul indice d'expression.
  
  - **Un alias sans fonction n'est plus backquoté** : `group-by="periode as an"` partait en
    `` `periode as an` `` et l'API répondait 400. Le correctif de la 0.21.1 ne voyait que les
    expressions à parenthèses.
  - **Une virgule à l'intérieur d'une fonction ne coupe plus l'élément** :
    `date_format(d, 'yyyy-MM') as m` restait en deux morceaux, dont le second était backquoté. Le
    découpage ignore désormais les virgules entre parenthèses et entre quotes.
  - **Le `select` explicite est échappé** comme le `group_by`, ce qu'il n'était jamais. Un nom de
    champ à chiffre initial (`1_uai`), qui rend HTTP 400 nu et 200 backquoté, est backquoté ; un nom à
    espaces ou à accents aussi.
  
  Les expressions passent intactes : `count(*) as total`, `*`, les chemins pointés, les opérateurs,
  un élément déjà backquoté par l'auteur. Le `select` généré par les deux builders et celui de la
  documentation ne changent pas. Un identifiant n'est laissé nu que s'il commence par une lettre ou
  un souligné, ce qui règle aussi l'agrégat sur un champ à chiffre initial.
  
  Résout les constats BUG-010, BUG-011 et PG-027 du banc d'essai ([#767](https://github.com/bmatge/dsfr-data/issues/767)).

- [#802](https://github.com/bmatge/dsfr-data/pull/802) [`3c03748`](https://github.com/bmatge/dsfr-data/commit/3c03748354d22bdd0f25f76503f82df4a6a6d0d6) Thanks [@bmatge](https://github.com/bmatge)! - docs et `count-label` : quatre précisions relevées par le banc d'essai, et une position sur l'iframe
  
  - **`count-label` sur `dsfr-data-search`** : le compteur dit « résultat » quel que soit ce qu'on
    cherche. `count-label="établissement"` affiche « 12 345 établissements » ; un pluriel irrégulier
    prend les deux formes, `count-label="cheval|chevaux"`.
  - **`first` et `last` dans la référence du KPI** : ils figuraient dans le guide, pas dans le JSDoc de
    `value`, donc pas dans la section de référence générée.
  - **L'ordre `where` puis `group_by` est écrit** dans le JSDoc de `group-by` (`dsfr-data-query`) et
    de `field` (`dsfr-data-context-filter`) : un filtre ne peut viser ni un alias d'agrégat ni une
    colonne calculée en aval, l'API répond 400.
  - **Une colonne de classe peut porter une phrase** : « occupation saturée » produit deux classes et
    le texte entier reste restitué aux lecteurs d'écran. Le guide le dit.
  - **Encastrer une dataviz dans un site tiers** : nouvelle section du guide utilisateur. Balise ou
    iframe, ce qu'il advient de la déclaration d'accessibilité, des mentions, de la licence des
    données et des requêtes vers des tiers, et le cas de l'hôte hors DSFR.
  
  Résout les constats AM-076, PG-025, AM-044, AM-073 et AM-062 du banc d'essai ([#779](https://github.com/bmatge/dsfr-data/issues/779), [#778](https://github.com/bmatge/dsfr-data/issues/778)).

- [#803](https://github.com/bmatge/dsfr-data/pull/803) [`8607400`](https://github.com/bmatge/dsfr-data/commit/860740034593f1dbd5bcc08eeab6b5614a9266fc) Thanks [@bmatge](https://github.com/bmatge)! - feat(core) : l'avertissement de séparateur couvre `sort`, `rename` et `fold`
  
  La 0.26.0 signalait une virgule posée à la place de la barre verticale sur `display` et `labels`
  des facettes. Trois autres attributs multi-entrées restaient muets : un attribut écrit avec le
  mauvais séparateur est lu comme une seule entrée, et la page n'applique que la première règle.
  
  - `sort` de `dsfr-data-facets`, qui prend la barre verticale ;
  - `rename` (barre) et `fold` (virgule) de `dsfr-data-normalize` : deux séparateurs opposés sur la
    même balise, le piège exact décrit par le banc.
  
  L'avertissement nomme l'attribut, le séparateur attendu et la forme attendue, une fois par instance
  et par valeur reçue. Une virgule à l'intérieur d'un nouveau nom de `rename` (« Département, région »)
  ne déclenche rien. `cols` attend l'échelle responsive ([#789](https://github.com/bmatge/dsfr-data/issues/789)), qui en change la grammaire.
  
  Résout le constat PG-022 du banc d'essai ([#772](https://github.com/bmatge/dsfr-data/issues/772)).

## 0.28.1

### Patch Changes

- [#782](https://github.com/bmatge/dsfr-data/pull/782) [`4f5fdd8`](https://github.com/bmatge/dsfr-data/commit/4f5fdd8f837a599dcb0bfd11f74d20ef4368ac4e) Thanks [@bmatge](https://github.com/bmatge)! - fix(map-popup) : le volet latéral ne déborde plus de la carte sur écran étroit
  
  La largeur demandée par l'attribut `width` était appliquée telle quelle, sans borne. Or le volet
  est ancré à droite dans le conteneur de la carte, qui est en `overflow: hidden` : une largeur
  supérieure à celle de la carte ne débordait pas vers la droite, elle sortait par la **gauche** et
  se faisait rogner — les débuts de lignes disparaissaient (titre, libellés, valeurs), sans même que
  la page défile horizontalement pour le signaler.
  
  C'était le cas nominal sur téléphone : à 393 px de viewport, gouttières DSFR comprises, la carte
  fait 361 px, quand les exemples de la documentation proposent `width="400px"` (specs) et
  `width="380px"` (guide builder-IA) — soit 39 px et 19 px rognés.
  
  La largeur est désormais bornée à celle de la carte (`max-width: 100%` sur le volet) : sur un
  écran étroit le panneau l'occupe entièrement au lieu d'être coupé, et `width` continue de faire
  foi tant qu'elle tient dans la carte. Le mode `modal` était déjà responsive (`90vw`, plafonné à
  640 px) ; le mode `panel-*` était le seul à ne pas l'être.

- [#785](https://github.com/bmatge/dsfr-data/pull/785) [`065593c`](https://github.com/bmatge/dsfr-data/commit/065593c97b4c88b5ed92e9ecdf19c7c0f7b2a2b8) Thanks [@bmatge](https://github.com/bmatge)! - fix(studio, dashboard) : le code généré déclare la source API au lieu de figer ses lignes
  
  `generateSourceHTML` testait les données chargées **avant** la connexion. Or une source venue de
  l'app Sources porte toujours les deux : sa connexion (`apiUrl`, `provider`, `resourceIds`) *et* les
  lignes rapatriées dans le navigateur. Le test des données venant en premier, la branche
  OpenDataSoft n'était jamais atteinte pour ces sources-là : le Studio et le tableau de bord
  émettaient un `<dsfr-data-source data='[…]'>` de plusieurs milliers de lignes là où l'utilisateur
  attendait `api-type="opendatasoft" base-url="…" dataset-id="…"`.
  
  Ce n'était pas qu'une question de poids de page. `state.tableData` est ce que l'explorateur a
  effectivement paginé, quand `recordCount` porte le total annoncé par l'API — l'écart est un cas
  **normal**, l'explorateur l'affiche lui-même (« … sur N »). Un jeu partiellement chargé puis
  embarqué tel quel donne un tableau de bord dont chaque agrégat est faux, et faux en silence :
  exactement le défaut que `ConsumerNeed` cherche à éviter quelques lignes plus bas dans le même
  fichier. La page était par ailleurs morte — plus aucun rafraîchissement, quoi qu'il arrive au jeu
  source.
  
  La connexion déclarative passe donc en premier, et les données embarquées deviennent le **repli**,
  pour les sources qu'un document public ne peut pas atteindre seul : Grist (clé d'API, réponse
  imbriquée `records[].fields`), toute source à en-têtes d'authentification, et les sources manuelles
  JSON/CSV qui n'ont aucune URL. Aucun secret n'est jamais émis. Corollaire : une source ODS ou
  Tabular chargée sait de nouveau paginer côté serveur, `supportsServerPagination` n'étant plus
  disqualifié par la présence de `data`.
  
  Les deux tests existants n'exerçaient qu'une moitié du cas chacun — une source avec *seulement* des
  données, une avec *seulement* une connexion. Aucun ne couvrait celle qui porte les deux, qui est
  pourtant la seule que produise l'app Sources. Six cas s'ajoutent, dont le repli Grist et le repli
  en-têtes.
  
  Au passage, l'état vide du panneau d'aperçu (« Discutez avec l'assistant pour composer votre
  tableau de bord ») restait affiché **au-dessus** du tableau de bord une fois celui-ci rendu. Son
  `display: flex` est une règle d'auteur : il bat le `[hidden] { display: none }` du navigateur quelle
  que soit la spécificité. Le Studio et l'Assistant IA masquent tous deux par l'attribut
  (`el.hidden = true`) et étaient donc touchés ; seul le Builder y échappait, parce qu'il pose un
  `style.display` en ligne. La garde posée en [#629](https://github.com/bmatge/dsfr-data/issues/629) ne couvrait que l'iframe — le même piège valait
  pour l'état vide lui-même.

## 0.28.0

### Minor Changes

- [#761](https://github.com/bmatge/dsfr-data/pull/761) [`d106818`](https://github.com/bmatge/dsfr-data/commit/d106818da277eebcb407b844c7d793e82c6a9e2c) Thanks [@bmatge](https://github.com/bmatge)! - Un document exporté par le Studio pagine désormais côté serveur (`server-side`, `page-size` et
  `server-sort`) quand une source n'alimente qu'un seul tableau paginé : il ne rapatrie plus tout le
  jeu pour en afficher vingt lignes. Une source partagée entre plusieurs blocs, agrégée ou pilotée par
  un bloc de filtres continue de charger l'ensemble — y poser la pagination serveur fausserait
  silencieusement les graphiques et KPI d'à côté ; pour ce cas, utiliser `fetch-mode="export"` ([#717](https://github.com/bmatge/dsfr-data/issues/717)).

### Patch Changes

- [#761](https://github.com/bmatge/dsfr-data/pull/761) [`d106818`](https://github.com/bmatge/dsfr-data/commit/d106818da277eebcb407b844c7d793e82c6a9e2c) Thanks [@bmatge](https://github.com/bmatge)! - Les descriptions de `year-start-month` et de la région live de `dsfr-data-context-value` sont accentuées : elles apparaissent désormais dans les tableaux d'attributs générés des pages de specs, au lieu d'en être écartées par le lint de libellés.

## 0.27.0

### Minor Changes

- [#756](https://github.com/bmatge/dsfr-data/pull/756) [`1be5162`](https://github.com/bmatge/dsfr-data/commit/1be51627929abe183d3f0faa9eb879c3d1b5188d) Thanks [@bmatge](https://github.com/bmatge)! - Carte du monde : `code-field` accepte désormais le nom du pays écrit en français (« Allemagne », « allemagne », « l'Allemagne », « Pays-Bas », « Côte d'Ivoire »), en plus des codes ISO alpha-2, alpha-3 et numériques — insensible à la casse, aux accents, aux traits d'union et à l'article. Un nom hors référentiel reste compté comme ligne ignorée, jamais deviné ([#743](https://github.com/bmatge/dsfr-data/issues/743)).

- [#756](https://github.com/bmatge/dsfr-data/pull/756) [`1be5162`](https://github.com/bmatge/dsfr-data/commit/1be51627929abe183d3f0faa9eb879c3d1b5188d) Thanks [@bmatge](https://github.com/bmatge)! - Carte : nouvel attribut `tiles-switcher` sur `dsfr-data-map` — la liste des fonds proposés au lecteur (`tiles-switcher="ign-plan,ign-ortho"`). Rend un menu déroulant étiqueté « Fond de carte » en haut à droite, utilisable au clavier et annoncé aux lecteurs d'écran ; les encarts suivent le choix et chaque bascule émet `dsfr-data-map-tiles-change` ([#744](https://github.com/bmatge/dsfr-data/issues/744)).

- [#756](https://github.com/bmatge/dsfr-data/pull/756) [`1be5162`](https://github.com/bmatge/dsfr-data/commit/1be51627929abe183d3f0faa9eb879c3d1b5188d) Thanks [@bmatge](https://github.com/bmatge)! - `dsfr-data-context-filter` : nouvel attribut `year-start-month` sur les opérateurs `year-of` et `current-year` — l'année peut commencer en septembre (année scolaire), en avril (exercice comptable) ou en octobre (saison) au lieu de janvier. La clause reste une plage `gte` + `lt`, donc elle se délègue au serveur comme n'importe quelle autre, et le tag affiche « 2024-2025 » ([#735](https://github.com/bmatge/dsfr-data/issues/735)).

- [#756](https://github.com/bmatge/dsfr-data/pull/756) [`1be5162`](https://github.com/bmatge/dsfr-data/commit/1be51627929abe183d3f0faa9eb879c3d1b5188d) Thanks [@bmatge](https://github.com/bmatge)! - Nouveau composant `dsfr-data-context-value` : la valeur courante d'un filtre de contexte, écrite dans un titre ou une phrase — `template="Résultats pour {{departement}}"` avec un `fallback` déclaré tant qu'aucun filtre n'est posé. `live` en fait une région live polie, pour qu'un titre qui suit le filtre annonce le changement de contenu ([#742](https://github.com/bmatge/dsfr-data/issues/742)).

- [#756](https://github.com/bmatge/dsfr-data/pull/756) [`1be5162`](https://github.com/bmatge/dsfr-data/commit/1be51627929abe183d3f0faa9eb879c3d1b5188d) Thanks [@bmatge](https://github.com/bmatge)! - `dsfr-data-facets` : l'attribut `sort` accepte un tri par champ, avec la grammaire à barre verticale déjà utilisée par `labels`, `display` et `cols` — `sort="annee:alpha:asc | categorie:count:desc"`. Une facette d'années se range alphabétiquement pendant qu'une facette de catégories reste rangée par fréquence, sans dupliquer le composant ; l'entrée `*` change le tri par défaut et les formes globales historiques restent valides ([#741](https://github.com/bmatge/dsfr-data/issues/741)).

- [#756](https://github.com/bmatge/dsfr-data/pull/756) [`1be5162`](https://github.com/bmatge/dsfr-data/commit/1be51627929abe183d3f0faa9eb879c3d1b5188d) Thanks [@bmatge](https://github.com/bmatge)! - `dsfr-data-facets` : nouvel attribut `weight-field` — le compteur d'une facette affiche la somme d'un champ numérique au lieu du nombre de lignes (`weight-field="effectif"` annonce des effectifs, pas des relevés), et le tri `count` porte sur cette somme. L'attribut est client uniquement : en mode `server-facets`, où la somme n'existe pas dans la réponse `/facets`, les compteurs sont masqués et le composant le dit (erreur de configuration et avertissement DSFR) plutôt que d'afficher un nombre de lignes sous un libellé de somme ([#739](https://github.com/bmatge/dsfr-data/issues/739)).

- [#756](https://github.com/bmatge/dsfr-data/pull/756) [`1be5162`](https://github.com/bmatge/dsfr-data/commit/1be51627929abe183d3f0faa9eb879c3d1b5188d) Thanks [@bmatge](https://github.com/bmatge)! - `cell-class` sur `dsfr-data-list` : une colonne calculée par le `compute` de `dsfr-data-normalize` (`when taux >= 50 then 'seuil-ok' else 'seuil-bas'`) devient la classe CSS d'une cellule, de quoi signaler une valeur hors seuil dans un tableau. Une seule mécanique au lieu d'un second jeu de seuils, et l'information reste lisible en texte quand la colonne de classe n'est pas affichée ([#740](https://github.com/bmatge/dsfr-data/issues/740)).

- [#756](https://github.com/bmatge/dsfr-data/pull/756) [`1be5162`](https://github.com/bmatge/dsfr-data/commit/1be51627929abe183d3f0faa9eb879c3d1b5188d) Thanks [@bmatge](https://github.com/bmatge)! - `refine-on-click` (et son `context`) arrive sur `dsfr-data-list` et `dsfr-data-display` : cliquer une ligne ou une carte pose un filtre `eq` qui filtre les autres vues du contexte, avec tag et URL — le motif maître-détail ne demande plus de partir d'une carte. Le geste est accessible par construction : un vrai bouton par ligne, atteignable au clavier, dont l'état est annoncé (`aria-pressed`, `aria-current`) et dit par son libellé, jamais par la seule couleur ([#734](https://github.com/bmatge/dsfr-data/issues/734)).

- [#756](https://github.com/bmatge/dsfr-data/pull/756) [`1be5162`](https://github.com/bmatge/dsfr-data/commit/1be51627929abe183d3f0faa9eb879c3d1b5188d) Thanks [@bmatge](https://github.com/bmatge)! - `dsfr-data-query` accepte `explode="champ"` : un champ multivalué (tableau) est éclaté avant le regroupement, une ligne portant N valeurs compte dans N groupes. Les modalités d'un `group-by` deviennent alors exactement celles de la facette du même champ, là où la cellule était jusqu'ici comptée par combinaison (« audit,formation » comme une modalité). Sans l'attribut, le comportement est inchangé ([#736](https://github.com/bmatge/dsfr-data/issues/736)).

- [#756](https://github.com/bmatge/dsfr-data/pull/756) [`1be5162`](https://github.com/bmatge/dsfr-data/commit/1be51627929abe183d3f0faa9eb879c3d1b5188d) Thanks [@bmatge](https://github.com/bmatge)! - `dsfr-data-query` accepte l'agrégat cumulé `aggregate="montant:running_sum"` : une ligne par ligne de sortie, chacune portant la somme des précédentes, calculée après `order-by` (et cumulable sur une colonne issue du `group-by`, `montant__sum:running_sum`). Le cumul reste toujours côté client — aucune API ne le traduit — et un avertissement console signale son emploi sans `order-by`, où le résultat n'a pas de sens ([#738](https://github.com/bmatge/dsfr-data/issues/738)).

- [#756](https://github.com/bmatge/dsfr-data/pull/756) [`1be5162`](https://github.com/bmatge/dsfr-data/commit/1be51627929abe183d3f0faa9eb879c3d1b5188d) Thanks [@bmatge](https://github.com/bmatge)! - Les templates de `dsfr-data-display` et `dsfr-data-map-popup` acceptent le bloc `{{#each champ}}…{{/each}}` : un champ multivalué se rend enfin en liste structurée, avec `{{.}}` pour l'élément courant (formats de la grammaire compris) et `{{$index}}` pour son rang. La valeur reste échappée, un tableau vide ne rend rien, et les blocs ne s'imbriquent pas ([#737](https://github.com/bmatge/dsfr-data/issues/737)).

## 0.26.0

### Minor Changes

- [#754](https://github.com/bmatge/dsfr-data/pull/754) [`e5f39b2`](https://github.com/bmatge/dsfr-data/commit/e5f39b29ca92f5867e2a3c44c9b9c4f5d523ee71) Thanks [@bmatge](https://github.com/bmatge)! - `color-map` accepte l'échappement percent (`%2C`, `%3A`) : une modalité contenant une virgule ne casse plus le mapping de couleurs de `dsfr-data-map-layer`. Le même attribut arrive sur `dsfr-data-chart` avec la même grammaire : `color-map="Réalisé:#000091,Objectif:#E1000F"` fixe la couleur d'une série ou d'une part de camembert, légende comprise ([#732](https://github.com/bmatge/dsfr-data/issues/732)).

- [#754](https://github.com/bmatge/dsfr-data/pull/754) [`e5f39b2`](https://github.com/bmatge/dsfr-data/commit/e5f39b29ca92f5867e2a3c44c9b9c4f5d523ee71) Thanks [@bmatge](https://github.com/bmatge)! - Les échecs de nommage se voient. Un attribut qui désigne un champ absent des données (`label-field`, `value-field`, `geo-field`, `fill-field`, le `value` d'un KPI, les clés d'un `on` de jointure…) est désormais nommé dans la trace et dans le volet Diagnostic, avec la liste des champs qui existent — et « présent mais vide » est distingué d'« absent du schéma ». Un chemin imbriqué (`fields.nom`) ne déclenche aucun faux positif. En parallèle, un attribut inconnu de la version de la bibliothèque réellement chargée n'est plus ignoré en silence : il est marqué sur la balise, remonté dans le volet, et signalé une fois en console en développement ([#727](https://github.com/bmatge/dsfr-data/issues/727)).

- [#754](https://github.com/bmatge/dsfr-data/pull/754) [`e5f39b2`](https://github.com/bmatge/dsfr-data/commit/e5f39b29ca92f5867e2a3c44c9b9c4f5d523ee71) Thanks [@bmatge](https://github.com/bmatge)! - L'attribut `params` de `<dsfr-data-source>` vit désormais en mode adaptateur : ses paires sont ajoutées à l'URL construite par l'adaptateur Opendatasoft, en chargement paginé comme en `fetch-mode="export"` et en `server-side`. Une page qui a besoin de `params='{"timezone":"Europe/Paris"}'` peut donc quitter le mode URL. Les clés que la bibliothèque construit elle-même (`select`, `where`, `group_by`, `order_by`, `limit`, `offset`, `facet`) sont réservées : elles sont refusées avec une erreur de configuration au lieu d'écraser une clause en silence ([#726](https://github.com/bmatge/dsfr-data/issues/726)).

- [#754](https://github.com/bmatge/dsfr-data/pull/754) [`e5f39b2`](https://github.com/bmatge/dsfr-data/commit/e5f39b29ca92f5867e2a3c44c9b9c4f5d523ee71) Thanks [@bmatge](https://github.com/bmatge)! - Les transformateurs du pipeline (search, facets, normalize, query, join, pivot, unpivot, podium) savent enfin rendre l'attente d'un filtre : `TransformerMixin` expose `isIdle()` en plus de propager l'événement. `dsfr-data-search` s'en sert — son compteur cède la place à `idle-message` tant que l'amont `require-where` n'a rien reçu, au lieu d'annoncer « 0 résultats », et il affiche désormais un séparateur de milliers (« 12 345 résultats ») ([#728](https://github.com/bmatge/dsfr-data/issues/728)).

### Patch Changes

- [#754](https://github.com/bmatge/dsfr-data/pull/754) [`e5f39b2`](https://github.com/bmatge/dsfr-data/commit/e5f39b29ca92f5867e2a3c44c9b9c4f5d523ee71) Thanks [@bmatge](https://github.com/bmatge)! - Les bundles publiés ne se croient plus sur le serveur de développement du dépôt : la garde
  `import.meta.env.DEV` d'`isViteDevMode()` était pliée à la compilation, si bien qu'une page servie
  sur `http://localhost:<port>` chez un intégrateur voyait ses appels Tabular, Grist et INSEE réécrits
  vers des chemins `/…-proxy/` relatifs qui n'existent pas chez lui. Les appels partent désormais en
  direct. Pour servir volontairement un bundle construit derrière ses propres routes de proxy, poser
  `window.DSFR_DATA_PROXY = { baseUrl: '' }` avant le chargement de la bibliothèque ([#716](https://github.com/bmatge/dsfr-data/issues/716)).

- [#754](https://github.com/bmatge/dsfr-data/pull/754) [`e5f39b2`](https://github.com/bmatge/dsfr-data/commit/e5f39b29ca92f5867e2a3c44c9b9c4f5d523ee71) Thanks [@bmatge](https://github.com/bmatge)! - `dsfr-data-facets` avertit désormais en console, une fois par instance, quand `display` ou `labels` sépare ses entrées par une virgule au lieu d'une barre verticale, ou quand un mode d'affichage est inconnu : `display="a:select, b:select"` rendait zéro liste déroulante sans un mot. Le message nomme l'attribut, la valeur reçue et la forme attendue ([#731](https://github.com/bmatge/dsfr-data/issues/731)).

- [#754](https://github.com/bmatge/dsfr-data/pull/754) [`e5f39b2`](https://github.com/bmatge/dsfr-data/commit/e5f39b29ca92f5867e2a3c44c9b9c4f5d523ee71) Thanks [@bmatge](https://github.com/bmatge)! - Cartes `map-reg` et `map-aca` : les clés hors du référentiel de DSFR Chart sont désormais comptées par `getSkippedCount()` et remontées dans la console et le volet Diagnostic, au lieu de disparaître en silence. Les noms d'académies accentués ou préfixés (« Académie de Besançon ») et les codes INSEE de région (`11`, `84`) sont traduits vers les clés attendues (`BESANCON`, `IDF`, `ARA`) ([#729](https://github.com/bmatge/dsfr-data/issues/729)).

- [#754](https://github.com/bmatge/dsfr-data/pull/754) [`e5f39b2`](https://github.com/bmatge/dsfr-data/commit/e5f39b29ca92f5867e2a3c44c9b9c4f5d523ee71) Thanks [@bmatge](https://github.com/bmatge)! - `replace` et `replace-fields` de `dsfr-data-normalize` agissent enfin sur une colonne numérique ou booléenne : la comparaison porte sur la forme chaîne de la valeur, à égalité stricte, si bien que `replace-fields="annee:2024:2024-2025"` fonctionne — auparavant l'attribut était ignoré en silence ([#730](https://github.com/bmatge/dsfr-data/issues/730)).

## 0.25.0

### Minor Changes

- [#715](https://github.com/bmatge/dsfr-data/pull/715) [`0bf9444`](https://github.com/bmatge/dsfr-data/commit/0bf9444f2321da6c496a6ee6945f007144931ab9) Thanks [@bmatge](https://github.com/bmatge)! - Nouvel attribut `fetch-mode` sur `dsfr-data-source` : `fetch-mode="export"` charge un jeu Opendatasoft en une seule requête via l'endpoint d'export du portail, avec les mêmes clauses `select` / `where` / `group-by` / `order-by`, au lieu de le paginer par pages de 100. Défaut inchangé (`records`), repli automatique sur le chargement paginé si le portail n'expose pas d'export, et attribut ignoré avec `server-side` ([#689](https://github.com/bmatge/dsfr-data/issues/689)).

- [#715](https://github.com/bmatge/dsfr-data/pull/715) [`0bf9444`](https://github.com/bmatge/dsfr-data/commit/0bf9444f2321da6c496a6ee6945f007144931ab9) Thanks [@bmatge](https://github.com/bmatge)! - Nouvel attribut `require-where` sur `dsfr-data-source` et `dsfr-data-query` : sur une page d'exploration, plus aucune requête n'est lancée tant que l'utilisateur n'a posé aucun filtre, et retirer le dernier filtre y ramène (jamais de requête « tout »). Les afficheurs rendent alors un message DSFR paramétrable par `idle-message` (défaut « Choisissez un filtre pour afficher les données »), distinct de « aucune donnée » et du chargement ; l'attente est visible dans le volet Diagnostic et sur le bus via l'événement `dsfr-data-idle` ([#690](https://github.com/bmatge/dsfr-data/issues/690)).

### Patch Changes

- [#715](https://github.com/bmatge/dsfr-data/pull/715) [`0bf9444`](https://github.com/bmatge/dsfr-data/commit/0bf9444f2321da6c496a6ee6945f007144931ab9) Thanks [@bmatge](https://github.com/bmatge)! - Export HTML : une carte agrégée garde désormais son champ de code dans le `group-by`. Une configuration « population par région, coloriée par département » perdait la colonne de code à l'agrégation et rendait une carte vide, sans message ([#625](https://github.com/bmatge/dsfr-data/issues/625)).

## 0.24.0

### Minor Changes

- [#708](https://github.com/bmatge/dsfr-data/pull/708) [`c14c762`](https://github.com/bmatge/dsfr-data/commit/c14c7624a02bc384ff800300f8a05e264da48583) Thanks [@bmatge](https://github.com/bmatge)! - `compute` de `dsfr-data-normalize` — grammaire v2 (ADR-105) : fonctions en liste blanche (`year month day round abs floor ceil lower upper trim len concat replace coalesce is_null is_empty join contains`), conditions `when … then … else` (`else` obligatoire), comparaisons `= != < <= > >=` avec la même égalité lâche que `where`, `and or not`, littéraux `null true false`. Fonction inconnue, arité fausse ou `when` sans `else` : erreur de configuration nommée (console + `data-dsfr-config-error`), jamais une colonne vide. Les colonnes calculées apparaissent dans la trace du volet Diagnostic avec un exemple de valeur ([#671](https://github.com/bmatge/dsfr-data/issues/671)).

- [#708](https://github.com/bmatge/dsfr-data/pull/708) [`c14c762`](https://github.com/bmatge/dsfr-data/commit/c14c7624a02bc384ff800300f8a05e264da48583) Thanks [@bmatge](https://github.com/bmatge)! - Agrégat `evolution` sur `dsfr-data-kpi` : `value="recettes:evolution" format="pourcentage"` = (dernière − première) / première, calculé sur la source dans son ordre courant (poser un `order-by` chronologique en amont) ; rendu naturel dans `trend` et `lines`. « — » si moins de deux valeurs ou première = 0. `lag` (valeur de la ligne précédente) est différé : la différence entre deux séries passe par un pivot long → large (`dsfr-data-pivot`, [#255](https://github.com/bmatge/dsfr-data/issues/255)) puis `compute` ([#675](https://github.com/bmatge/dsfr-data/issues/675)).

- [#708](https://github.com/bmatge/dsfr-data/pull/708) [`c14c762`](https://github.com/bmatge/dsfr-data/commit/c14c7624a02bc384ff800300f8a05e264da48583) Thanks [@bmatge](https://github.com/bmatge)! - Agrégat `distinct` (alias `count-distinct`) dans la grammaire commune : `value="nom_departement:distinct"` sur `dsfr-data-kpi`, `aggregate="commune:distinct"` sur `dsfr-data-query` (colonne `commune__distinct`). Null et chaîne vide exclus. Délégué à OpenDataSoft (`count(distinct x)`) et Grist SQL (`COUNT(DISTINCT x)`), calculé côté client sur les lignes reçues pour Tabular, avec un avertissement si l'API en détient davantage ([#672](https://github.com/bmatge/dsfr-data/issues/672)).

- [#708](https://github.com/bmatge/dsfr-data/pull/708) [`c14c762`](https://github.com/bmatge/dsfr-data/commit/c14c7624a02bc384ff800300f8a05e264da48583) Thanks [@bmatge](https://github.com/bmatge)! - Ratio de deux agrégats sur `dsfr-data-kpi` : `value="count:statut:ouvert / count" format="pourcentage"` affiche la part correcte, chaque côté étant une expression de la grammaire actuelle (`count`, `montant:sum`, `champ:distinct`, `meta:total`…). Division par zéro rendue « — », jamais Infinity. `count:champ:valeur` accepte un champ tableau (un élément égal suffit). `count-if` est refusé sur `dsfr-data-query` (filtrer avec `where`, puis compter) ([#673](https://github.com/bmatge/dsfr-data/issues/673)).

- [#708](https://github.com/bmatge/dsfr-data/pull/708) [`c14c762`](https://github.com/bmatge/dsfr-data/commit/c14c7624a02bc384ff800300f8a05e264da48583) Thanks [@bmatge](https://github.com/bmatge)! - Attribut `where` sur `dsfr-data-kpi` : `value="montant:sum" where="categorie:eq:Actif"` calcule la somme filtrée sans query intermédiaire. Dialecte colon de `dsfr-data-query` (12 opérateurs, clauses multiples), appliqué à `value`, `trend` et `lines`. Côté client seulement : le filtre porte sur les lignes reçues et n'est jamais délégué au serveur ([#674](https://github.com/bmatge/dsfr-data/issues/674)).

- [#708](https://github.com/bmatge/dsfr-data/pull/708) [`c14c762`](https://github.com/bmatge/dsfr-data/commit/c14c7624a02bc384ff800300f8a05e264da48583) Thanks [@bmatge](https://github.com/bmatge)! - `dsfr-data-normalize` : nouvel attribut `fold="motif_*:cible"` qui replie des colonnes booléennes parallèles (une colonne Oui/Non par modalité : `handicap_moteur`, `handicap_visuel`…) en un seul champ tableau contenant les noms des colonnes vraies (Oui/Non, 1/0, true/false, X/vide), filtrable par une seule facette ; `fold-drop` retire les colonnes d'origine. Le repli s'exécute après `rename`, dont les libellés servent d'étiquettes. Nouvel utilitaire partagé `toBoolean` ([#677](https://github.com/bmatge/dsfr-data/issues/677)).

- [#708](https://github.com/bmatge/dsfr-data/pull/708) [`c14c762`](https://github.com/bmatge/dsfr-data/commit/c14c7624a02bc384ff800300f8a05e264da48583) Thanks [@bmatge](https://github.com/bmatge)! - Nouveau composant `dsfr-data-pivot`, symétrique de `dsfr-data-unpivot` : replie un tableau « long » en tableau croisé « wide » (`row`, `column`, `value`, `aggregate` = `sum` par défaut, `column-order`, `column-format`, `labels`, `max-columns`), cellules vides à `null`, statistiques (colonnes générées, cellules vides) dans la trace du Diagnostic. `dsfr-data-list` sans `columns` dérive désormais ses colonnes des données, et `columns-auto` complète une liste de colonnes figées avec celles des données ([#255](https://github.com/bmatge/dsfr-data/issues/255), [#640](https://github.com/bmatge/dsfr-data/issues/640)).

### Patch Changes

- [#708](https://github.com/bmatge/dsfr-data/pull/708) [`c14c762`](https://github.com/bmatge/dsfr-data/commit/c14c7624a02bc384ff800300f8a05e264da48583) Thanks [@bmatge](https://github.com/bmatge)! - `dsfr-data-normalize` : les attributs `replace` et `replace-fields` (et `rename`) acceptent l'échappement percent d'un `:` littéral (`%3A`, ainsi que `%7C`, `%2C`, `%25`), avec la même convention que `where` — `replace-fields="h:10%3A00:10h"` récrit désormais une heure ([#676](https://github.com/bmatge/dsfr-data/issues/676)).

- [#709](https://github.com/bmatge/dsfr-data/pull/709) [`ffd6af1`](https://github.com/bmatge/dsfr-data/commit/ffd6af1957bb991ca2f7fb23b182a6d290521a25) Thanks [@bmatge](https://github.com/bmatge)! - Documentation : les tableaux d'attributs des pages `/specs` sont désormais générés
  depuis le custom-elements manifest (`npm run build:specs-tables`), au lieu d'être
  saisis à la main. Le regroupement thématique des sections reste éditorial, mais le
  contenu des lignes (type, défaut, description) vient du JSDoc des composants, et
  l'exhaustivité est vérifiée : un attribut ajouté au code sans être rangé dans une
  section fait échouer la génération. `npm run check:specs-tables` rejoue le contrôle
  sans écrire, pour la CI.
  
  Effets sur la lib :
  
  - Descriptions JSDoc ré-accentuées dans `packages/core/src/components/` (141 blocs) :
    elles alimentent aussi les skills, le serveur MCP et l'assistant IA, qui servaient
    jusqu'ici du français dé-accentué.
  - Nouvel export lib-safe `escapeText` dans `@dsfr-data/shared` — échappement pour
    contenu textuel (`&`, `<`, `>` seulement), distinct de `escapeHtml` qui vise les
    attributs et transformerait la prose française en `l&#039;élément`.
  
  Attributs qui n'étaient documentés nulle part, révélés par le contrôle d'exhaustivité :
  `dsfr-data-map-layer` (`refine-on-click`, `context`, `label`), `dsfr-data-facets`
  (`context`, `no-reset`), `dsfr-data-search` (`context`), `dsfr-data-context-filter`
  (`context`), `dsfr-data-context-tags` (`clear-all`).
  
  Les extraits de code des pages `/specs` sont colorisés au build (spans `tok-*` posés
  par le générateur, stylés dans `packages/app-ui`) — sans coloriseur au runtime.

## 0.23.0

### Minor Changes

- [#706](https://github.com/bmatge/dsfr-data/pull/706) [`d19cb4d`](https://github.com/bmatge/dsfr-data/commit/d19cb4dff314ed1a3550e10a51799fdb56049da0) Thanks [@bmatge](https://github.com/bmatge)! - `dsfr-data-context-filter` gagne un attribut `default` (`today`, `first-of-month`, `first-of-year` ou un littéral) qui pré-remplit le filtre au montage — après l'URL, qui gagne toujours — et un opérateur `current-month` (case à cocher, mois en cours, borne dynamique) symétrique de `current-year` : `operator="lt-day-after" default="today"` filtre jusqu'à aujourd'hui sans script ([#682](https://github.com/bmatge/dsfr-data/issues/682)).

- [#706](https://github.com/bmatge/dsfr-data/pull/706) [`d19cb4d`](https://github.com/bmatge/dsfr-data/commit/d19cb4dff314ed1a3550e10a51799fdb56049da0) Thanks [@bmatge](https://github.com/bmatge)! - `dsfr-data-context-tags` reprend les filtres issus des facettes (un tag par valeur, retirable seule) et de la recherche (« Recherche : terme »), et gagne l'attribut `clear-all` : un bouton unique « Tout effacer » qui vide tous les filtres du contexte en une seule diffusion (`DsfrDataContext.clearAll()`). Nouvel attribut `no-reset` sur `dsfr-data-facets` pour masquer son bouton « Réinitialiser les filtres » local ([#679](https://github.com/bmatge/dsfr-data/issues/679)).

- [#706](https://github.com/bmatge/dsfr-data/pull/706) [`d19cb4d`](https://github.com/bmatge/dsfr-data/commit/d19cb4dff314ed1a3550e10a51799fdb56049da0) Thanks [@bmatge](https://github.com/bmatge)! - `dsfr-data-facets` : nouveau mode `display="champ:radio-inline"` — boutons radio DSFR visibles en ligne (fieldset dont la légende est le libellé de la facette), avec une option « Tous » qui retire la sélection. Le mode `radio` (menu déroulant à radios) ne change pas et sera renommé `radio-dropdown` dans une version majeure ([#684](https://github.com/bmatge/dsfr-data/issues/684)).

- [#706](https://github.com/bmatge/dsfr-data/pull/706) [`d19cb4d`](https://github.com/bmatge/dsfr-data/commit/d19cb4dff314ed1a3550e10a51799fdb56049da0) Thanks [@bmatge](https://github.com/bmatge)! - Facettes et recherche comme filtres de `dsfr-data-context` : nouvel attribut `context="id"` sur `dsfr-data-facets` (un filtre par champ, select peuplé depuis la donnée avec cascade `server-facets`, sans `<option>` en dur), `dsfr-data-search` (filtre `contains`) et `dsfr-data-context-filter` (placé hors du contexte, même déclaré avant lui). Un seul bus de diffusion : le contexte diffuse à ses sources cibles, porte l'URL (un paramètre par champ) et alimente `context-tags` ; `contains` est exposé dans les opérateurs du `context-filter` ; `whereKey` stable indexé sur le champ ([#678](https://github.com/bmatge/dsfr-data/issues/678)).

- [#706](https://github.com/bmatge/dsfr-data/pull/706) [`d19cb4d`](https://github.com/bmatge/dsfr-data/commit/d19cb4dff314ed1a3550e10a51799fdb56049da0) Thanks [@bmatge](https://github.com/bmatge)! - `dsfr-data-facets server-facets` sans `fields` : découverte au premier cycle des facettes déclarées par le jeu de données (OpenDataSoft : champs annotés « facet » des métadonnées, avec leur libellé ; Grist : colonnes Choice/ChoiceList), mémorisée et invalidée au changement de `dataset-id`, puis cascade normale ([#680](https://github.com/bmatge/dsfr-data/issues/680)). Sur une facette ODS de type date, la sélection d'une année émet un intervalle `champ >= date'2022-01-01' AND champ < date'2023-01-01'` au lieu de l'égalité `champ = "2022"` que l'API refuse (400 `IncompatibleTypesInComparisonFilter`, [#676](https://github.com/bmatge/dsfr-data/issues/676)) ; nouvelle méthode optionnelle `discoverFacets` et option `dateFields` de `buildFacetWhere` sur les adaptateurs.

- [#706](https://github.com/bmatge/dsfr-data/pull/706) [`d19cb4d`](https://github.com/bmatge/dsfr-data/commit/d19cb4dff314ed1a3550e10a51799fdb56049da0) Thanks [@bmatge](https://github.com/bmatge)! - La carte comme filtre du contexte ([#681](https://github.com/bmatge/dsfr-data/issues/681), ADR-104) : `dsfr-data-map-layer` émet `dsfr-data-map-select` `{ record, layerId, selected }` au clic sur un marqueur, un cercle ou une forme ; avec `refine-on-click="champ"` et `context="id"`, la couche s'enregistre comme filtre `eq` du `dsfr-data-context` (les autres vues se filtrent, tag dans `context-tags`, URL portée par le contexte, second clic = retrait). Sans `context`, la clause part directement à `source` (whereKey `map-select-<id>`). Nouvel attribut `label` (libellé du tag).

### Patch Changes

- [#706](https://github.com/bmatge/dsfr-data/pull/706) [`d19cb4d`](https://github.com/bmatge/dsfr-data/commit/d19cb4dff314ed1a3550e10a51799fdb56049da0) Thanks [@bmatge](https://github.com/bmatge)! - URL de synchronisation (`url-sync` de `dsfr-data-context`, `dsfr-data-facets`, `dsfr-data-search`) construite avec l'API `URL` : sur une page servie sous `//chemin`, `replaceState` levait `SecurityError` et la synchro d'URL cessait en silence ([#683](https://github.com/bmatge/dsfr-data/issues/683)).

## 0.22.0

### Minor Changes

- [#703](https://github.com/bmatge/dsfr-data/pull/703) [`800365b`](https://github.com/bmatge/dsfr-data/commit/800365b85895e90fd77317ebab9d96b8edb2abc9) Thanks [@bmatge](https://github.com/bmatge)! - `dsfr-data-chart` : nouvel attribut `databox-date-field` — la date de la DataBox (et des cartes) est lue dans la donnée : la plus récente des dates ISO de la colonne indiquée est affichée, formatée JJ/MM/AAAA. Un `databox-date` explicite prime ([#661](https://github.com/bmatge/dsfr-data/issues/661)).

- [#703](https://github.com/bmatge/dsfr-data/pull/703) [`800365b`](https://github.com/bmatge/dsfr-data/commit/800365b85895e90fd77317ebab9d96b8edb2abc9) Thanks [@bmatge](https://github.com/bmatge)! - `dsfr-data-chart` : nouvel attribut `heading-level` (2 à 6, défaut 3) pour caler le niveau de titre de la DataBox sur la hiérarchie de la page (RGAA 9.1) — `heading-level="2"` rend un h2 ([#670](https://github.com/bmatge/dsfr-data/issues/670)).

- [#703](https://github.com/bmatge/dsfr-data/pull/703) [`800365b`](https://github.com/bmatge/dsfr-data/commit/800365b85895e90fd77317ebab9d96b8edb2abc9) Thanks [@bmatge](https://github.com/bmatge)! - Le paquet npm livre deux fonds administratifs GeoJSON simplifiés hors bundle, `dsfr-data/geo/regions.json` (18 régions) et `dsfr-data/geo/departements.json` (101 départements) — Contours administratifs Etalab, Licence Ouverte 2.0 — résolus par `import.meta.resolve('dsfr-data/geo/regions.json')` ou servis par un CDN, avec la recette `<dsfr-data-source url="…/geo/regions.json" transform="features">` + couche `geoshape no-interactive` ([#688](https://github.com/bmatge/dsfr-data/issues/688)).

- [#703](https://github.com/bmatge/dsfr-data/pull/703) [`800365b`](https://github.com/bmatge/dsfr-data/commit/800365b85895e90fd77317ebab9d96b8edb2abc9) Thanks [@bmatge](https://github.com/bmatge)! - Alias inline `col:Libellé` sur `value-cols` de `dsfr-data-unpivot` (`value-cols="gazole_prix:Gazole, sp95_prix:SP95"`) et sur `value-field`, `value-field-2` et `value-fields` de `dsfr-data-chart` (`value-field="Panier_moyen:Panier moyen"`) : la légende et la colonne dépliée affichent le libellé à la place du nom technique. Un `name` explicite prime sur l'alias ; un `:` littéral s'échappe en `%3A` ([#668](https://github.com/bmatge/dsfr-data/issues/668)).

- [#703](https://github.com/bmatge/dsfr-data/pull/703) [`800365b`](https://github.com/bmatge/dsfr-data/commit/800365b85895e90fd77317ebab9d96b8edb2abc9) Thanks [@bmatge](https://github.com/bmatge)! - `dsfr-data-join` publie le taux d'appariement dans sa meta (`join: { leftMatched, leftTotal, rightMatched, rightTotal }`, aussi via `getJoinStats()`) ; le volet Diagnostic et `formatTrace()` rendent « 237 / 1 065 lignes gauche appariées (22 %) » avec alerte sous 50 %. `performJoinWithStats` est exporté de `@dsfr-data/shared` ; les clés sont comparées en chaîne, sans trim (`201` = `"201"`, `"0201"` ≠ `"201"`), documenté dans le guide ([#660](https://github.com/bmatge/dsfr-data/issues/660)).

- [#703](https://github.com/bmatge/dsfr-data/pull/703) [`800365b`](https://github.com/bmatge/dsfr-data/commit/800365b85895e90fd77317ebab9d96b8edb2abc9) Thanks [@bmatge](https://github.com/bmatge)! - `dsfr-data-kpi` gagne les attributs `decimals` (nombre de décimales affichées : `format="euro" decimals="3"` → « 1,749 € ») et `unit` (suffixe après une espace insécable : `format="compact" unit="€"` → « 44,9 Md € »), aussi disponibles sur chaque ligne de `lines` ; `formatValue(value, format, { decimals, unit })` accepte ces options (défauts inchangés) et `formatNumberFr()` formate un nombre fr-FR avec un plafond de décimales. La grammaire `format="euro:3"` est refusée avec une erreur de configuration orientant vers `decimals` ([#665](https://github.com/bmatge/dsfr-data/issues/665)).

- [#703](https://github.com/bmatge/dsfr-data/pull/703) [`800365b`](https://github.com/bmatge/dsfr-data/commit/800365b85895e90fd77317ebab9d96b8edb2abc9) Thanks [@bmatge](https://github.com/bmatge)! - `dsfr-data-kpi` accepte `format="date"` (chaîne ISO rendue JJ/MM/AAAA, aussi sur une ligne de `lines`) et les agrégats `min`/`max` acceptent une colonne de dates ISO (`value="maj:max" format="date"` → « 09/09/2026 ») ; `first`/`last` renvoient la chaîne brute, formatée par le KPI. Les colonnes numériques gardent leur comportement ([#667](https://github.com/bmatge/dsfr-data/issues/667)).

- [#703](https://github.com/bmatge/dsfr-data/pull/703) [`800365b`](https://github.com/bmatge/dsfr-data/commit/800365b85895e90fd77317ebab9d96b8edb2abc9) Thanks [@bmatge](https://github.com/bmatge)! - `dsfr-data-list` accepte un attribut `caption` (titre du tableau, RGAA 5.4 ; à défaut dérivé de `aria-label`) et sa pagination suit le motif DSFR : ellipses (« 1 2 3 … 115 »), position « Page N sur M » affichée et annoncée, total depuis la source en mode serveur ([#669](https://github.com/bmatge/dsfr-data/issues/669)).

- [#703](https://github.com/bmatge/dsfr-data/pull/703) [`800365b`](https://github.com/bmatge/dsfr-data/commit/800365b85895e90fd77317ebab9d96b8edb2abc9) Thanks [@bmatge](https://github.com/bmatge)! - `dsfr-data-map` : quand la carte porte un encart ultramarin (`insets="drom"`…) sans `max-bounds`, `fit-bounds` se cale par défaut sur la métropole (`41,-5.5,51.5,10`) — les DROM ne dézooment plus la vue, le déplacement reste libre. Nouvel attribut `fit-zone="latSW,lonSW,latNE,lonNE"` pour surcharger la zone de fit (`none` la désactive) ([#687](https://github.com/bmatge/dsfr-data/issues/687)).

- [#703](https://github.com/bmatge/dsfr-data/pull/703) [`800365b`](https://github.com/bmatge/dsfr-data/commit/800365b85895e90fd77317ebab9d96b8edb2abc9) Thanks [@bmatge](https://github.com/bmatge)! - Nouveau compagnon `<dsfr-data-map-legend for="id-couche" label="…">` : légende DSFR rendue sous la carte (pastilles décoratives + texte) pour une couche catégorielle (`color-map` + repli `color`) ou une choroplèthe, dont les classes deviennent paramétrables sur `dsfr-data-map-layer` avec `classes="5"`, `method="quantile|equal|manual"` et `breaks="10,50,100"` (défaut inchangé : quantiles, autant de classes que de couleurs). La couche expose `getLegendEntries()` et émet `dsfr-data-map-layer-render` à chaque rendu ([#685](https://github.com/bmatge/dsfr-data/issues/685)).

- [#703](https://github.com/bmatge/dsfr-data/pull/703) [`800365b`](https://github.com/bmatge/dsfr-data/commit/800365b85895e90fd77317ebab9d96b8edb2abc9) Thanks [@bmatge](https://github.com/bmatge)! - `dsfr-data-map` : attribut `tiles-style="muted|grey"` pour atténuer le fond de carte d'une carte thématique sans CSS de page (filtre sur le volet des tuiles de la carte, hérité par les encarts) — un fond neutre = `ign-plan` + `tiles-style="muted"` ([#686](https://github.com/bmatge/dsfr-data/issues/686)).

- [#703](https://github.com/bmatge/dsfr-data/pull/703) [`800365b`](https://github.com/bmatge/dsfr-data/commit/800365b85895e90fd77317ebab9d96b8edb2abc9) Thanks [@bmatge](https://github.com/bmatge)! - `dsfr-data-source` pose `truncated: true` dans sa meta quand les lignes livrées sont un sous-ensemble du jeu (plafond `max-records` atteint, y compris sur un `group-by` ODS au total inconnu, ou `limit` sous le total) ; le volet Diagnostic et `formatTrace()` rendent « tronqué à N / total lignes (plafond max-records) » en alerte ([#658](https://github.com/bmatge/dsfr-data/issues/658)).

- [#703](https://github.com/bmatge/dsfr-data/pull/703) [`800365b`](https://github.com/bmatge/dsfr-data/commit/800365b85895e90fd77317ebab9d96b8edb2abc9) Thanks [@bmatge](https://github.com/bmatge)! - `dsfr-data-query` publie dans sa meta `total` = nombre de lignes avant `limit` (et `truncated` quand `limit` a tranché) ; `dsfr-data-kpi value="count"` avertit en console quand l'amont détient plus de lignes que celles reçues, et `value="meta:total"` affiche le total de la meta (total serveur en `server-side`, lignes avant `limit` derrière un query) ([#659](https://github.com/bmatge/dsfr-data/issues/659)).

- [#703](https://github.com/bmatge/dsfr-data/pull/703) [`800365b`](https://github.com/bmatge/dsfr-data/commit/800365b85895e90fd77317ebab9d96b8edb2abc9) Thanks [@bmatge](https://github.com/bmatge)! - Les tableaux affichés par `dsfr-data-list` et `dsfr-data-a11y` rendent les nombres en français (`2.27` → « 2,27 », au plus 2 décimales), avec un attribut `decimals` optionnel pour fixer le nombre de décimales ; les chaînes (codes INSEE, SIREN) restent intactes et l'export CSV reste brut ([#666](https://github.com/bmatge/dsfr-data/issues/666)).

- [#703](https://github.com/bmatge/dsfr-data/pull/703) [`800365b`](https://github.com/bmatge/dsfr-data/commit/800365b85895e90fd77317ebab9d96b8edb2abc9) Thanks [@bmatge](https://github.com/bmatge)! - Templates de `dsfr-data-display` et `dsfr-data-map-popup` : blocs conditionnels `{{#if champ}}…{{/if}}` / `{{#unless champ}}…{{/unless}}` (non imbriqués, résolus avant la substitution) et pipe `{{lien:url}}` à liste blanche de schémas (`http:`, `https:`, `mailto:`, `tel:`, URL relatives ; sinon chaîne vide). **Sécurité** : `href="{{x}}"` n'appliquait aucun filtrage de schéma, une donnée `javascript:…` passait telle quelle — utiliser `{{x:url}}` dans tout `href`. Moteur `renderTemplate` factorisé entre les deux composants ([#664](https://github.com/bmatge/dsfr-data/issues/664)).

- [#703](https://github.com/bmatge/dsfr-data/pull/703) [`800365b`](https://github.com/bmatge/dsfr-data/commit/800365b85895e90fd77317ebab9d96b8edb2abc9) Thanks [@bmatge](https://github.com/bmatge)! - Champs multivalués (ODS, Grist) : un tableau est désormais rendu joint par « , » dans les templates de `dsfr-data-display` / `dsfr-data-map-popup` et dans les cellules de `dsfr-data-list` (au lieu de `a,b`). Pipe `{{tags:join: / }}` pour choisir le séparateur ([#663](https://github.com/bmatge/dsfr-data/issues/663)).

- [#703](https://github.com/bmatge/dsfr-data/pull/703) [`800365b`](https://github.com/bmatge/dsfr-data/commit/800365b85895e90fd77317ebab9d96b8edb2abc9) Thanks [@bmatge](https://github.com/bmatge)! - Templates de `dsfr-data-display` et `dsfr-data-map-popup` : pipe `{{champ:date}}` (JJ/MM/AAAA, « — » si invalide) et `{{champ:datetime}}` (avec HH:MM), sur une grammaire d'argument commune `{{chemin[:format[:arg]][|défaut]}}` — `{{prix:number:2}}` fixe le nombre de décimales ([#662](https://github.com/bmatge/dsfr-data/issues/662)).

## 0.21.1

### Patch Changes

- [#701](https://github.com/bmatge/dsfr-data/pull/701) [`dddd41e`](https://github.com/bmatge/dsfr-data/commit/dddd41e0bc52b0e068fc4797b10c441ea5399e95) Thanks [@bmatge](https://github.com/bmatge)! - Une fonction d'agrégat inconnue (ex. `sum` mal orthographié en `somme`) n'est plus silencieuse : `dsfr-data-kpi` (`value`, `trend`) affiche une erreur de configuration à la place d'un indicateur vide, et `dsfr-data-query` (`aggregate`) passe en erreur au lieu de produire un 0 plausible — le message nomme le composant, l'attribut, la fonction reçue et la liste acceptée ([#649](https://github.com/bmatge/dsfr-data/issues/649)).

- [#701](https://github.com/bmatge/dsfr-data/pull/701) [`dddd41e`](https://github.com/bmatge/dsfr-data/commit/dddd41e0bc52b0e068fc4797b10c441ea5399e95) Thanks [@bmatge](https://github.com/bmatge)! - `dsfr-data-chart` : nouvel attribut `empty-label` (défaut « Non renseigné ») pour libeller les catégories vides (`null`, `undefined`, `""`) — la légende d'un pie n'affiche plus « Série N » pour un groupe sans valeur. Le libellé par défaut des labels manquants passe de `N/A` à « Non renseigné » ; le `group-by` client de `dsfr-data-query` conserve `null` (et non `""`) comme valeur de groupe, pour qu'un `where="champ:isnotnull"` aval l'exclue ([#647](https://github.com/bmatge/dsfr-data/issues/647)).

- [#701](https://github.com/bmatge/dsfr-data/pull/701) [`dddd41e`](https://github.com/bmatge/dsfr-data/commit/dddd41e0bc52b0e068fc4797b10c441ea5399e95) Thanks [@bmatge](https://github.com/bmatge)! - Filtres de contexte : `year-of` et `month-of` acceptent une date complète (issue d'un input type=date) et la tronquent à l'année / au mois, y compris depuis l'URL ; une valeur inexploitable retire le filtre en le signalant par un avertissement console au lieu de le retirer en silence ([#646](https://github.com/bmatge/dsfr-data/issues/646)).

- [#701](https://github.com/bmatge/dsfr-data/pull/701) [`dddd41e`](https://github.com/bmatge/dsfr-data/commit/dddd41e0bc52b0e068fc4797b10c441ea5399e95) Thanks [@bmatge](https://github.com/bmatge)! - `dsfr-data-chart` : `databox-date` n'a plus de valeur par défaut — la DataBox affichait la date du jour (date de rendu) comme date des données quand l'attribut était omis. Sans `databox-date`, aucune date n'est rendue ([#650](https://github.com/bmatge/dsfr-data/issues/650)).

- [#701](https://github.com/bmatge/dsfr-data/pull/701) [`dddd41e`](https://github.com/bmatge/dsfr-data/commit/dddd41e0bc52b0e068fc4797b10c441ea5399e95) Thanks [@bmatge](https://github.com/bmatge)! - Facettes : le tri des valeurs adopte la grammaire `critere:sens` de `order-by` (`sort="count:desc"` par défaut, `count:asc`, `alpha:asc`, `alpha:desc`) ; `count` et `alpha` restent des raccourcis, `-count` / `-alpha` sont dépréciés (comportement inchangé, avertissement console) ([#645](https://github.com/bmatge/dsfr-data/issues/645)).

- [#701](https://github.com/bmatge/dsfr-data/pull/701) [`dddd41e`](https://github.com/bmatge/dsfr-data/commit/dddd41e0bc52b0e068fc4797b10c441ea5399e95) Thanks [@bmatge](https://github.com/bmatge)! - `dsfr-data-kpi` : le JSDoc de `format` documente désormais la valeur `compact` (14 785 684 → « 14,8 M »), qui existait sans être listée ([#657](https://github.com/bmatge/dsfr-data/issues/657)). La référence générée et les skills IA en héritent.

- [#701](https://github.com/bmatge/dsfr-data/pull/701) [`dddd41e`](https://github.com/bmatge/dsfr-data/commit/dddd41e0bc52b0e068fc4797b10c441ea5399e95) Thanks [@bmatge](https://github.com/bmatge)! - `dsfr-data-chart` (cartes `map`, `map-reg`, `map-aca`, `map-monde`) : les données sont posées dès le montage du composant DSFR Chart — plus de `console.error` « Erreur lors du parsing des données data » à chaque affichage de carte ([#651](https://github.com/bmatge/dsfr-data/issues/651)).

- [#701](https://github.com/bmatge/dsfr-data/pull/701) [`dddd41e`](https://github.com/bmatge/dsfr-data/commit/dddd41e0bc52b0e068fc4797b10c441ea5399e95) Thanks [@bmatge](https://github.com/bmatge)! - Carte : `fit-bounds` combiné à `max-bounds` zoome désormais sur une emprise réduite à un point ou un segment (résultat unique d'une recherche par commune) au lieu de laisser la vue inchangée ; nouvel attribut `fit-max-zoom` pour plafonner ce zoom ([#642](https://github.com/bmatge/dsfr-data/issues/642)).

- [#701](https://github.com/bmatge/dsfr-data/pull/701) [`dddd41e`](https://github.com/bmatge/dsfr-data/commit/dddd41e0bc52b0e068fc4797b10c441ea5399e95) Thanks [@bmatge](https://github.com/bmatge)! - Encarts territoriaux (`dsfr-data-map-inset`) : nouvel attribut `width` (px, rem, `%` — `width="20%"` répartit cinq encarts sur une ligne) et largeur par défaut de 10 rem posée par la feuille injectée de la carte, que le CSS de page continue de surcharger ; plus de style inline sur l'encart ([#643](https://github.com/bmatge/dsfr-data/issues/643)).

- [#701](https://github.com/bmatge/dsfr-data/pull/701) [`dddd41e`](https://github.com/bmatge/dsfr-data/commit/dddd41e0bc52b0e068fc4797b10c441ea5399e95) Thanks [@bmatge](https://github.com/bmatge)! - Couche carte : le bandeau `max-items` nomme le remède réel — hors mode `bbox` « N affichés sur M — relevez max-items » (rien n'est rechargé au zoom), en `bbox` l'invitation à zoomer reste ; les mini-cartes des encarts territoriaux (carte `locked`) n'affichent plus jamais ce bandeau ([#644](https://github.com/bmatge/dsfr-data/issues/644)).

- [#701](https://github.com/bmatge/dsfr-data/pull/701) [`dddd41e`](https://github.com/bmatge/dsfr-data/commit/dddd41e0bc52b0e068fc4797b10c441ea5399e95) Thanks [@bmatge](https://github.com/bmatge)! - Couche carte en mode `bbox` : la commande `in_bbox` du viewport initial est émise dès que la carte est prête, sans attendre un déplacement de l'utilisateur ; le premier fetch de la source reste non filtré (poser `limit`/`where` sur la source pour un gros jeu) ([#652](https://github.com/bmatge/dsfr-data/issues/652)).

- [#701](https://github.com/bmatge/dsfr-data/pull/701) [`dddd41e`](https://github.com/bmatge/dsfr-data/commit/dddd41e0bc52b0e068fc4797b10c441ea5399e95) Thanks [@bmatge](https://github.com/bmatge)! - `dsfr-data-chart` : sur les cartes (`map`, `map-reg`, `map-aca`, `map-monde`), un `name` écrit en JSON (`name='["Taux"]'`) affiche « Taux » au lieu du tableau littéral. La chaîne simple (`name="Taux"`) est la forme recommandée partout ; le JSON reste réservé au multi-séries ([#653](https://github.com/bmatge/dsfr-data/issues/653)).

- [#701](https://github.com/bmatge/dsfr-data/pull/701) [`dddd41e`](https://github.com/bmatge/dsfr-data/commit/dddd41e0bc52b0e068fc4797b10c441ea5399e95) Thanks [@bmatge](https://github.com/bmatge)! - Cartes : les lignes sans position exploitable ne disparaissent plus en silence. `dsfr-data-map-layer` (marqueurs, cercles, heatmap — comme le geoshape depuis [#482](https://github.com/bmatge/dsfr-data/issues/482)) et les cartes `map*` de `dsfr-data-chart` comptent les lignes écartées, émettent un seul `console.warn` par cycle et exposent `getSkippedCount()` ; le volet Diagnostic affiche « N lignes ignorées (code géographique absent ou invalide) ». Au passage, une latitude/longitude nulle ou vide est ignorée au lieu d'être dessinée en (0, 0) ([#648](https://github.com/bmatge/dsfr-data/issues/648)).

- [#701](https://github.com/bmatge/dsfr-data/pull/701) [`dddd41e`](https://github.com/bmatge/dsfr-data/commit/dddd41e0bc52b0e068fc4797b10c441ea5399e95) Thanks [@bmatge](https://github.com/bmatge)! - OpenDataSoft : un en-tête `apikey` (ou `x-api-key`, `api-key`) passé via `headers` est réécrit à l'exécution en `Authorization: Apikey <clé>`, seule forme acceptée par ODS en préflight CORS — en mode `api-type="opendatasoft"` comme en mode URL sur un hôte ODS ; la documentation prescrit désormais `api-key-ref` + `window.DSFR_DATA_KEYS` ou `Authorization: Apikey` ([#655](https://github.com/bmatge/dsfr-data/issues/655)).

- [#701](https://github.com/bmatge/dsfr-data/pull/701) [`dddd41e`](https://github.com/bmatge/dsfr-data/commit/dddd41e0bc52b0e068fc4797b10c441ea5399e95) Thanks [@bmatge](https://github.com/bmatge)! - OpenDataSoft : les agrégats `group-by` ne sont plus tronqués à la première page (l'API renvoie un `total_count` égal à la taille de page, désormais ignoré : toutes les pages sont lues, total inconnu) et une expression aliasée dans `group-by` (`year(date) as annee`) est transmise telle quelle au lieu d'être échappée en nom de champ ([#641](https://github.com/bmatge/dsfr-data/issues/641)).

- [#701](https://github.com/bmatge/dsfr-data/pull/701) [`dddd41e`](https://github.com/bmatge/dsfr-data/commit/dddd41e0bc52b0e068fc4797b10c441ea5399e95) Thanks [@bmatge](https://github.com/bmatge)! - Retrait de Chart.js de la recette CDN ([#656](https://github.com/bmatge/dsfr-data/issues/656)) : `@gouvfr/dsfr-chart` l'embarque déjà dans `DSFRChart.js`, le script séparé (~200 Ko par page) ne servait à rien. `CDN_URLS.chartJs` disparaît du package partagé ; le template d'aperçu, le guide IA, les générateurs de code et les pages des apps ne l'injectent plus.

- [#701](https://github.com/bmatge/dsfr-data/pull/701) [`dddd41e`](https://github.com/bmatge/dsfr-data/commit/dddd41e0bc52b0e068fc4797b10c441ea5399e95) Thanks [@bmatge](https://github.com/bmatge)! - Le lecteur d'écran n'entend plus deux comptes de résultats contradictoires : quand une liste ou un afficheur est en aval de `dsfr-data-search` (même via des facettes), seul l'afficheur annonce le compte ; le compteur `count` de search reste visible mais ne parle plus, et le mot « résultat » est accentué ([#654](https://github.com/bmatge/dsfr-data/issues/654)).

## 0.21.0

### Minor Changes

- [#636](https://github.com/bmatge/dsfr-data/pull/636) [`690d3c7`](https://github.com/bmatge/dsfr-data/commit/690d3c7e7e53cfe72569aad3dd74c54dd02ef06a) Thanks [@bmatge](https://github.com/bmatge)! - Le bus publie de quoi diagnostiquer une chaine sans ouvrir les DevTools ([#603](https://github.com/bmatge/dsfr-data/issues/603)).
  
  Trois ajouts optionnels, non cassants — le message des `Error` et le contrat
  des abonnes existants sont strictement inchanges :
  
  - `attemptedUrl` sur l'evenement `dsfr-data-error` : l'URL reellement appelee,
    proxy applique. Le diagnostic de [#598](https://github.com/bmatge/dsfr-data/issues/598) existait deja mais uniquement en
    console ; il devient exploitable par une interface.
  - `origin` sur `dsfr-data-source-command` : le bus etant plat, une trace ne
    pouvait pas dire quel composant demandait une delegation a la source.
  - `dsfr-data-query.getDelegation()` : quelles operations tournent cote serveur
    et lesquelles sont retombees cote client — un `group-by` non delegue
    s'execute sur les seules lignes rapatriees.

- [#636](https://github.com/bmatge/dsfr-data/pull/636) [`690d3c7`](https://github.com/bmatge/dsfr-data/commit/690d3c7e7e53cfe72569aad3dd74c54dd02ef06a) Thanks [@bmatge](https://github.com/bmatge)! - Collecteur de trace du pipeline ([#604](https://github.com/bmatge/dsfr-data/issues/604)) — socle du volet Diagnostic.
  
  Nouveau module `@dsfr-data/shared` `debug/` : un seul ecouteur sur le bus
  global suffit a observer l'integralite d'un pipeline, sans modifier aucun
  composant.
  
  - `snapshotGraph()` reconstruit la topologie depuis le DOM (`id` / `source`,
    `left`/`right` pour join), donne une cle synthetique aux afficheurs sans id
    et signale les amonts declares mais absents de la page.
  - `DataflowRecorder` tient un journal borne et l'etat par etape, avec sa
    propre copie des donnees : une etape retiree du DOM voit son cache global
    efface, sa trace doit survivre.
  - `formatTrace()` rend le tout en texte francais — la meme chaine servira au
    volet, au chat et a l'outil de l'assistant.
  - Detection de quiescence explicite : le silence seul ne suffit pas, une
    source en cours de chargement n'emet rien.
  
  Aucun impact sur les bundles publies : le module est app-side.

- [#636](https://github.com/bmatge/dsfr-data/pull/636) [`690d3c7`](https://github.com/bmatge/dsfr-data/commit/690d3c7e7e53cfe72569aad3dd74c54dd02ef06a) Thanks [@bmatge](https://github.com/bmatge)! - Diagnostic hors des apps : bundle autonome et outil MCP ([#608](https://github.com/bmatge/dsfr-data/issues/608)).
  
  - `dsfr-data.debug.js` (15 Ko) — une balise `<script>` ou un marque-page
    suffit a diagnostiquer n'importe quelle page utilisant dsfr-data, y compris
    en production, sans rebuild. Entree de build SEPAREE, jamais fusionnee aux
    bundles publies : un test-garde grepe les six bundles et verifie qu'aucun
    composant du coeur n'importe le collecteur.
  - Outil MCP `diagnose_widget_code` — analyse statique du balisage sans
    execution : attribut inconnu ou deprecie, balise inexistante, id manquant
    sur un composant qui reemet, amont declare mais absent, id duplique.
    L'autorite est `custom-elements.json`, genere depuis le code.
  
  Les bundles publies sont inchanges (memes tailles).

- [#636](https://github.com/bmatge/dsfr-data/pull/636) [`690d3c7`](https://github.com/bmatge/dsfr-data/commit/690d3c7e7e53cfe72569aad3dd74c54dd02ef06a) Thanks [@bmatge](https://github.com/bmatge)! - Outils de diagnostic pour l'assistant du Studio ([#607](https://github.com/bmatge/dsfr-data/issues/607)).
  
  L'assistant peut desormais OBSERVER l'apercu, pas seulement le composer :
  `run_and_trace` relance le rendu et rend le flux complet, `trace_pipeline`
  le relit sans relancer, `inspect_stage` creuse une etape.
  
  Il lit exactement le meme texte que l'utilisateur — `formatTrace()` est la
  fonction pivot des deux cotes — et le meme reglage de masquage des valeurs
  gouverne la copie, l'envoi et ce que recoit le modele.
  
  Deux reglages qui comptent :
  
  - budget de tours porte a 12 en mode diagnostic : une boucle de debogage fait
    au minimum observer -> hypothese -> correctif -> reobserver -> confirmer,
    et 8 coupait juste avant la verification ;
  - `run_and_trace` est explicitement exclu de l'anti-boucle : verifier qu'un
    correctif a fonctionne, c'est relancer la MEME observation.
  
  Le volet gagne une case « Masquer les valeurs », persistee : la trace part
  vers un service externe, l'utilisateur decide ce qui sort du navigateur.

- [#636](https://github.com/bmatge/dsfr-data/pull/636) [`690d3c7`](https://github.com/bmatge/dsfr-data/commit/690d3c7e7e53cfe72569aad3dd74c54dd02ef06a) Thanks [@bmatge](https://github.com/bmatge)! - Volet **Diagnostic** ([#605](https://github.com/bmatge/dsfr-data/issues/605)) et durcissement du bus de trace.
  
  - `app-diagnostic-panel` : tiroir bas present a l'identique dans toutes les
    apps, monte d'abord sur le Playground. Rail informatif (`3 etapes ·
    100 -> 8 lignes · 1 alerte`), trois onglets Flux / Champs / Journal,
    « Copier le diagnostic ».
  - `origin` est desormais renseigne par TOUS les emetteurs de commandes
    (search, facets, context, map-layer, pagination), plus seulement query.
  - Une etape en echec invalide ses donnees : l'aval ne rapporte plus le compte
    du dernier succes, et un afficheur ne se declare plus alimente sous une
    source tombee.
  - L'avertissement « agregation cote client » ne se declenche plus que si
    l'etape demande reellement un group-by ou une agregation.
  - `Trace.order` porte l'ordre topologique : des ids numeriques inversaient la
    lecture de `states` (les cles entieres passent en premier en JavaScript).
  - `StageNode.ambiguous` distingue l'id fabrique (le noeud n'emet pas) de l'id
    duplique (il emet, sous une cle partagee).
  - JSDoc `@fires` mis a jour et skills regenerees : l'assistant connait
    desormais `attemptedUrl` et `origin`.

- [#636](https://github.com/bmatge/dsfr-data/pull/636) [`690d3c7`](https://github.com/bmatge/dsfr-data/commit/690d3c7e7e53cfe72569aad3dd74c54dd02ef06a) Thanks [@bmatge](https://github.com/bmatge)! - Volet Diagnostic dans les sept apps dotees d'un apercu ([#606](https://github.com/bmatge/dsfr-data/issues/606)).
  
  Le montage est le meme partout, seul le mode change selon la facon dont
  chaque app rend :
  
  - **live / iframe** — Playground, Builder, Studio, Dashboard ;
  - **live / meme document** — Carto (`#map-canvas`) et Pipeline, qui
    instancient de vrais composants sans passer par une iframe ;
  - **rapporte** — Assistant IA, dont l'apercu ne passe par aucun composant
    dsfr-data et n'emet donc rien sur le bus ([#609](https://github.com/bmatge/dsfr-data/issues/609)).
  
  « Envoyer a l'assistant » depose le diagnostic en `sessionStorage` et ouvre
  l'Assistant IA, qui le pose dans son champ de chat — meme mecanisme de
  passation que le code entre apps. Dans le Studio, qui porte deja un chat,
  l'injection est directe.
  
  Sources, Favoris et Suivi ne recoivent pas le volet : ils ne rendent aucun
  pipeline dsfr-data.

### Patch Changes

- [#636](https://github.com/bmatge/dsfr-data/pull/636) [`690d3c7`](https://github.com/bmatge/dsfr-data/commit/690d3c7e7e53cfe72569aad3dd74c54dd02ef06a) Thanks [@bmatge](https://github.com/bmatge)! - Un filtre `where` à valeur textuelle produisait une requête tronquée, en silence.
  
  `filterToOdsql` entoure de guillemets **doubles** toute valeur non numérique — et
  les valeurs numériques aussi, pour `eq`, `neq`, `contains` et `in`. L'attribut étant
  lui-même à guillemets doubles, il n'était pas échappé :
  
  ```html
  where="region = "Bretagne""
  ```
  
  Le composant recevait `region = `. Requête invalide, aucun message. La forme
  concernée est celle que la documentation de l'assistant enseigne
  (« status:eq:active », « code_departement:eq:48 »).
  
  Le correctif est plus large que le symptôme : **toute** valeur d'attribut du
  générateur de l'Assistant IA et des widgets Grist est désormais échappée, comme le
  faisait déjà le générateur de la Carto sur chacun des siens. Cela corrige au passage
  une classe de défaut latente sur les URLs : les entités nommées historiques sont
  tolérées sans `;` dans une valeur d'attribut, si bien qu'une source
  `…?a=1&copy&b=2` était appelée avec un `©` à la place de `&copy`. (HTML5 exempte le
  cas où un `=` suit immédiatement, ce qui rend `&copy=2` inoffensif — la nuance
  importe pour tester la bonne forme.)
  
  `escapeHtml` accepte maintenant les nombres et les booléens : les gabarits posent des
  `pagination`, `max-items`, `zoom`, et forcer l'appelant à convertir d'abord, c'est
  l'inviter à oublier d'échapper. Son test de vacuité porte désormais sur `null`,
  `undefined` et la chaîne vide, plus sur la fausseté — `escapeHtml(0)` rendait `""`.

- [#636](https://github.com/bmatge/dsfr-data/pull/636) [`690d3c7`](https://github.com/bmatge/dsfr-data/commit/690d3c7e7e53cfe72569aad3dd74c54dd02ef06a) Thanks [@bmatge](https://github.com/bmatge)! - Le code généré par les Builders n'émet plus d'attributs dépréciés.
  
  `dsfr-data-list` accepte encore les alias français `colonnes`, `recherche`, `tri`,
  `filtres` et `server-tri`, `@deprecated` depuis [#300](https://github.com/bmatge/dsfr-data/issues/300). Ils existent pour ne pas casser
  le code déjà publié par les utilisateurs — pas pour être émis par un générateur.
  
  Deux des quatre variantes datalist de l'Assistant IA les émettaient encore, si bien
  qu'une même configuration produisait deux dialectes selon la source. Les Builders
  émettent désormais `columns` / `search` / `sort` partout.
  
  Au passage : `search` et `filters` ne sont plus émis sur les variantes à pagination
  serveur, **dans les deux Builders**. Ces deux contrôles sont locaux : ils n'opèrent
  que sur la page chargée, si bien que le composant les désactivait en journalisant un
  avertissement dans la page de l'utilisateur ([#304](https://github.com/bmatge/dsfr-data/issues/304)). Les émettre revenait à promettre
  deux contrôles qui n'apparaissaient pas. Le code généré indique désormais
  l'alternative — `dsfr-data-search server-search` et `dsfr-data-facets server-facets`
  en amont de la liste.
  
  L'exemple JSDoc de `dsfr-data-list` passe lui aussi aux attributs courants : il
  alimente la référence générée que consomme l'assistant IA, et l'y laisser déprécié
  revenait à enseigner au modèle de produire du code déprécié.

- [#636](https://github.com/bmatge/dsfr-data/pull/636) [`690d3c7`](https://github.com/bmatge/dsfr-data/commit/690d3c7e7e53cfe72569aad3dd74c54dd02ef06a) Thanks [@bmatge](https://github.com/bmatge)! - Un nom de colonne à apostrophe ne casse plus le script exporté.
  
  Les noms de champs étaient interpolés dans des littéraux JavaScript à guillemets
  simples des scripts générés — `label: '${valueField}'`, `d['${labelField}']`. Un
  en-tête de colonne français ordinaire suffisait :
  
  ```js
  const labels = data.map(d => d['Nombre d'habitants'] || 'N/A');
  //                                        ^ la chaîne se ferme ici
  ```
  
  Le générateur ne levait rien : le script mourait dans la page de l'utilisateur, sur
  une `SyntaxError` qu'il ne pouvait rattacher à son choix de colonne. Une dizaine de
  sites concernés dans les deux Builders.
  
  `escape-html.ts` couvre désormais les quatre contextes, et la distinction entre eux
  est le fond du sujet — une entité HTML posée en contexte JS produit un défaut
  *visible* plutôt qu'une balise cassée :
  
  | Contexte | Fonction |
  |---|---|
  | Attribut à guillemets simples, chaîne déjà sérialisée | `singleQuoteAttr` |
  | Attribut à guillemets simples, depuis la valeur | `jsonAttr` |
  | Valeur JSON dans un `<script>` | `jsonLiteral` |
  | Littéral chaîne dans un `<script>` | `jsStringLiteral` |
  
  `jsonLiteral` neutralise aussi `</script>` dans les données embarquées : le parseur
  HTML cherche la séquence sans connaître la syntaxe JavaScript, et une cellule
  contenant cette chaîne fermait le bloc. Corrigé également dans les widgets Grist.

- [#636](https://github.com/bmatge/dsfr-data/pull/636) [`690d3c7`](https://github.com/bmatge/dsfr-data/commit/690d3c7e7e53cfe72569aad3dd74c54dd02ef06a) Thanks [@bmatge](https://github.com/bmatge)! - `<app-layout-builder>` expose un attribut `mode` — `page-scroll` (defaut),
  `fullscreen`, `sticky-left` ([#613](https://github.com/bmatge/dsfr-data/issues/613)).
  
  Trois apps surchargeaient ses classes internes depuis leur propre CSS : le
  Playground avec des `!important` pour inverser le sticky, Builder et Assistant
  IA avec la meme surcharge dupliquee. Ces classes ne sont pas contractuelles —
  un changement du composant les cassait en silence.
  
  La hauteur de la colonne gauche en pile verticale devient une propriete CSS
  publique, `--app-layout-left-stacked-height`.

- [#636](https://github.com/bmatge/dsfr-data/pull/636) [`690d3c7`](https://github.com/bmatge/dsfr-data/commit/690d3c7e7e53cfe72569aad3dd74c54dd02ef06a) Thanks [@bmatge](https://github.com/bmatge)! - Un proxy mal configuré se signale, au lieu de se déguiser en problème de CSP.
  
  Quand `VITE_PROXY_URL` ne pointe pas sur l'origine qui sert la page, chaque appel
  sort de `connect-src 'self'` et se fait bloquer. La console n'affiche alors que des
  erreurs *Content-Security-Policy*, si bien qu'on soupçonne la CSP — qui fait pourtant
  exactement son travail.
  
  Cas réel : une instance servie depuis `x.lab.exemple.fr` avec
  `VITE_PROXY_URL=https://x.exemple.fr`, un sous-domaine oublié. Toutes les connexions
  de sources échouaient en `NetworkError`, et la piste suivie a été celle des en-têtes
  de sécurité.
  
  `getProxyConfig` avertit désormais une fois par page, en nommant les deux origines et
  la variable à corriger. Uniquement sur la branche build-time : les widgets embarqués
  sur un site tiers configurent leur proxy par attribut `proxy-url` ou
  `window.DSFR_DATA_PROXY`, et le cross-origin y est la configuration voulue.
  
  Il avertit, il ne corrige pas — basculer d'autorité sur l'origine de la page
  masquerait une configuration fausse et casserait les déploiements où les domaines sont
  séparés à dessein (`VITE_PROXY_URL_EMBED`).

- [#636](https://github.com/bmatge/dsfr-data/pull/636) [`690d3c7`](https://github.com/bmatge/dsfr-data/commit/690d3c7e7e53cfe72569aad3dd74c54dd02ef06a) Thanks [@bmatge](https://github.com/bmatge)! - Les données embarquées dans un attribut survivent aux apostrophes françaises.
  
  `JSON.stringify` échappe les guillemets doubles, jamais les simples : une étiquette
  ordinaire (« Provence-Alpes-Côte d'Azur », « Val-d'Oise », « Côte-d'Or ») fermait
  l'attribut à la première apostrophe. Le composant ne recevait qu'un fragment tronqué
  et n'affichait rien, sans message.
  
  Le motif était écrit à sept endroits avec cinq échappements différents. Trois
  fonctions partagées les remplacent, une par contexte :
  
  - `singleQuoteAttr` — chaîne déjà sérialisée dans un attribut à guillemets simples ;
  - `jsonAttr` — la même, à partir de la valeur ;
  - `jsStringLiteral` — littéral JavaScript pour un `<script>` généré.
  
  La distinction n'est pas cosmétique : poser une entité HTML en contexte JS produit
  un défaut *visible* plutôt qu'une balise cassée. `el.setAttribute('name', '&#039;')`
  affichait littéralement « Val-d&#039;Oise » dans la légende, `setAttribute` ne
  décodant pas les entités.
  
  Les deux échappements les plus répandus omettaient aussi l'esperluette : un `&amp;`
  présent dans la donnée était redécodé en `&` à la lecture de l'attribut.

- [#636](https://github.com/bmatge/dsfr-data/pull/636) [`690d3c7`](https://github.com/bmatge/dsfr-data/commit/690d3c7e7e53cfe72569aad3dd74c54dd02ef06a) Thanks [@bmatge](https://github.com/bmatge)! - Le jeu d'exemple « Regions de France » porte desormais des codes REGION
  INSEE (`code_region`) au lieu du departement chef-lieu de chaque region
  ([#610](https://github.com/bmatge/dsfr-data/issues/610)). Un jeu regional decrit par des codes departementaux etait incoherent,
  et une carte departementale n'en aurait colorie que 13 departements isoles.

- [#636](https://github.com/bmatge/dsfr-data/pull/636) [`690d3c7`](https://github.com/bmatge/dsfr-data/commit/690d3c7e7e53cfe72569aad3dd74c54dd02ef06a) Thanks [@bmatge](https://github.com/bmatge)! - Une source déjà paramétrée ne perd plus son agrégation.
  
  Les générateurs ajoutaient la chaîne de requête en concaténant `?` sans regarder si
  l'URL en avait déjà une. Sur une source OpenDataSoft paramétrée — et elles le sont
  couramment — cela produisait une seconde interrogation :
  
  ```
  …/records?refine=annee:2024?select=sum(pop) as value&group_by=region
  ```
  
  Le serveur lisait alors `refine` comme valant `annee:2024?select=…` et ignorait
  purement et simplement le `select` et le `group_by`. L'utilisateur recevait des
  données **brutes non agrégées**, dans un graphique qui s'affichait normalement.
  
  C'est le seul défaut de cette série à produire un résultat faux plutôt qu'un rendu
  vide ou un script mort — donc le seul qu'un coup d'œil ne rattrape pas. Quatre sites,
  deux Builders. Un helper `appendQuery` remplace la concaténation ; il préserve le
  fragment (`#…`) en queue.

## 0.20.0

### Minor Changes

- [#593](https://github.com/bmatge/dsfr-data/pull/593) [`8aa3cf2`](https://github.com/bmatge/dsfr-data/commit/8aa3cf21d186931823ef2aa91e1265a2f4e0e53d) Thanks [@bmatge](https://github.com/bmatge)! - Libelles INSEE Melodi resolus automatiquement ([#592](https://github.com/bmatge/dsfr-data/issues/592), volet B) : les jeux Melodi
  arrivaient en codes SDMX bruts (`AGE: "Y65T74"`, `GEO: "2025-DEP-01"`, `SEX: "M"`),
  inexploitables comme etiquettes d'axe. Les libelles officiels sont desormais charges
  depuis `/melodi/range/{idDataset}` et appliques aux valeurs — « De 65 a 74 ans »,
  « Ain », « Homme » — par les **deux** chemins d'import (composant et connexion API),
  qui produisent donc les memes colonnes. Le code d'origine est conserve dans une colonne
  `<DIMENSION>_CODE` pour les filtres, jointures et URL partagees, qui veulent une valeur
  stable. Les noms de colonnes restent les codes de dimension : ce sont des identifiants
  references par les configurations de graphiques enregistrees. Un appel par jeu, mis en
  cache en memoire ; libelles indisponibles = codes conserves, jamais d'erreur bloquante.

### Patch Changes

- [#593](https://github.com/bmatge/dsfr-data/pull/593) [`8aa3cf2`](https://github.com/bmatge/dsfr-data/commit/8aa3cf21d186931823ef2aa91e1265a2f4e0e53d) Thanks [@bmatge](https://github.com/bmatge)! - Deduplication du stockage local des sources ([#592](https://github.com/bmatge/dsfr-data/issues/592), volet A) : `SELECTED_SOURCE` ne
  persiste plus que le **pointeur** vers la source (descripteur sans les lignes), au lieu
  d'une seconde copie integrale des donnees deja presentes dans `SOURCES`. Un jeu de 2,7 Mo
  consommait ainsi ~5,4 Mo d'un quota localStorage d'environ 5 Mo, et l'ecriture etait
  refusee au-dela (toast « Espace de stockage plein », rendu visible par [#586](https://github.com/bmatge/dsfr-data/issues/586)). Nouveaux
  helpers partages `toSourcePointer()` / `resolveSelectedSource()` : les lignes sont
  rebranchees depuis `SOURCES` a la lecture, avec repli sur l'ancien format pour les
  entrees deja ecrites. `saveAsFavorite()` lit desormais l'etat memoire plutot que
  localStorage.

- [#600](https://github.com/bmatge/dsfr-data/pull/600) [`740b920`](https://github.com/bmatge/dsfr-data/commit/740b920e81ab3fafa40a1de5f9be2e3863fe9dd5) Thanks [@bmatge](https://github.com/bmatge)! - Diagnostic des erreurs de chargement masquées par CORS.
  
  Quand une API répond une erreur HTTP sans en-tête `Access-Control-Allow-Origin`, le navigateur
  interdit la lecture de la réponse et `fetch` rejette avec un `TypeError` générique : le statut et le
  corps, qui portent le vrai diagnostic, sont perdus. `dsfr-data-source` ne remontait qu'un
  « NetworkError » inexploitable.
  
  Le log console nomme désormais l'URL réellement appelée, distingue les deux causes possibles (erreur
  HTTP masquée ou requête non aboutie), propose la commande `curl` correspondante et rappelle que
  `use-proxy` / `proxy-url` rendent la réponse d'erreur lisible. L'objet `Error` remonté aux
  consommateurs (événement `data-error`, template de statut) est inchangé.

- [#599](https://github.com/bmatge/dsfr-data/pull/599) [`fbcbf04`](https://github.com/bmatge/dsfr-data/commit/fbcbf0417f50147e2ef02b09ff61417d0081fe45) Thanks [@bmatge](https://github.com/bmatge)! - Tabular : les group-by et agrégations délégués au serveur sont de nouveau acceptés par l'API data.gouv.
  
  L'API Tabular a durci son parser de query string : elle rejette désormais la forme valuée
  `colonne__groupby=` avec un 400 « Malformed query » et n'accepte que le flag nu
  `colonne__groupby`. L'adapter les sérialisait via `URLSearchParams`, qui ajoute toujours un `=`.
  Comme l'API n'émet pas d'en-tête CORS sur ses réponses d'erreur, le navigateur masquait ce 400
  derrière un `TypeError: NetworkError` — tout graphique Tabular avec agrégation restait vide.

- [#601](https://github.com/bmatge/dsfr-data/pull/601) [`c521efc`](https://github.com/bmatge/dsfr-data/commit/c521efcec354e53107aa6ce2202ffb0fd7812a8d) Thanks [@bmatge](https://github.com/bmatge)! - Tabular : les attributs `use-proxy` et `proxy-url` sont de nouveau pris en compte.
  
  L'adapter arbitrait le proxy dans sa résolution de base URL, qui rendait `base-url` en priorité et
  court-circuitait toute réécriture. Le Builder émettant toujours un `base-url`, le proxy était en
  pratique systématiquement ignoré sur ce provider — sans le moindre avertissement.
  
  L'URL cible est désormais construite puis passée à `getProxiedUrl` au moment du fetch, comme dans les
  adapters Grist, INSEE et OpenDataSoft.
  
  Changement de routage à connaître : un widget Tabular déployé avec un proxy configuré
  (`proxy-url`, `window.DSFR_DATA_PROXY` ou `VITE_PROXY_URL`) passe maintenant réellement par ce proxy,
  là où il appelait l'API en direct. Les instances self-hosted déclarées via `base-url` sur un autre
  hôte que `tabular-api.data.gouv.fr` restent en appel direct, inchangées.

## 0.19.0

### Minor Changes

- [#533](https://github.com/bmatge/dsfr-data/pull/533) [`0127a71`](https://github.com/bmatge/dsfr-data/commit/0127a718e950ab739468bcf7738888d838dcfc43) Thanks [@bmatge](https://github.com/bmatge)! - Bloc carte Leaflet multi-couches dans le modèle de document partagé ([#531](https://github.com/bmatge/dsfr-data/issues/531)) : widget `map` (`MapLayerSpec` marker/circle/heatmap/geoshape, multi-sources), export déterministe en `<dsfr-data-map>` + `<dsfr-data-map-layer>` (fit-bounds, encarts DROM, popup/tooltip, bascule automatique sur le bundle complet), et action `add_blocks`/`update_block` correspondante dans le Studio IA avec validation observe→corrige des couches (champs de coordonnées vérifiés contre les données). Le LLM n'écrit toujours jamais de HTML.

- [#584](https://github.com/bmatge/dsfr-data/pull/584) [`537f39c`](https://github.com/bmatge/dsfr-data/commit/537f39c763023812c4353123b3233b220ff29ee9) Thanks [@bmatge](https://github.com/bmatge)! - Carte : dépréciation des fonds CARTO, attribution des fonds personnalisés et politique de referrer explicite ([#576](https://github.com/bmatge/dsfr-data/issues/576))
  
  - Les presets `carto-positron` et `carto-dark` sont **dépréciés** et résolvent vers `ign-plan`
    avec un avertissement console. CARTO exige désormais une clé API sur ses basemaps et incruste
    un filigrane « API KEY REQUIRED » dans les tuiles servies sans clé — en HTTP 200, donc sans
    erreur détectable au runtime. La clé étant nominative et le service raster en cours de retrait
    chez CARTO, aucun mécanisme de clé côté bibliothèque n'aurait de sens. Les cartes déjà publiées
    qui chargent une version flottante du CDN sont réparées automatiquement.
  - Nouvel attribut **`tiles-attribution`** sur `<dsfr-data-map>` : une URL de tuiles personnalisée
    recevait jusqu'ici une attribution vide, ce qui rendait la carte non conforme à l'ODbL et aux
    CGU des fournisseurs. Un `console.warn` signale désormais son absence.
  - La **`referrerPolicy`** des tuiles est fixée explicitement à `strict-origin-when-cross-origin`.
    Leaflet n'en pose aucune par défaut : c'était la politique de la page hôte qui s'appliquait, et
    une page en `Referrer-Policy: no-referrer` supprimait l'en-tête `Referer` — ce que la Tile Usage
    Policy de l'OSMF interdit nommément, et ce dont les fournisseurs à quota se servent pour
    identifier le domaine appelant.

- [#535](https://github.com/bmatge/dsfr-data/pull/535) [`4ba9aef`](https://github.com/bmatge/dsfr-data/commit/4ba9aeff76dd8c7f83b7636965989b41f407891c) Thanks [@bmatge](https://github.com/bmatge)! - Export d'image PNG/JPG depuis les aperçus : bouton « Image » (menu PNG/JPG) dans le panneau d'aperçu des builders IA et classique, boutons dédiés dans le playground et le panneau des favoris. Capture du canvas de l'aperçu (direct ou dans l'iframe same-origin), composition sur fond blanc, nom de fichier dérivé du titre. Erreurs typées et expliquées : aperçu sans canvas (KPI/tableaux), canvas non capturable (tuiles de carte cross-origin). Pas d'export SVG : la chaîne de rendu (Chart.js) est raster — décision documentée dans le module.

- [#587](https://github.com/bmatge/dsfr-data/pull/587) [`05f9f9a`](https://github.com/bmatge/dsfr-data/commit/05f9f9a4305bb6582e0adac03871c443955addfc) Thanks [@bmatge](https://github.com/bmatge)! - Aplatissement des enregistrements imbriques des connexions API ([#586](https://github.com/bmatge/dsfr-data/issues/586))
  
  - Les jeux de donnees INSEE Melodi importes par une **connexion API** arrivaient non deplies :
    chaque observation gardait ses blocs `attributes` / `dimensions` / `measures`, affiches
    `[object Object]` dans les tables et inexploitables par les builders. Le chemin composant
    (`<dsfr-data-source adapter="insee">`) aplatissait deja correctement ; les deux routes
    partagent desormais la meme fonction et produisent les memes noms de colonnes.
  - `ProviderConfig.response` accepte une strategie d'aplatissement (`flattenRecord`, ou
    `nestedDataKey` pour une simple cle d'enveloppe comme `fields` chez Grist). Les champs
    `requiresFlatten` et `nestedDataKey` etaient declares depuis des mois sans aucun
    consommateur : `flattenProviderRecords()` est le consommateur manquant.
  - Effet de bord mesure : une observation INSEE aplatie occupe 277 octets contre 337 bruts,
    soit **18 % de stockage local en moins**.
  - Depassement de quota `localStorage` : les ecritures de la source selectionnee contournaient
    le helper garde-fou et echouaient sans rien signaler. Elles passent par `saveToStorageQuiet`,
    qui remonte desormais l'evenement `dsfr-data:storage-quota` avec la taille refusee, et le
    message indique le volume en cause au lieu d'un « espace plein » muet.

- [#527](https://github.com/bmatge/dsfr-data/pull/527) [`d82d42c`](https://github.com/bmatge/dsfr-data/commit/d82d42c928265a0380557d53550eddebe4711dff) Thanks [@bmatge](https://github.com/bmatge)! - Modèle de document multi-blocs partagé et export vivant ([#515](https://github.com/bmatge/dsfr-data/issues/515), étape 1) : le modèle du dashboard (`DashboardData`/`Widget`) et la `ChartConfig` du builder-IA sont promus dans `@dsfr-data/shared`, étendus d'un widget graphique `fromBuilder` (ChartConfig complète), d'un widget `filters` (filtres partagés) et d'un `sourceId` par widget. Le nouvel export partagé génère une page DSFR autonome et vivante : balises `dsfr-data-source` (données embarquées ou connexion API), pipelines `dsfr-data-query` (where/agrégation/tri, alias `field__fn`), et filtres partagés en selects DSFR + `dsfr-data-context`/`-tags`.

- [#588](https://github.com/bmatge/dsfr-data/pull/588) [`1e938a4`](https://github.com/bmatge/dsfr-data/commit/1e938a4d7805ba4496e670d747e4ce2a09b2d6f3) Thanks [@bmatge](https://github.com/bmatge)! - Attribut `split` sur `<dsfr-data-normalize>` : champs multivalues -> tableaux
  
  - Les colonnes multivaluees livrees sous forme de chaine avec separateur (`group_concat` SQL
    Grist, CSV « a|b|c ») etaient vues par `<dsfr-data-facets>` comme une valeur unique : la
    facette affichait des boutons combines « Sortie du fioul|Planification de la sortie du gaz ».
  - `split="Axes:|, Operateurs:|, Cibles:;"` decoupe ces champs en vrais tableaux (elements
    trimes, vides ecartes, chaine vide = tableau vide), comme une ChoiceList Grist. Separateur par
    defaut : la virgule (`split="Tags"`). S'applique apres `replace` et avant `numeric`/`rename`.
  - Aucun changement dans `dsfr-data-facets`, qui traite deja les cellules tableau ([#421](https://github.com/bmatge/dsfr-data/issues/421)) :
    une valeur par element, filtrage par intersection, modes select/multiselect.

- [#529](https://github.com/bmatge/dsfr-data/pull/529) [`9e83388`](https://github.com/bmatge/dsfr-data/commit/9e8338868571ae42728f64c43048a574a25503e2) Thanks [@bmatge](https://github.com/bmatge)! - Studio IA ([#515](https://github.com/bmatge/dsfr-data/issues/515), étape 2) : nouvelle app `apps/studio` — assistant de composition de dashboards multi-blocs (chat + aperçu vivant). Le LLM édite le document par actions incrémentales batchables (add_blocks/update_block/remove_block/move_block/set_page/reset_document) validées par diagnostic ; l'aperçu est la page exportée elle-même (iframe srcdoc) ; le document s'enregistre dans les dashboards partagés. Promotions dans `@dsfr-data/shared` : data-tools (introspection), skill-matching ([#514](https://github.com/bmatge/dsfr-data/issues/514), source unique), vocabulaire/schéma JSON de la ChartConfig — le builder-IA les re-exporte sans changement d'API.

### Patch Changes

- [#548](https://github.com/bmatge/dsfr-data/pull/548) [`cd3312f`](https://github.com/bmatge/dsfr-data/commit/cd3312f4d8fc0b5b92cb28515332ccd7f7f749f8) Thanks [@bmatge](https://github.com/bmatge)! - Export d'image v2 : capture DOM fidèle du bloc d'aperçu complet (titre, graphique, légende, mention de source) via html-to-image, au lieu du canvas nu — un camembert exporté a désormais sa légende. Bonus : les aperçus sans canvas (KPI, tableaux, podiums) deviennent exportables. Rendu 2x sur fond blanc ; erreurs expliquées (aperçu vide, ressources non capturables).

- [#557](https://github.com/bmatge/dsfr-data/pull/557) [`b71150b`](https://github.com/bmatge/dsfr-data/commit/b71150bb7704d76d6105964c7b9b8630ba84a03d) Thanks [@bmatge](https://github.com/bmatge)! - Visite guidée du tableau de bord : l'étape « Barre d'actions » cible désormais `<app-action-bar>` (epic UX [#546](https://github.com/bmatge/dsfr-data/issues/546), lot 2).

- [#552](https://github.com/bmatge/dsfr-data/pull/552) [`46e5d53`](https://github.com/bmatge/dsfr-data/commit/46e5d53f61a5e49406b1f6c4387b45a0b2da11ef) Thanks [@bmatge](https://github.com/bmatge)! - Libellés d'interface alignés sur le lexique canonique (`docs/ux/actions.md`, epic UX [#546](https://github.com/bmatge/dsfr-data/issues/546) lot 3) : accents restaurés dans les tours guidés et l'annonce « Détail » de `dsfr-data-map-popup` ; référence des skills générée avec les mots accentués (« Référence », « Rôle pipeline », « Défaut », « Méthodes », « Événements »).

- [#563](https://github.com/bmatge/dsfr-data/pull/563) [`6e732c6`](https://github.com/bmatge/dsfr-data/commit/6e732c64e745eed37624cecb8101ce8bacd67588) Thanks [@bmatge](https://github.com/bmatge)! - Visite guidée : les boutons du popover (Fermer, Passer, Ne plus afficher, Précédent, Suivant) sont des `fr-btn` DSFR — plus de couleurs en dur ni de `!important` (epic UX [#546](https://github.com/bmatge/dsfr-data/issues/546), lot 5).

- [#562](https://github.com/bmatge/dsfr-data/pull/562) [`d042926`](https://github.com/bmatge/dsfr-data/commit/d04292604f8c915fc41cb0c0d9ff2ea64347e03b) Thanks [@bmatge](https://github.com/bmatge)! - ConfirmDialog partagé (`confirmDialog(message, options?)`) : `role="alertdialog"`, confirmation en primaire danger portant le verbe de l'action, focus initial sur Annuler, Échap capturé et focus restitué au déclencheur (epic UX [#546](https://github.com/bmatge/dsfr-data/issues/546), lot 6).

- [#564](https://github.com/bmatge/dsfr-data/pull/564) [`b67ffe8`](https://github.com/bmatge/dsfr-data/commit/b67ffe868e7d327d0055a0368d9c20537eae3e1a) Thanks [@bmatge](https://github.com/bmatge)! - Visites guidées Pipeline et Studio IA ajoutées au TourService partagé et au registre (epic UX [#546](https://github.com/bmatge/dsfr-data/issues/546), lot 7).

## 0.18.0

### Minor Changes

- [#516](https://github.com/bmatge/dsfr-data/pull/516) [`97de25d`](https://github.com/bmatge/dsfr-data/commit/97de25d4f1683899f7d0374c5de36dbc47bda963) Thanks [@bmatge](https://github.com/bmatge)! - Référence des composants générée depuis le code ([#512](https://github.com/bmatge/dsfr-data/issues/512))
  
  Le package publie désormais un **custom-elements manifest** (`custom-elements.json`,
  champ `customElements` du `package.json`) : les éditeurs qui le lisent (VS Code,
  JetBrains) offrent l'autocomplétion et la documentation des attributs sur les balises
  `dsfr-data-*` dans le HTML.
  
  Le manifeste est produit par `@custom-elements-manifest/analyzer` à partir du JSDoc des
  composants, complété pour l'occasion : les **264 attributs** des 23 composants ont
  maintenant une description, les aliases dépréciés sont signalés comme tels, et les
  événements (`@fires`), slots (`@slot`) et variables CSS (`@cssprop`) sont documentés.
  
  Côté connaissance IA (builder-IA et serveur MCP), la section « référence » de chaque
  skill de composant est générée depuis ce manifeste — donc exhaustive par construction —
  au lieu d'être rédigée à la main. Les événements du pipeline sont déduits du mixin porté
  par le composant, ce qui comble le manque principal : la connaissance ne décrivait aucun
  événement, aucun slot et aucune variable CSS.
  
  Aucun changement de comportement des composants.

- [#501](https://github.com/bmatge/dsfr-data/pull/501) [`7528946`](https://github.com/bmatge/dsfr-data/commit/7528946c7d28d552cf50d2c55be3854f3b012679) Thanks [@bmatge](https://github.com/bmatge)! - Retrait de `dsfr-data-world-map` (déprécié depuis la v0.13, epic [#402](https://github.com/bmatge/dsfr-data/issues/402)) : utiliser `<dsfr-data-chart type="map-monde">` (API cartes unifiée DSFR Chart 2.1). L'export `dsfr-data/world-map` et les bundles `dsfr-data.world-map.{esm,umd}.js` disparaissent, ainsi que les dépendances d3-geo / topojson-client / world-atlas et l'asset `dist/data/world-countries-110m.json`. La conversion ISO a3/num → a2 (`toIsoA2`) et les échelles `CHOROPLETH_SCALES` sont conservées. Changement cassant assumé en phase 0.x (pré-1.0), publié en minor.

## 0.17.0

### Minor Changes

- [#489](https://github.com/bmatge/dsfr-data/pull/489) [`bb4dffe`](https://github.com/bmatge/dsfr-data/commit/bb4dffea6124fbc9b650d25d8ea8ca626cc89f65) Thanks [@bmatge](https://github.com/bmatge)! - `dsfr-data-facets` : support des champs multi-valeurs (tableaux / ChoiceList
  Grist) en filtrage client ([#421](https://github.com/bmatge/dsfr-data/issues/421)). Une cellule tableau est désormais traitée
  par intersection avec la sélection (au lieu d'être stringifiée « a,b » et de
  ne jamais matcher), chaque élément compte dans son groupe de facettes (y
  compris les comptes croisés), et l'auto-détection retient les champs tableaux
  de chaînes.

### Patch Changes

- [#472](https://github.com/bmatge/dsfr-data/pull/472) [`2b50471`](https://github.com/bmatge/dsfr-data/commit/2b50471d6208fa9216686b8fb0d40684609e23f1) Thanks [@bmatge](https://github.com/bmatge)! - Builder carto : refonte « carte plein écran » — la carte générée devient l'aperçu permanent (cadrage exporté synchronisé sur la navigation), édition dans trois panneaux flottants (Carte / Couches / Éléments), modale d'onboarding pour le choix des données, modale d'export dédiée, vignettes d'encarts territoriaux visibles dans l'aperçu. Tour guidé partagé réaligné sur la nouvelle interface (v2).

- [#487](https://github.com/bmatge/dsfr-data/pull/487) [`170132b`](https://github.com/bmatge/dsfr-data/commit/170132b6d3a932f2b5c1316753442f0bf951be38) Thanks [@bmatge](https://github.com/bmatge)! - Fixes recette carto [#482](https://github.com/bmatge/dsfr-data/issues/482) (côté lib) :
  
  - `dsfr-data-source` (mode URL) : l'enveloppe Grist `{ id, fields }` est
    désormais aplatie comme en mode adapter — les colonnes réelles redeviennent
    visibles pour l'aval (cartes, datalists, compagnons) [bug 1].
  - `dsfr-data-map-layer` : une géométrie invalide n'interrompt plus le rendu de
    la couche (« Invalid GeoJSON object ») — ligne ignorée, comptée et résumée en
    console [bug 3].
  - `dsfr-data-map-layer` (heatmap) : intensité normalisée (`max` = intensité
    maximale réelle, `maxZoom` = zoom courant) — la couche Chaleur était rendue
    quasi invisible (alpha ≈ 5 %) [bug 4].
  - `dsfr-data-map-layer` : le groupe de clusters est retiré de la carte quand le
    clustering est désactivé (plus de bulles résiduelles après un changement de
    représentation), et les changements d'attributs visuels (type, couleur,
    rayon…) redessinent la couche en place [bug 6].
  - `dsfr-data-map-layer` : nouvelle méthode `getRenderedCount()` — compte réel
    d'éléments dessinés (clusters et heatmap compris) pour les diagnostics
    [bug 7].
  - `dsfr-data-map` : la carte observe désormais toute variation de taille de son
    conteneur et recale Leaflet (`invalidateSize`) — plus de bande de tuiles non
    chargées après un redimensionnement [bug 14].

## 0.16.2

### Patch Changes

- [#462](https://github.com/bmatge/dsfr-data/pull/462) [`4d20709`](https://github.com/bmatge/dsfr-data/commit/4d207091a4eee8c4d41f8a5a4517174b73fefc16) Thanks [@bmatge](https://github.com/bmatge)! - `@dsfr-data/shared` : export de `saveToStorageQuiet` dans le barrel applicatif (persistance d'état du builder carto, sans déclencher le hook de synchronisation API). Aucun impact sur les composants `dsfr-data-*`.

## 0.16.1

### Patch Changes

- [#452](https://github.com/bmatge/dsfr-data/pull/452) [`49fde53`](https://github.com/bmatge/dsfr-data/commit/49fde531c36ecd172df7d88f23854b41f2b3353e) Thanks [@bmatge](https://github.com/bmatge)! - Documentation : ajout du README npm du package (la page npmjs était vide) et correction de docstrings — exemples de `dsfr-data-kpi-group` migrés vers la grammaire `value="champ:fn"`, opérateurs de date documentés sur `operator` de `dsfr-data-context-filter`.

- [#452](https://github.com/bmatge/dsfr-data/pull/452) [`49fde53`](https://github.com/bmatge/dsfr-data/commit/49fde531c36ecd172df7d88f23854b41f2b3353e) Thanks [@bmatge](https://github.com/bmatge)! - Licence : ajout du fichier LICENSE (MIT) manquant — il est désormais publié avec le package npm. La licence déclarée reste MIT, comme le DSFR et DSFR Chart.

- [#455](https://github.com/bmatge/dsfr-data/pull/455) [`b9addab`](https://github.com/bmatge/dsfr-data/commit/b9addab9c7a2bcadcc5f8df657b5f9c4949970db) Thanks [@bmatge](https://github.com/bmatge)! - Retrait de la cible desktop Tauri (ADR-070, [#403](https://github.com/bmatge/dsfr-data/issues/403)) : suppression de `src-tauri/`, du workflow « Release Tauri » et de l'export interne `isTauriMode()` de `@dsfr-data/shared` (le proxy ne distingue plus que dev/production). Aucun composant `dsfr-data-*` n'est affecté ; les binaires desktop historiques restent sur les releases GitHub jusqu'à v0.16.0.

## 0.16.0

### Minor Changes

- [#449](https://github.com/bmatge/dsfr-data/pull/449) [`588b4d6`](https://github.com/bmatge/dsfr-data/commit/588b4d6157239fc993651db49c7b3a01b5056fa3) Thanks [@bmatge](https://github.com/bmatge)! - `dsfr-data-kpi` (et la famille `formatValue` partagée) : nouveau format `compact` — notation compacte fr-FR (`14 785 684` → « 14,8 M », `6 676` → « 6,7 k ») pour les grands chiffres des tuiles KPI.

## 0.15.1

### Patch Changes

- [#446](https://github.com/bmatge/dsfr-data/pull/446) [`ca85ca2`](https://github.com/bmatge/dsfr-data/commit/ca85ca2040032a761e7021c06c8396cbeb35f5d3) Thanks [@bmatge](https://github.com/bmatge)! - `dsfr-data-map-layer` : une couche décorative (`no-interactive`) n'enregistre plus son emprise dans le `fit-bounds` de la carte — un fond de contours administratifs (France entière) empêchait le zoom automatique de suivre les données filtrées.

## 0.15.0

### Minor Changes

- [#443](https://github.com/bmatge/dsfr-data/pull/443) [`0f3a0be`](https://github.com/bmatge/dsfr-data/commit/0f3a0bed6b34002a30568988a73d2d09e1cbc24d) Thanks [@bmatge](https://github.com/bmatge)! - `dsfr-data-map-layer` : nouveaux attributs `shape-class` (classe CSS sur les tracés SVG — permet des motifs hachurés via un `<pattern>` défini par la page) et `no-interactive` (couche décorative sans clic/tooltip/popup — contours administratifs, habillage). `dsfr-data-kpi` : valeur littérale avec le préfixe `=` (`value="=667"`, `value="=87 %"`) affichée telle quelle, sans dépendre d'une source — pour les chiffres validés à la main.

## 0.14.3

### Patch Changes

- [#441](https://github.com/bmatge/dsfr-data/pull/441) [`bdf1bf8`](https://github.com/bmatge/dsfr-data/commit/bdf1bf8a44f32e2950b2ae1bd00ef8cbc1085417) Thanks [@bmatge](https://github.com/bmatge)! - `dsfr-data-map` : le `fit-bounds` s'applique sans animation — le zoom animé de Leaflet était régulièrement annulé (re-rendu des couches, compagnons hors-carte) et laissait la vue inchangée après un filtrage multiselect.

## 0.14.2

### Patch Changes

- [#439](https://github.com/bmatge/dsfr-data/pull/439) [`1973b0a`](https://github.com/bmatge/dsfr-data/commit/1973b0a1032064e51a99d32f9348af4e7af7a18b) Thanks [@bmatge](https://github.com/bmatge)! - `dsfr-data-map` : combiné à `max-bounds`, `fit-bounds` clippe désormais l'emprise des données à la zone d'intérêt avant d'ajuster la vue — un jeu incluant des territoires lointains (DROM) ne dézoome plus la carte au monde entier, et des données filtrées entièrement hors zone laissent la vue en place (les encarts s'en chargent). `dsfr-data-map-layer` libère ses bounds quand un filtre amont le vide (l'ancienne emprise ne fausse plus les ajustements suivants). Résultat : `fit-bounds max-bounds="…"` + `dsfr-data-facets` = zoom automatique sur la région sélectionnée.

## 0.14.1

### Patch Changes

- [#436](https://github.com/bmatge/dsfr-data/pull/436) [`6a2d797`](https://github.com/bmatge/dsfr-data/commit/6a2d7978385fb9d1887cdb24905646b7275d1906) Thanks [@bmatge](https://github.com/bmatge)! - `dsfr-data-map-popup` : la molette sur le volet latéral scrolle le volet au lieu de zoomer la carte (isolation des événements wheel/dblclick/mousedown/touch du panel, ancré dans le conteneur Leaflet depuis la 0.14.0). La sélection de texte dans le volet ne déclenche plus un déplacement de la carte.

## 0.14.0

### Minor Changes

- [#431](https://github.com/bmatge/dsfr-data/pull/431) [`d468e32`](https://github.com/bmatge/dsfr-data/commit/d468e32daae2a2a588f0be21c1372e9872deb280) Thanks [@bmatge](https://github.com/bmatge)! - Nouveau composant `dsfr-data-map-inset` : encarts territoriaux (DROM, COM, Corse...) pour `dsfr-data-map`. Chaque encart rend une mini-carte verrouillée qui réutilise automatiquement les couches ET le popup de la carte hôte — un clic dans l'encart ouvre le volet/la modale de la carte principale (template unique). 12 territoires prédéfinis (`territory="guadeloupe"`, `"nouvelle-caledonie"`...) surchargeables par `center`/`zoom`/`label`, et raccourci `insets="drom"` / `insets="drom,corse"` sur `dsfr-data-map` qui génère les encarts.

  `dsfr-data-map` : nouvel attribut `locked` (carte sans aucune interaction — encarts, vignettes). La hauteur fixe s'applique désormais au conteneur Leaflet plutôt qu'au host (le host s'étend pour accueillir les compagnons hors-carte) et le panel de `dsfr-data-map-popup` s'ancre sur ce conteneur — rendu identique pour les pages existantes.

- [#430](https://github.com/bmatge/dsfr-data/pull/430) [`79f20d4`](https://github.com/bmatge/dsfr-data/commit/79f20d4fa689455ab0bda85e6d6fa88982d81cf9) Thanks [@bmatge](https://github.com/bmatge)! - dsfr-data-map : nouveaux fonds de carte et correction d'ign-topo ([#429](https://github.com/bmatge/dsfr-data/issues/429))

  - Nouveaux presets `tiles` sans clé API : `carto-positron` et `carto-dark` (CARTO, fonds sobres idéaux pour la dataviz), `opentopomap` (carte topographique communautaire) et `osm-standard` (tuiles OpenStreetMap.org), chacun avec l'attribution requise.
  - `ign-topo` est déprécié : la couche Géoplateforme `GEOGRAPHICALGRIDSYSTEMS.MAPS.BDUNI.J1` rendait un fond quasi vide et les couches topographiques SCAN exigent une clé API. Le preset redirige désormais vers `ign-plan` avec un `console.warn` explicite — les pages existantes ne cassent pas.
  - La frontière `sovereign-only` reste inchangée (presets IGN uniquement, fallback `ign-plan`) ; les nouveaux presets y sont refusés avec avertissement.

## 0.13.0

### Minor Changes

- [#427](https://github.com/bmatge/dsfr-data/pull/427) [`36ded24`](https://github.com/bmatge/dsfr-data/commit/36ded24cc1d0d5e98817daf94d1f5551f39ac7ba) Thanks [@bmatge](https://github.com/bmatge)! - `dsfr-data-map-layer` : `geo-field` accepte désormais les géométries GeoJSON sérialisées en chaîne (colonnes Text Grist, CSV/Tabular) — parse JSON mémoïsé appliqué à la résolution de géométrie (geoshape, coordonnées Point, filtrage bbox client et auto-détection `geo_shape`/`geometry`) ([#426](https://github.com/bmatge/dsfr-data/issues/426)).

  `dsfr-data-map-popup` : les templates supportent les mêmes expressions que `dsfr-data-display` — `{{champ:number}}` (format fr-FR), `{{champ|défaut}}`, chemins imbriqués — via un résolveur partagé ; les valeurs restent systématiquement échappées.

### Patch Changes

- [#410](https://github.com/bmatge/dsfr-data/pull/410) [`344e929`](https://github.com/bmatge/dsfr-data/commit/344e929db0a4793055c75cd155673b80069b934f) Thanks [@bmatge](https://github.com/bmatge)! - `dsfr-data-query` : l'`order-by` (et le group-by/where) n'est plus délégué en
  tri serveur quand la chaîne entre la query et la source qui fetch contient un
  transformateur qui crée ou renomme des colonnes — `dsfr-data-unpivot`
  (toujours) ou `dsfr-data-normalize` avec `rename`/`compute`/`flatten`/
  `lowercase-keys`. Les opérations de la query s'expriment dans le schéma
  POST-transformation : les pousser au serveur envoyait des noms de colonnes
  inconnus de l'API (Grist Records : `?sort=annee` → 500 `unknown key`) et
  mettait la source partagée en erreur pour tous ses abonnés. Le tri s'exécute
  désormais côté client, sur les données transformées ([#394](https://github.com/bmatge/dsfr-data/issues/394)). Nouveau hook
  optionnel `transformsSchema()` sur le contrat `SourceElement`.

## 0.12.0

### Minor Changes

- [#404](https://github.com/bmatge/dsfr-data/pull/404) [`74aeed9`](https://github.com/bmatge/dsfr-data/commit/74aeed911e6ceb32df8e52c344cb7a06a5913d8d) Thanks [@bmatge](https://github.com/bmatge)! - Nouveaux types de cartes `map-aca` (académies, clés = noms en majuscules) et `map-monde` (mondiale, clés ISO 3166-1 — les codes alpha-3 et numériques sont convertis automatiquement en alpha-2 via `toIsoA2`) sur `dsfr-data-chart`, apportés par l'API cartes unifiée `<map-chart level>` de DSFR Chart 2.1. `dsfr-data-world-map` est déprécié au profit de `type="map-monde"` (warn console ; retrait prévu à la prochaine version majeure, [#402](https://github.com/bmatge/dsfr-data/issues/402)).

- [#408](https://github.com/bmatge/dsfr-data/pull/408) [`b1e7891`](https://github.com/bmatge/dsfr-data/commit/b1e7891e873c82562e2871da4b313efef1325616) Thanks [@bmatge](https://github.com/bmatge)! - `<dsfr-data-chart type="radar">` : support des attributs `y-min` / `y-max` pour borner l'échelle radiale (issue maturity-model#9). Sans borne, `scales.r` de Chart.js s'auto-ajuste au min/max des données — le minimum se retrouve au centre du radar, ce qui est trompeur. Les bornes sont relayées à l'API upstream `scale-min`/`scale-max` de `<radar-chart>` (suggestedMin/Max, baseline déclarative), puis affinées post-montage sur l'instance Chart.js : bornes dures `scales.r.min`/`max`, et `ticks.stepSize: 1` (anneaux de grille entiers) quand les deux bornes sont entières avec une amplitude de 1 à 10. Comportement inchangé sans `y-min`/`y-max` et pour les autres types.

### Patch Changes

- [#404](https://github.com/bmatge/dsfr-data/pull/404) [`74aeed9`](https://github.com/bmatge/dsfr-data/commit/74aeed911e6ceb32df8e52c344cb7a06a5913d8d) Thanks [@bmatge](https://github.com/bmatge)! - Alignement DSFR Chart 2.1.x (correctifs) : la DataBox pose désormais `name` (renommage upstream de `title` en 2.1.0 — les titres de DataBox étaient invisibles en preview/prod) tout en conservant `title` pour les hôtes 2.0.x ; les types `map` et `map-reg` routent vers `<map-chart level="dep|reg">` (API cartes unifiée), ce qui corrige la limitation connue de la carte régionale nationale (`<map-chart-reg>` sans `region`).

## 0.11.1

### Patch Changes

- [#392](https://github.com/bmatge/dsfr-data/pull/392) [`fa5b74b`](https://github.com/bmatge/dsfr-data/commit/fa5b74b5b391167a1d07882a9d20b77f9b0b7419) Thanks [@bmatge](https://github.com/bmatge)! - SSO silencieux OIDC (`prompt=none`, [#365](https://github.com/bmatge/dsfr-data/issues/365)) : si un provider OIDC est configuré
  et que la session IdP est active, l'utilisateur est loggué sans clic au
  chargement de l'app (une tentative max par session navigateur, aucun message
  en l'absence de session IdP). Le callback revient sur la page d'origine via
  un `return_to` strictement validé (chemin relatif uniquement). Désactivable
  côté app via `initAuth({ silentSso: false })`.

## 0.11.0

### Minor Changes

- [#389](https://github.com/bmatge/dsfr-data/pull/389) [`726d660`](https://github.com/bmatge/dsfr-data/commit/726d660bff0990cff5616f76faf96cf39fed0f8f) Thanks [@bmatge](https://github.com/bmatge)! - `dsfr-data-chart` : cibles / objectifs futurs sur les courbes (`targets`, [#377](https://github.com/bmatge/dsfr-data/issues/377)).
  Trois nouveaux attributs pour les types `line` et `bar-line` : `targets` (JSON —
  échéance, valeur, série, libellé, couleur), `targets-zone` (bande future grisée +
  frontière réalisé/projeté, `"off"` pour désactiver) et `targets-legend` (légende
  « Données historiques / Trajectoire, cible extrapolée », masquable ou
  personnalisable). L'axe X est étendu automatiquement quand l'échéance dépasse
  les données (séries paddées à `null` : trait plein jusqu'au dernier point réel,
  trajectoire pointillée vers un losange à l'échéance), les bornes Y s'élargissent
  si nécessaire, un tooltip DSFR groupé par échéance s'affiche au survol des
  losanges et les cibles sont annoncées dans l'aria-label. Le pipeline d'overlay
  de `reference-lines` ([#341](https://github.com/bmatge/dsfr-data/issues/341)) est généralisé (un seul rAF/ResizeObserver/cleanup
  pour les deux familles) sans modifier `chart-reference-lines.ts`.

### Patch Changes

- [#383](https://github.com/bmatge/dsfr-data/pull/383) [`34efcd1`](https://github.com/bmatge/dsfr-data/commit/34efcd10c6bed9cb8443c21bb70f13b2ae83245c) Thanks [@bmatge](https://github.com/bmatge)! - Sécurité (CodeQL) : corrige une regex à backtracking polynomial (ReDoS) dans la
  détection des permaliens Tabular — le préfixe libre `[^?#]*` est remplacé par un
  préfixe de locale optionnel `(?:[a-z]{2}/)?`. Au passage, les permaliens
  data.gouv.fr modernes sans locale (`data.gouv.fr/datasets/r/{uuid}`) sont
  désormais reconnus.

- [#388](https://github.com/bmatge/dsfr-data/pull/388) [`7117f32`](https://github.com/bmatge/dsfr-data/commit/7117f32e81b132d676592ade29e8369f4485af03) Thanks [@bmatge](https://github.com/bmatge)! - `dsfr-data-kpi` : nouvel attribut canonique `color-token` (token sémantique DSFR
  `vert|orange|rouge|bleu`), remplaçant `color` dont le nom évoquait l'attribut de
  présentation HTML déprécié (faux positif d'audit RGAA 10.1.2). `color` reste
  supporté comme alias déprécié (warning console, retrait prévu à la prochaine
  version majeure) ; `color-token` prime quand les deux sont présents. Doc,
  exemples et skill builder-IA migrés ([#367](https://github.com/bmatge/dsfr-data/issues/367)).

## 0.10.0

### Minor Changes

- [#349](https://github.com/bmatge/dsfr-data/pull/349) [`4e89203`](https://github.com/bmatge/dsfr-data/commit/4e89203fa9621887795693667944a0728088b453) Thanks [@bmatge](https://github.com/bmatge)! - Nouvel element `<dsfr-data-beacon url="...">` ([#345](https://github.com/bmatge/dsfr-data/issues/345)) : cible telemetrie **declarative**, pendant cote telemetrie de `proxy-url` ([#340](https://github.com/bmatge/dsfr-data/issues/340)). Rend la collecte d'usage **visible et retirable** dans le HTML au lieu d'un `window.*` opaque — un integrateur voit qu'une telemetrie part et vers ou (et peut la retirer), un operateur souverain (ministère…) la pointe vers son propre collecteur sans toucher au JS de la page. La presence d'un element avec `url` non vide vaut **opt-in** ET fournit l'URL de collecte. Precedence : element `url` > `window.DSFR_DATA_BEACON_URL` > URL bakee au build ; `window.DSFR_DATA_BEACON = false` reste un **kill switch** qui neutralise meme un element present. L'element est invisible, n'emet aucun beacon lui-meme et vit dans le bundle **core** ; consulte en lookup paresseux (+ micro-defer) au moment de l'envoi, son ordre dans le DOM est indifferent. Off par defaut : sans element ni global, rien ne change.

## 0.9.0

### Minor Changes

- [#347](https://github.com/bmatge/dsfr-data/pull/347) [`54f48b9`](https://github.com/bmatge/dsfr-data/commit/54f48b99e303ab58a2f5fd977af8b8f426e43d8c) Thanks [@bmatge](https://github.com/bmatge)! - dsfr-data-chart : lignes de référence (verticale/horizontale) avec libellé ([#341](https://github.com/bmatge/dsfr-data/issues/341)).

  - Nouvel attribut `reference-lines` (JSON) : superpose des repères sur les
    graphiques **cartésiens** (line, bar, bar-line, scatter). Chaque item :
    `{ axis: "x"|"y", value, label?, color?, dash?, position? }`. `axis:"x"` trace
    une ligne **verticale** à une catégorie/date ; `axis:"y"` une ligne
    **horizontale** à un seuil. Couleur par défaut rouge DSFR, pointillé par
    défaut, libellé en pastille.
  - Rendu via un **overlay SVG** dans le wrapper du chart (`pointer-events:none`,
    `aria-hidden`), positionné depuis l'instance Chart.js de `@gouvfr/dsfr-chart`
    (récupérée en interne, sans fork de la lib tierce). Repositionnement au resize
    (`ResizeObserver`), nettoyage au démontage.
  - Accessibilité : les repères sont relayés dans l'`aria-label` du graphique.
  - Types non cartésiens (pie, gauge, radar, map…) ou JSON invalide : signalés via
    `data-dsfr-config-error`, le rendu du graphique reste intact (dégradation
    gracieuse si l'instance Chart.js est introuvable).

- [#326](https://github.com/bmatge/dsfr-data/pull/326) [`c24cd4b`](https://github.com/bmatge/dsfr-data/commit/c24cd4b3a47243450ff79c6523cf3fbde68169d1) Thanks [@bmatge](https://github.com/bmatge)! - Nouveaux composants `dsfr-data-context` + `dsfr-data-context-filter` ([#229](https://github.com/bmatge/dsfr-data/issues/229), epic [#224](https://github.com/bmatge/dsfr-data/issues/224), ADR-031) : le filtre transverse multi-sources qui manquait. Un dashboard multi-vues à filtre commun (date, catégorie…) exigeait du JS d'orchestration écrit à la main — le contexte écoute des éléments d'UI natifs (`select`, `input`, select multiple, deux champs pour `between`), recompose un `where` par source **au dialecte de son adapter** (colon pivot, traduit en ODSQL via la couche partagée [#275](https://github.com/bmatge/dsfr-data/issues/275)) et le diffuse aux sources nommées. **Opt-in et additif** : sans contexte, rien ne change. Un `whereKey` stable par filtre → combinaison en **AND** par le merge multi-émetteurs existant des sources (jamais « le dernier gagne ») ; doublon field+operator signalé en warning ; la valeur vide retire le filtre ; le disconnect libère tout ; `apply-to` cible un sous-ensemble de sources ; opérateurs `eq`, `in`, `lt`, `gte`, `between` ; erreurs de configuration via `reportConfigError` ([#283](https://github.com/bmatge/dsfr-data/issues/283)).

- [#326](https://github.com/bmatge/dsfr-data/pull/326) [`c24cd4b`](https://github.com/bmatge/dsfr-data/commit/c24cd4b3a47243450ff79c6523cf3fbde68169d1) Thanks [@bmatge](https://github.com/bmatge)! - Opérateurs de date pour `dsfr-data-context-filter` ([#230](https://github.com/bmatge/dsfr-data/issues/230)) — les dashboards datés (rappels, sanctions, dépenses…) : `month-of` (`<input type="month">` → plage du mois), `year-of` (plage annuelle), `lt-day-after` (inclusif jusqu'au jour choisi), `last-n-days` (« N derniers jours ») et `current-year` (checkbox → année en cours). Toutes les clauses sont des plages `[début, fin)` en ISO, générées au dialecte de chaque adapter (ODSQL/colon) ; les bornes **dynamiques** se recalculent à chaque diffusion (pas de date figée dans le DOM) et l'URL sérialise l'**intention** (« 30 »), jamais les dates résolues (ADR-031) — un lien partagé ne gèle pas de vieilles dates.

- [#326](https://github.com/bmatge/dsfr-data/pull/326) [`c24cd4b`](https://github.com/bmatge/dsfr-data/commit/c24cd4b3a47243450ff79c6523cf3fbde68169d1) Thanks [@bmatge](https://github.com/bmatge)! - Nouveau composant `dsfr-data-context-tags` ([#232](https://github.com/bmatge/dsfr-data/issues/232)) : tags DSFR récapitulant les filtres actifs d'un `dsfr-data-context` (`for="ctx"`), chacun supprimable d'un clic — la croix réinitialise le filtre en **vidant son contrôle d'UI**, exactement le chemin d'un utilisateur qui efface le champ : sources, URL ([#231](https://github.com/bmatge/dsfr-data/issues/231)) et tags se mettent à jour ensemble. Libellé naturel via le nouvel attribut `label` de `dsfr-data-context-filter` (défaut : le champ) ; valeurs affichées humanisées (« année en cours », « 30 derniers jours », plages between en « min – max »).

- [#326](https://github.com/bmatge/dsfr-data/pull/326) [`c24cd4b`](https://github.com/bmatge/dsfr-data/commit/c24cd4b3a47243450ff79c6523cf3fbde68169d1) Thanks [@bmatge](https://github.com/bmatge)! - `dsfr-data-context` : sérialisation URL des filtres ([#231](https://github.com/bmatge/dsfr-data/issues/231), ADR-031) — partage d'un lien vers un dashboard déjà filtré. **Opt-in** (`url-sync`, défaut OFF pour ne pas collisionner avec le routing du site hôte), encodage lisible (un paramètre par filtre nommé d'après le champ : `?categorie=alimentaire,jouets`, `?prix=10,20` pour between), renommage possible via `url-param-map="c:categorie"`. Écriture en `history.replaceState` (pas d'entrée d'historique par frappe) en **préservant les paramètres voisins** (leçon [#312](https://github.com/bmatge/dsfr-data/issues/312)). Sécurité conforme ADR-031 : les valeurs lues dans l'URL ne sont jamais injectées dans un `where` — elles pré-remplissent les contrôles d'UI, qui repassent par exactement le même chemin qu'un clic utilisateur. L'opérateur `in` accepte désormais la virgule comme séparateur de valeurs (en plus du pipe).

- [#342](https://github.com/bmatge/dsfr-data/pull/342) [`796842d`](https://github.com/bmatge/dsfr-data/commit/796842d39115e720cb456c8f24470714669b2c5e) Thanks [@bmatge](https://github.com/bmatge)! - dsfr-data-kpi : carte enrichie « baromètre ».

  - Nouvel attribut `heading` : titre affiché AU-DESSUS de la valeur (surtitre).
  - Nouvel attribut `lines` (JSON) : lignes secondaires déclaratives rendues entre
    la valeur et le `label`. Chaque ligne est data-driven (`value="champ:fn"`) ou
    texte statique (`text`), avec `sign`, `prefix`/`suffix`, `color` (`"auto"` =
    vert si ≥0 / rouge si <0, token DSFR, ou couleur CSS) et repli `na` si la
    valeur n'est pas finie. Permet la ligne d'évolution type « +92,5 % vs mai 2025 ».
  - Fix : `computeAggregation` gère désormais une source mono-objet (un seul
    enregistrement) — l'agrégation renvoyait `null`, donc la valeur s'affichait
    mais pas la tendance/les lignes agrégées (cas typique d'un baromètre).
  - Le raccourci hérité `trend`/`tendance` (flèche `↑ 5,2 %`) reste fonctionnel ;
    `lines` est désormais la voie recommandée.
  - Une expression `trend` ou un JSON `lines` invalide est signalé via
    `data-dsfr-config-error` au lieu de disparaître en silence.

- [#324](https://github.com/bmatge/dsfr-data/pull/324) [`15833c0`](https://github.com/bmatge/dsfr-data/commit/15833c00e1eb845a2bb673e9fcab353ce6b0e1b5) Thanks [@bmatge](https://github.com/bmatge)! - Nouvel attribut `max-records` sur `dsfr-data-source` en mode adapter ([#233](https://github.com/bmatge/dsfr-data/issues/233)) : le plafond fetchAll de l'adapter OpenDataSoft (1 000 records) était codé en dur — ce n'est **pas** une limite de l'API. Il est désormais configurable (`max-records="5000"`), avec le défaut conservé à 1 000 en garde-fou anti-surcharge ; à relever explicitement pour les dashboards « un seul fetch server-side, puis N agrégations côté client » (attention au nombre de requêtes en boucle et au poids mémoire — documenté dans la spec). Au passage, le warn « pagination incomplete » se déclenche enfin quand le plafond tronque un fetch-all (l'ancienne condition ne couvrait que les short-reads sous un `limit` explicite).

- [#346](https://github.com/bmatge/dsfr-data/pull/346) [`38f2a6f`](https://github.com/bmatge/dsfr-data/commit/38f2a6f3f6e34168487a8c81f77163e104f38f54) Thanks [@bmatge](https://github.com/bmatge)! - Proxy CORS déclaratif par source via le nouvel attribut `proxy-url` sur
  `dsfr-data-source` ([#340](https://github.com/bmatge/dsfr-data/issues/340)).

  - Nouvel attribut **`proxy-url`** : domaine du proxy CORS pour CETTE source,
    prioritaire sur `window.DSFR_DATA_PROXY` et la config build-time (le plus
    spécifique gagne). Sert à la fois la réécriture d'hôte connu (Grist
    gouv/SaaS, Tabular, INSEE) et le `use-proxy` générique. Vide = résolution
    proxy globale habituelle (rétrocompatible). Ex : `proxy-url="https://mon-proxy.fr"`.
  - L'override est threadé jusqu'aux adapters (ODS, Grist, Tabular, INSEE) et aux
    facettes serveur ; `getProxyConfig()`, `getProxiedUrl()`,
    `buildProxiedRequest()`, `buildCorsProxyRequest()` et `getProxyUrl()`
    acceptent désormais un override optionnel (paramètres rétrocompatibles).
  - Beacon : nouvel override runtime `window.DSFR_DATA_BEACON_URL` (string),
    prioritaire sur l'URL bakée au build et résolu à l'appel — un site hôte peut
    rediriger la collecte de télémétrie vers son propre domaine sans rebuild.
  - La résolution proxy build-time (`VITE_PROXY_URL_EMBED`) est marquée
    `@deprecated` (conservée en fallback temporaire) au profit de `proxy-url` +
    `window.DSFR_DATA_PROXY`.
  - Clarification : `use-proxy` n'a d'effet que si une base de proxy est
    configurée (`proxy-url`, `window.DSFR_DATA_PROXY` ou build) — no-op en embed
    nu sur un site tiers.

## 0.8.0

### Minor Changes

- [#323](https://github.com/bmatge/dsfr-data/pull/323) [`f19f9c6`](https://github.com/bmatge/dsfr-data/commit/f19f9c6e10e1c7c561183559dab5b97f4c340ff7) Thanks [@bmatge](https://github.com/bmatge)! - Convention d'attributs unique — anglais ([#300](https://github.com/bmatge/dsfr-data/issues/300)). Trois conventions coexistaient : `dsfr-data-kpi` en français (`valeur`, `icone`, `couleur`, `seuil-vert`, `seuil-orange`, `tendance`), `dsfr-data-list` en franglais (`colonnes`, `recherche`, `filtres`, `tri`, `server-tri`), le reste en anglais. Nouveaux attributs cibles : **kpi** `value`, `icon`, `color`, `threshold-green`, `threshold-orange`, `trend` ; **list** `columns`, `search`, `filters`, `sort`, `server-sort`. Les anciennes écritures restent lues en **alias dépréciés** (warn console à la connexion, l'anglais prime si les deux sont posés) — retrait prévu à la 1.0. Les builders, le playground et le guide n'émettent plus que la convention cible ; skills alignés.

- [#323](https://github.com/bmatge/dsfr-data/pull/323) [`f19f9c6`](https://github.com/bmatge/dsfr-data/commit/f19f9c6e10e1c7c561183559dab5b97f4c340ff7) Thanks [@bmatge](https://github.com/bmatge)! - Proxy CORS injectable au runtime et défaut souverain ([#319](https://github.com/bmatge/dsfr-data/issues/319)) : plus aucun domaine personnel codé en dur dans les bundles. Sans configuration, les composants sont en mode `direct` (les URLs externes sont fetchées telles quelles). Le site déployeur peut fournir son proxy via `window.DSFR_DATA_PROXY` (string, objet `{ baseUrl, endpoints }`, ou `false`). `isViteDevMode()` ne se déclenche plus que dans le dev de ce repo (`import.meta.env.DEV`) — un intégrateur tiers en dev local n'est plus traité comme notre dev server. Nouvelle frontière lib/app : `packages/core` n'importe plus que `@dsfr-data/shared/lib` (règle ESLint), les modules app-side (auth, storage, ui) restent hors de la surface lib.

### Patch Changes

- [#323](https://github.com/bmatge/dsfr-data/pull/323) [`f19f9c6`](https://github.com/bmatge/dsfr-data/commit/f19f9c6e10e1c7c561183559dab5b97f4c340ff7) Thanks [@bmatge](https://github.com/bmatge)! - Le beacon ne référence plus d'API applicative ([#308](https://github.com/bmatge/dsfr-data/issues/308)) : la branche `window.__gwDbMode` qui POSTait sur `/api/monitoring/beacon` avec `credentials: 'include'` (logique du mode DB dans l'utilitaire de la lib, nommage `__gw*` hérité de l'ancien nom du projet) est remplacée par le hook `window.DSFR_DATA_BEACON_TRANSPORT` — s'il retourne `true` le beacon est pris en charge, sinon (absent, false, exception) le **pixel opt-in reste le transport par défaut**. Les apps du repo branchent le transport API via `registerDbBeaconTransport()` (shared, app-side), enregistré par `@dsfr-data/app-ui`. Vérifié sur bundle : zéro `__gwDbMode`/`/api/monitoring`.

- [#323](https://github.com/bmatge/dsfr-data/pull/323) [`f19f9c6`](https://github.com/bmatge/dsfr-data/commit/f19f9c6e10e1c7c561183559dab5b97f4c340ff7) Thanks [@bmatge](https://github.com/bmatge)! - Beacons de télémétrie complétés sur la famille carte ([#293](https://github.com/bmatge/dsfr-data/issues/293)) : `dsfr-data-map-layer` envoie son type de couche (marker, geoshape, circle, heatmap) et `dsfr-data-map-popup` est désormais visible du monitoring. Convention de sous-type documentée dans `beacon.ts` (variante fonctionnelle uniquement) : `dsfr-data-map` n'envoie plus son preset de tuiles, `dsfr-data-map-timeline` omet le sous-type au lieu de passer une chaîne vide.

- [#323](https://github.com/bmatge/dsfr-data/pull/323) [`f19f9c6`](https://github.com/bmatge/dsfr-data/commit/f19f9c6e10e1c7c561183559dab5b97f4c340ff7) Thanks [@bmatge](https://github.com/bmatge)! - Le cache serveur sort de la lib ([#307](https://github.com/bmatge/dsfr-data/issues/307)) : `dsfr-data-source` n'appelle plus `/api/cache` (logique du mode DB dans le composant central de la lib publiée) — le cache passe par un **hook** `window.DSFR_DATA_CACHE_PROVIDER = { get(key), put(key, data, ttl) }` enregistré par la page hôte. La **clé inclut un hash du fingerprint de la requête** (URL/params/where effectif/page/orderBy…) : l'ancienne clé réduite à l'id pouvait resservir la page 3 filtrée d'hier pour une requête page 1 sans filtre. Sans provider, `cache-ttl` est un no-op (embed anonyme) — sémantique documentée. Les apps du repo conservent le fallback offline : `registerServerCacheProvider()` (shared, app-side) est branché par `@dsfr-data/app-ui`. L'import app-side `isAuthenticated` disparaît de core (exception ESLint levée — la frontière [#319](https://github.com/bmatge/dsfr-data/issues/319) n'a plus aucune exception).

- [#323](https://github.com/bmatge/dsfr-data/pull/323) [`f19f9c6`](https://github.com/bmatge/dsfr-data/commit/f19f9c6e10e1c7c561183559dab5b97f4c340ff7) Thanks [@bmatge](https://github.com/bmatge)! - `dsfr-data-chart` : cycle de rendu assaini ([#305](https://github.com/bmatge/dsfr-data/issues/305)). Les updates de données mettent à jour les attributs de l'élément DSFR Chart **en place** (Vue observe ses props) — l'ancien remontage complet à chaque update perdait l'état d'animation et remontait périodiquement avec `refresh` sur la source ; l'élément n'est recréé qu'au changement de `type`. Les `setTimeout(500)` des attributs différés sont trackés et **annulés au disconnect** (ils s'empilaient à chaque `onSourceData` et pouvaient cibler des éléments remplacés — gardés par `isConnected`). `value-fields` sans `value-field` ne produit plus de série fantôme `''` (première série à zéro + nom vide dans la légende). Les cartes n'affichent plus la date du **jour** comme date de la donnée (`date` n'est envoyé que si `databox-date` est fourni). `utils/chart-data.ts` supprimé (code mort : seuls les ré-exports l'importaient, `computeGroupValue` dupliquait `computeAggregation`) ; double import `@dsfr-data/shared` fusionné.

- [#323](https://github.com/bmatge/dsfr-data/pull/323) [`f19f9c6`](https://github.com/bmatge/dsfr-data/commit/f19f9c6e10e1c7c561183559dab5b97f4c340ff7) Thanks [@bmatge](https://github.com/bmatge)! - Erreurs de configuration enfin visibles sur `dsfr-data-source` et `dsfr-data-a11y` ([#283](https://github.com/bmatge/dsfr-data/issues/283)). Un `api-type` inconnu ne produit plus d'unhandled rejection (le `getAdapter()` du registre retourne `null` au lieu de throw hors try via setTimeout) : la source pose `data-dsfr-config-error` et émet un `dsfr-data-error` — les consommateurs sortent du loading avec un message exploitable. Les erreurs de config de la source (id manquant, validation adapter échouée) passent de `console.warn` muets à `reportConfigError` + `dsfr-data-error`. `dsfr-data-a11y` signale une cible `for` introuvable (avant : silence total) et **l'observe** : un companion posé avant son graphique (rendu par un autre script) s'applique dès que la cible apparaît dans le DOM (MutationObserver léger, coupé au disconnect).

- [#323](https://github.com/bmatge/dsfr-data/pull/323) [`f19f9c6`](https://github.com/bmatge/dsfr-data/commit/f19f9c6e10e1c7c561183559dab5b97f4c340ff7) Thanks [@bmatge](https://github.com/bmatge)! - États loading/error harmonisés sur les 6 composants d'affichage ([#284](https://github.com/bmatge/dsfr-data/issues/284)) : il y avait quatre comportements pour la même erreur — list/chart affichaient le message, display un texte générique, kpi/podium un libellé sans message ni `role="alert"`. Templates partagés (`renderSourceError`/`renderSourceLoading`) : partout `role="alert"` + `aria-live` + message de l'erreur, `aria-busy` sur le chargement, classes par composant conservées (styles existants intacts) + classe commune `dsfr-data-status--*` pour le theming. `SourceSubscriberMixin` purge désormais ses états et l'état dérivé de l'hôte (`onSourceReset()`) à chaque changement de `source` — basculer vers une source sans cache n'affiche plus les anciennes données. `dsfr-data-display` gagne le revert de page sur erreur de fetch qu'implémentait `dsfr-data-list` (pagination serveur : retour à la page précédente, données courantes conservées).

- [#323](https://github.com/bmatge/dsfr-data/pull/323) [`f19f9c6`](https://github.com/bmatge/dsfr-data/commit/f19f9c6e10e1c7c561183559dab5b97f4c340ff7) Thanks [@bmatge](https://github.com/bmatge)! - Sécurité export/import localStorage ([#316](https://github.com/bmatge/dsfr-data/issues/316)) : l'export JSON ne contient plus aucun secret — `apiKey` retiré des **sources** (tokens Grist) comme des connexions, et en-têtes sensibles (`Authorization`, `Apikey`, `X-API-Key`, cookies…) expurgés des deux. À l'import, validation structurelle renforcée : clés dangereuses (`__proto__`, `constructor`, `prototype`) retirées récursivement (anti prototype-pollution), champs optionnels typés (un champ au mauvais type est retiré), taille du `code` des favoris bornée.

- [#323](https://github.com/bmatge/dsfr-data/pull/323) [`f19f9c6`](https://github.com/bmatge/dsfr-data/commit/f19f9c6e10e1c7c561183559dab5b97f4c340ff7) Thanks [@bmatge](https://github.com/bmatge)! - `dsfr-data-facets` durci ([#309](https://github.com/bmatge/dsfr-data/issues/309), [#310](https://github.com/bmatge/dsfr-data/issues/310)) : les fetch de facettes sont **abortés** entre deux interactions (AbortController par cycle + jeton de génération — deux clics rapides laissaient la réponse la plus lente, potentiellement l'ancienne, écraser les groupes) et les erreurs ne sont plus avalées en silence (`console.warn` + bannière d'erreur rendue). L'UI ne disparaît plus quand un filtre serveur donne **0 résultat** : le bouton « Réinitialiser les filtres » reste rendu (l'utilisateur n'est plus coincé). Les **sélections fantômes** (valeur sélectionnée disparue des données après refetch) sont réinjectées dans les groupes, cochées et marquées indisponibles — donc désélectionnables, fini le filtre invisible qui rend les résultats vides inexplicables.

- [#323](https://github.com/bmatge/dsfr-data/pull/323) [`f19f9c6`](https://github.com/bmatge/dsfr-data/commit/f19f9c6e10e1c7c561183559dab5b97f4c340ff7) Thanks [@bmatge](https://github.com/bmatge)! - `dsfr-data-facets` factorisé ([#313](https://github.com/bmatge/dsfr-data/issues/313)) : le bloc « valeur + compteur » (copié 3× entre checkbox, multiselect et radio) et la barre de recherche des panels (copiée 2×) deviennent des templates partagés — comportement identique, gardé par tests. Les valeurs orphelines ([#310](https://github.com/bmatge/dsfr-data/issues/310)) affichent « (indisponible) ». Nettoyages : le debounce de recherche est annulé au disconnect, le `closest('dsfr-data-facets') ?? this` mort supprimé, `baseWhere` calculé une fois (il était recalculé à chaque itération de la boucle des champs), et en `server-facets` sans capability adapter le fallback client n'émet plus **deux** jeux de données différents (brut puis filtré) — un seul dispatch, filtré.

- [#323](https://github.com/bmatge/dsfr-data/pull/323) [`f19f9c6`](https://github.com/bmatge/dsfr-data/commit/f19f9c6e10e1c7c561183559dab5b97f4c340ff7) Thanks [@bmatge](https://github.com/bmatge)! - `dsfr-data-facets` RGAA ([#311](https://github.com/bmatge/dsfr-data/issues/311)) : les ids d'inputs sont générés **par index + uid d'instance** — l'ancienne normalisation `value.replace(/[^a-zA-Z0-9]/g, '_')` faisait collisionner « A-B » et « A B » (même id, le `label for` pointait vers le premier : cliquer le second label cochait le **mauvais filtre**), et deux instances sur les mêmes champs partageaient leurs ids. **Une seule live region** au niveau composant (chaque annonce était répétée par autant de régions que de fieldsets/panels ouverts). Textes harmonisés (« désélectionnée », « Réinitialiser » accentués partout).

- [#323](https://github.com/bmatge/dsfr-data/pull/323) [`f19f9c6`](https://github.com/bmatge/dsfr-data/commit/f19f9c6e10e1c7c561183559dab5b97f4c340ff7) Thanks [@bmatge](https://github.com/bmatge)! - `dsfr-data-facets` url-sync corrigé ([#312](https://github.com/bmatge/dsfr-data/issues/312)) : `_syncUrl` part des paramètres **existants** et ne gère que les siens — repartir de zéro effaçait le paramètre du `dsfr-data-search` voisin et tout autre param de la page à chaque clic. Sans `url-param-map`, seuls les paramètres correspondant aux **champs connus** (attribut `fields`, groupes, colonnes des données) deviennent des sélections — `?utm_source=newsletter` filtrait sur un champ inexistant et affichait 0 résultat. Doc alignée sur le comportement réel (`replaceState`). Au passage côté `dsfr-data-search` : `sr-label` applique `fr-sr-only` (la classe `sr-only` n'existe pas en DSFR — l'attribut était sans effet).

- [#323](https://github.com/bmatge/dsfr-data/pull/323) [`f19f9c6`](https://github.com/bmatge/dsfr-data/commit/f19f9c6e10e1c7c561183559dab5b97f4c340ff7) Thanks [@bmatge](https://github.com/bmatge)! - `filter-translator` aligné sur la couche WHERE partagée ([#315](https://github.com/bmatge/dsfr-data/issues/315)) : `filterToOdsql` échappe les guillemets et antislashes (le code généré par les builders était invalide/injectable avec une valeur à guillemet), n'encadre plus de guillemets les littéraux numériques des comparaisons `gt/gte/lt/lte` (ODS comparait des strings), supporte `isnull`/`isnotnull` (rejetés par le garde de segments) et décode les valeurs percent-encodées. `applyLocalFilter` supporte `in`/`notin` (le même filtre retournait toutes les lignes en local, silencieusement) avec la sémantique lâche d'`eq`, et avertit en console sur un opérateur inconnu. Helpers `escapeColonValue`/`unescapeColonValue` mutualisés dans `@dsfr-data/shared` (ré-exportés par la lib).

- [#323](https://github.com/bmatge/dsfr-data/pull/323) [`f19f9c6`](https://github.com/bmatge/dsfr-data/commit/f19f9c6e10e1c7c561183559dab5b97f4c340ff7) Thanks [@bmatge](https://github.com/bmatge)! - Export CSV robuste et partagé ([#291](https://github.com/bmatge/dsfr-data/issues/291)) : nouvelle fonction `buildCsv()` dans `@dsfr-data/shared` (quoting RFC 4180 incluant les sauts de ligne, BOM UTF-8 pour Excel FR, neutralisation des préfixes de formules tableur `=` `@` `+` `-`), consommée par `dsfr-data-list` et `dsfr-data-a11y`. L'export a11y utilise désormais les mêmes colonnes que le tableau rendu et exclut les champs techniques `_*` (dont le HTML de `_highlight`). `dsfr-data-list` signale en console que seule la page courante est exportée en mode serveur.

- [#323](https://github.com/bmatge/dsfr-data/pull/323) [`f19f9c6`](https://github.com/bmatge/dsfr-data/commit/f19f9c6e10e1c7c561183559dab5b97f4c340ff7) Thanks [@bmatge](https://github.com/bmatge)! - Packaging npm réparé ([#318](https://github.com/bmatge/dsfr-data/issues/318)) : `npm install dsfr-data` échouait en E404 car `@dsfr-data/shared` (package privé, déjà bundlé dans `dist/`) était déclaré en dépendance runtime. Toutes les dépendances passent en `devDependencies` (les bundles sont autonomes, aucun import nu). Les chunks Leaflet (`leaflet-src-*.js`, `leaflet.markercluster-src-*.js`, `leaflet-heat-*.js`) sont désormais publiés — ils étaient absents du tarball alors que les bundles map et tout-en-un les importent dynamiquement. Champ `sideEffects` déclaré sur `dsfr-data` et `@dsfr-data/shared` pour un tree-shaking correct.

- [#323](https://github.com/bmatge/dsfr-data/pull/323) [`f19f9c6`](https://github.com/bmatge/dsfr-data/commit/f19f9c6e10e1c7c561183559dab5b97f4c340ff7) Thanks [@bmatge](https://github.com/bmatge)! - Sécurité ([#290](https://github.com/bmatge/dsfr-data/issues/290)) : le champ `_highlight` de `dsfr-data-search` échappe désormais le HTML des données sources avant d'insérer les balises `<mark>` (XSS via `{{{_highlight}}}` dans `dsfr-data-display`), et n'inclut plus que les champs qui matchent réellement le terme. Le rendu de template de `dsfr-data-display` se fait en une seule passe : une donnée contenant `{{x}}` est rendue littéralement au lieu d'être ré-interprétée comme placeholder.

- [#323](https://github.com/bmatge/dsfr-data/pull/323) [`f19f9c6`](https://github.com/bmatge/dsfr-data/commit/f19f9c6e10e1c7c561183559dab5b97f4c340ff7) Thanks [@bmatge](https://github.com/bmatge)! - Formatage unifié : la preview des builders rend exactement ce que rend le composant ([#317](https://github.com/bmatge/dsfr-data/issues/317)). `formatKPIValue` (shared, previews) et les formatters de core (composants) divergeaient — euro à 2 décimales en preview contre 0 dans le composant, `%` en suffixe texte contre `style:'percent'`. La famille canonique (`formatValue`/`formatNumber`/`formatPercentage`/`formatCurrency`/`formatDecimal`/`formatDate`) vit désormais dans `@dsfr-data/shared` ; core la re-exporte (même implémentation, pas une copie) et `formatKPIValue` devient un wrapper déprécié qui mappe l'unité vers le format. Politique `%` documentée (la valeur EST le pourcentage : 5 → « 5 % ») ainsi que la tolérance volontairement différente entre `looksLikeNumber` (détection conservatrice pour numeric-auto) et `toNumber` (parseur tolérant).

- [#323](https://github.com/bmatge/dsfr-data/pull/323) [`f19f9c6`](https://github.com/bmatge/dsfr-data/commit/f19f9c6e10e1c7c561183559dab5b97f4c340ff7) Thanks [@bmatge](https://github.com/bmatge)! - Mode SQL Grist durci ([#287](https://github.com/bmatge/dsfr-data/issues/287)) : le WHERE n'est plus fusionné en double (`effectiveWhere` de la source contient déjà le where statique — le re-merger produisait `WHERE X AND X` avec args doublés) ; les identifiants vides sont gardés (`group-by="region,"` ou une clause where sans champ ne jettent plus `Empty SQL identifier`) ; le cache de disponibilité SQL passe du hostname (permanent) à l'endpoint **host + document** avec **TTL** (2 min en échec, 30 min en succès) — un 403 ponctuel sur un document ne condamne plus tous les documents du host, définitivement. La sonde (timeout 2 s) est liée au signal du composant, et un abort du composant n'empoisonne plus le cache.

- [#323](https://github.com/bmatge/dsfr-data/pull/323) [`f19f9c6`](https://github.com/bmatge/dsfr-data/commit/f19f9c6e10e1c7c561183559dab5b97f4c340ff7) Thanks [@bmatge](https://github.com/bmatge)! - `fetchAll` INSEE Melodi pagine enfin par pages de 1000 ([#286](https://github.com/bmatge/dsfr-data/issues/286)) : il consommait `params.pageSize` (défaut 20 venant de la source) au lieu de la taille optimale du provider — plafond réel de 2000 records (au lieu des 100 000 documentés) et 50× plus de requêtes. 10 000 lignes = 10 requêtes désormais, comme ODS et Tabular qui ignorent correctement `pageSize` en fetchAll (il ne concerne que la pagination serveur). Plafonds de sécurité corrigés et documentés dans le tableau des capacités : ODS 1 000, Tabular 25 000 (le commentaire disait 50K à tort), Grist illimité (1 requête), INSEE 100 000.

- [#323](https://github.com/bmatge/dsfr-data/pull/323) [`f19f9c6`](https://github.com/bmatge/dsfr-data/commit/f19f9c6e10e1c7c561183559dab5b97f4c340ff7) Thanks [@bmatge](https://github.com/bmatge)! - `dsfr-data-kpi` aligné sur le pipeline ([#303](https://github.com/bmatge/dsfr-data/issues/303)) : la grammaire commune `champ:fn` (ex. `valeur="population:sum"`) est acceptée — la grammaire historique inversée `fn:champ` reste lue en alias déprécié (warn unique). Les chemins imbriqués fonctionnent enfin (`valeur="fields.score:avg"` — seul composant sans `getByPath`, l'expression échouait silencieusement). La tendance est formatée fr-FR (« 5,2 % » au lieu de « 5.2% » anglo-saxon à côté d'une valeur « 5 825 ») et sa doc est corrigée (c'est une expression d'agrégation, pas un littéral). `count:champ:valeur` compare en égalité lâche comme les filtres de query (`"75"` matche 75).

- [#323](https://github.com/bmatge/dsfr-data/pull/323) [`f19f9c6`](https://github.com/bmatge/dsfr-data/commit/f19f9c6e10e1c7c561183559dab5b97f4c340ff7) Thanks [@bmatge](https://github.com/bmatge)! - Le chrome applicatif sort de la lib npm publiée ([#306](https://github.com/bmatge/dsfr-data/issues/306)). `components/layout/` (auth-modal, password-change-modal, share-dialog avec leurs fetch `/api/auth`/`/api/shares`, app-header branché sur les services d'auth) vivait dans `packages/core` et était exporté par les entries → le bundle publié contenait 16× `/api/auth` et la modale de connexion complète. Il déménage dans le package workspace **privé** `@dsfr-data/app-ui` (bundle séparé `app-ui.esm.js` chargé par les apps, le hub et le guide — jamais publié sur npm). Les exports publics `AppHeader`/`AppFooter`/`AppLayoutBuilder`/`AppLayoutDemo` sont retirés des entries. Vérifié : zéro `/api/auth`, `auth-modal` ou `/api/shares` dans `dsfr-data.esm.js` et `dsfr-data.core.esm.js` reconstruits ; `npm pack` ne contient aucun code d'auth. L'incohérence d'exports (6 composants dans layout/index.ts, 4 réexportés) disparaît avec les exports.

- [#323](https://github.com/bmatge/dsfr-data/pull/323) [`f19f9c6`](https://github.com/bmatge/dsfr-data/commit/f19f9c6e10e1c7c561183559dab5b97f4c340ff7) Thanks [@bmatge](https://github.com/bmatge)! - `dsfr-data-map` : les bounds des layers sont stockés par layer avec remplacement à chaque rendu ([#294](https://github.com/bmatge/dsfr-data/issues/294)) — l'ancien `push` cumulait les bounds historiques : croissance mémoire indéfinie (chaque refresh, frame de timeline ou pan en bbox client ajoutait une entrée) et fit-bounds incapable de rétrécir la vue quand les données diminuaient. La combinaison part désormais d'une copie (`extend` de Leaflet mute en place — la première entrée stockée était corrompue), et un layer retiré du DOM libère ses bounds.

- [#323](https://github.com/bmatge/dsfr-data/pull/323) [`f19f9c6`](https://github.com/bmatge/dsfr-data/commit/f19f9c6e10e1c7c561183559dab5b97f4c340ff7) Thanks [@bmatge](https://github.com/bmatge)! - `dsfr-data-map` : init unique et jamais posthume ([#298](https://github.com/bmatge/dsfr-data/issues/298)) — un verrou empêche deux initialisations concurrentes (reconnexion DOM d'un dashboard qui réordonne les widgets, ou IntersectionObserver pendant l'`await loadLeaflet()` en vol : double skip-link, deux instances `L.map`), et un élément déconnecté pendant l'await abandonne son init au lieu de créer une carte sur un élément détaché jamais `remove()` (fuite du listener resize window posé par Leaflet). Ids ARIA par compteur (deux cartes créées dans la même milliseconde partageaient le même id `Date.now()`).

- [#323](https://github.com/bmatge/dsfr-data/pull/323) [`f19f9c6`](https://github.com/bmatge/dsfr-data/commit/f19f9c6e10e1c7c561183559dab5b97f4c340ff7) Thanks [@bmatge](https://github.com/bmatge)! - `dsfr-data-map-layer` — bbox client et cleanup ([#297](https://github.com/bmatge/dsfr-data/issues/297)) : le fallback bbox client (adapters sans `serverGeo` : Tabular, Grist, Generic) sait enfin filtrer les **géométries** (bbox GeoJSON par parcours des coordonnées, Feature/Polygon/MultiPolygon) — tous les polygones disparaissaient au premier pan, `_extractCoords` ne sachant extraire que des points ; une géométrie inextractible est conservée. Retirer un layer **libère le filtre viewport** poussé sur la source (`whereKey: map-bbox`) — la source restait filtrée sur le dernier viewport pour tous ses autres consommateurs. Annexes : compagnon popup résolu une fois par rendu (jusqu'à 5000 `querySelector` par rendu avant), `radius-unit="m"` + `radius-field` utilise la valeur brute en mètres (l'échelle px produisait des cercles invisibles), banners de troncature empilés au lieu de superposés, attribut fantôme `filter` supprimé (warn de migration) — le champ « Filtre » du builder carto génère désormais un vrai `dsfr-data-query` intermédiaire.

- [#323](https://github.com/bmatge/dsfr-data/pull/323) [`f19f9c6`](https://github.com/bmatge/dsfr-data/commit/f19f9c6e10e1c7c561183559dab5b97f4c340ff7) Thanks [@bmatge](https://github.com/bmatge)! - `dsfr-data-map-layer` : fini les marqueurs dupliqués quand deux rendus se chevauchent ([#295](https://github.com/bmatge/dsfr-data/issues/295)) — `_renderLayer` async était appelé sans await depuis `onSourceData`, `setTimelineFrame` et le fallback bbox ; deux appels concurrents pendant le `await import(...)` (cluster/heatmap) franchissaient chacun `clearLayers()` puis ajoutaient chacun tous les items. Un jeton de génération abandonne le rendu obsolète après chaque await. `setTimelineFrame` passe désormais les items de la frame en paramètre au lieu d'échanger temporairement `this._data` autour d'un appel non awaité (ça ne tenait que parce que la lecture était dans la portion synchrone).

- [#323](https://github.com/bmatge/dsfr-data/pull/323) [`f19f9c6`](https://github.com/bmatge/dsfr-data/commit/f19f9c6e10e1c7c561183559dab5b97f4c340ff7) Thanks [@bmatge](https://github.com/bmatge)! - `dsfr-data-map-popup` durci ([#296](https://github.com/bmatge/dsfr-data/issues/296)) : le listener Escape posé sur `document` est retiré quel que soit le chemin de fermeture (bouton, overlay, Escape — il s'empilait pour toujours hors fermeture clavier) ; la suppression animée du panneau (200 ms) est annulée par une réouverture rapide (le panneau frais était supprimé avec son contenu) ; **l'exemple documenté fonctionne** — un popup enfant de la carte sans `for` matche toutes les couches (le layer exigeait un `for` truthy, contredisant `matchesLayer()` et la docstring) ; vrai focus trap dans la modale (Tab/Shift+Tab bouclent) et focus rendu au déclencheur à la fermeture (RGAA).

- [#323](https://github.com/bmatge/dsfr-data/pull/323) [`f19f9c6`](https://github.com/bmatge/dsfr-data/commit/f19f9c6e10e1c7c561183559dab5b97f4c340ff7) Thanks [@bmatge](https://github.com/bmatge)! - Parsing numérique unifié sur `toNumber` ([#301](https://github.com/bmatge/dsfr-data/issues/301)) : une valeur `"1 234,5"` (fréquente sur les CSV data.gouv via Tabular) devenait silencieusement 0 dans chart/podium (`Number()`), 1 dans display/formatters (`parseFloat`) et n'était correcte qu'après un `normalize numeric-auto` intercalé — chart, podium, query, aggregations et les formatters parsent désormais les décimales françaises nativement. `toNumber` lui-même est corrigé sur les séparateurs multiples (`'1,234,567'` → 1 234 567, `'1.234.567'` → 1 234 567 ; `replace(',', '.')` ne remplaçait que la première virgule). Politique NaN unique : les non-numériques sont **exclus des agrégats** (jamais convertis en 0 — `avg` ne divise plus par les lignes N/A), `min`/`max` sans valeur numérique retournent null au lieu d'Infinity, et `normalize numeric` adopte la sémantique stricte de `numeric-auto` (`"N/A"` → null, fini les sommes faussées).

- [#323](https://github.com/bmatge/dsfr-data/pull/323) [`f19f9c6`](https://github.com/bmatge/dsfr-data/commit/f19f9c6e10e1c7c561183559dab5b97f4c340ff7) Thanks [@bmatge](https://github.com/bmatge)! - Échappement d'identifiants ODS et garde-fous server-side Tabular ([#289](https://github.com/bmatge/dsfr-data/issues/289)) : un group-by/agrégat sur champ à espaces ou ponctuation ("Date - Journée gazière") fonctionne désormais sur les 3 providers — ODS échappe les identifiants en backquotes ODSQL (group_by, champ ET alias du select), Grist échappait déjà, et Tabular consulte enfin `isTabularServerFieldSafe` dans `buildUrl` : champs non délégables → lignes brutes + `needsClientProcessing` + warning explicite, au lieu du « Malformed query » que le garde-fou prétendait éviter (il n'était appliqué que par la délégation query [#275](https://github.com/bmatge/dsfr-data/issues/275), pas par un group-by posé directement sur la source). Aussi : deux filtres Tabular sur le même champ+opérateur sont AND-és (`append` au lieu de `set` qui écrasait, comme Grist/ODS) ; plus d'over-fetch sur la dernière page (`page_size` borné au restant) ; warnings des adapters aux bons préfixes (fini le `dsfr-data-query:` copié-collé dans ODS/Tabular).

- [#323](https://github.com/bmatge/dsfr-data/pull/323) [`f19f9c6`](https://github.com/bmatge/dsfr-data/commit/f19f9c6e10e1c7c561183559dab5b97f4c340ff7) Thanks [@bmatge](https://github.com/bmatge)! - `order-by` multi-champs réparé sur ODS et Tabular ([#273](https://github.com/bmatge/dsfr-data/issues/273)) : `parseOrderBy()` partagé applique la même grammaire `"field:dir, field2:dir2"` sur les 3 adapters serveur — ODS ne transformait que le dernier segment (ODSQL invalide), Tabular produisait un tri malformé. L'opérateur `in` des facettes multi-sélection est désormais traduit côté Tabular (liste à virgules de l'API au lieu du `|` interne).

- [#323](https://github.com/bmatge/dsfr-data/pull/323) [`f19f9c6`](https://github.com/bmatge/dsfr-data/commit/f19f9c6e10e1c7c561183559dab5b97f4c340ff7) Thanks [@bmatge](https://github.com/bmatge)! - Contrôleur de pagination partagé entre `dsfr-data-list` et `dsfr-data-display` ([#304](https://github.com/bmatge/dsfr-data/issues/304)) — ~150 lignes dupliquées avec dérives remplacées par un module unique. Corrigés : `?page=3` est respecté dans les deux modes (la page restaurée depuis l'URL était écrasée par le reset à 1 à l'arrivée des données en pagination cliente) ; le tri serveur revient page 1, dans la même commande que l'orderBy (trier en page 5 affichait la page 5 du nouveau tri) ; en pagination serveur, recherche et filtres **locaux** sont désactivés avec un warning explicite (ils n'opéraient que sur la page chargée — compteurs faux, options de filtre partielles ; utilisez `dsfr-data-search`/`dsfr-data-facets` server-side) ; `$index`/`$uid` exacts en pagination serveur (offset calculé avec la taille de page serveur) ; la pagination serveur s'affiche même sans attribut `pagination` redondant ; ids DOM préfixés par instance (deux listes/displays sur une page n'ont plus d'ids dupliqués — a11y).

- [#323](https://github.com/bmatge/dsfr-data/pull/323) [`f19f9c6`](https://github.com/bmatge/dsfr-data/commit/f19f9c6e10e1c7c561183559dab5b97f4c340ff7) Thanks [@bmatge](https://github.com/bmatge)! - Contrat unique pour les métadonnées de pagination ([#270](https://github.com/bmatge/dsfr-data/issues/270)) : la pagination serveur de `dsfr-data-list`/`dsfr-data-display` s'active désormais sur le flag explicite `serverSide` de la meta (et plus jamais sur `total > 0`) — un fetchAll ne déclenche plus de pagination serveur avec `Infinity` pages. `totalCount` inconnu vaut `undefined` (jamais `-1`) : la pagination serveur Grist Records fonctionne enfin en cas nominal, avec « page suivante » proposée tant que la page est pleine et total exact à la dernière page. `needsClientProcessing` harmonisé sur tous les adapters (true ssi des transformations demandées n'ont pas été appliquées) : le fallback Grist « SQL indisponible » signale correctement les group-by/aggregate en attente, INSEE `fetchPage` est aligné sur les autres adapters.

- [#323](https://github.com/bmatge/dsfr-data/pull/323) [`f19f9c6`](https://github.com/bmatge/dsfr-data/commit/f19f9c6e10e1c7c561183559dab5b97f4c340ff7) Thanks [@bmatge](https://github.com/bmatge)! - Meta de pagination cohérente dans tout le pipeline ([#282](https://github.com/bmatge/dsfr-data/issues/282)) : `dsfr-data-normalize` publiait sa meta APRÈS `dispatchDataLoaded` — `document.dispatchEvent` étant synchrone, l'aval lisait la meta du batch précédent (un `dsfr-data-query` aval d'un normalize sur fallback Grist sautait son traitement client sur des données brutes). La meta est désormais posée avant le dispatch (porté par `emitTransformedData` du mixin [#280](https://github.com/bmatge/dsfr-data/issues/280)) — AC pipeline `source(grist fallback) → normalize → query` testé. `dsfr-data-unpivot` et `dsfr-data-join` propagent enfin la meta (`needsClientProcessing`/`serverSide`/`pageSize` suivent, `total` invalidé puisqu'ils changent le nombre de lignes ; join propage la meta de sa source gauche, cohérent avec le relais de commandes [#272](https://github.com/bmatge/dsfr-data/issues/272)).

- [#323](https://github.com/bmatge/dsfr-data/pull/323) [`f19f9c6`](https://github.com/bmatge/dsfr-data/commit/f19f9c6e10e1c7c561183559dab5b97f4c340ff7) Thanks [@bmatge](https://github.com/bmatge)! - Palettes uniques via `@dsfr-data/shared` ([#302](https://github.com/bmatge/dsfr-data/issues/302)) : `CHOROPLETH_SCALES` (les échelles 9 pas historiques de core, blue-france 975 → main-525), `quantileBreaks()` et `getColorForValue()` deviennent la source unique consommée par podium, map-layer et world-map — les trois copies locales sont supprimées. La `categorical` du podium était **différente** de `PALETTE_COLORS` (même attribut `selected-palette` que chart, couleurs différentes : un dashboard mêlant chart et podium n'était pas cohérent) ; map-layer et world-map bucketaient en sens **opposés** (`value <= break` vs `v >= break`) — une même valeur posée sur un break était colorée différemment selon la carte. Convention unique : bornes supérieures inclusives. map-layer gagne au passage la palette `categorical` qui lui manquait.

- [#323](https://github.com/bmatge/dsfr-data/pull/323) [`f19f9c6`](https://github.com/bmatge/dsfr-data/commit/f19f9c6e10e1c7c561183559dab5b97f4c340ff7) Thanks [@bmatge](https://github.com/bmatge)! - La couche déclarative ProviderConfig est enfin branchée et honnête ([#285](https://github.com/bmatge/dsfr-data/issues/285)) : `capabilities` devient le miroir exact de `AdapterCapabilities` du core (ajout `serverGeo`/`whereFormat`, suppression de `serverAggregation` jamais lu), garanti par un test d'alignement — toute déviation config/adapter (comme le mensonge historique de Generic sur `whereFormat`) fait désormais échouer la CI. `operatorMapping` (Tabular) et `searchTemplate` (ODS/Tabular) ne sont plus dupliqués : les adapters consomment la config. Code mort supprimé : `utils/pagination.ts`, `utils/response-parser.ts` (zéro import hors tests, `extractPaginationMeta` était de plus faux sans `totalCountPath`) et le bloc `codeGen` entier de ProviderConfig (jamais lu — les générateurs des apps ont leur propre logique). Un test-garde interdit tout futur module utilitaire non importé. Le design `datagouv-dataset` (aiguillage vers des ressources Tabular, pas de ProviderId dédié) est documenté.

- [#323](https://github.com/bmatge/dsfr-data/pull/323) [`f19f9c6`](https://github.com/bmatge/dsfr-data/commit/f19f9c6e10e1c7c561183559dab5b97f4c340ff7) Thanks [@bmatge](https://github.com/bmatge)! - Cycle de vie de la délégation server-side de `dsfr-data-query` réparé ([#276](https://github.com/bmatge/dsfr-data/issues/276)) : changer un attribut purement client (`limit`, `filter`…) sur une query déléguée ne gèle plus les données — la re-négociation identique est dédupliquée côté query et relit le cache (valide) au lieu d'attendre une émission qui ne venait jamais. Retirer `group-by` libère désormais l'overlay sur la source (commande `groupBy: ''`) qui re-sert les lignes brutes ; au changement de `source`, les clears partent vers l'ancienne source (plus d'overlay orphelin servant des données agrégées). Filet de sécurité côté `dsfr-data-source` : une commande entièrement dédupliquée ré-émet le cache en asynchrone — contrat « une commande produit toujours une émission ».

- [#323](https://github.com/bmatge/dsfr-data/pull/323) [`f19f9c6`](https://github.com/bmatge/dsfr-data/commit/f19f9c6e10e1c7c561183559dab5b97f4c340ff7) Thanks [@bmatge](https://github.com/bmatge)! - Filtres et tri de `dsfr-data-query` fiabilisés ([#278](https://github.com/bmatge/dsfr-data/issues/278)) : `in`/`notin` adoptent la même coercition lâche que `eq` (`dept:in:75|13` matche enfin `"75"` string), avec une égalité unique gérant aussi les booléens (`true` vs `"true"`). Les opérateurs positifs (eq, in, contains, gt/gte/lt/lte) ne matchent plus jamais `null`/`undefined` (`Number(null)===0` faisait passer les nulls, `String(undefined)` matchait `"undefined"`), les négatifs (neq, notin, notcontains) les laissent passer. Les comparaisons retombent en lexicographique pour les non-numériques (dates ISO). Le tri devient un comparateur total à 3 niveaux (null/vide < numérique < chaîne) — transitif, stable, fini l'ordre arbitraire sur colonnes mixtes — et supporte le multi-champs (`"region:asc, population:desc"`, grammaire [#273](https://github.com/bmatge/dsfr-data/issues/273)). `aggregate` sans `group-by` produit désormais un agrégat global (une ligne, alias `field__fn`) au lieu d'un no-op silencieux — idéal pour alimenter un KPI. `applyLocalFilter` (shared) aligné sur la même sémantique (parité [#315](https://github.com/bmatge/dsfr-data/issues/315)).

- [#323](https://github.com/bmatge/dsfr-data/pull/323) [`f19f9c6`](https://github.com/bmatge/dsfr-data/commit/f19f9c6e10e1c7c561183559dab5b97f4c340ff7) Thanks [@bmatge](https://github.com/bmatge)! - Attributs fantômes de `dsfr-data-query` supprimés ([#277](https://github.com/bmatge/dsfr-data/issues/277)) : `transform`, `server-side` et `page-size` étaient déclarés (et documentés au builder-IA via l'introspection Lit) mais jamais lus — zéro effet. Un `console.warn` de migration est émis si l'attribut HTML est encore présent (le relais de commandes vers la source est toujours actif ; `transform` et `page-size` se configurent sur `dsfr-data-source`). La doc de `where` promettait la syntaxe ODSQL alors que le parseur est colon-only : un where non parsable (syntaxe ODSQL, opérateur inconnu, valeur manquante) est désormais signalé via `reportConfigError` (console + attribut `data-dsfr-config-error`), le traitement continuant en mode dégradé. Skills builder-IA et code généré par les builders alignés.

- [#323](https://github.com/bmatge/dsfr-data/pull/323) [`f19f9c6`](https://github.com/bmatge/dsfr-data/commit/f19f9c6e10e1c7c561183559dab5b97f4c340ff7) Thanks [@bmatge](https://github.com/bmatge)! - `reload()` de `dsfr-data-query` adopte la sémantique de pur transformateur ([#279](https://github.com/bmatge/dsfr-data/issues/279)) : il délègue le refetch à la source amont (même contrat que `dsfr-data-source.reload()`, une chaîne query→query→source propage jusqu'à la source) au lieu de relire le cache — l'émission qui suit redescend naturellement le pipeline. Repli sur le retraitement du cache si l'amont n'expose pas `reload()` (normalize/unpivot/join, en attendant le mixin [#262](https://github.com/bmatge/dsfr-data/issues/262)). L'attribut `refresh` est retiré de query (le rafraîchissement périodique appartient à la source, qui refetche pendant que le pipeline suit) avec un `console.warn` de migration.

- [#323](https://github.com/bmatge/dsfr-data/pull/323) [`f19f9c6`](https://github.com/bmatge/dsfr-data/commit/f19f9c6e10e1c7c561183559dab5b97f4c340ff7) Thanks [@bmatge](https://github.com/bmatge)! - `dsfr-data-query` transmet désormais son `where`/`filter` à la source lors de la délégation server-side du group-by ([#275](https://github.com/bmatge/dsfr-data/issues/275)) : la clause colon est traduite au dialecte de l'adapter (ODSQL pour OpenDataSoft, pass-through colon sinon) et envoyée comme overlay `query-<id>`. Le filtre n'est plus jamais ré-appliqué client-side sur les lignes agrégées (où les champs bruts n'existent plus — toutes les lignes étaient éliminées). Un where intraduisible (syntaxe non-colon, opérateur inconnu) bloque toute la délégation : filtre et group-by restent alors client-side, dans cet ordre. `where` + `group-by` + `aggregate` donne maintenant le même résultat quel que soit le chemin (délégué ou client). Côté `dsfr-data-source`, les commandes `where` identiques sont dédoublonnées (pas de refetch superflu aux re-négociations).

- [#323](https://github.com/bmatge/dsfr-data/pull/323) [`f19f9c6`](https://github.com/bmatge/dsfr-data/commit/f19f9c6e10e1c7c561183559dab5b97f4c340ff7) Thanks [@bmatge](https://github.com/bmatge)! - `dsfr-data-search` et `dsfr-data-join` relaient désormais les commandes aval (`page`, `where`, `orderBy`) vers leur source amont, comme query/normalize/unpivot ([#272](https://github.com/bmatge/dsfr-data/issues/272)). Un `dsfr-data-list` paginé derrière un search ne perdait plus silencieusement sa pagination ; join relaie vers la source gauche (porteuse des lignes principales), la droite étant traitée comme table de référence — comportement documenté.

- [#323](https://github.com/bmatge/dsfr-data/pull/323) [`f19f9c6`](https://github.com/bmatge/dsfr-data/commit/f19f9c6e10e1c7c561183559dab5b97f4c340ff7) Thanks [@bmatge](https://github.com/bmatge)! - Suppression des fallbacks CDN jsdelivr injectés au runtime par `dsfr-data-map-layer` pour leaflet.markercluster et leaflet.heat ([#292](https://github.com/bmatge/dsfr-data/issues/292)). Les plugins sont chargés exclusivement via les chunks `import()` du build (publiés sur npm depuis [#318](https://github.com/bmatge/dsfr-data/issues/318)), et leurs symboles résolus sur `window.L` ou sur l'export du module Leaflet bundlé. Compatible CSP `script-src` strict et cohérent avec `sovereign-only`. Un test-garde interdit toute URL CDN dans `packages/core/src/`.

- [#323](https://github.com/bmatge/dsfr-data/pull/323) [`f19f9c6`](https://github.com/bmatge/dsfr-data/commit/f19f9c6e10e1c7c561183559dab5b97f4c340ff7) Thanks [@bmatge](https://github.com/bmatge)! - Shared app-side : contrats et nettoyages ([#322](https://github.com/bmatge/dsfr-data/issues/322)). `isDbMode()` ne fige plus le « simple mode » quand le premier ping échoue (backend qui redémarre) — l'échec réseau laisse le mode indéterminé et re-sonde au prochain appel. `fetchWithTimeout` **compose** le signal de l'appelant (`AbortSignal.any`) au lieu de l'écraser (l'annulation amont était impossible). Versions CDN alignées (`dsfr-chart` 2.0.5) et **gardées par test** contre `package.json`. La couche persistance n'affiche plus d'UI : le dépassement de quota émet `dsfr-data:storage-quota` (le chrome app-ui le transforme en toast). `PaletteType` retrouve son `keyof` (l'annotation `Record<string, …>` le résolvait en `string` — `satisfies` à la place). Code mort supprimé : `setAuthBaseUrl` (exporté, jamais appelé), `migration.ts`, exports orphelins `validateAndFilterArray`/`getAllProviders`.

- [#323](https://github.com/bmatge/dsfr-data/pull/323) [`f19f9c6`](https://github.com/bmatge/dsfr-data/commit/f19f9c6e10e1c7c561183559dab5b97f4c340ff7) Thanks [@bmatge](https://github.com/bmatge)! - Singletons auth/sync partagés via `window` ([#320](https://github.com/bmatge/dsfr-data/issues/320)) : les apps chargent les composants par bundles pré-compilés (`dsfr-data.esm.js`, `app-ui.esm.js`) ET importent `@dsfr-data/shared` aliasé sur `src` — deux copies compilées d'`auth-service` et `sync-queue` coexistaient à l'exécution : double `checkAuth` au démarrage, caches CSRF séparés, **indicateur de sync du header aveugle** (il écoutait la copie bundle quand les syncs réels passaient par la copie app), et `persistQueue()` d'une copie pouvait **écraser la file de l'autre** sous la même clé localStorage (perte d'écritures). L'état mutable des deux modules vit désormais dans un objet partagé `window.__dsfrDataAuthShared`/`__dsfrDataSyncShared` (même pattern que le data-bridge) : une seule vérité quelle que soit la copie.

- [#323](https://github.com/bmatge/dsfr-data/pull/323) [`f19f9c6`](https://github.com/bmatge/dsfr-data/commit/f19f9c6e10e1c7c561183559dab5b97f4c340ff7) Thanks [@bmatge](https://github.com/bmatge)! - `SourceElement` complété et consommé par les facettes ([#274](https://github.com/bmatge/dsfr-data/issues/274)) : nouvelle méthode `getAdapterParams()` exposant les paramètres adapter résolus de la source — headers effectifs avec `api-key-ref` inclus — déléguée à travers query, normalize, search, unpivot et join (vers la source gauche). `dsfr-data-facets` consomme cette interface au lieu de re-parser les attributs DOM : les facettes serveur ne répondent plus 401 sur les sources authentifiées par `api-key-ref`, et fonctionnent derrière unpivot/join. `unpivot` et `join` exposent aussi `getAdapter()`/`getEffectiveWhere()`.

- [#323](https://github.com/bmatge/dsfr-data/pull/323) [`f19f9c6`](https://github.com/bmatge/dsfr-data/commit/f19f9c6e10e1c7c561183559dab5b97f4c340ff7) Thanks [@bmatge](https://github.com/bmatge)! - Cohérence mode URL / mode adapter de `dsfr-data-source` ([#288](https://github.com/bmatge/dsfr-data/issues/288)) : les commandes where/orderBy/groupBy/aggregate reçues en mode URL sont **refusées explicitement** (warn unique pointant vers `api-type`) au lieu d'être stockées puis perdues — un refetch partait à URL identique, filtre silencieusement perdu ; les commandes `page` restent servies (pagination querystring), et une commande refusée ré-émet le cache (contrat « une commande produit toujours une émission », [#276](https://github.com/bmatge/dsfr-data/issues/276)). Watch-list complétée : changer `page-size`, `server-side`, `headers`, `method` ou `use-proxy` déclenche enfin un refetch (comme `api-key-ref`). Le piège `api-type="generic"` + `base-url` est signalé proprement (`validate()` explique le bon geste au lieu de laisser `fetchAll` jeter une unhandled rejection). `isLoading()` ne ment plus pendant un abort de fetch concurrent (jeton de génération : seul le fetch courant éteint le loading).

- [#323](https://github.com/bmatge/dsfr-data/pull/323) [`f19f9c6`](https://github.com/bmatge/dsfr-data/commit/f19f9c6e10e1c7c561183559dab5b97f4c340ff7) Thanks [@bmatge](https://github.com/bmatge)! - Storage/sync réellement local-first ([#321](https://github.com/bmatge/dsfr-data/issues/321)) : un item présent en local mais **absent du serveur** (créé hors-ligne, ou POST abandonné après les retries) n'est plus supprimé par le merge — il est conservé pour **toutes** les collections (favorites/dashboards n'avaient aucun merge : le serveur remplaçait le local). La **boucle de write-back disparaît** : le cache mis à jour par `load()` n'active plus le save-hook (`saveToStorageQuiet`) — chaque ouverture d'app re-téléchargeait puis re-téléversait l'intégralité des 5 collections préfetchées (GET + un PUT par item). Un `409` sur POST est **rejoué en PUT** au lieu d'être défilé comme un succès (la modification était perdue).

- [#323](https://github.com/bmatge/dsfr-data/pull/323) [`f19f9c6`](https://github.com/bmatge/dsfr-data/commit/f19f9c6e10e1c7c561183559dab5b97f4c340ff7) Thanks [@bmatge](https://github.com/bmatge)! - Nouveau `TransformerMixin` partagé par les 6 transformateurs du pipeline — query, join, unpivot, normalize, facets, search ([#280](https://github.com/bmatge/dsfr-data/issues/280)) : abonnement aux sources amont (multi-sources pour join), re-souscription, états loading/error avec contrats `isLoading()`/`getError()` identiques partout, ré-émission aval avec meta posée avant le dispatch, relais de commandes vers l'amont, validation de config. Trois divergences réelles corrigées : `dsfr-data-query` ne réinitialisait jamais son erreur après un succès, `dsfr-data-normalize`/`dsfr-data-unpivot` n'avaient ni état erreur ni loading, `dsfr-data-facets`/`dsfr-data-search` fuyaient leur abonnement quand `source` était vidé au runtime. Un test-garde statique interdit tout `subscribeToSource` manuel hors mixins.

- [#323](https://github.com/bmatge/dsfr-data/pull/323) [`f19f9c6`](https://github.com/bmatge/dsfr-data/commit/f19f9c6e10e1c7c561183559dab5b97f4c340ff7) Thanks [@bmatge](https://github.com/bmatge)! - Init unique au montage pour tous les composants du pipeline ([#281](https://github.com/bmatge/dsfr-data/issues/281)) : le double-init connectedCallback + premier cycle Lit (double abonnement, double lecture du cache, double émission, double négociation serveur) n'était corrigé que dans `dsfr-data-join` — le fix est généralisé dans `TransformerMixin` et `SourceSubscriberMixin` (le premier `willUpdate` est consommé sans ré-init). Corollaire join corrigé : un `dsfr-data-join` sans attributs signale enfin sa config manquante via `reportConfigError` (l'init n'était jamais appelée → échec 100 % silencieux). Hooks harmonisés (`willUpdate` partout — normalize/unpivot utilisaient `updated`) avec reinit/retraitement déclarés via `transformerReinitProps()`/`transformerReprocessProps()`. Bonus : un transformateur re-attaché au DOM se re-branche (Lit ne re-déclenche pas willUpdate à la reconnexion — un composant déplacé restait mort).

- [#323](https://github.com/bmatge/dsfr-data/pull/323) [`f19f9c6`](https://github.com/bmatge/dsfr-data/commit/f19f9c6e10e1c7c561183559dab5b97f4c340ff7) Thanks [@bmatge](https://github.com/bmatge)! - Alias d'agrégat unifié sur tout le pipeline ([#269](https://github.com/bmatge/dsfr-data/issues/269)) : `aggregate="population:sum"` produit désormais la colonne `population__sum` partout — client-side (`dsfr-data-query`), ODS, Tabular et Grist (SQL comme fallback Records). L'adapter Grist générait `sum_population`, ce qui cassait silencieusement le `value-field` d'un chart au changement de provider ou à la bascule SQL ↔ Records. Les 3 implémentations de `parseAggregates` sont factorisées (`packages/core/src/utils/aggregates.ts`), les segments malformés (`a:sum,`) sont ignorés au lieu de produire un agrégat invalide. Migration : si vous dépendiez de l'alias Grist `sum_population`, utilisez l'alias explicite `aggregate="population:sum:sum_population"`.

- [#323](https://github.com/bmatge/dsfr-data/pull/323) [`f19f9c6`](https://github.com/bmatge/dsfr-data/commit/f19f9c6e10e1c7c561183559dab5b97f4c340ff7) Thanks [@bmatge](https://github.com/bmatge)! - Format WHERE piloté par le dialecte du provider + échappement colon ([#271](https://github.com/bmatge/dsfr-data/issues/271)) : les facettes croisées sont jointes par `, ` en colon et `AND` en ODSQL (`joinWhere`) — elles produisaient des clauses invalides sur Grist/Tabular. Les valeurs contenant `,` `:` `|` (ex. « Provence, Alpes ») sont percent-encodées par `buildColonFacetWhere` et décodées par tous les parseurs colon (query, Grist SQL et Records, Tabular, INSEE) ; les 5 copies de construction de clauses facettes sont factorisées dans `packages/core/src/utils/where.ts`. L'échappement de `dsfr-data-search` suit le dialecte de l'adapter au lieu d'imposer l'ODSQL. `GenericAdapter` déclare `whereFormat: 'colon'`, conforme à ce qu'il émet réellement.

- [#323](https://github.com/bmatge/dsfr-data/pull/323) [`f19f9c6`](https://github.com/bmatge/dsfr-data/commit/f19f9c6e10e1c7c561183559dab5b97f4c340ff7) Thanks [@bmatge](https://github.com/bmatge)! - `dsfr-data-world-map` alignée sur la famille carte ([#299](https://github.com/bmatge/dsfr-data/issues/299)) : l'attribut `zoom` ('continent'|'none') devient `zoom-mode` — il collisionnait avec le `zoom` **numérique** Leaflet de `dsfr-data-map` (même nom, types opposés, même famille) ; l'ancien nom reste lu avec un warn de dépréciation. **Accessibilité clavier** : chaque pays est focusable (`tabindex`, `role`, `aria-label` nom + valeur annoncés au focus), Entrée/Espace déclenche le zoom continent — l'interaction était 100 % souris. Le TopoJSON (~140 Ko) n'est fetché qu'une fois par page (mémoïsation de la promesse — deux cartes simultanées le téléchargeaient deux fois). `code-field`/`value-field` manquants avec une `source` → `reportConfigError` (la carte restait grise en silence). Branche morte du render supprimée.

## 0.7.3

### Patch Changes

- [#252](https://github.com/bmatge/dsfr-data/pull/252) [`4a82f13`](https://github.com/bmatge/dsfr-data/commit/4a82f13df7da13a865f7f578ddc1e9ccab66ddfe) Thanks [@bmatge](https://github.com/bmatge)! - feat(proxy): route les API tierces à clé en en-tête via le proxy CORS générique

  Une connexion API manuelle vers un hôte inconnu (ex. une instance OpenDataSoft
  comme `data.economie.gouv.fr`) avec une clé en en-tête (`Apikey`, `Authorization`…)
  échouait à l'enregistrement avec « CORS Missing Allow Header ». L'en-tête custom
  rend la requête « non-simple » et déclenche un preflight `OPTIONS` que l'API
  distante ne sait pas honorer, car la requête partait en direct du navigateur
  (`getProxiedUrl` ne réécrivait que les hôtes connus).

  Nouveau helper `buildProxiedRequest(url, headers)` qui renvoie `{ url, headers }`
  et route les hôtes inconnus cross-origin via le proxy CORS générique
  (`/cors-proxy` + en-tête `X-Target-URL`), où c'est nginx (côté serveur) qui
  transmet l'en-tête custom à la cible. Les hôtes connus (Tabular, Grist, Albert,
  INSEE) gardent leurs proxies dédiés ; le same-origin reste en fetch direct.
  Le gestionnaire de connexions API (test à l'enregistrement + chargement paginé)
  utilise désormais ce helper. Le preflight `/cors-proxy` (nginx + dev Vite)
  autorise les en-têtes custom arbitraires.

  Côté authentification OpenDataSoft : ODS n'authentifie qu'une clé passée via
  `Authorization: Apikey <clé>` (en-tête) ou `?apikey=` (query). Deux corrections :
  - Nouveau helper `normalizeProviderAuthHeaders(apiUrl, headers)` qui détecte une
    clé fournie sous un en-tête mal nommé (`Apikey`, `api-key`, `x-api-key`) sur
    une source ODS et la réécrit au format `Authorization: Apikey <clé>`. Sans
    ça, ODS ignorait la clé et renvoyait un 404 trompeur (datasets privés masqués).
    Appliqué au test à l'enregistrement (avec persistance) et au chargement.
  - `resolveSourceUrl` conserve désormais le param `apikey` collé dans l'URL lors
    de la normalisation vers l'endpoint `/records` (les autres params restent
    gérés par l'adapter), pour que la méthode `?apikey=` fonctionne aussi.

- [#243](https://github.com/bmatge/dsfr-data/pull/243) [`4b851f9`](https://github.com/bmatge/dsfr-data/commit/4b851f9859d39b50d9b2cfaa18808ae8ece7cf48) Thanks [@bmatge](https://github.com/bmatge)! - feat(guide): permet de masquer les jeux de donnees de demonstration depuis la page Guide

  Ajoute un interrupteur "Masquer les jeux de donnees de demonstration" sur la page Guide, a cote du reglage d'activation/desactivation des visites guidees. Quand il est active, les jeux de donnees d'exemple (regions de France, evolution annuelle, catalogue de services) n'apparaissent plus dans les selecteurs de source du Builder et du Builder IA. Le reglage est persiste par utilisateur (localStorage + synchronisation serveur via `users.tour_state`, comme les visites guidees) et expose via `isDemoDatasetsDisabled()` / `setDemoDatasetsDisabled()` dans `@dsfr-data/shared`. Les demos restent affichees par defaut.

- [`114e2c8`](https://github.com/bmatge/dsfr-data/commit/114e2c8c6749c4602c6ccf964b99c6f77103fd6b) Thanks [@bmatge](https://github.com/bmatge)! - fix(grist): restaure le domaine ASCII `grist.numerique.gouv.fr` dans le routage proxy

  La passe d'accentuation automatique ([#214](https://github.com/bmatge/dsfr-data/issues/214)) avait accentué par erreur le nom de domaine en `grist.numérique.gouv.fr` dans les comparaisons de hostname (`getProxiedUrl`, `getProxyUrl`, provider Grist, test de connexion). Comme le vrai domaine est ASCII, la comparaison échouait silencieusement : les requêtes vers grist.numerique.gouv.fr ne passaient plus par le proxy `/grist-gouv-proxy/` mais partaient en direct depuis le navigateur → erreur CORS (`authorization` non autorisé en préflight). Le domaine est désormais ajouté en exception du check d'accents pour éviter toute régression.

- fix(product-tour): garde le bouton "Suivant" lisible au survol. Le hover changeait le fond en blanc tout en conservant le texte blanc — remplace par un outline de type focus, avec couleurs forcees pour neutraliser la cascade DSFR.

- [`d30b8ab`](https://github.com/bmatge/dsfr-data/commit/d30b8ab103c1ee9ea4f6006fabb4baa7a35b4724) Thanks [@bmatge](https://github.com/bmatge)! - feat(footer): affiche la version et le commit de build dans `<app-footer>`

  Le footer affiche désormais, sous le texte de présentation, une ligne discrète « Composants dsfr-data vX.Y.Z · commit <hash> » (le commit renvoie vers GitHub). Version et hash sont injectés au build de la lib (`scripts/build-lib.ts`, via `define` esbuild) ; le commit est dérivé de `git rev-parse` et surchargeable via `DSFR_DATA_COMMIT` pour les builds Docker sans `.git`.

- [`1222433`](https://github.com/bmatge/dsfr-data/commit/1222433dbeb5b670f70c790ab1e333c8bd6e93c5) Thanks [@bmatge](https://github.com/bmatge)! - fix(layout): `app-layout-builder` passe en page-scroll avec panneau droit sticky

  Le layout splitté ne verrouille plus tout dans le viewport (où le footer DSFR + le header écrasaient la zone de travail). Désormais la page défile, le panneau droit est `sticky` et garde une hauteur ~pleine page : en scrollant, le header sort du champ pendant que le footer reste sous la ligne de flottaison, et l'aperçu de droite reste visible quand la colonne de gauche (config) est longue. La cause racine côté apps était `body { min-height: 100vh }` (hauteur indéfinie) qui empêchait toute borne ; les apps builder, builder-IA et sources sont alignées sur le modèle page-scroll.

- [`9d82089`](https://github.com/bmatge/dsfr-data/commit/9d820897952fe453dcad54c7a8b0879d9d22cdb6) Thanks [@bmatge](https://github.com/bmatge)! - feat(providers): auto-détection de plateforme et résolution d'URL pour l'ajout de sources

  Nouveaux utilitaires exportés depuis `@dsfr-data/shared` :
  - `resolveSourceUrl(url)` : reconnaît la plateforme d'une URL collée (page humaine OU URL d'API) et déduit l'URL d'API canonique, sans appel réseau.
  - `parseDataGouvDataset(url)`, `dataGouvDatasetApiUrl(slug)`, `extractDataGouvResources(json)` : résolution d'une page de jeu de données data.gouv.fr en ses ressources interrogeables via l'API Tabular (filtre sur l'extra `analysis:parsing:parsing_table`).

  La détection de provider reconnaît désormais les **URLs de page** en plus des URLs d'API : pages explorer OpenDataSoft (`/explore/dataset/` et `/explore/assets/`, toutes versions) et permaliens de ressource data.gouv (`/datasets/r/{uuid}`).

- [#244](https://github.com/bmatge/dsfr-data/pull/244) [`9647586`](https://github.com/bmatge/dsfr-data/commit/9647586da7674e2c6702ef4cef0f1f76deca98a6) Thanks [@bmatge](https://github.com/bmatge)! - fix(tabular): retombe en agregation client-side quand les noms de colonnes contiennent des espaces ou de la ponctuation. La syntaxe a suffixe Tabular (`colonne__groupby`, `colonne__sum`) ne sait pas parser des colonnes comme "Date - Journee gaziere" ou "Inventaire LNG (m3 LNG)" et renvoyait une erreur "Malformed query" (HTTP 400). dsfr-data-query interroge desormais l'adapter via `supportsServerFields()` avant de deleguer group-by/aggregate/order-by au serveur.

- [#236](https://github.com/bmatge/dsfr-data/pull/236) [`f4fce99`](https://github.com/bmatge/dsfr-data/commit/f4fce99ef7ca33f4a4d4125e3a4a903a1dd30005) Thanks [@bmatge](https://github.com/bmatge)! - feat(core): consommer un tableur "wide" en HTML pur — `dsfr-data-unpivot` + attribut `compute`

  Deux ajouts qui transforment n'importe quel tableur orienté présentation (temps dans les noms de colonnes) en source consommable par le pipeline, sans une ligne de JavaScript.
  - **Nouveau composant `<dsfr-data-unpivot>`** — transformateur pur (frère de `dsfr-data-join`, aucun fetch HTTP) qui bascule un tableau « wide » en « long/tidy » (colonnes → lignes). Attributs : `id-cols`, `value-cols` / `value-cols-pattern` (motif `c{YYYY}_{MM}` avec tokens date à largeur fixe), `var-name`, `var-format`, `value-name`, `drop-empty`. La valeur reste brute — le typage est délégué à `numeric-auto` en aval. Un nouveau mois (nouvelle colonne) est déplié sans changer le HTML.
  - **Nouvel attribut `compute` sur `<dsfr-data-normalize>`** — colonnes calculées ligne à ligne (en dernier, sur valeurs déjà typées). Couvre la mise à l'échelle (`pct = valeur * 100`) et la clé composite (`groupe = Indicateurs + ' / ' + Sous_theme`). Arithmétique `+ - * /`, concaténation texte, parenthèses. Évaluateur d'expression sûr maison (tokenizer + descente récursive), jamais `eval()`. Hors périmètre : conditions, fonctions, calculs sur valeurs agrégées.
  - **Nouvel attribut `series-field` sur `<dsfr-data-chart>`** — mode multi-séries à partir de données long/tidy : les valeurs distinctes d'une colonne-clé deviennent autant de séries (complémentaire du mode large `value-fields`). C'est le consommateur naturel de `dsfr-data-unpivot` : `unpivot` → tidy → `series-field` rend N courbes. S'applique à bar/line/radar, prioritaire sur `value-fields`. Aucun changement dans `@gouvfr/dsfr-chart` (qui supporte déjà le multi-séries nativement).

  Inclus dans le bundle `core`. Skills builder-IA et specs mis à jour.

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

  L'URL est dérivée de `PROXY_BASE_URL_EMBED` (déjà exporté depuis `@dsfr-data/shared`) au moment de la génération du code — pas hardcodée — pour rester self-hostable conformément à l'épic [#168](https://github.com/bmatge/dsfr-data/issues/168) et l'ADR-026 (« accès direct `import.meta.env`, pas de valeur en dur »). Sur le déploiement de référence : `https://<ancienne-instance>/specs/`. Sur une instance self-hostée : l'URL du domaine embed configuré via `VITE_PROXY_URL_EMBED`.

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

  **Fail-fast runtime côté Express** (`server/src/utils/mailer.ts`) : plus de fallback vers `https://<ancienne-instance>` si `APP_URL` manque — l'envoi d'email throw à la première utilisation avec un message indiquant la résolution. Évite d'envoyer un email avec un lien pointant vers la mauvaise instance.

  **MCP server** (`mcp-server/src/index.ts`) : ajout de la variable d'environnement `DSFR_DATA_BASE_URL` comme alternative à `--url`. Le default (ancienne instance) est conservé (renommé `DEFAULT_PUBLIC_INSTANCE`) — exception assumée car le MCP est un tool public utilisé pour la découverte (`npx dsfr-data-mcp`).

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
  PROXY_BASE_URL = VITE_PROXY_URL || 'https://<ancienne-instance>'
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

  Avant : ces variables étaient documentées dans `.env.example` mais n'arrivaient jamais jusqu'au build Vite à l'intérieur du conteneur. Pire, l'accès via indirection (`const _meta = import.meta as any; _meta.env?.VITE_PROXY_URL`) dans `packages/shared/src/api/proxy-config.ts` empêchait Vite de faire la substitution statique même en build local — les bundles retombaient systématiquement sur le fallback `https://<ancienne-instance>`.

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
