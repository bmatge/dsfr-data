# dsfr-data-query

> Filtrage, agrégation et tri declaratif des données
>
> Déclencheurs : filtre, filtrer, grouper, agréger, trier, transformer, query, requête, top, moyenne, somme, compter, seulement, uniquement, plus de, moins de, departement, region, dans le, pour le

## <dsfr-data-query> - Transformation de données

Composant invisible qui transforme les données recues d'une source (dsfr-data-source
ou dsfr-data-normalize). Filtre, groupe, agrégé et trie de facon declarative.
Ne fait aucun fetch HTTP — les données transitent via le data-bridge.
Peut s'enchainer : un dsfr-data-query peut etre la source d'un autre dsfr-data-query.

### Pattern recommande : source -> query -> chart
```html
<!-- 1. dsfr-data-source récupéré les données -->
<dsfr-data-source id="src" api-type="opendatasoft"
  base-url="https://data.opendatasoft.com" dataset-id="mon-dataset"
  select="sum(population) as total, region" group-by="region">
</dsfr-data-source>
<!-- 2. dsfr-data-query transforme (tri, limite) -->
<dsfr-data-query id="data" source="src" order-by="total:desc" limit="10"></dsfr-data-query>
<!-- 3. dsfr-data-chart affiche -->
<dsfr-data-chart source="data" type="bar" label-field="region" value-field="total"></dsfr-data-chart>
```

### Format des données
Entree : tableau d'objets plats (fourni par dsfr-data-source ou un autre dsfr-data-query).
Sortie : tableau d'objets plats, transforme selon les attributs.
Apres agrégation, les champs sont nommes automatiquement : `champ__fonction`
(ex: `population__sum`, `prix__avg`).

### Attributs
| Attribut | Type | Défaut | Requis | Description |
|----------|------|--------|--------|-------------|
| id | String | - | oui | Identifiant unique |
| source | String | `""` | oui | ID de la dsfr-data-source ou dsfr-data-query parente |
| where | String | `""` | non | Filtres (voir syntaxe ci-dessous) |
| filter | String | `""` | non | Alias de where (compatibilite) |
| group-by | String | `""` | non | Champs de groupement (separes par virgule) |
| aggregate | String | `""` | non | Agrégations : `"champ:fonction"` ou `"champ:fonction:alias"` |
| order-by | String | `""` | non | Tri : `"champ:asc"` ou `"champ:desc"`. **Omettre cet attribut preserve l'ordre source** (ordre de premiere apparition apres group-by) — utile pour les mois en lettres, jours de la semaine, ou toute série déjà ordonnee en amont. |
| limit | Number | `0` | non | Limite de resultats (0 = illimite) |

> dsfr-data-query est un pur transformateur de données. Utilisez dsfr-data-source pour le fetch HTTP.
> Le where de query est colon-only : la syntaxe ODSQL ne s'utilise que sur le where de dsfr-data-source.
> Les attributs `transform`, `server-side` et `page-size` n'existent PAS sur dsfr-data-query
> (transform et page-size se configurent sur dsfr-data-source).

### Relais de commandes (automatique)
dsfr-data-query transfere TOUJOURS les commandes des composants en aval vers la
source amont (dsfr-data-source) — aucun attribut a poser. Utile pour les gros
datasets avec une source `server-side`.

Les composants en aval pointent sur le dsfr-data-query :
- `dsfr-data-list` envoie `{ page }` pour la pagination
- `dsfr-data-search server-search` envoie `{ where }` pour la recherche
- `dsfr-data-list server-tri` envoie `{ orderBy }` pour le tri

### Operateurs de filtre
Format : `"champ:operateur:valeur"`
Multiples filtres separes par virgule (logique ET) :
`where="population:gte:10000, region:in:IDF|OCC"`

| Operateur | Description | Exemple |
|-----------|-------------|---------|
| eq | Egal | `"status:eq:active"` |
| neq | Different | `"type:neq:brouillon"` |
| gt | Strictement superieur | `"prix:gt:100"` |
| gte | Superieur ou egal | `"population:gte:10000"` |
| lt | Strictement inferieur | `"score:lt:50"` |
| lte | Inferieur ou egal | `"age:lte:30"` |
| contains | Contient (insensible a la casse) | `"nom:contains:paris"` |
| notcontains | Ne contient pas | `"email:notcontains:spam"` |
| in | Dans la liste (separateur \|) | `"region:in:IDF\|OCC\|BRE"` |
| notin | Pas dans la liste | `"status:notin:archive\|supprime"` |
| isnull | Est vide/null | `"email:isnull"` |
| isnotnull | N'est pas vide | `"telephone:isnotnull"` |

### Fonctions d'agrégation
Format : `"champ:fonction"` ou `"champ:fonction:alias"`
Nommage automatique sans alias : `champ__fonction` (ex: `population__sum`)

| Fonction | Description | Exemple |
|----------|-------------|---------|
| count | Nombre d'elements | `"id:count"` |
| sum | Somme | `"montant:sum"` |
| avg | Moyenne | `"prix:avg"` |
| min | Minimum | `"temperature:min"` |
| max | Maximum | `"score:max"` |

### Exemples
```html
<!-- Filtrer et trier -->
<dsfr-data-query id="filtered" source="raw-data"
  where="population:gt:5000"
  order-by="nom:asc"
  limit="10">
</dsfr-data-query>

<!-- Grouper et agréger -->
<dsfr-data-query id="stats" source="communes"
  group-by="region"
  aggregate="population:sum, population:count"
  order-by="population__sum:desc"
  limit="10">
</dsfr-data-query>

<!-- ODS : source + query + chart -->
<dsfr-data-source id="src" api-type="opendatasoft"
  dataset-id="mon-dataset"
  base-url="https://data.opendatasoft.com"
  select="sum(population) as total, region"
  where="population > 5000"
  group-by="region">
</dsfr-data-source>
<dsfr-data-query id="ods" source="src"
  order-by="total:desc" limit="15">
</dsfr-data-query>

<!-- Tabular : source + query + chart -->
<dsfr-data-source id="src" api-type="tabular"
  resource="RESOURCE_ID">
</dsfr-data-source>
<dsfr-data-query id="tab" source="src"
  group-by="departement"
  aggregate="population:sum"
  order-by="population__sum:desc">
</dsfr-data-query>

<!-- Grist : source + normalize + query -->
<dsfr-data-source id="src" api-type="grist"
  base-url="/grist-gouv-proxy/api/docs/DOC_ID/tables/TABLE/records"
  headers='{"Authorization":"Bearer API_KEY"}'>
</dsfr-data-source>
<dsfr-data-normalize id="flat" source="src" flatten="fields"></dsfr-data-normalize>
<dsfr-data-query id="data" source="flat"
  group-by="region" aggregate="population:sum"
  order-by="population__sum:desc">
</dsfr-data-query>

<!-- Chainabilite : un query comme source d'un autre -->
<dsfr-data-query id="actifs" source="raw" where="status:eq:active"></dsfr-data-query>
<dsfr-data-query id="top5" source="actifs" group-by="region" aggregate="montant:sum" order-by="montant__sum:desc" limit="5"></dsfr-data-query>

<!-- Server-side : recherche + pagination serveur ODS
     (server-side et page-size se posent sur la SOURCE ; le query relaie
      automatiquement les commandes page/where/orderBy) -->
<dsfr-data-source id="src" api-type="opendatasoft"
  dataset-id="rappelconso"
  base-url="https://data.economie.gouv.fr/api"
  server-side page-size="20">
</dsfr-data-source>
<dsfr-data-query id="q" source="src"></dsfr-data-query>
<dsfr-data-search id="s" source="q" server-search count></dsfr-data-search>
<dsfr-data-display source="q" pagination="20">
  <template><p>{{nom}}</p></template>
</dsfr-data-display>
```

### Référence `<dsfr-data-query>` (générée depuis le code)

**Rôle pipeline** : transformateur (`TransformerMixin`) — consomme `source`, ré-émet sous son propre `id`, relaie les commandes vers l’amont.

**Attributs**

| Attribut | Type | Défaut | Description |
|---|---|---|---|
| `aggregate` | `string` | `""` (vide) | Agrégations pour mode generic/tabular Format: "field:function, field2:function" Ex: "population:sum, count:count" |
| `filter` | `string` | `""` (vide) | Alias pour where (compatibilite) |
| `group-by` | `string` | `""` (vide) | Champs de regroupement (separes par virgule) |
| `limit` | `number` | `0` | Limite de resultats |
| `order-by` | `string` | `""` (vide) | Tri des resultats Format: "field:direction" ou "field__function:direction" Ex: "total_pop:desc" ou "population__sum:desc" |
| `source` | `string` | `""` (vide) | ID de la source de données (dsfr-data-source ou dsfr-data-normalize) |
| `where` | `string` | `""` (vide) | Clause WHERE / Filtres — syntaxe colon UNIQUEMENT : "champ:operateur:valeur, champ2:operateur:valeur2" (operateurs : eq, neq, gt, gte, lt, lte, contains, notcontains, in, notin, isnull, isnotnull — multi-valeurs separees par \|). La syntaxe ODSQL n'est PAS supportee ici (elle l'est sur le `where` de dsfr-data-source) : une clause non parsable est signalee via reportConfigError (#277). En delegation serveur, la clause est traduite au dialecte de l'adapter (#275). |


**Méthodes publiques**

| Méthode | Retour | Description |
|---|---|---|
| `getAdapter()` | `import('../adapters/api-adapter.js').ApiAdapter \| null` | Retourne l'adapter courant (delegue a la source amont) |
| `getAdapterParams()` | `import('../adapters/api-adapter.js').AdapterParams \| null` | Retourne les parametres adapter resolus de la source amont (delegation transparente, headers api-key-ref inclus — #274). |
| `getData()` | `unknown[]` | Retourne les données actuelles (isLoading() et getError() sont fournis par TransformerMixin, #280) |
| `getEffectiveWhere(excludeKey?: string)` | `string` | Retourne le where effectif complet (statique + dynamique). Delegue a la source amont si disponible. |
| `reload()` | `void` | Force le rechargement des données. Semantique de pur transformateur (#279) : delegue le refetch a la source amont — meme contrat que dsfr-data-source.reload(). L'emission qui suit redescend naturellement le pipeline jusqu'ici (une chaine query → query → source propage le reload jusqu'a la source). Repli : si l'amont n'expose pas reload() (normalize/unpivot/join avant EPIC C #262), retraite le cache courant (ancien comportement). |


**Événements** (émis sur `document` : ecouter via `document.addEventListener`, filtrer sur `detail.sourceId`)

| Événement | Payload | Direction | Quand |
|---|---|---|---|
| `dsfr-data-loaded` | `{ sourceId, data }` | écoute | Nouvelles données publiées par la source désignée par `source`. |
| `dsfr-data-error` | `{ sourceId, error }` | écoute | Erreur amont. |
| `dsfr-data-loading` | `{ sourceId }` | écoute | Chargement amont démarré. |
| `dsfr-data-loaded` | `{ sourceId, data }` | émis | Données transformées, ré-émises sous l’`id` de CE composant (c’est cet `id` que l’aval met dans son `source`). |
| `dsfr-data-error` | `{ sourceId, error }` | émis | Erreur amont ou de transformation, sous l’`id` de ce composant. |
| `dsfr-data-loading` | `{ sourceId }` | émis | Chargement amont relayé vers l’aval. |
| `dsfr-data-source-command` | `{ sourceId, page?, where?, whereKey?, orderBy?, groupBy?, aggregate? }` | émis | Commande de pagination / filtre / tri envoyée à la source AMONT — soit originée par ce composant, soit relayée depuis l’aval. |


**Slots** — aucun (le composant rend son propre contenu).

**Variables CSS publiques** — aucune (styler via les variables du DSFR sur le conteneur parent).
