/**
 * Widget usage beacon - fire-and-forget tracking of widget deployments.
 * Sends a lightweight request to the proxy with component metadata.
 * Used by the monitoring dashboard to track where widgets are deployed.
 */

import { BEACON_BASE_URL } from '@dsfr-data/shared/lib';

/** Retire les slashs finals sans regex (evite l'alerte CodeQL polynomial-redos #340). */
function stripTrailingSlashes(s: string): string {
  let end = s.length;
  while (end > 0 && s[end - 1] === '/') end--;
  return s.slice(0, end);
}

/**
 * URL de collecte declaree via `<dsfr-data-beacon url="...">` (#345), lue en
 * **lookup paresseux** au moment de l'envoi : l'element peut etre declare APRES
 * un composant dans le DOM (le composant connecte avant), donc jamais a l'init
 * (meme regle que #156). On cible un element ayant l'attribut `url`. Vide si
 * absent ou hors d'un document (SSR/tests sans DOM).
 */
function beaconElementUrl(): string {
  if (typeof document === 'undefined') return '';
  const el = document.querySelector('dsfr-data-beacon[url]');
  const raw = el?.getAttribute('url');
  return typeof raw === 'string' ? raw.trim() : '';
}

/**
 * Resout la base de collecte du beacon **a l'appel**. Precedence, du plus
 * specifique au plus general (#340, #345) :
 *   `<dsfr-data-beacon url>` > `window.DSFR_DATA_BEACON_URL` > URL bakee au build.
 * Resolu dynamiquement (pas en const au chargement) pour que le site hote puisse
 * poser l'override ou l'element avant le 1er beacon. Vide → no-op.
 */
function resolveBeaconBase(elementUrl: string): string {
  if (elementUrl) return stripTrailingSlashes(elementUrl);
  const override =
    typeof window !== 'undefined'
      ? (window as Window & { DSFR_DATA_BEACON_URL?: string }).DSFR_DATA_BEACON_URL
      : undefined;
  if (typeof override === 'string' && override.trim()) {
    return stripTrailingSlashes(override.trim());
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
 * Differe une 1re evaluation le temps que le HTML initial finisse de parser, afin
 * qu'un `<dsfr-data-beacon>` declare APRES un composant (les composants emettent
 * dans `connectedCallback`, synchrone) soit malgre tout pris en compte. En cours
 * de parse → `DOMContentLoaded` (l'element peut etre n'importe ou dans le HTML
 * initial) ; sinon → microtask (ajout dynamique dans le meme tick). Jamais bloquant.
 */
function deferBeacon(fn: () => void): void {
  if (typeof document !== 'undefined' && document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fn, { once: true });
  } else if (typeof queueMicrotask === 'function') {
    queueMicrotask(fn);
  } else {
    fn();
  }
}

/**
 * Send a beacon to track widget usage.
 * Disabled by default. Enable with `window.DSFR_DATA_BEACON = true` OR by placing
 * a `<dsfr-data-beacon url="...">` element in the page (declarative opt-in, #345).
 * `window.DSFR_DATA_BEACON = false` is a kill switch that neutralizes even the element.
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
  if (typeof window === 'undefined') return;

  // Opt-in (off par defaut), trois sources :
  //  - window.DSFR_DATA_BEACON === false : kill switch explicite, neutralise
  //    meme un <dsfr-data-beacon> present (coherent avec DSFR_DATA_PROXY = false) ;
  //  - window.DSFR_DATA_BEACON === true : opt-in global classique ;
  //  - <dsfr-data-beacon url="..."> dans le DOM : opt-in declaratif (#345).
  const flag = (window as Window & { DSFR_DATA_BEACON?: boolean }).DSFR_DATA_BEACON;
  if (flag === false) return;

  // Opt-in deja certain (flag global, ou element deja parse) → emission
  // synchrone. Sinon l'element peut etre declare plus loin dans le HTML : on
  // reverifie une fois le DOM pret, sans bloquer le composant.
  if (flag === true || beaconElementUrl()) {
    emitBeacon(component, subtype);
  } else {
    deferBeacon(() => emitBeacon(component, subtype));
  }
}

function emitBeacon(component: string, subtype?: string): void {
  if (typeof window === 'undefined') return;

  // Reevaluation au moment de l'emission (peut etre differee) : le kill switch
  // et l'opt-in declaratif sont relus ici car l'element a pu apparaitre depuis.
  const flag = (window as Window & { DSFR_DATA_BEACON?: boolean }).DSFR_DATA_BEACON;
  if (flag === false) return;
  const elementUrl = beaconElementUrl();
  if (flag !== true && !elementUrl) return;

  // Aucun domaine de collecte (ni element, ni override runtime, ni bake au
  // build) : aucun endroit où envoyer le beacon.
  const beaconBase = resolveBeaconBase(elementUrl);
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
