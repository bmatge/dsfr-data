import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  setStorageAdapter,
  getStorageAdapter,
  loadData,
  saveData,
  removeData,
} from '../../packages/shared/src/storage/storage-provider';
import { LocalStorageAdapter } from '../../packages/shared/src/storage/storage-adapter';
import type { StorageAdapter } from '../../packages/shared/src/storage/storage-adapter';

describe('StorageProvider', () => {
  beforeEach(() => {
    localStorage.clear();
    // Reset to default adapter
    setStorageAdapter(new LocalStorageAdapter());
  });

  describe('default adapter (LocalStorageAdapter)', () => {
    it('should load from localStorage', async () => {
      localStorage.setItem('key', JSON.stringify({ x: 42 }));
      expect(await loadData('key', null)).toEqual({ x: 42 });
    });

    it('should save to localStorage', async () => {
      await saveData('key', [1, 2]);
      expect(JSON.parse(localStorage.getItem('key')!)).toEqual([1, 2]);
    });

    it('should remove from localStorage', async () => {
      localStorage.setItem('key', '"val"');
      await removeData('key');
      expect(localStorage.getItem('key')).toBeNull();
    });
  });

  describe('setStorageAdapter', () => {
    it('should switch to a custom adapter', async () => {
      const mockAdapter: StorageAdapter = {
        load: vi.fn().mockResolvedValue('from-mock'),
        save: vi.fn().mockResolvedValue(true),
        remove: vi.fn().mockResolvedValue(undefined),
      };

      setStorageAdapter(mockAdapter);
      expect(getStorageAdapter()).toBe(mockAdapter);

      const result = await loadData('any-key', 'default');
      expect(result).toBe('from-mock');
      expect(mockAdapter.load).toHaveBeenCalledWith('any-key', 'default');
    });

    it('should route save through custom adapter', async () => {
      const mockAdapter: StorageAdapter = {
        load: vi.fn().mockResolvedValue(null),
        save: vi.fn().mockResolvedValue(true),
        remove: vi.fn().mockResolvedValue(undefined),
      };

      setStorageAdapter(mockAdapter);
      await saveData('key', { data: true });
      expect(mockAdapter.save).toHaveBeenCalledWith('key', { data: true });
    });

    it('should route remove through custom adapter', async () => {
      const mockAdapter: StorageAdapter = {
        load: vi.fn().mockResolvedValue(null),
        save: vi.fn().mockResolvedValue(true),
        remove: vi.fn().mockResolvedValue(undefined),
      };

      setStorageAdapter(mockAdapter);
      await removeData('key');
      expect(mockAdapter.remove).toHaveBeenCalledWith('key');
    });
  });
});
