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
| params | String | `""` | non | Parametres de requete en JSON. Mode URL : query string (GET) ou corps (POST). Mode adaptateur (#726) : les paires sont ajoutees a l'URL construite par l'adaptateur — c'est ce qui permet a une page a `timezone` d'utiliser `fetch-mode="export"`, ex. `params='{"timezone":"Europe/Paris"}'` sur un jeu ODS a dates. Les cles construites par la bibliotheque (`select`, `where`, `group_by`, `order_by`, `limit`, `offset`, `facet`) sont reservees : refusees avec une erreur de configuration. Transmis par OpenDataSoft seulement. |
| transform | String | `""` | non | Chemin JSONPath vers les données : `"results"`, `"data.items"`, `"records"` |
| refresh | Number | `0` | non | Rafraichissement auto en secondes (0 = desactive) |
| paginate | Boolean | `false` | non | Active la pagination serveur (injecte page/page_size dans l'URL, stocke la meta) |
| page-size | Number | `20` | non | Taille de page pour la pagination serveur (nombre de records par page) |
| cache-ttl | Number | `3600` | non | TTL du cache externe en secondes (0 = desactive). Actif uniquement si la page hote enregistre window.DSFR_DATA_CACHE_PROVIDER (#307) — no-op en embed anonyme. |
| api-type | String | `"generic"` | non | Type de provider (opendatasoft, tabular, grist, generic). Active le mode adapter. |
| base-url | String | `""` | non | URL de base de l'API (mode adapter). Ex: `"https://data.iledefrance.fr"` |
| dataset-id | String | `""` | non | ID du dataset (ODS). |
| resource | String | `""` | non | ID de la ressource (Tabular). |
| where | String | `""` | non | Clause WHERE statique (ODSQL ou colon syntax). |
| select | String | `""` | non | Clause SELECT serveur (ODS). Ex: `"count(*) as total, region"` |
| group-by | String | `""` | non | Group-by serveur (si supporte par le provider). ODS : accepte une expression aliasee, ex. `"year(date) as annee"` |
| aggregate | String | `""` | non | Agrégation serveur. Ex: `"population:sum"` |
| order-by | String | `""` | non | Tri serveur. Ex: `"population:desc"` |
| server-side | Boolean | `false` | non | Active la pagination serveur page par page (datalist, tableaux). |
| limit | Number | `0` | non | Limite du nombre de resultats (0 = pas de limite). |
| max-records | Number | `0` | non | Plafond du fetchAll en mode adapter (#233). 0 = plafond par defaut de l'adapter (ODS : 1000). A relever explicitement pour les dashboards « un fetch, N agregations client » — attention au volume (requetes en boucle, memoire). |
| fetch-mode | String | `"records"` | non | Strategie de chargement en mode adapter (#689). `"export"` charge tout le jeu en UNE requete via l'endpoint d'export du portail (ODS `/exports/json`), memes clauses select/where/group-by/order-by. A activer pour « un fetch, N agregations client », un jeu de plus de 1 000 lignes ou un group-by a beaucoup de groupes. Ignore avec `server-side` (avertissement console). Implemente par OpenDataSoft seulement ; repli automatique sur le chargement pagine si le portail n'expose pas d'export. |
| require-where | Boolean | `false` | non | Ne rien charger tant qu'aucun filtre n'a été reçu (#690) : la source reste en attente et émet `dsfr-data-idle`, les afficheurs rendent « Choisissez un filtre pour afficher les données ». Le `where` STATIQUE ne compte pas — seules les clauses reçues par commande (facettes, recherche, dsfr-data-context, délégation d'un dsfr-data-query). Retirer le dernier filtre repasse en attente : jamais de requête « tout ». Réservé au mode adapter (les commandes where sont refusées en mode URL). |
| data | String | `""` | non | Données JSON inline (pas de fetch). Ex: `data='[{"x":1},{"x":2}]'` |
| use-proxy | Boolean | `false` | non | Force le passage par le proxy CORS generique. N'a d'effet QUE si une base de proxy est configuree (`proxy-url`, `window.DSFR_DATA_PROXY`, ou build) : en embed nu sur un site tiers sans aucune de ces sources, c'est un no-op (URL renvoyee inchangee). |
| proxy-url | String | `""` | non | Domaine du proxy CORS pour CETTE source, prioritaire sur `window.DSFR_DATA_PROXY` et la config build. Sert la reecriture d'hote connu (Grist gouv/SaaS, Tabular, INSEE) ET le `use-proxy` generique. Ex: `proxy-url="https://mon-proxy.fr"`. Vide = resolution proxy globale habituelle. |
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
> ODS: max 1000 records, Tabular: max 25000 records (500 pages de 50), Grist: toutes les données.
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

### Référence `<dsfr-data-source>` (générée depuis le code)

**Rôle pipeline** : autonome — n’utilise pas les mixins d’abonnement du pipeline (voir les événements ci-dessous).

**Attributs**

| Attribut | Type | Défaut | Description |
|---|---|---|---|
| `aggregate` | `string` | `""` (vide) | Agrégation (pour les APIs qui le supportent server-side) |
| `api-key-ref` | `string` | `""` (vide) | Référence vers une clé API déclarée dans window.DSFR_DATA_KEYS |
| `api-type` | `string` | `'generic'` | Type d'API — active le mode adapter si != 'generic' et url est vide |
| `base-url` | `string` | `""` (vide) | URL de base de l'API (pour ODS, Tabular) |
| `cache-ttl` | `number` | `3600` | TTL du cache externe en secondes (0 = desactive). Actif uniquement si la page hote enregistre `window.DSFR_DATA_CACHE_PROVIDER` (#307) — no-op en embed anonyme. |
| `data` | `string` | `""` (vide) | Données JSON inline (pas de fetch) |
| `dataset-id` | `string` | `""` (vide) | ID du dataset (pour ODS) |
| `fetch-mode` | `'records' \| 'export'` | `'records'` | Stratégie de chargement en mode adaptateur (#689) : `records` (défaut, comportement historique — pagination par pages de 100) ou `export`, qui charge tout le jeu en **une seule requête** sur l'endpoint d'export du portail, avec les mêmes clauses (`select`, `where`, `group-by`, `order-by`). Implémenté par OpenDataSoft seulement ; les autres adaptateurs ignorent l'attribut. À activer pour une page « un fetch, N agrégations client », un jeu de plus de 1 000 lignes, ou un `group-by` à beaucoup de groupes : le portail les rend tous d'un coup au lieu d'une page. À ne pas activer avec `server-side` (pagination page par page), qui reste sur l'endpoint paginé et signale la contradiction dans la console. En mode `export` le total serveur est inconnu : la troncature est détectée en demandant une ligne de plus que le plafond `max-records`. Si le portail n'expose pas d'endpoint d'export, la source retombe une fois sur le chargement paginé, avec un avertissement en console. |
| `group-by` | `string` | `""` (vide) | Group-by (pour les APIs qui le supportent server-side). ODS : un élément peut être une expression aliasée, avec ou sans fonction (`year(date) as annee`, `periode as an`), transmise telle quelle — l'alias `as` est obligatoire cote ODS (#641). Même découpe et même échappement que `select` (#767) : `date_format(d, 'yyyy-MM') as m` reste d'un seul tenant. |
| `headers` | `string` | `""` (vide) | En-têtes HTTP en JSON. Ex: `'{"Authorization": "Bearer xxx"}'`. OpenDataSoft : la clé va dans `Authorization: Apikey CLE` (seul en-tête autorisé en CORS) — un `apikey` nu est réécrit automatiquement (#655). |
| `limit` | `number` | `0` | Limite du nombre de résultats |
| `max-records` | `number` | `0` | Plafond de records du fetchAll en mode adapter (#233). 0 = plafond par défaut de l'adapter (ODS : 1000). A relever explicitement pour les dashboards « un fetch, N agrégations client » — attention au nombre de requêtes en boucle et au poids mémoire. |
| `method` | `'GET' \| 'POST'` | `'GET'` | Méthode HTTP : `GET` (défaut) ou `POST`. |
| `order-by` | `string` | `""` (vide) | Order-by |
| `page-size` | `number` | `20` | Taille de page pour la pagination serveur (nombre de records par page). |
| `paginate` | `boolean` | `false` | Active la pagination serveur en mode URL : injecte page/page_size dans l'URL et publie la meta. |
| `params` | `string` | `""` (vide) | Paramètres de requête en JSON. Mode URL : query string en GET, corps de la requête en POST. **Mode adaptateur** (#726) : les paires sont ajoutées à l'URL construite par l'adaptateur, ce qui sert les paramètres propres au portail que la bibliothèque ne modélise pas — le cas d'usage est `params='{"timezone":"Europe/Paris"}'` sur un jeu Opendatasoft à dates, qui n'obligeait jusqu'ici à rester en mode URL. Les clés que la bibliothèque construit elle-même (`select`, `where`, `group_by`, `order_by`, `limit`, `offset`, `facet`) sont réservées : elles sont refusées avec une erreur de configuration plutôt que d'écraser une clause. Transmis par l'adaptateur Opendatasoft seulement, en chargement paginé comme en `fetch-mode="export"`. |
| `proxy-url` | `string` | `""` (vide) | Domaine du proxy CORS pour CETTE source (#340), prioritaire sur `window.DSFR_DATA_PROXY` et la config build-time. Sert a la fois la reecriture d'hote connu (Grist gouv/SaaS, Tabular, INSEE) et le `use-proxy` generique. Vide = resolution proxy globale habituelle. Ex: `proxy-url="https://mon-proxy.fr"`. |
| `refresh` | `number` | `0` | Rafraichissement automatique en secondes (0 = desactive). |
| `require-where` | `boolean` | `false` | Ne rien charger tant qu'aucun filtre n'a été reçu (#690). Pensé pour les pages d'exploration : sans cet attribut, une source interroge l'API dès le montage et rapatrie le jeu entier — une requête coûteuse dont personne ne regarde le résultat. Avec lui, la source reste en attente, émet `dsfr-data-idle` et ne part chercher les données qu'au premier filtre. Ce qui compte comme filtre : les clauses reçues par commande — facettes, recherche, `dsfr-data-context`, délégation d'un `dsfr-data-query`. Le `where` STATIQUE de la source ne compte PAS : il fait partie de la définition du jeu, pas du geste de l'utilisateur ; le contraire rendrait l'attribut sans effet sur toute source qui restreint déjà son périmètre. Quand le dernier filtre est retiré, la source repasse en attente : jamais de requête « tout » implicite. Sans effet en mode données inline (`data`), qui ne fait aucune requête. |
| `resource` | `string` | `""` (vide) | ID de la ressource (pour Tabular) |
| `select` | `string` | `""` (vide) | Clause SELECT (pour ODS), liste séparée par des virgules : `select="count(*) as total, region"`. Une expression (fonction, alias `as`, `*`, chemin pointé, opérateur) est transmise telle quelle ; un nom de champ qui n'est pas un identifiant nu (espace, accent, chiffre initial comme `1_uai`) est backquoté automatiquement (#767). Une virgule à l'intérieur d'une fonction ou d'une chaîne ne sépare pas. |
| `server-side` | `boolean` | `false` | Mode pagination serveur (datalist, tableaux) |
| `transform` | `string` | `""` (vide) | Chemin JSONPath vers le tableau de données dans la réponse. Ex: `"results"`, `"data.items"`. |
| `url` | `string` | `""` (vide) | URL de l'API a interroger (mode URL brute). Vide en mode adapter ou en mode `data` inline. |
| `use-proxy` | `boolean` | `false` | Force le passage par le proxy CORS generique (pour les APIs externes sans CORS) |
| `where` | `string` | `""` (vide) | Clause WHERE statique |


**Méthodes publiques**

| Méthode | Retour | Description |
|---|---|---|
| `getAdapter()` | `ApiAdapter \| null` | Returns the adapter for this source (if in adapter mode) |
| `getAdapterParams()` | `AdapterParams` | Paramètres adapter resolus, headers effectifs inclus (headers + api-key-ref). Consomme par les composants aval via SourceElement (#274). |
| `getData()` | `unknown` | — |
| `getEffectiveWhere(excludeKey?: string | string[])` | `string` | Returns the effective WHERE clause (static + all dynamic overlays merged). `excludeKey` : un whereKey, ou une liste de whereKeys a ignorer (#678 — une facette en mode `context` emet un whereKey PAR champ et doit les exclure tous du where de base de sa cascade). |
| `getError()` | `Error \| null` | — |
| `isLoading()` | `boolean` | — |
| `reload()` | `void` | — |


**Événements** (émis sur `document` : ecouter via `document.addEventListener`, filtrer sur `detail.sourceId`)

| Événement | Payload | Direction | Quand |
|---|---|---|---|
| `cache-fallback` | — | émis | `{ sourceId }` sur l'élément — les données servies viennent du cache externe après un echec reseau (#307). |
| `dsfr-data-loaded` | — | émis | `{ sourceId, data }` sur `document` — données chargees et publiees sous l'`id` de cette source. C'est l'evenement que tout l'aval ecoute. |
| `dsfr-data-loading` | — | émis | `{ sourceId }` sur `document` — un chargement demarre. |
| `dsfr-data-error` | — | émis | `{ sourceId, error, attemptedUrl? }` sur `document` — le fetch ou le parsing a echoue. `attemptedUrl` (#603) porte l'URL REELLEMENT appelee, proxy applique : elle diverge souvent du `base-url` ecrit dans le HTML, et le message de l'`Error` reste volontairement court. La cle est absente quand l'URL n'a pas pu être construite, ou pour une erreur qui ne vient pas d'un fetch (données inline invalides, configuration). |
| `dsfr-data-idle` | — | émis | `{ sourceId, reason }` sur `document` — la source attend un filtre (`require-where` posé, aucun filtre reçu). Aucune requête n'est partie : l'état est distinct d'un chargement, d'une erreur et d'un résultat vide. Les afficheurs le rendent en message « choisissez un filtre » (#690). |


**Slots** — aucun (le composant rend son propre contenu).

**Variables CSS publiques** — aucune (styler via les variables du DSFR sur le conteneur parent).
