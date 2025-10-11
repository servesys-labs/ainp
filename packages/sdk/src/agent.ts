/**
 * AINP Agent Implementation
 * Main agent class for receiving and processing intents
 * Spec: RFC 001-SPEC
 */

import EventEmitter from 'eventemitter3';
import WebSocket from 'ws';
import { canonicalize } from 'json-canonicalize';
import { AINPEnvelope, AINPIntent } from '@ainp/core';
import {
  AgentConfig,
  IntentHandler,
  NegotiateHandler,
  AdvertiseOptions,
  AgentStats,
} from './types';
import { signData, verifySignature } from './crypto';
import { resolveDID, extractPublicKey } from './did';
import {
  AINPError,
  TimeoutError,
  SignatureError,
  ValidationError,
  createErrorFromPayload,
} from './errors';
import { Logger, LogLevel } from './logger';
import { CreditManager } from './credits';
import { v4 as uuidv4 } from 'uuid';

// Note: uuid is missing from package.json, will add in next edit

const logger = new Logger({ serviceName: 'ainp-agent' });

export class AINPAgent extends EventEmitter {
  private config: AgentConfig;
  private ws: WebSocket | null = null;
  private intentHandlers = new Map<string, IntentHandler>();
  private negotiateHandlers: NegotiateHandler[] = [];
  private credits: CreditManager;
  private stats: AgentStats = {
    intents_processed: 0,
    negotiation_success_rate: 0,
    avg_response_time_ms: 0,
    total_credits_earned: 0,
  };
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000; // Start with 1s
  private isRunning = false;

  constructor(config: AgentConfig) {
    super();
    this.config = config;
    this.credits = new CreditManager(0); // Start with 0, deposit later

    logger.debug('Agent initialized', {
      did: config.did,
      discoveryUrl: config.discoveryUrl,
    });
  }

  /**
   * Start the agent and connect to broker
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Agent already running');
      return;
    }

    this.isRunning = true;
    await this.connect();

    logger.info('Agent started', { did: this.config.did });
  }

  /**
   * Stop the agent and disconnect
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      logger.warn('Agent not running');
      return;
    }

    this.isRunning = false;

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    logger.info('Agent stopped', { did: this.config.did });
  }

  /**
   * Connect to broker via WebSocket
   */
  private async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.config.discoveryUrl);

        this.ws.on('open', () => {
          logger.info('Connected to broker', { url: this.config.discoveryUrl });
          this.reconnectAttempts = 0;
          this.reconnectDelay = 1000;
          this.emit('connected');
          resolve();
        });

        this.ws.on('message', async (data: WebSocket.Data) => {
          try {
            const envelope = JSON.parse(data.toString()) as AINPEnvelope;
            await this.handleMessage(envelope);
          } catch (error) {
            logger.error('Failed to handle message', {
              error: error instanceof Error ? error.message : String(error),
            });
          }
        });

        this.ws.on('close', () => {
          logger.warn('Disconnected from broker');
          this.emit('disconnected');

          if (this.isRunning) {
            this.reconnect();
          }
        });

        this.ws.on('error', (error) => {
          logger.error('WebSocket error', { error: error.message });
          this.emit('error', error);
          reject(error);
        });
      } catch (error) {
        logger.error('Failed to connect', {
          error: error instanceof Error ? error.message : String(error),
        });
        reject(error);
      }
    });
  }

  /**
   * Reconnect to broker with exponential backoff
   */
  private async reconnect(): Promise<void> {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error('Max reconnect attempts reached', {
        attempts: this.reconnectAttempts,
      });
      this.emit('error', new AINPError('Failed to reconnect', 'CONNECTION_FAILED'));
      return;
    }

    this.reconnectAttempts++;
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30000); // Max 30s

    logger.info('Reconnecting...', {
      attempt: this.reconnectAttempts,
      delay: this.reconnectDelay,
    });

    await new Promise((resolve) => setTimeout(resolve, this.reconnectDelay));

    try {
      await this.connect();
    } catch (error) {
      logger.error('Reconnect failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      await this.reconnect();
    }
  }

  /**
   * Handle incoming message envelope
   */
  private async handleMessage(envelope: AINPEnvelope): Promise<void> {
    const startTime = Date.now();

    logger.debug('Received message', {
      id: envelope.id,
      trace_id: envelope.trace_id,
      msg_type: envelope.msg_type,
      from_did: envelope.from_did,
    });

    // Verify signature
    if (!await this.verifyEnvelope(envelope)) {
      logger.error('Invalid signature', { envelope_id: envelope.id });
      this.emit('error', new SignatureError('Invalid envelope signature'));
      return;
    }

    // Route by message type
    try {
      switch (envelope.msg_type) {
        case 'INTENT':
          await this.handleIntent(envelope);
          break;
        case 'NEGOTIATE':
          await this.handleNegotiate(envelope);
          break;
        case 'ACK':
          this.emit('ack', envelope);
          break;
        default:
          logger.warn('Unknown message type', { msg_type: envelope.msg_type });
      }

      // Update stats
      const responseTime = Date.now() - startTime;
      this.updateStats(responseTime);
    } catch (error) {
      logger.error('Failed to handle message', {
        error: error instanceof Error ? error.message : String(error),
      });
      this.emit('error', error);
    }
  }

  /**
   * Handle intent message
   */
  private async handleIntent(envelope: AINPEnvelope): Promise<void> {
    const intent = envelope.payload as AINPIntent;
    const intentType = intent['@type'];

    // Find handler
    const handler = this.intentHandlers.get(intentType) || this.intentHandlers.get('*');

    if (!handler) {
      logger.warn('No handler for intent type', { intentType });
      await this.sendError(envelope, 'NOT_IMPLEMENTED', `No handler for ${intentType}`);
      return;
    }

    // Execute handler
    try {
      const result = await handler(envelope, intent);
      await this.sendResult(envelope, result);
      this.stats.intents_processed++;
    } catch (error) {
      logger.error('Intent handler error', {
        error: error instanceof Error ? error.message : String(error),
      });
      await this.sendError(
        envelope,
        error instanceof AINPError ? error.code : 'INTERNAL_ERROR',
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  /**
   * Handle negotiation message
   */
  private async handleNegotiate(envelope: AINPEnvelope): Promise<void> {
    for (const handler of this.negotiateHandlers) {
      try {
        const result = await handler(envelope, envelope.payload);
        if (result) {
          await this.sendNegotiate(envelope, result);
          return;
        }
      } catch (error) {
        logger.error('Negotiate handler error', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  /**
   * Send result response
   */
  private async sendResult(originalEnvelope: AINPEnvelope, result: unknown): Promise<void> {
    const envelope: AINPEnvelope = {
      version: '0.1.0',
      id: uuidv4(),
      trace_id: originalEnvelope.trace_id,
      from_did: this.config.did,
      to_did: originalEnvelope.from_did,
      msg_type: 'RESULT',
      ttl: 60000, // 1 minute
      timestamp: Date.now(),
      sig: '',
      payload: {
        status: 'success',
        result,
      },
    };

    await this.sendEnvelope(envelope);
  }

  /**
   * Send error response
   */
  private async sendError(
    originalEnvelope: AINPEnvelope,
    errorCode: string,
    errorMessage: string
  ): Promise<void> {
    const envelope: AINPEnvelope = {
      version: '0.1.0',
      id: uuidv4(),
      trace_id: originalEnvelope.trace_id,
      from_did: this.config.did,
      to_did: originalEnvelope.from_did,
      msg_type: 'ERROR',
      ttl: 60000,
      timestamp: Date.now(),
      sig: '',
      payload: {
        error_code: errorCode,
        error_message: errorMessage,
      },
    };

    await this.sendEnvelope(envelope);
  }

  /**
   * Send negotiation message
   */
  private async sendNegotiate(
    originalEnvelope: AINPEnvelope,
    negotiatePayload: unknown
  ): Promise<void> {
    const envelope: AINPEnvelope = {
      version: '0.1.0',
      id: uuidv4(),
      trace_id: originalEnvelope.trace_id,
      from_did: this.config.did,
      to_did: originalEnvelope.from_did,
      msg_type: 'NEGOTIATE',
      ttl: 60000,
      timestamp: Date.now(),
      sig: '',
      payload: negotiatePayload as any, // Type assertion for negotiation payload
    };

    await this.sendEnvelope(envelope);
  }

  /**
   * Send signed envelope
   */
  private async sendEnvelope(envelope: AINPEnvelope): Promise<void> {
    // Sign envelope
    const signedEnvelope = await this.signEnvelope(envelope);

    // Send via WebSocket
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new AINPError('WebSocket not connected', 'CONNECTION_FAILED');
    }

    this.ws.send(JSON.stringify(signedEnvelope));

    logger.debug('Sent envelope', {
      id: signedEnvelope.id,
      msg_type: signedEnvelope.msg_type,
    });
  }

  /**
   * Sign envelope with agent's private key
   */
  private async signEnvelope(envelope: AINPEnvelope): Promise<AINPEnvelope> {
    const { sig, ...unsignedEnvelope } = envelope;
    const canonical = canonicalize(unsignedEnvelope);
    const privateKey = Buffer.from(this.config.privateKey);
    const signature = signData(canonical, privateKey);

    return {
      ...unsignedEnvelope,
      sig: signature.toString('base64'),
    };
  }

  /**
   * Verify envelope signature
   */
  private async verifyEnvelope(envelope: AINPEnvelope): Promise<boolean> {
    const { sig, ...unsignedEnvelope } = envelope;
    const canonical = canonicalize(unsignedEnvelope);
    const publicKey = extractPublicKey(envelope.from_did);
    return verifySignature(canonical, Buffer.from(sig, 'base64'), publicKey);
  }

  /**
   * Register intent handler
   */
  onIntent(intentType: string, handler: IntentHandler): void {
    this.intentHandlers.set(intentType, handler);
    logger.debug('Intent handler registered', { intentType });
  }

  /**
   * Register negotiation handler
   */
  onNegotiate(handler: NegotiateHandler): void {
    this.negotiateHandlers.push(handler);
    logger.debug('Negotiate handler registered');
  }

  /**
   * Advertise capabilities to discovery index
   * Note: Full implementation planned for Phase 0.3 (see docs/ROADMAP.md)
   */
  async advertise(options: AdvertiseOptions): Promise<void> {
    logger.info('Advertise capabilities (stub)', { ttl: options.ttl });
    // Implementation deferred to Phase 0.3: Automatic capability registration
    // with broker discovery service via periodic heartbeat mechanism
  }

  /**
   * Get agent statistics
   */
  getStats(): AgentStats {
    return { ...this.stats };
  }

  /**
   * Check if agent is running
   */
  isAgentRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Update statistics
   */
  private updateStats(responseTime: number): void {
    const alpha = 0.1; // Exponential moving average
    this.stats.avg_response_time_ms =
      this.stats.avg_response_time_ms * (1 - alpha) + responseTime * alpha;
  }
}
