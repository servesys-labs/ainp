import type { AINPEnvelope } from '@ainp/core';
import WebSocket from 'ws';

export interface ResultsWSOptions {
  baseUrl: string;   // e.g., http://localhost:8080
  did: string;       // did:key:...
  reconnect?: boolean;
}

export type DiscoverResultHandler = (envelope: AINPEnvelope) => void;
export type EnvelopeHandler = (envelope: AINPEnvelope) => void;

/**
 * Utility to subscribe to broker WebSocket and receive DISCOVER_RESULT envelopes.
 * Minimal client with optional auto-reconnect.
 */
export class ResultsWebSocket {
  private ws: WebSocket | null = null;
  private onDiscoverResultHandlers: Set<DiscoverResultHandler> = new Set();
  private onEnvelopeHandlers: Set<EnvelopeHandler> = new Set();
  private reconnecting = false;
  private closed = false;

  constructor(private opts: ResultsWSOptions) {}

  /** Connect to the broker WebSocket and start receiving envelopes */
  connect(): void {
    const wsUrl = toWsUrl(this.opts.baseUrl, this.opts.did);
    this.ws = new WebSocket(wsUrl);

    this.ws.on('open', () => {
      this.reconnecting = false;
    });

    this.ws.on('message', (data: WebSocket.RawData) => {
      try {
        const text = typeof data === 'string' ? data : data.toString();
        const envelope = JSON.parse(text) as AINPEnvelope;
        for (const handler of this.onEnvelopeHandlers) handler(envelope);
        if (envelope.msg_type === 'DISCOVER_RESULT') {
          for (const handler of this.onDiscoverResultHandlers) handler(envelope);
        }
      } catch {}
    });

    this.ws.on('close', () => {
      if (!this.closed && this.opts.reconnect !== false && !this.reconnecting) {
        this.reconnecting = true;
        setTimeout(() => this.connect(), 1000);
      }
    });

    this.ws.on('error', () => {
      // handled by close listener
    });
  }

  /** Close the WebSocket and stop reconnection */
  close(): void {
    this.closed = true;
    if (this.ws && this.ws.readyState === this.ws.OPEN) {
      this.ws.close();
    }
    this.ws = null;
  }

  /** Subscribe to all envelopes (advanced) */
  onEnvelope(handler: EnvelopeHandler): () => void {
    this.onEnvelopeHandlers.add(handler);
    return () => this.onEnvelopeHandlers.delete(handler);
  }

  /** Subscribe to DISCOVER_RESULT envelopes */
  onDiscoverResult(handler: DiscoverResultHandler): () => void {
    this.onDiscoverResultHandlers.add(handler);
    return () => this.onDiscoverResultHandlers.delete(handler);
  }
}

function toWsUrl(baseUrl: string, did: string): string {
  const u = new URL(baseUrl);
  const isSecure = u.protocol === 'https:';
  const proto = isSecure ? 'wss:' : 'ws:';
  // WebSocket server is attached at root; requires ?did=...
  return `${proto}//${u.host}/?did=${encodeURIComponent(did)}`;
}
