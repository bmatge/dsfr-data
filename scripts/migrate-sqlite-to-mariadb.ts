#!/usr/bin/env tsx
/**
 * One-shot migration script: SQLite → MariaDB
 *
 * Usage:
 *   npx tsx scripts/migrate-sqlite-to-mariadb.ts --sqlite ./data/dsfr-data.db
 *
 * Environment variables (MariaDB connection):
 *   DB_HOST (default: localhost)
 *   DB_PORT (default: 3306)
 *   DB_NAME (default: dsfr_data)
 *   DB_USER (default: dsfr_data)
 *   DB_PASSWORD (required)
 *   ENCRYPTION_KEY (optional, 64 hex chars — if set, encrypts api_key_encrypted)
 */

import Database from 'better-sqlite3';
import mysql from 'mysql2/promise';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Optional crypto import for key encryption
let encryptFn: ((plaintext: string) => string) | null = null;

// ---------------------------------------------------------------------------
// Parse args
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
const sqliteIdx = args.indexOf('--sqlite');
if (sqliteIdx === -1 || !args[sqliteIdx + 1]) {
  console.error('Usage: npx tsx scripts/migrate-sqlite-to-mariadb.ts --sqlite <path-to-sqlite.db>');
  process.exit(1);
}
const sqlitePath = args[sqliteIdx + 1];

// ---------------------------------------------------------------------------
// Tables in FK-safe insertion order
// ---------------------------------------------------------------------------
const TABLES = [
  'schema_version',
  'users',
  'groups',
  'group_members',
  'sources',
  'connections',
  'favorites',
  'dashboards',
  'shares',
  'data_cache',
  'monitoring',
] as const;

// Columns per table (explicit to control order and avoid schema mismatches)
const TABLE_COLUMNS: Record<string, string[]> = {
  schema_version: ['version', 'applied_at'],
  users: ['id', 'email', 'password_hash', 'display_name', 'role', 'created_at', 'updated_at'],
  groups: ['id', 'name', 'description', 'created_by', 'created_at'],
  group_members: ['group_id', 'user_id', 'role'],
  sources: ['id', 'owner_id', 'name', 'type', 'config_json', 'data_json', 'record_count', 'created_at', 'updated_at'],
  connections: ['id', 'owner_id', 'name', 'type', 'config_json', 'api_key_encrypted', 'status', 'created_at', 'updated_at'],
  favorites: ['id', 'owner_id', 'name', 'chart_type', 'code', 'builder_state_json', 'source_app', 'created_at', 'updated_at'],
  dashboards: ['id', 'owner_id', 'name', 'description', 'layout_json', 'widgets_json', 'created_at', 'updated_at'],
  shares: ['id', 'resource_type', 'resource_id', 'target_type', 'target_id', 'permission', 'granted_by', 'created_at'],
  data_cache: ['source_id', 'data_json', 'data_hash', 'record_count', 'fetched_at', 'ttl_seconds'],
  monitoring: ['id', 'component', 'chart_type', 'origin', 'first_seen', 'last_seen', 'call_count'],
};

const BATCH_SIZE = 500;

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log(`\n📦 Migration SQLite → MariaDB`);
  console.log(`   SQLite: ${sqlitePath}`);
  console.log(`   MariaDB: ${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || '3306'}/${process.env.DB_NAME || 'dsfr_data'}`);

  // Try to load encryption module
  if (process.env.ENCRYPTION_KEY && process.env.ENCRYPTION_KEY.length === 64) {
    try {
      const crypto = await import('../server/src/utils/crypto.js');
      encryptFn = crypto.encrypt;
      console.log(`   Encryption: enabled (ENCRYPTION_KEY found)`);
    } catch {
      console.log(`   Encryption: disabled (could not load crypto module)`);
    }
  } else {
    console.log(`   Encryption: disabled (no ENCRYPTION_KEY)`);
  }

  console.log('');

  // 1. Open SQLite (read-only)
  const sqlite = new Database(sqlitePath, { readonly: true });
  sqlite.pragma('foreign_keys = OFF'); // We control insertion order

  // 2. Connect MariaDB
  const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    database: process.env.DB_NAME || 'dsfr_data',
    user: process.env.DB_USER || 'dsfr_data',
    password: process.env.DB_PASSWORD || '',
    connectionLimit: 5,
    dateStrings: true,
  });

  // 3. Run MariaDB schema first
  console.log('🔧 Running MariaDB schema...');
  const schemaPath = join(__dirname, '../server/src/db/schema-mariadb.sql');
  const schema = readFileSync(schemaPath, 'utf-8');
  const statements = schema
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'));

  const conn = await pool.getConnection();
  try {
    for (const stmt of statements) {
      await conn.query(stmt);
    }
  } finally {
    conn.release();
  }
  console.log('   Schema OK\n');

  // 4. Migrate each table
  const report: Record<string, { sqlite: number; mariadb: number }> = {};

  for (const table of TABLES) {
    const columns = TABLE_COLUMNS[table];
    const escapedTable = table === 'groups' ? '`groups`' : table;

    // Read from SQLite
    const rows = sqlite.prepare(`SELECT * FROM ${table === 'groups' ? '"groups"' : table}`).all() as Record<string, unknown>[];
    const sqliteCount = rows.length;

    if (sqliteCount === 0) {
      console.log(`   ${table}: 0 rows (skip)`);
      report[table] = { sqlite: 0, mariadb: 0 };
      continue;
    }

    // Insert in batches
    let inserted = 0;
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      const placeholderRow = `(${columns.map(() => '?').join(', ')})`;
      const placeholders = batch.map(() => placeholderRow).join(', ');
      const values: unknown[] = [];

      for (const row of batch) {
        for (const col of columns) {
          let val = row[col];

          // Encrypt api_key_encrypted if encryption is available
          if (col === 'api_key_encrypted' && val && encryptFn) {
            val = encryptFn(val as string);
          }

          values.push(val ?? null);
        }
      }

      const sql = `INSERT IGNORE INTO ${escapedTable} (${columns.join(', ')}) VALUES ${placeholders}`;
      const [result] = await pool.execute(sql, values) as [mysql.ResultSetHeader, unknown];
      inserted += result.affectedRows;
    }

    // Verify count
    const [[countRow]] = await pool.execute(`SELECT COUNT(*) as count FROM ${escapedTable}`) as [[{ count: number }], unknown];
    const mariadbCount = countRow.count;

    const status = mariadbCount >= sqliteCount ? '✅' : '⚠️';
    console.log(`   ${status} ${table}: ${sqliteCount} SQLite → ${mariadbCount} MariaDB (${inserted} inserted)`);
    report[table] = { sqlite: sqliteCount, mariadb: mariadbCount };
  }

  // 5. Summary
  console.log('\n📊 Summary:');
  let allOk = true;
  for (const [table, counts] of Object.entries(report)) {
    if (counts.mariadb < counts.sqlite) {
      console.log(`   ⚠️  ${table}: ${counts.sqlite - counts.mariadb} rows missing`);
      allOk = false;
    }
  }
  if (allOk) {
    console.log('   ✅ All tables migrated successfully!');
  }

  // Cleanup
  sqlite.close();
  await pool.end();
  console.log('\nDone.\n');
}

main().catch(err => {
  console.error('\n❌ Migration failed:', err);
  process.exit(1);
});
