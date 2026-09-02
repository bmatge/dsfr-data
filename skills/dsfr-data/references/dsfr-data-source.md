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
| params | String | `""` | non | Parametres query (GET) ou body (POST) en JSON |
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
| group-by | String | `""` | non | Group-by serveur (si supporte par le provider). |
| aggregate | String | `""` | non | Agrégation serveur. Ex: `"population:sum"` |
| order-by | String | `""` | non | Tri serveur. Ex: `"population:desc"` |
| server-side | Boolean | `false` | non | Active la pagination serveur page par page (datalist, tableaux). |
| limit | Number | `0` | non | Limite du nombre de resultats (0 = pas de limite). |
| max-records | Number | `0` | non | Plafond du fetchAll en mode adapter (#233). 0 = plafond par defaut de l'adapter (ODS : 1000). A relever explicitement pour les dashboards « un fetch, N agregations client » — attention au volume (requetes en boucle, memoire). |
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

### Référence `<dsfr-data-source>` (générée depuis le code)

**Rôle pipeline** : autonome — n’utilise pas les mixins d’abonnement du pipeline (voir les événements ci-dessous).

**Attributs**

| Attribut | Type | Défaut | Description |
|---|---|---|---|
| `aggregate` | `string` | `""` (vide) | Agrégation (pour les APIs qui le supportent server-side) |
| `api-key-ref` | `string` | `""` (vide) | Reference vers une clé API declaree dans window.DSFR_DATA_KEYS |
| `api-type` | `string` | `'generic'` | Type d'API — active le mode adapter si != 'generic' et url est vide |
| `base-url` | `string` | `""` (vide) | URL de base de l'API (pour ODS, Tabular) |
| `cache-ttl` | `number` | `3600` | TTL du cache externe en secondes (0 = desactive). Actif uniquement si la page hote enregistre `window.DSFR_DATA_CACHE_PROVIDER` (#307) — no-op en embed anonyme. |
| `data` | `string` | `""` (vide) | Données JSON inline (pas de fetch) |
| `dataset-id` | `string` | `""` (vide) | ID du dataset (pour ODS) |
| `group-by` | `string` | `""` (vide) | Group-by (pour les APIs qui le supportent server-side) |
| `headers` | `string` | `""` (vide) | En-tetes HTTP en JSON. Ex: `'{"Authorization": "Bearer xxx"}'` |
| `limit` | `number` | `0` | Limite du nombre de resultats |
| `max-records` | `number` | `0` | Plafond de records du fetchAll en mode adapter (#233). 0 = plafond par defaut de l'adapter (ODS : 1000). A relever explicitement pour les dashboards « un fetch, N agregations client » — attention au nombre de requetes en boucle et au poids memoire. |
| `method` | `'GET' \| 'POST'` | `'GET'` | Methode HTTP : `GET` (defaut) ou `POST`. |
| `order-by` | `string` | `""` (vide) | Order-by |
| `page-size` | `number` | `20` | Taille de page pour la pagination serveur (nombre de records par page). |
| `paginate` | `boolean` | `false` | Active la pagination serveur en mode URL : injecte page/page_size dans l'URL et publie la meta. |
| `params` | `string` | `""` (vide) | Parametres de requete en JSON : query string en GET, corps en POST. |
| `proxy-url` | `string` | `""` (vide) | Domaine du proxy CORS pour CETTE source (#340), prioritaire sur `window.DSFR_DATA_PROXY` et la config build-time. Sert a la fois la reecriture d'hote connu (Grist gouv/SaaS, Tabular, INSEE) et le `use-proxy` generique. Vide = resolution proxy globale habituelle. Ex: `proxy-url="https://mon-proxy.fr"`. |
| `refresh` | `number` | `0` | Rafraichissement automatique en secondes (0 = desactive). |
| `resource` | `string` | `""` (vide) | ID de la ressource (pour Tabular) |
| `select` | `string` | `""` (vide) | Clause SELECT (pour ODS) |
| `server-side` | `boolean` | `false` | Mode pagination serveur (datalist, tableaux) |
| `transform` | `string` | `""` (vide) | Chemin JSONPath vers le tableau de donnees dans la reponse. Ex: `"results"`, `"data.items"`. |
| `url` | `string` | `""` (vide) | URL de l'API a interroger (mode URL brute). Vide en mode adapter ou en mode `data` inline. |
| `use-proxy` | `boolean` | `false` | Force le passage par le proxy CORS generique (pour les APIs externes sans CORS) |
| `where` | `string` | `""` (vide) | Clause WHERE statique |


**Méthodes publiques**

| Méthode | Retour | Description |
|---|---|---|
| `getAdapter()` | `ApiAdapter \| null` | Returns the adapter for this source (if in adapter mode) |
| `getAdapterParams()` | `AdapterParams` | Parametres adapter resolus, headers effectifs inclus (headers + api-key-ref). Consomme par les composants aval via SourceElement (#274). |
| `getData()` | `unknown` | — |
| `getEffectiveWhere(excludeKey?: string)` | `string` | Returns the effective WHERE clause (static + all dynamic overlays merged) |
| `getError()` | `Error \| null` | — |
| `isLoading()` | `boolean` | — |
| `reload()` | `void` | — |


**Événements** (émis sur `document` : ecouter via `document.addEventListener`, filtrer sur `detail.sourceId`)

| Événement | Payload | Direction | Quand |
|---|---|---|---|
| `cache-fallback` | — | émis | `{ sourceId }` sur l'element — les donnees servies viennent du cache externe apres un echec reseau (#307). |
| `dsfr-data-loaded` | — | émis | `{ sourceId, data }` sur `document` — donnees chargees et publiees sous l'`id` de cette source. C'est l'evenement que tout l'aval ecoute. |
| `dsfr-data-loading` | — | émis | `{ sourceId }` sur `document` — un chargement demarre. |
| `dsfr-data-error` | — | émis | `{ sourceId, error }` sur `document` — le fetch ou le parsing a echoue. |


**Slots** — aucun (le composant rend son propre contenu).

**Variables CSS publiques** — aucune (styler via les variables du DSFR sur le conteneur parent).
