import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Tests #671 (ADR-105) — grammaire v2 de `compute` : fonctions en liste
 * blanche, `when … then … else`, comparaisons, booléens, `null`.
 *
 * Trois verrous :
 * - la grammaire, fonction par fonction, opérateur par opérateur, avec les
 *   erreurs de compilation NOMMÉES (jamais une colonne vide en silence) ;
 * - la parité `where` ↔ `when` : même égalité lâche, mêmes lignes gardées
 *   par `where="cat:eq:A"`, `applyLocalFilter` et `when cat = 'A'` ;
 * - la trace du volet Diagnostic (#604) qui liste les colonnes dérivées.
 */

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

import {
  compileCompute,
  applyCompute,
  computeTargets,
  COMPUTE_FUNCTIONS,
  COMPUTE_MAX_DEPTH,
  COMPUTE_MAX_EXPRESSION_LENGTH,
  applyLocalFilter,
  DataflowRecorder,
  formatTrace,
} from '@dsfr-data/shared';
import { DsfrDataNormalize } from '@/components/dsfr-data-normalize.js';
import { DsfrDataQuery } from '@/components/dsfr-data-query.js';
import { clearDataCache, clearDataMeta } from '@/utils/data-bridge.js';

function run(expr: string, row: Record<string, unknown> = {}): unknown {
  return applyCompute(row, compileCompute(`out = ${expr}`)).out;
}

function compileError(attr: string): string {
  try {
    compileCompute(attr);
  } catch (e) {
    return (e as Error).message;
  }
  throw new Error(`attendu : erreur de compilation pour "${attr}"`);
}

/** Vue interne de dsfr-data-normalize. */
interface NormalizeInternals {
  _processData: (data: unknown) => void;
}

/** Vue interne de dsfr-data-query : le filtre client de `where`. */
interface QueryInternals {
  _applyFilters: (
    items: Record<string, unknown>[],
    filterExpr: string
  ) => Record<string, unknown>[];
}

// ---------------------------------------------------------------------------
// Littéraux et rétrocompatibilité
// ---------------------------------------------------------------------------

describe('compute v2 — littéraux', () => {
  it('null, true, false', () => {
    expect(run('null')).toBeNull();
    expect(run('true')).toBe(true);
    expect(run('false')).toBe(false);
  });

  it("les expressions v1 passent inchangées (arithmétique, concat, parenthèses, ';')", () => {
    expect(run('(a + b) * 2', { a: 3, b: 4 })).toBe(14);
    expect(run("Indicateurs + ' / ' + Sous_theme", { Indicateurs: 'VE', Sous_theme: 'VP' })).toBe(
      'VE / VP'
    );
    const out = applyCompute(
      { valeur: 0.5 },
      compileCompute("pct = valeur * 100; label = pct + '%'")
    );
    expect(out.pct).toBe(50);
    expect(out.label).toBe('50%');
  });

  it("un ';' dans un littéral texte ne coupe pas l'assignation", () => {
    const out = applyCompute({ x: 1 }, compileCompute("a = 'un; deux'; b = x + 1"));
    expect(out.a).toBe('un; deux');
    expect(out.b).toBe(2);
  });

  it('un champ homonyme d’une fonction reste lisible sans parenthèses', () => {
    // `day` seul est un champ ; `day(x)` est un appel.
    expect(run('day', { day: 7 })).toBe(7);
    expect(run('day(d)', { d: '2024-03-15' })).toBe(15);
  });
});

// ---------------------------------------------------------------------------
// Fonctions
// ---------------------------------------------------------------------------

describe('compute v2 — fonctions dates', () => {
  it('year / month / day sur une date ISO (jour, date-heure, partielle)', () => {
    expect(run('year(d)', { d: '2024-03-15' })).toBe(2024);
    expect(run('month(d)', { d: '2024-03-15' })).toBe(3);
    expect(run('day(d)', { d: '2024-03-15' })).toBe(15);
    expect(run('day(d)', { d: '2024-03-15T23:30:00Z' })).toBe(15);
    expect(run('day(d)', { d: '2024-03-15 23:30' })).toBe(15);
    expect(run('year(d)', { d: '2024' })).toBe(2024);
    expect(run('month(d)', { d: '2024-03' })).toBe(3);
    expect(run('day(d)', { d: '2024-03' })).toBeNull();
  });

  it('year / month / day sur un objet Date', () => {
    const d = new Date(2023, 11, 31, 12); // 31/12/2023 (mois indexé à 0)
    expect(run('year(d)', { d })).toBe(2023);
    expect(run('month(d)', { d })).toBe(12);
    expect(run('day(d)', { d })).toBe(31);
  });

  it('null si la valeur n’est ni ISO ni Date (format FR, nombre, null, absent)', () => {
    expect(run('year(d)', { d: '15/03/2024' })).toBeNull();
    expect(run('year(d)', { d: 2024 })).toBeNull();
    expect(run('year(d)', { d: null })).toBeNull();
    expect(run('year(d)', {})).toBeNull();
    expect(run('month(d)', { d: 'demain' })).toBeNull();
  });
});

describe('compute v2 — fonctions nombres', () => {
  it('round : entier par défaut, n décimales, chaîne numérique FR acceptée', () => {
    expect(run('round(x)', { x: 2.5 })).toBe(3);
    expect(run('round(x, 2)', { x: 3.14159 })).toBe(3.14);
    expect(run('round(x, 1)', { x: '12,345' })).toBe(12.3);
    expect(run('round(part * 100, 1)', { part: 0.2567 })).toBe(25.7);
  });

  it('abs / floor / ceil', () => {
    expect(run('abs(x)', { x: -4 })).toBe(4);
    expect(run('floor(x)', { x: 4.9 })).toBe(4);
    expect(run('ceil(x)', { x: 4.1 })).toBe(5);
    expect(run('ceil(x)', { x: '4.1' })).toBe(5);
  });

  it('non numérique → null (jamais un 0 plausible)', () => {
    expect(run('round(x)', { x: 'abc' })).toBeNull();
    expect(run('abs(x)', { x: null })).toBeNull();
    expect(run('floor(x)', {})).toBeNull();
  });
});

describe('compute v2 — fonctions texte', () => {
  it('lower / upper / trim / len', () => {
    expect(run('lower(s)', { s: 'ÉTAT' })).toBe('état');
    expect(run('upper(s)', { s: 'état' })).toBe('ÉTAT');
    expect(run('trim(s)', { s: '  x  ' })).toBe('x');
    expect(run('len(s)', { s: 'abcd' })).toBe(4);
    expect(run('len(s)', { s: ['a', 'b', 'c'] })).toBe(3);
    expect(run('len(s)', { s: null })).toBe(0);
    expect(run('len(s)', { s: 1234 })).toBe(4);
  });

  it('lower / upper / trim : null reste null, un nombre devient texte', () => {
    expect(run('lower(s)', { s: null })).toBeNull();
    expect(run('upper(s)', {})).toBeNull();
    expect(run('lower(s)', { s: 12 })).toBe('12');
  });

  it('concat : variadique, null → vide, nombres convertis', () => {
    expect(run("concat(a, ' - ', b)", { a: 'Paris', b: 75 })).toBe('Paris - 75');
    expect(run('concat(a, b)', { a: null, b: 'x' })).toBe('x');
    expect(run('concat(a)', { a: 'seul' })).toBe('seul');
  });

  it('replace : littéral, toutes les occurrences, jamais une regex', () => {
    expect(run("replace(s, 'a', 'o')", { s: 'banana' })).toBe('bonono');
    expect(run("replace(s, '.', ',')", { s: '1.5.2' })).toBe('1,5,2'); // '.' n'est pas « tout caractère »
    expect(run("replace(s, '(x)', '')", { s: 'a(x)b' })).toBe('ab');
    expect(run("replace(s, '', 'z')", { s: 'abc' })).toBe('abc'); // motif vide : inchangé
    expect(run("replace(s, 'a', 'b')", { s: null })).toBeNull();
  });
});

describe('compute v2 — fonctions d’absence', () => {
  it('coalesce : première valeur non nulle (null/undefined seulement, pas la chaîne vide)', () => {
    expect(run("coalesce(t, 'Non renseigné')", { t: null })).toBe('Non renseigné');
    expect(run("coalesce(t, 'Non renseigné')", {})).toBe('Non renseigné');
    expect(run("coalesce(t, 'Non renseigné')", { t: 'SA' })).toBe('SA');
    expect(run("coalesce(t, 'Non renseigné')", { t: '' })).toBe('');
    expect(run('coalesce(a, b, 0)', { a: null, b: 5 })).toBe(5);
    expect(run('coalesce(a, b)', { a: null, b: undefined })).toBeNull();
  });

  it('is_null : null ou absent ; is_empty : null, chaîne vide ou tableau vide', () => {
    expect(run('is_null(x)', { x: null })).toBe(true);
    expect(run('is_null(x)', {})).toBe(true);
    expect(run('is_null(x)', { x: '' })).toBe(false);
    expect(run('is_null(x)', { x: 0 })).toBe(false);
    expect(run('is_empty(x)', { x: '' })).toBe(true);
    expect(run('is_empty(x)', { x: [] })).toBe(true);
    expect(run('is_empty(x)', { x: null })).toBe(true);
    expect(run('is_empty(x)', { x: ' ' })).toBe(false);
    expect(run('is_empty(x)', { x: 0 })).toBe(false);
    expect(run('is_empty(x)', { x: ['a'] })).toBe(false);
  });
});

describe('compute v2 — fonctions tableaux', () => {
  it('join : séparateur explicite ou « , » par défaut, non-tableau → texte', () => {
    expect(run("join(t, ' | ')", { t: ['a', 'b', 'c'] })).toBe('a | b | c');
    expect(run('join(t)', { t: ['a', 'b'] })).toBe('a, b');
    expect(run("join(t, '-')", { t: ['a', null, 'c'] })).toBe('a--c');
    expect(run("join(t, '-')", { t: 'seul' })).toBe('seul');
    expect(run("join(t, '-')", { t: null })).toBeNull();
  });

  it('contains sur un tableau : égalité lâche par élément (comme `in`)', () => {
    expect(run("contains(t, 'b')", { t: ['a', 'b'] })).toBe(true);
    expect(run('contains(t, 75)', { t: ['75', '13'] })).toBe(true);
    expect(run("contains(t, 'z')", { t: ['a', 'b'] })).toBe(false);
    expect(run("contains(t, 'a')", { t: [] })).toBe(false);
  });

  it('contains sur un texte : sous-chaîne insensible à la casse (comme `where contains`)', () => {
    expect(run("contains(s, 'ILE')", { s: 'Île-de-France' })).toBe(false); // accent ≠
    expect(run("contains(s, 'france')", { s: 'Île-de-France' })).toBe(true);
    expect(run("contains(s, 'x')", { s: null })).toBe(false);
    expect(run("contains(s, 'x')", {})).toBe(false);
  });
});

describe('compute v2 — liste blanche', () => {
  it('expose la liste des fonctions acceptées, dans l’ordre de la doc', () => {
    expect(COMPUTE_FUNCTIONS).toEqual([
      'year',
      'month',
      'day',
      'round',
      'abs',
      'floor',
      'ceil',
      'lower',
      'upper',
      'trim',
      'len',
      'concat',
      'replace',
      'coalesce',
      'is_null',
      'is_empty',
      'join',
      'contains',
    ]);
  });

  it('chaque fonction de la liste compile avec son arité minimale', () => {
    const minArity: Record<string, number> = {
      replace: 3,
      contains: 2,
    };
    for (const fn of COMPUTE_FUNCTIONS) {
      const args = Array.from({ length: minArity[fn] ?? 1 }, (_, i) => `a${i}`).join(', ');
      expect(() => compileCompute(`out = ${fn}(${args})`), fn).not.toThrow();
    }
  });
});

// ---------------------------------------------------------------------------
// Conditions
// ---------------------------------------------------------------------------

describe('compute v2 — when / then / else', () => {
  it('tranche par seuils : première branche vraie gagne, else en repli', () => {
    const attr =
      "tranche = when montant >= 1000000 then 'Grand' when montant >= 100000 then 'Moyen' else 'Petit'";
    const compiled = compileCompute(attr);
    expect(applyCompute({ montant: 2500000 }, compiled).tranche).toBe('Grand');
    expect(applyCompute({ montant: 100000 }, compiled).tranche).toBe('Moyen');
    expect(applyCompute({ montant: 99999 }, compiled).tranche).toBe('Petit');
    expect(applyCompute({ montant: '250 000' }, compiled).tranche).toBe('Moyen');
    expect(applyCompute({ montant: null }, compiled).tranche).toBe('Petit');
  });

  it('when imbriqué dans une arithmétique (parenthésé et nu, avale à droite)', () => {
    expect(run('(when a > 1 then 10 else 0) * 2', { a: 5 })).toBe(20);
    expect(run('(when a > 1 then 10 else 0) * 2', { a: 0 })).toBe(0);
    // Nu : la branche `else` absorbe `+ 3`.
    expect(run('1 + when a > 1 then 10 else 0 + 3', { a: 0 })).toBe(4);
    expect(run('1 + when a > 1 then 10 else 0 + 3', { a: 5 })).toBe(11);
  });

  it('when imbriqué dans une branche, et fonction dans une condition', () => {
    const expr =
      "when is_null(d) then 'inconnue' else when year(d) < 2020 then 'ancienne' else 'récente'";
    expect(run(expr, { d: null })).toBe('inconnue');
    expect(run(expr, { d: '2015-06-01' })).toBe('ancienne');
    expect(run(expr, { d: '2024-06-01' })).toBe('récente');
  });

  it('la condition suit la véracité : false, null, vide, 0 sont faux', () => {
    expect(run("when actif then 'oui' else 'non'", { actif: true })).toBe('oui');
    expect(run("when actif then 'oui' else 'non'", { actif: 1 })).toBe('oui');
    expect(run("when actif then 'oui' else 'non'", { actif: 'x' })).toBe('oui');
    expect(run("when actif then 'oui' else 'non'", { actif: false })).toBe('non');
    expect(run("when actif then 'oui' else 'non'", { actif: 0 })).toBe('non');
    expect(run("when actif then 'oui' else 'non'", { actif: '' })).toBe('non');
    expect(run("when actif then 'oui' else 'non'", { actif: null })).toBe('non');
    expect(run("when actif then 'oui' else 'non'", {})).toBe('non');
  });

  it('le résultat peut être null ou un booléen', () => {
    expect(run('when x > 0 then x else null', { x: -1 })).toBeNull();
    expect(run("when cat = 'A' then true else false", { cat: 'A' })).toBe(true);
  });
});

describe('compute v2 — comparaisons', () => {
  it('= et != : égalité lâche (nombre ↔ chaîne numérique, booléen ↔ texte)', () => {
    expect(run('a = 75', { a: '75' })).toBe(true);
    expect(run("a = '75'", { a: 75 })).toBe(true);
    expect(run("a = 'A'", { a: 'A' })).toBe(true);
    expect(run("a = 'a'", { a: 'A' })).toBe(false);
    expect(run("a = 'true'", { a: true })).toBe(true);
    expect(run('a != 75', { a: '75' })).toBe(false);
    expect(run("a != 'B'", { a: 'A' })).toBe(true);
  });

  it('= null : null et absent sont égaux entre eux, jamais à une valeur', () => {
    expect(run('a = null', { a: null })).toBe(true);
    expect(run('a = null', {})).toBe(true);
    expect(run('a = null', { a: '' })).toBe(false);
    expect(run('a = null', { a: 0 })).toBe(false);
    expect(run('a != null', { a: 'x' })).toBe(true);
  });

  it('< <= > >= numériques quand les deux côtés sont numériques (décimales FR comprises)', () => {
    expect(run('a < 10', { a: 9 })).toBe(true);
    expect(run('a < 10', { a: '9' })).toBe(true); // pas « "9" > "10" » lexicographique
    expect(run('a > 10', { a: '9' })).toBe(false);
    expect(run('a >= 10', { a: 10 })).toBe(true);
    expect(run('a <= 10', { a: 10 })).toBe(true);
    expect(run('a > 1000', { a: '1 234,5' })).toBe(true);
    expect(run('a > b', { a: 2, b: 1 })).toBe(true);
  });

  it('< <= > >= lexicographiques sinon : dates ISO, texte', () => {
    expect(run("d < '2024-01-01'", { d: '2023-12-31' })).toBe(true);
    expect(run("d >= '2024-01-01'", { d: '2024-01-01T10:00:00' })).toBe(true);
    expect(run("d > '2024-06'", { d: '2024-05-31' })).toBe(false);
    expect(run("s < 'b'", { s: 'a' })).toBe(true);
    expect(run("s > 'b'", { s: 'a' })).toBe(false);
  });

  it('null, absent ou vide ne matchent jamais une comparaison d’ordre (comme where)', () => {
    for (const row of [{ a: null }, {}, { a: '' }]) {
      expect(run('a < 5', row)).toBe(false);
      expect(run('a <= 5', row)).toBe(false);
      expect(run('a > -5', row)).toBe(false);
      expect(run('a >= -5', row)).toBe(false);
    }
    expect(run('5 > b', { b: null })).toBe(false);
  });

  it('les comparaisons portent sur des expressions arithmétiques', () => {
    expect(run('a - b > 0', { a: 5, b: 3 })).toBe(true);
    expect(run('a * 2 = b + 4', { a: 5, b: 6 })).toBe(true);
  });
});

describe('compute v2 — and / or / not', () => {
  it('and et or renvoient un booléen, avec véracité des opérandes', () => {
    expect(run('a > 1 and b > 1', { a: 2, b: 2 })).toBe(true);
    expect(run('a > 1 and b > 1', { a: 2, b: 0 })).toBe(false);
    expect(run('a > 1 or b > 1', { a: 0, b: 2 })).toBe(true);
    expect(run('a > 1 or b > 1', { a: 0, b: 0 })).toBe(false);
    expect(run("a and 'x'", { a: 1 })).toBe(true);
    expect(run('a or b', { a: null, b: 0 })).toBe(false);
  });

  it('priorité : not > and > or', () => {
    // a or (b and c)
    expect(run('a or b and c', { a: true, b: false, c: false })).toBe(true);
    expect(run('a or b and c', { a: false, b: true, c: false })).toBe(false);
    expect(run('(a or b) and c', { a: true, b: false, c: false })).toBe(false);
    // (not a) and b
    expect(run('not a and b', { a: false, b: true })).toBe(true);
    expect(run('not (a and b)', { a: false, b: true })).toBe(true);
    expect(run('not a and b', { a: true, b: true })).toBe(false);
    // not porte sur la comparaison entière
    expect(run('not a = 1', { a: 1 })).toBe(false);
    expect(run('not a = 1', { a: 2 })).toBe(true);
    expect(run('not not a', { a: 'x' })).toBe(true);
  });

  it('les comparaisons lient plus fort que and/or', () => {
    expect(run("cat = 'A' and montant >= 100 or cat = 'B'", { cat: 'B', montant: 0 })).toBe(true);
    expect(run("cat = 'A' and montant >= 100 or cat = 'B'", { cat: 'A', montant: 50 })).toBe(false);
    expect(run("cat = 'A' and montant >= 100 or cat = 'B'", { cat: 'A', montant: 100 })).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Erreurs de compilation nommées
// ---------------------------------------------------------------------------

describe('compute v2 — erreurs de compilation nommées', () => {
  it('fonction hors liste blanche : nomme la fonction et la liste acceptée', () => {
    const msg = compileError('out = somme(a, b)');
    expect(msg).toContain('fonction inconnue "somme"');
    expect(msg).toContain('year, month, day');
    expect(compileError('out = eval(a)')).toContain('fonction inconnue "eval"');
    expect(compileError('out = alert(1)')).toContain('fonction inconnue "alert"');
    expect(compileError('out = constructor(1)')).toContain('fonction inconnue');
  });

  it('arité fausse : nomme la fonction, l’attendu et le reçu', () => {
    expect(compileError('out = year(a, b)')).toBe('compute: "year" attend 1 argument, 2 reçus');
    expect(compileError('out = round()')).toContain('"round" attend 1 à 2 arguments, 0 reçu');
    expect(compileError('out = round(a, 1, 2)')).toContain(
      '"round" attend 1 à 2 arguments, 3 reçus'
    );
    expect(compileError("out = replace(a, 'x')")).toContain(
      '"replace" attend 3 arguments, 2 reçus'
    );
    expect(compileError('out = coalesce()')).toContain('"coalesce" attend au moins 1 argument');
    expect(compileError('out = contains(a)')).toContain('"contains" attend 2 arguments, 1 reçu');
  });

  it('when sans else : erreur explicite (pas de undefined silencieux)', () => {
    expect(compileError("out = when a > 1 then 'x'")).toContain('"when" sans "else"');
    expect(compileError("out = when a > 1 then 'x' when a > 0 then 'y'")).toContain(
      '"when" sans "else"'
    );
  });

  it('when sans then, else orphelin, mot-clé inattendu', () => {
    expect(compileError("out = when a > 1 'x' else 'y'")).toContain('"then" attendu');
    expect(compileError("out = else 'y'")).toContain('mot-clé "else" inattendu');
    expect(compileError('out = a then b')).toContain('jeton restant');
  });

  it('opérateurs étrangers refusés (==, <>, &&, ?:)', () => {
    expect(compileError('out = a == 1')).toContain('opérateur "=="');
    expect(compileError('out = a <> 1')).toContain('opérateur "<>"');
    expect(() => compileCompute('out = a && b')).toThrow();
    expect(() => compileCompute('out = a ? b : c')).toThrow();
  });

  it('comparaisons enchaînées refusées (a < b < c)', () => {
    expect(compileError('out = a < b < c')).toContain('comparaisons enchaînées');
  });

  it('parenthèse ou argument manquant', () => {
    expect(compileError('out = round(a')).toContain('parenthèse fermante manquante');
    expect(compileError('out = round(a,)')).toMatch(/jeton inattendu.*\)/);
    expect(compileError('out = coalesce(a, ')).toContain('expression incomplète');
  });

  it('garde-fous : nom de champ interdit, longueur, profondeur', () => {
    expect(compileError('out = __proto__ + 1')).toContain('nom de champ interdit');
    expect(compileError('out = coalesce(constructor, 1)')).toContain('nom de champ interdit');

    const long = 'a + '.repeat(COMPUTE_MAX_EXPRESSION_LENGTH / 4 + 10) + '1';
    expect(compileError(`out = ${long}`)).toContain('expression trop longue');

    const deep = '('.repeat(COMPUTE_MAX_DEPTH + 5) + 'a' + ')'.repeat(COMPUTE_MAX_DEPTH + 5);
    expect(compileError(`out = ${deep}`)).toContain('expression trop imbriquée');
    const deepNot = 'not '.repeat(COMPUTE_MAX_DEPTH + 5) + 'a';
    expect(compileError(`out = ${deepNot}`)).toContain('expression trop imbriquée');
    const deepNeg = '-'.repeat(COMPUTE_MAX_DEPTH + 5) + 'a';
    expect(compileError(`out = ${deepNeg}`)).toContain('expression trop imbriquée');

    // Sous la borne : accepté.
    const ok = '('.repeat(10) + 'a' + ')'.repeat(10);
    expect(run(ok, { a: 3 })).toBe(3);
  });

  it('seuls les champs de la ligne sont accessibles (pas de window, pas de prototype)', () => {
    expect(run('window', {})).toBeUndefined();
    expect(run('globalThis', {})).toBeUndefined();
    expect(run('toString', {})).toBeUndefined();
    expect(run('hasOwnProperty', { hasOwnProperty: 'valeur' })).toBe('valeur');
  });
});

// ---------------------------------------------------------------------------
// Exemples de l'ADR-105 / #671
// ---------------------------------------------------------------------------

describe('compute v2 — les quatre exemples de #671', () => {
  const attr = [
    'solde = actif - passif',
    "tranche = when montant >= 1000000 then 'Grand' when montant >= 100000 then 'Moyen' else 'Petit'",
    "type = coalesce(type_entreprise, 'Non renseigné')",
    'annee = year(date_notification)',
  ].join('; ');

  it('compilent ensemble et produisent les colonnes attendues', () => {
    const compiled = compileCompute(attr);
    expect(computeTargets(compiled)).toEqual(['solde', 'tranche', 'type', 'annee']);
    const out = applyCompute(
      {
        actif: 1500,
        passif: 400,
        montant: 250000,
        type_entreprise: null,
        date_notification: '2024-09-01T00:00:00+02:00',
      },
      compiled
    );
    expect(out.solde).toBe(1100);
    expect(out.tranche).toBe('Moyen');
    expect(out.type).toBe('Non renseigné');
    expect(out.annee).toBe(2024);
  });
});

// ---------------------------------------------------------------------------
// Parité where ↔ when
// ---------------------------------------------------------------------------

describe('compute v2 — parité where ↔ when (égalité lâche)', () => {
  const rows: Record<string, unknown>[] = [
    { id: 1, cat: 'A', dept: '75', montant: 120 },
    { id: 2, cat: 'a', dept: 75, montant: '80' },
    { id: 3, cat: 'B', dept: '13', montant: null },
    { id: 4, cat: null, dept: '69', montant: 100 },
    { id: 5, cat: 'A', dept: '2A', montant: '' },
    { id: 6, dept: 13, montant: 0 },
  ];

  const keptByWhen = (expr: string): number[] =>
    rows
      .map((r) => applyCompute(r, compileCompute(`keep = ${expr}`)))
      .filter((r) => r.keep === true)
      .map((r) => r.id as number);

  const keptByQuery = (where: string): number[] => {
    const query = new DsfrDataQuery();
    return (query as unknown as QueryInternals)
      ._applyFilters(rows, where)
      .map((r) => r.id as number);
  };

  const keptByLocalFilter = (where: string): number[] =>
    applyLocalFilter(rows, where).map((r) => r.id as number);

  it.each([
    ['cat:eq:A', "when cat = 'A' then true else false"],
    ['dept:eq:75', 'when dept = 75 then true else false'],
    ['dept:eq:75', "when dept = '75' then true else false"],
    ['cat:neq:A', "when cat != 'A' then true else false"],
    ['montant:gte:100', 'when montant >= 100 then true else false'],
    ['montant:gt:100', 'when montant > 100 then true else false'],
    ['montant:lt:100', 'when montant < 100 then true else false'],
    ['montant:lte:100', 'when montant <= 100 then true else false'],
    ['cat:isnull', 'when is_null(cat) then true else false'],
    ['cat:isnotnull', 'when not is_null(cat) then true else false'],
    ['cat:contains:a', "when contains(cat, 'a') then true else false"],
  ])('where="%s" et %s gardent les mêmes lignes (query et applyLocalFilter)', (where, when) => {
    const expected = keptByQuery(where);
    expect(keptByWhen(when)).toEqual(expected);
    expect(keptByLocalFilter(where)).toEqual(expected);
  });

  it('cat:eq:A garde bien 1 et 5 (sensible à la casse, null exclu)', () => {
    expect(keptByQuery('cat:eq:A')).toEqual([1, 5]);
    expect(keptByWhen("when cat = 'A' then true else false")).toEqual([1, 5]);
  });

  it('dept:eq:75 garde 1 et 2 (nombre ↔ chaîne numérique)', () => {
    expect(keptByWhen('when dept = 75 then true else false')).toEqual([1, 2]);
    expect(keptByWhen("when dept = '75' then true else false")).toEqual([1, 2]);
  });

  it('"075" : suit la coercition JS comme where — égal au nombre 75, pas au texte \'75\'', () => {
    // dsfr-data-query type la valeur du colon (`75` → nombre) : "075" passe ;
    // applyLocalFilter la garde en texte : "075" ne passe pas. `when` suit le
    // type du littéral écrit, ce qui reproduit exactement l'un et l'autre.
    const withZero = [{ id: 1, dept: '075' }];
    expect(applyCompute(withZero[0], compileCompute('k = dept = 75')).k).toBe(true);
    expect(applyCompute(withZero[0], compileCompute("k = dept = '75'")).k).toBe(false);
    const query = new DsfrDataQuery();
    expect((query as unknown as QueryInternals)._applyFilters(withZero, 'dept:eq:75')).toHaveLength(
      1
    );
    expect(applyLocalFilter(withZero, 'dept:eq:75')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Intégration normalize : erreur de configuration + trace
// ---------------------------------------------------------------------------

describe('compute v2 — dsfr-data-normalize : erreur de configuration (#649)', () => {
  let normalize: DsfrDataNormalize;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    clearDataCache('cmp2-out');
    clearDataCache('cmp2-src');
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    normalize = new DsfrDataNormalize();
    normalize.id = 'cmp2-out';
    normalize.source = 'cmp2-src';
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it('fonction hors liste : reportConfigError (attribut + console), erreur aval, rien d’émis', () => {
    normalize.compute = 'total = somme(a, b)';
    const loaded: unknown[] = [];
    const errors: unknown[] = [];
    const onLoaded = (e: Event) => {
      if ((e as CustomEvent).detail?.sourceId === 'cmp2-out') loaded.push(e);
    };
    const onError = (e: Event) => {
      if ((e as CustomEvent).detail?.sourceId === 'cmp2-out')
        errors.push((e as CustomEvent).detail);
    };
    document.addEventListener('dsfr-data-loaded', onLoaded);
    document.addEventListener('dsfr-data-error', onError);

    (normalize as unknown as NormalizeInternals)._processData([{ a: 1, b: 2 }]);

    document.removeEventListener('dsfr-data-loaded', onLoaded);
    document.removeEventListener('dsfr-data-error', onError);

    const marker = normalize.getAttribute('data-dsfr-config-error') ?? '';
    expect(marker).toContain('compute="total = somme(a, b)"');
    expect(marker).toContain('fonction inconnue "somme"');
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('dsfr-data-normalize[cmp2-out]: compute="total = somme(a, b)"')
    );
    expect(loaded).toHaveLength(0);
    expect(errors).toHaveLength(1);
    expect(normalize.getError()?.message).toContain('fonction inconnue "somme"');
    expect(normalize.getComputedColumns()).toEqual([]);
  });

  it('when sans else : même doctrine', () => {
    normalize.compute = "t = when a > 1 then 'x'";
    (normalize as unknown as NormalizeInternals)._processData([{ a: 1 }]);
    expect(normalize.getAttribute('data-dsfr-config-error')).toContain('"when" sans "else"');
  });

  it('une expression redevenue valide efface le marqueur', () => {
    normalize.compute = 'total = somme(a, b)';
    (normalize as unknown as NormalizeInternals)._processData([{ a: 1, b: 2 }]);
    expect(normalize.hasAttribute('data-dsfr-config-error')).toBe(true);

    normalize.compute = 'total = a + b';
    (normalize as unknown as NormalizeInternals)._processData([{ a: 1, b: 2 }]);
    expect(normalize.hasAttribute('data-dsfr-config-error')).toBe(false);
    expect(normalize.getError()).toBeNull();
    expect(normalize.getComputedColumns()).toEqual([{ name: 'total', sample: 3 }]);
  });
});

describe('compute v2 — colonnes dérivées dans la trace du volet Diagnostic (#604)', () => {
  afterEach(() => {
    for (const id of ['src-t', 'norm-t', 'norm-t2']) {
      clearDataCache(id);
      clearDataMeta(id);
    }
    document.body.innerHTML = '';
  });

  it('le composant est enregistré (le collecteur lit un élément rehaussé)', () => {
    expect(customElements.get('dsfr-data-normalize')).toBe(DsfrDataNormalize);
  });

  it('getComputedColumns() : une entrée par cible, valeur de la première ligne', () => {
    const normalize = new DsfrDataNormalize();
    normalize.id = 'norm-t';
    normalize.source = 'src-t';
    normalize.compute =
      "solde = actif - passif; tranche = when solde > 100 then 'Grand' else 'Petit'; annee = year(d)";
    (normalize as unknown as NormalizeInternals)._processData([
      { actif: 500, passif: 100, d: '2024-02-03' },
      { actif: 10, passif: 100, d: null },
    ]);
    expect(normalize.getComputedColumns()).toEqual([
      { name: 'solde', sample: 400 },
      { name: 'tranche', sample: 'Grand' },
      { name: 'annee', sample: 2024 },
    ]);
  });

  it('sans compute : aucune colonne, pas de champ computedColumns dans le graphe', () => {
    const host = document.createElement('div');
    host.innerHTML = `<dsfr-data-normalize id="norm-t2" source="src-t" trim></dsfr-data-normalize>`;
    document.body.appendChild(host);
    const normalize = document.getElementById('norm-t2') as DsfrDataNormalize;
    (normalize as unknown as NormalizeInternals)._processData([{ a: ' x ' }]);
    expect(normalize.getComputedColumns()).toEqual([]);

    const trace = new DataflowRecorder({ root: document.body }).snapshot();
    const node = trace.graph.nodes.find((n) => n.id === 'norm-t2');
    expect(node).toBeDefined();
    expect('computedColumns' in node!).toBe(false);
    expect(formatTrace(trace)).not.toContain('calculées');
  });

  it('avec compute : computedColumns dans le graphe et ligne « calculées » dans la trace', () => {
    const host = document.createElement('div');
    host.innerHTML = `<dsfr-data-normalize id="norm-t" source="src-t" compute="solde = actif - passif; type = coalesce(type_entreprise, 'Non renseigné')"></dsfr-data-normalize>`;
    document.body.appendChild(host);
    const normalize = document.getElementById('norm-t') as DsfrDataNormalize;
    (normalize as unknown as NormalizeInternals)._processData([
      { actif: 1500, passif: 400, type_entreprise: null },
    ]);

    const recorder = new DataflowRecorder({ root: document.body });
    recorder.start();
    const trace = recorder.snapshot();
    recorder.stop();

    const node = trace.graph.nodes.find((n) => n.id === 'norm-t');
    expect(node?.computedColumns).toEqual([
      { name: 'solde', sample: 1100 },
      { name: 'type', sample: 'Non renseigné' },
    ]);
    expect(node?.attrs.compute).toContain('solde = actif - passif');

    const text = formatTrace(trace);
    expect(text).toContain('calculées (compute) : solde = 1100, type = "Non renseigné"');

    // Valeurs masquées : les noms restent, les exemples disparaissent.
    const redacted = formatTrace(trace, { redactValues: true });
    expect(redacted).toContain('calculées (compute) : solde, type');
    expect(redacted).not.toContain('1100');
    expect(redacted).not.toContain('type = "Non renseigné"');
  });
});
