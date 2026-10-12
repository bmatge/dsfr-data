import { describe, it, expect } from 'vitest';

/**
 * #1282 — un tableau équivalent n'annonce jamais zéro pour une valeur non
 * nulle. `formatTableCell` (tableau de la DataBox, `dsfr-data-a11y`) et
 * `dsfr-data-list` passent par le même `formatNumberFr` : deux décimales au
 * plus, sauf en dessous de 0,01 en valeur absolue, où la cellule garde deux
 * chiffres significatifs.
 */

import { formatTableCell } from '@/utils/table-cell.js';
import { DsfrDataA11y } from '@/components/dsfr-data-a11y.js';
import { DsfrDataList } from '@/components/dsfr-data-list.js';
import { DsfrDataChart } from '@/components/dsfr-data-chart.js';

/** Espaces insécables (U+202F, U+00A0) ramenées à l'espace ordinaire. */
const plat = (texte: string): string => texte.replace(/[\u202f\u00a0]/g, ' ');

/** Entrée → texte de la cellule (sans attribut `decimals`). */
const CAS: Array<[unknown, string]> = [
  [0.00123, '0,0012'],
  [-0.00123, '-0,0012'],
  [0.0000456, '0,000046'],
  [0.0149, '0,01'],
  [0.005, '0,005'],
  [0.0099, '0,0099'],
  [0.00999, '0,01'],
  [0.01, '0,01'],
  [-0.004, '-0,004'],
  [0, '0'],
  [-0, '0'],
  [1e-12, '0,000000000001'],
  [-1e-12, '-0,000000000001'],
  [null, ''],
  [undefined, ''],
  ['0,00123', '0,00123'],
  ['0.00123', '0.00123'],
  [42, '42'],
  [2.27, '2,27'],
  [0.5, '0,5'],
  [1234567.891, '1 234 567,89'],
  [-1234567.891, '-1 234 567,89'],
];

describe('formatTableCell — chiffres significatifs sous 0,01 (#1282)', () => {
  it.each(CAS)('%s → « %s »', (entree, attendu) => {
    expect(plat(formatTableCell(entree))).toBe(attendu);
  });

  it('aucune valeur non nulle ne s’affiche « 0 » ni « -0 », sans notation scientifique', () => {
    for (let exposant = -1; exposant >= -30; exposant--) {
      for (const mantisse of [1, 1.5, 4.99, 5, 9.99]) {
        for (const signe of [1, -1]) {
          const texte = formatTableCell(signe * mantisse * 10 ** exposant);
          // Rien que des zéros, un signe ou une virgule : la cellule annoncerait zéro.
          expect(texte.replace(/[-,0]/g, '')).not.toBe('');
          expect(texte).not.toMatch(/e/i);
        }
      }
    }
  });

  it('`decimals` posé : le choix de l’auteur est tenu, exactement ce nombre de décimales', () => {
    expect(formatTableCell(0.00123, 2)).toBe('0,00');
    expect(formatTableCell(0.00123, 4)).toBe('0,0012');
    expect(formatTableCell(2, 2)).toBe('2,00');
  });

  it('les trois tableaux de la bibliothèque rendent le même texte', () => {
    const a11y = new DsfrDataA11y();
    const liste = new DsfrDataList();
    for (const [entree, attendu] of CAS) {
      if (typeof entree !== 'number') continue;
      expect(plat(a11y.formatCellValue(entree))).toBe(attendu);
      expect(plat(liste.formatCellValue(entree))).toBe(attendu);
    }
  });

  it('DataBox : la cellule dit 0,0012, la valeur passée au graphique reste 0.00123', () => {
    const chart = new DsfrDataChart();
    const interne = chart as unknown as {
      _data: unknown[];
      _processData(): { values: Array<number | null>; y: string };
      _databoxTableHtml(): string;
    };
    chart.id = 'g';
    chart.type = 'bar';
    chart.databox = true;
    chart.labelField = 'dep';
    chart.valueField = 'ratio';
    interne._data = [
      { dep: 'Ain', ratio: 0.00123 },
      { dep: 'Aisne', ratio: 0 },
    ];
    const cellules = [...interne._databoxTableHtml().matchAll(/<td>([^<]*)<\/td>/g)].map(
      (m) => m[1]
    );
    expect(cellules).toEqual(['Ain', '0,0012', 'Aisne', '0']);
    expect(interne._processData().values).toEqual([0.00123, 0]);
    expect(interne._processData().y).toBe('[[0.00123,0]]');
  });

  it('CSV de dsfr-data-a11y : la donnée brute, pas l’arrondi d’affichage', () => {
    const a11y = new DsfrDataA11y();
    const csv = a11y._buildCsv([{ dep: 'Ain', ratio: 0.00123 }]);
    expect(csv).toContain('Ain;0.00123');
  });
});
