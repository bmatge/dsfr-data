import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadFromStorage,
  saveToStorage,
  removeFromStorage,
  STORAGE_KEYS,
} from '../../packages/shared/src/storage/local-storage';

describe('localStorage helpers', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('loadFromStorage', () => {
    it('should return default value when key does not exist', () => {
      expect(loadFromStorage('nonexistent', [])).toEqual([]);
      expect(loadFromStorage('nonexistent', null)).toBeNull();
    });

    it('should parse stored JSON', () => {
      localStorage.setItem('test', JSON.stringify([1, 2, 3]));
      expect(loadFromStorage('test', [])).toEqual([1, 2, 3]);
    });

    it('should return default on invalid JSON', () => {
      localStorage.setItem('test', 'not-json{');
      expect(loadFromStorage('test', 'default')).toBe('default');
    });

    it('should handle stored objects', () => {
      const obj = { name: 'test', value: 42 };
      localStorage.setItem('test', JSON.stringify(obj));
      expect(loadFromStorage('test', {})).toEqual(obj);
    });
  });

  describe('saveToStorage', () => {
    it('should save JSON to localStorage', () => {
      saveToStorage('test', [1, 2, 3]);
      expect(localStorage.getItem('test')).toBe('[1,2,3]');
    });

    it('should save objects', () => {
      saveToStorage('test', { a: 1 });
      expect(JSON.parse(localStorage.getItem('test')!)).toEqual({ a: 1 });
    });

    it('should overwrite existing values', () => {
      saveToStorage('test', 'first');
      saveToStorage('test', 'second');
      expect(loadFromStorage('test', '')).toBe('second');
    });
  });

  describe('removeFromStorage', () => {
    it('should remove a key from localStorage', () => {
      localStorage.setItem('test', 'value');
      removeFromStorage('test');
      expect(localStorage.getItem('test')).toBeNull();
    });

    it('should not throw when removing nonexistent key', () => {
      expect(() => removeFromStorage('nonexistent')).not.toThrow();
    });
  });

  describe('STORAGE_KEYS', () => {
    it('should have expected keys', () => {
      expect(STORAGE_KEYS.FAVORITES).toBe('dsfr-data-favorites');
      expect(STORAGE_KEYS.CONNECTIONS).toBe('dsfr-data-connections');
      expect(STORAGE_KEYS.SOURCES).toBe('dsfr-data-sources');
      expect(STORAGE_KEYS.SELECTED_SOURCE).toBe('dsfr-data-selected-source');
    });
  });
});
