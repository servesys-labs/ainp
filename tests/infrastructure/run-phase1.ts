#!/usr/bin/env node
/**
 * Phase 1: Infrastructure Validation Tests
 * Executable test suite for database, Redis, NATS, and OpenAI
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';

const execAsync = promisify(exec);

interface TestResult {
  id: string;
  name: string;
  status: 'PASS' | 'FAIL' | 'SKIP';
  duration: number;
  error?: string;
}

const results: TestResult[] = [];
let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

async function runTest(id: string, name: string, testFn: () => Promise<void>): Promise<void> {
  const startTime = Date.now();
  totalTests++;

  try {
    await testFn();
    const duration = Date.now() - startTime;
    results.push({ id, name, status: 'PASS', duration });
    passedTests++;
    console.log(`✅ ${id}: ${name} (${duration}ms)`);
  } catch (error: any) {
    const duration = Date.now() - startTime;
    results.push({ id, name, status: 'FAIL', duration, error: error.message });
    failedTests++;
    console.log(`❌ ${id}: ${name} (${duration}ms)`);
    console.log(`   Error: ${error.message}`);
  }
}

async function main() {
  console.log('='.repeat(80));
  console.log('PHASE 1: INFRASTRUCTURE VALIDATION');
  console.log('='.repeat(80));
  console.log();

  // Section 1.1: PostgreSQL + pgvector
  console.log('1.1 PostgreSQL + pgvector');
  console.log('-'.repeat(40));

  await runTest('DB-001', 'Verify PostgreSQL connection', async () => {
    const { stdout } = await execAsync('docker exec ainp-postgres pg_isready -U ainp -d ainp');
    if (!stdout.includes('accepting connections')) {
      throw new Error('PostgreSQL not accepting connections');
    }
  });

  await runTest('DB-002', 'Verify pgvector extension installed', async () => {
    const query = `SELECT extname, extversion FROM pg_extension WHERE extname = 'vector';`;
    const { stdout } = await execAsync(
      `docker exec ainp-postgres psql -U ainp -d ainp -t -c "${query}"`
    );
    if (!stdout.includes('vector')) {
      throw new Error('pgvector extension not found');
    }
  });

  await runTest('DB-003', 'Verify schema tables exist', async () => {
    const query = `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;`;
    const { stdout } = await execAsync(
      `docker exec ainp-postgres psql -U ainp -d ainp -t -c "${query}"`
    );

    const requiredTables = ['agents', 'capabilities', 'trust_scores', 'audit_log'];
    for (const table of requiredTables) {
      if (!stdout.includes(table)) {
        throw new Error(`Required table '${table}' not found`);
      }
    }
  });

  await runTest('DB-004', 'Test vector operations', async () => {
    // Create a test vector (1536 dimensions)
    const testVector = Array(1536).fill(0).map((_, i) => (i / 1536).toFixed(6)).join(',');

    // Insert test embedding
    const insertQuery = `INSERT INTO capabilities (agent_id, description, embedding, tags, version, created_at) VALUES (99999, 'test-capability', '[${testVector}]', ARRAY['test'], '1.0.0', NOW()) ON CONFLICT DO NOTHING;`;
    await execAsync(`docker exec ainp-postgres psql -U ainp -d ainp -c "${insertQuery}"`);

    // Query with cosine similarity
    const searchQuery = `SELECT description, embedding <=> '[${testVector}]' AS distance FROM capabilities WHERE agent_id = 99999 ORDER BY distance LIMIT 1;`;
    const { stdout } = await execAsync(
      `docker exec ainp-postgres psql -U ainp -d ainp -t -c "${searchQuery}"`
    );

    if (!stdout.includes('test-capability')) {
      throw new Error('Vector query failed');
    }
  });

  await runTest('DB-005', 'Verify HNSW index on embeddings', async () => {
    const query = `SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'capabilities' AND indexname LIKE '%embedding%';`;
    const { stdout } = await execAsync(
      `docker exec ainp-postgres psql -U ainp -d ainp -t -c "${query}"`
    );

    if (!stdout.includes('embedding') || !stdout.includes('hnsw')) {
      throw new Error('HNSW index not found on embeddings column');
    }
  });

  console.log();

  // Section 1.2: Redis Cache
  console.log('1.2 Redis Cache');
  console.log('-'.repeat(40));

  await runTest('REDIS-001', 'Verify Redis connection', async () => {
    const { stdout } = await execAsync('docker exec ainp-redis redis-cli ping');
    if (stdout.trim() !== 'PONG') {
      throw new Error('Redis not responding to PING');
    }
  });

  await runTest('REDIS-002', 'Test SET/GET operations', async () => {
    await execAsync('docker exec ainp-redis redis-cli SET test:key "test-value" EX 60');
    const { stdout } = await execAsync('docker exec ainp-redis redis-cli GET test:key');
    if (stdout.trim() !== 'test-value') {
      throw new Error('SET/GET operation failed');
    }
  });

  await runTest('REDIS-003', 'Test TTL expiration', async () => {
    await execAsync('docker exec ainp-redis redis-cli SET test:ttl "expire-me" EX 2');
    await new Promise(resolve => setTimeout(resolve, 3000));
    const { stdout } = await execAsync('docker exec ainp-redis redis-cli GET test:ttl');
    if (stdout.trim() !== '') {
      throw new Error('TTL expiration did not work');
    }
  });

  await runTest('REDIS-004', 'Test rate limit key structure', async () => {
    const testKey = 'rate_limit:did:key:z6MkTest:60';
    await execAsync(`docker exec ainp-redis redis-cli SET ${testKey} 5 EX 60`);
    const { stdout } = await execAsync(`docker exec ainp-redis redis-cli GET ${testKey}`);
    if (stdout.trim() !== '5') {
      throw new Error('Rate limit key structure failed');
    }
  });

  console.log();

  // Section 1.3: NATS JetStream
  console.log('1.3 NATS JetStream');
  console.log('-'.repeat(40));

  await runTest('NATS-001', 'Verify NATS connection', async () => {
    const response = await fetch('http://localhost:8222/healthz');
    if (response.status !== 200) {
      throw new Error(`NATS health check failed: ${response.status}`);
    }
  });

  await runTest('NATS-002', 'List JetStream streams', async () => {
    const { stdout } = await execAsync('docker exec ainp-nats nats stream list');
    const requiredStreams = ['INTENTS', 'RESULTS', 'NEGOTIATIONS'];
    for (const stream of requiredStreams) {
      if (!stdout.includes(stream)) {
        throw new Error(`Required stream '${stream}' not found`);
      }
    }
  });

  await runTest('NATS-003', 'Verify stream configuration', async () => {
    const { stdout } = await execAsync('docker exec ainp-nats nats stream info INTENTS');
    if (!stdout.includes('Retention') || !stdout.includes('Messages')) {
      throw new Error('Stream configuration missing expected fields');
    }
  });

  await runTest('NATS-004', 'Publish test message', async () => {
    const testMessage = JSON.stringify({ test: 'message', timestamp: Date.now() });
    const subject = 'intents.test-agent';
    const { stdout } = await execAsync(
      `docker exec ainp-nats nats pub ${subject} '${testMessage}'`
    );
    if (!stdout.includes('Published')) {
      throw new Error('Failed to publish message to NATS');
    }
  });

  await runTest('NATS-005', 'Subscribe and consume message', async () => {
    const testMessage = JSON.stringify({ test: 'consume-test', timestamp: Date.now() });
    const subject = 'intents.consume-test-' + Date.now();

    await execAsync(`docker exec ainp-nats nats pub ${subject} '${testMessage}'`);
    const { stdout } = await execAsync(
      `docker exec ainp-nats nats stream get INTENTS --last --subject=${subject}`
    );
    if (!stdout.includes('consume-test')) {
      throw new Error('Failed to consume message from stream');
    }
  });

  console.log();

  // Section 1.4: OpenAI API Integration
  console.log('1.4 OpenAI API Integration');
  console.log('-'.repeat(40));

  await runTest('OPENAI-001', 'Verify API key configured', async () => {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey || !apiKey.startsWith('sk-proj-')) {
      throw new Error('OPENAI_API_KEY not configured or invalid format');
    }
  });

  await runTest('OPENAI-002', 'Test embeddings API', async () => {
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

    if (response.status !== 200) {
      throw new Error(`OpenAI API call failed: ${response.status}`);
    }

    const data: any = await response.json();
    if (!data.data || !data.data[0].embedding) {
      throw new Error('Invalid response from OpenAI embeddings API');
    }
  });

  await runTest('OPENAI-003', 'Verify embedding dimensions', async () => {
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

    const data: any = await response.json();
    const embedding = data.data[0].embedding;

    if (embedding.length !== 1536) {
      throw new Error(`Expected 1536 dimensions, got ${embedding.length}`);
    }
    if (typeof embedding[0] !== 'number') {
      throw new Error('Embedding values are not numbers');
    }
  });

  await runTest('OPENAI-004', 'Test error handling for invalid API key', async () => {
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

    if (response.status !== 401) {
      throw new Error(`Expected 401, got ${response.status}`);
    }
  });

  console.log();
  console.log('='.repeat(80));
  console.log('PHASE 1 SUMMARY');
  console.log('='.repeat(80));
  console.log(`Total Tests: ${totalTests}`);
  console.log(`Passed: ${passedTests} (${((passedTests / totalTests) * 100).toFixed(1)}%)`);
  console.log(`Failed: ${failedTests} (${((failedTests / totalTests) * 100).toFixed(1)}%)`);
  console.log();

  // Write results to log file
  const logPath = path.join('/Users/agentsy/developer/ainp/logs', 'phase1-infrastructure.log');
  const logContent = `
PHASE 1: INFRASTRUCTURE VALIDATION TEST RESULTS
Date: ${new Date().toISOString()}

Summary:
- Total Tests: ${totalTests}
- Passed: ${passedTests}
- Failed: ${failedTests}
- Pass Rate: ${((passedTests / totalTests) * 100).toFixed(1)}%

Detailed Results:
${results.map(r => `${r.status === 'PASS' ? '✅' : '❌'} ${r.id}: ${r.name} (${r.duration}ms)${r.error ? '\n   Error: ' + r.error : ''}`).join('\n')}
`;

  fs.writeFileSync(logPath, logContent);
  console.log(`Results written to: ${logPath}`);

  // Exit with error code if any tests failed
  process.exit(failedTests > 0 ? 1 : 0);
}

main().catch(error => {
  console.error('Fatal error running tests:', error);
  process.exit(1);
});
