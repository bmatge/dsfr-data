/**
 * Une recherche dite dans la langue d'une API (#1026, ADR-159 lot 3).
 *
 * Deux composants confient une recherche à un serveur : `dsfr-data-search`
 * en `server-search` (vers sa source amont), et `dsfr-data-context` quand une
 * recherche lui est confiée (vers chacune de ses cibles). Tous deux passent
 * par ici : un gabarit, le terme échappé dans le dialecte de l'adaptateur,
 * les champs, puis la question « l'API sait-elle porter cette clause ? ».
 * Un refus ne perd jamais la recherche : l'appelant la calcule dans le
 * navigateur.
 */

import type { ApiAdapter } from '../adapters/api-adapter.js';
import { escapeSearchTerm, type WhereDialectCarrier } from './where.js';

/**
 * Ce qu'il faut d'un adaptateur pour dire une recherche : son dialecte
 * (échappement, `supportsServerWhere`), son nom et, pour la recherche du
 * contexte, sa configuration de fournisseur. Volontairement lâche, comme
 * `WhereDialectCarrier` : les sources factices des tests n'en portent qu'une
 * partie.
 */
export type SearchClauseAdapter = WhereDialectCarrier & {
  type?: string;
  getProviderConfig?: ApiAdapter['getProviderConfig'];
};

export type SearchClause = { where: string; refusal: null } | { where: ''; refusal: string };

/**
 * Remplit un gabarit de recherche : `{q}` reçoit le terme échappé (#271,
 * #1135 : c'est l'adaptateur qui sait quels caractères sont structurels),
 * `{fields}` les champs joints par `fieldsJoin` (`|` : le OU entre champs de
 * la grammaire colon, #1026). `refusal` dit pourquoi la clause ne peut pas
 * partir — gabarit qui vise `{fields}` sans champ, ou clause que l'API ne
 * sait pas transporter (`supportsServerWhere`).
 */
export function buildSearchClause(
  adapter: SearchClauseAdapter,
  template: string,
  term: string,
  fields: string[],
  fieldsJoin = '|'
): SearchClause {
  if (template.includes('{fields}') && fields.length === 0) {
    return {
      where: '',
      refusal:
        `le gabarit "${template}" cherche dans {fields}, mais l'attribut ` +
        `"fields" est vide — nommez les colonnes a interroger`,
    };
  }
  const where = template
    .replace(/\{fields\}/g, () => fields.join(fieldsJoin))
    .replace(/\{q\}/g, () => escapeSearchTerm(adapter, term));
  if (adapter.supportsServerWhere?.(where) === false) {
    return {
      where: '',
      refusal:
        `la clause "${where}" ne peut pas partir au serveur (${adapter.type ?? 'API'}) — ` +
        `l'adaptateur ne sait pas transmettre ce terme ou ces champs tels quels`,
    };
  }
  return { where, refusal: null };
}

/**
 * Gabarit de la recherche PORTÉE PAR LE CONTEXTE pour cet adaptateur
 * (`query.contextSearchTemplate` de sa configuration de fournisseur) — `null`
 * quand son API n'a rien pour chercher : la recherche est alors calculée dans
 * le navigateur. Un adaptateur tiers sans configuration de fournisseur n'en
 * déclare pas.
 */
export function contextSearchTemplateOf(
  adapter: SearchClauseAdapter | null | undefined
): { template: string; fieldsJoin: string; textOnly: boolean } | null {
  const query = adapter?.getProviderConfig?.().query;
  const template = query?.contextSearchTemplate;
  if (!template) return null;
  return {
    template,
    fieldsJoin: query.contextSearchFieldsJoin ?? '|',
    textOnly: query.contextSearchTextOnly === true,
  };
}
