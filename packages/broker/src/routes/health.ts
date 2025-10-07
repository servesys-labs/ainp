/**
 * Health Check Routes
 */

import { Router } from 'express';
import { DatabaseClient } from '../lib/db-client';
import { RedisClient } from '../lib/redis-client';
import { NATSClient } from '../lib/nats-client';

export function createHealthRoutes(
  dbClient: DatabaseClient,
  redisClient: RedisClient,
  natsClient: NATSClient
): Router {
  const router = Router();

  router.get('/health', async (req, res) => {
    try {
      // Check all three connections in parallel
      const [db, redis, nats] = await Promise.all([
        dbClient.isConnected().catch(() => false),
        redisClient.isConnected().catch(() => false),
        natsClient.isConnected().catch(() => false),
      ]);

      const healthy = db && redis && nats;
      const status = healthy ? 'healthy' : 'unhealthy';

      res.status(healthy ? 200 : 503).json({
        status,
        connections: { db, redis, nats },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      res.status(503).json({
        status: 'unhealthy',
        connections: { db: false, redis: false, nats: false },
        timestamp: new Date().toISOString(),
        error: String(error)
      });
    }
  });

  router.get('/health/ready', async (req, res) => {
    const checks: Record<string, string> = {
      database: 'unknown',
      redis: 'unknown',
      nats: 'unknown',
    };

    // Check database connection
    try {
      await dbClient['pool'].query('SELECT 1');
      checks.database = 'ok';
    } catch (error) {
      checks.database = `error: ${String(error)}`;
    }

    // Check Redis connection
    try {
      await redisClient['client'].ping();
      checks.redis = 'ok';
    } catch (error) {
      checks.redis = `error: ${String(error)}`;
    }

    // Check NATS connection
    try {
      const nc = natsClient['nc'];
      if (nc && !nc.isClosed()) {
        checks.nats = 'ok';
      } else {
        checks.nats = 'disconnected';
      }
    } catch (error) {
      checks.nats = `error: ${String(error)}`;
    }

    const allOk = Object.values(checks).every((status) => status === 'ok');

    res.status(allOk ? 200 : 503).json({
      status: allOk ? 'ready' : 'not_ready',
      checks,
    });
  });

  return router;
}
