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

import { canServerExpress, escapeColonValue, filterToOdsql } from '@dsfr-data/shared/lib';
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
 * Une clause colon peut-elle être confiée à l'API de cet adaptateur (#1285,
 * ADR-159) ? Un filtre n'est confié au serveur que si la STRUCTURE de la
 * comparaison y est la même que dans le navigateur — c'est
 * `supportsServerClause` de l'adaptateur qui le dit. Sans cette méthode, tout
 * opérateur part, sauf dans le dialecte ODSQL par défaut, qui suit la règle
 * d'Opendatasoft (`canServerExpress`, `shared/query/server-clause.ts`) :
 * `contains` / `notcontains` y sont refusés (une sous-chaîne n'a pas
 * d'équivalent sur un portail qui compare des mots).
 *
 * Ne juge PAS le transport (`supportsServerWhere`, #1026 : valeur que l'API
 * ne sait pas porter, OU entre champs qu'elle ne sait pas dire) : ce refus-là
 * garde son traitement d'avant chez chaque appelant.
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
  return (
    adapter.supportsServerClause?.(clause) ??
    (defaultOdsql ? canServerExpress('opendatasoft', clause) : true)
  );
}

/** Un filtre colon partagé entre l'API et le navigateur (voir {@link splitWhereFor}). */
export interface WhereSplit {
  /** Clauses confiées à l'API — grammaire colon, jointes par `, `. */
  server: string;
  /** Clauses calculées dans le navigateur, sur les lignes chargées — grammaire colon. */
  client: string;
}

/**
 * Partage un filtre colon entre ce qui peut être confié à l'API de
 * l'adaptateur et ce qui est calculé dans le navigateur (#1285). Les clauses
 * étant reliées par un ET, appliquer `client` aux lignes que `server` a
 * retenues donne le filtre entier.
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
    (canDelegateClause(adapter, clause) ? server : client).push(clause);
  }
  return { server: server.join(', '), client: client.join(', ') };
}

/**
 * Les mots d'une erreur de configuration « clause calculée dans le
 * navigateur » (#1285), communs à `dsfr-data-source` et `dsfr-data-facets` :
 * pourquoi l'API ne calcule pas la clause, et ce qu'elle sait faire à la
 * place — dit seulement quand c'est vrai pour CET adaptateur. Les composants
 * ne connaissent aucun fournisseur : c'est ici que le portail est nommé.
 */
export function describeClientWhere(
  adapter: WhereDialectCarrier & { type?: string; capabilities?: { serverSearch?: boolean } },
  clientWhere: string
): { cause: string; alternatives: string } {
  const substring = /:(not)?contains:/.test(clientWhere);
  const odsql = adapter.capabilities?.whereFormat === 'odsql';
  // Pourquoi, dit seulement quand c'est vrai pour ce dialecte (#1285,
  // ADR-159) : un portail Opendatasoft compare des mots ; un `LIKE` SQL
  // (Tabular, Grist) écarte les valeurs absentes sous une négation, et
  // PostgREST lit `*` comme un joker (Tabular).
  // `notin` (#1312) : le `not.in` de Tabular écarte lui aussi les absents.
  const negations = [
    /:notcontains:/.test(clientWhere) ? 'notcontains' : '',
    /:notin:/.test(clientWhere) ? 'notin' : '',
  ].filter(Boolean);
  const sql = [
    negations.length > 0
      ? `${negations.join(' et ')} y écarterai${negations.length > 1 ? 'en' : ''}t les lignes ` +
        `dont la valeur est absente, que le navigateur garde`
      : '',
    /:contains:[^,]*\*/.test(clientWhere)
      ? `un * dans la valeur de contains y serait un joker`
      : '',
  ].filter(Boolean);
  const cause =
    `l'API ${adapter.type ?? 'de la source'} ne sait pas la calculer comme le navigateur` +
    (substring && odsql
      ? ` (contains cherche une sous-chaîne, le like d'un portail Opendatasoft compare des mots)`
      : !odsql && sql.length > 0
        ? ` (${sql.join(' ; ')})`
        : '');
  // Une recherche du visiteur remplace un `contains`, jamais une négation —
  // sauf sur Opendatasoft, où le message d'origine (lot 1) la propose aussi.
  const search =
    (odsql ? substring : /:contains:/.test(clientWhere)) && adapter.capabilities?.serverSearch
      ? `, ou, pour une recherche saisie par le visiteur, passez par dsfr-data-search ` +
        `server-search ou dsfr-data-search context (recherche de l'API` +
        `${odsql ? ', par début de mot' : ''}, qui reste compatible avec server-side)`
      : '';
  return { cause, alternatives: search };
}
