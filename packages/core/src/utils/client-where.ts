/**
 * Chargement complet d'une source dont une partie du filtre est calculée
 * DANS LE NAVIGATEUR (#1285, ADR-159).
 *
 * Un filtre n'est confié au serveur que si la structure de la comparaison y
 * est la même. `contains` / `notcontains` sur un portail Opendatasoft, dont
 * le `like` compare des mots et non une sous-chaîne, ne le sont donc jamais
 * (`splitWhere`). Quand la clause vient d'un filtre de contexte ou d'une
 * query seule lectrice, c'est la source qui la calcule, ici, sur les lignes
 * que le reste du filtre a laissées passer.
 *
 * Généralisation, à tout adaptateur, du repli que l'adaptateur Tabular
 * s'était écrit pour une liste `in` à parenthèse (#1233) : le filtre passe
 * AVANT tout le reste. Sont donc lues toutes les lignes que gardent les
 * clauses déléguées, sans `limit` ni tri ; puis la clause est appliquée, puis
 * `order-by` et `limit`. Un `group-by` ou un `aggregate` ne peut plus être
 * délégué (le serveur regrouperait des lignes non filtrées) : lignes brutes
 * filtrées et `needsClientProcessing`, la `dsfr-data-query` en aval regroupe.
 *
 * Même chemin pour une RECHERCHE que la source calcule elle-même (ADR-159,
 * lot 3) : le terme qu'un visiteur a saisi dans une `dsfr-data-search` en mode
 * `context`, quand l'API de la source n'a aucun moteur de recherche. La
 * comparaison est alors celle, tolérante, de `utils/search-match.ts`.
 *
 * Coût : le jeu que laisse passer le reste du filtre, au lieu des seules
 * lignes gardées, dans la limite de `max-records` — aucun autre plafond. Si
 * `max-records` coupe la lecture, le filtre ne porte que sur les lignes lues :
 * `truncated`, et c'est dit.
 */

import { applyLocalFilter, splitColonFields } from '@dsfr-data/shared/lib';
import type { ContextSearch } from '@dsfr-data/shared/lib';
import { applySearches, describeSearch } from './search-match.js';
import type { AdapterParams, ApiAdapter, FetchResult } from '../adapters/api-adapter.js';
import { parseOrderBy } from './where.js';
import { sortRows } from './sort.js';
import { getByPath } from './json-path.js';

/** Champs lus par un filtre colon (`a|b:op:v, c:op:v` -> a, b, c). */
export function colonWhereFields(colonWhere: string): string[] {
  const fields = new Set<string>();
  for (const clause of colonWhere
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean)) {
    for (const field of splitColonFields(clause.split(':')[0])) fields.add(field);
  }
  return [...fields];
}

/**
 * Un `select` qui calcule (agrégat, fonction) : le serveur le calculerait sur
 * des lignes que la clause cliente n'a pas encore filtrées.
 */
export function selectComputes(select: string | undefined): boolean {
  return !!select && select.includes('(');
}

/**
 * Colonnes à AJOUTER à un `select` simple (`a, b as c`) pour que les champs du
 * filtre client soient lus ; vide si le `select` est absent (toutes les
 * colonnes viennent) ou les porte déjà.
 */
function missingSelectFields(select: string | undefined, fields: string[]): string[] {
  if (!select?.trim()) return [];
  const names = new Set<string>();
  for (const part of select.split(',')) {
    const [expr, alias] = part.split(/\s+as\s+/i).map((s) => s.trim().replace(/^`|`$/g, ''));
    if (expr) names.add(expr);
    if (alias) names.add(alias);
  }
  if (names.has('*')) return [];
  return fields.filter((f) => !names.has(f) && !names.has(f.split('.')[0]));
}

const warned = new Set<string>();

function warnOnce(key: string, message: string): void {
  if (warned.has(key) || warned.size >= 200) return;
  warned.add(key);
  console.warn(message);
}

/**
 * Ce que la source calcule dans le navigateur, dit en clair pour un message :
 * la clause colon, les recherches, ou les deux.
 */
export function describeClientFilter(clientWhere: string, searches: ContextSearch[] = []): string {
  const parts: string[] = [];
  if (clientWhere) parts.push(`la clause "${clientWhere}"`);
  for (const search of searches) parts.push(`la recherche ${describeSearch(search)}`);
  return parts.join(' et ');
}

/**
 * `fetchAll` de l'adaptateur, puis `clientWhere` (grammaire colon) et
 * `searches` (recherches du contexte) sur les lignes reçues — voir l'en-tête
 * du module. `params.where` ne porte que la part du filtre que l'API sait
 * calculer.
 */
export async function fetchAllWithClientWhere(
  adapter: ApiAdapter,
  params: AdapterParams,
  clientWhere: string,
  signal: AbortSignal,
  label = 'dsfr-data-source',
  searches: ContextSearch[] = []
): Promise<FetchResult> {
  const grouped =
    !!(params.groupBy?.trim() || params.aggregate?.trim()) || selectComputes(params.select);
  const lus = [...colonWhereFields(clientWhere), ...searches.flatMap((s) => s.fields)];
  const added = grouped ? [] : missingSelectFields(params.select, [...new Set(lus)]);
  const quoi = describeClientFilter(clientWhere, searches);
  const calcule = quoi.includes(' et ') ? 'sont calculées' : 'est calculée';

  const complete = await adapter.fetchAll(
    {
      ...params,
      groupBy: '',
      aggregate: '',
      orderBy: '',
      limit: 0,
      ...(grouped ? { select: '' } : {}),
      ...(added.length > 0 ? { select: `${params.select}, ${added.join(', ')}` } : {}),
    },
    signal
  );

  const lues = Array.isArray(complete.data) ? (complete.data as Record<string, unknown>[]) : [];
  const read = (row: Record<string, unknown>, field: string) => getByPath(row, field);
  let data = clientWhere ? applyLocalFilter(lues, clientWhere, read) : lues;
  data = applySearches(data, searches, read);
  if (added.length > 0) {
    data = data.map((row) => {
      const kept = { ...row };
      for (const field of added) delete kept[field];
      return kept;
    });
  }

  // Lecture coupée par le plafond : le filtre n'a vu qu'une partie du jeu.
  const partial =
    complete.truncated === true ||
    (typeof complete.totalCount === 'number' && complete.totalCount > lues.length);
  if (partial) {
    warnOnce(
      `partial:${label}:${quoi}`,
      `${label}: ${quoi} ${calcule} dans le navigateur (l'API ` +
        `${adapter.type} ne sait pas le faire), sur les ${lues.length} premières lignes ` +
        `seulement — le plafond max-records a coupé la lecture : le résultat est partiel. ` +
        `Relevez max-records de dsfr-data-source pour filtrer tout le jeu.`
    );
  }

  if (grouped) {
    warnOnce(
      `grouped:${label}:${quoi}`,
      `${label}: group-by / aggregate non délégués — ${quoi} ${calcule} ` +
        `côté client, le serveur regrouperait des lignes non filtrées. Lignes brutes filtrées ` +
        `renvoyées, regroupement calculé côté client par la dsfr-data-query en aval.`
    );
    return {
      data,
      totalCount: partial ? undefined : data.length,
      needsClientProcessing: true,
      ...(partial ? { truncated: true } : {}),
      ...(complete.caveats?.length ? { caveats: complete.caveats } : {}),
    };
  }

  const matched = data.length;
  data = sortRows(data, parseOrderBy(params.orderBy || ''));
  if (params.limit > 0) data = data.slice(0, params.limit);
  return {
    data,
    // Lignes gardées par le filtre, avant `limit` — comme un total serveur.
    // Lecture coupée par le plafond : le total n'est pas connu.
    totalCount: partial ? undefined : matched,
    needsClientProcessing: complete.needsClientProcessing,
    ...(partial ? { truncated: true } : {}),
    ...(complete.caveats?.length ? { caveats: complete.caveats } : {}),
  };
}
