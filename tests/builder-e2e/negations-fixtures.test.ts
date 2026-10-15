import { describe, it, expect } from 'vitest';
import { filtrerOdsql, repondreTabular } from './api-fixtures.js';
import { repondreGristSql, tableGrist } from '../verif-donnees/fixtures-grist.js';

/**
 * #1312 — les faux Tabular, Grist et Opendatasoft font aux valeurs ABSENTES
 * le sort que leur font les vrais, mesuré le 2026-10-14 :
 *
 * - Tabular, élus municipaux (34 826 lignes ; une colonne nulle sur 34 328,
 *   « Corse » sur 359) : `__differs=Corse` → 34 467 (absents GARDÉS,
 *   `isdistinct`) ; `__notin=Corse` → 139 (absents ÉCARTÉS, `not.in`) ;
 *   `__differs=Corse&__isnotnull=` → 139 ; `__isnull=` → 34 328 ;
 *   `or=(and(c__differs.Corse,c__isnotnull),and(c__differs.Guyane,c__isnotnull))` → 498.
 * - Grist (SQLite), 101 lignes dont 12 nulles et 13 vides : `!=` → 89,
 *   `NOT IN` → 89, `(c IS NULL OR c NOT IN (…))` → 101, `n > 0` → 89.
 * - Opendatasoft, 176 lignes dont 21 nulles : `!= "zzz"` → 155,
 *   `NOT … in ("zzz")` → 176, `is null` → 21.
 *
 * Un faux serveur qui garderait les absents là où le vrai les écarte (ou
 * l'inverse) ferait passer pour juste une négation confiée à tort.
 */

const JEU = [
  { id: 1, c: 'Corse', n: 3 },
  { id: 2, c: 'Corse', n: 1 },
  { id: 3, c: 'Guyane', n: 2 },
  { id: 4, c: null, n: null },
  { id: 5, c: null, n: null },
  { id: 6, c: '', n: 0 },
];
const ids = (lignes: Array<Record<string, unknown>>) => lignes.map((l) => l.id);

describe('faux Tabular — valeurs absentes sous une négation', () => {
  const lire = (requete: string) =>
    ids(repondreTabular(new URL(`https://t.invalid/api/resources/x/data/?${requete}`), JEU).data);

  it('`differs` garde les absents, `notin` les écarte', () => {
    expect(lire('c__differs=Corse')).toEqual([3, 4, 5, 6]);
    expect(lire('c__notin=Corse')).toEqual([3, 6]);
    expect(lire('c__notcontains=Corse')).toEqual([3, 6]);
  });

  it('`isnotnull` (valué ou nu) écarte les absents, `isnull` les nomme', () => {
    expect(lire('c__differs=Corse&c__isnotnull=')).toEqual([3, 6]);
    expect(lire('c__differs=Corse&c__isnotnull')).toEqual([3, 6]);
    expect(lire('c__isnull=')).toEqual([4, 5]);
  });

  it('une comparaison d’ordre écarte les absents (ils ne valent pas 0)', () => {
    expect(lire('n__strictly_less=1')).toEqual([6]);
  });

  it('un groupe or=(…) lit les `and(…)` imbriqués', () => {
    expect(
      lire(
        `or=${encodeURIComponent('(and(c__differs.Corse,c__isnotnull),and(c__differs.Guyane,c__isnotnull))')}`
      )
    ).toEqual([1, 2, 3, 6]);
    expect(lire(`or=${encodeURIComponent('(c__differs.Corse,c__differs.Guyane)')}`)).toEqual([
      1, 2, 3, 4, 5, 6,
    ]);
  });
});

describe('faux Grist — logique SQL à trois valeurs', () => {
  const tables = { T: tableGrist(JEU) };
  const lire = (where: string, args: unknown[]) =>
    (
      repondreGristSql({ sql: `SELECT * FROM "T" WHERE ${where}`, args }, tables)
        ?.records as Array<{
        fields: { id: number };
      }>
    ).map((r) => r.fields.id);

  it('`!=` et `NOT IN` écartent les absents', () => {
    expect(lire('"c" != ?', ['Corse'])).toEqual([3, 6]);
    expect(lire('"c" NOT IN (?)', ['Corse'])).toEqual([3, 6]);
  });

  it('`(c IS NULL OR c NOT IN (…))` les garde', () => {
    expect(lire('("c" IS NULL OR "c" NOT IN (?,?))', ['Corse', 'Guyane'])).toEqual([4, 5, 6]);
    expect(
      lire('(("c" IS NULL OR "c" NOT IN (?)) OR ("n" IS NULL OR "n" NOT IN (?)))', ['Corse', 3])
    ).toEqual([2, 3, 4, 5, 6]);
  });

  it('une comparaison d’ordre écarte les absents', () => {
    expect(lire('"n" < ?', [1])).toEqual([6]);
  });

  // #1321 — mesuré le 2026-10-15 : `c < 'B'` → 21 lignes dont les 13 vides ;
  // `(c != '' AND c < 'B')` → 8, le navigateur 8.
  it("la chaîne vide est rangée avant tout texte ; `!= ''` l’écarte", () => {
    expect(lire('"c" < ?', ['D'])).toEqual([1, 2, 6]);
    expect(lire('("c" != \'\' AND "c" < ?)', ['D'])).toEqual([1, 2]);
    expect(lire('"c" >= ?', [''])).toEqual([1, 2, 3, 6]);
    expect(lire('("c" != \'\' AND "c" >= ?)', [''])).toEqual([1, 2, 3]);
    // Un nombre n'est jamais égal à `''` : sans effet sur une colonne Numeric
    expect(lire('("n" != \'\' AND "n" < ?)', [2])).toEqual([2, 6]);
    expect(lire('"c" = \'\'', [])).toEqual([6]);
  });
});

describe('faux Opendatasoft — les deux négations d’ODSQL', () => {
  const lire = (where: string) => ids(filtrerOdsql(JEU, where));

  it('`!=` écarte les absents, `NOT … in (…)` les garde', () => {
    expect(lire('c != "Corse"')).toEqual([3, 6]);
    expect(lire('NOT c in ("Corse")')).toEqual([3, 4, 5, 6]);
    expect(lire('c in ("Corse", "Guyane")')).toEqual([1, 2, 3]);
  });

  it('`is null` / `is not null`', () => {
    expect(lire('c is null')).toEqual([4, 5]);
    expect(lire('c is not null')).toEqual([1, 2, 3, 6]);
  });
});
