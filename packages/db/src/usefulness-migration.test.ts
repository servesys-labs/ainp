import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { DatabaseClient } from './client';

describe('Usefulness Migrations', () => {
  let db: DatabaseClient;

  beforeAll(async () => {
    const dbUrl = process.env.DATABASE_URL || 'postgresql://ainp:ainp@localhost:5432/ainp';
    db = new DatabaseClient(dbUrl);
  });

  afterAll(async () => {
    // DatabaseClient doesn't need explicit disconnect (pool auto-closes)
  });

  /**
   * Helper function to create a test agent with a valid DID
   * Required for FK constraints in usefulness_proofs table
   */
  async function createTestAgent(did: string): Promise<void> {
    await db.query(`
      INSERT INTO agents (did, public_key)
      VALUES ($1, $2)
      ON CONFLICT (did) DO NOTHING
    `, [did, 'test-public-key-' + did]);
  }

  describe('usefulness_proofs table', () => {
    it('should exist with correct schema', async () => {
      const result = await db.query(`
        SELECT table_name FROM information_schema.tables
        WHERE table_name = 'usefulness_proofs'
      `);
      expect(result.rows.length).toBe(1);
    });

    it('should have all required columns', async () => {
      const result = await db.query(`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_name = 'usefulness_proofs'
        ORDER BY column_name
      `);

      const columns = result.rows.reduce((acc, row) => {
        acc[row.column_name] = row.data_type;
        return acc;
      }, {} as Record<string, string>);

      expect(columns.id).toBe('uuid');
      expect(columns.intent_id).toBe('uuid');
      expect(columns.agent_did).toBe('text');
      expect(columns.work_type).toBe('text');
      expect(columns.metrics).toBe('jsonb');
      expect(columns.attestations).toBe('ARRAY');
      expect(columns.trace_id).toBe('text');
      expect(columns.usefulness_score).toBe('numeric');
      expect(columns.created_at).toBe('timestamp with time zone');
    });

    it('should have correct indexes', async () => {
      const result = await db.query(`
        SELECT indexname FROM pg_indexes
        WHERE tablename = 'usefulness_proofs'
        ORDER BY indexname
      `);

      const indexes = result.rows.map(r => r.indexname);

      expect(indexes).toContain('idx_usefulness_agent');
      expect(indexes).toContain('idx_usefulness_intent');
      expect(indexes).toContain('idx_usefulness_work_type');
      expect(indexes).toContain('idx_usefulness_score');
      expect(indexes).toContain('idx_usefulness_trace');
      expect(indexes).toContain('idx_usefulness_agent_score');
      expect(indexes).toContain('idx_usefulness_metrics');
    });

    it('should have foreign key to agents table', async () => {
      const result = await db.query(`
        SELECT constraint_name, constraint_type
        FROM information_schema.table_constraints
        WHERE table_name = 'usefulness_proofs'
          AND constraint_type = 'FOREIGN KEY'
      `);

      expect(result.rows.length).toBeGreaterThan(0);
      expect(result.rows[0].constraint_name).toBe('fk_agent');
    });

    it('should enforce work_type check constraint', async () => {
      // Create test agent first (required for FK constraint)
      await createTestAgent('did:key:test123');

      // Insert valid work type should succeed
      const validInsert = await db.query(`
        INSERT INTO usefulness_proofs (intent_id, agent_did, work_type, trace_id)
        VALUES (gen_random_uuid(), 'did:key:test123', 'compute', 'trace-001')
        RETURNING id
      `);
      expect(validInsert.rows.length).toBe(1);

      // Invalid work type should fail
      await expect(
        db.query(`
          INSERT INTO usefulness_proofs (intent_id, agent_did, work_type, trace_id)
          VALUES (gen_random_uuid(), 'did:key:test123', 'invalid_type', 'trace-002')
        `)
      ).rejects.toThrow();

      // Cleanup
      await db.query('DELETE FROM usefulness_proofs WHERE agent_did = $1', ['did:key:test123']);
      await db.query('DELETE FROM agents WHERE did = $1', ['did:key:test123']);
    });

    it('should enforce usefulness_score range constraint', async () => {
      // Create test agent first (required for FK constraint)
      await createTestAgent('did:key:test123');

      // Valid score (0-100) should succeed
      const validInsert = await db.query(`
        INSERT INTO usefulness_proofs (intent_id, agent_did, work_type, trace_id, usefulness_score)
        VALUES (gen_random_uuid(), 'did:key:test123', 'memory', 'trace-003', 75.50)
        RETURNING id
      `);
      expect(validInsert.rows.length).toBe(1);

      // Score > 100 should fail
      await expect(
        db.query(`
          INSERT INTO usefulness_proofs (intent_id, agent_did, work_type, trace_id, usefulness_score)
          VALUES (gen_random_uuid(), 'did:key:test123', 'routing', 'trace-004', 101)
        `)
      ).rejects.toThrow();

      // Score < 0 should fail
      await expect(
        db.query(`
          INSERT INTO usefulness_proofs (intent_id, agent_did, work_type, trace_id, usefulness_score)
          VALUES (gen_random_uuid(), 'did:key:test123', 'validation', 'trace-005', -1)
        `)
      ).rejects.toThrow();

      // Cleanup
      await db.query('DELETE FROM usefulness_proofs WHERE agent_did = $1', ['did:key:test123']);
      await db.query('DELETE FROM agents WHERE did = $1', ['did:key:test123']);
    });
  });

  describe('agents table usefulness columns', () => {
    it('should have usefulness_score_cached column', async () => {
      const result = await db.query(`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_name = 'agents' AND column_name = 'usefulness_score_cached'
      `);

      expect(result.rows.length).toBe(1);
      expect(result.rows[0].data_type).toBe('numeric');
    });

    it('should have usefulness_last_updated column', async () => {
      const result = await db.query(`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_name = 'agents' AND column_name = 'usefulness_last_updated'
      `);

      expect(result.rows.length).toBe(1);
      expect(result.rows[0].data_type).toBe('timestamp with time zone');
    });

    it('should have idx_agents_usefulness composite index', async () => {
      const result = await db.query(`
        SELECT indexname FROM pg_indexes
        WHERE tablename = 'agents' AND indexname = 'idx_agents_usefulness'
      `);

      expect(result.rows.length).toBe(1);
    });
  });

  describe('JSONB metrics queries', () => {
    it('should support JSONB queries on metrics field', async () => {
      // Create test agents first (required for FK constraint)
      await createTestAgent('did:key:test123');
      await createTestAgent('did:key:test456');

      // Insert test data with metrics
      await db.query(`
        INSERT INTO usefulness_proofs (intent_id, agent_did, work_type, trace_id, metrics)
        VALUES
          (gen_random_uuid(), 'did:key:test123', 'compute', 'trace-006', '{"compute_ms": 1500, "cpu_percent": 85}'),
          (gen_random_uuid(), 'did:key:test456', 'memory', 'trace-007', '{"memory_bytes": 2048576, "cache_hits": 42}')
      `);

      // Query by JSONB field
      const result = await db.query(`
        SELECT agent_did, metrics->>'compute_ms' as compute_ms
        FROM usefulness_proofs
        WHERE metrics ? 'compute_ms'
      `);

      expect(result.rows.length).toBe(1);
      expect(result.rows[0].agent_did).toBe('did:key:test123');
      expect(result.rows[0].compute_ms).toBe('1500');

      // Cleanup
      await db.query('DELETE FROM usefulness_proofs WHERE agent_did IN ($1, $2)', ['did:key:test123', 'did:key:test456']);
      await db.query('DELETE FROM agents WHERE did IN ($1, $2)', ['did:key:test123', 'did:key:test456']);
    });
  });
});
