import { toNumber } from '@dsfr-data/shared/lib';
import { getByPath } from './json-path.js';

/**
 * Aggregations - Fonctions d'agrégation pour les KPIs
 * Permet de calculer des agrégats (avg, sum, count, min, max) sur des tableaux de données
 */

export type AggregationType =
  'avg' | 'sum' | 'count' | 'min' | 'max' | 'first' | 'last' | 'distinct';

/**
 * Alias acceptés en entrée et ramenés à leur fonction canonique AVANT tout
 * traitement : `count-distinct` = `distinct` (#672). L'alias de colonne et
 * les traductions adaptateurs ne voient que la forme canonique.
 */
export const AGGREGATION_ALIASES: Readonly<Record<string, AggregationType>> = {
  'count-distinct': 'distinct',
};

/** Fonction canonique d'un segment de fonction (alias résolus, #672). */
export function canonicalAggregation(fn: string): string {
  return AGGREGATION_ALIASES[fn] ?? fn;
}

export interface ParsedExpression {
  /**
   * `invalid` : fonction hors liste blanche (#649), `error` porte le message.
   * `meta` : `meta:total` (#659), total publié par l'amont.
   * `ratio` : `<expr> / <expr>` (#673), `numerator` et `denominator` portent
   * les deux côtés, chacun dans la grammaire mono-expression.
   */
  type: AggregationType | 'direct' | 'invalid' | 'meta' | 'ratio';
  field: string;
  filterField?: string;
  filterValue?: string | boolean | number;
  error?: string;
  numerator?: ParsedExpression;
  denominator?: ParsedExpression;
}

/**
 * Contexte d'évaluation optionnel : `metaTotal` = total publié par l'amont
 * (`meta:total`, #659), fourni par le composant qui connaît sa source.
 */
export interface AggregationContext {
  metaTotal?: number;
}

/** Expression spéciale `meta:total` (#659). */
export const META_TOTAL_EXPR = 'meta:total';

/**
 * Séparateur de ratio (#673) : une barre oblique ENTOURÉE d'espaces
 * (`count:statut:ouvert / count`). Sans espaces, `/` reste un caractère de
 * nom de champ (`km/h:avg`).
 */
const RATIO_SEPARATOR = /\s+\/\s+/;

/** Fonctions d'agrégat acceptées par dsfr-data-kpi (grammaire "champ:fn"). */
export const KPI_AGGREGATION_TYPES: readonly AggregationType[] = [
  'avg',
  'sum',
  'count',
  'min',
  'max',
  'first',
  'last',
  'distinct',
];

const AGG_TYPES: ReadonlySet<string> = new Set(KPI_AGGREGATION_TYPES);

let legacyGrammarWarned = false;

/**
 * Parse une expression d'agrégation.
 *
 * Grammaire COMMUNE du pipeline (#303) : "field:fn" — la même que query et
 * tous les adapters (`population:sum`). L'ancienne grammaire INVERSÉE du
 * kpi ("fn:field", ex. `sum:population`) reste lue en alias déprécié
 * (warn console unique).
 *
 * Formats supportés :
 * - "field"            -> accès direct
 * - "field:fn"         -> grammaire commune (population:sum)
 * - "fn:field"         -> ancienne grammaire kpi (dépréciée)
 * - "count"            -> compte tous les enregistrements
 * - "count:field:value"-> compte les occurrences où field == value (lâche)
 * - "field:distinct"   -> nombre de valeurs distinctes (alias "count-distinct", #672)
 * - "meta:total"       -> total publié par l'amont (#659), via le contexte
 * - "<expr> / <expr>"  -> ratio de deux expressions ci-dessus (#673)
 *
 * Une expression à 2+ segments dont AUCUN segment de fonction n'est dans la
 * liste blanche (ex. `x:somme`) est renvoyée en `type: 'invalid'` avec un
 * message nommant la fonction reçue et les fonctions acceptées (#649) — elle
 * était lue comme fn="x" et produisait un KPI vide en silence.
 */
export function parseExpression(expression: string): ParsedExpression {
  const trimmed = expression.trim();

  // Ratio (#673) : deux côtés séparés par ` / `, chacun parsé avec la
  // grammaire mono-expression. Un côté invalide invalide le tout, avec le
  // message du côté fautif ; plus d'un séparateur est refusé.
  const sides = trimmed.split(RATIO_SEPARATOR);
  if (sides.length > 1) {
    if (sides.length > 2 || sides.some((side) => side === '')) {
      return {
        type: 'invalid',
        field: '',
        error:
          `ratio "${expression}" mal formé — attendu exactement deux expressions ` +
          `séparées par " / " (ex. "count:statut:ouvert / count")`,
      };
    }
    const numerator = parseExpression(sides[0]);
    const denominator = parseExpression(sides[1]);
    const invalid = [numerator, denominator].find((side) => side.type === 'invalid');
    if (invalid) return { type: 'invalid', field: '', error: invalid.error };
    return { type: 'ratio', field: '', numerator, denominator };
  }

  if (trimmed === META_TOTAL_EXPR) return { type: 'meta', field: 'total' };

  // Alias de fonction (`count-distinct` -> `distinct`, #672) résolus sur
  // chaque segment : la grammaire commune et l'ancienne les acceptent.
  const parts = trimmed.split(':').map(canonicalAggregation);

  if (parts.length === 1) {
    // "count" seul = compter tous les enregistrements
    if (parts[0] === 'count') {
      return { type: 'count', field: '' };
    }
    return { type: 'direct', field: parts[0] };
  }

  // Grammaire commune "field:fn" : parts[1] est une fonction connue et
  // parts[0] n'en est pas une (un champ nommé 'sum' reste l'ancienne lecture)
  if (parts.length === 2 && AGG_TYPES.has(parts[1]) && !AGG_TYPES.has(parts[0])) {
    return { type: parts[1] as AggregationType, field: parts[0] };
  }

  // Ni grammaire commune ("champ:fn") ni grammaire historique ("fn:champ",
  // "count:champ:valeur") : la fonction reçue est inconnue (#649).
  if (!AGG_TYPES.has(parts[0])) {
    const received = parts.length === 2 ? parts[1] : parts[0];
    return {
      type: 'invalid',
      field: parts.length === 2 ? parts[0] : parts[1],
      error:
        `fonction d'agrégat "${received}" inconnue dans "${expression}" — ` +
        `attendu "champ:fn" (ex. "population:sum") ; ` +
        `fonctions acceptées : ${KPI_AGGREGATION_TYPES.join(', ')}`,
    };
  }

  if (!legacyGrammarWarned) {
    legacyGrammarWarned = true;
    console.warn(
      `dsfr-data-kpi: la grammaire "${parts[0]}:${parts[1]}" (fn:champ) est dépréciée — ` +
        `utilisez la grammaire commune du pipeline "champ:fn" (ex. "population:sum") (#303)`
    );
  }

  const type = parts[0] as AggregationType;
  const field = parts[1];

  if (parts.length === 3) {
    // count:field:value
    let filterValue: string | boolean | number = parts[2];

    // Parse boolean/number values
    if (filterValue === 'true') filterValue = true;
    else if (filterValue === 'false') filterValue = false;
    else if (!isNaN(Number(filterValue))) filterValue = Number(filterValue);

    return { type, field, filterField: field, filterValue };
  }

  return { type, field };
}

/**
 * Une expression est-elle un TAUX (#673) — ratio, dont le résultat est une
 * fraction (0,35) que `format="pourcentage"`, `trend` et les `lines` rendent
 * en pourcentage (35 %) ? Les autres expressions renvoient une valeur dans
 * l'unité de la colonne.
 */
export function isRateExpression(expression: string): boolean {
  return parseExpression(expression).type === 'ratio';
}

/**
 * L'expression compte-t-elle les lignes REÇUES (count, distinct, ou un
 * ratio qui en dépend) ? Sert au warn de troncature du KPI (#659).
 */
export function countsReceivedRows(parsed: ParsedExpression): boolean {
  if (parsed.type === 'count' || parsed.type === 'distinct') return true;
  if (parsed.type === 'ratio') {
    return countsReceivedRows(parsed.numerator!) || countsReceivedRows(parsed.denominator!);
  }
  return false;
}

/**
 * Calcule une agrégation sur un tableau de données
 */
export function computeAggregation(
  data: unknown,
  expression: string,
  context: AggregationContext = {}
): number | string | null {
  return evaluateParsed(data, parseExpression(expression), context);
}

function evaluateParsed(
  data: unknown,
  parsed: ParsedExpression,
  context: AggregationContext
): number | string | null {
  // Accès direct sur un objet seul (pas un tableau) : getByPath (#303) gère
  // les chemins imbriques — valeur="fields.score" echouait silencieusement.
  if (parsed.type === 'direct' && !Array.isArray(data)) {
    if (!data || typeof data !== 'object') return null;
    return getByPath(data as Record<string, unknown>, parsed.field) as number | string | null;
  }

  // Agrégations : on raisonne sur un tableau. Une source mono-objet (un seul
  // enregistrement emis sans wrapper tableau) est normalisee en tableau a 1
  // element — l'acces direct ci-dessus accepte deja l'objet seul, sinon la
  // valeur s'affichait mais pas la tendance/agregat (#338).
  const items: Record<string, unknown>[] = Array.isArray(data)
    ? (data as Record<string, unknown>[])
    : data && typeof data === 'object'
      ? [data as Record<string, unknown>]
      : [];

  // Ni tableau ni objet exploitable (null, chaine, nombre) : rien a agreger.
  if (!Array.isArray(data) && items.length === 0) {
    return null;
  }

  switch (parsed.type) {
    case 'meta':
      // Total de l'amont (#659) ; sans meta, les lignes reçues.
      return context.metaTotal ?? items.length;

    case 'ratio': {
      // Chaque côté doit résoudre en nombre (une chaîne numérique est
      // acceptée) ; division par zéro ou côté non numérique -> null, rendu
      // « — », jamais Infinity ni NaN (#673).
      const num = toNumber(evaluateParsed(data, parsed.numerator!, context), true);
      const den = toNumber(evaluateParsed(data, parsed.denominator!, context), true);
      if (num === null || den === null || den === 0) return null;
      return num / den;
    }

    case 'direct':
    case 'first':
      return items.length > 0 ? (getByPath(items[0], parsed.field) as number | string) : null;

    case 'last':
      return items.length > 0
        ? (getByPath(items[items.length - 1], parsed.field) as number | string)
        : null;

    case 'count':
      if (parsed.filterValue !== undefined) {
        // Egalite LACHE (#303) : query filtre en ==, count:field:value
        // comparait en === strict ("75" ne matchait pas 75)
        return items.filter((item) =>
          looseEquals(getByPath(item, parsed.field), parsed.filterValue)
        ).length;
      }
      return items.length;

    case 'sum':
      // toNumber : decimales francaises ('1 234,5') parsees ; NaN exclu (#301)
      return collectNumericValues(items, parsed.field).reduce((acc, v) => acc + v, 0);

    case 'distinct':
      return countDistinct(items, parsed.field);

    case 'avg': {
      // Moyenne sur les seules valeurs numeriques — diviser par
      // items.length comptait les non-numeriques comme des zeros (#301)
      const values = collectNumericValues(items, parsed.field);
      if (values.length === 0) return null;
      return values.reduce((acc, v) => acc + v, 0) / values.length;
    }

    case 'min': {
      // Colonne de dates ISO (#667) : ordre lexicographique, AVANT le chemin
      // numerique — toNumber('2026-09-09') vaudrait 2026.
      const dates = collectIsoDates(items, parsed.field);
      if (dates) return dates.reduce((acc, d) => (isoKey(d) < isoKey(acc) ? d : acc));
      // Le garde portait sur items.length, pas sur le tableau filtre :
      // aucune valeur numerique -> Math.min(...[]) = Infinity (#301)
      const values = collectNumericValues(items, parsed.field);
      return values.length > 0 ? Math.min(...values) : null;
    }

    case 'max': {
      const dates = collectIsoDates(items, parsed.field);
      if (dates) return dates.reduce((acc, d) => (isoKey(d) > isoKey(acc) ? d : acc));
      const values = collectNumericValues(items, parsed.field);
      return values.length > 0 ? Math.max(...values) : null;
    }

    case 'invalid':
    default:
      // Fonction inconnue : null ici, l'erreur de configuration est
      // reportée par le composant (dsfr-data-kpi) via parseExpression (#649).
      return null;
  }
}

/**
 * Valeurs numeriques d'un champ — toNumber strict (#301) : les decimales
 * francaises sont parsees, les non-numeriques sont EXCLUS (jamais 0).
 */
function collectNumericValues(items: Record<string, unknown>[], field: string): number[] {
  const out: number[] = [];
  for (const item of items) {
    const v = toNumber(getByPath(item, field), true);
    if (v !== null) out.push(v);
  }
  return out;
}

/**
 * Nombre de valeurs distinctes d'un champ (#672), même sémantique que
 * `count(distinct x)` côté serveur : `null`, `undefined` et la chaîne vide
 * (ou blanche) sont EXCLUS ; la comparaison se fait sur la valeur ramenée
 * en chaîne, donc `75` et `"75"` comptent pour une seule valeur. Un champ
 * tableau (tags) compte ses éléments distincts.
 */
export function countDistinct(items: Record<string, unknown>[], field: string): number {
  const seen = new Set<string>();
  const add = (v: unknown): void => {
    if (v === null || v === undefined) return;
    const key = String(v).trim();
    if (key !== '') seen.add(key);
  };
  for (const item of items) {
    const v = getByPath(item, field);
    if (Array.isArray(v)) v.forEach(add);
    else add(v);
  }
  return seen.size;
}

/**
 * Date ISO 8601 : `AAAA-MM-JJ`, ou datetime `AAAA-MM-JJThh:mm[:ss[.mmm]][Z|+hh:mm]`
 * (separateur `T` ou espace). Validation de FORME seulement : l'ordre
 * lexicographique de ces chaines est l'ordre chronologique.
 */
const ISO_DATE_RE =
  /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;

/**
 * Cle de comparaison d'une date ISO : le separateur espace est ramene a `T`
 * pour que `2026-09-09 17:30` et `2026-09-09T08:00` se comparent entre eux.
 * Les decalages horaires ne sont PAS normalises (comparaison textuelle).
 */
function isoKey(value: string): string {
  return value.replace(' ', 'T');
}

/** Une valeur est-elle une chaine de date ISO (#667) ? */
export function isIsoDateString(value: unknown): value is string {
  return typeof value === 'string' && ISO_DATE_RE.test(value.trim());
}

/**
 * Valeurs d'un champ quand la colonne est une colonne de DATES ISO (#667) :
 * toutes les valeurs renseignees sont des chaines ISO (au moins une). Sinon
 * null — la colonne suit le chemin numerique, inchange (#301).
 */
function collectIsoDates(items: Record<string, unknown>[], field: string): string[] | null {
  const out: string[] = [];
  for (const item of items) {
    const v = getByPath(item, field);
    if (v === null || v === undefined || v === '') continue;
    if (!isIsoDateString(v)) return null;
    out.push(v.trim());
  }
  return out.length > 0 ? out : null;
}

/**
 * Egalite lache alignee sur dsfr-data-query (#278/#303). Un champ TABLEAU
 * (tags, catégories multiples) matche si l'un de ses éléments est égal
 * (sémantique contains, #673) : `count:tags:urgent` compte les lignes dont
 * les tags contiennent « urgent ».
 */
function looseEquals(a: unknown, b: unknown): boolean {
  if (Array.isArray(a)) return a.some((el) => looseEquals(el, b));
  if (a === null || a === undefined) return b === null || b === undefined;
  // eslint-disable-next-line eqeqeq -- coercition lache intentionnelle
  if (a == b) return true;
  return String(a) === String(b);
}
