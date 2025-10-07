/**
 * AINP SDK Type Definitions
 * Extended types for SDK usage
 */

import {
  AINPEnvelope,
  AINPIntent,
  SemanticAddress,
  DiscoveryQuery,
  NegotiationConstraints,
  Proposal,
} from '@ainp/core';

export interface AgentConfig {
  did: string;
  privateKey: string | Buffer;
  address: SemanticAddress;
  discoveryUrl: string;
  natsUrl?: string;
  redisUrl?: string;
  openaiApiKey?: string;
}

export interface ClientConfig {
  did: string;
  privateKey: string | Buffer;
  discoveryUrl: string;
  openaiApiKey?: string;
}

export interface QoSParams {
  urgency: number; // 0-1
  importance: number; // 0-1
  novelty: number; // 0-1
  ethicalWeight: number; // 0-1
  bid: number; // credits
}

export interface SendIntentOptions {
  to_did?: string;
  to_query?: DiscoveryQuery;
  qos: QoSParams;
  timeout_ms?: number;
}

export interface AdvertiseOptions {
  ttl: number; // milliseconds
  qos: QoSParams;
}

export interface NegotiateOptions {
  to_did: string;
  proposal: Proposal;
  constraints?: NegotiationConstraints;
}

export interface IntentHandler {
  (envelope: AINPEnvelope, intent: AINPIntent): Promise<unknown>;
}

export interface NegotiateHandler {
  (envelope: AINPEnvelope, message: unknown): Promise<unknown>;
}

export interface DiscoveryMatch {
  did: string;
  similarity: number;
  trust: {
    score: number;
    dimensions: {
      reliability: number;
      honesty: number;
      competence: number;
      timeliness: number;
    };
  };
  capabilities: Array<{
    description: string;
    tags: string[];
    version: string;
  }>;
}

export interface AgentStats {
  intents_processed: number;
  negotiation_success_rate: number;
  avg_response_time_ms: number;
  total_credits_earned: number;
}

export { AINPEnvelope, AINPIntent, SemanticAddress, DiscoveryQuery };
