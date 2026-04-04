/**
 * SourceElement — interface partagée pour les composants qui exposent
 * getAdapter() et getEffectiveWhere() (dsfr-data-source, dsfr-data-query, dsfr-data-normalize).
 *
 * Élimine les `as any` casts dans les composants consommateurs
 * (dsfr-data-facets, dsfr-data-search, dsfr-data-query, dsfr-data-map-layer, etc.).
 */
import type { ApiAdapter } from '../adapters/api-adapter.js';

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
}
