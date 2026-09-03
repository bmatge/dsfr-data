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
 * Traitement commun d'un echec d'ecriture (#322, #586).
 *
 * Un depassement de quota est une situation que l'utilisateur doit voir : la
 * couche persistance n'affiche pas d'UI elle-meme (#322) mais emet un
 * evenement que le chrome applicatif transforme en toast. `detail.bytes` porte
 * la taille refusee, pour que le message puisse etre actionnable.
 */
function handleStorageError(key: string, payload: string, e: unknown): void {
  if (e instanceof DOMException && (e.name === 'QuotaExceededError' || e.code === 22)) {
    console.warn(
      `[storage] Quota localStorage depasse pour ${key} (${Math.round(payload.length / 1024)} Ko refuses)`
    );
    window.dispatchEvent(
      new CustomEvent('dsfr-data:storage-quota', { detail: { key, bytes: payload.length } })
    );
  } else {
    console.error(`Error saving to localStorage key "${key}":`, e);
  }
}

/**
 * Variante SANS save-hook (#321) : pour les mises a jour de cache issues
 * du serveur (load) — declencher le hook re-televersait l'integralite des
 * collections a chaque ouverture d'app.
 *
 * Signale malgre tout un depassement de quota (#586) : l'echec etait
 * auparavant avale silencieusement, et l'appelant n'avait aucun moyen de
 * distinguer « ecrit » de « perdu ».
 */
export function saveToStorageQuiet<T>(key: string, data: T): boolean {
  const payload = JSON.stringify(data);
  try {
    localStorage.setItem(key, payload);
    return true;
  } catch (e) {
    handleStorageError(key, payload, e);
    return false;
  }
}

/**
 * Save a JSON value to localStorage.
 * Emet l'evenement 'dsfr-data:storage-quota' si le quota est depasse (#322).
 * If a save hook is registered (DB mode), also syncs to backend in background.
 */

export function saveToStorage<T>(key: string, data: T): boolean {
  const payload = JSON.stringify(data);
  try {
    localStorage.setItem(key, payload);
    // Fire save hook for API sync (with re-entry guard)
    if (_saveHook && !_inHook) {
      _inHook = true;
      try {
        _saveHook(key, data);
      } catch {
        /* ignore hook errors */
      }
      _inHook = false;
    }
    return true;
  } catch (e) {
    handleStorageError(key, payload, e);
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
