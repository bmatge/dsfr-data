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

import { escapeColonValue, filterToOdsql } from '@dsfr-data/shared/lib';
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
  Pick<ApiAdapter, 'translateWhere' | 'joinWhere' | 'escapeSearchTerm'>
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
