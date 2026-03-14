/**
 * SQLite database initialization and migration management.
 * Uses better-sqlite3 for synchronous, fast SQLite access.
 */

import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

let db: Database.Database | null = null;

/**
 * Get the database instance. Must call initDatabase() first.
 */
export function getDb(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

/**
 * Initialize the SQLite database.
 * Creates tables from schema.sql if they don't exist.
 * Enables WAL mode for better read concurrency.
 *
 * @param dbPath - Path to the SQLite file. Use ':memory:' for tests.
 */
export function initDatabase(dbPath?: string): Database.Database {
  const resolvedPath = dbPath ?? process.env.DB_PATH ?? join(__dirname, '../../data/dsfr-data.db');

  db = new Database(resolvedPath);

  // Enable WAL mode for better read performance
  db.pragma('journal_mode = WAL');
  // Enable foreign keys
  db.pragma('foreign_keys = ON');

  // Run initial schema
  const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf-8');
  db.exec(schema);

  // Run migrations
  runMigrations(db);

  return db;
}

/**
 * Run pending migrations based on the current schema_version.
 */
function runMigrations(database: Database.Database): void {
  const row = database.prepare('SELECT MAX(version) as version FROM schema_version').get() as { version: number } | undefined;
  const currentVersion = row?.version ?? 0;

  // Future migrations go here:
  // if (currentVersion < 2) { migrate_v2(database); }
  // if (currentVersion < 3) { migrate_v3(database); }

  void currentVersion; // suppress unused warning
}

/**
 * Close the database connection. Used in tests and graceful shutdown.
 */
export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}
