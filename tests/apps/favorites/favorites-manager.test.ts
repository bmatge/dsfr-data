import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadFavorites,
  saveFavorites,
  deleteFavorite,
  findFavorite,
} from '../../../apps/favorites/src/favorites-manager';
import type { Favorite } from '../../../apps/favorites/src/favorites-manager';

const sampleFavorites: Favorite[] = [
  // Legacy entry — uses deprecated `source` / `builderState` field names.
  // Kept here to exercise the read fallback in favorites/main.ts.
  {
    id: 'fav-1',
    name: 'Chart A',
    code: '<div>Chart A</div>',
    chartType: 'bar',
    source: 'builder',
    createdAt: '2024-01-15T12:00:00Z',
  },
  // New entry — uses canonical `sourceApp` / `builderStateJson`.
  {
    id: 'fav-2',
    name: 'Chart B',
    code: '<div>Chart B</div>',
    chartType: 'line',
    sourceApp: 'playground',
    createdAt: '2024-02-20T14:30:00Z',
    builderStateJson: { some: 'state' },
  },
];

describe('favorites-manager', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('loadFavorites', () => {
    it('should return empty array when no favorites stored', () => {
      expect(loadFavorites()).toEqual([]);
    });

    it('should load favorites from localStorage', () => {
      localStorage.setItem('dsfr-data-favorites', JSON.stringify(sampleFavorites));
      const loaded = loadFavorites();
      expect(loaded).toHaveLength(2);
      expect(loaded[0].name).toBe('Chart A');
    });

    it('should return empty array on corrupt data', () => {
      localStorage.setItem('dsfr-data-favorites', 'not-json{');
      expect(loadFavorites()).toEqual([]);
    });
  });

  describe('saveFavorites', () => {
    it('should save favorites to localStorage', () => {
      saveFavorites(sampleFavorites);
      const stored = JSON.parse(localStorage.getItem('dsfr-data-favorites')!);
      expect(stored).toHaveLength(2);
      expect(stored[0].id).toBe('fav-1');
    });
  });

  describe('deleteFavorite', () => {
    it('should remove a favorite by id', () => {
      const result = deleteFavorite(sampleFavorites, 'fav-1');
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('fav-2');
    });

    it('should return the same list when id not found', () => {
      const result = deleteFavorite(sampleFavorites, 'nonexistent');
      expect(result).toHaveLength(2);
    });

    it('should not mutate the original array', () => {
      deleteFavorite(sampleFavorites, 'fav-1');
      expect(sampleFavorites).toHaveLength(2);
    });
  });

  describe('findFavorite', () => {
    it('should find a favorite by id', () => {
      const fav = findFavorite(sampleFavorites, 'fav-2');
      expect(fav).toBeDefined();
      expect(fav!.name).toBe('Chart B');
    });

    it('should return undefined when not found', () => {
      expect(findFavorite(sampleFavorites, 'nonexistent')).toBeUndefined();
    });
  });
});
