/**
 * Generic OIDC client (epic #359).
 *
 * The code references no specific IdP — Authentik vs ProConnect is a runtime
 * distinction made by OIDC_ISSUER. Discovery is lazy and cached on first call.
 *
 * Three env vars are required when OIDC is enabled:
 *   OIDC_ISSUER, OIDC_CLIENT_ID, OIDC_CLIENT_SECRET
 *
 * Optional:
 *   OIDC_REDIRECT_URI, OIDC_DEFAULT_ROLE, OIDC_PROVIDER_LABEL, OIDC_ONLY
 */

import * as oidc from 'openid-client';

let cachedConfig: oidc.Configuration | null = null;

export function isOidcEnabled(): boolean {
  return process.env.OIDC_ENABLED === 'true';
}

export function isOidcOnly(): boolean {
  return process.env.OIDC_ONLY === 'true';
}

export function getOidcIssuer(): string {
  return process.env.OIDC_ISSUER || '';
}

export function getOidcRedirectUri(): string {
  return process.env.OIDC_REDIRECT_URI || '';
}

export function getOidcProviderLabel(): string {
  return process.env.OIDC_PROVIDER_LABEL || 'SSO';
}

export function getOidcDefaultRole(): 'admin' | 'editor' | 'viewer' {
  const role = process.env.OIDC_DEFAULT_ROLE;
  if (role === 'admin' || role === 'editor' || role === 'viewer') return role;
  return 'editor';
}

/**
 * Lazy discovery + client config. Cached for the process lifetime.
 * Throws if any required env var is missing.
 */
export async function getOidcConfig(): Promise<oidc.Configuration> {
  if (cachedConfig) return cachedConfig;

  const issuer = process.env.OIDC_ISSUER;
  const clientId = process.env.OIDC_CLIENT_ID;
  const clientSecret = process.env.OIDC_CLIENT_SECRET;
  const redirectUri = process.env.OIDC_REDIRECT_URI;

  if (!issuer || !clientId || !clientSecret || !redirectUri) {
    throw new Error(
      'OIDC config incomplete: OIDC_ISSUER, OIDC_CLIENT_ID, OIDC_CLIENT_SECRET, OIDC_REDIRECT_URI are required when OIDC_ENABLED=true'
    );
  }

  cachedConfig = await oidc.discovery(new URL(issuer), clientId, clientSecret);
  return cachedConfig;
}

/** Reset the cached config — used by tests to swap envs cleanly. */
export function resetOidcConfig(): void {
  cachedConfig = null;
}

/**
 * Single signed cookie carrying state + nonce + PKCE code_verifier.
 * Scoped to /api/auth/oidc so it never leaks to other routes.
 * SameSite=Lax is mandatory: the IdP redirect back is a cross-site top-level
 * navigation, which 'strict' would block.
 */
export const OIDC_STATE_COOKIE = 'gw-oidc-state';
export const OIDC_STATE_MAX_AGE_MS = 10 * 60 * 1000;
export const OIDC_COOKIE_PATH = '/api/auth/oidc';

export interface OidcStatePayload {
  state: string;
  nonce: string;
  codeVerifier: string;
  /** Chemin relatif où revenir après le callback (SSO silencieux #365). Défaut '/'. */
  returnTo?: string;
}

/**
 * Valide le `return_to` fourni par le front (SSO silencieux #365) : chemin
 * relatif same-origin uniquement — tout ce qui pourrait produire un open
 * redirect (URL absolue, protocol-relative `//`, backslash) retombe sur '/'.
 */
export function sanitizeReturnTo(value: unknown): string {
  if (typeof value !== 'string' || !value.startsWith('/')) return '/';
  if (value.startsWith('//') || value.includes('\\')) return '/';
  return value;
}

/**
 * Erreurs OIDC renvoyées par l'IdP qui signifient « pas de session SSO
 * active » lors d'une tentative `prompt=none` — à traiter comme un non-login
 * silencieux, pas comme une erreur (#365).
 */
export const OIDC_NO_SESSION_ERRORS = new Set([
  'login_required',
  'interaction_required',
  'consent_required',
  'account_selection_required',
]);
