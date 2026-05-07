/**
 * Rate limiting middleware for auth endpoints.
 */

import rateLimit from 'express-rate-limit';
import type { Request, Response, NextFunction } from 'express';

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  message: { error: 'Trop de tentatives, reessayez dans 15 minutes' },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Rate limiter for authentication endpoints (login, register, resend-verification).
 * 10 attempts per 15-minute window per IP.
 * Disabled in test environment to avoid interference.
 */
export function authLimiter(req: Request, res: Response, next: NextFunction): void {
  if (process.env.NODE_ENV === 'test') {
    next();
    return;
  }
  limiter(req, res, next);
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
