/**
 * Ce que chaque serveur sait calculer comme le navigateur (ADR-159, #1285,
 * lot 4) : UNE règle par fournisseur, lue par tous ceux qui en décident.
 *
 * ADR-159, point 2 : un filtre n'est confié au serveur que si la STRUCTURE de
 * la comparaison y est la même que dans le navigateur — une sous-chaîne reste
 * une sous-chaîne, un caractère de la valeur n'y devient pas un joker, les
 * valeurs absentes ont le même sort. Sinon la clause est calculée dans le
 * navigateur.
 *
 * Lecteurs :
 *   - les adaptateurs (`supportsServerClause` d'Opendatasoft, Tabular, Grist)
 *     et le dialecte ODSQL par défaut (`adapters/where-dialect.ts`) ;
 *   - `filterToOdsql` / `splitFilterForOdsql` (`filter-translator.ts`) ;
 *   - les exports : `filterSplit` du Builder, `computedInBrowser` et le
 *     partage ODSQL de l'export du tableau de bord.
 *
 * Le tableau des capacités de `docs/ARCHITECTURE.md` (« Comparaison de texte
 * par fournisseur ») est tenu par `tests/server-clause-capacites.test.ts`, qui
 * le compare à {@link canServerExpress} : une règle changée ici sans le
 * tableau, ou l'inverse, fait échouer le test.
 *
 * Les mesures qui fondent chaque règle sont en tête de `filter-translator.ts`
 * (Opendatasoft) et de `sql-like.ts` (Tabular, Grist).
 */

import { unescapeColonValue } from '../utils/colon-escape.js';

/** Opérateur et valeur (décodée) d'une clause colon `champ:op:valeur`. */
function opAndValue(clause: string): { op: string; value: string } {
  const parts = clause.trim().split(':');
  return { op: parts[1] ?? '', value: unescapeColonValue(parts.slice(2).join(':')) };
}

/**
 * Opendatasoft : tout sauf `contains` et `notcontains`. Une sous-chaîne n'a
 * pas d'équivalent ODSQL — le `like` du portail compare des MOTS. Une clause
 * mal formée ou d'opérateur inconnu rend vrai : ce n'est pas à cette règle de
 * la refuser, elle est écartée par la validation.
 */
export function odsqlCanExpress(clause: string): boolean {
  const { op } = opAndValue(clause);
  return op !== 'contains' && op !== 'notcontains';
}

/**
 * Tabular (PostgREST, `ilike`) : non pour `notcontains` (les valeurs absentes)
 * ni pour un `contains` dont la valeur porte `*`, que PostgREST lit comme un
 * joker sans échappement possible. Tout le reste part (`\` `%` `_` échappés
 * par `escapeLikePattern`).
 */
export function tabularCanExpress(clause: string): boolean {
  const { op, value } = opAndValue(clause);
  if (op === 'notcontains') return false;
  if (op === 'contains') return !value.includes('*');
  return true;
}

/**
 * Grist (SQLite, `LIKE`) : non pour `notcontains` (les valeurs absentes) ;
 * `contains` part, jokers échappés par `ESCAPE '\'`.
 */
export function gristCanExpress(clause: string): boolean {
  return opAndValue(clause).op !== 'notcontains';
}

/** Les fournisseurs dont la comparaison serveur diffère du navigateur sur un opérateur. */
export const SERVER_CLAUSE_RULES = {
  opendatasoft: odsqlCanExpress,
  tabular: tabularCanExpress,
  grist: gristCanExpress,
} as const satisfies Record<string, (clause: string) => boolean>;

/** Un fournisseur qui a une règle propre (voir {@link SERVER_CLAUSE_RULES}). */
export type ServerClauseProvider = keyof typeof SERVER_CLAUSE_RULES;

/** Vrai si `provider` a une règle propre dans {@link SERVER_CLAUSE_RULES}. */
export function hasServerClauseRule(provider: string): provider is ServerClauseProvider {
  return Object.prototype.hasOwnProperty.call(SERVER_CLAUSE_RULES, provider);
}

/**
 * Le serveur de `provider` retient-il, pour cette clause colon, LES MÊMES
 * lignes que le navigateur ? Un fournisseur sans règle propre (INSEE,
 * adaptateur tiers) rend vrai : rien n'y est retenu pour la comparaison — son
 * transport, lui, est jugé ailleurs (`supportsServerWhere`, #1026).
 */
export function canServerExpress(provider: string, clause: string): boolean {
  return hasServerClauseRule(provider) ? SERVER_CLAUSE_RULES[provider](clause) : true;
}

/**
 * Partage un filtre colon entre ce que le serveur de `provider` calcule comme
 * le navigateur (`server`) et ce qui reste au navigateur (`client`), dans
 * l'ordre du filtre, clauses jointes par `, `. Les clauses étant reliées par
 * un ET, appliquer `client` sur les lignes que `server` a retenues donne le
 * résultat du filtre entier.
 */
export function splitFilterForServer(
  provider: string,
  filterExpr: string
): { server: string; client: string } {
  const server: string[] = [];
  const client: string[] = [];
  for (const part of filterExpr
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)) {
    (canServerExpress(provider, part) ? server : client).push(part);
  }
  return { server: server.join(', '), client: client.join(', ') };
}
