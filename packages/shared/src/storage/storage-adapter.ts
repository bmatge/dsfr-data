/**
 * StorageAdapter interface — abstraction over localStorage or remote API.
 * All methods are async to support both sync (localStorage) and async (API) backends.
 */

import { loadFromStorage, saveToStorage, removeFromStorage } from './local-storage.js';

export interface StorageAdapter {
  load<T>(key: string, defaultValue: T): Promise<T>;
  save<T>(key: string, data: T): Promise<boolean>;
  remove(key: string): Promise<void>;
}

/**
 * Default adapter: wraps localStorage helpers as async.
 * Used in "simple" mode (no backend) and as fallback.
 */
export class LocalStorageAdapter implements StorageAdapter {
  async load<T>(key: string, defaultValue: T): Promise<T> {
    return loadFromStorage(key, defaultValue);
  }

  async save<T>(key: string, data: T): Promise<boolean> {
    return saveToStorage(key, data);
  }

  async remove(key: string): Promise<void> {
    removeFromStorage(key);
  }
}
