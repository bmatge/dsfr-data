/**
 * Favorites manager - handles CRUD operations on stored favorites
 */

import { loadFromStorage, saveToStorage, STORAGE_KEYS } from '@dsfr-data/shared';

export interface Favorite {
  id: string;
  name: string;
  code: string;
  chartType?: string;
  /** Originating app — maps to server column `source_app`. */
  sourceApp?: string;
  /** @deprecated Legacy local-storage entries — read with `sourceApp ?? source`. */
  source?: string;
  createdAt: string;
  /** Serialized builder state — maps to server column `builder_state_json`. */
  builderStateJson?: Record<string, unknown>;
  /** @deprecated Legacy local-storage entries — read with `builderStateJson ?? builderState`. */
  builderState?: Record<string, unknown>;
}

export function loadFavorites(): Favorite[] {
  return loadFromStorage<Favorite[]>(STORAGE_KEYS.FAVORITES, []);
}

export function saveFavorites(favorites: Favorite[]): void {
  saveToStorage(STORAGE_KEYS.FAVORITES, favorites);
}

export function deleteFavorite(favorites: Favorite[], id: string): Favorite[] {
  return favorites.filter((f) => f.id !== id);
}

export function findFavorite(favorites: Favorite[], id: string): Favorite | undefined {
  return favorites.find((f) => f.id === id);
}
