/**
 * Test helpers for server tests.
 * Creates an Express app backed by a MariaDB test database.
 *
 * Requires a running MariaDB instance. Configure via env vars:
 *   DB_HOST (default: localhost)
 *   DB_PORT (default: 3306)
 *   DB_NAME (default: dsfr_data_test)
 *   DB_USER (default: root)
 *   DB_PASSWORD (default: test)
 *
 * Quick setup:
 *   docker run -d --name mariadb-test -p 3306:3306 \
 *     -e MYSQL_ROOT_PASSWORD=test -e MYSQL_DATABASE=dsfr_data_test mariadb:11
 */

import express from 'express';
import cookieParser from 'cookie-parser';
import { initDatabase, closeDatabase, execute, query } from '../../server/src/db/database.js';
import { authMiddleware, createToken } from '../../server/src/middleware/auth.js';
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

// Set test env defaults
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key-for-tests';
process.env.DB_HOST = process.env.DB_HOST || 'localhost';
process.env.DB_PORT = process.env.DB_PORT || '3306';
process.env.DB_NAME = process.env.DB_NAME || 'dsfr_data_test';
process.env.DB_USER = process.env.DB_USER || 'root';
process.env.DB_PASSWORD = process.env.DB_PASSWORD || 'test';

let initialized = false;

/**
 * Tables in reverse FK order for truncation.
 */
const TABLES_TO_TRUNCATE = [
  'data_cache',
  'monitoring',
  'shares',
  'group_members',
  'dashboards',
  'favorites',
  'connections',
  'sources',
  '`groups`',
  'users',
];

/**
 * Create a test Express app backed by MariaDB.
 * On first call, initializes the database pool and schema.
 * On subsequent calls, truncates all tables for a clean state.
 */
export async function createTestApp(): Promise<Express> {
  if (!initialized) {
    await initDatabase();
    initialized = true;
  } else {
    // Truncate all tables for clean state (disable FK checks temporarily)
    await execute('SET FOREIGN_KEY_CHECKS = 0');
    for (const table of TABLES_TO_TRUNCATE) {
      await execute(`TRUNCATE TABLE ${table}`);
    }
    await execute('SET FOREIGN_KEY_CHECKS = 1');
    // Re-insert schema_version
    await execute('INSERT IGNORE INTO schema_version (version) VALUES (1)');
  }

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
 * Close the test database pool. Call once in afterAll().
 */
export async function closeTestApp(): Promise<void> {
  if (initialized) {
    await closeDatabase();
    initialized = false;
  }
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
