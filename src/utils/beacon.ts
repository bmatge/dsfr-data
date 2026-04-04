/**
 * Widget usage beacon - fire-and-forget tracking of widget deployments.
 * Sends a lightweight request to the proxy with component metadata.
 * Used by the monitoring dashboard to track where widgets are deployed.
 */

import { PROXY_BASE_URL } from '@dsfr-data/shared';

const BEACON_URL = `${PROXY_BASE_URL}/beacon`;
const sent = new Set<string>();
/** Keep references to pending beacon images to prevent GC before request completes */
const pending: HTMLImageElement[] = [];

/** Strip query string and hash from a URL to avoid leaking tokens/session params */
function sanitizeUrl(href: string): string {
  try {
    const u = new URL(href);
    return u.origin + u.pathname;
  } catch {
    return href;
  }
}

/**
 * Send a beacon to track widget usage.
 * Deduplicated: only one beacon per component+type per page load.
 * Skipped in dev mode (localhost).
 */
export function sendWidgetBeacon(component: string, subtype?: string): void {
  const key = `${component}:${subtype || ''}`;
  if (sent.has(key)) return;
  sent.add(key);

  // Skip non-HTTP origins (local files, srcdoc iframes, null origins)
  if (typeof window === 'undefined') return;
  const proto = window.location.protocol;
  if (proto !== 'http:' && proto !== 'https:') return;

  // Skip in dev mode and on the app itself (only track external deployments)
  const host = window.location.hostname;
  if (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === new URL(PROXY_BASE_URL).hostname
  ) {
    return;
  }

  // Send full URL (origin + path) for meaningful page tracking.
  // Query string and hash are stripped to avoid leaking sensitive params.
  const pageUrl = sanitizeUrl(window.location.href);

  const params = new URLSearchParams();
  params.set('c', component);
  if (subtype) params.set('t', subtype);
  params.set('r', pageUrl);

  // In DB mode, send as JSON POST to the API (more reliable, stored in MariaDB)
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
          pageUrl,
        }),
      }).catch(() => {
        // Fallback to pixel
        const img = new Image();
        pending.push(img);
        img.onload = img.onerror = () => {
          const idx = pending.indexOf(img);
          if (idx >= 0) pending.splice(idx, 1);
        };
        img.src = `${BEACON_URL}?${params.toString()}`;
      });
      return;
    } catch {
      // Fall through to pixel
    }
  }

  const url = `${BEACON_URL}?${params.toString()}`;

  try {
    const img = new Image();
    pending.push(img);
    img.onload = img.onerror = () => {
      const idx = pending.indexOf(img);
      if (idx >= 0) pending.splice(idx, 1);
    };
    img.src = url;
  } catch {
    // Silently ignore beacon failures - never impact widget functionality
  }
}
