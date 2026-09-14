import { describe, it, expect } from 'vitest';
import { compiler, decouper, deriver, vrai } from '../../tools/oracle/expression.js';

/**
 * L'évaluateur d'expressions de l'ORACLE — la seconde implémentation de la
 * grammaire des colonnes calculées. Éprouvé ici SANS la bibliothèque : ce qui
 * compte est qu'il tienne la doctrine énoncée (absence propagée, division par
 * zéro rendue nulle, cellule vide jamais égale à un nombre), pas qu'il
 * ressemble au parseur de `packages/shared`.
 */
describe('oracle / expressions', () => {
  const ligne = (x: Record<string, unknown>) => deriver([x], SOURCE)[0];
  const SOURCE = 'r = a / b';

  it('découpe les symboles à deux caractères avant ceux à un', () => {
    const jetons = decouper('a != b');
    expect(jetons.map((j) => j.texte)).toEqual(['a', '!=', 'b', '']);
  });

  it('compile plusieurs assignations séparées par un point-virgule', () => {
    expect(compiler('x = 1; y = x + 2').map((a) => a.cible)).toEqual(['x', 'y']);
  });

  it('refuse un « when » sans « else »', () => {
    expect(() => compiler("t = when a = 1 then 'un'")).toThrow(/else/);
  });

  it('refuse une fonction hors liste blanche', () => {
    expect(() => deriver([{ a: 1 }], 'x = sqrt(a)')).toThrow(/liste blanche/);
  });

  it('rend null pour une division par zéro, jamais l’infini', () => {
    expect(ligne({ a: 7, b: 0 }).r).toBeNull();
  });

  it('rend null quand un opérande manque, jamais un zéro plausible', () => {
    expect(ligne({ a: null, b: 4 }).r).toBeNull();
    expect(deriver([{ a: null, b: 4 }], 'x = a - b')[0].x).toBeNull();
    expect(deriver([{ a: 'zz', b: 4 }], 'x = a * b')[0].x).toBeNull();
  });

  it('additionne deux nombres et concatène dès qu’un côté ne l’est pas', () => {
    expect(deriver([{ a: 2, b: 3 }], 'x = a + b')[0].x).toBe(5);
    expect(deriver([{ a: 'A', b: 3 }], "x = a + '-' + b")[0].x).toBe('A-3');
    // Une chaîne NUMÉRIQUE reste un nombre : 2 + '3' fait 5, pas « 23 ».
    expect(deriver([{ a: 2, b: '3' }], 'x = a + b')[0].x).toBe(5);
  });

  it('tient la cellule vide pour différente d’un zéro', () => {
    const rows = deriver([{ v: '' }, { v: 0 }], "t = when v = 0 then 'zero' else 'autre'");
    expect(rows.map((r) => r.t)).toEqual(['autre', 'zero']);
  });

  it('ne fait matcher aucune comparaison d’ordre à une valeur absente', () => {
    const rows = deriver(
      [{ a: null }, { a: '' }, { a: 9 }],
      "t = when a > 5 then 'oui' else 'non'"
    );
    expect(rows.map((r) => r.t)).toEqual(['non', 'non', 'oui']);
  });

  it('lit les dates ISO en trois nombres', () => {
    const r = deriver([{ d: '2024-03-15' }], 'an = year(d); m = month(d); j = day(d)')[0];
    expect([r.an, r.m, r.j]).toEqual([2024, 3, 15]);
    expect(deriver([{ d: 'hier' }], 'an = year(d)')[0].an).toBeNull();
  });

  it('applique les fonctions de texte et de tableau', () => {
    const r = deriver(
      [{ s: '  Préfecture  ', l: ['eau', 'air'] }],
      "net = trim(s); taille = len(net); txt = join(l, '+'); eau = contains(l, 'eau')"
    )[0];
    expect(r.net).toBe('Préfecture');
    expect(r.taille).toBe(10);
    expect(r.txt).toBe('eau+air');
    expect(r.eau).toBe(true);
  });

  it('distingue l’absence (is_null) du vide (is_empty)', () => {
    const r = deriver(
      [{ a: null, v: '', l: [] }],
      'na = is_null(a); nv = is_null(v); ev = is_empty(v); el = is_empty(l); ea = is_empty(a)'
    )[0];
    expect([r.na, r.nv, r.ev, r.el, r.ea]).toEqual([true, false, true, true, true]);
  });

  it('prend la première valeur non absente avec coalesce', () => {
    expect(deriver([{ a: null, b: 5 }], 'x = coalesce(a, b)')[0].x).toBe(5);
    expect(deriver([{ a: '', b: 5 }], 'x = coalesce(a, b)')[0].x).toBe('');
  });

  it('relit une colonne calculée par l’assignation précédente', () => {
    const r = deriver([{ a: 2, b: 3 }], 'p1 = a * 2; p2 = p1 + b')[0];
    expect([r.p1, r.p2]).toEqual([4, 7]);
  });

  it('tient pour vraie toute valeur qui n’est pas dans la liste des fausses', () => {
    // Règle DOCUMENTÉE : false, null, undefined, '', 0 et NaN sont faux ;
    // tout le reste est vrai. Une colonne à 1 / 0 se teste donc directement,
    // sans comparaison — `when actif then …` doit marcher.
    for (const faux of [false, null, undefined, '', 0]) {
      expect(vrai(faux)).toBe(false);
    }
    expect(vrai(Number.NaN)).toBe(false);
    for (const verite of [true, 1, -1, 'non', '0', 0.5, [], {}]) {
      expect(vrai(verite)).toBe(true);
    }
  });

  it('accepte une condition qui n’est pas un booléen', () => {
    const rows = deriver(
      [{ actif: 1 }, { actif: 0 }, { actif: 'oui' }, { actif: '' }, { actif: null }],
      "t = when actif then 'oui' else 'non'"
    );
    expect(rows.map((r) => r.t)).toEqual(['oui', 'non', 'oui', 'non', 'non']);
  });

  it('applique la même véracité à and, or et not', () => {
    const rows = deriver(
      [{ a: 1, b: 0 }],
      "et = when a and b then 'oui' else 'non'; ou = when a or b then 'oui' else 'non'; non = when not b then 'oui' else 'non'"
    );
    expect([rows[0].et, rows[0].ou, rows[0].non]).toEqual(['non', 'oui', 'oui']);
  });

  it('enchaîne les connecteurs logiques avec la bonne priorité', () => {
    const rows = deriver(
      [
        { a: 9, b: 1 },
        { a: 1, b: 9 },
      ],
      "t = when a > 5 and b > 5 then 'et' when a > 5 or b > 5 then 'ou' else 'non'; n = when not (a > 5) then 'oui' else 'non'"
    );
    expect(rows.map((r) => r.t)).toEqual(['ou', 'ou']);
    expect(rows.map((r) => r.n)).toEqual(['non', 'oui']);
  });
});
