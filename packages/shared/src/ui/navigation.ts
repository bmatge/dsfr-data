/**
 * Centralized inter-app navigation helpers.
 * Maps app identifiers to their paths under apps/.
 */

type AppId = 'builder' | 'builder-ia' | 'dashboard' | 'monitoring' | 'playground' | 'sources' | 'favorites';

const APP_FILES: Record<AppId, string> = {
  'builder': 'apps/builder/index.html',
  'builder-ia': 'apps/builder-ia/index.html',
  'dashboard': 'apps/dashboard/index.html',
  'monitoring': 'apps/monitoring/index.html',
  'playground': 'apps/playground/index.html',
  'sources': 'apps/sources/index.html',
  'favorites': 'apps/favorites/index.html',
};

/**
 * Compute relative prefix from current page to root.
 * E.g. from /apps/builder/index.html → "../../"
 * E.g. from /index.html → "./"
 */
function getRootPrefix(): string {
  const path = window.location.pathname;

  // If we're inside /apps/{name}/, we need ../../
  const appsMatch = path.match(/\/apps\/[^/]+\//);
  if (appsMatch) {
    return '../../';
  }

  return './';
}

/**
 * Build an href to another app.
 */
export function appHref(app: AppId, params?: Record<string, string>): string {
  const file = APP_FILES[app];
  if (!file) return '#';

  const prefix = getRootPrefix();
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  return `${prefix}${file}${qs}`;
}

/**
 * Navigate to another app (JS redirect).
 */
export function navigateTo(app: AppId, params?: Record<string, string>): void {
  window.location.href = appHref(app, params);
}
