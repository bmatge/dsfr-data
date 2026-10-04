import { LitElement, html } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { getByPath } from '../utils/json-path.js';
import { reportConfigError, clearConfigError } from '../utils/config-error.js';
import { sendWidgetBeacon } from '../utils/beacon.js';
import {
  resolveDataTransport,
  resolveRelayUrl,
  transportFetch,
  buildCorsProxyRequest,
  isRelayedHost,
  RELAYED_HOSTS,
  normalizeProviderAuthHeaders,
  detectProvider,
  flattenProviderRecords,
  GENERIC_CONFIG,
} from '@dsfr-data/shared/lib';
import type { ProviderConfig } from '@dsfr-data/shared/lib';

/**
 * Convention de l'attribut `paginate` du mode URL (#1136) : paramètres de
 * requête et chemins de la réponse, déclarés dans `GENERIC_CONFIG.pagination`
 * et lus ici — la source ne les porte plus en dur.
 */
const URL_PAGINATION = GENERIC_CONFIG.pagination;

/** L'api-type du mode URL (valeur par défaut de l'attribut). */
const GENERIC_API_TYPE = GENERIC_CONFIG.id;

/**
 * Api-types capables de filtrer côté serveur (#1139) : dérivés du registre
 * et de la capacité `serverFetch`, pour nommer aussi un adaptateur ajouté
 * par `registerAdapter` — jamais une liste en dur.
 */
function serverApiTypes(): string {
  return listAdapterTypes()
    .filter((type) => getAdapter(type)?.capabilities.serverFetch)
    .join(', ');
}

/** `meta.page` → `meta` : l'objet dont la présence signale une réponse paginée. */
function parentPath(path: string): string {
  const i = path.lastIndexOf('.');
  return i < 0 ? '' : path.slice(0, i);
}

/** Valeur lue dans la réponse, ou le repli quand elle est absente (`??`). */
function numberOr(value: unknown, fallback: number): number {
  return value === undefined || value === null ? fallback : (value as number);
}

/**
 * Mode URL : ne garde que le contenu imbrique sous `nestedKey` (#1136) —
 * les cles d'enveloppe (`id` Grist) ne deviennent pas des colonnes.
 * Une ligne sans enveloppe garde son aplatissement commun.
 */
function stripEnvelopeKeys(raw: unknown[], flat: unknown[], nestedKey: string): unknown[] {
  return raw.map((r, i) => {
    if (r === null || typeof r !== 'object' || Array.isArray(r)) return flat[i];
    const nested = (r as Record<string, unknown>)[nestedKey];
    return nested !== null && typeof nested === 'object' && !Array.isArray(nested)
      ? { ...(nested as Record<string, unknown>) }
      : flat[i];
  });
}
import type {
  ApiAdapter,
  AdapterParams,
  ServerSideOverlay,
  FetchResult,
} from '../adapters/api-adapter.js';
import { getAdapter, listAdapterTypes } from '../adapters/adapter-registry.js';
import { getCacheProvider, cacheKeyFor } from '../utils/cache-provider.js';
import { logFetchError } from '../utils/fetch-diagnostics.js';
import {
  dispatchDataLoaded,
  dispatchDataError,
  getDataErrorState,
  dispatchDataLoading,
  dispatchDataIdle,
  clearDataCache,
  setDataMeta,
  clearDataMeta,
  subscribeToSourceCommands,
} from '../utils/data-bridge.js';
import type { DataIdleEvent } from '../utils/data-bridge.js';
import { visibleConsumers } from '../utils/visible-consumers.js';
import { joinWhere } from '../utils/where.js';

/**
 * La clé `key` est-elle réservée par l'adaptateur (#726, #1137) ? Chaque
 * adaptateur déclare les clés de query-string qu'il construit lui-même
 * (`ApiAdapter.reservedParamKeys`) ; une entrée `*suffixe` réserve toute clé
 * qui se termine par ce suffixe. La source ne porte que le message.
 */
function isReservedParamKey(reserved: ReadonlySet<string> | undefined, key: string): boolean {
  if (!reserved) return false;
  if (reserved.has(key)) return true;
  for (const entry of reserved) {
    if (entry.startsWith('*') && entry.length > 1 && key.endsWith(entry.slice(1))) return true;
  }
  return false;
}

/**
 * <dsfr-data-source> - Connecteur de données
 *
 * Composant invisible qui se connecte a une API REST, récupéré les données,
 * les normalise et les diffuse via des événements custom.
 *
 * Deux modes de fonctionnement :
 * 1. Mode URL brute (existant) : `url` pointe vers une API REST quelconque
 * 2. Mode adapter (nouveau) : `api-type` active un adapter qui gere URL,
 *    pagination, parsing spécifiques au provider.
 *
 * @example Mode URL brute
 * <dsfr-data-source id="sites" url="https://api.example.com/sites"
 *   transform="data.results" refresh="60">
 * </dsfr-data-source>
 *
 * @example Mode adapter
 * <dsfr-data-source id="src" api-type="opendatasoft"
 *   base-url="https://data.iledefrance.fr" dataset-id="elus-regionaux"
 *   select="count(*) as total, region" group-by="region">
 * </dsfr-data-source>
 *
 * @fires dsfr-data-loaded - `{ sourceId, data }` sur `document` — données chargees et publiees sous l'`id` de cette source. C'est l'evenement que tout l'aval ecoute.
 * @fires dsfr-data-loading - `{ sourceId }` sur `document` — un chargement demarre.
 * @fires dsfr-data-error - `{ sourceId, error, attemptedUrl? }` sur `document` — le fetch ou le
 *   parsing a echoue. `attemptedUrl` (#603) porte l'URL REELLEMENT appelee, proxy applique :
 *   elle diverge souvent du `base-url` ecrit dans le HTML, et le message de l'`Error` reste
 *   volontairement court. La cle est absente quand l'URL n'a pas pu être construite, ou pour
 *   une erreur qui ne vient pas d'un fetch (données inline invalides, configuration).
 * @fires dsfr-data-idle - `{ sourceId, reason }` sur `document` — la source attend un filtre
 *   (`require-where` posé, aucun filtre reçu). Aucune requête n'est partie : l'état est distinct
 *   d'un chargement, d'une erreur et d'un résultat vide. Les afficheurs le rendent en message
 *   « choisissez un filtre » (#690).
 *   Le contrat de cet événement ne change pas avec le message lisible des blocs (#1203) : le
 *   code HTTP reste dans `error.message`, et l'échec reste journalisé en console.
 * @fires cache-fallback - `{ sourceId }` sur l'élément — les données servies viennent du cache externe après un echec reseau (#307).
 */
@customElement('dsfr-data-source')
export class DsfrDataSource extends LitElement {
  // --- Mode URL brute (existant) ---

  /** URL de l'API a interroger (mode URL brute). Vide en mode adapter ou en mode `data` inline. */
  @property({ type: String })
  url = '';

  /** Méthode HTTP : `GET` (défaut) ou `POST`. */
  @property({ type: String })
  method: 'GET' | 'POST' = 'GET';

  /**
   * En-têtes HTTP en JSON. Ex: `'{"Authorization": "Bearer xxx"}'`.
   * Quand le fournisseur attend sa clé sous un en-tête précis (déclaré par sa
   * configuration), un `apikey` nu est réécrit automatiquement au bon format
   * (#655) ; détail par fournisseur : table des capacités d'ARCHITECTURE.
   */
  @property({ type: String })
  headers = '';

  /**
   * Paramètres de requête en JSON. Mode URL : query string en GET, corps de la
   * requête en POST. **Mode adaptateur** (#726) : les paires sont ajoutées à
   * l'URL construite par l'adaptateur, ce qui sert les paramètres propres à
   * l'API que la bibliothèque ne modélise pas — par exemple
   * `params='{"timezone":"Europe/Paris"}'` pour lire des dates dans un
   * fuseau donné, sans quitter le mode adaptateur. Les clés que
   * l'adaptateur construit lui-même (il les déclare : clauses, pagination,
   * projection, suffixes d'opérateur) sont réservées : elles sont refusées
   * avec une erreur de configuration plutôt que d'écraser une clause (#1137).
   * Seuls les adaptateurs qui acceptent des paramètres libres les
   * transmettent (en chargement paginé comme en `fetch-mode="export"`) ; les
   * autres les ignorent — voir la table des capacités d'ARCHITECTURE.
   */
  @property({ type: String })
  params = '';

  /** Rafraîchissement automatique en secondes (0 = désactivé). */
  @property({ type: Number })
  refresh = 0;

  /** Chemin JSONPath vers le tableau de données dans la réponse. Ex: `"results"`, `"data.items"`. */
  @property({ type: String })
  transform = '';

  /**
   * Active la pagination serveur en mode URL : injecte page/page_size dans
   * l'URL et publie la meta.
   *
   * La source ne livre alors qu'UNE page. Une `dsfr-data-query` en aval qui
   * regroupe ou agrège (`group-by`, `aggregate`, `explode`) calcule sur cette
   * seule page : le chiffre est partiel. Le mode URL ne délègue rien et aucun
   * attribut ne lui fait charger le jeu entier — sans `paginate`, c'est la
   * page par défaut de l'API qui revient. La requête le dit donc sans se
   * refuser (#1242) : avertissement en console, réserve au volet Diagnostic.
   * Pour un chiffre sur tout le jeu, passer par un `api-type` qui sait le
   * charger, ou par une URL qui rend déjà l'agrégat.
   */
  @property({ type: Boolean })
  paginate = false;

  /** Taille de page pour la pagination serveur (nombre de records par page). */
  @property({ type: Number, attribute: 'page-size' })
  pageSize = 20;

  /**
   * TTL du cache externe en secondes (0 = desactive). Actif uniquement si la page hote
   * enregistre `window.DSFR_DATA_CACHE_PROVIDER` (#307) — no-op en embed anonyme.
   * C'est un repli hors ligne, côté navigateur : il n'a AUCUN rapport avec le relais
   * (`relay-url`), ne lui est pas transmis et ne règle pas la durée de son cache.
   */
  @property({ type: Number, attribute: 'cache-ttl' })
  cacheTtl = 3600;

  /**
   * Force le passage par le proxy CORS générique (pour les APIs externes sans CORS).
   * Ne vaut qu'en mode URL (`url="…"`) : avec un `api-type`, l'attribut est sans effet
   * sur un hôte que le proxy ne relaie pas par un endpoint dédié (un portail
   * Opendatasoft, par exemple) — la requête part en direct, et la source le signale
   * une fois en console.
   *
   * Sans effet sur une requête qui part au relais (`relay-url`) : le relais prend
   * toutes les requêtes GET vers une autre origine, `use-proxy` ne garde que ce que
   * le relais ne porte pas (requêtes POST, cible hors `https`).
   */
  @property({ type: Boolean, attribute: 'use-proxy' })
  useProxy = false;

  /**
   * Domaine du proxy CORS pour CETTE source (#340), prioritaire sur
   * `window.DSFR_DATA_PROXY` et la config build-time. Sert à la fois la
   * réécriture des hôtes connus et le `use-proxy` générique. Vide = résolution
   * proxy globale habituelle. Ex: `proxy-url="https://mon-proxy.fr"`.
   *
   * Seuls les hôtes connus sont relayés (Tabular, Grist gouv et SaaS, Albert,
   * INSEE Melodi). Sur tout autre hôte — un portail Opendatasoft en mode
   * adaptateur, ou une URL quelconque sans `use-proxy` — l'attribut est SANS
   * EFFET : la requête part en direct vers l'API. La source l'écrit alors une fois
   * en console (« proxy-url est sans effet »), et le volet Diagnostic le reprend.
   * Pour faire passer un portail Opendatasoft (ou tout autre hôte) par le domaine
   * du site, c'est `relay-url` qu'il faut poser : `proxy-url` désigne un autre
   * contrat (endpoints dédiés et `/cors-proxy`, toutes méthodes, en-têtes transmis).
   * Avec un relais, `proxy-url` ne sert plus que les requêtes que le relais ne
   * porte pas (POST du mode SQL de Grist).
   */
  @property({ type: String, attribute: 'proxy-url' })
  proxyUrl = '';

  /**
   * Préfixe du relais cachable du site hôte (ADR-155, #1232) : le chemin que
   * le site a choisi pour sa route de relais (`relay-url="/relais"`), ou une
   * URL absolue (`relay-url="https://site.example/relais"`). Vide : la valeur
   * de `window.DSFR_DATA_RELAY`, sinon aucun relais — et alors rien ne change.
   *
   * Avec un relais, toute requête GET vers une autre origine part sous la forme
   * `relais/hôte/chemin?requête` (le préfixe du relais, l'hôte de la cible, puis
   * son chemin et sa requête), en mode adaptateur comme en mode URL :
   * filtres, regroupements, tri et pagination délégués restent dans l'URL, que le
   * relais transmet telle quelle. Deux cibles donnent deux URL, une même requête
   * donne la même URL au caractère près : le site peut les mettre en cache.
   *
   * Le relais est une route que LE SITE HÔTE fournit, selon le contrat
   * `docs/RELAY.md` (relais de référence : `proxy/relay/node/`). Aucune
   * instance publique n'en expose.
   *
   * Sur une requête relayée, aucun en-tête n'est envoyé : ni `headers`, ni
   * `api-key-ref` (la clé appartient au relais, qui l'ajoute par hôte), ni
   * cookie. Si l'un de ces attributs est posé, la source l'écrit une fois en
   * console.
   *
   * Ne passent PAS par le relais, et gardent le chemin habituel (direct ou
   * `proxy-url`) : une URL relative ou de même origine ; une requête POST (mode
   * SQL de Grist, `method="POST"`) ; une cible hors `https`, sur un port explicite
   * ou avec identifiants ; un chemin que le relais refuserait (`%2f`, `%2e`, `//`…)
   * — ces deux derniers cas avec un avertissement. `fetch-mode="export"` sur
   * l'API Tabular (export Parquet) retombe sur la pagination, relayée. Une URL de
   * relais de plus de 8 000 caractères part quand même au relais, qui répond 414.
   *
   * Si le relais répond 503 (place momentanément prise : il n'a pas de file
   * d'attente), la requête est réessayée trois fois au plus, après le délai
   * qu'il annonce ; jamais sur un 429.
   *
   * Sans rapport avec `cache-ttl` : la durée de cache se règle sur le relais.
   */
  @property({ type: String, attribute: 'relay-url' })
  relayUrl = '';

  /** Référence vers une clé API déclarée dans window.DSFR_DATA_KEYS */
  @property({ type: String, attribute: 'api-key-ref' })
  apiKeyRef = '';

  // --- Mode inline data ---

  /** Données JSON inline (pas de fetch) */
  @property({ type: String })
  data = '';

  // --- Mode adapter (nouveau) ---

  /**
   * Type d'API : l'identifiant d'un adaptateur du registre (ceux de la
   * bibliothèque, ou un adaptateur ajouté par `registerAdapter`). Toute autre
   * valeur que `generic` active le mode adaptateur ; `generic` avec une `url`
   * reste en mode URL.
   */
  @property({ type: String, attribute: 'api-type' })
  apiType = 'generic';

  /** URL de base de l'API, pour les adaptateurs qui adressent un portail par son URL. */
  @property({ type: String, attribute: 'base-url' })
  baseUrl = '';

  /** Identifiant du jeu de données, pour les adaptateurs qui désignent un jeu par son identifiant. */
  @property({ type: String, attribute: 'dataset-id' })
  datasetId = '';

  /** Identifiant de la ressource (fichier d'un jeu), pour les adaptateurs qui désignent une ressource. */
  @property({ type: String })
  resource = '';

  /**
   * Clause WHERE statique, déléguée à l'API de l'adaptateur.
   *
   * Une liste `in` ou `notin` dont une valeur porte une parenthèse ou une
   * virgule est déléguée comme les autres (#1233). Sur l'API Tabular, qui
   * écarte sans erreur une telle valeur écrite nue, l'adaptateur l'envoie
   * entre guillemets — seule forme que l'API lise —, en chargement complet
   * comme en pagination serveur ; les autres valeurs de la liste restent
   * nues.
   *
   * Cette forme n'est écrite dans aucune documentation de l'API. Si elle est
   * refusée, l'adaptateur se replie, et le volet Diagnostic le signale :
   * - en chargement complet, il calcule la clause lui-même, sur les lignes
   *   chargées. Le résultat reste juste ; les autres clauses restent
   *   déléguées, mais toutes les lignes qu'elles gardent sont chargées (une
   *   requête par page, sous `max-records`), et un `group-by` posé à côté
   *   n'est plus délégué — les lignes filtrées sont rendues brutes, une
   *   `dsfr-data-query` en aval regroupe ;
   * - en pagination serveur (`server-side`), où ce calcul n'est pas
   *   possible, la liste repart sans guillemets : la valeur est écartée par
   *   l'API et le résultat est incomplet.
   */
  @property({ type: String })
  where = '';

  /**
   * Clause SELECT, liste séparée par des virgules. Sa grammaire dépend de
   * l'adaptateur (table des capacités d'ARCHITECTURE, ligne « projection
   * select ») : clause complète ou simple liste de noms de colonnes ; un
   * adaptateur sans projection l'ignore.
   *
   * **Clause complète** : `select="count(*) as total, region"`. Une
   * expression (fonction, alias `as`, `*`, chemin pointé, opérateur) est
   * transmise telle quelle ; un nom de champ qui n'est pas un identifiant nu
   * (espace, accent, chiffre initial comme `1_uai`) est échappé
   * automatiquement (#767). Une virgule à l'intérieur d'une fonction ou d'une
   * chaîne ne sépare pas. Un `select` fait UNIQUEMENT d'agrégats, sans
   * `group-by` (`select="sum(montant) as total"`) se charge en une requête
   * d'une ligne, la valeur calculée par le serveur sur tout le jeu (#810) ;
   * si le filtre ne garde aucune ligne, un `count` vaut 0 et les autres
   * fonctions `null`.
   *
   * Quand une `dsfr-data-query` délègue son regroupement à cette source, le
   * `select` émis est COMPOSÉ depuis l'`aggregate` de la query (colonnes
   * d'agrégat + colonnes du `group-by`) : ce `select` ne l'écrase pas, sinon
   * la colonne d'alias n'existerait pas dans la réponse et le chiffre affiché
   * serait faux (#859). S'il définit une colonne par une expression aliasée
   * (`year(date) as annee`) que le regroupement vise, la délégation est
   * refusée — avertissement en console, regroupement calculé côté client.
   *
   * **Liste de noms de colonnes** (projection seule, #985) :
   * `select="nom, Code sexe"`, espaces et accents admis — l'API ne rend que
   * ces colonnes, soit dix fois moins d'octets sur un jeu large. Aucune
   * colonne n'est ajoutée d'office : une colonne lue en aval (graphique,
   * liste, facette, filtre client) doit y figurer, et un nom inconnu du jeu
   * fait répondre l'API en erreur. Sans effet quand un `group-by` ou un
   * `aggregate` est posé (sur la source ou délégué par une query), si l'API
   * refuse la projection à côté d'un agrégateur. Une expression (fonction,
   * alias, `*`) est ignorée avec un avertissement : toutes les colonnes sont
   * chargées.
   */
  @property({ type: String })
  select = '';

  /**
   * Group-by, délégué aux adaptateurs déclarant `serverGroupBy`. Avec un
   * `select` en clause complète, un élément peut être une expression
   * aliasée, avec ou sans fonction (`year(date) as annee`, `periode as an`),
   * transmise telle quelle — l'alias `as` y est obligatoire (#641). Même
   * découpe et même échappement que `select` (#767) :
   * `date_format(d, 'yyyy-MM') as m` reste d'un seul tenant.
   */
  @property({ type: String, attribute: 'group-by' })
  groupBy = '';

  /** Agrégation, déléguée aux adaptateurs déclarant `serverGroupBy`. */
  @property({ type: String })
  aggregate = '';

  /**
   * Tri (`champ:asc, champ2:desc`), délégué aux adaptateurs déclarant
   * `serverOrderBy`.
   *
   * Une API qui pagine par décalage et ne trie que sur une clé (Tabular) rend
   * un ordre instable d'une page à l'autre dès que la clé n'est pas unique :
   * des lignes reviennent deux fois, d'autres jamais, pour un compte juste.
   * Un tri délégué qui s'étend sur plusieurs pages est donc rendu sûr par
   * l'adaptateur (#1202, #1233), lignes brutes comme groupes d'un
   * `group-by` :
   * - tout le jeu est chargé : il est relu sans tri et trié sur place (une
   *   requête de plus), dans l'ordre du pipeline — vides, puis nombres, puis
   *   textes —, le même que celui d'une `dsfr-data-query` ;
   * - `limit` ou `max-records` coupe le chargement : le tri reste au serveur,
   *   complété d'une clé de départage (l'identifiant de ligne, ou les autres
   *   colonnes du `group-by`) qui le rend total.
   *
   * Un chargement d'une seule page, et un regroupement trié sur sa seule
   * colonne de regroupement, gardent le tri du serveur tel quel.
   */
  @property({ type: String, attribute: 'order-by' })
  orderBy = '';

  /**
   * Mode pagination serveur (datalist, tableaux).
   *
   * Ce qui est délégué ne change pas avec ce mode : une page porte les mêmes
   * filtres, le même regroupement et les mêmes agrégats qu'un chargement
   * complet — seule la façon dont les lignes arrivent change (#852).
   *
   * La source ne livre qu'UNE page : rien de ce qui se calcule côté client
   * sur l'ensemble des lignes n'a de sens derrière elle. Une
   * `dsfr-data-query` en aval dont le regroupement ou l'agrégat n'est pas
   * délégué — part ou cumul, `explode`, agrégat sans `group-by`, fonction que
   * l'adaptateur ne traduit pas, transformateur amont qui change les
   * colonnes, source lue par d'autres composants, source déjà regroupée —
   * passe en **erreur de configuration** au lieu d'émettre un chiffre
   * partiel (#1242). Deux corrections :
   * - retirer `server-side` : la source charge le jeu entier, dans la limite
   *   de `max-records` ;
   * - si le jeu dépasse ce plafond, ou si une liste paginée lit la même
   *   source : donner à la requête sa propre source sans `server-side`, qui
   *   porte le regroupement délégable (`group-by`, `aggregate`) — le serveur
   *   regroupe alors le jeu entier, et la part ou le cumul se calcule en
   *   aval, sur les groupes.
   *
   * Une requête qui délègue réellement son regroupement, ou qui ne regroupe
   * pas (filtre et tri d'un tableau paginé), n'est pas concernée.
   */
  @property({ type: Boolean, attribute: 'server-side' })
  serverSide = false;

  /** Limite du nombre de résultats */
  @property({ type: Number })
  limit = 0;

  /**
   * Plafond de lignes du chargement complet en mode adaptateur (#233,
   * #1027), honoré par les adaptateurs qui paginent eux-mêmes leur
   * chargement complet. 0 = plafond par défaut de l'adaptateur (valeurs par
   * adaptateur : table des capacités d'ARCHITECTURE, ligne « plafond
   * fetchAll »). À relever explicitement pour charger un jeu plus long par la
   * pagination — par exemple une carte des ≈ 35 000 communes
   * (`max-records="40000"`) — ou pour les tableaux de bord « un fetch, N
   * agrégations client » : attention au nombre de requêtes en boucle (une
   * par page de l'API) et au poids mémoire. Un `limit` plus petit reste
   * prioritaire. Quand le plafond coupe le jeu, la source signale la
   * troncature (`truncated`) et un avertissement console cite `max-records`.
   *
   * Un chargement coupé par le plafond et trié (`order-by`) rend les
   * premières lignes du tri, chacune une fois : sur Tabular, le tri délégué
   * est complété d'une clé de départage (#1233). Si l'API la refuse, le tri
   * du serveur est gardé tel quel et le volet Diagnostic signale un tri
   * instable — des lignes à valeurs égales peuvent alors manquer ou être
   * doublées aux limites de page.
   */
  @property({ type: Number, attribute: 'max-records' })
  maxRecords = 0;

  /**
   * Stratégie de chargement en mode adaptateur (#689) : `records` (défaut,
   * comportement historique — pagination par pages) ou `export`, qui charge
   * tout le jeu en **une seule requête**, ou en quelques plages, sur
   * l'endpoint d'export de l'API. Implémenté par les adaptateurs qui ont un
   * endpoint d'export (table des capacités d'ARCHITECTURE, ligne
   * « chargement en une requête ») ; les autres ignorent l'attribut.
   *
   * Selon l'adaptateur, l'export porte les mêmes clauses (`select`, `where`,
   * `group-by`, `order-by`) ou ne rend que des **lignes brutes** (#1055) :
   * dans ce dernier cas, avec un `where`, `group-by`, `aggregate` ou
   * `order-by` délégué (posé sur la source ou transmis par une
   * `dsfr-data-query`), la source reste sur la pagination, qui les exécute
   * côté serveur, et le dit en console. Un export binaire (colonnes projetées
   * depuis `select`) charge son lecteur à la demande seulement. Pour une
   * première page rapide sur un petit jeu, la pagination reste plus vive ;
   * l'export l'emporte au-delà de 1 000 à 2 000 lignes.
   *
   * À activer pour une page « un fetch, N agrégations client », un jeu de
   * plus de 1 000 lignes, ou un `group-by` à beaucoup de groupes : l'API
   * les rend tous d'un coup au lieu d'une page. À ne pas activer avec
   * `server-side` (pagination page par page), qui reste sur l'endpoint
   * paginé et signale la contradiction dans la console.
   *
   * En mode `export` le total serveur est inconnu : la troncature est
   * détectée en demandant une ligne de plus que le plafond `max-records`,
   * qui borne aussi les lignes lues. Si l'API n'expose pas d'endpoint
   * d'export, la source retombe une fois sur le chargement paginé, avec un
   * avertissement en console.
   */
  @property({ type: String, attribute: 'fetch-mode' })
  fetchMode: 'records' | 'export' = 'records';

  /**
   * Ne rien charger tant qu'aucun filtre n'a été reçu (#690).
   *
   * Pensé pour les pages d'exploration : sans cet attribut, une source
   * interroge l'API dès le montage et rapatrie le jeu entier — une requête
   * coûteuse dont personne ne regarde le résultat. Avec lui, la source reste
   * en attente, émet `dsfr-data-idle` et ne part chercher les données qu'au
   * premier filtre.
   *
   * Ce qui compte comme filtre : les clauses reçues par commande — facettes,
   * recherche, `dsfr-data-context`, délégation d'un `dsfr-data-query` (son
   * `where`, avec ou sans `group-by`, quand elle est seule lectrice de la
   * chaîne — #856). Le `where` STATIQUE de la source ne compte PAS : il fait partie de la
   * définition du jeu, pas du geste de l'utilisateur ; le contraire rendrait
   * l'attribut sans effet sur toute source qui restreint déjà son périmètre.
   *
   * Quand le dernier filtre est retiré, la source repasse en attente : jamais
   * de requête « tout » implicite. Sans effet en mode données inline (`data`),
   * qui ne fait aucune requête.
   */
  @property({ type: Boolean, attribute: 'require-where' })
  requireWhere = false;

  /**
   * Ne rien charger tant que personne ne regarde (#931, AM-083).
   *
   * Une page à onglets déclare ses sources pour TOUS les panneaux ; cinq sur
   * six sont fermés à l'arrivée, et pourtant toutes les requêtes partent au
   * chargement. Avec `lazy`, la première requête attend qu'un consommateur de
   * cette source entre dans une marge de 200 px autour du viewport
   * (`IntersectionObserver`, la même marge que `dsfr-data-map` et que le
   * `lazy` de `dsfr-data-repeat`, #891). Un panneau d'onglet fermé est en
   * `display:none` : il n'a pas de boîte, il n'intersecte donc jamais, et
   * l'observateur se déclenche à l'ouverture de l'onglet.
   *
   * **Ce qui est observé** : les FEUILLES de la chaîne aval (chart, list,
   * kpi, display, podium, a11y, repeat ; pour une couche de carte, la carte
   * qui la porte), suivies à travers les transformateurs — un
   * `dsfr-data-query` est un tuyau déclaré en haut de page, l'observer
   * reviendrait à ne rien différer. `lazy-target` remplace cette détection
   * par un sélecteur explicite.
   *
   * **Opt-in strict** : sans l'attribut, la source part au chargement,
   * exactement comme avant.
   *
   * **Dégradations, toutes du côté « on charge » :** sans
   * `IntersectionObserver`, la source part immédiatement ; si la page ne
   * déclare AUCUN consommateur (ou si `lazy-target` ne désigne rien), la
   * source part immédiatement et le dit en console — une source qui ne
   * chargerait jamais serait pire que le trafic qu'on cherche à éviter.
   *
   * **Ce que `lazy` ne promet pas** : un `IntersectionObserver` n'est pas
   * continu. Il échantillonne aux temps de rendu ; un défilement par crans
   * rapides (barre de défilement jetée, `scrollIntoView` enchaînés) peut
   * traverser un consommateur sans jamais le rapporter comme visible — la
   * source reste alors en attente jusqu'au prochain passage. C'est le
   * comportement du navigateur, pas un bug de la bibliothèque.
   *
   * Se cumule avec `require-where` : les deux portes doivent s'ouvrir, et
   * `require-where` est évalué en premier (c'est son message d'attente que
   * l'utilisateur doit lire). Sans effet en mode données inline (`data`),
   * qui ne fait aucune requête.
   */
  @property({ type: Boolean })
  lazy = false;

  /**
   * Sélecteur CSS de l'élément dont la visibilité déclenche le chargement,
   * à la place des consommateurs détectés (#931). Sans effet sans `lazy`.
   *
   * `lazy lazy-target="#panneau-2"` : la source part quand le panneau entre
   * dans la marge de 200 px. À utiliser quand la détection automatique ne
   * peut pas voir le bon élément — un consommateur créé en JavaScript, une
   * carte dont on préfère observer la section entière, ou plusieurs blocs
   * qu'on veut traiter comme un seul (le sélecteur peut désigner plusieurs
   * éléments : le PREMIER vu ouvre la porte).
   *
   * Sélecteur invalide, ou qui ne désigne aucun élément : la source part
   * immédiatement, avec un message en console. Rien de silencieux.
   */
  @property({ type: String, attribute: 'lazy-target' })
  lazyTarget = '';

  /**
   * Phrase affichée à l'usager quand cette source est en panne (#1203), à la
   * place du message du barème — dans les blocs branchés sur la source comme
   * dans le bandeau `dsfr-data-source-status`.
   *
   * `error-message="Les chiffres de la DGFiP sont en cours de mise à jour."` :
   * à poser quand l'intégrateur sait mieux que la bibliothèque dire qui publie
   * les données et quoi faire. Ne remplace QUE la phrase usager d'un échec de
   * chargement : le code HTTP, l'adresse appelée et l'heure restent dans
   * « Détails techniques », l'`Error` de `dsfr-data-error` et la console ne
   * changent pas. Sans effet sur une erreur de configuration de la source.
   */
  @property({ type: String, attribute: 'error-message' })
  errorMessage = '';

  // --- Internal state ---

  @state()
  private _loading = false;

  @state()
  private _error: Error | null = null;

  @state()
  private _data: unknown = null;

  private _currentPage = 1;
  private _refreshInterval: number | null = null;
  private _abortController: AbortController | null = null;
  private _unsubscribeCommands: (() => void) | null = null;
  private _fetchScheduled = false;
  private _reemitScheduled = false;
  /** Jeton de generation : seul le fetch courant pilote _loading (#288) */
  private _fetchGeneration = 0;
  /** Warn-once : commandes adapter recues en mode URL (#288) */
  private _urlModeCommandWarned = false;
  /** Warn-once : require-where pose sur une source qui ne peut rien recevoir (#690) */
  private _requireWhereModeWarned = false;
  /** L'avertissement « proxy sans effet » n'est émis qu'une fois par source (AM-114, #1232). */
  private _unrelayedProxyWarned = false;
  /** `headers` / `api-key-ref` non envoyés au relais : dit une fois par source (ADR-155). */
  private _relayHeadersWarned = false;

  // --- lazy (#931) ---
  /** Observateur de visibilité des consommateurs ; détruit dès la première vue. */
  private _lazyObserver: IntersectionObserver | null = null;
  /** La porte est-elle ouverte pour de bon ? Une fois vue, la source ne diffère plus. */
  private _lazySeen = false;
  /** Un réessai est-il déjà armé sur `DOMContentLoaded` ? */
  private _lazyWaitingDom = false;

  /** Dynamic WHERE overlays from dsfr-data-facets, dsfr-data-search, etc. */
  private _whereOverlays = new Map<string, string>();
  /** Dynamic orderBy overlay from dsfr-data-list sort */
  private _orderByOverlay = '';
  /** Dynamic groupBy overlay from dsfr-data-query délégation */
  private _groupByOverlay = '';
  /** Dynamic aggregate overlay from dsfr-data-query délégation */
  private _aggregateOverlay = '';

  /** Cached adapter instance */
  private _adapter: ApiAdapter | null = null;

  createRenderRoot() {
    return this;
  }

  render() {
    return html``;
  }

  connectedCallback() {
    super.connectedCallback();
    sendWidgetBeacon('dsfr-data-source', this._isAdapterMode() ? this.apiType : undefined);
    this._setupRefresh();
    this._setupCommandListener();
    window.addEventListener('online', this._onOnline);
  }

  /**
   * Retour de la connexion (#1203) : UN nouvel essai, et seulement si le
   * dernier échec de cette source était « hors connexion ». Jamais sur un 429
   * ni sur une panne du service — relancer en boucle un producteur qui limite
   * le débit aggrave le blocage. L'état d'erreur est effacé par le
   * `dsfr-data-loading` de la relance : un second `online` ne relance rien.
   */
  private _onOnline = (): void => {
    if (!this.id || !this._error) return;
    const state = getDataErrorState(this.id);
    if (state?.originId === this.id && state.cause === 'hors-connexion') this.reload();
  };

  /**
   * Purge du cache de l'id — SEULEMENT si plus aucun élément du document ne le
   * porte, même garde que `TransformerMixin.disconnectedCallback` (#893).
   *
   * Le gabarit d'un `dsfr-data-display` peut porter une source par ligne (`id`
   * et `data`/`url` interpolés) : à chaque émission de la source répétée,
   * l'`innerHTML` est réécrit et le navigateur connecte les NOUVELLES instances
   * avant de déconnecter les anciennes. Purger sans regarder vidait le cache que
   * la nouvelle instance homonyme venait de remplir.
   */
  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener('online', this._onOnline);
    this._cleanup();
    if (this.id && !document.getElementById(this.id)) {
      clearDataCache(this.id);
      clearDataMeta(this.id);
    }
  }

  willUpdate(changedProperties: Map<string, unknown>) {
    super.willUpdate(changedProperties);

    // Mode inline data : pas de fetch, dispatch direct
    if (changedProperties.has('data') && this.data) {
      this._dispatchInlineData();
      return;
    }

    // Detect changes that should trigger a re-fetch
    const urlModeChanged =
      changedProperties.has('url') ||
      changedProperties.has('params') ||
      changedProperties.has('transform') ||
      changedProperties.has('apiKeyRef') ||
      changedProperties.has('method') ||
      changedProperties.has('useProxy');
    const adapterModeChanged =
      changedProperties.has('apiType') ||
      changedProperties.has('baseUrl') ||
      changedProperties.has('datasetId') ||
      changedProperties.has('resource') ||
      changedProperties.has('where') ||
      changedProperties.has('select') ||
      changedProperties.has('groupBy') ||
      changedProperties.has('aggregate') ||
      changedProperties.has('orderBy') ||
      changedProperties.has('fetchMode') ||
      changedProperties.has('limit');
    // Attributs communs aux deux modes, historiquement non cables au
    // refetch (#288) — headers a le meme role qu'api-key-ref qui refetchait
    const sharedChanged =
      changedProperties.has('pageSize') ||
      changedProperties.has('serverSide') ||
      changedProperties.has('headers') ||
      changedProperties.has('proxyUrl') ||
      changedProperties.has('relayUrl') ||
      changedProperties.has('requireWhere');

    if (urlModeChanged || adapterModeChanged || sharedChanged) {
      if (
        (this.paginate || this.serverSide) &&
        (changedProperties.has('url') ||
          changedProperties.has('params') ||
          adapterModeChanged ||
          sharedChanged)
      ) {
        this._currentPage = 1;
      }
      // Invalidate adapter cache on api-type change
      if (changedProperties.has('apiType')) {
        this._adapter = null;
      }
      this._scheduleFetch();
    }

    if (changedProperties.has('refresh')) {
      this._setupRefresh();
    }

    if (
      changedProperties.has('paginate') ||
      changedProperties.has('pageSize') ||
      changedProperties.has('serverSide') ||
      changedProperties.has('apiType')
    ) {
      this._setupCommandListener();
    }
  }

  // --- Public API ---

  /** Returns the adapter for this source (if in adapter mode) */
  public getAdapter(): ApiAdapter | null {
    if (!this._isAdapterMode()) return null;
    if (!this._adapter) {
      this._adapter = getAdapter(this.apiType);
    }
    return this._adapter;
  }

  /**
   * Returns the effective WHERE clause (static + all dynamic overlays merged).
   * `excludeKey` : un whereKey, ou une liste de whereKeys a ignorer (#678 —
   * une facette en mode `context` emet un whereKey PAR champ et doit les
   * exclure tous du where de base de sa cascade).
   */
  public getEffectiveWhere(excludeKey?: string | string[]): string {
    const excluded = new Set(
      Array.isArray(excludeKey) ? excludeKey : excludeKey !== undefined ? [excludeKey] : []
    );
    const parts: string[] = [];
    if (this.where) parts.push(this.where);
    for (const [key, value] of this._whereOverlays) {
      if (!excluded.has(key) && value) parts.push(value);
    }
    return joinWhere(this.getAdapter(), parts);
  }

  /**
   * Relance le chargement à l'identique (mêmes filtres, même page). C'est ce
   * que fait « Réessayer » (#1203), par la commande `{ reload: true }`.
   */
  public reload() {
    if (this.data) {
      this._dispatchInlineData();
      return;
    }
    this._fetchData();
  }

  public getData(): unknown {
    return this._data;
  }

  public isLoading(): boolean {
    return this._loading;
  }

  public getError(): Error | null {
    return this._error;
  }

  // --- Private methods ---

  private _dispatchInlineData() {
    if (!this.id) {
      reportConfigError(this, 'dsfr-data-source', 'attribut "id" requis pour identifier la source');
      return;
    }
    try {
      const parsed = JSON.parse(this.data);
      this._data = parsed;
      dispatchDataLoaded(this.id, this._data);
    } catch (e) {
      this._error = new Error('Données inline invalides (JSON attendu)');
      dispatchDataError(this.id, this._error);
      console.error(`dsfr-data-source[${this.id}]: JSON invalide dans data`, e);
    }
  }

  /** Phrase de l'intégrateur jointe à un échec de chargement (#1203). */
  private _errorOptions(): { userMessage?: string } {
    return this.errorMessage ? { userMessage: this.errorMessage } : {};
  }

  private _isAdapterMode(): boolean {
    // `generic` sans `url` mais avec `base-url` : adaptateur generique
    return this.apiType !== GENERIC_API_TYPE || (!this.url && this.baseUrl !== '');
  }

  private _cleanup() {
    if (this._refreshInterval) {
      clearInterval(this._refreshInterval);
      this._refreshInterval = null;
    }
    if (this._abortController) {
      this._abortController.abort();
      this._abortController = null;
    }
    if (this._unsubscribeCommands) {
      this._unsubscribeCommands();
      this._unsubscribeCommands = null;
    }
    this._lazyObserver?.disconnect();
    this._lazyObserver = null;
  }

  private _setupRefresh() {
    if (this._refreshInterval) {
      clearInterval(this._refreshInterval);
      this._refreshInterval = null;
    }

    if (this.refresh > 0) {
      this._refreshInterval = window.setInterval(() => {
        this._fetchData();
      }, this.refresh * 1000);
    }
  }

  private _setupCommandListener() {
    if (this._unsubscribeCommands) {
      this._unsubscribeCommands();
      this._unsubscribeCommands = null;
    }

    if (!this.id) return;

    this._unsubscribeCommands = subscribeToSourceCommands(this.id, (cmd) => {
      // « Réessayer » (#1203) : servi dans TOUS les modes, URL brute comprise.
      if (cmd.reload) {
        this.reload();
        return;
      }

      // Les autres commandes ne concernent qu'une source paginée, serveur ou
      // en mode adaptateur — même garde qu'avant, évaluée à la réception.
      const needsListener = this.paginate || this.serverSide || this._isAdapterMode();
      if (!needsListener) return;

      let needsFetch = false;

      if (cmd.page !== undefined && cmd.page !== this._currentPage) {
        this._currentPage = cmd.page;
        needsFetch = true;
      }

      // Mode URL : les commandes adapter (where/orderBy/groupBy/aggregate)
      // ne sont pas applicables — _buildUrl ne sait pas les serialiser pour
      // une API arbitraire. Les accepter stockait un overlay jamais utilise
      // et refetchait a URL identique : filtre silencieusement perdu (#288).
      // Refus EXPLICITE (warn-once) ; la pagination querystring reste servie.
      const hasAdapterCommand =
        cmd.where !== undefined ||
        cmd.orderBy !== undefined ||
        cmd.groupBy !== undefined ||
        cmd.aggregate !== undefined;
      if (hasAdapterCommand && !this._isAdapterMode()) {
        if (!this._urlModeCommandWarned) {
          this._urlModeCommandWarned = true;
          console.warn(
            `dsfr-data-source[${this.id}]: commandes where/orderBy/groupBy/aggregate ignorees en mode URL — ` +
              `utilisez un api-type (${serverApiTypes()}) pour les filtres serveur (#288)`
          );
        }
        if (needsFetch) {
          this._scheduleFetch();
        } else if (this._data !== null && !this._fetchScheduled && !this._loading) {
          // Le contrat « une commande produit toujours une emission » (#276)
          // tient aussi pour une commande refusee : l'emetteur attend une
          // reponse, le cache courant EST la reponse (rien n'a change)
          this._scheduleReemit();
        }
        return;
      }

      if (cmd.where !== undefined) {
        const key = cmd.whereKey || '__default';
        const previous = this._whereOverlays.get(key);
        // Dedup : une commande where identique ne refetche pas (#275) —
        // les re-negociations de dsfr-data-query renvoient le meme where
        if (cmd.where && cmd.where !== previous) {
          this._whereOverlays.set(key, cmd.where);
          // Reset to page 1 when filters change
          this._currentPage = 1;
          needsFetch = true;
        } else if (!cmd.where && previous !== undefined) {
          this._whereOverlays.delete(key);
          this._currentPage = 1;
          needsFetch = true;
        }
      }

      if (cmd.orderBy !== undefined && cmd.orderBy !== this._orderByOverlay) {
        this._orderByOverlay = cmd.orderBy;
        needsFetch = true;
      }

      if (cmd.groupBy !== undefined && cmd.groupBy !== this._groupByOverlay) {
        this._groupByOverlay = cmd.groupBy;
        needsFetch = true;
      }

      if (cmd.aggregate !== undefined && cmd.aggregate !== this._aggregateOverlay) {
        this._aggregateOverlay = cmd.aggregate;
        needsFetch = true;
      }

      if (needsFetch) {
        this._scheduleFetch();
      } else if (this._data !== null && !this._fetchScheduled && !this._loading) {
        // Commande entierement dedupliquee : re-emettre le cache pour qu'un
        // transformateur qui attend une emission post-commande ne gele pas
        // (#276). Contrat : une commande produit TOUJOURS une emission.
        // Async (macrotask) pour laisser l'appelant s'abonner apres sa
        // commande ; coalesce si plusieurs commandes no-op arrivent.
        this._scheduleReemit();
      }
    });
  }

  /** Re-emission asynchrone du cache (commande no-op, #276) */
  private _scheduleReemit() {
    if (this._reemitScheduled) return;
    this._reemitScheduled = true;
    setTimeout(() => {
      this._reemitScheduled = false;
      // Un fetch a pu etre demande entre-temps : son emission suffira
      if (!this._fetchScheduled && !this._loading && this._data !== null) {
        dispatchDataLoaded(this.id, this._data);
      }
    }, 0);
  }

  /**
   * Un filtre utilisateur est-il posé (#690) ? Seuls les overlays reçus par
   * commande comptent — le `where` statique fait partie de la définition de
   * la source, pas du geste de l'utilisateur.
   */
  private _hasReceivedWhere(): boolean {
    for (const value of this._whereOverlays.values()) {
      if (value) return true;
    }
    return false;
  }

  /**
   * Entrée (ou retour) en attente : rien n'est chargé — filtre manquant
   * (#690) ou personne ne regarde encore (`lazy`, #931).
   */
  private _enterIdle(reason: DataIdleEvent['reason'] = 'require-where') {
    // Piège de configuration : en mode URL, les commandes where sont
    // refusées (#288) — aucun filtre ne pourra jamais lever l'attente, la
    // source resterait muette pour toujours. Le dire une fois. L'attente de
    // `lazy` n'est pas concernée : elle se lève au défilement, pas par un
    // filtre, et vaut en mode URL comme en mode adaptateur.
    if (reason === 'require-where' && !this._isAdapterMode() && !this._requireWhereModeWarned) {
      this._requireWhereModeWarned = true;
      console.warn(
        `dsfr-data-source[${this.id}]: require-where est sans issue en mode URL — ` +
          `les commandes where y sont refusées (#288). Utilisez un api-type ` +
          `(${serverApiTypes()}) pour que les filtres atteignent la source.`
      );
    }

    if (this._abortController) {
      this._abortController.abort();
      this._abortController = null;
    }
    this._data = null;
    this._error = null;
    this._loading = false;
    if (this.id) dispatchDataIdle(this.id, reason);
  }

  private async _fetchData() {
    // Garde AVANT toute construction de requête (#690) : ni fetch, ni
    // validation d'adapter, ni `dsfr-data-loading` — l'aval doit voir un
    // état d'attente, pas un chargement qui n'arrive jamais.
    if (this.requireWhere && !this._hasReceivedWhere()) {
      this._enterIdle();
      return;
    }

    // Seconde porte (#931), après `require-where` : c'est le message
    // d'attente d'un filtre que l'utilisateur doit lire quand les deux sont
    // posés — l'attente de visibilité, elle, n'est jamais regardée.
    if (this._lazyGateClosed()) {
      this._enterIdle('lazy');
      return;
    }

    if (this._isAdapterMode()) {
      return this._fetchViaAdapter();
    }
    return this._fetchViaUrl();
  }

  // --- lazy : différer jusqu'à ce que quelqu'un regarde (#931) ---

  /**
   * La porte de `lazy` est-elle fermée ? Vrai = ne rien charger pour
   * l'instant ; l'observateur rappellera `_scheduleFetch` le moment venu.
   *
   * Toutes les sorties « faux » sont des sorties SÛRES : en cas de doute, on
   * charge. Une source qui ne partirait jamais est une page cassée, un
   * chargement de trop n'est que le comportement d'avant l'attribut.
   */
  private _lazyGateClosed(): boolean {
    if (!this.lazy || this._lazySeen) return false;

    // Pas d'IntersectionObserver (vieux navigateur, environnement de test) :
    // rien à observer, on charge (critère d'acceptation de #931).
    if (typeof IntersectionObserver === 'undefined') {
      this._lazySeen = true;
      return false;
    }

    // Déjà armé : on attend la visibilité, sans re-résoudre les cibles.
    if (this._lazyObserver) return true;

    const targets = this._lazyTargets();
    if (targets.length > 0) {
      this._lazyObserver = new IntersectionObserver(
        (entries) => {
          if (!entries.some((entry) => entry.isIntersecting)) return;
          this._lazySeen = true;
          this._lazyObserver?.disconnect();
          this._lazyObserver = null;
          this._scheduleFetch();
        },
        // Même marge que `dsfr-data-map` et que le `lazy` de
        // `dsfr-data-repeat` : la donnée est demandée avant d'être vue.
        { rootMargin: '200px 0px' }
      );
      for (const target of targets) this._lazyObserver.observe(target);
      return true;
    }

    // Aucune cible — mais la page est peut-être encore en cours d'analyse :
    // une source déclarée en tête de document n'a pas encore de
    // consommateurs dans le DOM. Réessayer une fois, au DOM complet.
    if (document.readyState === 'loading') {
      if (!this._lazyWaitingDom) {
        this._lazyWaitingDom = true;
        document.addEventListener(
          'DOMContentLoaded',
          () => {
            this._lazyWaitingDom = false;
            if (this.isConnected) this._scheduleFetch();
          },
          { once: true }
        );
      }
      return true;
    }

    console.warn(
      `dsfr-data-source[${this.id}]: lazy est sans cible — ` +
        (this.lazyTarget
          ? `le sélecteur lazy-target="${this.lazyTarget}" ne désigne aucun élément de la page. `
          : `aucun afficheur (chart, list, kpi, display, podium, a11y, repeat) ne consomme cette source, ` +
            `en direct ou à travers un transformateur. `) +
        `La source charge immédiatement, comme sans l'attribut (#931).`
    );
    this._lazySeen = true;
    return false;
  }

  /** Éléments dont la visibilité ouvre la porte : `lazy-target`, sinon les feuilles aval. */
  private _lazyTargets(): Element[] {
    if (!this.lazyTarget.trim()) return visibleConsumers(this.id);
    try {
      return Array.from(document.querySelectorAll(this.lazyTarget.trim()));
    } catch {
      console.warn(
        `dsfr-data-source[${this.id}]: lazy-target="${this.lazyTarget}" n'est pas un ` +
          `sélecteur CSS valide. La source charge immédiatement (#931).`
      );
      return [];
    }
  }

  /**
   * Coalesce fetches: defer to the next macrotask so concurrent willUpdates
   * (from queries delegating server-side ops to this source) get to register
   * their overlays before the first fetch runs. Without this, 3 queries on
   * the same Grist source each trigger a command → 3 refetches, the first 2
   * aborted (visible as NS_BINDING_ABORTED in Firefox).
   */
  private _scheduleFetch() {
    if (this._fetchScheduled) return;
    this._fetchScheduled = true;
    setTimeout(() => {
      this._fetchScheduled = false;
      this._fetchData();
    }, 0);
  }

  // --- URL mode (legacy, unchanged behavior) ---

  private async _fetchViaUrl() {
    if (!this.url) return;

    if (!this.id) {
      reportConfigError(this, 'dsfr-data-source', 'attribut "id" requis pour identifier la source');
      return;
    }

    if (this._abortController) {
      this._abortController.abort();
    }
    this._abortController = new AbortController();
    const generation = ++this._fetchGeneration;

    this._loading = true;
    this._error = null;
    dispatchDataLoading(this.id);

    // Hoistee : le catch en a besoin pour nommer l'URL reellement appelee (#598)
    let attemptedUrl = '';

    // Le fournisseur est detecte UNE fois depuis l'URL (#1136) : il decide des
    // en-tetes d'authentification et de l'aplatissement des lignes, par sa
    // ProviderConfig — jamais par un test de forme dans le composant.
    const provider = detectProvider(this.url);

    try {
      const rawUrl = this._buildUrl();
      // Relais (`relay-url`, ADR-155) si R1 à R5 tiennent, sinon le chemin
      // actuel — exactement `getProxiedUrl(rawUrl, this.proxyUrl)`.
      const transportOptions = { proxyUrl: this.proxyUrl, relayUrl: this.relayUrl };
      const transport = resolveDataTransport(rawUrl, transportOptions, this.method);
      this._warnUnrelayedProxy(rawUrl, false, transport.relayed);
      this._warnRelayDropsHeaders(transport.relayed);
      let url = transport.url;
      const options = this._buildFetchOptions(provider);

      // If use-proxy is set and URL was not already proxied by getProxiedUrl(),
      // route through the generic CORS proxy
      if (!transport.relayed && this.useProxy && url === rawUrl) {
        const proxy = buildCorsProxyRequest(
          url,
          options.headers as Record<string, string>,
          this.proxyUrl
        );
        url = proxy.url;
        options.headers = proxy.headers;
      }

      attemptedUrl = url;

      // Hors relais : `fetch(url, init)` tel quel. Relayée : sans en-tête,
      // `credentials: 'omit'`, et un 503 du relais est réessayé (borné).
      const init: RequestInit = { ...options, signal: this._abortController.signal };
      const response = transport.relayed
        ? await transportFetch(url, init, transportOptions)
        : await fetch(url, init);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let json: any;
      try {
        json = await response.json();
      } catch {
        const ct = response.headers?.get?.('content-type') || 'unknown';
        throw new Error(
          `Reponse non-JSON (content-type: ${ct}) — vérifiez l'URL ou la configuration du proxy`
        );
      }

      const serverMeta = URL_PAGINATION.serverMeta;
      if (this.paginate && serverMeta && getByPath(json, parentPath(serverMeta.pagePath))) {
        setDataMeta(this.id, {
          page: numberOr(getByPath(json, serverMeta.pagePath), this._currentPage),
          pageSize: numberOr(getByPath(json, serverMeta.pageSizePath), this.pageSize),
          total: numberOr(getByPath(json, serverMeta.totalPath), 0),
          serverSide: true,
        });
      }

      const pagedRows =
        this.paginate && serverMeta?.dataPath ? getByPath(json, serverMeta.dataPath) : undefined;
      if (this.transform) {
        this._data = getByPath(json, this.transform);
      } else if (pagedRows) {
        this._data = pagedRows;
      } else {
        this._data = json;
      }

      // Enregistrements imbriques (#482, #1136) : la strategie est celle que
      // declare la ProviderConfig du fournisseur detecte (Grist : `fields`),
      // la meme que le chemin connexion — ARCHITECTURE §12, un seul aplatissement.
      // En mode URL, seul le contenu imbrique est garde : les cles d'enveloppe
      // (l'`id` Grist) ne deviennent pas des colonnes, comme avant #1136 et
      // comme l'adaptateur — une liste sans `fields` n'affiche pas d'`id` technique.
      if (Array.isArray(this._data)) {
        const flat = flattenProviderRecords(this._data, provider.response);
        const nestedKey = provider.response.requiresFlatten
          ? provider.response.nestedDataKey
          : null;
        this._data =
          nestedKey && !provider.response.flattenRecord
            ? stripEnvelopeKeys(this._data, flat, nestedKey)
            : flat;
      }

      dispatchDataLoaded(this.id, this._data);

      // Cache externe via hook (fire-and-forget, #307)
      if (this.cacheTtl > 0 && getCacheProvider()) {
        this._putCache(this._data).catch(() => {});
      }
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        return;
      }

      // Fallback offline via le hook de cache (#307)
      if (this.cacheTtl > 0 && getCacheProvider()) {
        const cached = await this._getCache();
        if (cached) {
          this._data = cached;
          dispatchDataLoaded(this.id, this._data);
          this.dispatchEvent(new CustomEvent('cache-fallback', { detail: { sourceId: this.id } }));
          return;
        }
      }

      this._error = error as Error;
      dispatchDataError(this.id, this._error, attemptedUrl || undefined, this._errorOptions());
      logFetchError(`dsfr-data-source[${this.id}]: Erreur de chargement`, error, attemptedUrl);
    } finally {
      // Un fetch remplace (abort concurrent) ne doit pas eteindre le
      // loading du fetch courant (#288)
      if (generation === this._fetchGeneration) {
        this._loading = false;
      }
    }
  }

  // --- Adapter mode (new) ---

  private async _fetchViaAdapter() {
    const resolved = this._resolveAdapterFetch();
    if (!resolved) return;
    const { adapter, params } = resolved;

    if (this._abortController) {
      this._abortController.abort();
    }
    this._abortController = new AbortController();
    const generation = ++this._fetchGeneration;

    this._loading = true;
    this._error = null;
    dispatchDataLoading(this.id);

    // Declare hors du try : le catch reconstitue l'URL appelee a partir de
    // l'overlay pour le diagnostic (#598). Reste assigne dans la branche
    // server-side, pour ne pas appeler getEffectiveWhere() en mode fetchAll.
    let overlay: ServerSideOverlay | undefined;

    try {
      let result;

      if (this.serverSide) {
        overlay = {
          page: this._currentPage,
          effectiveWhere: this.getEffectiveWhere(),
          orderBy: this._orderByOverlay || this.orderBy,
        };
        result = await adapter.fetchPage(params, overlay, this._abortController.signal);
        this._publishPageMeta(result);
      } else {
        result = await adapter.fetchAll(params, this._abortController.signal);
        this._publishFetchAllMeta(result);
      }

      this._data = result.data;
      dispatchDataLoaded(this.id, this._data);

      // Cache externe via hook (fire-and-forget, #307)
      if (this.cacheTtl > 0 && getCacheProvider()) {
        this._putCache(this._data).catch(() => {});
      }
    } catch (error) {
      await this._handleAdapterFetchError(error, adapter, params, overlay);
    } finally {
      if (generation === this._fetchGeneration) {
        this._loading = false;
      }
    }
  }

  /**
   * Prealables d'un fetch par adaptateur : identite de la source, adaptateur
   * connu, parametres valides, et les deux diagnostics NON bloquants
   * (fetch-mode/server-side #689, passe-plat `params` fautif #726).
   *
   * `null` : le fetch n'a pas lieu — l'erreur a deja ete signalee au DOM et
   * diffusee a l'aval.
   */
  private _resolveAdapterFetch(): { adapter: ApiAdapter; params: AdapterParams } | null {
    if (!this.id) {
      reportConfigError(this, 'dsfr-data-source', 'attribut "id" requis pour identifier la source');
      return null;
    }

    const adapter = this.getAdapter();
    if (!adapter) {
      // api-type inconnu (#283) : signal DOM + erreur aval — l'ancien throw
      // du registre remontait hors try via setTimeout (unhandled rejection,
      // consommateurs geles en loading)
      const message = `api-type "${this.apiType}" inconnu — types supportés : ${listAdapterTypes().join(', ')} (ou registerAdapter)`;
      reportConfigError(this, `dsfr-data-source[${this.id}]`, message);
      this._error = new Error(message);
      dispatchDataError(this.id, this._error);
      return null;
    }

    // Validate params
    const params = this.getAdapterParams();
    const validationError = adapter.validate(params);
    if (validationError) {
      // Erreur de config muette pour l'aval avant #283 (console.warn seul)
      reportConfigError(this, `dsfr-data-source[${this.id}]`, validationError);
      this._error = new Error(validationError);
      dispatchDataError(this.id, this._error);
      return null;
    }

    clearConfigError(this);

    // Configuration contradictoire, non bloquante (#689) : l'endpoint
    // d'export rend le jeu entier, la pagination serveur demande une page.
    // Le chargement continue sur le chemin pagine (getAdapterParams neutralise
    // deja fetchMode) ; l'attribut de diagnostic nomme la cause.
    if (this.fetchMode === 'export' && this.serverSide) {
      reportConfigError(
        this,
        `dsfr-data-source[${this.id}]`,
        'fetch-mode="export" est ignoré avec server-side : la pagination serveur reste sur l\'endpoint paginé'
      );
    }

    // Passe-plat `params` fautif, non bloquant (#726) : la clé réservée ou le
    // JSON invalide est écarté, le reste part quand même. Sans ce message, un
    // where posé dans `params` disparaissait sans un mot.
    const extraParamsError = this._parseExtraParams().error;
    if (extraParamsError) {
      reportConfigError(this, `dsfr-data-source[${this.id}]`, extraParamsError);
    }

    const target = this._adapterTargetUrl(adapter, params);
    const relayed = target !== '' && resolveDataTransport(target, params).relayed;
    this._warnUnrelayedProxy(target, true, relayed);
    this._warnRelayDropsHeaders(relayed);

    return { adapter, params };
  }

  /** URL que l'adaptateur appellerait, AVANT tout proxy ; `''` s'il ne sait pas la construire. */
  private _adapterTargetUrl(adapter: ApiAdapter, params: AdapterParams): string {
    try {
      return adapter.buildUrl(params);
    } catch {
      return '';
    }
  }

  /**
   * `proxy-url` / `use-proxy` posés sur un hôte que le proxy ne relaie pas
   * (AM-114 du banc d'essai, #1232) : la requête part en direct, et rien ne
   * le disait. Deux cas, un seul avertissement par source :
   * - mode adaptateur : `getProxiedUrl` ne réécrit que les hôtes connus, et
   *   `use-proxy` n'y est pas lu du tout — un portail Opendatasoft est donc
   *   appelé en direct quel que soit l'attribut ;
   * - mode URL : `proxy-url` SANS `use-proxy` ne réécrit que ces mêmes hôtes.
   *
   * Une URL relative ou de même origine n'a rien à relayer : pas un mot.
   * `console.warn` seul, comme les autres avertissements non bloquants de la
   * source — le journal console (#994) le porte au volet Diagnostic.
   *
   * Depuis le relais cachable (ADR-155), l'avertissement nomme `relay-url` :
   * c'est la voie pour faire passer un portail Opendatasoft par le domaine du
   * site. Une requête qui part au relais (`relayed`) n'est pas « en direct » :
   * pas d'avertissement.
   */
  private _warnUnrelayedProxy(rawUrl: string, adapterMode: boolean, relayed = false): void {
    if (this._unrelayedProxyWarned || relayed) return;
    const viaProxyUrl = !!this.proxyUrl;
    // En mode URL, `use-proxy` passe par le relais générique : tout hôte est relayé.
    if (adapterMode ? !(viaProxyUrl || this.useProxy) : !viaProxyUrl || this.useProxy) return;

    let target: URL;
    try {
      target = new URL(rawUrl);
    } catch {
      return;
    }
    if (!/^https?:$/.test(target.protocol)) return;
    if (typeof window !== 'undefined' && target.origin === window.location.origin) return;
    if (isRelayedHost(target.href)) return;

    this._unrelayedProxyWarned = true;
    const attribut = viaProxyUrl ? `proxy-url="${this.proxyUrl}"` : 'use-proxy';
    const suite = adapterMode
      ? `En mode adaptateur (api-type="${this.apiType}"), la requête part en direct vers cet hôte.`
      : `Sans use-proxy, la requête part en direct vers cet hôte ; use-proxy la fait passer par le ` +
        `relais générique (/cors-proxy).`;
    console.warn(
      `dsfr-data-source[${this.id}]: ${attribut} est sans effet — l'hôte "${target.hostname}" ` +
        `n'est pas relayé par le proxy. Seuls ${RELAYED_HOSTS.join(', ')} passent par un ` +
        `endpoint dédié. ${suite} Pour faire passer cet hôte par le domaine du site, poser ` +
        `relay-url (relais cachable fourni par le site hôte, contrat docs/RELAY.md). (#1232)`
    );
  }

  /**
   * `headers` ou `api-key-ref` posés sur une source dont la requête part au
   * relais (ADR-155 §4) : aucun en-tête n'est envoyé — la clé appartient au
   * relais, qui l'ajoute par hôte depuis sa configuration, et une requête à
   * en-tête ne serait ni « simple » au sens CORS ni cachable. Dit une fois
   * par source ; hors relais, ces attributs restent actifs.
   */
  private _warnRelayDropsHeaders(relayed: boolean): void {
    if (!relayed || this._relayHeadersWarned) return;
    const poses = [this.headers ? 'headers' : '', this.apiKeyRef ? 'api-key-ref' : ''].filter(
      Boolean
    );
    if (poses.length === 0) return;
    this._relayHeadersWarned = true;
    console.warn(
      `dsfr-data-source[${this.id}]: ${poses.join(' et ')} ${poses.length > 1 ? 'ne sont pas envoyés' : "n'est pas envoyé"} ` +
        `— la requête passe par le relais "${resolveRelayUrl(this.relayUrl)}", qui ne reçoit ` +
        `aucun en-tête du navigateur. Si l'API exige une clé, c'est le relais qui l'ajoute, ` +
        `depuis sa configuration (docs/RELAY.md). (#1232)`
    );
  }

  /**
   * Pagination serveur : une page a la fois. `serverSide:true` est le signal
   * d'activation de la pagination serveur en aval (contrat #270).
   */
  private _publishPageMeta(result: FetchResult): void {
    setDataMeta(this.id, {
      page: this._currentPage,
      pageSize: this.pageSize,
      total: result.totalCount,
      serverSide: true,
      needsClientProcessing: result.needsClientProcessing,
      ...(result.caveats?.length ? { caveats: result.caveats } : {}),
    });
  }

  /**
   * Fetch complet (auto-pagination). `serverSide:false` — l'aval ne doit PAS
   * activer sa pagination serveur sur un fetchAll (pageSize 0 produisait des
   * totaux de pages Infinity, #270).
   *
   * `truncated` (#658) : le jeu livre est un sous-ensemble — total connu et
   * superieur aux lignes recues (plafond max-records ou limit), ou plafond
   * atteint sur une page pleine quand le total est inconnu (group_by ODS,
   * #641 — signal pose par l'adapter). Le warn console existait deja ; ce
   * champ rend la troncature lisible par le volet Diagnostic.
   */
  private _publishFetchAllMeta(result: FetchResult): void {
    const received = Array.isArray(result.data) ? result.data.length : 0;
    const truncated =
      result.truncated === true ||
      (typeof result.totalCount === 'number' && result.totalCount > received);
    setDataMeta(this.id, {
      page: 1,
      pageSize: 0,
      total: result.totalCount,
      serverSide: false,
      needsClientProcessing: result.needsClientProcessing,
      ...(truncated ? { truncated: true } : {}),
      // Reserves de l'adapter (#1233) : lues par le volet Diagnostic
      ...(result.caveats?.length ? { caveats: result.caveats } : {}),
    });
  }

  /**
   * Echec d'un fetch par adaptateur : abort silencieux, repli offline par le
   * hook de cache (#307), sinon erreur diffusee avec l'URL de diagnostic
   * (#598).
   */
  private async _handleAdapterFetchError(
    error: unknown,
    adapter: ApiAdapter,
    params: AdapterParams,
    overlay: ServerSideOverlay | undefined
  ): Promise<void> {
    if ((error as Error).name === 'AbortError') {
      return;
    }

    if (this.cacheTtl > 0 && getCacheProvider()) {
      const cached = await this._getCache();
      if (cached) {
        this._data = cached;
        dispatchDataLoaded(this.id, this._data);
        this.dispatchEvent(new CustomEvent('cache-fallback', { detail: { sourceId: this.id } }));
        return;
      }
    }

    this._error = error as Error;
    const diagnosticUrl = this._diagnosticUrl(adapter, params, overlay);
    dispatchDataError(this.id, this._error, diagnosticUrl, this._errorOptions());
    logFetchError(`dsfr-data-source[${this.id}]: Erreur de chargement`, error, diagnosticUrl);
  }

  /**
   * URL construite par l'adapter pour ce fetch, a seule fin de diagnostic
   * (#598). En mode fetchAll l'adapter pagine ensuite lui-meme : l'URL rendue
   * est celle de la première requête, sans les surcharges de page.
   *
   * Avec un relais (`relay-url`, ADR-155), c'est l'URL DU RELAIS qui est
   * rendue : « Détails techniques » montre l'adresse réellement appelée,
   * celle que l'intégrateur retrouve dans les journaux de son site. Sans
   * relais, l'URL cible, comme avant.
   *
   * Purement informative — ne doit jamais faire echouer le log d'erreur.
   */
  private _diagnosticUrl(
    adapter: ApiAdapter,
    params: AdapterParams,
    overlay?: ServerSideOverlay
  ): string | undefined {
    try {
      const target = this._diagnosticTargetUrl(adapter, params, overlay);
      if (!target) return target;
      const transport = resolveDataTransport(target, params);
      return transport.relayed ? transport.url : target;
    } catch {
      return undefined;
    }
  }

  /** L'URL cible du fetch, avant tout transport (voir `_diagnosticUrl`). */
  private _diagnosticTargetUrl(
    adapter: ApiAdapter,
    params: AdapterParams,
    overlay?: ServerSideOverlay
  ): string | undefined {
    if (overlay) return adapter.buildServerSideUrl(params, overlay);
    // Mode export (#689) : l'URL reellement appelee n'est pas celle de
    // l'endpoint pagine — un repli sur /records a deja son propre warn
    const exportUrl = params.fetchMode === 'export' ? adapter.buildExportUrl?.(params) : undefined;
    if (exportUrl) return exportUrl;
    return adapter.buildUrl(params);
  }

  /**
   * Paramètres adapter resolus, headers effectifs inclus (headers +
   * api-key-ref). Consomme par les composants aval via SourceElement (#274).
   */
  public getAdapterParams(): AdapterParams {
    let parsedHeaders: Record<string, string> | undefined;
    if (this.headers) {
      try {
        parsedHeaders = JSON.parse(this.headers);
      } catch {
        /* ignore */
      }
    }

    // api-key-ref takes precedence over explicit Authorization header
    const keyHeaders = this._resolveApiKeyHeaders();
    if (keyHeaders) {
      parsedHeaders = { ...(parsedHeaders || {}), ...keyHeaders };
    }

    return {
      baseUrl: this.baseUrl,
      datasetId: this.datasetId,
      resource: this.resource,
      select: this.select,
      where: this.getEffectiveWhere(),
      filter: '',
      groupBy: this._groupByOverlay || this.groupBy,
      aggregate: this._aggregateOverlay || this.aggregate,
      orderBy: this._orderByOverlay || this.orderBy,
      limit: this.limit,
      maxRecords: this.maxRecords,
      // `server-side` ignore fetch-mode (#689) : la pagination page par page
      // n'a pas de sens sur un endpoint d'export, qui rend tout d'un coup
      fetchMode: this.fetchMode === 'export' && !this.serverSide ? 'export' : 'records',
      transform: this.transform,
      pageSize: this.pageSize,
      headers: parsedHeaders,
      proxyUrl: this.proxyUrl || undefined,
      // Relais cachable (ADR-155) : la clé n'existe que si l'attribut est posé
      ...(this.relayUrl ? { relayUrl: this.relayUrl } : {}),
      extraParams: this._parseExtraParams().extra,
    };
  }

  /**
   * Lit l'attribut `params` pour le mode adaptateur (#726) : rend les paires
   * transmissibles telles quelles a l'adaptateur, et le message a signaler
   * quand la configuration est fautive (JSON invalide, cle reservee). Pur :
   * `getAdapterParams()` n'en prend que la valeur, `_fetchViaAdapter()` en
   * signale l'erreur — un `reportConfigError` pose ici serait efface par le
   * `clearConfigError` du chemin de chargement.
   */
  private _parseExtraParams(): { extra?: Record<string, string>; error?: string } {
    if (!this.params) return {};

    let parsed: unknown;
    try {
      parsed = JSON.parse(this.params);
    } catch {
      return { error: 'attribut "params" invalide : un objet JSON est attendu' };
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { error: 'attribut "params" invalide : un objet JSON est attendu' };
    }

    const extra: Record<string, string> = {};
    const reserved: string[] = [];
    const reservedKeys = this.getAdapter()?.reservedParamKeys;
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (isReservedParamKey(reservedKeys, key)) {
        reserved.push(key);
        continue;
      }
      if (value === null || value === undefined) continue;
      extra[key] = String(value);
    }

    const error =
      reserved.length > 0
        ? `params : ${reserved.length > 1 ? 'les clés' : 'la clé'} ${reserved
            .map((k) => `"${k}"`)
            .join(', ')} ${reserved.length > 1 ? 'sont réservées' : 'est réservée'} — ` +
          'la bibliothèque construit cette clause depuis les attributs du composant ' +
          '(select, where, group-by, order-by, limit) ; valeur ignorée'
        : undefined;

    return { extra: Object.keys(extra).length > 0 ? extra : undefined, error };
  }

  // --- API key registry resolution ---

  private _resolveApiKeyHeaders(): Record<string, string> | null {
    if (!this.apiKeyRef) return null;
    const registry = window.DSFR_DATA_KEYS;
    if (!registry || typeof registry !== 'object') {
      console.warn(
        `dsfr-data-source[${this.id}]: window.DSFR_DATA_KEYS non défini, api-key-ref="${this.apiKeyRef}" ignore`
      );
      return null;
    }
    const value = registry[this.apiKeyRef];
    if (!value || typeof value !== 'string') {
      console.warn(
        `dsfr-data-source[${this.id}]: clé "${this.apiKeyRef}" introuvable dans window.DSFR_DATA_KEYS`
      );
      return null;
    }
    return { Authorization: value };
  }

  // --- URL building (legacy mode) ---

  private _buildUrl(): string {
    const base = window.location.origin !== 'null' ? window.location.origin : undefined;
    const url = new URL(this.url, base);

    if (this.params && this.method === 'GET') {
      try {
        const params = JSON.parse(this.params);
        Object.entries(params).forEach(([key, value]) => {
          url.searchParams.set(key, String(value));
        });
      } catch (e) {
        console.warn('dsfr-data-source: params invalides (JSON attendu)', e);
      }
    }

    const { page, pageSize } = URL_PAGINATION.params;
    if (this.paginate && page && pageSize) {
      url.searchParams.set(page, String(this._currentPage));
      url.searchParams.set(pageSize, String(this.pageSize));
    }

    return url.toString();
  }

  private _buildFetchOptions(provider: ProviderConfig = detectProvider(this.url)): RequestInit {
    const options: RequestInit = {
      method: this.method,
    };

    let headers: Record<string, string> = {};

    if (this.headers) {
      try {
        headers = JSON.parse(this.headers);
      } catch (e) {
        console.warn('dsfr-data-source: headers invalides (JSON attendu)', e);
      }
    }

    // api-key-ref takes precedence over explicit Authorization header
    const keyHeaders = this._resolveApiKeyHeaders();
    if (keyHeaders) {
      headers = { ...headers, ...keyHeaders };
    }

    // `apikey` nu → en-tete d'authentification attendu par le fournisseur
    // detecte depuis l'URL (#655) ; no-op quand sa config n'en demande pas
    if (this.url && Object.keys(headers).length > 0) {
      headers = normalizeProviderAuthHeaders(this.url, headers, provider).headers;
    }

    if (this.method === 'POST' && this.params) {
      headers = { 'Content-Type': 'application/json', ...headers };
      options.body = this.params;
    }

    if (Object.keys(headers).length > 0) {
      options.headers = headers;
    }

    return options;
  }

  // --- Server cache (DB mode) ---

  /**
   * Fingerprint de la requête courante (#307) : la cle de cache inclut
   * URL/params/where/page... — l'ancienne cle (id seul) pouvait resservir
   * la page 3 filtree d'hier pour une requête page 1 sans filtre.
   */
  private _cacheFingerprint(): unknown {
    return {
      url: this.url,
      method: this.method,
      params: this.params,
      transform: this.transform,
      apiType: this.apiType,
      baseUrl: this.baseUrl,
      datasetId: this.datasetId,
      resource: this.resource,
      where: this.getEffectiveWhere(),
      select: this.select,
      groupBy: this.groupBy,
      aggregate: this.aggregate,
      orderBy: this._orderByOverlay ?? this.orderBy,
      page: this._currentPage,
      pageSize: this.pageSize,
      serverSide: this.serverSide,
      limit: this.limit,
    };
  }

  /** Ecrit dans le cache externe si un provider est enregistre (#307). */
  private _putCache(data: unknown): Promise<void> {
    const provider = getCacheProvider();
    if (!provider) return Promise.resolve();
    return provider.put(cacheKeyFor(this.id, this._cacheFingerprint()), data, this.cacheTtl);
  }

  /** Lit le cache externe si un provider est enregistre (#307). */
  private async _getCache(): Promise<unknown | null> {
    const provider = getCacheProvider();
    if (!provider) return null;
    try {
      return await provider.get(cacheKeyFor(this.id, this._cacheFingerprint()));
    } catch {
      return null;
    }
  }
}

declare global {
  interface Window {
    DSFR_DATA_KEYS?: Record<string, string>;
  }
  interface HTMLElementTagNameMap {
    'dsfr-data-source': DsfrDataSource;
  }
}
