/**
 * JWT authentication middleware.
 * Reads JWT from httpOnly cookie 'gw-auth-token'.
 * Sets req.user with user info if valid, null otherwise.
 */

import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface JwtPayload {
  userId: string;
  email: string;
  role: string;
}

export interface AuthenticatedRequest extends Request {
  user: JwtPayload | null;
}

const JWT_SECRET = (): string => {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET environment variable is required');
  return secret;
};

const COOKIE_NAME = 'gw-auth-token';
const TOKEN_EXPIRY = '7d';

/**
 * Middleware that extracts and validates JWT from cookie.
 * Always sets req.user (null if no valid token).
 */
export function authMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const authReq = req as AuthenticatedRequest;
  const token = req.cookies?.[COOKIE_NAME];

  if (!token) {
    authReq.user = null;
    next();
    return;
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET()) as JwtPayload;
    authReq.user = payload;
  } catch {
    authReq.user = null;
  }

  next();
}

/**
 * Middleware that requires authentication.
 * Returns 401 if no valid user.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authReq = req as AuthenticatedRequest;
  if (!authReq.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  next();
}

/**
 * Create a JWT token for a user.
 */
export function createToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET(), { expiresIn: TOKEN_EXPIRY });
}

/**
 * Set the auth cookie on the response.
 */
export function setAuthCookie(res: Response, token: string): void {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    path: '/',
  });
}

/**
 * Clear the auth cookie.
 */
export function clearAuthCookie(res: Response): void {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
  });
}
