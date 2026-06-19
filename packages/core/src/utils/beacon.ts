/**
 * Widget usage beacon - fire-and-forget tracking of widget deployments.
 * Sends a lightweight request to the proxy with component metadata.
 * Used by the monitoring dashboard to track where widgets are deployed.
 */

import { BEACON_BASE_URL } from '@dsfr-data/shared/lib';

/**
 * Resout la base de collecte du beacon **a l'appel** (#340) :
 * `window.DSFR_DATA_BEACON_URL` (string non vide) est prioritaire sur la
 * valeur bakee au build (`BEACON_BASE_URL`). Resolu dynamiquement et non en
 * const au chargement pour que le site hote puisse la poser avant le 1er
 * beacon. Vide → no-op (pas de domaine de collecte).
 */
function resolveBeaconBase(): string {
  const override =
    typeof window !== 'undefined'
      ? (window as Window & { DSFR_DATA_BEACON_URL?: string }).DSFR_DATA_BEACON_URL
      : undefined;
  if (typeof override === 'string' && override.trim()) {
    return override.trim().replace(/\/+$/, '');
  }
  return BEACON_BASE_URL;
}

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
 * Disabled by default. Enable with: window.DSFR_DATA_BEACON = true
 * Deduplicated: only one beacon per component+type per page load.
 * Skipped in dev mode (localhost).
 *
 * Convention de sous-type (`subtype`) : la **variante fonctionnelle** du
 * composant, jamais de la configuration technique.
 * - dsfr-data-chart     -> type de graphique (`bar`, `pie`, ...)
 * - dsfr-data-map-layer -> type de couche (`marker`, `geoshape`, `circle`, `heatmap`)
 * - dsfr-data-source    -> api-type en mode adapter (`opendatasoft`, `grist`, ...)
 * - autres composants   -> omettre le parametre (ne pas passer `''`)
 * Ne PAS envoyer de preset de tuiles, d'URL, ni d'option d'affichage.
 */
export function sendWidgetBeacon(component: string, subtype?: string): void {
  // Opt-in: beacons are disabled unless explicitly enabled
  if (
    typeof window === 'undefined' ||
    !(window as Window & { DSFR_DATA_BEACON?: boolean }).DSFR_DATA_BEACON
  )
    return;

  // Aucun domaine de collecte (ni override runtime, ni bake au build) :
  // aucun endroit où envoyer le beacon
  const beaconBase = resolveBeaconBase();
  if (!beaconBase) return;

  const key = `${component}:${subtype || ''}`;
  if (sent.has(key)) return;
  sent.add(key);

  // Skip non-HTTP origins (local files, srcdoc iframes, null origins)
  const proto = window.location.protocol;
  if (proto !== 'http:' && proto !== 'https:') return;

  // Skip in dev mode and on the beacon collection host itself (only track
  // external deployments — internal pings would inflate stats with our own
  // navigation on the app/embed domain).
  const host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1' || host === new URL(beaconBase).hostname) {
    return;
  }

  // Send full URL (origin + path) for meaningful page tracking.
  // Query string and hash are stripped to avoid leaking sensitive params.
  const pageUrl = sanitizeUrl(window.location.href);

  const params = new URLSearchParams();
  params.set('c', component);
  if (subtype) params.set('t', subtype);
  params.set('r', pageUrl);

  // Transport applicatif via hook (#308) : l'ancienne branche mode-DB qui
  // POSTait sur l'endpoint de monitoring etait de la logique applicative
  // dans la lib (nommage herite de l'ancien nom du projet). La page hote
  // peut enregistrer un transport ; s'il retourne
  // true le beacon est pris en charge, sinon le pixel opt-in reste le
  // transport par defaut.
  const transport = (
    window as Window & {
      DSFR_DATA_BEACON_TRANSPORT?: (payload: {
        component: string;
        chartType: string | null;
        pageUrl: string;
      }) => boolean | void;
    }
  ).DSFR_DATA_BEACON_TRANSPORT;
  if (typeof transport === 'function') {
    try {
      if (transport({ component, chartType: subtype || null, pageUrl }) === true) {
        return;
      }
    } catch {
      // Transport defaillant : pixel par defaut
    }
  }

  const url = `${beaconBase}/beacon?${params.toString()}`;

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
