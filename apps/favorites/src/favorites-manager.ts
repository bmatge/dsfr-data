/**
 * Favorites manager - handles CRUD operations on stored favorites
 */

import { loadFromStorage, saveToStorage, STORAGE_KEYS } from '@dsfr-data/shared';

export interface Favorite {
  id: string;
  name: string;
  code: string;
  chartType?: string;
  source?: string;
  createdAt: string;
  builderState?: Record<string, unknown>;
}

export function loadFavorites(): Favorite[] {
  return loadFromStorage<Favorite[]>(STORAGE_KEYS.FAVORITES, []);
}

export function saveFavorites(favorites: Favorite[]): void {
  saveToStorage(STORAGE_KEYS.FAVORITES, favorites);
}

export function deleteFavorite(favorites: Favorite[], id: string): Favorite[] {
  return favorites.filter(f => f.id !== id);
}

export function findFavorite(favorites: Favorite[], id: string): Favorite | undefined {
  return favorites.find(f => f.id === id);
}
