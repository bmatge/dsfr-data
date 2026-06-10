import { describe, it, expect } from 'vitest';
import { formatKPIValue, formatDateShort } from '../../packages/shared/src/utils/formatters';

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
