/**
 * Type-safe localStorage helpers with error handling
 */

/** Well-known storage keys used across apps */
export const STORAGE_KEYS = {
  FAVORITES: 'dsfr-data-favorites',
  DASHBOARDS: 'dsfr-data-dashboards',
  CONNECTIONS: 'dsfr-data-connections',
  SOURCES: 'dsfr-data-sources',
  SELECTED_SOURCE: 'dsfr-data-selected-source',
  TOURS: 'dsfr-data-tours',
} as const;

/**
 * Optional hook called after every saveToStorage().
 * Used by initAuth() to sync writes to the backend API.
 */
let _saveHook: ((key: string, data: unknown) => void) | null = null;
let _inHook = false;

/** Register a hook that fires after every saveToStorage call (for API sync). */
export function setSaveHook(hook: ((key: string, data: unknown) => void) | null): void {
  _saveHook = hook;
}

/**
 * Load a JSON value from localStorage
 * Returns the parsed value or the provided default on error
 */
export function loadFromStorage<T>(key: string, defaultValue: T): T {
  try {
    const data = localStorage.getItem(key);
    return data ? (JSON.parse(data) as T) : defaultValue;
  } catch {
    return defaultValue;
  }
}

/**
 * Save a JSON value to localStorage.
 * Shows a toast if quota is exceeded.
 * If a save hook is registered (DB mode), also syncs to backend in background.
 */
export function saveToStorage<T>(key: string, data: T): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(data));
    // Fire save hook for API sync (with re-entry guard)
    if (_saveHook && !_inHook) {
      _inHook = true;
      try { _saveHook(key, data); } catch { /* ignore hook errors */ }
      _inHook = false;
    }
    return true;
  } catch (e) {
    if (e instanceof DOMException && (e.name === 'QuotaExceededError' || e.code === 22)) {
      import('../ui/toast.js').then(({ toastError }) => {
        toastError('Espace de stockage plein. Supprimez des elements pour continuer.');
      });
    } else {
      console.error(`Error saving to localStorage key "${key}":`, e);
    }
    return false;
  }
}

/**
 * Remove a value from localStorage
 */
export function removeFromStorage(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch (e) {
    console.error(`Error removing localStorage key "${key}":`, e);
  }
}
