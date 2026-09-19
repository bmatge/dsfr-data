/**
 * Filter translation utilities.
 * Converts dsfr-data-query colon-syntax filters to ODSQL where clauses
 * and applies filters to local data arrays.
 *
 * Aligné sur la couche WHERE partagée (#271/#315) : valeurs percent-décodées
 * après découpage (`unescapeColonValue`), échappement ODSQL des guillemets
 * et antislashes, et parité serveur/local sur les 12 opérateurs
 * (eq, neq, gt, gte, lt, lte, contains, notcontains, in, notin, isnull, isnotnull).
 */

import { unescapeColonValue } from '../utils/colon-escape.js';

/**
 * Échappe une chaîne destinée à être interpolée dans une string ODSQL (`"…"`).
 * Ordre crucial : backslashes d'abord, puis les doubles quotes.
 * (Même implémentation que escapeOdsqlString de l'adapter ODS.)
 */
function escapeOdsql(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/** Nombre simple, éventuellement signé, décimales `.`, notation scientifique. */
// Chaque quantificateur porte sur une classe disjointe du caractère suivant : pas de backtracking exponentiel.
// eslint-disable-next-line security/detect-unsafe-regex
const PLAIN_NUMBER = /^[+-]?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/;

/**
 * Littéral ODSQL : numérique non quoté pour les comparaisons arithmétiques,
 * sinon string quotée échappée.
 */
function odsqlLiteral(value: string, preferNumeric: boolean): string {
  if (preferNumeric && PLAIN_NUMBER.test(value.trim())) return value.trim();
  return `"${escapeOdsql(value)}"`;
}

/**
 * Convert a dsfr-data-query filter expression (field:operator:value) to an ODSQL where clause.
 * Supports 12 operators: eq, neq, gt, gte, lt, lte, contains, notcontains, in, notin, isnull, isnotnull.
 *
 * LES DEUX ÉCRITURES DE LA NÉGATION EN ODSQL (#958), mesurées le 2026-09-20 sur
 * `retours-formulaire-votre-avis-copie` de data.education.gouv.fr, champ
 * `themes_attendus` (176 lignes, 21 nulles, 155 renseignées, `= "Elèves"` -> 124) :
 *
 *   themes_attendus != "Elèves"          ->  31   logique à TROIS valeurs,
 *                                                 les nulles sont EXCLUES
 *   NOT themes_attendus = "Elèves"       ->  52   complément exact de la clause,
 *   not(themes_attendus = "Elèves")      ->  52   les nulles sont GARDÉES
 *   NOT themes_attendus in ("Elèves")    ->  52
 *   NOT themes_attendus like "%Elèves%"  ->  52
 *   themes_attendus not in (…)                   ODSQL syntax exception
 *   themes_attendus not like "%…%"               ODSQL syntax exception
 *
 * Ce ne sont donc pas deux façons d'écrire la même chose : `!=` est la seule
 * écriture à trois valeurs, `NOT <clause>` est une négation booléenne à deux.
 * Conséquence sur ce qu'on émet, et sur ce que le client doit imiter :
 *
 *   `neq`         -> `champ != v`             nulls exclus  -> le client aussi (#958)
 *   `notin`       -> `NOT champ in (…)`       nulls gardés  -> le client aussi
 *   `notcontains` -> `NOT champ like "%…%"`   nulls gardés  -> le client aussi
 *
 * `notin` et `notcontains` ne sont PAS alignés sur `neq` : ODSQL n'ayant pas
 * d'infixe `not in` / `not like`, la seule traduction possible est `NOT …`,
 * qui garde les nulles. Les aligner « par symétrie » rouvrirait la divergence
 * client/serveur que #958 ferme.
 */
export function filterToOdsql(filterExpr: string): string {
  const opMap: Record<string, string> = {
    eq: '=',
    neq: '!=',
    gt: '>',
    gte: '>=',
    lt: '<',
    lte: '<=',
  };
  return filterExpr
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
    .map((part) => {
      const segs = part.split(':');
      if (segs.length < 2) return '';
      const field = segs[0];
      const op = segs[1];
      // Operateurs sans valeur (2 segments seulement)
      if (op === 'isnull') return `${field} is null`;
      if (op === 'isnotnull') return `${field} is not null`;
      if (segs.length < 3) return '';
      const rawVal = segs.slice(2).join(':');
      const val = unescapeColonValue(rawVal);
      if (op === 'contains') return `${field} like "%${escapeOdsql(val)}%"`;
      if (op === 'notcontains') return `NOT ${field} like "%${escapeOdsql(val)}%"`;
      if (op === 'in')
        return `${field} in (${rawVal
          .split('|')
          .map((v) => `"${escapeOdsql(unescapeColonValue(v))}"`)
          .join(', ')})`;
      if (op === 'notin')
        return `NOT ${field} in (${rawVal
          .split('|')
          .map((v) => `"${escapeOdsql(unescapeColonValue(v))}"`)
          .join(', ')})`;
      const sqlOp = opMap[op];
      if (!sqlOp) return '';
      // Comparaisons arithmétiques : littéral numérique NON quoté, sinon ODS
      // compare des strings ("9" > "10")
      const numeric = op === 'gt' || op === 'gte' || op === 'lt' || op === 'lte';
      return `${field} ${sqlOp} ${odsqlLiteral(val, numeric)}`;
    })
    .filter(Boolean)
    .join(' AND ');
}

/**
 * Égalité lâche unique (#278) : coercition string/number (`"75" == 75`),
 * repli `String === String` pour les booléens (`true` vs `"true"`).
 * Même sémantique que `_looseEquals` de dsfr-data-query. Partagée avec les
 * comparaisons `=` / `!=` de `compute` (#671) : `where="cat:eq:A"` et
 * `when cat = 'A'` gardent les mêmes lignes.
 *
 * CHAMP TABLEAU (#953, ex-#842) : elle regarde DANS le tableau — un champ
 * multivalué matche dès qu'un de ses éléments est égal — **et garde le repli
 * textuel en OU** :
 *
 *   eq(valeur, v) = (valeur est un tableau et un élément vaut v) OU
 *                   String(valeur) === String(v)
 *
 * C'est ce que fait Opendatasoft, mesuré le 2026-09-19 sur deux portails et
 * deux endpoints (`keyword` du catalogue economie, `themes_attendus` de
 * `retours-formulaire-votre-avis-copie` sur education) : `where=champ = "x"`
 * trouve sur n'importe quel élément, jamais sur le rendu texte complet.
 * Le comportement d'avant n'était pas une sémantique, c'était
 * `Array.prototype.toString`.
 *
 * Le repli textuel est GARDÉ alors que le serveur ne l'a pas, et c'est le
 * point qui rend le changement sûr : sur `eq` / `in`, le client ne peut que
 * GAGNER des correspondances, jamais en perdre (`['a','b']` matche encore
 * `'a,b'` en local, alors que le portail rendrait 0 sur cette clause).
 *
 * L'EXCEPTION : `neq` / `notin` étant la négation de `eq` / `in`, une ligne
 * multivaluée que `neq` gardait à tort en sort désormais. Le serveur fait
 * pareil (`!=` y est la négation stricte de `=`, nuls exclus des deux côtés) :
 * mesuré, 176 lignes dont 21 nulles, `= "Elèves"` → 124, `!= "Elèves"` → 31,
 * soit exactement 155 − 124.
 *
 * `field` est purement diagnostique : quand il est fourni, un avertissement de
 * transition nomme le champ et la valeur des lignes qui se mettent à compter
 * (voir `warnArrayEqualityTransition`).
 */
export function looseEquals(a: unknown, b: unknown, field?: string): boolean {
  if (a === null || a === undefined) return b === null || b === undefined;
  if (Array.isArray(a) && a.some((el) => looseEqualsQuiet(el, b))) {
    // Seulement quand c'est la voie TABLEAU qui a décidé : si le repli textuel
    // matchait déjà, la ligne comptait avant et le compte ne bouge pas.
    // eslint-disable-next-line eqeqeq -- comparaison lâche volontaire
    if (!(a == b) && String(a) !== String(b)) warnArrayEqualityTransition(field, b);
    return true;
  }
  // eslint-disable-next-line eqeqeq -- loose equality intentional (string/number coercion)
  if (a == b) return true;
  return String(a) === String(b);
}

/**
 * Négation lâche de {@link looseEquals}, avec la logique SQL à TROIS VALEURS
 * du portail (#958) : **une valeur absente ne satisfait ni `=` ni `!=`**.
 *
 * `eq` excluait déjà les nulles (`looseEquals(null, 'x')` est faux) ; `neq`,
 * écrit `!looseEquals(…)`, les gardait — d'où le même `champ:neq:valeur`
 * rendant deux comptes selon qu'il partait au serveur ou non, ce que ne dit
 * aucune balise. Mesuré le 2026-09-20 sur `themes_attendus` de
 * `retours-formulaire-votre-avis-copie` (data.education.gouv.fr), 176 lignes
 * dont 21 nulles :
 *
 *   themes_attendus = "Elèves"   -> 124
 *   themes_attendus != "Elèves"  ->  31 = 155 − 124, et NON 52 = 176 − 124
 *   themes_attendus != "zzz"     -> 155, et non 176
 *
 * `eq` et `neq` ne partitionnent donc plus le jeu : les lignes absentes ne
 * sont d'aucun côté. C'est `isnull` / `isnotnull` qui les nomment.
 *
 * La chaîne VIDE reste une valeur, pas une absence : `''` passe un `neq`,
 * comme elle passait déjà un `eq:` vide.
 *
 * `field` est purement diagnostique : il nomme le champ dans l'avertissement
 * de transition (voir {@link warnNeqNullTransition}).
 */
export function looseNotEquals(a: unknown, b: unknown, field?: string): boolean {
  if (a === null || a === undefined) {
    warnNeqNullTransition(field);
    return false;
  }
  return !looseEquals(a, b, field);
}

/** `looseEquals` sans l'avertissement — récursion interne et tableaux imbriqués. */
function looseEqualsQuiet(a: unknown, b: unknown): boolean {
  if (a === null || a === undefined) return b === null || b === undefined;
  if (Array.isArray(a) && a.some((el) => looseEqualsQuiet(el, b))) return true;
  // eslint-disable-next-line eqeqeq -- loose equality intentional
  if (a == b) return true;
  return String(a) === String(b);
}

/** Plafond de couples (champ, valeur) mémorisés — la dédup ne doit pas fuir. */
const ARRAY_EQUALITY_WARN_MAX = 50;
const arrayEqualityWarned = new Set<string>();
let arrayEqualitySilenced = false;

/**
 * Avertissement de TRANSITION (#953), destiné à vivre une version mineure.
 *
 * Il ne sort que sur les lignes dont le compte change — celles que la voie
 * tableau fait matcher et que le repli textuel rejetait. Dédupliqué par couple
 * (champ, valeur) : ce dépôt a déjà payé une régression de 7 139
 * avertissements, un message par ligne serait inacceptable. Au-delà de
 * {@link ARRAY_EQUALITY_WARN_MAX} couples distincts, un dernier message dit
 * qu'on se tait et le Set cesse de croître.
 */
function warnArrayEqualityTransition(field: string | undefined, value: unknown): void {
  if (arrayEqualitySilenced) return;
  const cle = JSON.stringify([field ?? null, String(value)]);
  if (arrayEqualityWarned.has(cle)) return;
  if (arrayEqualityWarned.size >= ARRAY_EQUALITY_WARN_MAX) {
    arrayEqualitySilenced = true;
    console.warn(
      `dsfr-data: plus de ${ARRAY_EQUALITY_WARN_MAX} couples champ/valeur concernés par ` +
        `l'alignement de l'égalité sur les champs tableau — avertissements coupés pour la suite.`
    );
    return;
  }
  arrayEqualityWarned.add(cle);
  console.warn(
    `dsfr-data: champ tableau ${field ? `"${field}"` : '(champ non nommé)'} — l'égalité ` +
      `regarde désormais DANS le tableau : des lignes dont "${String(value)}" est un ÉLÉMENT ` +
      `(et non la valeur entière) se mettent à compter. Le compte s'aligne sur ce que renvoie ` +
      `le portail Opendatasoft quand la même clause lui est déléguée (#953). Avertissement de ` +
      `transition : il disparaîtra à la prochaine mineure.`
  );
}

/** Remet à zéro la déduplication des avertissements de transition (tests). */
export function resetArrayEqualityTransitionWarnings(): void {
  arrayEqualityWarned.clear();
  arrayEqualitySilenced = false;
}

/** Plafond de champs mémorisés — la dédup ne doit pas fuir. */
const NEQ_NULL_WARN_MAX = 50;
const neqNullWarned = new Set<string>();
const neqNullEnAttente = new Map<string, number>();
let neqNullSilenced = false;
let neqNullFlushPrevu = false;

/**
 * Avertissement de TRANSITION (#958), destiné à vivre une version mineure.
 *
 * Il ne sort que sur les lignes dont le compte change — celles dont le champ
 * est absent et qu'un `neq` retenait. Contrairement à #953, ce changement en
 * RETIRE : une page peut perdre des lignes sans que son balisage ait bougé,
 * donc le message doit nommer le champ ET dire combien de lignes cessent
 * d'être comptées, sans quoi personne ne retrouve la cause.
 *
 * Le compte n'est connu qu'une fois le filtre passé sur toutes les lignes :
 * les lignes concernées sont accumulées par champ et le message part en fin
 * de tâche (microtâche), une seule fois par champ. Dédupliqué par CHAMP, pas
 * par ligne : ce dépôt a déjà payé une régression de 7 139 avertissements.
 * Au-delà de {@link NEQ_NULL_WARN_MAX} champs distincts, un dernier message
 * dit qu'on se tait et le Set cesse de croître.
 */
export function warnNeqNullTransition(field: string | undefined): void {
  if (neqNullSilenced) return;
  const cle = field ?? '(champ non nommé)';
  if (neqNullWarned.has(cle)) return;
  neqNullEnAttente.set(cle, (neqNullEnAttente.get(cle) ?? 0) + 1);
  if (neqNullFlushPrevu) return;
  neqNullFlushPrevu = true;
  queueMicrotask(viderNeqNullEnAttente);
}

function viderNeqNullEnAttente(): void {
  neqNullFlushPrevu = false;
  for (const [cle, lignes] of neqNullEnAttente) {
    if (neqNullWarned.has(cle)) continue;
    if (neqNullWarned.size >= NEQ_NULL_WARN_MAX) {
      neqNullSilenced = true;
      console.warn(
        `dsfr-data: plus de ${NEQ_NULL_WARN_MAX} champs concernés par l'alignement des ` +
          `valeurs absentes sur un filtre de non-égalité — avertissements coupés pour la suite.`
      );
      break;
    }
    neqNullWarned.add(cle);
    console.warn(
      `dsfr-data: champ "${cle}" — ${lignes} ligne(s) dont la valeur est ABSENTE ne sont ` +
        `plus retenues par un filtre de non-égalité (\`${cle}:neq:…\`, \`!=\`). Une valeur ` +
        `absente ne satisfait ni l'égalité ni la non-égalité, comme le fait le portail ` +
        `Opendatasoft quand la même clause lui est déléguée (#958) : le compte baisse ici, ` +
        `mais les deux chemins donnent enfin le même. Pour les retrouver, ajouter une clause ` +
        `\`${cle}:isnull\`. Avertissement de transition : il disparaîtra à la prochaine mineure.`
    );
  }
  neqNullEnAttente.clear();
}

/** Remet à zéro la déduplication des avertissements de #958 (tests). */
export function resetNeqNullTransitionWarnings(): void {
  neqNullWarned.clear();
  neqNullEnAttente.clear();
  neqNullSilenced = false;
  neqNullFlushPrevu = false;
}

function isNumericValue(v: unknown): boolean {
  if (typeof v === 'number') return !isNaN(v);
  if (typeof v === 'string') return v.trim() !== '' && !isNaN(Number(v));
  return false;
}

/**
 * Comparaison pour gt/gte/lt/lte (#278) : null/undefined ne matchent jamais
 * (`Number(null) === 0` faisait passer les nulls — un serveur les exclut).
 * Numérique si les deux côtés le sont, sinon repli lexicographique (dates ISO).
 */
function compareForRange(value: unknown, ref: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (isNumericValue(value) && isNumericValue(ref)) {
    return Number(value) - Number(ref);
  }
  return String(value).localeCompare(String(ref));
}

/** Les 12 opérateurs du dialecte colon `champ:op[:valeur]` (query, KPI `where`). */
export const COLON_FILTER_OPERATORS = [
  'eq',
  'neq',
  'gt',
  'gte',
  'lt',
  'lte',
  'contains',
  'notcontains',
  'in',
  'notin',
  'isnull',
  'isnotnull',
] as const;

/**
 * Valide la grammaire colon d'un filtre (#674) sans l'appliquer : chaque
 * clause doit être `champ:op[:valeur]` avec un opérateur connu, et une
 * valeur sauf pour isnull/isnotnull. Retourne un message lisible (le
 * composant y préfixe son nom et l'attribut), ou null si tout est parsable.
 * Même contrat que la validation interne de dsfr-data-query.
 */
export function validateColonFilter(filterExpr: string): string | null {
  const known: readonly string[] = COLON_FILTER_OPERATORS;
  for (const part of filterExpr
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)) {
    const segs = part.split(':');
    if (segs.length < 2 || !segs[0].trim()) {
      return `clause "${part}" non reconnue — syntaxe attendue "champ:opérateur[:valeur]" (ex. "categorie:eq:Actif")`;
    }
    const op = segs[1];
    if (!known.includes(op)) {
      return `opérateur inconnu "${op}" dans la clause "${part}" — opérateurs acceptés : ${known.join(', ')}`;
    }
    if (segs.length < 3 && op !== 'isnull' && op !== 'isnotnull') {
      return `valeur manquante dans la clause "${part}" (seuls isnull/isnotnull s'utilisent sans valeur)`;
    }
  }
  return null;
}

/**
 * Apply a dsfr-data-query style filter (field:operator:value) to local data rows.
 * Supports the same 12 operators as filterToOdsql — same input, same rows kept.
 * Sémantique null alignée sur dsfr-data-query (#278), puis sur le portail
 * (#958) : les opérateurs positifs (eq, in, contains, comparaisons) ne
 * matchent jamais null/undefined ; `neq` non plus désormais — une valeur
 * absente ne satisfait NI `=` NI `!=`, c'est la logique SQL à trois valeurs
 * qu'applique Opendatasoft (`champ != v` -> 31 lignes là où le client en
 * rendait 52, mesuré). `notin` et `notcontains` les laissent toujours passer,
 * parce que l'adaptateur les traduit en `NOT …`, qui les garde aussi : voir
 * le tableau des deux écritures en tête de `filterToOdsql`.
 *
 * `getField` (#674) : résolution de la valeur d'un champ dans une ligne —
 * par défaut la clé directe `row[field]` ; un consommateur qui accepte des
 * chemins imbriqués (`fields.score`) passe son propre accesseur.
 *
 * CHAMP TABLEAU (#953, ex-#842) : `eq` / `neq` / `in` / `notin` regardent
 * DANS le tableau — `tags:eq:urgent` garde `tags: 'urgent'`, `['urgent']` ET
 * `['urgent','social']`, comme le fait le portail sur une clause déléguée.
 * Le repli textuel reste en OU, donc `eq` / `in` ne peuvent que gagner des
 * lignes ; `neq` / `notin`, étant leur négation, en perdent (le serveur aussi).
 * `tags:contains:urgent` n'est toujours PAS un équivalent d'`eq` — il cherche
 * une sous-chaîne dans `String(tableau)`, donc « non-urgent » matche
 * « urgent ».
 */
export function applyLocalFilter(
  data: Record<string, unknown>[],
  filterExpr: string,
  getField: (row: Record<string, unknown>, field: string) => unknown = (row, field) => row[field]
): Record<string, unknown>[] {
  const filters = filterExpr
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
    .map((part) => {
      const segs = part.split(':');
      if (segs.length < 2) return null;
      return { field: segs[0], op: segs[1], rawValue: segs.slice(2).join(':') };
    })
    .filter(Boolean) as { field: string; op: string; rawValue: string }[];

  return data.filter((row) =>
    filters.every((f) => {
      const v = getField(row, f.field);
      const value = unescapeColonValue(f.rawValue);
      switch (f.op) {
        case 'eq':
          return looseEquals(v, value, f.field);
        case 'neq':
          // Une valeur ABSENTE ne satisfait ni `eq` ni `neq` (#958).
          return looseNotEquals(v, value, f.field);
        case 'gt': {
          const cmp = compareForRange(v, value);
          return cmp !== null && cmp > 0;
        }
        case 'gte': {
          const cmp = compareForRange(v, value);
          return cmp !== null && cmp >= 0;
        }
        case 'lt': {
          const cmp = compareForRange(v, value);
          return cmp !== null && cmp < 0;
        }
        case 'lte': {
          const cmp = compareForRange(v, value);
          return cmp !== null && cmp <= 0;
        }
        case 'contains':
          // null ne contient rien (String(undefined)="undefined" matchait, #278)
          return (
            v !== null && v !== undefined && String(v).toLowerCase().includes(value.toLowerCase())
          );
        case 'notcontains':
          return (
            v === null || v === undefined || !String(v).toLowerCase().includes(value.toLowerCase())
          );
        case 'in':
          // Même sémantique lâche que eq, sur chaque token (#315/#278)
          return (
            v !== null &&
            v !== undefined &&
            f.rawValue
              .split('|')
              .some((token) => looseEquals(v, unescapeColonValue(token), f.field))
          );
        case 'notin':
          return (
            v === null ||
            v === undefined ||
            !f.rawValue
              .split('|')
              .some((token) => looseEquals(v, unescapeColonValue(token), f.field))
          );
        case 'isnull':
          return v === null || v === undefined;
        case 'isnotnull':
          return v !== null && v !== undefined;
        default:
          console.warn(
            `filter-translator: opérateur inconnu "${f.op}" ignoré (toutes lignes conservées)`
          );
          return true;
      }
    })
  );
}
