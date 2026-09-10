import { describe, it, expect } from 'vitest';
import { toBoolean } from '../../packages/shared/src/utils/to-boolean';

describe('toBoolean (coercition des cellules Oui/Non, #677)', () => {
  it('keeps booleans and treats numbers as non-zero', () => {
    expect(toBoolean(true)).toBe(true);
    expect(toBoolean(false)).toBe(false);
    expect(toBoolean(1)).toBe(true);
    expect(toBoolean(-2.5)).toBe(true);
    expect(toBoolean(0)).toBe(false);
    expect(toBoolean(NaN)).toBe(false);
  });

  it('is false for null, undefined and empty arrays, true for non-empty arrays and objects', () => {
    expect(toBoolean(null)).toBe(false);
    expect(toBoolean(undefined)).toBe(false);
    expect(toBoolean([])).toBe(false);
    expect(toBoolean(['x'])).toBe(true);
    expect(toBoolean({})).toBe(true);
  });

  it('recognises the usual written forms of yes (case and accents ignored)', () => {
    for (const v of [
      'Oui',
      'oui',
      'OUI',
      'O',
      'yes',
      'Y',
      'true',
      'TRUE',
      'vrai',
      'Vrai',
      'X',
      'x',
      '1',
    ]) {
      expect(toBoolean(v), v).toBe(true);
    }
  });

  it('recognises the usual written forms of no', () => {
    for (const v of [
      'Non',
      'non',
      'NON',
      'N',
      'no',
      'false',
      'FALSE',
      'faux',
      'F',
      '0',
      '',
      '   ',
      'N/A',
      'na',
      'NC',
      'nr',
      'n.d.',
      'null',
      'NULL',
      'none',
      'NaN',
      '-',
      'Non renseigné',
      'non renseigne',
      'Sans objet',
    ]) {
      expect(toBoolean(v), JSON.stringify(v)).toBe(false);
    }
  });

  it('parses numeric strings (French or dotted decimal) as non-zero', () => {
    expect(toBoolean('0')).toBe(false);
    expect(toBoolean('0,0')).toBe(false);
    expect(toBoolean('0.00')).toBe(false);
    expect(toBoolean('-0')).toBe(false);
    expect(toBoolean('2')).toBe(true);
    expect(toBoolean('0,5')).toBe(true);
    expect(toBoolean(' 12 ')).toBe(true);
  });

  it('treats any other non-empty text as presence (X / vide columns)', () => {
    expect(toBoolean('Partiellement')).toBe(true);
    expect(toBoolean('présent')).toBe(true);
    expect(toBoolean('*')).toBe(true);
  });
});
