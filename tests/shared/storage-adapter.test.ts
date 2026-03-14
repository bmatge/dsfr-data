import { describe, it, expect, beforeEach } from 'vitest';
import { LocalStorageAdapter } from '../../packages/shared/src/storage/storage-adapter';

describe('LocalStorageAdapter', () => {
  let adapter: LocalStorageAdapter;

  beforeEach(() => {
    localStorage.clear();
    adapter = new LocalStorageAdapter();
  });

  describe('load', () => {
    it('should return default when key does not exist', async () => {
      expect(await adapter.load('missing', [])).toEqual([]);
      expect(await adapter.load('missing', null)).toBeNull();
    });

    it('should load stored JSON', async () => {
      localStorage.setItem('test', JSON.stringify({ a: 1 }));
      expect(await adapter.load('test', {})).toEqual({ a: 1 });
    });

    it('should return default on invalid JSON', async () => {
      localStorage.setItem('test', 'bad{json');
      expect(await adapter.load('test', 'fallback')).toBe('fallback');
    });
  });

  describe('save', () => {
    it('should save JSON to localStorage', async () => {
      const result = await adapter.save('test', [1, 2, 3]);
      expect(result).toBe(true);
      expect(JSON.parse(localStorage.getItem('test')!)).toEqual([1, 2, 3]);
    });

    it('should overwrite existing values', async () => {
      await adapter.save('test', 'first');
      await adapter.save('test', 'second');
      expect(await adapter.load('test', '')).toBe('second');
    });
  });

  describe('remove', () => {
    it('should remove key from localStorage', async () => {
      localStorage.setItem('test', '"value"');
      await adapter.remove('test');
      expect(localStorage.getItem('test')).toBeNull();
    });

    it('should not throw on missing key', async () => {
      await expect(adapter.remove('nonexistent')).resolves.toBeUndefined();
    });
  });
});
