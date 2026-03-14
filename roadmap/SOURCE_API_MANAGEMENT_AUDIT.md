Audit complet : specificites API dispersees dans le codebase
1. Types de source : pas de distinction ODS/Tabular/Generic
Probleme fondamental : Le champ type sur Source ne distingue que 3 types : 'grist' | 'api' | 'manual'. Le 'api' est un fourre-tout qui regroupe 3 providers radicalement differents (ODS, Tabular, Generic REST). La distinction est faite a la volee par regex sur l'URL, a chaque generation de code.

Regex dupliques dans 3 fichiers :

Fichier	ODS regex	Tabular regex
apps/builder/src/ui/code-generator.ts L887-899	/api/explore/v2.1/catalog/datasets/	/api/resources/{id}/data/
apps/builder-ia/src/ui/code-generator.ts L12-15	Meme pattern mais avec /records requis	Meme pattern
apps/builder-ia/src/chat/chat.ts L178-179	Regex inline (3e variante)	Regex inline
Les regexes sont subtilement differentes entre builder et builder-IA -- risque de detection incoherente.

2. Interface Source : 3 definitions independantes, non partagees
Champ	sources/state.ts	builder/state.ts	builder-ia/state.ts
documentId	oui	oui	manquant
tableId	oui	oui	manquant
apiKey	oui	manquant	manquant
method	oui	manquant	manquant
headers	oui	manquant	manquant
dataPath	oui	oui	manquant
connectionId	oui	manquant	manquant
isPublic	oui	oui	manquant
rawRecords	GristRecord[]	{fields: ...}[] (type different)	manquant
recordCount	requis	optionnel	optionnel
3. Proxy : URL de base dupliquee 7+ fois
https://chartsbuilder.matge.com est defini independamment dans :

packages/shared/src/api/proxy-config.ts (canonical)
packages/shared/src/api/proxy.ts (doublon)
apps/builder/src/state.ts (doublon)
apps/builder-ia/src/ui/code-generator.ts (doublon)
apps/sources/src/state.ts (doublon)
src/utils/beacon.ts (doublon)
apps/grist-widgets/src/chart.ts et datalist.ts (doublons en dur)
apps/monitoring/src/monitoring-data.ts (doublon)
4. Hostname → proxy mapping : disperse
La connaissance que docs.getgrist.com → /grist-proxy et grist.numerique.gouv.fr → /grist-gouv-proxy est repartie dans :

proxy-config.ts (endpoints sans hostnames cibles)
proxy.ts (hostnames en string.includes())
connection-manager.ts (hostnames en url.includes())
3 vite.config.ts differents (hostnames comme targets)
code-generator.ts du builder (L1160-1168, apiUrl.includes())
5. Pagination : 3 systemes independants
Provider	Mecanisme	Page size	Max records	Params URL	Response keys
ODS	Offset-based (offset + limit)	100	1000 (10 pages)	offset, limit	results, total_count
Tabular	Page-based + links.next cursor	100	50000 (500 pages)	page, page_size	data, meta.total, links.next
dsfr-data-source	Page-based hardcode	20	illimite	page, page_size	data, meta.{page,page_size,total}
Les constantes ODS (ODS_PAGE_SIZE=100, ODS_MAX_PAGES=10) sont dupliquees entre l'adapter (opendatasoft-adapter.ts L25-28) et le builder (code-generator.ts L19-20), avec une fonction fetchOdsResults() dans le builder qui est un copier-coller de l'adapter.

6. Structure de reponse API : connaissances disseminees
Concept	ODS	Tabular	Grist
Donnees	json.results	json.data	json.records (wrappees sous {fields: {...}})
Total	json.total_count	json.meta.total	N/A (pas de total)
Page suivante	Offset calcule	json.links.next (URL)	N/A
Facettes serveur	/facets endpoint dedie	Non supporte	Non supporte
Aggregation serveur	ODSQL (select, group_by, where)	Non supportee (client-side)	Non supportee (client-side)
Format de filtre	ODSQL (field = "value", AND)	Colon syntax (field:op:value, , )	Colon syntax (via dsfr-data-query generic)
Champs nested	Non (plats)	Non (plats)	Oui (fields.X) → flatten requis
Ces connaissances sont eparpillees dans :

Les 3 adapters (opendatasoft-adapter.ts, tabular-adapter.ts, generic-adapter.ts) -- bien centralise pour les composants
dsfr-data-source.ts L172-183 -- hardcode Tabular (json.meta, json.data)
dsfr-data-query.ts L757 -- hardcode Tabular (fallback json.data)
code-generator.ts du builder -- tout re-implemente sans utiliser les adapters
api-explorer.ts -- detection heuristique multi-pattern
7. Facettes : 3 modes, decides au cas par cas dans le code generator
Source	Mode facettes	Comment decide	Ou dans le code
Grist sans flatten	{ fieldPrefix: 'fields.' }	if (!isFlattened)	code-generator.ts L1183
Grist avec flatten	undefined (client-side)	if (isFlattened)	L1183
ODS datalist	{ serverFacets: true }	if (odsInfoDl)	L1333
Tabular datalist	{ staticValues: computed }	if (tabularInfoDl)	L1374
ODS chart	undefined (apres query)	apres generateOdsQueryCode	L1469
Tabular chart	undefined (apres query)	apres generateTabularQueryCode	L1482
Generic	undefined (via middleware)	else branch	L1486
Dans les composants, dsfr-data-facets.ts gere correctement les 3 modes via l'adapter, mais le code generator ignore completement le systeme d'adapters et reimplemente toute la logique.

8. Resolution des chemins de champs : 3 logiques differentes
Contexte	Logique	Fichier
Grist dynamique	isFlattened ? labelField : 'fields.' + labelField	code-generator.ts L1177
API dynamique	isFlattened ? labelField : fullPath || labelField	code-generator.ts L1305
Local (embedded)	labelField direct (pas de fullPath)	code-generator.ts L558+
dsfr-data-facets	_resolveValue() avec split sur .	dsfr-data-facets.ts L343
dsfr-data-query generic	row[field] plat uniquement	dsfr-data-query.ts L434+
9. Auth : header Grist construit 9 fois
Le pattern Authorization: Bearer ${apiKey} est repete 9 fois dans grist-explorer.ts et connection-manager.ts. Pas de helper centralise.

10. Ce qui fonctionne bien (a garder)
Le systeme d'adapters dans dsfr-data-query est bien concu :

AdapterCapabilities declare les capacites (serverFetch, serverFacets, serverSearch, serverGroupBy, serverOrderBy, whereFormat)
AdapterParams passe tout l'etat necessaire
FetchResult.needsClientProcessing distingue ODS (server-side aggregation) de Tabular (client-side)
ADAPTER_REGISTRY avec registerAdapter() pour l'extensibilite
Les facettes dans dsfr-data-facets.ts utilisent adapter.capabilities.serverFacets pour router
Proprietes necessaires pour un ProviderConfig centralise
En synthetisant tous les ecarts ci-dessus :


interface ProviderConfig {
  // --- Identite ---
  id: 'opendatasoft' | 'tabular' | 'grist' | 'generic';
  /** Regex pour detecter ce provider a partir de l'URL API */
  urlPattern: RegExp;
  /** Nom affichable */
  displayName: string;

  // --- Connexion / Proxy ---
  /** Hostname(s) connu(s) pour ce provider */
  knownHosts: string[];
  /** Chemin proxy correspondant (ex: '/grist-gouv-proxy') */
  proxyEndpoint: string;
  /** URL cible sans proxy (ex: 'https://tabular-api.data.gouv.fr') */
  targetBaseUrl: string;
  /** Methode d'auth par defaut */
  authType: 'bearer' | 'apikey-header' | 'none';
  /** Nom du header d'auth si applicable */
  authHeaderName?: string;

  // --- Structure de donnees ---
  /** Chemin JSON vers le tableau de donnees dans la reponse */
  dataPath: string;                // 'results' | 'data' | 'records'
  /** Chemin JSON vers le total */
  totalCountPath: string | null;   // 'total_count' | 'meta.total' | null
  /** Champ de metadonnees de pagination */
  paginationMeta?: {
    pagePath: string;              // 'meta.page'
    pageSizePath: string;          // 'meta.page_size'
    totalPath: string;             // 'meta.total'
  };
  /** Les donnees sont-elles wrappees sous un sous-objet ? */
  nestedDataKey: string | null;    // 'fields' pour Grist, null pour les autres
  /** Faut-il flatten automatiquement ? */
  requiresFlatten: boolean;

  // --- Pagination ---
  paginationType: 'offset' | 'page' | 'cursor' | 'none';
  pageSize: number;                // 100 pour ODS/Tabular, 20 pour server-side
  maxPages: number;                // 10 pour ODS, 500 pour Tabular
  maxRecords: number;              // 1000 pour ODS, 50000 pour Tabular
  /** Noms des parametres de pagination dans l'URL */
  paginationParams: {
    page?: string;                 // 'page' pour Tabular
    pageSize?: string;             // 'page_size' pour Tabular
    offset?: string;               // 'offset' pour ODS
    limit?: string;                // 'limit' pour ODS
  };
  /** Chemin vers l'URL de la page suivante */
  nextPagePath: string | null;     // 'links.next' pour Tabular

  // --- Capacites serveur ---
  capabilities: {
    serverFetch: boolean;
    serverFacets: boolean;         // true pour ODS uniquement
    serverSearch: boolean;         // true pour ODS uniquement
    serverGroupBy: boolean;        // true pour ODS uniquement
    serverOrderBy: boolean;        // true pour ODS et Tabular
    serverAggregation: boolean;    // true pour ODS uniquement
  };

  // --- Requetes ---
  /** Format de filtre (ODSQL ou colon syntax) */
  whereFormat: 'odsql' | 'colon';
  /** Separateur pour joindre les clauses where */
  whereSeparator: string;          // ' AND ' pour ODSQL, ', ' pour colon
  /** Syntaxe d'agregation */
  aggregationSyntax: 'odsql-select' | 'colon-attr' | 'client-only';
  /** Mapping des operateurs de filtre vers la syntaxe native */
  operatorMapping?: Record<string, string>;  // eq->exact pour Tabular

  // --- Facettes ---
  facetsMode: 'server' | 'static' | 'client';
  /** Endpoint API pour les facettes serveur */
  facetsEndpoint?: string;         // '/facets' pour ODS
  /** Format des selections de facettes */
  facetWhereFormat: 'odsql' | 'colon';

  // --- Identifiants de ressource ---
  /** Champ d'identifiant principal de la ressource */
  resourceIdField: string;         // 'datasetId' pour ODS, 'resourceId' pour Tabular, 'documentId+tableId' pour Grist
  /** Pattern de construction d'URL API */
  apiPathTemplate: string;         // '/api/explore/v2.1/catalog/datasets/{datasetId}/records'

  // --- Code generation ---
  /** Composants necessaires dans le pipeline genere */
  pipeline: {
    usesDsfrDataSource: boolean;       // true pour Grist/Generic, false pour ODS/Tabular
    usesDsfrDataQuery: boolean;        // true sauf pour embedded
    usesDsfrDataNormalize: boolean;    // true pour Grist
    queryApiType?: string;         // 'opendatasoft' | 'tabular' | undefined
  };
  /** Prefixe de champ pour les paths nested */
  fieldPrefix: string;             // 'fields.' pour Grist sans flatten, '' sinon
  /** Dependencies DSFR Chart necessaires */
  needsDsfrChart: boolean;
  /** Dependencies dsfr-data necessaires */
  needsDsfrData: boolean;
}