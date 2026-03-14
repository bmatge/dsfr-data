/**
 * One-time migration of localStorage keys from dsfr-data to dsfr-data.
 * Call once at app startup. Idempotent — skips if new keys already exist.
 */
export function migrateStorageKeys(): void {
  if (typeof localStorage === 'undefined') return;

  const migrations: [string, string][] = [
    ['dsfr-data-favorites', 'dsfr-data-favorites'],
    ['dsfr-data-dashboards', 'dsfr-data-dashboards'],
    ['dsfr-data-connections', 'dsfr-data-connections'],
    ['dsfr-data-sources', 'dsfr-data-sources'],
    ['dsfr-data-selected-source', 'dsfr-data-selected-source'],
    ['dsfr-data-sync-queue', 'dsfr-data-sync-queue'],
  ];

  for (const [oldKey, newKey] of migrations) {
    try {
      const val = localStorage.getItem(oldKey);
      if (val !== null && localStorage.getItem(newKey) === null) {
        localStorage.setItem(newKey, val);
        localStorage.removeItem(oldKey);
      }
    } catch {
      // ignore storage errors (private browsing, etc.)
    }
  }
}
