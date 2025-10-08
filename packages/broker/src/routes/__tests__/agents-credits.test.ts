/**
 * Integration tests for agent registration with credit account creation
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import { DatabaseClient } from '../../lib/db-client';
import { DiscoveryService } from '../../services/discovery';
import { CreditService } from '../../services/credits';
import { EmbeddingService } from '../../services/embeddings';
import { RedisClient } from '../../lib/redis-client';
import { VectorClient } from '../../lib/vector-client';
import { createAgentRoutes } from '../agents';

// Test database connection string
const TEST_DB_URL = process.env.DATABASE_URL || 'postgresql://localhost/ainp_test';
const TEST_REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const TEST_OPENAI_KEY = process.env.OPENAI_API_KEY || 'sk-test-key';

describe.skipIf(!process.env.DATABASE_URL)('Agent Registration with Credits', () => {
  let app: express.Application;
  let db: DatabaseClient;
  let redisClient: RedisClient;
  const testDID = 'did:key:test-agent-credits-' + Date.now();

  beforeAll(async () => {
    // Skip if DATABASE_URL not set
    if (!process.env.DATABASE_URL) {
      console.warn('⚠️  Skipping agents-credits tests: DATABASE_URL not set');
      return;
    }

    // Initialize database
    db = new DatabaseClient(TEST_DB_URL);
    await db.connect();

    // Initialize Redis
    redisClient = new RedisClient(TEST_REDIS_URL);
    await redisClient.connect();

    // Initialize services
    const vectorClient = new VectorClient(TEST_OPENAI_KEY);
    const embeddingService = new EmbeddingService(vectorClient, redisClient);
    const discoveryService = new DiscoveryService(db, embeddingService, redisClient);
    const creditService = new CreditService(db);

    // Create Express app with routes
    const routes = createAgentRoutes(discoveryService, creditService);

    app = express();
    app.use(express.json());
    app.use('/api/agents', routes);
  });

  afterAll(async () => {
    if (!process.env.DATABASE_URL || !db) return;

    // Cleanup test data
    await db.query('DELETE FROM credit_transactions WHERE agent_did = $1', [testDID]);
    await db.query('DELETE FROM credit_accounts WHERE agent_did = $1', [testDID]);
    await db.query('DELETE FROM capabilities WHERE agent_did = $1', [testDID]);
    await db.query('DELETE FROM agents WHERE did = $1', [testDID]);

    await db.disconnect();
    if (redisClient) await redisClient.disconnect();
  });

  it('should create credit account on registration', async () => {
    const address = {
      did: testDID,
      capabilities: [{
        description: 'Test capability',
        tags: ['test'],
        version: '1.0.0'
      }],
      trust: {
        score: 0.8,
        dimensions: { reliability: 0.8, honesty: 0.8, competence: 0.8, timeliness: 0.8 },
        decay_rate: 0.977,
        last_updated: Date.now()
      }
    };

    const response = await request(app)
      .post('/api/agents/register')
      .send({ address, ttl: 3600 })
      .expect(200);

    // Verify response structure
    expect(response.body.message).toBe('Agent registered successfully');
    expect(response.body.agent).toEqual({ did: testDID });
    expect(response.body.credits).not.toBeNull();
    expect(response.body.credits.balance).toBe('1000000'); // Initial balance
    expect(response.body.credits.reserved).toBe('0');
  });

  it('should verify credit account exists in database', async () => {
    const result = await db.query('SELECT * FROM credit_accounts WHERE agent_did = $1', [testDID]);

    expect(result.rows.length).toBe(1);
    expect(result.rows[0].balance).toBe('1000000');
    expect(result.rows[0].reserved).toBe('0');
    expect(result.rows[0].earned).toBe('0');
    expect(result.rows[0].spent).toBe('0');
  });
});
