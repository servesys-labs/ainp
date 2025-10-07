/**
 * AINP Broker Server
 * Main entry point
 */

import 'dotenv/config';
import express from 'express';
import WebSocket from 'ws';
import { Logger } from '@ainp/sdk';
import { DatabaseClient } from './lib/db-client';
import { NATSClient } from './lib/nats-client';
import { RedisClient } from './lib/redis-client';
import { VectorClient } from './lib/vector-client';
import { EmbeddingService } from './services/embeddings';
import { SignatureService } from './services/signature';
import { TrustService } from './services/trust';
import { DiscoveryService } from './services/discovery';
import { RoutingService } from './services/routing';
import { WebSocketHandler } from './websocket/handler';
import { DeliveryService } from './websocket/delivery';
import { createHealthRoutes } from './routes/health';
import { createAgentRoutes } from './routes/agents';
import { createIntentRoutes } from './routes/intents';
import { createDiscoveryRoutes } from './routes/discovery';
import { rateLimitMiddleware } from './middleware/rate-limit';
import { validateEnvelope } from './middleware/validation';
import { authMiddleware } from './middleware/auth';

const logger = new Logger({ serviceName: 'ainp-broker' });

const PORT = process.env.PORT || 8080;
const DATABASE_URL = process.env.DATABASE_URL!;
const NATS_URL = process.env.NATS_URL || 'nats://localhost:4222';
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;

async function main() {
  // Initialize clients
  const dbClient = new DatabaseClient(DATABASE_URL);
  const natsClient = new NATSClient(NATS_URL);
  const redisClient = new RedisClient(REDIS_URL);
  const vectorClient = new VectorClient(OPENAI_API_KEY);

  await natsClient.connect();
  await redisClient.connect();

  // Initialize services
  const embeddingService = new EmbeddingService(vectorClient, redisClient);
  const signatureService = new SignatureService();
  const trustService = new TrustService(dbClient);
  const discoveryService = new DiscoveryService(dbClient, embeddingService, redisClient);
  const routingService = new RoutingService(
    discoveryService,
    natsClient,
    signatureService,
    trustService
  );

  // Initialize WebSocket
  const wsHandler = new WebSocketHandler(signatureService, routingService);
  const deliveryService = new DeliveryService(wsHandler, natsClient);

  await deliveryService.startDeliveryLoop();

  // Create Express app
  const app = express();
  app.use(express.json());

  // Routes
  app.use(createHealthRoutes(dbClient, redisClient, natsClient));

  // Agent routes: no envelope validation required (public API, IP-based rate limiting)
  app.use(
    '/api/agents',
    rateLimitMiddleware(redisClient, 100, false), // requireDID=false for public endpoints
    createAgentRoutes(discoveryService)
  );

  // Discovery routes: no envelope validation required (public API, IP-based rate limiting)
  app.use(
    '/api/discovery',
    rateLimitMiddleware(redisClient, 100, false), // requireDID=false for public endpoints
    createDiscoveryRoutes(discoveryService)
  );

  // Intent routes: require envelope validation + auth (security-critical, DID-based rate limiting)
  app.use(
    '/api/intents',
    rateLimitMiddleware(redisClient, 100, true), // requireDID=true for authenticated endpoints
    validateEnvelope,
    authMiddleware(signatureService),
    createIntentRoutes(routingService)
  );

  // Start HTTP server
  const server = app.listen(PORT, () => {
    logger.info('AINP Broker started', { port: PORT });
  });

  // Attach WebSocket server
  const wss = new WebSocket.Server({ server });

  wss.on('connection', (ws, req) => {
    const did = req.url?.split('?did=')[1];
    if (did) {
      wsHandler.handleConnection(ws, did);
    } else {
      ws.close(1008, 'Missing DID parameter');
    }
  });
}

main().catch((error) => {
  logger.error('Fatal error starting broker', { error: error.message, stack: error.stack });
  process.exit(1);
});
