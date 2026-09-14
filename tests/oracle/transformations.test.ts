import { describe, it, expect } from 'vitest';
import {
  applyFilter,
  concatRows,
  groupBy,
  joinRows,
  orderByKeys,
  passeFiltre,
  pivotRows,
  runPipeline,
  unpivotRows,
} from '../../tools/oracle/compute.js';
import type { Row } from '../../tools/oracle/manifest.js';

/**
 * Les opérations ajoutées au moteur pour le lot TRANSFORMATIONS : filtres
 * `in` / `notin` / `notcontains`, absence STRICTE, regroupement composite,
 * tri à plusieurs clés, les quatre types de jointure, pivot, dépliage et
 * empilement. Tableaux nus, aucune importation de la bibliothèque.
 */
describe('oracle / filtres ajoutés', () => {
  const ligne: Row = { zone: 'nord', code: '01', vide: '', absent: null };

  it('in et notin sont complémentaires', () => {
    expect(passeFiltre(ligne, { field: 'zone', op: 'in', values: ['nord', 'sud'] })).toBe(true);
    expect(passeFiltre(ligne, { field: 'zone', op: 'notin', values: ['nord', 'sud'] })).toBe(false);
    expect(passeFiltre(ligne, { field: 'zone', op: 'in', values: ['est'] })).toBe(false);
  });

  it('notcontains est le complément de contains, absence comprise', () => {
    expect(passeFiltre(ligne, { field: 'zone', op: 'notcontains', value: 'or' })).toBe(false);
    expect(passeFiltre(ligne, { field: 'absent', op: 'notcontains', value: 'or' })).toBe(true);
  });

  it('distingue le VIDE (isnull) de l’ABSENT (isnull-strict)', () => {
    expect(passeFiltre(ligne, { field: 'vide', op: 'isnull' })).toBe(true);
    expect(passeFiltre(ligne, { field: 'vide', op: 'isnull-strict' })).toBe(false);
    expect(passeFiltre(ligne, { field: 'absent', op: 'isnull-strict' })).toBe(true);
    expect(passeFiltre(ligne, { field: 'vide', op: 'isnotnull-strict' })).toBe(true);
  });
});

describe('oracle / regroupement et tri', () => {
  const rows: Row[] = [
    { a: 'x', b: '1', n: 10 },
    { a: 'x', b: '2', n: 20 },
    { a: 'y', b: '1', n: 30 },
    { a: 'x', b: '1', n: 5 },
  ];

  it('regroupe sur une combinaison de champs, pas sur chacun', () => {
    const out = groupBy(rows, ['a', 'b'], { total: { agg: 'sum', field: 'n' } });
    expect(out).toEqual([
      { a: 'x', b: '1', total: 15 },
      { a: 'x', b: '2', total: 20 },
      { a: 'y', b: '1', total: 30 },
    ]);
  });

  it('garde le regroupement à un seul champ tel qu’il était', () => {
    expect(groupBy(rows, 'a', { total: { agg: 'sum', field: 'n' } })).toEqual([
      { a: 'x', total: 35 },
      { a: 'y', total: 30 },
    ]);
  });

  it('ne fait départager par la seconde clé que les ex æquo de la première', () => {
    const out = orderByKeys(rows, [
      { column: 'a', dir: 'asc' },
      { column: 'n', dir: 'desc' },
    ]);
    expect(out.map((r) => r.n)).toEqual([20, 10, 5, 30]);
  });

  it('laisse les ex æquo complets dans leur ordre d’arrivée', () => {
    const egaux: Row[] = [
      { id: 1, n: 5 },
      { id: 2, n: 5 },
    ];
    expect(orderByKeys(egaux, [{ column: 'n', dir: 'desc' }]).map((r) => r.id)).toEqual([1, 2]);
  });
});

describe('oracle / jointures', () => {
  const gauche: Row[] = [
    { code: '01', libelle: 'A' },
    { code: '99', libelle: 'Z' },
    { code: '', libelle: 'Vide' },
  ];
  const droite: Row[] = [
    { code: '01', region: 'Nord' },
    { code: '77', region: 'Sud' },
  ];

  it('inner ne garde que les paires, et une clé vide n’apparie rien', () => {
    expect(joinRows(gauche, droite, 'code', 'inner')).toEqual([
      { code: '01', libelle: 'A', region: 'Nord' },
    ]);
  });

  it('left garde toutes les lignes de gauche', () => {
    expect(joinRows(gauche, droite, 'code', 'left').map((r) => r.libelle)).toEqual([
      'A',
      'Z',
      'Vide',
    ]);
  });

  it('right garde toutes les lignes de droite, dans leur ordre', () => {
    expect(joinRows(gauche, droite, 'code', 'right')).toEqual([
      { code: '01', libelle: 'A', region: 'Nord' },
      { code: '77', region: 'Sud' },
    ]);
  });

  it('full ajoute les lignes de droite restées seules, sans doublon', () => {
    const out = joinRows(gauche, droite, 'code', 'full');
    expect(out.map((r) => r.code)).toEqual(['01', '99', '', '77']);
  });

  it('apparie sur une clé composite, jamais sur un seul de ses champs', () => {
    const g: Row[] = [
      { an: '2024', c: '01', v: 1 },
      { an: '2025', c: '01', v: 2 },
    ];
    const d: Row[] = [{ an: '2024', c: '01', b: 9 }];
    expect(joinRows(g, d, 'an, c', 'inner')).toEqual([{ an: '2024', c: '01', v: 1, b: 9 }]);
  });

  it('préfixe la colonne non-clé portée des DEUX côtés', () => {
    const g: Row[] = [{ code: '01', nom: 'gauche' }];
    const d: Row[] = [{ code: '01', nom: 'droite' }];
    expect(joinRows(g, d, 'code', 'inner')).toEqual([
      { code: '01', nom: 'gauche', right_nom: 'droite' },
    ]);
  });

  it('n’apparie pas deux graphies différentes de la même clé (#792)', () => {
    expect(joinRows([{ code: '1' }], [{ code: '01', r: 'x' }], 'code', 'inner')).toEqual([]);
  });
});

describe('oracle / comparaison d’ordre sur une paire mixte', () => {
  const mesures: Row[] = [{ x: 250 }, { x: 'NC' }, { x: '90' }, { x: null }, { x: '' }];

  it('compare en chaîne quand un seul côté est numérique, comme le contrat le dit', () => {
    const gardees = applyFilter(mesures, { field: 'x', op: 'gte', value: 100 });
    // 250 par le nombre, « NC » par le texte (« NC » après « 100 ») ; « 90 »
    // reste dehors par le nombre, et ni l'absent ni le vide ne matchent.
    expect(gardees.map((r) => r.x)).toEqual([250, 'NC']);
  });

  it('n’y fait matcher ni l’absence ni le vide, quel que soit l’opérateur', () => {
    for (const op of ['gt', 'gte', 'lt', 'lte'] as const) {
      const gardees = applyFilter(mesures, { field: 'x', op, value: 100 });
      expect(gardees.some((r) => r.x === null || r.x === '')).toBe(false);
    }
  });
});

describe('oracle / pivot et dépliage', () => {
  const long: Row[] = [
    { c: 'Lyon', an: '2022', m: 10 },
    { c: 'Lyon', an: '2023', m: 12 },
    { c: 'Lyon', an: '2023', m: 8 },
    { c: 'Nice', an: '2022', m: 7 },
    { c: 'Nancy', an: '', m: 99 },
  ];

  it('replie en une ligne par identité, toutes colonnes portées', () => {
    expect(
      pivotRows(long, { row: 'c', column: 'an', value: 'm', columnFormat: 'a_{value}' })
    ).toEqual([
      { c: 'Lyon', a_2022: 10, a_2023: 20 },
      { c: 'Nice', a_2022: 7, a_2023: null },
    ]);
  });

  it('laisse une cellule sans observation à null, jamais à zéro', () => {
    const out = pivotRows(long, { row: 'c', column: 'an', value: 'm', aggregate: 'count' });
    expect(out[1]['2023']).toBeNull();
  });

  it('prend la première et la dernière observation d’une cellule', () => {
    const premier = pivotRows(long, { row: 'c', column: 'an', value: 'm', aggregate: 'first' });
    const dernier = pivotRows(long, { row: 'c', column: 'an', value: 'm', aggregate: 'last' });
    expect(premier[0]['2023']).toBe(12);
    expect(dernier[0]['2023']).toBe(8);
  });

  it('range les dates ISO d’une cellule dans l’ordre lexicographique', () => {
    const dates: Row[] = [
      { c: 'Lyon', an: '2023', d: '2023-08-30' },
      { c: 'Lyon', an: '2023', d: '2023-02-15' },
    ];
    expect(
      pivotRows(dates, { row: 'c', column: 'an', value: 'd', aggregate: 'min' })[0]['2023']
    ).toBe('2023-02-15');
  });

  it('ordonne les colonnes générées à la demande', () => {
    const out = pivotRows(long, {
      row: 'c',
      column: 'an',
      value: 'm',
      columnOrder: 'desc',
      columnFormat: 'a_{value}',
    });
    expect(Object.keys(out[0])).toEqual(['c', 'a_2023', 'a_2022']);
  });

  it('déplie une colonne par ligne, en gardant les colonnes d’identité', () => {
    const large: Row[] = [{ i: 'Conso', u: 'MWh', c1: '120', c2: '' }];
    expect(
      unpivotRows(large, {
        idCols: ['i', 'u'],
        valueCols: [
          { column: 'c1', as: 'janvier' },
          { column: 'c2', as: 'février' },
        ],
        varName: 'mois',
        valueName: 'v',
      })
    ).toEqual([
      { i: 'Conso', u: 'MWh', mois: 'janvier', v: '120' },
      { i: 'Conso', u: 'MWh', mois: 'février', v: '' },
    ]);
  });

  it('n’émet rien pour une cellule vide avec drop-empty', () => {
    const large: Row[] = [{ i: 'Conso', c1: '120', c2: '' }];
    expect(
      unpivotRows(large, {
        idCols: ['i'],
        valueCols: [{ column: 'c1' }, { column: 'c2' }],
        dropEmpty: true,
      })
    ).toHaveLength(1);
  });
});

describe('oracle / ce que l’oracle REFUSE de recalculer', () => {
  // Une erreur de configuration n'émet AUCUNE ligne côté bibliothèque. Un
  // oracle qui recalculerait quand même un tableau plausible fabriquerait un
  // attendu que la page ne montrera jamais — il lève, comme elle.
  const long: Row[] = [
    { commune: 'Lyon', annee: '2022', montant: 10 },
    { commune: 'Lyon', annee: 'commune', montant: 12 },
  ];

  it('refuse une colonne générée qui porte le nom d’un champ d’identité', () => {
    expect(() => pivotRows(long, { row: 'commune', column: 'annee', value: 'montant' })).toThrow(
      /commune/
    );
  });

  it('refuse deux valeurs qui produiraient la même colonne', () => {
    const doublon: Row[] = [
      { c: 'Lyon', an: '2022', m: 1 },
      { c: 'Lyon', an: '2023', m: 2 },
    ];
    expect(() =>
      pivotRows(doublon, { row: 'c', column: 'an', value: 'm', columnFormat: 'fixe' })
    ).toThrow(/produisent la colonne/);
  });

  it('refuse un empilement de schémas divergents', () => {
    const jeux = {
      main: [{ mois: '01', montant: 10 }],
      autre: [{ mois: '01', total: 15 }],
    };
    expect(() => concatRows(jeux, ['main', 'autre'])).toThrow(/schémas divergents/);
  });

  it('refuse une colonne de provenance qui écraserait une colonne des données', () => {
    const jeux = {
      main: [{ mois: '01', montant: 10 }],
      autre: [{ mois: '02', montant: 15 }],
    };
    expect(() => concatRows(jeux, ['main', 'autre'], 'montant')).toThrow(/écraserait/);
  });
});

describe('oracle / empilement', () => {
  const jeux = {
    main: [{ mois: '01', montant: 10 }],
    autre: [{ mois: '01', montant: 15 }],
  };

  it('empile dans l’ordre déclaré et note la provenance', () => {
    expect(
      concatRows(jeux, ['main', 'autre'], 'millesime', { main: '2024', autre: '2025' })
    ).toEqual([
      { mois: '01', montant: 10, millesime: '2024' },
      { mois: '01', montant: 15, millesime: '2025' },
    ]);
  });

  it('refuse un jeu absent du feed plutôt que de rendre un empilement court', () => {
    expect(() => concatRows(jeux, ['main', 'fantome'])).toThrow(/fantome/);
  });

  it('enchaîne empilement, colonne calculée et regroupement', () => {
    const out = runPipeline(jeux, [
      { op: 'concat', sources: ['main', 'autre'] },
      { op: 'derive', expr: 'double = montant * 2' },
      { op: 'group-by', by: 'mois', columns: { total: { agg: 'sum', field: 'double' } } },
    ]);
    expect(out).toEqual([{ mois: '01', total: 50 }]);
  });
});
