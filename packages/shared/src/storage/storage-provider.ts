/**
 * Global storage provider — routes load/save/remove through the active adapter.
 * Defaults to LocalStorageAdapter (simple mode).
 * Call setStorageAdapter() at app init to switch to a remote-backed adapter.
 */

import type { StorageAdapter } from './storage-adapter.js';
import { LocalStorageAdapter } from './storage-adapter.js';

let adapter: StorageAdapter = new LocalStorageAdapter();

/** Replace the active storage adapter (e.g. switch to API-backed storage after login) */
export function setStorageAdapter(a: StorageAdapter): void {
  adapter = a;
}

/** Get the active storage adapter */
export function getStorageAdapter(): StorageAdapter {
  return adapter;
}

/** Load a value through the active adapter */
export async function loadData<T>(key: string, defaultValue: T): Promise<T> {
  return adapter.load(key, defaultValue);
}

/** Save a value through the active adapter */
export async function saveData<T>(key: string, data: T): Promise<boolean> {
  return adapter.save(key, data);
}

/** Remove a value through the active adapter */
export async function removeData(key: string): Promise<void> {
  return adapter.remove(key);
}
