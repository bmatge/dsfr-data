/**
 * SourceElement — interface partagée pour les composants qui exposent
 * getAdapter() et getEffectiveWhere() (dsfr-data-source, dsfr-data-query, dsfr-data-normalize).
 *
 * Élimine les `as any` casts dans les composants consommateurs
 * (dsfr-data-facets, dsfr-data-search, dsfr-data-query, dsfr-data-map-layer, etc.).
 */
import type { ApiAdapter, AdapterParams } from '../adapters/api-adapter.js';

export interface SourceElement extends HTMLElement {
  /** ID de la source amont (attribut `source`) */
  source?: string;

  /** Group-by configuration (attribut `group-by`) */
  groupBy?: string;

  /** Aggregation configuration (attribut `aggregate`) */
  aggregate?: string;

  /** Order-by configuration (attribut `order-by`) */
  orderBy?: string;

  /** Retourne l'adapter API associé */
  getAdapter(): ApiAdapter | null;

  /** Retourne la clause WHERE effective, avec fusion des commandes */
  getEffectiveWhere(excludeKey?: string): string;

  /**
   * Retourne les paramètres adapter résolus de la source amont — y compris
   * les headers effectifs (`headers` + `api-key-ref` résolu). Les
   * consommateurs (dsfr-data-facets…) NE DOIVENT PAS re-parser les attributs
   * DOM de la source : ils rateraient la résolution d'api-key-ref → 401 sur
   * les sources authentifiées (#274). Les transformateurs intermédiaires
   * délèguent vers leur amont (join : vers la source gauche).
   */
  getAdapterParams?(): AdapterParams | null;

  /**
   * True si ce composant (ou un transformateur en amont de lui) crée,
   * renomme ou supprime des colonnes par rapport au schéma de la source qui
   * fetch (#394) : unpivot (toujours), normalize avec rename/compute/
   * flatten/lowercase-keys. dsfr-data-query s'en sert pour NE PAS déléguer
   * ses opérations (order-by, group-by, where) au serveur : elles
   * s'expriment dans le schéma POST-transformation, inconnu de l'API
   * (Grist Records : 500 "unknown key"). Absent = schéma préservé.
   */
  transformsSchema?(): boolean;
}
