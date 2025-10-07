/**
 * WebSocket Connection Handler
 */

import WebSocket from 'ws';
import { AINPEnvelope } from '@ainp/core';
import { SignatureService } from '../services/signature';
import { RoutingService } from '../services/routing';

export class WebSocketHandler {
  private connections = new Map<string, WebSocket>();

  constructor(
    private signatureService: SignatureService,
    private routingService: RoutingService
  ) {}

  async handleConnection(ws: WebSocket, did: string): Promise<void> {
    this.connections.set(did, ws);

    ws.on('message', async (data) => {
      try {
        const envelope = JSON.parse(data.toString()) as AINPEnvelope;
        await this.handleMessage(envelope, ws);
      } catch (error) {
        ws.send(JSON.stringify({ error: 'INVALID_MESSAGE' }));
      }
    });

    ws.on('close', () => {
      this.connections.delete(did);
    });
  }

  private async handleMessage(envelope: AINPEnvelope, ws: WebSocket): Promise<void> {
    if (!(await this.signatureService.verifyEnvelope(envelope))) {
      ws.send(JSON.stringify({ error: 'INVALID_SIGNATURE' }));
      return;
    }

    // Route based on message type
    if (envelope.msg_type === 'INTENT') {
      ws.send(JSON.stringify({ status: 'routed' }));
    }
  }

  async sendToAgent(did: string, envelope: AINPEnvelope): Promise<void> {
    const ws = this.connections.get(did);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(envelope));
    }
  }
}
