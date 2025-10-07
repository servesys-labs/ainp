/**
 * Phase 1: Infrastructure Validation Tests
 *
 * Tests database, Redis, NATS, and OpenAI connectivity
 */

import { describe, test, expect, beforeAll } from 'bun:test';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

describe('Phase 1: Infrastructure Validation', () => {
  describe('1.1 PostgreSQL + pgvector', () => {
    test('DB-001: Verify PostgreSQL connection', async () => {
      const { stdout } = await execAsync('docker exec ainp-postgres pg_isready -U ainp -d ainp');
      expect(stdout).toContain('accepting connections');
    });

    test('DB-002: Verify pgvector extension installed', async () => {
      const query = `SELECT extname, extversion FROM pg_extension WHERE extname = 'vector';`;
      const { stdout } = await execAsync(
        `docker exec ainp-postgres psql -U ainp -d ainp -t -c "${query}"`
      );
      expect(stdout).toContain('vector');
    });

    test('DB-003: Verify schema tables exist', async () => {
      const query = `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;`;
      const { stdout } = await execAsync(
        `docker exec ainp-postgres psql -U ainp -d ainp -t -c "${query}"`
      );

      expect(stdout).toContain('agents');
      expect(stdout).toContain('capabilities');
      expect(stdout).toContain('trust_scores');
      expect(stdout).toContain('audit_log');
    });

    test('DB-004: Test vector operations', async () => {
      // Create a test vector (1536 dimensions - matching OpenAI embeddings)
      const testVector = Array(1536).fill(0).map((_, i) => (i / 1536).toFixed(6)).join(',');

      // Insert test embedding
      const insertQuery = `
        INSERT INTO capabilities (agent_id, description, embedding, tags, version, created_at)
        VALUES (99999, 'test-capability', '[${testVector}]', ARRAY['test'], '1.0.0', NOW())
        ON CONFLICT DO NOTHING;
      `;
      await execAsync(`docker exec ainp-postgres psql -U ainp -d ainp -c "${insertQuery}"`);

      // Query with cosine similarity
      const searchQuery = `
        SELECT description, embedding <=> '[${testVector}]' AS distance
        FROM capabilities
        WHERE agent_id = 99999
        ORDER BY distance LIMIT 1;
      `;
      const { stdout } = await execAsync(
        `docker exec ainp-postgres psql -U ainp -d ainp -t -c "${searchQuery}"`
      );

      expect(stdout).toContain('test-capability');
      expect(stdout).toContain('0'); // Distance should be 0 for identical vectors
    });

    test('DB-005: Verify HNSW index on embeddings', async () => {
      const query = `SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'capabilities' AND indexname LIKE '%embedding%';`;
      const { stdout } = await execAsync(
        `docker exec ainp-postgres psql -U ainp -d ainp -t -c "${query}"`
      );

      expect(stdout).toContain('embedding');
      expect(stdout).toContain('hnsw');
    });
  });

  describe('1.2 Redis Cache', () => {
    test('REDIS-001: Verify Redis connection', async () => {
      const { stdout } = await execAsync('docker exec ainp-redis redis-cli ping');
      expect(stdout.trim()).toBe('PONG');
    });

    test('REDIS-002: Test SET/GET operations', async () => {
      await execAsync('docker exec ainp-redis redis-cli SET test:key "test-value" EX 60');
      const { stdout } = await execAsync('docker exec ainp-redis redis-cli GET test:key');
      expect(stdout.trim()).toBe('test-value');
    });

    test('REDIS-003: Test TTL expiration', async () => {
      await execAsync('docker exec ainp-redis redis-cli SET test:ttl "expire-me" EX 2');

      // Wait 3 seconds for expiration
      await new Promise(resolve => setTimeout(resolve, 3000));

      const { stdout } = await execAsync('docker exec ainp-redis redis-cli GET test:ttl');
      expect(stdout.trim()).toBe(''); // Key should be expired
    });

    test('REDIS-004: Test rate limit key structure', async () => {
      const testKey = 'rate_limit:did:key:z6MkTest:60';
      await execAsync(`docker exec ainp-redis redis-cli SET ${testKey} 5 EX 60`);
      const { stdout } = await execAsync(`docker exec ainp-redis redis-cli GET ${testKey}`);
      expect(stdout.trim()).toBe('5');
    });
  });

  describe('1.3 NATS JetStream', () => {
    test('NATS-001: Verify NATS connection', async () => {
      const response = await fetch('http://localhost:8222/healthz');
      expect(response.status).toBe(200);
    });

    test('NATS-002: List JetStream streams', async () => {
      const { stdout } = await execAsync('docker exec ainp-nats nats stream list');
      expect(stdout).toContain('INTENTS');
      expect(stdout).toContain('RESULTS');
      expect(stdout).toContain('NEGOTIATIONS');
    });

    test('NATS-003: Verify stream configuration', async () => {
      const { stdout } = await execAsync('docker exec ainp-nats nats stream info INTENTS');
      expect(stdout).toContain('Retention');
      expect(stdout).toContain('Messages');
    });

    test('NATS-004: Publish test message', async () => {
      const testMessage = JSON.stringify({ test: 'message', timestamp: Date.now() });
      const subject = 'intents.test-agent';

      const { stdout } = await execAsync(
        `docker exec ainp-nats nats pub ${subject} '${testMessage}'`
      );
      expect(stdout).toContain('Published');
    });

    test('NATS-005: Subscribe and consume message', async () => {
      const testMessage = JSON.stringify({ test: 'consume-test', timestamp: Date.now() });
      const subject = 'intents.consume-test';

      // Publish message
      await execAsync(`docker exec ainp-nats nats pub ${subject} '${testMessage}'`);

      // Consume from stream (get last message)
      const { stdout } = await execAsync(
        `docker exec ainp-nats nats stream get INTENTS --last --subject=${subject}`
      );
      expect(stdout).toContain('consume-test');
    });
  });

  describe('1.4 OpenAI API Integration', () => {
    test('OPENAI-001: Verify API key configured', async () => {
      const apiKey = process.env.OPENAI_API_KEY;
      expect(apiKey).toBeDefined();
      expect(apiKey).toMatch(/^sk-proj-/);
    });

    test('OPENAI-002: Test embeddings API', async () => {
      const apiKey = process.env.OPENAI_API_KEY;

      const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'text-embedding-3-small',
          input: 'Schedule a meeting for tomorrow'
        })
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.data).toBeDefined();
      expect(data.data[0].embedding).toBeDefined();
    });

    test('OPENAI-003: Verify embedding dimensions', async () => {
      const apiKey = process.env.OPENAI_API_KEY;

      const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'text-embedding-3-small',
          input: 'Test embedding dimensions'
        })
      });

      const data = await response.json();
      const embedding = data.data[0].embedding;

      expect(embedding.length).toBe(1536);
      expect(typeof embedding[0]).toBe('number');
    });

    test('OPENAI-004: Test error handling for invalid API key', async () => {
      const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer sk-invalid-key',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'text-embedding-3-small',
          input: 'Test'
        })
      });

      expect(response.status).toBe(401);
    });
  });
});
