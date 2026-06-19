/**
 * Interface commune pour les adapters d'API.
 *
 * Chaque adapter encapsule la logique spécifique a une API :
 * construction d'URL, pagination, parsing de reponse, mapping d'operateurs.
 * Les adapters sont stateless — tout l'etat est passe via AdapterParams.
 */

import type { QueryAggregate } from '../components/dsfr-data-query.js';
import type { ProviderConfig } from '@dsfr-data/shared/lib';

/**
 * Declare ce qu'un adapter peut faire cote serveur.
 * Les composants en aval (dsfr-data-facets, dsfr-data-search, dsfr-data-list)
 * peuvent consulter ces capacites pour adapter leur comportement.
 */
export interface AdapterCapabilities {
  /** Peut fetcher des données depuis une API distante */
  serverFetch: boolean;
  /** Supporte les facettes serveur (endpoint dedie) */
  serverFacets: boolean;
  /** Supporte la recherche full-text serveur nativement */
  serverSearch: boolean;
  /** Supporte group-by + aggregation cote serveur */
  serverGroupBy: boolean;
  /** Supporte le tri cote serveur */
  serverOrderBy: boolean;
  /** Supporte le filtrage geographique server-side (in_bbox) */
  serverGeo: boolean;
  /** Format du where clause : 'odsql' ou 'colon' (field:op:value) */
  whereFormat: 'odsql' | 'colon';
}

/**
 * Parametres passes de dsfr-data-query a l'adapter.
 * L'adapter ne lit jamais les attributs DOM directement.
 */
export interface AdapterParams {
  baseUrl: string;
  datasetId: string;
  resource: string;
  select: string;
  where: string;
  filter: string;
  groupBy: string;
  aggregate: string;
  orderBy: string;
  limit: number;
  /**
   * Plafond de records du fetchAll (#233) — 0/absent = plafond par defaut
   * de l'adapter (garde-fou anti-surcharge). Ce n'est PAS une limite API :
   * l'operateur le releve explicitement en connaissance de cause
   * (requetes en boucle, poids memoire).
   */
  maxRecords?: number;
  transform: string;
  pageSize: number;
  /** Headers HTTP custom (ex: authentification, API key) */
  headers?: Record<string, string>;
  /**
   * Override du proxy CORS par source (attribut `proxy-url`, #340) —
   * prioritaire sur `window.DSFR_DATA_PROXY` et la config build-time.
   * Vide/absent = résolution proxy globale habituelle.
   */
  proxyUrl?: string;
}

/**
 * État overlay pour le mode server-side (page, where, orderBy dynamiques).
 */
export interface ServerSideOverlay {
  page: number;
  /** Where statique + dynamique fusionne */
  effectiveWhere: string;
  /** Overlay tri serveur (depuis datalist/sort) */
  orderBy: string;
}

/**
 * Resultat d'une operation de fetch (paginee ou page unique).
 *
 * CONTRAT (#270) :
 * - `totalCount` : total de lignes cote serveur. `undefined` quand le
 *   provider ne le connait pas (ex. Grist Records hors derniere page) —
 *   JAMAIS `-1` ni autre sentinelle.
 * - `needsClientProcessing` : true ssi des transformations demandees dans
 *   les params (group-by, aggregate, where avance, order-by) n'ont PAS ete
 *   appliquees par l'adapter — l'aval (dsfr-data-query) doit les
 *   (re)appliquer. False quand tout ce qui etait demande a ete traite,
 *   y compris quand rien n'etait demande.
 */
export interface FetchResult {
  data: unknown[];
  /** Total cote serveur ; undefined = inconnu (jamais -1) */
  totalCount?: number;
  /**
   * True ssi des transformations demandees (group-by, aggregate, where
   * avance, order-by) n'ont pas ete appliquees par l'adapter.
   */
  needsClientProcessing: boolean;
  /** JSON brut de la reponse (pour appliquer transform sur la bonne racine) */
  rawJson?: unknown;
}

/**
 * Resultat d'une requête de facettes serveur.
 */
export interface FacetResult {
  field: string;
  values: Array<{ value: string; count: number }>;
}

/**
 * Interface commune pour tous les adapters d'API.
 * Les adapters sont stateless : ils recoivent tout via les arguments
 * et retournent des structures de données pures. Pas d'acces DOM,
 * pas d'effets de bord.
 */
export interface ApiAdapter {
  /** Identifiant correspondant a la valeur de l'attribut api-type */
  readonly type: string;

  /** Declare les capacites de cet adapter */
  readonly capabilities: AdapterCapabilities;

  /**
   * Valide que les attributs requis sont presents.
   * Retourne un message d'erreur ou null si valide.
   */
  validate(params: AdapterParams): string | null;

  /**
   * Fetch toutes les données avec pagination automatique.
   * Utilise en mode non-server-side.
   */
  fetchAll(params: AdapterParams, signal: AbortSignal): Promise<FetchResult>;

  /**
   * Fetch une seule page en mode server-side.
   * Retourne data + totalCount pour la meta de pagination.
   */
  fetchPage(
    params: AdapterParams,
    overlay: ServerSideOverlay,
    signal: AbortSignal
  ): Promise<FetchResult>;

  /**
   * Construit une URL pour le mode fetch complet (non-server-side).
   * Expose pour les tests et le debug.
   */
  buildUrl(params: AdapterParams, limitOverride?: number, pageOrOffsetOverride?: number): string;

  /**
   * Construit une URL server-side pour une seule page.
   */
  buildServerSideUrl(params: AdapterParams, overlay: ServerSideOverlay): string;

  /**
   * Fetch les valeurs de facettes depuis l'API pour les champs donnes.
   * Retourne null si la capacite serverFacets est false.
   */
  fetchFacets?(
    params: Pick<AdapterParams, 'baseUrl' | 'datasetId' | 'headers' | 'proxyUrl'>,
    fields: string[],
    where: string,
    signal?: AbortSignal
  ): Promise<FacetResult[]>;

  /**
   * Indique si les champs donnes peuvent etre delegues cote serveur pour
   * group-by / aggregate / order-by.
   *
   * Certains providers encodent ces operations via une syntaxe a suffixe dans
   * la query string (Tabular : `colonne__groupby`, `colonne__sum`) qui ne
   * supporte pas les noms de colonnes contenant des espaces ou de la
   * ponctuation (ex. "Date - Journee gaziere"). Dans ce cas l'adapter retourne
   * false et dsfr-data-query retombe sur un traitement client-side (qui fetch
   * toutes les lignes brutes puis agrege localement — resultat identique).
   *
   * Non implemente = tous les champs sont delegables (comportement par defaut).
   */
  supportsServerFields?(fields: string[]): boolean;

  /**
   * Retourne le search template par défaut pour cette API.
   * Ex: ODS retourne 'search("{q}")'.
   */
  getDefaultSearchTemplate?(): string | null;

  /**
   * Parse l'expression d'agrégation en objets structures.
   * Partage entre le traitement client-side et la construction d'URL serveur.
   */
  parseAggregates?(aggExpr: string): QueryAggregate[];

  /**
   * Construit un WHERE clause a partir de selections de facettes.
   * Utilise par dsfr-data-facets pour générer les filtres dans la syntaxe du provider.
   */
  buildFacetWhere?(selections: Record<string, Set<string>>, excludeField?: string): string;

  /**
   * Retourne la config provider declarative associee a cet adapter.
   */
  getProviderConfig?(): ProviderConfig;
}

// --- Registre et factory (re-exported from adapter-registry) ---

export { getAdapter, registerAdapter } from './adapter-registry.js';
