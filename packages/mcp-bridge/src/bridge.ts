/**
 * WebSocket event bridge for async AINP notifications
 * Forwards DISCOVER_RESULT and new message events to MCP client
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { ResultsWebSocket, AINPEnvelope } from '@ainp/sdk';
import { AINPConfig } from './config.js';

export class AINPEventBridge {
  private ws: ResultsWebSocket;
  private mcpServer: Server;

  constructor(config: AINPConfig, mcpServer: Server) {
    this.mcpServer = mcpServer;
    this.ws = new ResultsWebSocket({
      baseUrl: config.baseUrl,
      did: config.did,
    });
  }

  /**
   * Start WebSocket connection and forward events to MCP client
   */
  start(): void {
    // Forward DISCOVER_RESULT envelopes
    this.ws.onDiscoverResult((envelope: AINPEnvelope) => {
      this.mcpServer.notification({
        method: 'notifications/message',
        params: {
          level: 'info',
          data: {
            type: 'ainp.event.discover_result',
            trace_id: envelope.trace_id,
            results: (envelope.payload as any)?.results || [],
          },
        },
      });
    });

    // Forward all envelopes (for new messages, etc.)
    this.ws.onEnvelope((envelope: AINPEnvelope) => {
      if (envelope.msg_type === 'INTENT') {
        this.mcpServer.notification({
          method: 'notifications/message',
          params: {
            level: 'info',
            data: {
              type: 'ainp.event.message',
              msg_type: envelope.msg_type,
              from_did: envelope.from_did,
              trace_id: envelope.trace_id,
              payload: envelope.payload,
            },
          },
        });
      }
    });

    // Connect to WebSocket
    this.ws.connect();
  }

  /**
   * Gracefully close WebSocket connection
   */
  stop(): void {
    this.ws.close();
  }
}
