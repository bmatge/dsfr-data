# dsfr-data-source

> Composant de connexion aux données (API REST)
>
> Déclencheurs : source, charger, connecter, rafraichir, url, api, données

## <dsfr-data-source> - Connexion aux données

Composant invisible qui récupéré des données depuis une API REST et les distribue
aux autres composants via un systeme de bus evenementiel (data-bridge).

### Format des données
dsfr-data-source attend une reponse JSON. L'attribut `transform` permet d'extraire le
tableau de données depuis la reponse. Le resultat DOIT etre un tableau d'objets plats :
`[{"region": "IDF", "population": 12000000}, {"region": "OCC", "population": 6000000}]`

### Attributs
| Attribut | Type | Défaut | Requis | Description |
|----------|------|--------|--------|-------------|
| id | String | - | oui | Identifiant unique. Les autres composants s'y abonnent via `source="cet-id"`. |
| url | String | `""` | oui | URL de l'API (GET par défaut) |
| method | String | `"GET"` | non | Méthode HTTP : GET ou POST |
| headers | String | `""` | non | En-tetes HTTP en JSON : `'{"Authorization": "Bearer xxx"}'` |
| params | String | `""` | non | Parametres de requete en JSON. Mode URL : query string (GET) ou corps (POST). Mode adaptateur (#726) : les paires sont ajoutees a l'URL construite par l'adaptateur — c'est ce qui permet a une page a `timezone` d'utiliser `fetch-mode="export"`, ex. `params='{"timezone":"Europe/Paris"}'` sur un jeu ODS a dates. Les cles que l'adaptateur construit lui-meme sont reservees, chacun declarant les siennes (#1137 — ODS : `select`, `where`, `group_by`, `order_by`, `limit`, `offset`, `facet` ; Tabular : `page`, `page_size`, `columns`, `or`, `champ__sort`…) : refusees avec une erreur de configuration. Transmis par OpenDataSoft seulement. |
| transform | String | `""` | non | Chemin JSONPath vers les données : `"results"`, `"data.items"`, `"records"` |
| refresh | Number | `0` | non | Rafraichissement auto en secondes (0 = desactive) |
| paginate | Boolean | `false` | non | Active la pagination serveur (injecte page/page_size dans l'URL, stocke la meta) |
| page-size | Number | `20` | non | Taille de page pour la pagination serveur (nombre de records par page) |
| cache-ttl | Number | `3600` | non | TTL du cache externe en secondes (0 = desactive). Actif uniquement si la page hote enregistre window.DSFR_DATA_CACHE_PROVIDER (#307) — no-op en embed anonyme. Repli hors ligne cote navigateur : AUCUN rapport avec le relais (`relay-url`), dont la duree de cache se regle sur le relais. |
| api-type | String | `"generic"` | non | Type de provider (opendatasoft, tabular, grist, insee, generic, ou un adaptateur ajoute par `registerAdapter`). Active le mode adapter. |
| base-url | String | `""` | non | URL de base de l'API (mode adapter). Ex: `"https://data.iledefrance.fr"` |
| dataset-id | String | `""` | non | ID du dataset (ODS). |
| resource | String | `""` | non | ID de la ressource (Tabular). |
| where | String | `""` | non | Clause WHERE statique (ODSQL ou colon syntax). Tabular : une liste `in`/`notin` dont une valeur porte une parenthese ou une virgule est deleguee, la valeur entre guillemets (#1233) ; si l'API refuse cette forme, la clause est calculee sur les lignes chargees. |
| select | String | `""` | non | Clause SELECT serveur (ODS). Ex: `"count(*) as total, region"`. Tabular : liste de NOMS de colonnes, envoyee en `columns=` (ex. `"nom_station, lat, lon"`) — seules ces colonnes reviennent ; ignore avec group-by/aggregate. |
| group-by | String | `""` | non | Group-by serveur (si supporte par le provider). ODS : accepte une expression aliasee, ex. `"year(date) as annee"` |
| aggregate | String | `""` | non | Agrégation serveur. Ex: `"population:sum"` |
| order-by | String | `""` | non | Tri serveur. Ex: `"population:desc"`. Tabular : au-dela d'une page, le jeu est relu sans tri et trie sur place, ou le tri est complete d'une cle de departage si `limit`/`max-records` coupe le chargement (#1202, #1233). |
| server-side | Boolean | `false` | non | Active la pagination serveur page par page (datalist, tableaux). La source ne livre qu'UNE page : une dsfr-data-query en aval qui regroupe ou agrege cote client passe en erreur de configuration (#1242). |
| limit | Number | `0` | non | Limite du nombre de resultats (0 = pas de limite). |
| max-records | Number | `0` | non | Plafond du fetchAll en mode adapter, honore par ODS (#233) et Tabular (#1027). 0 = plafond par defaut de l'adapter (ODS : 1000, Tabular : 25000). A relever pour charger un jeu plus long (ex. les ~35 000 communes sur Tabular : `max-records="40000"`) ou pour les dashboards « un fetch, N agregations client » — attention au volume (requetes en boucle, memoire). |
| fetch-mode | String | `"records"` | non | Strategie de chargement en mode adapter (#689). `"export"` charge tout le jeu en UNE requete via l'endpoint d'export du portail (ODS `/exports/json`), memes clauses select/where/group-by/order-by. A activer pour « un fetch, N agregations client », un jeu de plus de 1 000 lignes ou un group-by a beaucoup de groupes. Ignore avec `server-side` (avertissement console). Implemente par OpenDataSoft et Tabular ; repli automatique sur le chargement pagine si le portail n'expose pas d'export. Tabular (#1055) : lit l'export Parquet de data.gouv (lecteur ~22 Ko gzip charge a la demande), lignes brutes seulement — un where/group-by/aggregate/order-by delegue garde la pagination ; `max-records` borne les lignes lues. |
| require-where | Boolean | `false` | non | Ne rien charger tant qu'aucun filtre n'a été reçu (#690) : la source reste en attente et émet `dsfr-data-idle`, les afficheurs rendent « Choisissez un filtre pour afficher les données ». Le `where` STATIQUE ne compte pas — seules les clauses reçues par commande (facettes, recherche, dsfr-data-context, délégation d'un dsfr-data-query). Retirer le dernier filtre repasse en attente : jamais de requête « tout ». Réservé au mode adapter (les commandes where sont refusées en mode URL). |
| data | String | `""` | non | Données JSON inline (pas de fetch). Ex: `data='[{"x":1},{"x":2}]'` |
| use-proxy | Boolean | `false` | non | Force le passage par le proxy CORS generique. N'a d'effet QUE si une base de proxy est configuree (`proxy-url`, `window.DSFR_DATA_PROXY`, ou build) : en embed nu sur un site tiers sans aucune de ces sources, c'est un no-op (URL renvoyee inchangee). |
| proxy-url | String | `""` | non | Domaine du proxy CORS pour CETTE source, prioritaire sur `window.DSFR_DATA_PROXY` et la config build. Sert la reecriture d'hote connu (Grist gouv/SaaS, Tabular, INSEE) ET le `use-proxy` generique. Ex: `proxy-url="https://mon-proxy.fr"`. Vide = resolution proxy globale habituelle. Ne relaie PAS un portail Opendatasoft : pour cela, `relay-url`. |
| relay-url | String | `""` | non | Prefixe du relais cachable du SITE HOTE (#1232), relatif (`"/donnees-relais"`) ou absolu. Vide = `window.DSFR_DATA_RELAY`, sinon aucun relais. Avec un relais, toute requete GET vers une autre origine part sous la forme `<relais>/<hote>/<chemin>?<requete>`, en mode adaptateur comme en mode URL, SANS en-tete (ni `headers`, ni `api-key-ref` : la cle appartient au relais). Le relais est une route que le site fournit (contrat docs/RELAY.md) : ne le poser que si l'integrateur dit en avoir un — aucune instance publique n'en expose. |
| api-key-ref | String | `""` | non | Reference vers une clé API dans window.DSFR_DATA_KEYS. Injecte la valeur comme header Authorization. |

### Événements emis
- `dsfr-data-loaded` : données chargees (detail : tableau de données)
- `dsfr-data-loading` : chargement en cours
- `dsfr-data-error` : erreur (detail : objet Error)

### Methodes publiques
- `reload()` : force le rechargement des données
- `getData()` : retourne les données actuelles (tableau d'objets)

### Exemples
```html
<!-- API OpenDataSoft v2.1 -->
<dsfr-data-source id="prix"
  url="https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/mon-dataset/records"
  transform="results">
</dsfr-data-source>

<!-- API avec authentification et refresh toutes les 60s -->
<dsfr-data-source id="api-privee"
  url="https://mon-api.gouv.fr/data"
  method="POST"
  headers='{"Authorization": "Bearer TOKEN"}'
  params='{"limit": 100}'
  transform="data.items"
  refresh="60">
</dsfr-data-source>

<!-- API Tabular data.gouv.fr -->
<dsfr-data-source id="communes"
  url="https://tabular-api.data.gouv.fr/api/resources/RESOURCE_ID/data/?page_size=50"
  transform="data">
</dsfr-data-source>

<!-- API Tabular avec pagination serveur (navigation page par page) -->
<dsfr-data-source id="elus"
  url="https://tabular-api.data.gouv.fr/api/resources/RESOURCE_ID/data/"
  paginate
  page-size="20">
</dsfr-data-source>

<!-- API avec clé depuis le registre global (window.DSFR_DATA_KEYS) -->
<script>window.DSFR_DATA_KEYS = { tmdb: 'Bearer eyJ...' };</script>
<dsfr-data-source id="films"
  url="https://api.themoviedb.org/3/movie/popular"
  api-key-ref="tmdb"
  transform="results">
</dsfr-data-source>
```

> **Note** : les APIs Grist et ODS v1 renvoient des données imbriquees sous `fields`.
> Utilisez `<dsfr-data-normalize flatten="fields">` pour les aplatir avant de les passer
> aux facettes, datalist ou graphiques. Voir la doc de dsfr-data-normalize.

> **Mode adapter** : avec `api-type`, dsfr-data-source gere la pagination automatiquement.
> ODS: max 1000 records, Tabular: max 25000 records (125 pages de 200), Grist: toutes les données.
> ODS et Tabular : plafond relevable par `max-records` (ex. `max-records="40000"` sur Tabular = 200 pages de 200).
> Tabular : `select="col1, col2"` ne charge que ces colonnes (`columns=`, dix fois moins d'octets sur un jeu large) —
> y mettre TOUTES les colonnes lues en aval (graphique, liste, facettes, filtres), aucune n'est ajoutee d'office ;
> un nom inconnu fait repondre l'API en erreur. Sans effet avec `group-by`/`aggregate`. Les noms a espaces et
> accents se deleguent tels quels (group-by, agregat, filtre, tri) ; seuls `,` `:` `|` restent reserves.
> Tabular, `order-by` sur plusieurs pages (#1202, #1233) : l'API pagine par decalage et ne trie que sur une cle, donc un tri
> sur une cle non unique perd des lignes d'une page a l'autre (compte juste, lignes doublees ou absentes). La source le
> corrige seule, lignes brutes comme `group-by` : jeu complet → relu sans tri et trie sur place (une requete de plus,
> ordre du pipeline : vides, nombres, textes) ; `limit` ou `max-records` atteint → tri serveur complete d'une cle de
> departage. Une seule page : tri serveur inchange. Rien de tel en `server-side` : y trier sur une cle unique.
> Tabular, `where` avec `in`/`notin` et une valeur a parenthese ou a virgule (#1233) : la clause part au serveur,
> la valeur ENTRE GUILLEMETS (nue, l'API l'ecarterait sans erreur) — une requete filtree, sur la source comme sur une
> dsfr-data-query, en chargement complet comme en `server-side`. Si l'API refuse cette forme : en chargement complet
> la source charge les lignes des autres clauses et filtre sur place (resultat juste, jeu entier charge, un `group-by`
> a cote est rendu a une dsfr-data-query) ; en `server-side` la liste repart nue et le resultat est incomplet. Dans
> les deux cas le volet Diagnostic le signale.
> `server-side` et regroupement (#1242) : la source ne livre qu'UNE page. Une dsfr-data-query en aval qui regroupe ou
> agrege cote client (part, cumul, `explode`, agregat sans `group-by`, source partagee, transformateur amont) passe
> en ERREUR DE CONFIGURATION au lieu d'emettre un chiffre partiel. Correction : retirer `server-side` (jeu entier,
> dans la limite de `max-records`), ou donner a la query sa propre source sans `server-side` qui porte le
> `group-by`/`aggregate` delegable — la part se calcule alors en aval, sur les groupes.
> Le mode adapter ecoute aussi les commandes `dsfr-data-source-command` (page, where, orderBy)
> emises par dsfr-data-facets, dsfr-data-search et dsfr-data-list.

### Exemples mode adapter
\`\`\`html
<!-- ODS avec aggregation serveur -->
<dsfr-data-source id="src" api-type="opendatasoft"
  base-url="https://data.iledefrance.fr" dataset-id="elus-regionaux"
  select="count(*) as total, region" group-by="region">
</dsfr-data-source>

<!-- Tabular avec pagination serveur -->
<dsfr-data-source id="src" api-type="tabular"
  resource="abc-123" server-side page-size="50">
</dsfr-data-source>

<!-- Grist -->
<dsfr-data-source id="src" api-type="grist"
  base-url="https://proxy.example.com/grist-proxy/api/docs/x/tables/y/records"
  headers='{"Authorization": "Bearer TOKEN"}'>
</dsfr-data-source>
\`\`\`

### Pages d'exploration : ne rien charger tant que l'utilisateur n'a rien choisi

Une page où l'on choisit une commune, une année ou un thème avant de voir quoi que ce soit
ne doit PAS rapatrier le jeu entier au chargement : c'est une requête coûteuse dont
personne ne regarde le résultat. `require-where` sur la source (ou sur la requête) tient
le pipeline en attente jusqu'au premier filtre, et les afficheurs rendent un message
DSFR au lieu d'un graphique vide.

\`\`\`html
<dsfr-data-context id="ctx" sources="src">
  <dsfr-data-context-filter field="commune" operator="eq"></dsfr-data-context-filter>
</dsfr-data-context>

<!-- Aucune requête tant qu'aucune commune n'est choisie -->
<dsfr-data-source id="src" api-type="opendatasoft" require-where
  base-url="https://data.example.gouv.fr" dataset-id="equipements">
</dsfr-data-source>

<dsfr-data-list source="src" columns="commune,equipement"
  idle-message="Choisissez une commune pour afficher ses équipements">
</dsfr-data-list>
\`\`\`

Retirer le dernier filtre ramène la page en attente : il n'y a jamais de requête
« tout » implicite. L'état est visible dans le volet Diagnostic (« en attente d'un
filtre ») et sur le bus via l'événement `dsfr-data-idle`.

### Quand la source est en panne : message lisible, dit une fois (#1203)

Un échec de chargement n'affiche plus `Erreur de chargement: HTTP 503` en rouge dans chaque bloc.
Chaque bloc branché sur la source garde sa place et affiche un encart NEUTRE avec une phrase pour
l'usager ; le code HTTP, l'adresse appelée et l'heure sont repliés dans « Détails techniques ».
La phrase dépend de la cause :

| Cause | Phrase lue par l'usager | Réessayer |
|-------|-------------------------|-----------|
| HTTP 5xx, délai dépassé, réponse bloquée (CORS) | Données momentanément indisponibles. | oui |
| Hors connexion | Vous semblez hors connexion. | oui + automatique au retour du réseau |
| HTTP 429 | Le service est très sollicité. | oui, jamais automatique |
| HTTP 404 | Ces données ne sont plus publiées à cette adresse. | non |
| HTTP 401, 403 | Ces données ne sont pas accessibles publiquement. | non |
| HTTP 400, source mal configurée | Cet affichage n'a pas pu être construit. | non |

- `error-message="..."` sur la source remplace la phrase usager (le détail technique reste replié).
- `<dsfr-data-source-status source="id">` en haut du contenu dit la panne UNE fois par source, avec
  le seul bouton « Réessayer » : les blocs de cette source gardent leur message, sans bouton. Sans
  `source`, il suit toutes les sources de la page. Il n'affiche rien tant que tout va bien.
- Sans bandeau, chaque bloc en erreur porte son propre « Réessayer ».
- L'événement `dsfr-data-error` et la trace console ne changent pas : le code HTTP reste dans
  `error.message`.

```html
<dsfr-data-source-status source="prix"></dsfr-data-source-status>
<dsfr-data-source id="prix" api-type="opendatasoft" base-url="https://data.economie.gouv.fr"
  dataset-id="prix-carburants" error-message="Les prix sont en cours de mise à jour.">
</dsfr-data-source>
<dsfr-data-kpi source="prix" valeur="avg:prix" label="Prix moyen"></dsfr-data-kpi>
```

### Référence `<dsfr-data-source>` (générée depuis le code)

**Rôle pipeline** : autonome — n’utilise pas les mixins d’abonnement du pipeline (voir les événements ci-dessous).

**Attributs**

| Attribut | Type | Défaut | Description |
|---|---|---|---|
| `aggregate` | `string` | `""` (vide) | Agrégation, déléguée aux adaptateurs déclarant `serverGroupBy`. |
| `api-key-ref` | `string` | `""` (vide) | Référence vers une clé API déclarée dans window.DSFR_DATA_KEYS |
| `api-type` | `string` | `'generic'` | Type d'API : l'identifiant d'un adaptateur du registre (ceux de la bibliothèque, ou un adaptateur ajouté par `registerAdapter`). Toute autre valeur que `generic` active le mode adaptateur ; `generic` avec une `url` reste en mode URL. |
| `base-url` | `string` | `""` (vide) | URL de base de l'API, pour les adaptateurs qui adressent un portail par son URL. |
| `cache-ttl` | `number` | `3600` | TTL du cache externe en secondes (0 = desactive). Actif uniquement si la page hote enregistre `window.DSFR_DATA_CACHE_PROVIDER` (#307) — no-op en embed anonyme. C'est un repli hors ligne, côté navigateur : il n'a AUCUN rapport avec le relais (`relay-url`), ne lui est pas transmis et ne règle pas la durée de son cache. |
| `data` | `string` | `""` (vide) | Données JSON inline (pas de fetch) |
| `dataset-id` | `string` | `""` (vide) | Identifiant du jeu de données, pour les adaptateurs qui désignent un jeu par son identifiant. |
| `error-message` | `string` | `""` (vide) | Phrase affichée à l'usager quand cette source est en panne (#1203), à la place du message du barème — dans les blocs branchés sur la source comme dans le bandeau `dsfr-data-source-status`. `error-message="Les chiffres de la DGFiP sont en cours de mise à jour."` : à poser quand l'intégrateur sait mieux que la bibliothèque dire qui publie les données et quoi faire. Ne remplace QUE la phrase usager d'un échec de chargement : le code HTTP, l'adresse appelée et l'heure restent dans « Détails techniques », l'`Error` de `dsfr-data-error` et la console ne changent pas. Sans effet sur une erreur de configuration de la source. |
| `fetch-mode` | `'records' \| 'export'` | `'records'` | Stratégie de chargement en mode adaptateur (#689) : `records` (défaut, comportement historique — pagination par pages) ou `export`, qui charge tout le jeu en **une seule requête**, ou en quelques plages, sur l'endpoint d'export de l'API. Implémenté par les adaptateurs qui ont un endpoint d'export (table des capacités d'ARCHITECTURE, ligne « chargement en une requête ») ; les autres ignorent l'attribut. Selon l'adaptateur, l'export porte les mêmes clauses (`select`, `where`, `group-by`, `order-by`) ou ne rend que des **lignes brutes** (#1055) : dans ce dernier cas, avec un `where`, `group-by`, `aggregate` ou `order-by` délégué (posé sur la source ou transmis par une `dsfr-data-query`), la source reste sur la pagination, qui les exécute côté serveur, et le dit en console. Un export binaire (colonnes projetées depuis `select`) charge son lecteur à la demande seulement. Pour une première page rapide sur un petit jeu, la pagination reste plus vive ; l'export l'emporte au-delà de 1 000 à 2 000 lignes. À activer pour une page « un fetch, N agrégations client », un jeu de plus de 1 000 lignes, ou un `group-by` à beaucoup de groupes : l'API les rend tous d'un coup au lieu d'une page. À ne pas activer avec `server-side` (pagination page par page), qui reste sur l'endpoint paginé et signale la contradiction dans la console. En mode `export` le total serveur est inconnu : la troncature est détectée en demandant une ligne de plus que le plafond `max-records`, qui borne aussi les lignes lues. Si l'API n'expose pas d'endpoint d'export, la source retombe une fois sur le chargement paginé, avec un avertissement en console. |
| `group-by` | `string` | `""` (vide) | Group-by, délégué aux adaptateurs déclarant `serverGroupBy`. Avec un `select` en clause complète, un élément peut être une expression aliasée, avec ou sans fonction (`year(date) as annee`, `periode as an`), transmise telle quelle — l'alias `as` y est obligatoire (#641). Même découpe et même échappement que `select` (#767) : `date_format(d, 'yyyy-MM') as m` reste d'un seul tenant. |
| `headers` | `string` | `""` (vide) | En-têtes HTTP en JSON. Ex: `'{"Authorization": "Bearer xxx"}'`. Quand le fournisseur attend sa clé sous un en-tête précis (déclaré par sa configuration), un `apikey` nu est réécrit automatiquement au bon format (#655) ; détail par fournisseur : table des capacités d'ARCHITECTURE. |
| `lazy` | `boolean` | `false` | Ne rien charger tant que personne ne regarde (#931, AM-083). Une page à onglets déclare ses sources pour TOUS les panneaux ; cinq sur six sont fermés à l'arrivée, et pourtant toutes les requêtes partent au chargement. Avec `lazy`, la première requête attend qu'un consommateur de cette source entre dans une marge de 200 px autour du viewport (`IntersectionObserver`, la même marge que `dsfr-data-map` et que le `lazy` de `dsfr-data-repeat`, #891). Un panneau d'onglet fermé est en `display:none` : il n'a pas de boîte, il n'intersecte donc jamais, et l'observateur se déclenche à l'ouverture de l'onglet. **Ce qui est observé** : les FEUILLES de la chaîne aval (chart, list, kpi, display, podium, a11y, repeat ; pour une couche de carte, la carte qui la porte), suivies à travers les transformateurs — un `dsfr-data-query` est un tuyau déclaré en haut de page, l'observer reviendrait à ne rien différer. `lazy-target` remplace cette détection par un sélecteur explicite. **Opt-in strict** : sans l'attribut, la source part au chargement, exactement comme avant. **Dégradations, toutes du côté « on charge » :** sans `IntersectionObserver`, la source part immédiatement ; si la page ne déclare AUCUN consommateur (ou si `lazy-target` ne désigne rien), la source part immédiatement et le dit en console — une source qui ne chargerait jamais serait pire que le trafic qu'on cherche à éviter. **Ce que `lazy` ne promet pas** : un `IntersectionObserver` n'est pas continu. Il échantillonne aux temps de rendu ; un défilement par crans rapides (barre de défilement jetée, `scrollIntoView` enchaînés) peut traverser un consommateur sans jamais le rapporter comme visible — la source reste alors en attente jusqu'au prochain passage. C'est le comportement du navigateur, pas un bug de la bibliothèque. Se cumule avec `require-where` : les deux portes doivent s'ouvrir, et `require-where` est évalué en premier (c'est son message d'attente que l'utilisateur doit lire). Sans effet en mode données inline (`data`), qui ne fait aucune requête. |
| `lazy-target` | `string` | `""` (vide) | Sélecteur CSS de l'élément dont la visibilité déclenche le chargement, à la place des consommateurs détectés (#931). Sans effet sans `lazy`. `lazy lazy-target="#panneau-2"` : la source part quand le panneau entre dans la marge de 200 px. À utiliser quand la détection automatique ne peut pas voir le bon élément — un consommateur créé en JavaScript, une carte dont on préfère observer la section entière, ou plusieurs blocs qu'on veut traiter comme un seul (le sélecteur peut désigner plusieurs éléments : le PREMIER vu ouvre la porte). Sélecteur invalide, ou qui ne désigne aucun élément : la source part immédiatement, avec un message en console. Rien de silencieux. |
| `limit` | `number` | `0` | Limite du nombre de résultats |
| `max-records` | `number` | `0` | Plafond de lignes du chargement complet en mode adaptateur (#233, #1027), honoré par les adaptateurs qui paginent eux-mêmes leur chargement complet. 0 = plafond par défaut de l'adaptateur (valeurs par adaptateur : table des capacités d'ARCHITECTURE, ligne « plafond fetchAll »). À relever explicitement pour charger un jeu plus long par la pagination — par exemple une carte des ≈ 35 000 communes (`max-records="40000"`) — ou pour les tableaux de bord « un fetch, N agrégations client » : attention au nombre de requêtes en boucle (une par page de l'API) et au poids mémoire. Un `limit` plus petit reste prioritaire. Quand le plafond coupe le jeu, la source signale la troncature (`truncated`) et un avertissement console cite `max-records`. Un chargement coupé par le plafond et trié (`order-by`) rend les premières lignes du tri, chacune une fois : sur Tabular, le tri délégué est complété d'une clé de départage (#1233). Si l'API la refuse, le tri du serveur est gardé tel quel et le volet Diagnostic signale un tri instable — des lignes à valeurs égales peuvent alors manquer ou être doublées aux limites de page. |
| `method` | `'GET' \| 'POST'` | `'GET'` | Méthode HTTP : `GET` (défaut) ou `POST`. |
| `order-by` | `string` | `""` (vide) | Tri (`champ:asc, champ2:desc`), délégué aux adaptateurs déclarant `serverOrderBy`. Une API qui pagine par décalage et ne trie que sur une clé (Tabular) rend un ordre instable d'une page à l'autre dès que la clé n'est pas unique : des lignes reviennent deux fois, d'autres jamais, pour un compte juste. Un tri délégué qui s'étend sur plusieurs pages est donc rendu sûr par l'adaptateur (#1202, #1233), lignes brutes comme groupes d'un `group-by` : - tout le jeu est chargé : il est relu sans tri et trié sur place (une requête de plus), dans l'ordre du pipeline — vides, puis nombres, puis textes —, le même que celui d'une `dsfr-data-query` ; - `limit` ou `max-records` coupe le chargement : le tri reste au serveur, complété d'une clé de départage (l'identifiant de ligne, ou les autres colonnes du `group-by`) qui le rend total. Un chargement d'une seule page, et un regroupement trié sur sa seule colonne de regroupement, gardent le tri du serveur tel quel. |
| `page-size` | `number` | `20` | Taille de page pour la pagination serveur (nombre de records par page). |
| `paginate` | `boolean` | `false` | Active la pagination serveur en mode URL : injecte page/page_size dans l'URL et publie la meta. La source ne livre alors qu'UNE page. Une `dsfr-data-query` en aval qui regroupe ou agrège (`group-by`, `aggregate`, `explode`) calcule sur cette seule page : le chiffre est partiel. Le mode URL ne délègue rien et aucun attribut ne lui fait charger le jeu entier — sans `paginate`, c'est la page par défaut de l'API qui revient. La requête le dit donc sans se refuser (#1242) : avertissement en console, réserve au volet Diagnostic. Pour un chiffre sur tout le jeu, passer par un `api-type` qui sait le charger, ou par une URL qui rend déjà l'agrégat. |
| `params` | `string` | `""` (vide) | Paramètres de requête en JSON. Mode URL : query string en GET, corps de la requête en POST. **Mode adaptateur** (#726) : les paires sont ajoutées à l'URL construite par l'adaptateur, ce qui sert les paramètres propres à l'API que la bibliothèque ne modélise pas — par exemple `params='{"timezone":"Europe/Paris"}'` pour lire des dates dans un fuseau donné, sans quitter le mode adaptateur. Les clés que l'adaptateur construit lui-même (il les déclare : clauses, pagination, projection, suffixes d'opérateur) sont réservées : elles sont refusées avec une erreur de configuration plutôt que d'écraser une clause (#1137). Seuls les adaptateurs qui acceptent des paramètres libres les transmettent (en chargement paginé comme en `fetch-mode="export"`) ; les autres les ignorent — voir la table des capacités d'ARCHITECTURE. |
| `proxy-url` | `string` | `""` (vide) | Domaine du proxy CORS pour CETTE source (#340), prioritaire sur `window.DSFR_DATA_PROXY` et la config build-time. Sert à la fois la réécriture des hôtes connus et le `use-proxy` générique. Vide = résolution proxy globale habituelle. Ex: `proxy-url="https://mon-proxy.fr"`. Seuls les hôtes connus sont relayés (Tabular, Grist gouv et SaaS, Albert, INSEE Melodi). Sur tout autre hôte — un portail Opendatasoft en mode adaptateur, ou une URL quelconque sans `use-proxy` — l'attribut est SANS EFFET : la requête part en direct vers l'API. La source l'écrit alors une fois en console (« proxy-url est sans effet »), et le volet Diagnostic le reprend. Pour faire passer un portail Opendatasoft (ou tout autre hôte) par le domaine du site, c'est `relay-url` qu'il faut poser : `proxy-url` désigne un autre contrat (endpoints dédiés et `/cors-proxy`, toutes méthodes, en-têtes transmis). Avec un relais, `proxy-url` ne sert plus que les requêtes que le relais ne porte pas (POST du mode SQL de Grist). |
| `refresh` | `number` | `0` | Rafraîchissement automatique en secondes (0 = désactivé). |
| `relay-url` | `string` | `""` (vide) | Préfixe du relais cachable du site hôte (ADR-155, #1232) : le chemin que le site a choisi pour sa route de relais (`relay-url="/relais"`), ou une URL absolue (`relay-url="https://site.example/relais"`). Vide : la valeur de `window.DSFR_DATA_RELAY`, sinon aucun relais — et alors rien ne change. Avec un relais, toute requête GET vers une autre origine part sous la forme `relais/hôte/chemin?requête` (le préfixe du relais, l'hôte de la cible, puis son chemin et sa requête), en mode adaptateur comme en mode URL : filtres, regroupements, tri et pagination délégués restent dans l'URL, que le relais transmet telle quelle. Deux cibles donnent deux URL, une même requête donne la même URL au caractère près : le site peut les mettre en cache. Le relais est une route que LE SITE HÔTE fournit, selon le contrat `docs/RELAY.md` (relais de référence : `proxy/relay/node/`). Aucune instance publique n'en expose. Sur une requête relayée, aucun en-tête n'est envoyé : ni `headers`, ni `api-key-ref` (la clé appartient au relais, qui l'ajoute par hôte), ni cookie. Si l'un de ces attributs est posé, la source l'écrit une fois en console. Ne passent PAS par le relais, et gardent le chemin habituel (direct ou `proxy-url`) : une URL relative ou de même origine ; une requête POST (mode SQL de Grist, `method="POST"`) ; une cible hors `https`, sur un port explicite ou avec identifiants ; un chemin que le relais refuserait (`%2f`, `%2e`, `//`…) — ces deux derniers cas avec un avertissement. `fetch-mode="export"` sur l'API Tabular (export Parquet) retombe sur la pagination, relayée. Une URL de relais de plus de 8 000 caractères part quand même au relais, qui répond 414. Si le relais répond 503 (place momentanément prise : il n'a pas de file d'attente), la requête est réessayée trois fois au plus, après le délai qu'il annonce ; jamais sur un 429. Sans rapport avec `cache-ttl` : la durée de cache se règle sur le relais. |
| `require-where` | `boolean` | `false` | Ne rien charger tant qu'aucun filtre n'a été reçu (#690). Pensé pour les pages d'exploration : sans cet attribut, une source interroge l'API dès le montage et rapatrie le jeu entier — une requête coûteuse dont personne ne regarde le résultat. Avec lui, la source reste en attente, émet `dsfr-data-idle` et ne part chercher les données qu'au premier filtre. Ce qui compte comme filtre : les clauses reçues par commande — facettes, recherche, `dsfr-data-context`, délégation d'un `dsfr-data-query` (son `where`, avec ou sans `group-by`, quand elle est seule lectrice de la chaîne — #856). Le `where` STATIQUE de la source ne compte PAS : il fait partie de la définition du jeu, pas du geste de l'utilisateur ; le contraire rendrait l'attribut sans effet sur toute source qui restreint déjà son périmètre. Quand le dernier filtre est retiré, la source repasse en attente : jamais de requête « tout » implicite. Sans effet en mode données inline (`data`), qui ne fait aucune requête. |
| `resource` | `string` | `""` (vide) | Identifiant de la ressource (fichier d'un jeu), pour les adaptateurs qui désignent une ressource. |
| `select` | `string` | `""` (vide) | Clause SELECT, liste séparée par des virgules. Sa grammaire dépend de l'adaptateur (table des capacités d'ARCHITECTURE, ligne « projection select ») : clause complète ou simple liste de noms de colonnes ; un adaptateur sans projection l'ignore. **Clause complète** : `select="count(*) as total, region"`. Une expression (fonction, alias `as`, `*`, chemin pointé, opérateur) est transmise telle quelle ; un nom de champ qui n'est pas un identifiant nu (espace, accent, chiffre initial comme `1_uai`) est échappé automatiquement (#767). Une virgule à l'intérieur d'une fonction ou d'une chaîne ne sépare pas. Un `select` fait UNIQUEMENT d'agrégats, sans `group-by` (`select="sum(montant) as total"`) se charge en une requête d'une ligne, la valeur calculée par le serveur sur tout le jeu (#810) ; si le filtre ne garde aucune ligne, un `count` vaut 0 et les autres fonctions `null`. Quand une `dsfr-data-query` délègue son regroupement à cette source, le `select` émis est COMPOSÉ depuis l'`aggregate` de la query (colonnes d'agrégat + colonnes du `group-by`) : ce `select` ne l'écrase pas, sinon la colonne d'alias n'existerait pas dans la réponse et le chiffre affiché serait faux (#859). S'il définit une colonne par une expression aliasée (`year(date) as annee`) que le regroupement vise, la délégation est refusée — avertissement en console, regroupement calculé côté client. **Liste de noms de colonnes** (projection seule, #985) : `select="nom, Code sexe"`, espaces et accents admis — l'API ne rend que ces colonnes, soit dix fois moins d'octets sur un jeu large. Aucune colonne n'est ajoutée d'office : une colonne lue en aval (graphique, liste, facette, filtre client) doit y figurer, et un nom inconnu du jeu fait répondre l'API en erreur. Sans effet quand un `group-by` ou un `aggregate` est posé (sur la source ou délégué par une query), si l'API refuse la projection à côté d'un agrégateur. Une expression (fonction, alias, `*`) est ignorée avec un avertissement : toutes les colonnes sont chargées. |
| `server-side` | `boolean` | `false` | Mode pagination serveur (datalist, tableaux). Ce qui est délégué ne change pas avec ce mode : une page porte les mêmes filtres, le même regroupement et les mêmes agrégats qu'un chargement complet — seule la façon dont les lignes arrivent change (#852). La source ne livre qu'UNE page : rien de ce qui se calcule côté client sur l'ensemble des lignes n'a de sens derrière elle. Une `dsfr-data-query` en aval dont le regroupement ou l'agrégat n'est pas délégué — part ou cumul, `explode`, agrégat sans `group-by`, fonction que l'adaptateur ne traduit pas, transformateur amont qui change les colonnes, source lue par d'autres composants, source déjà regroupée — passe en **erreur de configuration** au lieu d'émettre un chiffre partiel (#1242). Deux corrections : - retirer `server-side` : la source charge le jeu entier, dans la limite de `max-records` ; - si le jeu dépasse ce plafond, ou si une liste paginée lit la même source : donner à la requête sa propre source sans `server-side`, qui porte le regroupement délégable (`group-by`, `aggregate`) — le serveur regroupe alors le jeu entier, et la part ou le cumul se calcule en aval, sur les groupes. Une requête qui délègue réellement son regroupement, ou qui ne regroupe pas (filtre et tri d'un tableau paginé), n'est pas concernée. |
| `transform` | `string` | `""` (vide) | Chemin JSONPath vers le tableau de données dans la réponse. Ex: `"results"`, `"data.items"`. |
| `url` | `string` | `""` (vide) | URL de l'API a interroger (mode URL brute). Vide en mode adapter ou en mode `data` inline. |
| `use-proxy` | `boolean` | `false` | Force le passage par le proxy CORS générique (pour les APIs externes sans CORS). Ne vaut qu'en mode URL (`url="…"`) : avec un `api-type`, l'attribut est sans effet sur un hôte que le proxy ne relaie pas par un endpoint dédié (un portail Opendatasoft, par exemple) — la requête part en direct, et la source le signale une fois en console. Sans effet sur une requête qui part au relais (`relay-url`) : le relais prend toutes les requêtes GET vers une autre origine, `use-proxy` ne garde que ce que le relais ne porte pas (requêtes POST, cible hors `https`). |
| `where` | `string` | `""` (vide) | Clause WHERE statique, déléguée à l'API de l'adaptateur. Une liste `in` ou `notin` dont une valeur porte une parenthèse ou une virgule est déléguée comme les autres (#1233). Sur l'API Tabular, qui écarte sans erreur une telle valeur écrite nue, l'adaptateur l'envoie entre guillemets — seule forme que l'API lise —, en chargement complet comme en pagination serveur ; les autres valeurs de la liste restent nues. Cette forme n'est écrite dans aucune documentation de l'API. Si elle est refusée, l'adaptateur se replie, et le volet Diagnostic le signale : - en chargement complet, il calcule la clause lui-même, sur les lignes chargées. Le résultat reste juste ; les autres clauses restent déléguées, mais toutes les lignes qu'elles gardent sont chargées (une requête par page, sous `max-records`), et un `group-by` posé à côté n'est plus délégué — les lignes filtrées sont rendues brutes, une `dsfr-data-query` en aval regroupe ; - en pagination serveur (`server-side`), où ce calcul n'est pas possible, la liste repart sans guillemets : la valeur est écartée par l'API et le résultat est incomplet. |


**Méthodes publiques**

| Méthode | Retour | Description |
|---|---|---|
| `getAdapter()` | `ApiAdapter \| null` | Returns the adapter for this source (if in adapter mode) |
| `getAdapterParams()` | `AdapterParams` | Paramètres adapter resolus, headers effectifs inclus (headers + api-key-ref). Consomme par les composants aval via SourceElement (#274). |
| `getData()` | `unknown` | — |
| `getEffectiveWhere(excludeKey?: string | string[])` | `string` | Returns the effective WHERE clause (static + all dynamic overlays merged). `excludeKey` : un whereKey, ou une liste de whereKeys a ignorer (#678 — une facette en mode `context` emet un whereKey PAR champ et doit les exclure tous du where de base de sa cascade). |
| `getError()` | `Error \| null` | — |
| `isLoading()` | `boolean` | — |
| `reload()` | `void` | Relance le chargement à l'identique (mêmes filtres, même page). C'est ce que fait « Réessayer » (#1203), par la commande `{ reload: true }`. |


**Événements** (émis sur `document` : ecouter via `document.addEventListener`, filtrer sur `detail.sourceId`)

| Événement | Payload | Direction | Quand |
|---|---|---|---|
| `cache-fallback` | — | émis | `{ sourceId }` sur l'élément — les données servies viennent du cache externe après un echec reseau (#307). |
| `dsfr-data-loaded` | — | émis | `{ sourceId, data }` sur `document` — données chargees et publiees sous l'`id` de cette source. C'est l'evenement que tout l'aval ecoute. |
| `dsfr-data-loading` | — | émis | `{ sourceId }` sur `document` — un chargement demarre. |
| `dsfr-data-error` | — | émis | `{ sourceId, error, attemptedUrl? }` sur `document` — le fetch ou le parsing a echoue. `attemptedUrl` (#603) porte l'URL REELLEMENT appelee, proxy applique : elle diverge souvent du `base-url` ecrit dans le HTML, et le message de l'`Error` reste volontairement court. La cle est absente quand l'URL n'a pas pu être construite, ou pour une erreur qui ne vient pas d'un fetch (données inline invalides, configuration). |
| `dsfr-data-idle` | — | émis | `{ sourceId, reason }` sur `document` — la source attend un filtre (`require-where` posé, aucun filtre reçu). Aucune requête n'est partie : l'état est distinct d'un chargement, d'une erreur et d'un résultat vide. Les afficheurs le rendent en message « choisissez un filtre » (#690). Le contrat de cet événement ne change pas avec le message lisible des blocs (#1203) : le code HTTP reste dans `error.message`, et l'échec reste journalisé en console. |


**Slots** — aucun (le composant rend son propre contenu).

**Variables CSS publiques** — aucune (styler via les variables du DSFR sur le conteneur parent).


### Référence `<dsfr-data-source-status>` (générée depuis le code)

**Rôle pipeline** : autonome — n’utilise pas les mixins d’abonnement du pipeline (voir les événements ci-dessous).

**Attributs**

| Attribut | Type | Défaut | Description |
|---|---|---|---|
| `source` | `string` | `""` (vide) | Id de la source à suivre. Vide : toutes les sources de la page, un message par source en panne. Une étape intermédiaire (`dsfr-data-query`…) branchée sur la source est suivie avec elle : c'est la source qui charge qui est relancée. |



**Événements** (émis sur `document` : ecouter via `document.addEventListener`, filtrer sur `detail.sourceId`)

| Événement | Payload | Direction | Quand |
|---|---|---|---|
| `dsfr-data-source-command` | — | émis | `{ sourceId, reload: true }` sur `document` — « Réessayer » a été activé : la source d'origine de la panne recharge à l'identique. |


**Slots** — aucun (le composant rend son propre contenu).

**Variables CSS publiques** — aucune (styler via les variables du DSFR sur le conteneur parent).
