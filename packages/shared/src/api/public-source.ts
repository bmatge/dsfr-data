/**
 * Source publiée (ADR-165, #1361) : adresses des routes de l'instance qui
 * servent les lignes d'une source à connexion authentifiée, la clé restant
 * côté serveur.
 *
 * - `publicSourceRecordsUrl(jeton)` : la route ANONYME, celle que le code
 *   généré emporte sur un site tiers. Absolue, sur l'origine de l'instance
 *   (`PROXY_BASE_URL_EMBED` au build, sinon l'origine de la page) : un
 *   fragment collé ailleurs doit savoir où est l'instance.
 * - `authenticatedSourceRecordsPath(id)` : la route AUTHENTIFIÉE, relative,
 *   pour l'aperçu des apps avant publication (même origine, cookie de
 *   session). Elle ne doit jamais figurer dans un code copié : hors de la
 *   session, elle répond 401.
 *
 * Module app-side : exporté par `index.ts`, pas par `lib.ts`.
 */

import { PROXY_BASE_URL_EMBED } from './proxy-config.js';

/** Le jeton est un UUID : tout autre texte n'a rien à faire dans une URL. */
const TOKEN_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Vrai si la source porte un jeton de publication bien formé. */
export function isPublishedSource(source: Record<string, unknown> | null | undefined): boolean {
  const token = source?.publicToken;
  return typeof token === 'string' && TOKEN_RE.test(token);
}

function instanceOrigin(): string {
  if (PROXY_BASE_URL_EMBED) return PROXY_BASE_URL_EMBED.replace(/\/+$/, '');
  if (
    typeof window !== 'undefined' &&
    window.location?.origin &&
    window.location.origin !== 'null'
  ) {
    return window.location.origin;
  }
  return '';
}

/** URL absolue de la route publique d'une source publiée. */
export function publicSourceRecordsUrl(token: string): string {
  return `${instanceOrigin()}/api/public/sources/${encodeURIComponent(token)}/records`;
}

/** Chemin (même origine) de la route authentifiée d'une source, pour l'aperçu. */
export function authenticatedSourceRecordsPath(sourceId: string): string {
  return `/api/sources/${encodeURIComponent(sourceId)}/records`;
}
