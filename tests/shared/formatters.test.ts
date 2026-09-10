import { describe, it, expect } from 'vitest';
import {
  formatKPIValue,
  formatDateShort,
  formatNumberFr,
} from '../../packages/shared/src/utils/formatters';
import { formatNumberFr as formatNumberFrLib } from '../../packages/shared/src/lib';
import { formatNumberFr as formatNumberFrIndex } from '../../packages/shared/src/index';

describe('formatNumberFr (#666 — cellules des tableaux affichés)', () => {
  const nbsp = (str: string) => str.replace(/[\u202F\u00A0]/g, ' ');

  it('localise les décimales : 2.27 → « 2,27 », 0.2 → « 0,2 »', () => {
    expect(formatNumberFr(2.27)).toBe('2,27');
    expect(formatNumberFr(0.2)).toBe('0,2');
  });

  it('au plus 2 décimales par défaut, sans forcer les entiers', () => {
    expect(formatNumberFr(1.999)).toBe('2');
    expect(formatNumberFr(3.14159)).toBe('3,14');
    expect(formatNumberFr(42)).toBe('42');
    expect(formatNumberFr(0)).toBe('0');
  });

  it('sépare les milliers à la française', () => {
    expect(nbsp(formatNumberFr(1234.5))).toBe('1 234,5');
    expect(nbsp(formatNumberFr(-1234567))).toBe('-1 234 567');
  });

  it('decimals fixe exactement le nombre de décimales (colonnes alignées)', () => {
    expect(formatNumberFr(2, { decimals: 2 })).toBe('2,00');
    expect(formatNumberFr(2.27, { decimals: 0 })).toBe('2');
    expect(formatNumberFr(2.27, { decimals: 3 })).toBe('2,270');
    expect(formatNumberFr(2.275, { decimals: 1 })).toBe('2,3');
  });

  it('ignore un decimals invalide (négatif, NaN) et retombe sur le défaut', () => {
    expect(formatNumberFr(2.27, { decimals: -1 })).toBe('2,27');
    expect(formatNumberFr(2.27, { decimals: NaN })).toBe('2,27');
    expect(formatNumberFr(2.27, {})).toBe('2,27');
  });

  it('ne casse pas sur NaN / Infinity', () => {
    expect(formatNumberFr(NaN)).toBe('NaN');
    expect(formatNumberFr(Infinity)).toBe('Infinity');
  });

  it('est exporté par les deux barrels (lib.ts et index.ts)', () => {
    expect(formatNumberFrLib).toBe(formatNumberFr);
    expect(formatNumberFrIndex).toBe(formatNumberFr);
  });
});

describe('formatKPIValue', () => {
  it('should format plain number with French locale (contrat composant : entier, #317)', () => {
    const result = formatKPIValue(1234.5);
    // Aligne sur formatValue 'nombre' du composant kpi : arrondi entier
    // (la preview rendait '1 234,5' quand le composant affichait '1 235')
    expect(result.replace(/\s/g, ' ')).toBe('1 235');
  });

  it('should format currency with EUR unit (0 décimale, contrat composant #317)', () => {
    const result = formatKPIValue(1234.56, 'EUR');
    // formatCurrency du composant : 0 décimale (la preview montrait 2)
    expect(result.replace(/\s/g, ' ')).toBe('1 235 €');
  });

  it('should format currency with euro symbol', () => {
    const result = formatKPIValue(50, '\u20AC');
    expect(result).toContain('50');
    expect(result).toContain('\u20AC');
  });

  it('should format percentage', () => {
    const result = formatKPIValue(75.5, '%');
    expect(result.replace(/\s/g, ' ')).toBe('75,5 %');
  });

  it('should round to 2 decimal places', () => {
    const result = formatKPIValue(1.999);
    expect(result).toBe('2');
  });

  it('should handle zero', () => {
    const result = formatKPIValue(0);
    expect(result).toBe('0');
  });

  it('should handle negative numbers', () => {
    const result = formatKPIValue(-42);
    expect(result).toContain('42');
  });
});

describe('formatDateShort', () => {
  it('should format ISO date to French short format', () => {
    const result = formatDateShort('2024-01-15T12:00:00Z');
    expect(result).toContain('15');
    expect(result).toContain('2024');
  });

  it('should return empty string for invalid date', () => {
    expect(formatDateShort('not-a-date')).toBe('');
  });

  it('should return empty string for empty string', () => {
    expect(formatDateShort('')).toBe('');
  });
});
