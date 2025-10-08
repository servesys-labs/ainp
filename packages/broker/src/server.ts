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
import { CreditService } from './services/credits';
import { WebSocketHandler } from './websocket/handler';
import { DeliveryService } from './websocket/delivery';
import { createHealthRoutes } from './routes/health';
import { createAgentRoutes } from './routes/agents';
import { createIntentRoutes } from './routes/intents';
import { createDiscoveryRoutes } from './routes/discovery';
import { createUsefulnessRoutes } from './routes/usefulness';
import { createNegotiationRoutes } from './routes/negotiation';
import { createReputationRoutes } from './routes/reputation';
import { createReceiptsRoutes } from './routes/receipts';
import { createPaymentsRoutes } from './routes/payments';
import { PaymentService } from './services/payment';
import { CoinbaseCommerceDriver } from './services/payments/coinbase-commerce';
import { LightningDriver } from './services/payments/lightning';
import { createMailRoutes } from './routes/mail';
import { rateLimitMiddleware } from './middleware/rate-limit';
import { validateEnvelope, validateProofSubmission } from './middleware/validation';
import { authMiddleware } from './middleware/auth';
import { UsefulnessAggregatorService } from './services/usefulness-aggregator';
import { startUsefulnessAggregationJob } from './jobs/usefulness-aggregator-job';
import { startPouFinalizerJob } from './jobs/pou-finalizer-job';
import { NegotiationService } from './services/negotiation';
import { IncentiveDistributionService } from './services/incentive-distribution';
import { AntiFraudService } from './services/anti-fraud';
import { replayProtectionMiddleware } from './middleware/replay';
import { emailGuardMiddleware } from './middleware/email-guard';
import { MailboxService } from './services/mailbox';
import { ContactService } from './services/contacts';

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
  const creditService = new CreditService(dbClient);
  const usefulnessAggregator = new UsefulnessAggregatorService(dbClient);
  const incentiveDistribution = new IncentiveDistributionService(dbClient, creditService);
  // Receipt/Reputation services
  const receiptService = new (require('./services/receipts').ReceiptService)(dbClient);
  const reputationUpdater = new (require('./services/reputation-updater').ReputationUpdater)(dbClient);
  const negotiationService = new NegotiationService(dbClient, creditService, receiptService, reputationUpdater);
  const antiFraud = new AntiFraudService(redisClient);

  // Note: MailboxService and RoutingService created after WebSocket initialization
  // to enable real-time notifications

  // Start background jobs
  startUsefulnessAggregationJob(usefulnessAggregator, incentiveDistribution);
  startPouFinalizerJob(dbClient);

  // Run aggregation immediately on startup
  try {
    const updateCount = await usefulnessAggregator.updateCachedScores();
    logger.info(`[Startup] Updated ${updateCount} usefulness scores`);
  } catch (error) {
    logger.error('[Startup] Failed to run initial usefulness aggregation', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  // Initialize WebSocket handler first
  // Create temporary routing service without mailbox for WebSocket initialization
  const tempRoutingService = new RoutingService(
    discoveryService,
    natsClient,
    signatureService,
    trustService
  );
  const wsHandler = new WebSocketHandler(signatureService, tempRoutingService);
  const deliveryService = new DeliveryService(wsHandler, natsClient);

  // Now create services that need WebSocket notifications
  const contactService = new ContactService(dbClient);
  const mailboxService = new MailboxService(dbClient, wsHandler);
  const routingService = new RoutingService(
    discoveryService,
    natsClient,
    signatureService,
    trustService,
    mailboxService,
    contactService
  );

  // Update WebSocket handler to use final routing service
  (wsHandler as any).routingService = routingService;

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
    createAgentRoutes(discoveryService, creditService)
  );

  // Discovery routes: no envelope validation required (public API, IP-based rate limiting)
  app.use(
    '/api/discovery',
    rateLimitMiddleware(redisClient, 100, false), // requireDID=false for public endpoints
    createDiscoveryRoutes(discoveryService)
  );

  // Usefulness routes (mixed security requirements)
  // Pass signatureService and redisClient for route-level middleware
  const usefulnessRouter = createUsefulnessRoutes(
    usefulnessAggregator,
    signatureService,
    redisClient
  );

  // Public GET routes (no auth required) - IP-based rate limiting before router
  // Router handles route-specific middleware (auth + validation) internally for POST /proofs
  app.use(
    '/api/usefulness',
    rateLimitMiddleware(redisClient, 100, false), // IP-based for public endpoints
    usefulnessRouter
  );

  // Intent routes: require envelope validation + auth (security-critical, DID-based rate limiting)
  // Middleware order: validateEnvelope → authMiddleware → rateLimitMiddleware (sets x-ainp-did before rate limit reads it)
  app.use(
    '/api/intents',
    validateEnvelope,                            // ✅ 1. Validate envelope structure
    authMiddleware(signatureService),            // ✅ 2. Extract DID, set x-ainp-did header
    replayProtectionMiddleware(antiFraud),       // ✅ 2b. Replay protection (id + trace)
    emailGuardMiddleware(antiFraud, creditService, contactService), // ✅ 2c. Email anti-fraud (dedupe/postage/greylist)
    rateLimitMiddleware(redisClient, 100, true), // ✅ 3. DID-based rate limiting
    createIntentRoutes(routingService)
  );

  // Negotiation routes: require auth (security-critical, DID-based rate limiting)
  // Note: Negotiation routes accept plain JSON bodies (not envelopes)
  app.use(
    '/api/negotiations',
    authMiddleware(signatureService), // ✅ Extract DID from plain JSON body
    rateLimitMiddleware(redisClient, 100, true), // ✅ Use DID from x-ainp-did header
    createNegotiationRoutes(negotiationService, incentiveDistribution, wsHandler)
  );

  // Mail routes: require auth (inbox/threads access, DID-based rate limiting)
  app.use(
    '/api/mail',
    authMiddleware(signatureService),
    rateLimitMiddleware(redisClient, 200, true), // Higher limit for message browsing
    createMailRoutes(mailboxService)
  );

  // Payments routes: create payment requests and handle webhooks
  // Scaffold: mounted behind auth + rate limit; provider drivers configured in PaymentService
  const paymentService = new PaymentService(dbClient, creditService, {
    coinbase: new CoinbaseCommerceDriver(
      process.env.COINBASE_COMMERCE_API_KEY,
      process.env.COINBASE_COMMERCE_WEBHOOK_SECRET
    ),
    lightning: new LightningDriver(
      process.env.LIGHTNING_NODE_URL,
      process.env.LIGHTNING_MACAROON
    ),
  });
  app.use(
    '/api/payments',
    authMiddleware(signatureService),
    rateLimitMiddleware(redisClient, 50, true),
    createPaymentsRoutes(paymentService)
  );

  // Reputation routes (read-only)
  app.use('/api/reputation', createReputationRoutes(dbClient));

  // Receipts routes (read-only)
  app.use('/api/receipts', createReceiptsRoutes(receiptService));

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
