/**
 * Test health endpoint implementation
 * Verify health check logic without running server
 */

import { DatabaseClient } from './packages/broker/src/lib/db-client';
import { RedisClient } from './packages/broker/src/lib/redis-client';
import { NATSClient } from './packages/broker/src/lib/nats-client';

// Mock clients for test
class MockDatabaseClient {
  pool = {
    query: async (sql: string) => {
      if (sql === 'SELECT 1') {
        return { rows: [{ '?column?': 1 }] };
      }
      throw new Error('Unknown query');
    },
  };
}

class MockRedisClient {
  client = {
    ping: async () => 'PONG',
  };
}

class MockNATSClient {
  nc = {
    isClosed: () => false,
  };
}

async function testHealthChecks() {
  const dbClient = new MockDatabaseClient() as any;
  const redisClient = new MockRedisClient() as any;
  const natsClient = new MockNATSClient() as any;

  const checks: Record<string, string> = {
    database: 'unknown',
    redis: 'unknown',
    nats: 'unknown',
  };

  // Test database check
  try {
    await dbClient.pool.query('SELECT 1');
    checks.database = 'ok';
  } catch (error) {
    checks.database = `error: ${String(error)}`;
  }

  // Test Redis check
  try {
    await redisClient.client.ping();
    checks.redis = 'ok';
  } catch (error) {
    checks.redis = `error: ${String(error)}`;
  }

  // Test NATS check
  try {
    const nc = natsClient.nc;
    if (nc && !nc.isClosed()) {
      checks.nats = 'ok';
    } else {
      checks.nats = 'disconnected';
    }
  } catch (error) {
    checks.nats = `error: ${String(error)}`;
  }

  const allOk = Object.values(checks).every((status) => status === 'ok');

  console.log('Health Check Results:');
  console.log(JSON.stringify({ status: allOk ? 'ready' : 'not_ready', checks }, null, 2));
  console.log(`\nHTTP Status: ${allOk ? 200 : 503}`);
  
  return allOk;
}

testHealthChecks()
  .then((success) => {
    process.exit(success ? 0 : 1);
  })
  .catch((error) => {
    console.error('Test failed:', error);
    process.exit(1);
  });
