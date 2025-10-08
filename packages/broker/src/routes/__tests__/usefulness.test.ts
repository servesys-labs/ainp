/**
 * Integration tests for Usefulness API Routes
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import { DatabaseClient } from '../../lib/db-client';
import { UsefulnessAggregatorService } from '../../services/usefulness-aggregator';
import { createUsefulnessRoutes } from '../usefulness';

describe('Usefulness API Routes', () => {
  let app: express.Application;
  let db: DatabaseClient;
  const testDID = 'did:key:test-usefulness-api-' + Date.now();

  beforeAll(async () => {
    const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://ainp:ainp@localhost:5432/ainp';
    db = new DatabaseClient(DATABASE_URL);

    const aggregator = new UsefulnessAggregatorService(db);
    const routes = createUsefulnessRoutes(aggregator);

    app = express();
    app.use(express.json());
    app.use('/api/usefulness', routes);

    // Create test agent
    await db.query(
      `
      INSERT INTO agents (did, public_key)
      VALUES ($1, $2)
      ON CONFLICT (did) DO NOTHING
    `,
      [testDID, 'test-key']
    );

    // Insert test proof with generated UUID for intent_id
    await db.query(
      `
      INSERT INTO usefulness_proofs (intent_id, agent_did, work_type, metrics, trace_id, usefulness_score)
      VALUES (gen_random_uuid(), $1, 'compute', '{}', 'trace-1', 75)
    `,
      [testDID]
    );
  });

  afterAll(async () => {
    await db.query('DELETE FROM usefulness_proofs WHERE agent_did = $1', [testDID]);
    await db.query('DELETE FROM agents WHERE did = $1', [testDID]);
    await db.disconnect();
  });

  it('GET /api/usefulness/agents/:did should return agent score', async () => {
    const response = await request(app).get(`/api/usefulness/agents/${testDID}`).expect(200);

    expect(response.body).toHaveProperty('usefulness_score');
    expect(response.body.usefulness_score).toBeCloseTo(75, 1);
    expect(response.body.total_proofs).toBe(1);
    expect(response.body).toHaveProperty('work_type_breakdown');
    expect(response.body).toHaveProperty('last_proof_at');
  });

  it('GET /api/usefulness/agents/:did should return 404 for non-existent agent', async () => {
    const response = await request(app)
      .get('/api/usefulness/agents/did:key:nonexistent')
      .expect(404);

    expect(response.body).toHaveProperty('error');
    expect(response.body.error).toBe('Agent not found');
  });

  it('POST /api/usefulness/aggregate should trigger aggregation', async () => {
    const response = await request(app).post('/api/usefulness/aggregate').expect(200);

    expect(response.body).toHaveProperty('updated');
    expect(response.body).toHaveProperty('duration_ms');
    expect(response.body.updated).toBeGreaterThan(0);
    expect(typeof response.body.duration_ms).toBe('number');
  });
});
