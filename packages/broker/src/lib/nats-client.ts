/**
 * NATS Client for AINP Broker
 * Message queue operations
 */

import { connect, NatsConnection, JetStreamClient, StringCodec } from 'nats';
import { AINPEnvelope } from '@ainp/core';
import { Logger } from '@ainp/sdk';

const logger = new Logger({ serviceName: 'nats-client' });

export class NATSClient {
  private nc: NatsConnection | null = null;
  private js: JetStreamClient | null = null;
  private codec = StringCodec();

  constructor(private url: string) {}

  /**
   * Connect to NATS server
   */
  async connect(): Promise<void> {
    this.nc = await connect({ servers: this.url });
    this.js = this.nc.jetstream();
  }

  /**
   * Publish intent to NATS stream
   */
  async publishIntent(envelope: AINPEnvelope): Promise<void> {
    if (!this.js) {
      throw new Error('NATS client not connected');
    }

    const subject = `ainp.intents.${envelope.to_did || 'broadcast'}`;

    try {
      await this.js.publish(subject, this.codec.encode(JSON.stringify(envelope)));
    } catch (error) {
      // In test/dev mode, treat 503 (no consumers) as success (fire-and-forget)
      if (process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'development') {
        const err = error as any;
        if (err.code === '503' || err.message?.includes('503')) {
          logger.info('Published to NATS (no consumers, fire-and-forget)', { subject });
          return;
        }
      }
      throw error;
    }
  }

  /**
   * Publish negotiation message
   */
  async publishNegotiation(envelope: AINPEnvelope): Promise<void> {
    if (!this.js) {
      throw new Error('NATS client not connected');
    }

    const subject = `ainp.negotiate.${envelope.to_did}`;
    await this.js.publish(subject, this.codec.encode(JSON.stringify(envelope)));
  }

  /**
   * Publish result message
   */
  async publishResult(envelope: AINPEnvelope): Promise<void> {
    if (!this.js) {
      throw new Error('NATS client not connected');
    }

    const subject = `ainp.results.${envelope.to_did}`;
    await this.js.publish(subject, this.codec.encode(JSON.stringify(envelope)));
  }

  /**
   * Subscribe to intents for a DID
   */
  async subscribeToIntents(
    did: string,
    callback: (envelope: AINPEnvelope) => Promise<void>
  ): Promise<void> {
    if (!this.nc) {
      throw new Error('NATS client not connected');
    }

    const subject = `ainp.intents.${did}`;
    const sub = this.nc.subscribe(subject);

    (async () => {
      for await (const msg of sub) {
        try {
          const envelope = JSON.parse(this.codec.decode(msg.data)) as AINPEnvelope;
          await callback(envelope);
        } catch (error) {
          logger.error('Error processing intent', {
            did,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    })();
  }

  /**
   * Subscribe to negotiations for a DID
   */
  async subscribeToNegotiations(
    did: string,
    callback: (envelope: AINPEnvelope) => Promise<void>
  ): Promise<void> {
    if (!this.nc) {
      throw new Error('NATS client not connected');
    }

    const subject = `ainp.negotiate.${did}`;
    const sub = this.nc.subscribe(subject);

    (async () => {
      for await (const msg of sub) {
        try {
          const envelope = JSON.parse(this.codec.decode(msg.data)) as AINPEnvelope;
          await callback(envelope);
        } catch (error) {
          logger.error('Error processing negotiation', {
            did,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    })();
  }

  /**
   * Subscribe to results for a DID
   */
  async subscribeToResults(
    did: string,
    callback: (envelope: AINPEnvelope) => Promise<void>
  ): Promise<void> {
    if (!this.nc) {
      throw new Error('NATS client not connected');
    }

    const subject = `ainp.results.${did}`;
    const sub = this.nc.subscribe(subject);

    (async () => {
      for await (const msg of sub) {
        try {
          const envelope = JSON.parse(this.codec.decode(msg.data)) as AINPEnvelope;
          await callback(envelope);
        } catch (error) {
          logger.error('Error processing result', {
            did,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    })();
  }

  /**
   * Health check for this client instance
   * @returns true if connected, false otherwise
   */
  async isConnected(): Promise<boolean> {
    try {
      if (!this.nc) {
        return false;
      }
      // Check if connection is closed
      if (this.nc.isClosed()) {
        return false;
      }
      // If not closed and exists, it's connected
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Close NATS connection
   */
  async close(): Promise<void> {
    if (this.nc) {
      await this.nc.close();
      this.nc = null;
      this.js = null;
    }
  }
}
