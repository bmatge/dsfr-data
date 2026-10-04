// Relais cachable (ADR-155) — lecture de la cible dans l'URL de la requête.
//
// Forme du contrat : `<relais>/<hôte>/<chemin>?<requête>` (docs/RELAY.md §2).
// Ce module ne DÉCODE rien et ne NORMALISE rien : il refuse ce qui n'est pas
// déjà sous forme canonique. Une cible acceptée est transmise à l'amont octet
// pour octet (C-URL-1), et la même chaîne sert de clé de cache (C-CACHE-2).

import { isValidHostname } from './addresses.mjs';

/** Erreur portée jusqu'à la réponse : statut HTTP et code stable du contrat. */
export class RelayError extends Error {
  /**
   * @param {number} status
   * @param {string} code
   * @param {{ retryAfter?: number }} [extra]
   */
  constructor(status, code, extra = {}) {
    super(code);
    this.name = 'RelayError';
    this.status = status;
    this.code = code;
    this.retryAfter = extra.retryAfter;
  }
}

/** Cible de requête HTTP : ASCII imprimable, sans espace. CR, LF et NUL en sont exclus. */
const PRINTABLE_RE = /^[\x21-\x7e]*$/;

/** Alphabet d'un chemin (RFC 3986 `pchar`, `/` et `%`). La barre oblique inverse n'en fait pas partie. */
const PATH_CHARS_RE = /^[A-Za-z0-9\-._~!$&'()*+,;=:@/%]*$/;

/** Un `%` qui n'ouvre pas un échappement complet (deux chiffres hexadécimaux). */
const BROKEN_ESCAPE_RE = /%(?![0-9A-Fa-f]{2})/;

/**
 * Échappements refusés dans un chemin :
 * - `%2e` : un point n'a jamais besoin d'être encodé, sauf à déguiser `..` ;
 * - `%2f` et `%5c` : une barre oblique encodée change de sens selon qui décode ;
 * - `%25` : double encodage (`%252e` redevient `%2e` au décodage suivant) ;
 * - `%00` à `%1f`, `%7f` : caractères de contrôle, dont CR et LF.
 */
const PATH_FORBIDDEN_ESCAPE_RE = /%(?:2e|2f|5c|25|[01][0-9a-f]|7f)/i;

/** Échappements refusés dans une requête : NUL, LF, CR (C-INJ-1). */
const QUERY_FORBIDDEN_ESCAPE_RE = /%(?:00|0a|0d)/i;

/**
 * Valide un chemin d'amont déjà sous forme brute (commence par `/`).
 *
 * @param {string} path
 * @returns {boolean}
 */
export function isSafePath(path) {
  if (!path.startsWith('/') || !PATH_CHARS_RE.test(path)) return false;
  if (BROKEN_ESCAPE_RE.test(path)) return false;
  if (PATH_FORBIDDEN_ESCAPE_RE.test(path)) return false;
  const segments = path.split('/');
  // segments[0] est vide (le chemin commence par `/`). Un segment vide ailleurs
  // qu'en dernière position est un `//` ; `.` et `..` sont des remontées.
  // Le paramètre de chemin (`..;x`) est retiré avant comparaison : certains
  // serveurs d'application lisent `..;` comme `..`.
  for (let index = 1; index < segments.length; index += 1) {
    const segment = segments[index];
    const name = segment.split(';', 1)[0];
    if (name === '.' || name === '..') return false;
    if (segment === '' && index !== segments.length - 1) return false;
  }
  return true;
}

/**
 * Valide une requête brute, `?` initial compris (ou chaîne vide).
 *
 * @param {string} search
 * @returns {boolean}
 */
export function isSafeSearch(search) {
  if (search === '') return true;
  if (!search.startsWith('?') || !PRINTABLE_RE.test(search)) return false;
  if (search.includes('#')) return false;
  return !QUERY_FORBIDDEN_ESCAPE_RE.test(search);
}

/**
 * Vrai si `path` est sous l'un des préfixes autorisés. Un préfixe s'arrête à
 * une frontière de segment : `/api/public` n'autorise pas `/api/public-prive`.
 *
 * @param {string} path
 * @param {readonly string[]} prefixes liste vide : aucun préfixe imposé
 * @returns {boolean}
 */
export function isUnderPrefix(path, prefixes) {
  if (prefixes.length === 0) return true;
  return prefixes.some((prefix) => {
    if (prefix.endsWith('/')) return path.startsWith(prefix);
    return path === prefix || path.startsWith(`${prefix}/`);
  });
}

/**
 * Lit la cible dans l'URL brute de la requête.
 *
 * @param {string} rawUrl `req.url`, tel que reçu
 * @param {string} prefix préfixe du relais, sans barre finale (`/donnees-relais`)
 * @param {number} maxUrlLength
 * @returns {{ host: string, path: string, search: string }}
 * @throws {RelayError}
 */
export function parseTarget(rawUrl, prefix, maxUrlLength) {
  if (typeof rawUrl !== 'string') throw new RelayError(400, 'invalid-url');
  if (rawUrl.length > maxUrlLength) throw new RelayError(414, 'url-too-long');
  if (!PRINTABLE_RE.test(rawUrl) || rawUrl.includes('#')) throw new RelayError(400, 'invalid-url');
  if (!rawUrl.startsWith(`${prefix}/`)) throw new RelayError(404, 'not-found');

  const rest = rawUrl.slice(prefix.length + 1);
  const queryIndex = rest.indexOf('?');
  const pathPart = queryIndex === -1 ? rest : rest.slice(0, queryIndex);
  const search = queryIndex === -1 ? '' : rest.slice(queryIndex);

  const slashIndex = pathPart.indexOf('/');
  const host = slashIndex === -1 ? pathPart : pathPart.slice(0, slashIndex);
  const path = slashIndex === -1 ? '/' : pathPart.slice(slashIndex);

  // L'hôte est comparé octet pour octet : ni mise en minuscules, ni retrait du
  // point final, ni décodage. Ce qui n'a pas la forme d'un nom d'hôte en
  // minuscules n'est dans aucune liste blanche (C-URL-2, C-SSRF-1 à 3).
  if (!isValidHostname(host)) throw new RelayError(403, 'host-not-allowed');
  if (!isSafePath(path)) throw new RelayError(400, 'invalid-path');
  if (!isSafeSearch(search)) throw new RelayError(400, 'invalid-query');

  return { host, path, search };
}
