/**
 * AI Skills - knowledge modules injected into the prompt based on context
 *
 * Each skill is a self-contained knowledge block that can be consumed by:
 * - The builder-IA chat (injected into the Albert API system prompt)
 * - External AI tools via MCP server
 *
 * IMPORTANT: when adding/modifying an attribute, chart type, filter operator
 * or aggregation function in a dsfr-data-* component, update the corresponding skill.
 * Tests in tests/apps/builder-ia/skills.test.ts verify alignment automatically.
 */

import { CDN_URLS, PROXY_BASE_URL, LIB_URL } from '@dsfr-data/shared';
import type { Source } from './state.js';

/** A single skill definition */
export interface Skill {
  id: string;
  name: string;
  description: string;
  trigger: string[];
  content: string;
}

/** All available skills, keyed by ID */
export const SKILLS: Record<string, Skill> = {
  // ---------------------------------------------------------------------------
  // Action builder-IA : createChart
  // ---------------------------------------------------------------------------

  createChartAction: {
    id: 'createChartAction',
    name: 'Action createChart',
    description: "Specification de l'action JSON pour creer un graphique dans le builder-IA",
    trigger: ['createchart', 'creer un graphique', 'apercu', 'preview'],
    content: `## Action createChart (builder-IA uniquement)

Cette action genere un graphique interactif dans l'apercu du builder-IA.
Elle est distincte du code embarquable HTML (voir skills composants dsfr-data).

### Format
\`\`\`json
{
  "action": "createChart",
  "config": {
    "type": "bar",
    "labelField": "nom_region",
    "valueField": "population",
    "aggregation": "sum",
    "where": "status:eq:active",
    "limit": 10,
    "sortOrder": "desc",
    "title": "Titre du graphique",
    "subtitle": "Sous-titre",
    "color": "#000091",
    "palette": "categorical"
  }
}
\`\`\`

### Proprietes de config
| Propriete | Type | Requis | Description |
|-----------|------|--------|-------------|
| type | String | oui | Type de visualisation (voir ci-dessous) |
| labelField | String | selon type | Champ pour les labels / axe X |
| valueField | String | oui | Champ pour les valeurs / axe Y |
| valueField2 | String | non | 2e serie (bar-line, comparaisons) |
| codeField | String | non | Champ code departement/region (map, map-reg) |
| aggregation | String | non | Fonction : sum, avg, count, min, max |
| where | String | non | Filtre pre-agregation (voir syntaxe ci-dessous) |
| limit | Number | non | Nombre max de resultats |
| sortOrder | String | non | Tri : "asc" ou "desc" |
| title | String | non | Titre affiche |
| subtitle | String | non | Sous-titre affiche |
| color | String | non | Couleur primaire hex (defaut: #000091) |
| color2 | String | non | Couleur secondaire hex (bar-line) |
| variant | String | non | Style KPI : info, success, warning, error |
| unit | String | non | Unite affichee : EUR, %, ou texte libre |
| palette | String | non | Palette DSFR : categorical, sequentialAscending, sequentialDescending, divergentAscending, divergentDescending, neutral. Fonctionne pour tous les types de graphiques. |
| colonnes | String | non | Colonnes datalist : "champ:Label, champ2:Label2" |
| pagination | Number | non | Lignes par page (datalist) |

### Types valides et champs requis
| Type | labelField | valueField | Cas d'usage |
|------|-----------|------------|-------------|
| bar | oui | oui | Comparer des categories (5-15) |
| line | oui | oui | Evolution temporelle, tendances |
| pie | oui | oui | Parts d'un tout (max 5-7 segments) |
| radar | oui | oui | Profils multicriteres |
| scatter | oui | oui | Correlation entre 2 variables numeriques |
| bar-line | oui | oui (+valueField2) | 2 metriques : barres + ligne |
| gauge | non | oui | Progression 0-100% |
| kpi | non | oui | Indicateur chiffre cle unique |
| map | non (codeField) | oui | Donnees par departement francais |
| map-reg | non (codeField) | oui | Donnees par region francaise |
| datalist | non | non (colonnes) | Tableau de donnees filtrable |

IMPORTANT :
- \`doughnut\` = \`pie\` (le composant pie est un anneau par defaut)
- \`horizontalBar\` = \`bar\` (le renderer le convertit automatiquement)
- Pour KPI et gauge : PAS de labelField
- Pour map/map-reg : utiliser codeField (pas labelField)

### Syntaxe du filtre (config.where)
Format : \`"champ:operateur:valeur"\`
Multiples filtres : virgule = ET logique \`"champ1:op:val, champ2:op:val"\`
Operateurs : eq, neq, gt, gte, lt, lte, contains, in (separateur |)
Le filtre s'applique AVANT l'agregation. Utiliser les noms de champs bruts de la source.

### Exemples
\`\`\`json
{"action":"createChart","config":{"type":"kpi","valueField":"prix","aggregation":"avg","where":"code_departement:eq:48","title":"Prix moyen dept 48","unit":"EUR"}}
\`\`\`
\`\`\`json
{"action":"createChart","config":{"type":"bar","labelField":"region","valueField":"population","aggregation":"sum","limit":5,"sortOrder":"desc","title":"Top 5 regions"}}
\`\`\`
\`\`\`json
{"action":"createChart","config":{"type":"map","codeField":"code_dept","valueField":"score","palette":"sequentialAscending","title":"Score par departement"}}
\`\`\`
\`\`\`json
{"action":"createChart","config":{"type":"datalist","colonnes":"nom:Nom, email:Email, ville:Ville","pagination":20,"title":"Liste des contacts"}}
\`\`\`
\`\`\`json
{"action":"createChart","config":{"type":"pie","labelField":"region","valueField":"population","aggregation":"sum","palette":"divergentAscending","title":"Population par region"}}
\`\`\`

Genere TOUJOURS UN SEUL bloc JSON par reponse. Pour changer la couleur ou palette d'un graphique existant, regenere le meme createChart avec la palette souhaitee.`,
  },

  // ---------------------------------------------------------------------------
  // Action builder-IA : reloadData
  // ---------------------------------------------------------------------------

  reloadDataAction: {
    id: 'reloadDataAction',
    name: 'Action reloadData',
    description: 'Recharger les donnees de la source avec des parametres ODSQL',
    trigger: ['recharger', 'reloaddata', 'nouveaux parametres', 'refiltrer'],
    content: `## Action reloadData (builder-IA uniquement)

Recharge les donnees depuis l'API source avec de nouveaux parametres ODSQL.
Utile quand l'utilisateur veut modifier le jeu de donnees avant de creer un graphique.

### Format
\`\`\`json
{
  "action": "reloadData",
  "query": {
    "where": "condition ODSQL",
    "select": "champs a selectionner",
    "group_by": "champ de groupement",
    "order_by": "champ ASC|DESC",
    "limit": 100
  },
  "reason": "Explication pour l'utilisateur"
}
\`\`\`

### Proprietes de query
| Propriete | Type | Description |
|-----------|------|-------------|
| select | String | Champs a retourner, avec aliases : \`"region, avg(prix) as prix_moyen"\` |
| where | String | Filtre ODSQL : \`"population > 10000"\` ou \`"nom like 'Paris%'"\` |
| group_by | String | Groupement : \`"region"\` |
| order_by | String | Tri : \`"population DESC"\` |
| limit | Number | Nombre max de resultats (defaut API : 10, max : 100 par requete) |

### Exemples
\`\`\`json
{"action":"reloadData","query":{"order_by":"valeur DESC","limit":10},"reason":"Top 10 par valeur"}
\`\`\`
\`\`\`json
{"action":"reloadData","query":{"where":"prix > 50","select":"region, avg(prix) as prix_moyen","group_by":"region"},"reason":"Prix moyen par region (> 50)"}
\`\`\`

IMPORTANT : la syntaxe \`query\` est de l'ODSQL (operateurs SQL), a ne pas confondre
avec la syntaxe \`config.where\` de createChart qui utilise le format "champ:operateur:valeur".`,
  },

  // ---------------------------------------------------------------------------
  // Composants dsfr-data
  // ---------------------------------------------------------------------------

  dsfrDataSource: {
    id: 'dsfrDataSource',
    name: 'dsfr-data-source',
    description: 'Composant de connexion aux donnees (API REST)',
    trigger: ['source', 'charger', 'connecter', 'rafraichir', 'url', 'api', 'donnees'],
    content: `## <dsfr-data-source> - Connexion aux donnees

Composant invisible qui recupere des donnees depuis une API REST et les distribue
aux autres composants via un systeme de bus evenementiel (data-bridge).

### Format des donnees
dsfr-data-source attend une reponse JSON. L'attribut \`transform\` permet d'extraire le
tableau de donnees depuis la reponse. Le resultat DOIT etre un tableau d'objets plats :
\`[{"region": "IDF", "population": 12000000}, {"region": "OCC", "population": 6000000}]\`

### Attributs
| Attribut | Type | Defaut | Requis | Description |
|----------|------|--------|--------|-------------|
| id | String | - | oui | Identifiant unique. Les autres composants s'y abonnent via \`source="cet-id"\`. |
| url | String | \`""\` | oui | URL de l'API (GET par defaut) |
| method | String | \`"GET"\` | non | Methode HTTP : GET ou POST |
| headers | String | \`""\` | non | En-tetes HTTP en JSON : \`'{"Authorization": "Bearer xxx"}'\` |
| params | String | \`""\` | non | Parametres query (GET) ou body (POST) en JSON |
| transform | String | \`""\` | non | Chemin JSONPath vers les donnees : \`"results"\`, \`"data.items"\`, \`"records"\` |
| refresh | Number | \`0\` | non | Rafraichissement auto en secondes (0 = desactive) |
| paginate | Boolean | \`false\` | non | Active la pagination serveur (injecte page/page_size dans l'URL, stocke la meta) |
| page-size | Number | \`20\` | non | Taille de page pour la pagination serveur (nombre de records par page) |
| cache-ttl | Number | \`3600\` | non | TTL du cache serveur en secondes (0 = pas de cache). Actif uniquement en mode database. |
| api-type | String | \`"generic"\` | non | Type de provider (opendatasoft, tabular, grist, generic). Active le mode adapter. |
| base-url | String | \`""\` | non | URL de base de l'API (mode adapter). Ex: \`"https://data.iledefrance.fr"\` |
| dataset-id | String | \`""\` | non | ID du dataset (ODS). |
| resource | String | \`""\` | non | ID de la ressource (Tabular). |
| where | String | \`""\` | non | Clause WHERE statique (ODSQL ou colon syntax). |
| select | String | \`""\` | non | Clause SELECT serveur (ODS). Ex: \`"count(*) as total, region"\` |
| group-by | String | \`""\` | non | Group-by serveur (si supporte par le provider). |
| aggregate | String | \`""\` | non | Agregation serveur. Ex: \`"population:sum"\` |
| order-by | String | \`""\` | non | Tri serveur. Ex: \`"population:desc"\` |
| server-side | Boolean | \`false\` | non | Active la pagination serveur page par page (datalist, tableaux). |
| limit | Number | \`0\` | non | Limite du nombre de resultats (0 = pas de limite). |
| data | String | \`""\` | non | Donnees JSON inline (pas de fetch). Ex: \`data='[{"x":1},{"x":2}]'\` |
| use-proxy | Boolean | \`false\` | non | Force le passage par le proxy CORS generique. Utile pour les APIs externes sans CORS. |
| api-key-ref | String | \`""\` | non | Reference vers une cle API dans window.DSFR_DATA_KEYS. Injecte la valeur comme header Authorization. |

### Evenements emis
- \`dsfr-data-loaded\` : donnees chargees (detail : tableau de donnees)
- \`dsfr-data-loading\` : chargement en cours
- \`dsfr-data-error\` : erreur (detail : objet Error)

### Methodes publiques
- \`reload()\` : force le rechargement des donnees
- \`getData()\` : retourne les donnees actuelles (tableau d'objets)

### Exemples
\`\`\`html
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

<!-- API avec cle depuis le registre global (window.DSFR_DATA_KEYS) -->
<script>window.DSFR_DATA_KEYS = { tmdb: 'Bearer eyJ...' };</script>
<dsfr-data-source id="films"
  url="https://api.themoviedb.org/3/movie/popular"
  api-key-ref="tmdb"
  transform="results">
</dsfr-data-source>
\`\`\`

> **Note** : les APIs Grist et ODS v1 renvoient des donnees imbriquees sous \`fields\`.
> Utilisez \`<dsfr-data-normalize flatten="fields">\` pour les aplatir avant de les passer
> aux facettes, datalist ou graphiques. Voir la doc de dsfr-data-normalize.

> **Mode adapter** : avec \`api-type\`, dsfr-data-source gere la pagination automatiquement.
> ODS: max 1000 records, Tabular: max 25000 records (500 pages de 50), Grist: toutes les donnees.
> Le mode adapter ecoute aussi les commandes \`dsfr-data-source-command\` (page, where, orderBy)
> emises par dsfr-data-facets, dsfr-data-search et dsfr-data-list.

### Exemples mode adapter
\\\`\\\`\\\`html
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
\\\`\\\`\\\``,
  },

  dsfrDataQuery: {
    id: 'dsfrDataQuery',
    name: 'dsfr-data-query',
    description: 'Filtrage, agregation et tri declaratif des donnees',
    trigger: [
      'filtre',
      'filtrer',
      'grouper',
      'agreger',
      'trier',
      'transformer',
      'query',
      'requete',
      'top',
      'moyenne',
      'somme',
      'compter',
      'seulement',
      'uniquement',
      'plus de',
      'moins de',
      'departement',
      'region',
      'dans le',
      'pour le',
    ],
    content: `## <dsfr-data-query> - Transformation de donnees

Composant invisible qui transforme les donnees recues d'une source (dsfr-data-source
ou dsfr-data-normalize). Filtre, groupe, agrege et trie de facon declarative.
Ne fait aucun fetch HTTP — les donnees transitent via le data-bridge.
Peut s'enchainer : un dsfr-data-query peut etre la source d'un autre dsfr-data-query.

### Pattern recommande : source -> query -> chart
\`\`\`html
<!-- 1. dsfr-data-source recupere les donnees -->
<dsfr-data-source id="src" api-type="opendatasoft"
  base-url="https://data.opendatasoft.com" dataset-id="mon-dataset"
  select="sum(population) as total, region" group-by="region">
</dsfr-data-source>
<!-- 2. dsfr-data-query transforme (tri, limite) -->
<dsfr-data-query id="data" source="src" order-by="total:desc" limit="10"></dsfr-data-query>
<!-- 3. dsfr-data-chart affiche -->
<dsfr-data-chart source="data" type="bar" label-field="region" value-field="total"></dsfr-data-chart>
\`\`\`

### Format des donnees
Entree : tableau d'objets plats (fourni par dsfr-data-source ou un autre dsfr-data-query).
Sortie : tableau d'objets plats, transforme selon les attributs.
Apres agregation, les champs sont nommes automatiquement : \`champ__fonction\`
(ex: \`population__sum\`, \`prix__avg\`).

### Attributs
| Attribut | Type | Defaut | Requis | Description |
|----------|------|--------|--------|-------------|
| id | String | - | oui | Identifiant unique |
| source | String | \`""\` | oui | ID de la dsfr-data-source ou dsfr-data-query parente |
| where | String | \`""\` | non | Filtres (voir syntaxe ci-dessous) |
| filter | String | \`""\` | non | Alias de where (compatibilite) |
| group-by | String | \`""\` | non | Champs de groupement (separes par virgule) |
| aggregate | String | \`""\` | non | Agregations : \`"champ:fonction"\` ou \`"champ:fonction:alias"\` |
| order-by | String | \`""\` | non | Tri : \`"champ:asc"\` ou \`"champ:desc"\` |
| limit | Number | \`0\` | non | Limite de resultats (0 = illimite) |
| transform | String | \`""\` | non | Chemin JSONPath dans les donnees recues |
| refresh | Number | \`0\` | non | Rafraichissement en secondes (0 = desactive) |
| server-side | Boolean | \`false\` | non | Active le transfert de commandes vers la source (pagination, recherche, tri) |
| page-size | Number | \`20\` | non | Taille de page (transmise a la source en mode server-side) |

> dsfr-data-query est un pur transformateur de donnees. Utilisez dsfr-data-source pour le fetch HTTP.

### Mode server-side
Avec \`server-side\`, dsfr-data-query transfere les commandes des composants en aval
vers la source amont (dsfr-data-source). Utile pour les gros datasets.

Les composants en aval pointent sur le dsfr-data-query :
- \`dsfr-data-list\` envoie \`{ page }\` pour la pagination
- \`dsfr-data-search server-search\` envoie \`{ where }\` pour la recherche
- \`dsfr-data-list server-tri\` envoie \`{ orderBy }\` pour le tri

### Operateurs de filtre
Format : \`"champ:operateur:valeur"\`
Multiples filtres separes par virgule (logique ET) :
\`where="population:gte:10000, region:in:IDF|OCC"\`

| Operateur | Description | Exemple |
|-----------|-------------|---------|
| eq | Egal | \`"status:eq:active"\` |
| neq | Different | \`"type:neq:brouillon"\` |
| gt | Strictement superieur | \`"prix:gt:100"\` |
| gte | Superieur ou egal | \`"population:gte:10000"\` |
| lt | Strictement inferieur | \`"score:lt:50"\` |
| lte | Inferieur ou egal | \`"age:lte:30"\` |
| contains | Contient (insensible a la casse) | \`"nom:contains:paris"\` |
| notcontains | Ne contient pas | \`"email:notcontains:spam"\` |
| in | Dans la liste (separateur \\|) | \`"region:in:IDF\\|OCC\\|BRE"\` |
| notin | Pas dans la liste | \`"status:notin:archive\\|supprime"\` |
| isnull | Est vide/null | \`"email:isnull"\` |
| isnotnull | N'est pas vide | \`"telephone:isnotnull"\` |

### Fonctions d'agregation
Format : \`"champ:fonction"\` ou \`"champ:fonction:alias"\`
Nommage automatique sans alias : \`champ__fonction\` (ex: \`population__sum\`)

| Fonction | Description | Exemple |
|----------|-------------|---------|
| count | Nombre d'elements | \`"id:count"\` |
| sum | Somme | \`"montant:sum"\` |
| avg | Moyenne | \`"prix:avg"\` |
| min | Minimum | \`"temperature:min"\` |
| max | Maximum | \`"score:max"\` |

### Exemples
\`\`\`html
<!-- Filtrer et trier -->
<dsfr-data-query id="filtered" source="raw-data"
  where="population:gt:5000"
  order-by="nom:asc"
  limit="10">
</dsfr-data-query>

<!-- Grouper et agreger -->
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
  base-url="${PROXY_BASE_URL}/grist-gouv-proxy/api/docs/DOC_ID/tables/TABLE/records"
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

<!-- Server-side : recherche + pagination serveur ODS -->
<dsfr-data-source id="src" api-type="opendatasoft"
  dataset-id="rappelconso"
  base-url="https://data.economie.gouv.fr/api"
  server-side page-size="20">
</dsfr-data-source>
<dsfr-data-query id="q" source="src" server-side></dsfr-data-query>
<dsfr-data-search id="s" source="q" server-search count></dsfr-data-search>
<dsfr-data-display source="q" pagination="20">
  <template><p>{{nom}}</p></template>
</dsfr-data-display>
\`\`\``,
  },

  dsfrDataNormalize: {
    id: 'dsfrDataNormalize',
    name: 'dsfr-data-normalize',
    description: 'Nettoyage et normalisation des donnees avant traitement',
    trigger: [
      'normaliser',
      'nettoyer',
      'renommer',
      'convertir',
      'normalize',
      'clean',
      'nettoyage',
      'normalisation',
      'grist',
      'airtable',
      'flatten',
      'aplatir',
      'nested',
      'ods v1',
      'records.fields',
      'replace-fields',
      'dimension codee',
      'code insee',
      'arrondir',
      'round',
      'decimales',
    ],
    content: `## <dsfr-data-normalize> - Normalisation de donnees

Composant invisible intermediaire qui nettoie et normalise les donnees avant traitement.
Se place entre <dsfr-data-source> et <dsfr-data-query> (ou directement avant une visualisation).

### Position recommandee
\`\`\`
dsfr-data-source -> dsfr-data-normalize -> dsfr-data-query -> dsfr-data-chart
\`\`\`
Normaliser AVANT dsfr-data-query permet aux filtres et agregations de travailler sur des donnees propres
(evite les comparaisons string vs number).

### Format des donnees
Entree : tableau d'objets (fourni par dsfr-data-source ou un autre composant).
Sortie : meme tableau avec valeurs nettoyees/renommees.

### Attributs
| Attribut | Type | Defaut | Requis | Description |
|----------|------|--------|--------|-------------|
| source | String | \`""\` | oui | ID de la source a ecouter |
| flatten | String | \`""\` | non | Cle du sous-objet a extraire au premier niveau. Utilise pour les APIs Grist, ODS v1, Airtable qui wrappent les donnees sous \`fields\`. Supporte la dot notation (\`data.attributes\`). |
| numeric | String | \`""\` | non | Champs a forcer en nombre (virgule-separes) : \`"population, surface"\` |
| numeric-auto | Boolean | \`false\` | non | Detection et conversion auto des champs numeriques |
| rename | String | \`""\` | non | Renommage : \`"ancien:nouveau | ancien2:nouveau2"\` (pipe-separe) |
| trim | Boolean | \`false\` | non | Supprime les espaces en debut/fin des cles ET valeurs string |
| strip-html | Boolean | \`false\` | non | Supprime les balises HTML des valeurs string |
| replace | String | \`""\` | non | Remplace des valeurs globalement : \`"N/A: | n.d.: | -:0"\` (pipe-separe) |
| replace-fields | String | \`""\` | non | Remplacement cible par champ : \`"CHAMP:ancien:nouveau | CHAMP2:a:n"\` (pipe-separe). Ne remplace que dans le champ specifie. |
| round | String | \`""\` | non | Arrondit des champs numeriques : \`"montant, prix"\` (0 decimales) ou \`"taux:2, score:1"\` (decimales explicites) |
| lowercase-keys | Boolean | \`false\` | non | Met toutes les cles en minuscules |

### Ordre d'execution des transformations
1. **flatten** — aplatit le sous-objet designe
2. trim — nettoie les espaces (cles et valeurs)
3. strip-html — supprime le HTML
4a. **replace-fields** — remplace les valeurs dans les champs specifies
4b. replace — remplace les valeurs globalement (tous les champs)
5. numeric / numeric-auto — conversion en nombres
6. **round** — arrondit les valeurs numeriques
7. rename — renomme les cles
8. lowercase-keys — cles en minuscules

### Separateurs
- \`numeric\` : champs separes par virgule
- \`rename\` et \`replace\` : paires separees par \`|\`, cle et valeur separees par \`:\`
  Le \`:\` separe le pattern de sa valeur de remplacement (valeur vide = suppression).
- \`replace-fields\` : paires separees par \`|\`, format \`CHAMP:pattern:remplacement\` (les 2 premiers \`:\` sont des delimiteurs, le remplacement peut contenir des \`:\`).

### Aplatir des donnees imbriquees (Grist, ODS v1, Airtable)

Certaines APIs renvoient chaque enregistrement sous la forme \`{id, fields: {…}}\`.
L'attribut \`flatten\` extrait les cles du sous-objet et les remonte au premier niveau,
rendant les donnees compatibles avec tous les composants (facettes, datalist, graphiques, KPI).

\`\`\`html
<!-- Grist -->
<dsfr-data-source id="raw"
  url="https://grist.example.com/api/docs/XXX/tables/MaTable/records"
  transform="records">
</dsfr-data-source>
<dsfr-data-normalize id="clean" source="raw" flatten="fields" trim numeric-auto></dsfr-data-normalize>

<!-- ODS v1 (legacy) -->
<dsfr-data-source id="raw-v1"
  url="https://data.gouv.fr/api/records/1.0/search/?dataset=mon-dataset&rows=100"
  transform="records">
</dsfr-data-source>
<dsfr-data-normalize id="clean-v1" source="raw-v1" flatten="fields" trim></dsfr-data-normalize>

<!-- Airtable -->
<dsfr-data-source id="airtable"
  url="https://api.airtable.com/v0/appXXX/Table"
  headers='{"Authorization": "Bearer pat..."}'
  transform="records">
</dsfr-data-source>
<dsfr-data-normalize id="clean-at" source="airtable" flatten="fields" trim></dsfr-data-normalize>
\`\`\`

### Exemples
\`\`\`html
<!-- Conversion numerique + renommage -->
<dsfr-data-source id="raw" url="https://api.fr/data" transform="results"></dsfr-data-source>
<dsfr-data-normalize id="clean" source="raw"
  numeric="population, budget"
  rename="pop_tot:Population totale | lib_dep:Departement"
  trim>
</dsfr-data-normalize>
<dsfr-data-query id="stats" source="clean" group-by="Departement" aggregate="population:sum"></dsfr-data-query>
<dsfr-data-chart source="stats" type="bar" label-field="Departement" value-field="population__sum"></dsfr-data-chart>

<!-- Grist : aplatir + nettoyer + forcer les types numeriques -->
<dsfr-data-normalize id="clean" source="raw"
  flatten="fields"
  trim
  numeric="Montant_de_la_sanction_"
  rename="Montant_de_la_sanction_:Montant | Nom_de_l_entreprise:Entreprise">
</dsfr-data-normalize>

<!-- Nettoyage complet : trim + strip HTML + remplacement de valeurs vides -->
<dsfr-data-normalize id="propre" source="raw"
  trim
  strip-html
  replace="N/A: | n.d.: | -:0"
  numeric-auto>
</dsfr-data-normalize>

<!-- Arrondir des montants (supprimer les decimales) -->
<dsfr-data-normalize id="clean" source="raw"
  round="montant_investissement, montant_participation_etat">
</dsfr-data-normalize>

<!-- Arrondir a 2 decimales (taux) -->
<dsfr-data-normalize id="clean" source="raw" round="taux:2"></dsfr-data-normalize>

<!-- Normalisation des cles en minuscules -->
<dsfr-data-normalize id="lower" source="raw" lowercase-keys></dsfr-data-normalize>

<!-- INSEE Melodi : decoder les dimensions codees par champ -->
<dsfr-data-source id="raw" api-type="insee" base-url="https://api.insee.fr/melodi"
  dataset-id="DS_POPULATIONS_REFERENCE"
  where="POPREF_MEASURE:eq:PMUN, TIME_PERIOD:eq:2023"></dsfr-data-source>
<dsfr-data-normalize id="decoded" source="raw"
  replace-fields="AGE:Y30T39:30-39 ans | AGE:Y_LT30:Moins de 30 ans | PCS:3:Cadres | PCS:5:Employes"
  replace="N/A:">
</dsfr-data-normalize>
\`\`\``,
  },

  dsfrDataFacets: {
    id: 'dsfrDataFacets',
    name: 'dsfr-data-facets',
    description: 'Filtres a facettes interactifs pour exploration de donnees',
    trigger: [
      'facette',
      'facets',
      'filtre interactif',
      'categorie',
      'refinement',
      'exploration',
      'filtrer par',
    ],
    content: `## <dsfr-data-facets> - Filtres a facettes

Composant visuel intermediaire qui affiche des filtres interactifs (checkboxes) bases sur les valeurs
categoriques des donnees. Se place entre une source/normalize/query et les composants de visualisation.

### Position dans le pipeline
\`\`\`
dsfr-data-source -> dsfr-data-normalize -> dsfr-data-facets -> dsfr-data-chart / dsfr-data-list
\`\`\`
Les donnees filtrees sont redistribuees automatiquement aux composants en aval.

### Format des donnees
Entree : tableau d'objets (fourni par dsfr-data-source, dsfr-data-normalize ou dsfr-data-query).
Sortie : meme tableau, filtre selon les selections de l'utilisateur.

### Attributs
| Attribut | Type | Defaut | Requis | Description |
|----------|------|--------|--------|-------------|
| source | String | \`""\` | oui | ID de la source a ecouter |
| fields | String | \`""\` | non | Champs a exposer comme facettes (virgule-separes). Vide = auto-detection |
| labels | String | \`""\` | non | Labels custom : \`"field:Label | field2:Label 2"\` (pipe-separe) |
| max-values | Number | \`6\` | non | Nb de valeurs visibles par facette avant "Voir plus" |
| disjunctive | String | \`""\` | non | Champs en mode multi-selection OU (virgule-separes) |
| sort | String | \`"count"\` | non | Tri des valeurs : count, -count, alpha, -alpha |
| searchable | String | \`""\` | non | Champs avec barre de recherche (virgule-separes) |
| hide-empty | Boolean | \`false\` | non | Masquer les facettes avec une seule valeur |
| display | String | \`""\` | non | Mode d'affichage par facette : \`"field:select | field2:multiselect"\`. Modes : checkbox (defaut), select, multiselect, radio |
| hide-counts | Boolean | \`false\` | non | Masquer les compteurs (N) a cote de chaque valeur de facette |
| url-params | Boolean | \`false\` | non | Active la lecture des parametres d'URL comme pre-selections de facettes |
| url-param-map | String | \`""\` | non | Mapping URL param -> champ : \`"r:region | t:type"\`. Si vide, correspondance directe |
| url-sync | Boolean | \`false\` | non | Synchronise l'URL quand l'utilisateur change les facettes (replaceState) |
| server-facets | Boolean | \`false\` | non | Active le mode facettes serveur ODS. Fetch les valeurs depuis l'API ODS /facets. Requiert source vers dsfr-data-source api-type="opendatasoft" server-side (via dsfr-data-query). En mode server-facets, fields est obligatoire |
| static-values | String | \`""\` | non | Valeurs de facettes pre-calculees en JSON : \`'{"region":["IDF","PACA"],"type":["Commune"]}')\`. Les selections envoient des commandes WHERE en colon syntax au dsfr-data-query. Compteurs masques automatiquement. Utile pour Tabular/Grist/generique qui n'ont pas d'API facettes serveur |
| cols | String | \`""\` | non | Colonnage DSFR : \`"6"\` (global, 2/ligne), \`"4"\` (3/ligne), ou par facette \`"region:4 | type:6"\` (defaut fr-col-6 pour non-specifies) |

### Modes d'affichage
- **checkbox** (defaut) : fieldset DSFR avec checkboxes, compteurs, "Voir plus/moins", recherche optionnelle
- **select** : liste deroulante DSFR standard, selection exclusive (une seule valeur)
- **multiselect** : dropdown collapsible avec checkboxes DSFR, recherche integree, bouton "Tout selectionner/deselectionner"
- **radio** : dropdown collapsible avec radio buttons DSFR, recherche integree, selection exclusive

Le mode \`select\` rend la facette automatiquement exclusive.
Le mode \`radio\` rend la facette automatiquement exclusive.
Le mode \`multiselect\` rend la facette automatiquement disjonctive (multi-selection OU).

### Logique de filtrage
- Intra-facette : OU (afficher les lignes qui matchent l'une des valeurs selectionnees)
- Inter-facettes : ET (toutes les facettes doivent matcher)
- Les compteurs se recalculent dynamiquement selon les selections

### Auto-detection
Si \`fields\` est omis, le composant detecte automatiquement les champs categoriques :
champs de type string avec 2 a 50 valeurs uniques (exclut les champs ID-like).

### Exemples
\`\`\`html
<!-- Facettes avec auto-detection -->
<dsfr-data-source id="raw" url="https://api.fr/data" transform="data"></dsfr-data-source>
<dsfr-data-normalize id="clean" source="raw" trim numeric-auto></dsfr-data-normalize>
<dsfr-data-facets id="filtered" source="clean"></dsfr-data-facets>
<dsfr-data-list source="filtered"></dsfr-data-list>

<!-- Facettes explicites avec labels custom -->
<dsfr-data-facets id="filtered" source="clean"
  fields="region, type_etablissement, statut"
  labels="region:Region | type_etablissement:Type | statut:Statut"
  searchable="region"
  max-values="10">
</dsfr-data-facets>
<dsfr-data-chart source="filtered" type="bar" label-field="region" value-field="count"></dsfr-data-chart>

<!-- Modes d'affichage mixtes -->
<dsfr-data-facets id="filtered" source="clean"
  fields="region, departement, statut"
  display="region:select | departement:multiselect"
  labels="region:Region | departement:Departement | statut:Statut">
</dsfr-data-facets>

<!-- Pre-selection via URL params (ex: ?region=PACA&type=Commune) -->
<dsfr-data-facets id="filtered" source="clean"
  fields="region, type" url-params>
</dsfr-data-facets>

<!-- URL params avec mapping et synchronisation -->
<dsfr-data-facets id="filtered" source="clean"
  fields="region, type" url-params url-sync
  url-param-map="r:region | t:type">
</dsfr-data-facets>

<!-- Colonnage DSFR des facettes -->
<dsfr-data-facets id="filtered" source="clean"
  fields="region, departement, statut"
  cols="region:6 | departement:4 | statut:12">
</dsfr-data-facets>

<!-- Colonnage global (toutes en col-6 = 2 par ligne) -->
<dsfr-data-facets id="filtered" source="clean"
  fields="region, type, statut" cols="6">
</dsfr-data-facets>

<!-- Facettes serveur ODS (server-facets) -->
<dsfr-data-source id="src" api-type="opendatasoft"
  dataset-id="mon-dataset" base-url="https://data.example.com"
  server-side page-size="20">
</dsfr-data-source>
<dsfr-data-query id="q" source="src" server-side></dsfr-data-query>
<dsfr-data-search source="q" server-search placeholder="Rechercher..." count></dsfr-data-search>
<dsfr-data-facets id="filtered" source="q" server-facets
  fields="region, categorie"
  labels="region:Region | categorie:Categorie">
</dsfr-data-facets>
<dsfr-data-display source="filtered" cols="3" pagination="20">
  <template>...</template>
</dsfr-data-display>
\`\`\``,
  },

  dsfrDataSearch: {
    id: 'dsfrDataSearch',
    name: 'dsfr-data-search',
    description: 'Recherche textuelle avec champ DSFR, filtre les donnees en amont',
    trigger: [
      'recherche',
      'search',
      'chercher',
      'filtrer texte',
      'barre de recherche',
      'full-text',
    ],
    content: `## <dsfr-data-search> - Recherche textuelle

Composant visuel intermediaire qui affiche un champ de recherche DSFR et filtre
les donnees avant de les redistribuer aux composants en aval. Se place entre
une source/normalize et les facettes/visualisations.

### Position dans le pipeline
\`\`\`
dsfr-data-source -> dsfr-data-normalize -> dsfr-data-search -> dsfr-data-facets -> dsfr-data-display
\`\`\`
La recherche reduit le jeu de donnees, les facettes affinent ensuite.
Les compteurs de facettes se recalculent dynamiquement.

### Attributs
| Attribut | Type | Defaut | Requis | Description |
|----------|------|--------|--------|-------------|
| source | String | "" | oui | ID de la source a ecouter |
| fields | String | "" | non | Champs a rechercher (virgule-separes). Vide = tous les champs |
| placeholder | String | "Rechercher..." | non | Placeholder du champ |
| label | String | "Rechercher" | non | Label accessible |
| debounce | Number | 300 | non | Delai en ms avant filtrage |
| min-length | Number | 0 | non | Nb minimum de caracteres |
| highlight | Boolean | false | non | Ajoute _highlight avec <mark> pour dsfr-data-display |
| operator | String | "contains" | non | Mode : contains, starts, words |
| sr-label | Boolean | false | non | Label en sr-only (masque visuellement) |
| count | Boolean | false | non | Affiche compteur de resultats |
| url-search-param | String | "" | non | Nom du parametre d'URL a lire comme terme de recherche initial |
| url-sync | Boolean | false | non | Synchronise l'URL quand l'utilisateur tape (replaceState) |
| server-search | Boolean | false | non | Delegue la recherche au serveur via dsfr-data-query server-side |
| search-template | String | \`'search("{q}")'\` | non | Template ODSQL pour la recherche serveur ({q} = terme) |

### Recherche serveur
Avec \`server-search\`, au lieu de filtrer localement, dsfr-data-search envoie une commande
\`{ where }\` au source upstream (dsfr-data-query server-side). Le template par defaut utilise
la fonction ODSQL \`search()\` pour une recherche full-text. Personnalisable via \`search-template\`.

### Modes de recherche
- **contains** (defaut) : sous-chaine insensible a la casse et aux accents
- **starts** : chaque mot du champ doit commencer par le terme
- **words** : tous les mots saisis doivent etre presents (dans n'importe quel champ)

### Exemples
\`\`\`html
<!-- Recherche simple -->
<dsfr-data-search id="searched" source="clean"
  placeholder="Rechercher..." count>
</dsfr-data-search>
<dsfr-data-display source="searched" cols="2" pagination="12">
  <template>...</template>
</dsfr-data-display>

<!-- Recherche + facettes -->
<dsfr-data-search id="searched" source="clean"
  fields="nom, description, code"
  operator="words" count>
</dsfr-data-search>
<dsfr-data-facets id="filtered" source="searched"
  fields="categorie, region">
</dsfr-data-facets>
<dsfr-data-display source="filtered" ...>...</dsfr-data-display>

<!-- Recherche avec highlight -->
<dsfr-data-search id="searched" source="clean" highlight count>
</dsfr-data-search>
<dsfr-data-display source="searched" cols="1">
  <template>
    <h3>{{nom}}</h3>
    <p>{{{_highlight}}}</p>
  </template>
</dsfr-data-display>

<!-- Recherche pre-remplie depuis URL (ex: ?q=ecole) -->
<dsfr-data-search id="searched" source="clean"
  url-search-param="q" count>
</dsfr-data-search>

<!-- Recherche avec sync URL bidirectionnelle -->
<dsfr-data-search id="searched" source="clean"
  url-search-param="q" url-sync count>
</dsfr-data-search>

<!-- Recherche serveur (avec dsfr-data-query server-side) -->
<dsfr-data-search id="s" source="q" server-search
  url-search-param="q" url-sync count>
</dsfr-data-search>
\`\`\``,
  },

  dsfrDataKpi: {
    id: 'dsfrDataKpi',
    name: 'dsfr-data-kpi',
    description: 'Composant KPI avec agregation, seuils et tendances',
    trigger: [
      'kpi',
      'indicateur',
      'chiffre',
      'valeur',
      'tendance',
      'seuil',
      'pourcentage',
      'euro',
      'metrique',
      'grouper',
      'grille',
    ],
    content: `## <dsfr-data-kpi> - Indicateur chiffre cle

Affiche une valeur numerique mise en avant avec formatage, couleur conditionnelle, icone et tendance.
Se connecte a une dsfr-data-source ou dsfr-data-query via l'attribut \`source\`.

### Format des donnees
Attend un tableau d'objets. L'attribut \`valeur\` determine comment extraire/agreger la donnee :
- Valeur directe d'un champ : \`valeur="score"\` (prend le 1er enregistrement)
- Agregation sur tout le tableau : \`valeur="avg:score"\`, \`valeur="sum:montant"\`

### Attributs
| Attribut | Type | Defaut | Requis | Description |
|----------|------|--------|--------|-------------|
| source | String | \`""\` | oui | ID de la dsfr-data-source ou dsfr-data-query |
| valeur | String | \`""\` | oui | Expression : \`"champ"\`, \`"avg:champ"\`, \`"sum:champ"\`, \`"min:champ"\`, \`"max:champ"\`, \`"count:champ:valeur"\` |
| label | String | \`""\` | non | Libelle sous la valeur |
| description | String | \`""\` | non | Description pour accessibilite (sr-only) |
| icone | String | \`""\` | non | Classe Remix Icon : \`ri-global-line\`, \`ri-money-euro-circle-line\`, etc. |
| format | String | \`"nombre"\` | non | Format : nombre, pourcentage, euro, decimal |
| tendance | String | \`""\` | non | Expression de tendance : valeur fixe (\`"+3.2"\`) ou agregation |
| couleur | String | \`""\` | non | Forcer la couleur : vert, orange, rouge, bleu |
| seuil-vert | Number | - | non | Seuil au-dessus duquel couleur = vert |
| seuil-orange | Number | - | non | Seuil au-dessus duquel couleur = orange (en-dessous = rouge) |
| col | Number | - | non | Largeur en colonnes DSFR (1-12), actif uniquement dans un \`<dsfr-data-kpi-group>\` |

### Grouper des KPIs : \`<dsfr-data-kpi-group>\`
Utiliser \`<dsfr-data-kpi-group>\` pour disposer plusieurs KPIs en grille responsive :
\`\`\`html
<dsfr-data-kpi-group cols="3">
  <dsfr-data-kpi source="data" valeur="sum:population" label="Population totale" col="6"></dsfr-data-kpi>
  <dsfr-data-kpi source="data" valeur="avg:score" label="Score moyen" col="3"></dsfr-data-kpi>
  <dsfr-data-kpi source="data" valeur="count" label="Nombre" col="3"></dsfr-data-kpi>
</dsfr-data-kpi-group>
\`\`\`
- \`cols\` : nombre de colonnes par defaut (chaque KPI occupe 12/cols colonnes)
- \`col\` sur chaque dsfr-data-kpi : override individuel (1-12)
- \`gap\` : espacement entre KPIs (sm, md, lg)
- Responsive automatique : empile en mobile

### Logique des couleurs
1. Si \`couleur\` est defini : applique cette couleur directement
2. Si \`seuil-vert\` et \`seuil-orange\` sont definis : couleur automatique selon la valeur
   - valeur >= seuil-vert -> vert (success)
   - valeur >= seuil-orange -> orange (warning)
   - valeur < seuil-orange -> rouge (error)
3. Sinon : bleu par defaut (info)

### Expressions d'agregation (attribut valeur)
| Expression | Description | Exemple |
|-----------|-------------|---------|
| \`"champ"\` | Valeur directe du 1er enregistrement | \`valeur="score_rgaa"\` |
| \`"avg:champ"\` | Moyenne de tous les enregistrements | \`valeur="avg:score"\` |
| \`"sum:champ"\` | Somme | \`valeur="sum:montant"\` |
| \`"min:champ"\` | Minimum | \`valeur="min:prix"\` |
| \`"max:champ"\` | Maximum | \`valeur="max:prix"\` |
| \`"count:champ:valeur"\` | Nombre d'items ou champ = valeur | \`valeur="count:status:active"\` |

### Exemples
\`\`\`html
<!-- KPI simple avec somme et unite -->
<dsfr-data-kpi source="stats"
  valeur="sum:montant"
  label="CA total"
  format="euro"
  icone="ri-money-euro-circle-line">
</dsfr-data-kpi>

<!-- KPI avec seuils de couleur automatiques -->
<dsfr-data-kpi source="audit"
  valeur="avg:score_rgaa"
  label="Score RGAA moyen"
  format="pourcentage"
  seuil-vert="80"
  seuil-orange="50">
</dsfr-data-kpi>

<!-- KPI avec couleur forcee et tendance -->
<dsfr-data-kpi source="data"
  valeur="count:status:active"
  label="Sites actifs"
  couleur="bleu"
  tendance="+12">
</dsfr-data-kpi>
\`\`\``,
  },

  dsfrDataKpiGroup: {
    id: 'dsfrDataKpiGroup',
    name: 'dsfr-data-kpi-group',
    description: 'Conteneur grille responsive pour grouper plusieurs KPIs',
    trigger: [
      'grouper',
      'grille',
      'kpi-group',
      'plusieurs kpi',
      'groupe',
      'dashboard kpi',
      'colonnes kpi',
    ],
    content: `## <dsfr-data-kpi-group> - Groupe de KPIs en grille

Conteneur qui dispose plusieurs \`<dsfr-data-kpi>\` dans une grille CSS 12 colonnes responsive.

### Attributs
| Attribut | Type | Defaut | Requis | Description |
|----------|------|--------|--------|-------------|
| cols | Number | \`3\` | non | Nombre de colonnes par defaut (1-12) |
| gap | String | \`"md"\` | non | Espacement : sm (0.5rem), md (1rem), lg (1.5rem) |
| aria-label | String | \`""\` | non | Label accessible pour le groupe |

### Fonctionnement
- Grille CSS 12 colonnes (systeme DSFR)
- Chaque enfant occupe \`Math.floor(12 / cols)\` colonnes par defaut
- L'attribut \`col\` sur un enfant \`<dsfr-data-kpi>\` override la largeur (1-12)
- Responsive : empile en mobile (<768px), grille complete en desktop
- \`role="group"\` automatique pour l'accessibilite

### Exemples
\`\`\`html
<!-- 3 KPIs egaux -->
<dsfr-data-kpi-group cols="3">
  <dsfr-data-kpi source="data" valeur="count" label="Total"></dsfr-data-kpi>
  <dsfr-data-kpi source="data" valeur="avg:score" label="Moyenne"></dsfr-data-kpi>
  <dsfr-data-kpi source="data" valeur="max:score" label="Maximum"></dsfr-data-kpi>
</dsfr-data-kpi-group>

<!-- KPIs avec largeurs differentes -->
<dsfr-data-kpi-group>
  <dsfr-data-kpi source="data" valeur="sum:ca" label="CA total" col="6"></dsfr-data-kpi>
  <dsfr-data-kpi source="data" valeur="avg:marge" label="Marge moyenne" col="3"></dsfr-data-kpi>
  <dsfr-data-kpi source="data" valeur="count" label="Transactions" col="3"></dsfr-data-kpi>
</dsfr-data-kpi-group>

<!-- 4 KPIs avec espacement large -->
<dsfr-data-kpi-group cols="4" gap="lg">
  <dsfr-data-kpi source="data" valeur="sum:population" label="Population" format="nombre"></dsfr-data-kpi>
  <dsfr-data-kpi source="data" valeur="avg:score" label="Score moyen" format="pourcentage"></dsfr-data-kpi>
  <dsfr-data-kpi source="data" valeur="min:prix" label="Prix min" format="euro"></dsfr-data-kpi>
  <dsfr-data-kpi source="data" valeur="max:prix" label="Prix max" format="euro"></dsfr-data-kpi>
</dsfr-data-kpi-group>
\`\`\``,
  },

  dsfrDataChart: {
    id: 'dsfrDataChart',
    name: 'dsfr-data-chart',
    description: 'Wrapper DSFR Chart connecte aux sources de donnees',
    trigger: [
      'graphique',
      'chart',
      'visualisation',
      'barres',
      'camembert',
      'ligne',
      'radar',
      'nuage',
      'scatter',
      'carte',
      'map',
      'jauge',
      'gauge',
      'departement',
      'region',
      'databox',
      'habillage',
      'encadrer',
      'titre graphique',
      'source donnees',
      'screenshot',
      'capture ecran',
      'plein ecran',
      'fullscreen',
      'tendance',
      'trend',
    ],
    content: `## <dsfr-data-chart> - Graphiques DSFR

Wrapper connectant les composants DSFR Chart officiels au systeme dsfr-data-source/dsfr-data-query.
Se connecte a une source via l'attribut \`source\`. Genere automatiquement le format
JSON imbrique attendu par les composants DSFR Chart natifs.

### Format des donnees
Attend un tableau d'objets plats depuis la source :
\`[{"region": "IDF", "population": 12000000}, {"region": "OCC", "population": 6000000}]\`

Les champs \`label-field\` et \`value-field\` indiquent quels champs utiliser pour
les labels (axe X) et les valeurs (axe Y). Le composant transforme automatiquement
ce tableau en format DSFR Chart (tableaux imbriques x/y).

### Types supportes
| Type | Composant DSFR | Description |
|------|---------------|-------------|
| bar | bar-chart | Barres verticales (ou horizontales avec \`horizontal\`) |
| line | line-chart | Courbes / lignes |
| pie | pie-chart | Anneau (defaut) ou camembert plein (avec \`fill\`) |
| radar | radar-chart | Diagramme radar |
| scatter | scatter-chart | Nuage de points |
| gauge | gauge-chart | Jauge circulaire 0-100% |
| bar-line | bar-chart + line-chart | Combine barres et ligne (2 series) |
| map | map-chart | Carte par departement francais |
| map-reg | map-chart-reg | Carte par region francaise |

### Attributs
| Attribut | Type | Defaut | Requis | Description |
|----------|------|--------|--------|-------------|
| source | String | \`""\` | oui | ID de la source ou query |
| type | String | \`"bar"\` | oui | Type de graphique (voir tableau ci-dessus) |
| label-field | String | \`""\` | selon type | Chemin vers les labels dans les donnees |
| value-field | String | \`""\` | oui (sauf gauge) | Chemin vers les valeurs |
| value-field-2 | String | \`""\` | non | 2e serie de valeurs (bar-line) |
| value-fields | String | \`""\` | non | Series supplementaires separees par virgules (ex: \`"budget,score"\`) |
| name | String | \`""\` | non | Noms des series en JSON : \`'["Serie 1","Serie 2"]'\` |
| selected-palette | String | \`"categorical"\` | non | Palette : categorical, sequentialAscending, sequentialDescending, divergentAscending, divergentDescending, neutral, default |
| unit-tooltip | String | \`""\` | non | Unite dans les info-bulles : %, EUR, etc. |
| unit-tooltip-bar | String | \`""\` | non | Unite des barres dans un bar-line |
| horizontal | Boolean | \`false\` | non | Barres horizontales (type bar uniquement) |
| stacked | Boolean | \`false\` | non | Barres empilees (type bar uniquement) |
| fill | Boolean | \`false\` | non | Camembert plein au lieu d'anneau (type pie) |
| highlight-index | String | \`""\` | non | Indices a mettre en avant : \`"[0, 2]"\` |
| x-min | String | \`""\` | non | Limite min axe X |
| x-max | String | \`""\` | non | Limite max axe X |
| y-min | String | \`""\` | non | Limite min axe Y |
| y-max | String | \`""\` | non | Limite max axe Y |
| gauge-value | Number | \`null\` | type gauge | Valeur de la jauge (0-100) |
| code-field | String | \`""\` | type map/map-reg | Champ contenant le code departement ou region (prioritaire sur label-field) |
| map-highlight | String | \`""\` | non | Departements/regions a surligner |

### Attributs par type de graphique
| Type | Attributs essentiels | Attributs optionnels |
|------|---------------------|---------------------|
| bar | source, type, label-field, value-field | horizontal, stacked, highlight-index, selected-palette |
| line | source, type, label-field, value-field | x-min, x-max, y-min, y-max, value-field-2 |
| pie | source, type, label-field, value-field | fill (false=anneau, true=camembert plein) |
| radar | source, type, label-field, value-field | value-field-2, name |
| scatter | source, type, label-field, value-field | x-min, x-max, y-min, y-max |
| gauge | source, type, gauge-value | - |
| bar-line | source, type, label-field, value-field, value-field-2 | name, unit-tooltip, unit-tooltip-bar |
| map | source, type, code-field, value-field | selected-palette, map-highlight |
| map-reg | source, type, code-field, value-field | selected-palette, map-highlight |

### Exemples
\`\`\`html
<!-- Barres verticales -->
<dsfr-data-chart source="stats" type="bar"
  label-field="region" value-field="population"
  selected-palette="categorical">
</dsfr-data-chart>

<!-- Barres horizontales empilees -->
<dsfr-data-chart source="data" type="bar"
  label-field="categorie" value-field="valeur"
  horizontal stacked>
</dsfr-data-chart>

<!-- Combine barres + ligne -->
<dsfr-data-chart source="data" type="bar-line"
  label-field="mois" value-field="ca" value-field-2="objectif"
  name='["CA","Objectif"]'
  unit-tooltip="EUR" unit-tooltip-bar="EUR">
</dsfr-data-chart>

<!-- Anneau (defaut de pie) -->
<dsfr-data-chart source="repartition" type="pie"
  label-field="categorie" value-field="montant"
  unit-tooltip="%">
</dsfr-data-chart>

<!-- Camembert plein -->
<dsfr-data-chart source="repartition" type="pie"
  label-field="categorie" value-field="montant" fill>
</dsfr-data-chart>

<!-- Carte par departement -->
<dsfr-data-chart source="dept-data" type="map"
  code-field="code_dept" value-field="valeur"
  selected-palette="sequentialAscending">
</dsfr-data-chart>

<!-- Carte par region -->
<dsfr-data-chart source="reg-data" type="map-reg"
  code-field="code_reg" value-field="valeur">
</dsfr-data-chart>

<!-- Jauge -->
<dsfr-data-chart type="gauge" gauge-value="73"></dsfr-data-chart>
\`\`\`

### Habillage DataBox (optionnel)

L'attribut \`databox\` active l'habillage DataBox DSFR autour du graphique :
cadre editorial avec titre, source, date, switch chart/tableau integre, screenshot PNG,
telechargement CSV, plein ecran, tendance.

| Attribut | Type | Defaut | Description |
|----------|------|--------|-------------|
| databox | Boolean | \`false\` | Active l'habillage DataBox DSFR |
| databox-title | String | \`""\` | Titre affiche dans l'en-tete (ex: "Population par region") |
| databox-source | String | \`""\` | Source des donnees (ex: "INSEE, RP 2021") |
| databox-date | String | \`""\` | Date des donnees (ex: "Mars 2024") |
| databox-download | Boolean | \`false\` | Bouton telechargement CSV |
| databox-screenshot | Boolean | \`false\` | Bouton screenshot PNG |
| databox-fullscreen | Boolean | \`false\` | Bouton plein ecran |
| databox-trend | String | \`""\` | Tendance (ex: "+5.2" ou "-3.1") |
| databox-tooltip-title | String | \`""\` | Titre du tooltip info |
| databox-tooltip-content | String | \`""\` | Contenu du tooltip info |
| databox-modal-title | String | \`""\` | Titre de la modale |
| databox-modal-content | String | \`""\` | Contenu de la modale |
| databox-default-source | String | \`""\` | Source par defaut (selecteur multi-source) |
| databox-actions | String | \`""\` | Actions personnalisees (JSON array) |

Quand \`databox\` est active, dsfr-data-a11y ne doit PAS inclure \`table\` ni \`download\`
(DataBox les fournit deja). Conserver uniquement \`description\` sur dsfr-data-a11y.

\`\`\`html
<!-- Graphique avec habillage DataBox -->
<dsfr-data-chart source="data" type="bar"
  label-field="region" value-field="total"
  databox
  databox-title="Population par region"
  databox-source="INSEE, RP 2021"
  databox-date="Mars 2024"
  databox-download>
</dsfr-data-chart>
<dsfr-data-a11y for="chart" source="data"
  description="L'Ile-de-France concentre la majorite de la population.">
</dsfr-data-a11y>
\`\`\``,
  },

  dsfrDataList: {
    id: 'dsfrDataList',
    name: 'dsfr-data-list',
    description: 'Tableau de donnees avec recherche, filtres, tri, pagination et export CSV/HTML',
    trigger: [
      'tableau',
      'table',
      'liste',
      'colonnes',
      'pagination',
      'exporter',
      'csv',
      'html',
      'recherche',
      'datalist',
    ],
    content: `## <dsfr-data-list> - Tableau de donnees

Affiche un tableau DSFR filtrable, triable, paginable avec export CSV et/ou HTML.
Se connecte a une dsfr-data-source ou dsfr-data-query via l'attribut \`source\`.

### Format des donnees
Attend un tableau d'objets plats. Les colonnes sont definies par l'attribut \`colonnes\`
au format \`"cle_json:Label affiche, cle2:Label2"\`. Si \`colonnes\` est omis, toutes
les cles du premier objet sont utilisees comme colonnes.

### Attributs
| Attribut | Type | Defaut | Requis | Description |
|----------|------|--------|--------|-------------|
| source | String | \`""\` | oui | ID de la source ou query |
| colonnes | String | \`""\` | non | Definition des colonnes : \`"key:Label, key2:Label2"\` |
| recherche | Boolean | \`false\` | non | Afficher la barre de recherche full-text |
| filtres | String | \`""\` | non | Colonnes filtrables (dropdown) : \`"col1,col2"\` |
| tri | String | \`""\` | non | Tri par defaut : \`"col:asc"\` ou \`"col:desc"\` |
| pagination | Number | \`0\` | non | Lignes par page (0 = tout afficher sans pagination) |
| export | String | \`""\` | non | Formats d'export : \`"csv"\`, \`"html"\` ou \`"csv,html"\` |
| url-sync | Boolean | \`false\` | non | Synchronise le numero de page dans l'URL (?page=N) via replaceState |
| url-page-param | String | \`"page"\` | non | Nom du parametre URL pour la page |
| server-tri | Boolean | \`false\` | non | Delegue le tri au serveur via dsfr-data-query server-side |

### Tri serveur
Avec \`server-tri\`, le clic sur un en-tete de colonne envoie une commande \`{ orderBy }\`
au source upstream (dsfr-data-query server-side) au lieu de trier localement. Les donnees
reviennent deja triees du serveur.

### Pagination serveur
Quand la source est un \`dsfr-data-source\` avec \`paginate\`, dsfr-data-list detecte automatiquement
la pagination serveur via les metadonnees (\`meta.total\`, \`meta.page_size\`).
Chaque changement de page declenche un nouvel appel API (pas de pagination client).
Le total affiche vient de \`meta.total\`. La recherche et le tri ne s'appliquent qu'a la page courante.

### Synchronisation URL
Avec \`url-sync\`, le numero de page est synchronise dans l'URL via \`replaceState\`.
L'attribut \`url-page-param\` permet de personnaliser le nom du parametre (defaut: "page").
Quand la page est 1, le parametre est supprime de l'URL pour des URLs plus propres.
Fonctionne avec la pagination client et serveur. Compatible avec les autres params URL (facettes, recherche).

### Exemples
\`\`\`html
<!-- Tableau simple -->
<dsfr-data-list source="data"
  colonnes="nom:Nom, email:Email, ville:Ville">
</dsfr-data-list>

<!-- Tableau complet avec toutes les fonctionnalites -->
<dsfr-data-list source="sites"
  colonnes="nom:Nom du site, ministere:Ministere, score_rgaa:Score RGAA"
  recherche
  filtres="ministere"
  tri="score_rgaa:desc"
  pagination="20"
  export="csv,html">
</dsfr-data-list>
\`\`\``,
  },

  dsfrDataDisplay: {
    id: 'dsfrDataDisplay',
    name: 'dsfr-data-display',
    description: 'Affichage dynamique de donnees via template HTML (cartes, tuiles, listes)',
    trigger: [
      'cartes',
      'carte',
      'tuiles',
      'tuile',
      'cards',
      'tiles',
      'display',
      'template',
      'affichage',
      'liste de resultats',
      'motif repetitif',
    ],
    content: `## <dsfr-data-display> - Affichage dynamique via template

Genere des elements HTML repetitifs (cartes DSFR, tuiles, callouts, etc.) a partir
d'un template et d'une source de donnees. Chaque element du tableau de donnees produit
une instance du template avec les valeurs injectees.

### Syntaxe du template
Le template est defini dans un element \`<template>\` enfant du composant.
Les placeholders sont remplaces pour chaque element de donnees :

| Syntaxe | Description |
|---------|-------------|
| \`{{champ}}\` | Valeur echappee (HTML-safe) |
| \`{{{champ}}}\` | Valeur brute (non echappee — utiliser avec precaution) |
| \`{{champ|defaut}}\` | Valeur avec fallback si null/undefined |
| \`{{champ:number}}\` | Valeur avec separateur de milliers (ex: 32073247 → 32 073 247) |
| \`{{champ:number|0}}\` | Format number + fallback si null |
| \`{{champ.sous.cle}}\` | Acces aux proprietes imbriquees (dot notation) |
| \`{{$index}}\` | Index de l'element dans le tableau (0-based) |
| \`{{$uid}}\` | Identifiant unique de l'element (base sur uid-field ou index) |

### Attributs
| Attribut | Type | Defaut | Requis | Description |
|----------|------|--------|--------|-------------|
| source | String | \`""\` | oui | ID de la source, query ou normalize |
| cols | Number | \`1\` | non | Nombre de colonnes dans la grille (1-6) |
| pagination | Number | \`0\` | non | Elements par page (0 = tout afficher) |
| empty | String | \`"Aucun resultat"\` | non | Message quand le tableau est vide |
| gap | String | \`"fr-grid-row--gutters"\` | non | Classe CSS de gap pour la grille |
| uid-field | String | \`""\` | non | Champ de donnees pour l'ID unique par item. Chaque item recoit un id="item-{valeur}" pour ancrage URL |
| url-sync | Boolean | \`false\` | non | Synchronise le numero de page dans l'URL (?page=N) via replaceState |
| url-page-param | String | \`"page"\` | non | Nom du parametre URL pour la page |

### Pagination serveur
Quand la source est un \`dsfr-data-source\` avec \`paginate\`, dsfr-data-display detecte automatiquement
la pagination serveur via les metadonnees (\`meta.total\`, \`meta.page_size\`).
Chaque changement de page declenche un nouvel appel API. Les donnees recues sont affichees
telles quelles (pas de slicing client). Le nombre total de pages vient de \`meta.total / meta.page_size\`.

### Synchronisation URL
Avec \`url-sync\`, le numero de page est synchronise dans l'URL via \`replaceState\`.
L'attribut \`url-page-param\` permet de personnaliser le nom du parametre (defaut: "page").
Quand la page est 1, le parametre est supprime de l'URL. Compatible avec les autres params URL.

### Exemples
\`\`\`html
<!-- Cartes DSFR en grille 3 colonnes avec pagination -->
<dsfr-data-display source="data" cols="3" pagination="12">
  <template>
    <div class="fr-card">
      <div class="fr-card__body">
        <div class="fr-card__content">
          <h3 class="fr-card__title">{{titre}}</h3>
          <p class="fr-card__desc">{{description}}</p>
        </div>
        <div class="fr-card__footer">
          <p class="fr-badge fr-badge--sm">{{categorie}}</p>
        </div>
      </div>
    </div>
  </template>
</dsfr-data-display>

<!-- Tuiles DSFR simples -->
<dsfr-data-display source="data" cols="4">
  <template>
    <div class="fr-tile">
      <div class="fr-tile__body">
        <div class="fr-tile__content">
          <h3 class="fr-tile__title">{{nom}}</h3>
          <p class="fr-tile__desc">{{description|Pas de description}}</p>
        </div>
      </div>
    </div>
  </template>
</dsfr-data-display>

<!-- Montants avec separateurs de milliers -->
<dsfr-data-display source="data" cols="3" pagination="12">
  <template>
    <div class="fr-card">
      <div class="fr-card__body">
        <div class="fr-card__content">
          <h3 class="fr-card__title">{{nom}}</h3>
          <p class="fr-card__desc">Budget : {{montant:number}} \u20ac</p>
        </div>
      </div>
    </div>
  </template>
</dsfr-data-display>

<!-- Cartes avec identifiants uniques et ancrage URL (ex: page.html#item-42) -->
<dsfr-data-display source="data" cols="3" pagination="12" uid-field="id">
  <template>
    <div class="fr-card">
      <div class="fr-card__body">
        <div class="fr-card__content">
          <h3 class="fr-card__title">
            <a href="#{{$uid}}">{{titre}}</a>
          </h3>
          <p class="fr-card__desc">{{description}}</p>
        </div>
      </div>
    </div>
  </template>
</dsfr-data-display>
\`\`\``,
  },

  // ---------------------------------------------------------------------------
  // Composants DSFR Chart natifs
  // ---------------------------------------------------------------------------

  dsfrChartNative: {
    id: 'dsfrChartNative',
    name: 'Composants DSFR Chart natifs',
    description: 'Attributs detailles des composants line-chart, bar-chart, pie-chart, etc.',
    trigger: [
      'dsfr',
      'natif',
      'officiel',
      'accessibilite',
      'rgaa',
      'bar-chart',
      'line-chart',
      'pie-chart',
      'map-chart',
      'gauge-chart',
    ],
    content: `## Composants DSFR Chart natifs

Les composants DSFR Chart sont des Web Components Vue utilises en interne par dsfr-data-chart.
En usage direct (sans dsfr-data-chart), ils acceptent des donnees au format JSON stringifie.

NOTE : preferer dsfr-data-chart qui gere automatiquement le format de donnees.
N'utiliser les composants natifs que pour des cas avances.

### Format des donnees
\`\`\`html
x='[["Jan","Fev","Mar"]]'     <!-- Labels (tableau imbrique) -->
y='[[100, 200, 150]]'         <!-- Valeurs (tableau imbrique) -->
<!-- Multi-series -->
x='[["Jan","Fev"],["Jan","Fev"]]'
y='[[100, 200],[150, 180]]'
name='["Serie A","Serie B"]'
\`\`\`

### <bar-chart>
- horizontal : barres horizontales
- stacked : barres empilees
- highlight-index='[3]' : mettre en avant une barre

### <line-chart>
- x-min, x-max, y-min, y-max : limites des axes

### <pie-chart>
- fill="true" : camembert plein (defaut: anneau/donut)

### <gauge-chart>
- percent : valeur actuelle (0-100)
- init : valeur de depart
- target : valeur cible

### <scatter-chart>
- x, y : coordonnees des points

### <radar-chart>
- Multi-series pour comparer des profils

### <map-chart> (carte par departement)
- data='{"75": 95, "69": 78, "2A": 60}' : JSON code_dept -> valeur
- Codes departements valides : 01-95, 2A, 2B, 971-976
- name : nom de l'indicateur
- value-nat : valeur nationale de reference
- selected-palette : palette de couleurs

### <map-chart-reg> (carte par region)
- Meme format que map-chart avec codes region

### Attributs communs
- selected-palette : categorical, sequentialAscending, sequentialDescending, divergentAscending, divergentDescending, neutral, default
- unit-tooltip : unite dans les info-bulles
- name : noms des series en JSON`,
  },

  // ---------------------------------------------------------------------------
  // Patterns de composition
  // ---------------------------------------------------------------------------

  compositionPatterns: {
    id: 'compositionPatterns',
    name: 'Patterns de composition',
    description: 'Assembler source, query et visualisations en dashboards',
    trigger: [
      'dashboard',
      'tableau de bord',
      'assembler',
      'combiner',
      'pipeline',
      'plusieurs',
      'ensemble',
      'complet',
      'page',
      'embarquer',
      'integrer',
    ],
    content: `## Patterns de composition dsfr-data

### REGLE IMPORTANTE : privilegier les sources dynamiques
1. **Source API dynamique** (ODS, Tabular, INSEE) = premier choix. Les donnees se mettent a jour automatiquement, la pagination serveur est geree, les agregations et filtres sont delegues au serveur.
2. **Grist** = excellent choix pour les donnees collaboratives (tableaux partages). Suggerer a l'utilisateur de publier ses donnees sur grist.numerique.gouv.fr s'il n'a pas d'API.
3. **Donnees embarquees** (data='[...]') = dernier recours uniquement. Les donnees sont figees et alourdissent le HTML.

### REGLE IMPORTANTE : deleguer le travail au serveur
Preferer 3 \`dsfr-data-source\` bien cibles (avec select, where, group-by cote serveur) plutot qu'un seul source qui fetch tout sans filtre. Chainer les \`dsfr-data-query\` pour affiner :
- \`dsfr-data-source\` avec \`select\`, \`where\`, \`group-by\` cote serveur → reduit le volume transfere
- \`dsfr-data-query\` en chaine pour transformer/filtrer/agreger le resultat
- Chaque visualisation peut avoir sa propre query pointant vers la meme source

### Architecture : composants freres lies par ID
Les composants dsfr-data sont des elements HTML freres (pas imbriques).
Ils communiquent via un bus evenementiel interne : \`source="id-de-la-source"\`.
\`\`\`
<dsfr-data-source id="X">   --dispatch-->   <dsfr-data-query source="X">   --dispatch-->   <dsfr-data-chart source="...">
\`\`\`

### Pipeline standard : Source -> Query -> Visualisation
\`\`\`html
<dsfr-data-source id="data"
  url="https://api.exemple.fr/records"
  transform="results">
</dsfr-data-source>

<dsfr-data-query id="top10" source="data"
  group-by="region"
  aggregate="population:sum"
  order-by="population__sum:desc"
  limit="10">
</dsfr-data-query>

<dsfr-data-chart source="top10" type="bar"
  label-field="region" value-field="population__sum"
  selected-palette="categorical">
</dsfr-data-chart>
\`\`\`

### Accessibilite : ajouter dsfr-data-a11y
Pour ameliorer l'accessibilite, ajoutez \`dsfr-data-a11y\` apres chaque visualisation :
\`\`\`html
<dsfr-data-chart id="mon-graph" source="top10" type="bar"
  label-field="region" value-field="population__sum">
</dsfr-data-chart>
<dsfr-data-a11y for="mon-graph" source="top10" table download></dsfr-data-a11y>
\`\`\`
L'attribut \`for\` injecte un skip link et pose \`aria-describedby\` + \`aria-details\` sur le graphique cible.

### Pipeline simplifie : Source -> Visualisation (sans transformation)
\`\`\`html
<dsfr-data-source id="data" url="https://api.fr/records" transform="results"></dsfr-data-source>
<dsfr-data-chart source="data" type="line" label-field="date" value-field="valeur"></dsfr-data-chart>
\`\`\`

### Multi-consommation : 1 source -> N visualisations
\`\`\`html
<dsfr-data-source id="sites" url="https://api.fr/sites" transform="results"></dsfr-data-source>

<!-- KPIs -->
<dsfr-data-kpi source="sites" valeur="count:status:active" label="Sites actifs" couleur="vert"></dsfr-data-kpi>
<dsfr-data-kpi source="sites" valeur="avg:score_rgaa" label="Score RGAA moyen" format="pourcentage" seuil-vert="80" seuil-orange="50"></dsfr-data-kpi>

<!-- Graphique -->
<dsfr-data-chart source="sites" type="bar" label-field="ministere" value-field="score_rgaa" selected-palette="categorical"></dsfr-data-chart>

<!-- Tableau -->
<dsfr-data-list source="sites" colonnes="nom:Nom, ministere:Ministere, score_rgaa:Score" recherche filtres="ministere" tri="score_rgaa:desc" pagination="20" export="csv"></dsfr-data-list>
\`\`\`

### Chainabilite des queries
\`\`\`html
<dsfr-data-source id="raw" url="..." transform="data"></dsfr-data-source>
<dsfr-data-query id="actifs" source="raw" where="status:eq:active"></dsfr-data-query>
<dsfr-data-query id="top5" source="actifs" group-by="region" aggregate="montant:sum" order-by="montant__sum:desc" limit="5"></dsfr-data-query>
<dsfr-data-chart source="top5" type="pie" label-field="region" value-field="montant__sum"></dsfr-data-chart>
\`\`\`

### Pipeline Grist : Source(api-type=grist) -> Query -> Visualisation

dsfr-data-source avec \`api-type="grist"\` fetch et aplatit automatiquement \`records[].fields\`.
L'adapter choisit entre mode Records (filter/sort/pagination) et mode SQL (group-by, aggregation, facettes).

\`\`\`html
<dsfr-data-source id="src" api-type="grist"
  base-url="${PROXY_BASE_URL}/grist-gouv-proxy/api/docs/DOC_ID/tables/TABLE/records"
  headers='{"Authorization":"Bearer API_KEY"}'>
</dsfr-data-source>
<dsfr-data-query id="data" source="src"
  group-by="region"
  aggregate="population:sum"
  order-by="population__sum:desc"
  limit="10">
</dsfr-data-query>

<dsfr-data-chart source="data" type="bar"
  label-field="region" value-field="population__sum"
  selected-palette="categorical">
</dsfr-data-chart>
\`\`\`

### Pipeline Grist avec facettes :
\`\`\`html
<dsfr-data-source id="src" api-type="grist"
  base-url="${PROXY_BASE_URL}/grist-gouv-proxy/api/docs/DOC_ID/tables/TABLE/records"
  headers='{"Authorization":"Bearer API_KEY"}'>
</dsfr-data-source>

<dsfr-data-facets id="filtered" source="src"
  fields="categorie, region"
  labels="categorie:Categorie | region:Region">
</dsfr-data-facets>

<dsfr-data-display source="filtered" cols="3" pagination="12">
  <template>
    <div class="fr-card">
      <div class="fr-card__body">
        <div class="fr-card__content">
          <h3 class="fr-card__title">{{nom}}</h3>
          <p class="fr-badge fr-badge--sm">{{categorie}}</p>
        </div>
      </div>
    </div>
  </template>
</dsfr-data-display>
\`\`\`

### IMPORTANT : Source ODS v1 ou Airtable (donnees imbriquees)
Si la source utilise \`transform="records"\` et que les donnees sont sous \`fields\`,
ajouter \`<dsfr-data-normalize flatten="fields" trim numeric-auto>\` apres la source.
Les noms de champs doivent etre les noms APLATIS (ex: \`Departement\`) et non les chemins imbriques (\`fields.Departement\`).

### Pipeline avec recherche : Source -> Search -> Facets -> Visualisation
\`\`\`html
<dsfr-data-source id="data" url="https://api.exemple.fr/records" transform="results"></dsfr-data-source>
<dsfr-data-normalize id="clean" source="data" trim></dsfr-data-normalize>

<dsfr-data-search id="searched" source="clean"
  fields="nom, description"
  placeholder="Rechercher..."
  operator="words" count>
</dsfr-data-search>

<dsfr-data-facets id="filtered" source="searched"
  fields="categorie, region">
</dsfr-data-facets>

<dsfr-data-display source="filtered" cols="3" pagination="12">
  <template>
    <div class="fr-card">
      <div class="fr-card__body">
        <div class="fr-card__content">
          <h3 class="fr-card__title">{{nom}}</h3>
          <p class="fr-badge fr-badge--sm">{{categorie}}</p>
        </div>
      </div>
    </div>
  </template>
</dsfr-data-display>
\`\`\`

La recherche et les facettes se combinent : la recherche reduit le jeu,
les facettes affinent. Les KPI et graphiques en aval se mettent a jour en temps reel.

### Format de sortie : snippet embarquable (PAS une page HTML complete)
Le code genere doit etre un **snippet** pret a copier-coller dans une page existante.
- **NE PAS** generer \`<!DOCTYPE html>\`, \`<html>\`, \`<head>\`, \`<body>\` ni \`<meta>\`.
- Generer uniquement : les dependances CDN (liens CSS + scripts) puis les composants HTML.
- L'utilisateur collera ce snippet dans sa propre page.

### Dependances CDN requises
Toujours inclure ces 6 dependances dans cet ordre exact :
\`\`\`html
<!-- CSS DSFR (obligatoire) -->
<link rel="stylesheet" href="${CDN_URLS.dsfrCss}">
<link rel="stylesheet" href="${CDN_URLS.dsfrUtilityCss}">

<!-- DSFR Chart (obligatoire pour les graphiques) -->
<link rel="stylesheet" href="${CDN_URLS.dsfrChartCss}">
<script src="${CDN_URLS.chartJs}"><\/script>
<script type="module" src="${CDN_URLS.dsfrChartJs}"><\/script>

<!-- dsfr-data (obligatoire) -->
<script src="${LIB_URL}/dsfr-data.core.umd.js"><\/script>
\`\`\`

### Exemple de snippet complet
\`\`\`html
<link rel="stylesheet" href="${CDN_URLS.dsfrCss}">
<link rel="stylesheet" href="${CDN_URLS.dsfrUtilityCss}">
<link rel="stylesheet" href="${CDN_URLS.dsfrChartCss}">
<script src="${CDN_URLS.chartJs}"><\/script>
<script type="module" src="${CDN_URLS.dsfrChartJs}"><\/script>
<script src="${LIB_URL}/dsfr-data.core.umd.js"><\/script>

<dsfr-data-source id="data" url="VOTRE_URL_API" transform="results"></dsfr-data-source>
<dsfr-data-chart source="data" type="bar" label-field="CHAMP_LABEL" value-field="CHAMP_VALEUR"></dsfr-data-chart>
\`\`\`

### Pattern avec habillage DataBox

Utiliser ce pattern quand l'utilisateur demande un graphique "presentable", "publiable",
"avec un titre", un export CSV/screenshot, un mode plein ecran, ou un cadre editorial.

\`\`\`html
<dsfr-data-source id="src" api-type="opendatasoft"
  base-url="https://data.economie.gouv.fr"
  dataset-id="population-dept">
</dsfr-data-source>
<dsfr-data-query id="data" source="src"
  group-by="region" aggregate="population:sum:total"
  order-by="total:desc">
</dsfr-data-query>
<dsfr-data-chart id="chart" source="data" type="bar"
  label-field="region" value-field="total"
  databox databox-title="Population par region"
  databox-source="INSEE via data.economie.gouv.fr"
  databox-date="2024"
  databox-download databox-screenshot>
</dsfr-data-chart>
<dsfr-data-a11y for="chart" source="data"
  description="L'Ile-de-France domine largement.">
</dsfr-data-a11y>
\`\`\``,
  },

  // ---------------------------------------------------------------------------
  // ODSQL et APIs
  // ---------------------------------------------------------------------------

  odsql: {
    id: 'odsql',
    name: 'ODSQL (OpenDataSoft Query Language)',
    description: 'Syntaxe de requetes pour les APIs OpenDataSoft',
    trigger: ['odsql', 'opendatasoft'],
    content: `## ODSQL - OpenDataSoft Query Language

Syntaxe de requetes utilisee par les APIs OpenDataSoft (mode \`api-type="opendatasoft"\` de dsfr-data-query)
et par l'action \`reloadData\` du builder-IA.

### Parametres de requete
| Parametre | Description | Exemple |
|-----------|-------------|---------|
| select | Champs a retourner (avec aliases) | \`select=nom,population\` ou \`select=avg(prix) as prix_moyen\` |
| where | Condition de filtrage | \`where=population>10000\` ou \`where=nom like "Paris%"\` |
| group_by | Champ de groupement | \`group_by=region\` |
| order_by | Tri | \`order_by=population DESC\` |
| limit | Max resultats (defaut: 10, max: 100 par requete) | \`limit=100\` |
| offset | Pagination | \`offset=100\` |

IMPORTANT : \`limit\` est plafonne a 100 par requete par l'API ODS.
dsfr-data-query gere automatiquement la pagination via offset quand la limite demandee > 100
(ex: cartes departementales avec 101 departements). Max 10 pages (1000 resultats).

### Fonctions d'agregation ODSQL
- count(*), count(champ)
- sum(champ), avg(champ), min(champ), max(champ)
- percentile(champ, 50) pour la mediane

### Operateurs WHERE (syntaxe SQL)
| Operateur | Exemple |
|-----------|---------|
| =, !=, <, >, <=, >= | \`population > 10000\` |
| like, not like | \`nom like "Paris%"\` (% = wildcard) |
| in, not in | \`region in ("IDF","PACA")\` |
| is null, is not null | \`email is not null\` |
| and, or, not | \`population > 10000 and region = "IDF"\` |

### Fonctions sur les dates
- year(date), month(date), day(date)
- date_format(date, "YYYY-MM")

### Exemple complet
\`?select=region,avg(prix) as prix_moyen&where=annee>=2020&group_by=region&order_by=prix_moyen DESC&limit=10\`

NOTE : ne pas confondre la syntaxe ODSQL (SQL-like) avec la syntaxe de filtre
dsfr-data-query mode generic (\`"champ:operateur:valeur"\`). Ce sont deux systemes distincts.`,
  },

  odsApiVersions: {
    id: 'odsApiVersions',
    name: 'Versions API OpenDataSoft',
    description: 'Differences entre v1, v2 et v2.1',
    trigger: ['version', 'v1', 'v2', 'v2.1', 'migration'],
    content: `## Versions des APIs OpenDataSoft

### API v2.1 (recommandee)
- URL: \`/api/explore/v2.1/catalog/datasets/{dataset_id}/records\`
- Reponse: \`{ results: [...], total_count: N }\`
- \`transform="results"\` pour dsfr-data-source
- ODSQL complet supporte
- Pagination: limit + offset

### API v2.0
- URL: \`/api/v2/catalog/datasets/{dataset_id}/records\`
- Similaire a v2.1, quelques fonctions ODSQL manquantes
- Deprecie, preferer v2.1

### API v1 (legacy)
- URL: \`/api/records/1.0/search/?dataset={dataset_id}\`
- Reponse: \`{ records: [{ fields: {...}, recordid: "..." }] }\`
- \`transform="records"\` puis les donnees sont dans \`record.fields\`
- Parametres differents: q (recherche), refine, exclude, rows, start

### Detection automatique
- URL contient \`/v2.1/\` -> v2.1
- URL contient \`/v2/\` -> v2
- URL contient \`/1.0/\` ou \`rows=\` -> v1
- Par defaut essayer v2.1

### Migration v1 -> v2.1
| v1 | v2.1 |
|---|---|
| rows=N | limit=N |
| start=N | offset=N |
| q=texte | where=search(champ,"texte") |
| refine.champ=val | where=champ="val" |
| record.fields.X | record.X |

### API v1 avec dsfr-data
L'API v1 renvoie \`records[].fields\`. Utiliser \`transform="records"\` sur dsfr-data-source
puis \`flatten="fields"\` sur dsfr-data-normalize :
\`\`\`html
<dsfr-data-source id="raw" url="…/1.0/search/?dataset=X&rows=100" transform="records"></dsfr-data-source>
<dsfr-data-normalize id="clean" source="raw" flatten="fields" trim></dsfr-data-normalize>
\`\`\``,
  },

  // ---------------------------------------------------------------------------
  // Guides de choix
  // ---------------------------------------------------------------------------

  chartTypes: {
    id: 'chartTypes',
    name: 'Types de graphiques',
    description: 'Quand utiliser quel type de graphique',
    trigger: ['quel graphique', 'quel type', 'quel chart', 'recommand'],
    content: `## Choix du type de graphique

Guide pour choisir le type de visualisation adapte aux donnees.

### Barres verticales (bar)
- **Quand** : comparer des categories (5-15 ideal)
- **Champs** : label-field (categories), value-field (valeurs)
- **Options** : \`horizontal\` (barres horizontales), \`stacked\` (empile)
- **Supporte** : value-field-2 ou value-fields pour N series, highlight-index

### Lignes (line)
- **Quand** : evolution temporelle, tendances
- **Champs** : label-field (dates/temps), value-field (valeurs)
- **Supporte** : value-field-2 ou value-fields pour comparaison, x-min/x-max/y-min/y-max

### Combine barres + ligne (bar-line)
- **Quand** : comparer 2 metriques differentes (ex: CA en barres + objectif en ligne)
- **Champs** : label-field, value-field (barres), value-field-2 (ligne)
- **Options** : unit-tooltip (barres), unit-tooltip-bar (ligne)

### Camembert / Anneau (pie)
- **Quand** : parts d'un tout (100%), max 5-7 segments
- **Champs** : label-field (categories), value-field (valeurs)
- **Options** : \`fill\` (true = camembert plein, false = anneau par defaut)

### Radar
- **Quand** : profils multicriteres, comparaison de dimensions
- **Champs** : label-field (criteres), value-field (scores)
- **Supporte** : value-field-2 ou value-fields pour comparer plusieurs profils

### Nuage de points (scatter)
- **Quand** : correlation entre deux variables numeriques
- **Champs** : label-field (axe X numerique), value-field (axe Y)

### Jauge (gauge)
- **Quand** : progression vers un objectif (0-100%)
- **Champs** : gauge-value uniquement (PAS de label-field ni source obligatoire)

### KPI (kpi - composant dsfr-data-kpi)
- **Quand** : afficher UNE valeur cle (total, moyenne, comptage)
- **Champs** : valeur (expression d'agregation), PAS de label-field
- **Options** : format (nombre, pourcentage, euro), couleur, seuils

### Carte departements (map)
- **Quand** : donnees geographiques par departement francais
- **Champs** : code-field (code INSEE: 01-95, 2A, 2B, 971-976), value-field
- **Palette recommandee** : sequentialAscending

### Carte regions (map-reg)
- **Quand** : donnees geographiques par region francaise
- **Champs** : code-field (code region), value-field

### Series multiples (bar, line, bar-line, radar)
Utiliser \`value-field-2\` pour une seconde serie, ou \`value-fields\` pour plusieurs series supplementaires (separees par virgules).
Definir les noms avec \`name='["Serie 1","Serie 2","Serie 3"]'\`.
Exemple multi-series : \`value-field="ca" value-fields="budget,objectif" name='["CA","Budget","Objectif"]'\``,
  },

  dsfrColors: {
    id: 'dsfrColors',
    name: 'Couleurs DSFR',
    description: "Palette officielle du Design System de l'Etat",
    trigger: ['couleur', 'color', 'palette', 'style'],
    content: `## Couleurs et palettes DSFR

### Couleurs hex principales
- **Bleu France**: #000091 (couleur par defaut)
- **Emeraude**: #009081 (succes)
- **Marianne**: #C9191E (erreur)
- **Orange**: #FF9940 (avertissement)
- **Violet**: #A558A0
- **Bleu ciel**: #417DC4
- **Vert foret**: #18753C

### Palettes DSFR Chart (attribut selected-palette)
| Palette | Usage recommande |
|---------|-----------------|
| categorical | Comparer des groupes distincts (defaut pour bar, pie, radar) |
| sequentialAscending | Gradient clair -> fonce (recommande pour map, classements) |
| sequentialDescending | Gradient fonce -> clair |
| divergentAscending | Echelle divergente (ecarts positifs/negatifs) |
| divergentDescending | Echelle divergente inversee |
| neutral | Neutre, utiliser avec highlight-index pour mettre en avant 1 barre |
| default | Bleu France seul (serie unique) |

### Bonnes pratiques
- Utiliser \`categorical\` pour pie, radar et comparaisons multi-categories
- Utiliser \`sequentialAscending\` pour les cartes (map, map-reg)
- Utiliser \`neutral\` + \`highlight-index\` pour mettre en avant une valeur
- Assurer un contraste suffisant (conformite RGAA)
- Eviter le rouge/vert seuls (daltonisme) - les palettes DSFR sont concues pour ca`,
  },

  // ---------------------------------------------------------------------------
  // Providers API
  // ---------------------------------------------------------------------------

  apiProviders: {
    id: 'apiProviders',
    name: 'Providers API',
    description: 'Fournisseurs de donnees supportes et leurs capacites',
    trigger: [
      'provider',
      'fournisseur',
      'opendatasoft',
      'tabular',
      'data.gouv',
      'grist',
      'insee',
      'melodi',
      'api-type',
      'source de donnees',
      'quel api',
      'quelle source',
    ],
    content: `## Providers API supportes

dsfr-data detecte automatiquement le provider a partir de l'URL de l'API.
Chaque provider a des capacites differentes pour la pagination, l'agregation et les facettes.

### Matrice des capacites
| Capacite | OpenDataSoft | Tabular (data.gouv.fr) | Grist | INSEE (Melodi) | Generique |
|----------|:---:|:---:|:---:|:---:|:---:|
| Fetch serveur | oui | oui | oui | oui | non (dsfr-data-source) |
| Pagination auto | oui (offset, 10 pages) | oui (page, 500 pages, max 50/page) | oui (offset, 100/page) | oui (page, 1000/page, 100k max) | non |
| Facettes serveur | oui | non | oui (SQL) | non | non |
| Recherche serveur | oui (full-text) | non | non | non | non |
| Group-by serveur | oui | oui (column__groupby) | oui (SQL) | non | non |
| Agregation serveur | oui (ODSQL) | oui (column__sum, __avg, __count, __min, __max) | oui (SQL) | non | non |
| Tri serveur | oui | oui | oui | non | non |
| Pagination serveur | oui (offset) | oui (page) | oui (offset) | oui (page) | non |
| Format filtre | ODSQL (SQL-like) | colon (champ:op:valeur) | colon | colon (dimension:eq:valeur) | colon |

### Detection automatique du provider
| Provider | Pattern URL |
|----------|------------|
| OpenDataSoft | \`/api/explore/v2.1/catalog/datasets/{datasetId}\` |
| Tabular | \`tabular-api.data.gouv.fr/api/resources/{resourceId}\` |
| Grist | \`/api/docs/{documentId}/tables/{tableId}\` |
| INSEE (Melodi) | \`melodi/data/{datasetId}\` |
| Generique | Tout autre URL (fallback) |

### Usage dans dsfr-data-source (attribut api-type)
| api-type | Provider | Attributs requis |
|----------|---------|-----------------|
| \`"opendatasoft"\` | OpenDataSoft | \`base-url\` + \`dataset-id\` |
| \`"tabular"\` | Tabular | \`base-url\` + \`resource\` |
| \`"grist"\` | Grist | \`base-url\` (URL complete avec proxy) |
| \`"insee"\` | INSEE (Melodi) | \`base-url\` + \`dataset-id\` |
| \`"generic"\` (defaut) | Generique | \`url\` + \`transform\` |

### Pipeline par provider

**OpenDataSoft** (tout serveur, le plus puissant) :
\`\`\`html
<dsfr-data-source id="src" api-type="opendatasoft"
  base-url="https://data.economie.gouv.fr"
  dataset-id="rappelconso">
</dsfr-data-source>
<dsfr-data-query id="data" source="src"
  select="categorie_de_produit, count(*) as total"
  group-by="categorie_de_produit"
  order-by="total:desc" limit="10">
</dsfr-data-query>
\`\`\`

**Tabular** (fetch serveur + agregation serveur) :
\`\`\`html
<dsfr-data-source id="src" api-type="tabular"
  base-url="https://tabular-api.data.gouv.fr"
  resource="RESOURCE_ID">
</dsfr-data-source>
<dsfr-data-query id="data" source="src"
  group-by="departement"
  aggregate="population:sum"
  order-by="population__sum:desc">
</dsfr-data-query>
\`\`\`

**Grist** (fetch serveur + auto-flatten, aggregation via SQL) :
\`\`\`html
<dsfr-data-source id="src" api-type="grist"
  base-url="${PROXY_BASE_URL}/grist-gouv-proxy/api/docs/DOC_ID/tables/TABLE/records"
  headers='{"Authorization":"Bearer API_KEY"}'>
</dsfr-data-source>
<dsfr-data-query id="data" source="src"
  group-by="region"
  aggregate="population:sum">
</dsfr-data-query>
\`\`\`
L'adapter Grist aplatit automatiquement \`records[].fields\` — pas besoin de dsfr-data-normalize.
L'adapter choisit automatiquement entre mode Records (filter/sort/pagination) et mode SQL (group-by, aggregation, facettes).

**INSEE Melodi** (fetch serveur + filtrage par dimensions, tout le reste client-side) :
\`\`\`html
<dsfr-data-source id="src" api-type="insee"
  base-url="https://api.insee.fr/melodi"
  dataset-id="DS_POPULATIONS_REFERENCE"
  where="POPREF_MEASURE:eq:PMUN, TIME_PERIOD:eq:2023">
</dsfr-data-source>
<dsfr-data-query id="data" source="src"
  filter="GEO:contains:DEP"
  order-by="OBS_VALUE:desc" limit="20">
</dsfr-data-query>
\`\`\`
L'adapter INSEE aplatit automatiquement les observations (dimensions + measures + attributes) en objets plats.
\`OBS_VALUE_NIVEAU.value\` devient \`OBS_VALUE\`. Pas de proxy necessaire (CORS actif). 30 req/min max.

**Generique** (dsfr-data-source obligatoire) :
\`\`\`html
<dsfr-data-source id="raw" url="https://api.exemple.fr/data" transform="results"></dsfr-data-source>
<dsfr-data-query id="data" source="raw"
  group-by="region"
  aggregate="montant:sum">
</dsfr-data-query>
\`\`\`

### Authentification par provider
| Provider | Methode | Header/Param |
|----------|---------|-------------|
| OpenDataSoft | API Key | \`headers='{"apikey":"KEY"}'\` |
| Tabular | Aucune | Acces public uniquement |
| Grist | Bearer token | \`headers='{"Authorization":"Bearer KEY"}'\` |
| INSEE (Melodi) | Aucune | Acces anonyme (30 req/min) |
| Generique | Variable | Via \`headers\` sur dsfr-data-source |

### Proxy CORS
Certaines APIs externes necessitent un proxy CORS en production.
Les URLs connues sont automatiquement proxifiees :
- \`grist.numerique.gouv.fr\` -> \`${PROXY_BASE_URL}/grist-gouv-proxy\`
- \`docs.getgrist.com\` -> \`${PROXY_BASE_URL}/grist-proxy\`
- \`tabular-api.data.gouv.fr\` -> \`${PROXY_BASE_URL}/tabular-proxy\`

APIs avec CORS natif (pas de proxy necessaire) :
- OpenDataSoft (\`*.opendatasoft.com\` et portails publics)
- INSEE Melodi (\`api.insee.fr\`)`,
  },

  // ---------------------------------------------------------------------------
  // dsfr-data-a11y : companion d'accessibilite unifie
  // ---------------------------------------------------------------------------

  dsfrDataA11y: {
    id: 'dsfrDataA11y',
    name: 'dsfr-data-a11y',
    description:
      'Composant accessibilite unifie : tableau de donnees, telechargement CSV et description textuelle',
    trigger: [
      'raw-data',
      'telecharger',
      'download',
      'csv',
      'accessibilite',
      'a11y',
      'lecteur ecran',
      'screen reader',
      'aria',
      'tableau accessible',
      'table',
      'description graphique',
      'chart-a11y',
    ],
    content: `## dsfr-data-a11y — Companion d'accessibilite unifie

Composant companion qui ameliore l'accessibilite d'une visualisation en offrant
trois alternatives activables independamment :
1. **Tableau accessible** (\`table\`) : table HTML avec les donnees du graphique
2. **Telechargement CSV** (\`download\`) : bouton pour exporter les donnees brutes
3. **Description textuelle** (\`description\`) : transcription libre du contenu du graphique

Le contenu est replie dans un accordeon DSFR par defaut.

### Attributs

| Attribut | Type | Defaut | Description |
|----------|------|--------|-------------|
| source | String | \`""\` | ID du dsfr-data-source ou dsfr-data-query |
| for | String | \`""\` | ID de l'element cible pour la liaison ARIA + skip link |
| table | Boolean | \`false\` | Active l'affichage du tableau de donnees |
| download | Boolean | \`false\` | Active le bouton de telechargement CSV |
| filename | String | \`"donnees.csv"\` | Nom du fichier CSV telecharge |
| description | String | \`""\` | Description textuelle du graphique |
| label-field | String | \`""\` | Colonne pour les labels du tableau |
| value-field | String | \`""\` | Colonne(s) pour les valeurs du tableau (separees par virgules) |
| label | String | \`""\` | Libelle personnalise de la section accessible |
| no-auto-aria | Boolean | \`false\` | Desactive ARIA automatique et skip link |

Si ni \`table\`, ni \`download\`, ni \`description\` ne sont definis, les trois sont affiches par defaut.

### Fonctionnement ARIA (attribut \`for\`)

Quand \`for="mon-graph"\` est defini :
1. Un **skip link** est injecte dans le graphique cible (visible au focus clavier)
2. \`aria-describedby\` pointe vers un resume concis dans le composant
3. \`aria-details\` pointe vers le tableau de donnees (si \`table\` est active)
4. A la deconnexion, tout est nettoye automatiquement

### Exemple basique
\`\`\`html
<dsfr-data-chart id="mon-graph" source="data" type="bar"
  label-field="region" value-field="total">
</dsfr-data-chart>
<dsfr-data-a11y for="mon-graph" source="data" table download></dsfr-data-a11y>
\`\`\`

### Avec description textuelle
\`\`\`html
<dsfr-data-a11y for="mon-graph" source="data"
  table download
  description="Ce graphique montre la repartition par region. L'Ile-de-France est en tete.">
</dsfr-data-a11y>
\`\`\`

### Avec colonnes personnalisees
\`\`\`html
<dsfr-data-a11y for="mon-graph" source="data"
  table download
  label-field="region" value-field="population,budget"
  filename="export-regions.csv">
</dsfr-data-a11y>
\`\`\`

### Mode manuel (sans ARIA automatique)
\`\`\`html
<dsfr-data-a11y source="data" no-auto-aria table download></dsfr-data-a11y>
\`\`\`

### Cohabitation avec DataBox
Si le graphique cible utilise l'attribut \`databox\`, ne PAS ajouter les attributs
\`table\` et \`download\` sur dsfr-data-a11y (DataBox les fournit deja avec un meilleur
rendu : switch chart/tableau integre, CSV natif). Conserver uniquement :
- \`for\` + \`source\` (obligatoires)
- \`description\` (texte accessible pour lecteurs d'ecran)

\`\`\`html
<!-- Avec DataBox : pas de table ni download sur a11y -->
<dsfr-data-chart id="chart" source="data" type="bar"
  label-field="region" value-field="total"
  databox databox-title="Population" databox-download>
</dsfr-data-chart>
<dsfr-data-a11y for="chart" source="data"
  description="L'Ile-de-France concentre la majorite.">
</dsfr-data-a11y>
\`\`\`

### Notes
- Le contenu est dans un accordeon DSFR (replie par defaut)
- Le CSV utilise le separateur \`;\` (standard francais)
- Le tableau est limite a 100 lignes ; le CSV contient toutes les donnees
- Compatible avec tous les composants de rendu (chart, datalist, display, kpi)`,
  },

  // ---------------------------------------------------------------------------
  // dsfr-data-world-map
  // ---------------------------------------------------------------------------

  dsfrDataWorldMap: {
    id: 'dsfrDataWorldMap',
    name: 'dsfr-data-world-map',
    description:
      'Carte choroplèthe mondiale connectée à dsfr-data-source, colorie les pays selon une valeur numérique',
    trigger: [
      'world-map',
      'carte monde',
      'carte mondiale',
      'pays',
      'choropleth',
      'world map',
      'planisphere',
      'carte pays',
    ],
    content: `## dsfr-data-world-map — Carte choroplèthe mondiale

Composant qui affiche une carte du monde SVG (projection Natural Earth)
où chaque pays est colorié selon une valeur numérique.
Chargé via le bundle \`dsfr-data.world-map.esm.js\` (séparé du core).

### Attributs

| Attribut | Type | Defaut | Requis | Description |
|----------|------|--------|--------|-------------|
| source | String | \`""\` | oui | ID du dsfr-data-source ou dsfr-data-query |
| code-field | String | \`""\` | oui | Champ contenant le code pays |
| value-field | String | \`""\` | oui | Champ numerique a visualiser |
| code-format | String | \`"iso-a2"\` | non | Format du code pays : \`iso-a2\` (FR), \`iso-a3\` (FRA), \`iso-num\` (250) |
| name | String | \`""\` | non | Libelle de la serie (legende) |
| selected-palette | String | \`"sequentialAscending"\` | non | Palette choropleth : sequentialAscending, sequentialDescending, divergentAscending, divergentDescending, neutral |
| unit-tooltip | String | \`""\` | non | Unite affichee dans le tooltip au survol |
| zoom | String | \`"continent"\` | non | Comportement de zoom : \`"continent"\` (zoom sur le continent au clic) ou \`"none"\` |

### Palettes disponibles

- \`sequentialAscending\` : clair → fonce (bleu France, defaut)
- \`sequentialDescending\` : fonce → clair
- \`divergentAscending\` : bleu → rouge
- \`divergentDescending\` : rouge → bleu
- \`neutral\` : gris

### Chargement du bundle

\`\`\`html
<script src="${'${LIB_URL}'}/dsfr-data.world-map.umd.js"></script>
\`\`\`

### Exemple complet

\`\`\`html
<dsfr-data-source id="world-data"
  url="/api/countries"
  transform="results">
</dsfr-data-source>

<dsfr-data-world-map
  source="world-data"
  code-field="iso_code"
  value-field="gdp_per_capita"
  code-format="iso-a3"
  name="PIB par habitant"
  selected-palette="sequentialAscending"
  unit-tooltip="USD"
  zoom="continent">
</dsfr-data-world-map>
\`\`\`
`,
  },

  // ---------------------------------------------------------------------------
  // dsfr-data-map + dsfr-data-map-layer
  // ---------------------------------------------------------------------------

  dsfrDataMap: {
    id: 'dsfrDataMap',
    name: 'dsfr-data-map',
    description:
      'Carte interactive Leaflet multi-couches avec POI, geoshape, cercles, clustering et chargement par viewport',
    trigger: [
      'carte',
      'map',
      'leaflet',
      'poi',
      'marker',
      'geoshape',
      'geojson',
      'clustering',
      'bbox',
      'viewport',
      'tuiles',
      'ign',
      'geoplateforme',
      'cercles proportionnels',
      'heatmap',
      'carte interactive',
      'geo_point',
      'geo_shape',
      'choropleth carte',
      'map layer',
      'timeline',
      'animation temporelle',
      'carte animee',
      'evolution temporelle',
      'color-map',
      'couleur categorielle',
      'couleur par valeur',
    ],
    content: `## dsfr-data-map + dsfr-data-map-layer — Carte interactive multi-couches

Deux composants complementaires :
- \`dsfr-data-map\` : conteneur carte (init Leaflet, tuiles, viewport). **Ne consomme pas de donnees.**
- \`dsfr-data-map-layer\` : couche de donnees (markers, geoshape, circle, heatmap). Utilise \`SourceSubscriberMixin\`.

Cela permet le **multi-source** naturellement : chaque layer a sa propre source.

### Chargement du bundle

\`\`\`html
<script src="\${'${LIB_URL}'}/dsfr-data.map.umd.js"></script>
\`\`\`

Ou via le bundle complet \`dsfr-data.esm.js\` / \`dsfr-data.umd.js\`.
Leaflet est charge dynamiquement (pas inclus dans le bundle).

### Attributs dsfr-data-map (conteneur)

| Attribut | Type | Defaut | Description |
|----------|------|--------|-------------|
| center | String | \`"46.603,2.888"\` | Centre initial \`"lat,lon"\` |
| zoom | Number | \`6\` | Zoom initial (1-18) |
| min-zoom | Number | \`2\` | Zoom minimum |
| max-zoom | Number | \`18\` | Zoom maximum |
| height | String | \`"500px"\` | Hauteur CSS (px, vh, rem). Un \`%\` est un ratio de la largeur (ex: \`"60%"\` = 60% de la largeur) |
| tiles | String | \`"ign-plan"\` | Fond de carte : \`ign-plan\`, \`ign-ortho\`, \`ign-cadastre\`, \`osm\`, ou URL template |
| no-controls | Boolean | \`false\` | Masque les controles de zoom |
| fit-bounds | Boolean | \`false\` | Ajuste le viewport aux donnees |
| max-bounds | String | \`""\` | Limites \`"latSW,lonSW,latNE,lonNE"\` |
| name | String | \`""\` | Titre (aria-label) |

### Attributs dsfr-data-map-layer (couche)

| Attribut | Type | Defaut | Description |
|----------|------|--------|-------------|
| source | String | \`""\` | ID de la source (requis) |
| type | String | \`"marker"\` | \`marker\`, \`geoshape\`, \`circle\`, \`heatmap\` |
| lat-field | String | \`""\` | Chemin vers latitude |
| lon-field | String | \`""\` | Chemin vers longitude |
| geo-field | String | \`""\` | Chemin vers GeoJSON (Point, Polygon) |
| popup-template | String | \`""\` | Template : \`"{nom} — {val} kW"\` |
| popup-fields | String | \`""\` | Champs pour tableau auto : \`"nom,adresse"\` |
| tooltip-field | String | \`""\` | Champ affiche au survol |
| color | String | \`"#000091"\` | Couleur (DSFR blue-france). Fallback si color-map ne matche pas |
| color-field | String | \`""\` | Champ dont la valeur determine la couleur (mapping categoriel) |
| color-map | String | \`""\` | Paires \`valeur:#couleur\` separees par virgule. Ex: \`"1:#00A95F,2:#FF9940,3:#E1000F"\` |
| fill-field | String | \`""\` | Champ numerique pour choropleth |
| fill-opacity | Number | \`0.6\` | Opacite remplissage |
| selected-palette | String | \`""\` | Palette choropleth |
| radius | Number | \`8\` | Rayon fixe (circle) |
| radius-field | String | \`""\` | Champ rayon variable |
| radius-unit | String | \`"px"\` | \`px\` ou \`m\` |
| radius-min | Number | \`4\` | Rayon min auto-scaling (px) |
| radius-max | Number | \`30\` | Rayon max auto-scaling (px) |
| heat-radius | Number | \`25\` | Rayon heatmap (px) |
| heat-blur | Number | \`15\` | Flou heatmap (px) |
| heat-field | String | \`""\` | Champ ponderation heatmap |
| cluster | Boolean | \`false\` | Active le clustering |
| cluster-radius | Number | \`80\` | Rayon clustering pixels |
| min-zoom | Number | \`0\` | Zoom min pour cette couche |
| max-zoom | Number | \`18\` | Zoom max pour cette couche |
| bbox | Boolean | \`false\` | Chargement par viewport |
| bbox-debounce | Number | \`300\` | Delai re-fetch (ms) |
| bbox-field | String | \`""\` | Champ geo pour bbox (auto-detecte si vide) |
| max-items | Number | \`5000\` | Limite elements rendus |
| filter | String | \`""\` | Filtre client-side |
| time-field | String | \`""\` | Champ date/heure pour animation temporelle |
| time-bucket | String | \`"none"\` | Granularite : \`none\`, \`hour\`, \`day\`, \`month\`, \`year\` |
| time-mode | String | \`"snapshot"\` | \`snapshot\` (pas courant) ou \`cumulative\` (tout jusqu'au pas courant) |

### Resolution des coordonnees (3 modes)

1. \`lat-field\` + \`lon-field\` : coordonnees separees
2. \`geo-field\` vers GeoJSON Point : \`{ type: "Point", coordinates: [lon, lat] }\`
3. \`geo-field\` vers ODS : \`{ lat: N, lon: N }\`
4. Auto-detection : cherche \`geo_point_2d\`, \`geo_shape\`, \`geometry\`

### Fonds de carte predefinis (sans cle API)

- \`ign-plan\` : Plan IGN (Geoplateforme)
- \`ign-ortho\` : Vue aerienne IGN
- \`ign-topo\` : Carte topographique IGN (SCAN 25/100)
- \`ign-cadastre\` : Parcelles cadastrales IGN
- \`osm\` : OpenStreetMap France

### Exemple : POI avec clustering

\`\`\`html
<dsfr-data-source id="bornes" api-type="opendatasoft"
  base-url="https://odre.opendatasoft.com" dataset-id="bornes-irve"
  select="geo_point_2d,nom_station,puissance_nominale"
  limit="5000">
</dsfr-data-source>

<dsfr-data-map center="46.6,2.3" zoom="6" tiles="ign-plan" fit-bounds>
  <dsfr-data-map-layer source="bornes" type="marker"
    geo-field="geo_point_2d"
    popup-fields="nom_station,puissance_nominale"
    tooltip-field="nom_station"
    cluster cluster-radius="60">
  </dsfr-data-map-layer>
</dsfr-data-map>
\`\`\`

### Exemple : cercles proportionnels

\`\`\`html
<dsfr-data-map center="46.6,2.3" zoom="6">
  <dsfr-data-map-layer source="villes" type="circle"
    lat-field="latitude" lon-field="longitude"
    radius-field="population" radius-unit="px"
    color="#000091" fill-opacity="0.4"
    popup-fields="nom,population"
    tooltip-field="nom">
  </dsfr-data-map-layer>
</dsfr-data-map>
\`\`\`

### Exemple : couleurs categorielles (color-map)

\`\`\`html
<dsfr-data-map center="46.6,2.3" zoom="6">
  <dsfr-data-map-layer source="depts" type="geoshape"
    geo-field="geo_shape"
    color-field="statut"
    color-map="1:#00A95F,2:#FF9940,3:#E1000F,4:#000091"
    fill-opacity="0.6"
    popup-template="<b>{nom}</b><br>Statut : {statut_label}">
  </dsfr-data-map-layer>
</dsfr-data-map>
\`\`\`

### Exemple : multi-couches geoshape + POI

\`\`\`html
<dsfr-data-map center="46.6,2.3" zoom="6" tiles="ign-plan">
  <dsfr-data-map-layer source="departements" type="geoshape"
    geo-field="geo_shape" fill-field="population"
    selected-palette="sequentialAscending" fill-opacity="0.5"
    popup-template="<b>{nom}</b><br>Population : {population}">
  </dsfr-data-map-layer>
  <dsfr-data-map-layer source="prefectures" type="marker"
    geo-field="geo_point_2d"
    tooltip-field="nom" color="#C9191E">
  </dsfr-data-map-layer>
</dsfr-data-map>
\`\`\`

### dsfr-data-map-popup — Affichage au clic

Composant compagnon optionnel qui definit un template et un mode d'affichage pour le clic sur un element.

| Attribut | Type | Defaut | Description |
|----------|------|--------|-------------|
| mode | String | \`"popup"\` | \`popup\`, \`modal\`, \`panel-right\`, \`panel-left\` |
| title-field | String | \`""\` | Champ pour le titre panneau/modale |
| width | String | \`"350px"\` | Largeur du panneau lateral |
| for | String | \`""\` | ID du layer cible (vide = tous) |

Template avec \`<template>\` et interpolation \`{{champ}}\`. Sans template, tableau auto.

\`\`\`html
<dsfr-data-map-popup mode="panel-right" title-field="nom" width="380px">
  <template>
    <h4>{{nom}}</h4>
    <p>{{adresse}}, {{code_postal}} {{commune}}</p>
    <p class="fr-text--bold">{{prix}} EUR</p>
  </template>
</dsfr-data-map-popup>
\`\`\`

### Exemple : zoom ranges (multi-resolution)

\`\`\`html
<dsfr-data-map center="46.6,2.3" zoom="6" height="600px">
  <!-- Zoom 1-9 : regions -->
  <dsfr-data-map-layer source="regions" type="geoshape"
    geo-field="geo_shape" fill-field="population"
    min-zoom="1" max-zoom="9">
  </dsfr-data-map-layer>
  <!-- Zoom 10+ : communes viewport -->
  <dsfr-data-map-layer source="communes" type="geoshape"
    geo-field="geo_shape" fill-field="population"
    min-zoom="10" bbox>
  </dsfr-data-map-layer>
</dsfr-data-map>
\`\`\`

### dsfr-data-map-timeline — Animation temporelle

Composant compagnon place comme enfant de \`dsfr-data-map\`. Decouvre automatiquement les layers ayant \`time-field\` et pilote leur affichage frame par frame.

| Attribut | Type | Defaut | Description |
|----------|------|--------|-------------|
| for | String | \`""\` | IDs des layers cibles (virgules). Vide = tous les layers avec time-field |
| speed | Number | \`1\` | Multiplicateur vitesse (0.5, 1, 2, 4) |
| interval | Number | \`1000\` | Intervalle de base entre frames (ms) |

Controles : play/pause, stop, pas-a-pas, slider, vitesse.
Clavier : Espace (play/pause), fleches (pas-a-pas), Home/End (debut/fin).
Accessibilite : pas d'auto-play, prefers-reduced-motion respecte, ARIA labels, aria-live.

\`\`\`html
<dsfr-data-source id="donnees-temps" data='[
  {"region":"Paris","lat":48.85,"lon":2.35,"valeur":120,"date":"2025-T1"},
  {"region":"Paris","lat":48.85,"lon":2.35,"valeur":250,"date":"2025-T2"},
  {"region":"Lyon","lat":45.76,"lon":4.83,"valeur":80,"date":"2025-T1"},
  {"region":"Lyon","lat":45.76,"lon":4.83,"valeur":160,"date":"2025-T2"}
]'></dsfr-data-source>

<dsfr-data-map center="46.6,2.3" zoom="6" height="550px">
  <dsfr-data-map-layer source="donnees-temps" type="circle"
    lat-field="lat" lon-field="lon"
    radius-field="valeur" radius-min="6" radius-max="35"
    color="#000091" fill-opacity="0.5"
    tooltip-field="region"
    time-field="date" time-mode="snapshot">
  </dsfr-data-map-layer>
  <dsfr-data-map-timeline speed="1" interval="1500">
  </dsfr-data-map-timeline>
</dsfr-data-map>
\`\`\`
`,
  },

  // ---------------------------------------------------------------------------
  // Troubleshooting et pieges courants
  // ---------------------------------------------------------------------------

  troubleshooting: {
    id: 'troubleshooting',
    name: 'Troubleshooting',
    description: 'Pieges courants et erreurs frequentes',
    trigger: [
      'erreur',
      'bug',
      'marche pas',
      'probleme',
      'vide',
      'affiche pas',
      'ne fonctionne pas',
    ],
    content: `## Pieges courants et troubleshooting

### 1. Le graphique est vide / ne s'affiche pas
- **Verifier \`transform\`** : l'API retourne souvent un objet enveloppe (\`{results: [...]}\`).
  Si \`transform\` n'est pas defini ou pointe au mauvais endroit, les donnees seront vides.
  Exemples : \`transform="results"\` (ODS v2.1), \`transform="data"\` (Tabular), \`transform="records"\` (ODS v1)
- **Verifier les noms de champs** : \`label-field\` et \`value-field\` doivent correspondre
  exactement aux cles des objets JSON retournes (sensible a la casse).
- **Verifier \`source\`** : l'attribut \`source="xxx"\` doit correspondre exactement a l'\`id="xxx"\`
  de la dsfr-data-source ou dsfr-data-query (sensible a la casse).

### 2. La carte ne s'affiche pas correctement
- **Codes departements** : utiliser des codes INSEE (string) : "01" a "95", "2A", "2B", "971" a "976".
  Attention au zero initial ("01" et non 1).
- **Utiliser code-field** (pas label-field) pour les cartes.
- **Patience** : les composants DSFR Chart map sont des Web Components Vue qui ecrasent
  certains attributs au montage. dsfr-data-chart applique un delai de 500ms pour re-injecter
  les valeurs. Le graphique peut mettre ~1s a apparaitre.

### 3. Limite de 100 resultats (API ODS)
L'API OpenDataSoft retourne maximum 100 enregistrements par requete.
dsfr-data-query en mode \`opendatasoft\` gere automatiquement la pagination (max 10 pages = 1000 resultats).
Pour une dsfr-data-source brute, ajouter \`limit=100\` dans l'URL ou utiliser dsfr-data-query.

### 4. Nommage des champs agrege
Apres une agregation dans dsfr-data-query, les champs sont renommes :
\`"champ__fonction"\` (double underscore). Exemple : \`aggregate="population:sum"\` produit
le champ \`population__sum\`. Utiliser ce nom dans \`value-field\` et \`order-by\`.

### 5. Confusion syntaxe filtre generic vs ODSQL
- **Mode generic** (dsfr-data-query avec source) : \`where="champ:operateur:valeur"\` (ex: \`"prix:gt:100"\`)
- **Mode opendatasoft** (dsfr-data-query serveur) : \`where="prix > 100"\` (syntaxe SQL)
- **Action reloadData** (builder-IA) : syntaxe ODSQL (SQL)
- **Action createChart** (builder-IA) : syntaxe generic (\`"champ:operateur:valeur"\`)
Ne pas melanger les deux !

### 6. Attributs HTML en kebab-case
Les attributs HTML sont en kebab-case : \`label-field\`, \`value-field\`, \`api-type\`, \`code-field\`, etc.
Ne pas utiliser camelCase dans le HTML (\`labelField\` ne fonctionnera pas).
En revanche, les proprietes JavaScript sont en camelCase (\`element.labelField\`).

### 8. La recherche ne filtre rien / cherche dans les mauvais champs
- Verifier que \`fields\` liste les bons noms de champs (sensible a la casse)
- Verifier que \`source\` pointe vers une source avec des donnees aplaties
  (si Grist : s'assurer que flatten="fields" est actif sur le normalize)
- Si \`fields\` est vide, la recherche porte sur TOUS les champs, y compris
  les champs techniques (id, SIRET...). Preciser les champs pour plus de precision.

### 7. Facettes / datalist vides avec Grist ou ODS v1
Les APIs Grist, ODS v1, et Airtable wrappent les donnees sous \`records[].fields\`.
Les composants dsfr-data-facets, dsfr-data-list, dsfr-data-query et dsfr-data-kpi attendent des
cles de premier niveau.

**Solution** : ajouter \`flatten="fields"\` sur dsfr-data-normalize :
\`\`\`html
<dsfr-data-normalize id="clean" source="raw" flatten="fields" trim></dsfr-data-normalize>
\`\`\``,
  },

  dsfrDataJoin: {
    id: 'dsfrDataJoin',
    name: 'dsfr-data-join',
    description: "Jointure multi-sources autour d'une cle pivot",
    trigger: [
      'join',
      'jointure',
      'croiser',
      'fusionner',
      'enrichir',
      'merge',
      'left join',
      'inner join',
      'multi-source',
      'combiner',
    ],
    content: `## <dsfr-data-join> - Jointure multi-sources

Composant invisible qui joint deux sources de donnees sur une ou plusieurs cles pivot.
Ne fait aucun fetch HTTP — c'est un pur transformateur de donnees.
Il attend que les deux sources aient emis leurs donnees avant de calculer la jointure.
Si une source se recharge, le join est recalcule automatiquement.

### Position dans le pipeline
\`\`\`
dsfr-data-source (A)  ──────┐
                             ├──► dsfr-data-join ──► dsfr-data-query ──► dsfr-data-chart
dsfr-data-source (B)  ──────┘
\`\`\`

### Attributs
| Attribut | Type | Defaut | Requis | Description |
|----------|------|--------|--------|-------------|
| left | String | "" | oui | ID de la source gauche (source principale) |
| right | String | "" | oui | ID de la source droite |
| on | String | "" | oui | Cle(s) de jointure (voir formats ci-dessous) |
| type | String | "left" | non | Type de jointure : inner, left, right, full |
| prefix-left | String | "" | non | Prefixe pour les champs gauche en cas de collision |
| prefix-right | String | "right_" | non | Prefixe pour les champs droite en cas de collision |

### Format de l'attribut \`on\`
- Cle commune : \`on="code_dept"\`
- Cle differente gauche/droite : \`on="dept_code=code"\`
- Multi-cle : \`on="annee,code_region"\`

### Types de jointure
- **inner** : seuls les enregistrements presents dans les deux sources
- **left** : tous les enregistrements de la source gauche, champs droite a null si absent
- **right** : tous les enregistrements de la source droite, champs gauche a null si absent
- **full** : union de tous les enregistrements, null pour les champs manquants

### Gestion des collisions
Si un champ existe dans les deux sources avec le meme nom :
- Le \`prefix-right\` est applique au champ droit (defaut : \`right_\`)
- Le \`prefix-left\` est applique au champ gauche si defini
- La cle de jointure n'est jamais dupliquee

### Exemple 1 : enrichir un dataset population avec des budgets
\`\`\`html
<dsfr-data-source id="pop" api-type="opendatasoft"
  dataset-id="population-dept" base-url="https://data.economie.gouv.fr">
</dsfr-data-source>
<dsfr-data-source id="budget" api-type="tabular"
  resource="abc123-budget-dept">
</dsfr-data-source>
<dsfr-data-join id="enriched"
  left="pop" right="budget"
  on="code_dept" type="left"
  prefix-right="budget_">
</dsfr-data-join>
<dsfr-data-chart source="enriched" type="bar"
  label-field="nom_dept" value-field="budget_montant">
</dsfr-data-chart>
\`\`\`

### Exemple 2 : jointure avec transformation aval
\`\`\`html
<dsfr-data-join id="joined" left="src1" right="src2" on="code_region" type="inner">
</dsfr-data-join>
<dsfr-data-query id="q" source="joined"
  aggregate="population:sum:total,budget:sum:total_budget"
  group-by="nom_region" order-by="total:desc">
</dsfr-data-query>
<dsfr-data-chart source="q" type="horizontalBar"
  label-field="nom_region" value-field="total">
</dsfr-data-chart>
\`\`\`

### Exemple 3 : cles de nommage different
\`\`\`html
<!-- La source gauche a "dept_code", la droite a "code" -->
<dsfr-data-join id="merged"
  left="src-a" right="src-b"
  on="dept_code=code" type="inner">
</dsfr-data-join>
\`\`\`

### Notes
- Le join est recalcule automatiquement quand l'une des sources emet de nouvelles donnees
- Relations 1-N : si plusieurs enregistrements droite matchent une cle gauche, autant de lignes sont generees
- Le composant emet \`dsfr-data-loading\` tant qu'une source n'a pas encore repondu
- Le composant emet \`dsfr-data-error\` si l'une des sources est en erreur`,
  },

  dsfrDataPodium: {
    id: 'dsfrDataPodium',
    name: 'dsfr-data-podium',
    description: 'Classement visuel (top N) avec rang, barres proportionnelles et couleurs',
    trigger: [
      'podium',
      'classement',
      'ranking',
      'top',
      'palmares',
      'top 5',
      'top 10',
      'leaderboard',
    ],
    content: `## <dsfr-data-podium> - Classement visuel

Affiche un podium (top N) avec rang numerote, label, sous-titre, barre de progression proportionnelle et valeur formatee.
Se connecte au pipeline dsfr-data-source / dsfr-data-query via l'attribut \`source\`.

### Attributs
| Attribut | Type | Defaut | Requis | Description |
|----------|------|--------|--------|-------------|
| source | String | \`""\` | oui | ID de la dsfr-data-source ou dsfr-data-query |
| label-field | String | \`""\` | oui | Chemin vers le champ label (supporte dot notation) |
| value-field | String | \`""\` | oui | Chemin vers le champ valeur numerique |
| subtitle | String | \`""\` | non | Texte fixe affiche sous chaque label |
| subtitle-field | String | \`""\` | non | Chemin vers un champ pour le sous-titre (prioritaire sur subtitle) |
| value-unit | String | \`""\` | non | Unite affichee apres la valeur (ex: "hab.", "€", "%") |
| selected-palette | String | \`"sequentialDescending"\` | non | Palette de couleurs : sequentialDescending, sequentialAscending, categorical, neutral |
| max-items | Number | \`5\` | non | Nombre maximum d'items affiches |
| no-sort | Boolean | \`false\` | non | Desactive le tri automatique (desc par valeur) |
| bar-max | Number | - | non | Valeur max forcee pour les barres (ex: 100 pour des pourcentages) |

### Comportement
- **Tri automatique** : les items sont tries par valeur decroissante (sauf si \`no-sort\` est present)
- **Barres proportionnelles** : largeur relative au max des valeurs (ou \`bar-max\` si defini)
- **Couleurs** : chaque item recoit une couleur de la palette choisie (bordure gauche + barre)
- **Accessibilite** : \`<ol>\` semantique avec aria-label descriptif du classement complet

### Exemples
\`\`\`html
<!-- Top 5 des regions par population -->
<dsfr-data-source id="src" api-type="opendatasoft"
  dataset-id="regions" base-url="https://data.gouv.fr">
</dsfr-data-source>
<dsfr-data-podium source="src"
  label-field="nom"
  value-field="population"
  subtitle="Region"
  value-unit="hab."
  selected-palette="sequentialDescending"
  max-items="5">
</dsfr-data-podium>

<!-- Podium avec donnees transformees par query -->
<dsfr-data-query id="top-villes" source="src"
  group-by="ville" aggregate="montant:sum:total"
  order-by="total:desc">
</dsfr-data-query>
<dsfr-data-podium source="top-villes"
  label-field="ville"
  value-field="total"
  value-unit="€"
  max-items="10"
  selected-palette="categorical">
</dsfr-data-podium>

<!-- Podium avec sous-titres dynamiques -->
<dsfr-data-podium source="data"
  label-field="nom"
  value-field="score"
  subtitle-field="categorie"
  bar-max="100"
  max-items="3">
</dsfr-data-podium>

<!-- Podium sans tri (ordre de la source) -->
<dsfr-data-podium source="data"
  label-field="etape"
  value-field="progression"
  value-unit="%"
  bar-max="100"
  no-sort>
</dsfr-data-podium>
\`\`\``,
  },
};

/**
 * Get skills relevant to the current user message and source context
 */
export function getRelevantSkills(message: string, currentSource: Source | null): Skill[] {
  const relevant: Skill[] = [];
  const lowerMsg = message.toLowerCase();

  for (const [, skill] of Object.entries(SKILLS)) {
    const triggered = skill.trigger.some((t) => lowerMsg.includes(t.toLowerCase()));
    if (triggered) {
      relevant.push(skill);
    }
  }

  // Always include composition patterns for dashboard/integration requests
  if (
    lowerMsg.match(/dashboard|tableau de bord|integrer|embarquer|page/) &&
    !relevant.find((s) => s.id === 'compositionPatterns')
  ) {
    relevant.push(SKILLS.compositionPatterns);
  }

  // Always include ODSQL if we have an API source
  if (currentSource?.type === 'api') {
    if (!relevant.find((s) => s.id === 'odsql')) {
      relevant.push(SKILLS.odsql);
    }
    if (!relevant.find((s) => s.id === 'odsApiVersions')) {
      relevant.push(SKILLS.odsApiVersions);
    }
  }

  // Always include apiProviders + compositionPatterns for Grist sources
  if (currentSource?.type === 'grist') {
    if (!relevant.find((s) => s.id === 'apiProviders')) {
      relevant.push(SKILLS.apiProviders);
    }
    if (!relevant.find((s) => s.id === 'compositionPatterns')) {
      relevant.push(SKILLS.compositionPatterns);
    }
  }

  // Always include dsfrDataSource and dsfrDataChart for chart-related requests
  if (
    lowerMsg.match(
      /graphique|chart|visualis|barres|ligne|camembert|kpi|carte|map|jauge|gauge|tableau|datalist/
    )
  ) {
    if (!relevant.find((s) => s.id === 'dsfrDataSource')) {
      relevant.push(SKILLS.dsfrDataSource);
    }
    if (!relevant.find((s) => s.id === 'dsfrDataChart')) {
      relevant.push(SKILLS.dsfrDataChart);
    }
  }

  // Auto-include dsfrDataQuery when visualization + filtering context detected
  if (
    lowerMsg.match(/kpi|indicateur|graphique|chart|barres|camembert/) &&
    lowerMsg.match(/departement|region|filtre|uniquement|seulement|dans le|pour le|ou\b|quand/)
  ) {
    if (!relevant.find((s) => s.id === 'dsfrDataQuery')) {
      relevant.push(SKILLS.dsfrDataQuery);
    }
  }

  // Auto-include dsfrDataSearch when search/filtering with display context detected
  if (
    lowerMsg.match(/recherche|search|chercher|barre de recherche|full-text|filtrer texte/) &&
    !relevant.find((s) => s.id === 'dsfrDataSearch')
  ) {
    relevant.push(SKILLS.dsfrDataSearch);
  }

  // Auto-include dsfrDataNormalize when data cleaning or nested data context detected
  if (
    lowerMsg.match(
      /code embarquable|snippet|html|integrer|embarquer|pipeline|dashboard|tableau de bord|grist|airtable|flatten|aplatir|nested|ods v1|records\.fields/
    ) &&
    !relevant.find((s) => s.id === 'dsfrDataNormalize')
  ) {
    relevant.push(SKILLS.dsfrDataNormalize);
  }

  // Auto-include dsfrDataFacets when interactive filtering or exploration context detected
  if (
    lowerMsg.match(
      /code embarquable|snippet|html|integrer|embarquer|interactif|explorer|exploration|dashboard|tableau de bord/
    ) &&
    !relevant.find((s) => s.id === 'dsfrDataFacets')
  ) {
    relevant.push(SKILLS.dsfrDataFacets);
  }

  return relevant;
}

/**
 * Build the skills context string to inject into the AI prompt
 */
export function buildSkillsContext(relevantSkills: Skill[]): string {
  if (relevantSkills.length === 0) return '';

  const actionSkills = relevantSkills.filter((s) => s.id.endsWith('Action'));
  const componentSkills = relevantSkills.filter((s) => !s.id.endsWith('Action'));

  let context = '\n\n---\nSKILLS INJECTES :';
  if (actionSkills.length > 0) {
    context +=
      "\n\n### Actions (pour l'apercu interactif)\n" +
      actionSkills.map((s) => s.content).join('\n\n');
  }
  if (componentSkills.length > 0) {
    context +=
      '\n\n### Composants et references (pour le code embarquable)\n' +
      componentSkills.map((s) => s.content).join('\n\n');
  }
  return context;
}
