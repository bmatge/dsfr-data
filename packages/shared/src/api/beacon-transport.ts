/**
 * Transport beacon du mode DB (#308).
 *
 * Implemente le hook `window.DSFR_DATA_BEACON_TRANSPORT` cote APP : la lib
 * publiee ne contient plus la branche `__gwDbMode` qui POSTait sur
 * /api/monitoring/beacon avec credentials — son transport par defaut reste
 * le pixel opt-in. Enregistre par @dsfr-data/app-ui (chrome commun).
 */

interface BeaconPayload {
  component: string;
  chartType: string | null;
  pageUrl: string;
}

declare global {
  interface Window {
    DSFR_DATA_BEACON_TRANSPORT?: (payload: BeaconPayload) => boolean | void;
    __gwDbMode?: boolean;
  }
}

/**
 * Enregistre le transport API du mode DB si aucun n'est deja pose.
 * Le beacon n'est pris en charge (true) que lorsque le mode DB est actif
 * au moment de l'appel — sinon la lib retombe sur le pixel.
 */
export function registerDbBeaconTransport(): void {
  if (typeof window === 'undefined') return;
  if (window.DSFR_DATA_BEACON_TRANSPORT) return;

  window.DSFR_DATA_BEACON_TRANSPORT = (payload: BeaconPayload): boolean => {
    if (window.__gwDbMode !== true) return false;
    // Fire-and-forget : un POST qui echoue est perdu (le monitoring DB
    // n'est pas critique), pas de double comptage pixel+API
    fetch('/api/monitoring/beacon', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload),
    }).catch(() => {});
    return true;
  };
}
