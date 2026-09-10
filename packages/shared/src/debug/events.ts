/**
 * Vocabulaire du bus de données, vu depuis le collecteur (#604).
 *
 * Ces noms sont **dupliqués** depuis `DATA_EVENTS`
 * (`packages/core/src/utils/data-bridge.ts`) plutôt qu'importés : le
 * collecteur doit pouvoir tourner **sans la bibliothèque**, dans un script
 * autonome injecté sur une page tierce (#608). Inverser la dépendance
 * (shared → core) créerait un cycle, et importer core ferait entrer tout un
 * bundle dans un outil de diagnostic.
 *
 * Le garde-fou est un test d'alignement (`tests/debug/alignment.test.ts`),
 * dans l'esprit de `provider-config-alignment` et `attribute-convention` :
 * si un nom change côté core, le test casse ici.
 */

import type { JoinStats } from '../utils/join.js';
import type { PivotStats } from '../utils/pivot.js';

export const BUS_EVENTS = {
  LOADED: 'dsfr-data-loaded',
  ERROR: 'dsfr-data-error',
  LOADING: 'dsfr-data-loading',
  IDLE: 'dsfr-data-idle',
  SOURCE_COMMAND: 'dsfr-data-source-command',
} as const;

/** Métadonnées de pagination publiées par les sources — copie structurelle. */
export interface BusPaginationMeta {
  page: number;
  pageSize: number;
  total?: number;
  serverSide?: boolean;
  /** La source n'a pas su traiter group-by/aggregate côté serveur. */
  needsClientProcessing?: boolean;
  /**
   * Les lignes livrées sont un sous-ensemble du jeu (#658) : plafond
   * `max-records` d'une source, attribut `limit` d'un query.
   */
  truncated?: boolean;
  /** Taux d'appariement posé par un dsfr-data-join (#660). */
  join?: JoinStats;
  /** Colonnes générées et cellules vides posées par un dsfr-data-pivot (#255). */
  pivot?: PivotStats;
}

/** Commande remontante (pagination, recherche, tri, délégation). */
export interface BusSourceCommand {
  page?: number;
  where?: string;
  whereKey?: string;
  orderBy?: string;
  groupBy?: string;
  aggregate?: string;
  /** Id du composant émetteur (#603). */
  origin?: string;
}

export interface BusLoadedDetail {
  sourceId: string;
  data: unknown;
}

export interface BusErrorDetail {
  sourceId: string;
  error: Error;
  /** URL réellement appelée, proxy appliqué (#603). */
  attemptedUrl?: string;
}

export interface BusLoadingDetail {
  sourceId: string;
}

/**
 * Étape en attente d'un filtre (#690) : `require-where` posé, aucun filtre
 * reçu. Rien n'est parti, rien n'a échoué, aucune ligne n'a été produite —
 * les trois autres états mentiraient chacun à leur façon.
 */
export interface BusIdleDetail {
  sourceId: string;
  reason: 'require-where';
}

export type BusCommandDetail = BusSourceCommand & { sourceId: string };
