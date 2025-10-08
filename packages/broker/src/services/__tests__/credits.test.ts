/**
 * CreditService Tests
 * Tests atomic credit operations and race condition handling
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { DatabaseClient } from '../../lib/db-client';
import { CreditService } from '../credits';

// Test database connection string
const TEST_DB_URL = process.env.DATABASE_URL || 'postgresql://localhost/ainp_test';

describe.skipIf(!process.env.DATABASE_URL)('CreditService', () => {
  let db: DatabaseClient;
  let credits: CreditService;
  const testDID = 'did:key:test-credits-' + Date.now();

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      console.warn('⚠️  Skipping credits tests: DATABASE_URL not set');
      return;
    }

    db = new DatabaseClient(TEST_DB_URL);
    await db.connect();
    credits = new CreditService(db);

    // Create test agent
    await db.query(`
      INSERT INTO agents (did, public_key)
      VALUES ($1, $2)
      ON CONFLICT (did) DO NOTHING
    `, [testDID, 'test-key']);
  });

  afterAll(async () => {
    if (!process.env.DATABASE_URL || !db) return;

    // Cleanup
    await db.query('DELETE FROM credit_transactions WHERE agent_did = $1', [testDID]);
    await db.query('DELETE FROM credit_accounts WHERE agent_did = $1', [testDID]);
    await db.query('DELETE FROM agents WHERE did = $1', [testDID]);
    await db.disconnect();
  });

  beforeEach(async () => {
    if (!process.env.DATABASE_URL || !db) return;

    // Reset account before each test
    await db.query('DELETE FROM credit_transactions WHERE agent_did = $1', [testDID]);
    await db.query('DELETE FROM credit_accounts WHERE agent_did = $1', [testDID]);
  });

  it('should create account with initial balance', async () => {
    const account = await credits.createAccount(testDID, 1000000n);

    expect(account.agent_did).toBe(testDID);
    expect(account.balance).toBe(1000000n);
    expect(account.reserved).toBe(0n);
    expect(account.earned).toBe(0n);
    expect(account.spent).toBe(0n);
  });

  it('should be idempotent (create account twice)', async () => {
    await credits.createAccount(testDID, 1000000n);
    const account2 = await credits.createAccount(testDID, 2000000n);

    // Should keep original balance
    expect(account2.balance).toBe(1000000n);
  });

  it('should get account', async () => {
    await credits.createAccount(testDID, 500000n);
    const account = await credits.getAccount(testDID);

    expect(account).not.toBeNull();
    expect(account!.balance).toBe(500000n);
  });

  it('should return null for non-existent account', async () => {
    const account = await credits.getAccount('did:key:nonexistent');
    expect(account).toBeNull();
  });

  it('should reserve credits (sufficient balance)', async () => {
    await credits.createAccount(testDID, 1000000n);
    await credits.reserve(testDID, 100000n, 'intent-1');

    const account = await credits.getAccount(testDID);
    expect(account!.balance).toBe(1000000n);
    expect(account!.reserved).toBe(100000n);
  });

  it('should reject reserve (insufficient balance)', async () => {
    await credits.createAccount(testDID, 50000n);

    await expect(
      credits.reserve(testDID, 100000n, 'intent-2')
    ).rejects.toThrow('Insufficient balance');
  });

  it('should release credits with spend', async () => {
    await credits.createAccount(testDID, 1000000n);
    await credits.reserve(testDID, 100000n, 'intent-3');
    await credits.release(testDID, 100000n, 30000n, 'intent-3');

    const account = await credits.getAccount(testDID);
    expect(account!.balance).toBe(970000n); // 1000000 - 30000
    expect(account!.reserved).toBe(0n);
    expect(account!.spent).toBe(30000n);
  });

  it('should release credits without spend', async () => {
    await credits.createAccount(testDID, 1000000n);
    await credits.reserve(testDID, 100000n, 'intent-4');
    await credits.release(testDID, 100000n, 0n, 'intent-4');

    const account = await credits.getAccount(testDID);
    expect(account!.balance).toBe(1000000n); // No spend
    expect(account!.reserved).toBe(0n);
    expect(account!.spent).toBe(0n);
  });

  it('should deposit credits', async () => {
    await credits.createAccount(testDID, 1000000n);
    await credits.deposit(testDID, 500000n);

    const account = await credits.getAccount(testDID);
    expect(account!.balance).toBe(1500000n);
  });

  it('should earn credits', async () => {
    await credits.createAccount(testDID, 1000000n);
    await credits.earn(testDID, 25000n, 'intent-5');

    const account = await credits.getAccount(testDID);
    expect(account!.balance).toBe(1025000n);
    expect(account!.earned).toBe(25000n);
  });

  it('should get transaction history', async () => {
    await credits.createAccount(testDID, 1000000n);
    await credits.deposit(testDID, 100000n);
    await credits.earn(testDID, 50000n, 'intent-6');

    const history = await credits.getTransactionHistory(testDID, 10, 0);

    expect(history.length).toBeGreaterThanOrEqual(2);
    expect(history[0].tx_type).toBe('earn'); // Most recent
    expect(history[1].tx_type).toBe('deposit');
  });

  it('should handle concurrent reserve operations (race condition)', async () => {
    await credits.createAccount(testDID, 1000000n);

    // Simulate 3 concurrent reserve attempts
    const promises = [
      credits.reserve(testDID, 400000n, 'intent-7a'),
      credits.reserve(testDID, 400000n, 'intent-7b'),
      credits.reserve(testDID, 400000n, 'intent-7c')
    ];

    const results = await Promise.allSettled(promises);

    // Only 2 should succeed (total reserved should be <= 1000000)
    const succeeded = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;

    expect(succeeded).toBe(2);
    expect(failed).toBe(1);

    const account = await credits.getAccount(testDID);
    expect(account!.reserved).toBe(800000n); // 2 × 400000
  });
});
