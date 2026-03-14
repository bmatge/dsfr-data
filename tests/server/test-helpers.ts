/**
 * Test helpers for server tests.
 * Creates an Express app with in-memory SQLite for each test suite.
 */

import express from 'express';
import cookieParser from 'cookie-parser';
import { initDatabase, closeDatabase } from '../../server/src/db/database.js';
import { authMiddleware, createToken, setAuthCookie } from '../../server/src/middleware/auth.js';
import type { JwtPayload } from '../../server/src/middleware/auth.js';
import authRoutes from '../../server/src/routes/auth.js';
import sourcesRoutes from '../../server/src/routes/sources.js';
import connectionsRoutes from '../../server/src/routes/connections.js';
import favoritesRoutes from '../../server/src/routes/favorites.js';
import dashboardsRoutes from '../../server/src/routes/dashboards.js';
import groupsRoutes from '../../server/src/routes/groups.js';
import sharesRoutes from '../../server/src/routes/shares.js';
import cacheRoutes from '../../server/src/routes/cache.js';
import migrateRoutes from '../../server/src/routes/migrate.js';
import monitoringRoutes from '../../server/src/routes/monitoring.js';
import type { Express } from 'express';

/**
 * Create a test Express app with in-memory SQLite.
 */
export function createTestApp(): Express {
  // Set JWT_SECRET for tests
  process.env.JWT_SECRET = 'test-secret-key-for-tests';

  // Initialize in-memory database
  initDatabase(':memory:');

  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use(cookieParser());
  app.use(authMiddleware);

  app.use('/api/auth', authRoutes);
  app.use('/api/sources', sourcesRoutes);
  app.use('/api/connections', connectionsRoutes);
  app.use('/api/favorites', favoritesRoutes);
  app.use('/api/dashboards', dashboardsRoutes);
  app.use('/api/groups', groupsRoutes);
  app.use('/api/shares', sharesRoutes);
  app.use('/api/cache', cacheRoutes);
  app.use('/api/migrate', migrateRoutes);
  app.use('/api/monitoring', monitoringRoutes);

  return app;
}

/**
 * Close the test database.
 */
export function closeTestApp(): void {
  closeDatabase();
}

/**
 * Create an auth token for testing.
 */
export function createTestToken(payload: JwtPayload): string {
  return createToken(payload);
}

/**
 * Get a cookie string for authenticated requests.
 */
export function authCookie(payload: JwtPayload): string {
  const token = createTestToken(payload);
  return `gw-auth-token=${token}`;
}
