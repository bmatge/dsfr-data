import { describe, it, expect } from 'vitest';
import { toNumber, looksLikeNumber } from '../../packages/shared/src/utils/number-parser';

describe('toNumber', () => {
  describe('default mode (returns 0 on failure)', () => {
    it('should pass through numbers', () => {
      expect(toNumber(42)).toBe(42);
      expect(toNumber(0)).toBe(0);
      expect(toNumber(-5.5)).toBe(-5.5);
    });

    it('should return 0 for NaN number', () => {
      expect(toNumber(NaN)).toBe(0);
    });

    it('should parse integer strings', () => {
      expect(toNumber('42')).toBe(42);
      expect(toNumber('-10')).toBe(-10);
    });

    it('should parse French format (comma decimal)', () => {
      expect(toNumber('1234,56')).toBe(1234.56);
    });

    it('should parse international format (dot decimal)', () => {
      expect(toNumber('1234.56')).toBe(1234.56);
    });

    it('should handle French thousands with comma decimal (1.234,56)', () => {
      expect(toNumber('1.234,56')).toBe(1234.56);
    });

    it('should handle English thousands with dot decimal (1,234.56)', () => {
      expect(toNumber('1,234.56')).toBe(1234.56);
    });

    it('should remove space separators', () => {
      expect(toNumber('1 234')).toBe(1234);
      expect(toNumber('1 234 567')).toBe(1234567);
    });

    it('should trim whitespace', () => {
      expect(toNumber('  42  ')).toBe(42);
    });

    it('should return 0 for empty string', () => {
      expect(toNumber('')).toBe(0);
    });

    it('should return 0 for non-numeric string', () => {
      expect(toNumber('abc')).toBe(0);
    });

    it('should return 0 for null', () => {
      expect(toNumber(null)).toBe(0);
    });

    it('should return 0 for undefined', () => {
      expect(toNumber(undefined)).toBe(0);
    });

    it('should return 0 for object', () => {
      expect(toNumber({})).toBe(0);
    });
  });

  describe('strict mode (returns null on failure)', () => {
    it('should return null for NaN', () => {
      expect(toNumber(NaN, true)).toBeNull();
    });

    it('should return null for empty string', () => {
      expect(toNumber('', true)).toBeNull();
    });

    it('should return null for non-numeric string', () => {
      expect(toNumber('abc', true)).toBeNull();
    });

    it('should return null for null input', () => {
      expect(toNumber(null, true)).toBeNull();
    });

    it('should still parse valid numbers', () => {
      expect(toNumber('42', true)).toBe(42);
      expect(toNumber('1 234,56', true)).toBe(1234.56);
    });
  });
});

describe('looksLikeNumber', () => {
  it('should return true for integer strings', () => {
    expect(looksLikeNumber('123')).toBe(true);
  });

  it('should return true for negative numbers', () => {
    expect(looksLikeNumber('-123')).toBe(true);
  });

  it('should return true for dot decimals', () => {
    expect(looksLikeNumber('123.45')).toBe(true);
  });

  it('should return true for comma decimals', () => {
    expect(looksLikeNumber('123,45')).toBe(true);
  });

  it('should return true for numbers with space separators', () => {
    expect(looksLikeNumber('1 234')).toBe(true);
    expect(looksLikeNumber('1 234,56')).toBe(true);
  });

  it('should return false for non-string values', () => {
    expect(looksLikeNumber(123)).toBe(false);
    expect(looksLikeNumber(null)).toBe(false);
    expect(looksLikeNumber(undefined)).toBe(false);
  });

  it('should return false for empty string', () => {
    expect(looksLikeNumber('')).toBe(false);
  });

  it('should return false for non-numeric strings', () => {
    expect(looksLikeNumber('abc')).toBe(false);
    expect(looksLikeNumber('12abc')).toBe(false);
  });

  it('should return false for whitespace only', () => {
    expect(looksLikeNumber('   ')).toBe(false);
  });
});
