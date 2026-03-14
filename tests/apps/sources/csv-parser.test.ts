import { describe, it, expect } from 'vitest';
import { parseCSVLine } from '../../../apps/sources/src/parsers/csv-parser';

describe('sources CSV parser', () => {
  describe('parseCSVLine', () => {
    it('should parse simple comma-separated values', () => {
      expect(parseCSVLine('a,b,c', ',')).toEqual(['a', 'b', 'c']);
    });

    it('should parse semicolon-separated values', () => {
      expect(parseCSVLine('a;b;c', ';')).toEqual(['a', 'b', 'c']);
    });

    it('should parse tab-separated values', () => {
      expect(parseCSVLine('a\tb\tc', '\t')).toEqual(['a', 'b', 'c']);
    });

    it('should handle quoted fields', () => {
      expect(parseCSVLine('"hello world",b,c', ',')).toEqual(['hello world', 'b', 'c']);
    });

    it('should handle commas inside quoted fields', () => {
      expect(parseCSVLine('"a,b",c,d', ',')).toEqual(['a,b', 'c', 'd']);
    });

    it('should handle escaped quotes (double quotes)', () => {
      expect(parseCSVLine('"say ""hello""",b', ',')).toEqual(['say "hello"', 'b']);
    });

    it('should handle empty fields', () => {
      expect(parseCSVLine('a,,c', ',')).toEqual(['a', '', 'c']);
    });

    it('should handle single value', () => {
      expect(parseCSVLine('hello', ',')).toEqual(['hello']);
    });

    it('should trim whitespace around values', () => {
      expect(parseCSVLine('  a , b , c  ', ',')).toEqual(['a', 'b', 'c']);
    });

    it('should handle empty line', () => {
      expect(parseCSVLine('', ',')).toEqual(['']);
    });

    it('should handle semicolons inside quoted fields with semicolon separator', () => {
      expect(parseCSVLine('"a;b";c;d', ';')).toEqual(['a;b', 'c', 'd']);
    });
  });
});
