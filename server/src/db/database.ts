/**
 * MariaDB database initialization and query helpers.
 * Uses mysql2/promise for async pooled connections.
 */

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
export async function query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [rows] = await getPool().execute(sql, params as any);
  return rows as T[];
}

/**
 * Execute a SELECT query and return the first row (or undefined).
 */
export async function queryOne<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T | undefined> {
  const rows = await query<T>(sql, params);
  return rows[0];
}

/**
 * Execute an INSERT/UPDATE/DELETE query and return the result header.
 */
export async function execute(sql: string, params?: unknown[]): Promise<ResultSetHeader> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [result] = await getPool().execute(sql, params as any);
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
export async function connQuery<T = Record<string, unknown>>(conn: PoolConnection, sql: string, params?: unknown[]): Promise<T[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [rows] = await conn.execute(sql, params as any);
  return rows as T[];
}

/**
 * Single-row query helper for use inside a transaction.
 */
export async function connQueryOne<T = Record<string, unknown>>(conn: PoolConnection, sql: string, params?: unknown[]): Promise<T | undefined> {
  const rows = await connQuery<T>(conn, sql, params);
  return rows[0];
}

/**
 * Execute helper for use inside a transaction.
 */
export async function connExecute(conn: PoolConnection, sql: string, params?: unknown[]): Promise<ResultSetHeader> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [result] = await conn.execute(sql, params as any);
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
    .map(s => s.trim())
    .filter(s => s.length > 0);

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
  const row = await queryOne<{ version: number }>('SELECT MAX(version) as version FROM schema_version');
  const currentVersion = row?.version ?? 0;

  // Future migrations go here:
  // if (currentVersion < 2) { await migrate_v2(); }

  void currentVersion; // suppress unused warning
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
