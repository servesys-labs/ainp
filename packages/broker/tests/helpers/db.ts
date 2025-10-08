/**
 * Test Database Helper
 * Provides database setup and teardown utilities for tests
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { DatabaseClient } from '../../src/lib/db-client';

// Test database connection string
const TEST_DB_URL = process.env.DATABASE_URL || 'postgresql://localhost/ainp_test';

/**
 * Setup test database with all migrations applied
 * Returns connected DatabaseClient ready for use
 */
export async function setupTestDatabase(): Promise<DatabaseClient> {
  const db = new DatabaseClient(TEST_DB_URL);
  await db.connect();
  return db;
}

/**
 * Apply migration file to test database
 * @param db - Connected database client
 * @param migrationFile - Filename relative to packages/db/migrations/
 */
export async function applyMigration(db: DatabaseClient, migrationFile: string): Promise<void> {
  const migrationPath = join(
    __dirname,
    '../../../db/migrations',
    migrationFile
  );

  const sql = readFileSync(migrationPath, 'utf-8');
  await db.query(sql);
}

/**
 * Clean up negotiations table (remove test data)
 */
export async function cleanupNegotiations(db: DatabaseClient): Promise<void> {
  await db.query('DELETE FROM negotiations');
}

/**
 * Clean up credit-related tables (remove test data)
 */
export async function cleanupCredits(db: DatabaseClient): Promise<void> {
  await db.query('DELETE FROM credit_transactions');
  await db.query('DELETE FROM credit_accounts');
}

/**
 * Clean up agents table (remove test agents)
 * @param dids - Array of agent DIDs to remove
 */
export async function cleanupAgents(db: DatabaseClient, dids: string[]): Promise<void> {
  if (dids.length === 0) return;

  const placeholders = dids.map((_, i) => `$${i + 1}`).join(',');
  await db.query(`DELETE FROM agents WHERE did IN (${placeholders})`, dids);
}

/**
 * Create test agent in database
 * Idempotent - won't fail if agent already exists
 */
export async function createTestAgent(db: DatabaseClient, did: string, publicKey?: string): Promise<void> {
  await db.query(
    `
    INSERT INTO agents (did, public_key)
    VALUES ($1, $2)
    ON CONFLICT (did) DO NOTHING
    `,
    [did, publicKey || 'test-key-' + did]
  );
}
