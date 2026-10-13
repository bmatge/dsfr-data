/**
 * Ce que l'API de chaque fournisseur calcule COMME le navigateur (#1285,
 * ADR-139) — la table de vérité de la délégation d'une clause de filtre.
 *
 * Une clause colon (`champ:op[:valeur]`) ne part au serveur que si l'API
 * retient EXACTEMENT les lignes que retient son calcul côté client, casse,
 * accents et valeurs absentes compris. Sinon elle reste au client, sur les
 * lignes chargées : un chiffre ne doit pas dépendre du chemin qu'a pris le
 * filtre.
 *
 *   opérateur      Opendatasoft        Tabular            Grist     INSEE
 *   eq, in         délégué             délégué            délégué   délégué
 *   neq, notin,
 *   gt … lte,
 *   isnull …       délégué             délégué            délégué   client
 *   contains       CLIENT              délégué (1)        CLIENT    client
 *   notcontains    CLIENT              CLIENT (2)         CLIENT    client
 *   wordstart      délégué (3)         CLIENT             CLIENT    client
 *
 * Opendatasoft — `like` compare des MOTS, pas une sous-chaîne : mesuré le
 * 2026-10-12, `categorie_produit like "%aliment%"` rend 0 ligne là où 14 366
 * valent « alimentation ». `contains` / `notcontains` n'ont donc aucun
 * équivalent ODSQL. (3) `wordstart` part en `like "mot*"`, sauf si un mot de
 * la saisie porte un signe (voir `word-start.ts`).
 *
 * Tabular — mesuré le 2026-10-13 : (1) `champ__contains` est un `ilike`, vraie
 * sous-chaîne insensible à la casse et sensible aux accents, comme le client,
 * une fois `%` et `_` échappés (jokers sinon : `Saint_` rend 25 lignes comme
 * `saint`, `%` rend tout le jeu ; `Saint\_` et `\%` rendent 0). Une valeur à
 * antislash, dont l'échappement n'a pas été mesuré, reste au client.
 * (2) `champ__notcontains` ÉCARTE les valeurs absentes (0 ligne sur 262
 * toutes nulles) que le client garde.
 *
 * Grist — `LIKE` de SQLite : casse ignorée pour l'ASCII seulement (« école »
 * ne trouve pas « École »), `%` et `_` en jokers, `NOT LIKE` écarte les
 * valeurs absentes. Sémantique documentée de SQLite, non mesurée sur une
 * instance.
 *
 * INSEE Melodi — ne filtre qu'en égalité sur des dimensions (`eq`, `in`).
 *
 * Module lib-safe et sans dépendance du DOM : il sert les adaptateurs de la
 * bibliothèque (`supportsServerClause`) comme les exports des applications,
 * qui écrivent un filtre dans une page sans charger d'adaptateur.
 */

import { unescapeColonValue } from '../utils/colon-escape.js';
import { odsqlCanExpress } from './filter-translator.js';
import { WORD_START_OPERATOR } from './word-start.js';

/** Un filtre colon partagé entre l'API et le navigateur. */
export interface FilterSplit {
  /** Clauses que l'API calcule — grammaire colon, jointes par `, `. */
  server: string;
  /** Clauses calculées côté client, sur les lignes chargées — grammaire colon. */
  client: string;
}

/**
 * L'API du fournisseur calcule-t-elle cette clause colon comme le navigateur ?
 * `provider` est l'`api-type` d'une `dsfr-data-source` (`opendatasoft`,
 * `tabular`, `grist`, `insee`). Un fournisseur inconnu, ou sans requête
 * serveur (`generic`), ne délègue pas `wordstart` et garde le reste.
 */
export function serverComputesClause(provider: string, clause: string): boolean {
  const segs = clause.trim().split(':');
  const op = segs[1] ?? '';
  switch (provider) {
    case 'opendatasoft':
      return odsqlCanExpress(clause);
    case 'tabular':
      if (op === 'notcontains' || op === WORD_START_OPERATOR) return false;
      if (op === 'contains') return !unescapeColonValue(segs.slice(2).join(':')).includes('\\');
      return true;
    case 'grist':
      return op !== 'contains' && op !== 'notcontains' && op !== WORD_START_OPERATOR;
    case 'insee':
      // `DIMENSION:VALEUR` (deux segments) est une égalité, elle aussi.
      return segs.length < 3 || op === 'eq' || op === 'in';
    default:
      return op !== WORD_START_OPERATOR;
  }
}

/**
 * Partage un filtre colon entre ce que l'API du fournisseur calcule comme le
 * navigateur (`server`) et ce qui reste au client (`client`). Les clauses
 * étant reliées par un ET, appliquer `client` aux lignes que `server` a
 * retenues donne le filtre entier.
 */
export function splitFilterForProvider(provider: string, filterExpr: string): FilterSplit {
  const server: string[] = [];
  const client: string[] = [];
  for (const clause of filterExpr
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean)) {
    (serverComputesClause(provider, clause) ? server : client).push(clause);
  }
  return { server: server.join(', '), client: client.join(', ') };
}
