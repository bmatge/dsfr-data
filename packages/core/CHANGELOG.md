# dsfr-data

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
