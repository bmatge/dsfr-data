import { describe, it, expect } from 'vitest';
import { buildCsv, CSV_BOM } from '../../packages/shared/src/utils/csv.js';

describe('buildCsv', () => {
  it('generates CSV with BOM, semicolon separator and derived columns', () => {
    const rows = [
      { nom: 'Paris', pop: 2000000 },
      { nom: 'Lyon', pop: 500000 },
    ];
    expect(buildCsv(rows)).toBe(`${CSV_BOM}nom;pop\nParis;2000000\nLyon;500000`);
  });

  it('returns empty string for empty input', () => {
    expect(buildCsv([])).toBe('');
  });

  it('quotes values containing the separator', () => {
    const csv = buildCsv([{ desc: 'a;b', val: 1 }]);
    expect(csv).toBe(`${CSV_BOM}desc;val\n"a;b";1`);
  });

  it('doubles quotes inside quoted values', () => {
    const csv = buildCsv([{ nom: 'Ville "Test"', pop: 100 }]);
    expect(csv).toBe(`${CSV_BOM}nom;pop\n"Ville ""Test""";100`);
  });

  it('quotes multi-line values (RFC 4180)', () => {
    const csv = buildCsv([{ adresse: '12 rue X\n75001 Paris', ville: 'Paris' }]);
    expect(csv).toBe(`${CSV_BOM}adresse;ville\n"12 rue X\n75001 Paris";Paris`);
  });

  it('quotes values containing carriage returns', () => {
    const csv = buildCsv([{ a: 'l1\r\nl2' }]);
    expect(csv).toBe(`${CSV_BOM}a\n"l1\r\nl2"`);
  });

  it('neutralizes formula prefixes = @ (Excel injection)', () => {
    const csv = buildCsv([{ a: '=SUM(A1:A2)', b: '@cmd' }]);
    expect(csv).toBe(`${CSV_BOM}a;b\n'=SUM(A1:A2);'@cmd`);
  });

  it('neutralizes + and - prefixes when not a plain number', () => {
    const csv = buildCsv([{ a: '-2+3+cmd|/c calc', b: '+payload()' }]);
    expect(csv).toBe(`${CSV_BOM}a;b\n'-2+3+cmd|/c calc;'+payload()`);
  });

  it('does not neutralize negative or signed numbers', () => {
    const csv = buildCsv([{ x: -42, y: '+3.14', z: '-1,5' }]);
    expect(csv).toBe(`${CSV_BOM}x;y;z\n-42;+3.14;-1,5`);
  });

  it('renders null and undefined as empty cells', () => {
    const csv = buildCsv([{ a: null, b: undefined, c: 'ok' }]);
    expect(csv).toBe(`${CSV_BOM}a;b;c\n;;ok`);
  });

  it('excludes technical _* fields when deriving columns', () => {
    const csv = buildCsv([{ nom: 'Paris', _highlight: '<mark>Pa</mark>ris' }]);
    expect(csv).toBe(`${CSV_BOM}nom\nParis`);
  });

  it('respects explicit columns with labels', () => {
    const rows = [{ nom: 'Paris', pop: 2000000, extra: 'x' }];
    const csv = buildCsv(rows, {
      columns: [
        { key: 'nom', label: 'Ville' },
        { key: 'pop', label: 'Population' },
      ],
    });
    expect(csv).toBe(`${CSV_BOM}Ville;Population\nParis;2000000`);
  });

  it('supports a custom separator', () => {
    const csv = buildCsv([{ a: '1,5', b: 'x' }], { separator: ',' });
    expect(csv).toBe(`${CSV_BOM}a,b\n"1,5",x`);
  });

  it('can omit the BOM', () => {
    const csv = buildCsv([{ a: 1 }], { bom: false });
    expect(csv).toBe('a\n1');
  });

  it('keeps accented content intact after the BOM', () => {
    const csv = buildCsv([{ ville: 'Besançon', région: 'Bourgogne-Franche-Comté' }]);
    expect(csv).toBe(`${CSV_BOM}ville;région\nBesançon;Bourgogne-Franche-Comté`);
  });
});
