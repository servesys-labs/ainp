/**
 * Message Delivery Service
 */

import { AINPEnvelope } from '@ainp/core';
import { WebSocketHandler } from './handler';
import { NATSClient } from '../lib/nats-client';

export class DeliveryService {
  constructor(
    private wsHandler: WebSocketHandler,
    private natsClient: NATSClient
  ) {}

  async deliverToAgent(envelope: AINPEnvelope): Promise<void> {
    await this.wsHandler.sendToAgent(envelope.to_did!, envelope);
  }

  async startDeliveryLoop(): Promise<void> {
    // Subscribe to NATS topics and deliver via WebSocket
    await this.natsClient.subscribeToResults('*', async (envelope) => {
      await this.deliverToAgent(envelope);
    });

    await this.natsClient.subscribeToNegotiations('*', async (envelope) => {
      await this.deliverToAgent(envelope);
    });
  }
}
