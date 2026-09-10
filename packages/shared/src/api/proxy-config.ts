/**
 * Proxy configuration for CORS handling of external APIs
 * Supports dev (Vite proxy) and production (external proxy) modes
 */

export type ProxyMode = 'dev-relative' | 'remote' | 'direct';

export interface ProxyConfig {
  baseUrl: string;
  endpoints: {
    grist: string;
    gristGouv: string;
    albert: string;
    tabular: string;
    insee: string;
    corsProxy: string;
  };
  /**
   * - `remote` : proxy configuré (distant, ou relatif à l'origine si baseUrl vide)
   * - `dev-relative` : dev Vite de CE repo (routes proxy servies par vite.config.ts)
   * - `direct` : aucun proxy — les URLs externes sont fetchées telles quelles
   */
  mode: ProxyMode;
}

/**
 * Override runtime injecté par le site déployeur AVANT le chargement des
 * composants :
 *
 *   window.DSFR_DATA_PROXY = 'https://mon-proxy.example.fr';   // domaine du proxy
 *   window.DSFR_DATA_PROXY = { baseUrl: '', endpoints: {...} } // chemins relatifs / personnalisés
 *   window.DSFR_DATA_PROXY = false;                            // désactive tout proxying
 *
 * Sans override ni variables VITE_* au build, le défaut est l'accès direct
 * (mode `direct`) : aucun trafic ne transite par un domaine tiers.
 */
export interface RuntimeProxyConfig {
  baseUrl?: string;
  endpoints?: Partial<ProxyConfig['endpoints']>;
}

/**
 * Build-time configuration injectée par Vite via `import.meta.env`.
 *
 * Important : les accès doivent rester **statiques** (`import.meta.env.VITE_*`)
 * pour que Vite remplace par les valeurs littérales au bundle. Toute indirection
 * (`const m = import.meta; m.env...`) casse la substitution → les bundles
 * retombent silencieusement sur les fallbacks ci-dessous.
 *
 * Types déclarés localement plutôt que via `vite/client` pour ne pas coupler
 * `@dsfr-data/shared` à Vite (utilisable hors environnement Vite).
 */
declare global {
  interface ImportMeta {
    readonly env?: {
      readonly DEV?: boolean;
      readonly VITE_PROXY_URL?: string;
      readonly VITE_PROXY_URL_EMBED?: string;
      readonly VITE_BEACON_URL?: string;
      readonly VITE_LIB_URL?: string;
    };
  }
}

/**
 * URL de base **runtime de l'app** — utilisée par l'app elle-même pour ses
 * propres appels (monitoring, widgets Grist consommant des données, etc.).
 * Surchargeable via `VITE_PROXY_URL` au build. Cf. #180.
 *
 * Pas de fallback codé en dur : sans variable au build, la valeur est vide et
 * le mode `direct` s'applique (cf. #319). Les déploiements de l'app passent
 * par `validate-build-env.ts` qui exige `VITE_PROXY_URL`.
 */
export const PROXY_BASE_URL: string = import.meta.env?.VITE_PROXY_URL || '';

/**
 * URL de base **inlinée dans le code généré** par les builders (widgets
 * destinés à être collés sur un site tiers). Permet à un opérateur de
 * self-héberger l'app sur un domaine interne tout en générant des widgets
 * qui pointent vers un domaine public stable.
 * Surchargeable via `VITE_PROXY_URL_EMBED` au build, fallback sur
 * `PROXY_BASE_URL` (= cas du déploiement de référence). Cf. #180.
 */
export const PROXY_BASE_URL_EMBED: string = import.meta.env?.VITE_PROXY_URL_EMBED || PROXY_BASE_URL;

/**
 * URL de collecte du **beacon de télémétrie** baké dans le bundle lib
 * (`packages/core`). Le bundle étant distribué sur npm/CDN et chargé par
 * des sites tiers, l'URL doit pointer vers le domaine qui héberge la
 * collecte (typiquement = domaine d'embed).
 * Surchargeable via `VITE_BEACON_URL` au build, fallback sur
 * `PROXY_BASE_URL_EMBED` (= cas du déploiement de référence). Cf. #180.
 */
export const BEACON_BASE_URL: string = import.meta.env?.VITE_BEACON_URL || PROXY_BASE_URL_EMBED;

/**
 * Base URL for the dsfr-data JS library in generated code.
 * Configurable via VITE_LIB_URL at build time.
 *
 * Supported values:
 *   - unset / "jsdelivr" → https://cdn.jsdelivr.net/npm/dsfr-data@0/dist (default)
 *   - "unpkg"            → https://unpkg.com/dsfr-data@0/dist
 *   - "self"             → ${PROXY_BASE_URL}/dist (self-hosted)
 *   - Custom URL         → used as-is (e.g. "https://my-cdn.example.com/dist")
 */
function resolveLibUrl(): string {
  const raw: string = import.meta.env?.VITE_LIB_URL || '';
  if (!raw || raw === 'jsdelivr') return 'https://cdn.jsdelivr.net/npm/dsfr-data@0/dist';
  if (raw === 'unpkg') return 'https://unpkg.com/dsfr-data@0/dist';
  if (raw === 'self') return `${PROXY_BASE_URL}/dist`;
  return raw;
}
export const LIB_URL: string = resolveLibUrl();

/**
 * Default production proxy configuration. Utilise `PROXY_BASE_URL_EMBED`
 * (= `PROXY_BASE_URL` par défaut) car les adapters de `packages/core`
 * tournent dans le bundle lib, qui s'exécute aussi bien dans l'app
 * elle-même (preview) que sur des sites tiers embarquant un widget.
 * Dans les deux cas, l'URL doit être celle publiquement accessible.
 * Cf. issue #180.
 */
const DEFAULT_ENDPOINTS: ProxyConfig['endpoints'] = {
  grist: '/grist-proxy',
  gristGouv: '/grist-gouv-proxy',
  albert: '/albert-proxy',
  tabular: '/tabular-proxy',
  insee: '/insee-proxy',
  corsProxy: '/cors-proxy',
};

export const DEFAULT_PROXY_CONFIG: ProxyConfig = {
  baseUrl: PROXY_BASE_URL_EMBED,
  endpoints: { ...DEFAULT_ENDPOINTS },
  mode: PROXY_BASE_URL_EMBED ? 'remote' : 'direct',
};

/**
 * Detect if running in THIS repo's Vite dev server.
 *
 * `import.meta.env.DEV` est substitué statiquement par Vite : `true` dans le
 * dev des apps de ce repo (qui ont les routes `/*-proxy/` dans leur
 * vite.config), `false` (objet env inliné) dans les bundles construits
 * distribués sur npm/CDN. Un intégrateur tiers en dev local
 * (`localhost:3000`) n'est donc jamais traité comme notre dev server (#319).
 *
 * ⚠️ CETTE GARDE A DÉJÀ ÉTÉ PLIÉE AU BUILD (#716). `scripts/build-lib.ts` est
 * lancé par `vite-node`, qui pose `NODE_ENV=development` ; Vite en déduisait
 * `DEV: true` et supprimait la condition à la compilation. Le bundle **publié
 * sur npm** ne testait donc plus que l'hôte et le port : n'importe quel
 * intégrateur développant sur `http://localhost:3000` recevait des URL
 * `/…-proxy/` relatives qui n'existent pas chez lui. Le signal est depuis posé
 * explicitement (`mode` + `define` de `import.meta.env.DEV`) dans
 * `scripts/build-lib.ts`, et `DSFR_DATA_DEV_BUILD=1` rouvre le chemin de
 * développement. Un test-garde grep les bundles produits.
 *
 * Ne jamais remplacer `import.meta.env.DEV` par une indirection : la
 * substitution statique de Vite ne survivrait pas, et l'heuristique d'hôte
 * redeviendrait seule maîtresse — c'est-à-dire le bug.
 *
 * Servir le bundle **construit** sur `localhost` derrière ses propres routes de
 * proxy est un cas légitime (Docker en local, `npm run preview`, `app-dist/`
 * servi à la main, pages `guide/` hors serveur de dev). Deux échappatoires,
 * dans cet ordre :
 *
 *  - au runtime, sans reconstruire — `window.DSFR_DATA_PROXY = { baseUrl: '' }`
 *    avant le chargement de la lib : la branche 2 de `getProxyConfig` rend les
 *    mêmes chemins relatifs ;
 *  - au build — `DSFR_DATA_DEV_BUILD=1 npm run build`.
 */
export function isViteDevMode(): boolean {
  if (typeof window === 'undefined') return false;
  if (import.meta.env?.DEV !== true) return false;
  const { hostname, port } = window.location;
  return (
    (hostname === 'localhost' || hostname === '127.0.0.1') &&
    !!port &&
    port !== '80' &&
    port !== '443'
  );
}

function readRuntimeProxy(): string | false | RuntimeProxyConfig | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as Window & { DSFR_DATA_PROXY?: string | false | RuntimeProxyConfig })
    .DSFR_DATA_PROXY;
}

function stripTrailingSlash(url: string): string {
  // Parcours caractere par caractere plutot qu'un regex `/\/+$/` : `override`
  // est une entree publique (attribut proxy-url, #340) et le `+$` ancre est
  // signale ReDoS polynomial par CodeQL. Cette version est lineaire.
  let end = url.length;
  while (end > 0 && url.charCodeAt(end - 1) === 47 /* '/' */) end--;
  return url.slice(0, end);
}

/** N'avertir qu'une fois par page : la config est resolue a chaque appel. */
let proxyCrossOriginSignale = false;

/** Remet le garde-fou a zero — reserve aux tests. */
export function _resetAvertissementProxy(): void {
  proxyCrossOriginSignale = false;
}

/**
 * Avertit quand le proxy bake au build n'est pas sur l'origine de la page.
 *
 * CE GARDE-FOU EXISTE PARCE QUE LE SYMPTOME DESIGNE LE MAUVAIS COUPABLE.
 * Un `VITE_PROXY_URL` errone ne se manifeste pas comme une erreur de
 * configuration : il produit un mur d'erreurs « Content-Security-Policy : …
 * empeche le chargement d'une ressource (connect-src) », parce que la requete
 * part vers une autre origine que celle de la page et sort donc de `'self'`.
 * On accuse la CSP, qui fait exactement son travail.
 *
 * Cas reel : une instance servie depuis `https://x.lab.exemple.fr` avec
 * `VITE_PROXY_URL=https://x.exemple.fr` — un sous-domaine oublie. Toutes les
 * connexions de sources echouaient en `NetworkError`, et la piste suivie a
 * ete celle des en-tetes de securite.
 *
 * Pourquoi seulement dans cette branche : les branches 0 et 2 (attribut
 * `proxy-url`, `window.DSFR_DATA_PROXY`) servent justement au widget embarque
 * sur un site tiers, ou le cross-origin est LA configuration voulue. La
 * branche 4 n'est atteinte que par un build d'app self-hostee — les bundles
 * npm/CDN n'ont aucune URL bakee depuis #319 — et la, l'URL doit etre celle
 * de l'app : `docs/DEPLOYMENT.md` la fait deriver d'`APP_DOMAIN`, et le cas du
 * domaine separe a sa propre variable, `VITE_PROXY_URL_EMBED`.
 *
 * Avertit, ne corrige pas : basculer d'autorite sur l'origine de la page
 * masquerait une configuration fausse au lieu de la signaler, et casserait le
 * deploiement ou l'operateur a effectivement separe les domaines.
 */
function avertirSiProxyCrossOrigin(baseUrl: string): void {
  if (proxyCrossOriginSignale) return;
  if (typeof window === 'undefined' || typeof window.location === 'undefined') return;
  if (!baseUrl || !/^https?:\/\//i.test(baseUrl)) return;

  let origineProxy: string;
  try {
    origineProxy = new URL(baseUrl).origin;
  } catch {
    return;
  }
  if (origineProxy === window.location.origin) return;

  proxyCrossOriginSignale = true;
  console.warn(
    `dsfr-data: le proxy configuré au build (${origineProxy}) n'est pas sur ` +
      `l'origine de cette page (${window.location.origin}). Les appels vers ` +
      `${origineProxy} sortiront de « connect-src 'self' » et seront bloqués ` +
      `par la CSP — les erreurs qui suivent désigneront la CSP, pas la cause. ` +
      `Corriger VITE_PROXY_URL (dérivé d'APP_DOMAIN, cf. docs/DEPLOYMENT.md) ` +
      `et reconstruire. Pour servir volontairement le proxy depuis un autre ` +
      `domaine, utiliser VITE_PROXY_URL_EMBED.`
  );
}

/**
 * Get the proxy configuration based on the current environment.
 *
 * Ordre de résolution (du plus spécifique au plus général ; cf. #319, #340) :
 * 0. `override` (attribut `proxy-url` d'une source) → proxy explicite par
 *    source, prioritaire sur tout le reste. String non vide → proxy distant ;
 *    objet → merge baseUrl/endpoints ; vide/absent → ignoré (on continue).
 * 1. `window.DSFR_DATA_PROXY = false` → mode `direct`, aucun proxying.
 * 2. `window.DSFR_DATA_PROXY` (string ou objet) → proxy du site déployeur.
 * 3. Dev Vite de CE repo → chemins relatifs (routes de vite.config.ts).
 * 4. `VITE_PROXY_URL_EMBED`/`VITE_PROXY_URL` injectées au build (déploiement
 *    self-hosted de l'app) → proxy distant.
 * 5. Défaut (consommateur npm/CDN sans configuration) → mode `direct` :
 *    les URLs externes sont fetchées telles quelles, aucun trafic ne
 *    transite par un domaine tiers.
 *
 * Note : utilise `PROXY_BASE_URL_EMBED` (et non `PROXY_BASE_URL` runtime) car
 * cette config est consommée par les adapters de `packages/core` qui tournent
 * dans le bundle lib — chargé indifféremment dans l'app elle-même (preview)
 * ou sur un site tiers embarquant un widget. Cf. issue #180.
 *
 * @param override Override explicite (attribut `proxy-url`), prioritaire sur
 *   `window.DSFR_DATA_PROXY` et la config build-time. Le plus spécifique gagne.
 */
export function getProxyConfig(override?: string | RuntimeProxyConfig): ProxyConfig {
  const endpoints = { ...DEFAULT_ENDPOINTS };

  // 0. Override explicite par source (attribut proxy-url, #340) : le plus
  //    spécifique gagne, prioritaire sur window.DSFR_DATA_PROXY et le build-time.
  if (typeof override === 'string' && override.trim()) {
    return { baseUrl: stripTrailingSlash(override.trim()), endpoints, mode: 'remote' };
  }
  if (override && typeof override === 'object') {
    return {
      baseUrl: stripTrailingSlash(override.baseUrl?.trim() ?? ''),
      endpoints: { ...endpoints, ...override.endpoints },
      mode: 'remote',
    };
  }

  const runtime = readRuntimeProxy();

  // 1. Opt-out runtime explicite : aucun proxy
  if (runtime === false) {
    return { baseUrl: '', endpoints, mode: 'direct' };
  }

  // 2. Override runtime fourni par le site déployeur
  if (typeof runtime === 'string' && runtime.trim()) {
    return { baseUrl: stripTrailingSlash(runtime.trim()), endpoints, mode: 'remote' };
  }
  if (runtime && typeof runtime === 'object') {
    return {
      baseUrl: stripTrailingSlash(runtime.baseUrl?.trim() ?? ''),
      endpoints: { ...endpoints, ...runtime.endpoints },
      mode: 'remote',
    };
  }

  // 3. Vite dev de ce repo : URLs relatives, proxy assuré par vite.config.ts
  if (isViteDevMode()) {
    return { baseUrl: '', endpoints, mode: 'dev-relative' };
  }

  // 4. Config injectée au build (app self-hosted).
  //    @deprecated Résolution build-time conservée en fallback temporaire (#340) :
  //    préférer l'attribut `proxy-url` par source ou `window.DSFR_DATA_PROXY`.
  if (PROXY_BASE_URL_EMBED) {
    avertirSiProxyCrossOrigin(PROXY_BASE_URL_EMBED);
    return { baseUrl: PROXY_BASE_URL_EMBED, endpoints, mode: 'remote' };
  }

  // 5. Défaut npm/CDN : accès direct, sans proxy
  return { baseUrl: '', endpoints, mode: 'direct' };
}
