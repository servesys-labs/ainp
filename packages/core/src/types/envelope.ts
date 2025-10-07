/**
 * AINP Envelope Type Definitions
 * Spec: RFC 001-SPEC Section 3.2
 */

import { AINPIntent } from './intent';

export interface AINPEnvelope {
  id: string;
  trace_id: string;
  from_did: string;
  to_did?: string;
  msg_type: 'INTENT' | 'RESULT' | 'ERROR' | 'NEGOTIATE' | 'ACK';
  ttl: number;
  timestamp: number;
  sig: string;
  payload: AINPIntent | ResultPayload | ErrorPayload | NegotiatePayload;
}

export interface ResultPayload {
  status: 'success' | 'partial' | 'failed';
  result: unknown;
  attestations?: string[];
  metadata?: Record<string, unknown>;
}

export interface ErrorPayload {
  error_code: string;
  error_message: string;
  retry_after_ms?: number;
}

export interface NegotiatePayload {
  phase: 'OFFER' | 'COUNTER' | 'ACCEPT' | 'REJECT' | 'ABORT';
  proposal: Proposal;
  negotiation_id: string;
  round: number;
}

export interface Proposal {
  price: number;
  latency_ms: number;
  confidence: number;
  privacy?: string;
  terms?: Record<string, unknown>;
}
