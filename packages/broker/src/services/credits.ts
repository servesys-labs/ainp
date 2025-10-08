/**
 * Credit Service for AINP Broker
 * Atomic credit operations with PostgreSQL transactions
 */

import { DatabaseClient } from '../lib/db-client';

export interface CreditAccount {
  agent_did: string;
  balance: bigint;
  reserved: bigint;
  earned: bigint;
  spent: bigint;
  created_at: Date;
  updated_at: Date;
}

export interface CreditTransaction {
  id: string;
  agent_did: string;
  tx_type: 'deposit' | 'earn' | 'reserve' | 'release' | 'spend' |
           'pou_compute' | 'pou_memory' | 'pou_routing' | 'pou_validation' | 'pou_pool_distribution';
  amount: bigint;
  intent_id?: string;
  usefulness_proof_id?: string;
  metadata?: Record<string, any>;
  created_at: Date;
}

export class CreditService {
  constructor(private db: DatabaseClient) {}

  /**
   * Get account for agent (returns null if not found)
   */
  async getAccount(agentDID: string): Promise<CreditAccount | null> {
    const result = await this.db.query(
      'SELECT * FROM credit_accounts WHERE agent_did = $1',
      [agentDID]
    );

    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    return {
      agent_did: row.agent_did,
      balance: BigInt(row.balance),
      reserved: BigInt(row.reserved),
      earned: BigInt(row.earned),
      spent: BigInt(row.spent),
      created_at: row.created_at,
      updated_at: row.updated_at
    };
  }

  /**
   * Create account with initial balance (idempotent)
   */
  async createAccount(agentDID: string, initialBalance: bigint): Promise<CreditAccount> {
    // Insert with ON CONFLICT to make idempotent
    const result = await this.db.query(`
      INSERT INTO credit_accounts (agent_did, balance)
      VALUES ($1, $2)
      ON CONFLICT (agent_did) DO UPDATE SET balance = credit_accounts.balance
      RETURNING *
    `, [agentDID, initialBalance.toString()]);

    const row = result.rows[0];
    return {
      agent_did: row.agent_did,
      balance: BigInt(row.balance),
      reserved: BigInt(row.reserved),
      earned: BigInt(row.earned),
      spent: BigInt(row.spent),
      created_at: row.created_at,
      updated_at: row.updated_at
    };
  }

  /**
   * Reserve credits for intent (atomic with SELECT...FOR UPDATE)
   * Throws if insufficient balance
   */
  async reserve(agentDID: string, amount: bigint, intentId: string): Promise<void> {
    // Use transaction with row-level lock
    const client = await this.db.pool.connect();

    try {
      await client.query('BEGIN');

      // Lock row for update
      const accountResult = await client.query(
        'SELECT * FROM credit_accounts WHERE agent_did = $1 FOR UPDATE',
        [agentDID]
      );

      if (accountResult.rows.length === 0) {
        throw new Error(`Account not found: ${agentDID}`);
      }

      const account = accountResult.rows[0];
      const balance = BigInt(account.balance);
      const reserved = BigInt(account.reserved);
      const available = balance - reserved;

      if (available < amount) {
        throw new Error(`Insufficient balance: need ${amount}, have ${available}`);
      }

      // Update reserved amount
      await client.query(
        'UPDATE credit_accounts SET reserved = reserved + $1 WHERE agent_did = $2',
        [amount.toString(), agentDID]
      );

      // Record transaction
      await client.query(`
        INSERT INTO credit_transactions (agent_did, tx_type, amount, intent_id)
        VALUES ($1, $2, $3, $4)
      `, [agentDID, 'reserve', amount.toString(), intentId]);

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Release reserved credits (atomic)
   * @param spent - Amount to mark as spent (rest goes back to balance)
   */
  async release(agentDID: string, reserved: bigint, spent: bigint, intentId: string): Promise<void> {
    if (spent > reserved) {
      throw new Error(`Cannot spend more than reserved: spent=${spent}, reserved=${reserved}`);
    }

    const client = await this.db.pool.connect();

    try {
      await client.query('BEGIN');

      // Lock row
      await client.query(
        'SELECT * FROM credit_accounts WHERE agent_did = $1 FOR UPDATE',
        [agentDID]
      );

      // Update: reduce reserved, reduce balance by spent amount, increment spent counter
      await client.query(`
        UPDATE credit_accounts
        SET
          reserved = reserved - $1,
          balance = balance - $2,
          spent = spent + $2
        WHERE agent_did = $3
      `, [reserved.toString(), spent.toString(), agentDID]);

      // Record release transaction
      await client.query(`
        INSERT INTO credit_transactions (agent_did, tx_type, amount, intent_id, metadata)
        VALUES ($1, $2, $3, $4, $5)
      `, [agentDID, 'release', reserved.toString(), intentId, JSON.stringify({ spent: spent.toString() })]);

      // Record spend if non-zero
      if (spent > 0n) {
        await client.query(`
          INSERT INTO credit_transactions (agent_did, tx_type, amount, intent_id)
          VALUES ($1, $2, $3, $4)
        `, [agentDID, 'spend', spent.toString(), intentId]);
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Deposit credits (manual credit addition)
   */
  async deposit(agentDID: string, amount: bigint, metadata?: Record<string, any>): Promise<void> {
    await this.db.query(`
      UPDATE credit_accounts SET balance = balance + $1 WHERE agent_did = $2
    `, [amount.toString(), agentDID]);

    await this.db.query(`
      INSERT INTO credit_transactions (agent_did, tx_type, amount, metadata)
      VALUES ($1, $2, $3, $4)
    `, [agentDID, 'deposit', amount.toString(), metadata ? JSON.stringify(metadata) : null]);
  }

  /**
   * Earn credits from POU proof
   */
  async earn(agentDID: string, amount: bigint, intentId: string, usefulnessProofId?: string): Promise<void> {
    await this.db.query(`
      UPDATE credit_accounts SET balance = balance + $1, earned = earned + $1 WHERE agent_did = $2
    `, [amount.toString(), agentDID]);

    await this.db.query(`
      INSERT INTO credit_transactions (agent_did, tx_type, amount, intent_id, usefulness_proof_id)
      VALUES ($1, $2, $3, $4, $5)
    `, [agentDID, 'earn', amount.toString(), intentId, usefulnessProofId || null]);
  }

  /**
   * Get transaction history with pagination
   */
  async getTransactionHistory(agentDID: string, limit: number = 50, offset: number = 0): Promise<CreditTransaction[]> {
    const result = await this.db.query(`
      SELECT * FROM credit_transactions
      WHERE agent_did = $1
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
    `, [agentDID, limit, offset]);

    return result.rows.map((row: any) => ({
      id: row.id,
      agent_did: row.agent_did,
      tx_type: row.tx_type,
      amount: BigInt(row.amount),
      intent_id: row.intent_id,
      usefulness_proof_id: row.usefulness_proof_id,
      metadata: row.metadata,
      created_at: row.created_at
    }));
  }

  /**
   * Spend credits immediately (no reservation). Atomic check-and-debit.
   */
  async spend(agentDID: string, amount: bigint, intentId: string, reason?: string): Promise<void> {
    const client = await this.db.pool.connect();
    try {
      await client.query('BEGIN');

      const accountRes = await client.query(
        'SELECT balance FROM credit_accounts WHERE agent_did = $1 FOR UPDATE',
        [agentDID]
      );
      if (accountRes.rows.length === 0) {
        throw new Error(`Account not found: ${agentDID}`);
      }

      const balance = BigInt(accountRes.rows[0].balance);
      if (balance < amount) {
        throw new Error(`Insufficient balance: need ${amount}, have ${balance}`);
      }

      await client.query(
        `UPDATE credit_accounts SET balance = balance - $1, spent = spent + $1 WHERE agent_did = $2`,
        [amount.toString(), agentDID]
      );

      await client.query(
        `INSERT INTO credit_transactions (agent_did, tx_type, amount, intent_id, metadata)
         VALUES ($1, 'spend', $2, $3, $4)`,
        [agentDID, amount.toString(), intentId, reason ? JSON.stringify({ reason }) : null]
      );

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}
