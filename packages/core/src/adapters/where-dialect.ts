/**
 * Dialecte WHERE d'un adaptateur (#1135) : traduction, jointure, échappement.
 *
 * Les composants écrivent leurs filtres dans la grammaire colon
 * (`champ:op:valeur`, clauses jointes par `, `) — la grammaire pivot. C'est
 * l'ADAPTATEUR qui sait la dire dans la langue de son API : il peut fournir
 * `translateWhere`, `joinWhere` et `escapeSearchTerm` (contrat `ApiAdapter`).
 * Ce module résout le dialecte d'un adaptateur : ses propres méthodes quand il
 * les a, sinon le dialecte par défaut de sa capacité `whereFormat` — ce qui
 * garde fonctionnel un adaptateur enregistré avant #1135 (`registerAdapter`).
 *
 * Les composants n'importent pas ce module : ils passent par
 * `utils/where.ts` (`translateWhere`, `joinWhere`, `escapeSearchTerm`), qui le
 * délègue ici. Aucun composant ne teste plus le dialecte lui-même (garde-fou
 * `tests/lib-provider-neutrality.test.ts`).
 */

import {
  escapeColonValue,
  filterToOdsql,
  odsqlCanExpress,
  WORD_START_OPERATOR,
} from '@dsfr-data/shared/lib';
import type { AdapterCapabilities, ApiAdapter } from './api-adapter.js';

/**
 * Les trois opérations d'un dialecte WHERE — nommées court pour ne pas se
 * confondre avec les méthodes optionnelles d'`ApiAdapter` qu'elles résolvent.
 */
export interface WhereDialect {
  /** Clause colon (grammaire des composants) → clause du dialecte. */
  translate(colonWhere: string): string;
  /** Jointure par ET de clauses DÉJÀ dans le dialecte (vides ignorées). */
  join(clauses: string[]): string;
  /** Échappe un terme libre (recherche) pour l'insérer dans une clause du dialecte. */
  escape(term: string): string;
}

/**
 * Ce qu'il faut d'un adaptateur pour résoudre son dialecte : ses méthodes
 * éventuelles et sa capacité `whereFormat`. Volontairement lâche — les
 * sources factices des tests, et un adaptateur tiers ancien, n'exposent que
 * `capabilities.whereFormat`.
 */
export type WhereDialectCarrier = Partial<
  Pick<
    ApiAdapter,
    | 'translateWhere'
    | 'joinWhere'
    | 'escapeSearchTerm'
    | 'supportsServerWhere'
    | 'supportsServerClause'
  >
> & {
  capabilities?: Partial<Pick<AdapterCapabilities, 'whereFormat'>>;
};

/** Dialecte colon : la grammaire pivot part telle quelle. */
export const COLON_WHERE_DIALECT: WhereDialect = {
  translate: (colonWhere) => colonWhere,
  join: (clauses) => clauses.join(', '),
  // `,` `:` `|` sont structurels : percent-encodés dans une valeur (#271)
  escape: (term) => escapeColonValue(term),
};

/**
 * Dialecte ODSQL : `filterToOdsql` (lib-safe, partagé avec l'export HTML),
 * clauses jointes par ` AND `, valeur libre entre guillemets — `\` puis `"`
 * échappés (l'ordre compte : sinon les `\"` ajoutés seraient ré-échappés).
 */
export const ODSQL_WHERE_DIALECT: WhereDialect = {
  translate: (colonWhere) => filterToOdsql(colonWhere),
  join: (clauses) => clauses.join(' AND '),
  escape: (term) => term.replace(/\\/g, '\\\\').replace(/"/g, '\\"'),
};

/**
 * Dialecte par défaut d'une capacité `whereFormat`. Un format inconnu (un
 * dialecte tiers nommé librement) ou absent retombe sur colon : sans
 * méthodes propres, l'adaptateur reçoit la grammaire pivot.
 */
export function defaultWhereDialect(format: string | undefined): WhereDialect {
  return format === 'odsql' ? ODSQL_WHERE_DIALECT : COLON_WHERE_DIALECT;
}

/**
 * Dialecte effectif d'un adaptateur (#1135) — SEUL point d'appel des
 * méthodes `translateWhere` / `joinWhere` / `escapeSearchTerm` : chacune est
 * prise sur l'adaptateur quand il la fournit, sinon sur le dialecte par
 * défaut de son `whereFormat`. `null` (source sans adaptateur) = colon.
 */
export function whereDialectOf(adapter: WhereDialectCarrier | null | undefined): WhereDialect {
  const fallback = defaultWhereDialect(adapter?.capabilities?.whereFormat);
  return {
    translate: (colonWhere) =>
      adapter?.translateWhere?.(colonWhere) ?? fallback.translate(colonWhere),
    join: (clauses) => adapter?.joinWhere?.(clauses) ?? fallback.join(clauses),
    escape: (term) => adapter?.escapeSearchTerm?.(term) ?? fallback.escape(term),
  };
}

/**
 * Une clause colon peut-elle partir à l'API de cet adaptateur EN RETENANT LES
 * MÊMES LIGNES que son calcul côté client (#1285, ADR-139) ?
 *
 * Deux étages :
 * 1. la SÉMANTIQUE — `supportsServerClause` de l'adaptateur : l'API
 *    calcule-t-elle cette clause comme le client ? Sans cette méthode, les
 *    douze opérateurs historiques partent et `wordstart` non (un adaptateur
 *    enregistré avant #1285 ne le connaît pas) ; le dialecte ODSQL par défaut
 *    suit `odsqlCanExpress`, qui refuse `contains` / `notcontains` (sans
 *    équivalent sur un portail qui compare des mots) ;
 * 2. le TRANSPORT — `supportsServerWhere` (#1026) : valeur que l'API ne sait
 *    pas porter, OU entre champs qu'elle ne sait pas dire.
 *
 * `null` (source sans adaptateur) : tout part, comme avant — il n'y a
 * personne pour calculer la clause ailleurs.
 */
export function canDelegateClause(
  adapter: WhereDialectCarrier | null | undefined,
  clause: string
): boolean {
  if (!adapter) return true;
  const defaultOdsql = adapter.capabilities?.whereFormat === 'odsql' && !adapter.translateWhere;
  const sameRows =
    adapter.supportsServerClause?.(clause) ??
    (defaultOdsql ? odsqlCanExpress(clause) : clause.split(':')[1] !== WORD_START_OPERATOR);
  return sameRows && adapter.supportsServerWhere?.(clause) !== false;
}

/** Un filtre colon partagé entre l'API et le navigateur (voir {@link splitWhereFor}). */
export interface WhereSplit {
  /** Clauses que l'API calcule — grammaire colon, jointes par `, `. */
  server: string;
  /** Clauses calculées côté client, sur les lignes chargées — grammaire colon. */
  client: string;
}

/**
 * Partage un filtre colon entre ce que l'API de l'adaptateur sait calculer
 * comme le client, et ce qui reste au client (#1285). Les clauses étant
 * reliées par un ET, appliquer `client` aux lignes que `server` a retenues
 * donne le filtre entier.
 *
 * Une clause part si `canDelegateClause` l'admet ET si le filtre serveur
 * qu'elle complète reste traduisible en entier (`supportsServerWhere` juge
 * aussi l'ensemble : Tabular n'écrit qu'un OU entre champs par requête).
 */
export function splitWhereFor(
  adapter: WhereDialectCarrier | null | undefined,
  colonWhere: string
): WhereSplit {
  const server: string[] = [];
  const client: string[] = [];
  for (const clause of colonWhere
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean)) {
    const fits =
      canDelegateClause(adapter, clause) &&
      adapter?.supportsServerWhere?.([...server, clause].join(', ')) !== false;
    (fits ? server : client).push(clause);
  }
  return { server: server.join(', '), client: client.join(', ') };
}

/**
 * Partage d'un filtre écrit DANS LE DIALECTE de l'adaptateur — le `where`
 * d'une `dsfr-data-source`, la clause d'un gabarit de recherche (#1285). Il
 * n'est partageable que si ce dialecte est la grammaire colon : une clause
 * ODSQL est déjà dans la langue du portail, elle part telle quelle.
 */
export function splitDialectWhere(
  adapter: WhereDialectCarrier | null | undefined,
  where: string
): WhereSplit {
  if (!where || !adapter || adapter.capabilities?.whereFormat !== 'colon') {
    return { server: where, client: '' };
  }
  return splitWhereFor(adapter, where);
}

/**
 * Les mots d'une erreur de configuration « clause calculée côté client »
 * (#1285), communs à `dsfr-data-source` et `dsfr-data-query` : pourquoi l'API
 * ne calcule pas la clause, et ce qu'elle sait faire à la place — dit
 * seulement quand c'est vrai pour CET adaptateur. Les composants ne
 * connaissent aucun fournisseur : c'est ici que le portail est nommé.
 */
export function describeClientWhere(
  adapter: WhereDialectCarrier & { type?: string; capabilities?: { serverSearch?: boolean } },
  clientWhere: string
): { cause: string; alternatives: string } {
  const substring = /:(not)?contains:/.test(clientWhere);
  const cause =
    `l'API ${adapter.type ?? 'de la source'} ne sait pas la calculer comme le navigateur` +
    (substring && adapter.capabilities?.whereFormat === 'odsql'
      ? ` (contains cherche une sous-chaîne, le like d'un portail Opendatasoft compare des mots)`
      : '');
  const wordstart =
    substring && canDelegateClause(adapter, `champ:${WORD_START_OPERATOR}:mot`)
      ? `, ou remplacez contains par wordstart (« un mot commence par », délégué à l'API)`
      : '';
  const search = adapter.capabilities?.serverSearch
    ? `, ou passez par dsfr-data-search server-search (recherche de l'API)`
    : '';
  return { cause, alternatives: `${wordstart}${search}` };
}
