/**
 * Widget usage beacon - fire-and-forget tracking of widget deployments.
 * Sends a lightweight request to the proxy with component metadata.
 * Used by the monitoring dashboard to track where widgets are deployed.
 */

import { PROXY_BASE_URL } from '@dsfr-data/shared';

const BEACON_URL = `${PROXY_BASE_URL}/beacon`;
const sent = new Set<string>();

/**
 * Send a beacon to track widget usage.
 * Deduplicated: only one beacon per component+type per page load.
 * Skipped in dev mode (localhost).
 */
export function sendWidgetBeacon(component: string, subtype?: string): void {
  const key = `${component}:${subtype || ''}`;
  if (sent.has(key)) return;
  sent.add(key);

  // Skip in dev mode and on the app itself (only track external deployments)
  if (typeof window === 'undefined') return;
  const host = window.location.hostname;
  if (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === new URL(PROXY_BASE_URL).hostname
  ) {
    return;
  }

  const params = new URLSearchParams();
  params.set('c', component);
  if (subtype) params.set('t', subtype);
  params.set('r', window.location.origin);

  // In DB mode, send as JSON POST to the API (more reliable, stored in SQLite)
  // Fallback to pixel tracking if the POST fails
  const useApi = typeof window !== 'undefined' && (window as any).__gwDbMode === true;

  if (useApi) {
    try {
      fetch('/api/monitoring/beacon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          component,
          chartType: subtype || null,
          origin: window.location.origin,
        }),
      }).catch(() => {
        // Fallback to pixel
        new Image().src = `${BEACON_URL}?${params.toString()}`;
      });
      return;
    } catch {
      // Fall through to pixel
    }
  }

  const url = `${BEACON_URL}?${params.toString()}`;

  try {
    new Image().src = url;
  } catch {
    // Silently ignore beacon failures - never impact widget functionality
  }
}
