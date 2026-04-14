/**
 * MariaDB database initialization and query helpers.
 * Uses mysql2/promise for async pooled connections.
 */

/* eslint-disable no-console -- schema migration progress logs are intentional server-side output */

import mysql from 'mysql2/promise';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { PoolConnection, ResultSetHeader } from 'mysql2/promise';

const __dirname = dirname(fileURLToPath(import.meta.url));

let pool: mysql.Pool | null = null;

/**
 * Get the connection pool. Must call initDatabase() first.
 */
function getPool(): mysql.Pool {
  if (!pool) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return pool;
}

/**
 * Initialize the MariaDB connection pool and run schema + migrations.
 */
export async function initDatabase(): Promise<void> {
  pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    database: process.env.DB_NAME || 'dsfr_data',
    user: process.env.DB_USER || 'dsfr_data',
    password: process.env.DB_PASSWORD || '',
    connectionLimit: 10,
    waitForConnections: true,
    // Return dates as strings (same behavior as SQLite)
    dateStrings: true,
  });

  await runSchema();
  await runMigrations();
}

/**
 * Execute a SELECT query and return all rows.
 */
export async function query<T = Record<string, unknown>>(
  sql: string,
  params?: unknown[]
): Promise<T[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [rows] = await getPool().execute(sql, params as any); // nosemgrep: javascript.lang.security.audit.sqli.node-mysql-sqli.node-mysql-sqli
  return rows as T[];
}

/**
 * Execute a SELECT query and return the first row (or undefined).
 */
export async function queryOne<T = Record<string, unknown>>(
  sql: string,
  params?: unknown[]
): Promise<T | undefined> {
  const rows = await query<T>(sql, params);
  return rows[0];
}

/**
 * Execute an INSERT/UPDATE/DELETE query and return the result header.
 */
export async function execute(sql: string, params?: unknown[]): Promise<ResultSetHeader> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [result] = await getPool().execute(sql, params as any); // nosemgrep: javascript.lang.security.audit.sqli.node-mysql-sqli.node-mysql-sqli
  return result as ResultSetHeader;
}

/**
 * Run a function inside a transaction.
 * The connection is passed to the callback for use with connQuery/connExecute.
 */
export async function transaction<T>(fn: (conn: PoolConnection) => Promise<T>): Promise<T> {
  const conn = await getPool().getConnection();
  await conn.beginTransaction();
  try {
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/**
 * Query helper for use inside a transaction (with a specific connection).
 */
export async function connQuery<T = Record<string, unknown>>(
  conn: PoolConnection,
  sql: string,
  params?: unknown[]
): Promise<T[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [rows] = await conn.execute(sql, params as any); // nosemgrep: javascript.lang.security.audit.sqli.node-mysql-sqli.node-mysql-sqli
  return rows as T[];
}

/**
 * Single-row query helper for use inside a transaction.
 */
export async function connQueryOne<T = Record<string, unknown>>(
  conn: PoolConnection,
  sql: string,
  params?: unknown[]
): Promise<T | undefined> {
  const rows = await connQuery<T>(conn, sql, params);
  return rows[0];
}

/**
 * Execute helper for use inside a transaction.
 */
export async function connExecute(
  conn: PoolConnection,
  sql: string,
  params?: unknown[]
): Promise<ResultSetHeader> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [result] = await conn.execute(sql, params as any); // nosemgrep: javascript.lang.security.audit.sqli.node-mysql-sqli.node-mysql-sqli
  return result as ResultSetHeader;
}

/**
 * Run the initial schema (CREATE TABLE IF NOT EXISTS = idempotent).
 * MariaDB does not support multi-statement execute, so we split by semicolons.
 */
async function runSchema(): Promise<void> {
  const schemaPath = join(__dirname, 'schema-mariadb.sql');
  const schema = readFileSync(schemaPath, 'utf-8');

  // Strip SQL comment lines, then split on semicolons
  const cleaned = schema.replace(/^--.*$/gm, '');
  const statements = cleaned
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const conn = await getPool().getConnection();
  try {
    for (const stmt of statements) {
      await conn.query(stmt);
    }
  } finally {
    conn.release();
  }
}

/**
 * Run pending migrations based on the current schema_version.
 */
async function runMigrations(): Promise<void> {
  const row = await queryOne<{ version: number }>(
    'SELECT MAX(version) as version FROM schema_version'
  );
  const currentVersion = row?.version ?? 0;

  if (currentVersion < 2) {
    await migrateV2();
  }
  if (currentVersion < 3) {
    await migrateV3();
  }
  if (currentVersion < 4) {
    await migrateV4();
  }
  if (currentVersion < 5) {
    await migrateV5();
  }
}

/**
 * Migration v2: auth hardening + ProConnect preparation.
 * - New columns on users: auth_provider, external_id, idp_id, siret,
 *   organizational_unit, is_active, last_login, email_verified,
 *   verification_token_hash, verification_expires
 * - password_hash becomes nullable (ProConnect accounts have no local password)
 * - Existing users marked as email_verified = TRUE
 */
async function migrateV2(): Promise<void> {
  console.log('[db] Running migration v2: auth hardening + ProConnect prep');

  const conn = await getPool().getConnection();
  try {
    // Check if migration already partially applied (column exists)
    const [cols] = await conn.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'auth_provider'`
    );
    if ((cols as unknown[]).length > 0) {
      // Already migrated, just update version
      await conn.query('INSERT IGNORE INTO schema_version (version) VALUES (2)');
      return;
    }

    await conn.beginTransaction();

    // New columns on users
    await conn.query(`ALTER TABLE users
      ADD COLUMN auth_provider ENUM('local', 'proconnect') NOT NULL DEFAULT 'local' AFTER role,
      ADD COLUMN external_id VARCHAR(255) NULL AFTER auth_provider,
      ADD COLUMN idp_id VARCHAR(255) NULL AFTER external_id,
      ADD COLUMN siret VARCHAR(14) NULL AFTER idp_id,
      ADD COLUMN organizational_unit VARCHAR(255) NULL AFTER siret,
      ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE AFTER organizational_unit,
      ADD COLUMN last_login TIMESTAMP NULL AFTER is_active,
      ADD COLUMN email_verified BOOLEAN NOT NULL DEFAULT FALSE AFTER last_login,
      ADD COLUMN verification_token_hash VARCHAR(64) NULL AFTER email_verified,
      ADD COLUMN verification_expires TIMESTAMP NULL AFTER verification_token_hash`);

    // password_hash nullable for ProConnect accounts
    await conn.query(`ALTER TABLE users MODIFY COLUMN password_hash VARCHAR(255) NULL`);

    // Existing users are already verified
    await conn.query(`UPDATE users SET email_verified = TRUE`);

    // Indexes
    await conn.query(`CREATE UNIQUE INDEX idx_users_external ON users(auth_provider, external_id)`);
    await conn.query(`CREATE INDEX idx_users_active ON users(is_active)`);
    await conn.query(`CREATE INDEX idx_users_verification ON users(verification_token_hash)`);

    // Bump schema version
    await conn.query('INSERT IGNORE INTO schema_version (version) VALUES (2)');

    await conn.commit();
    console.log('[db] Migration v2 complete');
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/**
 * Migration v3: sessions table for JWT revocation tracking.
 */
async function migrateV3(): Promise<void> {
  console.log('[db] Running migration v3: sessions table');

  const conn = await getPool().getConnection();
  try {
    await conn.query(`CREATE TABLE IF NOT EXISTS sessions (
      id VARCHAR(36) NOT NULL PRIMARY KEY,
      user_id VARCHAR(36) NOT NULL,
      token_hash VARCHAR(64) NOT NULL,
      auth_provider ENUM('local', 'proconnect') NOT NULL,
      ip_address VARCHAR(45),
      user_agent VARCHAR(500),
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      expires_at TIMESTAMP NOT NULL,
      revoked_at TIMESTAMP NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_sessions_user (user_id),
      INDEX idx_sessions_token (token_hash),
      INDEX idx_sessions_expires (expires_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

    await conn.query('INSERT IGNORE INTO schema_version (version) VALUES (3)');
    console.log('[db] Migration v3 complete');
  } finally {
    conn.release();
  }
}

/**
 * Migration v4: audit_log table for tracking sensitive actions.
 */
async function migrateV4(): Promise<void> {
  console.log('[db] Running migration v4: audit_log table');

  const conn = await getPool().getConnection();
  try {
    await conn.query(`CREATE TABLE IF NOT EXISTS audit_log (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      user_id VARCHAR(36),
      action VARCHAR(100) NOT NULL,
      target_type VARCHAR(50),
      target_id VARCHAR(36),
      details JSON,
      ip_address VARCHAR(45),
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_audit_user (user_id),
      INDEX idx_audit_action (action),
      INDEX idx_audit_created (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

    await conn.query('INSERT IGNORE INTO schema_version (version) VALUES (4)');
    console.log('[db] Migration v4 complete');
  } finally {
    conn.release();
  }
}

/**
 * Migration v5: password reset token columns on users.
 */
async function migrateV5(): Promise<void> {
  console.log('[db] Running migration v5: password reset columns');

  const conn = await getPool().getConnection();
  try {
    const [cols] = await conn.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'reset_token_hash'`
    );
    if ((cols as unknown[]).length > 0) {
      await conn.query('INSERT IGNORE INTO schema_version (version) VALUES (5)');
      return;
    }

    await conn.beginTransaction();

    await conn.query(`ALTER TABLE users
      ADD COLUMN reset_token_hash VARCHAR(64) NULL AFTER verification_expires,
      ADD COLUMN reset_token_expires TIMESTAMP NULL AFTER reset_token_hash`);

    await conn.query(`CREATE INDEX idx_users_reset_token ON users(reset_token_hash)`);

    await conn.query('INSERT IGNORE INTO schema_version (version) VALUES (5)');

    await conn.commit();
    console.log('[db] Migration v5 complete');
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/**
 * Close the connection pool. Used for graceful shutdown.
 */
export async function closeDatabase(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
