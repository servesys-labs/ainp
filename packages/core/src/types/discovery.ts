/**
 * AINP Discovery Type Definitions
 * Spec: RFC 001-SPEC Section 5
 */

export interface SemanticAddress {
  did: string;
  capabilities: Capability[];
  trust: TrustVector;
  credentials?: string[];
}

export interface Capability {
  description: string;
  embedding: string; // base64-encoded Float32Array
  tags: string[];
  version: string;
  evidence?: string;
}

export interface TrustVector {
  score: number; // 0-1
  dimensions: TrustDimensions;
  decay_rate: number; // e.g., 0.977 for 30-day half-life
  last_updated: number; // Unix timestamp
}

export interface TrustDimensions {
  reliability: number;
  honesty: number;
  competence: number;
  timeliness: number;
}

export interface DiscoveryQuery {
  description: string;
  embedding?: string;
  tags?: string[];
  min_trust?: number;
  max_latency_ms?: number;
  max_cost?: number;
}
