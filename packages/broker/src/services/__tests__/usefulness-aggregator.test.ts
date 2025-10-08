import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { DatabaseClient } from '../../lib/db-client';
import { UsefulnessAggregatorService } from '../usefulness-aggregator';

// Test database connection string
const TEST_DB_URL = process.env.DATABASE_URL || 'postgresql://ainp:ainp@localhost:5432/ainp';

describe('UsefulnessAggregatorService', () => {
  let db: DatabaseClient;
  let aggregator: UsefulnessAggregatorService;
  const testDID = 'did:key:test-usefulness-' + Date.now();

  beforeAll(async () => {
    db = new DatabaseClient(TEST_DB_URL);
    await db.connect();
    aggregator = new UsefulnessAggregatorService(db);

    // Create test agent
    await db.query(
      `
      INSERT INTO agents (did, public_key)
      VALUES ($1, $2)
      ON CONFLICT (did) DO NOTHING
    `,
      [testDID, 'test-key']
    );
  });

  afterAll(async () => {
    // Cleanup
    await db.query('DELETE FROM usefulness_proofs WHERE agent_did = $1', [testDID]);
    await db.query('DELETE FROM agents WHERE did = $1', [testDID]);
    await db.disconnect();
  });

  beforeEach(async () => {
    // Reset proofs before each test
    await db.query('DELETE FROM usefulness_proofs WHERE agent_did = $1', [testDID]);
    await db.query('UPDATE agents SET usefulness_score_cached = 0 WHERE did = $1', [testDID]);
  });

  it('should return 0 for agent with no proofs', async () => {
    const score = await aggregator.getAgentScore(testDID);

    expect(score).not.toBeNull();
    expect(score!.usefulness_score).toBe(0);
    expect(score!.total_proofs).toBe(0);
  });

  it('should calculate 30-day rolling average', async () => {
    // Insert proofs with different scores (using random intent_id)
    await db.query(
      `
      INSERT INTO usefulness_proofs (intent_id, agent_did, work_type, metrics, trace_id, usefulness_score)
      VALUES
        (gen_random_uuid(), $1, 'compute', '{"compute_ms": 5000}', 'trace-1', 50),
        (gen_random_uuid(), $1, 'compute', '{"compute_ms": 10000}', 'trace-2', 100),
        (gen_random_uuid(), $1, 'memory', '{"memory_bytes": 1048576}', 'trace-3', 25)
    `,
      [testDID]
    );

    const score = await aggregator.getAgentScore(testDID);

    expect(score!.usefulness_score).toBeCloseTo((50 + 100 + 25) / 3, 1); // ~58.33
    expect(score!.total_proofs).toBe(3);
  });

  it('should calculate work type breakdown', async () => {
    await db.query(
      `
      INSERT INTO usefulness_proofs (intent_id, agent_did, work_type, metrics, trace_id, usefulness_score)
      VALUES
        (gen_random_uuid(), $1, 'compute', '{}', 'trace-1', 80),
        (gen_random_uuid(), $1, 'compute', '{}', 'trace-2', 60),
        (gen_random_uuid(), $1, 'memory', '{}', 'trace-3', 40)
    `,
      [testDID]
    );

    const score = await aggregator.getAgentScore(testDID);

    expect(score!.work_type_breakdown.compute).toBeCloseTo(70, 1); // (80+60)/2
    expect(score!.work_type_breakdown.memory).toBeCloseTo(40, 1);
    expect(score!.work_type_breakdown.routing).toBe(0);
  });

  it('should update cached scores in agents table', async () => {
    // Insert proof
    await db.query(
      `
      INSERT INTO usefulness_proofs (intent_id, agent_did, work_type, metrics, trace_id, usefulness_score)
      VALUES (gen_random_uuid(), $1, 'compute', '{}', 'trace-1', 75)
    `,
      [testDID]
    );

    const updateCount = await aggregator.updateCachedScores();
    expect(updateCount).toBeGreaterThan(0);

    // Verify cached score updated
    const result = await db.query('SELECT usefulness_score_cached FROM agents WHERE did = $1', [testDID]);
    expect(parseFloat(result.rows[0].usefulness_score_cached)).toBeCloseTo(75, 1);
  });

  it('should handle agents with proofs older than 30 days', async () => {
    // Insert old proof (35 days ago)
    await db.query(
      `
      INSERT INTO usefulness_proofs (intent_id, agent_did, work_type, metrics, trace_id, usefulness_score, created_at)
      VALUES (gen_random_uuid(), $1, 'compute', '{}', 'trace-old', 90, NOW() - INTERVAL '35 days')
    `,
      [testDID]
    );

    // Insert recent proof
    await db.query(
      `
      INSERT INTO usefulness_proofs (intent_id, agent_did, work_type, metrics, trace_id, usefulness_score)
      VALUES (gen_random_uuid(), $1, 'compute', '{}', 'trace-recent', 50)
    `,
      [testDID]
    );

    const score = await aggregator.getAgentScore(testDID);

    // Should only include recent proof (50), not old proof (90)
    expect(score!.usefulness_score).toBeCloseTo(50, 1);
    expect(score!.total_proofs).toBe(1);
  });

  it('should cap score at 100', async () => {
    // This shouldn't happen in practice, but test the cap
    await db.query(
      `
      INSERT INTO usefulness_proofs (intent_id, agent_did, work_type, metrics, trace_id, usefulness_score)
      VALUES (gen_random_uuid(), $1, 'compute', '{}', 'trace-1', 100)
    `,
      [testDID]
    );

    const score = await aggregator.getAgentScore(testDID);
    expect(score!.usefulness_score).toBeLessThanOrEqual(100);
  });

  it('should aggregate scores for multiple agents efficiently', async () => {
    // Performance test: should complete in <5 seconds for reasonable agent count
    const startTime = Date.now();

    const allScores = await aggregator.aggregateScores();

    const duration = Date.now() - startTime;

    expect(allScores).toBeInstanceOf(Array);
    expect(duration).toBeLessThan(5000); // <5 seconds
  });
});
