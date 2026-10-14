import { describe, it, expect } from 'vitest';
import { ilikeTabular, likeSql } from './sql-like.js';
import { repondreTabular } from './api-fixtures.js';
import { repondreGristSql, tableGrist } from '../verif-donnees/fixtures-grist.js';

/**
 * ADR-159 lot 2 (#1285) — les faux Tabular et Grist lisent `LIKE` comme les
 * vrais, mesurés le 2026-10-14 (tableau dans `sql-like.ts`). Chaque cas
 * ci-dessous rejoue une mesure sur les lignes qui la portent.
 */

const COMMUNES = ['Saint-Girons', 'Seintein', 'Sentenac-de-Sérou', 'Foix'];

describe('faux Tabular — ilike.*valeur*, tel que mesuré', () => {
  const garde = (valeur: string) => COMMUNES.filter((c) => ilikeTabular(c, valeur, false));

  it('sous-chaîne, casse ignorée, accents respectés', () => {
    expect(garde('saint')).toEqual(['Saint-Girons']);
    expect(garde('SÉROU')).toEqual(['Sentenac-de-Sérou']);
    expect(garde('serou')).toEqual([]);
  });

  it('`%`, `_` et `*` de la valeur sont des jokers', () => {
    expect(garde('S%nt')).toEqual(['Saint-Girons', 'Seintein', 'Sentenac-de-Sérou']);
    expect(garde('S*nt')).toEqual(['Saint-Girons', 'Seintein', 'Sentenac-de-Sérou']);
    expect(garde('Sain_')).toEqual(['Saint-Girons']);
    expect(garde('Se_nt')).toEqual(['Seintein']);
  });

  it('`\\` échappe ; `\\*` devient un « % » littéral', () => {
    expect(garde('Sain\\_')).toEqual([]);
    expect(garde('S\\%nt')).toEqual([]);
    expect(garde('Sa\\int')).toEqual(['Saint-Girons']);
    expect(garde('S\\*nt')).toEqual([]);
    expect(ilikeTabular('50% des cas', '50\\%', false)).toBe(true);
    expect(ilikeTabular('a_b', 'a\\_b', false)).toBe(true);
    expect(ilikeTabular('axb', 'a\\_b', false)).toBe(false);
  });

  it('une valeur absente n’est retenue ni par contains ni par notcontains', () => {
    expect(ilikeTabular(null, 'x', false)).toBe(false);
    expect(ilikeTabular(null, 'x', true)).toBe(false);
    expect(ilikeTabular('Foix', 'zzz', true)).toBe(true);
  });

  it('repondreTabular sert __notcontains comme l’API : sans les absents', () => {
    const jeu = [{ nom: 'Corse' }, { nom: null }, { nom: 'Ain' }];
    const url = new URL('https://t.invalid/api/resources/x/data/?nom__notcontains=zzz');
    expect(repondreTabular(url, jeu).data).toEqual([{ nom: 'Corse' }, { nom: 'Ain' }]);
  });
});

describe('faux Grist — LIKE de SQLite, tel que mesuré', () => {
  const ascii = { casse: 'ascii' as const, echappement: null };
  const echappe = { casse: 'ascii' as const, echappement: '\\' };

  it('casse ignorée pour l’ASCII seulement', () => {
    expect(likeSql('Haute-Corse', '%corse%', ascii)).toBe(true);
    expect(likeSql('HÉRAULT', '%hérault%', ascii)).toBe(false);
    expect(likeSql('Hérault', '%herault%', ascii)).toBe(false);
  });

  it('sans ESCAPE, `\\` est un caractère ; avec, il échappe', () => {
    expect(likeSql('Haute-Corse', '%Co_se%', ascii)).toBe(true);
    expect(likeSql('Haute-Corse', '%Co\\_se%', ascii)).toBe(false);
    expect(likeSql('Haute-Corse', '%Co\\_se%', echappe)).toBe(false);
    expect(likeSql('Haute-Corse', '%Cor\\se%', echappe)).toBe(true);
    expect(likeSql('5% de TVA', '%5\\%%', echappe)).toBe(true);
    expect(likeSql('5 de TVA', '%5\\%%', echappe)).toBe(false);
  });

  it('repondreGristSql lit ESCAPE et écarte les absents sous NOT LIKE', () => {
    const tables = { T: tableGrist([{ nom: 'Co_se' }, { nom: 'Corse' }, { nom: null }]) };
    const lire = (sql: string, args: unknown[]) =>
      (repondreGristSql({ sql, args }, tables)?.records as Array<{ fields: { nom: unknown } }>).map(
        (r) => r.fields.nom
      );
    expect(lire(`SELECT "nom" FROM "T" WHERE "nom" LIKE ?`, ['%Co_se%'])).toEqual([
      'Co_se',
      'Corse',
    ]);
    expect(lire(`SELECT "nom" FROM "T" WHERE "nom" LIKE ? ESCAPE '\\'`, ['%Co\\_se%'])).toEqual([
      'Co_se',
    ]);
    expect(lire(`SELECT "nom" FROM "T" WHERE "nom" NOT LIKE ? ESCAPE '\\'`, ['%zzz%'])).toEqual([
      'Co_se',
      'Corse',
    ]);
  });
});
