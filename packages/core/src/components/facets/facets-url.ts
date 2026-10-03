import { parsePipePairs } from './facets-attributes.js';
import type { FacetGroup, FacetSelections } from './facets-types.js';

/**
 * Lecture et écriture de l'URL par une facette AUTONOME (#312, #773, #683),
 * sortie du composant (#838).
 *
 * En mode `context`, rien de tout ceci ne sert : c'est le contexte qui porte
 * l'URL (#678, ADR-104).
 */

/** Parse url-param-map attribute into a map of URL param name -> facet field name */
export function parseUrlParamMap(raw: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const [paramName, fieldName] of parsePipePairs(raw)) {
    if (fieldName) map.set(paramName, fieldName);
  }
  return map;
}

/**
 * Grammaire d'un paramètre d'URL de facette (BUG-031 du banc d'essai, #1227).
 *
 * Un paramètre porte les valeurs d'UN champ, jointes par des virgules :
 * `?region=IDF,PACA`. C'est la forme historique, et celle des liens déjà
 * partagés — elle reste écrite et lue telle quelle. Ce qui manquait est un
 * échappement : une valeur qui CONTIENT une virgule (« 1,5 à 2 parcours »)
 * était recoupée en deux à la lecture, deux cases fantômes, zéro résultat.
 *
 * Trois choses s'échappent en percent DANS la valeur, avant la jointure —
 * même convention que `where`, `replace` et `color-map` (#676) :
 * - `,` → `%2C` : le séparateur ;
 * - `%` → `%25` : pour que le décodage soit réversible ;
 * - les blancs de TÊTE et de QUEUE (`%20`…) : le lecteur les retire autour de
 *   chaque morceau, pour tolérer un lien écrit à la main (`?r=IDF, PACA`).
 *
 * Dans la barre d'adresse le `%` est encodé une seconde fois par
 * `URLSearchParams` : la valeur se lit `1%252C5+à+2+parcours`.
 *
 * Paramètre répété ou échappement ? Le paramètre répété (`?r=a&r=b`) ne
 * suffit pas seul : une valeur unique à virgule (`?r=1,5 à 2`) resterait
 * indiscernable de deux valeurs historiques (`?r=IDF,PACA`), sauf à casser
 * tous les liens déjà partagés. L'échappement lève l'ambiguïté sans changer
 * la forme d'un lien qui n'a pas de virgule dans ses valeurs. Le paramètre
 * répété reste LU (ses occurrences se cumulent), jamais écrit.
 */
export function escapeUrlFacetValue(value: string): string {
  const escaped = value.replace(/%/g, '%25').replace(/,/g, '%2C');
  const body = escaped.trim();
  if (body === escaped) return escaped;
  if (body === '') return encodeURIComponent(escaped);
  const head = escaped.slice(0, escaped.length - escaped.trimStart().length);
  const tail = escaped.slice(escaped.trimEnd().length);
  return encodeURIComponent(head) + body + encodeURIComponent(tail);
}

/**
 * Inverse d'`escapeUrlFacetValue`, appliqué à un morceau DÉJÀ découpé.
 *
 * Chaque suite de séquences `%XX` est décodée d'un bloc (un blanc insécable
 * tient sur deux octets). Une suite qui n'est pas de l'UTF-8 valide est
 * laissée telle quelle : un lien historique dont la valeur porte un `%`
 * littéral (« 50 % », « 100%de ») se relit comme avant.
 */
export function unescapeUrlFacetValue(piece: string): string {
  if (!piece.includes('%')) return piece;
  let out = '';
  let i = 0;
  while (i < piece.length) {
    // Une suite : autant de `%XX` qu'il s'en présente d'affilée.
    let end = i;
    while (isPercentByte(piece, end)) end += 3;
    if (end === i) {
      out += piece[i];
      i++;
      continue;
    }
    const run = piece.slice(i, end);
    try {
      out += decodeURIComponent(run);
    } catch {
      out += run;
    }
    i = end;
  }
  return out;
}

/** `%` suivi de deux chiffres hexadécimaux, à la position `at` ? */
function isPercentByte(text: string, at: number): boolean {
  return text[at] === '%' && /^[0-9A-Fa-f]{2}$/.test(text.slice(at + 1, at + 3));
}

/** Valeurs d'un champ → valeur du paramètre d'URL (une seule occurrence). */
export function joinUrlFacetValues(values: Iterable<string>): string {
  return [...values].map(escapeUrlFacetValue).join(',');
}

/**
 * Valeur d'un paramètre d'URL → valeurs du champ.
 *
 * `known` est facultatif : les valeurs que les données portent pour ce champ.
 * Il ne sert qu'à RECOLLER un lien écrit avant l'échappement, dont une valeur
 * contenait une virgule (`?intensite=1,5 à 2 parcours`) : un morceau inconnu
 * des données est prolongé par les suivants jusqu'à former une valeur connue.
 * Un morceau connu n'est jamais recollé — `?r=A,B` reste deux valeurs même si
 * « A,B » existe aussi —, et sans valeur connue qui convienne le morceau est
 * rendu seul, comme avant (case cochée « indisponible », #310).
 */
export function splitUrlFacetValues(raw: string, known?: ReadonlySet<string> | null): string[] {
  const pieces = raw.split(',');
  const values: string[] = [];
  let i = 0;
  while (i < pieces.length) {
    const single = unescapeUrlFacetValue(pieces[i].trim());
    if (known && known.size > 0 && single !== '' && !known.has(single)) {
      const rejoined = rejoinLegacyPieces(pieces, i, known);
      if (rejoined) {
        values.push(rejoined.value);
        i = rejoined.next;
        continue;
      }
    }
    if (single !== '') values.push(single);
    i++;
  }
  return values;
}

/**
 * Plus courte suite de morceaux, à partir de `start`, qui forme une valeur
 * connue une fois recollée par des virgules. Les blancs INTÉRIEURS sont ceux
 * du lien (« Paris, France ») ; seuls ceux des bords sont retirés.
 */
function rejoinLegacyPieces(
  pieces: string[],
  start: number,
  known: ReadonlySet<string>
): { value: string; next: number } | null {
  let joined = pieces[start];
  for (let end = start + 1; end < pieces.length; end++) {
    joined += ',' + pieces[end];
    const candidate = unescapeUrlFacetValue(joined.trim());
    if (known.has(candidate)) return { value: candidate, next: end + 1 };
  }
  return null;
}

/**
 * Paramètres d'URL lus comme pré-sélections.
 *
 * Sans `url-param-map`, seuls les params correspondant aux champs CONNUS
 * deviennent des selections (#312) : `?utm_source=newsletter` filtrait sur un
 * champ inexistant -> 0 resultat inexplicable. Une valeur peut porter
 * plusieurs modalités séparées par des virgules : `?region=IDF,PACA` ; une
 * virgule DANS une modalité s'écrit `%2C` (voir `escapeUrlFacetValue`).
 *
 * `knownValues` rend, pour un champ, les valeurs présentes dans les données
 * (ou `null` quand on ne les connaît pas encore) : voir `splitUrlFacetValues`.
 */
export function readUrlSelections(
  params: URLSearchParams,
  paramMap: Map<string, string>,
  knownFields: Set<string>,
  knownValues?: (field: string) => ReadonlySet<string> | null
): FacetSelections {
  const selections: FacetSelections = {};

  for (const [paramName, paramValue] of params.entries()) {
    const fieldName =
      paramMap.size > 0
        ? (paramMap.get(paramName) ?? null)
        : knownFields.has(paramName)
          ? paramName
          : null;

    if (!fieldName) continue;

    // Les données ne sont consultées que pour un paramètre à virgule : c'est
    // le seul cas où il y a quelque chose à recoller.
    const known = paramValue.includes(',') ? (knownValues?.(fieldName) ?? null) : null;
    const values = splitUrlFacetValues(paramValue, known);

    if (!selections[fieldName]) {
      selections[fieldName] = new Set();
    }
    for (const v of values) {
      selections[fieldName].add(v);
    }
  }

  return selections;
}

/**
 * Écrit les sélections courantes dans les paramètres de `url`, en place.
 *
 * Part des params EXISTANTS (#312) : repartir de zéro effaçait le paramètre
 * du `dsfr-data-search` voisin et tout autre param de la page à chaque clic.
 * Nos propres params périmés sont retirés avant que les courants soient
 * posés.
 */
export function writeUrlSelections(
  url: URL,
  selections: FacetSelections,
  groups: FacetGroup[],
  paramMap: Map<string, string>
): void {
  const params = url.searchParams;
  // Build reverse map: field -> URL param name
  const reverseMap = new Map<string, string>();
  for (const [paramName, fieldName] of paramMap) {
    reverseMap.set(fieldName, paramName);
  }

  for (const field of Object.keys(selections)) {
    params.delete(reverseMap.get(field) ?? field);
  }
  for (const group of groups) {
    params.delete(reverseMap.get(group.field) ?? group.field);
  }

  for (const [field, values] of Object.entries(selections)) {
    if (values.size === 0) continue;
    const paramName = reverseMap.get(field) ?? field;
    params.set(paramName, joinUrlFacetValues(values));
  }
}

/**
 * Un paramètre lu par cette facette AUTONOME est-il aussi porté par un
 * `dsfr-data-context` à `url-sync` (#773) ? Les deux s'écraseraient
 * mutuellement.
 *
 * Vue STRUCTURELLE sur le contexte (`getUrlParamNames`), sans importer son
 * module — même précaution que #681.
 */
export function findUrlParamConflicts(read: Set<string>): {
  conflicts: string[];
  contextId: string;
} {
  const conflicts: string[] = [];
  let contextId = '';
  for (const el of document.querySelectorAll('dsfr-data-context')) {
    const names = (el as unknown as { getUrlParamNames?: () => string[] }).getUrlParamNames?.();
    for (const name of names ?? []) {
      if (read.has(name) && !conflicts.includes(name)) {
        conflicts.push(name);
        contextId ||= el.id;
      }
    }
  }
  return { conflicts, contextId };
}
