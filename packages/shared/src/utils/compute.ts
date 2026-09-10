/**
 * Pure, safe expression evaluator for computed columns (`compute` attribute of
 * dsfr-data-normalize).
 *
 * Grammar v2 (#671, ADR-105) — strict extension of the original arithmetic:
 *   - arithmetic on numeric fields + constants: + - * /
 *   - text concatenation with `+` and single-quoted string literals
 *   - parentheses for precedence
 *   - whitelisted functions, `f(a, b)` call syntax (see FUNCTIONS)
 *   - conditions: `when <cond> then <expr> [when … then …]… else <expr>`
 *     (`else` is mandatory: no silent `undefined`)
 *   - comparisons `= != < <= > >=`, boolean `and` / `or` / `not`,
 *     literals `null`, `true`, `false`
 *
 * Equality is LOOSE and identical to the `where` attribute (`looseEquals`,
 * number ↔ numeric string): `when cat = 'A'` and `where="cat:eq:A"` keep the
 * same rows. Ordering comparisons are numeric when both sides parse as a
 * number (`toNumber`, French decimals included), lexicographic otherwise
 * (ISO dates compare correctly); null, undefined and '' never match.
 *
 * Still out of scope: aggregated values (query / kpi), windowing (previous
 * row, cumulative sum), user-defined functions.
 *
 * Safety: tokenizer + recursive-descent parser → AST → evaluator. NEVER uses
 * eval()/new Function() — public repo + miweb mirror, no injection. Only the
 * fields of the current row are reachable (`isUnsafeKey` guard on names),
 * expression length and nesting depth are bounded.
 */

import { toNumber, looksLikeNumber } from './number-parser.js';
import { isUnsafeKey } from './security.js';
import { looseEquals } from '../query/filter-translator.js';

type Row = Record<string, unknown>;

// --- Guard rails ---

/** Maximum length of one expression (right-hand side of an assignment). */
export const COMPUTE_MAX_EXPRESSION_LENGTH = 2000;
/** Maximum nesting depth (parentheses, function calls, `when`, unary chains). */
export const COMPUTE_MAX_DEPTH = 32;

// --- AST ---

type CmpOp = '=' | '!=' | '<' | '<=' | '>' | '>=';

type Node =
  | { type: 'num'; value: number }
  | { type: 'str'; value: string }
  | { type: 'null' }
  | { type: 'bool'; value: boolean }
  | { type: 'field'; name: string }
  | { type: 'neg'; operand: Node }
  | { type: 'not'; operand: Node }
  | { type: 'bin'; op: '+' | '-' | '*' | '/'; left: Node; right: Node }
  | { type: 'cmp'; op: CmpOp; left: Node; right: Node }
  | { type: 'and'; left: Node; right: Node }
  | { type: 'or'; left: Node; right: Node }
  | { type: 'call'; name: string; fn: FunctionSpec; args: Node[] }
  | { type: 'when'; branches: Array<{ cond: Node; value: Node }>; otherwise: Node };

export interface CompiledAssignment {
  target: string;
  ast: Node;
}

export type CompiledCompute = CompiledAssignment[];

// --- Function whitelist ---

/** Signature of a whitelisted function: arity bounds and implementation. */
interface FunctionSpec {
  min: number;
  /** `Infinity` = variadic. */
  max: number;
  impl: (args: unknown[]) => unknown;
}

/** Returns the numeric value of v if it is a number or a numeric-looking string, else null. */
function numberish(v: unknown): number | null {
  if (typeof v === 'number') return isFinite(v) ? v : null;
  if (typeof v === 'string' && looksLikeNumber(v)) return toNumber(v, true);
  return null;
}

function isNil(v: unknown): boolean {
  return v === null || v === undefined;
}

function isEmpty(v: unknown): boolean {
  if (isNil(v)) return true;
  if (v === '') return true;
  return Array.isArray(v) && v.length === 0;
}

/** Text view of a value for string functions: null/undefined stay null. */
function textOf(v: unknown): string | null {
  if (isNil(v)) return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v.toISOString();
  return String(v);
}

/**
 * ISO 8601 calendar date, optionally partial (`2024`, `2024-05`) and
 * optionally followed by a time part (`T10:00:00Z`, ` 10:00`). Components are
 * read from the string itself, never through `new Date()`: a bare date
 * parsed by the engine would shift by the timezone offset.
 */
// Each quantifier applies to a disjoint class from the next character: no exponential backtracking.
// eslint-disable-next-line security/detect-unsafe-regex
const ISO_DATE = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?(?:[T ].*)?$/;

function dateParts(v: unknown): { year: number; month: number | null; day: number | null } | null {
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return null;
    return { year: v.getFullYear(), month: v.getMonth() + 1, day: v.getDate() };
  }
  if (typeof v !== 'string') return null;
  const m = ISO_DATE.exec(v.trim());
  if (!m) return null;
  return {
    year: parseInt(m[1], 10),
    month: m[2] !== undefined ? parseInt(m[2], 10) : null,
    day: m[3] !== undefined ? parseInt(m[3], 10) : null,
  };
}

function numericFn(fn: (n: number) => number): (args: unknown[]) => unknown {
  return (args) => {
    const n = numberish(args[0]);
    return n === null ? null : fn(n);
  };
}

function textFn(fn: (s: string) => unknown): (args: unknown[]) => unknown {
  return (args) => {
    const s = textOf(args[0]);
    return s === null ? null : fn(s);
  };
}

const FUNCTIONS: Record<string, FunctionSpec> = {
  // Dates — ISO string or Date → number, null otherwise.
  year: { min: 1, max: 1, impl: (a) => dateParts(a[0])?.year ?? null },
  month: { min: 1, max: 1, impl: (a) => dateParts(a[0])?.month ?? null },
  day: { min: 1, max: 1, impl: (a) => dateParts(a[0])?.day ?? null },

  // Numbers — non-numeric input → null (never a plausible 0).
  round: {
    min: 1,
    max: 2,
    impl: (a) => {
      const n = numberish(a[0]);
      if (n === null) return null;
      const decimals = a.length > 1 ? (numberish(a[1]) ?? 0) : 0;
      const factor = 10 ** Math.max(0, Math.trunc(decimals));
      return Math.round(n * factor) / factor;
    },
  },
  abs: { min: 1, max: 1, impl: numericFn(Math.abs) },
  floor: { min: 1, max: 1, impl: numericFn(Math.floor) },
  ceil: { min: 1, max: 1, impl: numericFn(Math.ceil) },

  // Text — null stays null; a number is converted to its text form.
  lower: { min: 1, max: 1, impl: textFn((s) => s.toLowerCase()) },
  upper: { min: 1, max: 1, impl: textFn((s) => s.toUpperCase()) },
  trim: { min: 1, max: 1, impl: textFn((s) => s.trim()) },
  len: {
    min: 1,
    max: 1,
    impl: (a) => {
      if (isNil(a[0])) return 0;
      if (Array.isArray(a[0])) return a[0].length;
      return String(a[0]).length;
    },
  },
  concat: {
    min: 1,
    max: Infinity,
    impl: (a) => a.map((v) => (isNil(v) ? '' : String(v))).join(''),
  },
  replace: {
    min: 3,
    max: 3,
    impl: (a) => {
      const s = textOf(a[0]);
      if (s === null) return null;
      const search = isNil(a[1]) ? '' : String(a[1]);
      const by = isNil(a[2]) ? '' : String(a[2]);
      // Literal search, all occurrences, no regex (split/join, never RegExp).
      return search === '' ? s : s.split(search).join(by);
    },
  },

  // Absence
  coalesce: {
    min: 1,
    max: Infinity,
    impl: (a) => {
      for (const v of a) if (!isNil(v)) return v;
      return null;
    },
  },
  is_null: { min: 1, max: 1, impl: (a) => isNil(a[0]) },
  is_empty: { min: 1, max: 1, impl: (a) => isEmpty(a[0]) },

  // Arrays
  join: {
    min: 1,
    max: 2,
    impl: (a) => {
      const sep = a.length > 1 ? (isNil(a[1]) ? '' : String(a[1])) : ', ';
      if (isNil(a[0])) return null;
      if (Array.isArray(a[0])) return a[0].map((v) => (isNil(v) ? '' : String(v))).join(sep);
      return String(a[0]);
    },
  },
  contains: {
    min: 2,
    max: 2,
    impl: (a) => {
      const haystack = a[0];
      if (isNil(haystack)) return false;
      // Array: loose equality per element (same as `where` `in`).
      if (Array.isArray(haystack)) return haystack.some((v) => looseEquals(v, a[1]));
      // Text: case-insensitive substring (same as `where` `contains`).
      if (isNil(a[1])) return false;
      return String(haystack).toLowerCase().includes(String(a[1]).toLowerCase());
    },
  },
};

/** Whitelisted function names, in documentation order. */
export const COMPUTE_FUNCTIONS: readonly string[] = Object.freeze(Object.keys(FUNCTIONS));

const KEYWORDS = new Set(['when', 'then', 'else', 'and', 'or', 'not', 'null', 'true', 'false']);

// --- Tokenizer ---

type Token =
  | { t: 'num'; v: number }
  | { t: 'str'; v: string }
  | { t: 'ident'; v: string }
  | { t: 'kw'; v: string }
  | { t: 'op'; v: '+' | '-' | '*' | '/' }
  | { t: 'cmp'; v: CmpOp }
  | { t: 'comma' }
  | { t: 'lparen' }
  | { t: 'rparen' };

// Identifiers: letters (incl. accented), digits, underscore. No spaces.
const IDENT_START = /[A-Za-zÀ-ÿ_]/;
const IDENT_PART = /[A-Za-zÀ-ÿ0-9_]/;

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const ch = input[i];

    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      i++;
      continue;
    }

    if (ch === '(') {
      tokens.push({ t: 'lparen' });
      i++;
      continue;
    }
    if (ch === ')') {
      tokens.push({ t: 'rparen' });
      i++;
      continue;
    }
    if (ch === ',') {
      tokens.push({ t: 'comma' });
      i++;
      continue;
    }
    if (ch === '+' || ch === '-' || ch === '*' || ch === '/') {
      tokens.push({ t: 'op', v: ch });
      i++;
      continue;
    }

    // Comparison operators (two-character forms first)
    const two = input.slice(i, i + 2);
    if (two === '!=' || two === '<=' || two === '>=') {
      tokens.push({ t: 'cmp', v: two });
      i += 2;
      continue;
    }
    if (two === '==' || two === '<>') {
      throw new Error(`compute: opérateur "${two}" inconnu (écrire "=" ou "!=")`);
    }
    if (ch === '=' || ch === '<' || ch === '>') {
      tokens.push({ t: 'cmp', v: ch });
      i++;
      continue;
    }

    // String literal (single quotes)
    if (ch === "'") {
      let j = i + 1;
      let str = '';
      while (j < input.length && input[j] !== "'") {
        str += input[j];
        j++;
      }
      if (j >= input.length) {
        throw new Error(`compute: chaîne non terminée près de "${input.slice(i)}"`);
      }
      tokens.push({ t: 'str', v: str });
      i = j + 1;
      continue;
    }

    // Number literal (international dot notation)
    if (ch >= '0' && ch <= '9') {
      let j = i;
      let num = '';
      while (j < input.length && ((input[j] >= '0' && input[j] <= '9') || input[j] === '.')) {
        num += input[j];
        j++;
      }
      tokens.push({ t: 'num', v: parseFloat(num) });
      i = j;
      continue;
    }

    // Identifier (field name, function name) or keyword
    if (IDENT_START.test(ch)) {
      let j = i;
      let name = '';
      while (j < input.length && IDENT_PART.test(input[j])) {
        name += input[j];
        j++;
      }
      tokens.push(KEYWORDS.has(name) ? { t: 'kw', v: name } : { t: 'ident', v: name });
      i = j;
      continue;
    }

    throw new Error(`compute: caractère inattendu "${ch}" dans l'expression`);
  }
  return tokens;
}

// --- Parser (recursive descent) ---
//
// Precedence, lowest to highest:
//   when … then … else   (also accepted as a primary, so it nests in arithmetic)
//   or
//   and
//   not
//   = != < <= > >=       (non-associative: one comparison per level)
//   + -
//   * /
//   unary -
//   primary: literal, field, f(args), ( expr )

class Parser {
  private pos = 0;
  private depth = 0;
  constructor(private tokens: Token[]) {}

  parse(): Node {
    const node = this.parseExpr();
    if (this.pos < this.tokens.length) {
      throw new Error(
        `compute: expression mal formée (jeton restant : ${this.describe(this.peek())})`
      );
    }
    return node;
  }

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  private describe(tok: Token | undefined): string {
    if (!tok) return 'fin';
    switch (tok.t) {
      case 'num':
        return String(tok.v);
      case 'str':
        return `'${tok.v}'`;
      case 'ident':
      case 'kw':
      case 'op':
      case 'cmp':
        return `"${tok.v}"`;
      case 'comma':
        return '","';
      case 'lparen':
        return '"("';
      case 'rparen':
        return '")"';
    }
  }

  private isKw(tok: Token | undefined, kw: string): boolean {
    return !!tok && tok.t === 'kw' && tok.v === kw;
  }

  private expectKw(kw: string, context: string): void {
    if (!this.isKw(this.peek(), kw)) {
      throw new Error(`compute: "${kw}" attendu ${context}, trouvé ${this.describe(this.peek())}`);
    }
    this.pos++;
  }

  private enter(): void {
    this.depth++;
    if (this.depth > COMPUTE_MAX_DEPTH) {
      throw new Error(
        `compute: expression trop imbriquée (profondeur maximale ${COMPUTE_MAX_DEPTH})`
      );
    }
  }

  private leave(): void {
    this.depth--;
  }

  private parseExpr(): Node {
    this.enter();
    try {
      if (this.isKw(this.peek(), 'when')) return this.parseWhen();
      return this.parseOr();
    } finally {
      this.leave();
    }
  }

  private parseWhen(): Node {
    const branches: Array<{ cond: Node; value: Node }> = [];
    while (this.isKw(this.peek(), 'when')) {
      this.pos++;
      const cond = this.parseOr();
      this.expectKw('then', 'après la condition d\'un "when"');
      const value = this.parseExpr();
      branches.push({ cond, value });
    }
    if (!this.isKw(this.peek(), 'else')) {
      throw new Error(
        'compute: "when" sans "else" — la branche par défaut est obligatoire ' +
          '(when … then … else …)'
      );
    }
    this.pos++;
    const otherwise = this.parseExpr();
    return { type: 'when', branches, otherwise };
  }

  private parseOr(): Node {
    let left = this.parseAnd();
    while (this.isKw(this.peek(), 'or')) {
      this.pos++;
      const right = this.parseAnd();
      left = { type: 'or', left, right };
    }
    return left;
  }

  private parseAnd(): Node {
    let left = this.parseNot();
    while (this.isKw(this.peek(), 'and')) {
      this.pos++;
      const right = this.parseNot();
      left = { type: 'and', left, right };
    }
    return left;
  }

  private parseNot(): Node {
    if (this.isKw(this.peek(), 'not')) {
      this.pos++;
      this.enter();
      try {
        return { type: 'not', operand: this.parseNot() };
      } finally {
        this.leave();
      }
    }
    return this.parseCmp();
  }

  private parseCmp(): Node {
    const left = this.parseAdd();
    const tok = this.peek();
    if (tok && tok.t === 'cmp') {
      this.pos++;
      const right = this.parseAdd();
      const next = this.peek();
      if (next && next.t === 'cmp') {
        throw new Error(
          `compute: comparaisons enchaînées non supportées (a ${tok.v} b ${next.v} c) — ` +
            'écrire deux comparaisons reliées par "and"'
        );
      }
      return { type: 'cmp', op: tok.v, left, right };
    }
    return left;
  }

  private parseAdd(): Node {
    let left = this.parseMul();
    let tok = this.peek();
    while (tok && tok.t === 'op' && (tok.v === '+' || tok.v === '-')) {
      this.pos++;
      const right = this.parseMul();
      left = { type: 'bin', op: tok.v, left, right };
      tok = this.peek();
    }
    return left;
  }

  private parseMul(): Node {
    let left = this.parseUnary();
    let tok = this.peek();
    while (tok && tok.t === 'op' && (tok.v === '*' || tok.v === '/')) {
      this.pos++;
      const right = this.parseUnary();
      left = { type: 'bin', op: tok.v, left, right };
      tok = this.peek();
    }
    return left;
  }

  private parseUnary(): Node {
    const tok = this.peek();
    if (tok && tok.t === 'op' && tok.v === '-') {
      this.pos++;
      this.enter();
      try {
        return { type: 'neg', operand: this.parseUnary() };
      } finally {
        this.leave();
      }
    }
    return this.parsePrimary();
  }

  private parsePrimary(): Node {
    const tok = this.peek();
    if (!tok) throw new Error('compute: expression incomplète');

    if (tok.t === 'num') {
      this.pos++;
      return { type: 'num', value: tok.v };
    }
    if (tok.t === 'str') {
      this.pos++;
      return { type: 'str', value: tok.v };
    }
    if (tok.t === 'kw') {
      if (tok.v === 'null') {
        this.pos++;
        return { type: 'null' };
      }
      if (tok.v === 'true' || tok.v === 'false') {
        this.pos++;
        return { type: 'bool', value: tok.v === 'true' };
      }
      // A `when` nested inside arithmetic: `1 + when … else …` (greedy to the right).
      if (tok.v === 'when') return this.parseExpr();
      throw new Error(`compute: mot-clé "${tok.v}" inattendu`);
    }
    if (tok.t === 'ident') {
      this.pos++;
      const next = this.peek();
      if (next && next.t === 'lparen') return this.parseCall(tok.v);
      if (isUnsafeKey(tok.v)) {
        throw new Error(`compute: nom de champ interdit "${tok.v}"`);
      }
      return { type: 'field', name: tok.v };
    }
    if (tok.t === 'lparen') {
      this.pos++;
      const node = this.parseExpr();
      const next = this.peek();
      if (!next || next.t !== 'rparen') {
        throw new Error('compute: parenthèse fermante manquante');
      }
      this.pos++;
      return node;
    }
    throw new Error(`compute: jeton inattendu dans l'expression (${this.describe(tok)})`);
  }

  /** `name(` already consumed up to the identifier; the `(` is the current token. */
  private parseCall(name: string): Node {
    const spec = Object.prototype.hasOwnProperty.call(FUNCTIONS, name) ? FUNCTIONS[name] : null;
    if (!spec) {
      throw new Error(
        `compute: fonction inconnue "${name}" — fonctions acceptées : ${COMPUTE_FUNCTIONS.join(', ')}`
      );
    }
    this.pos++; // (
    const args: Node[] = [];
    if (this.peek()?.t !== 'rparen') {
      for (;;) {
        args.push(this.parseExpr());
        const next = this.peek();
        if (next && next.t === 'comma') {
          this.pos++;
          continue;
        }
        break;
      }
    }
    const close = this.peek();
    if (!close || close.t !== 'rparen') {
      throw new Error(`compute: parenthèse fermante manquante après les arguments de "${name}"`);
    }
    this.pos++;
    if (args.length < spec.min || args.length > spec.max) {
      const expected =
        spec.max === Infinity
          ? `au moins ${spec.min}`
          : spec.min === spec.max
            ? `${spec.min}`
            : `${spec.min} à ${spec.max}`;
      throw new Error(
        `compute: "${name}" attend ${expected} argument${spec.min > 1 || spec.max > 1 ? 's' : ''}, ${args.length} reçu${args.length > 1 ? 's' : ''}`
      );
    }
    return { type: 'call', name, fn: spec, args };
  }
}

// --- Compile ---

/**
 * Split on `;` outside single-quoted strings: `label = when x then 'a; b' else ''`
 * must not be cut in the middle of the literal.
 */
function splitAssignments(attr: string): string[] {
  const parts: string[] = [];
  let current = '';
  let inString = false;
  for (const ch of attr) {
    if (ch === "'") inString = !inString;
    if (ch === ';' && !inString) {
      parts.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  parts.push(current);
  return parts;
}

/**
 * Parse a `compute` attribute (`target = expr; target2 = expr2`) into compiled
 * assignments. The expressions are parsed once here, not per row. Throws an
 * `Error` whose message names the fault (unknown function, wrong arity,
 * `when` without `else`, unexpected token…) — the caller reports it as a
 * configuration error, never silently.
 */
export function compileCompute(attr: string): CompiledCompute {
  const compiled: CompiledCompute = [];
  if (!attr || !attr.trim()) return compiled;

  for (const part of splitAssignments(attr)) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) {
      throw new Error(`compute: assignation invalide "${trimmed}" (attendu "champ = expression")`);
    }
    const target = trimmed.slice(0, eq).trim();
    const exprStr = trimmed.slice(eq + 1).trim();
    if (!target) throw new Error('compute: nom de champ cible manquant');
    if (isUnsafeKey(target)) throw new Error(`compute: nom de champ cible interdit "${target}"`);
    if (!exprStr) throw new Error(`compute: expression manquante pour "${target}"`);
    if (exprStr.length > COMPUTE_MAX_EXPRESSION_LENGTH) {
      throw new Error(
        `compute: expression trop longue pour "${target}" ` +
          `(${exprStr.length} caractères, maximum ${COMPUTE_MAX_EXPRESSION_LENGTH})`
      );
    }
    const ast = new Parser(tokenize(exprStr)).parse();
    compiled.push({ target, ast });
  }
  return compiled;
}

// --- Evaluate ---

/**
 * Truthiness of a `when` condition or boolean operand: false, null,
 * undefined, '', 0 and NaN are false; anything else is true.
 */
function truthy(v: unknown): boolean {
  if (v === null || v === undefined || v === false || v === '' || v === 0) return false;
  if (typeof v === 'number' && isNaN(v)) return false;
  return true;
}

/**
 * Ordering comparison for `< <= > >=`: null when either side is absent
 * (null, undefined, '') — such a comparison never matches, as in `where`.
 * Numeric when both sides parse as a number (`toNumber`), lexicographic
 * (code-point order) otherwise, which is right for ISO dates.
 */
function compareOrder(a: unknown, b: unknown): number | null {
  if (a === null || a === undefined || a === '') return null;
  if (b === null || b === undefined || b === '') return null;
  const an = numberish(a);
  const bn = numberish(b);
  if (an !== null && bn !== null) return an - bn;
  const as = String(a);
  const bs = String(b);
  return as < bs ? -1 : as > bs ? 1 : 0;
}

function evalCmp(op: CmpOp, l: unknown, r: unknown): boolean {
  switch (op) {
    case '=':
      return looseEquals(l, r);
    case '!=':
      return !looseEquals(l, r);
    default: {
      const cmp = compareOrder(l, r);
      if (cmp === null) return false;
      switch (op) {
        case '<':
          return cmp < 0;
        case '<=':
          return cmp <= 0;
        case '>':
          return cmp > 0;
        case '>=':
          return cmp >= 0;
      }
    }
  }
}

function evalNode(node: Node, row: Row): unknown {
  switch (node.type) {
    case 'num':
      return node.value;
    case 'str':
      return node.value;
    case 'null':
      return null;
    case 'bool':
      return node.value;
    case 'field':
      return Object.prototype.hasOwnProperty.call(row, node.name) ? row[node.name] : undefined;
    case 'neg':
      return -toNumber(evalNode(node.operand, row));
    case 'not':
      return !truthy(evalNode(node.operand, row));
    case 'and':
      return truthy(evalNode(node.left, row)) && truthy(evalNode(node.right, row));
    case 'or':
      return truthy(evalNode(node.left, row)) || truthy(evalNode(node.right, row));
    case 'cmp':
      return evalCmp(node.op, evalNode(node.left, row), evalNode(node.right, row));
    case 'call':
      return node.fn.impl(node.args.map((arg) => evalNode(arg, row)));
    case 'when': {
      for (const branch of node.branches) {
        if (truthy(evalNode(branch.cond, row))) return evalNode(branch.value, row);
      }
      return evalNode(node.otherwise, row);
    }
    case 'bin': {
      const l = evalNode(node.left, row);
      const r = evalNode(node.right, row);
      if (node.op === '+') {
        // `+` is overloaded: numeric add when both sides are numberish, else string concat.
        const ln = numberish(l);
        const rn = numberish(r);
        if (ln !== null && rn !== null) return ln + rn;
        return `${l ?? ''}${r ?? ''}`;
      }
      const a = toNumber(l);
      const b = toNumber(r);
      switch (node.op) {
        case '-':
          return a - b;
        case '*':
          return a * b;
        case '/':
          return a / b;
      }
    }
  }
}

/**
 * Apply compiled assignments to a row, mutating a shallow copy. Each target field
 * is computed in order, so a later assignment can reference an earlier one.
 */
export function applyCompute(row: Row, compiled: CompiledCompute): Row {
  if (compiled.length === 0) return row;
  const result: Row = { ...row };
  for (const { target, ast } of compiled) {
    result[target] = evalNode(ast, result);
  }
  return result;
}

/** Names of the columns an assignment list produces, in declaration order (deduplicated). */
export function computeTargets(compiled: CompiledCompute): string[] {
  return Array.from(new Set(compiled.map((c) => c.target)));
}
