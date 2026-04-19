/**
 * CSRF protection via double-submit cookie (csrf-csrf v4).
 *
 * Modèle de menace : l'app utilise un cookie httpOnly `gw-auth-token` (JWT)
 * pour l'authentification, avec `cors({ credentials: true })`. Une form HTML
 * hébergée sur un domaine tiers pourrait POST vers nos routes en incluant
 * automatiquement le cookie d'auth via le navigateur de la victime
 * (attaque CSRF classique).
 *
 * Mitigation : chaque requête muante (POST/PUT/PATCH/DELETE) doit porter un
 * header `X-CSRF-Token` dont la valeur est dérivée d'un secret serveur et
 * liée à la session de l'utilisateur. Le token est distribué au frontend via
 * un cookie non-httpOnly `gw-csrf` + renvoyé dans le body de `GET /api/auth/csrf`.
 *
 * Routes exemptées (déclarées dans SKIP_PATHS) : routes d'auth-bootstrap
 * (login/register/reset-password/…) qui s'exécutent AVANT qu'un token CSRF
 * puisse exister. L'anti-CSRF de ces routes repose sur le rate-limiter + la
 * SameSite policy du cookie d'auth.
 *
 * cf. issue #92, ADR-004.
 */

import { doubleCsrf } from 'csrf-csrf';
import type { Request, Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from './auth.js';

const SKIP_PATHS = new Set<string>([
  '/api/health',
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/verify-email',
  '/api/auth/resend-verification',
  '/api/auth/forgot-password',
  '/api/auth/reset-password',
]);

const CSRF_SECRET = (): string => {
  const s = process.env.CSRF_SECRET;
  if (s) return s;
  // Fallback sur ENCRYPTION_KEY (déjà requis en prod, 64 hex chars) pour
  // éviter de multiplier les secrets à provisionner. Les deux secrets ont
  // des portées différentes (AES vs HMAC) donc pas de risque de collision.
  const enc = process.env.ENCRYPTION_KEY;
  if (enc && enc.length >= 32) return enc;
  if (process.env.NODE_ENV === 'test') return 'test-csrf-secret-do-not-use-in-prod';
  throw new Error('CSRF_SECRET (or ENCRYPTION_KEY fallback) environment variable is required');
};

const csrfUtils = doubleCsrf({
  getSecret: () => CSRF_SECRET(),
  getSessionIdentifier: (req: Request) => {
    const u = (req as AuthenticatedRequest).user;
    return u?.userId ?? req.ip ?? 'anonymous';
  },
  cookieName: 'gw-csrf',
  cookieOptions: {
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    httpOnly: false, // frontend lit la valeur pour l'écho via X-CSRF-Token
    path: '/',
  },
  size: 32,
  ignoredMethods: ['GET', 'HEAD', 'OPTIONS'],
  getCsrfTokenFromRequest: (req: Request) => {
    const h = req.headers['x-csrf-token'];
    return Array.isArray(h) ? h[0] : h;
  },
  skipCsrfProtection: (req: Request): boolean => {
    // Désactivé en test sauf si explicitement demandé (évite de casser les
    // 61+ tests d'intégration existants qui ne passent pas de token).
    if (process.env.NODE_ENV === 'test' && process.env.CSRF_ENABLED !== '1') return true;
    return SKIP_PATHS.has(req.path);
  },
  errorConfig: {
    statusCode: 403,
    message: 'Invalid CSRF token',
    code: 'CSRF_INVALID',
  },
});

export const doubleCsrfProtection = csrfUtils.doubleCsrfProtection;
export const generateCsrfToken = csrfUtils.generateCsrfToken;

/**
 * Express error handler spécifique aux erreurs CSRF — renvoie un JSON
 * structuré que le frontend peut détecter pour déclencher un refetch.
 */
export function csrfErrorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  next: NextFunction
): void {
  if (
    err === csrfUtils.invalidCsrfTokenError ||
    (err as { code?: string })?.code === 'CSRF_INVALID'
  ) {
    res.status(403).json({ error: 'Invalid CSRF token', code: 'CSRF_INVALID' });
    return;
  }
  next(err);
}
