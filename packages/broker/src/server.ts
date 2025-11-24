/**
 * AINP Broker Server
 * Main entry point
 */

import 'dotenv/config';
import express from 'express';
import { WebSocketServer } from 'ws';
import { Logger } from '@ainp/sdk';
import { DatabaseClient } from './lib/db-client.js';
import { NATSClient } from './lib/nats-client.js';
import { RedisClient } from './lib/redis-client.js';
import { VectorClient } from './lib/vector-client.js';
import { EmbeddingService } from './services/embeddings.js';
import { SignatureService } from './services/signature.js';
import { TrustService } from './services/trust.js';
import { DiscoveryService } from './services/discovery.js';
import { RoutingService } from './services/routing.js';
import { CreditService } from './services/credits.js';
import { WebSocketHandler } from './websocket/handler.js';
import { DeliveryService } from './websocket/delivery.js';
import { createHealthRoutes } from './routes/health.js';
import { createAgentRoutes } from './routes/agents.js';
import { createIntentRoutes } from './routes/intents.js';
import { createDiscoveryRoutes } from './routes/discovery.js';
import { createDevRoutes } from './routes/dev.js';
import { createUsefulnessRoutes } from './routes/usefulness.js';
import { createNegotiationRoutes } from './routes/negotiation.js';
import { createReputationRoutes } from './routes/reputation.js';
import { createReceiptsRoutes } from './routes/receipts.js';
import { CommitteeService } from './services/committee.js';
import { createPaymentsRoutes } from './routes/payments.js';
import { PaymentService } from './services/payment.js';
import { CoinbaseCommerceDriver } from './services/payments/coinbase-commerce.js';
import { LightningDriver } from './services/payments/lightning.js';
import { createMailRoutes } from './routes/mail.js';
import { createAdminRoutes } from './routes/admin.js';
import { rateLimitMiddleware } from './middleware/rate-limit.js';
import { validateEnvelope, validateProofSubmission } from './middleware/validation.js';
import { authMiddleware } from './middleware/auth.js';
import { UsefulnessAggregatorService } from './services/usefulness-aggregator.js';
import { startUsefulnessAggregationJob } from './jobs/usefulness-aggregator-job.js';
import { startPouFinalizerJob } from './jobs/pou-finalizer-job.js';
import { startMailboxDistillerJob } from './jobs/mailbox-distiller-job.js';
import { NegotiationService } from './services/negotiation.js';
import { IncentiveDistributionService } from './services/incentive-distribution.js';
import { AntiFraudService } from './services/anti-fraud.js';
import { replayProtectionMiddleware } from './middleware/replay.js';
import { emailGuardMiddleware } from './middleware/email-guard.js';
import { MailboxService } from './services/mailbox.js';
import { ContactService } from './services/contacts.js';
import { MemoryDistillerService } from './services/memory-distiller.js';
import { SummarizationService } from './services/summarization.js';
import { ReceiptService } from './services/receipts.js';
import { ReputationUpdater } from './services/reputation-updater.js';
import { SlashingService } from './services/slashing.js';

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
  const committeeService = new CommitteeService(dbClient);
  const receiptService = new ReceiptService(dbClient, committeeService);
  const reputationUpdater = new ReputationUpdater(dbClient);
  const negotiationService = new NegotiationService(dbClient, creditService, receiptService, reputationUpdater);
  const antiFraud = new AntiFraudService(redisClient);

  // Note: MailboxService and RoutingService created after WebSocket initialization
  // to enable real-time notifications

  // Start background jobs
  startUsefulnessAggregationJob(usefulnessAggregator, incentiveDistribution);
  startPouFinalizerJob(dbClient);
  // Mailbox → memory distiller (optional)
  const summarizer = new SummarizationService(OPENAI_API_KEY);
  const memoryDistiller = new MemoryDistillerService(dbClient, embeddingService, redisClient, summarizer);
  startMailboxDistillerJob(memoryDistiller);

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
    createDiscoveryRoutes(discoveryService, signatureService, natsClient)
  );

  // Development-only routes (embedding helper)
  if (process.env.NODE_ENV !== 'production') {
    app.use('/api/dev', createDevRoutes(embeddingService));
  }

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

  // Admin routes (guarded by ADMIN_TOKEN)
  app.use('/api/admin', createAdminRoutes(new SlashingService(dbClient), dbClient, embeddingService));

  // Start HTTP server
  const server = app.listen(PORT, () => {
    logger.info('AINP Broker started', { port: PORT });
  });

  // Attach WebSocket server
  const wss = new WebSocketServer({ server });

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
