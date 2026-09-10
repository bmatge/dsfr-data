import { describe, it, expect, beforeEach, afterEach } from 'vitest';

/**
 * Alias inline `col:Libellé` sur `value-cols` de dsfr-data-unpivot (#668) :
 * la clé dépliée est le libellé au lieu du nom technique. Couvre la grammaire
 * partagée (parseAliasedColumns), la logique pure (performUnpivot) puis le
 * composant.
 */

import { DsfrDataUnpivot } from '@/components/dsfr-data-unpivot.js';
import {
  performUnpivot,
  parseAliasedColumn,
  parseAliasedColumns,
  escapeColonValue,
} from '@dsfr-data/shared';
import { clearDataCache, setDataCache } from '@/utils/data-bridge.js';

const CARBURANTS = [
  { station: 'A', gazole_prix: '1.72', sp95_prix: '1.85' },
  { station: 'B', gazole_prix: '1.69', sp95_prix: '1.81' },
];

describe('parseAliasedColumns (grammaire col:Libellé)', () => {
  it('sans alias, le libellé est le nom de colonne', () => {
    expect(parseAliasedColumns('a, b')).toEqual([
      { key: 'a', label: 'a' },
      { key: 'b', label: 'b' },
    ]);
  });

  it('découpe sur le premier `:` et trim les deux segments', () => {
    expect(parseAliasedColumns('gazole_prix:Gazole, sp95_prix : SP95 ')).toEqual([
      { key: 'gazole_prix', label: 'Gazole' },
      { key: 'sp95_prix', label: 'SP95' },
    ]);
  });

  it('un `:` échappé (%3A) est décodé dans la clé comme dans le libellé', () => {
    const key = escapeColonValue('ratio:2024');
    const label = escapeColonValue('Ratio : 2024');
    expect(parseAliasedColumns(`${key}:${label}`)).toEqual([
      { key: 'ratio:2024', label: 'Ratio : 2024' },
    ]);
  });

  it('tout ce qui suit le premier `:` appartient au libellé (non échappé toléré)', () => {
    expect(parseAliasedColumn('prix:Prix : TTC')).toEqual({ key: 'prix', label: 'Prix : TTC' });
  });

  it('libellé vide après `:` → retombe sur la clé ; segments vides ignorés', () => {
    expect(parseAliasedColumns('a:, , b')).toEqual([
      { key: 'a', label: 'a' },
      { key: 'b', label: 'b' },
    ]);
    expect(parseAliasedColumns('')).toEqual([]);
  });
});

describe('performUnpivot — value-cols aliasées', () => {
  it('émet le libellé dans la colonne variable, lit la cellule sur la clé', () => {
    const result = performUnpivot(CARBURANTS, {
      idCols: ['station'],
      valueCols: [
        { key: 'gazole_prix', label: 'Gazole' },
        { key: 'sp95_prix', label: 'SP95' },
      ],
      varName: 'carburant',
      valueName: 'prix',
    });
    expect(result).toEqual([
      { station: 'A', carburant: 'Gazole', prix: '1.72' },
      { station: 'A', carburant: 'SP95', prix: '1.85' },
      { station: 'B', carburant: 'Gazole', prix: '1.69' },
      { station: 'B', carburant: 'SP95', prix: '1.81' },
    ]);
  });

  it('mélange chaînes et entrées aliasées', () => {
    const result = performUnpivot([CARBURANTS[0]], {
      idCols: ['station'],
      valueCols: ['gazole_prix', { key: 'sp95_prix', label: 'SP95' }],
    });
    expect(result.map((r) => r.variable)).toEqual(['gazole_prix', 'SP95']);
  });

  it('une colonne aliasée listée dans id-cols reste ignorée', () => {
    const result = performUnpivot([CARBURANTS[0]], {
      idCols: ['station'],
      valueCols: [{ key: 'station', label: 'Station' }, 'gazole_prix'],
    });
    expect(result).toHaveLength(1);
    expect(result[0].variable).toBe('gazole_prix');
  });
});

describe('DsfrDataUnpivot — value-cols="col:Libellé"', () => {
  let unpivot: DsfrDataUnpivot;

  beforeEach(() => {
    clearDataCache('alias-out');
    clearDataCache('alias-src');
    unpivot = new DsfrDataUnpivot();
    unpivot.id = 'alias-out';
    unpivot.source = 'alias-src';
    unpivot.idCols = 'station';
    unpivot.varName = 'carburant';
    unpivot.valueName = 'prix';
  });

  afterEach(() => {
    unpivot.disconnectedCallback();
  });

  it('étiquettes « Gazole » et « SP95 » après unpivot (critère #668)', () => {
    unpivot.valueCols = 'gazole_prix:Gazole, sp95_prix:SP95';
    setDataCache('alias-src', CARBURANTS);
    unpivot.connectedCallback();
    const labels = [...new Set(unpivot.getData().map((r) => r.carburant))];
    expect(labels).toEqual(['Gazole', 'SP95']);
    expect(unpivot.getData()[0]).toMatchObject({ station: 'A', prix: '1.72' });
  });

  it('sans alias, comportement inchangé (clé = nom de colonne)', () => {
    unpivot.valueCols = 'gazole_prix, sp95_prix';
    setDataCache('alias-src', CARBURANTS);
    unpivot.connectedCallback();
    expect([...new Set(unpivot.getData().map((r) => r.carburant))]).toEqual([
      'gazole_prix',
      'sp95_prix',
    ]);
  });
});
