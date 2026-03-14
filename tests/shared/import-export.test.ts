import { describe, it, expect, beforeEach } from 'vitest';
import { STORAGE_KEYS } from '../../packages/shared/src/storage/local-storage';
import {
  exportAllData,
  importData,
} from '../../packages/shared/src/storage/import-export';

describe('import-export', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('exportAllData', () => {
    it('should return empty arrays when storage is empty', () => {
      const bundle = exportAllData();
      expect(bundle.version).toBe(1);
      expect(bundle.exportedAt).toBeDefined();
      expect(bundle.sources).toEqual([]);
      expect(bundle.connections).toEqual([]);
      expect(bundle.favorites).toEqual([]);
      expect(bundle.dashboards).toEqual([]);
    });

    it('should export stored data', () => {
      localStorage.setItem(STORAGE_KEYS.SOURCES, JSON.stringify([
        { id: 'src-1', name: 'Source 1', type: 'manual' },
      ]));
      localStorage.setItem(STORAGE_KEYS.FAVORITES, JSON.stringify([
        { id: 'fav-1', name: 'Fav', code: '<div/>' },
      ]));

      const bundle = exportAllData();
      expect(bundle.sources).toHaveLength(1);
      expect(bundle.sources[0]).toEqual({ id: 'src-1', name: 'Source 1', type: 'manual' });
      expect(bundle.favorites).toHaveLength(1);
    });

    it('should strip apiKey from connections', () => {
      localStorage.setItem(STORAGE_KEYS.CONNECTIONS, JSON.stringify([
        { id: 'c-1', name: 'Grist', type: 'grist', url: 'http://test', apiKey: 'SECRET-KEY-123' },
      ]));

      const bundle = exportAllData();
      expect(bundle.connections).toHaveLength(1);
      const exported = bundle.connections[0] as Record<string, unknown>;
      expect(exported.id).toBe('c-1');
      expect(exported.name).toBe('Grist');
      expect(exported.apiKey).toBeUndefined();
    });

    it('should include exportedAt as ISO string', () => {
      const bundle = exportAllData();
      expect(() => new Date(bundle.exportedAt)).not.toThrow();
      expect(new Date(bundle.exportedAt).toISOString()).toBe(bundle.exportedAt);
    });
  });

  describe('importData', () => {
    it('should throw on null input', () => {
      expect(() => importData(null)).toThrow('Format invalide');
    });

    it('should throw on non-object input', () => {
      expect(() => importData('string')).toThrow('Format invalide');
      expect(() => importData(42)).toThrow('Format invalide');
    });

    it('should throw on wrong version', () => {
      expect(() => importData({ version: 2 })).toThrow('Version non supportee');
    });

    it('should throw on missing version', () => {
      expect(() => importData({ sources: [] })).toThrow('Version non supportee');
    });

    it('should import valid sources', () => {
      const result = importData({
        version: 1,
        sources: [
          { id: 'src-1', name: 'Source 1', type: 'manual' },
          { id: 'src-2', name: 'Source 2', type: 'grist' },
        ],
      });

      expect(result.sources).toBe(2);
      expect(result.skipped).toBe(0);

      const stored = JSON.parse(localStorage.getItem(STORAGE_KEYS.SOURCES)!);
      expect(stored).toHaveLength(2);
    });

    it('should skip invalid sources', () => {
      const result = importData({
        version: 1,
        sources: [
          { id: 'src-1', name: 'Valid', type: 'manual' },
          { name: 'No ID', type: 'manual' },  // invalid: no id
          null,  // invalid
        ],
      });

      expect(result.sources).toBe(1);
      expect(result.skipped).toBe(2);
    });

    it('should import valid connections', () => {
      const result = importData({
        version: 1,
        connections: [
          { id: 'c-1', name: 'Conn 1', type: 'grist' },
        ],
      });

      expect(result.connections).toBe(1);
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEYS.CONNECTIONS)!);
      expect(stored).toHaveLength(1);
    });

    it('should import valid favorites', () => {
      const result = importData({
        version: 1,
        favorites: [
          { id: 'f-1', name: 'Fav', code: '<div/>' },
        ],
      });

      expect(result.favorites).toBe(1);
    });

    it('should import valid dashboards', () => {
      const result = importData({
        version: 1,
        dashboards: [
          { id: 'd-1', name: 'Dash' },
        ],
      });

      expect(result.dashboards).toBe(1);
    });

    it('should upsert by ID (update existing)', () => {
      // Pre-populate with a source
      localStorage.setItem(STORAGE_KEYS.SOURCES, JSON.stringify([
        { id: 'src-1', name: 'Old Name', type: 'manual' },
      ]));

      const result = importData({
        version: 1,
        sources: [
          { id: 'src-1', name: 'Updated Name', type: 'manual' },
        ],
      });

      expect(result.sources).toBe(1);
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEYS.SOURCES)!);
      expect(stored).toHaveLength(1);
      expect(stored[0].name).toBe('Updated Name');
    });

    it('should merge new items with existing', () => {
      localStorage.setItem(STORAGE_KEYS.SOURCES, JSON.stringify([
        { id: 'src-1', name: 'Existing', type: 'manual' },
      ]));

      const result = importData({
        version: 1,
        sources: [
          { id: 'src-2', name: 'New', type: 'grist' },
        ],
      });

      expect(result.sources).toBe(1);
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEYS.SOURCES)!);
      expect(stored).toHaveLength(2);
      expect(stored[0].id).toBe('src-1');
      expect(stored[1].id).toBe('src-2');
    });

    it('should handle empty arrays gracefully', () => {
      const result = importData({
        version: 1,
        sources: [],
        connections: [],
        favorites: [],
        dashboards: [],
      });

      expect(result).toEqual({ sources: 0, connections: 0, favorites: 0, dashboards: 0, skipped: 0 });
    });

    it('should handle missing arrays gracefully', () => {
      const result = importData({ version: 1 });
      expect(result).toEqual({ sources: 0, connections: 0, favorites: 0, dashboards: 0, skipped: 0 });
    });

    it('should round-trip export then import', () => {
      // Populate data
      localStorage.setItem(STORAGE_KEYS.SOURCES, JSON.stringify([
        { id: 's-1', name: 'Src', type: 'manual' },
      ]));
      localStorage.setItem(STORAGE_KEYS.CONNECTIONS, JSON.stringify([
        { id: 'c-1', name: 'Conn', type: 'grist' },
      ]));
      localStorage.setItem(STORAGE_KEYS.FAVORITES, JSON.stringify([
        { id: 'f-1', name: 'Fav', code: '<div/>' },
      ]));
      localStorage.setItem(STORAGE_KEYS.DASHBOARDS, JSON.stringify([
        { id: 'd-1', name: 'Dash' },
      ]));

      const bundle = exportAllData();

      // Clear everything
      localStorage.clear();

      // Import back
      const result = importData(bundle);
      expect(result.sources).toBe(1);
      expect(result.connections).toBe(1);
      expect(result.favorites).toBe(1);
      expect(result.dashboards).toBe(1);
      expect(result.skipped).toBe(0);

      // Verify data is restored
      const sources = JSON.parse(localStorage.getItem(STORAGE_KEYS.SOURCES)!);
      expect(sources[0].id).toBe('s-1');
    });
  });
});
