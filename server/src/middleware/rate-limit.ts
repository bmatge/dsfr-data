/**
 * Rate limiting middleware for auth endpoints.
 */

import rateLimit, { type Options } from 'express-rate-limit';
import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { sanitizeReturnTo, OIDC_NO_SESSION_ERRORS, OIDC_STATE_COOKIE } from '../utils/oidc.js';

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  message: { error: 'Trop de tentatives, reessayez dans 15 minutes' },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Rate limiter for password-based endpoints (login, register, resend-verification,
 * forgot/reset-password) : la barriere anti force brute.
 * 10 attempts per 15-minute window per IP.
 * Le parcours OIDC n'y passe pas (voir oidcLimiter) : il ne transporte aucun
 * secret devinable, et la connexion silencieuse le declenche a chaque onglet.
 * Disabled in test environment to avoid interference.
 */
export function authLimiter(req: Request, res: Response, next: NextFunction): void {
  if (process.env.NODE_ENV === 'test') {
    next();
    return;
  }
  limiter(req, res, next);
}

/**
 * Limiteur du parcours OIDC (/oidc/login, /oidc/callback), compteur distinct
 * de authLimiter. La connexion silencieuse (#365) part a l'ouverture de chaque
 * onglet et coute deux appels (login puis callback) : sur le compteur des mots
 * de passe, cinq onglets suffisaient a bloquer une IP — et derriere une IP
 * partagee d'administration, tout un service.
 *
 * Seuil large : l'IdP porte la vraie protection, ce compteur ne vise que l'abus.
 * Une tentative SILENCIEUSE refusee ne montre jamais d'erreur : retour a la page
 * d'origine, comme quand l'IdP repond « pas de session ».
 */
export function createOidcLimiter(overrides: Partial<Options> = {}): RequestHandler {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res, _next, options) => {
      if (req.query.silent === '1') {
        res.redirect(sanitizeReturnTo(req.query.return_to));
        return;
      }
      // Retour d'une tentative silencieuse sans session IdP : meme silence.
      const idpError = typeof req.query.error === 'string' ? req.query.error : '';
      if (OIDC_NO_SESSION_ERRORS.has(idpError)) {
        let returnTo = '/';
        try {
          const raw = (req.cookies as Record<string, string> | undefined)?.[OIDC_STATE_COOKIE];
          returnTo = sanitizeReturnTo((JSON.parse(raw ?? '{}') as { returnTo?: unknown }).returnTo);
        } catch {
          /* cookie absent ou illisible : '/' */
        }
        res.redirect(returnTo);
        return;
      }
      res.status(options.statusCode).json({
        error: 'Trop de tentatives de connexion, réessayez dans quelques minutes',
      });
    },
    ...overrides,
  });
}

const oidcRateLimiter = createOidcLimiter();

export function oidcLimiter(req: Request, res: Response, next: NextFunction): void {
  if (process.env.NODE_ENV === 'test') {
    next();
    return;
  }
  oidcRateLimiter(req, res, next);
}

const beaconLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60, // 60 beacons per minute per IP (generous for pages with many widgets)
  message: { error: 'Too many beacons' },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Rate limiter for the beacon endpoint.
 * 60 requests per minute per IP.
 * Disabled in test environment.
 */
export function beaconRateLimiter(req: Request, res: Response, next: NextFunction): void {
  if (process.env.NODE_ENV === 'test') {
    next();
    return;
  }
  beaconLimiter(req, res, next);
}

const globalApiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 300, // 300 requests per minute per IP (safety net against scraping/brute force)
  message: { error: 'Trop de requetes, ralentissez' },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Global safety-net rate limiter applied to every /api/* route before auth
 * middleware kicks in. Much more permissive than the per-route auth limiter;
 * its job is only to catch obvious abuse (scraping, brute force).
 * Disabled in test environment.
 */
export function globalApiRateLimiter(req: Request, res: Response, next: NextFunction): void {
  if (process.env.NODE_ENV === 'test') {
    next();
    return;
  }
  globalApiLimiter(req, res, next);
}

const publicShareLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60, // 60 anonymous requests per minute per IP
  message: { error: 'Too many requests for public share' },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Rate limiter for anonymous public-share endpoints. Stricter than the global
 * limiter because these endpoints have no auth — the only client identifier
 * is the IP. Goal : a leaked link cannot be used to scrape data en masse.
 * Disabled in test environment.
 */
export function publicShareRateLimiter(req: Request, res: Response, next: NextFunction): void {
  if (process.env.NODE_ENV === 'test') {
    next();
    return;
  }
  publicShareLimiter(req, res, next);
}
